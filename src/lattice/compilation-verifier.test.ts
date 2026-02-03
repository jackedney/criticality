/**
 * Tests for the compilation verification loop.
 *
 * Verifies:
 * - Run tsc after Lattice generation
 * - Parse compiler errors using TypeScriptAdapter
 * - Repair structural errors using structurer_model via ModelRouter
 * - Loop until compilation succeeds or max repair attempts reached
 * - Use AST inspection to verify no logic leakage
 * - BLOCKED state for unrepairable errors after max attempts
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeWriteFile, safeMkdir } from '../utils/safe-fs.js';
import {
  CompilationVerifier,
  createCompilationVerifier,
  categorizeError,
  generateRepairPrompt,
  parseRepairResponse,
  verifyNoLogicLeakage,
  formatVerificationReport,
  FilesNotResolvedError,
  type CategorizedError,
} from './compilation-verifier.js';
import type { CompilerError, TypeCheckResult } from '../adapters/typescript/typecheck.js';
import type { ModelRouter, ModelRouterResult } from '../router/types.js';

// Mock runTypeCheck for CompilationVerifier tests
vi.mock('../adapters/typescript/typecheck.js', async () => {
  const actual = await vi.importActual<typeof import('../adapters/typescript/typecheck.js')>(
    '../adapters/typescript/typecheck.js'
  );
  return {
    ...actual,
    runTypeCheck: vi.fn(),
  };
});

// Import runTypeCheck after mock is set up
const { runTypeCheck } = await import('../adapters/typescript/typecheck.js');
const mockRunTypeCheck = runTypeCheck as ReturnType<typeof vi.fn>;

// Helper to create TypeCheckResult
function createTypeCheckResult(overrides: Partial<TypeCheckResult> = {}): TypeCheckResult {
  return {
    success: true,
    errors: [],
    errorCount: 0,
    warningCount: 0,
    ...overrides,
  };
}

describe('CompilationVerifier', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'compilation-verifier-test-'));
    mockRunTypeCheck.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('categorizeError', () => {
    it('should categorize missing import errors', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 1,
        column: 1,
        code: 'TS2307',
        message: "Cannot find module './missing'",
        typeDetails: null,
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('missing_import');
      expect(categorized.autoRepairable).toBe(true);
      expect(categorized.repairHint).toContain('./missing');
    });

    it('should categorize missing type errors', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 5,
        column: 10,
        code: 'TS2304',
        message: "Cannot find name 'MyType'",
        typeDetails: null,
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('missing_type');
      expect(categorized.autoRepairable).toBe(true);
      expect(categorized.repairHint).toContain('MyType');
    });

    it('should categorize type mismatch errors', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 10,
        column: 5,
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'",
        typeDetails: { expected: 'number', actual: 'string' },
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('type_mismatch');
      expect(categorized.autoRepairable).toBe(true);
      expect(categorized.repairHint).toContain('string');
      expect(categorized.repairHint).toContain('number');
    });

    it('should categorize missing property errors', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 15,
        column: 20,
        code: 'TS2339',
        message: "Property 'foo' does not exist on type 'Bar'",
        typeDetails: null,
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('missing_property');
      expect(categorized.autoRepairable).toBe(true);
      expect(categorized.repairHint).toContain('foo');
    });

    it('should categorize argument mismatch errors', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 20,
        column: 10,
        code: 'TS2554',
        message: 'Expected 2 arguments, but got 3',
        typeDetails: { expected: '2 arguments', actual: '3 arguments' },
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('argument_mismatch');
      expect(categorized.autoRepairable).toBe(true);
    });

    it('should categorize syntax errors as non-auto-repairable', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 25,
        column: 5,
        code: 'TS1005',
        message: "';' expected",
        typeDetails: null,
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('syntax_error');
      expect(categorized.autoRepairable).toBe(false);
    });

    it('should categorize unknown errors as other', () => {
      const error: CompilerError = {
        file: 'test.ts',
        line: 30,
        column: 1,
        code: 'TS9999',
        message: 'Some unknown error',
        typeDetails: null,
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe('other');
      expect(categorized.autoRepairable).toBe(false);
    });
  });

  describe('generateRepairPrompt', () => {
    it('should generate a repair prompt with error details', () => {
      const errors: CategorizedError[] = [
        {
          error: {
            file: '/test/file.ts',
            line: 5,
            column: 10,
            code: 'TS2307',
            message: "Cannot find module './types'",
            typeDetails: null,
          },
          category: 'missing_import',
          repairHint: "Add import statement for module './types'",
          autoRepairable: true,
        },
      ];

      const fileContents = new Map<string, string>([['/test/file.ts', 'const x: MyType = {};']]);

      const prompt = generateRepairPrompt(errors, fileContents);

      expect(prompt).toContain('TypeScript structural repair assistant');
      expect(prompt).toContain('/test/file.ts');
      expect(prompt).toContain('TS2307');
      expect(prompt).toContain('missing_import');
      expect(prompt).toContain('const x: MyType = {}');
      expect(prompt).toContain('--- FILE:');
      expect(prompt).toContain('--- END FILE ---');
    });

    it('should include IMPORTANT CONSTRAINTS in the prompt', () => {
      const errors: CategorizedError[] = [];
      const fileContents = new Map<string, string>();

      const prompt = generateRepairPrompt(errors, fileContents);

      expect(prompt).toContain('IMPORTANT CONSTRAINTS');
      expect(prompt).toContain('ONLY fix structural issues');
      expect(prompt).toContain('must NOT add any implementation logic');
      expect(prompt).toContain("throw new Error('TODO')");
    });
  });

  describe('parseRepairResponse', () => {
    it('should parse file blocks from response', () => {
      const response = `
Here are the fixes:

--- FILE: /test/types.ts ---
export interface MyType {
  id: string;
}
--- END FILE ---

--- FILE: /test/functions.ts ---
import { MyType } from './types.js';

export function create(data: MyType): void {
  throw new Error('TODO');
}
--- END FILE ---
`;

      const repairs = parseRepairResponse(response);

      expect(repairs.size).toBe(2);
      expect(repairs.get('/test/types.ts')).toContain('export interface MyType');
      expect(repairs.get('/test/functions.ts')).toContain('import { MyType }');
    });

    it('should handle responses with markdown code blocks', () => {
      const response = `
--- FILE: /test/file.ts ---
\`\`\`typescript
export type Id = string;
\`\`\`
--- END FILE ---
`;

      const repairs = parseRepairResponse(response);

      expect(repairs.size).toBe(1);
      expect(repairs.get('/test/file.ts')).toBe('export type Id = string;');
    });

    it('should return empty map for response without file blocks', () => {
      const response = 'Sorry, I could not fix the errors.';

      const repairs = parseRepairResponse(response);

      expect(repairs.size).toBe(0);
    });
  });

  describe('verifyNoLogicLeakage', () => {
    it('should pass for files with only TODO bodies', async () => {
      const testFile = path.join(tempDir, 'valid.ts');
      await safeWriteFile(
        testFile,
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}

export function subtract(a: number, b: number): number {
  throw new Error("TODO");
}
`
      );

      const result = verifyNoLogicLeakage(tempDir, ['valid.ts']);

      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should detect functions with implementation bodies', async () => {
      const testFile = path.join(tempDir, 'impl.ts');
      await safeWriteFile(
        testFile,
        `
export function add(a: number, b: number): number {
  return a + b;
}
`
      );

      const result = verifyNoLogicLeakage(tempDir, ['impl.ts']);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.severity === 'error')).toBe(true);
    });

    it('should detect fetch calls as logic leakage', async () => {
      const testFile = path.join(tempDir, 'fetch.ts');
      await safeWriteFile(
        testFile,
        `
export async function getData(): Promise<unknown> {
  return fetch('https://api.example.com/data');
}
`
      );

      const result = verifyNoLogicLeakage(tempDir, ['fetch.ts']);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.violation.includes('fetch'))).toBe(true);
    });

    it('should detect console.log as logic leakage', async () => {
      const testFile = path.join(tempDir, 'console.ts');
      await safeWriteFile(
        testFile,
        `
export function debug(msg: string): void {
  console.log(msg);
}
`
      );

      const result = verifyNoLogicLeakage(tempDir, ['console.ts']);

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.violation.includes('Console'))).toBe(true);
    });

    it('should handle file parsing errors gracefully', () => {
      const result = verifyNoLogicLeakage(tempDir, ['nonexistent.ts']);

      // Should have an error about the file not being parseable
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.severity === 'error')).toBe(true);
      expect(result.passed).toBe(false);
    });
  });

  describe('CompilationVerifier', () => {
    it('should create a verifier with default options', () => {
      const verifier = createCompilationVerifier({
        projectPath: tempDir,
      });

      expect(verifier).toBeInstanceOf(CompilationVerifier);
    });

    it('should verify successful compilation', async () => {
      // Create a valid TypeScript file
      const testFile = path.join(tempDir, 'valid.ts');
      await safeWriteFile(
        testFile,
        `
export interface User {
  id: string;
  name: string;
}

export function getUser(id: string): User {
  throw new Error('TODO');
}
`
      );

      // Create a minimal tsconfig.json
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock successful type check
      mockRunTypeCheck.mockResolvedValue(createTypeCheckResult());

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['valid.ts'],
        tsconfigPath: 'tsconfig.json',
        maxRepairAttempts: 1,
        logger: vi.fn(), // Suppress logging in tests
      });

      const result = await verifier.verify();

      expect(result.success).toBe(true);
      expect(result.state.kind).toBe('success');
    });

    it('should enter BLOCKED state after max repair attempts', async () => {
      // Create an invalid TypeScript file
      const testFile = path.join(tempDir, 'invalid.ts');
      await safeWriteFile(
        testFile,
        `
export function broken(): UndefinedType {
  throw new Error('TODO');
}
`
      );

      // Create a minimal tsconfig.json
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock type check that always fails
      const persistentError: CompilerError = {
        file: 'invalid.ts',
        line: 2,
        column: 28,
        code: 'TS2304',
        message: "Cannot find name 'UndefinedType'",
        typeDetails: null,
      };
      mockRunTypeCheck.mockResolvedValue(
        createTypeCheckResult({
          success: false,
          errors: [persistentError],
          errorCount: 1,
        })
      );

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['invalid.ts'],
        maxRepairAttempts: 2,
        // No model router, so no repairs will be applied
        logger: vi.fn(), // Suppress logging in tests
      });

      const result = await verifier.verify();

      expect(result.success).toBe(false);
      expect(result.state.kind).toBe('blocked');

      if (result.state.kind === 'blocked') {
        expect(result.state.unresolvedErrors.length).toBeGreaterThan(0);
        expect(result.state.reason).toContain('repair attempts');
      }
    });

    it('should run AST inspection after successful compilation', async () => {
      // Create a valid TypeScript file with TODO body
      const testFile = path.join(tempDir, 'todo.ts');
      await safeWriteFile(
        testFile,
        `
export function process(): void {
  throw new Error('TODO');
}
`
      );

      // Create a minimal tsconfig.json
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock successful type check
      mockRunTypeCheck.mockResolvedValue(createTypeCheckResult());

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['todo.ts'],
        runAstInspection: true,
        logger: vi.fn(), // Suppress logging in tests
      });

      const result = await verifier.verify();

      expect(result.success).toBe(true);
      expect(result.astInspection).toBeDefined();
      expect(result.astInspection?.passed).toBe(true);
    });

    it('should detect logic leakage in AST inspection', async () => {
      // Create a file with implementation logic (not TODO)
      const testFile = path.join(tempDir, 'leaky.ts');
      await safeWriteFile(
        testFile,
        `
export function add(a: number, b: number): number {
  return a + b;
}
`
      );

      // Create a minimal tsconfig.json
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock successful type check
      mockRunTypeCheck.mockResolvedValue(createTypeCheckResult());

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['leaky.ts'],
        runAstInspection: true,
        logger: vi.fn(), // Suppress logging in tests
      });

      const result = await verifier.verify();

      // Compilation succeeds but AST inspection should detect logic leakage
      expect(result.success).toBe(true);
      expect(result.astInspection).toBeDefined();
      expect(result.astInspection?.passed).toBe(false);
      expect(result.astInspection?.logicPatterns?.length).toBeGreaterThan(0);
    });

    it('should use model router for repairs when provided', async () => {
      // Create an invalid TypeScript file with a missing import
      const testFile = path.join(tempDir, 'missing-import.ts');
      await safeWriteFile(
        testFile,
        `
import type { MissingType } from './missing.js';

export function process(data: MissingType): void {
  throw new Error('TODO');
}
`
      );

      // Create a minimal tsconfig.json
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock type check - fails initially, then succeeds after repair
      const missingModuleError: CompilerError = {
        file: 'missing-import.ts',
        line: 2,
        column: 1,
        code: 'TS2307',
        message: "Cannot find module './missing.js'",
        typeDetails: null,
      };
      mockRunTypeCheck
        .mockResolvedValueOnce(
          createTypeCheckResult({
            success: false,
            errors: [missingModuleError],
            errorCount: 1,
          })
        )
        .mockResolvedValueOnce(createTypeCheckResult()); // Succeeds after repair

      // Create a mock model router that returns a fix
      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: `
--- FILE: ${path.join(tempDir, 'missing.ts')} ---
export interface MissingType {
  id: string;
}
--- END FILE ---
`,
          usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
          metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
        },
      } as ModelRouterResult);

      const mockRouter: ModelRouter = {
        prompt: vi.fn(),
        complete: mockComplete,
        stream: vi.fn() as unknown as ModelRouter['stream'],
      };

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['missing-import.ts'],
        maxRepairAttempts: 3,
        modelRouter: mockRouter,
        logger: vi.fn(), // Suppress logging in tests
      });

      const result = await verifier.verify();

      // The mock router should have been called
      expect(mockComplete).toHaveBeenCalled();

      // Check that a repair was attempted
      expect(result.attempts.length).toBeGreaterThan(0);
    });
  });

  describe('formatVerificationReport', () => {
    it('should format successful result', () => {
      const report = formatVerificationReport({
        state: { kind: 'success', attempts: [] },
        success: true,
        attempts: [
          {
            attempt: 1,
            success: true,
            errors: [],
            repairsApplied: [],
            durationMs: 100,
          },
        ],
        totalDurationMs: 100,
      });

      expect(report).toContain('SUCCESS');
      expect(report).toContain('COMPILATION VERIFICATION REPORT');
    });

    it('should format blocked result with errors', () => {
      const blockedError: CategorizedError = {
        error: {
          file: 'test.ts',
          line: 5,
          column: 10,
          code: 'TS2304',
          message: "Cannot find name 'Foo'",
          typeDetails: null,
        },
        category: 'missing_type',
        repairHint: "Define or import 'Foo'",
        autoRepairable: true,
      };

      const report = formatVerificationReport({
        state: {
          kind: 'blocked',
          attempts: [],
          unresolvedErrors: [blockedError],
          reason: 'Compilation failed after 5 repair attempts',
        },
        success: false,
        attempts: [],
        totalDurationMs: 5000,
      });

      expect(report).toContain('BLOCKED');
      expect(report).toContain('TS2304');
      expect(report).toContain('repair attempts');
    });

    it('should format AST inspection results', () => {
      const report = formatVerificationReport({
        state: { kind: 'success', attempts: [] },
        success: true,
        attempts: [],
        totalDurationMs: 50,
        astInspection: {
          functions: [],
          logicPatterns: [
            {
              line: 10,
              description: 'Implementation logic detected',
              severity: 'error',
            },
          ],
          passed: false,
        },
      });

      expect(report).toContain('AST INSPECTION');
      expect(report).toContain('VIOLATIONS FOUND');
    });
  });

  describe('path normalization', () => {
    it('should derive file list when files is undefined', async () => {
      const testFile = path.join(tempDir, 'derived.ts');
      await safeWriteFile(
        testFile,
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      mockRunTypeCheck.mockResolvedValue(createTypeCheckResult());

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        runAstInspection: true,
        logger: vi.fn(),
      });

      const result = await verifier.verify();

      expect(result.success).toBe(true);
      expect(result.astInspection).toBeDefined();
    });

    it('should throw FilesNotResolvedError when no files found', async () => {
      // Create empty directory
      const emptyDir = path.join(tempDir, 'empty');
      await safeMkdir(emptyDir, { recursive: true });

      const verifier = createCompilationVerifier({
        projectPath: emptyDir,
        logger: vi.fn(),
      });

      await expect(verifier.verify()).rejects.toThrow(FilesNotResolvedError);
    });

    it('should apply repairs with relative paths correctly', async () => {
      const testFile = path.join(tempDir, 'fix.ts');
      await safeWriteFile(
        testFile,
        `
export function broken(): void {
  throw new Error('TODO');
}
`
      );

      const testConfigPath = path.join(tempDir, 'tsconfig.json');
      await safeWriteFile(
        testConfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2020',
            module: 'ES2020',
            moduleResolution: 'node',
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['*.ts'],
        })
      );

      // Mock type check that fails initially, then succeeds
      const error: CompilerError = {
        file: 'fix.ts',
        line: 1,
        column: 1,
        code: 'TS2304',
        message: "Cannot find name 'Test'",
        typeDetails: null,
      };
      mockRunTypeCheck
        .mockResolvedValueOnce(
          createTypeCheckResult({
            success: false,
            errors: [error],
            errorCount: 1,
          })
        )
        .mockResolvedValueOnce(createTypeCheckResult());

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: `
--- FILE: ./fix.ts ---
export function fixed(): void {
  throw new Error('TODO');
}
--- END FILE ---
`,
          usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
          metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
        },
      } as ModelRouterResult);

      const mockRouter: ModelRouter = {
        prompt: vi.fn(),
        complete: mockComplete,
        stream: vi.fn() as unknown as ModelRouter['stream'],
      };

      const verifier = createCompilationVerifier({
        projectPath: tempDir,
        files: ['fix.ts'],
        maxRepairAttempts: 2,
        modelRouter: mockRouter,
        logger: vi.fn(),
      });

      const result = await verifier.verify();

      expect(mockComplete).toHaveBeenCalled();
      expect(result.attempts.length).toBeGreaterThan(0);
    });
  });
});
