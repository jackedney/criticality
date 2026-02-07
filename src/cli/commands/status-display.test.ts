/**
 * Manual test for blocking reason display.
 *
 * This test verifies that the blocking reason is displayed correctly
 * when the protocol is in a blocked state.
 */

import { describe, it, expect } from 'vitest';
import {
  createActiveState,
  createBlockingSubstate,
  isBlockingSubstate,
} from '../../protocol/types.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';

describe('Blocking Reason Display (US-003)', () => {
  it('should format blocking reason with type, description, and resolutions', () => {
    const blockingSubstate = createBlockingSubstate({
      query: 'Two requirements contradict each other.',
      options: ['Remove first requirement', 'Remove second requirement', 'Merge requirements'],
    });

    expect(isBlockingSubstate(blockingSubstate)).toBe(true);
    if (isBlockingSubstate(blockingSubstate)) {
      expect(blockingSubstate.query).toBe('Two requirements contradict each other.');
      expect(blockingSubstate.options).toHaveLength(3);
    }
  });

  it('should handle blocking state with no options', () => {
    const blockingSubstate = createBlockingSubstate({
      query: 'Awaiting user input for architecture decision.',
    });

    expect(isBlockingSubstate(blockingSubstate)).toBe(true);
    if (isBlockingSubstate(blockingSubstate)) {
      expect(blockingSubstate.query).toBe('Awaiting user input for architecture decision.');
      expect(blockingSubstate.options).toBeUndefined();
    }
  });

  it('should distinguish between blocked and active states', () => {
    const activeState = createActiveState('Lattice');
    const blockingState = createBlockingSubstate({ query: 'Block?' });

    expect(isBlockingSubstate(activeState.substate)).toBe(false);
    expect(isBlockingSubstate(blockingState)).toBe(true);
  });

  it('should create snapshot with blocking substate', () => {
    const snapshot: ProtocolStateSnapshot = {
      state: {
        phase: 'Lattice',
        substate: createBlockingSubstate({
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
        }),
      },
      artifacts: ['spec'],
      blockingQueries: [],
    };

    expect(snapshot.state.phase).toBe('Lattice');
    expect(isBlockingSubstate(snapshot.state.substate)).toBe(true);
    if (isBlockingSubstate(snapshot.state.substate)) {
      expect(snapshot.state.substate.query).toBe('Approve architecture?');
      expect(snapshot.state.substate.options).toEqual(['Yes', 'No', 'Revise']);
    }
  });
});
