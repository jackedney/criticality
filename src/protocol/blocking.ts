/**
 * Blocking state management for human intervention.
 *
 * Provides functions to enter blocking state from any phase,
 * resolve blocking with human decisions, and handle timeouts.
 *
 * @packageDocumentation
 */

import type { Ledger, DecisionInput, Decision } from '../ledger/index.js';
import {
  type ProtocolState,
  type ProtocolPhase,
  type BlockedState,
  type ActiveState,
  type PhaseState,
  isBlockedState,
  getPhase,
  createBlockedState,
  createActiveState,
  createFailedState,
  type BlockedStateOptions,
} from './types.js';

/**
 * Unique identifier for a blocking query.
 */
export type BlockingQueryId = string;

/**
 * Record of a blocking query and its state.
 */
export interface BlockingRecord {
  /** Unique identifier for this blocking query. */
  readonly id: BlockingQueryId;
  /** The phase in which blocking occurred. */
  readonly phase: ProtocolPhase;
  /** The query prompting human intervention. */
  readonly query: string;
  /** Available options for human to choose from. */
  readonly options?: readonly string[];
  /** Timestamp when blocking started (ISO 8601). */
  readonly blockedAt: string;
  /** Optional timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Whether this blocking has been resolved. */
  readonly resolved: boolean;
  /** The resolution if resolved. */
  readonly resolution?: BlockingResolution;
}

/**
 * Resolution of a blocking query.
 */
export interface BlockingResolution {
  /** The ID of blocking query being resolved. */
  readonly queryId: BlockingQueryId;
  /** The selected option or custom response. */
  readonly response: string;
  /** Timestamp when resolution occurred (ISO 8601). */
  readonly resolvedAt: string;
  /** Optional rationale for the decision. */
  readonly rationale?: string;
}

/**
 * Result of entering a blocking state.
 */
export type EnterBlockingResult =
  | {
      readonly success: true;
      readonly state: BlockedState;
      readonly record: BlockingRecord;
    }
  | {
      readonly success: false;
      readonly error: BlockingError;
    };

/**
 * Result of resolving a blocking state.
 */
export type ResolveBlockingResult =
  | {
      readonly success: true;
      readonly state: ActiveState;
      readonly decision: Decision;
      readonly record: BlockingRecord;
    }
  | {
      readonly success: false;
      readonly error: BlockingError;
    };

/**
 * Result of checking timeout status.
 */
export type TimeoutCheckResult =
  | {
      readonly timedOut: false;
      readonly remainingMs?: number;
    }
  | {
      readonly timedOut: true;
      readonly exceededByMs: number;
    };

/**
 * Result of handling a timeout.
 */
export type TimeoutHandlingResult =
  | {
      readonly success: true;
      readonly state: ProtocolState;
      readonly record: BlockingRecord;
      readonly decision?: Decision;
    }
  | {
      readonly success: false;
      readonly error: BlockingError;
    };

/**
 * Error codes for blocking operations.
 */
export type BlockingErrorCode =
  | 'NOT_BLOCKING' // State is not in blocking state
  | 'ALREADY_BLOCKING' // State is already blocking
  | 'QUERY_ID_MISMATCH' // Provided query ID does not match current blocking
  | 'ALREADY_RESOLVED' // Blocking has already been resolved
  | 'INVALID_PHASE' // Cannot block in Complete phase
  | 'INVALID_RESPONSE' // Response not in available options
  | 'NO_TIMEOUT' // No timeout configured for this blocking
  | 'TIMEOUT_ESCALATION_NEEDED' // Timeout requires escalation handling
  | 'LEDGER_REQUIRED_FOR_DEFAULT_STRATEGY'; // Ledger required for default timeout strategy

/**
 * Error information for blocking operations.
 */
export interface BlockingError {
  /** Error code for programmatic handling. */
  readonly code: BlockingErrorCode;
  /** Human-readable error message. */
  readonly message: string;
}

/**
 * Options for entering a blocking state.
 */
export interface EnterBlockingOptions extends BlockedStateOptions {
  /** Optional custom ID for the blocking query (auto-generated if not provided). */
  id?: BlockingQueryId;
}

/**
 * Options for resolving a blocking state.
 */
export interface ResolveBlockingOptions {
  /** The response (selected option or custom text). */
  response: string;
  /** Optional rationale for the decision. */
  rationale?: string;
  /** If true, allows responses not in the options list. */
  allowCustomResponse?: boolean;
}

/**
 * Options for handling timeout.
 */
export interface TimeoutHandlingOptions {
  /** Strategy for handling timeout. */
  strategy: 'escalate' | 'default' | 'fail';
  /** Default response to use if strategy is 'default'. */
  defaultResponse?: string;
  /** Rationale for the timeout handling. */
  rationale?: string;
}

/**
 * Mapping of decision phases to protocol phases.
 * Used when recording decisions to ledger.
 */
function protocolPhaseToDecisionPhase(
  phase: ProtocolPhase
):
  | 'design'
  | 'ignition'
  | 'lattice'
  | 'composition_audit'
  | 'injection'
  | 'mesoscopic'
  | 'mass_defect' {
  switch (phase) {
    case 'Ignition':
      return 'ignition';
    case 'Lattice':
      return 'lattice';
    case 'CompositionAudit':
      return 'composition_audit';
    case 'Injection':
      return 'injection';
    case 'Mesoscopic':
      return 'mesoscopic';
    case 'MassDefect':
      return 'mass_defect';
    case 'Complete':
      // Complete phase shouldn't be blocking, but map to design as fallback
      return 'design';
  }
}

/**
 * Generates a unique blocking query ID.
 *
 * @param phase - The phase in which blocking is occurring.
 * @returns A unique ID for blocking query.
 */
export function generateBlockingQueryId(phase: ProtocolPhase): BlockingQueryId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `blocking_${phase.toLowerCase()}_${String(timestamp)}_${random}`;
}

/**
 * Creates a blocking error.
 *
 * @param code - Error code.
 * @param message - Human-readable message.
 * @returns A BlockingError object.
 */
function createBlockingError(code: BlockingErrorCode, message: string): BlockingError {
  return { code, message };
}

/**
 * Enters a blocking state from any phase.
 *
 * This transitions protocol state to a blocking state,
 * recording the query and available options for human intervention.
 *
 * @param currentState - The current protocol state.
 * @param options - Options for the blocking state.
 * @returns Result containing the new state and blocking record, or an error.
 *
 * @example
 * ```typescript
 * const state = createActiveState(createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0)));
 * const result = enterBlocking(state, {
 *   reason: 'user_requested',
 *   phase: 'Lattice',
 *   query: 'Approve architecture?',
 *   options: ['Yes', 'No', 'Revise'],
 *   timeoutMs: 300000, // 5 minutes
 * });
 *
 * if (result.success) {
 *   console.log(`Blocked: ${result.record.id}`);
 * }
 * ```
 */
export function enterBlocking(
  currentState: ProtocolState,
  options: EnterBlockingOptions
): EnterBlockingResult {
  const phase = getPhase(currentState);

  // Cannot block if phase is undefined or Complete
  if (phase === undefined || phase === 'Complete') {
    return {
      success: false,
      error: createBlockingError('INVALID_PHASE', 'Cannot enter blocking state in Complete phase'),
    };
  }

  // Cannot enter blocking if already blocking
  if (isBlockedState(currentState)) {
    const query = currentState.query;
    return {
      success: false,
      error: createBlockingError(
        'ALREADY_BLOCKING',
        `Already in blocking state with query: "${query}"`
      ),
    };
  }

  // Generate ID if not provided
  const blockingId = options.id ?? generateBlockingQueryId(phase);

  // Create a blocked state using the factory
  const newState = createBlockedState(options);

  // Create the blocking record
  const recordBase = {
    id: blockingId,
    phase,
    query: options.query,
    blockedAt: newState.blockedAt,
    resolved: false,
  };

  // Build record conditionally to satisfy exactOptionalPropertyTypes
  let record: BlockingRecord;
  if (options.options !== undefined && options.timeoutMs !== undefined) {
    record = { ...recordBase, options: options.options, timeoutMs: options.timeoutMs };
  } else if (options.options !== undefined) {
    record = { ...recordBase, options: options.options };
  } else if (options.timeoutMs !== undefined) {
    record = { ...recordBase, timeoutMs: options.timeoutMs };
  } else {
    record = recordBase;
  }

  return {
    success: true,
    state: newState,
    record,
  };
}

/**
 * Resolves a blocking state and records the decision to the ledger.
 *
 * This transitions protocol state back to active and creates
 * a decision entry in the ledger recording the human intervention.
 *
 * @param currentState - The current protocol state (must be blocking).
 * @param record - The blocking record for this blocking state.
 * @param resolveOptions - Options for resolving blocking.
 * @param ledger - The decision ledger to record the resolution.
 * @returns Result containing the new state, decision, and updated record, or an error.
 *
 * @example
 * ```typescript
 * const result = resolveBlocking(
 *   blockingState,
 *   blockingRecord,
 *   { response: 'Yes', rationale: 'Architecture meets requirements' },
 *   ledger
 * );
 *
 * if (result.success) {
 *   console.log(`Decision recorded: ${result.decision.id}`);
 * }
 * ```
 */
export function resolveBlocking(
  currentState: ProtocolState,
  record: BlockingRecord,
  resolveOptions: ResolveBlockingOptions,
  ledger: Ledger
): ResolveBlockingResult {
  // Must be in blocking state
  if (!isBlockedState(currentState)) {
    return {
      success: false,
      error: createBlockingError('NOT_BLOCKING', 'Cannot resolve: state is not in blocking state'),
    };
  }

  // Check if already resolved
  if (record.resolved) {
    return {
      success: false,
      error: createBlockingError(
        'ALREADY_RESOLVED',
        `Blocking query '${record.id}' has already been resolved`
      ),
    };
  }

  // Validate response against options if options are provided
  if (
    record.options !== undefined &&
    record.options.length > 0 &&
    resolveOptions.allowCustomResponse !== true
  ) {
    if (!record.options.includes(resolveOptions.response)) {
      return {
        success: false,
        error: createBlockingError(
          'INVALID_RESPONSE',
          `Response '${resolveOptions.response}' is not in available options: ${record.options.join(', ')}. Use allowCustomResponse: true to allow custom responses.`
        ),
      };
    }
  }

  // Create the resolution
  const resolution: BlockingResolution = {
    queryId: record.id,
    response: resolveOptions.response,
    resolvedAt: new Date().toISOString(),
  };

  // Add rationale if provided - need to handle exactOptionalPropertyTypes
  let finalResolution: BlockingResolution;
  if (resolveOptions.rationale !== undefined) {
    finalResolution = { ...resolution, rationale: resolveOptions.rationale };
  } else {
    finalResolution = resolution;
  }

  // Record the decision to the ledger
  const decisionInputBase = {
    category: 'blocking' as const,
    constraint: `Human resolution for query: "${record.query}" - Response: "${resolveOptions.response}"`,
    source: 'human_resolution' as const,
    confidence: 'canonical' as const,
    phase: protocolPhaseToDecisionPhase(record.phase),
    human_query_id: record.id,
  };

  // Add rationale to decision input if provided
  let decisionInput: DecisionInput;
  if (resolveOptions.rationale !== undefined) {
    decisionInput = { ...decisionInputBase, rationale: resolveOptions.rationale };
  } else {
    decisionInput = decisionInputBase;
  }

  const decision = ledger.append(decisionInput);

  // Create an active state (with a default Ignition substate as placeholder)
  // Note: The actual phase substate should be restored from before-blocking state
  // This is handled by the caller which maintains the pre-blocked state
  const defaultSubstate = {
    step: 'interviewing' as const,
    interviewPhase: 'Discovery' as const,
    questionIndex: 0,
  };
  const phaseState: PhaseState = { phase: 'Ignition', substate: defaultSubstate };

  const newState = createActiveState(phaseState);

  // Update the blocking record
  const updatedRecordBase = {
    ...record,
    resolved: true as const,
    resolution: finalResolution,
  };

  // Preserve optional fields properly
  let updatedRecord: BlockingRecord;
  if (record.options !== undefined && record.timeoutMs !== undefined) {
    updatedRecord = { ...updatedRecordBase, options: record.options, timeoutMs: record.timeoutMs };
  } else if (record.options !== undefined) {
    updatedRecord = { ...updatedRecordBase, options: record.options };
  } else if (record.timeoutMs !== undefined) {
    updatedRecord = { ...updatedRecordBase, timeoutMs: record.timeoutMs };
  } else {
    updatedRecord = updatedRecordBase;
  }

  return {
    success: true,
    state: newState,
    decision,
    record: updatedRecord,
  };
}

/**
 * Checks if a blocking state has timed out.
 *
 * @param record - The blocking record to check.
 * @param now - Optional current time for testing (defaults to Date.now()).
 * @returns Result indicating timeout status.
 *
 * @example
 * ```typescript
 * const result = checkTimeout(blockingRecord);
 *
 * if (result.timedOut) {
 *   console.log(`Timed out ${result.exceededByMs}ms ago`);
 * } else if (result.remainingMs !== undefined) {
 *   console.log(`${result.remainingMs}ms remaining`);
 * }
 * ```
 */
export function checkTimeout(record: BlockingRecord, now?: number): TimeoutCheckResult {
  // If no timeout configured, never times out
  if (record.timeoutMs === undefined) {
    return { timedOut: false };
  }

  const currentTime = now ?? Date.now();
  const blockedAtTime = new Date(record.blockedAt).getTime();
  const deadlineTime = blockedAtTime + record.timeoutMs;

  if (currentTime >= deadlineTime) {
    return {
      timedOut: true,
      exceededByMs: currentTime - deadlineTime,
    };
  }

  return {
    timedOut: false,
    remainingMs: deadlineTime - currentTime,
  };
}

/**
 * Handles a timeout on a blocked state.
 *
 * This function applies the specified timeout handling strategy:
 * - 'escalate': Returns error indicating timeout needs escalation
 * - 'default': Uses the default response and resolves blocking
 * - 'fail': Transitions to failed state
 *
 * @param currentState - The current protocol state (must be blocking).
 * @param record - The blocking record for this blocking state.
 * @param options - Options for handling timeout.
 * @param ledger - Optional ledger for recording decisions (required for 'default' strategy).
 * @returns Result containing the handled state or error.
 *
 * @example
 * ```typescript
 * // Check and handle timeout
 * const timeoutResult = checkTimeout(record);
 *
 * if (timeoutResult.timedOut) {
 *   const handleResult = handleTimeout(state, record, {
 *     strategy: 'default',
 *     defaultResponse: 'Yes',
 *     rationale: 'Timeout - using default response',
 *   }, ledger);
 * }
 * ```
 */
export function handleTimeout(
  currentState: ProtocolState,
  record: BlockingRecord,
  options: TimeoutHandlingOptions,
  ledger?: Ledger
): TimeoutHandlingResult {
  // Must be in blocking state
  if (!isBlockedState(currentState)) {
    return {
      success: false,
      error: createBlockingError(
        'NOT_BLOCKING',
        'Cannot handle timeout: state is not in blocking state'
      ),
    };
  }

  // Check if timeout is configured
  if (record.timeoutMs === undefined) {
    return {
      success: false,
      error: createBlockingError(
        'NO_TIMEOUT',
        'Cannot handle timeout: no timeout configured for this blocking state'
      ),
    };
  }

  // Check if already resolved
  if (record.resolved) {
    return {
      success: false,
      error: createBlockingError(
        'ALREADY_RESOLVED',
        `Blocking query '${record.id}' has already been resolved`
      ),
    };
  }

  switch (options.strategy) {
    case 'escalate': {
      // Return error indicating escalation needed
      return {
        success: false,
        error: createBlockingError(
          'TIMEOUT_ESCALATION_NEEDED',
          `Timeout on blocking query '${record.id}' requires escalation`
        ),
      };
    }

    case 'default': {
      // Use default response to resolve
      if (options.defaultResponse === undefined) {
        return {
          success: false,
          error: createBlockingError(
            'INVALID_RESPONSE',
            'Default response required for "default" timeout strategy'
          ),
        };
      }

      if (ledger === undefined) {
        return {
          success: false,
          error: createBlockingError(
            'LEDGER_REQUIRED_FOR_DEFAULT_STRATEGY',
            'Ledger required for "default" timeout strategy'
          ),
        };
      }

      // Resolve with default response
      const resolveResult = resolveBlocking(
        currentState,
        record,
        {
          response: options.defaultResponse,
          rationale:
            options.rationale ??
            `Timeout after ${String(record.timeoutMs)}ms - using default response`,
          allowCustomResponse: true, // Default may not be in options
        },
        ledger
      );

      if (!resolveResult.success) {
        return resolveResult;
      }

      return {
        success: true,
        state: resolveResult.state,
        record: resolveResult.record,
        decision: resolveResult.decision,
      };
    }

    case 'fail': {
      // Transition to failed state
      const newState = createFailedState({
        phase: record.phase,
        error: `Timeout on blocking query: "${record.query}"`,
        code: 'BLOCKING_TIMEOUT',
        recoverable: true,
        context: `Blocking query ID: ${record.id}, Timeout: ${String(record.timeoutMs)}ms`,
      });

      // Update record as "resolved" (via timeout)
      const resolution: BlockingResolution = {
        queryId: record.id,
        response: 'TIMEOUT_FAILURE',
        resolvedAt: newState.failedAt,
      };

      // Add rationale if provided
      let finalResolution: BlockingResolution;
      if (options.rationale !== undefined) {
        finalResolution = { ...resolution, rationale: options.rationale };
      } else {
        finalResolution = { ...resolution, rationale: 'Timeout triggered failure' };
      }

      const updatedRecordBase = {
        ...record,
        resolved: true as const,
        resolution: finalResolution,
      };

      // Preserve optional fields properly
      let updatedRecord: BlockingRecord;
      if (record.options !== undefined) {
        updatedRecord = {
          ...updatedRecordBase,
          options: record.options,
          timeoutMs: record.timeoutMs,
        };
      } else {
        updatedRecord = { ...updatedRecordBase, timeoutMs: record.timeoutMs };
      }

      return {
        success: true,
        state: newState,
        record: updatedRecord,
      };
    }
  }
}

/**
 * Gets the remaining time until timeout.
 *
 * @param record - The blocking record.
 * @param now - Optional current time for testing.
 * @returns Remaining milliseconds, or undefined if no timeout or already timed out.
 */
export function getRemainingTimeout(record: BlockingRecord, now?: number): number | undefined {
  const result = checkTimeout(record, now);
  if (!result.timedOut) {
    return (result as { timedOut: false; remainingMs: number }).remainingMs;
  }
  return undefined;
}

/**
 * Checks if a blocking record has a timeout configured.
 *
 * @param record - The blocking record.
 * @returns True if timeout is configured.
 */
export function hasTimeout(record: BlockingRecord): boolean {
  return record.timeoutMs !== undefined;
}

/**
 * Gets the deadline timestamp for a blocking record.
 *
 * @param record - The blocking record.
 * @returns The deadline as ISO 8601 string, or undefined if no timeout.
 */
export function getTimeoutDeadline(record: BlockingRecord): string | undefined {
  if (record.timeoutMs === undefined) {
    return undefined;
  }

  const blockedAtTime = new Date(record.blockedAt).getTime();
  const deadlineTime = blockedAtTime + record.timeoutMs;
  return new Date(deadlineTime).toISOString();
}
