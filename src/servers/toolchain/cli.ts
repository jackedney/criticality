#!/usr/bin/env node
/**
 * CLI entry point for criticality-toolchain-server.
 *
 * Usage: node cli.js [--project-root <path>] [--debug]
 *
 * @packageDocumentation
 */

import { startToolchainServer } from './server.js';
import { createServerLogger } from '../logging.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let projectRoot = process.cwd();
  let debug = false;

  /* eslint-disable security/detect-object-injection -- args[i] and args[i+1] are safe: bounded array access for CLI argument parsing */
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
  /* eslint-enable security/detect-object-injection */

  const logger = createServerLogger({ serverName: 'toolchain-server', debug });

  if (debug) {
    logger.logDebug('server_start', { projectRoot });
  }

  await startToolchainServer({ projectRoot, debug });
}

main().catch((err: unknown) => {
  const logger = createServerLogger({ serverName: 'toolchain-server', debug: true });
  const errorMessage = err instanceof Error ? err.message : String(err);
  logger.error('startup_failed', { error: errorMessage });
  process.exit(1);
});
