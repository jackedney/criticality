/**
 * Per-function test execution for the Injection phase.
 *
 * Provides isolated test execution for injected functions with:
 * - tsc compilation verification after injection
 * - Vitest test execution using TypeScriptAdapter wrapper
 * - Timeout handling with explicit context
 * - Structured pass/fail determination
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import { access } from 'node:fs/promises';
import {
  runTests,
  type TestRunOptions,
  type TestRunResult,
} from '../adapters/typescript/testrunner.js';
import { runTypeCheck, type TypeCheckResult } from '../adapters/typescript/typecheck.js';

/**
 * Error thrown when a test execution times out.
 *
 * Provides detailed context about the timeout including:
 * - The function being tested
 * - The test file path
 * - The configured timeout value
 */
export class TestTimeoutError extends Error {
  /** The name of the function being tested when timeout occurred. */
  readonly functionName: string;

  /** The test file path that timed out. */
  readonly testFilePath: string;

  /** The timeout value in milliseconds. */
  readonly timeoutMs: number;

  constructor(functionName: string, testFilePath: string, timeoutMs: number) {
    super(
      `Test timeout for function '${functionName}' after ${String(timeoutMs)}ms. ` +
        `Test file: ${testFilePath}. Consider increasing the timeout or simplifying the test.`
    );
    this.name = 'TestTimeoutError';
    this.functionName = functionName;
    this.testFilePath = testFilePath;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Result of per-function test execution.
 */
export interface FunctionTestResult {
  /** The function name that was tested. */
  readonly functionName: string;

  /** The file path containing the function. */
  readonly filePath: string;

  /** Whether the function passed all verification steps. */
  readonly passed: boolean;

  /** Whether compilation (tsc) succeeded. */
  readonly compilationPassed: boolean;

  /** Whether tests passed (only relevant if compilation passed). */
  readonly testsPassed: boolean;

  /** The compilation result from tsc. */
  readonly compilationResult: TypeCheckResult;

  /** The test result from vitest (undefined if compilation failed or no tests found). */
  readonly testResult?: TestRunResult;

  /** The test file path that was executed (undefined if no tests found). */
  readonly testFilePath?: string;

  /** Failure reason if the test did not pass. */
  readonly failureReason?: string;

  /** Whether this was a timeout failure. */
  readonly timedOut: boolean;

  /** Duration of the test execution in milliseconds. */
  readonly durationMs: number;
}

/**
 * Options for per-function test execution.
 */
export interface FunctionTestOptions {
  /** Working directory for test execution (project root). */
  readonly projectPath: string;

  /** Path to tsconfig.json (optional, defaults to projectPath/tsconfig.json). */
  readonly tsconfigPath?: string;

  /** Path to vitest config file (optional). */
  readonly vitestConfigPath?: string;

  /** Timeout in milliseconds for test execution. Default: 30000 (30 seconds). */
  readonly testTimeout?: number;

  /** Whether to skip compilation check. Default: false. */
  readonly skipCompilation?: boolean;

  /** Logger for progress messages. */
  readonly logger?: (message: string) => void;
}

/** Default test timeout in milliseconds (30 seconds). */
export const DEFAULT_TEST_TIMEOUT = 30000;

/**
 * Finds the test file for a given source file.
 *
 * Looks for test files in the following patterns:
 * 1. Same directory: <basename>.test.ts
 * 2. Same directory: <basename>.spec.ts
 * 3. Same directory: <basename>.test.tsx
 * 4. Same directory: <basename>.spec.tsx
 * 5. __tests__ directory: <basename>.test.ts
 * 6. __tests__ directory: <basename>.spec.ts
 * 7. __tests__ directory: <basename>.test.tsx
 * 8. __tests__ directory: <basename>.spec.tsx
 *
 * @param sourceFilePath - The source file path.
 * @returns The test file path if found, undefined otherwise.
 */
export async function findTestFile(sourceFilePath: string): Promise<string | undefined> {
  const baseName = path.basename(sourceFilePath).replace(/\.(ts|tsx)$/, '');
  const dirName = path.dirname(sourceFilePath);

  // Patterns to check
  const candidates = [
    path.join(dirName, `${baseName}.test.ts`),
    path.join(dirName, `${baseName}.spec.ts`),
    path.join(dirName, `${baseName}.test.tsx`),
    path.join(dirName, `${baseName}.spec.tsx`),
    path.join(dirName, '__tests__', `${baseName}.test.ts`),
    path.join(dirName, '__tests__', `${baseName}.spec.ts`),
    path.join(dirName, '__tests__', `${baseName}.test.tsx`),
    path.join(dirName, '__tests__', `${baseName}.spec.tsx`),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // File doesn't exist, try next candidate
    }
  }

  return undefined;
}

/**
 * Runs compilation verification using tsc.
 *
 * @param projectPath - The project root path.
 * @param tsconfigPath - Optional path to tsconfig.json.
 * @returns The type check result.
 */
export async function runCompilationVerification(
  projectPath: string,
  tsconfigPath?: string
): Promise<TypeCheckResult> {
  if (tsconfigPath !== undefined && tsconfigPath !== '') {
    return runTypeCheck(projectPath, { tsconfigPath });
  }
  return runTypeCheck(projectPath, {});
}

/**
 * Runs tests for a specific function.
 *
 * Executes the test file associated with the function and returns structured results.
 * Handles timeouts by catching ETIMEDOUT errors and providing context.
 *
 * @param testFilePath - The test file path.
 * @param functionName - The function name being tested.
 * @param options - Test run options.
 * @returns The test run result.
 * @throws {TestTimeoutError} If the test execution times out.
 */
export async function runFunctionTests(
  testFilePath: string,
  functionName: string,
  options: {
    projectPath: string;
    vitestConfigPath?: string;
    timeout?: number;
  }
): Promise<TestRunResult> {
  const testTimeout = options.timeout ?? DEFAULT_TEST_TIMEOUT;

  // Build test run options
  const testOptions: TestRunOptions = {
    cwd: options.projectPath,
    timeout: testTimeout,
  };

  if (options.vitestConfigPath !== undefined && options.vitestConfigPath !== '') {
    testOptions.configPath = options.vitestConfigPath;
  }

  try {
    return await runTests(testFilePath, testOptions);
  } catch (error) {
    // Check for timeout error (execa throws an error with 'timedOut' property)
    if (
      error !== null &&
      typeof error === 'object' &&
      'timedOut' in error &&
      error.timedOut === true
    ) {
      throw new TestTimeoutError(functionName, testFilePath, testTimeout);
    }

    // Check for ETIMEDOUT in error message (fallback detection)
    if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
      throw new TestTimeoutError(functionName, testFilePath, testTimeout);
    }

    // Check for timeout-related error codes
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT')
    ) {
      throw new TestTimeoutError(functionName, testFilePath, testTimeout);
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Executes per-function test verification.
 *
 * This is the main entry point for testing an injected function. It:
 * 1. Runs tsc compilation verification (unless skipped)
 * 2. Finds the test file for the function's source file
 * 3. Runs the tests with timeout handling
 * 4. Returns a structured result
 *
 * @param functionName - The name of the function being tested.
 * @param sourceFilePath - The source file containing the function.
 * @param options - Test execution options.
 * @returns The function test result.
 *
 * @example
 * ```typescript
 * // Test the deposit function after injection
 * const result = await executeFunctionTest('deposit', '/src/account.ts', {
 *   projectPath: '/my-project',
 *   testTimeout: 30000,
 * });
 *
 * if (result.passed) {
 *   console.log('deposit function passed all tests');
 * } else {
 *   console.log(`Failed: ${result.failureReason}`);
 *   if (result.timedOut) {
 *     console.log('Test execution timed out');
 *   }
 * }
 * ```
 */
export async function executeFunctionTest(
  functionName: string,
  sourceFilePath: string,
  options: FunctionTestOptions
): Promise<FunctionTestResult> {
  const startTime = Date.now();
  const logger = options.logger ?? ((): void => undefined);
  const testTimeout = options.testTimeout ?? DEFAULT_TEST_TIMEOUT;

  logger(`Testing function: ${functionName} from ${sourceFilePath}`);

  // Step 1: Run compilation verification
  let compilationResult: TypeCheckResult;
  if (options.skipCompilation !== true) {
    logger('  Running tsc compilation verification...');
    compilationResult = await runCompilationVerification(options.projectPath, options.tsconfigPath);

    if (!compilationResult.success) {
      const errorSummary = compilationResult.errors
        .slice(0, 3)
        .map((e) => `${e.code}: ${e.message}`)
        .join('; ');

      return {
        functionName,
        filePath: sourceFilePath,
        passed: false,
        compilationPassed: false,
        testsPassed: false,
        compilationResult,
        failureReason: `Compilation failed: ${errorSummary}`,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    }
    logger('  Compilation passed');
  } else {
    // Skip compilation - create a success result
    compilationResult = {
      success: true,
      errors: [],
      errorCount: 0,
      warningCount: 0,
    };
  }

  // Step 2: Find test file
  logger('  Looking for test file...');
  const testFilePath = await findTestFile(sourceFilePath);

  if (testFilePath === undefined) {
    logger(`  No test file found for ${functionName}, skipping test verification`);
    return {
      functionName,
      filePath: sourceFilePath,
      passed: true, // Pass if compilation passed and no tests
      compilationPassed: true,
      testsPassed: true, // No tests to fail
      compilationResult,
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }

  logger(`  Found test file: ${testFilePath}`);

  // Step 3: Run tests
  logger(`  Running tests with ${String(testTimeout)}ms timeout...`);
  let testResult: TestRunResult;

  // Build options conditionally to satisfy exactOptionalPropertyTypes
  const runTestOptions: {
    projectPath: string;
    vitestConfigPath?: string;
    timeout: number;
  } = {
    projectPath: options.projectPath,
    timeout: testTimeout,
  };

  if (options.vitestConfigPath !== undefined && options.vitestConfigPath !== '') {
    runTestOptions.vitestConfigPath = options.vitestConfigPath;
  }

  try {
    testResult = await runFunctionTests(testFilePath, functionName, runTestOptions);
  } catch (error) {
    if (error instanceof TestTimeoutError) {
      logger(`  Test timeout: ${error.message}`);

      return {
        functionName,
        filePath: sourceFilePath,
        passed: false,
        compilationPassed: true,
        testsPassed: false,
        compilationResult,
        testFilePath,
        failureReason: error.message,
        timedOut: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Other test execution error
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger(`  Test execution error: ${errorMessage}`);

    return {
      functionName,
      filePath: sourceFilePath,
      passed: false,
      compilationPassed: true,
      testsPassed: false,
      compilationResult,
      testFilePath,
      failureReason: `Test execution error: ${errorMessage}`,
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 4: Evaluate test results
  if (testResult.success) {
    logger(`  Tests passed: ${String(testResult.passedTests)}/${String(testResult.totalTests)}`);
    return {
      functionName,
      filePath: sourceFilePath,
      passed: true,
      compilationPassed: true,
      testsPassed: true,
      compilationResult,
      testResult,
      testFilePath,
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Tests failed
  const failedTests = testResult.tests
    .filter((t) => t.status === 'failed')
    .slice(0, 3)
    .map((t) => t.name)
    .join(', ');

  logger(`  Tests failed: ${failedTests}`);

  return {
    functionName,
    filePath: sourceFilePath,
    passed: false,
    compilationPassed: true,
    testsPassed: false,
    compilationResult,
    testResult,
    testFilePath,
    failureReason: `Tests failed: ${failedTests}`,
    timedOut: false,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Batch execution of tests for multiple functions.
 *
 * Useful for testing multiple functions from the same module in sequence.
 * Each function is tested independently with its own result.
 *
 * @param functions - Array of function names and their source file paths.
 * @param options - Test execution options.
 * @returns Array of function test results.
 */
export async function executeFunctionTestsBatch(
  functions: readonly { name: string; filePath: string }[],
  options: FunctionTestOptions
): Promise<FunctionTestResult[]> {
  const results: FunctionTestResult[] = [];

  for (const fn of functions) {
    const result = await executeFunctionTest(fn.name, fn.filePath, options);
    results.push(result);
  }

  return results;
}

/**
 * Formats a function test result as a human-readable string.
 *
 * @param result - The function test result.
 * @returns A formatted string representation.
 */
export function formatFunctionTestResult(result: FunctionTestResult): string {
  const lines: string[] = [];
  const status = result.passed ? '[PASS]' : '[FAIL]';

  lines.push(`${status} ${result.functionName} (${String(result.durationMs)}ms)`);

  if (!result.passed) {
    if (result.timedOut) {
      lines.push(`  Timeout: Test execution exceeded time limit`);
    }

    if (result.failureReason !== undefined) {
      lines.push(`  Reason: ${result.failureReason}`);
    }

    if (!result.compilationPassed) {
      lines.push(`  Compilation errors: ${String(result.compilationResult.errorCount)}`);
    }

    if (result.testResult !== undefined && !result.testsPassed) {
      lines.push(`  Failed tests: ${String(result.testResult.failedTests)}`);
      for (const test of result.testResult.tests.filter((t) => t.status === 'failed').slice(0, 3)) {
        lines.push(`    - ${test.name}: ${test.error?.message ?? 'unknown error'}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Summarizes batch test results.
 *
 * @param results - Array of function test results.
 * @returns Summary statistics.
 */
export function summarizeFunctionTestResults(results: readonly FunctionTestResult[]): {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  compilationFailed: number;
  testsFailed: number;
} {
  let passed = 0;
  let failed = 0;
  let timedOut = 0;
  let compilationFailed = 0;
  let testsFailed = 0;

  for (const result of results) {
    if (result.passed) {
      passed++;
    } else {
      failed++;
      if (result.timedOut) {
        timedOut++;
      }
      if (!result.compilationPassed) {
        compilationFailed++;
      } else if (!result.testsPassed && !result.timedOut) {
        testsFailed++;
      }
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    timedOut,
    compilationFailed,
    testsFailed,
  };
}
