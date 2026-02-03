/**
 * Tests for Blocking Behavior per DECISIONS.toml constraints.
 *
 * Verifies:
 * - block_001: BLOCKED state halts all phases
 * - block_002: blocked state is persistable and resumable
 * - block_003: only ledger decisions persist when resuming, not prior context
 * - block_004: CLI resume model - persist state, notify, exit process
 * - block_005: minimal notification message format
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeMkdir } from '../utils/safe-fs.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import type { ExternalOperations, TickContext } from './orchestrator.js';
import type { BlockingRecord } from './blocking.js';
import { saveState, loadState, serializeState, deserializeState } from './persistence.js';
import { executeTick, createOrchestrator, getProtocolStatus } from './orchestrator.js';
import { executeStatus, executeResume, executeResolve } from './cli.js';
import { createBlockingSubstate, createFailedSubstate, type BlockingSubstate } from './types.js';

describe('Blocking Behavior per DECISIONS.toml', () => {
  let testDir: string;
  let statePath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `blocking-constraints-test-${String(Date.now())}`);
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

  describe('block_001: BLOCKED state halts all phases', () => {
    it('BLOCKED state in Ignition prevents phase transition', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Ignition',
          substate: createBlockingSubstate({ query: 'Approve spec?' }),
        },
        artifacts: ['spec'], // Has artifact to transition
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(['spec'] as const),
        pendingResolutions: [],
        operations: mockOperations,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('BLOCKED');
      expect(result.snapshot.state.phase).toBe('Ignition');
    });

    it('BLOCKED state in Lattice prevents phase transition', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Lattice',
          substate: createBlockingSubstate({ query: 'Approve lattice?' }),
        },
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts'],
        blockingQueries: [],
      };

      const context: TickContext = {
        snapshot,
        artifacts: new Set(snapshot.artifacts),
        pendingResolutions: [],
        operations: mockOperations,
      };

      const result = await executeTick(context, statePath);

      expect(result.transitioned).toBe(false);
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toBe('BLOCKED');
    });

    it('BLOCKED state in any phase halts execution', async () => {
      const phases = [
        'Ignition',
        'Lattice',
        'CompositionAudit',
        'Injection',
        'Mesoscopic',
        'MassDefect',
      ] as const;

      for (const phase of phases) {
        const snapshot: ProtocolStateSnapshot = {
          state: {
            phase,
            substate: createBlockingSubstate({ query: `Blocked in ${phase}` }),
          },
          artifacts: [],
          blockingQueries: [],
        };

        const context: TickContext = {
          snapshot,
          artifacts: new Set(),
          pendingResolutions: [],
          operations: mockOperations,
        };

        const result = await executeTick(context, statePath);

        expect(result.shouldContinue).toBe(false);
        expect(result.stopReason).toBe('BLOCKED');
      }
    });
  });

  describe('block_002: blocked state is persistable and resumable', () => {
    it('BlockingSubstate can be serialized and deserialized', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(restored.state.phase).toBe('Lattice');
      expect(restored.state.substate.kind).toBe('Blocking');
      const restoredSubstate = restored.state.substate as BlockingSubstate;
      expect(restoredSubstate.query).toBe('Approve architecture?');
      expect(restoredSubstate.options).toEqual(['Yes', 'No', 'Revise']);
      expect(restoredSubstate.timeoutMs).toBe(300000);
      expect(restoredSubstate.blockedAt).toBeDefined();
    });

    it('blocked state can be saved and loaded from file', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Human intervention needed',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Injection', substate: blockingSubstate },
        artifacts: ['spec', 'latticeCode'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);
      const loaded = await loadState(statePath);

      expect(loaded.state.phase).toBe('Injection');
      expect(loaded.state.substate.kind).toBe('Blocking');
      expect(loaded.artifacts).toEqual(['spec', 'latticeCode']);
    });

    it('orchestrator can resume from persisted blocked state', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Pending approval',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const orchestrator = await createOrchestrator({
        statePath,
        operations: mockOperations,
      });

      expect(orchestrator.state.snapshot.state.phase).toBe('Lattice');
      expect(orchestrator.state.snapshot.state.substate.kind).toBe('Blocking');

      // Can resolve and resume
      orchestrator.resolveBlocking('Approved');
      const result = await orchestrator.tick();

      expect(result.snapshot.state.substate.kind).toBe('Active');
    });
  });

  describe('block_003: only ledger decisions persist when resuming, not prior context', () => {
    it('BlockingSubstate does not contain conversation history fields', () => {
      const substate = createBlockingSubstate({
        query: 'Test query',
        options: ['A', 'B'],
        timeoutMs: 60000,
      });

      // Verify BlockingSubstate only contains allowed fields
      const keys = Object.keys(substate) as (keyof BlockingSubstate)[];
      const allowedKeys: (keyof BlockingSubstate)[] = [
        'kind',
        'query',
        'options',
        'blockedAt',
        'timeoutMs',
      ];

      for (const key of keys) {
        expect(allowedKeys).toContain(key);
      }

      // Explicitly verify no conversation/context fields
      expect('conversationHistory' in substate).toBe(false);
      expect('context' in substate).toBe(false);
      expect('messages' in substate).toBe(false);
      expect('priorContext' in substate).toBe(false);
    });

    it('ProtocolStateSnapshot does not contain conversation history', () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Lattice',
          substate: createBlockingSubstate({ query: 'Test' }),
        },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      // Verify no conversation history fields in persisted state
      expect('conversationHistory' in parsed).toBe(false);
      expect('messages' in parsed).toBe(false);
      expect('context' in parsed).toBe(false);
      expect('priorContext' in parsed).toBe(false);

      // Verify only allowed top-level fields
      const allowedTopLevelKeys = [
        'version',
        'persistedAt',
        'phase',
        'substate',
        'artifacts',
        'blockingQueries',
      ];
      for (const key of Object.keys(parsed)) {
        expect(allowedTopLevelKeys).toContain(key);
      }
    });

    it('BlockingRecord only stores decision data, not conversation history', () => {
      const record: BlockingRecord = {
        id: 'blocking_test_123',
        phase: 'Lattice',
        query: 'Approve?',
        options: ['Yes', 'No'],
        blockedAt: new Date().toISOString(),
        timeoutMs: 60000,
        resolved: true,
        resolution: {
          response: 'Yes',
          resolvedAt: new Date().toISOString(),
          rationale: 'Approved after review',
        },
      };

      const keys = Object.keys(record);
      const allowedKeys = [
        'id',
        'phase',
        'query',
        'options',
        'blockedAt',
        'timeoutMs',
        'resolved',
        'resolution',
      ];

      for (const key of keys) {
        expect(allowedKeys).toContain(key);
      }

      // No conversation history fields
      expect('conversationHistory' in record).toBe(false);
      expect('messages' in record).toBe(false);
      expect('context' in record).toBe(false);
    });

    it('negative case: if blocked state stored conversation history, it would violate block_003', () => {
      // This test documents what WOULD be a violation
      // The actual implementation correctly does NOT store conversation history

      const blockingSubstate = createBlockingSubstate({ query: 'Test' });

      // Use Record<string, unknown> to check for forbidden fields (should not exist)
      const substateAsRecord = blockingSubstate as unknown as Record<string, unknown>;

      // These fields should NOT exist on BlockingSubstate
      expect(substateAsRecord.conversationHistory).toBeUndefined();
      expect(substateAsRecord.messages).toBeUndefined();
      expect(substateAsRecord.priorContext).toBeUndefined();
    });
  });

  describe('block_004: CLI resume model - persist state, notify, exit process', () => {
    it('CLI status command reads persisted blocking state', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Awaiting human decision',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Injection', substate: blockingSubstate },
        artifacts: ['spec', 'latticeCode'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('BLOCKED');
      expect(result.message).toContain('Awaiting human decision');
    });

    it('CLI resume command reports blocked status and exits', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Need human approval',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const result = await executeResume({
        command: 'resume',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('blocked');
      expect(result.message).toContain('Need human approval');
      expect(result.message).toContain('criticality resolve');
    });

    it('CLI resolve command stores response and transitions to active', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve implementation?',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Injection', substate: blockingSubstate },
        artifacts: ['spec', 'latticeCode'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const result = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: 'Approved',
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Resolution recorded');
      expect(result.message).toContain('Approved');

      // Verify state was updated
      const updatedSnapshot = await loadState(statePath);
      expect(updatedSnapshot.state.substate.kind).toBe('Active');
      expect(updatedSnapshot.blockingQueries.length).toBe(1);
      expect(updatedSnapshot.blockingQueries[0]?.resolution?.response).toBe('Approved');
    });

    it('CLI commands follow persist state, notify, exit model', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Lattice',
          substate: createBlockingSubstate({ query: 'Pending' }),
        },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      // 1. State is persisted (verified by loading)
      const loaded = await loadState(statePath);
      expect(loaded.state.substate.kind).toBe('Blocking');

      // 2. CLI notifies about blocking status
      const statusResult = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });
      expect(statusResult.message).toContain('BLOCKED');

      // 3. CLI provides exit code (0 for success, non-0 for errors)
      expect(statusResult.exitCode).toBe(0);

      // 4. After resolve, state is updated and user can resume
      const resolveResult = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: 'OK',
        verbose: false,
      });
      expect(resolveResult.exitCode).toBe(0);
      expect(resolveResult.message).toContain('criticality resume');
    });
  });

  describe('block_005: minimal notification message format', () => {
    it('blocking status message is minimal and actionable', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Lattice',
          substate: createBlockingSubstate({ query: 'Approval needed' }),
        },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      // Per block_005: message format := 'Criticality blocked. Run criticality status for details.'
      // The status command provides the details, so it should indicate:
      // 1. That protocol is blocked
      // 2. The query
      // 3. How to resolve
      expect(result.message).toContain('BLOCKED');
      expect(result.message).toContain('Approval needed');
      expect(result.message).toContain('criticality resolve');
    });

    it('resume command output indicates blocking with minimal message', async () => {
      // Injection phase requires all prior artifacts per getRequiredArtifactsForPhase
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Injection',
          substate: createBlockingSubstate({ query: 'Review required' }),
        },
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'validatedStructure'],
        blockingQueries: [],
      };

      await saveState(snapshot, statePath);

      const result = await executeResume({
        command: 'resume',
        statePath,
        verbose: false,
      });

      // Should be minimal: indicate blocked + query + how to continue
      expect(result.message).toContain('blocked');
      expect(result.message).toContain('Review required');
      expect(result.message).toContain('criticality resolve');
    });
  });

  describe('Example: BlockingSubstate should include blockedAt timestamp', () => {
    it('blockedAt is set when entering blocking state', () => {
      const before = Date.now();
      const substate = createBlockingSubstate({ query: 'Test' });
      const after = Date.now();

      expect(substate.blockedAt).toBeDefined();
      const blockedAtTime = new Date(substate.blockedAt).getTime();
      expect(blockedAtTime).toBeGreaterThanOrEqual(before);
      expect(blockedAtTime).toBeLessThanOrEqual(after);
    });

    it('blockedAt is preserved through serialization', () => {
      const substate = createBlockingSubstate({ query: 'Test' });
      const originalBlockedAt = substate.blockedAt;

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Lattice', substate },
        artifacts: [],
        blockingQueries: [],
      };

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      const restoredSubstate = restored.state.substate as BlockingSubstate;
      expect(restoredSubstate.blockedAt).toBe(originalBlockedAt);
    });

    it('blockedAt is in ISO 8601 format', () => {
      const substate = createBlockingSubstate({ query: 'Test' });

      // ISO 8601 format validation
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(substate.blockedAt).toMatch(isoRegex);
    });
  });

  describe('getProtocolStatus correctly reports blocking state', () => {
    it('returns blocking info from snapshot', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'What approach to use?',
      });

      const snapshot: ProtocolStateSnapshot = {
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
        blockingQueries: [],
      };

      const status = getProtocolStatus(snapshot);

      expect(status.phase).toBe('Lattice');
      expect(status.substate).toBe('Blocking');
      expect(status.blocking).toBeDefined();
      expect(status.blocking?.query).toBe('What approach to use?');
      expect(status.blocking?.blockedAt).toBe(blockingSubstate.blockedAt);
      expect(status.failed).toBeUndefined();
    });

    it('returns failed info when in failed state', () => {
      const snapshot: ProtocolStateSnapshot = {
        state: {
          phase: 'Injection',
          substate: createFailedSubstate({
            error: 'Compilation error',
            recoverable: true,
          }),
        },
        artifacts: ['spec', 'latticeCode'],
        blockingQueries: [],
      };

      const status = getProtocolStatus(snapshot);

      expect(status.substate).toBe('Failed');
      expect(status.failed).toBeDefined();
      expect(status.failed?.error).toBe('Compilation error');
      expect(status.failed?.recoverable).toBe(true);
      expect(status.blocking).toBeUndefined();
    });
  });
});
