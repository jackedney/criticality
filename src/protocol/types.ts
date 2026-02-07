/**
 * Protocol state types for the Criticality Protocol orchestrator.
 *
 * Defines the state representation for protocol phases, including
 * active, blocking, and failed substates.
 *
 * @packageDocumentation
 */

/**
 * All protocol phases in execution order.
 *
 * @remarks
 * Each phase represents a distinct stage in the Criticality Protocol:
 * - Ignition: Initial specification analysis and project setup
 * - Lattice: Decision structure and dependency mapping
 * - CompositionAudit: Verification of decision consistency
 * - Injection: Code generation and type injection
 * - Mesoscopic: Integration testing and refinement
 * - MassDefect: Final optimization and cleanup
 * - Complete: Protocol execution finished
 */
export type ProtocolPhase =
  | 'Ignition'
  | 'Lattice'
  | 'CompositionAudit'
  | 'Injection'
  | 'Mesoscopic'
  | 'MassDefect'
  | 'Complete';

/**
 * Array of all protocol phases in execution order.
 * Useful for iteration and validation.
 */
export const PROTOCOL_PHASES: readonly ProtocolPhase[] = [
  'Ignition',
  'Lattice',
  'CompositionAudit',
  'Injection',
  'Mesoscopic',
  'MassDefect',
  'Complete',
] as const;

/**
 * Active substate - the phase is executing normally.
 */
export interface ActiveSubstate {
  /** Discriminant for the Active substate. */
  readonly kind: 'Active';
  /** Current task being performed within the phase (optional). */
  readonly task?: string;
  /** Current atomic operation being executed (optional). */
  readonly operation?: string;
}

/**
 * Blocking substate - the phase is paused awaiting human intervention.
 */
export interface BlockingSubstate {
  /** Discriminant for the Blocking substate. */
  readonly kind: 'Blocking';
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
 * Failed substate - the phase encountered an unrecoverable error.
 */
export interface FailedSubstate {
  /** Discriminant for the Failed substate. */
  readonly kind: 'Failed';
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
 * Substates specific to the MassDefect phase.
 */
export type MassDefectPhaseState =
  | 'analyzing'
  | 'transforming'
  | 'verifying'
  | 'converged'
  | 'manual_review_required';

/**
 * Union type of all possible substates.
 *
 * @remarks
 * Each substate uses a discriminant `kind` field for type narrowing.
 */
export type ProtocolSubstate = ActiveSubstate | BlockingSubstate | FailedSubstate;

/**
 * Complete protocol state combining phase and substate.
 *
 * @remarks
 * The ProtocolState type represents the full state of protocol execution.
 * The phase indicates which stage of the protocol is current, while
 * the substate indicates whether that phase is actively executing,
 * blocked awaiting intervention, or has failed.
 *
 * @example
 * ```typescript
 * // Active state in Ignition phase
 * const activeState: ProtocolState = {
 *   phase: 'Ignition',
 *   substate: { kind: 'Active' }
 * };
 *
 * // Blocking state in Lattice phase
 * const blockingState: ProtocolState = {
 *   phase: 'Lattice',
 *   substate: {
 *     kind: 'Blocking',
 *     query: 'Approve architecture decision?',
 *     options: ['Yes', 'No', 'Revise'],
 *     blockedAt: new Date().toISOString()
 *   }
 * };
 *
 * // Failed state in Injection phase
 * const failedState: ProtocolState = {
 *   phase: 'Injection',
 *   substate: {
 *     kind: 'Failed',
 *     error: 'Type checking failed',
 *     code: 'TYPE_ERROR',
 *     failedAt: new Date().toISOString(),
 *     recoverable: true
 *   }
 * };
 * ```
 */
export interface ProtocolState {
  /** The current protocol phase. */
  readonly phase: ProtocolPhase;
  /** The current substate within the phase. */
  readonly substate: ProtocolSubstate;
}

/**
 * Type guard to check if a substate is Active.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Active.
 */
export function isActiveSubstate(substate: ProtocolSubstate): substate is ActiveSubstate {
  return substate.kind === 'Active';
}

/**
 * Type guard to check if a substate is Blocking.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Blocking.
 */
export function isBlockingSubstate(substate: ProtocolSubstate): substate is BlockingSubstate {
  return substate.kind === 'Blocking';
}

/**
 * Type guard to check if a substate is Failed.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Failed.
 */
export function isFailedSubstate(substate: ProtocolSubstate): substate is FailedSubstate {
  return substate.kind === 'Failed';
}

/**
 * Options for creating an Active substate.
 */
export interface ActiveSubstateOptions {
  /** Current task being performed within the phase. */
  task?: string;
  /** Current atomic operation being executed. */
  operation?: string;
}

/**
 * Creates an Active substate.
 *
 * @param options - Optional task and operation information.
 * @returns A new Active substate.
 */
export function createActiveSubstate(options?: ActiveSubstateOptions): ActiveSubstate {
  if (options === undefined) {
    return { kind: 'Active' };
  }
  const { task, operation } = options;

  if (task !== undefined && operation !== undefined) {
    return { kind: 'Active', task, operation };
  }
  if (task !== undefined) {
    return { kind: 'Active', task };
  }
  if (operation !== undefined) {
    return { kind: 'Active', operation };
  }

  return { kind: 'Active' };
}

/**
 * Options for creating a Blocking substate.
 */
export interface BlockingOptions {
  /** The query or question prompting human intervention. */
  query: string;
  /** Optional available options for the human to choose from. */
  options?: readonly string[];
  /** Optional timeout in milliseconds after which blocking should escalate. */
  timeoutMs?: number;
}

/**
 * Creates a Blocking substate.
 *
 * @param options - Options for the blocking substate.
 * @returns A new Blocking substate.
 */
export function createBlockingSubstate(options: BlockingOptions): BlockingSubstate {
  const base = {
    kind: 'Blocking' as const,
    query: options.query,
    blockedAt: new Date().toISOString(),
  };

  // Build result conditionally to satisfy exactOptionalPropertyTypes
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

/**
 * Options for creating a Failed substate.
 */
export interface FailedOptions {
  /** Description of the failure. */
  error: string;
  /** Optional error code for programmatic handling. */
  code?: string;
  /** Whether the failure is recoverable by retry. Default: false. */
  recoverable?: boolean;
  /** Optional stack trace or additional context. */
  context?: string;
}

/**
 * Creates a Failed substate.
 *
 * @param options - Options for the failed substate.
 * @returns A new Failed substate.
 */
export function createFailedSubstate(options: FailedOptions): FailedSubstate {
  const base = {
    kind: 'Failed' as const,
    error: options.error,
    failedAt: new Date().toISOString(),
    recoverable: options.recoverable ?? false,
  };

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  // We need explicit type guards for TypeScript to narrow correctly
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

/**
 * Creates a ProtocolState with the given phase and substate.
 *
 * @param phase - The protocol phase.
 * @param substate - The substate within the phase.
 * @returns A new ProtocolState.
 */
export function createProtocolState(
  phase: ProtocolPhase,
  substate: ProtocolSubstate
): ProtocolState {
  return { phase, substate };
}

/**
 * Creates an active ProtocolState for the given phase.
 *
 * @param phase - The protocol phase.
 * @param options - Optional task and operation information.
 * @returns A new ProtocolState in Active substate.
 */
export function createActiveState(
  phase: ProtocolPhase,
  options?: ActiveSubstateOptions
): ProtocolState {
  return createProtocolState(phase, createActiveSubstate(options));
}

/**
 * Checks if a string is a valid ProtocolPhase.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid ProtocolPhase.
 */
export function isValidPhase(value: string): value is ProtocolPhase {
  return PROTOCOL_PHASES.includes(value as ProtocolPhase);
}

/**
 * Gets the index of a phase in the execution order.
 *
 * @param phase - The phase to look up.
 * @returns The zero-based index of the phase.
 */
export function getPhaseIndex(phase: ProtocolPhase): number {
  return PROTOCOL_PHASES.indexOf(phase);
}

/**
 * Checks if the protocol is in a terminal state.
 *
 * @param state - The protocol state to check.
 * @returns True if the protocol is complete or has failed.
 */
export function isTerminalState(state: ProtocolState): boolean {
  return state.phase === 'Complete' || isFailedSubstate(state.substate);
}

/**
 * Checks if the protocol can accept new transitions.
 *
 * @param state - The protocol state to check.
 * @returns True if the protocol is active and not in a terminal state.
 */
export function canTransition(state: ProtocolState): boolean {
  return isActiveSubstate(state.substate) && !isTerminalState(state);
}
