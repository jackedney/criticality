/**
 * Decision Ledger persistence module.
 *
 * Provides serialization and deserialization of ledgers to/from JSON files
 * with atomic writes to prevent corruption and clear error handling.
 *
 * @packageDocumentation
 */

import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LedgerData } from './types.js';
import { Ledger, fromData, LedgerValidationError, DuplicateDecisionIdError } from './ledger.js';
import { safeReadFile, safeWriteFile, safeRename, safeUnlink } from '../utils/safe-fs.js';

/**
 * Error type for serialization operations.
 */
export type SerializationErrorType =
  | 'parse_error'
  | 'schema_error'
  | 'file_error'
  | 'validation_error'
  | 'corruption_error';

/**
 * Error class for ledger serialization/deserialization errors.
 */
export class LedgerSerializationError extends Error {
  /** The type of serialization error. */
  public readonly errorType: SerializationErrorType;
  /** Additional details about the error. */
  public readonly details: string | undefined;
  /** The underlying cause of the error if available. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new LedgerSerializationError.
   *
   * @param message - Human-readable error message.
   * @param errorType - The type of serialization error.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    errorType: SerializationErrorType,
    options?: { details?: string | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = 'LedgerSerializationError';
    this.errorType = errorType;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * Options for loading a ledger from disk.
 */
export interface LoadLedgerOptions {
  /** Optional function to get current time (for testing). */
  now?: (() => Date) | undefined;
}

/**
 * Options for saving a ledger to disk.
 */
export interface SaveLedgerOptions {
  /** Pretty-print the JSON with indentation. Default is true. */
  pretty?: boolean;
  /** Indentation level for pretty-printing. Default is 2. */
  indent?: number;
}

/**
 * Serializes a ledger to a JSON string.
 *
 * The output matches the ledger.schema.json specification.
 *
 * @param ledger - The ledger to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the ledger.
 *
 * @example
 * ```typescript
 * const ledger = new Ledger({ project: 'my-project' });
 * ledger.append({ ... });
 * const json = serialize(ledger);
 * console.log(json);
 * ```
 */
export function serialize(ledger: Ledger, options?: SaveLedgerOptions): string {
  const data = ledger.toData();
  const pretty = options?.pretty !== false; // Default to true
  const indent = options?.indent ?? 2;

  if (pretty) {
    return JSON.stringify(data, null, indent);
  }
  return JSON.stringify(data);
}

/**
 * Deserializes a JSON string to a Ledger instance.
 *
 * Validates the JSON structure and all decisions against the schema.
 *
 * @param json - JSON string to parse.
 * @param options - Deserialization options.
 * @returns A new Ledger instance populated with the data.
 * @throws LedgerSerializationError if the JSON is invalid or malformed.
 * @throws LedgerValidationError if any decision fails validation.
 * @throws DuplicateDecisionIdError if duplicate IDs are found.
 *
 * @example
 * ```typescript
 * const json = fs.readFileSync('ledger.json', 'utf-8');
 * const ledger = deserialize(json);
 * ```
 */
export function deserialize(json: string, options?: LoadLedgerOptions): Ledger {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    throw new LedgerSerializationError(
      `Failed to parse ledger JSON: ${parseError.message}`,
      'parse_error',
      { cause: parseError, details: 'The file does not contain valid JSON' }
    );
  }

  // Validate basic structure
  if (data === null || typeof data !== 'object') {
    throw new LedgerSerializationError(
      'Invalid ledger format: expected an object',
      'schema_error',
      { details: `Received ${data === null ? 'null' : typeof data} instead of object` }
    );
  }

  const obj = data as Record<string, unknown>;

  // Check for required top-level fields
  if (!('meta' in obj)) {
    throw new LedgerSerializationError(
      'Invalid ledger format: missing required field "meta"',
      'schema_error',
      { details: 'The ledger file is missing the meta section' }
    );
  }

  if (!('decisions' in obj)) {
    throw new LedgerSerializationError(
      'Invalid ledger format: missing required field "decisions"',
      'schema_error',
      { details: 'The ledger file is missing the decisions array' }
    );
  }

  // Validate meta structure
  if (obj.meta === null || typeof obj.meta !== 'object') {
    throw new LedgerSerializationError(
      'Invalid ledger format: "meta" must be an object',
      'schema_error',
      { details: `meta is ${obj.meta === null ? 'null' : typeof obj.meta}` }
    );
  }

  const meta = obj.meta as Record<string, unknown>;

  // Check required meta fields
  const requiredMetaFields = ['version', 'created', 'project'];
  for (const field of requiredMetaFields) {
    if (!(field in meta)) {
      throw new LedgerSerializationError(
        `Invalid ledger format: missing required meta field "${field}"`,
        'schema_error',
        { details: `The meta section must contain: ${requiredMetaFields.join(', ')}` }
      );
    }
  }

  // Validate version format
  if (typeof meta.version !== 'string') {
    throw new LedgerSerializationError(
      'Invalid ledger format: meta.version must be a string',
      'schema_error'
    );
  }

  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(meta.version)) {
    throw new LedgerSerializationError(
      `Invalid ledger format: meta.version "${meta.version}" does not match semver pattern`,
      'schema_error',
      { details: 'Version must be in format X.Y.Z (e.g., "1.0.0")' }
    );
  }

  // Validate decisions is an array
  if (!Array.isArray(obj.decisions)) {
    throw new LedgerSerializationError(
      'Invalid ledger format: "decisions" must be an array',
      'schema_error',
      { details: `decisions is ${typeof obj.decisions}` }
    );
  }

  // At this point, the basic structure is valid
  // Let fromData handle the detailed validation of each decision
  try {
    return fromData(obj as unknown as LedgerData, options);
  } catch (error) {
    // Re-throw known validation errors
    if (error instanceof LedgerValidationError) {
      throw new LedgerSerializationError(
        `Invalid decision data: ${error.message}`,
        'validation_error',
        { cause: error, details: 'One or more decisions failed validation' }
      );
    }
    if (error instanceof DuplicateDecisionIdError) {
      throw new LedgerSerializationError(
        `Duplicate decision ID: ${error.message}`,
        'validation_error',
        { cause: error, details: 'The ledger contains duplicate decision IDs' }
      );
    }
    throw error;
  }
}

/**
 * Saves a ledger to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the ledger file.
 *
 * @param ledger - The ledger to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws LedgerSerializationError if the file cannot be written.
 *
 * @example
 * ```typescript
 * const ledger = new Ledger({ project: 'my-project' });
 * await saveLedger(ledger, '/path/to/ledger.json');
 * ```
 */
export async function saveLedger(
  ledger: Ledger,
  filePath: string,
  options?: SaveLedgerOptions
): Promise<void> {
  const json = serialize(ledger, options);
  const tempPath = join(dirname(filePath), `.ledger-${randomUUID()}.tmp`);

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
    throw new LedgerSerializationError(
      `Failed to save ledger to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError, details: 'Check that the directory exists and is writable' }
    );
  }
}

/**
 * Loads a ledger from a JSON file.
 *
 * Reads the file, parses the JSON, validates the structure and all decisions.
 *
 * @param filePath - Path to the ledger JSON file.
 * @param options - Load options.
 * @returns A new Ledger instance populated with the data.
 * @throws LedgerSerializationError if the file cannot be read or contains invalid data.
 *
 * @example
 * ```typescript
 * const ledger = await loadLedger('/path/to/ledger.json');
 * console.log(ledger.size); // Number of decisions
 * ```
 */
export async function loadLedger(filePath: string, options?: LoadLedgerOptions): Promise<Ledger> {
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
      throw new LedgerSerializationError(`Ledger file not found: "${filePath}"`, 'file_error', {
        cause: fileError,
        details: 'The specified ledger file does not exist',
      });
    }

    throw new LedgerSerializationError(
      `Failed to read ledger file "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError }
    );
  }

  // Check for empty or whitespace-only content
  if (content.trim() === '') {
    throw new LedgerSerializationError(`Ledger file "${filePath}" is empty`, 'corruption_error', {
      details: 'The file exists but contains no data',
    });
  }

  // Deserialize with validation
  try {
    return deserialize(content, options);
  } catch (error) {
    // Re-wrap errors with file path context
    if (error instanceof LedgerSerializationError) {
      throw new LedgerSerializationError(
        `Error loading ledger from "${filePath}": ${error.message}`,
        error.errorType,
        { cause: error.cause, details: error.details }
      );
    }
    throw error;
  }
}
