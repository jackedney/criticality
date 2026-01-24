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
