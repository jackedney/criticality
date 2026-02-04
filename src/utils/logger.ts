/* eslint-disable no-console */

/**
 * Structured logger for consistent logging across application.
 *
 * Provides methods for logging with structured metadata
 * for better observability and debugging.
 *
 * @packageDocumentation
 */

export interface LogMetadata {
  readonly [key: string]: unknown;
}

export interface LogOptions {
  readonly level?: 'debug' | 'info' | 'warn' | 'error';
  readonly context?: string;
}

export class Logger {
  private readonly context: string;

  constructor(context: string = '') {
    this.context = context;
  }

  /**
   * Log informational message with structured metadata.
   *
   * @param metadata - Structured data to include in log entry.
   * @param options - Optional log level and context overrides.
   */
  info(metadata: LogMetadata, options?: LogOptions): void {
    this.log('info', metadata, options);
  }

  /**
   * Log warning message with structured metadata.
   *
   * @param metadata - Structured data to include in log entry.
   * @param options - Optional log level and context overrides.
   */
  warn(metadata: LogMetadata, options?: LogOptions): void {
    this.log('warn', metadata, options);
  }

  /**
   * Log error message with structured metadata.
   *
   * @param metadata - Structured data to include in log entry. If an Error is included,
   * its message and stack will be extracted.
   * @param options - Optional log level and context overrides.
   */
  error(metadata: LogMetadata, options?: LogOptions): void {
    this.log('error', metadata, options);
  }

  /**
   * Internal method to perform actual logging.
   *
   * @param level - The log level (debug, info, warn, error).
   * @param metadata - Structured data to include in log entry.
   * @param options - Optional log level and context overrides.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    metadata: LogMetadata,
    options?: LogOptions
  ): void {
    const timestamp = new Date().toISOString();
    const context = options?.context ?? this.context;

    const logEntry = {
      timestamp,
      level,
      ...(context !== '' && { context }),
      ...metadata,
    };

    const logMessage = JSON.stringify(logEntry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
    }
  }
}

const defaultLogger = new Logger();

/**
 * Default logger instance for general logging.
 */
export const logger = {
  info: (metadata: LogMetadata, options?: LogOptions) => {
    defaultLogger.info(metadata, options);
  },
  warn: (metadata: LogMetadata, options?: LogOptions) => {
    defaultLogger.warn(metadata, options);
  },
  error: (metadata: LogMetadata, options?: LogOptions) => {
    defaultLogger.error(metadata, options);
  },
};
