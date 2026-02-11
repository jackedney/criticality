/**
 * Protocol state persistence module.
 *
 * Provides serialization and deserialization of protocol state to/from JSON files
 * with atomic writes to prevent corruption and clear error handling.
 *
 * @packageDocumentation
 */

import { safeWriteFile, safeRename, safeUnlink, safeReadFile, safeStat } from '../utils/safe-fs.js';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ProtocolPhase,
  ProtocolState,
  PhaseState,
  BlockReason,
  ArtifactType,
} from './types.js';
import type { BlockingRecord } from './blocking.js';

/**
 * Persisted state data structure.
 *
 * This is the JSON-serializable representation of protocol state
 * using the new 3-tier type system.
 */
export interface PersistedStateData {
  /** Schema version for future compatibility. */
  readonly version: string;
  /** Timestamp when state was persisted (ISO 8601). */
  readonly persistedAt: string;
  /** The protocol state (3-tier discriminated union). */
  readonly state: PersistedProtocolState;
  /** Available artifacts from completed phases. */
  readonly artifacts: readonly ArtifactType[];
  /** Active blocking queries, if any. */
  readonly blockingQueries: readonly BlockingRecord[];
}

/**
 * Persisted protocol state - JSON-serializable version of ProtocolState.
 */
export type PersistedProtocolState =
  | PersistedActiveState
  | PersistedBlockedState
  | PersistedFailedState
  | PersistedCompleteState;

/**
 * Persisted ActiveState with nested PhaseState.
 */
export type PersistedActiveState = {
  readonly kind: 'Active';
  readonly phase: PersistedPhaseState;
};

/**
 * Persisted PhaseState variants.
 */
export type PersistedPhaseState =
  | { readonly phase: 'Ignition'; readonly substate: PersistedIgnitionSubState }
  | { readonly phase: 'Lattice'; readonly substate: PersistedLatticeSubState }
  | {
      readonly phase: 'CompositionAudit';
      readonly substate: PersistedCompositionAuditSubState;
    }
  | { readonly phase: 'Injection'; readonly substate: PersistedInjectionSubState }
  | { readonly phase: 'Mesoscopic'; readonly substate: PersistedMesoscopicSubState }
  | { readonly phase: 'MassDefect'; readonly substate: PersistedMassDefectSubState };

/**
 * Persisted substate types for each phase.
 */
export type PersistedIgnitionSubState =
  | {
      readonly step: 'interviewing';
      readonly interviewPhase: 'Discovery' | 'Requirements' | 'Architecture';
      readonly questionIndex: number;
    }
  | { readonly step: 'synthesizing'; readonly progress: number }
  | { readonly step: 'awaitingApproval' };

export type PersistedLatticeSubState =
  | { readonly step: 'generatingStructure'; readonly currentModule?: string }
  | { readonly step: 'compilingCheck'; readonly attempt: number }
  | {
      readonly step: 'repairingStructure';
      readonly errors: readonly string[];
      readonly repairAttempt: number;
    };

export type PersistedCompositionAuditSubState =
  | { readonly step: 'auditing'; readonly auditorsCompleted: number }
  | {
      readonly step: 'reportingContradictions';
      readonly severity: 'low' | 'medium' | 'high' | 'critical';
    };

export type PersistedInjectionSubState =
  | { readonly step: 'selectingFunction' }
  | {
      readonly step: 'implementing';
      readonly functionId: string;
      readonly attempt: number;
    }
  | { readonly step: 'verifying'; readonly functionId: string }
  | {
      readonly step: 'escalating';
      readonly functionId: string;
      readonly fromTier:
        | 'Ignition'
        | 'Lattice'
        | 'CompositionAudit'
        | 'Injection'
        | 'Mesoscopic'
        | 'MassDefect';
      readonly toTier:
        | 'Ignition'
        | 'Lattice'
        | 'CompositionAudit'
        | 'Injection'
        | 'Mesoscopic'
        | 'MassDefect';
    };

export type PersistedMesoscopicSubState =
  | { readonly step: 'generatingTests'; readonly clusterId?: string }
  | {
      readonly step: 'executingCluster';
      readonly clusterId: string;
      readonly progress: number;
    }
  | {
      readonly step: 'handlingVerdict';
      readonly clusterId: string;
      readonly passed: boolean;
    };

export type PersistedMassDefectSubState =
  | { readonly step: 'analyzingComplexity' }
  | {
      readonly step: 'applyingTransform';
      readonly patternId: string;
      readonly functionId: string;
    }
  | { readonly step: 'verifyingSemantics'; readonly transformId: string };

/**
 * Persisted BlockedState.
 */
export type PersistedBlockedState = {
  readonly kind: 'Blocked';
  readonly reason: BlockReason;
  readonly phase: ProtocolPhase;
  readonly query: string;
  readonly options?: readonly string[];
  readonly blockedAt: string;
  readonly timeoutMs?: number;
};

/**
 * Persisted FailedState.
 */
export type PersistedFailedState = {
  readonly kind: 'Failed';
  readonly phase: ProtocolPhase;
  readonly error: string;
  readonly code?: string;
  readonly failedAt: string;
  readonly recoverable: boolean;
  readonly context?: string;
};

/**
 * Persisted CompleteState.
 */
export type PersistedCompleteState = {
  readonly kind: 'Complete';
  readonly artifacts: readonly ArtifactType[];
};

/**
 * Error type for state persistence operations.
 */
export type StatePersistenceErrorType =
  | 'parse_error'
  | 'schema_error'
  | 'file_error'
  | 'validation_error'
  | 'corruption_error';

/**
 * Error class for protocol state serialization/deserialization errors.
 */
export class StatePersistenceError extends Error {
  /** The type of persistence error. */
  public readonly errorType: StatePersistenceErrorType;
  /** Additional details about the error. */
  public readonly details: string | undefined;
  /** The underlying cause of the error if available. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new StatePersistenceError.
   *
   * @param message - Human-readable error message.
   * @param errorType - The type of persistence error.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    errorType: StatePersistenceErrorType,
    options?: { details?: string | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = 'StatePersistenceError';
    this.errorType = errorType;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * Current schema version for persisted state.
 */
export const PERSISTED_STATE_VERSION = '2.0.0';

/**
 * Options for saving protocol state.
 */
export interface SaveStateOptions {
  /** Pretty-print the JSON with indentation. Default is true. */
  pretty?: boolean;
  /** Indentation level for pretty-printing. Default is 2. */
  indent?: number;
}

/**
 * Protocol state snapshot with artifacts and blocking queries.
 *
 * This interface extends the basic ProtocolState with additional
 * context needed for persistence and resume.
 */
export interface ProtocolStateSnapshot {
  /** The current protocol state. */
  readonly state: ProtocolState;
  /** Available artifacts from completed phases. */
  readonly artifacts: readonly ArtifactType[];
  /** Active blocking queries, if any. */
  readonly blockingQueries: readonly BlockingRecord[];
}

/**
 * Serializes a ProtocolState to its persisted form.
 *
 * @param state - The protocol state to serialize.
 * @returns The persisted protocol state.
 */
function serializeProtocolState(state: ProtocolState): PersistedProtocolState {
  switch (state.kind) {
    case 'Active': {
      return {
        kind: 'Active',
        phase: serializePhaseState(state.phase),
      };
    }

    case 'Blocked': {
      const base = {
        kind: 'Blocked' as const,
        reason: state.reason,
        phase: state.phase,
        query: state.query,
        blockedAt: state.blockedAt,
      };

      if (state.options !== undefined && state.timeoutMs !== undefined) {
        return { ...base, options: state.options, timeoutMs: state.timeoutMs };
      }
      if (state.options !== undefined) {
        return { ...base, options: state.options };
      }
      if (state.timeoutMs !== undefined) {
        return { ...base, timeoutMs: state.timeoutMs };
      }
      return base;
    }

    case 'Failed': {
      const base = {
        kind: 'Failed' as const,
        phase: state.phase,
        error: state.error,
        failedAt: state.failedAt,
        recoverable: state.recoverable,
      };

      if (state.code !== undefined && state.context !== undefined) {
        return { ...base, code: state.code, context: state.context };
      }
      if (state.code !== undefined) {
        return { ...base, code: state.code };
      }
      if (state.context !== undefined) {
        return { ...base, context: state.context };
      }
      return base;
    }

    case 'Complete': {
      return {
        kind: 'Complete',
        artifacts: state.artifacts,
      };
    }

    default: {
      const _exhaustive: never = state;
      throw new StatePersistenceError(
        `Unknown protocol state kind: ${JSON.stringify(_exhaustive)}`,
        'schema_error'
      );
    }
  }
}

/**
 * Serializes a PhaseState to its persisted form.
 *
 * @param phaseState - The phase state to serialize.
 * @returns The persisted phase state.
 */
function serializePhaseState(phaseState: PhaseState): PersistedPhaseState {
  switch (phaseState.phase) {
    case 'Ignition':
      return { phase: 'Ignition', substate: phaseState.substate };
    case 'Lattice':
      return { phase: 'Lattice', substate: phaseState.substate };
    case 'CompositionAudit':
      return { phase: 'CompositionAudit', substate: phaseState.substate };
    case 'Injection':
      return { phase: 'Injection', substate: phaseState.substate };
    case 'Mesoscopic':
      return { phase: 'Mesoscopic', substate: phaseState.substate };
    case 'MassDefect':
      return { phase: 'MassDefect', substate: phaseState.substate };
  }
}

/**
 * Deserializes persisted protocol state data to a ProtocolState.
 *
 * @param data - The persisted protocol state data.
 * @returns The deserialized protocol state.
 * @throws StatePersistenceError if the data is invalid.
 */
function deserializeProtocolState(data: PersistedProtocolState): ProtocolState {
  switch (data.kind) {
    case 'Active': {
      return {
        kind: 'Active',
        phase: deserializePhaseState(data.phase),
      };
    }

    case 'Blocked': {
      const base = {
        kind: 'Blocked' as const,
        reason: data.reason,
        phase: data.phase,
        query: data.query,
        blockedAt: data.blockedAt,
      };

      if (data.options !== undefined && data.timeoutMs !== undefined) {
        return {
          ...base,
          options: data.options,
          timeoutMs: data.timeoutMs,
        };
      }
      if (data.options !== undefined) {
        return { ...base, options: data.options };
      }
      if (data.timeoutMs !== undefined) {
        return { ...base, timeoutMs: data.timeoutMs };
      }
      return base;
    }

    case 'Failed': {
      const base = {
        kind: 'Failed' as const,
        phase: data.phase,
        error: data.error,
        failedAt: data.failedAt,
        recoverable: data.recoverable,
      };

      if (data.code !== undefined && data.context !== undefined) {
        return { ...base, code: data.code, context: data.context };
      }
      if (data.code !== undefined) {
        return { ...base, code: data.code };
      }
      if (data.context !== undefined) {
        return { ...base, context: data.context };
      }
      return base;
    }

    case 'Complete': {
      return {
        kind: 'Complete',
        artifacts: data.artifacts,
      };
    }

    default: {
      const _exhaustive: never = data;
      throw new StatePersistenceError(
        `Unknown persisted protocol state kind: ${JSON.stringify(_exhaustive)}`,
        'schema_error'
      );
    }
  }
}

/**
 * Deserializes persisted phase state data to a PhaseState.
 *
 * @param data - The persisted phase state data.
 * @returns The deserialized phase state.
 */
function deserializePhaseState(data: PersistedPhaseState): PhaseState {
  switch (data.phase) {
    case 'Ignition':
      return { phase: 'Ignition', substate: data.substate };
    case 'Lattice':
      return { phase: 'Lattice', substate: data.substate };
    case 'CompositionAudit':
      return { phase: 'CompositionAudit', substate: data.substate };
    case 'Injection':
      return { phase: 'Injection', substate: data.substate };
    case 'Mesoscopic':
      return { phase: 'Mesoscopic', substate: data.substate };
    case 'MassDefect':
      return { phase: 'MassDefect', substate: data.substate };
  }
}

/**
 * Serializes a protocol state snapshot to a JSON string.
 *
 * @param snapshot - The state snapshot to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the state.
 *
 * @example
 * ```typescript
 * const snapshot: ProtocolStateSnapshot = {
 *   state: createActiveState('Lattice'),
 *   artifacts: ['spec'],
 *   blockingQueries: [],
 * };
 * const json = serializeState(snapshot);
 * ```
 */
export function serializeState(
  snapshot: ProtocolStateSnapshot,
  options?: SaveStateOptions
): string {
  const data: PersistedStateData = {
    version: PERSISTED_STATE_VERSION,
    persistedAt: new Date().toISOString(),
    state: serializeProtocolState(snapshot.state),
    artifacts: snapshot.artifacts,
    blockingQueries: snapshot.blockingQueries,
  };

  const pretty = options?.pretty !== false;
  const indent = options?.indent ?? 2;

  if (pretty) {
    return JSON.stringify(data, null, indent);
  }
  return JSON.stringify(data);
}

/**
 * Validates and deserializes a JSON string to a protocol state snapshot.
 *
 * @param json - JSON string to parse.
 * @returns The deserialized state snapshot.
 * @throws StatePersistenceError if the JSON is invalid or malformed.
 *
 * @example
 * ```typescript
 * const json = fs.readFileSync('state.json', 'utf-8');
 * const snapshot = deserializeState(json);
 * console.log(snapshot.state.phase); // 'Lattice'
 * ```
 */
export function deserializeState(json: string): ProtocolStateSnapshot {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    throw new StatePersistenceError(
      `Failed to parse state JSON: ${parseError.message}`,
      'parse_error',
      { cause: parseError, details: 'The file does not contain valid JSON' }
    );
  }

  // Validate basic structure
  if (data === null || typeof data !== 'object') {
    throw new StatePersistenceError('Invalid state format: expected an object', 'schema_error', {
      details: `Received ${data === null ? 'null' : typeof data} instead of object`,
    });
  }

  const obj = data as Record<string, unknown>;

  // Check for required top-level fields
  const requiredFields = ['version', 'persistedAt', 'state', 'artifacts', 'blockingQueries'];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new StatePersistenceError(
        `Invalid state format: missing required field "${field}"`,
        'schema_error',
        { details: `State file must contain: ${requiredFields.join(', ')}` }
      );
    }
  }

  // Validate version
  if (typeof obj.version !== 'string') {
    throw new StatePersistenceError(
      'Invalid state format: version must be a string',
      'schema_error'
    );
  }

  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(obj.version)) {
    throw new StatePersistenceError(
      `Invalid state format: version "${obj.version}" does not match semver pattern`,
      'schema_error',
      { details: 'Version must be in format X.Y.Z (e.g., "2.0.0")' }
    );
  }

  // Validate state
  if (obj.state === null || typeof obj.state !== 'object') {
    throw new StatePersistenceError(
      'Invalid state format: state must be an object',
      'schema_error'
    );
  }

  const stateObj = obj.state as Record<string, unknown>;
  if (!('kind' in stateObj) || typeof stateObj.kind !== 'string') {
    throw new StatePersistenceError(
      'Invalid state format: state must have a "kind" field',
      'schema_error'
    );
  }

  if (!['Active', 'Blocked', 'Failed', 'Complete'].includes(stateObj.kind)) {
    throw new StatePersistenceError(
      `Invalid state format: state kind "${stateObj.kind}" is not valid`,
      'validation_error',
      { details: 'Valid kinds: Active, Blocked, Failed, Complete' }
    );
  }

  const state = deserializeProtocolState(obj.state as PersistedProtocolState);

  // Validate artifacts
  if (!Array.isArray(obj.artifacts)) {
    throw new StatePersistenceError(
      'Invalid state format: artifacts must be an array',
      'schema_error'
    );
  }

  for (const artifact of obj.artifacts) {
    if (typeof artifact !== 'string') {
      throw new StatePersistenceError(
        `Invalid state format: artifact must be a string, got ${typeof artifact}`,
        'schema_error'
      );
    }
  }

  const artifacts = obj.artifacts as ArtifactType[];

  // Validate blocking queries
  if (!Array.isArray(obj.blockingQueries)) {
    throw new StatePersistenceError(
      'Invalid state format: blockingQueries must be an array',
      'schema_error'
    );
  }

  // Basic validation of blocking query structure
  for (const query of obj.blockingQueries) {
    if (query === null || typeof query !== 'object') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must be an object',
        'schema_error'
      );
    }
    const queryObj = query as Record<string, unknown>;
    if (typeof queryObj.id !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must have an "id" string',
        'schema_error'
      );
    }
    if (typeof queryObj.phase !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must have a "phase" string',
        'schema_error'
      );
    }
    if (typeof queryObj.query !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must have a "query" string',
        'schema_error'
      );
    }
    if (typeof queryObj.blockedAt !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must have a "blockedAt" string',
        'schema_error'
      );
    }
    if (typeof queryObj.resolved !== 'boolean') {
      throw new StatePersistenceError(
        'Invalid state format: blocking query must have a "resolved" boolean',
        'schema_error'
      );
    }
  }

  const blockingQueries = obj.blockingQueries as BlockingRecord[];

  return {
    state,
    artifacts,
    blockingQueries,
  };
}

/**
 * Saves protocol state to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the state file.
 *
 * @param snapshot - The state snapshot to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws StatePersistenceError if the file cannot be written.
 *
 * @example
 * ```typescript
 * const snapshot: ProtocolStateSnapshot = {
 *   state: createActiveState('Lattice'),
 *   artifacts: ['spec'],
 *   blockingQueries: [],
 * };
 * await saveState(snapshot, '/path/to/state.json');
 * ```
 */
export async function saveState(
  snapshot: ProtocolStateSnapshot,
  filePath: string,
  options?: SaveStateOptions
): Promise<void> {
  const json = serializeState(snapshot, options);
  const tempPath = join(dirname(filePath), `.state-${randomUUID()}.tmp`);

  try {
    // Write to temporary file first
    await safeWriteFile(tempPath, json, 'utf-8');

    // Atomic rename to target path
    await safeRename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await safeUnlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new StatePersistenceError(
      `Failed to save state to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError, details: 'Check that the directory exists and is writable' }
    );
  }
}

/**
 * Loads protocol state from a JSON file.
 *
 * Reads the file, parses the JSON, and validates the structure.
 *
 * @param filePath - Path to the state JSON file.
 * @returns The deserialized state snapshot.
 * @throws StatePersistenceError if the file cannot be read or contains invalid data.
 *
 * @example
 * ```typescript
 * const snapshot = await loadState('/path/to/state.json');
 * console.log(snapshot.state.phase); // 'Lattice'
 * ```
 */
export async function loadState(filePath: string): Promise<ProtocolStateSnapshot> {
  let content: string;

  try {
    content = await safeReadFile(filePath, 'utf-8');
  } catch (error) {
    const fileError = error instanceof Error ? error : new Error(String(error));
    const isNotFound =
      fileError instanceof Error &&
      'code' in fileError &&
      (fileError as Error & { code?: string }).code === 'ENOENT';

    if (isNotFound) {
      throw new StatePersistenceError(`State file not found: "${filePath}"`, 'file_error', {
        cause: fileError,
        details: 'The specified state file does not exist',
      });
    }

    throw new StatePersistenceError(
      `Failed to read state file "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }

  // Check for empty or whitespace-only content
  if (content.trim() === '') {
    throw new StatePersistenceError(`State file "${filePath}" is empty`, 'corruption_error', {
      details: 'The file exists but contains no data',
    });
  }

  // Deserialize with validation
  try {
    return deserializeState(content);
  } catch (error) {
    // Re-wrap errors with file path context
    if (error instanceof StatePersistenceError) {
      throw new StatePersistenceError(
        `Error loading state from "${filePath}": ${error.message}`,
        error.errorType,
        { cause: error.cause, details: error.details }
      );
    }
    throw error;
  }
}

/**
 * Checks if a state file exists.
 *
 * @param filePath - Path to check.
 * @returns True if the file exists.
 */
export async function stateFileExists(filePath: string): Promise<boolean> {
  try {
    await safeStat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an initial state snapshot for the Ignition phase.
 *
 * @returns A new state snapshot at the beginning of protocol execution.
 */
export function createInitialStateSnapshot(): ProtocolStateSnapshot {
  const phaseState = {
    phase: 'Ignition' as const,
    substate: {
      step: 'interviewing' as const,
      interviewPhase: 'Discovery' as const,
      questionIndex: 0,
    },
  };
  const state = { kind: 'Active' as const, phase: phaseState };

  return {
    state,
    artifacts: [],
    blockingQueries: [],
  };
}
