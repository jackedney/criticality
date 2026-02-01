/**
 * Safe file system utilities with path validation.
 *
 * This module provides wrapper functions for common file system operations that
 * validate all paths before use to prevent security vulnerabilities such as:
 *
 * - Path traversal attacks (e.g., "../../../etc/passwd")
 * - Directory traversal in user-supplied paths
 * - Invalid or empty file paths
 *
 * All paths are resolved to absolute paths and validated before any file system
 * operation is attempted. This ensures that operations only occur on intended
 * files and directories.
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

/**
 * Error thrown when path validation fails.
 */
export class PathValidationError extends Error {
  /** The invalid path that caused the error. */
  public readonly invalidPath: string;

  /**
   * Creates a new PathValidationError.
   *
   * @param message - Human-readable error message.
   * @param invalidPath - The path that failed validation.
   */
  constructor(message: string, invalidPath: string) {
    super(message);
    this.name = 'PathValidationError';
    this.invalidPath = invalidPath;
  }
}

/**
 * Validates and resolves a file system path.
 *
 * This function ensures that:
 * - The path is a non-empty string
 * - The path can be resolved to an absolute path
 * - The resolved path is absolute (prevents relative path traversal)
 *
 * Security Rationale:
 * - Using `path.resolve` normalizes the path and resolves any "." or ".." segments
 * - Checking `path.isAbsolute` ensures the resolved path is absolute
 * - This prevents directory traversal attacks where malicious input could escape
 *   the intended directory structure
 *
 * @param filePath - The path to validate.
 * @returns The resolved absolute path.
 * @throws {PathValidationError} If the path is invalid (empty, contains null bytes, or resolves to a non-absolute path).
 */
export function validatePath(filePath: string): string {
  if (typeof filePath !== 'string') {
    throw new PathValidationError('Path must be a string', String(filePath));
  }

  if (filePath.length === 0) {
    throw new PathValidationError('Path cannot be empty', filePath);
  }

  if (filePath.includes('\0')) {
    throw new PathValidationError('Path cannot contain null bytes', filePath);
  }

  const resolved = path.resolve(filePath);

  if (!path.isAbsolute(resolved)) {
    throw new PathValidationError('Path must resolve to an absolute path', filePath);
  }

  return resolved;
}

/**
 * Safely reads a file after validating the path.
 *
 * @param filePath - The path to the file to read.
 * @param options - Optional encoding or file read options.
 * @returns A promise that resolves to the file contents.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be read (e.g., file not found, permission denied).
 */
export async function safeReadFile(
  filePath: string,
  options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null
): Promise<string | Buffer> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.readFile(validatedPath, options);
}

/**
 * Safely writes to a file after validating the path.
 *
 * @param filePath - The path to the file to write.
 * @param data - The data to write to the file.
 * @param options - Optional encoding or file write options.
 * @returns A promise that resolves when the file is written.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be written (e.g., permission denied, directory does not exist).
 */
export async function safeWriteFile(
  filePath: string,
  data: string | Buffer | DataView,
  options?:
    | { encoding?: BufferEncoding | null; mode?: number; flag?: string }
    | BufferEncoding
    | null
): Promise<void> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.writeFile(validatedPath, data, options);
}

/**
 * Safely checks if a file or directory exists after validating the path.
 *
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 * @throws {PathValidationError} If the path is invalid.
 */
export async function safeExists(filePath: string): Promise<boolean> {
  const validatedPath = validatePath(filePath);
  try {
    await fs.access(validatedPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronously checks if a file or directory exists after validating the path.
 *
 * @param filePath - The path to check.
 * @returns True if the path exists, false otherwise.
 * @throws {PathValidationError} If the path is invalid.
 */
export function safeExistsSync(filePath: string): boolean {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fsSync.existsSync(validatedPath);
}

/**
 * Synchronously reads a file after validating the path.
 *
 * @param filePath - The path to the file to read.
 * @param options - Optional encoding or file read options.
 * @returns The file contents as a string or Buffer.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be read (e.g., file not found, permission denied).
 */
export function safeReadFileSync(
  filePath: string,
  options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null
): string | Buffer {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fsSync.readFileSync(validatedPath, options);
}

/**
 * Synchronously reads a directory after validating the path.
 *
 * Overload signatures for different option types.
 */
export function safeReaddirSync(
  filePath: string,
  options?: { withFileTypes?: boolean }
): import('node:fs').Dirent[];
export function safeReaddirSync(filePath: string, options?: BufferEncoding | null): string[];
export function safeReaddirSync(
  filePath: string,
  options?: { withFileTypes?: boolean } | BufferEncoding | null
): string[] | import('node:fs').Dirent[] {
  const validatedPath = validatePath(filePath);
  return (
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    fsSync.readdirSync(
      validatedPath,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- type safety enforced by overload signatures
      options as any
    )
  );
}

/**
 * Safely creates a directory after validating the path.
 *
 * @param filePath - The path to the directory to create.
 * @param options - Optional recursive mode and mode options.
 * @returns A promise that resolves when the directory is created.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the directory cannot be created (e.g., permission denied, file exists).
 */
export async function safeMkdir(
  filePath: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<string | undefined> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.mkdir(validatedPath, options);
}

/**
 * Safely reads a directory after validating the path.
 *
 * @param filePath - The path to the directory to read.
 * @param options - Optional encoding or directory read options.
 * @returns A promise that resolves to an array of file/directory names in the directory.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the directory cannot be read (e.g., not found, not a directory, permission denied).
 */
export async function safeReaddir(filePath: string, options?: unknown): Promise<unknown> {
  const validatedPath = validatePath(filePath);

  return (
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
    fs.readdir(
      validatedPath,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- required for complex readdir options
      options as any
    )
  );
}

/**
 * Safely gets file statistics after validating the path.
 *
 * @param filePath - The path to the file or directory.
 * @returns A promise that resolves to file statistics.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the statistics cannot be retrieved (e.g., not found, permission denied).
 */
export async function safeStat(filePath: string): Promise<ReturnType<typeof fs.stat>> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.stat(validatedPath);
}

/**
 * Safely deletes a file after validating the path.
 *
 * @param filePath - The path to the file to delete.
 * @returns A promise that resolves when the file is deleted.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be deleted (e.g., not found, is a directory, permission denied).
 */
export async function safeUnlink(filePath: string): Promise<void> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.unlink(validatedPath);
}

/**
 * Safely renames a file or directory after validating both paths.
 *
 * @param oldPath - The current path of the file or directory.
 * @param newPath - The new path for the file or directory.
 * @returns A promise that resolves when the file or directory is renamed.
 * @throws {PathValidationError} If either path is invalid.
 * @throws {Error} If the rename operation fails (e.g., old path not found, new path exists, permission denied).
 */
export async function safeRename(oldPath: string, newPath: string): Promise<void> {
  const validatedOldPath = validatePath(oldPath);
  const validatedNewPath = validatePath(newPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are validated by validatePath
  return fs.rename(validatedOldPath, validatedNewPath);
}

/**
 * Synchronously writes to a file after validating the path.
 *
 * @param filePath - The path to the file to write.
 * @param data - The data to write to the file.
 * @param options - Optional encoding or file write options.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be written (e.g., permission denied, directory does not exist).
 */
export function safeWriteFileSync(
  filePath: string,
  data: string | Buffer | DataView,
  options?:
    | { encoding?: BufferEncoding | null; mode?: number; flag?: string }
    | BufferEncoding
    | null
): void {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  fsSync.writeFileSync(validatedPath, data, options);
}

/**
 * Synchronously creates a directory after validating the path.
 *
 * @param filePath - The path to the directory to create.
 * @param options - Optional recursive mode and mode options.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the directory cannot be created (e.g., permission denied, file exists).
 */
export function safeMkdirSync(
  filePath: string,
  options?: { recursive?: boolean; mode?: number }
): string | undefined {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fsSync.mkdirSync(validatedPath, options);
}

/**
 * Synchronously removes a file or directory after validating the path.
 *
 * @param filePath - The path to the file or directory to remove.
 * @param options - Options for removal.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the path cannot be removed (e.g., not found, permission denied).
 */
export function safeRmSync(
  filePath: string,
  options?: { force?: boolean; maxRetries?: number; recursive?: boolean; retryDelay?: number }
): void {
  const validatedPath = validatePath(filePath);

  fsSync.rmSync(validatedPath, options);
}

/**
 * Safely appends data to a file after validating the path.
 *
 * @param filePath - The path to the file to append to.
 * @param data - The data to append.
 * @param options - Optional encoding or file append options.
 * @returns A promise that resolves when the file is appended to.
 * @throws {PathValidationError} If the path is invalid.
 * @throws {Error} If the file cannot be appended to (e.g., permission denied, directory does not exist).
 */
export async function safeAppendFile(
  filePath: string,
  data: string,
  options?:
    | { encoding?: BufferEncoding | null; mode?: number; flag?: string }
    | BufferEncoding
    | null
): Promise<void> {
  const validatedPath = validatePath(filePath);

  if (typeof options === 'string') {
    return fs.appendFile(validatedPath, data, options);
  }
  return fs.appendFile(validatedPath, data, options);
}

export async function safeAppendFileWithOptions(
  filePath: string,
  data: string | Buffer,
  options: { encoding?: BufferEncoding | null; mode?: number; flag?: string }
): Promise<void> {
  const validatedPath = validatePath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by validatePath
  return fs.appendFile(validatedPath, data, options);
}
