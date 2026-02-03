/**
 * Types for Mesoscopic phase cluster definition.
 *
 * Defines types for grouping modules into testable clusters
 * based on spec relationships and shared claims.
 *
 * @packageDocumentation
 */

/**
 * Represents a module in the system.
 *
 * A module is derived from spec data models and interfaces,
 * representing a cohesive unit of functionality.
 */
export interface Module {
  /** Unique identifier for the module. */
  readonly id: string;
  /** Human-readable name of the module. */
  readonly name: string;
  /** Data models belonging to this module. */
  readonly dataModels: readonly string[];
  /** Interfaces belonging to this module. */
  readonly interfaces: readonly string[];
  /** Claims that reference this module. */
  readonly claimIds: readonly string[];
}

/**
 * Represents a testable cluster of modules.
 *
 * Clusters group modules that are related through shared claims
 * or integration scenarios for scoped testing.
 */
export interface ClusterDefinition {
  /** Unique identifier for the cluster. */
  readonly id: string;
  /** Human-readable name of the cluster. */
  readonly name: string;
  /** Modules included in this cluster. */
  readonly modules: readonly string[];
  /** Claims to be tested in this cluster. */
  readonly claimIds: readonly string[];
  /** Whether this is a cross-module integration cluster. */
  readonly isCrossModule: boolean;
}

/**
 * Result of cluster definition generation.
 */
export interface ClusterDefinitionResult {
  /** All generated cluster definitions. */
  readonly clusters: readonly ClusterDefinition[];
  /** All modules discovered (including orphans). */
  readonly modules: readonly Module[];
  /** All claims that were assigned to clusters. */
  readonly assignedClaimIds: readonly string[];
  /** Claims that were not assigned to any cluster. */
  readonly unassignedClaimIds: readonly string[];
  /** Number of orphan modules (no claims). */
  readonly orphanCount: number;
}

/**
 * Options for cluster definition generation.
 */
export interface ClusterDefinitionOptions {
  /** Minimum number of claims required for a module to form a cluster. */
  readonly minClaimsPerModule?: number;
  /** Whether to create single-module clusters for orphans. */
  readonly createOrphanClusters?: boolean;
  /** Whether to create cross-module integration clusters. */
  readonly createCrossModuleClusters?: boolean;
}

/**
 * Error codes for cluster definition generation.
 */
export type ClusterDefinitionErrorCode =
  | 'SPEC_PARSE_ERROR'
  | 'MODULE_EXTRACTION_ERROR'
  | 'CLAIM_ANALYSIS_ERROR';

/**
 * Error class for cluster definition generation errors.
 */
export class ClusterDefinitionError extends Error {
  /** The error code for programmatic handling. */
  public readonly code: ClusterDefinitionErrorCode;
  /** Additional details about the error. */
  public readonly details?: string;

  constructor(message: string, code: ClusterDefinitionErrorCode, details?: string) {
    super(message);
    this.name = 'ClusterDefinitionError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
