/**
 * Structured logging utility for cluster executor.
 *
 * Provides consistent logging across the cluster executor with JSON-formatted output.
 *
 * @packageDocumentation
 */

/**
 * Severity level for log entries.
 *
 * Log levels indicate the importance and type of logged events:
 * - `debug`: Detailed diagnostic information for debugging
 * - `info`: General informational messages about normal operation
 * - `warn`: Warning conditions that don't prevent operation but may need attention
 * - `error`: Error conditions indicating failures or problems
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Represents a structured log entry with timestamp and metadata.
 *
 * Log entries are serialized to JSON and written to stderr. Each entry
 * contains standardized fields for consistent log parsing and aggregation.
 */
export interface LogEntry {
  /**
   * ISO 8601 timestamp when the log entry was created.
   * @example "2024-01-15T10:30:00.000Z"
   */
  readonly timestamp: string;

  /**
   * Severity level of the log entry.
   */
  readonly level: LogLevel;

  /**
   * Name of the component that generated this log entry.
   * Used to identify the source of log messages.
   * @example "ClusterExecutor"
   */
  readonly component: string;

  /**
   * Brief description of the logged event.
   * Should be a short, descriptive string.
   * @example "cluster_started"
   */
  readonly event: string;

  /**
   * Additional structured data associated with the log entry.
   * Can contain any JSON-serializable key-value pairs for context.
   * @example { clusterId: "cluster-1", claimCount: 5 }
   */
  readonly data?: Record<string, unknown>;
}

/**
 * Configuration options for creating a Logger instance.
 */
export interface LoggerOptions {
  /**
   * Name of the component using this logger.
   * Appears in all log entries to identify the source.
   */
  readonly component: string;

  /**
   * Whether debug-level logging is enabled.
   * When `false` (default), debug() calls are no-ops.
   * @defaultValue false
   */
  readonly debugMode?: boolean;
}

/**
 * Structured logger that outputs JSON-formatted log entries to stderr.
 *
 * Provides leveled logging (debug, info, warn, error) with consistent
 * formatting for log aggregation and analysis.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ component: 'MyService', debugMode: true });
 * logger.info('service_started', { port: 3000 });
 * logger.error('connection_failed', { host: 'db.example.com' });
 * ```
 */
export class Logger {
  private readonly component: string;
  private readonly debugMode: boolean;

  /**
   * Creates a new Logger instance.
   * @param options - Configuration options for the logger.
   */
  constructor(options: LoggerOptions) {
    this.component = options.component;
    this.debugMode = options.debugMode ?? false;
  }

  /**
   * Logs a debug-level message.
   *
   * Debug messages are only output when debugMode is enabled.
   * Use for detailed diagnostic information during development.
   *
   * @param event - Brief description of the event.
   * @param data - Optional structured data for additional context.
   */
  debug(event: string, data?: Record<string, unknown>): void {
    if (!this.debugMode) {
      return;
    }
    this.log('debug', event, data);
  }

  /**
   * Logs an info-level message.
   *
   * Use for general informational messages about normal operation.
   *
   * @param event - Brief description of the event.
   * @param data - Optional structured data for additional context.
   */
  info(event: string, data?: Record<string, unknown>): void {
    this.log('info', event, data);
  }

  /**
   * Logs a warning-level message.
   *
   * Use for warning conditions that don't prevent operation but may need attention.
   *
   * @param event - Brief description of the event.
   * @param data - Optional structured data for additional context.
   */
  warn(event: string, data?: Record<string, unknown>): void {
    this.log('warn', event, data);
  }

  /**
   * Logs an error-level message.
   *
   * Use for error conditions indicating failures or problems.
   *
   * @param event - Brief description of the event.
   * @param data - Optional structured data for additional context.
   */
  error(event: string, data?: Record<string, unknown>): void {
    this.log('error', event, data);
  }

  private log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      event,
    };

    if (data !== undefined) {
      (entry as { data: Record<string, unknown> }).data = data;
    }

    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

/**
 * Default logger instance for the ClusterExecutor component.
 *
 * Pre-configured with debugMode disabled. For custom logging needs,
 * create a new Logger instance with appropriate options.
 */
export const logger = new Logger({ component: 'ClusterExecutor', debugMode: false });
