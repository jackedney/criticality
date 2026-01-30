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
  ClusterDefinitionError,
} from './types.js';

export {
  generateSpecDrivenTests,
  SpecDrivenTestOptions,
  SpecDrivenTestError,
} from './spec-driven-test-generator.js';
