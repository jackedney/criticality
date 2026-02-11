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
import {
  createActiveState,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
} from '../protocol/types.js';
import type { BlockingRecord } from '../protocol/blocking.js';
import { renameSync } from 'node:fs';
import { stat, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { TelemetryCollector } from './telemetry.js';
import type { TelemetryData } from './telemetry.js';

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
  /** Telemetry data tracking model calls, tokens, and execution time. */
  readonly telemetry?: TelemetryData;
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
 * Gets the default ledger file path for a given state path.
 *
 * The ledger is stored in a .criticality subdirectory within the same
 * directory as the state file.
 *
 * @param statePath - Path to the state file.
 * @returns The ledger file path.
 */
export function getDefaultLedgerPath(statePath: string): string {
  return path.join(path.dirname(statePath), '.criticality', 'ledger');
}

/**
 * Creates an initial CLI state snapshot.
 *
 * @returns A new CLI state snapshot with current timestamp.
 */
export function createInitialCliState(): CliStateSnapshot {
  const now = new Date().toISOString();
  const ignitionSubState = createIgnitionInterviewing('Discovery', 0);
  const phaseState = createIgnitionPhaseState(ignitionSubState);

  return {
    state: createActiveState(phaseState),
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

    try {
      await writeFile(tempPath, serializedState, 'utf-8');
      await rename(tempPath, filePath);
    } catch (writeError) {
      try {
        await unlink(tempPath);
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
  const { createdAt, lastActivity, resolvedQueries, telemetry } = snapshot;

  const data: Record<string, unknown> = {
    state: snapshot.state,
    artifacts: snapshot.artifacts,
    blockingQueries: snapshot.blockingQueries,
    createdAt,
    lastActivity,
    resolvedQueries,
    version: '1.0.0-cli',
  };

  if (telemetry !== undefined) {
    data.telemetry = TelemetryCollector.serialize(telemetry);
  }

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
 * Adds createdAt, lastActivity, resolvedQueries, and telemetry fields with default values
 * if they don't exist (for backward compatibility).
 *
 * @param snapshot - The legacy protocol state snapshot.
 * @returns An upgraded CLI state snapshot.
 */
function upgradeToCliState(snapshot: ProtocolStateSnapshot): CliStateSnapshot {
  const now = new Date().toISOString();
  const maybeCliSnapshot = snapshot as unknown as Partial<CliStateSnapshot>;

  const base = {
    ...snapshot,
    createdAt: maybeCliSnapshot.createdAt ?? now,
    lastActivity: maybeCliSnapshot.lastActivity ?? now,
    resolvedQueries: maybeCliSnapshot.resolvedQueries ?? [],
  };

  if (maybeCliSnapshot.telemetry !== undefined) {
    try {
      return { ...base, telemetry: TelemetryCollector.deserialize(maybeCliSnapshot.telemetry) };
    } catch {
      return base;
    }
  }

  return base;
}

/**
 * Loads CLI state with corruption detection and recovery.
 *
 * Attempts to load CLI state and provides user-friendly error handling
 * for corrupted state files, including offering recovery options.
 *
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded CLI state snapshot.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
export async function loadCliStateWithRecovery(
  filePath: string,
  options?: RecoveryOptions
): Promise<CliStateSnapshot> {
  return withRecovery<CliStateSnapshot>(
    () => loadCliState(filePath),
    async () => {
      const initialState = createInitialCliState();
      await saveCliState(initialState, filePath);
      return initialState;
    },
    filePath,
    options
  );
}

/**
 * Options for recovery behavior.
 */
export interface RecoveryOptions {
  /** Callback for prompting user input. Defaults to console-based prompting. */
  promptUser?: (prompt: string) => Promise<string>;
  /** Callback for displaying messages. Defaults to console.log. */
  displayMessage?: (message: string) => void;
  /** Callback for displaying errors. Defaults to console.error. */
  displayError?: (message: string) => void;
}

/**
 * Generic recovery helper for state loading with corruption handling.
 *
 * Encapsulates error classification, user prompting, file backup, and
 * recovery logic for corrupted state files.
 *
 * @template T - The type of state to load and return.
 * @param loadFn - Function that loads the state from the file.
 * @param resetFn - Function that creates and saves a fresh initial state.
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded or recovered state.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
export async function withRecovery<T>(
  loadFn: () => Promise<T>,
  resetFn: () => Promise<T>,
  filePath: string,
  options?: RecoveryOptions
): Promise<T> {
  const promptUser = options?.promptUser ?? defaultPromptUser;
  const displayMessage = options?.displayMessage ?? console.log;
  const displayError = options?.displayError ?? console.error;

  try {
    return await loadFn();
  } catch (error) {
    if (!(error instanceof StatePersistenceError)) {
      throw error;
    }

    const errorType = error.errorType;
    const isCorruptableError =
      errorType === 'parse_error' ||
      errorType === 'schema_error' ||
      errorType === 'validation_error' ||
      errorType === 'corruption_error';

    if (!isCorruptableError) {
      throw error;
    }

    displayMessage('');
    displayMessage(`State file corrupted: ${error.message}`);
    displayMessage('');

    try {
      const fileStats = await stat(filePath);
      const lastModified = new Date(fileStats.mtime).toLocaleString();
      displayMessage(`File: ${filePath}`);
      displayMessage(`Last modified: ${lastModified}`);
    } catch {
      displayMessage(`File: ${filePath}`);
    }

    displayMessage('');
    displayError('The state file appears to be corrupted and cannot be loaded.');
    displayMessage('');
    const response = await promptUser(
      'Reset state to initial? This will lose current progress. (y/n): '
    );
    const normalizedResponse = response.trim().toLowerCase();

    if (normalizedResponse === 'y' || normalizedResponse === 'yes') {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.backup-${timestamp}`;

        renameSync(filePath, backupPath);
        displayMessage(`Backup saved to: ${backupPath}`);
        displayMessage('');
      } catch (renameError) {
        displayError(
          `Warning: Could not backup corrupted file: ${renameError instanceof Error ? renameError.message : String(renameError)}`
        );
        displayMessage('Proceeding with reset anyway...');
        displayMessage('');
      }

      const initialState = await resetFn();
      displayMessage('State has been reset to initial values.');
      return initialState;
    }

    displayMessage('State not modified. Please fix manually or backup and retry.');
    throw new StatePersistenceError(
      `State file corruption recovery declined by user: ${error.message}`,
      errorType,
      { cause: error.cause, details: error.details }
    );
  }
}

/**
 * Default user prompt handler using console readline.
 *
 * @param prompt - The prompt text to display.
 * @returns A promise resolving to the user's input.
 */
async function defaultPromptUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Loads protocol state with corruption detection and recovery.
 *
 * Attempts to load protocol state and provides user-friendly error handling
 * for corrupted state files, including offering recovery options.
 *
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded protocol state snapshot.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
export async function loadStateWithRecovery(
  filePath: string,
  options?: RecoveryOptions
): Promise<ProtocolStateSnapshot> {
  return withRecovery<ProtocolStateSnapshot>(
    () => loadState(filePath),
    async () => {
      const initialState = createInitialCliState();
      await saveCliState(initialState, filePath);
      return {
        state: initialState.state,
        artifacts: initialState.artifacts,
        blockingQueries: initialState.blockingQueries,
      };
    },
    filePath,
    options
  );
}
