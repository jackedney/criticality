#!/usr/bin/env node
/**
 * CLI entry point for criticality-toolchain-server.
 *
 * Usage: node cli.js [--project-root <path>] [--debug]
 *
 * @packageDocumentation
 */

import { startToolchainServer } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let projectRoot = process.cwd();
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === '--project-root' && nextArg !== undefined) {
      projectRoot = nextArg;
      i++;
    } else if (arg === '--debug') {
      debug = true;
    }
  }

  // eslint-disable-next-line no-console
  console.error(`[toolchain-server] Starting with projectRoot: ${projectRoot}`);

  await startToolchainServer({ projectRoot, debug });
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start toolchain server:', err);
  process.exit(1);
});
