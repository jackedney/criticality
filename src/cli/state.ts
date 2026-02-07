/**
 * CLI state management module.
 *
 * Provides state read/write utilities for CLI with support for
 * tracking resolved queries and activity timestamps.
 *
 * @packageDocumentation
 */

import {
  loadState,
  StatePersistenceError,
  type ProtocolStateSnapshot,
} from '../protocol/persistence.js';
import type { BlockingRecord } from '../protocol/blocking.js';

/**
 * Extended protocol state snapshot with CLI-specific metadata.
 */
export interface CliStateSnapshot extends ProtocolStateSnapshot {
  /** Timestamp when state was first created (ISO 8601). */
  readonly createdAt: string;
  /** Timestamp of last activity (ISO 8601). */
  readonly lastActivity: string;
  /** List of resolved query responses for resume functionality. */
  readonly resolvedQueries: readonly ResolvedQuery[];
}

/**
 * A resolved query response.
 */
export interface ResolvedQuery {
  /** The resolved blocking record. */
  readonly record: BlockingRecord;
  /** Timestamp when resolution was recorded (ISO 8601). */
  readonly resolvedAt: string;
}

/**
 * Options for saving CLI state.
 */
export interface SaveCliStateOptions {
  /** Pretty-print JSON with indentation. Default is true. */
  pretty?: boolean;
  /** Indentation level for pretty-printing. Default is 2. */
  indent?: number;
}

/**
 * Default state file path for CLI state.
 */
const DEFAULT_STATE_PATH = '.criticality-state.json';

/**
 * Gets the default state file path.
 *
 * @returns The state file path.
 */
export function getDefaultStatePath(): string {
  return DEFAULT_STATE_PATH;
}

/**
 * Creates an initial CLI state snapshot.
 *
 * @returns A new CLI state snapshot with current timestamp.
 */
export function createInitialCliState(): CliStateSnapshot {
  const now = new Date().toISOString();
  return {
    state: {
      phase: 'Ignition',
      substate: { kind: 'Active' },
    },
    artifacts: [],
    blockingQueries: [],
    createdAt: now,
    lastActivity: now,
    resolvedQueries: [],
  };
}

/**
 * Loads CLI state from a file, migrating from legacy format if needed.
 *
 * @param filePath - Path to the state JSON file.
 * @returns The loaded CLI state snapshot.
 * @throws StatePersistenceError if file cannot be read or contains invalid data.
 */
export async function loadCliState(filePath: string): Promise<CliStateSnapshot> {
  try {
    const snapshot = await loadState(filePath);

    return upgradeToCliState(snapshot);
  } catch (error) {
    if (error instanceof StatePersistenceError) {
      throw error;
    }

    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new StatePersistenceError(
      `Failed to load CLI state from "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }
}

/**
 * Saves CLI state to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the state file.
 *
 * @param snapshot - The CLI state snapshot to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws StatePersistenceError if file cannot be written.
 */
export async function saveCliState(
  snapshot: CliStateSnapshot,
  filePath: string,
  options?: SaveCliStateOptions
): Promise<void> {
  try {
    const serializedState = serializeCliState(snapshot, options);
    const tempPath = `${filePath}.tmp`;

    await import('node:fs/promises').then(async (fs) => {
      try {
        await fs.writeFile(tempPath, serializedState, 'utf-8');
        await fs.rename(tempPath, filePath);
      } catch (writeError) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }

        const fileError = writeError instanceof Error ? writeError : new Error(String(writeError));
        throw new StatePersistenceError(
          `Failed to save CLI state to "${filePath}": ${fileError.message}`,
          'file_error',
          { cause: fileError, details: 'Check that directory exists and is writable' }
        );
      }
    });
  } catch (error) {
    if (error instanceof StatePersistenceError) {
      throw error;
    }

    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new StatePersistenceError(
      `Failed to save CLI state to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }
}

/**
 * Updates CLI state after resolving a query.
 *
 * Moves the resolved query from pending blocking queries to resolved queries,
 * updates the state to active, and updates the last activity timestamp.
 *
 * @param currentState - The current CLI state snapshot.
 * @param queryId - The ID of the query being resolved.
 * @param resolvedRecord - The updated blocking record with resolution.
 * @param newProtocolState - The new protocol state (should be Active).
 * @returns An updated CLI state snapshot.
 */
export function updateStateAfterResolution(
  currentState: CliStateSnapshot,
  queryId: string,
  resolvedRecord: BlockingRecord,
  newProtocolState: CliStateSnapshot['state']
): CliStateSnapshot {
  const now = new Date().toISOString();

  const resolvedQuery: ResolvedQuery = {
    record: resolvedRecord,
    resolvedAt: now,
  };

  const updatedBlockingQueries = currentState.blockingQueries.filter((q) => q.id !== queryId);
  const updatedResolvedQueries = [...currentState.resolvedQueries, resolvedQuery];

  return {
    state: newProtocolState,
    artifacts: currentState.artifacts,
    blockingQueries: updatedBlockingQueries,
    createdAt: currentState.createdAt,
    lastActivity: now,
    resolvedQueries: updatedResolvedQueries,
  };
}

/**
 * Serializes a CLI state snapshot to JSON string.
 *
 * @param snapshot - The CLI state snapshot to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the CLI state.
 */
function serializeCliState(snapshot: CliStateSnapshot, options?: SaveCliStateOptions): string {
  const { createdAt, lastActivity, resolvedQueries } = snapshot;

  const data = {
    state: snapshot.state,
    artifacts: snapshot.artifacts,
    blockingQueries: snapshot.blockingQueries,
    createdAt,
    lastActivity,
    resolvedQueries,
    version: '1.0.0-cli',
  };

  const pretty = options?.pretty !== false;
  const indent = options?.indent ?? 2;

  if (pretty) {
    return JSON.stringify(data, null, indent);
  }
  return JSON.stringify(data);
}

/**
 * Upgrades a legacy ProtocolStateSnapshot to a CliStateSnapshot.
 *
 * Adds createdAt, lastActivity, and resolvedQueries fields with default values
 * if they don't exist (for backward compatibility).
 *
 * @param snapshot - The legacy protocol state snapshot.
 * @returns An upgraded CLI state snapshot.
 */
function upgradeToCliState(snapshot: ProtocolStateSnapshot): CliStateSnapshot {
  const now = new Date().toISOString();

  return {
    ...snapshot,
    createdAt: now,
    lastActivity: now,
    resolvedQueries: [],
  };
}
