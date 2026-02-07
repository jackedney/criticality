#!/usr/bin/env node

/**
 * Criticality Protocol CLI entry point.
 *
 * This is the main entry point for the 'crit' CLI command.
 */

/* eslint-disable no-console */
import { createCliApp } from './app.js';
import { handleStatusCommand } from './commands/status.js';
import { handleResolveCommand } from './commands/resolve.js';

/**
 * Displays usage information.
 */
function showHelp(): void {
  const version = process.env.npm_package_version ?? '0.1.0';
  const helpText = `
Criticality Protocol CLI v${version}

USAGE:
  crit <command> [options]

COMMANDS:
  status      Show the current protocol state
  resume      Resume protocol execution from blocked state
  resolve     Resolve pending blocking queries
  help        Show this help message
  version     Show version information

OPTIONS:
  --help, -h     Show help for a command
  --version, -v  Show version information

EXAMPLES:
  crit status            Show protocol status
  crit status --watch    Auto-refresh status
  crit resolve           Resolve pending queries
  crit resume            Resume from blocked state

For more information, visit: https://github.com/anomalyco/criticality
`;
  console.log(helpText);
}

/**
 * Displays version information.
 */
function showVersion(): void {
  const version = process.env.npm_package_version ?? '0.1.0';
  console.log(`criticality v${version}`);
}

/**
 * Shows error message with help.
 *
 * @param message - The error message to display.
 */
function showError(message: string): void {
  console.error(`Error: ${message}`);
  console.error('\nRun "crit help" for usage information.');
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const [command, ...commandArgs] = args;

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      if (commandArgs.length > 0 && commandArgs[0] !== undefined) {
        showHelpForCommand(commandArgs[0]);
      } else {
        showHelp();
      }
      process.exit(0);
      break;

    case 'version':
    case '--version':
    case '-v':
      showVersion();
      process.exit(0);
      break;

    case 'status':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('status');
        process.exit(0);
      }
      await handleStatusCommandWithContext(commandArgs);
      break;

    case 'resume':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('resume');
        process.exit(0);
      }
      handleCommand(command);
      break;

    case 'resolve':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('resolve');
        process.exit(0);
      }
      await handleResolveCommandWithContext(commandArgs);
      break;

    default:
      showError(`Unknown command: ${String(command)}`);
      process.exit(1);
  }
}

/**
 * Shows help for a specific command.
 *
 * @param commandName - The command name to show help for.
 */
function showHelpForCommand(commandName: string): void {
  const commandHelp: Record<string, string> = {
    /* eslint-disable security/detect-object-injection -- commandName is validated via switch statement */
    status: `
USAGE: crit status [options]

Shows the current protocol state including phase, blocking reasons,
pending queries, and recent decisions.

OPTIONS:
  --watch, -w        Enable auto-refresh mode
  --interval <ms>    Set refresh interval in milliseconds (default: 2000)

EXAMPLES:
  crit status
  crit status --watch
  crit status --watch --interval 5000
`,
    resume: `
USAGE: crit resume

Resumes protocol execution from a blocked state after resolving
pending queries.

EXAMPLES:
  crit resume
`,
    resolve: `
USAGE: crit resolve

Resolves pending blocking queries by presenting them interactively
and allowing selection of options.

EXAMPLES:
  crit resolve
`,
  };

  const help = commandHelp[commandName];
  if (help) {
    console.log(help);
  } else {
    console.error(`Unknown command: ${commandName}`);
    console.error('\nRun "crit help" to see all available commands.');
  }
}

/**
 * Handles status command with CLI context.
 */
async function handleStatusCommandWithContext(statusArgs: string[]): Promise<void> {
  try {
    const context = createCliApp();
    context.args = statusArgs;
    const result = await handleStatusCommand(context);
    process.exit(result.exitCode);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    process.exit(1);
  }
}

/**
 * Handles resolve command with CLI context.
 */
async function handleResolveCommandWithContext(resolveArgs: string[]): Promise<void> {
  try {
    const context = createCliApp();
    context.args = resolveArgs;
    const result = await handleResolveCommand(context);
    process.exit(result.exitCode);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    process.exit(1);
  }
}

/**
 * Handles CLI commands.
 *
 * @param command - The command to handle.
 */
function handleCommand(command: string): void {
  try {
    createCliApp();

    console.log(`The ${command} command is not yet implemented.`);
    console.log('\nThis is a placeholder for future development.');
    console.log('OpenTUI TUI support will be added in future iterations.');
    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    process.exit(1);
  }
}

try {
  await main();
} catch {
  console.error('Unexpected error: An unknown error occurred');
  process.exit(1);
}
