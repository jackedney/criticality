/**
 * OpenTUI application wrapper for Criticality Protocol CLI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { ConfigParseError, parseConfig } from '../config/index.js';
import type { CliConfig, CliContext } from './types.js';

/**
 * Creates and initializes CLI application context.
 *
 * @param config - CLI configuration options (overrides config file values).
 * @returns A promise resolving to CLI context.
 */
export function createCliApp(config: Partial<CliConfig> = {}): CliContext {
  const context: CliContext = {
    renderer: {},
    args: process.argv.slice(2),
    config: {
      colors: config.colors ?? true,
      unicode: config.unicode ?? true,
      watchInterval: config.watchInterval ?? 2000,
    },
  };

  const configFilePath = 'criticality.toml';

  if (existsSync(configFilePath)) {
    try {
      const tomlContent = readFileSync(configFilePath, 'utf-8');
      const parsedConfig = parseConfig(tomlContent);

      context.config.colors = config.colors ?? parsedConfig.cli.colors;
      context.config.unicode = config.unicode ?? parsedConfig.cli.unicode;
      context.config.watchInterval = config.watchInterval ?? parsedConfig.cli.watch_interval;
    } catch (error) {
      const errorMessage = error instanceof ConfigParseError ? error.message : String(error);
      console.warn(`Warning: Failed to load config from ${configFilePath}: ${errorMessage}`);
      console.warn('Using default CLI settings.');
    }
  }

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

  if (Object.keys(renderer).length === 0) {
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

  if (Object.keys(renderer).length === 0) {
    throw new Error('Renderer not initialized. TUI mode not yet implemented.');
  }
}
