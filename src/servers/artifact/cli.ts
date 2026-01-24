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

function parseArgs(): { projectRoot: string; debug: boolean } {
  const args = process.argv.slice(2);
  let projectRoot = process.cwd();
  let debug = false;

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
      console.log(`
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
`);
      process.exit(0);
    }
  }

  return { projectRoot, debug };
}

const { projectRoot, debug } = parseArgs();

if (debug) {
  console.error(`[artifact-server] Starting with project root: ${projectRoot}`);
}

startArtifactServer({ projectRoot, debug }).catch((err: unknown) => {
  console.error('Failed to start artifact server:', err);
  process.exit(1);
});
