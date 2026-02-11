/**
 * Status command handler for the Criticality Protocol CLI.
 *
 * Displays the current protocol state including phase, state kind,
 * blocking queries, and available artifacts using OpenTUI Box components.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { StatePersistenceError } from '../../protocol/persistence.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';
import type { ProtocolState, BlockedState } from '../../protocol/types.js';
import {
  isActiveState,
  isBlockedState,
  isCompleteState,
  isFailedState,
  getPhase,
  PROTOCOL_PHASES,
  formatStepName,
  formatBlockReasonLabel,
} from '../../protocol/types.js';
import type { BlockingRecord } from '../../protocol/blocking.js';
import { loadLedger } from '../../ledger/persistence.js';
import type { Decision } from '../../ledger/types.js';
import { loadStateWithRecovery, getDefaultStatePath, getDefaultLedgerPath } from '../state.js';
import { formatRelativeTime, formatConfidence, wrapInBox } from '../utils/displayUtils.js';
import { TelemetryCollector } from '../telemetry.js';
import { NotificationService } from '../../notifications/service.js';
import { ReminderScheduler } from '../../notifications/reminder.js';
import { validateWebhookEndpoint } from '../../notifications/index.js';
import type { Config, NotificationConfig } from '../../config/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { parseConfig } from '../../config/index.js';
import * as path from 'node:path';

interface StatusDisplayOptions {
  colors: boolean;
  unicode: boolean;
  watch?: boolean;
  interval?: number;
  verbose?: boolean;
}

/**
 * Validates configured webhook endpoints at startup.
 *
 * Validates URL format and optionally sends test pings.
 * Displays validation results as console output but does not block startup.
 *
 * @param config - The configuration object.
 */
async function validateWebhookEndpoints(config: Config): Promise<void> {
  if (!config.notifications.enabled || config.notifications.channels === undefined) {
    return;
  }

  const webhookChannels = config.notifications.channels.filter(
    (c) => c.type === 'webhook' && c.enabled
  );

  if (webhookChannels.length === 0) {
    return;
  }

  console.log('Validating webhook endpoints...');

  for (const channel of webhookChannels) {
    const result = await validateWebhookEndpoint(channel.endpoint, { ping: false });

    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.warn(`⚠ ${result.error}`);
    }
  }

  console.log();
}

/**
 * Loads configuration from criticality.toml.
 *
 * @returns The loaded configuration or defaults.
 */
function loadCliConfig(): Config {
  const configFilePath = 'criticality.toml';

  if (existsSync(configFilePath)) {
    try {
      const tomlContent = readFileSync(configFilePath, 'utf-8');
      return parseConfig(tomlContent);
    } catch (_error) {
      // Use defaults if config loading fails
    }
  }

  return parseConfig('');
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
  return getDefaultStatePath();
}

/**
 * Checks and sends reminder if protocol is blocked.
 *
 * @param snapshot - The protocol state snapshot.
 * @param statePath - Path to state file.
 * @returns Next scheduled reminder time, or undefined if not scheduled.
 */
async function checkAndSendReminder(
  snapshot: ProtocolStateSnapshot,
  statePath: string
): Promise<string | undefined> {
  const cliConfig = loadCliConfig();

  if (!cliConfig.notifications.enabled || cliConfig.notifications.reminder_schedule === undefined) {
    return undefined;
  }

  const blockingRecord = snapshot.blockingQueries.find((q) => !q.resolved);
  if (!blockingRecord) {
    return undefined;
  }

  const notificationService = new NotificationService(cliConfig.notifications);
  const stateDir = path.dirname(statePath);
  const reminderScheduler = new ReminderScheduler({
    cronExpression: cliConfig.notifications.reminder_schedule,
    notificationService,
    stateDir,
    enabled: true,
  });

  await reminderScheduler.initialize();

  const result = await reminderScheduler.checkAndSendReminder(new Date(), blockingRecord);

  if (result.sent) {
    const nextScheduled = new Date(result.nextScheduled);
    const timeStr = nextScheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    console.log(`Reminder sent. Next reminder at ${timeStr}`);
  }

  return reminderScheduler.getNextScheduled();
}

/**
 * Formats hierarchical state (Phase > Step).
 *
 * Shows the phase name with its state kind, plus the active step if applicable.
 *
 * @param state - The protocol state.
 * @param options - Display options.
 * @returns The formatted hierarchical state string.
 */
function formatHierarchicalState(state: ProtocolState, options: StatusDisplayOptions): string {
  const dimCode = options.colors ? '\x1b[2m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const greenCode = options.colors ? '\x1b[32m' : '';
  const redCode = options.colors ? '\x1b[31m' : '';

  const phase = getPhase(state) ?? 'Complete';
  const stateLabel = state.kind;
  const stateColor = stateLabel === 'Blocked' || stateLabel === 'Failed' ? redCode : greenCode;
  const phaseWithState = `${greenCode}${phase}${resetCode} (${stateColor}${stateLabel}${resetCode})`;

  const parts: string[] = [phaseWithState];

  if (isActiveState(state)) {
    parts.push(formatStepName(state.phase.substate.step));
  } else if (isBlockedState(state)) {
    parts.push(`Blocked: ${formatBlockReasonLabel(state.reason)}`);
  }

  return parts.join(` ${dimCode}>${resetCode} `);
}

/**
 * Gets the ledger file path from configuration or uses default.
 *
 * Uses the default CLI ledger path (.criticality/ledger).
 *
 * @returns The ledger file path.
 */
function getLedgerPath(): string {
  return getDefaultLedgerPath(getStatePath());
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
 * Formats a blocking reason for display.
 *
 * @param state - The blocked state containing query and options.
 * @param options - Display options.
 * @returns The formatted blocking reason text.
 */
function formatBlockingReason(state: BlockedState, options: StatusDisplayOptions): string {
  const redCode = options.colors ? '\x1b[31m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const boldCode = options.colors ? '\x1b[1m' : '';

  let result = '';

  result += `${boldCode}Blocking Reason:${resetCode}\n`;
  result += `${redCode}Type: blocking_query${resetCode}\n`;
  result += `Description: ${state.query}\n`;

  if (state.options && state.options.length > 0) {
    result += `\n${boldCode}Suggested Resolutions:${resetCode}\n`;
    for (let i = 0; i < state.options.length; i++) {
      const option = state.options[i];
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
 * @param options - Display options.
 * @param config - Notification configuration.
 * @param nextScheduled - Next scheduled reminder time (optional).
 * @param isBlocked - Whether protocol is currently blocked.
 * @returns The formatted notification status text.
 */
function formatNotifications(
  options: StatusDisplayOptions,
  config: NotificationConfig,
  nextScheduled?: string,
  isBlocked: boolean = false
): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';
  const greenCode = options.colors ? '\x1b[32m' : '';

  let result = `${boldCode}Notifications:${resetCode}\n`;

  if (!config.enabled) {
    result += `${dimCode}Notifications: disabled${resetCode}`;
    return result;
  }

  const enabledChannels = config.channels?.filter((c) => c.enabled && c.type === 'webhook') ?? [];
  const totalChannels = config.channels?.filter((c) => c.type === 'webhook').length ?? 0;

  if (totalChannels === 0) {
    result += `${dimCode}Notifications: not configured${resetCode}`;
  } else {
    const statusText =
      enabledChannels.length === totalChannels
        ? `${greenCode}enabled${resetCode}`
        : `${yellowCode}partial${resetCode}`;
    const plural = totalChannels !== 1 ? 's' : '';
    result += `${String(totalChannels)} webhook${plural} configured (${String(enabledChannels.length)}/${String(totalChannels)} ${statusText})`;
  }

  if (config.reminder_schedule !== undefined && isBlocked) {
    result += `\n${yellowCode}Reminder schedule${resetCode}: ${config.reminder_schedule}`;

    if (nextScheduled !== undefined) {
      const nextDate = new Date(nextScheduled);
      const now = new Date();
      const timeUntil = nextDate.getTime() - now.getTime();

      let timeStr = '';
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));

      if (hoursUntil > 24) {
        const daysUntil = Math.floor(hoursUntil / 24);
        timeStr += `${String(daysUntil)} day${daysUntil !== 1 ? 's' : ''} `;
      } else if (hoursUntil > 0) {
        timeStr += `${String(hoursUntil)}h `;
      }
      timeStr += `${String(minutesUntil)}m`;

      const nextTime = nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      result += ` (next: ${nextTime}, in ${timeStr})`;
    }
  }

  return result;
}

/**
 * Formats telemetry for display.
 *
 * @param telemetry - The telemetry data.
 * @param options - Display options.
 * @returns The formatted telemetry text.
 */
function formatTelemetry(
  telemetry: Parameters<typeof TelemetryCollector.formatSummary>[0],
  options: StatusDisplayOptions
): string {
  const telemetryText = TelemetryCollector.formatSummary(telemetry);

  if (!options.verbose) {
    return telemetryText;
  }

  const perPhase = TelemetryCollector.formatPerPhase(telemetry);
  if (perPhase.length === 0) {
    return telemetryText;
  }

  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const dimCode = options.colors ? '\x1b[2m' : '';

  let result = `${telemetryText}\n\n`;
  result += `${boldCode}Per-Phase Breakdown:${resetCode}\n`;
  for (const line of perPhase) {
    result += `${dimCode}  ${resetCode}${line}\n`;
  }

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
  const statePath = getStatePath();
  const cliConfig = loadCliConfig();
  const nextScheduled = await checkAndSendReminder(snapshot, statePath);
  const isBlocked = isBlockedState(snapshot.state);

  const hierarchicalState = formatHierarchicalState(snapshot.state, options);

  let statusText = `Phase: ${hierarchicalState}`;
  let additionalInfo = '';

  if (isCompleteState(snapshot.state)) {
    statusText = 'Protocol Complete';
    additionalInfo = `Artifacts: ${snapshot.artifacts.join(', ') || 'None'}`;
  } else if (isActiveState(snapshot.state)) {
    const phase = getPhase(snapshot.state);
    const phaseIndex = phase !== undefined ? PROTOCOL_PHASES.indexOf(phase) : -1;
    if (phaseIndex >= 0) {
      const totalPhases = PROTOCOL_PHASES.length - 1;
      const progress = ((phaseIndex + 1) / totalPhases) * 100;
      additionalInfo = `Progress: ${String(Math.round(progress))}% (${String(phaseIndex + 1)}/${String(totalPhases)})`;
    } else {
      additionalInfo = 'Unknown phase';
    }
  } else if (isBlockedState(snapshot.state)) {
    additionalInfo = `Blocking Query: ${snapshot.state.query}`;
  } else if (isFailedState(snapshot.state)) {
    additionalInfo = `Error: ${snapshot.state.error}`;
    if (snapshot.state.recoverable) {
      additionalInfo += ' (Recoverable)';
    }
  }

  const mainStatus = statusText + (additionalInfo ? '\n\n' + additionalInfo : '');
  console.log(wrapInBox(mainStatus, options));

  if (isBlockedState(snapshot.state)) {
    const blockingReason = formatBlockingReason(snapshot.state, options);
    console.log();
    console.log(wrapInBox(blockingReason, options));
  }

  const pendingQueries = formatPendingQueries(snapshot.blockingQueries, options);
  console.log();
  console.log(wrapInBox(pendingQueries, options));

  const cliSnapshot = snapshot as unknown as { telemetry?: unknown };
  if (cliSnapshot.telemetry !== undefined) {
    const telemetryText = formatTelemetry(
      cliSnapshot.telemetry as Parameters<typeof TelemetryCollector.formatSummary>[0],
      options
    );
    console.log();
    console.log(wrapInBox(telemetryText, options));
  }

  const notificationsText = formatNotifications(
    options,
    cliConfig.notifications,
    nextScheduled,
    isBlocked
  );
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
function parseStatusArgs(args: string[]): { watch: boolean; interval: number; verbose: boolean } {
  let watch = false;
  let interval = 2000;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--watch' || arg === '-w') {
      watch = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
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

  return { watch, interval, verbose };
}

/**
 * Handles the status command.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to the command result.
 */
export async function handleStatusCommand(context: CliContext): Promise<CliCommandResult> {
  const { watch, interval, verbose } = parseStatusArgs(context.args);

  const options: StatusDisplayOptions = {
    colors: context.config.colors,
    unicode: context.config.unicode,
    watch,
    interval,
    verbose,
  };

  const statePath = getStatePath();

  try {
    const snapshot = await loadStateWithRecovery(statePath);
    const cliConfig = loadCliConfig();

    void validateWebhookEndpoints(cliConfig);

    if (!watch) {
      await renderStatus(snapshot, options);
      return { exitCode: 0 };
    }

    // eslint-disable-next-line @typescript-eslint/return-await
    return new Promise<CliCommandResult>((resolve) => {
      let running = true;
      let intervalId: ReturnType<typeof setInterval> | undefined;

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
        if (intervalId !== undefined) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        process.off('SIGINT', gracefulShutdown);
        process.off('beforeExit', beforeExitHandler);
        console.log('\nWatch mode stopped.');
        resolve({ exitCode: 0 });
      };

      const beforeExitHandler = (): void => {
        if (intervalId !== undefined) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        process.off('SIGINT', gracefulShutdown);
        process.off('beforeExit', beforeExitHandler);
      };

      process.on('SIGINT', gracefulShutdown);

      void updateStatus().then(() => {
        intervalId = setInterval(() => {
          if (running) {
            void updateStatus().catch(() => {
              // Silently handle errors during watch updates
            });
          } else {
            if (intervalId !== undefined) {
              clearInterval(intervalId);
              intervalId = undefined;
            }
            process.off('SIGINT', gracefulShutdown);
            process.off('beforeExit', beforeExitHandler);
          }
        }, interval);

        // Clean up interval and listeners on beforeExit
        process.on('beforeExit', beforeExitHandler);
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
