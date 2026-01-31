/**
 * Interview state types for the Ignition phase.
 *
 * Defines the state representation for the interview process,
 * including phases, extracted requirements, and delegation points.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

/**
 * Feature classification determines how a feature is handled in Lattice.
 *
 * @remarks
 * - Core: Full implementation in Lattice phase
 * - Foundational: Skeleton/extension points in Lattice (e.g., tenant_id in schema even if not used in MVP)
 * - Bolt-on: Not in Lattice, documented for future implementation
 */
export type FeatureClassification = 'core' | 'foundational' | 'bolt-on';

/**
 * Array of all valid feature classifications.
 */
export const FEATURE_CLASSIFICATIONS: readonly FeatureClassification[] = [
  'core',
  'foundational',
  'bolt-on',
] as const;

/**
 * A feature identified during the interview.
 */
export interface Feature {
  /** Unique identifier for the feature. */
  readonly id: string;
  /** Feature name/title. */
  readonly name: string;
  /** Description of the feature. */
  readonly description: string;
  /** Classification determining how the feature is handled in Lattice. */
  readonly classification: FeatureClassification;
  /** Phase where this feature was identified. */
  readonly sourcePhase: InterviewPhase;
  /** Timestamp when feature was identified (ISO 8601). */
  readonly identifiedAt: string;
  /** Optional rationale for the classification. */
  readonly classificationRationale?: string;
}

/**
 * Checks if a string is a valid FeatureClassification.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid FeatureClassification.
 */
export function isValidFeatureClassification(value: string): value is FeatureClassification {
  return FEATURE_CLASSIFICATIONS.includes(value as FeatureClassification);
}

/**
 * Interview phases in order of execution.
 *
 * @remarks
 * - Discovery: Initial requirements gathering
 * - Architecture: System design and structure
 * - Constraints: Functional and non-functional constraints
 * - DesignPreferences: User preferences for implementation details
 * - Synthesis: Combining inputs into a coherent spec proposal
 * - Approval: User review and approval of the final spec
 */
export type InterviewPhase =
  | 'Discovery'
  | 'Architecture'
  | 'Constraints'
  | 'DesignPreferences'
  | 'Synthesis'
  | 'Approval';

/**
 * Array of all interview phases in execution order.
 * Useful for iteration and validation.
 */
export const INTERVIEW_PHASES: readonly InterviewPhase[] = [
  'Discovery',
  'Architecture',
  'Constraints',
  'DesignPreferences',
  'Synthesis',
  'Approval',
] as const;

/**
 * Delegation decision type.
 *
 * @remarks
 * - Continue: User continues providing input
 * - Delegate: User delegates decisions to the Architect
 * - DelegateWithNotes: User delegates with additional context
 */
export type DelegationDecision = 'Continue' | 'Delegate' | 'DelegateWithNotes';

/**
 * A delegation point where the user chose to delegate.
 */
export interface DelegationPoint {
  /** The phase where delegation occurred. */
  readonly phase: InterviewPhase;
  /** The type of delegation decision. */
  readonly decision: DelegationDecision;
  /** Optional notes provided with delegation. */
  readonly notes?: string;
  /** Timestamp when delegation was made (ISO 8601). */
  readonly delegatedAt: string;
}

/**
 * An extracted requirement from the interview.
 */
export interface ExtractedRequirement {
  /** Unique identifier for the requirement. */
  readonly id: string;
  /** The phase from which this requirement was extracted. */
  readonly sourcePhase: InterviewPhase;
  /** Category of the requirement. */
  readonly category: 'functional' | 'non_functional' | 'constraint' | 'preference';
  /** The requirement text. */
  readonly text: string;
  /** Confidence level of extraction. */
  readonly confidence: 'high' | 'medium' | 'low';
  /** Timestamp when requirement was extracted (ISO 8601). */
  readonly extractedAt: string;
}

/**
 * Message role in the interview transcript.
 */
export type TranscriptRole = 'system' | 'assistant' | 'user';

/**
 * A single entry in the interview transcript.
 */
export interface TranscriptEntry {
  /** Unique identifier for the entry. */
  readonly id: string;
  /** The interview phase during which this entry was made. */
  readonly phase: InterviewPhase;
  /** Role of the message sender. */
  readonly role: TranscriptRole;
  /** The message content. */
  readonly content: string;
  /** Timestamp of the entry (ISO 8601). */
  readonly timestamp: string;
  /** Optional metadata for the entry. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Complete interview state.
 *
 * @remarks
 * This type represents the full state of an interview session,
 * designed to be persisted and resumed across process restarts.
 *
 * @example
 * ```typescript
 * const state: InterviewState = {
 *   version: '1.0.0',
 *   projectId: 'my-project',
 *   currentPhase: 'Architecture',
 *   completedPhases: ['Discovery'],
 *   extractedRequirements: [
 *     {
 *       id: 'req_001',
 *       sourcePhase: 'Discovery',
 *       category: 'functional',
 *       text: 'User authentication required',
 *       confidence: 'high',
 *       extractedAt: '2024-01-15T10:30:00Z'
 *     }
 *   ],
 *   features: [],
 *   delegationPoints: [],
 *   transcriptEntryCount: 0,
 *   createdAt: '2024-01-15T10:00:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z'
 * };
 * ```
 */
export interface InterviewState {
  /** Schema version for future compatibility. */
  readonly version: string;
  /** Unique project identifier. */
  readonly projectId: string;
  /** Current interview phase. */
  readonly currentPhase: InterviewPhase;
  /** List of completed phases. */
  readonly completedPhases: readonly InterviewPhase[];
  /** Requirements extracted from the interview. */
  readonly extractedRequirements: readonly ExtractedRequirement[];
  /** Features identified with their classifications. */
  readonly features: readonly Feature[];
  /** Points where user delegated to the Architect. */
  readonly delegationPoints: readonly DelegationPoint[];
  /** Reference to transcript (entries stored in separate JSONL file). */
  readonly transcriptEntryCount: number;
  /** Timestamp when interview was created (ISO 8601). */
  readonly createdAt: string;
  /** Timestamp when interview was last updated (ISO 8601). */
  readonly updatedAt: string;
}

/**
 * Current schema version for persisted interview state.
 */
export const INTERVIEW_STATE_VERSION = '1.0.0';

/**
 * Checks if a string is a valid InterviewPhase.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid InterviewPhase.
 */
export function isValidInterviewPhase(value: string): value is InterviewPhase {
  return INTERVIEW_PHASES.includes(value as InterviewPhase);
}

/**
 * Gets the index of a phase in the execution order.
 *
 * @param phase - The phase to look up.
 * @returns The zero-based index of the phase.
 */
export function getInterviewPhaseIndex(phase: InterviewPhase): number {
  return INTERVIEW_PHASES.indexOf(phase);
}

/**
 * Gets the next phase after the given phase.
 *
 * @param phase - The current phase.
 * @returns The next phase, or undefined if at the last phase.
 */
export function getNextInterviewPhase(phase: InterviewPhase): InterviewPhase | undefined {
  const currentIndex = getInterviewPhaseIndex(phase);
  const nextPhase = INTERVIEW_PHASES[currentIndex + 1];
  return nextPhase;
}

/**
 * Checks if an interview is complete.
 *
 * @param state - The interview state to check.
 * @returns True if the interview has completed the Approval phase.
 */
export function isInterviewComplete(state: InterviewState): boolean {
  return state.completedPhases.includes('Approval');
}

/**
 * Creates an initial interview state for a new project.
 *
 * @param projectId - Unique identifier for the project.
 * @returns A new InterviewState at the beginning of the interview.
 */
export function createInitialInterviewState(projectId: string): InterviewState {
  const now = new Date().toISOString();
  return {
    version: INTERVIEW_STATE_VERSION,
    projectId,
    currentPhase: 'Discovery',
    completedPhases: [],
    extractedRequirements: [],
    features: [],
    delegationPoints: [],
    transcriptEntryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a new feature.
 *
 * @param name - Feature name.
 * @param description - Feature description.
 * @param classification - Feature classification.
 * @param sourcePhase - Phase where the feature was identified.
 * @param rationale - Optional rationale for the classification.
 * @returns A new Feature.
 */
export function createFeature(
  name: string,
  description: string,
  classification: FeatureClassification,
  sourcePhase: InterviewPhase,
  rationale?: string
): Feature {
  const base: Feature = {
    id: `feature_${randomUUID()}`,
    name,
    description,
    classification,
    sourcePhase,
    identifiedAt: new Date().toISOString(),
  };

  if (rationale !== undefined) {
    return { ...base, classificationRationale: rationale };
  }

  return base;
}

/**
 * Gets features that need classification (have no classification yet).
 * This is used to detect unclassified features that need prompting.
 *
 * @param features - The features to check.
 * @returns Features that are missing classification.
 */
export function getUnclassifiedFeatures(features: readonly Feature[]): readonly Feature[] {
  // All features should have a classification, but this guards against future changes
  return features.filter((f) => !isValidFeatureClassification(f.classification));
}

/**
 * Gets features by classification.
 *
 * @param features - The features to filter.
 * @param classification - The classification to filter by.
 * @returns Features matching the classification.
 */
export function getFeaturesByClassification(
  features: readonly Feature[],
  classification: FeatureClassification
): readonly Feature[] {
  return features.filter((f) => f.classification === classification);
}

/**
 * Creates a transcript entry.
 *
 * @param phase - The interview phase.
 * @param role - The message role.
 * @param content - The message content.
 * @param metadata - Optional metadata.
 * @returns A new TranscriptEntry.
 */
export function createTranscriptEntry(
  phase: InterviewPhase,
  role: TranscriptRole,
  content: string,
  metadata?: Record<string, unknown>
): TranscriptEntry {
  const base = {
    id: `transcript_${randomUUID()}`,
    phase,
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  if (metadata !== undefined) {
    return { ...base, metadata };
  }

  return base;
}
