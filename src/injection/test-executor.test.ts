/**
 * Tests for the per-function test execution module.
 *
 * Verifies:
 * - tsc compilation verification after injection
 * - Vitest test execution using TypeScriptAdapter wrapper
 * - Timeout handling with explicit context
 * - Structured pass/fail determination
 * - Test file discovery patterns
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  executeFunctionTest,
  executeFunctionTestsBatch,
  findTestFile,
  runCompilationVerification,
  runFunctionTests,
  formatFunctionTestResult,
  summarizeFunctionTestResults,
  TestTimeoutError,
  DEFAULT_TEST_TIMEOUT,
  type FunctionTestResult,
} from './test-executor.js';
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

// Helper to create a passing TestRunResult
function createPassingTestRun(): TestRunResult {
  return {
    success: true,
    totalTests: 1,
    passedTests: 1,
    failedTests: 0,
    skippedTests: 0,
    tests: [
      {
        name: 'should deposit correctly',
        fullName: 'deposit should deposit correctly',
        file: 'account.test.ts',
        status: 'passed',
        durationMs: 10,
      },
    ],
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
        name: 'should deposit correctly',
        fullName: 'deposit should deposit correctly',
        file: 'account.test.ts',
        status: 'failed',
        durationMs: 10,
        error: { message: 'expected 100 to equal 200' },
      },
    ],
  };
}

describe('TestTimeoutError', () => {
  it('should create error with timeout context', () => {
    const error = new TestTimeoutError('deposit', '/src/account.test.ts', 30000);

    expect(error.name).toBe('TestTimeoutError');
    expect(error.functionName).toBe('deposit');
    expect(error.testFilePath).toBe('/src/account.test.ts');
    expect(error.timeoutMs).toBe(30000);
    expect(error.message).toContain('deposit');
    expect(error.message).toContain('30000');
    expect(error.message).toContain('/src/account.test.ts');
  });

  it('should be instanceof Error', () => {
    const error = new TestTimeoutError('test', '/test.ts', 1000);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('DEFAULT_TEST_TIMEOUT', () => {
  it('should be 30 seconds', () => {
    expect(DEFAULT_TEST_TIMEOUT).toBe(30000);
  });
});

describe('findTestFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-executor-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find .test.ts file in same directory', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');

    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    const found = await findTestFile(srcFile);
    expect(found).toBe(testFile);
  });

  it('should find .spec.ts file in same directory', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.spec.ts');

    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    const found = await findTestFile(srcFile);
    expect(found).toBe(testFile);
  });

  it('should prefer .test.ts over .spec.ts', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    const specFile = path.join(tempDir, 'account.spec.ts');

    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account test", () => {})');
    await fs.writeFile(specFile, 'describe("account spec", () => {})');

    const found = await findTestFile(srcFile);
    expect(found).toBe(testFile);
  });

  it('should find test file in __tests__ directory', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testsDir = path.join(tempDir, '__tests__');
    const testFile = path.join(testsDir, 'account.test.ts');

    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.mkdir(testsDir, { recursive: true });
    await fs.writeFile(testFile, 'describe("account", () => {})');

    const found = await findTestFile(srcFile);
    expect(found).toBe(testFile);
  });

  it('should return undefined if no test file found', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');

    const found = await findTestFile(srcFile);
    expect(found).toBeUndefined();
  });
});

describe('runCompilationVerification', () => {
  beforeEach(() => {
    mockRunTypeCheck.mockReset();
  });

  it('should call runTypeCheck with project path', async () => {
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const result = await runCompilationVerification('/project');

    expect(mockRunTypeCheck).toHaveBeenCalledWith('/project', {});
    expect(result.success).toBe(true);
  });

  it('should pass tsconfig path when provided', async () => {
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const result = await runCompilationVerification('/project', 'tsconfig.build.json');

    expect(mockRunTypeCheck).toHaveBeenCalledWith('/project', {
      tsconfigPath: 'tsconfig.build.json',
    });
    expect(result.success).toBe(true);
  });

  it('should return failed result on compilation error', async () => {
    mockRunTypeCheck.mockResolvedValue(createFailedTypeCheck('Type error'));

    const result = await runCompilationVerification('/project');

    expect(result.success).toBe(false);
    expect(result.errorCount).toBe(1);
  });
});

describe('runFunctionTests', () => {
  beforeEach(() => {
    mockRunTests.mockReset();
  });

  it('should call runTests with correct options', async () => {
    mockRunTests.mockResolvedValue(createPassingTestRun());

    const result = await runFunctionTests('/test/account.test.ts', 'deposit', {
      projectPath: '/project',
      timeout: 60000,
    });

    expect(mockRunTests).toHaveBeenCalledWith('/test/account.test.ts', {
      cwd: '/project',
      timeout: 60000,
    });
    expect(result.success).toBe(true);
  });

  it('should use default timeout when not provided', async () => {
    mockRunTests.mockResolvedValue(createPassingTestRun());

    await runFunctionTests('/test/account.test.ts', 'deposit', {
      projectPath: '/project',
    });

    expect(mockRunTests).toHaveBeenCalledWith('/test/account.test.ts', {
      cwd: '/project',
      timeout: DEFAULT_TEST_TIMEOUT,
    });
  });

  it('should pass vitest config path when provided', async () => {
    mockRunTests.mockResolvedValue(createPassingTestRun());

    await runFunctionTests('/test/account.test.ts', 'deposit', {
      projectPath: '/project',
      vitestConfigPath: 'vitest.config.ts',
    });

    expect(mockRunTests).toHaveBeenCalledWith('/test/account.test.ts', {
      cwd: '/project',
      timeout: DEFAULT_TEST_TIMEOUT,
      configPath: 'vitest.config.ts',
    });
  });

  it('should throw TestTimeoutError on timeout (timedOut property)', async () => {
    const timeoutError = new Error('Command timed out');
    Object.assign(timeoutError, { timedOut: true });
    mockRunTests.mockRejectedValue(timeoutError);

    await expect(
      runFunctionTests('/test/account.test.ts', 'deposit', {
        projectPath: '/project',
        timeout: 5000,
      })
    ).rejects.toThrow(TestTimeoutError);
  });

  it('should throw TestTimeoutError on ETIMEDOUT in message', async () => {
    const timeoutError = new Error('ETIMEDOUT');
    mockRunTests.mockRejectedValue(timeoutError);

    await expect(
      runFunctionTests('/test/account.test.ts', 'deposit', {
        projectPath: '/project',
        timeout: 5000,
      })
    ).rejects.toThrow(TestTimeoutError);
  });

  it('should throw TestTimeoutError on ETIMEDOUT code', async () => {
    const timeoutError = new Error('Timeout');
    Object.assign(timeoutError, { code: 'ETIMEDOUT' });
    mockRunTests.mockRejectedValue(timeoutError);

    await expect(
      runFunctionTests('/test/account.test.ts', 'deposit', {
        projectPath: '/project',
        timeout: 5000,
      })
    ).rejects.toThrow(TestTimeoutError);
  });

  it('should re-throw non-timeout errors', async () => {
    const otherError = new Error('Some other error');
    mockRunTests.mockRejectedValue(otherError);

    await expect(
      runFunctionTests('/test/account.test.ts', 'deposit', {
        projectPath: '/project',
      })
    ).rejects.toThrow('Some other error');
  });
});

describe('executeFunctionTest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-executor-'));
    mockRunTypeCheck.mockReset();
    mockRunTests.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should pass when compilation and tests pass', async () => {
    // Create source and test files
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    mockRunTests.mockResolvedValue(createPassingTestRun());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.passed).toBe(true);
    expect(result.compilationPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.functionName).toBe('deposit');
    expect(result.filePath).toBe(srcFile);
  });

  it('should fail when compilation fails', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');

    mockRunTypeCheck.mockResolvedValue(createFailedTypeCheck('Type error'));

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.passed).toBe(false);
    expect(result.compilationPassed).toBe(false);
    expect(result.failureReason).toContain('Compilation failed');
    expect(result.timedOut).toBe(false);
  });

  it('should fail when tests fail', async () => {
    // Create source and test files
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    mockRunTests.mockResolvedValue(createFailedTestRun());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.passed).toBe(false);
    expect(result.compilationPassed).toBe(true);
    expect(result.testsPassed).toBe(false);
    expect(result.failureReason).toContain('Tests failed');
    expect(result.timedOut).toBe(false);
  });

  it('should handle timeout with context (negative case from acceptance criteria)', async () => {
    // Create source and test files
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    // Simulate timeout error
    const timeoutError = new Error('Command timed out');
    Object.assign(timeoutError, { timedOut: true });
    mockRunTests.mockRejectedValue(timeoutError);

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
      testTimeout: 5000,
    });

    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.compilationPassed).toBe(true);
    expect(result.testsPassed).toBe(false);
    expect(result.failureReason).toContain('timeout');
    expect(result.failureReason).toContain('deposit');
    expect(result.failureReason).toContain('5000');
  });

  it('should pass when no test file exists (compilation-only)', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.passed).toBe(true);
    expect(result.compilationPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.testFilePath).toBeUndefined();
  });

  it('should skip compilation when skipCompilation is true', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTests.mockResolvedValue(createPassingTestRun());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
      skipCompilation: true,
    });

    expect(mockRunTypeCheck).not.toHaveBeenCalled();
    expect(result.passed).toBe(true);
  });

  it('should include test file path in result', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    mockRunTests.mockResolvedValue(createPassingTestRun());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.testFilePath).toBe(testFile);
  });

  it('should track duration in result', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle test execution errors gracefully', async () => {
    const srcFile = path.join(tempDir, 'account.ts');
    const testFile = path.join(tempDir, 'account.test.ts');
    await fs.writeFile(srcFile, 'export function deposit() {}');
    await fs.writeFile(testFile, 'describe("account", () => {})');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());
    mockRunTests.mockRejectedValue(new Error('Vitest crashed'));

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain('Vitest crashed');
    expect(result.timedOut).toBe(false);
  });
});

describe('executeFunctionTestsBatch', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-executor-'));
    mockRunTypeCheck.mockReset();
    mockRunTests.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should execute tests for multiple functions', async () => {
    const file1 = path.join(tempDir, 'account.ts');
    const file2 = path.join(tempDir, 'transaction.ts');
    await fs.writeFile(file1, 'export function deposit() {}');
    await fs.writeFile(file2, 'export function transfer() {}');

    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    const results = await executeFunctionTestsBatch(
      [
        { name: 'deposit', filePath: file1 },
        { name: 'transfer', filePath: file2 },
      ],
      { projectPath: tempDir }
    );

    expect(results.length).toBe(2);
    expect(results[0]?.functionName).toBe('deposit');
    expect(results[1]?.functionName).toBe('transfer');
  });
});

describe('formatFunctionTestResult', () => {
  it('should format passing result', () => {
    const result: FunctionTestResult = {
      functionName: 'deposit',
      filePath: '/src/account.ts',
      passed: true,
      compilationPassed: true,
      testsPassed: true,
      compilationResult: createSuccessTypeCheck(),
      timedOut: false,
      durationMs: 150,
    };

    const formatted = formatFunctionTestResult(result);

    expect(formatted).toContain('[PASS]');
    expect(formatted).toContain('deposit');
    expect(formatted).toContain('150ms');
  });

  it('should format failing result with reason', () => {
    const result: FunctionTestResult = {
      functionName: 'deposit',
      filePath: '/src/account.ts',
      passed: false,
      compilationPassed: true,
      testsPassed: false,
      compilationResult: createSuccessTypeCheck(),
      testResult: createFailedTestRun(),
      failureReason: 'Tests failed: should deposit correctly',
      timedOut: false,
      durationMs: 200,
    };

    const formatted = formatFunctionTestResult(result);

    expect(formatted).toContain('[FAIL]');
    expect(formatted).toContain('deposit');
    expect(formatted).toContain('Tests failed');
  });

  it('should format timeout result', () => {
    const result: FunctionTestResult = {
      functionName: 'deposit',
      filePath: '/src/account.ts',
      passed: false,
      compilationPassed: true,
      testsPassed: false,
      compilationResult: createSuccessTypeCheck(),
      failureReason: 'Test timeout after 30000ms',
      timedOut: true,
      durationMs: 30000,
    };

    const formatted = formatFunctionTestResult(result);

    expect(formatted).toContain('[FAIL]');
    expect(formatted).toContain('Timeout');
  });

  it('should format compilation failure result', () => {
    const result: FunctionTestResult = {
      functionName: 'deposit',
      filePath: '/src/account.ts',
      passed: false,
      compilationPassed: false,
      testsPassed: false,
      compilationResult: createFailedTypeCheck('Type error'),
      failureReason: 'Compilation failed',
      timedOut: false,
      durationMs: 100,
    };

    const formatted = formatFunctionTestResult(result);

    expect(formatted).toContain('[FAIL]');
    expect(formatted).toContain('Compilation errors: 1');
  });
});

describe('summarizeFunctionTestResults', () => {
  it('should summarize all passing results', () => {
    const results: FunctionTestResult[] = [
      {
        functionName: 'deposit',
        filePath: '/src/account.ts',
        passed: true,
        compilationPassed: true,
        testsPassed: true,
        compilationResult: createSuccessTypeCheck(),
        timedOut: false,
        durationMs: 100,
      },
      {
        functionName: 'withdraw',
        filePath: '/src/account.ts',
        passed: true,
        compilationPassed: true,
        testsPassed: true,
        compilationResult: createSuccessTypeCheck(),
        timedOut: false,
        durationMs: 150,
      },
    ];

    const summary = summarizeFunctionTestResults(results);

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.timedOut).toBe(0);
    expect(summary.compilationFailed).toBe(0);
    expect(summary.testsFailed).toBe(0);
  });

  it('should summarize mixed results', () => {
    const results: FunctionTestResult[] = [
      {
        functionName: 'deposit',
        filePath: '/src/account.ts',
        passed: true,
        compilationPassed: true,
        testsPassed: true,
        compilationResult: createSuccessTypeCheck(),
        timedOut: false,
        durationMs: 100,
      },
      {
        functionName: 'withdraw',
        filePath: '/src/account.ts',
        passed: false,
        compilationPassed: false,
        testsPassed: false,
        compilationResult: createFailedTypeCheck('Error'),
        failureReason: 'Compilation failed',
        timedOut: false,
        durationMs: 50,
      },
      {
        functionName: 'transfer',
        filePath: '/src/account.ts',
        passed: false,
        compilationPassed: true,
        testsPassed: false,
        compilationResult: createSuccessTypeCheck(),
        failureReason: 'Tests failed',
        timedOut: false,
        durationMs: 200,
      },
      {
        functionName: 'balance',
        filePath: '/src/account.ts',
        passed: false,
        compilationPassed: true,
        testsPassed: false,
        compilationResult: createSuccessTypeCheck(),
        failureReason: 'Timeout',
        timedOut: true,
        durationMs: 30000,
      },
    ];

    const summary = summarizeFunctionTestResults(results);

    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(3);
    expect(summary.timedOut).toBe(1);
    expect(summary.compilationFailed).toBe(1);
    expect(summary.testsFailed).toBe(1); // transfer (not timed out, not compilation failed)
  });
});

describe('deposit function acceptance criteria example', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-executor-'));
    mockRunTypeCheck.mockReset();
    mockRunTests.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('deposit function injected -> runs deposit.test.ts -> passes -> accepted', async () => {
    // Create the scenario from acceptance criteria
    const srcFile = path.join(tempDir, 'deposit.ts');
    const testFile = path.join(tempDir, 'deposit.test.ts');
    await fs.writeFile(srcFile, 'export function deposit(amount: number) { return amount; }');
    await fs.writeFile(
      testFile,
      `
import { deposit } from './deposit.js';
import { describe, it, expect } from 'vitest';

describe('deposit', () => {
  it('should deposit the amount', () => {
    expect(deposit(100)).toBe(100);
  });
});
`
    );

    // Simulate successful compilation
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    // Simulate passing tests
    mockRunTests.mockResolvedValue({
      success: true,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      skippedTests: 0,
      tests: [
        {
          name: 'should deposit the amount',
          fullName: 'deposit should deposit the amount',
          file: testFile,
          status: 'passed',
          durationMs: 5,
        },
      ],
    });

    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
    });

    // Verify: deposit function injected -> runs deposit.test.ts -> passes -> accepted
    expect(result.passed).toBe(true);
    expect(result.functionName).toBe('deposit');
    expect(result.testFilePath).toBe(testFile);
    expect(result.testsPassed).toBe(true);
    expect(result.compilationPassed).toBe(true);
  });

  it('negative case: test timeout -> counts as failure, logged with timeout context', async () => {
    // Create the scenario from acceptance criteria
    const srcFile = path.join(tempDir, 'deposit.ts');
    const testFile = path.join(tempDir, 'deposit.test.ts');
    await fs.writeFile(srcFile, 'export function deposit(amount: number) { return amount; }');
    await fs.writeFile(testFile, 'describe("deposit", () => {})');

    // Simulate successful compilation
    mockRunTypeCheck.mockResolvedValue(createSuccessTypeCheck());

    // Simulate timeout
    const timeoutError = new Error('Command timed out');
    Object.assign(timeoutError, { timedOut: true });
    mockRunTests.mockRejectedValue(timeoutError);

    const logMessages: string[] = [];
    const result = await executeFunctionTest('deposit', srcFile, {
      projectPath: tempDir,
      testTimeout: 5000,
      logger: (msg) => logMessages.push(msg),
    });

    // Verify: Test timeout -> counts as failure
    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);

    // Verify: logged with timeout context
    expect(result.failureReason).toContain('timeout');
    expect(result.failureReason).toContain('deposit');
    expect(result.failureReason).toContain('5000');

    // Verify logger received timeout message
    const timeoutLog = logMessages.find((msg) => msg.toLowerCase().includes('timeout'));
    expect(timeoutLog).toBeDefined();
  });
});
