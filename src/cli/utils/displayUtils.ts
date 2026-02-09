/**
 * Shared display utilities for CLI commands.
 *
 * Provides common formatting functions for time, confidence levels,
 * and box-drawing borders used across multiple CLI commands.
 */

export interface DisplayOptions {
  colors: boolean;
  unicode: boolean;
}

export interface DisplayOptionsWithWatch extends DisplayOptions {
  watch?: boolean;
  interval?: number;
}

export interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  topDivider?: string;
  bottomDivider?: string;
  leftDivider?: string;
  rightDivider?: string;
  cross?: string;
}

const ANSI_ESCAPE_PATTERN = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${String(days)}d ago`;
  }
  if (hours > 0) {
    return `${String(hours)}h ago`;
  }
  if (minutes > 0) {
    return `${String(minutes)}m ago`;
  }
  return 'just now';
}

export function formatConfidence(confidence: string, options: DisplayOptions): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';

  if (confidence === 'canonical') {
    return `${boldCode}[canonical]${resetCode}`;
  }
  if (confidence === 'suspended' || confidence === 'blocking') {
    return `${dimCode}[${confidence}]${resetCode}`;
  }
  return `[${confidence}]`;
}

export function getBorderChars(options: DisplayOptions): BorderChars {
  if (options.unicode) {
    return {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│',
      topDivider: '┬',
      bottomDivider: '┴',
      leftDivider: '├',
      rightDivider: '┤',
      cross: '┼',
    };
  }
  return {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
    topDivider: '+',
    bottomDivider: '+',
    leftDivider: '+',
    rightDivider: '+',
    cross: '+',
  };
}

/**
 * Strips ANSI escape sequences from a string to get visible length.
 *
 * @param str - The string potentially containing ANSI codes.
 * @returns The string with ANSI codes removed.
 */
function stripAnsi(str: string): string {
  return str.replace(ANSI_ESCAPE_PATTERN, '');
}

export function wrapInBox(text: string, options: DisplayOptions): string {
  const border = getBorderChars(options);
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map((line) => stripAnsi(line).length));
  const horizontalBorder = border.horizontal.repeat(maxLength + 2);

  let result = border.topLeft + horizontalBorder + border.topRight + '\n';
  for (const line of lines) {
    const visibleLength = stripAnsi(line).length;
    const padding = ' '.repeat(maxLength - visibleLength);
    result += border.vertical + ' ' + line + padding + ' ' + border.vertical + '\n';
  }
  result += border.bottomLeft + horizontalBorder + border.bottomRight;

  return result;
}
