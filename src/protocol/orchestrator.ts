/**
 * Protocol orchestrator tick loop module.
 *
 * Implements the tick loop execution model as specified in orch_006:
 * Each tick evaluates guards, executes one transition, and persists state.
 *
 * The orchestrator is deterministic and performs no reasoning (orch_001).
 * It performs CLASSIFICATION not REASONING (orch_003).
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from './types.js';
import type { ArtifactType } from './transitions.js';
import type { BlockingRecord, BlockingResolution } from './blocking.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import type { NotificationService } from '../notifications/service.js';
import { transition, getValidTransitions, REQUIRED_ARTIFACTS } from './transitions.js';
import { checkTimeout } from './blocking.js';
import { saveState } from './persistence.js';
import { getStartupState } from './checkpoint.js';
import { createActiveSubstate, createFailedSubstate } from './types.js';

/**
 * Guard function type.
 * Guards evaluate conditions and return true if the transition should proceed.
 */
export type Guard = (context: TickContext) => boolean;

/**
 * Action function type.
 * Actions execute side effects and may return artifacts or updated state.
 */
export type Action = (context: TickContext) => Promise<ActionResult>;

/**
 * Result of executing an action.
 */
export interface ActionResult {
  /** Whether the action succeeded. */
  readonly success: boolean;
  /** New artifacts produced by the action. */
  readonly artifacts?: readonly ArtifactType[];
  /** Error message if action failed. */
  readonly error?: string;
  /** Whether the error is recoverable. */
  readonly recoverable?: boolean;
}

/**
 * A state transition definition as (from, to, guard, action) tuple.
 * Per orch_005: State transitions defined as (from, to, guard, action) tuples.
 */
export interface TransitionDefinition {
  /** Source phase. */
  readonly from: ProtocolPhase;
  /** Target phase. */
  readonly to: ProtocolPhase;
  /** Guard function that must return true for transition to proceed. */
  readonly guard: Guard;
  /** Action function to execute when transitioning. */
  readonly action: Action;
}

/**
 * Context available during tick execution.
 */
export interface TickContext {
  /** Current protocol state snapshot. */
  readonly snapshot: ProtocolStateSnapshot;
  /** Available artifacts (convenience accessor). */
  readonly artifacts: ReadonlySet<ArtifactType>;
  /** Pending blocking resolutions. */
  readonly pendingResolutions: readonly BlockingResolution[];
  /** External operations interface. */
  readonly operations: ExternalOperations;
  /** Notification service for sending protocol events. */
  readonly notificationService: NotificationService | undefined;
}

/**
 * Interface for external operations that complete between ticks.
 * This abstraction enables testability per orch_006.
 */
export interface ExternalOperations {
  /** Execute a model call and return artifacts on success. */
  executeModelCall(phase: ProtocolPhase): Promise<ActionResult>;
  /** Run compilation and return result. */
  runCompilation(): Promise<ActionResult>;
  /** Run tests and return result. */
  runTests(): Promise<ActionResult>;
  /** Archive artifacts for the completed phase. */
  archivePhaseArtifacts(phase: ProtocolPhase): Promise<ActionResult>;
  /** Send blocking notification. */
  sendBlockingNotification(query: string): Promise<void>;
}

/**
 * Result of a single tick execution.
 */
export interface TickResult {
  /** Whether a transition occurred. */
  readonly transitioned: boolean;
  /** The new state snapshot after the tick. */
  readonly snapshot: ProtocolStateSnapshot;
  /** Whether the orchestrator should continue ticking. */
  readonly shouldContinue: boolean;
  /** Reason for stopping if shouldContinue is false. */
  readonly stopReason?: TickStopReason;
  /** Error that occurred during tick, if any. */
  readonly error?: string;
}

/**
 * Reasons for stopping the tick loop.
 */
export type TickStopReason =
  | 'COMPLETE'
  | 'BLOCKED'
  | 'FAILED'
  | 'NO_VALID_TRANSITION'
  | 'EXTERNAL_ERROR';

/**
 * Options for the orchestrator.
 */
export interface OrchestratorOptions {
  /** Path to the state file. */
  readonly statePath: string;
  /** External operations implementation. */
  readonly operations: ExternalOperations;
  /** Notification service for sending protocol events. */
  readonly notificationService?: NotificationService;
  /** Maximum ticks before forced stop (safety limit). */
  readonly maxTicks?: number;
}

/**
 * Orchestrator state for tracking tick execution.
 */
export interface OrchestratorState {
  /** Current state snapshot. */
  snapshot: ProtocolStateSnapshot;
  /** Total ticks executed. */
  tickCount: number;
  /** Whether the orchestrator is running. */
  running: boolean;
  /** Last tick result. */
  lastTickResult: TickResult | undefined;
  /** Previous snapshot for detecting state changes. */
  previousSnapshot: ProtocolStateSnapshot | undefined;
}

/**
 * Composable guard combinators.
 * Per orch_005: composable guards (and/or/not).
 */
export const Guards = {
  /** Combine guards with AND logic. */
  and:
    (...guards: Guard[]): Guard =>
    (ctx) =>
      guards.every((g) => g(ctx)),

  /** Combine guards with OR logic. */
  or:
    (...guards: Guard[]): Guard =>
    (ctx) =>
      guards.some((g) => g(ctx)),

  /** Negate a guard. */
  not:
    (guard: Guard): Guard =>
    (ctx) =>
      !guard(ctx),

  /** Guard that checks if artifacts are available. */
  hasArtifacts:
    (...artifacts: ArtifactType[]): Guard =>
    (ctx) =>
      artifacts.every((a) => ctx.artifacts.has(a)),

  /** Guard that checks if in active substate. */
  isActive: (): Guard => (ctx) => ctx.snapshot.state.substate.kind === 'Active',

  /** Guard that checks if blocking is resolved. */
  blockingResolved: (): Guard => (ctx) => ctx.pendingResolutions.length > 0,

  /** Guard that always returns true. */
  always: (): Guard => () => true,

  /** Guard that always returns false. */
  never: (): Guard => () => false,
};

/**
 * Sequenceable action combinators.
 * Per orch_005: sequenceable actions.
 */
export const Actions = {
  /** Execute actions in sequence, stopping on first failure. */
  sequence:
    (...actions: Action[]): Action =>
    async (ctx) => {
      const collectedArtifacts: ArtifactType[] = [];

      for (const action of actions) {
        const result = await action(ctx);
        if (!result.success) {
          return result;
        }
        if (result.artifacts !== undefined) {
          collectedArtifacts.push(...result.artifacts);
        }
      }

      // Return with or without artifacts (avoiding undefined assignment for exactOptionalPropertyTypes)
      if (collectedArtifacts.length > 0) {
        return { success: true, artifacts: collectedArtifacts };
      }
      return { success: true };
    },

  /** Create an action that produces specified artifacts. */
  produceArtifacts:
    (...artifacts: ArtifactType[]): Action =>
    () =>
      Promise.resolve({
        success: true,
        artifacts,
      }),

  /** Create an action that does nothing (no-op). */
  noop: (): Action => () => Promise.resolve({ success: true }),

  /** Create an action that calls external model. */
  callModel:
    (phase: ProtocolPhase): Action =>
    async (ctx) =>
      ctx.operations.executeModelCall(phase),

  /** Create an action that runs compilation. */
  compile: (): Action => async (ctx) => ctx.operations.runCompilation(),

  /** Create an action that runs tests. */
  test: (): Action => async (ctx) => ctx.operations.runTests(),

  /** Create an action that archives phase artifacts. */
  archive:
    (phase: ProtocolPhase): Action =>
    async (ctx) =>
      ctx.operations.archivePhaseArtifacts(phase),
};

/**
 * Get required artifacts for transitioning to a phase.
 *
 * @param toPhase - The target phase.
 * @returns Array of required artifact types.
 */
function getRequiredArtifactsForPhase(toPhase: ProtocolPhase): readonly ArtifactType[] {
  return REQUIRED_ARTIFACTS.get(toPhase) ?? [];
}

/**
 * Check if all required artifacts are available for a transition.
 *
 * @param toPhase - Target phase.
 * @param available - Available artifacts.
 * @returns True if all required artifacts are present.
 */
function hasRequiredArtifacts(
  toPhase: ProtocolPhase,
  available: ReadonlySet<ArtifactType>
): boolean {
  const required = getRequiredArtifactsForPhase(toPhase);
  return required.every((a) => available.has(a));
}

/**
 * Execute a single tick of the orchestrator.
 *
 * Per orch_006: Each tick evaluates guards, executes one transition, persists state.
 *
 * @param context - The tick context.
 * @param statePath - Path to persist state.
 * @returns The tick result.
 */
export async function executeTick(context: TickContext, statePath: string): Promise<TickResult> {
  const { snapshot, notificationService } = context;
  const { phase, substate } = snapshot.state;

  // Check if already complete
  if (phase === 'Complete') {
    try {
      if (notificationService !== undefined) {
        await notificationService.notify('complete', snapshot.state);
      }
    } catch {
      // Notification failure should not block protocol execution
    }
    return {
      transitioned: false,
      snapshot,
      shouldContinue: false,
      stopReason: 'COMPLETE',
    };
  }

  // Check if in failed state
  if (substate.kind === 'Failed') {
    try {
      if (notificationService !== undefined) {
        await notificationService.notify('error', snapshot.state);
      }
    } catch {
      // Notification failure should not block protocol execution
    }
    return {
      transitioned: false,
      snapshot,
      shouldContinue: false,
      stopReason: 'FAILED',
      error: substate.error,
    };
  }

  // Check if in blocking state
  if (substate.kind === 'Blocking') {
    // Build a BlockingRecord for timeout checking
    const blockingRecordBase: BlockingRecord = {
      id: `blocking-${snapshot.state.phase}`,
      phase: snapshot.state.phase,
      query: substate.query,
      blockedAt: substate.blockedAt,
      resolved: false,
    };

    // Add optional timeoutMs if present
    const blockingRecord: BlockingRecord =
      substate.timeoutMs !== undefined
        ? { ...blockingRecordBase, timeoutMs: substate.timeoutMs }
        : blockingRecordBase;

    // Check for timeout
    const timeoutCheck = checkTimeout(blockingRecord);

    if (timeoutCheck.timedOut) {
      // Handle timeout by transitioning to failed state
      const failedSubstate = createFailedSubstate({
        error: `Blocking query timed out: ${substate.query}`,
        code: 'TIMEOUT',
        recoverable: true,
      });

      const newSnapshot: ProtocolStateSnapshot = {
        ...snapshot,
        state: { phase, substate: failedSubstate },
      };

      await saveState(newSnapshot, statePath);

      try {
        if (notificationService !== undefined) {
          await notificationService.notify('error', newSnapshot.state);
        }
      } catch {
        // Notification failure should not block protocol execution
      }

      return {
        transitioned: true,
        snapshot: newSnapshot,
        shouldContinue: false,
        stopReason: 'FAILED',
        error: `Blocking query timed out after ${String(substate.timeoutMs ?? 0)}ms`,
      };
    }

    // Check for resolution - transition to active state without calling resolveBlocking
    // (The CLI's resolve command handles the full resolution including ledger updates)
    if (context.pendingResolutions.length > 0) {
      const resolution = context.pendingResolutions[0];
      if (resolution !== undefined) {
        const activeSubstate = createActiveSubstate();
        const newSnapshot: ProtocolStateSnapshot = {
          ...snapshot,
          state: { phase, substate: activeSubstate },
        };

        await saveState(newSnapshot, statePath);

        return {
          transitioned: true,
          snapshot: newSnapshot,
          shouldContinue: true,
        };
      }
    }

    // Still blocked, wait for resolution
    return {
      transitioned: false,
      snapshot,
      shouldContinue: false,
      stopReason: 'BLOCKED',
    };
  }

  // In active state - evaluate possible transitions
  const validTargets = getValidTransitions(phase);

  if (validTargets.length === 0) {
    return {
      transitioned: false,
      snapshot,
      shouldContinue: false,
      stopReason: 'NO_VALID_TRANSITION',
    };
  }

  // Check for valid forward transition based on artifacts
  for (const targetPhase of validTargets) {
    if (hasRequiredArtifacts(targetPhase, context.artifacts)) {
      // Attempt transition
      const transitionResult = transition(snapshot.state, targetPhase, {
        artifacts: { available: context.artifacts },
      });

      if (transitionResult.success) {
        const newSnapshot: ProtocolStateSnapshot = {
          state: transitionResult.state,
          artifacts: [...snapshot.artifacts],
          blockingQueries: snapshot.blockingQueries,
        };

        await saveState(newSnapshot, statePath);

        // Send phase_change notification if phase changed
        if (snapshot.state.phase !== newSnapshot.state.phase) {
          try {
            if (notificationService !== undefined) {
              // Create a pseudo-BlockingRecord for phase_change event
              // Using the protocol state which contains phase info
              await notificationService.notify('phase_change', newSnapshot.state);
            }
          } catch {
            // Notification failure should not block protocol execution
          }
        }

        return {
          transitioned: true,
          snapshot: newSnapshot,
          shouldContinue: transitionResult.state.phase !== 'Complete',
        };
      }
    }
  }

  // No transition possible with current artifacts
  return {
    transitioned: false,
    snapshot,
    shouldContinue: true, // Continue waiting for artifacts
  };
}

/**
 * Create an orchestrator instance.
 *
 * @param options - Orchestrator options.
 * @returns Orchestrator state and control functions.
 */
export async function createOrchestrator(options: OrchestratorOptions): Promise<{
  state: OrchestratorState;
  tick: () => Promise<TickResult>;
  run: () => Promise<TickResult>;
  addArtifact: (artifact: ArtifactType) => void;
  resolveBlocking: (response: string) => void;
}> {
  const { statePath, operations, notificationService, maxTicks = 1000 } = options;

  // Load or create initial state
  const startupResult = await getStartupState(statePath);
  let currentSnapshot = startupResult.snapshot;

  const orchestratorState: OrchestratorState = {
    snapshot: currentSnapshot,
    tickCount: 0,
    running: false,
    lastTickResult: undefined,
    previousSnapshot: undefined,
  };

  // Mutable state for collected artifacts and resolutions
  const collectedArtifacts = new Set<ArtifactType>(currentSnapshot.artifacts);
  const pendingResolutions: BlockingResolution[] = [];

  /**
   * Execute a single tick.
   */
  async function tick(): Promise<TickResult> {
    const context: TickContext = {
      snapshot: currentSnapshot,
      artifacts: collectedArtifacts,
      pendingResolutions,
      operations,
      notificationService,
    };

    const result = await executeTick(context, statePath);

    // Check for entering blocking state (first time)
    if (
      notificationService !== undefined &&
      orchestratorState.previousSnapshot !== undefined &&
      result.transitioned &&
      result.snapshot.state.substate.kind === 'Blocking' &&
      orchestratorState.previousSnapshot.state.substate.kind !== 'Blocking'
    ) {
      try {
        const blockingRecord: BlockingRecord = {
          id: `blocking-${result.snapshot.state.phase}`,
          phase: result.snapshot.state.phase,
          query: result.snapshot.state.substate.query,
          blockedAt: result.snapshot.state.substate.blockedAt,
          resolved: false,
        };
        // Add optional fields if present
        if (result.snapshot.state.substate.options !== undefined) {
          (blockingRecord as { options?: readonly string[] }).options =
            result.snapshot.state.substate.options;
        }
        if (result.snapshot.state.substate.timeoutMs !== undefined) {
          (blockingRecord as { timeoutMs?: number }).timeoutMs =
            result.snapshot.state.substate.timeoutMs;
        }
        await notificationService.notify('block', blockingRecord);
      } catch {
        // Notification failure should not block protocol execution
      }
    }

    currentSnapshot = result.snapshot;
    orchestratorState.snapshot = result.snapshot;
    orchestratorState.tickCount++;
    orchestratorState.lastTickResult = result;
    orchestratorState.previousSnapshot = currentSnapshot;

    // Clear pending resolutions after processing
    if (result.transitioned && pendingResolutions.length > 0) {
      pendingResolutions.length = 0;
    }

    return result;
  }

  /**
   * Run the tick loop until completion, blocking, or failure.
   */
  async function run(): Promise<TickResult> {
    orchestratorState.running = true;

    let result: TickResult;

    do {
      result = await tick();

      if (orchestratorState.tickCount >= maxTicks) {
        orchestratorState.running = false;
        return {
          ...result,
          shouldContinue: false,
          stopReason: 'EXTERNAL_ERROR',
          error: `Maximum tick limit (${String(maxTicks)}) reached`,
        };
      }
    } while (result.shouldContinue);

    orchestratorState.running = false;
    return result;
  }

  /**
   * Add an artifact to the available set.
   */
  function addArtifact(artifact: ArtifactType): void {
    collectedArtifacts.add(artifact);
  }

  /**
   * Add a blocking resolution.
   */
  function addResolution(response: string): void {
    pendingResolutions.push({
      response,
      resolvedAt: new Date().toISOString(),
    });
  }

  return {
    state: orchestratorState,
    tick,
    run,
    addArtifact,
    resolveBlocking: addResolution,
  };
}

/**
 * Get the current status of the protocol from a state snapshot.
 *
 * @param snapshot - The state snapshot.
 * @returns Human-readable status information.
 */
export function getProtocolStatus(snapshot: ProtocolStateSnapshot): {
  phase: ProtocolPhase;
  substate: string;
  artifacts: readonly ArtifactType[];
  blocking: { query: string; blockedAt: string } | undefined;
  failed: { error: string; recoverable: boolean } | undefined;
} {
  const { state, artifacts } = snapshot;
  const { phase, substate } = state;

  let blocking: { query: string; blockedAt: string } | undefined;
  let failed: { error: string; recoverable: boolean } | undefined;

  if (substate.kind === 'Blocking') {
    blocking = {
      query: substate.query,
      blockedAt: substate.blockedAt,
    };
  } else if (substate.kind === 'Failed') {
    failed = {
      error: substate.error,
      recoverable: substate.recoverable,
    };
  }

  return {
    phase,
    substate: substate.kind,
    artifacts,
    blocking,
    failed,
  };
}
