/**
 * Types for the criticality-toolchain-server MCP.
 *
 * This server wraps build tools (tsc, cargo check, vitest) to provide
 * structured JSON output instead of raw stdout for agent consumption.
 *
 * @packageDocumentation
 */

/**
 * Language/toolchain types supported by the toolchain server.
 */
export type ToolchainLanguage = 'typescript' | 'rust' | 'python' | 'go';

/**
 * Server configuration options.
 */
export interface ToolchainServerConfig {
  /** Root directory for the project being analyzed. */
  projectRoot: string;
  /** Enable debug logging. */
  debug?: boolean;
  /** Timeout for tool execution in milliseconds (default: 60000). */
  timeout?: number;
}

// ============================================================================
// verify_structure Tool Types
// ============================================================================

/**
 * Input for the verify_structure tool.
 */
export interface VerifyStructureInput {
  /** The language/toolchain to verify (auto-detected if not specified). */
  language?: ToolchainLanguage;
  /** Optional: specific file or directory to check. */
  path?: string;
  /** Whether to emit output files (false by default for verification). */
  emit?: boolean;
}

/**
 * A single structural error from type checking or syntax verification.
 */
export interface StructuralError {
  /** File path where the error occurred. */
  file: string;
  /** Line number (1-indexed). */
  line: number;
  /** Column number (1-indexed). */
  column: number;
  /** Error code (e.g., "TS2345", "E0308"). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** Severity: "error" or "warning". */
  severity: 'error' | 'warning';
}

/**
 * Result from the verify_structure tool.
 */
export interface VerifyStructureResult {
  /** Whether the verification passed with no errors. */
  success: boolean;
  /** The language/toolchain that was verified. */
  language: ToolchainLanguage;
  /** List of structural errors found. */
  errors: StructuralError[];
  /** Number of errors. */
  errorCount: number;
  /** Number of warnings. */
  warningCount: number;
  /** Duration of the verification in milliseconds. */
  durationMs: number;
  /** The command that was executed. */
  command: string;
  /** Exit code from the tool. */
  exitCode: number;
}

// ============================================================================
// run_function_test Tool Types
// ============================================================================

/**
 * Input for the run_function_test tool.
 */
export interface RunFunctionTestInput {
  /** Test file or pattern to run. */
  testPattern: string;
  /** Optional: specific test name or describe block to run. */
  testName?: string;
  /** Whether to collect coverage information. */
  coverage?: boolean;
  /** Timeout for the test run in milliseconds. */
  timeout?: number;
}

/**
 * A single test result.
 */
export interface TestResult {
  /** Test name. */
  name: string;
  /** Test file path. */
  file: string;
  /** Test status. */
  status: 'passed' | 'failed' | 'skipped' | 'todo';
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error message if failed. */
  error?: string;
  /** Stack trace if failed. */
  stack?: string;
}

/**
 * Coverage information for the test run.
 */
export interface CoverageInfo {
  /** Line coverage percentage (0-100). */
  lines: number;
  /** Statement coverage percentage (0-100). */
  statements: number;
  /** Branch coverage percentage (0-100). */
  branches: number;
  /** Function coverage percentage (0-100). */
  functions: number;
  /** Files with coverage data. */
  files?: FileCoverage[];
}

/**
 * Coverage for a single file.
 */
export interface FileCoverage {
  /** File path. */
  file: string;
  /** Line coverage percentage. */
  lines: number;
  /** Statement coverage percentage. */
  statements: number;
  /** Branch coverage percentage. */
  branches: number;
  /** Function coverage percentage. */
  functions: number;
}

/**
 * Result from the run_function_test tool.
 */
export interface RunFunctionTestResult {
  /** Whether all tests passed. */
  success: boolean;
  /** Total number of tests. */
  totalTests: number;
  /** Number of passed tests. */
  passedTests: number;
  /** Number of failed tests. */
  failedTests: number;
  /** Number of skipped tests. */
  skippedTests: number;
  /** Individual test results. */
  tests: TestResult[];
  /** Coverage information if requested. */
  coverage?: CoverageInfo;
  /** Duration of the test run in milliseconds. */
  durationMs: number;
  /** The command that was executed. */
  command: string;
  /** Exit code from the test runner. */
  exitCode: number;
}

// ============================================================================
// check_complexity Tool Types
// ============================================================================

/**
 * Input for the check_complexity tool.
 */
export interface CheckComplexityInput {
  /** File or directory to analyze. */
  path: string;
  /** Maximum cyclomatic complexity threshold (default: 10). */
  maxComplexity?: number;
  /** Include detailed per-function metrics. */
  detailed?: boolean;
}

/**
 * Complexity metrics for a single function.
 */
export interface FunctionComplexity {
  /** Function name. */
  name: string;
  /** File path. */
  file: string;
  /** Line number where the function starts. */
  line: number;
  /** Cyclomatic complexity score. */
  cyclomaticComplexity: number;
  /** Lines of code in the function. */
  linesOfCode: number;
  /** Number of parameters. */
  parameterCount: number;
  /** Cognitive complexity (if available). */
  cognitiveComplexity?: number;
}

/**
 * Summary complexity metrics for the analyzed code.
 */
export interface ComplexitySummary {
  /** Total number of functions analyzed. */
  totalFunctions: number;
  /** Average cyclomatic complexity. */
  averageComplexity: number;
  /** Maximum cyclomatic complexity found. */
  maxComplexity: number;
  /** Number of functions exceeding threshold. */
  functionsOverThreshold: number;
  /** Total lines of code analyzed. */
  totalLinesOfCode: number;
}

/**
 * Result from the check_complexity tool.
 */
export interface CheckComplexityResult {
  /** Whether all functions are within complexity threshold. */
  success: boolean;
  /** Summary metrics. */
  summary: ComplexitySummary;
  /** Per-function metrics (if detailed mode). */
  functions?: FunctionComplexity[];
  /** Functions that exceed the threshold. */
  violations: FunctionComplexity[];
  /** The complexity threshold used. */
  threshold: number;
  /** Duration of the analysis in milliseconds. */
  durationMs: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when a toolchain is not installed.
 */
export class ToolchainNotInstalledError extends Error {
  /** The toolchain that is not installed. */
  public readonly toolchain: string;
  /** The command that was attempted. */
  public readonly command: string;

  constructor(toolchain: string, command: string) {
    super(
      `Toolchain '${toolchain}' is not installed or not in PATH. ` +
        `Attempted command: '${command}'`
    );
    this.name = 'ToolchainNotInstalledError';
    this.toolchain = toolchain;
    this.command = command;
  }
}

/**
 * Error thrown when a tool execution fails.
 */
export class ToolExecutionError extends Error {
  /** The command that failed. */
  public readonly command: string;
  /** Exit code from the command. */
  public readonly exitCode: number;
  /** Standard error output. */
  public readonly stderr: string;

  constructor(command: string, exitCode: number, stderr: string) {
    super(`Tool execution failed with exit code ${String(exitCode)}: ${stderr.slice(0, 200)}`);
    this.name = 'ToolExecutionError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Error thrown when output parsing fails.
 */
export class OutputParseError extends Error {
  /** The output that failed to parse. */
  public readonly output: string;

  constructor(message: string, output: string) {
    super(`Failed to parse tool output: ${message}`);
    this.name = 'OutputParseError';
    this.output = output.slice(0, 500);
  }
}
