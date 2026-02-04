/**
 * Mesoscopic phase module for cluster definition and integration testing.
 *
 * Groups modules into testable clusters based on spec relationships
 * and shared claims for scoped integration testing.
 *
 * @packageDocumentation
 */

export { defineClusters, validateClusterResult } from './cluster-definer.js';

export type {
  Module,
  ClusterDefinition,
  ClusterDefinitionResult,
  ClusterDefinitionOptions,
} from './types.js';

export { ClusterDefinitionError } from './types.js';

export {
  generateSpecDrivenTests,
  SpecDrivenTestOptions,
  SpecDrivenTestError,
} from './spec-driven-test-generator.js';

export {
  executeClusters,
  ClusterExecutionOptions,
  ClusterExecutionResult,
  ClusterExecutionSummary,
  ClaimResult,
  ClaimStatus,
  InfrastructureFailure,
  InfrastructureFailureType,
  ClusterExecutionError,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
} from './cluster-executor.js';

export type {
  ClusterVerdict,
  VerdictOptions,
  VerdictResult,
  FunctionToReinject,
} from './verdict-handler.js';

export {
  handleClusterVerdict,
  processClusterVerdict,
  recordViolatedClaimsInLedger,
} from './verdict-handler.js';
