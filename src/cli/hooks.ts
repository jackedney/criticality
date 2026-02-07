/**
 * Notification hook execution module.
 *
 * Executes shell commands configured as notification hooks for
 * various protocol events (block, complete, error, phase change).
 *
 * @packageDocumentation
 */

import { execa } from 'execa';
import type { NotificationHook, NotificationHooks } from '../config/types.js';
import type { ProtocolPhase } from '../protocol/types.js';

/**
 * Variables available for template substitution in hook commands.
 */
export interface HookVariables {
  /** Protocol phase name. */
  phase?: ProtocolPhase;
  /** Error message if triggered by error. */
  error?: string;
  /** Timestamp of hook execution. */
  timestamp?: string;
}

/**
 * Substitutes template variables in hook command.
 *
 * @param command - Command with placeholders like {phase}, {error}, {timestamp}.
 * @param variables - Variables to substitute.
 * @returns Command with variables replaced.
 */
function substituteVariables(command: string, variables: HookVariables): string {
  let result = command;

  if (variables.phase !== undefined) {
    result = result.replace(/\{phase\}/g, variables.phase);
  }

  if (variables.error !== undefined) {
    result = result.replace(/\{error\}/g, variables.error);
  }

  if (variables.timestamp !== undefined) {
    result = result.replace(/\{timestamp\}/g, variables.timestamp);
  }

  return result;
}

/**
 * Executes a single notification hook.
 *
 * @param hook - The hook configuration.
 * @param variables - Variables for template substitution.
 * @param cwd - Working directory for command execution.
 * @returns Whether the hook executed successfully.
 */
async function executeHook(
  hook: NotificationHook,
  variables: HookVariables,
  cwd: string
): Promise<boolean> {
  if (!hook.enabled) {
    return false;
  }

  try {
    const command = substituteVariables(hook.command, variables);

    await execa('sh', ['-c', command], {
      cwd,
      reject: false,
      timeout: 5000,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Hooks module for executing notification hooks.
 */
export class NotificationHooksExecutor {
  private readonly hooks: NotificationHooks;
  private readonly cwd: string;

  /**
   * Creates a new NotificationHooksExecutor.
   *
   * @param hooks - Notification hooks configuration.
   * @param cwd - Working directory for command execution. Default: process.cwd().
   */
  constructor(hooks: NotificationHooks, cwd?: string) {
    this.hooks = hooks;
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Executes on_block hook when protocol enters blocking state.
   *
   * @param query - The blocking query.
   * @returns Whether the hook executed.
   */
  async onBlock(query: string): Promise<boolean> {
    if (this.hooks.on_block === undefined) {
      return false;
    }

    const variables: HookVariables = {
      error: query,
      timestamp: new Date().toISOString(),
    };

    return executeHook(this.hooks.on_block, variables, this.cwd);
  }

  /**
   * Executes on_complete hook when protocol completes successfully.
   *
   * @param phase - The final phase.
   * @returns Whether the hook executed.
   */
  async onComplete(phase: ProtocolPhase): Promise<boolean> {
    if (this.hooks.on_complete === undefined) {
      return false;
    }

    const variables: HookVariables = {
      phase,
      timestamp: new Date().toISOString(),
    };

    return executeHook(this.hooks.on_complete, variables, this.cwd);
  }

  /**
   * Executes on_error hook when an error occurs.
   *
   * @param error - The error message.
   * @param phase - The phase where error occurred.
   * @returns Whether the hook executed.
   */
  async onError(error: string, phase?: ProtocolPhase): Promise<boolean> {
    if (this.hooks.on_error === undefined) {
      return false;
    }

    const variables: HookVariables = {
      error,
      timestamp: new Date().toISOString(),
    };

    if (phase !== undefined) {
      variables.phase = phase;
    }

    return executeHook(this.hooks.on_error, variables, this.cwd);
  }

  /**
   * Executes on_phase_change hook when phase changes.
   *
   * @param _fromPhase - The previous phase (unused in current implementation).
   * @param toPhase - The new phase.
   * @returns Whether the hook executed.
   */
  async onPhaseChange(_fromPhase: ProtocolPhase, toPhase: ProtocolPhase): Promise<boolean> {
    if (this.hooks.on_phase_change === undefined) {
      return false;
    }

    const variables: HookVariables = {
      phase: toPhase,
      timestamp: new Date().toISOString(),
    };

    return executeHook(this.hooks.on_phase_change, variables, this.cwd);
  }
}

/**
 * Creates a notification hooks executor.
 *
 * @param hooks - Notification hooks configuration.
 * @param cwd - Working directory for command execution.
 * @returns A NotificationHooksExecutor instance.
 */
export function createHooksExecutor(
  hooks: NotificationHooks,
  cwd?: string
): NotificationHooksExecutor {
  return new NotificationHooksExecutor(hooks, cwd);
}
