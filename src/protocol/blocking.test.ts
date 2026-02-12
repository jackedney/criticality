/**
 * Tests for Blocking State Management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateBlockingQueryId,
  enterBlocking,
  resolveBlocking,
  checkTimeout,
  handleTimeout,
  getRemainingTimeout,
  hasTimeout,
  getTimeoutDeadline,
  type BlockingRecord,
} from './blocking.js';
import {
  createActiveState,
  createBlockedState,
  createCompleteState,
  isActiveState,
  isBlockedState,
  isFailedState,
  getPhase,
  PROTOCOL_PHASES,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
  createLatticePhaseState,
  createLatticeGeneratingStructure,
  createInjectionPhaseState,
  createInjectionSelectingFunction,
  createMesoscopicPhaseState,
  createMesoscopicGeneratingTests,
  createCompositionAuditPhaseState,
  createCompositionAuditAuditing,
  createMassDefectPhaseState,
  createMassDefectAnalyzingComplexity,
  type ProtocolPhase,
  type ProtocolState,
} from './types.js';
import { Ledger } from '../ledger/index.js';

describe('Blocking State Management', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger({ project: 'test-project' });
  });

  function createActiveStateForPhase(phase: ProtocolPhase): ProtocolState {
    switch (phase) {
      case 'Ignition':
        return createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
      case 'Lattice':
        return createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
      case 'CompositionAudit':
        return createActiveState(
          createCompositionAuditPhaseState(createCompositionAuditAuditing(0))
        );
      case 'Injection':
        return createActiveState(createInjectionPhaseState(createInjectionSelectingFunction()));
      case 'Mesoscopic':
        return createActiveState(createMesoscopicPhaseState(createMesoscopicGeneratingTests()));
      case 'MassDefect':
        return createActiveState(createMassDefectPhaseState(createMassDefectAnalyzingComplexity()));
      case 'Complete':
        return createCompleteState([]);
    }
  }

  describe('generateBlockingQueryId', () => {
    it('generates unique IDs for the same phase', () => {
      const id1 = generateBlockingQueryId('Ignition');
      const id2 = generateBlockingQueryId('Ignition');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^blocking_ignition_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^blocking_ignition_\d+_[a-z0-9]+$/);
    });

    it('includes phase name in lowercase', () => {
      const id = generateBlockingQueryId('CompositionAudit');
      expect(id).toMatch(/^blocking_compositionaudit_/);
    });
  });

  describe('enterBlocking', () => {
    describe('Acceptance Criteria: Any phase can enter blocking state', () => {
      it('can enter blocking from Ignition phase', () => {
        const state = createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Ignition',
          query: 'Approve spec?',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(isBlockedState(result.state)).toBe(true);
          expect(getPhase(result.state)).toBe('Ignition');
        }
      });

      it('can enter blocking from any phase except Complete', () => {
        for (const phase of PROTOCOL_PHASES) {
          if (phase === 'Complete') {
            continue;
          }

          const state = createActiveStateForPhase(phase);
          const result = enterBlocking(state, {
            reason: 'user_requested',
            phase,
            query: `Block at ${phase}?`,
          });

          expect(result.success).toBe(true);
          if (result.success) {
            expect(getPhase(result.state)).toBe(phase);
            expect(isBlockedState(result.state)).toBe(true);
          }
        }
      });

      it('cannot enter blocking from Complete phase', () => {
        const state = createCompleteState([]);
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Complete',
          query: 'Block?',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_PHASE');
          expect(result.error.message).toContain('Complete phase');
        }
      });
    });

    describe('Acceptance Criteria: Blocking records query and available options', () => {
      it('records query in blocked state', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve decision graph?',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(isBlockedState(result.state)).toBe(true);
          expect(result.state.query).toBe('Approve decision graph?');
        }
      });

      it('records available options in blocked state', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Choose approach?',
          options: ['Option A', 'Option B', 'Option C'],
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(isBlockedState(result.state)).toBe(true);
          expect(result.state.options).toEqual(['Option A', 'Option B', 'Option C']);
        }
      });

      it('records query and options in blocking record', () => {
        const state = createActiveState(
          createInjectionPhaseState(createInjectionSelectingFunction())
        );
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Injection',
          query: 'Approve implementation?',
          options: ['Yes', 'No'],
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.record.query).toBe('Approve implementation?');
          expect(result.record.options).toEqual(['Yes', 'No']);
          expect(result.record.phase).toBe('Injection');
          expect(result.record.resolved).toBe(false);
        }
      });
    });

    describe('Example: enter blocking state with query "Approve architecture?"', () => {
      it('enters blocking state with architecture approval query', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const result = enterBlocking(state, {
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          timeoutMs: 300000, // 5 minutes
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('Lattice');
          expect(isBlockedState(result.state)).toBe(true);

          expect(result.state.query).toBe('Approve architecture?');
          expect(result.state.options).toEqual(['Yes', 'No', 'Revise']);
          expect(result.state.timeoutMs).toBe(300000);

          expect(result.record.query).toBe('Approve architecture?');
          expect(result.record.options).toEqual(['Yes', 'No', 'Revise']);
          expect(result.record.timeoutMs).toBe(300000);
          expect(result.record.id).toMatch(/^blocking_lattice_/);
        }
      });
    });

    it('uses provided ID if specified', () => {
      const state = createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
      const result = enterBlocking(state, {
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Test?',
        id: 'custom-id-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.record.id).toBe('custom-id-123');
      }
    });

    it('returns error if already in blocking state', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Already blocking?',
      });
      const result = enterBlocking(state, {
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'New query?',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALREADY_BLOCKING');
        expect(result.error.message).toContain('Already blocking?');
      }
    });

    it('records blockedAt timestamp', () => {
      const state = createActiveState(
        createMesoscopicPhaseState(createMesoscopicGeneratingTests())
      );
      const before = Date.now();
      const result = enterBlocking(state, {
        reason: 'user_requested',
        phase: 'Mesoscopic',
        query: 'Block?',
      });
      const after = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        const blockedAtTime = new Date(result.record.blockedAt).getTime();
        expect(blockedAtTime).toBeGreaterThanOrEqual(before);
        expect(blockedAtTime).toBeLessThanOrEqual(after);
      }
    });
  });

  describe('resolveBlocking', () => {
    describe('Acceptance Criteria: Resolution unblocks and records decision to ledger', () => {
      it('transitions to active state on resolution', () => {
        const activeState = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const enterResult = enterBlocking(activeState, {
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve?',
          options: ['Yes', 'No'],
        });

        expect(enterResult.success).toBe(true);
        if (!enterResult.success) {
          return;
        }

        const resolveResult = resolveBlocking(
          enterResult.state,
          enterResult.record,
          { response: 'Yes' },
          ledger
        );

        expect(resolveResult.success).toBe(true);
        if (resolveResult.success) {
          expect(isActiveState(resolveResult.state)).toBe(true);
          expect(getPhase(resolveResult.state)).toBe('Lattice');
        }
      });

      it('records decision to ledger with human_resolution source', () => {
        const activeState = createActiveState(
          createInjectionPhaseState(createInjectionSelectingFunction())
        );
        const enterResult = enterBlocking(activeState, {
          reason: 'user_requested',
          phase: 'Injection',
          query: 'Proceed?',
          options: ['Yes', 'No'],
        });

        expect(enterResult.success).toBe(true);
        if (!enterResult.success) {
          return;
        }

        const resolveResult = resolveBlocking(
          enterResult.state,
          enterResult.record,
          { response: 'Yes', rationale: 'Code review passed' },
          ledger
        );

        expect(resolveResult.success).toBe(true);
        if (resolveResult.success) {
          expect(resolveResult.decision.source).toBe('human_resolution');
          expect(resolveResult.decision.category).toBe('blocking');
          expect(resolveResult.decision.confidence).toBe('canonical');
          expect(resolveResult.decision.human_query_id).toBe(enterResult.record.id);
          expect(resolveResult.decision.constraint).toContain('Yes');
          expect(resolveResult.decision.rationale).toBe('Code review passed');
        }
      });
    });

    describe('Example: resolve blocking state records human decision', () => {
      it('resolves architecture approval and records to ledger', () => {
        const activeState = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const enterResult = enterBlocking(activeState, {
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
        });

        expect(enterResult.success).toBe(true);
        if (!enterResult.success) {
          return;
        }

        const resolveResult = resolveBlocking(
          enterResult.state,
          enterResult.record,
          {
            response: 'Yes',
            rationale: 'Architecture meets all requirements and follows best practices',
          },
          ledger
        );

        expect(resolveResult.success).toBe(true);
        if (resolveResult.success) {
          // State is back to active
          expect(isActiveState(resolveResult.state)).toBe(true);

          // Decision is recorded
          expect(resolveResult.decision.constraint).toContain('Approve architecture?');
          expect(resolveResult.decision.constraint).toContain('Yes');
          expect(resolveResult.decision.rationale).toContain('meets all requirements');

          // Record is updated
          expect(resolveResult.record.resolved).toBe(true);
          expect(resolveResult.record.resolution?.response).toBe('Yes');

          // Verify in ledger
          expect(ledger.size).toBe(1);
          const decisions = ledger.getDecisions();
          expect(decisions[0]?.human_query_id).toBe(enterResult.record.id);
        }
      });
    });

    it('validates response is in options when options provided', () => {
      const activeState = createActiveState(
        createLatticePhaseState(createLatticeGeneratingStructure())
      );
      const enterResult = enterBlocking(activeState, {
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Choose?',
        options: ['A', 'B', 'C'],
      });

      expect(enterResult.success).toBe(true);
      if (!enterResult.success) {
        return;
      }

      const resolveResult = resolveBlocking(
        enterResult.state,
        enterResult.record,
        { response: 'D' }, // Not in options
        ledger
      );

      expect(resolveResult.success).toBe(false);
      if (!resolveResult.success) {
        expect(resolveResult.error.code).toBe('INVALID_RESPONSE');
        expect(resolveResult.error.message).toContain('D');
        expect(resolveResult.error.message).toContain('A, B, C');
      }
    });

    it('allows custom response when allowCustomResponse is true', () => {
      const activeState = createActiveState(
        createLatticePhaseState(createLatticeGeneratingStructure())
      );
      const enterResult = enterBlocking(activeState, {
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Choose?',
        options: ['A', 'B'],
      });

      expect(enterResult.success).toBe(true);
      if (!enterResult.success) {
        return;
      }

      const resolveResult = resolveBlocking(
        enterResult.state,
        enterResult.record,
        { response: 'Custom answer', allowCustomResponse: true },
        ledger
      );

      expect(resolveResult.success).toBe(true);
      if (resolveResult.success) {
        expect(resolveResult.record.resolution?.response).toBe('Custom answer');
      }
    });

    it('returns error if not in blocking state', () => {
      const activeState = createActiveState(
        createLatticePhaseState(createLatticeGeneratingStructure())
      );
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const result = resolveBlocking(activeState, record, { response: 'Yes' }, ledger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_BLOCKING');
      }
    });

    it('returns error if already resolved', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Test?',
      });
      const record: BlockingRecord = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: true,
        resolution: {
          queryId: 'test-id',
          response: 'Already',
          resolvedAt: new Date().toISOString(),
        },
      };

      const result = resolveBlocking(state, record, { response: 'Yes' }, ledger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALREADY_RESOLVED');
      }
    });
  });

  describe('checkTimeout', () => {
    describe('Acceptance Criteria: Track timeout for blocked states', () => {
      it('reports not timed out when within timeout', () => {
        const record = {
          id: 'test-id',
          phase: 'Lattice' as const,
          query: 'Test?',
          blockedAt: new Date().toISOString(),
          timeoutMs: 60000, // 1 minute
          resolved: false,
        };

        const result = checkTimeout(record);

        expect(result.timedOut).toBe(false);
        if (!result.timedOut) {
          expect(result.remainingMs).toBeDefined();
          expect(result.remainingMs).toBeGreaterThan(0);
          expect(result.remainingMs).toBeLessThanOrEqual(60000);
        }
      });

      it('reports timed out when past timeout', () => {
        const blockedAt = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
        const record = {
          id: 'test-id',
          phase: 'Lattice' as const,
          query: 'Test?',
          blockedAt,
          timeoutMs: 60000, // 1 minute timeout
          resolved: false,
        };

        const result = checkTimeout(record);

        expect(result.timedOut).toBe(true);
        if (result.timedOut) {
          expect(result.exceededByMs).toBeGreaterThanOrEqual(59000); // ~1 minute exceeded
        }
      });

      it('reports not timed out when no timeout configured', () => {
        const record = {
          id: 'test-id',
          phase: 'Lattice' as const,
          query: 'Test?',
          blockedAt: new Date().toISOString(),
          resolved: false,
        };

        const result = checkTimeout(record);

        expect(result.timedOut).toBe(false);
        if (!result.timedOut) {
          expect(result.remainingMs).toBeUndefined();
        }
      });
    });

    it('uses provided now time for testing', () => {
      const blockedAt = new Date('2024-01-01T00:00:00.000Z');
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: blockedAt.toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      // Before timeout
      const beforeResult = checkTimeout(record, blockedAt.getTime() + 30000);
      expect(beforeResult.timedOut).toBe(false);
      if (!beforeResult.timedOut) {
        expect(beforeResult.remainingMs).toBe(30000);
      }

      // After timeout
      const afterResult = checkTimeout(record, blockedAt.getTime() + 90000);
      expect(afterResult.timedOut).toBe(true);
      if (afterResult.timedOut) {
        expect(afterResult.exceededByMs).toBe(30000);
      }
    });
  });

  describe('handleTimeout', () => {
    describe('Negative case: timeout on blocked state triggers appropriate handling', () => {
      it('handles timeout with escalate strategy', () => {
        const state = createBlockedState({
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Test?',
          timeoutMs: 60000,
        });
        const record = {
          id: 'test-id',
          phase: 'Lattice' as const,
          query: 'Test?',
          blockedAt: new Date(Date.now() - 120000).toISOString(),
          timeoutMs: 60000,
          resolved: false,
        };

        const result = handleTimeout(state, record, { strategy: 'escalate' });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('escalation');
        }
      });

      it('handles timeout with default strategy', () => {
        const state = createBlockedState({
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Test?',
          options: ['Yes', 'No'],
          timeoutMs: 60000,
        });
        const record = {
          id: 'test-id',
          phase: 'Lattice' as const,
          query: 'Test?',
          options: ['Yes', 'No'] as const,
          blockedAt: new Date(Date.now() - 120000).toISOString(),
          timeoutMs: 60000,
          resolved: false,
        };

        const result = handleTimeout(
          state,
          record,
          {
            strategy: 'default',
            defaultResponse: 'No',
            rationale: 'Timeout - defaulting to No',
          },
          ledger
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(isActiveState(result.state)).toBe(true);
          expect(result.record.resolved).toBe(true);
          expect(result.record.resolution?.response).toBe('No');
          expect(result.decision).toBeDefined();
          expect(result.decision?.constraint).toContain('No');
        }
      });

      it('handles timeout with fail strategy', () => {
        const state = createBlockedState({
          reason: 'user_requested',
          phase: 'Injection',
          query: 'Critical decision?',
          timeoutMs: 30000,
        });
        const record = {
          id: 'test-id',
          phase: 'Injection' as const,
          query: 'Critical decision?',
          blockedAt: new Date(Date.now() - 60000).toISOString(),
          timeoutMs: 30000,
          resolved: false,
        };

        const result = handleTimeout(state, record, { strategy: 'fail' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(isFailedState(result.state)).toBe(true);
          if (isFailedState(result.state)) {
            expect(result.state.error).toContain('Timeout');
            expect(result.state.code).toBe('BLOCKING_TIMEOUT');
            expect(result.state.recoverable).toBe(true);
          }
          expect(result.record.resolved).toBe(true);
          expect(result.record.resolution?.response).toBe('TIMEOUT_FAILURE');
        }
      });
    });

    it('returns error if not in blocking state', () => {
      const state = createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      const result = handleTimeout(state, record, { strategy: 'fail' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_BLOCKING');
      }
    });

    it('returns error if no timeout configured', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Test?',
      });
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const result = handleTimeout(state, record, { strategy: 'fail' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_TIMEOUT');
      }
    });

    it('returns error for default strategy without defaultResponse', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Test?',
        timeoutMs: 60000,
      });
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      const result = handleTimeout(state, record, { strategy: 'default' }, ledger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
        expect(result.error.message).toContain('Default response required');
      }
    });
  });

  describe('getRemainingTimeout', () => {
    it('returns remaining milliseconds when within timeout', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      const remaining = getRemainingTimeout(record);

      expect(remaining).toBeDefined();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60000);
    });

    it('returns undefined when timed out', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date(Date.now() - 120000).toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      const remaining = getRemainingTimeout(record);

      expect(remaining).toBeUndefined();
    });

    it('returns undefined when no timeout configured', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const remaining = getRemainingTimeout(record);

      expect(remaining).toBeUndefined();
    });
  });

  describe('hasTimeout', () => {
    it('returns true when timeout is configured', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        timeoutMs: 60000,
        resolved: false,
      };

      expect(hasTimeout(record)).toBe(true);
    });

    it('returns false when no timeout configured', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      expect(hasTimeout(record)).toBe(false);
    });
  });

  describe('getTimeoutDeadline', () => {
    it('returns deadline timestamp when timeout configured', () => {
      const blockedAt = new Date('2024-01-01T12:00:00.000Z');
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: blockedAt.toISOString(),
        timeoutMs: 60000, // 1 minute
        resolved: false,
      };

      const deadline = getTimeoutDeadline(record);

      expect(deadline).toBe('2024-01-01T12:01:00.000Z');
    });

    it('returns undefined when no timeout configured', () => {
      const record = {
        id: 'test-id',
        phase: 'Lattice' as const,
        query: 'Test?',
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const deadline = getTimeoutDeadline(record);

      expect(deadline).toBeUndefined();
    });
  });

  describe('Integration: Full blocking workflow', () => {
    it('completes full workflow: enter -> check timeout -> resolve', () => {
      // 1. Enter blocking state
      const activeState = createActiveState(
        createLatticePhaseState(createLatticeGeneratingStructure())
      );
      const enterResult = enterBlocking(activeState, {
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });

      expect(enterResult.success).toBe(true);
      if (!enterResult.success) {
        return;
      }

      // 2. Check timeout (should not be timed out)
      const timeoutResult = checkTimeout(enterResult.record);
      expect(timeoutResult.timedOut).toBe(false);
      if (!timeoutResult.timedOut) {
        expect(timeoutResult.remainingMs).toBeGreaterThan(299000);
      }

      // 3. Resolve blocking state
      const resolveResult = resolveBlocking(
        enterResult.state,
        enterResult.record,
        {
          response: 'Yes',
          rationale: 'Architecture approved after team review',
        },
        ledger
      );

      expect(resolveResult.success).toBe(true);
      if (resolveResult.success) {
        // State is back to active
        expect(isActiveState(resolveResult.state)).toBe(true);
        expect(getPhase(resolveResult.state)).toBe('Lattice');

        // Record is updated
        expect(resolveResult.record.resolved).toBe(true);
        expect(resolveResult.record.resolution?.response).toBe('Yes');

        // Decision is recorded in ledger
        expect(ledger.size).toBe(1);
        const decisions = ledger.getDecisions();
        expect(decisions[0]?.source).toBe('human_resolution');
        expect(decisions[0]?.confidence).toBe('canonical');
        expect(decisions[0]?.phase).toBe('lattice');
      }
    });

    it('handles timeout workflow: enter -> timeout -> handle', () => {
      // 1. Create a blocking state that has already timed out
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Injection',
        query: 'Approve implementation?',
        options: ['Yes', 'No'],
        timeoutMs: 60000,
      });
      const blockedAt = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
      const record = {
        id: 'timeout-test',
        phase: 'Injection' as const,
        query: 'Approve implementation?',
        options: ['Yes', 'No'] as const,
        blockedAt,
        timeoutMs: 60000,
        resolved: false,
      };

      // 2. Check timeout (should be timed out)
      const timeoutResult = checkTimeout(record);
      expect(timeoutResult.timedOut).toBe(true);

      // 3. Handle timeout with default strategy
      const handleResult = handleTimeout(
        state,
        record,
        {
          strategy: 'default',
          defaultResponse: 'No',
          rationale: 'Timeout - defaulting to safe option',
        },
        ledger
      );

      expect(handleResult.success).toBe(true);
      if (handleResult.success) {
        expect(isActiveState(handleResult.state)).toBe(true);
        expect(handleResult.decision?.constraint).toContain('No');
        expect(handleResult.decision?.rationale).toContain('Timeout');
      }
    });
  });

  describe('Decision phase mapping', () => {
    it('maps protocol phases to decision phases correctly', () => {
      const testCases: {
        phase:
          | 'Ignition'
          | 'Lattice'
          | 'CompositionAudit'
          | 'Injection'
          | 'Mesoscopic'
          | 'MassDefect';
        expectedDecisionPhase: string;
      }[] = [
        { phase: 'Ignition', expectedDecisionPhase: 'ignition' },
        { phase: 'Lattice', expectedDecisionPhase: 'lattice' },
        { phase: 'CompositionAudit', expectedDecisionPhase: 'composition_audit' },
        { phase: 'Injection', expectedDecisionPhase: 'injection' },
        { phase: 'Mesoscopic', expectedDecisionPhase: 'mesoscopic' },
        { phase: 'MassDefect', expectedDecisionPhase: 'mass_defect' },
      ];

      for (const { phase, expectedDecisionPhase } of testCases) {
        const state = createActiveStateForPhase(phase);
        const enterResult = enterBlocking(state, {
          reason: 'user_requested',
          phase,
          query: 'Test?',
        });

        expect(enterResult.success).toBe(true);
        if (!enterResult.success) {
          continue;
        }

        const resolveResult = resolveBlocking(
          enterResult.state,
          enterResult.record,
          { response: 'Yes', allowCustomResponse: true },
          ledger
        );

        expect(resolveResult.success).toBe(true);
        if (resolveResult.success) {
          expect(resolveResult.decision.phase).toBe(expectedDecisionPhase);
        }
      }
    });
  });
});
