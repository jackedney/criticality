/**
 * Resolve command handler for the Criticality Protocol CLI.
 *
 * Displays blocking queries with full text and available options,
 * allowing users to see and respond to blocking queries.
 */

import type { CliContext, CliCommandResult } from '../types.js';
import { StatePersistenceError } from '../../protocol/persistence.js';
import type { BlockingRecord } from '../../protocol/blocking.js';
import { resolveBlocking } from '../../protocol/blocking.js';
import { Ledger } from '../../ledger/index.js';
import {
  loadCliStateWithRecovery,
  saveCliState,
  updateStateAfterResolution,
  getDefaultStatePath,
  type CliStateSnapshot,
} from '../state.js';
import { wrapInBox } from '../utils/displayUtils.js';
import readline from 'node:readline';

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
 * @returns An InputReader using Node's readline.
 */
function createInputReader(): InputReader {
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
        if (!process.stdin.isTTY) {
          // Non-TTY environment (piped/CI): fall back to readline
          rl.question('', (answer) => {
            resolve(answer.charAt(0) || '\n');
          });
          return;
        }

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
      if (!process.stdin.isTTY) {
        // Non-TTY environment: setRawMode is not available
        return;
      }
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
  return getDefaultStatePath();
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
 * @param snapshot - The CLI state snapshot.
 * @param options - Display options.
 */
function renderQueries(snapshot: CliStateSnapshot, options: ResolveDisplayOptions): void {
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
 * Checks if an option indicates a clarification request.
 *
 * @param optionText - The option text to check.
 * @returns True if the option is a clarification request.
 */
function isClarificationOption(optionText: string): boolean {
  const clarifyPatterns = [
    'i need to explain more',
    'explain more',
    'i need to clarify',
    'clarify',
    'provide more detail',
    'need to provide more information',
    'need to explain further',
    'i want to add more context',
  ];

  const lowerText = optionText.toLowerCase().trim();
  return clarifyPatterns.some((pattern) => lowerText === pattern || lowerText.includes(pattern));
}

/**
 * Reads multi-line input from the user.
 *
 * @param prompt - The prompt to display.
 * @param hint - Hint text for completing input.
 * @returns A promise resolving to the multi-line text, or undefined if cancelled.
 */
function readMultiLineInput(prompt: string, hint: string): Promise<string | undefined> {
  return import('node:readline').then((readlineModule) => {
    console.log(prompt);
    console.log(hint);

    const lines: string[] = [];

    return new Promise<string | undefined>((resolve) => {
      const lineReader = readlineModule.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      let lineCount = 0;

      const onLine = (line: string): void => {
        if (line === '<<<DONE') {
          lineReader.close();
          const fullText = lines.join('\n').trim();
          if (fullText.length === 0) {
            console.log();
            resolve(undefined);
          } else {
            console.log();
            resolve(fullText);
          }
        } else {
          lines.push(line);
          lineCount++;
          const lineNum = String(lineCount + 1);
          process.stdout.write(`${lineNum}> `);
        }
      };

      const onSigint = (): void => {
        lineReader.close();
        console.log('\nInput cancelled.');
        resolve(undefined);
      };

      const onReaderClose = (): void => {
        if (lines.length === 0) {
          resolve(undefined);
        }
      };

      lineReader.on('line', onLine);
      lineReader.on('SIGINT', onSigint);
      lineReader.on('close', onReaderClose);

      process.stdout.write('1> ');
    });
  });
}

/**
 * Prompts user to select an option using interactive arrow-key navigation.
 *
 * @param query - The blocking query to select an option for.
 * @param displayOptions - Display options.
 * @returns The selected option and optional rationale, or undefined if user cancelled.
 */
async function promptForSelectionWithArrows(
  query: BlockingRecord,
  displayOptions: ResolveDisplayOptions
): Promise<{ option: string; rationale?: string } | undefined> {
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

  const reader = createInputReader();

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

              const confirmReader = createInputReader();
              try {
                const confirmation = await confirmReader.readLine('> ');
                const confirmationLower = confirmation.trim().toLowerCase();

                if (confirmationLower === 'y' || confirmationLower === 'yes') {
                  const needsClarification = isClarificationOption(selectedOption);
                  if (needsClarification) {
                    const rationale = await promptForClarification(displayOptions);
                    if (rationale === undefined) {
                      console.log('Selection cancelled.');
                      numericInput = '';
                      clearLines(renderedLineCount);
                      continue;
                    }
                    return { option: selectedOption, rationale };
                  }
                  return { option: selectedOption };
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

            const confirmReader = createInputReader();
            try {
              const confirmation = await confirmReader.readLine('> ');
              const confirmationLower = confirmation.trim().toLowerCase();

              if (confirmationLower === 'y' || confirmationLower === 'yes') {
                const needsClarification = isClarificationOption(selectedOption);
                if (needsClarification) {
                  const rationale = await promptForClarification(displayOptions);
                  if (rationale === undefined) {
                    console.log('Selection cancelled.');
                    clearLines(renderedLineCount);
                    continue;
                  }
                  return { option: selectedOption, rationale };
                }
                return { option: selectedOption };
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
 * Prompts user for clarification text.
 *
 * @param displayOptions - Display options.
 * @returns The clarification text, or undefined if cancelled.
 */
async function promptForClarification(
  displayOptions: ResolveDisplayOptions
): Promise<string | undefined> {
  const yellowCode = displayOptions.colors ? '\x1b[33m' : '';
  const resetCode = displayOptions.colors ? '\x1b[0m' : '';
  const boldCode = displayOptions.colors ? '\x1b[1m' : '';

  for (;;) {
    const clarification = await readMultiLineInput(
      `${boldCode}Please provide your explanation:${resetCode}`,
      `${yellowCode}Type your explanation, then enter <<<DONE on its own line to finish${resetCode}`
    );

    if (clarification === undefined) {
      return undefined;
    }

    if (clarification.trim().length === 0) {
      console.log('Please provide an explanation.');
      console.log();
      continue;
    }

    console.log(`You entered: ${clarification}`);
    const confirmReader = createInputReader();
    try {
      const confirmation = await confirmReader.readLine('Confirm this explanation? (y/n) > ');
      const confirmationLower = confirmation.trim().toLowerCase();

      if (confirmationLower === 'y' || confirmationLower === 'yes') {
        return clarification;
      } else if (confirmationLower === 'n' || confirmationLower === 'no') {
        console.log('Explanation rejected. Please try again.');
        console.log();
        continue;
      } else {
        console.log('Please enter y or n.');
        console.log();
        continue;
      }
    } finally {
      confirmReader.close();
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
    colors: context.config.colors,
    unicode: context.config.unicode,
  };

  const statePath = getStatePath();

  try {
    let snapshot = await loadCliStateWithRecovery(statePath);
    const pendingQueries = snapshot.blockingQueries.filter((q) => !q.resolved);

    if (pendingQueries.length === 0) {
      console.log('No queries pending. Protocol is not blocked.');
      return { exitCode: 0 };
    }

    renderQueries(snapshot, options);

    const reader = createInputReader();

    try {
      for (const query of pendingQueries) {
        const selection = await promptForSelectionWithArrows(query, options);

        if (selection === undefined) {
          console.log('Selection cancelled.');
          return { exitCode: 0 };
        }

        const ledger = new Ledger({ project: 'cli-resolution' });

        const resolveOptions = {
          response: selection.option,
          allowCustomResponse: false,
        } as const;

        const resolveOptionsWithRationale =
          selection.rationale !== undefined
            ? { ...resolveOptions, rationale: selection.rationale }
            : resolveOptions;

        const resolveResult = resolveBlocking(
          snapshot.state,
          query,
          resolveOptionsWithRationale,
          ledger
        );

        if (!resolveResult.success) {
          console.error(`Error resolving query: ${resolveResult.error.message}`);
          return { exitCode: 1, message: resolveResult.error.message };
        }

        const updatedSnapshot = updateStateAfterResolution(
          snapshot,
          query.id,
          resolveResult.record,
          resolveResult.state
        );

        await saveCliState(updatedSnapshot, statePath);

        snapshot = updatedSnapshot;

        console.log(`Query "${query.id}" resolved successfully.`);

        const remainingQueries = updatedSnapshot.blockingQueries.filter((q) => !q.resolved);
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
