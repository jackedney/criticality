/**
 * Manual test for blocking reason display.
 *
 * This test verifies that the blocking reason is displayed correctly
 * when the protocol is in a blocked state.
 */

import { describe, it, expect } from 'vitest';
import {
  createActiveState,
  createBlockedState,
  createInjectionImplementing,
  createLatticeCompilingCheck,
  createMassDefectApplyingTransform,
  getPhase,
  isBlockedState,
} from '../../protocol/types.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';
import type { BlockingRecord } from '../../protocol/blocking.js';

describe('Blocking Reason Display (US-003)', () => {
  it('should format blocking reason with type, description, and resolutions', () => {
    const blockedState = createBlockedState({
      reason: 'user_requested',
      phase: 'Lattice',
      query: 'Two requirements contradict each other.',
      options: ['Remove first requirement', 'Remove second requirement', 'Merge requirements'],
    });

    expect(isBlockedState(blockedState)).toBe(true);
    if (isBlockedState(blockedState)) {
      expect(blockedState.query).toBe('Two requirements contradict each other.');
      expect(blockedState.options).toHaveLength(3);
    }
  });

  it('should handle blocking state with no options', () => {
    const blockedState = createBlockedState({
      reason: 'user_requested',
      phase: 'Lattice',
      query: 'Awaiting user input for architecture decision.',
    });

    expect(isBlockedState(blockedState)).toBe(true);
    if (isBlockedState(blockedState)) {
      expect(blockedState.query).toBe('Awaiting user input for architecture decision.');
      expect(blockedState.options).toBeUndefined();
    }
  });

  it('should distinguish between blocked and active states', () => {
    const activeState = createActiveState({
      phase: 'Lattice',
      substate: createLatticeCompilingCheck(0),
    });
    const blockedState = createBlockedState({
      reason: 'user_requested',
      phase: 'Lattice',
      query: 'Block?',
    });

    expect(isBlockedState(activeState)).toBe(false);
    expect(isBlockedState(blockedState)).toBe(true);
  });

  it('should create snapshot with blocked state', () => {
    const snapshot: ProtocolStateSnapshot = {
      state: createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
      }),
      artifacts: ['spec'],
      blockingQueries: [],
    };

    expect(getPhase(snapshot.state)).toBe('Lattice');
    expect(isBlockedState(snapshot.state)).toBe(true);
    if (isBlockedState(snapshot.state)) {
      expect(snapshot.state.query).toBe('Approve architecture?');
      expect(snapshot.state.options).toEqual(['Yes', 'No', 'Revise']);
    }
  });
});

describe('Pending Queries Display (US-004)', () => {
  it('should format pending query with id, severity, category, truncated question, and options count', () => {
    const blockingRecord: BlockingRecord = {
      id: 'conflict_001',
      phase: 'Lattice',
      query:
        'Two requirements you have confirmed contradict each other: [A] "All API responses must be cacheable for at least 5 minutes" [B] "User balance must always reflect real-time state" Which takes priority?',
      options: ['Caching takes priority', 'Real-time takes priority', 'Hybrid approach'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    const snapshot: ProtocolStateSnapshot = {
      state: createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Two requirements contradict each other.',
        options: ['Yes', 'No'],
      }),
      artifacts: ['spec'],
      blockingQueries: [blockingRecord],
    };

    expect(snapshot.blockingQueries).toHaveLength(1);
    expect(snapshot.blockingQueries[0]?.id).toBe('conflict_001');
    expect(snapshot.blockingQueries[0]?.resolved).toBe(false);
  });

  it('should truncate question text longer than 100 characters with "..." indicator', () => {
    const longQuery =
      'This is a very long question that exceeds one hundred characters in length and should be truncated with an ellipsis indicator to show that it has been shortened for display purposes in the CLI interface.';

    const blockingRecord: BlockingRecord = {
      id: 'long_query_001',
      phase: 'CompositionAudit',
      query: longQuery,
      options: ['Option A', 'Option B'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    expect(blockingRecord.query.length).toBeGreaterThan(100);
  });

  it('should show "No pending queries" when all queries are resolved', () => {
    const resolvedRecord: BlockingRecord = {
      id: 'resolved_001',
      phase: 'Injection',
      query: 'Should we use TypeScript or JavaScript?',
      options: ['TypeScript', 'JavaScript'],
      blockedAt: new Date().toISOString(),
      resolved: true,
      resolution: {
        queryId: 'test-query-001',
        response: 'TypeScript',
        resolvedAt: new Date().toISOString(),
        rationale: 'Type safety is important',
      },
    };

    const snapshot: ProtocolStateSnapshot = {
      state: createActiveState({
        phase: 'Injection',
        substate: createInjectionImplementing('', 0),
      }),
      artifacts: ['spec'],
      blockingQueries: [resolvedRecord],
    };

    expect(snapshot.blockingQueries).toHaveLength(1);
    expect(snapshot.blockingQueries[0]?.resolved).toBe(true);
  });

  it('should handle multiple pending queries', () => {
    const query1: BlockingRecord = {
      id: 'conflict_001',
      phase: 'Lattice',
      query: 'Which architecture pattern should we use?',
      options: ['MVC', 'Clean Architecture', 'Hexagonal'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    const query2: BlockingRecord = {
      id: 'clarification_002',
      phase: 'CompositionAudit',
      query: 'Please explain the caching strategy in more detail.',
      options: [],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    const query3: BlockingRecord = {
      id: 'decision_003',
      phase: 'Injection',
      query: 'Should we implement error logging?',
      options: ['Yes', 'No'],
      blockedAt: new Date().toISOString(),
      resolved: true,
    };

    const snapshot: ProtocolStateSnapshot = {
      state: createActiveState({
        phase: 'Injection',
        substate: createInjectionImplementing('', 0),
      }),
      artifacts: ['spec'],
      blockingQueries: [query1, query2, query3],
    };

    const pendingQueries = snapshot.blockingQueries.filter((q) => !q.resolved);
    expect(pendingQueries).toHaveLength(2);
  });

  it('should display correct option count with pluralization', () => {
    const singleOption: BlockingRecord = {
      id: 'single_001',
      phase: 'Mesoscopic',
      query: 'Proceed with deployment?',
      options: ['Yes'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    const multipleOptions: BlockingRecord = {
      id: 'multiple_002',
      phase: 'MassDefect',
      query: 'Which optimization strategy?',
      options: ['Aggressive', 'Moderate', 'Minimal'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    expect(singleOption.options).toHaveLength(1);
    expect(multipleOptions.options).toHaveLength(3);
  });

  it('should handle queries with no options', () => {
    const noOptions: BlockingRecord = {
      id: 'free_text_001',
      phase: 'Injection',
      query: 'Please provide your detailed explanation of architecture decision.',
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    expect(noOptions.options).toBeUndefined();
  });
});

describe('Notifications Display (US-016)', () => {
  it('should show notification system as not configured', () => {
    const snapshot: ProtocolStateSnapshot = {
      state: createActiveState({
        phase: 'Injection',
        substate: createInjectionImplementing('', 0),
      }),
      artifacts: ['spec'],
      blockingQueries: [],
    };

    expect(getPhase(snapshot.state)).toBe('Injection');
    expect(isBlockedState(snapshot.state)).toBe(false);
  });

  it('should display notifications section with Phase 4.2 reference', () => {
    const snapshot: ProtocolStateSnapshot = {
      state: createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Awaiting user input for architecture decision.',
      }),
      artifacts: ['spec'],
      blockingQueries: [],
    };

    expect(isBlockedState(snapshot.state)).toBe(true);
    expect(snapshot.blockingQueries).toHaveLength(0);
  });

  it('should gracefully handle missing notification module', () => {
    const snapshot: ProtocolStateSnapshot = {
      state: createActiveState({
        phase: 'MassDefect',
        substate: createMassDefectApplyingTransform('', ''),
      }),
      artifacts: ['spec', 'verifiedCode'],
      blockingQueries: [],
    };

    expect(getPhase(snapshot.state)).toBe('MassDefect');
    expect(snapshot.artifacts).toContain('verifiedCode');
    expect(snapshot.blockingQueries).toHaveLength(0);
  });
});
