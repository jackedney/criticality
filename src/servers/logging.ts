/**
 * Structured logging for Criticality MCP servers.
 *
 * Provides JSON-formatted logging output for MCP servers per decision telemetry_001.
 * Respects the debug flag from server configuration.
 *
 * @packageDocumentation
 */

/**
 * Log levels supported by the server logger.
 */
export type ServerLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry for server operations.
 */
export interface ServerLogEntry {
  /** ISO 8601 timestamp of the log entry. */
  readonly timestamp: string;
  /** Log level. */
  readonly level: ServerLogLevel;
  /** Server name that generated the log. */
  readonly server: string;
  /** Event type or identifier. */
  readonly event: string;
  /** Additional structured data. */
  readonly data?: Record<string, unknown>;
}

/**
 * Options for creating a server logger.
 */
export interface ServerLoggerOptions {
  /** Name of the server (e.g., 'artifact-server', 'toolchain-server'). */
  serverName: string;
  /** Enable debug logging. When false, debug messages are suppressed. */
  debug?: boolean;
  /** Function to get current timestamp (injectable for testing). */
  now?: () => Date;
}

/**
 * Structured logger for MCP server operations.
 *
 * Outputs log entries as JSON to stderr (MCP convention for logging).
 * Debug messages are only emitted when debug mode is enabled.
 *
 * @example
 * ```typescript
 * const logger = createServerLogger({ serverName: 'artifact-server', debug: true });
 * logger.info('server_start', { projectRoot: '/path/to/project' });
 * logger.debug('tool_call', { name: 'read_spec_section', args: { section: 'meta' } });
 * ```
 */
export class ServerLogger {
  private readonly serverName: string;
  private readonly debug: boolean;
  private readonly now: () => Date;

  constructor(options: ServerLoggerOptions) {
    this.serverName = options.serverName;
    this.debug = options.debug ?? false;
    this.now = options.now ?? ((): Date => new Date());
  }

  /**
   * Logs a debug message. Only emitted when debug mode is enabled.
   *
   * @param event - Event type or identifier.
   * @param data - Additional structured data.
   */
  logDebug(event: string, data?: Record<string, unknown>): void {
    if (!this.debug) {
      return;
    }
    this.log('debug', event, data);
  }

  /**
   * Logs an info message.
   *
   * @param event - Event type or identifier.
   * @param data - Additional structured data.
   */
  info(event: string, data?: Record<string, unknown>): void {
    this.log('info', event, data);
  }

  /**
   * Logs a warning message.
   *
   * @param event - Event type or identifier.
   * @param data - Additional structured data.
   */
  warn(event: string, data?: Record<string, unknown>): void {
    this.log('warn', event, data);
  }

  /**
   * Logs an error message.
   *
   * @param event - Event type or identifier.
   * @param data - Additional structured data.
   */
  error(event: string, data?: Record<string, unknown>): void {
    this.log('error', event, data);
  }

  /**
   * Internal logging method that formats and outputs the log entry.
   */
  private log(level: ServerLogLevel, event: string, data?: Record<string, unknown>): void {
    const entry: ServerLogEntry = {
      timestamp: this.now().toISOString(),
      level,
      server: this.serverName,
      event,
    };

    if (data !== undefined) {
      (entry as { data: Record<string, unknown> }).data = data;
    }

    // MCP convention: logs go to stderr to avoid interfering with JSON-RPC on stdout
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

/**
 * Creates a structured logger for MCP server operations.
 *
 * @param options - Logger configuration options.
 * @returns A configured ServerLogger instance.
 *
 * @example
 * ```typescript
 * const logger = createServerLogger({
 *   serverName: 'artifact-server',
 *   debug: true
 * });
 *
 * // These will output structured JSON to stderr:
 * logger.info('server_start', { projectRoot: '/path' });
 * logger.logDebug('tool_call', { name: 'read_spec' });
 * logger.error('startup_failed', { error: 'Permission denied' });
 * ```
 */
export function createServerLogger(options: ServerLoggerOptions): ServerLogger {
  return new ServerLogger(options);
}
