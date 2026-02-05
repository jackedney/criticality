/**
 * Structured logging utility for cluster executor.
 *
 * Provides consistent logging across the cluster executor with JSON-formatted output.
 *
 * @packageDocumentation
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly component: string;
  readonly event: string;
  readonly data?: Record<string, unknown>;
}

export interface LoggerOptions {
  readonly component: string;
  readonly debugMode?: boolean;
}

export class Logger {
  private readonly component: string;
  private readonly debugMode: boolean;

  constructor(options: LoggerOptions) {
    this.component = options.component;
    this.debugMode = options.debugMode ?? false;
  }

  debug(event: string, data?: Record<string, unknown>): void {
    if (!this.debugMode) {
      return;
    }
    this.log('debug', event, data);
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.log('warn', event, data);
  }

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

export const logger = new Logger({ component: 'ClusterExecutor', debugMode: false });
