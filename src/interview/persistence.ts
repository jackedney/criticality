/**
 * Interview state persistence module.
 *
 * Provides serialization and deserialization of interview state to/from JSON files
 * with atomic writes to prevent corruption, and transcript append to JSONL.
 *
 * @packageDocumentation
 */

import { writeFile, readFile, rename, unlink, appendFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  InterviewState,
  InterviewPhase,
  ExtractedRequirement,
  DelegationPoint,
  TranscriptEntry,
} from './types.js';
import { INTERVIEW_PHASES, isValidInterviewPhase } from './types.js';

/**
 * Error type for interview state persistence operations.
 */
export type InterviewPersistenceErrorType =
  | 'parse_error'
  | 'schema_error'
  | 'file_error'
  | 'validation_error'
  | 'corruption_error'
  | 'not_found';

/**
 * Error class for interview state serialization/deserialization errors.
 */
export class InterviewPersistenceError extends Error {
  /** The type of persistence error. */
  public readonly errorType: InterviewPersistenceErrorType;
  /** Additional details about the error. */
  public readonly details: string | undefined;
  /** The underlying cause of the error if available. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new InterviewPersistenceError.
   *
   * @param message - Human-readable error message.
   * @param errorType - The type of persistence error.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    errorType: InterviewPersistenceErrorType,
    options?: { details?: string | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = 'InterviewPersistenceError';
    this.errorType = errorType;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * Options for saving interview state.
 */
export interface SaveInterviewStateOptions {
  /** Pretty-print the JSON with indentation. Default is true. */
  pretty?: boolean;
  /** Indentation level for pretty-printing. Default is 2. */
  indent?: number;
}

/**
 * Gets the base directory for Criticality project data.
 *
 * @returns The path to ~/.criticality
 */
export function getCriticalityBaseDir(): string {
  return join(homedir(), '.criticality');
}

/**
 * Gets the directory path for a specific project's interview data.
 *
 * @param projectId - The project identifier.
 * @returns The path to ~/.criticality/projects/<project>/interview
 */
export function getInterviewDir(projectId: string): string {
  return join(getCriticalityBaseDir(), 'projects', projectId, 'interview');
}

/**
 * Gets the file path for a project's interview state.
 *
 * @param projectId - The project identifier.
 * @returns The path to ~/.criticality/projects/<project>/interview/state.json
 */
export function getInterviewStatePath(projectId: string): string {
  return join(getInterviewDir(projectId), 'state.json');
}

/**
 * Gets the file path for a project's interview transcript.
 *
 * @param projectId - The project identifier.
 * @returns The path to ~/.criticality/projects/<project>/interview/transcript.jsonl
 */
export function getTranscriptPath(projectId: string): string {
  return join(getInterviewDir(projectId), 'transcript.jsonl');
}

/**
 * Ensures the interview directory exists for a project.
 *
 * @param projectId - The project identifier.
 */
export async function ensureInterviewDir(projectId: string): Promise<void> {
  const dir = getInterviewDir(projectId);
  await mkdir(dir, { recursive: true });
}

/**
 * Validates an interview phase value.
 *
 * @param value - The value to validate.
 * @param fieldName - The field name for error messages.
 * @throws InterviewPersistenceError if invalid.
 */
function validatePhase(value: unknown, fieldName: string): asserts value is InterviewPhase {
  if (typeof value !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: ${fieldName} must be a string`,
      'schema_error'
    );
  }
  if (!isValidInterviewPhase(value)) {
    throw new InterviewPersistenceError(
      `Invalid interview state: ${fieldName} "${value}" is not a valid interview phase`,
      'validation_error',
      { details: `Valid phases: ${INTERVIEW_PHASES.join(', ')}` }
    );
  }
}

/**
 * Validates an extracted requirement object.
 *
 * @param value - The value to validate.
 * @param index - The index in the array for error messages.
 * @throws InterviewPersistenceError if invalid.
 */
function validateExtractedRequirement(
  value: unknown,
  index: number
): asserts value is ExtractedRequirement {
  const indexStr = String(index);
  if (value === null || typeof value !== 'object') {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}] must be an object`,
      'schema_error'
    );
  }

  const req = value as Record<string, unknown>;

  if (typeof req.id !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}].id must be a string`,
      'schema_error'
    );
  }

  validatePhase(req.sourcePhase, `extractedRequirements[${indexStr}].sourcePhase`);

  const validCategories = ['functional', 'non_functional', 'constraint', 'preference'];
  if (typeof req.category !== 'string' || !validCategories.includes(req.category)) {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}].category must be one of: ${validCategories.join(', ')}`,
      'validation_error'
    );
  }

  if (typeof req.text !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}].text must be a string`,
      'schema_error'
    );
  }

  const validConfidences = ['high', 'medium', 'low'];
  if (typeof req.confidence !== 'string' || !validConfidences.includes(req.confidence)) {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}].confidence must be one of: ${validConfidences.join(', ')}`,
      'validation_error'
    );
  }

  if (typeof req.extractedAt !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: extractedRequirements[${indexStr}].extractedAt must be a string`,
      'schema_error'
    );
  }
}

/**
 * Validates a delegation point object.
 *
 * @param value - The value to validate.
 * @param index - The index in the array for error messages.
 * @throws InterviewPersistenceError if invalid.
 */
function validateDelegationPoint(value: unknown, index: number): asserts value is DelegationPoint {
  const indexStr = String(index);
  if (value === null || typeof value !== 'object') {
    throw new InterviewPersistenceError(
      `Invalid interview state: delegationPoints[${indexStr}] must be an object`,
      'schema_error'
    );
  }

  const point = value as Record<string, unknown>;

  validatePhase(point.phase, `delegationPoints[${indexStr}].phase`);

  const validDecisions = ['Continue', 'Delegate', 'DelegateWithNotes'];
  if (typeof point.decision !== 'string' || !validDecisions.includes(point.decision)) {
    throw new InterviewPersistenceError(
      `Invalid interview state: delegationPoints[${indexStr}].decision must be one of: ${validDecisions.join(', ')}`,
      'validation_error'
    );
  }

  if (point.notes !== undefined && typeof point.notes !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: delegationPoints[${indexStr}].notes must be a string if provided`,
      'schema_error'
    );
  }

  if (typeof point.delegatedAt !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid interview state: delegationPoints[${indexStr}].delegatedAt must be a string`,
      'schema_error'
    );
  }
}

/**
 * Serializes interview state to a JSON string.
 *
 * @param state - The state to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the state.
 */
export function serializeInterviewState(
  state: InterviewState,
  options?: SaveInterviewStateOptions
): string {
  const pretty = options?.pretty !== false; // Default to true
  const indent = options?.indent ?? 2;

  if (pretty) {
    return JSON.stringify(state, null, indent);
  }
  return JSON.stringify(state);
}

/**
 * Deserializes a JSON string to an InterviewState.
 *
 * @param json - JSON string to parse.
 * @returns The deserialized interview state.
 * @throws InterviewPersistenceError if the JSON is invalid or malformed.
 */
export function deserializeInterviewState(json: string): InterviewState {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    throw new InterviewPersistenceError(
      `Failed to parse interview state JSON: ${parseError.message}`,
      'parse_error',
      { cause: parseError, details: 'The file does not contain valid JSON' }
    );
  }

  // Validate basic structure
  if (data === null || typeof data !== 'object') {
    throw new InterviewPersistenceError(
      'Invalid interview state format: expected an object',
      'schema_error',
      { details: `Received ${data === null ? 'null' : typeof data} instead of object` }
    );
  }

  const obj = data as Record<string, unknown>;

  // Check for required top-level fields
  const requiredFields = [
    'version',
    'projectId',
    'currentPhase',
    'completedPhases',
    'extractedRequirements',
    'delegationPoints',
    'transcriptEntryCount',
    'createdAt',
    'updatedAt',
  ];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new InterviewPersistenceError(
        `Invalid interview state format: missing required field "${field}"`,
        'schema_error',
        { details: `State file must contain: ${requiredFields.join(', ')}` }
      );
    }
  }

  // Validate version
  if (typeof obj.version !== 'string') {
    throw new InterviewPersistenceError(
      'Invalid interview state format: version must be a string',
      'schema_error'
    );
  }

  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(obj.version)) {
    throw new InterviewPersistenceError(
      `Invalid interview state format: version "${obj.version}" does not match semver pattern`,
      'schema_error',
      { details: 'Version must be in format X.Y.Z (e.g., "1.0.0")' }
    );
  }

  // Validate projectId
  if (typeof obj.projectId !== 'string' || obj.projectId.length === 0) {
    throw new InterviewPersistenceError(
      'Invalid interview state format: projectId must be a non-empty string',
      'schema_error'
    );
  }

  // Validate currentPhase
  validatePhase(obj.currentPhase, 'currentPhase');

  // Validate completedPhases
  if (!Array.isArray(obj.completedPhases)) {
    throw new InterviewPersistenceError(
      'Invalid interview state format: completedPhases must be an array',
      'schema_error'
    );
  }
  for (let i = 0; i < obj.completedPhases.length; i++) {
    validatePhase(obj.completedPhases[i], `completedPhases[${String(i)}]`);
  }

  // Validate extractedRequirements
  if (!Array.isArray(obj.extractedRequirements)) {
    throw new InterviewPersistenceError(
      'Invalid interview state format: extractedRequirements must be an array',
      'schema_error'
    );
  }
  for (let i = 0; i < obj.extractedRequirements.length; i++) {
    validateExtractedRequirement(obj.extractedRequirements[i], i);
  }

  // Validate delegationPoints
  if (!Array.isArray(obj.delegationPoints)) {
    throw new InterviewPersistenceError(
      'Invalid interview state format: delegationPoints must be an array',
      'schema_error'
    );
  }
  for (let i = 0; i < obj.delegationPoints.length; i++) {
    validateDelegationPoint(obj.delegationPoints[i], i);
  }

  // Validate transcriptEntryCount
  if (typeof obj.transcriptEntryCount !== 'number' || obj.transcriptEntryCount < 0) {
    throw new InterviewPersistenceError(
      'Invalid interview state format: transcriptEntryCount must be a non-negative number',
      'schema_error'
    );
  }

  // Validate timestamps
  if (typeof obj.createdAt !== 'string') {
    throw new InterviewPersistenceError(
      'Invalid interview state format: createdAt must be a string',
      'schema_error'
    );
  }
  if (typeof obj.updatedAt !== 'string') {
    throw new InterviewPersistenceError(
      'Invalid interview state format: updatedAt must be a string',
      'schema_error'
    );
  }

  return obj as unknown as InterviewState;
}

/**
 * Saves interview state to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the state file.
 *
 * @param state - The interview state to save.
 * @param options - Save options.
 * @throws InterviewPersistenceError if the file cannot be written.
 */
export async function saveInterviewState(
  state: InterviewState,
  options?: SaveInterviewStateOptions
): Promise<void> {
  const filePath = getInterviewStatePath(state.projectId);
  const json = serializeInterviewState(state, options);
  const tempPath = join(dirname(filePath), `.state-${randomUUID()}.tmp`);

  // Ensure directory exists
  await ensureInterviewDir(state.projectId);

  try {
    // Write to temporary file first
    await writeFile(tempPath, json, 'utf-8');

    // Atomic rename to target path
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new InterviewPersistenceError(
      `Failed to save interview state to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError, details: 'Check that the directory exists and is writable' }
    );
  }
}

/**
 * Loads interview state from a JSON file.
 *
 * @param projectId - The project identifier.
 * @returns The deserialized interview state.
 * @throws InterviewPersistenceError if the file cannot be read or contains invalid data.
 */
export async function loadInterviewState(projectId: string): Promise<InterviewState> {
  const filePath = getInterviewStatePath(projectId);
  let content: string;

  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const fileError = error instanceof Error ? error : new Error(String(error));
    const isNotFound =
      fileError instanceof Error &&
      'code' in fileError &&
      (fileError as Error & { code?: string }).code === 'ENOENT';

    if (isNotFound) {
      throw new InterviewPersistenceError(
        `Interview state not found for project "${projectId}"`,
        'not_found',
        {
          cause: fileError,
          details: `No interview state file exists at ${filePath}. Start a new interview with createInitialInterviewState().`,
        }
      );
    }

    throw new InterviewPersistenceError(
      `Failed to read interview state file "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }

  // Check for empty or whitespace-only content
  if (content.trim() === '') {
    throw new InterviewPersistenceError(
      `Interview state file for project "${projectId}" is empty`,
      'corruption_error',
      {
        details: 'The file exists but contains no data. The state file may have been corrupted.',
      }
    );
  }

  // Deserialize with validation
  try {
    return deserializeInterviewState(content);
  } catch (error) {
    // Re-wrap errors with project context
    if (error instanceof InterviewPersistenceError) {
      throw new InterviewPersistenceError(
        `Error loading interview state for project "${projectId}": ${error.message}`,
        error.errorType,
        { cause: error.cause, details: error.details }
      );
    }
    throw error;
  }
}

/**
 * Checks if an interview state file exists for a project.
 *
 * @param projectId - The project identifier.
 * @returns True if the interview state file exists.
 */
export async function interviewStateExists(projectId: string): Promise<boolean> {
  const filePath = getInterviewStatePath(projectId);
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serializes a transcript entry to a JSONL line.
 *
 * @param entry - The transcript entry to serialize.
 * @returns A JSON string for a single line (without trailing newline).
 */
export function serializeTranscriptEntry(entry: TranscriptEntry): string {
  return JSON.stringify(entry);
}

/**
 * Deserializes a JSONL line to a transcript entry.
 *
 * @param line - A single line from the JSONL file.
 * @param lineNumber - The line number for error messages.
 * @returns The deserialized transcript entry.
 * @throws InterviewPersistenceError if the line is invalid.
 */
export function deserializeTranscriptEntry(line: string, lineNumber: number): TranscriptEntry {
  const lineNumStr = String(lineNumber);
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    throw new InterviewPersistenceError(
      `Failed to parse transcript entry at line ${lineNumStr}: ${parseError.message}`,
      'parse_error',
      { cause: parseError }
    );
  }

  if (data === null || typeof data !== 'object') {
    throw new InterviewPersistenceError(
      `Invalid transcript entry at line ${lineNumStr}: expected an object`,
      'schema_error'
    );
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.id !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid transcript entry at line ${lineNumStr}: id must be a string`,
      'schema_error'
    );
  }

  validatePhase(obj.phase, `transcript entry at line ${lineNumStr}.phase`);

  const validRoles = ['system', 'assistant', 'user'];
  if (typeof obj.role !== 'string' || !validRoles.includes(obj.role)) {
    throw new InterviewPersistenceError(
      `Invalid transcript entry at line ${lineNumStr}: role must be one of: ${validRoles.join(', ')}`,
      'validation_error'
    );
  }

  if (typeof obj.content !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid transcript entry at line ${lineNumStr}: content must be a string`,
      'schema_error'
    );
  }

  if (typeof obj.timestamp !== 'string') {
    throw new InterviewPersistenceError(
      `Invalid transcript entry at line ${lineNumStr}: timestamp must be a string`,
      'schema_error'
    );
  }

  return obj as unknown as TranscriptEntry;
}

/**
 * Appends a transcript entry to the JSONL file.
 *
 * @param projectId - The project identifier.
 * @param entry - The transcript entry to append.
 * @throws InterviewPersistenceError if the file cannot be written.
 */
export async function appendTranscriptEntry(
  projectId: string,
  entry: TranscriptEntry
): Promise<void> {
  const filePath = getTranscriptPath(projectId);

  // Ensure directory exists
  await ensureInterviewDir(projectId);

  const line = serializeTranscriptEntry(entry) + '\n';

  try {
    await appendFile(filePath, line, 'utf-8');
  } catch (error) {
    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new InterviewPersistenceError(
      `Failed to append transcript entry to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError, details: 'Check that the directory exists and is writable' }
    );
  }
}

/**
 * Appends a transcript entry and updates state with incremented count.
 *
 * This helper function centralizes the pattern of:
 * 1. Append entry to transcript
 * 2. Increment transcriptEntryCount
 * 3. Update updatedAt timestamp
 * 4. Save state
 *
 * @param projectId - The project identifier.
 * @param entry - The transcript entry to append.
 * @param state - The interview state to update.
 * @returns The updated interview state.
 * @throws InterviewPersistenceError if entry or state cannot be saved.
 */
export async function appendTranscriptEntryAndUpdateState(
  projectId: string,
  entry: TranscriptEntry,
  state: InterviewState
): Promise<InterviewState> {
  await appendTranscriptEntry(projectId, entry);

  const updatedState: InterviewState = {
    ...state,
    transcriptEntryCount: state.transcriptEntryCount + 1,
    updatedAt: new Date().toISOString(),
  };

  await saveInterviewState(updatedState);
  return updatedState;
}

/**
 * Loads all transcript entries from the JSONL file.
 *
 * @param projectId - The project identifier.
 * @returns An array of all transcript entries, or empty array if file doesn't exist.
 * @throws InterviewPersistenceError if the file exists but contains invalid data.
 */
export async function loadTranscript(projectId: string): Promise<TranscriptEntry[]> {
  const filePath = getTranscriptPath(projectId);
  let content: string;

  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const fileError = error instanceof Error ? error : new Error(String(error));
    const isNotFound =
      fileError instanceof Error &&
      'code' in fileError &&
      (fileError as Error & { code?: string }).code === 'ENOENT';

    if (isNotFound) {
      // No transcript file yet - that's fine, return empty array
      return [];
    }

    throw new InterviewPersistenceError(
      `Failed to read transcript file "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }

  // Handle empty file
  if (content.trim() === '') {
    return [];
  }

  // Parse each line
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  const entries: TranscriptEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined) {
      entries.push(deserializeTranscriptEntry(line, i + 1));
    }
  }

  return entries;
}

/**
 * Result type for interview state loading that handles both success and not-found cases.
 */
export type LoadInterviewResult =
  | { success: true; state: InterviewState }
  | { success: false; error: InterviewPersistenceError };

/**
 * Attempts to load interview state, returning a result type instead of throwing.
 *
 * @param projectId - The project identifier.
 * @returns A result object indicating success or failure.
 */
export async function tryLoadInterviewState(projectId: string): Promise<LoadInterviewResult> {
  try {
    const state = await loadInterviewState(projectId);
    return { success: true, state };
  } catch (error) {
    if (error instanceof InterviewPersistenceError) {
      return { success: false, error };
    }
    // Wrap unexpected errors
    return {
      success: false,
      error: new InterviewPersistenceError(
        `Unexpected error loading interview state: ${error instanceof Error ? error.message : String(error)}`,
        'file_error',
        { cause: error instanceof Error ? error : undefined }
      ),
    };
  }
}
