/**
 * Tests for the Ralph Loop implementation.
 *
 * Verifies:
 * - Extract local context: signature, contracts, required types, witness definitions
 * - No prior implementation attempts in context (context drift prevention)
 * - Use worker_model via ModelRouter as primary
 * - Accept/discard atomically based on compilation + test results
 * - Leaves-first ordering via topological sort
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Project } from 'ts-morph';
import { safeMkdir, safeWriteFile, safeReadFile } from '../utils/safe-fs.js';
import {
  createRalphLoop,
  generateImplementationPrompt,
  parseImplementationResponse,
  buildFunctionContext,
  formatRalphLoopReport,
  type FunctionContext,
  type RalphLoopResult,
  type ImplementationAttempt,
} from './ralph-loop.js';
import type { TodoFunction } from '../adapters/typescript/ast.js';
import type { ModelRouter, ModelRouterResult, ModelRouterRequest } from '../router/types.js';
import type { TypeCheckResult } from '../adapters/typescript/typecheck.js';
import type { TestRunResult } from '../adapters/typescript/testrunner.js';

// Mock runTypeCheck and runTests
vi.mock('../adapters/typescript/typecheck.js', async () => {
  const actual = await vi.importActual<typeof import('../adapters/typescript/typecheck.js')>(
    '../adapters/typescript/typecheck.js'
  );
  return {
    ...actual,
    runTypeCheck: vi.fn(),
  };
});

vi.mock('../adapters/typescript/testrunner.js', async () => {
  const actual = await vi.importActual<typeof import('../adapters/typescript/testrunner.js')>(
    '../adapters/typescript/testrunner.js'
  );
  return {
    ...actual,
    runTests: vi.fn(),
  };
});

// Import after mocks are set up
const { runTypeCheck } = await import('../adapters/typescript/typecheck.js');
const { runTests } = await import('../adapters/typescript/testrunner.js');
const mockRunTypeCheck = runTypeCheck as ReturnType<typeof vi.fn>;
const mockRunTests = runTests as ReturnType<typeof vi.fn>;

// Helper to create a mock ModelRouter
function createMockModelRouter(response: string | Error): ModelRouter {
  return {
    prompt: vi.fn(),
    complete: vi.fn().mockImplementation((): Promise<ModelRouterResult> => {
      if (response instanceof Error) {
        return Promise.resolve({
          success: false,
          error: {
            kind: 'ModelError',
            message: response.message,
            retryable: false,
          },
        });
      }
      return Promise.resolve({
        success: true,
        response: {
          content: response,
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
          metadata: {
            modelId: 'test-model',
            provider: 'test',
            latencyMs: 100,
          },
        },
      });
    }),
    stream: vi.fn(),
  };
}

// Helper to create a success TypeCheckResult
function createSuccessTypeCheck(): TypeCheckResult {
  return {
    success: true,
    errors: [],
    errorCount: 0,
    warningCount: 0,
  };
}

// Helper to create a failed TypeCheckResult
function createFailedTypeCheck(message: string): TypeCheckResult {
  return {
    success: false,
    errors: [
      {
        file: 'test.ts',
        line: 1,
        column: 1,
        code: 'TS2322',
        message,
        typeDetails: null,
      },
    ],
    errorCount: 1,
    warningCount: 0,
  };
}

// Helper to create a failed TestRunResult
function createFailedTestRun(): TestRunResult {
  return {
    success: false,
    totalTests: 1,
    passedTests: 0,
    failedTests: 1,
    skippedTests: 0,
    tests: [
      {
        name: 'test',
        fullName: 'test',
        file: 'test.test.ts',
        status: 'failed',
        durationMs: 10,
        error: { message: 'expected true to be false' },
      },
    ],
  };
}

describe('generateImplementationPrompt', () => {
  it('should generate prompt with signature only', () => {
    const context: FunctionContext = {
      signature: 'function add(a: number, b: number): number',
      contracts: [],
      requiredTypes: [],
      witnessDefinitions: [],
      filePath: '/test/file.ts',
      functionName: 'add',
    };

    const prompt = generateImplementationPrompt(context);

    expect(prompt).toContain('FUNCTION SIGNATURE:');
    expect(prompt).toContain('function add(a: number, b: number): number');
    expect(prompt).not.toContain('CONTRACTS');
    expect(prompt).not.toContain('REQUIRED TYPES');
    expect(prompt).not.toContain('WITNESS TYPES');
  });

  it('should include contracts in prompt', () => {
    const context: FunctionContext = {
      signature: 'function add(a: number, b: number): number',
      contracts: [
        {
          functionName: 'add',
          filePath: '/test/file.ts',
          requires: ['a >= 0'],
          ensures: ['result === a + b'],
          invariants: [],
          claimRefs: [],
        },
      ],
      requiredTypes: [],
      witnessDefinitions: [],
      filePath: '/test/file.ts',
      functionName: 'add',
    };

    const prompt = generateImplementationPrompt(context);

    expect(prompt).toContain('CONTRACTS (must be satisfied):');
    expect(prompt).toContain('REQUIRES:');
    expect(prompt).toContain('a >= 0');
    expect(prompt).toContain('ENSURES:');
    expect(prompt).toContain('result === a + b');
  });

  it('should include required types in prompt', () => {
    const context: FunctionContext = {
      signature: 'function process(data: UserData): Result',
      contracts: [],
      requiredTypes: [
        'interface UserData { name: string; age: number; }',
        'type Result = { success: boolean; }',
      ],
      witnessDefinitions: [],
      filePath: '/test/file.ts',
      functionName: 'process',
    };

    const prompt = generateImplementationPrompt(context);

    expect(prompt).toContain('REQUIRED TYPES:');
    expect(prompt).toContain('interface UserData');
    expect(prompt).toContain('type Result');
  });

  it('should include witness definitions in prompt', () => {
    const context: FunctionContext = {
      signature: 'function validate(value: NonEmptyString): boolean',
      contracts: [],
      requiredTypes: [],
      witnessDefinitions: ["type NonEmptyString = string & { readonly __brand: 'NonEmptyString' }"],
      filePath: '/test/file.ts',
      functionName: 'validate',
    };

    const prompt = generateImplementationPrompt(context);

    expect(prompt).toContain('WITNESS TYPES:');
    expect(prompt).toContain('NonEmptyString');
    expect(prompt).toContain('__brand');
  });

  it('should not include prior implementation attempts', () => {
    const context: FunctionContext = {
      signature: 'function add(a: number, b: number): number',
      contracts: [],
      requiredTypes: [],
      witnessDefinitions: [],
      filePath: '/test/file.ts',
      functionName: 'add',
    };

    const prompt = generateImplementationPrompt(context);

    // Verify no implementation-related content
    expect(prompt).not.toContain('previous');
    expect(prompt).not.toContain('attempt');
    expect(prompt).not.toContain('implementation');
    expect(prompt).not.toContain('return a + b'); // No prior code
  });
});

describe('parseImplementationResponse', () => {
  it('should parse plain code response', () => {
    const response = 'return a + b;';
    const body = parseImplementationResponse(response);
    expect(body).toBe('return a + b;');
  });

  it('should strip markdown code blocks', () => {
    const response = '```typescript\nreturn a + b;\n```';
    const body = parseImplementationResponse(response);
    expect(body).toBe('return a + b;');
  });

  it('should handle code blocks with just ts language', () => {
    const response = '```ts\nreturn a + b;\n```';
    const body = parseImplementationResponse(response);
    expect(body).toBe('return a + b;');
  });

  it('should handle code blocks without language', () => {
    const response = '```\nreturn a + b;\n```';
    const body = parseImplementationResponse(response);
    expect(body).toBe('return a + b;');
  });

  it('should trim whitespace', () => {
    const response = '\n  return a + b;  \n';
    const body = parseImplementationResponse(response);
    expect(body).toBe('return a + b;');
  });

  it('should handle multi-line bodies', () => {
    const response = `const sum = a + b;
if (sum < 0) {
  throw new Error('Negative sum');
}
return sum;`;

    const body = parseImplementationResponse(response);

    expect(body).toContain('const sum = a + b;');
    expect(body).toContain('return sum;');
  });
});

describe('buildFunctionContext', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
    });
  });

  it('should build context with signature and contracts', () => {
    project.createSourceFile(
      '/test/file.ts',
      `
/**
 * Adds two numbers.
 * @requires a >= 0 - a must be non-negative
 * @ensures result === a + b
 */
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'add',
      filePath: '/test/file.ts',
      line: 7,
      signature: 'function add(a: number, b: number): number',
      hasTodoBody: true,
    };

    const context = buildFunctionContext(project, todoFunction);

    expect(context.signature).toBe('function add(a: number, b: number): number');
    expect(context.functionName).toBe('add');
    expect(context.filePath).toBe('/test/file.ts');
    // parseContracts returns one MicroContract per function with requires/ensures as arrays
    // The full tag text is stored (including any message after the dash)
    expect(context.contracts.length).toBe(1);
    expect(context.contracts[0]?.requires).toContain('a >= 0 - a must be non-negative');
    expect(context.contracts[0]?.ensures).toContain('result === a + b');
  });

  it('should build context with required types', () => {
    project.createSourceFile(
      '/test/file.ts',
      `
interface User {
  id: number;
  name: string;
}

function createUser(name: string): User {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'createUser',
      filePath: '/test/file.ts',
      line: 8,
      signature: 'function createUser(name: string): User',
      hasTodoBody: true,
    };

    const context = buildFunctionContext(project, todoFunction);

    expect(context.requiredTypes.length).toBe(1);
    expect(context.requiredTypes[0]).toContain('interface User');
  });
});

describe('RalphLoop', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ralph-loop-test-'));
    mockRunTypeCheck.mockReset();
    mockRunTests.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return success with no TODO functions', async () => {
    // Create project with no TODOs
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'index.ts'),
      `export function add(a: number, b: number): number {
  return a + b;
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    const mockRouter = createMockModelRouter('return a + b;');

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined, // Silent logger
    });

    const result = await loop.run();

    expect(result.success).toBe(true);
    expect(result.totalFunctions).toBe(0);
    expect(result.implementedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('should implement TODO function successfully', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'math.ts'),
      `/**
 * @ensures result === a + b
 */
export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Create eslint config
    await safeWriteFile(path.join(tempDir, 'eslint.config.js'), 'export default [];\n');

    const mockRouter = createMockModelRouter('return a + b;');
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    // No test file, so tests won't be run

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(true);
    expect(result.totalFunctions).toBe(1);
    expect(result.implementedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    // Verify the model was called with correct parameters
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mocks are safe to use this way
    expect(mockRouter.complete).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mocks are safe to use this way
    const completeMock = vi.mocked(mockRouter.complete);
    const firstCall = completeMock.mock.calls[0];
    expect(firstCall).toBeDefined();

    const callArgs = firstCall?.[0] as ModelRouterRequest;
    expect(callArgs.modelAlias).toBe('worker');
    expect(callArgs.prompt).toContain('function add');
    expect(callArgs.prompt).toContain('ENSURES');
  });

  it('should reject implementation on compilation failure', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'math.ts'),
      `export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Return invalid code that won't compile
    const mockRouter = createMockModelRouter('return "not a number";');
    mockRunTypeCheck.mockResolvedValue(
      createFailedTypeCheck("Type 'string' is not assignable to type 'number'")
    );

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.attempts[0]?.accepted).toBe(false);
    expect(result.attempts[0]?.rejectionReason).toContain('Compilation failed');

    // Verify the original file is restored (rollback)
    const content = await safeReadFile(path.join(srcDir, 'math.ts'), 'utf-8');
    expect(content).toContain("throw new Error('TODO')");
  });

  it('should reject implementation on test failure', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'math.ts'),
      `export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    // Create test file
    await safeWriteFile(
      path.join(srcDir, 'math.test.ts'),
      `import { add } from './math.js';
import { describe, it, expect } from 'vitest';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Create eslint config
    await safeWriteFile(path.join(tempDir, 'eslint.config.js'), 'export default [];\n');

    // Return wrong implementation
    const mockRouter = createMockModelRouter('return a - b;'); // Wrong!
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    mockRunTests.mockResolvedValue(createFailedTestRun());

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.attempts[0]?.accepted).toBe(false);
    expect(result.attempts[0]?.rejectionReason).toContain('Tests failed');
  });

  it('should reject implementation with syntax error before injection (syntax validation)', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'sort.ts'),
      `export function sortArray(arr: number[]): number[] {
  throw new Error('TODO');
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Return syntactically invalid code - missing closing parenthesis
    const mockRouter = createMockModelRouter('return arr.sort((a, b) => a - b;');
    // TypeCheck should NOT be called because syntax validation fails first
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.attempts[0]?.accepted).toBe(false);
    expect(result.attempts[0]?.rejectionReason).toContain('Failed to inject');

    // Verify the original file is NOT modified (syntax error caught before write)
    const content = await safeReadFile(path.join(srcDir, 'sort.ts'), 'utf-8');
    expect(content).toContain("throw new Error('TODO')");
  });

  it('should accept valid implementation like "return arr.sort()"', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'sort.ts'),
      `export function sortArray(arr: number[]): number[] {
  throw new Error('TODO');
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Create eslint config
    await safeWriteFile(path.join(tempDir, 'eslint.config.js'), 'export default [];\n');

    // Return valid implementation - example from acceptance criteria
    const mockRouter = createMockModelRouter('return arr.sort();');
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(true);
    expect(result.implementedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.attempts[0]?.accepted).toBe(true);

    // Verify the implementation was injected
    const content = await safeReadFile(path.join(srcDir, 'sort.ts'), 'utf-8');
    expect(content).toContain('return arr.sort();');
    expect(content).not.toContain("throw new Error('TODO')");
  });

  it('should handle model errors gracefully', async () => {
    // Create project with TODO function
    const srcDir = path.join(tempDir, 'src');
    await safeMkdir(srcDir, { recursive: true });
    await safeWriteFile(
      path.join(srcDir, 'math.ts'),
      `export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    // Create tsconfig
    await safeWriteFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Create eslint config
    await safeWriteFile(path.join(tempDir, 'eslint.config.js'), 'export default [];\n');

    const mockRouter = createMockModelRouter(new Error('API rate limit exceeded'));

    const loop = createRalphLoop({
      projectPath: tempDir,
      modelRouter: mockRouter,
      logger: (): void => undefined,
    });

    const result = await loop.run();

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.attempts[0]?.rejectionReason).toContain('Model error');
  });
});

describe('formatRalphLoopReport', () => {
  it('should format successful result', () => {
    const result: RalphLoopResult = {
      success: true,
      totalFunctions: 2,
      implementedCount: 2,
      failedCount: 0,
      attempts: [
        {
          function: {
            name: 'add',
            filePath: '/test/file.ts',
            line: 1,
            signature: 'function add(a: number, b: number): number',
            hasTodoBody: true,
          },
          accepted: true,
          generatedBody: 'return a + b;',
          compilationResult: createSuccessTypeCheck(),
          durationMs: 100,
        },
        {
          function: {
            name: 'subtract',
            filePath: '/test/file.ts',
            line: 5,
            signature: 'function subtract(a: number, b: number): number',
            hasTodoBody: true,
          },
          accepted: true,
          generatedBody: 'return a - b;',
          compilationResult: createSuccessTypeCheck(),
          durationMs: 150,
        },
      ],
      totalDurationMs: 250,
      remainingTodos: [],
      circuitTripped: false,
    };

    const report = formatRalphLoopReport(result);

    expect(report).toContain('SUCCESS');
    expect(report).toContain('Total Functions: 2');
    expect(report).toContain('Implemented: 2');
    expect(report).toContain('Failed: 0');
    expect(report).toContain('[ACCEPTED] add');
    expect(report).toContain('[ACCEPTED] subtract');
  });

  it('should format failed result with rejection reasons', () => {
    const result: RalphLoopResult = {
      success: false,
      totalFunctions: 2,
      implementedCount: 1,
      failedCount: 1,
      attempts: [
        {
          function: {
            name: 'add',
            filePath: '/test/file.ts',
            line: 1,
            signature: 'function add(a: number, b: number): number',
            hasTodoBody: true,
          },
          accepted: true,
          generatedBody: 'return a + b;',
          compilationResult: createSuccessTypeCheck(),
          durationMs: 100,
        },
        {
          function: {
            name: 'divide',
            filePath: '/test/file.ts',
            line: 5,
            signature: 'function divide(a: number, b: number): number',
            hasTodoBody: true,
          },
          accepted: false,
          generatedBody: 'return a / b;',
          compilationResult: createFailedTypeCheck('Division error'),
          rejectionReason: 'Compilation failed: TS2322: Type mismatch',
          durationMs: 150,
        },
      ],
      totalDurationMs: 250,
      remainingTodos: [
        {
          name: 'divide',
          filePath: '/test/file.ts',
          line: 5,
          signature: 'function divide(a: number, b: number): number',
          hasTodoBody: true,
        },
      ],
      circuitTripped: false,
    };

    const report = formatRalphLoopReport(result);

    expect(report).toContain('INCOMPLETE');
    expect(report).toContain('Failed: 1');
    expect(report).toContain('[REJECTED] divide');
    expect(report).toContain('Compilation failed');
    expect(report).toContain('REMAINING TODO FUNCTIONS');
    expect(report).toContain('divide');
  });

  describe('property-based tests', () => {
    it('should contain SUCCESS iff result.success is true', () => {
      fc.assert(
        fc.property(
          fc.record({
            success: fc.boolean(),
            totalFunctions: fc.nat(),
            implementedCount: fc.nat(),
            failedCount: fc.nat(),
            attempts: fc.constant([]),
            totalDurationMs: fc.nat(),
            remainingTodos: fc.constant([]),
            circuitTripped: fc.boolean(),
          }),
          (result) => {
            const report = formatRalphLoopReport(result);

            if (result.success) {
              expect(report).toContain('SUCCESS');
              expect(report).not.toContain('INCOMPLETE');
            } else {
              expect(report).toContain('INCOMPLETE');
              expect(report).not.toContain('SUCCESS');
            }
          }
        )
      );
    });

    it('should reflect counts in the report text', () => {
      fc.assert(
        fc.property(
          fc.record({
            success: fc.boolean(),
            totalFunctions: fc.nat({ max: 100 }),
            implementedCount: fc.nat({ max: 100 }),
            failedCount: fc.nat({ max: 100 }),
            attempts: fc.constant([]),
            totalDurationMs: fc.nat(),
            remainingTodos: fc.constant([]),
            circuitTripped: fc.boolean(),
          }),
          (result) => {
            const report = formatRalphLoopReport(result);

            expect(report).toContain(`Total Functions: ${String(result.totalFunctions)}`);
            expect(report).toContain(`Implemented: ${String(result.implementedCount)}`);
            expect(report).toContain(`Failed: ${String(result.failedCount)}`);
          }
        )
      );
    });

    it('should show [ACCEPTED] for accepted attempts and [REJECTED] for rejected ones', () => {
      const todoFunctionArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        filePath: fc.constant('/test/file.ts'),
        line: fc.nat({ max: 1000 }),
        signature: fc.string({ minLength: 1 }),
        hasTodoBody: fc.constant(true as const),
      });

      const attemptArb = fc
        .record({
          function: todoFunctionArb,
          accepted: fc.boolean(),
          generatedBody: fc.string(),
          compilationResult: fc.oneof(
            fc.constant(createSuccessTypeCheck()),
            fc.constant(createFailedTypeCheck('error'))
          ),
          rejectionReason: fc.option(fc.string(), { nil: undefined }),
          durationMs: fc.nat({ max: 10000 }),
        })
        .map((r): ImplementationAttempt => {
          // Handle exactOptionalPropertyTypes - omit the key when undefined
          const { rejectionReason, ...rest } = r;
          if (rejectionReason === undefined) {
            return rest;
          }
          return { ...rest, rejectionReason };
        });

      fc.assert(
        fc.property(
          fc.record({
            success: fc.boolean(),
            totalFunctions: fc.nat(),
            implementedCount: fc.nat(),
            failedCount: fc.nat(),
            attempts: fc.array(attemptArb, { minLength: 1, maxLength: 10 }),
            totalDurationMs: fc.nat(),
            remainingTodos: fc.constant([]),
            circuitTripped: fc.boolean(),
          }),
          (result) => {
            const report = formatRalphLoopReport(result);

            for (const attempt of result.attempts) {
              if (attempt.accepted) {
                expect(report).toContain(`[ACCEPTED] ${attempt.function.name}`);
              } else {
                expect(report).toContain(`[REJECTED] ${attempt.function.name}`);
              }
            }
          }
        )
      );
    });

    it('should list all remaining todo function names under REMAINING TODO FUNCTIONS', () => {
      const todoFunctionArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        filePath: fc.constant('/test/file.ts'),
        line: fc.nat({ max: 1000 }),
        signature: fc.string({ minLength: 1 }),
        hasTodoBody: fc.constant(true as const),
      });

      fc.assert(
        fc.property(
          fc.record({
            success: fc.boolean(),
            totalFunctions: fc.nat(),
            implementedCount: fc.nat(),
            failedCount: fc.nat(),
            attempts: fc.constant([]),
            totalDurationMs: fc.nat(),
            remainingTodos: fc.array(todoFunctionArb, { minLength: 1, maxLength: 10 }),
            circuitTripped: fc.boolean(),
          }),
          (result) => {
            const report = formatRalphLoopReport(result);

            if (result.remainingTodos.length > 0) {
              expect(report).toContain('REMAINING TODO FUNCTIONS');
              for (const todo of result.remainingTodos) {
                expect(report).toContain(todo.name);
              }
            }
          }
        )
      );
    });

    it('should be consistent: counts match attempts array', () => {
      const todoFunctionArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        filePath: fc.constant('/test/file.ts'),
        line: fc.nat({ max: 1000 }),
        signature: fc.string({ minLength: 1 }),
        hasTodoBody: fc.constant(true as const),
      });

      const attemptArb = fc
        .record({
          function: todoFunctionArb,
          accepted: fc.boolean(),
          generatedBody: fc.string(),
          compilationResult: fc.oneof(
            fc.constant(createSuccessTypeCheck()),
            fc.constant(createFailedTypeCheck('error'))
          ),
          rejectionReason: fc.option(fc.string(), { nil: undefined }),
          durationMs: fc.nat({ max: 10000 }),
        })
        .map((r): ImplementationAttempt => {
          // Handle exactOptionalPropertyTypes - omit the key when undefined
          const { rejectionReason, ...rest } = r;
          if (rejectionReason === undefined) {
            return rest;
          }
          return { ...rest, rejectionReason };
        });

      fc.assert(
        fc.property(fc.array(attemptArb, { maxLength: 20 }), (attempts) => {
          const acceptedCount = attempts.filter((a) => a.accepted).length;
          const rejectedCount = attempts.filter((a) => !a.accepted).length;

          const result: RalphLoopResult = {
            success: rejectedCount === 0,
            totalFunctions: attempts.length,
            implementedCount: acceptedCount,
            failedCount: rejectedCount,
            attempts,
            totalDurationMs: attempts.reduce((sum, a) => sum + a.durationMs, 0),
            remainingTodos: [],
            circuitTripped: false,
          };

          const report = formatRalphLoopReport(result);

          // Verify counts are reflected correctly
          expect(report).toContain(`Total Functions: ${String(attempts.length)}`);
          expect(report).toContain(`Implemented: ${String(acceptedCount)}`);
          expect(report).toContain(`Failed: ${String(rejectedCount)}`);

          // Verify status matches success flag
          if (rejectedCount === 0) {
            expect(report).toContain('SUCCESS');
          } else {
            expect(report).toContain('INCOMPLETE');
          }
        })
      );
    });
  });
});
