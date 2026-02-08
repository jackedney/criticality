#!/usr/bin/env node

/**
 * Criticality Protocol CLI entry point.
 *
 * This is the main entry point for the 'crit' CLI command.
 */

/* eslint-disable no-console */
import { createCliApp } from './app.js';
import { handleStatusCommand } from './commands/status.js';
import { handleResumeCommand } from './commands/resume.js';
import { handleResolveCommand } from './commands/resolve.js';
import { handleVersionCommand } from './commands/version.js';
import { withErrorHandling } from './utils/errorHandling.js';

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
 * Handles version command with CLI context.
 */
function handleVersionCommandWithContext(): void {
  withErrorHandling(() => handleVersionCommand());
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
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0] ?? '';
  const commandArgs = args.slice(1);

  if (!command) {
    showHelp();
    process.exit(0);
  }

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
      handleVersionCommandWithContext();
      break;

    case 'status':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('status');
        process.exit(0);
      }
      handleStatusCommandWithContext(commandArgs);
      break;

    case 'resume':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('resume');
        process.exit(0);
      }
      handleResumeCommandWithContext(commandArgs);
      break;

    case 'resolve':
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        showHelpForCommand('resolve');
        process.exit(0);
      }
      handleResolveCommandWithContext(commandArgs);
      break;

    default:
      showError(`Unknown command: ${command}`);
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
  if (help !== undefined) {
    console.log(help);
  } else {
    console.error(`Unknown command: ${commandName}`);
    console.error('\nRun "crit help" to see all available commands.');
  }
}

/**
 * Handles status command with CLI context.
 */
function handleStatusCommandWithContext(statusArgs: string[]): void {
  withErrorHandling(async () => {
    const context = createCliApp();
    context.args = statusArgs;
    return await handleStatusCommand(context);
  });
}

/**
 * Handles resolve command with CLI context.
 */
function handleResolveCommandWithContext(resolveArgs: string[]): void {
  withErrorHandling(async () => {
    const context = createCliApp();
    context.args = resolveArgs;
    return await handleResolveCommand(context);
  });
}

/**
 * Handles resume command with CLI context.
 */
function handleResumeCommandWithContext(resumeArgs: string[]): void {
  withErrorHandling(async () => {
    const context = createCliApp();
    context.args = resumeArgs;
    return await handleResumeCommand(context);
  });
}

try {
  main();
} catch (error) {
  console.error('Unexpected error:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
