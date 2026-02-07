/**
 * Resume command handler for the Criticality Protocol CLI.
 *
 * Allows users to continue protocol execution from a blocked state
 * after resolving blocking queries.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { StatePersistenceError, type ProtocolStateSnapshot } from '../../protocol/persistence.js';
import {
  loadCliStateWithRecovery,
  getDefaultStatePath,
  getDefaultLedgerPath,
  type CliStateSnapshot,
} from '../state.js';
import { loadLedger } from '../../ledger/persistence.js';
import type { Decision } from '../../ledger/types.js';
import { formatRelativeTime, formatConfidence, wrapInBox } from '../utils/displayUtils.js';
import {
  createOrchestrator,
  type TickResult,
  type TickStopReason,
} from '../../protocol/orchestrator.js';
import { Spinner } from '../components/Spinner.js';
import { createCliOperations, type OperationTelemetry } from '../operations.js';
import { existsSync, readFileSync } from 'node:fs';
import { parseConfig } from '../../config/index.js';

interface ResumeDisplayOptions {
  colors: boolean;
  unicode: boolean;
}

/**
 * Loads configuration from criticality.toml.
 *
 * @returns The loaded configuration or defaults.
 */
function loadCliConfig(): ReturnType<(typeof import('../../config/index.js'))['parseConfig']> {
  const configFilePath = 'criticality.toml';

  if (existsSync(configFilePath)) {
    try {
      const tomlContent = readFileSync(configFilePath, 'utf-8');
      return parseConfig(tomlContent);
    } catch (error) {
      console.warn(
        `Warning: Failed to load config from ${configFilePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      console.warn('Using default CLI settings.');
    }
  }

  return parseConfig('');
}

/**
 * Telemetry state for tracking operations.
 */
let telemetry: OperationTelemetry = {
  modelCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  executionTimeMs: 0,
};

/**
 * Gets the state file path.
 *
 * @returns The state file path.
 */
function getStatePath(): string {
  return getDefaultStatePath();
}

/**
 * Formats decisions summary for display.
 *
 * @param decisions - Array of decisions.
 * @param options - Display options.
 * @returns The formatted decisions text.
 */
function formatDecisionsSummary(
  decisions: readonly Decision[],
  options: ResumeDisplayOptions
): string {
  if (decisions.length === 0) {
    return 'No new decisions since block';
  }

  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';

  let result = `${boldCode}${String(decisions.length)} decision${decisions.length === 1 ? '' : 's'} made since block:${resetCode}\n`;

  for (const decision of decisions) {
    const timeAgo = formatRelativeTime(decision.timestamp);
    const confidence = formatConfidence(decision.confidence, options);

    // Highlight superseded or invalidated decisions
    let statusPrefix = '';
    if (decision.status === 'superseded') {
      statusPrefix = `${yellowCode}[superseded]${resetCode} `;
    } else if (decision.status === 'invalidated') {
      statusPrefix = `${dimCode}[invalidated]${resetCode} `;
    }

    result += `${statusPrefix}${decision.id} (${timeAgo}) ${confidence} ${decision.constraint}\n`;
  }

  return result;
}

/**
 * Displays the resume summary with decisions made since blocking.
 *
 * @param snapshot - The CLI state snapshot.
 * @param statePath - Path to the ledger file.
 * @param options - Display options.
 */
async function displayResumeSummary(
  snapshot: CliStateSnapshot,
  statePath: string,
  options: ResumeDisplayOptions
): Promise<void> {
  const ledgerPath = getDefaultLedgerPath(statePath);

  let decisions: readonly Decision[] = [];
  try {
    const ledger = await loadLedger(ledgerPath);
    decisions = ledger.getDecisions();

    // Get the earliest block timestamp from resolved queries
    const blockTimestamps = snapshot.resolvedQueries.map((r) => r.record.blockedAt);
    const earliestBlockTime =
      blockTimestamps.length > 0
        ? new Date(Math.min(...blockTimestamps.map((t) => new Date(t).getTime())))
        : new Date();

    // Filter decisions made since the block started
    decisions = decisions.filter((d) => {
      const decisionTime = new Date(d.timestamp).getTime();
      return decisionTime >= earliestBlockTime.getTime();
    });

    // Sort decisions chronologically
    decisions = decisions.slice().sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  } catch {
    decisions = [];
  }

  const decisionsSummary = formatDecisionsSummary(decisions, options);

  console.log(wrapInBox(decisionsSummary, options));

  console.log();
  console.log(`Resuming protocol from ${snapshot.state.phase}...`);
}

/**
 * Displays execution summary after tick loop completion.
 *
 * @param tickCount - Number of ticks executed.
 * @param stopReason - Reason for stopping.
 * @param snapshot - Final state snapshot.
 * @param startTime - When execution started.
 * @param options - Display options.
 */
function displayExecutionSummary(
  tickCount: number,
  stopReason: TickStopReason,
  snapshot: ProtocolStateSnapshot,
  startTime: number,
  options: ResumeDisplayOptions
): void {
  const elapsed = Date.now() - startTime;
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';
  const greenCode = options.colors ? '\x1b[32m' : '';
  const redCode = options.colors ? '\x1b[31m' : '';

  console.log();
  console.log(`${boldCode}Execution Summary${resetCode}`);
  console.log(`  Ticks executed: ${String(tickCount)}`);
  console.log(`  Time elapsed: ${elapsedSec}s`);
  console.log(`  Current phase: ${snapshot.state.phase}`);
  if (telemetry.modelCalls > 0) {
    console.log();
    console.log(`${boldCode}Telemetry${resetCode}`);
    console.log(`  Model calls: ${String(telemetry.modelCalls)}`);
    console.log(`  Prompt tokens: ${String(telemetry.promptTokens)}`);
    console.log(`  Completion tokens: ${String(telemetry.completionTokens)}`);
    console.log(`  Total tokens: ${String(telemetry.promptTokens + telemetry.completionTokens)}`);
  }

  const { substate } = snapshot.state;
  if (substate.kind === 'Blocking') {
    console.log(`  ${yellowCode}Status: Blocked${resetCode}`);
    console.log(
      `  Query: ${substate.query.substring(0, 60)}${substate.query.length > 60 ? '...' : ''}`
    );
    console.log();
    console.log(`Run ${greenCode}crit resolve${resetCode} to continue.`);
  } else if (substate.kind === 'Failed') {
    console.log(`  ${redCode}Status: Failed${resetCode}`);
    console.log(`  Error: ${substate.error}`);
    if (substate.recoverable) {
      console.log();
      console.log(`${yellowCode}This error is recoverable.${resetCode}`);
    }
  } else if (stopReason === 'COMPLETE') {
    console.log(`  ${greenCode}Status: Complete${resetCode}`);
    console.log(`  Protocol execution finished successfully.`);
  } else {
    console.log(`  Status: ${stopReason}`);
  }
}

/**
 * Handles resume command.
 *
 * Checks for blocked state with resolved queries, displays decision summary,
 * and triggers protocol orchestrator to continue execution.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to command result.
 */
export async function handleResumeCommand(context: CliContext): Promise<CliCommandResult> {
  const options: ResumeDisplayOptions = {
    colors: context.config.colors,
    unicode: context.config.unicode,
  };

  const statePath = getStatePath();
  const startTime = Date.now();
  let gracefulShutdown = false;

  try {
    const snapshot = await loadCliStateWithRecovery(statePath);

    if (snapshot.resolvedQueries.length === 0) {
      console.error('Error: No blocked state to resume');
      return { exitCode: 1, message: 'No resolved queries to resume from' };
    }

    await displayResumeSummary(snapshot, statePath, options);

    const config = loadCliConfig();

    const operations = await createCliOperations({
      config,
      statePath,
      onTelemetryUpdate: (newTelemetry) => {
        telemetry = newTelemetry;
      },
    });

    const orchestrator = await createOrchestrator({
      statePath,
      operations,
    });

    // Create and start spinner
    const spinner = new Spinner({
      colors: options.colors,
      unicode: options.unicode,
      interval: 100,
    });

    spinner.update(
      orchestrator.state.snapshot.state.phase,
      orchestrator.state.snapshot.state.substate
    );
    spinner.start();

    // Set up SIGINT handler for graceful shutdown
    const sigintHandler = (): void => {
      if (gracefulShutdown) {
        // Second Ctrl+C: force exit
        console.log('\nForce quitting...');
        process.exit(1);
      }

      gracefulShutdown = true;
      spinner.stop('Stopping after current operation...');
      console.log('Stopping... (Ctrl+C again to force quit)');
    };

    process.on('SIGINT', sigintHandler);

    // Execute tick loop
    let result: TickResult = await orchestrator.tick();
    let tickCount = 0;
    let shouldContinueLoop = true;

    do {
      tickCount++;

      // Update spinner with new phase/substate
      spinner.update(result.snapshot.state.phase, result.snapshot.state.substate);

      // Check for graceful shutdown after processing tick
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (gracefulShutdown) {
        // Stop after current tick
        shouldContinueLoop = false;
        spinner.stop('Interrupted by user');
        console.log();
        displayExecutionSummary(
          tickCount,
          'EXTERNAL_ERROR',
          orchestrator.state.snapshot,
          startTime,
          options
        );
        console.log();
        console.log('State saved successfully.');
        return { exitCode: 0 };
      }

      // Stop if tick loop should not continue

      if (!result.shouldContinue) {
        shouldContinueLoop = false;
      }

      if (shouldContinueLoop) {
        result = await orchestrator.tick();
      }
    } while (shouldContinueLoop);

    // Clean up
    process.removeListener('SIGINT', sigintHandler);
    spinner.stop();

    // Display execution summary
    displayExecutionSummary(
      tickCount,
      result.stopReason ?? 'EXTERNAL_ERROR',
      result.snapshot,
      startTime,
      options
    );

    // Handle error states
    if (result.stopReason === 'FAILED' && result.error !== undefined) {
      const yellowCode = options.colors ? '\x1b[33m' : '';
      const resetCode = options.colors ? '\x1b[0m' : '';
      console.log();
      console.log(`${yellowCode}Suggestions:${resetCode}`);
      console.log('  1. Check the error details above');
      console.log('  2. Review recent changes that may have caused the issue');
      console.log('  3. Run "crit status" for more information');
      return { exitCode: 1, message: result.error };
    }

    return { exitCode: 0 };
  } catch (error) {
    if (error instanceof StatePersistenceError) {
      if (error.errorType === 'file_error' && error.details?.includes('does not exist')) {
        const message = 'No protocol state found. Run criticality init to start.';
        console.log(message);
        return { exitCode: 0 };
      }
      console.error(`Error loading state: ${error.message}`);
      return { exitCode: 1, message: error.message };
    }
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 1 };
  }
}
