/**
 * Status command handler for the Criticality Protocol CLI.
 *
 * Displays the current protocol state including phase, substate type,
 * blocking queries, and available artifacts using OpenTUI Box components.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { StatePersistenceError } from '../../protocol/persistence.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';
import type { ProtocolSubstate, BlockingSubstate } from '../../protocol/types.js';
import { isActiveSubstate, isBlockingSubstate, isFailedSubstate } from '../../protocol/types.js';
import type { BlockingRecord } from '../../protocol/blocking.js';
import { loadLedger } from '../../ledger/persistence.js';
import type { Decision, ConfidenceLevel } from '../../ledger/types.js';
import { loadStateWithRecovery } from '../state.js';

const DEFAULT_STATE_PATH = '.criticality-state.json';
const DEFAULT_LEDGER_PATH = '.criticality/ledger';

interface StatusDisplayOptions {
  colors: boolean;
  unicode: boolean;
  watch?: boolean;
  interval?: number;
}

/**
 * Gets the state file path from configuration or uses default.
 *
 * Uses the default CLI state path (.criticality-state.json) which
 * is consistent with the existing protocol CLI.
 *
 * @returns The state file path.
 */
function getStatePath(): string {
  return DEFAULT_STATE_PATH;
}

/**
 * Gets the protocol state type for display.
 *
 * @param substate - The protocol substate.
 * @returns The state type string (active/blocked/completed/failed).
 */
function getStateType(substate: ProtocolSubstate): string {
  if (isFailedSubstate(substate)) {
    return 'Failed';
  }
  if (isBlockingSubstate(substate)) {
    return 'Blocked';
  }
  if (isActiveSubstate(substate)) {
    return 'Active';
  }
  return 'Unknown';
}

/**
 * Formats a phase name with optional state type indicator.
 *
 * @param phase - The protocol phase.
 * @param stateType - The state type.
 * @param options - Display options.
 * @returns The formatted phase string.
 */
function formatPhase(phase: string, stateType: string, options: StatusDisplayOptions): string {
  const colorCode = options.colors ? '\x1b[36m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  return `${colorCode}${phase}${resetCode} (${stateType})`;
}

/**
 * Formats a timestamp as relative time (e.g., "2h ago", "30m ago").
 *
 * @param timestamp - ISO 8601 timestamp string.
 * @returns Relative time string.
 */
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${String(days)}d ago`;
  }
  if (hours > 0) {
    return `${String(hours)}h ago`;
  }
  if (minutes > 0) {
    return `${String(minutes)}m ago`;
  }
  return 'just now';
}

/**
 * Gets the ledger file path from configuration or uses default.
 *
 * Uses the default CLI ledger path (.criticality/ledger).
 *
 * @returns The ledger file path.
 */
function getLedgerPath(): string {
  return DEFAULT_LEDGER_PATH;
}

/**
 * Gets confidence styling for display.
 *
 * @param confidence - The confidence level.
 * @param options - Display options.
 * @returns Formatted confidence string with styling.
 */
function formatConfidence(confidence: ConfidenceLevel, options: StatusDisplayOptions): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';

  if (confidence === 'canonical') {
    return `${boldCode}[canonical]${resetCode}`;
  }
  if (confidence === 'suspended' || confidence === 'blocking') {
    return `${dimCode}[${confidence}]${resetCode}`;
  }
  return `[${confidence}]`;
}

/**
 * Formats recent decisions for display.
 *
 * @param decisions - Array of decisions (most recent first).
 * @param options - Display options.
 * @returns The formatted recent decisions text.
 */
function formatRecentDecisions(
  decisions: readonly Decision[],
  options: StatusDisplayOptions
): string {
  if (decisions.length === 0) {
    return 'No decisions recorded yet';
  }

  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';

  let result = `${boldCode}Recent Decisions:${resetCode}\n`;

  for (const decision of decisions) {
    const timeAgo = formatRelativeTime(decision.timestamp);
    const confidence = formatConfidence(decision.confidence, options);
    result += `${decision.id} (${timeAgo}) ${confidence} ${decision.constraint}\n`;
  }

  return result;
}

/**
 * Creates a box-drawing border using ASCII or Unicode characters.
 *
 * @param options - Display options.
 * @returns Border characters object.
 */
function getBorderChars(options: StatusDisplayOptions): Record<string, string> {
  if (options.unicode) {
    return {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│',
      topDivider: '┬',
      bottomDivider: '┴',
      leftDivider: '├',
      rightDivider: '┤',
      cross: '┼',
    };
  }
  return {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
    topDivider: '+',
    bottomDivider: '+',
    leftDivider: '+',
    rightDivider: '+',
    cross: '+',
  };
}

/**
 * Wraps text in a box-drawing border.
 *
 * @param text - The text to wrap.
 * @param options - Display options.
 * @returns The boxed text.
 */
function wrapInBox(text: string, options: StatusDisplayOptions): string {
  const border = getBorderChars(options);
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map((line) => line.length));
  const horizontalBorder = (border.horizontal ?? '-').repeat(maxLength + 2);

  let result = (border.topLeft ?? '+') + horizontalBorder + (border.topRight ?? '+') + '\n';
  for (const line of lines) {
    const paddedLine = line.padEnd(maxLength);
    result += (border.vertical ?? '|') + ' ' + paddedLine + ' ' + (border.vertical ?? '|') + '\n';
  }
  result += (border.bottomLeft ?? '+') + horizontalBorder + (border.bottomRight ?? '+');

  return result;
}

/**
 * Formats a blocking reason for display.
 *
 * @param substate - The blocking substate.
 * @param options - Display options.
 * @returns The formatted blocking reason text.
 */
function formatBlockingReason(substate: BlockingSubstate, options: StatusDisplayOptions): string {
  const redCode = options.colors ? '\x1b[31m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const boldCode = options.colors ? '\x1b[1m' : '';

  let result = '';

  result += `${boldCode}Blocking Reason:${resetCode}\n`;
  result += `${redCode}Type: blocking_query${resetCode}\n`;
  result += `Description: ${substate.query}\n`;

  if (substate.options && substate.options.length > 0) {
    result += `\n${boldCode}Suggested Resolutions:${resetCode}\n`;
    for (let i = 0; i < substate.options.length; i++) {
      const option = substate.options[i];
      if (option !== undefined) {
        result += `  ${String(i + 1)}. ${option}\n`;
      }
    }
  }

  return result;
}

/**
 * Formats pending queries for display.
 *
 * @param blockingQueries - The blocking queries to format.
 * @param options - Display options.
 * @returns The formatted pending queries text.
 */
function formatPendingQueries(
  blockingQueries: readonly BlockingRecord[],
  options: StatusDisplayOptions
): string {
  const pendingQueries = blockingQueries.filter((q) => !q.resolved);

  if (pendingQueries.length === 0) {
    return 'No pending queries';
  }

  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const redCode = options.colors ? '\x1b[31m' : '';

  let result = `${boldCode}Pending Queries:${resetCode}\n`;

  for (const query of pendingQueries) {
    const optionsCount = query.options?.length ?? 0;
    const severityDisplay = `${redCode}[BLOCKING]${resetCode}`;

    let questionText = query.query;
    if (questionText.length > 100) {
      questionText = questionText.substring(0, 100) + '...';
    }

    const categoryDisplay = query.phase.toLowerCase();

    result += `${query.id} ${severityDisplay} ${categoryDisplay} - "${questionText}" (${String(optionsCount)} option${
      optionsCount !== 1 ? 's' : ''
    })\n`;
  }

  return result;
}

/**
 * Formats timestamp as HH:MM:SS.
 *
 * @param date - The date to format.
 * @returns The formatted timestamp string.
 */
function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Formats notification status for display.
 *
 * This function is designed to be extended in Phase 4.2 when the
 * notification system is implemented. For now, it shows that the
 * notification system is not configured.
 *
 * @param options - Display options.
 * @returns The formatted notification status text.
 */
function formatNotifications(options: StatusDisplayOptions): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';

  let result = `${boldCode}Notifications:${resetCode}\n`;
  result += `${dimCode}Notification system: not configured (see Phase 4.2)${resetCode}`;

  return result;
}

/**
 * Renders status display to console.
 *
 * @param snapshot - The protocol state snapshot.
 * @param options - Display options.
 */
async function renderStatus(
  snapshot: ProtocolStateSnapshot,
  options: StatusDisplayOptions
): Promise<void> {
  const stateType = getStateType(snapshot.state.substate);
  const phaseDisplay = formatPhase(snapshot.state.phase, stateType, options);

  let statusText = `Phase: ${phaseDisplay}`;
  let additionalInfo = '';

  if (snapshot.state.phase === 'Complete') {
    statusText = 'Protocol Complete';
    additionalInfo = `Artifacts: ${snapshot.artifacts.join(', ') || 'None'}`;
  } else if (isActiveSubstate(snapshot.state.substate)) {
    const phaseIndex = [
      'Ignition',
      'Lattice',
      'CompositionAudit',
      'Injection',
      'Mesoscopic',
      'MassDefect',
    ].indexOf(snapshot.state.phase);
    const totalPhases = 6;
    const progress = ((phaseIndex + 1) / totalPhases) * 100;
    additionalInfo = `Progress: ${String(Math.round(progress))}% (${String(phaseIndex + 1)}/${String(totalPhases)})`;
  } else if (isBlockingSubstate(snapshot.state.substate)) {
    additionalInfo = `Blocking Query: ${snapshot.state.substate.query}`;
  } else if (isFailedSubstate(snapshot.state.substate)) {
    additionalInfo = `Error: ${snapshot.state.substate.error}`;
    if (snapshot.state.substate.recoverable) {
      additionalInfo += ' (Recoverable)';
    }
  }

  const mainStatus = statusText + (additionalInfo ? '\n\n' + additionalInfo : '');
  console.log(wrapInBox(mainStatus, options));

  if (isBlockingSubstate(snapshot.state.substate)) {
    const blockingReason = formatBlockingReason(snapshot.state.substate, options);
    console.log();
    console.log(wrapInBox(blockingReason, options));
  }

  const pendingQueries = formatPendingQueries(snapshot.blockingQueries, options);
  console.log();
  console.log(wrapInBox(pendingQueries, options));

  // Display notifications status (Phase 4.2 integration point)
  const notificationsText = formatNotifications(options);
  console.log();
  console.log(wrapInBox(notificationsText, options));

  // Display recent decisions from ledger
  const ledgerPath = getLedgerPath();
  try {
    const ledger = await loadLedger(ledgerPath);
    const decisions = ledger.getDecisions();

    // Get last 5 decisions (most recent first)
    const recentDecisions = decisions.slice(-5).reverse();

    const recentDecisionsText = formatRecentDecisions(recentDecisions, options);
    console.log();
    console.log(wrapInBox(recentDecisionsText, options));
  } catch (_error) {
    // If ledger doesn't exist or can't be read, show empty message
    const recentDecisionsText = formatRecentDecisions([], options);
    console.log();
    console.log(wrapInBox(recentDecisionsText, options));
  }
}

/**
 * Renders status display with footer for watch mode.
 *
 * @param snapshot - The protocol state snapshot.
 * @param options - Display options.
 */
async function renderStatusWithFooter(
  snapshot: ProtocolStateSnapshot,
  options: StatusDisplayOptions
): Promise<void> {
  await renderStatus(snapshot, options);

  const dimCode = options.colors ? '\x1b[2m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const timestamp = formatTimestamp(new Date());

  console.log();
  console.log(`${dimCode}Last updated: ${timestamp} | Press Ctrl+C to exit${resetCode}`);
}

/**
 * Parses command-line arguments for status command.
 *
 * @param args - Command-line arguments.
 * @returns Parsed options including watch mode settings.
 */
function parseStatusArgs(args: string[]): { watch: boolean; interval: number } {
  let watch = false;
  let interval = 2000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--watch' || arg === '-w') {
      watch = true;
    } else if (arg === '--interval' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        const parsedInterval = Number.parseInt(nextArg, 10);
        if (!Number.isNaN(parsedInterval)) {
          if (parsedInterval < 500) {
            console.warn(
              'Warning: Interval below 500ms may cause performance issues. Using minimum of 500ms.'
            );
            interval = 500;
          } else {
            interval = parsedInterval;
          }
        }
      }
    }
  }

  return { watch, interval };
}

/**
 * Handles the status command.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to the command result.
 */
export async function handleStatusCommand(context: CliContext): Promise<CliCommandResult> {
  const { watch, interval } = parseStatusArgs(context.args);

  const options: StatusDisplayOptions = {
    colors: context.config.colors ?? true,
    unicode: context.config.unicode ?? true,
    watch,
    interval,
  };

  const statePath = getStatePath();

  try {
    const snapshot = await loadStateWithRecovery(statePath);

    if (!watch) {
      await renderStatus(snapshot, options);
      return { exitCode: 0 };
    }

    // eslint-disable-next-line @typescript-eslint/return-await
    return new Promise<CliCommandResult>((resolve) => {
      let running = true;

      const updateStatus = async (): Promise<void> => {
        if (!running) {
          return;
        }

        try {
          const currentSnapshot = await loadStateWithRecovery(statePath);
          console.clear();
          await renderStatusWithFooter(currentSnapshot, options);
        } catch (error) {
          if (error instanceof StatePersistenceError) {
            if (error.errorType === 'file_error' && error.details?.includes('does not exist')) {
              const message = 'No protocol state found. Run criticality init to start.';
              console.clear();
              console.log(message);
            } else {
              console.clear();
              console.error(`Error loading state: ${error.message}`);
            }
          } else {
            console.clear();
            console.error(
              `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      };

      const gracefulShutdown = (): void => {
        running = false;
        console.log('\nWatch mode stopped.');
        resolve({ exitCode: 0 });
      };

      process.on('SIGINT', gracefulShutdown);

      void updateStatus().then(() => {
        const intervalId = setInterval(() => {
          if (running) {
            void updateStatus().catch(() => {
              // Silently handle errors during watch updates
            });
          } else {
            clearInterval(intervalId);
          }
        }, interval);

        // Clean up interval on resolve
        process.on('beforeExit', () => {
          clearInterval(intervalId);
        });
      });
    });
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
