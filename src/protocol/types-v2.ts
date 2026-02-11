/**
 * Protocol state types for the Criticality Protocol orchestrator (v2).
 *
 * Defines the 3-tier state representation for protocol phases:
 * - Tier 1: ProtocolState union (ActiveState, BlockedState, FailedState, CompleteState)
 * - Tier 2: PhaseState union (6 phase variants with phase-specific substates)
 * - Tier 3: Phase-specific substate types with step-level tracking
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from './types.js';

/**
 * Re-export ProtocolPhase and PROTOCOL_PHASES from existing types.ts.
 * These remain unchanged for backward compatibility.
 */
export type { ProtocolPhase } from './types.js';
export { PROTOCOL_PHASES } from './types.js';

/**
 * BlockReason - typed enum for reasons why a phase is blocked.
 */
export type BlockReason =
  | 'canonical_conflict'
  | 'unresolved_contradiction'
  | 'circuit_breaker'
  | 'security_review'
  | 'user_requested';

/**
 * ArtifactType - types of artifacts produced during protocol execution.
 * This is a placeholder - actual ArtifactType is defined elsewhere.
 */
export type ArtifactType = string;

/**
 * ============================================================================
 * TIER 3: Phase-Specific SubState Types
 * ============================================================================
 */

/**
 * Interview phase names for the Ignition phase.
 */
export type InterviewPhase = 'Discovery' | 'Requirements' | 'Architecture';

/**
 * IgnitionSubState - substate for the Ignition phase.
 */
export type IgnitionSubState =
  | {
      readonly step: 'interviewing';
      readonly interviewPhase: InterviewPhase;
      readonly questionIndex: number;
    }
  | {
      readonly step: 'synthesizing';
      readonly progress: number;
    }
  | {
      readonly step: 'awaitingApproval';
    };

/**
 * LatticeSubState - substate for the Lattice phase.
 */
export type LatticeSubState =
  | {
      readonly step: 'generatingStructure';
      readonly currentModule?: string;
    }
  | {
      readonly step: 'compilingCheck';
      readonly attempt: number;
    }
  | {
      readonly step: 'repairingStructure';
      readonly errors: readonly string[];
      readonly repairAttempt: number;
    };

/**
 * Severity levels for contradiction reporting.
 */
export type ContradictionSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * CompositionAuditSubState - substate for the CompositionAudit phase.
 */
export type CompositionAuditSubState =
  | {
      readonly step: 'auditing';
      readonly auditorsCompleted: number;
    }
  | {
      readonly step: 'reportingContradictions';
      readonly severity: ContradictionSeverity;
    };

/**
 * Tier names for escalation.
 */
export type TierName =
  | 'Ignition'
  | 'Lattice'
  | 'CompositionAudit'
  | 'Injection'
  | 'Mesoscopic'
  | 'MassDefect';

/**
 * InjectionSubState - substate for the Injection phase.
 */
export type InjectionSubState =
  | {
      readonly step: 'selectingFunction';
    }
  | {
      readonly step: 'implementing';
      readonly functionId: string;
      readonly attempt: number;
    }
  | {
      readonly step: 'verifying';
      readonly functionId: string;
    }
  | {
      readonly step: 'escalating';
      readonly functionId: string;
      readonly fromTier: TierName;
      readonly toTier: TierName;
    };

/**
 * MesoscopicSubState - substate for the Mesoscopic phase.
 */
export type MesoscopicSubState =
  | {
      readonly step: 'generatingTests';
      readonly clusterId?: string;
    }
  | {
      readonly step: 'executingCluster';
      readonly clusterId: string;
      readonly progress: number;
    }
  | {
      readonly step: 'handlingVerdict';
      readonly clusterId: string;
      readonly passed: boolean;
    };

/**
 * MassDefectSubState - substate for the MassDefect phase.
 */
export type MassDefectSubState =
  | {
      readonly step: 'analyzingComplexity';
    }
  | {
      readonly step: 'applyingTransform';
      readonly patternId: string;
      readonly functionId: string;
    }
  | {
      readonly step: 'verifyingSemantics';
      readonly transformId: string;
    };

/**
 * ============================================================================
 * TIER 2: PhaseState Union Type
 * ============================================================================
 */

/**
 * PhaseState - union type of all phase states.
 * Each variant embeds a phase-specific substate.
 */
export type PhaseState =
  | {
      readonly phase: 'Ignition';
      readonly substate: IgnitionSubState;
    }
  | {
      readonly phase: 'Lattice';
      readonly substate: LatticeSubState;
    }
  | {
      readonly phase: 'CompositionAudit';
      readonly substate: CompositionAuditSubState;
    }
  | {
      readonly phase: 'Injection';
      readonly substate: InjectionSubState;
    }
  | {
      readonly phase: 'Mesoscopic';
      readonly substate: MesoscopicSubState;
    }
  | {
      readonly phase: 'MassDefect';
      readonly substate: MassDefectSubState;
    };

/**
 * ============================================================================
 * TIER 1: ProtocolState Union Type
 * ============================================================================
 */

/**
 * ActiveState - the protocol is actively executing a phase.
 */
export interface ActiveState {
  /** Discriminant for the Active state. */
  readonly kind: 'Active';
  /** The current phase state with its substate. */
  readonly phase: PhaseState;
}

/**
 * BlockedState - the protocol is blocked awaiting human intervention.
 */
export interface BlockedState {
  /** Discriminant for the Blocked state. */
  readonly kind: 'Blocked';
  /** The reason for blocking. */
  readonly reason: BlockReason;
  /** The protocol phase where blocking occurred. */
  readonly phase: ProtocolPhase;
  /** The query or question prompting human intervention. */
  readonly query: string;
  /** Optional available options for the human to choose from. */
  readonly options?: readonly string[];
  /** Timestamp when blocking started (ISO 8601). */
  readonly blockedAt: string;
  /** Optional timeout in milliseconds after which blocking should escalate. */
  readonly timeoutMs?: number;
}

/**
 * FailedState - the protocol encountered an unrecoverable error.
 */
export interface FailedState {
  /** Discriminant for the Failed state. */
  readonly kind: 'Failed';
  /** The protocol phase where failure occurred. */
  readonly phase: ProtocolPhase;
  /** Description of the failure. */
  readonly error: string;
  /** Optional error code for programmatic handling. */
  readonly code?: string;
  /** Timestamp when failure occurred (ISO 8601). */
  readonly failedAt: string;
  /** Whether the failure is recoverable by retry. */
  readonly recoverable: boolean;
  /** Optional stack trace or additional context. */
  readonly context?: string;
}

/**
 * CompleteState - the protocol has completed successfully.
 */
export interface CompleteState {
  /** Discriminant for the Complete state. */
  readonly kind: 'Complete';
  /** Artifacts produced during protocol execution. */
  readonly artifacts: readonly ArtifactType[];
}

/**
 * ProtocolState - union type of all protocol states.
 * This is the 3-tier discriminated union representing the full protocol state.
 */
export type ProtocolState = ActiveState | BlockedState | FailedState | CompleteState;

/**
 * ============================================================================
 * Tier 3 Factory Functions
 * ============================================================================
 */

export function createIgnitionInterviewing(
  interviewPhase: InterviewPhase,
  questionIndex: number
): Extract<IgnitionSubState, { step: 'interviewing' }> {
  return { step: 'interviewing' as const, interviewPhase, questionIndex };
}

export function createIgnitionSynthesizing(
  progress: number
): Extract<IgnitionSubState, { step: 'synthesizing' }> {
  return { step: 'synthesizing' as const, progress };
}

export function createIgnitionAwaitingApproval(): Extract<
  IgnitionSubState,
  { step: 'awaitingApproval' }
> {
  return { step: 'awaitingApproval' as const };
}

export function createLatticeGeneratingStructure(
  currentModule?: string
): Extract<LatticeSubState, { step: 'generatingStructure' }> {
  if (currentModule !== undefined) {
    return { step: 'generatingStructure' as const, currentModule };
  }
  return { step: 'generatingStructure' as const };
}

export function createLatticeCompilingCheck(
  attempt: number
): Extract<LatticeSubState, { step: 'compilingCheck' }> {
  return { step: 'compilingCheck' as const, attempt };
}

export function createLatticeRepairingStructure(
  errors: readonly string[],
  repairAttempt: number
): Extract<LatticeSubState, { step: 'repairingStructure' }> {
  return { step: 'repairingStructure' as const, errors, repairAttempt };
}

export function createCompositionAuditAuditing(
  auditorsCompleted: number
): Extract<CompositionAuditSubState, { step: 'auditing' }> {
  return { step: 'auditing' as const, auditorsCompleted };
}

export function createCompositionAuditReportingContradictions(
  severity: ContradictionSeverity
): Extract<CompositionAuditSubState, { step: 'reportingContradictions' }> {
  return { step: 'reportingContradictions' as const, severity };
}

export function createInjectionSelectingFunction(): Extract<
  InjectionSubState,
  { step: 'selectingFunction' }
> {
  return { step: 'selectingFunction' as const };
}

export function createInjectionImplementing(
  functionId: string,
  attempt: number
): Extract<InjectionSubState, { step: 'implementing' }> {
  return { step: 'implementing' as const, functionId, attempt };
}

export function createInjectionVerifying(
  functionId: string
): Extract<InjectionSubState, { step: 'verifying' }> {
  return { step: 'verifying' as const, functionId };
}

export function createInjectionEscalating(
  functionId: string,
  fromTier: TierName,
  toTier: TierName
): Extract<InjectionSubState, { step: 'escalating' }> {
  return { step: 'escalating' as const, functionId, fromTier, toTier };
}

export function createMesoscopicGeneratingTests(
  clusterId?: string
): Extract<MesoscopicSubState, { step: 'generatingTests' }> {
  if (clusterId !== undefined) {
    return { step: 'generatingTests' as const, clusterId };
  }
  return { step: 'generatingTests' as const };
}

export function createMesoscopicExecutingCluster(
  clusterId: string,
  progress: number
): Extract<MesoscopicSubState, { step: 'executingCluster' }> {
  return { step: 'executingCluster' as const, clusterId, progress };
}

export function createMesoscopicHandlingVerdict(
  clusterId: string,
  passed: boolean
): Extract<MesoscopicSubState, { step: 'handlingVerdict' }> {
  return { step: 'handlingVerdict' as const, clusterId, passed };
}

export function createMassDefectAnalyzingComplexity(): Extract<
  MassDefectSubState,
  { step: 'analyzingComplexity' }
> {
  return { step: 'analyzingComplexity' as const };
}

export function createMassDefectApplyingTransform(
  patternId: string,
  functionId: string
): Extract<MassDefectSubState, { step: 'applyingTransform' }> {
  return { step: 'applyingTransform' as const, patternId, functionId };
}

export function createMassDefectVerifyingSemantics(
  transformId: string
): Extract<MassDefectSubState, { step: 'verifyingSemantics' }> {
  return { step: 'verifyingSemantics' as const, transformId };
}

/**
 * ============================================================================
 * Tier 2 Factory Functions
 * ============================================================================
 */

export function createIgnitionPhaseState(substate: IgnitionSubState): PhaseState {
  return { phase: 'Ignition', substate };
}

export function createLatticePhaseState(substate: LatticeSubState): PhaseState {
  return { phase: 'Lattice', substate };
}

export function createCompositionAuditPhaseState(substate: CompositionAuditSubState): PhaseState {
  return { phase: 'CompositionAudit', substate };
}

export function createInjectionPhaseState(substate: InjectionSubState): PhaseState {
  return { phase: 'Injection', substate };
}

export function createMesoscopicPhaseState(substate: MesoscopicSubState): PhaseState {
  return { phase: 'Mesoscopic', substate };
}

export function createMassDefectPhaseState(substate: MassDefectSubState): PhaseState {
  return { phase: 'MassDefect', substate };
}

/**
 * ============================================================================
 * Tier 1 Factory Functions
 * ============================================================================
 */

export function createActiveState(phase: PhaseState): ActiveState {
  return { kind: 'Active', phase };
}

export interface BlockedStateOptions {
  readonly reason: BlockReason;
  readonly phase: ProtocolPhase;
  readonly query: string;
  readonly options?: readonly string[];
  readonly timeoutMs?: number;
}

export function createBlockedState(options: BlockedStateOptions): BlockedState {
  const base = {
    kind: 'Blocked' as const,
    reason: options.reason,
    phase: options.phase,
    query: options.query,
    blockedAt: new Date().toISOString(),
  };

  if (options.options !== undefined && options.timeoutMs !== undefined) {
    return { ...base, options: options.options, timeoutMs: options.timeoutMs };
  }
  if (options.options !== undefined) {
    return { ...base, options: options.options };
  }
  if (options.timeoutMs !== undefined) {
    return { ...base, timeoutMs: options.timeoutMs };
  }

  return base;
}

export interface FailedStateOptions {
  readonly phase: ProtocolPhase;
  readonly error: string;
  readonly code?: string;
  readonly recoverable?: boolean;
  readonly context?: string;
}

export function createFailedState(options: FailedStateOptions): FailedState {
  const base = {
    kind: 'Failed' as const,
    phase: options.phase,
    error: options.error,
    failedAt: new Date().toISOString(),
    recoverable: options.recoverable ?? false,
  };

  const code = options.code;
  const context = options.context;

  if (code !== undefined && context !== undefined) {
    return { ...base, code, context };
  }
  if (code !== undefined) {
    return { ...base, code };
  }
  if (context !== undefined) {
    return { ...base, context };
  }

  return base;
}

export function createCompleteState(artifacts: readonly ArtifactType[]): CompleteState {
  return { kind: 'Complete', artifacts };
}

/**
 * ============================================================================
 * Type Guards (Tier 1)
 * ============================================================================
 */

export function isActiveState(state: ProtocolState): state is ActiveState {
  return state.kind === 'Active';
}

export function isBlockedState(state: ProtocolState): state is BlockedState {
  return state.kind === 'Blocked';
}

export function isFailedState(state: ProtocolState): state is FailedState {
  return state.kind === 'Failed';
}

export function isCompleteState(state: ProtocolState): state is CompleteState {
  return state.kind === 'Complete';
}

/**
 * ============================================================================
 * Type Guards (Tier 2 - PhaseState)
 * ============================================================================
 */

export function isIgnitionPhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'Ignition' }> {
  return phaseState.phase === 'Ignition';
}

export function isLatticePhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'Lattice' }> {
  return phaseState.phase === 'Lattice';
}

export function isCompositionAuditPhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'CompositionAudit' }> {
  return phaseState.phase === 'CompositionAudit';
}

export function isInjectionPhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'Injection' }> {
  return phaseState.phase === 'Injection';
}

export function isMesoscopicPhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'Mesoscopic' }> {
  return phaseState.phase === 'Mesoscopic';
}

export function isMassDefectPhaseState(
  phaseState: PhaseState
): phaseState is Extract<PhaseState, { phase: 'MassDefect' }> {
  return phaseState.phase === 'MassDefect';
}

/**
 * ============================================================================
 * Type Guards (Tier 3 - SubState)
 * ============================================================================
 */

export function isIgnitionInterviewing(
  substate: IgnitionSubState
): substate is Extract<IgnitionSubState, { step: 'interviewing' }> {
  return substate.step === 'interviewing';
}

export function isIgnitionSynthesizing(
  substate: IgnitionSubState
): substate is Extract<IgnitionSubState, { step: 'synthesizing' }> {
  return substate.step === 'synthesizing';
}

export function isIgnitionAwaitingApproval(
  substate: IgnitionSubState
): substate is Extract<IgnitionSubState, { step: 'awaitingApproval' }> {
  return substate.step === 'awaitingApproval';
}

export function isLatticeGeneratingStructure(
  substate: LatticeSubState
): substate is Extract<LatticeSubState, { step: 'generatingStructure' }> {
  return substate.step === 'generatingStructure';
}

export function isLatticeCompilingCheck(
  substate: LatticeSubState
): substate is Extract<LatticeSubState, { step: 'compilingCheck' }> {
  return substate.step === 'compilingCheck';
}

export function isLatticeRepairingStructure(
  substate: LatticeSubState
): substate is Extract<LatticeSubState, { step: 'repairingStructure' }> {
  return substate.step === 'repairingStructure';
}

export function isCompositionAuditAuditing(
  substate: CompositionAuditSubState
): substate is Extract<CompositionAuditSubState, { step: 'auditing' }> {
  return substate.step === 'auditing';
}

export function isCompositionAuditReportingContradictions(
  substate: CompositionAuditSubState
): substate is Extract<CompositionAuditSubState, { step: 'reportingContradictions' }> {
  return substate.step === 'reportingContradictions';
}

export function isInjectionSelectingFunction(
  substate: InjectionSubState
): substate is Extract<InjectionSubState, { step: 'selectingFunction' }> {
  return substate.step === 'selectingFunction';
}

export function isInjectionImplementing(
  substate: InjectionSubState
): substate is Extract<InjectionSubState, { step: 'implementing' }> {
  return substate.step === 'implementing';
}

export function isInjectionVerifying(
  substate: InjectionSubState
): substate is Extract<InjectionSubState, { step: 'verifying' }> {
  return substate.step === 'verifying';
}

export function isInjectionEscalating(
  substate: InjectionSubState
): substate is Extract<InjectionSubState, { step: 'escalating' }> {
  return substate.step === 'escalating';
}

export function isMesoscopicGeneratingTests(
  substate: MesoscopicSubState
): substate is Extract<MesoscopicSubState, { step: 'generatingTests' }> {
  return substate.step === 'generatingTests';
}

export function isMesoscopicExecutingCluster(
  substate: MesoscopicSubState
): substate is Extract<MesoscopicSubState, { step: 'executingCluster' }> {
  return substate.step === 'executingCluster';
}

export function isMesoscopicHandlingVerdict(
  substate: MesoscopicSubState
): substate is Extract<MesoscopicSubState, { step: 'handlingVerdict' }> {
  return substate.step === 'handlingVerdict';
}

export function isMassDefectAnalyzingComplexity(
  substate: MassDefectSubState
): substate is Extract<MassDefectSubState, { step: 'analyzingComplexity' }> {
  return substate.step === 'analyzingComplexity';
}

export function isMassDefectApplyingTransform(
  substate: MassDefectSubState
): substate is Extract<MassDefectSubState, { step: 'applyingTransform' }> {
  return substate.step === 'applyingTransform';
}

export function isMassDefectVerifyingSemantics(
  substate: MassDefectSubState
): substate is Extract<MassDefectSubState, { step: 'verifyingSemantics' }> {
  return substate.step === 'verifyingSemantics';
}

/**
 * ============================================================================
 * Helper Functions
 * ============================================================================
 */

/**
 * Gets the protocol phase from any ProtocolState variant.
 * For ActiveState, extracts the phase from the PhaseState.
 * For other states, uses the phase field directly.
 *
 * @param state - The protocol state.
 * @returns The protocol phase, or undefined for CompleteState.
 */
export function getPhase(state: ProtocolState): ProtocolPhase | undefined {
  if (isActiveState(state)) {
    return state.phase.phase;
  }
  if (isBlockedState(state) || isFailedState(state)) {
    return state.phase;
  }
  return undefined;
}

/**
 * Gets the current step from an ActiveState.
 * Returns undefined for non-active states or CompleteState.
 *
 * @param state - The protocol state.
 * @returns The step name, or undefined if not applicable.
 */
export function getStep(state: ProtocolState): string | undefined {
  if (isActiveState(state)) {
    return state.phase.substate.step;
  }
  return undefined;
}

/**
 * Checks if the protocol is in a terminal state.
 * Terminal states are Complete and Failed.
 *
 * @param state - The protocol state.
 * @returns True if the protocol is in a terminal state.
 */
export function isTerminalState(state: ProtocolState): boolean {
  return isCompleteState(state) || isFailedState(state);
}

/**
 * Checks if the protocol can accept new transitions.
 * Only ActiveState can transition.
 *
 * @param state - The protocol state.
 * @returns True if the protocol can transition.
 */
export function canTransition(state: ProtocolState): boolean {
  return isActiveState(state) && !isTerminalState(state);
}
