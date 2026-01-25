/**
 * Criticality Toolchain Server - MCP Server wrapping build tools.
 *
 * Provides structured JSON output from build tools (tsc, cargo check, vitest)
 * instead of raw stdout, enabling agents to programmatically process results.
 *
 * @example
 * ```typescript
 * import { createToolchainServer, startToolchainServer } from './servers/toolchain';
 *
 * // Create server instance for testing
 * const server = createToolchainServer({ projectRoot: '/path/to/project' });
 *
 * // Or start as standalone MCP server
 * await startToolchainServer({ projectRoot: '/path/to/project' });
 * ```
 *
 * @packageDocumentation
 */

export { createToolchainServer, startToolchainServer } from './server.js';

export {
  // Config
  type ToolchainServerConfig,
  type ToolchainLanguage,

  // verify_structure types
  type VerifyStructureInput,
  type VerifyStructureResult,
  type StructuralError,

  // run_function_test types
  type RunFunctionTestInput,
  type RunFunctionTestResult,
  type TestResult,
  type CoverageInfo,
  type FileCoverage,

  // check_complexity types
  type CheckComplexityInput,
  type CheckComplexityResult,
  type FunctionComplexity,
  type ComplexitySummary,

  // Errors
  ToolchainNotInstalledError,
  ToolExecutionError,
  OutputParseError,
} from './types.js';
