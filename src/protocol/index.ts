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
  type ProtocolState,
  type ActiveState,
  type BlockedState,
  type FailedState,
  type CompleteState,
  type BlockReason,
  type PhaseState,
  // SubState types
  type IgnitionSubState,
  type LatticeSubState,
  type CompositionAuditSubState,
  type InjectionSubState,
  type MesoscopicSubState,
  type MassDefectSubState,
  type InterviewPhase,
  type ContradictionSeverity,
  type TierName,
  // Constants
  PROTOCOL_PHASES,
  // Factory functions
  createActiveState,
  createBlockedState,
  createFailedState,
  createCompleteState,
  // Tier 2 factory functions
  createIgnitionPhaseState,
  createLatticePhaseState,
  createCompositionAuditPhaseState,
  createInjectionPhaseState,
  createMesoscopicPhaseState,
  createMassDefectPhaseState,
  // Tier 3 factory functions
  createIgnitionInterviewing,
  createIgnitionSynthesizing,
  createIgnitionAwaitingApproval,
  createLatticeGeneratingStructure,
  createLatticeCompilingCheck,
  createLatticeRepairingStructure,
  createCompositionAuditAuditing,
  createCompositionAuditReportingContradictions,
  createInjectionSelectingFunction,
  createInjectionImplementing,
  createInjectionVerifying,
  createInjectionEscalating,
  createMesoscopicGeneratingTests,
  createMesoscopicExecutingCluster,
  createMesoscopicHandlingVerdict,
  createMassDefectAnalyzingComplexity,
  createMassDefectApplyingTransform,
  createMassDefectVerifyingSemantics,
  // Type guards (Tier 1)
  isActiveState,
  isBlockedState,
  isFailedState,
  isCompleteState,
  // Type guards (Tier 2 - PhaseState)
  isIgnitionPhaseState,
  isLatticePhaseState,
  isCompositionAuditPhaseState,
  isInjectionPhaseState,
  isMesoscopicPhaseState,
  isMassDefectPhaseState,
  // Type guards (Tier 3 - SubState)
  isIgnitionInterviewing,
  isIgnitionSynthesizing,
  isIgnitionAwaitingApproval,
  isLatticeGeneratingStructure,
  isLatticeCompilingCheck,
  isLatticeRepairingStructure,
  isCompositionAuditAuditing,
  isCompositionAuditReportingContradictions,
  isInjectionSelectingFunction,
  isInjectionImplementing,
  isInjectionVerifying,
  isInjectionEscalating,
  isMesoscopicGeneratingTests,
  isMesoscopicExecutingCluster,
  isMesoscopicHandlingVerdict,
  isMassDefectAnalyzingComplexity,
  isMassDefectApplyingTransform,
  isMassDefectVerifyingSemantics,
  // Utility functions
  isValidPhase,
  getPhaseIndex,
  getPhase,
  getStep,
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

export {
  // Persistence types
  type PersistedStateData,
  type PersistedProtocolState,
  type StatePersistenceErrorType,
  type SaveStateOptions,
  type ProtocolStateSnapshot,
  // Persistence constants
  PERSISTED_STATE_VERSION,
  // Persistence error class
  StatePersistenceError,
  // Persistence functions
  serializeState,
  deserializeState,
  saveState,
  loadState,
  stateFileExists,
  createInitialStateSnapshot,
} from './persistence.js';

export {
  // Checkpoint types
  type StateDetectionResult,
  type StateValidationResult,
  type StateValidationError,
  type StateValidationWarning,
  type StateValidationErrorCode,
  type StateValidationWarningCode,
  type DetectStateOptions,
  type ValidateStateOptions,
  type ResumeResult,
  type ResumeFailureReason,
  type RecoveryAction,
  // Checkpoint constants
  DEFAULT_MAX_STATE_AGE_MS,
  // Checkpoint functions
  detectExistingState,
  validateStateIntegrity,
  validatePersistedStructure,
  resumeFromCheckpoint,
  getStartupState,
  isStateCorrupted,
} from './checkpoint.js';

export {
  // Orchestrator types
  type Guard,
  type Action,
  type ActionResult,
  type TransitionDefinition,
  type TickContext,
  type ExternalOperations,
  type TickResult,
  type TickStopReason,
  type OrchestratorOptions,
  type OrchestratorState,
  // Orchestrator utilities
  Guards,
  Actions,
  executeTick,
  createOrchestrator,
  getProtocolStatus,
} from './orchestrator.js';

export {
  // Phase execution types
  type MassDefectPhaseContext,
  // Phase execution functions
  executeMassDefectPhase,
} from './phase-execution.js';

export {
  // CLI types
  type CliCommand,
  type CliOptions,
  type CliResult,
  // CLI constants
  DEFAULT_STATE_PATH,
  // CLI functions
  parseArgs,
  executeStatus,
  executeResume,
  executeResolve,
  executeHelp,
  executeCommand,
  main as runCli,
} from './cli.js';
