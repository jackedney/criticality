/**
 * Decision Ledger module.
 *
 * Provides an append-only ledger for recording protocol decisions.
 *
 * @packageDocumentation
 */

export type {
  Decision,
  DecisionCategory,
  DecisionSource,
  ConfidenceLevel,
  DecisionStatus,
  DecisionPhase,
  DecisionInput,
  LedgerMeta,
  LedgerData,
  DecisionFilter,
  DecisionFilterKey,
  HistoryQueryOptions,
  DependencyGraphQueryOptions,
  DependencyGraphResult,
} from './types.js';

export {
  Ledger,
  LedgerValidationError,
  DuplicateDecisionIdError,
  CanonicalOverrideError,
  DecisionNotFoundError,
  InvalidSupersedeError,
  CircularDependencyError,
  DependencyNotFoundError,
  InvalidFilterKeyError,
  fromData,
} from './ledger.js';

export type {
  LedgerError,
  LedgerOptions,
  SupersedeOptions,
  InvalidateOptions,
  AppendOptions,
  CascadeReport,
  CascadeAffectedDecision,
} from './ledger.js';

export {
  LedgerSerializationError,
  serialize,
  deserialize,
  saveLedger,
  loadLedger,
} from './persistence.js';

export type {
  LoadLedgerOptions,
  SaveLedgerOptions,
  SerializationErrorType,
} from './persistence.js';
