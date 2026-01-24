/**
 * Protocol state management module.
 *
 * Provides types and utilities for managing protocol execution state,
 * including phases, substates, and state transitions.
 *
 * @packageDocumentation
 */

export {
  // Types
  type ProtocolPhase,
  type ActiveSubstate,
  type BlockingSubstate,
  type FailedSubstate,
  type ProtocolSubstate,
  type ProtocolState,
  type BlockingOptions,
  type FailedOptions,
  // Constants
  PROTOCOL_PHASES,
  // Type guards
  isActiveSubstate,
  isBlockingSubstate,
  isFailedSubstate,
  // Factory functions
  createActiveSubstate,
  createBlockingSubstate,
  createFailedSubstate,
  createProtocolState,
  createActiveState,
  // Utility functions
  isValidPhase,
  getPhaseIndex,
  isTerminalState,
  canTransition,
} from './types.js';
