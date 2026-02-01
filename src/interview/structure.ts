/**
 * Interview structure implementation for the Ignition phase.
 *
 * Implements the 6-phase interview process:
 * - Discovery (required): Initial requirements gathering
 * - Architecture (required): System design and structure
 * - Constraints (delegable): Functional and non-functional constraints
 * - DesignPreferences (delegable): User preferences for implementation details
 * - Synthesis: Combining inputs into a coherent spec proposal
 * - Approval: User review and approval of the final spec
 *
 * @packageDocumentation
 */

import type {
  InterviewPhase,
  InterviewState,
  DelegationDecision,
  DelegationPoint,
  ExtractedRequirement,
  TranscriptEntry,
  Feature,
  FeatureClassification,
} from './types.js';
import {
  createTranscriptEntry,
  getNextInterviewPhase,
  INTERVIEW_PHASES,
  FEATURE_CLASSIFICATIONS,
  isValidFeatureClassification,
} from './types.js';
import type { Ledger } from '../ledger/ledger.js';
import type { DecisionInput, ConfidenceLevel } from '../ledger/types.js';

/**
 * Phases that are required and cannot be delegated.
 */
export const REQUIRED_PHASES: readonly InterviewPhase[] = ['Discovery', 'Architecture'] as const;

/**
 * Phases that support delegation to the Architect.
 */
export const DELEGABLE_PHASES: readonly InterviewPhase[] = [
  'Constraints',
  'DesignPreferences',
] as const;

/**
 * Checks if a phase is required (cannot be delegated).
 *
 * @param phase - The phase to check.
 * @returns True if the phase is required.
 */
export function isRequiredPhase(phase: InterviewPhase): boolean {
  return (REQUIRED_PHASES as readonly string[]).includes(phase);
}

/**
 * Checks if a phase supports delegation.
 *
 * @param phase - The phase to check.
 * @returns True if the phase can be delegated.
 */
export function isDelegablePhase(phase: InterviewPhase): boolean {
  return (DELEGABLE_PHASES as readonly string[]).includes(phase);
}

/**
 * Approval decision options for the Approval phase.
 */
export type ApprovalDecision = 'Approve' | 'ApproveWithConditions' | 'RejectWithFeedback';

/**
 * Array of valid approval decisions.
 */
export const APPROVAL_DECISIONS: readonly ApprovalDecision[] = [
  'Approve',
  'ApproveWithConditions',
  'RejectWithFeedback',
] as const;

/**
 * Checks if a string is a valid ApprovalDecision.
 *
 * @param value - The value to check.
 * @returns True if the value is a valid ApprovalDecision.
 */
export function isValidApprovalDecision(value: string): value is ApprovalDecision {
  return APPROVAL_DECISIONS.includes(value as ApprovalDecision);
}

/**
 * Confirmation item for Approval phase.
 * These items must be explicitly confirmed before approval.
 */
export type ConfirmationItem =
  | 'system_boundaries'
  | 'data_models'
  | 'key_constraints'
  | 'testable_claims';

/**
 * Array of all confirmation items required for approval.
 */
export const CONFIRMATION_ITEMS: readonly ConfirmationItem[] = [
  'system_boundaries',
  'data_models',
  'key_constraints',
  'testable_claims',
] as const;

/**
 * Approval response from the user.
 */
export interface ApprovalResponse {
  /** The approval decision. */
  readonly decision: ApprovalDecision;
  /** For ApproveWithConditions: the conditions to be met. */
  readonly conditions?: readonly string[];
  /** For RejectWithFeedback: the feedback for revision. */
  readonly feedback?: string;
  /** Confirmation status for each required item. */
  readonly confirmations: Readonly<Record<ConfirmationItem, boolean>>;
}

/**
 * Phase-specific question for the interview.
 */
export interface InterviewQuestion {
  /** Unique identifier for the question. */
  readonly id: string;
  /** The phase this question belongs to. */
  readonly phase: InterviewPhase;
  /** The question text. */
  readonly text: string;
  /** Optional hints or examples for the user. */
  readonly hints?: readonly string[];
  /** Whether this question supports multi-value responses. */
  readonly multiValue: boolean;
  /** Category for the extracted requirement. */
  readonly category: 'functional' | 'non_functional' | 'constraint' | 'preference';
}

/**
 * Response to an interview question.
 */
export interface QuestionResponse {
  /** The question ID being answered. */
  readonly questionId: string;
  /** The user's response text. */
  readonly response: string;
  /** Optional additional notes. */
  readonly notes?: string;
}

/**
 * Delegation response for delegable phases.
 */
export interface DelegationResponse {
  /** The delegation decision. */
  readonly decision: DelegationDecision;
  /** For DelegateWithNotes: the notes to include. */
  readonly notes?: string;
}

/**
 * Result of phase completion.
 */
export interface PhaseCompletionResult {
  /** Whether the phase was completed successfully. */
  readonly completed: boolean;
  /** Whether the phase was delegated. */
  readonly delegated: boolean;
  /** Extracted requirements from this phase. */
  readonly requirements: readonly ExtractedRequirement[];
  /** The delegation point if delegated. */
  readonly delegationPoint?: DelegationPoint;
  /** Error message if not completed. */
  readonly error?: string;
}

/**
 * Detected contradiction between requirements.
 */
export interface Contradiction {
  /** Unique identifier for the contradiction. */
  readonly id: string;
  /** IDs of the conflicting requirements. */
  readonly requirementIds: readonly string[];
  /** Description of the contradiction. */
  readonly description: string;
  /** Suggested resolution options. */
  readonly suggestedResolutions: readonly string[];
  /** Severity level. */
  readonly severity: 'critical' | 'warning';
}

/**
 * Result of contradiction detection.
 */
export interface ContradictionCheckResult {
  /** Whether any contradictions were found. */
  readonly hasContradictions: boolean;
  /** List of detected contradictions. */
  readonly contradictions: readonly Contradiction[];
}

/**
 * State updates from an interview action.
 */
export interface InterviewStateUpdate {
  /** New requirements to add. */
  readonly newRequirements: readonly ExtractedRequirement[];
  /** New features to add. */
  readonly newFeatures: readonly Feature[];
  /** New transcript entries to add. */
  readonly transcriptEntries: readonly TranscriptEntry[];
  /** Delegation point if delegation occurred. */
  readonly delegationPoint?: DelegationPoint;
  /** New current phase (if advancing). */
  readonly nextPhase?: InterviewPhase;
  /** Phases to add to completed list. */
  readonly completedPhases: readonly InterviewPhase[];
}

/**
 * Creates a delegation point record.
 *
 * @param phase - The phase where delegation occurred.
 * @param decision - The delegation decision.
 * @param notes - Optional notes for DelegateWithNotes.
 * @returns A new DelegationPoint.
 */
export function createDelegationPoint(
  phase: InterviewPhase,
  decision: DelegationDecision,
  notes?: string
): DelegationPoint {
  const base: DelegationPoint = {
    phase,
    decision,
    delegatedAt: new Date().toISOString(),
  };

  if (notes !== undefined) {
    return { ...base, notes };
  }

  return base;
}

/**
 * Creates an extracted requirement.
 *
 * @param phase - The phase from which this requirement was extracted.
 * @param category - The category of the requirement.
 * @param text - The requirement text.
 * @param confidence - The confidence level.
 * @returns A new ExtractedRequirement.
 */
export function createExtractedRequirement(
  phase: InterviewPhase,
  category: ExtractedRequirement['category'],
  text: string,
  confidence: ExtractedRequirement['confidence']
): ExtractedRequirement {
  return {
    id: `req_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`,
    sourcePhase: phase,
    category,
    text,
    confidence,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Records a delegation decision in the DecisionLedger.
 *
 * @param ledger - The ledger to record to.
 * @param phase - The phase where delegation occurred.
 * @param decision - The delegation decision.
 * @param notes - Optional notes for the delegation.
 */
export function recordDelegationInLedger(
  ledger: Ledger,
  phase: InterviewPhase,
  decision: DelegationDecision,
  notes?: string
): void {
  const constraint =
    decision === 'Delegate'
      ? `User delegated ${phase} phase decisions to Architect`
      : `User delegated ${phase} phase decisions to Architect with notes: ${notes ?? ''}`;

  const input: DecisionInput = {
    category: 'interface',
    constraint,
    source: 'user_explicit',
    confidence: 'delegated' as ConfidenceLevel,
    phase: 'ignition',
  };

  if (notes !== undefined) {
    input.rationale = notes;
  }

  ledger.append(input);
}

/**
 * Records a conditional approval in the DecisionLedger.
 *
 * @param ledger - The ledger to record to.
 * @param conditions - The conditions for approval.
 */
export function recordConditionalApprovalInLedger(
  ledger: Ledger,
  conditions: readonly string[]
): void {
  for (const condition of conditions) {
    ledger.append({
      category: 'constraint',
      constraint: `Conditional approval requirement: ${condition}`,
      source: 'user_explicit',
      confidence: 'canonical',
      phase: 'ignition',
    });
  }
}

/**
 * Applies a state update to the interview state.
 *
 * @param state - The current interview state.
 * @param update - The update to apply.
 * @returns A new interview state with the update applied.
 */
export function applyStateUpdate(
  state: InterviewState,
  update: InterviewStateUpdate
): InterviewState {
  const now = new Date().toISOString();

  // Calculate new completed phases
  let completedPhases: readonly InterviewPhase[];
  if (update.completedPhases.length > 0) {
    const newCompleted = new Set(state.completedPhases);
    for (const phase of update.completedPhases) {
      newCompleted.add(phase);
    }
    completedPhases = [...newCompleted];
  } else {
    completedPhases = state.completedPhases;
  }

  // Calculate new delegation points
  const delegationPoints =
    update.delegationPoint !== undefined
      ? [...state.delegationPoints, update.delegationPoint]
      : state.delegationPoints;

  // Build the new state immutably
  return {
    version: state.version,
    projectId: state.projectId,
    currentPhase: update.nextPhase ?? state.currentPhase,
    completedPhases,
    extractedRequirements: [...state.extractedRequirements, ...update.newRequirements],
    features: [...state.features, ...update.newFeatures],
    delegationPoints,
    transcriptEntryCount: state.transcriptEntryCount + update.transcriptEntries.length,
    createdAt: state.createdAt,
    updatedAt: now,
  };
}

/**
 * Checks if all required confirmations are present in an approval response.
 *
 * @param response - The approval response to check.
 * @returns True if all required items are confirmed.
 */
export function hasAllRequiredConfirmations(response: ApprovalResponse): boolean {
  return CONFIRMATION_ITEMS.every((item) => response.confirmations[item]);
}

/**
 * Gets the missing confirmations from an approval response.
 *
 * @param response - The approval response to check.
 * @returns List of missing confirmation items.
 */
export function getMissingConfirmations(response: ApprovalResponse): ConfirmationItem[] {
  return CONFIRMATION_ITEMS.filter((item) => !response.confirmations[item]);
}

/**
 * Validates an approval response.
 *
 * @param response - The response to validate.
 * @returns Object with valid flag and any errors.
 */
export function validateApprovalResponse(response: ApprovalResponse): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  // Check for valid decision
  if (!isValidApprovalDecision(response.decision)) {
    errors.push(`Invalid approval decision: ${String(response.decision)}`);
  }

  // Check conditions for ApproveWithConditions
  if (response.decision === 'ApproveWithConditions') {
    if (response.conditions === undefined || response.conditions.length === 0) {
      errors.push('ApproveWithConditions requires at least one condition');
    }
  }

  // Check feedback for RejectWithFeedback
  if (response.decision === 'RejectWithFeedback') {
    if (response.feedback === undefined || response.feedback.trim() === '') {
      errors.push('RejectWithFeedback requires feedback');
    }
  }

  // Check confirmations for Approve or ApproveWithConditions
  if (response.decision === 'Approve' || response.decision === 'ApproveWithConditions') {
    const missing = getMissingConfirmations(response);
    if (missing.length > 0) {
      errors.push(`Missing required confirmations: ${missing.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detects contradictions in a list of requirements.
 *
 * This is a basic implementation that looks for explicit contradictions
 * in requirement text. More sophisticated contradiction detection would
 * be done by the adversarial auditor in US-005.
 *
 * @param requirements - The requirements to check.
 * @returns The contradiction check result.
 */
export function detectContradictions(
  requirements: readonly ExtractedRequirement[]
): ContradictionCheckResult {
  const contradictions: Contradiction[] = [];

  // Simple pattern-based contradiction detection
  // This detects explicit contradictions like:
  // - "must have X" vs "must not have X"
  // - "requires X" vs "prohibits X"
  // - Conflicting time/duration constraints

  const requirementTexts = requirements.map((r) => ({
    id: r.id,
    text: r.text.toLowerCase(),
    original: r.text,
  }));

  for (let i = 0; i < requirementTexts.length; i++) {
    const reqI = requirementTexts[i];
    if (reqI === undefined) {
      continue;
    }

    for (let j = i + 1; j < requirementTexts.length; j++) {
      const reqJ = requirementTexts[j];
      if (reqJ === undefined) {
        continue;
      }

      // Check for "must" vs "must not" contradictions
      // eslint-disable-next-line security/detect-unsafe-regex -- Short requirement text from spec
      const mustPattern = /must[ \t]+(?:have[ \t]+|support[ \t]+|include[ \t]+)?(\w+)/g;
      // eslint-disable-next-line security/detect-unsafe-regex -- Short requirement text from spec
      const mustNotPattern = /must[ \t]+not[ \t]+(?:have[ \t]+|support[ \t]+|include[ \t]+)?(\w+)/g;

      const mustMatchesI = [...reqI.text.matchAll(mustPattern)];
      const mustNotMatchesJ = [...reqJ.text.matchAll(mustNotPattern)];

      for (const mustMatch of mustMatchesI) {
        const term = mustMatch[1];
        if (term === undefined) {
          continue;
        }
        for (const mustNotMatch of mustNotMatchesJ) {
          if (mustNotMatch[1] === term) {
            contradictions.push({
              id: `contradiction_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`,
              requirementIds: [reqI.id, reqJ.id],
              description: `Conflicting requirements: "${reqI.original}" vs "${reqJ.original}"`,
              suggestedResolutions: [
                `Clarify whether ${term} should be required`,
                'Specify conditions under which each applies',
                'Remove one of the conflicting requirements',
              ],
              severity: 'critical',
            });
          }
        }
      }

      // Check for "must not" in i vs "must" in j
      const mustNotMatchesI = [...reqI.text.matchAll(mustNotPattern)];
      const mustMatchesJ = [...reqJ.text.matchAll(mustPattern)];

      for (const mustNotMatch of mustNotMatchesI) {
        const term = mustNotMatch[1];
        if (term === undefined) {
          continue;
        }
        for (const mustMatch of mustMatchesJ) {
          if (mustMatch[1] === term) {
            contradictions.push({
              id: `contradiction_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`,
              requirementIds: [reqI.id, reqJ.id],
              description: `Conflicting requirements: "${reqI.original}" vs "${reqJ.original}"`,
              suggestedResolutions: [
                `Clarify whether ${term} should be required`,
                'Specify conditions under which each applies',
                'Remove one of the conflicting requirements',
              ],
              severity: 'critical',
            });
          }
        }
      }

      // Check for conflicting numeric constraints
      // e.g., "timeout of 30 minutes" vs "operations take 2 hours"
      const timePattern = /(\d+)\s*(second|minute|hour|day|week|month|year)s?/gi;
      const timeMatchesI = [...reqI.text.matchAll(timePattern)];
      const timeMatchesJ = [...reqJ.text.matchAll(timePattern)];

      // Detect if both have time constraints and they might conflict
      if (timeMatchesI.length > 0 && timeMatchesJ.length > 0) {
        // Check for keywords indicating potential conflict
        const conflictKeywordsI = /timeout|expire|limit|maximum/.exec(reqI.text);
        const conflictKeywordsJ = /take|require|need|minimum|at least/.exec(reqJ.text);

        if (conflictKeywordsI && conflictKeywordsJ) {
          // Convert both to same unit (seconds) and compare
          const timeInSecondsI = convertToSeconds(timeMatchesI[0]);
          const timeInSecondsJ = convertToSeconds(timeMatchesJ[0]);

          if (timeInSecondsI !== null && timeInSecondsJ !== null) {
            // If limit is less than requirement, that's a contradiction
            if (timeInSecondsI < timeInSecondsJ) {
              contradictions.push({
                id: `contradiction_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`,
                requirementIds: [reqI.id, reqJ.id],
                description: `Time constraint conflict: "${reqI.original}" vs "${reqJ.original}"`,
                suggestedResolutions: [
                  'Extend the timeout/limit duration',
                  'Reduce the operation duration requirement',
                  'Add exception handling for long-running operations',
                ],
                severity: 'critical',
              });
            }
          }
        }
      }
    }
  }

  return {
    hasContradictions: contradictions.length > 0,
    contradictions,
  };
}

/**
 * Converts a regex time match to seconds.
 */
function convertToSeconds(match: RegExpMatchArray | undefined): number | null {
  const valueStr = match?.[1];
  const unitStr = match?.[2];
  if (valueStr === undefined || unitStr === undefined) {
    return null;
  }

  const value = parseInt(valueStr, 10);
  const unit = unitStr.toLowerCase();

  const multipliers: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    return null;
  }

  return value * multiplier;
}

/**
 * Determines which phases need to be revisited based on conditions.
 *
 * @param conditions - The conditions from conditional approval.
 * @returns The phases that should be revisited.
 */
export function getPhasesToRevisit(conditions: readonly string[]): InterviewPhase[] {
  const phasesToRevisit = new Set<InterviewPhase>();

  for (const condition of conditions) {
    const conditionLower = condition.toLowerCase();

    // Check for architecture-related keywords
    if (
      conditionLower.includes('architecture') ||
      conditionLower.includes('structure') ||
      conditionLower.includes('design') ||
      conditionLower.includes('component') ||
      conditionLower.includes('module') ||
      conditionLower.includes('service') ||
      conditionLower.includes('database') ||
      conditionLower.includes('api')
    ) {
      phasesToRevisit.add('Architecture');
    }

    // Check for constraint-related keywords
    if (
      conditionLower.includes('constraint') ||
      conditionLower.includes('limit') ||
      conditionLower.includes('rate') ||
      conditionLower.includes('performance') ||
      conditionLower.includes('security') ||
      conditionLower.includes('timeout') ||
      conditionLower.includes('validation')
    ) {
      phasesToRevisit.add('Constraints');
    }

    // Check for design preference keywords
    if (
      conditionLower.includes('preference') ||
      conditionLower.includes('style') ||
      conditionLower.includes('convention') ||
      conditionLower.includes('format')
    ) {
      phasesToRevisit.add('DesignPreferences');
    }

    // Check for discovery-related keywords
    if (
      conditionLower.includes('requirement') ||
      conditionLower.includes('feature') ||
      conditionLower.includes('capability') ||
      conditionLower.includes('user') ||
      conditionLower.includes('story')
    ) {
      phasesToRevisit.add('Discovery');
    }
  }

  // Sort by phase order
  return INTERVIEW_PHASES.filter((phase) => phasesToRevisit.has(phase));
}

/**
 * Creates transcript entries for a phase delegation.
 *
 * @param phase - The phase being delegated.
 * @param decision - The delegation decision.
 * @param notes - Optional notes.
 * @returns The transcript entries to add.
 */
export function createDelegationTranscriptEntries(
  phase: InterviewPhase,
  decision: DelegationDecision,
  notes?: string
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // User's delegation decision
  let userContent = `[Delegation] ${decision}`;
  if (notes !== undefined) {
    userContent += `\nNotes: ${notes}`;
  }
  entries.push(createTranscriptEntry(phase, 'user', userContent));

  // System acknowledgment
  const systemContent =
    decision === 'Continue'
      ? `User chose to continue providing input for ${phase} phase.`
      : `User delegated ${phase} phase decisions to Architect.${notes !== undefined ? ` Notes: ${notes}` : ''}`;
  entries.push(createTranscriptEntry(phase, 'system', systemContent));

  return entries;
}

/**
 * Creates transcript entries for an approval response.
 *
 * @param response - The approval response.
 * @returns The transcript entries to add.
 */
export function createApprovalTranscriptEntries(response: ApprovalResponse): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // User's approval decision
  let userContent = `[Approval] ${response.decision}`;
  if (response.conditions !== undefined && response.conditions.length > 0) {
    userContent += `\nConditions:\n${response.conditions.map((c) => `- ${c}`).join('\n')}`;
  }
  if (response.feedback !== undefined) {
    userContent += `\nFeedback: ${response.feedback}`;
  }
  entries.push(createTranscriptEntry('Approval', 'user', userContent));

  // Confirmation status
  const confirmationStatus = CONFIRMATION_ITEMS.map(
    (item) => `- ${item}: ${response.confirmations[item] ? 'confirmed' : 'not confirmed'}`
  ).join('\n');
  entries.push(
    createTranscriptEntry('Approval', 'system', `Confirmation status:\n${confirmationStatus}`)
  );

  return entries;
}

/**
 * Processes a phase completion, handling both normal completion and delegation.
 *
 * @param state - The current interview state.
 * @param phase - The phase being completed.
 * @param requirements - Requirements extracted from the phase.
 * @param delegation - Optional delegation response (for delegable phases).
 * @param ledger - Optional ledger to record decisions.
 * @returns The phase completion result.
 */
export function processPhaseCompletion(
  _state: InterviewState,
  phase: InterviewPhase,
  requirements: readonly ExtractedRequirement[],
  delegation?: DelegationResponse,
  ledger?: Ledger
): PhaseCompletionResult {
  // Check if delegation is valid for this phase
  if (delegation !== undefined && delegation.decision !== 'Continue') {
    if (!isDelegablePhase(phase)) {
      return {
        completed: false,
        delegated: false,
        requirements: [],
        error: `Phase ${phase} is required and cannot be delegated`,
      };
    }

    // Record delegation in ledger if provided
    if (ledger !== undefined) {
      recordDelegationInLedger(ledger, phase, delegation.decision, delegation.notes);
    }

    const delegationPoint = createDelegationPoint(phase, delegation.decision, delegation.notes);

    return {
      completed: true,
      delegated: true,
      requirements,
      delegationPoint,
    };
  }

  // Normal completion without delegation
  return {
    completed: true,
    delegated: false,
    requirements,
  };
}

/**
 * Processes an approval response.
 *
 * @param response - The approval response.
 * @param state - The current interview state.
 * @param ledger - Optional ledger to record decisions.
 * @returns Object indicating the result and any phases to revisit.
 */
export function processApprovalResponse(
  response: ApprovalResponse,
  _state: InterviewState,
  ledger?: Ledger
): {
  readonly approved: boolean;
  readonly phasesToRevisit: readonly InterviewPhase[];
  readonly transcriptEntries: readonly TranscriptEntry[];
  readonly error?: string;
} {
  // Validate the response
  const validation = validateApprovalResponse(response);
  if (!validation.valid) {
    return {
      approved: false,
      phasesToRevisit: [],
      transcriptEntries: [],
      error: validation.errors.join('; '),
    };
  }

  const transcriptEntries = createApprovalTranscriptEntries(response);

  if (response.decision === 'Approve') {
    return {
      approved: true,
      phasesToRevisit: [],
      transcriptEntries,
    };
  }

  if (response.decision === 'ApproveWithConditions') {
    // Record conditions in ledger
    if (ledger !== undefined && response.conditions !== undefined) {
      recordConditionalApprovalInLedger(ledger, response.conditions);
    }

    // Determine which phases need revisiting
    const phasesToRevisit = getPhasesToRevisit(response.conditions ?? []);

    return {
      approved: phasesToRevisit.length === 0, // Approved if no phases need revisiting
      phasesToRevisit,
      transcriptEntries,
    };
  }

  // RejectWithFeedback
  return {
    approved: false,
    phasesToRevisit: INTERVIEW_PHASES.filter(
      (p) => p !== 'Synthesis' && p !== 'Approval'
    ) as InterviewPhase[],
    transcriptEntries,
  };
}

/**
 * Advances the interview state to the next phase.
 *
 * @param state - The current interview state.
 * @returns The updated state with the next phase, or undefined if interview is complete.
 */
export function advanceToNextPhase(state: InterviewState): InterviewState | undefined {
  const nextPhase = getNextInterviewPhase(state.currentPhase);
  if (nextPhase === undefined) {
    return undefined; // Interview is complete
  }

  return {
    ...state,
    currentPhase: nextPhase,
    completedPhases: [...state.completedPhases, state.currentPhase],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resets the interview to a specific phase for revision.
 *
 * @param state - The current interview state.
 * @param targetPhase - The phase to return to.
 * @returns The updated state positioned at the target phase.
 */
export function resetToPhase(state: InterviewState, targetPhase: InterviewPhase): InterviewState {
  // Remove all phases from targetPhase onwards from completedPhases
  const targetIndex = INTERVIEW_PHASES.indexOf(targetPhase);
  const newCompleted = state.completedPhases.filter((phase) => {
    const phaseIndex = INTERVIEW_PHASES.indexOf(phase);
    return phaseIndex < targetIndex;
  });

  return {
    ...state,
    currentPhase: targetPhase,
    completedPhases: newCompleted,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Feature classification question for the Architecture phase.
 */
export interface FeatureClassificationQuestion {
  /** The feature being classified. */
  readonly featureName: string;
  /** Description of the feature. */
  readonly featureDescription: string;
  /** The question text. */
  readonly questionText: string;
  /** Available classification options. */
  readonly options: readonly FeatureClassificationOption[];
}

/**
 * A classification option with description.
 */
export interface FeatureClassificationOption {
  /** The classification value. */
  readonly classification: FeatureClassification;
  /** Human-readable label. */
  readonly label: string;
  /** Description of what this classification means. */
  readonly description: string;
  /** Example scenario. */
  readonly example: string;
}

/**
 * Standard classification options provided during feature classification.
 */
export const FEATURE_CLASSIFICATION_OPTIONS: readonly FeatureClassificationOption[] = [
  {
    classification: 'core',
    label: 'Core',
    description: 'Full implementation in Lattice phase - essential for MVP',
    example: 'User authentication for a login-required app',
  },
  {
    classification: 'foundational',
    label: 'Foundational',
    description:
      'Skeleton/extension points in Lattice - architecture supports it even if not fully used in MVP',
    example:
      'Multi-tenancy: database schema includes tenant_id columns even if single-tenant initially',
  },
  {
    classification: 'bolt-on',
    label: 'Bolt-on',
    description: 'Not in Lattice - documented for future implementation, no code generated',
    example: 'Social media integration for a utility app',
  },
] as const;

/**
 * Creates a feature classification question.
 *
 * @param featureName - Name of the feature to classify.
 * @param featureDescription - Description of the feature.
 * @returns A feature classification question.
 */
export function createFeatureClassificationQuestion(
  featureName: string,
  featureDescription: string
): FeatureClassificationQuestion {
  return {
    featureName,
    featureDescription,
    questionText: `How should "${featureName}" be classified for the initial implementation?`,
    options: FEATURE_CLASSIFICATION_OPTIONS,
  };
}

/**
 * Response to a feature classification question.
 */
export interface FeatureClassificationResponse {
  /** The feature name being classified. */
  readonly featureName: string;
  /** The chosen classification. */
  readonly classification: FeatureClassification;
  /** Optional rationale for the classification. */
  readonly rationale?: string;
}

/**
 * Validates a feature classification response.
 *
 * @param response - The response to validate.
 * @returns Validation result with errors if invalid.
 */
export function validateFeatureClassificationResponse(response: FeatureClassificationResponse): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  if (typeof response.featureName !== 'string' || response.featureName.trim() === '') {
    errors.push('Feature name must be a non-empty string');
  }

  if (!isValidFeatureClassification(response.classification)) {
    errors.push(
      `Classification must be one of: ${FEATURE_CLASSIFICATIONS.join(', ')}. Got: ${String(response.classification)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates transcript entries for a feature classification.
 *
 * @param featureName - The feature being classified.
 * @param classification - The chosen classification.
 * @param rationale - Optional rationale.
 * @returns Transcript entries for the classification.
 */
export function createFeatureClassificationTranscriptEntries(
  featureName: string,
  classification: FeatureClassification,
  rationale?: string
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // User's classification decision
  let userContent = `[Feature Classification] ${featureName}: ${classification}`;
  if (rationale !== undefined) {
    userContent += `\nRationale: ${rationale}`;
  }
  entries.push(createTranscriptEntry('Architecture', 'user', userContent));

  // System acknowledgment
  const option = FEATURE_CLASSIFICATION_OPTIONS.find((o) => o.classification === classification);
  const systemContent = `Feature "${featureName}" classified as ${classification}: ${option?.description ?? 'Unknown classification'}`;
  entries.push(createTranscriptEntry('Architecture', 'system', systemContent));

  return entries;
}

/**
 * Records a feature classification in the DecisionLedger.
 *
 * @param ledger - The ledger to record to.
 * @param featureName - The feature being classified.
 * @param classification - The chosen classification.
 * @param rationale - Optional rationale.
 */
export function recordFeatureClassificationInLedger(
  ledger: Ledger,
  featureName: string,
  classification: FeatureClassification,
  rationale?: string
): void {
  const constraint = `Feature "${featureName}" is classified as ${classification}`;
  const option = FEATURE_CLASSIFICATION_OPTIONS.find((o) => o.classification === classification);

  const input: DecisionInput = {
    category: 'interface',
    constraint,
    source: 'user_explicit',
    confidence: 'canonical',
    phase: 'ignition',
  };

  if (rationale !== undefined) {
    input.rationale = `${option?.description ?? ''} | User rationale: ${rationale}`;
  } else if (option !== undefined) {
    input.rationale = option.description;
  }

  ledger.append(input);
}

/**
 * Checks if all features have valid classifications.
 *
 * @param features - The features to check.
 * @returns Object indicating if valid and any unclassified features.
 */
export function validateAllFeaturesClassified(features: readonly Feature[]): {
  readonly valid: boolean;
  readonly unclassifiedFeatures: readonly string[];
} {
  const unclassified: string[] = [];

  for (const feature of features) {
    if (!isValidFeatureClassification(feature.classification)) {
      unclassified.push(feature.name);
    }
  }

  return {
    valid: unclassified.length === 0,
    unclassifiedFeatures: unclassified,
  };
}
