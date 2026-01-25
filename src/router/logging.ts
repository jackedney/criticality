/**
 * Model request/response logging for the Criticality Protocol.
 *
 * Provides configurable logging of all model interactions for debugging
 * and auditing purposes.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ModelAlias,
  ModelRouterRequest,
  ModelRouterResponse,
  ModelRouterError,
} from './types.js';

/**
 * Log levels for model interaction logging.
 * - 'none': No logging output
 * - 'summary': Log timestamp, model alias, prompt hash, token count, latency
 * - 'full': Log everything including full prompts and responses
 */
export type ModelLogLevel = 'none' | 'summary' | 'full';

/**
 * Array of valid log levels for validation.
 */
export const MODEL_LOG_LEVELS: readonly ModelLogLevel[] = ['none', 'summary', 'full'] as const;

/**
 * Checks if a value is a valid ModelLogLevel.
 *
 * @param value - The value to check.
 * @returns True if the value is a valid ModelLogLevel.
 */
export function isValidModelLogLevel(value: string): value is ModelLogLevel {
  return MODEL_LOG_LEVELS.includes(value as ModelLogLevel);
}

/**
 * Entry logged for a model request.
 */
export interface ModelRequestLogEntry {
  /** Type discriminator. */
  readonly type: 'request';
  /** ISO 8601 timestamp of the request. */
  readonly timestamp: string;
  /** Model alias used for routing. */
  readonly modelAlias: ModelAlias;
  /** SHA-256 hash of the prompt (first 16 hex chars). */
  readonly promptHash: string;
  /** Request ID if provided. */
  readonly requestId?: string;
  /** Full prompt text (only in 'full' log level). */
  readonly prompt?: string;
  /** System prompt if provided (only in 'full' log level). */
  readonly systemPrompt?: string;
  /** Max tokens parameter if provided (only in 'full' log level). */
  readonly maxTokens?: number;
}

/**
 * Entry logged for a model response.
 */
export interface ModelResponseLogEntry {
  /** Type discriminator. */
  readonly type: 'response';
  /** ISO 8601 timestamp of the response. */
  readonly timestamp: string;
  /** Model alias that handled the request. */
  readonly modelAlias: ModelAlias;
  /** Total token count. */
  readonly tokenCount: number;
  /** Prompt tokens used. */
  readonly promptTokens: number;
  /** Completion tokens used. */
  readonly completionTokens: number;
  /** Latency in milliseconds. */
  readonly latencyMs: number;
  /** The model ID that processed the request. */
  readonly modelId: string;
  /** The provider used. */
  readonly provider: string;
  /** Request ID for correlation. */
  readonly requestId?: string;
  /** Full response content (only in 'full' log level). */
  readonly content?: string;
}

/**
 * Entry logged for a model error.
 */
export interface ModelErrorLogEntry {
  /** Type discriminator. */
  readonly type: 'error';
  /** ISO 8601 timestamp of the error. */
  readonly timestamp: string;
  /** Model alias that was targeted. */
  readonly modelAlias: ModelAlias;
  /** Error kind. */
  readonly errorKind: string;
  /** Error message. */
  readonly errorMessage: string;
  /** Whether the error is retryable. */
  readonly retryable: boolean;
  /** Request ID for correlation. */
  readonly requestId?: string;
}

/**
 * Union of all log entry types.
 */
export type ModelLogEntry = ModelRequestLogEntry | ModelResponseLogEntry | ModelErrorLogEntry;

/**
 * Options for the model logger.
 */
export interface ModelLoggerOptions {
  /** Log level (default: 'summary'). */
  logLevel?: ModelLogLevel;
  /** Path to the log file. If not provided, logs to memory only. */
  logFilePath?: string;
  /** Function to get current timestamp (injectable for testing). */
  now?: () => Date;
  /** Whether to create log directory if it doesn't exist (default: true). */
  createDirectory?: boolean;
}

/**
 * Computes a truncated SHA-256 hash of the prompt.
 *
 * @param prompt - The prompt text to hash.
 * @returns First 16 hex characters of the SHA-256 hash.
 */
export function computePromptHash(prompt: string): string {
  const hash = createHash('sha256').update(prompt, 'utf8').digest('hex');
  return hash.substring(0, 16);
}

/**
 * Logger for model interactions.
 *
 * @example
 * ```typescript
 * const logger = new ModelLogger({ logLevel: 'summary', logFilePath: './model.log' });
 * logger.logRequest(request);
 * // ... perform request ...
 * logger.logResponse(response, request.modelAlias);
 * ```
 */
export class ModelLogger {
  private readonly logLevel: ModelLogLevel;
  private readonly logFilePath: string | undefined;
  private readonly now: () => Date;
  private readonly entries: ModelLogEntry[] = [];
  private readonly createDirectory: boolean;

  /**
   * Creates a new ModelLogger.
   *
   * @param options - Logger configuration options.
   */
  constructor(options: ModelLoggerOptions = {}) {
    this.logLevel = options.logLevel ?? 'summary';
    this.logFilePath = options.logFilePath;
    this.now = options.now ?? ((): Date => new Date());
    this.createDirectory = options.createDirectory ?? true;

    // Ensure log directory exists
    if (this.logFilePath !== undefined && this.createDirectory) {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Gets the current log level.
   *
   * @returns The configured log level.
   */
  getLogLevel(): ModelLogLevel {
    return this.logLevel;
  }

  /**
   * Gets the log file path.
   *
   * @returns The configured log file path, or undefined if not set.
   */
  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Gets all logged entries (useful for testing and memory-based logging).
   *
   * @returns Array of all log entries.
   */
  getEntries(): readonly ModelLogEntry[] {
    return this.entries;
  }

  /**
   * Clears all in-memory log entries.
   */
  clearEntries(): void {
    this.entries.length = 0;
  }

  /**
   * Logs a model request.
   *
   * @param request - The model router request to log.
   * @returns The created log entry, or undefined if log level is 'none'.
   */
  logRequest(request: ModelRouterRequest): ModelRequestLogEntry | undefined {
    if (this.logLevel === 'none') {
      return undefined;
    }

    const timestamp = this.now().toISOString();
    const promptHash = computePromptHash(request.prompt);

    // Build entry based on log level
    const baseEntry = {
      type: 'request' as const,
      timestamp,
      modelAlias: request.modelAlias,
      promptHash,
    };

    let entry: ModelRequestLogEntry;

    if (this.logLevel === 'full') {
      // Full log includes prompt and parameters
      const fullEntry: ModelRequestLogEntry = { ...baseEntry };

      // Build conditionally for exactOptionalPropertyTypes
      if (request.requestId !== undefined) {
        entry = { ...fullEntry, requestId: request.requestId };
      } else {
        entry = fullEntry;
      }

      // Add full details
      const withPrompt = { ...entry, prompt: request.prompt };

      if (request.parameters?.systemPrompt !== undefined) {
        entry = { ...withPrompt, systemPrompt: request.parameters.systemPrompt };
      } else {
        entry = withPrompt;
      }

      if (request.parameters?.maxTokens !== undefined) {
        entry = { ...entry, maxTokens: request.parameters.maxTokens };
      }
    } else {
      // Summary log - just the basics
      if (request.requestId !== undefined) {
        entry = { ...baseEntry, requestId: request.requestId };
      } else {
        entry = baseEntry;
      }
    }

    this.entries.push(entry);
    this.writeToFile(entry);

    return entry;
  }

  /**
   * Logs a model response.
   *
   * @param response - The model router response to log.
   * @param modelAlias - The model alias that handled the request.
   * @param requestId - Optional request ID for correlation.
   * @returns The created log entry, or undefined if log level is 'none'.
   */
  logResponse(
    response: ModelRouterResponse,
    modelAlias: ModelAlias,
    requestId?: string
  ): ModelResponseLogEntry | undefined {
    if (this.logLevel === 'none') {
      return undefined;
    }

    const timestamp = this.now().toISOString();

    const baseEntry = {
      type: 'response' as const,
      timestamp,
      modelAlias,
      tokenCount: response.usage.totalTokens,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      latencyMs: response.metadata.latencyMs,
      modelId: response.metadata.modelId,
      provider: response.metadata.provider,
    };

    let entry: ModelResponseLogEntry;

    if (this.logLevel === 'full') {
      // Full log includes response content
      if (requestId !== undefined) {
        entry = { ...baseEntry, requestId, content: response.content };
      } else {
        entry = { ...baseEntry, content: response.content };
      }
    } else {
      // Summary log
      if (requestId !== undefined) {
        entry = { ...baseEntry, requestId };
      } else {
        entry = baseEntry;
      }
    }

    this.entries.push(entry);
    this.writeToFile(entry);

    return entry;
  }

  /**
   * Logs a model error.
   *
   * @param error - The model router error to log.
   * @param modelAlias - The model alias that was targeted.
   * @param requestId - Optional request ID for correlation.
   * @returns The created log entry, or undefined if log level is 'none'.
   */
  logError(
    error: ModelRouterError,
    modelAlias: ModelAlias,
    requestId?: string
  ): ModelErrorLogEntry | undefined {
    if (this.logLevel === 'none') {
      return undefined;
    }

    const timestamp = this.now().toISOString();

    const baseEntry = {
      type: 'error' as const,
      timestamp,
      modelAlias,
      errorKind: error.kind,
      errorMessage: error.message,
      retryable: error.retryable,
    };

    let entry: ModelErrorLogEntry;

    if (requestId !== undefined) {
      entry = { ...baseEntry, requestId };
    } else {
      entry = baseEntry;
    }

    this.entries.push(entry);
    this.writeToFile(entry);

    return entry;
  }

  /**
   * Formats a log entry as a string for file output.
   *
   * @param entry - The log entry to format.
   * @returns Formatted log line.
   */
  private formatEntry(entry: ModelLogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Writes a log entry to the log file.
   *
   * @param entry - The log entry to write.
   */
  private writeToFile(entry: ModelLogEntry): void {
    if (this.logFilePath === undefined) {
      return;
    }

    try {
      const line = this.formatEntry(entry) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch {
      // Silently ignore write errors to avoid breaking the model request flow
      // In production, you might want to emit an event or use a fallback
    }
  }
}

/**
 * Creates a model logger with the specified options.
 *
 * @param options - Logger configuration options.
 * @returns A configured ModelLogger instance.
 *
 * @example
 * ```typescript
 * const logger = createModelLogger({
 *   logLevel: 'summary',
 *   logFilePath: './logs/model-interactions.log'
 * });
 * ```
 */
export function createModelLogger(options: ModelLoggerOptions = {}): ModelLogger {
  return new ModelLogger(options);
}

/**
 * Reads log entries from a log file.
 *
 * @param filePath - Path to the log file.
 * @returns Array of parsed log entries.
 * @throws Error if file cannot be read or contains invalid JSON.
 */
export function readLogFile(filePath: string): ModelLogEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const entries: ModelLogEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const entry = JSON.parse(line) as ModelLogEntry;
      entries.push(entry);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return entries;
}

/**
 * Gets the count of logged entries by type from a log file.
 *
 * @param filePath - Path to the log file.
 * @returns Object with counts for each entry type.
 */
export function getLogStats(filePath: string): {
  requests: number;
  responses: number;
  errors: number;
  total: number;
} {
  const entries = readLogFile(filePath);

  let requests = 0;
  let responses = 0;
  let errors = 0;

  for (const entry of entries) {
    switch (entry.type) {
      case 'request':
        requests++;
        break;
      case 'response':
        responses++;
        break;
      case 'error':
        errors++;
        break;
    }
  }

  return {
    requests,
    responses,
    errors,
    total: entries.length,
  };
}
