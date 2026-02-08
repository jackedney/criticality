/**
 * Spinner component for protocol execution progress.
 *
 * Displays animated spinner with phase/substate updates during resume execution.
 * Falls back to simple text in non-TTY environments.
 */

import type { ProtocolPhase, ProtocolSubstate } from '../../protocol/types.js';
import { isActiveSubstate } from '../../protocol/types.js';

/**
 * Spinner frame characters for animation.
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * Fallback spinner for non-Unicode terminals.
 */
const ASCII_SPINNER_FRAMES = ['-', '\\', '|', '/'] as const;

/**
 * Maximum width for text content before truncation.
 */
const MAX_TEXT_WIDTH = 60;

/**
 * Spinner configuration options.
 */
export interface SpinnerOptions {
  /** Whether to use colors in output. */
  colors: boolean;
  /** Whether to use Unicode characters. */
  unicode: boolean;
  /** Update interval in milliseconds. */
  interval: number;
}

/**
 * Spinner state interface.
 */
interface SpinnerState {
  phase: ProtocolPhase;
  substate: ProtocolSubstate;
  currentFrame: number;
  lastUpdate: number;
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
}

/**
 * Spinner component class.
 *
 * Provides animated progress display for protocol execution with
 * phase/substate updates. Handles both TTY and non-TTY environments.
 */
export class Spinner {
  private state: SpinnerState;
  private options: SpinnerOptions;
  private isTty: boolean;
  private currentText: string;

  /**
   * Create a new Spinner instance.
   *
   * @param options - Spinner configuration options.
   */
  constructor(options: SpinnerOptions = { colors: true, unicode: true, interval: 100 }) {
    this.options = options;
    this.isTty = process.stdout.isTTY;
    this.currentText = '';
    this.state = {
      phase: 'Ignition',
      substate: { kind: 'Active' },
      currentFrame: 0,
      lastUpdate: Date.now(),
      isRunning: false,
      intervalId: null,
    };
  }

  /**
   * Get the current spinner frame character.
   *
   * @returns The current frame character.
   */
  private getCurrentFrame(): string {
    const frames = this.options.unicode ? SPINNER_FRAMES : ASCII_SPINNER_FRAMES;
    const frameIndex = this.state.currentFrame % frames.length;
    const frame = frames[frameIndex];
    if (frame === undefined) {
      return frames[0];
    }
    return frame;
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (kind === 'Failed') {
      const error = substate.error;
      return `failed: ${error.substring(0, 30)}${error.length > 30 ? '...' : ''}`;
    }
    return kind;
  }

  /**
   * Format the spinner text with phase and substate.
   *
   * @returns The formatted text string.
   */
  private formatText(): string {
    const frame = this.getCurrentFrame();
    const phase = this.state.phase;
    const substateText = this.formatSubstate(this.state.substate);

    const text = `${frame} ${phase}${substateText !== 'active' ? ' > ' + substateText : ''}`;

    // Truncate text if too long for terminal
    if (text.length > MAX_TEXT_WIDTH) {
      return text.substring(0, MAX_TEXT_WIDTH - 3) + '...';
    }

    return text;
  }

  /**
   * Update the spinner display.
   */
  private updateDisplay(): void {
    if (!this.isTty) {
      return;
    }

    const newText = this.formatText();
    if (newText !== this.currentText) {
      this.currentText = newText;
      process.stdout.write(`\r\x1b[2K${this.currentText}`);
    }
  }

  /**
   * Increment the spinner frame.
   */
  private nextFrame(): void {
    this.state.currentFrame++;
    this.state.lastUpdate = Date.now();
    this.updateDisplay();
  }

  /**
   * Update the phase and substate.
   *
   * @param phase - The protocol phase.
   * @param substate - The protocol substate.
   */
  update(phase: ProtocolPhase, substate: ProtocolSubstate): void {
    const phaseChanged = this.state.phase !== phase;
    const substateChanged = this.state.substate.kind !== substate.kind;

    this.state.phase = phase;
    this.state.substate = substate;

    // Force update immediately on phase/substate change
    if (phaseChanged || substateChanged) {
      this.updateDisplay();
    }
  }

  /**
   * Start the spinner animation.
   */
  start(): void {
    if (this.state.isRunning) {
      return;
    }

    this.state.isRunning = true;

    if (this.isTty) {
      this.state.intervalId = setInterval(() => {
        this.nextFrame();
      }, this.options.interval);
    } else {
      // Non-TTY: just print initial state
      process.stdout.write(this.formatText() + '\n');
    }
  }

  /**
   * Stop the spinner animation.
   *
   * @param finalText - Optional final text to display.
   */
  stop(finalText?: string): void {
    if (!this.state.isRunning) {
      return;
    }

    this.state.isRunning = false;

    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }

    if (this.isTty) {
      // Clear the spinner line
      process.stdout.write('\r\x1b[2K');
      if (finalText !== undefined) {
        process.stdout.write(finalText + '\n');
      }
    }
  }

  /**
   * Get the current text being displayed.
   *
   * @returns The current text.
   */
  getCurrentText(): string {
    return this.currentText;
  }

  /**
   * Check if the spinner is running.
   *
   * @returns True if the spinner is running.
   */
  isActive(): boolean {
    return this.state.isRunning;
  }
}
