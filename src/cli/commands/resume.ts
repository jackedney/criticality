/**
 * Resume command handler for the Criticality Protocol CLI.
 *
 * Allows users to continue protocol execution from a blocked state
 * after resolving blocking queries.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { StatePersistenceError } from '../../protocol/persistence.js';
import {
  loadCliStateWithRecovery,
  getDefaultStatePath,
  getDefaultLedgerPath,
  type CliStateSnapshot,
} from '../state.js';
import { loadLedger } from '../../ledger/persistence.js';
import type { Decision } from '../../ledger/types.js';
import { formatRelativeTime, formatConfidence, wrapInBox } from '../utils/displayUtils.js';

interface ResumeDisplayOptions {
  colors: boolean;
  unicode: boolean;
}

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
 * Handles the resume command.
 *
 * Checks for blocked state with resolved queries, displays decision summary,
 * and triggers protocol orchestrator to continue execution.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to the command result.
 */
export async function handleResumeCommand(context: CliContext): Promise<CliCommandResult> {
  const options: ResumeDisplayOptions = {
    colors: context.config.colors,
    unicode: context.config.unicode,
  };

  const statePath = getStatePath();

  try {
    const snapshot = await loadCliStateWithRecovery(statePath);

    if (snapshot.resolvedQueries.length === 0) {
      console.error('Error: No blocked state to resume');
      return { exitCode: 1, message: 'No resolved queries to resume from' };
    }

    await displayResumeSummary(snapshot, statePath, options);

    const { state } = snapshot;

    const boldCode = options.colors ? '\x1b[1m' : '';
    const resetCode = options.colors ? '\x1b[0m' : '';
    const dimCode = options.colors ? '\x1b[2m' : '';

    console.log();
    console.log(
      `${dimCode}Note: Protocol execution will continue from the ${boldCode}${state.phase}${resetCode} phase.${resetCode}`
    );
    console.log(`${dimCode}Use 'crit status' to monitor progress.${resetCode}`);

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
