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
  ProtocolSubstate,
  ActiveSubstate,
  BlockingSubstate,
  FailedSubstate,
} from './types.js';
import type { ArtifactType } from './transitions.js';
import type { BlockingRecord } from './blocking.js';
import { PROTOCOL_PHASES, isValidPhase } from './types.js';

/**
 * Persisted state data structure.
 *
 * This is the JSON-serializable representation of protocol state.
 */
export interface PersistedStateData {
  /** Schema version for future compatibility. */
  readonly version: string;
  /** Timestamp when state was persisted (ISO 8601). */
  readonly persistedAt: string;
  /** Current protocol phase. */
  readonly phase: ProtocolPhase;
  /** Current substate data. */
  readonly substate: PersistedSubstateData;
  /** Available artifacts from completed phases. */
  readonly artifacts: readonly ArtifactType[];
  /** Active blocking queries, if any. */
  readonly blockingQueries: readonly BlockingRecord[];
}

/**
 * Serialized substate data.
 */
export type PersistedSubstateData =
  | { readonly kind: 'Active' }
  | {
      readonly kind: 'Blocking';
      readonly query: string;
      readonly options?: readonly string[];
      readonly blockedAt: string;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: 'Failed';
      readonly error: string;
      readonly code?: string;
      readonly failedAt: string;
      readonly recoverable: boolean;
      readonly context?: string;
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
export const PERSISTED_STATE_VERSION = '1.0.0';

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
 * Serializes a substate to its persisted form.
 *
 * @param substate - The substate to serialize.
 * @returns The persisted substate data.
 */
function serializeSubstate(substate: ProtocolSubstate): PersistedSubstateData {
  switch (substate.kind) {
    case 'Active':
      return { kind: 'Active' };

    case 'Blocking': {
      const base = {
        kind: 'Blocking' as const,
        query: substate.query,
        blockedAt: substate.blockedAt,
      };

      // Handle optional fields for exactOptionalPropertyTypes
      if (substate.options !== undefined && substate.timeoutMs !== undefined) {
        return { ...base, options: substate.options, timeoutMs: substate.timeoutMs };
      }
      if (substate.options !== undefined) {
        return { ...base, options: substate.options };
      }
      if (substate.timeoutMs !== undefined) {
        return { ...base, timeoutMs: substate.timeoutMs };
      }
      return base;
    }

    case 'Failed': {
      const base = {
        kind: 'Failed' as const,
        error: substate.error,
        failedAt: substate.failedAt,
        recoverable: substate.recoverable,
      };

      // Handle optional fields for exactOptionalPropertyTypes
      if (substate.code !== undefined && substate.context !== undefined) {
        return { ...base, code: substate.code, context: substate.context };
      }
      if (substate.code !== undefined) {
        return { ...base, code: substate.code };
      }
      if (substate.context !== undefined) {
        return { ...base, context: substate.context };
      }
      return base;
    }
  }
}

/**
 * Deserializes substate data to a ProtocolSubstate.
 *
 * @param data - The persisted substate data.
 * @returns The deserialized substate.
 * @throws StatePersistenceError if the data is invalid.
 */
function deserializeSubstate(data: PersistedSubstateData): ProtocolSubstate {
  switch (data.kind) {
    case 'Active':
      return { kind: 'Active' } satisfies ActiveSubstate;

    case 'Blocking': {
      const base = {
        kind: 'Blocking' as const,
        query: data.query,
        blockedAt: data.blockedAt,
      };

      // Handle optional fields for exactOptionalPropertyTypes
      if (data.options !== undefined && data.timeoutMs !== undefined) {
        return {
          ...base,
          options: data.options,
          timeoutMs: data.timeoutMs,
        } satisfies BlockingSubstate;
      }
      if (data.options !== undefined) {
        return { ...base, options: data.options } satisfies BlockingSubstate;
      }
      if (data.timeoutMs !== undefined) {
        return { ...base, timeoutMs: data.timeoutMs } satisfies BlockingSubstate;
      }
      return base satisfies BlockingSubstate;
    }

    case 'Failed': {
      const base = {
        kind: 'Failed' as const,
        error: data.error,
        failedAt: data.failedAt,
        recoverable: data.recoverable,
      };

      // Handle optional fields for exactOptionalPropertyTypes
      if (data.code !== undefined && data.context !== undefined) {
        return { ...base, code: data.code, context: data.context } satisfies FailedSubstate;
      }
      if (data.code !== undefined) {
        return { ...base, code: data.code } satisfies FailedSubstate;
      }
      if (data.context !== undefined) {
        return { ...base, context: data.context } satisfies FailedSubstate;
      }
      return base satisfies FailedSubstate;
    }

    default: {
      // Type-safe exhaustive check
      const _exhaustive: never = data;
      throw new StatePersistenceError(
        `Unknown substate kind: ${JSON.stringify(_exhaustive)}`,
        'schema_error'
      );
    }
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
    phase: snapshot.state.phase,
    substate: serializeSubstate(snapshot.state.substate),
    artifacts: snapshot.artifacts,
    blockingQueries: snapshot.blockingQueries,
  };

  const pretty = options?.pretty !== false; // Default to true
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
  const requiredFields = [
    'version',
    'persistedAt',
    'phase',
    'substate',
    'artifacts',
    'blockingQueries',
  ];
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
      { details: 'Version must be in format X.Y.Z (e.g., "1.0.0")' }
    );
  }

  // Validate phase
  if (typeof obj.phase !== 'string') {
    throw new StatePersistenceError('Invalid state format: phase must be a string', 'schema_error');
  }

  if (!isValidPhase(obj.phase)) {
    throw new StatePersistenceError(
      `Invalid state format: phase "${obj.phase}" is not a valid protocol phase`,
      'validation_error',
      { details: `Valid phases: ${PROTOCOL_PHASES.join(', ')}` }
    );
  }

  const phase = obj.phase;

  // Validate substate
  if (obj.substate === null || typeof obj.substate !== 'object') {
    throw new StatePersistenceError(
      'Invalid state format: substate must be an object',
      'schema_error'
    );
  }

  const substateObj = obj.substate as Record<string, unknown>;
  if (!('kind' in substateObj) || typeof substateObj.kind !== 'string') {
    throw new StatePersistenceError(
      'Invalid state format: substate must have a "kind" field',
      'schema_error'
    );
  }

  if (!['Active', 'Blocking', 'Failed'].includes(substateObj.kind)) {
    throw new StatePersistenceError(
      `Invalid state format: substate kind "${substateObj.kind}" is not valid`,
      'validation_error',
      { details: 'Valid kinds: Active, Blocking, Failed' }
    );
  }

  // Validate substate-specific fields
  if (substateObj.kind === 'Blocking') {
    if (typeof substateObj.query !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: Blocking substate must have a "query" string',
        'schema_error'
      );
    }
    if (typeof substateObj.blockedAt !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: Blocking substate must have a "blockedAt" string',
        'schema_error'
      );
    }
  }

  if (substateObj.kind === 'Failed') {
    if (typeof substateObj.error !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: Failed substate must have an "error" string',
        'schema_error'
      );
    }
    if (typeof substateObj.failedAt !== 'string') {
      throw new StatePersistenceError(
        'Invalid state format: Failed substate must have a "failedAt" string',
        'schema_error'
      );
    }
    if (typeof substateObj.recoverable !== 'boolean') {
      throw new StatePersistenceError(
        'Invalid state format: Failed substate must have a "recoverable" boolean',
        'schema_error'
      );
    }
  }

  const substate = deserializeSubstate(obj.substate as PersistedSubstateData);

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
    state: { phase, substate },
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
  return {
    state: {
      phase: 'Ignition',
      substate: { kind: 'Active' },
    },
    artifacts: [],
    blockingQueries: [],
  };
}
