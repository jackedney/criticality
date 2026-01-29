/**
 * Injection module - Ralph Loop for atomic function implementation.
 *
 * @packageDocumentation
 */

export {
  RalphLoop,
  createRalphLoop,
  generateImplementationPrompt,
  parseImplementationResponse,
  extractRequiredTypes,
  extractWitnessTypes,
  buildFunctionContext,
  buildExtractedContext,
  formatRalphLoopReport,
  type FunctionContext,
  type ImplementationAttempt,
  type RalphLoopResult,
  type RalphLoopOptions,
} from './ralph-loop.js';

export {
  extractContext,
  serializeContextForPrompt,
  shouldEscalateToLargerModel,
  type ExtractedContext,
  type ExtractedTypeDefinition,
  type ContextSizeMetrics,
  type ContextExtractionOptions,
} from './context-extractor.js';

export {
  generateMinimalPrompt,
  generateMinimalPromptFromComponents,
  estimateTokenCount,
  shouldTriggerModelUpgrade,
  DEFAULT_TOKEN_LIMIT,
  type MinimalPromptResult,
  type MinimalPromptOptions,
} from './prompt-generator.js';

export {
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
  type FunctionTestOptions,
} from './test-executor.js';

export {
  // Security scanning
  runSecurityScan,
  securityScanToFailure,
  formatVulnerability,
  formatSecurityScanReport,
  // Types and constants
  OWASP_TOP_10,
  CWE_MAPPINGS,
  type VulnerabilityDetails,
  type SecurityScanResult,
  type SecurityScanOptions,
  type VulnerabilitySeverity,
} from './security-scanner.js';

export {
  // Configuration
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  // State creation
  createCircuitBreakerState,
  createFunctionState,
  // State updates
  registerFunction,
  recordAttemptStart,
  recordSuccess,
  recordEscalation,
  recordFailure,
  // Circuit checking
  checkCircuitBreaker,
  tripCircuit,
  addWarnings,
  // Statistics
  computeStatistics,
  computeModuleStatistics,
  // Report generation
  generateStructuralDefectReport,
  // Formatting
  formatTripReason,
  formatStructuralDefectReport,
  // High-level class
  CircuitBreaker,
  createCircuitBreaker,
  // Types
  type CircuitBreakerConfig,
  type CircuitTripReason,
  type CircuitWarning,
  type FunctionStatus,
  type FunctionState,
  type CircuitBreakerState,
  type CircuitCheckResult,
  type StructuralDefect,
  type StructuralDefectReport,
  type ModuleSummary,
  type CircuitStatistics,
} from './circuit-breaker.js';
