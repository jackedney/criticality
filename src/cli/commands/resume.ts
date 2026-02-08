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
  saveCliState,
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
import { LiveDisplay } from '../components/LiveDisplay.js';
import { createCliOperations, type OperationTelemetry } from '../operations.js';
import { TelemetryCollector } from '../telemetry.js';
import { existsSync, readFileSync } from 'node:fs';
import { parseConfig } from '../../config/index.js';
import { displayErrorWithSuggestions, inferErrorType } from '../errors.js';
import { NotificationService } from '../../notifications/service.js';
import { ReminderScheduler } from '../../notifications/reminder.js';
import { validateWebhookEndpoint } from '../../notifications/index.js';
import * as path from 'node:path';

interface ResumeDisplayOptions {
  colors: boolean;
  unicode: boolean;
}

interface ExecutionSummaryData {
  tickCount: number;
  elapsedSec: string;
  currentPhase: string;
  phasesCompleted: readonly string[];
  decisionsMade: number;
  stopReason: TickStopReason;
}

/**
 * Validates configured webhook endpoints at startup.
 *
 * Validates URL format and optionally sends test pings.
 * Displays validation results as console output but does not block startup.
 *
 * @param config - The configuration object.
 */
async function validateWebhookEndpoints(
  config: Awaited<ReturnType<(typeof import('../../config/index.js'))['parseConfig']>>
): Promise<void> {
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
 * Checks and sends reminder if protocol is blocked.
 *
 * @param snapshot - The protocol state snapshot.
 * @param cliConfig - The configuration object.
 * @param statePath - Path to state file.
 */
async function checkAndSendReminder(
  snapshot: ProtocolStateSnapshot,
  cliConfig: Awaited<ReturnType<(typeof import('../../config/index.js'))['parseConfig']>>,
  statePath: string
): Promise<void> {
  if (!cliConfig.notifications.enabled || cliConfig.notifications.reminder_schedule === undefined) {
    return;
  }

  const blockingRecord = snapshot.blockingQueries.find((q) => !q.resolved);
  if (!blockingRecord) {
    return;
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
 * Telemetry collector for per-phase tracking.
 */
let telemetryCollector: TelemetryCollector | null = null;

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
 * Formats phases completed for display.
 *
 * @param artifacts - Available artifacts.
 * @returns Array of completed phase names.
 */
function getPhasesCompleted(artifacts: readonly string[]): readonly string[] {
  const phaseArtifactMap: Record<string, readonly string[]> = {
    Ignition: ['spec'],
    Lattice: ['lattice'],
    CompositionAudit: [],
    Injection: ['types', 'implementation'],
    Mesoscopic: ['tests'],
    MassDefect: [],
  };

  const completed: string[] = [];
  for (const [phase, requiredArtifacts] of Object.entries(phaseArtifactMap)) {
    if (requiredArtifacts.length === 0) {
      continue;
    }
    const allArtifactsPresent = requiredArtifacts.every((artifact) => artifacts.includes(artifact));
    if (allArtifactsPresent) {
      completed.push(phase);
    }
  }
  return completed;
}

/**
 * Formats compact summary line.
 *
 * @param data - Summary data.
 * @param options - Display options.
 * @param blockingQueryId - Optional blocking query ID.
 * @returns Formatted summary line.
 */
function formatCompactSummary(
  data: ExecutionSummaryData,
  options: ResumeDisplayOptions,
  blockingQueryId?: string
): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const greenCode = options.colors ? '\x1b[32m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';

  const parts: string[] = [];

  parts.push(`Executed ${String(data.tickCount)} ticks in ${data.elapsedSec}s`);

  if (data.phasesCompleted.length > 0) {
    const firstPhase = data.phasesCompleted[0];
    if (firstPhase === undefined) {
      return boldCode + parts.join(' | ') + resetCode;
    }
    let phaseStr = firstPhase;
    if (data.phasesCompleted.length > 1) {
      const lastPhase = data.phasesCompleted[data.phasesCompleted.length - 1];
      if (lastPhase !== undefined) {
        phaseStr = `${phaseStr} → ${lastPhase}`;
      }
    }
    const completedStr = greenCode + 'Completed: ' + phaseStr + resetCode;
    parts.push(completedStr);
  }

  if (data.decisionsMade > 0) {
    parts.push(`${String(data.decisionsMade)} decision${data.decisionsMade === 1 ? '' : 's'} made`);
  }

  if (data.stopReason === 'BLOCKED') {
    const idStr = blockingQueryId ?? 'unknown';
    const blockedStr = yellowCode + 'Blocked: ' + idStr + resetCode;
    parts.push(blockedStr);
  } else if (data.stopReason === 'COMPLETE') {
    const finishedStr = greenCode + 'Finished' + resetCode;
    parts.push(finishedStr);
  } else if (data.stopReason === 'FAILED') {
    parts.push('Failed');
  } else if (data.stopReason === 'EXTERNAL_ERROR') {
    parts.push('Interrupted');
  }

  const summaryLine = boldCode + parts.join(' | ') + resetCode;
  return summaryLine;
}

/**
 * Displays execution summary after tick loop completion.
 *
 * @param tickCount - Number of ticks executed.
 * @param stopReason - Reason for stopping.
 * @param snapshot - Final state snapshot.
 * @param startTime - When execution started.
 * @param initialSnapshot - Initial state snapshot before execution.
 * @param options - Display options.
 */
async function displayExecutionSummary(
  tickCount: number,
  stopReason: TickStopReason,
  snapshot: ProtocolStateSnapshot,
  startTime: number,
  initialSnapshot: CliStateSnapshot,
  options: ResumeDisplayOptions
): Promise<void> {
  const elapsed = Date.now() - startTime;
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';
  const greenCode = options.colors ? '\x1b[32m' : '';
  const redCode = options.colors ? '\x1b[31m' : '';

  const phasesCompleted = getPhasesCompleted(snapshot.artifacts);
  const { substate } = snapshot.state;

  let decisionsMade = 0;
  if (initialSnapshot.resolvedQueries.length > 0) {
    const latestBlockTime =
      initialSnapshot.resolvedQueries[initialSnapshot.resolvedQueries.length - 1]?.record.blockedAt;
    if (latestBlockTime !== undefined) {
      try {
        const ledgerPath = getDefaultLedgerPath(getStatePath());
        const ledger = await loadLedger(ledgerPath);
        const allDecisions = ledger.getDecisions();
        const blockTimestamp = new Date(latestBlockTime).getTime();

        decisionsMade = allDecisions.filter((d) => {
          const decisionTimestamp = new Date(d.timestamp).getTime();
          return decisionTimestamp >= blockTimestamp;
        }).length;
      } catch {
        decisionsMade = 0;
      }
    }
  }

  const blockingQueryId = snapshot.blockingQueries.find((q) => !q.resolved)?.id;

  const summaryData: ExecutionSummaryData = {
    tickCount,
    elapsedSec,
    currentPhase: snapshot.state.phase,
    phasesCompleted,
    decisionsMade,
    stopReason,
  };

  console.log();

  if (tickCount === 0 && stopReason === 'BLOCKED') {
    console.log(`${yellowCode}Already blocked, no ticks executed${resetCode}`);
    console.log();
    console.log(
      `${boldCode}Blocking Query:${resetCode} ${substate.kind === 'Blocking' ? substate.query : 'Unknown'}`
    );
    console.log();
    console.log(`Run ${greenCode}crit resolve${resetCode} to continue.`);
    return;
  }

  console.log(formatCompactSummary(summaryData, options, blockingQueryId));
  console.log();

  if (telemetry.modelCalls > 0) {
    console.log(`${boldCode}Telemetry${resetCode}`);
    console.log(`  Model calls: ${String(telemetry.modelCalls)}`);
    console.log(`  Prompt tokens: ${String(telemetry.promptTokens)}`);
    console.log(`  Completion tokens: ${String(telemetry.completionTokens)}`);
    console.log(`  Total tokens: ${String(telemetry.promptTokens + telemetry.completionTokens)}`);
    console.log();
  }

  if (substate.kind === 'Blocking') {
    console.log(`${yellowCode}Status: Blocked${resetCode}`);
    console.log(
      `  Query: ${substate.query.substring(0, 80)}${substate.query.length > 80 ? '...' : ''}`
    );
    console.log();
    console.log(`Run ${greenCode}crit resolve${resetCode} to continue.`);
  } else if (substate.kind === 'Failed') {
    console.log(`${redCode}Status: Failed${resetCode}`);
    console.log(`  Error: ${substate.error}`);
    if (substate.recoverable) {
      console.log();
      console.log(`${yellowCode}This error is recoverable.${resetCode}`);
    }
  } else if (stopReason === 'COMPLETE') {
    console.log(`${greenCode}Status: Complete${resetCode}`);
    console.log(`  Protocol execution finished successfully.`);

    if (snapshot.artifacts.length > 0) {
      console.log();
      console.log(`${boldCode}Artifacts:${resetCode}`);
      for (const artifact of snapshot.artifacts) {
        console.log(`  - ${artifact}`);
      }
    }
  } else if (stopReason === 'EXTERNAL_ERROR') {
    console.log(`${yellowCode}Status: Interrupted${resetCode}`);
    console.log(`  Execution stopped by user (Ctrl+C).`);
    console.log(`  State saved at current position.`);
  } else {
    console.log(`Status: ${stopReason}`);
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
    const cliConfig = await loadCliConfig();

    void validateWebhookEndpoints(cliConfig);

    await checkAndSendReminder(snapshot, cliConfig, statePath);

    if (snapshot.resolvedQueries.length === 0) {
      console.error('Error: No blocked state to resume');
      return { exitCode: 1, message: 'No resolved queries to resume from' };
    }

    await displayResumeSummary(snapshot, statePath, options);

    const config = await loadCliConfig();

    telemetryCollector = new TelemetryCollector();
    const operations = await createCliOperations({
      config,
      statePath,
      onTelemetryUpdate: (newTelemetry) => {
        telemetry = newTelemetry;
      },
      telemetryCollector,
    });

    const orchestrator = await createOrchestrator({
      statePath,
      operations,
    });

    const liveDisplay = new LiveDisplay({
      colors: options.colors,
      unicode: options.unicode,
      maxLogEntries: 5,
    });

    liveDisplay.updatePhase(
      orchestrator.state.snapshot.state.phase,
      orchestrator.state.snapshot.state.substate
    );
    liveDisplay.start();

    // Set up SIGINT handler for graceful shutdown
    const sigintHandler = (): void => {
      if (gracefulShutdown) {
        // Second Ctrl+C: force exit with state save attempt
        console.log('\nForce quitting after current operation...');
        liveDisplay.stop();

        void (async (): Promise<void> => {
          try {
            const currentState = await loadCliStateWithRecovery(statePath);
            const telemetryData =
              telemetryCollector !== null ? telemetryCollector.getTelemetryData() : undefined;
            const updatedState: CliStateSnapshot =
              telemetryData !== undefined
                ? { ...currentState, telemetry: telemetryData }
                : currentState;
            await saveCliState(updatedState, statePath);
            console.log('State saved before force quit.');
          } catch (error) {
            console.warn(
              `Warning: State save interrupted. State may be inconsistent: ${error instanceof Error ? error.message : String(error)}`
            );
          } finally {
            process.exit(1);
          }
        })();
        return;
      }

      gracefulShutdown = true;
      liveDisplay.stop();
      console.log('Stopping after current operation... (Ctrl+C again to force quit)');
    };

    process.on('SIGINT', sigintHandler);

    // Execute tick loop
    let result: TickResult = await orchestrator.tick();
    let tickCount = 0;
    let shouldContinueLoop = true;

    do {
      tickCount++;

      // Update display with new phase/substate
      liveDisplay.updatePhase(result.snapshot.state.phase, result.snapshot.state.substate);

      // Add log entries for significant events
      if (result.transitioned) {
        const fromPhase = orchestrator.state.snapshot.state.phase;
        const toPhase = result.snapshot.state.phase;
        if (fromPhase !== toPhase) {
          liveDisplay.addLog(`Transitioned: ${fromPhase} → ${toPhase}`);
        }
      }

      // Check for graceful shutdown after processing tick
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (gracefulShutdown) {
        // Stop after current tick
        shouldContinueLoop = false;
        liveDisplay.stop();
        console.log('Interrupted by user');
        console.log();

        await displayExecutionSummary(
          tickCount,
          'EXTERNAL_ERROR',
          orchestrator.state.snapshot,
          startTime,
          snapshot,
          options
        );
        console.log();

        // Save telemetry to state file
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (telemetryCollector !== null) {
          const telemetryData = telemetryCollector.getTelemetryData();
          try {
            const currentState = await loadCliStateWithRecovery(statePath);
            const updatedState: CliStateSnapshot = {
              ...currentState,
              telemetry: telemetryData,
            };
            await saveCliState(updatedState, statePath);
          } catch {
            // If state save fails, telemetry update won't persist
            // but this shouldn't block the interrupt
          }
        }

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
    liveDisplay.stop();

    // Save telemetry to state file after normal completion
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (telemetryCollector !== null) {
      const telemetryData = telemetryCollector.getTelemetryData();
      try {
        const currentState = await loadCliStateWithRecovery(statePath);
        const updatedState: CliStateSnapshot = {
          ...currentState,
          telemetry: telemetryData,
        };
        await saveCliState(updatedState, statePath);
      } catch {
        // If state save fails, telemetry update won't persist
      }
    }

    // Display execution summary
    await displayExecutionSummary(
      tickCount,
      result.stopReason ?? 'EXTERNAL_ERROR',
      result.snapshot,
      startTime,
      snapshot,
      options
    );

    // Handle error states
    if (result.stopReason === 'FAILED' && result.error !== undefined) {
      const errorType = inferErrorType(result.error);
      displayErrorWithSuggestions(
        result.error,
        {
          errorType,
          phase: snapshot.state.phase,
          details: {
            recoverable: true,
          },
        },
        options
      );
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
