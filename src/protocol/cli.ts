#!/usr/bin/env node
/**
 * Protocol CLI module.
 *
 * Provides CLI commands for orchestrator interaction per orch_008:
 * - status: Read-only view of current state
 * - resume: Continue execution from persisted state
 * - resolve: Answer a blocking query
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from './types.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import type { BlockingRecord } from './blocking.js';
import { loadState, stateFileExists, saveState } from './persistence.js';
import { getProtocolStatus, createOrchestrator, type ExternalOperations } from './orchestrator.js';
import { createActiveSubstate } from './types.js';

/**
 * Default state file path.
 */
export const DEFAULT_STATE_PATH = '.criticality-state.json';

/**
 * CLI command type.
 */
export type CliCommand = 'status' | 'resume' | 'resolve' | 'help';

/**
 * CLI options parsed from arguments.
 */
export interface CliOptions {
  /** The command to execute. */
  command: CliCommand;
  /** Path to the state file. */
  statePath: string;
  /** Resolution response for resolve command. */
  resolution?: string | undefined;
  /** Whether to show verbose output. */
  verbose: boolean;
}

/**
 * Result of CLI command execution.
 */
export interface CliResult {
  /** Whether the command succeeded. */
  success: boolean;
  /** Output message. */
  message: string;
  /** Exit code. */
  exitCode: number;
}

/**
 * Help text for the CLI.
 */
const HELP_TEXT = `
criticality - Protocol Orchestrator CLI

Usage:
  criticality <command> [options]

Commands:
  status              Show current protocol state (read-only)
  resume              Continue execution from persisted state
  resolve <response>  Answer a blocking query with the given response
  help                Show this help message

Options:
  --state-path, -s <path>  Path to state file (default: .criticality-state.json)
  --verbose, -v            Show detailed output
  --help, -h               Show this help message

Examples:
  criticality status
  criticality status --state-path ./my-project/.criticality-state.json
  criticality resume
  criticality resolve "Use JWT for authentication"
  criticality resolve --state-path ./state.json "approved"

Per orch_008: This CLI provides three core commands:
  - 'status' is always safe to run (read-only)
  - 'resume' continues from persisted state
  - 'resolve' stores human response for next resume cycle
`;

/**
 * Parse CLI arguments into options.
 *
 * @param args - Command line arguments (without node and script).
 * @returns Parsed CLI options.
 */
export function parseArgs(args: readonly string[]): CliOptions {
  let command: CliCommand = 'help';
  let statePath = DEFAULT_STATE_PATH;
  let resolution: string | undefined;
  let verbose = false;

  const mutableArgs = [...args];

  for (let i = 0; i < mutableArgs.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
    const arg = mutableArgs[i];
    if (arg === undefined) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      command = 'help';
      break;
    }

    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }

    if (arg === '--state-path' || arg === '-s') {
      const next = mutableArgs[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        statePath = next;
        i++;
      }
      continue;
    }

    // Check for commands
    if (arg === 'status') {
      command = 'status';
      continue;
    }

    if (arg === 'resume') {
      command = 'resume';
      continue;
    }

    if (arg === 'resolve') {
      command = 'resolve';
      // Get the resolution text
      const next = mutableArgs[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        resolution = next;
        i++;
      }
      continue;
    }

    if (arg === 'help') {
      command = 'help';
      continue;
    }

    // If we have a resolve command and this is a non-flag argument, it's the resolution
    if (command === 'resolve' && resolution === undefined && !arg.startsWith('-')) {
      resolution = arg;
    }
  }

  return { command, statePath, resolution, verbose };
}

/**
 * Format the protocol status for display.
 *
 * @param snapshot - The state snapshot.
 * @param verbose - Whether to show verbose output.
 * @returns Formatted status string.
 */
function formatStatus(snapshot: ProtocolStateSnapshot, verbose: boolean): string {
  const status = getProtocolStatus(snapshot);
  const lines: string[] = [];

  lines.push('Protocol Status');
  lines.push('===============');
  lines.push(`Phase: ${status.phase}`);
  lines.push(`State: ${status.substate}`);

  if (status.artifacts.length > 0) {
    lines.push(`Artifacts: ${status.artifacts.join(', ')}`);
  } else {
    lines.push('Artifacts: (none)');
  }

  if (status.blocking !== undefined) {
    lines.push('');
    lines.push('BLOCKED');
    lines.push('-------');
    lines.push(`Query: ${status.blocking.query}`);
    lines.push(`Blocked at: ${status.blocking.blockedAt}`);
    lines.push('');
    lines.push('Run "criticality resolve <response>" to provide an answer.');
  }

  if (status.failed !== undefined) {
    lines.push('');
    lines.push('FAILED');
    lines.push('------');
    lines.push(`Error: ${status.failed.error}`);
    lines.push(`Recoverable: ${status.failed.recoverable ? 'yes' : 'no'}`);
  }

  if (verbose) {
    lines.push('');
    lines.push('Verbose Details');
    lines.push('---------------');
    lines.push(`Blocking queries: ${String(snapshot.blockingQueries.length)}`);

    if (snapshot.blockingQueries.length > 0) {
      for (const query of snapshot.blockingQueries) {
        lines.push(`  - [${query.id}] ${query.query} (resolved: ${String(query.resolved)})`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Execute the status command.
 *
 * @param options - CLI options.
 * @returns CLI result.
 */
export async function executeStatus(options: CliOptions): Promise<CliResult> {
  const exists = await stateFileExists(options.statePath);

  if (!exists) {
    return {
      success: true,
      message: `No state file found at "${options.statePath}"\nProtocol has not been started. Run "criticality resume" to begin.`,
      exitCode: 0,
    };
  }

  try {
    const snapshot = await loadState(options.statePath);
    const statusText = formatStatus(snapshot, options.verbose);

    return {
      success: true,
      message: statusText,
      exitCode: 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error reading state: ${errorMessage}`,
      exitCode: 1,
    };
  }
}

/**
 * No-op external operations for testing/dry-run.
 */
const noopOperations: ExternalOperations = {
  executeModelCall(_phase: ProtocolPhase) {
    return Promise.resolve({ success: true });
  },
  runCompilation() {
    return Promise.resolve({ success: true });
  },
  runTests() {
    return Promise.resolve({ success: true });
  },
  archivePhaseArtifacts(_phase: ProtocolPhase) {
    return Promise.resolve({ success: true });
  },
  sendBlockingNotification(_query: string) {
    return Promise.resolve();
  },
};

/**
 * Execute the resume command.
 *
 * @param options - CLI options.
 * @returns CLI result.
 */
export async function executeResume(options: CliOptions): Promise<CliResult> {
  try {
    const orchestrator = await createOrchestrator({
      statePath: options.statePath,
      operations: noopOperations,
    });

    // Execute one tick to progress state
    const result = await orchestrator.tick();

    if (result.stopReason === 'COMPLETE') {
      return {
        success: true,
        message: 'Protocol execution complete.',
        exitCode: 0,
      };
    }

    if (result.stopReason === 'BLOCKED') {
      const status = getProtocolStatus(result.snapshot);
      if (status.blocking !== undefined) {
        return {
          success: true,
          message: `Protocol is blocked.\n\nQuery: ${status.blocking.query}\n\nRun "criticality resolve <response>" to continue.`,
          exitCode: 0,
        };
      }
    }

    if (result.stopReason === 'FAILED') {
      return {
        success: false,
        message: `Protocol execution failed: ${result.error ?? 'Unknown error'}`,
        exitCode: 1,
      };
    }

    const status = getProtocolStatus(result.snapshot);
    return {
      success: true,
      message: `Protocol at phase ${status.phase} (${status.substate}).\nRun "criticality status" for details.`,
      exitCode: 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error resuming protocol: ${errorMessage}`,
      exitCode: 1,
    };
  }
}

/**
 * Execute the resolve command.
 *
 * @param options - CLI options.
 * @returns CLI result.
 */
export async function executeResolve(options: CliOptions): Promise<CliResult> {
  if (options.resolution === undefined || options.resolution.trim() === '') {
    return {
      success: false,
      message:
        'Error: resolve command requires a response.\n\nUsage: criticality resolve <response>',
      exitCode: 1,
    };
  }

  const exists = await stateFileExists(options.statePath);

  if (!exists) {
    return {
      success: false,
      message: `No state file found at "${options.statePath}"\nCannot resolve without an active protocol state.`,
      exitCode: 1,
    };
  }

  try {
    const snapshot = await loadState(options.statePath);
    const { substate } = snapshot.state;

    if (substate.kind !== 'Blocking') {
      return {
        success: false,
        message: `Protocol is not blocked (current state: ${substate.kind}).\nResolve is only valid when the protocol is waiting for input.`,
        exitCode: 1,
      };
    }

    // Record the resolution and transition to active state
    const activeSubstate = createActiveSubstate();
    const recordId = `resolved-${String(Date.now())}`;

    // Find the original blocking query to get its ID for proper resolution tracking
    const originalBlockingQuery = snapshot.blockingQueries.find(
      (entry) =>
        entry.phase === snapshot.state.phase && entry.query === substate.query && !entry.resolved
    );
    const originalQueryId = originalBlockingQuery?.id ?? recordId;

    const resolvedRecord: BlockingRecord = {
      id: recordId,
      phase: snapshot.state.phase,
      query: substate.query,
      blockedAt: substate.blockedAt,
      resolved: true as const,
      resolution: {
        queryId: originalQueryId,
        response: options.resolution,
        resolvedAt: new Date().toISOString(),
      },
    };
    const newSnapshot: ProtocolStateSnapshot = {
      state: {
        phase: snapshot.state.phase,
        substate: activeSubstate,
      },
      artifacts: snapshot.artifacts,
      blockingQueries: [...snapshot.blockingQueries, resolvedRecord],
    };

    await saveState(newSnapshot, options.statePath);

    return {
      success: true,
      message: `Resolution recorded: "${options.resolution}"\n\nRun "criticality resume" to continue execution.`,
      exitCode: 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error resolving: ${errorMessage}`,
      exitCode: 1,
    };
  }
}

/**
 * Execute the help command.
 *
 * @returns CLI result.
 */
export function executeHelp(): CliResult {
  return {
    success: true,
    message: HELP_TEXT.trim(),
    exitCode: 0,
  };
}

/**
 * Execute a CLI command.
 *
 * @param options - CLI options.
 * @returns CLI result.
 */
export async function executeCommand(options: CliOptions): Promise<CliResult> {
  switch (options.command) {
    case 'status':
      return executeStatus(options);
    case 'resume':
      return executeResume(options);
    case 'resolve':
      return executeResolve(options);
    case 'help':
      return executeHelp();
  }
}

/**
 * Main CLI entry point.
 *
 * @param args - Command line arguments.
 * @returns Exit code.
 */
export async function main(args: readonly string[]): Promise<number> {
  const options = parseArgs(args);
  const result = await executeCommand(options);

  // Output result
  process.stdout.write(result.message + '\n');

  return result.exitCode;
}

// Run if executed directly
if (typeof process !== 'undefined' && process.argv[1] !== undefined) {
  const isDirectExecution =
    process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('cli.js');

  if (isDirectExecution) {
    main(process.argv.slice(2))
      .then((exitCode) => {
        process.exit(exitCode);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Fatal error: ${errorMessage}\n`);
        process.exit(1);
      });
  }
}
