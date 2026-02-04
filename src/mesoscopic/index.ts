/**
 * Mesoscopic phase exports.
 *
 * Exports cluster definition, execution, and verdict handling
 * for the Mesoscopic testing phase.
 *
 * @packageDocumentation
 */

export {
  handleClusterVerdict,
  recordViolatedClaimsInLedger,
  processClusterVerdict,
  type ClusterVerdict,
  type FunctionToReinject,
  type VerdictOptions,
  type VerdictResult,
  type FunctionClaimEntry,
  type FunctionClaimMapping,
} from './verdict-handler.js';

export { defineClusters, validateClusterResult } from './cluster-definer.js';
export {
  type Module,
  type ClusterDefinition,
  type ClusterDefinitionResult,
  type ClusterDefinitionOptions,
  type ClusterDefinitionErrorCode,
  ClusterDefinitionError,
} from './types.js';

export {
  executeClusters,
  type ClaimResult,
  type ClusterExecutionResult,
  type ClusterExecutionOptions,
} from './cluster-executor.js';

export {
  generateSpecDrivenTests,
  DEFAULT_TIMEOUT,
  REGRESSION_THRESHOLD,
  type SpecDrivenTestOptions,
  type PerformanceBaseline,
  type RegressionResult,
  type SpecDrivenTestErrorCode,
  SpecDrivenTestError,
} from './spec-driven-test-generator.js';
