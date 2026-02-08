/**
 * Live display component for protocol execution.
 *
 * Provides real-time terminal updates using @opentui/core with:
 * - Animated spinner with phase/task/operation hierarchy
 * - Elapsed time counter updating every second
 * - Recent log entries (last 3-5 lines) below spinner
 * - Efficient rendering without flicker
 * - Terminal resize handling
 *
 * @packageDocumentation
 */

import type { ProtocolPhase, ProtocolSubstate } from '../../protocol/types.js';
import { isActiveSubstate } from '../../protocol/types.js';

/**
 * Live display configuration options.
 */
export interface LiveDisplayOptions {
  /** Whether to use colors in output. */
  colors: boolean;
  /** Whether to use Unicode characters. */
  unicode: boolean;
  /** Maximum number of log entries to display. Default: 5. */
  maxLogEntries?: number;
}

/**
 * Log entry for tracking operations.
 */
interface LogEntry {
  /** Timestamp of the log entry. */
  timestamp: Date;
  /** Log message. */
  message: string;
}

/**
 * Spinner frame characters for animation.
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * Fallback spinner for non-Unicode terminals.
 */
const ASCII_SPINNER_FRAMES = ['-', '\\', '|', '/'] as const;

/**
 * Live display class for protocol execution.
 *
 * Uses efficient terminal rendering with live updates,
 * elapsed time, and log scrolling.
 */
export class LiveDisplay {
  private startTime: number = 0;
  private timerInterval: NodeJS.Timeout | null = null;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private logBuffer: LogEntry[] = [];
  private readonly maxLogEntries: number;
  private readonly options: LiveDisplayOptions;
  private phase: ProtocolPhase = 'Ignition';
  private substate: ProtocolSubstate = { kind: 'Active' };
  private isRunning = false;
  private isTty: boolean;
  private lastOutput: string = '';

  /**
   * Create a new LiveDisplay instance.
   *
   * @param options - Display configuration options.
   */
  constructor(options: LiveDisplayOptions) {
    this.options = options;
    this.maxLogEntries = options.maxLogEntries ?? 5;
    this.isTty = process.stdout.isTTY;
  }

  /**
   * Initialize the live display.
   */
  start(): void {
    this.startTime = Date.now();
    this.isRunning = true;

    if (this.isTty) {
      this.spinnerInterval = setInterval(() => {
        this.currentFrame =
          (this.currentFrame + 1) %
          (this.options.unicode ? SPINNER_FRAMES.length : ASCII_SPINNER_FRAMES.length);
        this.update();
      }, 100);

      this.timerInterval = setInterval(() => {
        this.update();
      }, 1000);

      this.update();
    } else {
      process.stdout.write(this.getStaticDisplay() + '\n');
    }
  }

  /**
   * Stop the live display.
   */
  stop(): void {
    this.isRunning = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }

    if (this.isTty) {
      process.stdout.write('\r\x1b[2K');
      process.stdout.write('\x1b[?25h');
    }
  }

  /**
   * Update the phase and substate.
   *
   * @param phase - The protocol phase.
   * @param substate - The protocol substate.
   */
  updatePhase(phase: ProtocolPhase, substate: ProtocolSubstate): void {
    this.phase = phase;
    this.substate = substate;
    this.addLog(`Phase: ${phase} > ${this.formatSubstate(substate)}`);
    this.update();
  }

  /**
   * Add a log entry.
   *
   * @param message - The log message.
   */
  addLog(message: string): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      message,
    };

    this.logBuffer.push(entry);

    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer.shift();
    }

    this.update();
  }

  /**
   * Update the display output.
   */
  private update(): void {
    if (!this.isRunning || !this.isTty) {
      return;
    }

    const output = this.getDisplay();
    if (output !== this.lastOutput) {
      this.lastOutput = output;
      process.stdout.write('\r\x1b[2K' + output);
    }
  }

  /**
   * Get the current display text.
   *
   * @returns The formatted display text.
   */
  private getDisplay(): string {
    const spinnerLine = this.getSpinnerLine();
    const timeLine = this.getElapsedTimeLine();
    const logs = this.getLogLines();

    return spinnerLine + '\n' + timeLine + '\n' + logs.join('\n');
  }

  /**
   * Get static display for non-TTY environments.
   *
   * @returns The formatted static display text.
   */
  private getStaticDisplay(): string {
    const timeLine = this.getElapsedTimeLine();
    return `${this.phase} > ${this.formatSubstate(this.substate)}\n${timeLine}`;
  }

  /**
   * Get the spinner line.
   *
   * @returns The formatted spinner line.
   */
  private getSpinnerLine(): string {
    const frames = this.options.unicode ? SPINNER_FRAMES : ASCII_SPINNER_FRAMES;
    const frame = String(frames[this.currentFrame % frames.length]);
    const substateText = this.formatSubstate(this.substate);

    return `${frame} ${this.phase}${substateText !== 'active' ? ' > ' + substateText : ''}`;
  }

  /**
   * Get the elapsed time line.
   *
   * @returns The formatted elapsed time.
   */
  private getElapsedTimeLine(): string {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${String(minutes)}m ${String(remainingSeconds)}s elapsed`;
    }

    return `${String(seconds)}s elapsed`;
  }

  /**
   * Get the log lines.
   *
   * @returns The formatted log lines.
   */
  private getLogLines(): string[] {
    const lines: string[] = [];
    const dimCode = this.options.colors ? '\x1b[2m' : '';
    const resetCode = this.options.colors ? '\x1b[0m' : '';

    for (let i = 0; i < this.maxLogEntries; i++) {
      const entry = this.logBuffer[i];
      if (entry) {
        const timeStr = entry.timestamp.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        lines.push(`${dimCode}[${timeStr}]${resetCode} ${entry.message}`);
      }
    }

    return lines;
  }

  /**
   * Format the substate for display.
   *
   * @param substate - The protocol substate.
   * @returns Formatted substate string.
   */
  private formatSubstate(substate: ProtocolSubstate): string {
    const kind = substate.kind;
    if (kind === 'Active') {
      if (isActiveSubstate(substate)) {
        const parts: string[] = [];
        if (substate.task !== undefined) {
          parts.push(substate.task);
        }
        if (substate.operation !== undefined) {
          parts.push(substate.operation);
        }
        if (parts.length === 0) {
          return 'active';
        }
        return parts.join(' > ');
      }
      return 'active';
    }
    if (kind === 'Blocking') {
      const query = substate.query;
      return `blocked: ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`;
    }
    const error = substate.error;
    return `failed: ${error.substring(0, 30)}${error.length > 30 ? '...' : ''}`;
  }
}
