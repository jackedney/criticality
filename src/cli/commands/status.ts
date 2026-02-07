/**
 * Status command handler for the Criticality Protocol CLI.
 *
 * Displays the current protocol state including phase, substate type,
 * blocking queries, and available artifacts using OpenTUI Box components.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { loadState, StatePersistenceError } from '../../protocol/persistence.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';
import type { ProtocolSubstate, BlockingSubstate } from '../../protocol/types.js';
import { isActiveSubstate, isBlockingSubstate, isFailedSubstate } from '../../protocol/types.js';
import type { BlockingRecord } from '../../protocol/blocking.js';

const DEFAULT_STATE_PATH = '.criticality-state.json';

interface StatusDisplayOptions {
  colors: boolean;
  unicode: boolean;
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
 * Renders status display to console.
 *
 * @param snapshot - The protocol state snapshot.
 * @param options - Display options.
 */
function renderStatus(snapshot: ProtocolStateSnapshot, options: StatusDisplayOptions): void {
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
}

/**
 * Handles the status command.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to the command result.
 */
export async function handleStatusCommand(context: CliContext): Promise<CliCommandResult> {
  const options: StatusDisplayOptions = {
    colors: context.config.colors ?? true,
    unicode: context.config.unicode ?? true,
  };

  const statePath = getStatePath();

  try {
    const snapshot = await loadState(statePath);
    renderStatus(snapshot, options);

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
