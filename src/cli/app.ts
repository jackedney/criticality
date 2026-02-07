/**
 * OpenTUI application wrapper for the Criticality Protocol CLI.
 */

import type { CliConfig, CliContext } from './types.js';

/**
 * Creates and initializes the CLI application context.
 *
 * @param config - CLI configuration options.
 * @returns A promise resolving to the CLI context.
 */
export function createCliApp(config: CliConfig = {}): CliContext {
  const context: CliContext = {
    renderer: {},
    args: process.argv.slice(2),
    config: {
      colors: config.colors ?? true,
      unicode: config.unicode ?? true,
      watchInterval: config.watchInterval ?? 2000,
      ...config,
    },
  };

  return context;
}

/**
 * Starts the CLI application and runs until completion.
 *
 * @param context - The CLI context.
 * @param _rootRenderable - The root renderable to display (reserved for future use).
 * @returns A promise resolving when the application exits.
 */
export function runCliApp(context: CliContext, _rootRenderable?: unknown): void {
  const { renderer } = context;

  if (Object.keys(renderer).length > 0) {
    throw new Error('Renderer not initialized. TUI mode not yet implemented.');
  }
}

/**
 * Stops the CLI application gracefully.
 *
 * @param context - The CLI context.
 * @returns A promise resolving when the application has stopped.
 */
export function stopCliApp(context: CliContext): void {
  const { renderer } = context;

  if (Object.keys(renderer).length > 0) {
    throw new Error('Renderer not initialized. TUI mode not yet implemented.');
  }
}
