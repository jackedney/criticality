#!/usr/bin/env node
/**
 * CLI entry point for the criticality-artifact-server.
 *
 * Usage:
 *   npx tsx src/servers/artifact/cli.ts [--project-root <path>] [--debug]
 *
 * Or when compiled:
 *   node dist/servers/artifact/cli.js [--project-root <path>] [--debug]
 *
 * @packageDocumentation
 */

import path from 'node:path';
import { startArtifactServer } from './server.js';
import { createServerLogger } from '../logging.js';

const HELP_TEXT = `
criticality-artifact-server - MCP Server for protocol artifacts

Usage:
  criticality-artifact-server [options]

Options:
  --project-root, -p <path>  Root directory for protocol artifacts (default: cwd)
  --debug, -d                Enable debug logging
  --help, -h                 Show this help message

This server provides read/write access ONLY to official protocol artifacts
(spec.toml, DECISIONS.toml). It prevents context hallucination by ensuring
agents only see committed truth.

Tools provided:
  - read_spec_section: Returns specific sections from spec.toml
  - append_decision: Atomically appends decisions to DECISIONS.toml
  - get_type_witness: Retrieves type witness definitions
  - validate_schema: Validates artifacts against their JSON schemas
`;

function parseArgs(): { projectRoot: string; debug: boolean } {
  const args = process.argv.slice(2);
  let projectRoot = process.cwd();
  let debug = false;

  /* eslint-disable security/detect-object-injection -- args[i] and args[i+1] are safe: bounded array access for CLI argument parsing */
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root' || arg === '-p') {
      const next = args[i + 1];
      if (next !== undefined) {
        projectRoot = path.resolve(next);
        i++;
      }
    } else if (arg === '--debug' || arg === '-d') {
      debug = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
  }
  /* eslint-enable security/detect-object-injection */

  return { projectRoot, debug };
}

const { projectRoot, debug } = parseArgs();
const logger = createServerLogger({ serverName: 'artifact-server', debug });

if (debug) {
  logger.logDebug('server_start', { projectRoot });
}

startArtifactServer({ projectRoot, debug }).catch((err: unknown) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error('startup_failed', { error: errorMessage });
  process.exit(1);
});
