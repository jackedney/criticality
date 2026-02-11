/**
 * Live display component for protocol execution.
 *
 * Provides real-time terminal updates using @opentui/core with:
 * - Animated spinner with phase/step hierarchy
 * - Elapsed time counter updating every second
 * - Recent log entries (last 3-5 lines) below spinner
 * - Efficient rendering without flicker
 * - Terminal resize handling
 *
 * @packageDocumentation
 */

import type { ProtocolState } from '../../protocol/types.js';
import {
  getPhase,
  getStep,
  isActiveState,
  isBlockedState,
  isFailedState,
} from '../../protocol/types.js';

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
  private protocolState: ProtocolState = {
    kind: 'Active',
    phase: {
      phase: 'Ignition',
      substate: { step: 'interviewing', interviewPhase: 'Discovery', questionIndex: 0 },
    },
  };
  private isRunning = false;
  private isTty: boolean;
  private lastOutput: string = '';
  private prevLineCount: number = 0;

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
        this.render();
      }, 100);

      this.timerInterval = setInterval(() => {
        this.render();
      }, 1000);

      this.render();
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
      this.clearPreviousLines();
      process.stdout.write('\x1b[?25h');
    }
  }

  /**
   * Update the displayed protocol state.
   *
   * @param state - The current protocol state.
   */
  updatePhase(state: ProtocolState): void {
    this.protocolState = state;
    const phase = getPhase(state) ?? 'Complete';
    this.addLog(`Phase: ${phase} > ${this.formatState(state)}`);
    this.render();
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

    this.render();
  }

  /**
   * Update the display output.
   */
  private render(): void {
    if (!this.isRunning || !this.isTty) {
      return;
    }

    const output = this.getDisplay();
    if (output !== this.lastOutput) {
      this.clearPreviousLines();
      this.lastOutput = output;
      this.prevLineCount = this.countLines(output);
      process.stdout.write(output);
    }
  }

  /**
   * Clear previously rendered lines.
   */
  private clearPreviousLines(): void {
    if (this.prevLineCount === 0) {
      return;
    }

    for (let i = 1; i < this.prevLineCount; i++) {
      process.stdout.write('\x1b[1A');
    }

    for (let i = 0; i < this.prevLineCount; i++) {
      process.stdout.write('\r\x1b[2K');
      if (i < this.prevLineCount - 1) {
        process.stdout.write('\n');
      }
    }
  }

  /**
   * Count the number of lines in a string.
   */
  private countLines(str: string): number {
    if (str === '') {
      return 0;
    }
    return str.split('\n').length;
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
    const phase = getPhase(this.protocolState) ?? 'Complete';
    const timeLine = this.getElapsedTimeLine();
    return `${phase} > ${this.formatState(this.protocolState)}\n${timeLine}`;
  }

  /**
   * Get the spinner line.
   *
   * @returns The formatted spinner line.
   */
  private getSpinnerLine(): string {
    const frames = this.options.unicode ? SPINNER_FRAMES : ASCII_SPINNER_FRAMES;
    const frame = frames[this.currentFrame % frames.length] ?? frames[0];
    const phase = getPhase(this.protocolState) ?? 'Complete';
    const stateText = this.formatState(this.protocolState);

    return `${frame} ${phase}${stateText !== 'active' ? ' > ' + stateText : ''}`;
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
   * Format the protocol state for display.
   *
   * @param state - The protocol state.
   * @returns Formatted state string.
   */
  private formatState(state: ProtocolState): string {
    if (isActiveState(state)) {
      const step = getStep(state);
      if (step !== undefined) {
        return step;
      }
      return 'active';
    }

    if (isBlockedState(state)) {
      const query = state.query;
      return `blocked: ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`;
    }

    if (isFailedState(state)) {
      const error = state.error;
      return `failed: ${error.substring(0, 30)}${error.length > 30 ? '...' : ''}`;
    }

    return 'complete';
  }
}
