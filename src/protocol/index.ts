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

export {
  // Transition constants
  FORWARD_TRANSITIONS,
  FAILURE_TRANSITIONS,
  REQUIRED_ARTIFACTS,
  FAILURE_REQUIRED_ARTIFACTS,
  // Transition types
  type ArtifactType,
  type TransitionArtifacts,
  type TransitionErrorCode,
  type TransitionError,
  type TransitionResult,
  type TransitionOptions,
  // Transition utilities
  createTransitionArtifacts,
  isValidForwardTransition,
  isValidFailureTransition,
  isValidTransition,
  getRequiredArtifacts,
  validateArtifacts,
  shedContext,
  transition,
  getValidTransitions,
  getNextPhase,
} from './transitions.js';

export {
  // Blocking types
  type BlockingQueryId,
  type BlockingRecord,
  type BlockingResolution,
  type EnterBlockingResult,
  type ResolveBlockingResult,
  type TimeoutCheckResult,
  type TimeoutHandlingResult,
  type BlockingErrorCode,
  type BlockingError,
  type EnterBlockingOptions,
  type ResolveBlockingOptions,
  type TimeoutHandlingOptions,
  // Blocking functions
  generateBlockingQueryId,
  enterBlocking,
  resolveBlocking,
  checkTimeout,
  handleTimeout,
  getRemainingTimeout,
  hasTimeout,
  getTimeoutDeadline,
} from './blocking.js';
