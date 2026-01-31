/**
 * Contradiction report storage module.
 *
 * Provides persistence for contradiction reports to the project directory,
 * supporting both JSON and YAML formats.
 *
 * @packageDocumentation
 */

import { writeFile, readFile, mkdir, readdir, stat, rename, unlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as yaml from 'js-yaml';
import type { ContradictionReport, ContradictionReportStorageOptions } from './types.js';
import { isValidContradictionReport } from './report-parser.js';

/**
 * Error type for report storage operations.
 */
export type ReportStorageErrorType =
  | 'file_error'
  | 'parse_error'
  | 'validation_error'
  | 'not_found';

/**
 * Error class for report storage operations.
 */
export class ReportStorageError extends Error {
  /** The type of storage error. */
  public readonly errorType: ReportStorageErrorType;
  /** Additional details about the error. */
  public readonly details: string | undefined;
  /** The underlying cause of the error if available. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new ReportStorageError.
   *
   * @param message - Human-readable error message.
   * @param errorType - The type of storage error.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    errorType: ReportStorageErrorType,
    options?: { details?: string | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = 'ReportStorageError';
    this.errorType = errorType;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

/**
 * Default storage options.
 */
const DEFAULT_STORAGE_OPTIONS: Required<ContradictionReportStorageOptions> = {
  format: 'json',
  pretty: true,
};

/**
 * Gets the base directory for Criticality project data.
 *
 * @returns The path to ~/.criticality
 */
export function getCriticalityBaseDir(): string {
  return join(homedir(), '.criticality');
}

/**
 * Gets the directory path for a project's audit reports.
 *
 * @param projectId - The project identifier.
 * @returns The path to ~/.criticality/projects/<project>/audit
 * @throws {Error} If projectId contains invalid characters or attempts path traversal
 */
export function getAuditDir(projectId: string): string {
  const safeProjectIdRegex = /^[A-Za-z0-9._-]+$/;
  if (!safeProjectIdRegex.test(projectId)) {
    throw new Error(
      `Invalid projectId: contains invalid characters. Only alphanumeric, '.', '_', and '-' are allowed.`
    );
  }

  const auditDir = join(getCriticalityBaseDir(), 'projects', projectId, 'audit');
  const resolvedPath = resolve(auditDir);
  const basePath = getCriticalityBaseDir();

  if (!resolvedPath.startsWith(basePath)) {
    throw new Error(`Invalid projectId: path traversal detected.`);
  }

  return resolvedPath;
}

/**
 * Gets the file path for a specific contradiction report.
 *
 * @param projectId - The project identifier.
 * @param reportId - The report identifier.
 * @param format - The file format ('json' or 'yaml').
 * @returns The full path to the report file.
 */
export function getReportPath(
  projectId: string,
  reportId: string,
  format: 'json' | 'yaml' = 'json'
): string {
  const extension = format === 'yaml' ? 'yaml' : 'json';
  return join(getAuditDir(projectId), `${reportId}.${extension}`);
}

/**
 * Gets the file path for the latest contradiction report.
 *
 * @param projectId - The project identifier.
 * @param format - The file format ('json' or 'yaml').
 * @returns The path to the latest report file.
 */
export function getLatestReportPath(projectId: string, format: 'json' | 'yaml' = 'json'): string {
  const extension = format === 'yaml' ? 'yaml' : 'json';
  return join(getAuditDir(projectId), `latest.${extension}`);
}

/**
 * Ensures the audit directory exists for a project.
 *
 * @param projectId - The project identifier.
 */
export async function ensureAuditDir(projectId: string): Promise<void> {
  const dir = getAuditDir(projectId);
  await mkdir(dir, { recursive: true });
}

/**
 * Serializes a ContradictionReport to JSON string.
 *
 * @param report - The report to serialize.
 * @param pretty - Whether to pretty-print.
 * @returns JSON string.
 */
export function serializeReportToJson(report: ContradictionReport, pretty: boolean): string {
  if (pretty) {
    return JSON.stringify(report, null, 2);
  }
  return JSON.stringify(report);
}

/**
 * Serializes a ContradictionReport to YAML string.
 *
 * Uses js-yaml library for robust YAML serialization that properly handles
 * edge cases including colons, leading special characters, and multi-line content.
 *
 * @param report - The report to serialize.
 * @returns YAML string.
 */
export function serializeReportToYaml(report: ContradictionReport): string {
  return yaml.dump(report, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * Saves a contradiction report to the project directory.
 *
 * Uses atomic write pattern (temp file + rename) to prevent partial writes.
 *
 * @param report - The report to save.
 * @param options - Storage options.
 * @returns The path where the report was saved.
 * @throws ReportStorageError if the file cannot be written.
 */
export async function saveContradictionReport(
  report: ContradictionReport,
  options?: ContradictionReportStorageOptions
): Promise<string> {
  const opts: Required<ContradictionReportStorageOptions> = {
    ...DEFAULT_STORAGE_OPTIONS,
    ...options,
  };

  await ensureAuditDir(report.projectId);

  const filePath = getReportPath(report.projectId, report.id, opts.format);
  const latestPath = getLatestReportPath(report.projectId, opts.format);

  // Serialize based on format
  const content =
    opts.format === 'yaml'
      ? serializeReportToYaml(report)
      : serializeReportToJson(report, opts.pretty);

  const tempPath = join(dirname(filePath), `.report-${randomUUID()}.tmp`);

  try {
    // Write to temporary file first
    await writeFile(tempPath, content, 'utf-8');

    // Atomic rename to target path
    await rename(tempPath, filePath);

    // Also save as latest (copy the content)
    const latestTempPath = join(dirname(latestPath), `.latest-${randomUUID()}.tmp`);
    await writeFile(latestTempPath, content, 'utf-8');
    await rename(latestTempPath, latestPath);

    return filePath;
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    const fileError = error instanceof Error ? error : new Error(String(error));
    throw new ReportStorageError(
      `Failed to save contradiction report to "${filePath}": ${fileError.message}`,
      'file_error',
      { cause: fileError, details: 'Check that the directory exists and is writable' }
    );
  }
}

/**
 * Loads a contradiction report by ID.
 *
 * @param projectId - The project identifier.
 * @param reportId - The report identifier.
 * @returns The loaded report.
 * @throws ReportStorageError if the file cannot be read or is invalid.
 */
export async function loadContradictionReport(
  projectId: string,
  reportId: string
): Promise<ContradictionReport> {
  // Try JSON first, then YAML
  const jsonPath = getReportPath(projectId, reportId, 'json');
  const yamlPath = getReportPath(projectId, reportId, 'yaml');

  let content: string;
  let filePath: string;

  try {
    content = await readFile(jsonPath, 'utf-8');
    filePath = jsonPath;
  } catch {
    try {
      content = await readFile(yamlPath, 'utf-8');
      filePath = yamlPath;
    } catch (error) {
      const fileError = error instanceof Error ? error : new Error(String(error));
      throw new ReportStorageError(
        `Contradiction report "${reportId}" not found for project "${projectId}"`,
        'not_found',
        { cause: fileError, details: `Looked for ${jsonPath} and ${yamlPath}` }
      );
    }
  }

  return parseReportContent(content, filePath);
}

/**
 * Loads the latest contradiction report for a project.
 *
 * @param projectId - The project identifier.
 * @returns The latest report or null if none exists.
 */
export async function loadLatestContradictionReport(
  projectId: string
): Promise<ContradictionReport | null> {
  const jsonPath = getLatestReportPath(projectId, 'json');
  const yamlPath = getLatestReportPath(projectId, 'yaml');

  let content: string;
  let filePath: string;

  try {
    content = await readFile(jsonPath, 'utf-8');
    filePath = jsonPath;
  } catch {
    try {
      content = await readFile(yamlPath, 'utf-8');
      filePath = yamlPath;
    } catch {
      return null;
    }
  }

  return parseReportContent(content, filePath);
}

/**
 * Parses report content from JSON or YAML.
 *
 * Attempts JSON parsing first, then falls back to YAML parsing on failure.
 *
 * @param content - The file content.
 * @param filePath - The file path for error messages.
 * @returns The parsed report.
 */
function parseReportContent(content: string, filePath: string): ContradictionReport {
  let data: unknown;
  let parseError: Error;

  try {
    data = JSON.parse(content);
  } catch (error) {
    parseError = error instanceof Error ? error : new Error(String(error));
    try {
      data = yaml.load(content);
    } catch (yamlError) {
      const yamlParseError = yamlError instanceof Error ? yamlError : new Error(String(yamlError));
      throw new ReportStorageError(
        `Failed to parse contradiction report at "${filePath}": Neither JSON nor YAML format valid`,
        'parse_error',
        { cause: new Error(`JSON: ${parseError.message}; YAML: ${yamlParseError.message}`) }
      );
    }
  }

  if (!isValidContradictionReport(data)) {
    throw new ReportStorageError(
      `Invalid contradiction report format at "${filePath}"`,
      'validation_error',
      { details: 'Report does not match expected schema' }
    );
  }

  return data;
}

/**
 * Lists all contradiction reports for a project.
 *
 * @param projectId - The project identifier.
 * @returns Array of report IDs sorted by date (newest first).
 */
export async function listContradictionReports(projectId: string): Promise<string[]> {
  const auditDir = getAuditDir(projectId);

  try {
    const files = await readdir(auditDir);
    const reportIds: { id: string; mtime: number }[] = [];

    for (const file of files) {
      // Skip latest files
      if (file.startsWith('latest.')) {
        continue;
      }

      // Extract report ID from filename
      const match = /^(.+)\.(json|yaml)$/.exec(file);
      if (match?.[1] === undefined) {
        continue;
      }

      const reportId = match[1];
      const fullPath = join(auditDir, file);

      try {
        const stats = await stat(fullPath);
        reportIds.push({ id: reportId, mtime: stats.mtimeMs });
      } catch {
        // Skip files we can't stat
        continue;
      }
    }

    // Sort by modification time, newest first
    reportIds.sort((a, b) => b.mtime - a.mtime);

    // Remove duplicates (same ID in both json and yaml)
    const seen = new Set<string>();
    const result: string[] = [];
    for (const { id } of reportIds) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }

    return result;
  } catch (error) {
    const fileError = error instanceof Error ? error : new Error(String(error));
    const isNotFound =
      'code' in fileError && (fileError as Error & { code?: string }).code === 'ENOENT';

    if (isNotFound) {
      return [];
    }

    throw new ReportStorageError(
      `Failed to list contradiction reports for project "${projectId}"`,
      'file_error',
      { cause: fileError }
    );
  }
}

/**
 * Checks if a contradiction report exists.
 *
 * @param projectId - The project identifier.
 * @param reportId - The report identifier.
 * @returns True if the report exists.
 */
export async function contradictionReportExists(
  projectId: string,
  reportId: string
): Promise<boolean> {
  const jsonPath = getReportPath(projectId, reportId, 'json');
  const yamlPath = getReportPath(projectId, reportId, 'yaml');

  try {
    await stat(jsonPath);
    return true;
  } catch {
    try {
      await stat(yamlPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Result type for report loading that handles both success and not-found cases.
 */
export type LoadReportResult =
  | { success: true; report: ContradictionReport }
  | { success: false; error: ReportStorageError };

/**
 * Attempts to load a contradiction report, returning a result type instead of throwing.
 *
 * @param projectId - The project identifier.
 * @param reportId - The report identifier.
 * @returns A result object indicating success or failure.
 */
export async function tryLoadContradictionReport(
  projectId: string,
  reportId: string
): Promise<LoadReportResult> {
  try {
    const report = await loadContradictionReport(projectId, reportId);
    return { success: true, report };
  } catch (error) {
    if (error instanceof ReportStorageError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new ReportStorageError(
        `Unexpected error loading report: ${error instanceof Error ? error.message : String(error)}`,
        'file_error',
        { cause: error instanceof Error ? error : undefined }
      ),
    };
  }
}
