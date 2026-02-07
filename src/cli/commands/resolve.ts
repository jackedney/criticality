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
  /** Read a single key press for interactive selection. */
  readKey(): Promise<string>;
  /** Set raw mode for key-by-key input. */
  setRawMode(enable: boolean): void;
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
    readKey(): Promise<string> {
      return new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.setRawMode(true);

        const onData = (buffer: Buffer): void => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);

          const key = buffer.toString('utf-8');
          resolve(key);
        };

        process.stdin.on('data', onData);
      });
    },
    setRawMode(enable: boolean): void {
      if (process.stdin.isRaw !== enable) {
        process.stdin.setRawMode(enable);
        if (enable) {
          process.stdin.resume();
        } else {
          process.stdin.pause();
        }
      }
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
    console.log(
      `${dimCode}Use arrow keys to navigate, Enter to select, or type a number${resetCode}`
    );
  }
}

/**
 * Formats options with highlighted selection.
 *
 * @param options - The options to format.
 * @param selectedIndex - The index of currently selected option.
 * @param colors - Whether to use colors.
 * @returns The formatted options text.
 */
function formatOptionsWithSelection(
  options: readonly string[],
  selectedIndex: number,
  colors: boolean
): string[] {
  const result: string[] = [];
  const inverseCode = colors ? '\x1b[7m' : '';
  const resetCode = colors ? '\x1b[0m' : '';
  const yellowCode = colors ? '\x1b[33m' : '';

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (option === undefined) {
      continue;
    }

    const number = String(i + 1);
    const letter = String.fromCharCode(97 + i);
    const isSelected = i === selectedIndex;

    if (isSelected) {
      result.push(
        `${inverseCode}> ${yellowCode}${number}.${resetCode} ${inverseCode}${letter}) ${option}${resetCode}`
      );
    } else {
      result.push(`  ${yellowCode}${number}.${resetCode} ${letter}) ${option}`);
    }
  }

  return result;
}

/**
 * Clears current line and moves cursor up.
 *
 * @param lines - Number of lines to clear.
 */
function clearLines(lines: number): void {
  for (let i = 0; i < lines; i++) {
    process.stdout.write('\x1b[1A\x1b[2K');
  }
}

/**
 * Prompts user to select an option using interactive arrow-key navigation.
 *
 * @param query - The blocking query to select an option for.
 * @param displayOptions - Display options.
 * @returns The selected option, or undefined if user cancelled.
 */
async function promptForSelectionWithArrows(
  query: BlockingRecord,
  displayOptions: ResolveDisplayOptions
): Promise<string | undefined> {
  if (!query.options || query.options.length === 0) {
    console.error('No options available for this query.');
    return undefined;
  }

  const optionList = query.options as string[];
  let selectedIndex = 0;
  let numericInput = '';
  let lastRenderedOptions = formatOptionsWithSelection(
    optionList,
    selectedIndex,
    displayOptions.colors
  );
  let renderedLineCount = lastRenderedOptions.length;

  const dimCode = displayOptions.colors ? '\x1b[2m' : '';
  const resetCode = displayOptions.colors ? '\x1b[0m' : '';

  const reader = await createInputReader();

  try {
    for (;;) {
      if (numericInput === '') {
        process.stdout.write('\n');
        for (const line of lastRenderedOptions) {
          process.stdout.write(line + '\n');
        }
        process.stdout.write(
          `\n${dimCode}> Selected: ${optionList[selectedIndex] ?? ''}${resetCode}\n`
        );
        process.stdout.write(
          `${dimCode}Use arrow keys to navigate, Enter to select, or type a number${resetCode}\n`
        );

        renderedLineCount = lastRenderedOptions.length + 3;
      }

      const key = await reader.readKey();

      if (key === '\x0d' || key === '\n') {
        if (numericInput !== '') {
          const selection = parseInt(numericInput, 10);
          if (!isNaN(selection) && selection >= 1 && selection <= optionList.length) {
            const selectedOption = optionList[selection - 1];
            if (selectedOption !== undefined) {
              const yellowCode = displayOptions.colors ? '\x1b[33m' : '';
              const confirmReset = displayOptions.colors ? '\x1b[0m' : '';
              console.log(
                `You selected: ${yellowCode}${selectedOption}${confirmReset}. Confirm? (y/n)`
              );

              const confirmReader = await createInputReader();
              try {
                const confirmation = await confirmReader.readLine('> ');
                const confirmationLower = confirmation.trim().toLowerCase();

                if (confirmationLower === 'y' || confirmationLower === 'yes') {
                  confirmReader.close();
                  return selectedOption;
                } else if (confirmationLower === 'n' || confirmationLower === 'no') {
                  console.log('Selection cancelled.');
                  numericInput = '';
                  clearLines(renderedLineCount);
                  continue;
                } else {
                  console.log('Please enter y or n.');
                  numericInput = '';
                  clearLines(renderedLineCount);
                  continue;
                }
              } finally {
                confirmReader.close();
              }
            }
          } else {
            console.log(`Invalid option. Please enter 1-${String(optionList.length)}.`);
            numericInput = '';
            clearLines(renderedLineCount);
            continue;
          }
        } else {
          const selectedOption = optionList[selectedIndex];
          if (selectedOption !== undefined) {
            const yellowCode = displayOptions.colors ? '\x1b[33m' : '';
            const confirmReset = displayOptions.colors ? '\x1b[0m' : '';
            console.log(
              `You selected: ${yellowCode}${selectedOption}${confirmReset}. Confirm? (y/n)`
            );

            const confirmReader = await createInputReader();
            try {
              const confirmation = await confirmReader.readLine('> ');
              const confirmationLower = confirmation.trim().toLowerCase();

              if (confirmationLower === 'y' || confirmationLower === 'yes') {
                confirmReader.close();
                return selectedOption;
              } else if (confirmationLower === 'n' || confirmationLower === 'no') {
                console.log('Selection cancelled.');
                clearLines(renderedLineCount);
                continue;
              } else {
                console.log('Please enter y or n.');
                clearLines(renderedLineCount);
                continue;
              }
            } finally {
              confirmReader.close();
            }
          } else {
            console.log('Please select an option using arrow keys or type a number.');
            continue;
          }
        }
      } else if (key === '\x1b[A' || key === '\x1b[B' || key === 'k' || key === 'j') {
        if (key === '\x1b[A' || key === 'k') {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : optionList.length - 1;
        } else {
          selectedIndex = selectedIndex < optionList.length - 1 ? selectedIndex + 1 : 0;
        }

        clearLines(renderedLineCount);
        lastRenderedOptions = formatOptionsWithSelection(
          optionList,
          selectedIndex,
          displayOptions.colors
        );
        renderedLineCount = lastRenderedOptions.length + 3;
      } else if (key === '\x03') {
        console.log('\nSelection cancelled.');
        return undefined;
      } else if (/^[1-9]$/.test(key)) {
        if (numericInput.length < 3) {
          numericInput += key;

          const displayValue = numericInput;
          clearLines(renderedLineCount);
          process.stdout.write(`\nSelection: ${displayValue}\n`);
          process.stdout.write(
            `${dimCode}Press Enter to confirm ${displayValue}, Esc to cancel${resetCode}\n`
          );
        }
      } else if (key === '\x1b' || key === '\x1b\x1b') {
        if (numericInput !== '') {
          numericInput = '';
          clearLines(renderedLineCount);
        }
      } else if (key === '\x7f' || key === '\x08') {
        if (numericInput.length > 0) {
          numericInput = numericInput.slice(0, -1);
          clearLines(renderedLineCount);
          process.stdout.write(`\nSelection: ${numericInput || '_'}\n`);
          process.stdout.write(
            `${dimCode}Press Enter to confirm ${numericInput || 'selection'}, Esc to cancel${resetCode}\n`
          );
        }
      }
    }
  } finally {
    reader.close();
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
        const selectedOption = await promptForSelectionWithArrows(query, options);

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
