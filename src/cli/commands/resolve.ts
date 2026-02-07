/**
 * Resolve command handler for the Criticality Protocol CLI.
 *
 * Displays blocking queries with full text and available options,
 * allowing users to see and respond to blocking queries.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { loadState, StatePersistenceError, saveState } from '../../protocol/persistence.js';
import type { ProtocolStateSnapshot } from '../../protocol/persistence.js';
import type { BlockingRecord } from '../../protocol/blocking.js';
import { resolveBlocking } from '../../protocol/blocking.js';
import { Ledger } from '../../ledger/index.js';

const DEFAULT_STATE_PATH = '.criticality-state.json';

interface ResolveDisplayOptions {
  colors: boolean;
  unicode: boolean;
}

/**
 * Interface for reading user input.
 * Abstracted for testability.
 */
interface InputReader {
  /** Read a line of input. */
  readLine(prompt: string): Promise<string>;
  /** Close the reader. */
  close(): void;
}

/**
 * Creates a readline-based input reader.
 *
 * @returns A Promise resolving to an InputReader using Node's readline.
 */
async function createInputReader(): Promise<InputReader> {
  // Use dynamic import to avoid issues in test environments
  const readline = await import('node:readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    readLine(prompt: string): Promise<string> {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer);
        });
      });
    },
    close(): void {
      rl.close();
    },
  };
}

/**
 * Gets the state file path.
 *
 * @returns The state file path.
 */
function getStatePath(): string {
  return DEFAULT_STATE_PATH;
}

/**
 * Creates a box-drawing border using ASCII or Unicode characters.
 *
 * @param options - Display options.
 * @returns Border characters object.
 */
function getBorderChars(options: ResolveDisplayOptions): Record<string, string> {
  if (options.unicode) {
    return {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│',
    };
  }
  return {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
  };
}

/**
 * Wraps text in a box-drawing border.
 *
 * @param text - The text to wrap.
 * @param options - Display options.
 * @returns The boxed text.
 */
function wrapInBox(text: string, options: ResolveDisplayOptions): string {
  const border = getBorderChars(options);
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map((line) => line.length));
  const horizontalChar = border.horizontal ?? '-';
  const horizontalBorder = horizontalChar.repeat(maxLength + 2);

  let result = (border.topLeft ?? '+') + horizontalBorder + (border.topRight ?? '+') + '\n';
  for (const line of lines) {
    const paddedLine = line.padEnd(maxLength);
    result += (border.vertical ?? '|') + ' ' + paddedLine + ' ' + (border.vertical ?? '|') + '\n';
  }
  result += (border.bottomLeft ?? '+') + horizontalBorder + (border.bottomRight ?? '+');

  return result;
}

/**
 * Formats a blocking query with options for display.
 *
 * @param query - The blocking query to format.
 * @param options - Display options.
 * @returns The formatted query text.
 */
function formatQueryWithOptions(query: BlockingRecord, options: ResolveDisplayOptions): string {
  const boldCode = options.colors ? '\x1b[1m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const yellowCode = options.colors ? '\x1b[33m' : '';

  let result = '';

  result += `${boldCode}Query ID:${resetCode} ${query.id}\n`;
  result += `${boldCode}Phase:${resetCode} ${query.phase}\n`;
  result += '\n';
  result += `${boldCode}Question:${resetCode}\n`;
  result += query.query;
  result += '\n';

  if (query.options && query.options.length > 0) {
    result += '\n';
    result += `${boldCode}Options:${resetCode}\n`;

    for (let i = 0; i < query.options.length; i++) {
      const option = query.options[i];
      if (option !== undefined) {
        const number = String(i + 1);
        const letter = String.fromCharCode(97 + i);
        result += `  ${yellowCode}${number}.${resetCode} ${letter}) ${option}\n`;
      }
    }
  }

  return result;
}

/**
 * Renders blocking queries to console.
 *
 * @param snapshot - The protocol state snapshot.
 * @param options - Display options.
 */
function renderQueries(snapshot: ProtocolStateSnapshot, options: ResolveDisplayOptions): void {
  const pendingQueries = snapshot.blockingQueries.filter((q) => !q.resolved);

  if (pendingQueries.length === 0) {
    console.log('No queries pending. Protocol is not blocked.');
    return;
  }

  const dimCode = options.colors ? '\x1b[2m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';
  const boldCode = options.colors ? '\x1b[1m' : '';

  const queryCount = pendingQueries.length !== 1 ? 'ies' : '';
  console.log(`${boldCode}${String(pendingQueries.length)} Pending Query${queryCount}${resetCode}`);
  console.log();

  for (const query of pendingQueries) {
    const queryText = formatQueryWithOptions(query, options);
    console.log(wrapInBox(queryText, options));
    console.log();

    if (query.timeoutMs) {
      const blockedTime = new Date(query.blockedAt);
      const timeoutDate = new Date(blockedTime.getTime() + query.timeoutMs);
      const now = new Date();
      const remainingMs = timeoutDate.getTime() - now.getTime();

      if (remainingMs > 0) {
        const minutes = Math.floor(remainingMs / 60000);
        const seconds = Math.floor((remainingMs % 60000) / 1000);
        console.log(
          `${dimCode}Timeout: ${String(minutes)}m ${String(seconds)}s remaining${resetCode}`
        );
      } else {
        console.log(`${dimCode}Timeout: Exceeded${resetCode}`);
      }
    }

    console.log();
    console.log(`${dimCode}Use arrow keys or type option number to select${resetCode}`);
  }
}

/**
 * Prompts user to select an option for a blocking query.
 *
 * @param query - The blocking query to select an option for.
 * @param reader - Input reader for getting user input.
 * @param options - Display options.
 * @returns The selected option, or undefined if user cancelled.
 */
async function promptForSelection(
  query: BlockingRecord,
  reader: InputReader,
  options: ResolveDisplayOptions
): Promise<string | undefined> {
  const yellowCode = options.colors ? '\x1b[33m' : '';
  const resetCode = options.colors ? '\x1b[0m' : '';

  if (!query.options || query.options.length === 0) {
    console.error('No options available for this query.');
    return undefined;
  }

  const optionCount = query.options.length;

  for (;;) {
    const input = await reader.readLine(`Select option (1-${String(optionCount)}): `);
    const trimmedInput = input.trim();

    if (trimmedInput === '') {
      console.log('Please enter an option number.');
      continue;
    }

    const selection = parseInt(trimmedInput, 10);

    if (isNaN(selection)) {
      console.log('Please enter a valid number.');
      continue;
    }

    if (selection < 1 || selection > optionCount) {
      console.log(`Invalid option. Please enter 1-${String(optionCount)}.`);
      continue;
    }

    const selectedIndex = selection - 1;
    const selectedOption = query.options[selectedIndex];

    if (selectedOption === undefined) {
      console.log(`Invalid option. Please enter 1-${String(optionCount)}.`);
      continue;
    }

    console.log(`You selected: ${yellowCode}${selectedOption}${resetCode}. Confirm? (y/n)`);

    const confirmationInput = await reader.readLine('> ');
    const confirmation = confirmationInput.trim().toLowerCase();

    if (confirmation === 'y' || confirmation === 'yes') {
      return selectedOption;
    } else if (confirmation === 'n' || confirmation === 'no') {
      console.log('Selection cancelled. Please try again.');
      continue;
    } else {
      console.log('Please enter y or n.');
      continue;
    }
  }
}

/**
 * Handles the resolve command.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to the command result.
 */
export async function handleResolveCommand(context: CliContext): Promise<CliCommandResult> {
  const options: ResolveDisplayOptions = {
    colors: context.config.colors ?? true,
    unicode: context.config.unicode ?? true,
  };

  const statePath = getStatePath();

  try {
    const snapshot = await loadState(statePath);
    const pendingQueries = snapshot.blockingQueries.filter((q) => !q.resolved);

    if (pendingQueries.length === 0) {
      console.log('No queries pending. Protocol is not blocked.');
      return { exitCode: 0 };
    }

    renderQueries(snapshot, options);

    const reader = await createInputReader();

    try {
      for (const query of pendingQueries) {
        const selectedOption = await promptForSelection(query, reader, options);

        if (selectedOption === undefined) {
          console.log('Selection cancelled.');
          return { exitCode: 0 };
        }

        const ledger = new Ledger({ project: 'cli-resolution' });

        const resolveResult = resolveBlocking(
          snapshot.state,
          query,
          {
            response: selectedOption,
            allowCustomResponse: false,
          },
          ledger
        );

        if (!resolveResult.success) {
          console.error(`Error resolving query: ${resolveResult.error.message}`);
          return { exitCode: 1, message: resolveResult.error.message };
        }

        const updatedQueries = snapshot.blockingQueries.map((q) =>
          q.id === query.id ? resolveResult.record : q
        );

        const updatedSnapshot: ProtocolStateSnapshot = {
          state: resolveResult.state,
          artifacts: snapshot.artifacts,
          blockingQueries: updatedQueries,
        };

        await saveState(updatedSnapshot, statePath);

        console.log(`Query "${query.id}" resolved successfully.`);

        const remainingQueries = updatedQueries.filter((q) => !q.resolved);
        if (remainingQueries.length > 0) {
          console.log();
          console.log(
            `${String(remainingQueries.length)} more quer${remainingQueries.length === 1 ? 'y' : 'ies'} pending.`
          );
          console.log();
        } else {
          console.log('All queries resolved. Protocol is no longer blocked.');
        }
      }

      return { exitCode: 0 };
    } finally {
      reader.close();
    }
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
