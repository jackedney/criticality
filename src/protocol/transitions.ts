/**
 * Phase transition logic for the Criticality Protocol.
 *
 * Implements of state machine for phase transitions, including:
 * - Valid forward transitions (Ignition → Lattice → CompositionAudit → ...)
 * - Failure transitions (rollback to earlier phases)
 * - Artifact validation for transitions
 * - Context shedding at phase boundaries
 *
 * @packageDocumentation
 */

import {
  type ProtocolPhase,
  type ProtocolState,
  canTransition,
  getPhase,
  isFailedState,
  isBlockedState,
  isCompleteState,
  createActiveState,
  createCompleteState,
  getPhaseIndex,
  type PhaseState,
} from './types.js';
import { safeMkdir } from '../utils/safe-fs.js';
import { Logger } from '../utils/logger.js';
import * as path from 'node:path';

/**
 * Creates a default PhaseState for a given target phase.
 *
 * Each phase gets its initial default substate, used when creating
 * new ActiveState instances during transitions or resolution.
 *
 * @param phase - The target protocol phase.
 * @returns A PhaseState with the default substate for that phase.
 */
function createDefaultPhaseState(phase: ProtocolPhase): PhaseState {
  switch (phase) {
    case 'Ignition':
      return {
        phase: 'Ignition',
        substate: {
          step: 'interviewing' as const,
          interviewPhase: 'Discovery' as const,
          questionIndex: 0,
        },
      };
    case 'Lattice':
      return {
        phase: 'Lattice',
        substate: { step: 'generatingStructure' as const },
      };
    case 'CompositionAudit':
      return {
        phase: 'CompositionAudit',
        substate: { step: 'auditing' as const, auditorsCompleted: 0 },
      };
    case 'Injection':
      return {
        phase: 'Injection',
        substate: { step: 'selectingFunction' as const },
      };
    case 'Mesoscopic':
      return {
        phase: 'Mesoscopic',
        substate: { step: 'generatingTests' as const },
      };
    case 'MassDefect':
      return {
        phase: 'MassDefect',
        substate: { step: 'analyzingComplexity' as const },
      };
    case 'Complete':
      // Complete is not a valid phase for ActiveState, default to Ignition
      return {
        phase: 'Ignition',
        substate: {
          step: 'interviewing' as const,
          interviewPhase: 'Discovery' as const,
          questionIndex: 0,
        },
      };
  }
}

/**
 * Valid forward transitions as defined in SPECIFICATION.md.
 *
 * Each entry maps a source phase to its valid next phase in the
 * normal execution flow.
 */
export const FORWARD_TRANSITIONS: ReadonlyMap<ProtocolPhase, ProtocolPhase> = new Map([
  ['Ignition', 'Lattice'],
  ['Lattice', 'CompositionAudit'],
  ['CompositionAudit', 'Injection'],
  ['Injection', 'Mesoscopic'],
  ['Mesoscopic', 'MassDefect'],
  ['MassDefect', 'Complete'],
]);

/**
 * Valid failure transitions as defined in SPECIFICATION.md.
 *
 * Each entry maps a source phase to phases it can transition
 * to upon failure/rollback.
 */
export const FAILURE_TRANSITIONS: ReadonlyMap<ProtocolPhase, readonly ProtocolPhase[]> = new Map([
  ['CompositionAudit', ['Ignition']], // Contradiction found
  ['Injection', ['Lattice']], // Circuit breaker tripped
  ['Mesoscopic', ['Injection']], // Cluster failure - re-inject
]);

/**
 * Types of artifacts that may be required for phase transitions.
 */
export type ArtifactType =
  | 'spec' // spec.toml - required for Ignition → Lattice
  | 'latticeCode' // Compilable skeleton - required for Lattice → CompositionAudit
  | 'witnesses' // Type witnesses - part of Lattice output
  | 'contracts' // Micro-contracts - part of Lattice output
  | 'validatedStructure' // Validated structure - required for CompositionAudit → Injection
  | 'implementedCode' // All todo!() replaced - required for Injection → Mesoscopic
  | 'verifiedCode' // All clusters pass - required for Mesoscopic → MassDefect
  | 'finalArtifact' // Final optimized artifact - required for MassDefect → Complete
  | 'contradictionReport' // For CompositionAudit → Ignition failure transition
  | 'structuralDefectReport' // For Injection → Lattice failure transition
  | 'clusterFailureReport'; // For Mesoscopic → Injection failure transition

/**
 * Artifact requirements for forward transitions.
 *
 * Maps each transition to artifacts required from the previous phase.
 */
export const REQUIRED_ARTIFACTS: ReadonlyMap<ProtocolPhase, readonly ArtifactType[]> = new Map([
  ['Lattice', ['spec']], // Ignition → Lattice requires spec.toml
  ['CompositionAudit', ['latticeCode', 'witnesses', 'contracts']], // Lattice output
  ['Injection', ['validatedStructure']], // CompositionAudit output
  ['Mesoscopic', ['implementedCode']], // Injection output
  ['MassDefect', ['verifiedCode']], // Mesoscopic output
  ['Complete', ['finalArtifact']], // MassDefect output
]);

/**
 * Artifact requirements for failure transitions.
 *
 * Maps each failure transition (from, to) to required artifacts.
 */
export const FAILURE_REQUIRED_ARTIFACTS: ReadonlyMap<string, readonly ArtifactType[]> = new Map([
  ['CompositionAudit->Ignition', ['contradictionReport']],
  ['Injection->Lattice', ['structuralDefectReport']],
  ['Mesoscopic->Injection', ['clusterFailureReport']],
]);

/**
 * Represents available artifacts for a phase transition.
 */
export interface TransitionArtifacts {
  /** Set of artifact types that are available. */
  readonly available: ReadonlySet<ArtifactType>;
}

/**
 * Creates a TransitionArtifacts object from an array of artifact types.
 *
 * @param artifacts - Array of available artifact types.
 * @returns A TransitionArtifacts object.
 */
export function createTransitionArtifacts(artifacts: readonly ArtifactType[]): TransitionArtifacts {
  return { available: new Set(artifacts) };
}

/**
 * Error codes for transition failures.
 */
export type TransitionErrorCode =
  | 'INVALID_TRANSITION' // Target phase is not reachable from current phase
  | 'MISSING_ARTIFACTS' // Required artifacts not provided
  | 'STATE_NOT_ACTIVE' // Current state is not in Active state
  | 'ALREADY_COMPLETE' // Protocol already in Complete phase
  | 'BLOCKED_STATE' // Current state is blocked awaiting intervention
  | 'FAILED_STATE'; // Current state has failed

/**
 * Error returned when a transition fails.
 */
export interface TransitionError {
  /** Error code for programmatic handling. */
  readonly code: TransitionErrorCode;
  /** Human-readable error message. */
  readonly message: string;
  /** The attempted source phase. */
  readonly fromPhase: ProtocolPhase;
  /** The attempted target phase. */
  readonly toPhase: ProtocolPhase;
  /** Missing artifacts, if applicable. */
  readonly missingArtifacts?: readonly ArtifactType[];
}

/**
 * Result of a transition attempt.
 */
export type TransitionResult =
  | { readonly success: true; readonly state: ProtocolState; readonly contextShed: boolean }
  | { readonly success: false; readonly error: TransitionError };

/**
 * Creates a successful transition result.
 *
 * @param state - The new protocol state.
 * @param contextShed - Whether context shedding was triggered.
 * @returns A successful transition result.
 */
function successResult(state: ProtocolState, contextShed: boolean): TransitionResult {
  return { success: true, state, contextShed };
}

/**
 * Creates a failed transition result.
 *
 * @param error - The transition error.
 * @returns A failed transition result.
 */
function errorResult(error: TransitionError): TransitionResult {
  return { success: false, error };
}

/**
 * Creates a transition error.
 *
 * @param code - Error code.
 * @param message - Human-readable message.
 * @param fromPhase - Source phase.
 * @param toPhase - Target phase.
 * @param missingArtifacts - Optional missing artifacts.
 * @returns A TransitionError.
 */
function createTransitionError(
  code: TransitionErrorCode,
  message: string,
  fromPhase: ProtocolPhase,
  toPhase: ProtocolPhase,
  missingArtifacts?: readonly ArtifactType[]
): TransitionError {
  if (missingArtifacts !== undefined) {
    return { code, message, fromPhase, toPhase, missingArtifacts };
  }
  return { code, message, fromPhase, toPhase };
}

/**
 * Checks if a transition is a valid forward transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if this is a valid forward transition.
 */
export function isValidForwardTransition(from: ProtocolPhase, to: ProtocolPhase): boolean {
  return FORWARD_TRANSITIONS.get(from) === to;
}

/**
 * Checks if a transition is a valid failure transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if this is a valid failure transition.
 */
export function isValidFailureTransition(from: ProtocolPhase, to: ProtocolPhase): boolean {
  return FAILURE_TRANSITIONS.get(from)?.includes(to) ?? false;
}

/**
 * Checks if a transition is valid (either forward or failure).
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if transition is valid.
 */
export function isValidTransition(from: ProtocolPhase, to: ProtocolPhase): boolean {
  return isValidForwardTransition(from, to) || isValidFailureTransition(from, to);
}

/**
 * Gets required artifacts for a transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns Array of required artifact types, or undefined if transition is invalid.
 */
export function getRequiredArtifacts(
  from: ProtocolPhase,
  to: ProtocolPhase
): readonly ArtifactType[] | undefined {
  if (isValidForwardTransition(from, to)) {
    return REQUIRED_ARTIFACTS.get(to) ?? [];
  }

  if (isValidFailureTransition(from, to)) {
    const key = `${from}->${to}`;
    return FAILURE_REQUIRED_ARTIFACTS.get(key) ?? [];
  }

  return undefined;
}

/**
 * Validates that all required artifacts are present.
 *
 * @param required - Required artifact types.
 * @param available - Available artifacts.
 * @returns Array of missing artifact types.
 */
export function validateArtifacts(
  required: readonly ArtifactType[],
  available: TransitionArtifacts
): readonly ArtifactType[] {
  const missing: ArtifactType[] = [];

  for (const artifact of required) {
    if (!available.available.has(artifact)) {
      missing.push(artifact);
    }
  }

  return missing;
}

/**
 * Placeholder function for context shedding.
 *
 * Context shedding destroys all LLM conversation history at phase boundaries
 * to prevent entropy accumulation. This is a placeholder that will be
 * implemented in a future story.
 *
 * @param fromPhase - The phase being exited.
 * @param toPhase - The phase being entered.
 * @returns True when context shedding is complete.
 */
const contextLogger = new Logger({ component: 'ContextShed', debugMode: false });

export async function shedContext(
  fromPhase: ProtocolPhase,
  toPhase: ProtocolPhase,
  projectRoot: string
): Promise<boolean> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDirName = `${fromPhase}-to-${toPhase}-${timestamp}`;
  const archivePath = path.join(projectRoot, '.criticality', 'archives', archiveDirName);

  try {
    await safeMkdir(archivePath, { recursive: true });

    contextLogger.info('context_shed', {
      fromPhase,
      toPhase,
      archivePath,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    contextLogger.warn('context_shed_failed', {
      fromPhase,
      toPhase,
      archivePath,
      error: error instanceof Error ? error.message : String(error),
    });

    return false;
  }
}

/**
 * Generates a descriptive error message for an invalid transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns Human-readable error message.
 */
function getInvalidTransitionMessage(from: ProtocolPhase, to: ProtocolPhase): string {
  const validForward = FORWARD_TRANSITIONS.get(from);
  const validFailures = FAILURE_TRANSITIONS.get(from);

  const validTargets: string[] = [];
  if (validForward !== undefined) {
    validTargets.push(validForward);
  }
  if (validFailures !== undefined) {
    validTargets.push(...validFailures);
  }

  if (validTargets.length === 0) {
    return `Phase '${from}' does not support any transitions`;
  }

  const fromIndex = getPhaseIndex(from);
  const toIndex = getPhaseIndex(to);

  if (toIndex > fromIndex && toIndex !== fromIndex + 1) {
    return `Cannot skip phases: transition from '${from}' to '${to}' is not allowed. Valid next phase: '${validForward ?? 'none'}'`;
  }

  if (toIndex < fromIndex && !isValidFailureTransition(from, to)) {
    return `Cannot transition from '${from}' to '${to}': not a valid failure transition. Valid failure transitions: ${validFailures?.join(', ') ?? 'none'}`;
  }

  return `Invalid transition from '${from}' to '${to}'. Valid transitions: ${validTargets.join(', ')}`;
}

/**
 * Options for performing a transition.
 */
export interface TransitionOptions {
  /** Artifacts available for transition. */
  readonly artifacts?: TransitionArtifacts;
  /** Whether this is a failure transition (rollback). */
  readonly isFailure?: boolean;
}

/**
 * Attempts to transition the protocol to a new phase.
 *
 * This function validates:
 * 1. The current state allows transitions (Active state, not terminal)
 * 2. The target phase is reachable from the current phase
 * 3. All required artifacts are present
 *
 * On success, triggers context shedding and returns the new state.
 *
 * @param currentState - The current protocol state.
 * @param targetPhase - The phase to transition to.
 * @param projectRoot - The root directory of the project for context shedding.
 * @param options - Optional transition options.
 * @returns A Promise resolving to a TransitionResult indicating success or failure.
 *
 * @example
 * ```typescript
 * // Successful forward transition
 * const phase = getPhase(currentState);
 * const artifacts = createTransitionArtifacts(['spec']);
 * if (phase !== undefined) {
 *   const result = await transition(currentState, 'Lattice', '/path/to/project', { artifacts });
 *
 *   if (result.success) {
 *     console.log(`Transitioned to ${result.state}`);
 *   }
 * }
 *
 * // Invalid transition returns descriptive error
 * const badResult = await transition(currentState, 'Injection', '/path/to/project');
 * if (!badResult.success) {
 *   console.log(badResult.error.message);
 *   // "Cannot skip phases: transition from 'Ignition' to 'Injection' is not allowed"
 * }
 * ```
 */
export async function transition(
  currentState: ProtocolState,
  targetPhase: ProtocolPhase,
  projectRoot: string,
  options?: TransitionOptions
): Promise<TransitionResult> {
  // CompleteState has no phase field accessible via getPhase, handle it first
  if (isCompleteState(currentState)) {
    return errorResult(
      createTransitionError(
        'ALREADY_COMPLETE',
        'Protocol execution is already complete; no further transitions allowed',
        'Complete',
        targetPhase
      )
    );
  }

  const fromPhase = getPhase(currentState);

  // If current state has no phase, we can't transition
  if (fromPhase === undefined) {
    return errorResult(
      createTransitionError(
        'STATE_NOT_ACTIVE',
        `Cannot transition: state is not in an active phase`,
        'Ignition',
        targetPhase
      )
    );
  }

  // Check if current state allows transitions
  if (!canTransition(currentState)) {
    // Determine specific error based on state
    if (isBlockedState(currentState)) {
      return errorResult(
        createTransitionError(
          'BLOCKED_STATE',
          `Cannot transition from '${fromPhase}' while in blocking state awaiting human intervention`,
          fromPhase,
          targetPhase
        )
      );
    }

    if (isFailedState(currentState)) {
      return errorResult(
        createTransitionError(
          'FAILED_STATE',
          `Cannot transition from '${fromPhase}' which is in a failed state`,
          fromPhase,
          targetPhase
        )
      );
    }

    if (fromPhase === 'Complete') {
      return errorResult(
        createTransitionError(
          'ALREADY_COMPLETE',
          'Protocol execution is already complete; no further transitions allowed',
          fromPhase,
          targetPhase
        )
      );
    }

    return errorResult(
      createTransitionError(
        'STATE_NOT_ACTIVE',
        `Cannot transition from '${fromPhase}': state is not active`,
        fromPhase,
        targetPhase
      )
    );
  }

  // Check if transition is valid
  const isForward = isValidForwardTransition(fromPhase, targetPhase);
  const isFailure = isValidFailureTransition(fromPhase, targetPhase);

  if (!isForward && !isFailure) {
    return errorResult(
      createTransitionError(
        'INVALID_TRANSITION',
        getInvalidTransitionMessage(fromPhase, targetPhase),
        fromPhase,
        targetPhase
      )
    );
  }

  // Get required artifacts
  const requiredArtifacts = getRequiredArtifacts(fromPhase, targetPhase);

  // Validate artifacts if required
  if (requiredArtifacts !== undefined && requiredArtifacts.length > 0) {
    const availableArtifacts = options?.artifacts ?? createTransitionArtifacts([]);
    const missingArtifacts = validateArtifacts(requiredArtifacts, availableArtifacts);

    if (missingArtifacts.length > 0) {
      const missingList = missingArtifacts.join(', ');
      return errorResult(
        createTransitionError(
          'MISSING_ARTIFACTS',
          `Cannot transition from '${fromPhase}' to '${targetPhase}': missing required artifacts: ${missingList}`,
          fromPhase,
          targetPhase,
          missingArtifacts
        )
      );
    }
  }

  // Perform context shedding
  const contextShed = await shedContext(fromPhase, targetPhase, projectRoot);

  // Create new state: CompleteState for Complete phase, ActiveState for all others
  if (targetPhase === 'Complete') {
    const availableArtifacts = options?.artifacts?.available;
    const artifactList = availableArtifacts !== undefined ? [...availableArtifacts] : [];
    const newState = createCompleteState(artifactList);
    return successResult(newState, contextShed);
  }

  const phaseState = createDefaultPhaseState(targetPhase);
  const newState = createActiveState(phaseState);

  return successResult(newState, contextShed);
}

/**
 * Gets all valid target phases from a given phase.
 *
 * @param from - The source phase.
 * @returns Array of valid target phases (forward and failure).
 */
export function getValidTransitions(from: ProtocolPhase): readonly ProtocolPhase[] {
  const targets: ProtocolPhase[] = [];

  const forward = FORWARD_TRANSITIONS.get(from);
  if (forward !== undefined) {
    targets.push(forward);
  }

  const failures = FAILURE_TRANSITIONS.get(from);
  if (failures !== undefined) {
    targets.push(...failures);
  }

  return targets;
}

/**
 * Gets the next phase in the normal forward progression.
 *
 * @param from - The source phase.
 * @returns The next phase, or undefined if at Complete or invalid.
 */
export function getNextPhase(from: ProtocolPhase): ProtocolPhase | undefined {
  return FORWARD_TRANSITIONS.get(from);
}
