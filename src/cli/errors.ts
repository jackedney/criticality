/**
 * Error suggestion system for the Criticality Protocol CLI.
 *
 * Provides contextual suggestions based on error types to help users
 * resolve issues quickly.
 *
 * @packageDocumentation
 */

import type { DisplayOptions } from './utils/displayUtils.js';

/**
 * Error types that can occur during protocol execution.
 */
export type ErrorType =
  | 'model_failure'
  | 'compilation_error'
  | 'test_failure'
  | 'state_corruption'
  | 'unknown';

/**
 * Suggestion item for resolving an error.
 */
export interface Suggestion {
  /** Suggestion text. */
  text: string;
  /** Command or action to take (optional). */
  action?: string;
}

/**
 * Error context with details needed for generating suggestions.
 */
export interface ErrorContext {
  /** Type of error that occurred. */
  errorType: ErrorType;
  /** Error message or description. */
  errorMessage?: string;
  /** Current protocol phase (optional). */
  phase?: string;
  /** Additional error details (optional). */
  details?: {
    /** File path for compilation/test errors. */
    filePath?: string;
    /** Line number for compilation/test errors. */
    lineNumber?: string;
    /** Failed test name(s). */
    testName?: string;
    /** Retry time in milliseconds (for rate limits). */
    retryAfterMs?: number;
    /** Whether the error is recoverable. */
    recoverable?: boolean;
  };
}

/**
 * Error suggestion mappings.
 */
const ERROR_SUGGESTIONS: Readonly<Record<ErrorType, readonly Suggestion[]>> = {
  model_failure: [
    {
      text: 'Check your API key is configured correctly',
      action: 'crit config --check-api-key',
    },
    {
      text: 'Verify you have not exceeded API rate limits',
      action: 'Check API dashboard for rate limits',
    },
    {
      text: 'Ensure the model service is available',
      action: 'Try: ping -c 3 api.anthropic.com',
    },
    {
      text: 'Check network connectivity',
      action: 'Try: curl -I https://api.anthropic.com',
    },
  ],

  compilation_error: [
    {
      text: 'Review the file and line number in the error message',
    },
    {
      text: 'Fix syntax or type errors in the indicated file',
    },
    {
      text: 'If changes are recent, consider rolling back',
      action: 'git diff --stat to see changes',
    },
    {
      text: 'Run TypeScript compiler directly for details',
      action: 'npx tsc --noEmit',
    },
  ],

  test_failure: [
    {
      text: 'Identify which test(s) failed from the output',
    },
    {
      text: 'Run the specific failing test with verbose output',
      action: 'npm test -- --run <test-file>',
    },
    {
      text: 'Check for broken test expectations',
      action: 'Review test assertions',
    },
    {
      text: 'Run tests with coverage to understand gaps',
      action: 'npm run test:coverage',
    },
  ],

  state_corruption: [
    {
      text: 'Check if a backup archive exists',
      action: 'ls .criticality/archives/',
    },
    {
      text: 'Restore from a recent backup if available',
      action: 'crit restore <backup-file>',
    },
    {
      text: 'Reset protocol state to initial checkpoint',
      action: 'crit init --force',
    },
    {
      text: 'Manual fix: edit state file (advanced)',
      action: 'vim .criticality/state.json',
    },
  ],

  unknown: [
    {
      text: 'Check the error logs for detailed information',
      action: 'cat .ralph/errors.log',
    },
    {
      text: 'Review recent protocol activity',
      action: 'crit status --watch',
    },
    {
      text: 'Run verbose mode for more debugging output',
      action: 'crit resume --verbose',
    },
    {
      text: 'Report the issue if it persists',
      action: 'https://github.com/anomalyco/criticality/issues',
    },
  ],
};

/**
 * Extracts error type from error message or context.
 *
 * @param errorMessage - The error message to analyze.
 * @returns The identified error type.
 */
export function inferErrorType(errorMessage: string): ErrorType {
  const lowerMessage = errorMessage.toLowerCase();

  if (
    lowerMessage.includes('model') ||
    lowerMessage.includes('api') ||
    lowerMessage.includes('anthropic') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('network')
  ) {
    return 'model_failure';
  }

  if (
    lowerMessage.includes('compilation') ||
    lowerMessage.includes('compile') ||
    lowerMessage.includes('typescript') ||
    lowerMessage.includes('tsc') ||
    lowerMessage.includes('build') ||
    lowerMessage.includes('syntax') ||
    lowerMessage.includes('type error')
  ) {
    return 'compilation_error';
  }

  if (
    lowerMessage.includes('test') ||
    lowerMessage.includes('spec') ||
    lowerMessage.includes('assert') ||
    lowerMessage.includes('vitest')
  ) {
    return 'test_failure';
  }

  if (
    lowerMessage.includes('state') ||
    lowerMessage.includes('corruption') ||
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('parse error') ||
    lowerMessage.includes('json')
  ) {
    return 'state_corruption';
  }

  return 'unknown';
}

/**
 * Gets suggestions for a given error type.
 *
 * @param errorType - The type of error.
 * @returns Array of suggestions.
 */
function getSuggestions(errorType: ErrorType): readonly Suggestion[] {
  return ERROR_SUGGESTIONS[errorType];
}

/**
 * Formats a suggestion for display.
 *
 * @param suggestion - The suggestion to format.
 * @param index - The suggestion index (1-based).
 * @param options - Display options.
 * @returns Formatted suggestion string.
 */
function formatSuggestion(suggestion: Suggestion, index: number, options: DisplayOptions): string {
  const yellowCode = options.colors ? '\x1b[33m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';

  const prefix = `${yellowCode}${String(index)}.${resetCode}`;
  const actionText = suggestion.action ? `\n    ${dimCode}${suggestion.action}${resetCode}` : '';

  return `  ${prefix} ${suggestion.text}${actionText}`;
}

/**
 * Formats error message with contextual suggestions.
 *
 * @param errorMessage - The error message.
 * @param context - Additional error context.
 * @param options - Display options.
 * @returns Formatted error with suggestions.
 */
export function formatErrorWithSuggestions(
  errorMessage: string,
  context: Partial<ErrorContext> = {},
  options: DisplayOptions = { colors: true, unicode: true }
): string {
  const errorType = context.errorType ?? inferErrorType(errorMessage);
  const suggestions = getSuggestions(errorType);

  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const redCode = options.colors ? '\x1b[31m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';

  let result = `${redCode}Error:${resetCode} ${errorMessage}`;

  if (context.details?.filePath !== undefined) {
    result += `\n  ${yellowCode}File:${resetCode} ${context.details.filePath}`;
    if (context.details.lineNumber !== undefined) {
      result += `:${context.details.lineNumber}`;
    }
  }

  if (context.details?.testName !== undefined) {
    result += `\n  ${yellowCode}Test:${resetCode} ${context.details.testName}`;
  }

  if (context.details?.retryAfterMs !== undefined) {
    const waitSeconds = Math.ceil(context.details.retryAfterMs / 1000);
    result += `\n  ${yellowCode}Wait:${resetCode} ${String(waitSeconds)}s before retrying`;
  }

  if (context.phase !== undefined) {
    result += `\n  ${yellowCode}Phase:${resetCode} ${context.phase}`;
  }

  result += `\n\n${boldCode}Suggestions:${resetCode}`;
  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    if (suggestion !== undefined) {
      result += '\n' + formatSuggestion(suggestion, i + 1, options);
    }
  }

  return result;
}

/**
 * Displays error message with suggestions to console.
 *
 * @param errorMessage - The error message.
 * @param context - Additional error context.
 * @param options - Display options.
 */
export function displayErrorWithSuggestions(
  errorMessage: string,
  context: Partial<ErrorContext> = {},
  options: DisplayOptions = { colors: true, unicode: true }
): void {
  console.error();
  console.error(formatErrorWithSuggestions(errorMessage, context, options));
  console.error();
}

/**
 * Gets recoverable status for error type.
 *
 * @param errorType - The type of error.
 * @returns Whether the error is typically recoverable.
 */
export function isErrorRecoverable(errorType: ErrorType): boolean {
  switch (errorType) {
    case 'model_failure':
      return true;
    case 'compilation_error':
      return true;
    case 'test_failure':
      return true;
    case 'state_corruption':
      return false;
    case 'unknown':
      return false;
    default: {
      // Exhaustive check - if new ErrorType is added, this will error
      const exhaustiveCheck: never = errorType;
      return exhaustiveCheck;
    }
  }
}
