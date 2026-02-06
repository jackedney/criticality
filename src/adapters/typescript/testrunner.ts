/**
 * Vitest wrapper with structured test output.
 *
 * Provides programmatic access to vitest test execution with parsed results.
 *
 * @module adapters/typescript/testrunner
 */

import { execa } from 'execa';
import * as path from 'node:path';

/**
 * Error thrown when vitest is not found in PATH or node_modules.
 */
export class ToolchainNotInstalledError extends Error {
  constructor(toolName: string) {
    super(`${toolName} not found in PATH. Please install vitest: npm install -D vitest`);
    this.name = 'ToolchainNotInstalledError';
  }
}

/**
 * Status of an individual test.
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';

/**
 * Represents an error from a failed test.
 */
export interface TestError {
  /** The assertion error message */
  message: string;
  /** Full stack trace if available */
  stack?: string;
}

/**
 * Represents the result of a single test.
 */
export interface TestResult {
  /** The test name (title) */
  name: string;
  /** Full name including ancestor describe blocks */
  fullName: string;
  /** The test file path */
  file: string;
  /** Test status (passed, failed, skipped, pending, todo) */
  status: TestStatus;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error details if the test failed */
  error?: TestError;
}

/**
 * Options for running tests.
 */
export interface TestRunOptions {
  /** Working directory for test execution */
  cwd?: string;
  /** Specific test name pattern to run (-t flag) */
  testNamePattern?: string;
  /** Timeout in milliseconds for the test run */
  timeout?: number;
  /** Path to vitest config file */
  configPath?: string;
}

/**
 * Result of running tests.
 */
export interface TestRunResult {
  /** Whether all tests passed */
  success: boolean;
  /** Total number of tests run */
  totalTests: number;
  /** Number of passed tests */
  passedTests: number;
  /** Number of failed tests */
  failedTests: number;
  /** Number of skipped tests */
  skippedTests: number;
  /** Array of individual test results */
  tests: TestResult[];
}

/**
 * Raw JSON output from vitest JSON reporter.
 * These interfaces match vitest's actual output structure.
 */
interface VitestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  success: boolean;
  testResults: VitestTestFile[];
}

interface VitestTestFile {
  name: string;
  status: string;
  assertionResults: VitestAssertionResult[];
}

interface VitestAssertionResult {
  title: string;
  fullName: string;
  status: string;
  duration: number;
  failureMessages: string[];
}

/**
 * Finds the vitest binary - looks in the specified project path first,
 * then in the current working directory, then falls back to npx/global.
 *
 * @param projectPath - The project path to search for local vitest.
 * @returns Object with command and args for running vitest.
 */
async function findVitestCommand(
  projectPath: string
): Promise<{ command: string; args: string[] }> {
  // Try local node_modules/.bin/vitest in the project path first
  const localVitest = path.join(projectPath, 'node_modules', '.bin', 'vitest');

  try {
    await execa('test', ['-f', localVitest]);
    return { command: localVitest, args: [] };
  } catch {
    // Try node_modules in the current working directory (for monorepo/workspace setups)
    const cwdVitest = path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
    try {
      await execa('test', ['-f', cwdVitest]);
      return { command: cwdVitest, args: [] };
    } catch {
      // Local vitest not found, try npx
      try {
        await execa('which', ['npx']);
        return { command: 'npx', args: ['vitest'] };
      } catch {
        // No npx, try global vitest
        try {
          await execa('which', ['vitest']);
          return { command: 'vitest', args: [] };
        } catch {
          throw new ToolchainNotInstalledError('vitest');
        }
      }
    }
  }
}

/**
 * Maps vitest status strings to our TestStatus type.
 */
function mapStatus(status: string): TestStatus {
  switch (status.toLowerCase()) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'pending':
      return 'pending';
    case 'todo':
      return 'todo';
    default:
      return 'failed';
  }
}

/**
 * Parses the first failure message into a TestError.
 */
function parseError(failureMessages: string[]): TestError | undefined {
  if (failureMessages.length === 0) {
    return undefined;
  }

  const firstMessage = failureMessages[0];
  if (firstMessage === undefined || firstMessage === '') {
    return undefined;
  }

  // Split message and stack trace
  const lines = firstMessage.split('\n');
  const messageLine = lines[0] ?? '';

  // Extract just the assertion message (before any stack trace)
  // Format is typically: "AssertionError: expected X to be Y // Object.is equality"
  // eslint-disable-next-line security/detect-unsafe-regex -- Input is single line from error message
  const match = /^(?:AssertionError: )?([^/]+?)(?:\s*\/\/[^\n]*)?$/.exec(messageLine);
  const message = match?.[1] ?? messageLine;

  return {
    message: message.trim(),
    stack: firstMessage,
  };
}

/**
 * Parses vitest JSON output into our structured TestRunResult.
 */
function parseVitestOutput(jsonOutput: string): TestRunResult {
  // Handle empty or invalid output
  if (!jsonOutput.trim()) {
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      tests: [],
    };
  }

  let parsed: VitestJsonOutput;
  try {
    parsed = JSON.parse(jsonOutput) as VitestJsonOutput;
  } catch {
    // If we can't parse the JSON, return empty results (not an error)
    // This handles the case of invalid test patterns
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      tests: [],
    };
  }

  const tests: TestResult[] = [];

  for (const testFile of parsed.testResults) {
    for (const assertion of testFile.assertionResults) {
      const status = mapStatus(assertion.status);
      const testResult: TestResult = {
        name: assertion.title,
        fullName: assertion.fullName,
        file: testFile.name,
        status,
        durationMs: assertion.duration,
      };
      if (status === 'failed') {
        const error = parseError(assertion.failureMessages);
        if (error !== undefined) {
          testResult.error = error;
        }
      }
      tests.push(testResult);
    }
  }

  // Calculate skipped tests from the total
  const skippedTests =
    parsed.numTotalTests - parsed.numPassedTests - parsed.numFailedTests - parsed.numPendingTests;

  return {
    success: parsed.success,
    totalTests: parsed.numTotalTests,
    passedTests: parsed.numPassedTests,
    failedTests: parsed.numFailedTests,
    skippedTests: Math.max(0, skippedTests),
    tests,
  };
}

/**
 * Runs vitest tests and returns structured results.
 *
 * Uses the vitest JSON reporter to capture structured test results.
 * Supports running specific test files, patterns, or individual test names.
 *
 * @param pattern - File pattern or path to match test files (e.g., "**\/*.test.ts", "./src/utils.test.ts").
 * @param options - Optional configuration for the test run.
 * @returns A TestRunResult with success status and individual test results.
 * @throws {ToolchainNotInstalledError} If vitest is not found.
 *
 * @example
 * // Run all tests
 * const result = await runTests('**\/*.test.ts');
 * if (!result.success) {
 *   console.log(`${result.failedTests} tests failed`);
 *   for (const test of result.tests.filter(t => t.status === 'failed')) {
 *     console.log(`  ${test.name}: ${test.error?.message}`);
 *   }
 * }
 *
 * @example
 * // Run specific test file
 * const result = await runTests('./src/utils.test.ts');
 *
 * @example
 * // Run tests matching a name pattern
 * const result = await runTests('**\/*.test.ts', {
 *   testNamePattern: 'should handle edge cases'
 * });
 */
export async function runTests(
  pattern: string,
  options: TestRunOptions = {}
): Promise<TestRunResult> {
  const cwd =
    options.cwd !== undefined && options.cwd !== '' ? path.resolve(options.cwd) : process.cwd();

  // Find the vitest command
  const { command, args: baseArgs } = await findVitestCommand(cwd);

  // Build the vitest arguments
  const args = [...baseArgs, 'run', '--reporter=json'];

  // Use --root to tell vitest where to look for tests (allows running from different cwd)
  args.push('--root', cwd);

  // Add config path if specified
  if (options.configPath !== undefined && options.configPath !== '') {
    args.push('--config', path.resolve(cwd, options.configPath));
  }

  // Add test name pattern if specified
  if (options.testNamePattern !== undefined && options.testNamePattern !== '') {
    args.push('-t', options.testNamePattern);
  }

  // Add the file pattern
  if (pattern !== '') {
    args.push(pattern);
  }

  let output: string;
  try {
    // Run vitest from the current directory (where node_modules is), but with --root pointing to the target
    const result = await execa(command, args, {
      reject: false,
      timeout: options.timeout ?? 600000, // Default 10 minute timeout
      env: {
        ...process.env,
        // Disable colors in output for clean JSON parsing
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });

    // vitest outputs JSON to stdout
    const rawOutput = result.stdout;
    output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);
  } catch (error) {
    // Handle case where the command itself fails to run
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new ToolchainNotInstalledError('vitest');
    }
    throw error;
  }

  return parseVitestOutput(output);
}
