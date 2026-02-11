/**
 * Phase regression handling for the Composition Audit phase.
 *
 * Manages how contradictions trigger targeted revision:
 * - Simple contradictions (single constraint conflict) return to relevant interview phase
 * - Complex contradictions (multiple interacting) enter BLOCKED state for human guidance
 * - Delegated decisions involved in contradictions are downgraded to 'inferred'
 * - Unaffected spec portions are preserved
 *
 * @packageDocumentation
 */

import type { Ledger, Decision } from '../ledger/index.js';
import type { InterviewPhase } from '../interview/types.js';
import type { ProtocolState } from '../protocol/types.js';
import { createBlockedState } from '../protocol/types.js';
import type { Contradiction, InvolvedElement, ContradictionType } from './types.js';

/**
 * Classification of contradiction complexity.
 *
 * - simple: Single constraint conflict that can be resolved by returning to one phase
 * - complex: Multiple interacting contradictions requiring human guidance
 */
export type ContradictionComplexity = 'simple' | 'complex';

/**
 * Mapping from contradiction types to the most likely interview phase to revisit.
 *
 * This mapping is used to determine where to return when a simple contradiction
 * is detected. The mapping is based on which phase typically defines the
 * constraints that lead to each type of contradiction.
 */
export const CONTRADICTION_TYPE_TO_PHASE: Readonly<Record<ContradictionType, InterviewPhase>> = {
  temporal: 'Constraints',
  resource: 'Constraints',
  invariant: 'Architecture',
  precondition_gap: 'Architecture',
  postcondition_conflict: 'Constraints',
};

/**
 * Maps element types to the interview phases where they are typically defined.
 */
export const ELEMENT_TYPE_TO_PHASE: Readonly<
  Record<InvolvedElement['elementType'], InterviewPhase>
> = {
  constraint: 'Constraints',
  contract: 'Architecture',
  witness: 'Architecture',
  claim: 'Discovery',
};

/**
 * A suggested resolution for a contradiction.
 */
export interface SuggestedResolution {
  /** Unique identifier for this resolution. */
  readonly id: string;
  /** Human-readable description of the resolution. */
  readonly description: string;
  /** The phase that would be affected by this resolution. */
  readonly affectedPhase: InterviewPhase;
  /** Whether this resolution requires spec changes. */
  readonly requiresSpecChange: boolean;
  /** Optional specific constraint IDs that would need modification. */
  readonly affectedConstraintIds?: readonly string[];
}

/**
 * Result of analyzing a set of contradictions.
 */
export interface ContradictionAnalysis {
  /** The classification of the contradictions' complexity. */
  readonly complexity: ContradictionComplexity;
  /** The relevant interview phase to return to (for simple contradictions). */
  readonly targetPhase: InterviewPhase | undefined;
  /** Specific question to ask when returning to the phase. */
  readonly regressionQuestion: string | undefined;
  /** All affected phases (for complex contradictions). */
  readonly affectedPhases: readonly InterviewPhase[];
  /** IDs of delegated decisions that need downgrading. */
  readonly delegatedDecisionIds: readonly string[];
  /** Constraint IDs that are affected by the contradictions. */
  readonly affectedConstraintIds: readonly string[];
  /** Constraint IDs that are NOT affected and can be preserved. */
  readonly preservedConstraintIds: readonly string[];
  /** Suggested resolutions with their affected phases. */
  readonly suggestedResolutions: readonly SuggestedResolution[];
}

/**
 * Result of handling a phase regression.
 */
export type PhaseRegressionResult =
  | {
      readonly success: true;
      readonly kind: 'regression';
      /** The interview phase to return to. */
      readonly targetPhase: InterviewPhase;
      /** The question to present to the user. */
      readonly question: string;
      /** Suggested resolutions for the user. */
      readonly resolutions: readonly SuggestedResolution[];
      /** IDs of decisions that were downgraded to 'inferred'. */
      readonly downgradedDecisionIds: readonly string[];
      /** IDs of constraints that are preserved (unaffected). */
      readonly preservedConstraintIds: readonly string[];
      /** The contradiction that triggered the regression. */
      readonly contradiction: Contradiction;
      /** The decision recorded in the ledger for this contradiction. */
      readonly ledgerDecision: Decision;
    }
  | {
      readonly success: true;
      readonly kind: 'blocked';
      /** The protocol state in BLOCKED substate. */
      readonly state: ProtocolState;
      /** The query presented to the human. */
      readonly query: string;
      /** Available options for resolution. */
      readonly options: readonly string[];
      /** IDs of decisions that were downgraded to 'inferred'. */
      readonly downgradedDecisionIds: readonly string[];
      /** The contradictions that triggered the BLOCKED state. */
      readonly contradictions: readonly Contradiction[];
      /** The decision recorded in the ledger for this contradiction. */
      readonly ledgerDecision: Decision;
    }
  | {
      readonly success: false;
      readonly error: PhaseRegressionError;
    };

/**
 * Error codes for phase regression operations.
 */
export type PhaseRegressionErrorCode =
  | 'NO_CONTRADICTIONS'
  | 'ALL_RESOLUTIONS_REJECTED'
  | 'INVALID_CONTRADICTION'
  | 'LEDGER_ERROR';

/**
 * Error information for phase regression operations.
 */
export interface PhaseRegressionError {
  /** Error code for programmatic handling. */
  readonly code: PhaseRegressionErrorCode;
  /** Human-readable error message. */
  readonly message: string;
  /** Additional context about the error. */
  readonly context?: string;
}

/**
 * Options for phase regression handling.
 */
export interface PhaseRegressionOptions {
  /** All constraint IDs in the spec (for determining preserved constraints). */
  readonly allConstraintIds: readonly string[];
  /** IDs of decisions that were delegated (to check for downgrading). */
  readonly delegatedDecisionIds?: readonly string[];
  /** Custom logger for warnings. */
  readonly logger?: (message: string) => void;
}

/**
 * Creates an error object for phase regression operations.
 */
function createPhaseRegressionError(
  code: PhaseRegressionErrorCode,
  message: string,
  context?: string
): PhaseRegressionError {
  if (context !== undefined) {
    return { code, message, context };
  }
  return { code, message };
}

/**
 * Determines the most relevant interview phase for a set of involved elements.
 *
 * @param involved - The elements involved in the contradiction.
 * @returns The most relevant interview phase.
 */
function determineTargetPhase(involved: readonly InvolvedElement[]): InterviewPhase {
  // Count which phases are most represented by the involved elements
  const phaseCounts = new Map<InterviewPhase, number>();

  for (const element of involved) {
    const phase = ELEMENT_TYPE_TO_PHASE[element.elementType];
    const currentCount = phaseCounts.get(phase) ?? 0;
    phaseCounts.set(phase, currentCount + 1);
  }

  // Find the phase with the most involved elements
  let maxCount = 0;
  let targetPhase: InterviewPhase = 'Constraints'; // Default

  for (const [phase, count] of phaseCounts) {
    if (count > maxCount) {
      maxCount = count;
      targetPhase = phase;
    }
  }

  return targetPhase;
}

/**
 * Generates a regression question for returning to an interview phase.
 *
 * @param contradiction - The contradiction that triggered regression.
 * @param targetPhase - The phase to return to.
 * @returns A specific question to ask when returning to the phase.
 */
function generateRegressionQuestion(
  contradiction: Contradiction,
  targetPhase: InterviewPhase
): string {
  const involvedNames = contradiction.involved.map((e) => `"${e.name}"`).join(', ');

  switch (targetPhase) {
    case 'Discovery':
      return `A contradiction was found involving ${involvedNames}. ${contradiction.description}\n\nPlease clarify the original requirements to resolve this conflict.`;

    case 'Architecture':
      return `A contradiction was found in the system architecture involving ${involvedNames}. ${contradiction.description}\n\nPlease review and adjust the architectural constraints to resolve this conflict.`;

    case 'Constraints':
      return `A constraint conflict was detected involving ${involvedNames}. ${contradiction.description}\n\nPlease revise the constraints to ensure they can be simultaneously satisfied.`;

    case 'DesignPreferences':
      return `A design preference conflict was found involving ${involvedNames}. ${contradiction.description}\n\nPlease update your preferences to resolve this conflict.`;

    case 'Synthesis':
      return `An issue was found during spec synthesis involving ${involvedNames}. ${contradiction.description}\n\nPlease review the synthesized spec and provide guidance.`;

    case 'Approval':
      return `Before approval, a contradiction was found involving ${involvedNames}. ${contradiction.description}\n\nPlease resolve this conflict before approving the spec.`;
  }
}

/**
 * Converts contradiction suggested resolutions to structured SuggestedResolution objects.
 *
 * @param contradiction - The contradiction with suggested resolutions.
 * @param targetPhase - The phase the contradiction relates to.
 * @returns Structured resolution suggestions.
 */
function buildSuggestedResolutions(
  contradiction: Contradiction,
  targetPhase: InterviewPhase
): SuggestedResolution[] {
  const resolutions: SuggestedResolution[] = [];

  for (const [index, resolutionText] of contradiction.suggestedResolutions.entries()) {
    const affectedIds = contradiction.involved
      .filter((e) => e.elementType === 'constraint')
      .map((e) => e.id);

    const resolution: SuggestedResolution = {
      id: `resolution_${contradiction.id}_${String(index + 1)}`,
      description: resolutionText,
      affectedPhase: targetPhase,
      requiresSpecChange: true,
    };

    if (affectedIds.length > 0) {
      resolutions.push({ ...resolution, affectedConstraintIds: affectedIds });
    } else {
      resolutions.push(resolution);
    }
  }

  return resolutions;
}

/**
 * Analyzes a set of contradictions to determine their complexity and impact.
 *
 * @param contradictions - The contradictions to analyze.
 * @param options - Options including all constraint IDs and delegated decision IDs.
 * @returns Analysis of the contradictions.
 */
export function analyzeContradictions(
  contradictions: readonly Contradiction[],
  options: PhaseRegressionOptions
): ContradictionAnalysis {
  if (contradictions.length === 0) {
    return {
      complexity: 'simple',
      targetPhase: undefined,
      regressionQuestion: undefined,
      affectedPhases: [],
      delegatedDecisionIds: [],
      affectedConstraintIds: [],
      preservedConstraintIds: [...options.allConstraintIds],
      suggestedResolutions: [],
    };
  }

  // Collect all affected constraint IDs
  const affectedConstraintIds = new Set<string>();
  const affectedPhases = new Set<InterviewPhase>();

  for (const contradiction of contradictions) {
    for (const element of contradiction.involved) {
      if (element.elementType === 'constraint') {
        affectedConstraintIds.add(element.id);
      }
      affectedPhases.add(ELEMENT_TYPE_TO_PHASE[element.elementType]);
    }
    // Also add the phase mapped from the contradiction type
    affectedPhases.add(CONTRADICTION_TYPE_TO_PHASE[contradiction.type]);
  }

  // Determine preserved constraints (those not affected)
  const preservedConstraintIds = options.allConstraintIds.filter(
    (id) => !affectedConstraintIds.has(id)
  );

  // Find delegated decisions that are involved
  const delegatedDecisionIds =
    options.delegatedDecisionIds?.filter((id) => affectedConstraintIds.has(id)) ?? [];

  // Determine complexity
  // Complex if: multiple contradictions, multiple phases affected, or interactions between contradictions
  const isComplex =
    contradictions.length > 1 ||
    affectedPhases.size > 2 ||
    hasInteractingContradictions(contradictions);

  if (isComplex) {
    // Collect all suggested resolutions from all contradictions
    const allResolutions: SuggestedResolution[] = [];
    for (const contradiction of contradictions) {
      const targetPhase = determineTargetPhase(contradiction.involved);
      const resolutions = buildSuggestedResolutions(contradiction, targetPhase);
      allResolutions.push(...resolutions);
    }

    return {
      complexity: 'complex',
      targetPhase: undefined,
      regressionQuestion: undefined,
      affectedPhases: [...affectedPhases],
      delegatedDecisionIds,
      affectedConstraintIds: [...affectedConstraintIds],
      preservedConstraintIds,
      suggestedResolutions: allResolutions,
    };
  }

  // Simple contradiction - determine single target phase
  const firstContradiction = contradictions[0];
  if (firstContradiction === undefined) {
    return {
      complexity: 'simple',
      targetPhase: undefined,
      regressionQuestion: undefined,
      affectedPhases: [],
      delegatedDecisionIds: [],
      affectedConstraintIds: [],
      preservedConstraintIds: [...options.allConstraintIds],
      suggestedResolutions: [],
    };
  }

  const targetPhase = determineTargetPhase(firstContradiction.involved);
  const regressionQuestion = generateRegressionQuestion(firstContradiction, targetPhase);
  const suggestedResolutions = buildSuggestedResolutions(firstContradiction, targetPhase);

  return {
    complexity: 'simple',
    targetPhase,
    regressionQuestion,
    affectedPhases: [...affectedPhases],
    delegatedDecisionIds,
    affectedConstraintIds: [...affectedConstraintIds],
    preservedConstraintIds,
    suggestedResolutions,
  };
}

/**
 * Checks if contradictions have interacting elements (shared constraints/elements).
 *
 * @param contradictions - The contradictions to check.
 * @returns True if there are interactions between contradictions.
 */
function hasInteractingContradictions(contradictions: readonly Contradiction[]): boolean {
  if (contradictions.length < 2) {
    return false;
  }

  const allElementIds = new Set<string>();

  for (const contradiction of contradictions) {
    for (const element of contradiction.involved) {
      if (allElementIds.has(element.id)) {
        return true; // Found a shared element
      }
      allElementIds.add(element.id);
    }
  }

  return false;
}

/**
 * Records a contradiction to the decision ledger.
 *
 * @param contradiction - The contradiction to record.
 * @param ledger - The decision ledger.
 * @param isComplex - Whether this is part of a complex contradiction set.
 * @returns The recorded decision.
 */
function recordContradictionToLedger(
  contradiction: Contradiction,
  ledger: Ledger,
  isComplex: boolean
): Decision {
  const involvedText = contradiction.involved
    .map((e) => `[${e.elementType}] ${e.id}: ${e.name}`)
    .join('; ');

  return ledger.append({
    category: 'constraint',
    constraint: `Contradiction detected: ${contradiction.description}`,
    rationale: `Type: ${contradiction.type}. Severity: ${contradiction.severity}. Involved: ${involvedText}. ${isComplex ? 'Part of complex contradiction set requiring human guidance.' : 'Simple contradiction triggering phase regression.'}`,
    source: 'composition_audit',
    confidence: 'blocking',
    phase: 'composition_audit',
    failure_context: `Contradiction ID: ${contradiction.id}. Analysis: ${contradiction.analysis}. Minimal scenario: ${contradiction.minimalScenario}`,
  });
}

/**
 * Records multiple contradictions to the decision ledger as a BLOCKED state.
 *
 * @param contradictions - The contradictions to record.
 * @param ledger - The decision ledger.
 * @returns The recorded decision.
 */
function recordComplexContradictionsToLedger(
  contradictions: readonly Contradiction[],
  ledger: Ledger
): Decision {
  const summary = contradictions.map((c) => `[${c.type}] ${c.description}`).join('\n');

  const involvedAll = contradictions
    .flatMap((c) => c.involved)
    .map((e) => `[${e.elementType}] ${e.id}: ${e.name}`);
  const uniqueInvolved = [...new Set(involvedAll)].join('; ');

  return ledger.append({
    category: 'blocking',
    constraint: `BLOCKED: Complex contradictions require human guidance. ${String(contradictions.length)} interacting contradictions detected.`,
    rationale: `Contradictions:\n${summary}\n\nInvolved elements: ${uniqueInvolved}`,
    source: 'composition_audit',
    confidence: 'blocking',
    phase: 'composition_audit',
    failure_context: `Contradiction IDs: ${contradictions.map((c) => c.id).join(', ')}`,
  });
}

/**
 * Downgrades delegated decisions to 'inferred' confidence level.
 *
 * Per ledger_007: Delegated decisions involved in contradictions are downgraded.
 *
 * @param decisionIds - IDs of delegated decisions to downgrade.
 * @param contradiction - The contradiction that triggered the downgrade.
 * @param ledger - The decision ledger.
 * @param logger - Optional logger for warnings.
 * @returns Array of decision IDs that were successfully downgraded.
 */
function downgradeDelegatedDecisions(
  decisionIds: readonly string[],
  contradiction: Contradiction,
  ledger: Ledger,
  logger?: (message: string) => void
): string[] {
  const downgraded: string[] = [];

  for (const id of decisionIds) {
    try {
      ledger.downgradeDelegated(
        id,
        `Contradiction ${contradiction.id}: ${contradiction.description}`
      );
      downgraded.push(id);
    } catch (error) {
      // Decision might not exist or not be delegated - log and continue
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger?.(`Could not downgrade decision ${id}: ${message}`);
    }
  }

  return downgraded;
}

/**
 * Handles phase regression for detected contradictions.
 *
 * For simple contradictions:
 * - Records the contradiction in the ledger
 * - Downgrades involved delegated decisions to 'inferred'
 * - Returns the target interview phase and question
 *
 * For complex contradictions:
 * - Records all contradictions in the ledger as BLOCKED
 * - Downgrades involved delegated decisions to 'inferred'
 * - Returns a BLOCKED protocol state for human guidance
 *
 * @param contradictions - The contradictions that triggered regression.
 * @param ledger - The decision ledger for recording.
 * @param options - Options for handling the regression.
 * @returns Result of the regression handling.
 *
 * @example
 * ```typescript
 * const result = handlePhaseRegression(
 *   auditResult.contradictions,
 *   ledger,
 *   {
 *     allConstraintIds: spec.constraints.map(c => c.id),
 *     delegatedDecisionIds: interviewState.delegationPoints.map(d => d.id),
 *   }
 * );
 *
 * if (result.success && result.kind === 'regression') {
 *   // Return to interview phase
 *   console.log(`Return to ${result.targetPhase}: ${result.question}`);
 * } else if (result.success && result.kind === 'blocked') {
 *   // Enter BLOCKED state
 *   console.log(`BLOCKED: ${result.query}`);
 * }
 * ```
 */
export function handlePhaseRegression(
  contradictions: readonly Contradiction[],
  ledger: Ledger,
  options: PhaseRegressionOptions
): PhaseRegressionResult {
  if (contradictions.length === 0) {
    return {
      success: false,
      error: createPhaseRegressionError(
        'NO_CONTRADICTIONS',
        'No contradictions provided for phase regression'
      ),
    };
  }

  // Analyze the contradictions
  const analysis = analyzeContradictions(contradictions, options);

  if (analysis.complexity === 'complex') {
    // Complex contradictions -> BLOCKED state
    const ledgerDecision = recordComplexContradictionsToLedger(contradictions, ledger);

    // Downgrade delegated decisions
    const firstContradiction = contradictions[0];
    const downgradedIds =
      firstContradiction !== undefined
        ? downgradeDelegatedDecisions(
            analysis.delegatedDecisionIds,
            firstContradiction,
            ledger,
            options.logger
          )
        : [];

    // Build the blocking query
    const query = buildComplexContradictionQuery(contradictions, analysis);

    // Build options for resolution
    const resolutionOptions = buildResolutionOptions(analysis.suggestedResolutions);

    // Create BLOCKED protocol state
    const blockedState = createBlockedState({
      reason: 'canonical_conflict',
      phase: 'CompositionAudit',
      query,
      ...(resolutionOptions.length > 0 ? { options: resolutionOptions } : {}),
    });

    return {
      success: true,
      kind: 'blocked',
      state: blockedState,
      query,
      options: resolutionOptions,
      downgradedDecisionIds: downgradedIds,
      contradictions,
      ledgerDecision,
    };
  }

  // Simple contradiction -> Phase regression
  const firstContradiction = contradictions[0];
  if (firstContradiction === undefined) {
    return {
      success: false,
      error: createPhaseRegressionError(
        'INVALID_CONTRADICTION',
        'First contradiction is undefined'
      ),
    };
  }

  const ledgerDecision = recordContradictionToLedger(firstContradiction, ledger, false);

  // Downgrade delegated decisions
  const downgradedIds = downgradeDelegatedDecisions(
    analysis.delegatedDecisionIds,
    firstContradiction,
    ledger,
    options.logger
  );

  if (analysis.targetPhase === undefined || analysis.regressionQuestion === undefined) {
    return {
      success: false,
      error: createPhaseRegressionError(
        'INVALID_CONTRADICTION',
        'Could not determine target phase for regression'
      ),
    };
  }

  return {
    success: true,
    kind: 'regression',
    targetPhase: analysis.targetPhase,
    question: analysis.regressionQuestion,
    resolutions: analysis.suggestedResolutions,
    downgradedDecisionIds: downgradedIds,
    preservedConstraintIds: analysis.preservedConstraintIds,
    contradiction: firstContradiction,
    ledgerDecision,
  };
}

/**
 * Builds a human-readable query for complex contradictions.
 */
function buildComplexContradictionQuery(
  contradictions: readonly Contradiction[],
  analysis: ContradictionAnalysis
): string {
  const lines: string[] = [];

  lines.push(`${String(contradictions.length)} INTERACTING CONTRADICTIONS DETECTED`);
  lines.push('');
  lines.push('These contradictions share elements and cannot be resolved independently.');
  lines.push('Human guidance is required to determine the resolution strategy.');
  lines.push('');

  for (const [i, contradiction] of contradictions.entries()) {
    lines.push(`Contradiction ${String(i + 1)}: [${contradiction.type.toUpperCase()}]`);
    lines.push(`  ${contradiction.description}`);
    lines.push(
      `  Involved: ${contradiction.involved.map((e) => `${e.elementType}:${e.name}`).join(', ')}`
    );
    lines.push('');
  }

  lines.push(`Affected phases: ${analysis.affectedPhases.join(', ')}`);
  lines.push(`Affected constraints: ${String(analysis.affectedConstraintIds.length)}`);
  lines.push(`Preserved constraints: ${String(analysis.preservedConstraintIds.length)}`);

  return lines.join('\n');
}

/**
 * Builds resolution options from suggested resolutions for BLOCKED state.
 */
function buildResolutionOptions(resolutions: readonly SuggestedResolution[]): string[] {
  const options: string[] = [];

  for (const resolution of resolutions) {
    options.push(resolution.description);
  }

  // Always add "Other" option for custom resolution
  if (options.length > 0) {
    options.push('Provide custom resolution');
  }

  return options;
}

/**
 * Handles the case where a user rejects all suggested resolutions.
 *
 * Per acceptance criteria: User rejects all suggested resolutions -> BLOCKED state.
 *
 * @param contradiction - The contradiction whose resolutions were rejected.
 * @param ledger - The decision ledger.
 * @returns A BLOCKED protocol state.
 */
export function handleAllResolutionsRejected(
  contradiction: Contradiction,
  ledger: Ledger
): PhaseRegressionResult {
  const ledgerDecision = ledger.append({
    category: 'blocking',
    constraint: `BLOCKED: User rejected all suggested resolutions for contradiction ${contradiction.id}`,
    rationale: `Contradiction: ${contradiction.description}. Rejected resolutions: ${contradiction.suggestedResolutions.join('; ')}`,
    source: 'human_resolution',
    confidence: 'blocking',
    phase: 'composition_audit',
    failure_context: `All ${String(contradiction.suggestedResolutions.length)} suggested resolutions were rejected. Human guidance required.`,
  });

  const query = `All suggested resolutions for the following contradiction have been rejected:\n\n${contradiction.description}\n\nPlease provide guidance on how to proceed.`;

  const blockedState = createBlockedState({
    reason: 'canonical_conflict',
    phase: 'CompositionAudit',
    query,
  });

  return {
    success: true,
    kind: 'blocked',
    state: blockedState,
    query,
    options: [],
    downgradedDecisionIds: [],
    contradictions: [contradiction],
    ledgerDecision,
  };
}

/**
 * Formats a contradiction with its suggested resolutions for user presentation.
 *
 * @param contradiction - The contradiction to format.
 * @param resolutions - The structured resolutions.
 * @returns Formatted string for display.
 */
export function formatContradictionForUser(
  contradiction: Contradiction,
  resolutions: readonly SuggestedResolution[]
): string {
  const lines: string[] = [];

  // Header
  const severityIcon = contradiction.severity === 'critical' ? '!' : '?';
  lines.push(`[${severityIcon}] ${contradiction.type.toUpperCase()} CONTRADICTION`);
  lines.push('');

  // Description
  lines.push(contradiction.description);
  lines.push('');

  // Involved elements
  lines.push('Involved elements:');
  for (const element of contradiction.involved) {
    lines.push(`  - [${element.elementType}] ${element.name}: ${element.text}`);
  }
  lines.push('');

  // Analysis
  lines.push('Analysis:');
  lines.push(`  ${contradiction.analysis}`);
  lines.push('');

  // Minimal scenario
  lines.push('Minimal failing scenario:');
  lines.push(`  ${contradiction.minimalScenario}`);
  lines.push('');

  // Suggested resolutions
  if (resolutions.length > 0) {
    lines.push('Suggested resolutions:');
    for (const [i, resolution] of resolutions.entries()) {
      lines.push(`  ${String(i + 1)}. ${resolution.description}`);
      lines.push(`     (affects: ${resolution.affectedPhase} phase)`);
    }
  }

  return lines.join('\n');
}

/**
 * Gets the constraint IDs that would be preserved (unaffected) by a contradiction.
 *
 * @param contradiction - The contradiction.
 * @param allConstraintIds - All constraint IDs in the spec.
 * @returns Constraint IDs that are not involved in the contradiction.
 */
export function getPreservedConstraintIds(
  contradiction: Contradiction,
  allConstraintIds: readonly string[]
): string[] {
  const affectedIds = new Set(
    contradiction.involved.filter((e) => e.elementType === 'constraint').map((e) => e.id)
  );

  return allConstraintIds.filter((id) => !affectedIds.has(id));
}

/**
 * Checks if a contradiction is simple (can be resolved by returning to one phase).
 *
 * A contradiction is simple if:
 * - It only involves elements from at most 2 phases
 * - It has at least one suggested resolution
 *
 * @param contradiction - The contradiction to check.
 * @returns True if the contradiction is simple.
 */
export function isSimpleContradiction(contradiction: Contradiction): boolean {
  const phases = new Set<InterviewPhase>();

  for (const element of contradiction.involved) {
    phases.add(ELEMENT_TYPE_TO_PHASE[element.elementType]);
  }

  return phases.size <= 2 && contradiction.suggestedResolutions.length > 0;
}
