/**
 * Version command handler for the Criticality Protocol CLI.
 *
 * Displays the CLI version by reading it directly from package.json.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { CliCommandResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads the version from package.json.
 *
 * @returns The version string, or '(unknown)' if not found.
 */
function getVersionFromPackageJson(): string {
  try {
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return typeof packageJson.version === 'string' ? packageJson.version : '(unknown)';
  } catch {
    return '(unknown)';
  }
}

/**
 * Handles the version command.
 *
 * @returns A promise resolving to the command result.
 */
export function handleVersionCommand(): CliCommandResult {
  const version = getVersionFromPackageJson();
  console.log(`criticality v${version}`);
  return { exitCode: 0 };
}
