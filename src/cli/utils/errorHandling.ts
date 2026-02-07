/**
 * Shared error handling utilities for CLI commands.
 *
 * Provides a wrapper function that standardizes error handling
 * across command handlers, reducing code duplication.
 */

import type { CliCommandResult } from '../types.js';

/**
 * Wraps a command handler with standard error handling.
 *
 * Executes the provided function (sync or async) and handles any errors:
 * - On success: exits with the result's exit code
 * - On error (Error instance): logs the error message and exits with 1
 * - On other errors: exits with 1 without logging
 *
 * @param fn - The function to wrap (sync or async).
 */
export function withErrorHandling(fn: () => CliCommandResult | Promise<CliCommandResult>): void {
  void (async () => {
    try {
      const result = await fn();
      process.exit(result.exitCode);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error(`Error: ${String(error)}`);
      }
      process.exit(1);
    }
  })();
}
