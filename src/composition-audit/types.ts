/**
 * Types for the Composition Audit phase.
 *
 * Defines contradiction types and reports for detecting impossible compositions
 * before the Injection phase begins.
 *
 * @packageDocumentation
 */

import type { SpecClaim, SpecConstraints } from '../spec/types.js';
import type { GeneratedContract } from '../lattice/contract-attacher.js';
import type { WitnessCodeResult } from '../lattice/witness-generator.js';

/**
 * Types of contradictions the audit can detect.
 *
 * - temporal: Time-related conflicts (e.g., session expires 30min + operation takes 2hrs)
 * - resource: Resource allocation conflicts (e.g., connections/capacity limits)
 * - invariant: State requirements that cannot be simultaneously satisfied
 * - precondition_gap: Missing prerequisites that operations depend on
 * - postcondition_conflict: Postconditions that conflict with other constraints
 */
export type ContradictionType =
  | 'temporal'
  | 'resource'
  | 'invariant'
  | 'precondition_gap'
  | 'postcondition_conflict';

/**
 * All contradiction types as an array.
 */
export const CONTRADICTION_TYPES: readonly ContradictionType[] = Object.freeze([
  'temporal',
  'resource',
  'invariant',
  'precondition_gap',
  'postcondition_conflict',
] as const);

/**
 * Severity levels for contradictions.
 *
 * - critical: Must be resolved before proceeding to Injection
 * - warning: Should be reviewed but may be acceptable
 */
export type ContradictionSeverity = 'critical' | 'warning';

/**
 * A reference to a specific constraint, contract, or witness involved in a contradiction.
 */
export interface InvolvedElement {
  /** The type of element. */
  readonly elementType: 'constraint' | 'contract' | 'witness' | 'claim';
  /** Unique identifier for the element. */
  readonly id: string;
  /** Human-readable name or description. */
  readonly name: string;
  /** The relevant text or expression from the element. */
  readonly text: string;
  /** Location in the spec or code (if applicable). */
  readonly location?: string;
}

/**
 * A detected contradiction between spec elements.
 */
export interface Contradiction {
  /** Unique identifier for this contradiction. */
  readonly id: string;
  /** The type of contradiction. */
  readonly type: ContradictionType;
  /** Severity of the contradiction. */
  readonly severity: ContradictionSeverity;
  /** Human-readable description of the conflict. */
  readonly description: string;
  /** Elements involved in the contradiction. */
  readonly involved: readonly InvolvedElement[];
  /** Detailed analysis explaining why this is a contradiction. */
  readonly analysis: string;
  /** A minimal scenario demonstrating the contradiction. */
  readonly minimalScenario: string;
  /** Suggested resolutions for the contradiction. */
  readonly suggestedResolutions: readonly string[];
}

/**
 * Input for contradiction detection.
 *
 * Contains only spec constraints, function contracts, and type witnesses.
 * Implementation bodies are explicitly excluded per the protocol.
 */
export interface CompositionAuditInput {
  /** Spec constraints by category. */
  readonly constraints: SpecConstraints;
  /** Function contracts from Lattice phase. */
  readonly contracts: readonly GeneratedContract[];
  /** Type witness definitions from Lattice phase. */
  readonly witnesses: readonly WitnessCodeResult[];
  /** Spec claims for verification. */
  readonly claims: Record<string, SpecClaim>;
}

/**
 * Result of a composition audit.
 */
export interface CompositionAuditResult {
  /** Whether any contradictions were found. */
  readonly hasContradictions: boolean;
  /** Detected contradictions. */
  readonly contradictions: readonly Contradiction[];
  /** Whether there are critical contradictions that block proceeding. */
  readonly hasCriticalContradictions: boolean;
  /** Summary of the audit. */
  readonly summary: string;
  /** Timestamp of the audit. */
  readonly auditedAt: string;
  /** Whether cross-verification was performed. */
  readonly crossVerified: boolean;
}

/**
 * Options for the composition audit.
 */
export interface CompositionAuditOptions {
  /** Whether to use architect_model for cross-verification on complex cases. Default: true. */
  readonly enableCrossVerification?: boolean;
  /** Threshold for considering a case "complex" requiring cross-verification. Default: 3. */
  readonly complexityThreshold?: number;
  /** Timeout for LLM calls in milliseconds. Default: 120000. */
  readonly timeoutMs?: number;
  /** Custom logger for warnings. */
  readonly logger?: (message: string) => void;
}

/**
 * Cross-verification result from architect_model.
 */
export interface CrossVerificationResult {
  /** The contradiction ID being verified. */
  readonly contradictionId: string;
  /** Whether the architect confirmed the contradiction. */
  readonly confirmed: boolean;
  /** The architect's analysis. */
  readonly analysis: string;
  /** Additional context or refinements. */
  readonly refinement?: string;
  /** Whether the severity should be adjusted. */
  readonly adjustedSeverity?: ContradictionSeverity;
}

/**
 * Type guard to check if a value is a valid ContradictionType.
 *
 * @param value - The value to check.
 * @returns True if the value is a valid ContradictionType.
 */
export function isValidContradictionType(value: string): value is ContradictionType {
  return CONTRADICTION_TYPES.includes(value as ContradictionType);
}

/**
 * Descriptions for each contradiction type.
 */
export const CONTRADICTION_TYPE_DESCRIPTIONS: Readonly<Record<ContradictionType, string>> = {
  temporal: 'Time-related conflicts where durations, timeouts, or schedules contradict each other',
  resource:
    'Resource allocation conflicts where capacity, connections, or concurrent access limits conflict',
  invariant:
    'State requirements that cannot be simultaneously satisfied across multiple constraints',
  precondition_gap:
    'Missing prerequisites or assumptions that operations depend on but are not guaranteed',
  postcondition_conflict:
    'Postconditions of one operation that conflict with constraints or preconditions of another',
};

/**
 * A structured contradiction report for storage and programmatic handling.
 *
 * This is the main output type for contradiction detection, designed to be
 * persisted to disk and processed by downstream phases.
 */
export interface ContradictionReport {
  /** Unique report identifier. */
  readonly id: string;
  /** Project identifier this report belongs to. */
  readonly projectId: string;
  /** Version of the report format. */
  readonly version: string;
  /** When the report was generated. */
  readonly generatedAt: string;
  /** Summary of findings. */
  readonly summary: string;
  /** Whether cross-verification was performed. */
  readonly crossVerified: boolean;
  /** Statistics about the audit. */
  readonly stats: ContradictionReportStats;
  /** The detected contradictions. */
  readonly contradictions: readonly Contradiction[];
}

/**
 * Statistics for a contradiction report.
 */
export interface ContradictionReportStats {
  /** Total number of contradictions found. */
  readonly total: number;
  /** Number of critical contradictions. */
  readonly critical: number;
  /** Number of warning-level contradictions. */
  readonly warning: number;
  /** Count by contradiction type. */
  readonly byType: Readonly<Record<ContradictionType, number>>;
}

/**
 * Error type for contradiction report parsing operations.
 */
export type ContradictionReportParseErrorType =
  | 'parse_error'
  | 'schema_error'
  | 'validation_error'
  | 'malformed_output'
  | 'retry_exhausted';

/**
 * Error class for contradiction report parsing errors.
 */
export class ContradictionReportParseError extends Error {
  /** The type of parse error. */
  public readonly errorType: ContradictionReportParseErrorType;
  /** Additional details about the error. */
  public readonly details: string | undefined;
  /** The raw content that failed to parse. */
  public readonly rawContent: string | undefined;
  /** Number of retry attempts made. */
  public readonly retryAttempts: number;

  /**
   * Creates a new ContradictionReportParseError.
   *
   * @param message - Human-readable error message.
   * @param errorType - The type of parse error.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    errorType: ContradictionReportParseErrorType,
    options?: {
      details?: string | undefined;
      rawContent?: string | undefined;
      retryAttempts?: number | undefined;
    }
  ) {
    super(message);
    this.name = 'ContradictionReportParseError';
    this.errorType = errorType;
    this.details = options?.details;
    this.rawContent = options?.rawContent;
    this.retryAttempts = options?.retryAttempts ?? 0;
  }
}

/**
 * Options for parsing LLM contradiction output.
 */
export interface ContradictionParseOptions {
  /** Maximum retry attempts on malformed output. Default: 2. */
  readonly maxRetries?: number;
  /** Whether to attempt YAML parsing if JSON fails. Default: true. */
  readonly tryYaml?: boolean;
  /** Custom logger for warnings. */
  readonly logger?: (message: string) => void;
  /** Timeout for model prompts in milliseconds. Default: 120000 (2 minutes). */
  readonly timeoutMs?: number;
}

/**
 * Result of parsing LLM contradiction output.
 */
export type ContradictionParseResult =
  | { success: true; contradictions: Contradiction[]; summary: string; hasContradictions: boolean }
  | { success: false; error: ContradictionReportParseError };

/**
 * Options for storing contradiction reports.
 */
export interface ContradictionReportStorageOptions {
  /** Format for storing the report. Default: 'json'. */
  readonly format?: 'json' | 'yaml';
  /** Pretty-print the output. Default: true. */
  readonly pretty?: boolean;
}
