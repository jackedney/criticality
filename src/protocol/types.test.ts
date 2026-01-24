/**
 * Tests for Protocol State types.
 */

import { describe, it, expect } from 'vitest';
import {
  type ProtocolSubstate,
  PROTOCOL_PHASES,
  isActiveSubstate,
  isBlockingSubstate,
  isFailedSubstate,
  createActiveSubstate,
  createBlockingSubstate,
  createFailedSubstate,
  createProtocolState,
  createActiveState,
  isValidPhase,
  getPhaseIndex,
  isTerminalState,
  canTransition,
} from './types.js';

describe('Protocol State Types', () => {
  describe('PROTOCOL_PHASES', () => {
    it('contains all required phases in execution order', () => {
      expect(PROTOCOL_PHASES).toEqual([
        'Ignition',
        'Lattice',
        'CompositionAudit',
        'Injection',
        'Mesoscopic',
        'MassDefect',
        'Complete',
      ]);
    });

    it('has exactly 7 phases', () => {
      expect(PROTOCOL_PHASES).toHaveLength(7);
    });
  });

  describe('isValidPhase', () => {
    it('returns true for valid phases', () => {
      for (const phase of PROTOCOL_PHASES) {
        expect(isValidPhase(phase)).toBe(true);
      }
    });

    it('returns false for invalid phases', () => {
      expect(isValidPhase('InvalidPhase')).toBe(false);
      expect(isValidPhase('')).toBe(false);
      expect(isValidPhase('ignition')).toBe(false); // case sensitive
    });
  });

  describe('getPhaseIndex', () => {
    it('returns correct index for each phase', () => {
      expect(getPhaseIndex('Ignition')).toBe(0);
      expect(getPhaseIndex('Lattice')).toBe(1);
      expect(getPhaseIndex('CompositionAudit')).toBe(2);
      expect(getPhaseIndex('Injection')).toBe(3);
      expect(getPhaseIndex('Mesoscopic')).toBe(4);
      expect(getPhaseIndex('MassDefect')).toBe(5);
      expect(getPhaseIndex('Complete')).toBe(6);
    });
  });

  describe('Active Substate', () => {
    it('creates an active substate', () => {
      const substate = createActiveSubstate();
      expect(substate.kind).toBe('Active');
    });

    it('type guard correctly identifies active substate', () => {
      const active = createActiveSubstate();
      const blocking = createBlockingSubstate({ query: 'test?' });
      const failed = createFailedSubstate({ error: 'test error' });

      expect(isActiveSubstate(active)).toBe(true);
      expect(isActiveSubstate(blocking)).toBe(false);
      expect(isActiveSubstate(failed)).toBe(false);
    });
  });

  describe('Blocking Substate', () => {
    it('creates a blocking substate with required fields', () => {
      const substate = createBlockingSubstate({ query: 'Approve architecture?' });

      expect(substate.kind).toBe('Blocking');
      expect(substate.query).toBe('Approve architecture?');
      expect(substate.blockedAt).toBeDefined();
      expect(new Date(substate.blockedAt).toISOString()).toBe(substate.blockedAt);
    });

    it('creates a blocking substate with all optional fields', () => {
      const substate = createBlockingSubstate({
        query: 'Choose implementation approach?',
        options: ['Option A', 'Option B', 'Option C'],
        timeoutMs: 300000,
      });

      expect(substate.kind).toBe('Blocking');
      expect(substate.query).toBe('Choose implementation approach?');
      expect(substate.options).toEqual(['Option A', 'Option B', 'Option C']);
      expect(substate.timeoutMs).toBe(300000);
    });

    it('type guard correctly identifies blocking substate', () => {
      const active = createActiveSubstate();
      const blocking = createBlockingSubstate({ query: 'test?' });
      const failed = createFailedSubstate({ error: 'test error' });

      expect(isBlockingSubstate(active)).toBe(false);
      expect(isBlockingSubstate(blocking)).toBe(true);
      expect(isBlockingSubstate(failed)).toBe(false);
    });
  });

  describe('Failed Substate', () => {
    it('creates a failed substate with required fields', () => {
      const substate = createFailedSubstate({ error: 'Type checking failed' });

      expect(substate.kind).toBe('Failed');
      expect(substate.error).toBe('Type checking failed');
      expect(substate.failedAt).toBeDefined();
      expect(substate.recoverable).toBe(false);
      expect(new Date(substate.failedAt).toISOString()).toBe(substate.failedAt);
    });

    it('creates a failed substate with all optional fields', () => {
      const substate = createFailedSubstate({
        error: 'Compilation failed',
        code: 'TYPE_ERROR',
        recoverable: true,
        context: 'Error in file src/index.ts at line 42',
      });

      expect(substate.kind).toBe('Failed');
      expect(substate.error).toBe('Compilation failed');
      expect(substate.code).toBe('TYPE_ERROR');
      expect(substate.recoverable).toBe(true);
      expect(substate.context).toBe('Error in file src/index.ts at line 42');
    });

    it('defaults recoverable to false', () => {
      const substate = createFailedSubstate({ error: 'Fatal error' });
      expect(substate.recoverable).toBe(false);
    });

    it('type guard correctly identifies failed substate', () => {
      const active = createActiveSubstate();
      const blocking = createBlockingSubstate({ query: 'test?' });
      const failed = createFailedSubstate({ error: 'test error' });

      expect(isFailedSubstate(active)).toBe(false);
      expect(isFailedSubstate(blocking)).toBe(false);
      expect(isFailedSubstate(failed)).toBe(true);
    });
  });

  describe('ProtocolState', () => {
    it('creates a protocol state with phase and substate', () => {
      const substate = createActiveSubstate();
      const state = createProtocolState('Ignition', substate);

      expect(state.phase).toBe('Ignition');
      expect(state.substate.kind).toBe('Active');
    });

    it('creates an active state for a phase', () => {
      const state = createActiveState('Lattice');

      expect(state.phase).toBe('Lattice');
      expect(state.substate.kind).toBe('Active');
    });

    it('can represent Ignition phase in Active substate (acceptance criteria)', () => {
      const state = createActiveState('Ignition');

      expect(state.phase).toBe('Ignition');
      expect(isActiveSubstate(state.substate)).toBe(true);
    });

    it('can represent Lattice phase in Blocking substate with query (acceptance criteria)', () => {
      const state = createProtocolState(
        'Lattice',
        createBlockingSubstate({ query: 'Approve decision graph?' })
      );

      expect(state.phase).toBe('Lattice');
      expect(isBlockingSubstate(state.substate)).toBe(true);
      if (isBlockingSubstate(state.substate)) {
        expect(state.substate.query).toBe('Approve decision graph?');
      }
    });

    it('can represent any phase in Blocking substate', () => {
      for (const phase of PROTOCOL_PHASES) {
        // Skip Complete - it doesn't make sense to block at Complete
        if (phase === 'Complete') {
          continue;
        }

        const state = createProtocolState(
          phase,
          createBlockingSubstate({ query: `Block at ${phase}?` })
        );

        expect(state.phase).toBe(phase);
        expect(isBlockingSubstate(state.substate)).toBe(true);
      }
    });

    it('can represent any phase in Failed substate', () => {
      for (const phase of PROTOCOL_PHASES) {
        // Skip Complete - it doesn't make sense to fail at Complete
        if (phase === 'Complete') {
          continue;
        }

        const state = createProtocolState(
          phase,
          createFailedSubstate({
            error: `Failed at ${phase}`,
            code: 'PHASE_ERROR',
          })
        );

        expect(state.phase).toBe(phase);
        expect(isFailedSubstate(state.substate)).toBe(true);
      }
    });
  });

  describe('isTerminalState', () => {
    it('returns true for Complete phase', () => {
      const state = createActiveState('Complete');
      expect(isTerminalState(state)).toBe(true);
    });

    it('returns true for Failed substate in any phase', () => {
      const state = createProtocolState(
        'Injection',
        createFailedSubstate({ error: 'Fatal error' })
      );
      expect(isTerminalState(state)).toBe(true);
    });

    it('returns false for Active substate in non-Complete phase', () => {
      const state = createActiveState('Ignition');
      expect(isTerminalState(state)).toBe(false);
    });

    it('returns false for Blocking substate', () => {
      const state = createProtocolState('Lattice', createBlockingSubstate({ query: 'Waiting?' }));
      expect(isTerminalState(state)).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('returns true for Active substate in non-Complete phase', () => {
      const state = createActiveState('Ignition');
      expect(canTransition(state)).toBe(true);
    });

    it('returns false for Complete phase', () => {
      const state = createActiveState('Complete');
      expect(canTransition(state)).toBe(false);
    });

    it('returns false for Blocking substate', () => {
      const state = createProtocolState('Lattice', createBlockingSubstate({ query: 'Waiting?' }));
      expect(canTransition(state)).toBe(false);
    });

    it('returns false for Failed substate', () => {
      const state = createProtocolState('Injection', createFailedSubstate({ error: 'Error' }));
      expect(canTransition(state)).toBe(false);
    });
  });

  describe('Type narrowing with discriminated unions', () => {
    it('narrows substate type using kind discriminant', () => {
      const substates: ProtocolSubstate[] = [
        createActiveSubstate(),
        createBlockingSubstate({ query: 'test?' }),
        createFailedSubstate({ error: 'test' }),
      ];

      for (const substate of substates) {
        switch (substate.kind) {
          case 'Active':
            // TypeScript knows substate is ActiveSubstate here
            expect(substate.kind).toBe('Active');
            break;
          case 'Blocking':
            // TypeScript knows substate is BlockingSubstate here
            expect(substate.query).toBeDefined();
            break;
          case 'Failed':
            // TypeScript knows substate is FailedSubstate here
            expect(substate.error).toBeDefined();
            break;
        }
      }
    });
  });
});
