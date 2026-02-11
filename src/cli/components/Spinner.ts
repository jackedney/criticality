/**
 * Spinner component for protocol execution progress.
 *
 * Displays animated spinner with phase/state updates during resume execution.
 * Falls back to simple text in non-TTY environments.
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
  protocolState: ProtocolState;
  currentFrame: number;
  lastUpdate: number;
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
}

/**
 * Spinner component class.
 *
 * Provides animated progress display for protocol execution with
 * phase/state updates. Handles both TTY and non-TTY environments.
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
    this.isTty = process.stdout.isTTY ?? false; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    this.currentText = '';
    this.state = {
      protocolState: {
        kind: 'Active',
        phase: {
          phase: 'Ignition',
          substate: { step: 'interviewing', interviewPhase: 'Discovery', questionIndex: 0 },
        },
      },
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
    const frame = frames[frameIndex] ?? '⠋';
    return frame;
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

  /**
   * Format the spinner text with phase and state.
   *
   * @returns The formatted text string.
   */
  private formatText(): string {
    const frame = this.getCurrentFrame();
    const phase = getPhase(this.state.protocolState) ?? 'Complete';
    const stateText = this.formatState(this.state.protocolState);

    const text = `${frame} ${phase}${stateText !== 'active' ? ' > ' + stateText : ''}`;

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
   * Update the displayed protocol state.
   *
   * @param state - The current protocol state.
   */
  update(state: ProtocolState): void {
    const stateChanged = JSON.stringify(this.state.protocolState) !== JSON.stringify(state);

    this.state.protocolState = state;

    if (stateChanged) {
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
