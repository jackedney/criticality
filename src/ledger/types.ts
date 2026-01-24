/**
 * Decision Ledger types matching ledger.schema.json.
 *
 * @packageDocumentation
 */

/**
 * Decision categories as defined in the schema.
 */
export type DecisionCategory =
  | 'architectural'
  | 'phase_structure'
  | 'injection'
  | 'ledger'
  | 'type_witnesses'
  | 'contracts'
  | 'models'
  | 'blocking'
  | 'testing'
  | 'orchestrator'
  | 'language_support'
  | 'data_model'
  | 'interface'
  | 'constraint'
  | 'security';

/**
 * Source of a decision as defined in the schema.
 */
export type DecisionSource =
  | 'user_explicit'
  | 'design_principle'
  | 'original_design'
  | 'discussion'
  | 'design_choice'
  | 'design_review'
  | 'injection_failure'
  | 'auditor_contradiction'
  | 'composition_audit'
  | 'mesoscopic_failure'
  | 'human_resolution';

/**
 * Confidence level determining override rules.
 */
export type ConfidenceLevel =
  | 'canonical'
  | 'delegated'
  | 'inferred'
  | 'provisional'
  | 'suspended'
  | 'blocking';

/**
 * Decision status for hybrid append-only model.
 */
export type DecisionStatus = 'active' | 'superseded' | 'invalidated';

/**
 * Protocol phase in which a decision was made.
 */
export type DecisionPhase =
  | 'design'
  | 'ignition'
  | 'lattice'
  | 'composition_audit'
  | 'injection'
  | 'mesoscopic'
  | 'mass_defect';

/**
 * A decision entry in the ledger.
 */
export interface Decision {
  /** Unique decision identifier (format: category_NNN). */
  id: string;
  /** When the decision was made (ISO 8601). */
  timestamp: string;
  /** Decision category. */
  category: DecisionCategory;
  /** The actual decision/constraint (WHAT, not WHY). */
  constraint: string;
  /** Explanation of why this decision was made. */
  rationale?: string;
  /** Origin of the decision. */
  source: DecisionSource;
  /** Confidence level determining override rules. */
  confidence: ConfidenceLevel;
  /** Entry status for hybrid append-only model. */
  status: DecisionStatus;
  /** Phase in which the decision was made. */
  phase: DecisionPhase;
  /** IDs of decisions this depends on. */
  dependencies?: string[];
  /** IDs of decisions this supersedes. */
  supersedes?: string[];
  /** ID of decision that superseded this one. */
  superseded_by?: string;
  /** For inferred decisions: what failure led to this. */
  failure_context?: string;
  /** For resolved contradictions: explanation. */
  contradiction_resolved?: string;
  /** For human resolutions: the query that prompted this. */
  human_query_id?: string;
}

/**
 * Ledger metadata.
 */
export interface LedgerMeta {
  /** Schema version. */
  version: string;
  /** When the ledger was created (ISO 8601). */
  created: string;
  /** Project identifier. */
  project: string;
  /** Last modification timestamp (ISO 8601). */
  last_modified?: string;
}

/**
 * Complete ledger structure matching ledger.schema.json.
 */
export interface LedgerData {
  /** Ledger metadata. */
  meta: LedgerMeta;
  /** Ordered list of decisions (append-only). */
  decisions: Decision[];
}

/**
 * Input for creating a new decision.
 * ID, timestamp, and status are auto-generated.
 */
export interface DecisionInput {
  /** Decision category. */
  category: DecisionCategory;
  /** The actual decision/constraint (WHAT, not WHY). */
  constraint: string;
  /** Explanation of why this decision was made. */
  rationale?: string;
  /** Origin of the decision. */
  source: DecisionSource;
  /** Confidence level determining override rules. */
  confidence: ConfidenceLevel;
  /** Phase in which the decision was made. */
  phase: DecisionPhase;
  /** IDs of decisions this depends on. */
  dependencies?: string[];
  /** IDs of decisions this supersedes. */
  supersedes?: string[];
  /** For inferred decisions: what failure led to this. */
  failure_context?: string;
  /** For resolved contradictions: explanation. */
  contradiction_resolved?: string;
  /** For human resolutions: the query that prompted this. */
  human_query_id?: string;
}

/**
 * Valid filter keys for querying decisions.
 */
export type DecisionFilterKey = 'category' | 'phase' | 'status' | 'confidence';

/**
 * Filter options for querying decisions.
 * All filters are combined with AND logic.
 */
export interface DecisionFilter {
  /** Filter by decision category. */
  category?: DecisionCategory;
  /** Filter by decision phase. */
  phase?: DecisionPhase;
  /** Filter by decision status. */
  status?: DecisionStatus;
  /** Filter by confidence level. */
  confidence?: ConfidenceLevel;
}

/**
 * Options for querying decision history.
 */
export interface HistoryQueryOptions {
  /** Include decisions that have been superseded. Default: true */
  includeSuperseded?: boolean;
  /** Include decisions that have been invalidated. Default: true */
  includeInvalidated?: boolean;
}

/**
 * Options for querying decisions by dependency graph.
 */
export interface DependencyGraphQueryOptions {
  /** Include all transitive dependencies (ancestors). Default: false */
  includeTransitiveDependencies?: boolean;
  /** Include all transitive dependents (descendants). Default: false */
  includeTransitiveDependents?: boolean;
}

/**
 * Result of a dependency graph query.
 */
export interface DependencyGraphResult {
  /** The decision being queried. */
  decision: Decision;
  /** Direct dependencies (decisions this one depends on). */
  directDependencies: Decision[];
  /** Direct dependents (decisions that depend on this one). */
  directDependents: Decision[];
  /** All transitive dependencies if requested. */
  transitiveDependencies?: Decision[];
  /** All transitive dependents if requested. */
  transitiveDependents?: Decision[];
}
