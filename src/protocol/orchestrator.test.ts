/**
 * Tests for Protocol Orchestrator tick loop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Guards,
  Actions,
  executeTick,
  createOrchestrator,
  getProtocolStatus,
  type TickContext,
  type ExternalOperations,
} from './orchestrator.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import type { ArtifactType } from './transitions.js';
import { createActiveState, createBlockingSubstate, createFailedSubstate } from './types.js';
import { saveState } from './persistence.js';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeMkdir } from '../utils/safe-fs.js';
import type { NotificationService } from '../notifications/service.js';

describe('Protocol Orchestrator', () => {
  describe('Guards', () => {
    const createContext = (
      snapshot: ProtocolStateSnapshot,
      artifacts: ArtifactType[] = []
    ): TickContext => ({
      snapshot,
      artifacts: new Set(artifacts) as ReadonlySet<ArtifactType>,
      pendingResolutions: [],
      operations: {} as ExternalOperations,
      notificationService: undefined,
    });

    describe('Guards.and', () => {
      it('returns true when all guards pass', () => {
        const guard = Guards.and(Guards.always(), Guards.always());
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(true);
      });

      it('returns false when any guard fails', () => {
        const guard = Guards.and(Guards.always(), Guards.never());
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });

    describe('Guards.or', () => {
      it('returns true when any guard passes', () => {
        const guard = Guards.or(Guards.never(), Guards.always());
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(true);
      });

      it('returns false when all guards fail', () => {
        const guard = Guards.or(Guards.never(), Guards.never());
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });

    describe('Guards.not', () => {
      it('inverts guard result', () => {
        const guard = Guards.not(Guards.always());
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });

    describe('Guards.hasArtifacts', () => {
      it('returns true when all artifacts present', () => {
        const guard = Guards.hasArtifacts('spec' as never);
        const ctx = createContext(
          { state: createActiveState('Ignition'), artifacts: [], blockingQueries: [] },
          ['spec']
        );
        expect(guard(ctx)).toBe(true);
      });

      it('returns false when artifact missing', () => {
        const guard = Guards.hasArtifacts('spec' as never);
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });

    describe('Guards.isActive', () => {
      it('returns true for active substate', () => {
        const guard = Guards.isActive();
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(true);
      });

      it('returns false for blocking substate', () => {
        const guard = Guards.isActive();
        const ctx = createContext({
          state: {
            phase: 'Ignition',
            substate: createBlockingSubstate({ query: 'Test?' }),
          },
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });

    describe('Guards.blockingResolved', () => {
      it('returns true when resolutions pending', () => {
        const guard = Guards.blockingResolved();
        const ctx: TickContext = {
          snapshot: { state: createActiveState('Ignition'), artifacts: [], blockingQueries: [] },
          artifacts: new Set(),
          pendingResolutions: [{ response: 'yes', resolvedAt: new Date().toISOString() }],
          operations: {} as ExternalOperations,
          notificationService: undefined,
        };
        expect(guard(ctx)).toBe(true);
      });

      it('returns false when no resolutions', () => {
        const guard = Guards.blockingResolved();
        const ctx = createContext({
          state: createActiveState('Ignition'),
          artifacts: [],
          blockingQueries: [],
        });
        expect(guard(ctx)).toBe(false);
      });
    });
  });

  describe('Actions', () => {
    describe('Actions.sequence', () => {
      it('executes actions in order', async () => {
        const order: number[] = [];
        const action = Actions.sequence(
          () => {
            order.push(1);
            return Promise.resolve({ success: true });
          },
          () => {
            order.push(2);
            return Promise.resolve({ success: true });
          }
        );

        const result = await action({} as TickContext);

        expect(result.success).toBe(true);
        expect(order).toEqual([1, 2]);
      });

      it('stops on first failure', async () => {
        const order: number[] = [];
        const action = Actions.sequence(
          () => {
            order.push(1);
            return Promise.resolve({ success: false, error: 'failed' });
          },
          () => {
            order.push(2);
            return Promise.resolve({ success: true });
          }
        );

        const result = await action({} as TickContext);

        expect(result.success).toBe(false);
        expect(order).toEqual([1]);
      });

      it('collects artifacts from all actions', async () => {
        const action = Actions.sequence(
          Actions.produceArtifacts('spec' as never),
          Actions.produceArtifacts('latticeCode' as never)
        );

        const result = await action({} as TickContext);

        expect(result.success).toBe(true);
        expect(result.artifacts).toEqual(['spec', 'latticeCode']);
      });
    });

    describe('Actions.noop', () => {
      it('returns success with no artifacts', async () => {
        const action = Actions.noop();
        const result = await action({} as TickContext);

        expect(result.success).toBe(true);
        expect(result.artifacts).toBeUndefined();
      });
    });

    describe('Actions.produceArtifacts', () => {
      it('returns specified artifacts', async () => {
        const action = Actions.produceArtifacts('spec' as never, 'witnesses' as never);
        const result = await action({} as TickContext);

        expect(result.success).toBe(true);
        expect(result.artifacts).toEqual(['spec', 'witnesses']);
      });
    });
  });

  describe('getProtocolStatus', () => {
    it('returns active status correctly', () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState('Lattice'),
        artifacts: ['spec'],
        blockingQueries: [],
      };

      const status = getProtocolStatus(snapshot);

      expect(status.phase).toBe('Lattice');
      expect(status.substate).toBe('Active');
      expect(status.artifacts).toEqual(['spec']);
      expect(status.blocking).toBeUndefined();
      expect(status.failed).toBeUndefined();
    });

    it('returns blocking status correctly', () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Ignition',
          substate: createBlockingSubstate({ query: 'How should auth work?' }),
        },
        artifacts: [],
        blockingQueries: [],
      };

      const status = getProtocolStatus(snapshot);

      expect(status.phase).toBe('Ignition');
      expect(status.substate).toBe('Blocking');
      expect(status.blocking).toBeDefined();
      expect(status.blocking?.query).toBe('How should auth work?');
    });

    it('returns failed status correctly', () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Injection',
          substate: createFailedSubstate({ error: 'Compilation failed', recoverable: true }),
        },
        artifacts: ['spec', 'latticeCode'],
        blockingQueries: [],
      };

      const status = getProtocolStatus(snapshot);

      expect(status.phase).toBe('Injection');
      expect(status.substate).toBe('Failed');
      expect(status.failed).toBeDefined();
      expect(status.failed?.error).toBe('Compilation failed');
      expect(status.failed?.recoverable).toBe(true);
    });
  });

  describe('executeTick', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `orchestrator-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const mockOperations: ExternalOperations = {
      executeModelCall: vi.fn().mockResolvedValue({ success: true }),
      runCompilation: vi.fn().mockResolvedValue({ success: true }),
      runTests: vi.fn().mockResolvedValue({ success: true }),
      archivePhaseArtifacts: vi.fn().mockResolvedValue({ success: true }),
      sendBlockingNotification: vi.fn().mockResolvedValue(undefined),
    };

    it('returns COMPLETE when in Complete phase', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState('Complete'),
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'finalArtifact'],
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(snapshot.artifacts),
        pendingResolutions: [],
        operations: mockOperations,
        notificationService: undefined,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('COMPLETE');
    });

    it('returns FAILED when in failed state', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Injection',
          substate: createFailedSubstate({ error: 'Test failure' }),
        },
        artifacts: [],
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(),
        pendingResolutions: [],
        operations: mockOperations,
        notificationService: undefined,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('FAILED');
      expect(result.error).toBe('Test failure');
    });

    it('returns BLOCKED when in blocking state without resolution', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Ignition',
          substate: createBlockingSubstate({ query: 'Question?' }),
        },
        artifacts: [],
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(),
        pendingResolutions: [],
        operations: mockOperations,
        notificationService: undefined,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('BLOCKED');
    });

    it('transitions from Ignition to Lattice when spec artifact available', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState('Ignition'),
        artifacts: ['spec'],
        blockingQueries: [],
      };

      // Save initial state
      await saveState(snapshot, statePath);

      const context: TickContext = {
        snapshot,
        artifacts: new Set(['spec'] as const),
        pendingResolutions: [],
        operations: mockOperations,
        notificationService: undefined,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(true);
      expect(result.snapshot.state.phase).toBe('Lattice');
      expect(result.shouldContinue).toBe(true);
    });

    it('does not transition without required artifacts', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState('Ignition'),
        artifacts: [],
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(),
        pendingResolutions: [],
        operations: mockOperations,
        notificationService: undefined,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.snapshot.state.phase).toBe('Ignition');
      expect(result.shouldContinue).toBe(true); // Still waiting for artifacts
    });
  });

  describe('createOrchestrator', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `orchestrator-create-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const mockOperations: ExternalOperations = {
      executeModelCall: vi.fn().mockResolvedValue({ success: true }),
      runCompilation: vi.fn().mockResolvedValue({ success: true }),
      runTests: vi.fn().mockResolvedValue({ success: true }),
      archivePhaseArtifacts: vi.fn().mockResolvedValue({ success: true }),
      sendBlockingNotification: vi.fn().mockResolvedValue(undefined),
    };

    it('creates orchestrator with initial state', async () => {
      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
      });

      expect(orchestrator.state.snapshot.state.phase).toBe('Ignition');
      expect(orchestrator.state.tickCount).toBe(0);
      expect(orchestrator.state.running).toBe(false);
    });

    it('tick increments tick count', async () => {
      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
      });

      await orchestrator.tick();

      expect(orchestrator.state.tickCount).toBe(1);
    });

    it('addArtifact makes artifacts available for transitions', async () => {
      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
      });

      orchestrator.addArtifact('spec');
      const result = await orchestrator.tick();

      // Should transition from Ignition to Lattice with spec artifact
      expect(result.snapshot.state.phase).toBe('Lattice');
    });

    it('resolveBlocking enables transition from blocked state', async () => {
      // Create state file with blocking state
      const blockingSnapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Ignition',
          substate: createBlockingSubstate({ query: 'Question?' }),
        },
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(blockingSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
      });

      // Resolve the blocking query
      orchestrator.resolveBlocking('Yes, proceed');
      const result = await orchestrator.tick();

      // Should be back to active state
      expect(result.snapshot.state.substate.kind).toBe('Active');
    });

    it('run executes until completion or stop condition', async () => {
      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        maxTicks: 10,
      });

      const result = await orchestrator.run();

      // Should stop because max ticks reached (no artifacts to transition)
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('EXTERNAL_ERROR');
      expect(orchestrator.state.tickCount).toBeGreaterThan(0);
    });
  });

  describe('NotificationService Integration', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `orchestrator-notify-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    const mockOperations: ExternalOperations = {
      executeModelCall: vi.fn().mockResolvedValue({ success: true }),
      runCompilation: vi.fn().mockResolvedValue({ success: true }),
      runTests: vi.fn().mockResolvedValue({ success: true }),
      archivePhaseArtifacts: vi.fn().mockResolvedValue({ success: true }),
      sendBlockingNotification: vi.fn().mockResolvedValue(undefined),
    };

    it('sends block notification when entering blocking state', async () => {
      const mockNotify = vi.fn().mockResolvedValue({
        results: [],
        allSucceeded: true,
        anySucceeded: false,
      });

      const mockNotificationService = {
        notify: mockNotify,
        hasSubscribers: vi.fn().mockReturnValue(false),
        send: vi.fn().mockResolvedValue({
          results: [],
          allSucceeded: true,
          anySucceeded: false,
        }),
      } as unknown as NotificationService;

      // Create state with active substate
      const activeSnapshot: ProtocolStateSnapshot = {
        state: createActiveState('Ignition'),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(activeSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        notificationService: mockNotificationService,
      });

      // Execute a tick that will keep us in active state (no artifacts)
      await orchestrator.tick();

      // Now create a blocking state manually
      const blockingSnapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Ignition',
          substate: createBlockingSubstate({ query: 'Block test?' }),
        },
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(blockingSnapshot, statePath);

      // Next tick should detect entering blocking and send notification
      const result = await orchestrator.tick();

      expect(result.stopReason).toBe('BLOCKED');
      expect(mockNotify).toHaveBeenCalledWith(
        'block',
        expect.objectContaining({
          phase: 'Ignition',
          query: 'Block test?',
          resolved: false,
        })
      );
    });

    it('sends complete notification when protocol completes', async () => {
      const mockNotify = vi.fn().mockResolvedValue({
        results: [],
        allSucceeded: true,
        anySucceeded: false,
      });

      const mockNotificationService = {
        notify: mockNotify,
        hasSubscribers: vi.fn().mockReturnValue(false),
        send: vi.fn().mockResolvedValue({
          results: [],
          allSucceeded: true,
          anySucceeded: false,
        }),
      } as unknown as NotificationService;

      // Create state in Complete phase
      const completeSnapshot: ProtocolStateSnapshot = {
        state: createActiveState('Complete'),
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'finalArtifact'],
        blockingQueries: [],
      };
      await saveState(completeSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        notificationService: mockNotificationService,
      });

      const result = await orchestrator.tick();

      expect(result.stopReason).toBe('COMPLETE');
      expect(mockNotify).toHaveBeenCalledWith('complete', completeSnapshot.state);
    });

    it('sends error notification when protocol fails', async () => {
      const mockNotify = vi.fn().mockResolvedValue({
        results: [],
        allSucceeded: true,
        anySucceeded: false,
      });

      const mockNotificationService = {
        notify: mockNotify,
        hasSubscribers: vi.fn().mockReturnValue(false),
        send: vi.fn().mockResolvedValue({
          results: [],
          allSucceeded: true,
          anySucceeded: false,
        }),
      } as unknown as NotificationService;

      // Create state in failed substate
      const failedSnapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Injection',
          substate: createFailedSubstate({ error: 'Test failure' }),
        },
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(failedSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        notificationService: mockNotificationService,
      });

      const result = await orchestrator.tick();

      expect(result.stopReason).toBe('FAILED');
      expect(result.error).toBe('Test failure');
      expect(mockNotify).toHaveBeenCalledWith('error', failedSnapshot.state);
    });

    it('sends phase_change notification on phase transition', async () => {
      const mockNotify = vi.fn().mockResolvedValue({
        results: [],
        allSucceeded: true,
        anySucceeded: false,
      });

      const mockNotificationService = {
        notify: mockNotify,
        hasSubscribers: vi.fn().mockReturnValue(false),
        send: vi.fn().mockResolvedValue({
          results: [],
          allSucceeded: true,
          anySucceeded: false,
        }),
      } as unknown as NotificationService;

      // Create state in Ignition phase with spec artifact
      const initialSnapshot: ProtocolStateSnapshot = {
        state: createActiveState('Ignition'),
        artifacts: ['spec'],
        blockingQueries: [],
      };
      await saveState(initialSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        notificationService: mockNotificationService,
      });

      // Tick should transition to Lattice and send phase_change notification
      const result = await orchestrator.tick();

      expect(result.transitioned).toBe(true);
      expect(result.snapshot.state.phase).toBe('Lattice');
      expect(mockNotify).toHaveBeenCalledWith('phase_change', result.snapshot.state);
    });

    it('notification failure does not block protocol execution', async () => {
      const mockNotify = vi.fn().mockRejectedValue(new Error('Notification failed'));

      const mockNotificationService = {
        notify: mockNotify,
        hasSubscribers: vi.fn().mockReturnValue(false),
        send: vi.fn().mockRejectedValue(new Error('Notification failed')),
      } as unknown as NotificationService;

      // Create state in Complete phase
      const completeSnapshot: ProtocolStateSnapshot = {
        state: createActiveState('Complete'),
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'finalArtifact'],
        blockingQueries: [],
      };
      await saveState(completeSnapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
        notificationService: mockNotificationService,
      });

      // Should not throw despite notification failure
      const result = await orchestrator.tick();

      expect(result.stopReason).toBe('COMPLETE');
      expect(mockNotify).toHaveBeenCalledWith('complete', completeSnapshot.state);
    });
  });
});

// Import afterEach from vitest
import { afterEach } from 'vitest';
