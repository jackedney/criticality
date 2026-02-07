/**
 * TOML configuration parser for criticality.toml.
 *
 * @packageDocumentation
 */

import * as TOML from '@iarna/toml';
import { execa } from 'execa';
import {
  DEFAULT_CLI_CONFIG,
  DEFAULT_CONFIG,
  DEFAULT_MASS_DEFECT,
  DEFAULT_MASS_DEFECT_TARGETS,
  DEFAULT_MODEL_ASSIGNMENTS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PATHS,
  DEFAULT_THRESHOLDS,
} from './defaults.js';
import type {
  CliSettingsConfig,
  Config,
  MassDefectConfig,
  MassDefectTargetsConfig,
  ModelAssignments,
  NotificationConfig,
  NotificationHook,
  NotificationHooks,
  PathConfig,
  ThresholdConfig,
} from './types.js';

/**
 * Error class for configuration parsing errors.
 */
export class ConfigParseError extends Error {
  /** The original error that caused the parse failure, if any. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new ConfigParseError.
   *
   * @param message - Descriptive error message.
   * @param cause - The underlying error, if any.
   */
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ConfigParseError';
    this.cause = cause;
  }
}

/**
 * Validates that a value is a string.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated string.
 * @throws ConfigParseError if value is not a string.
 */
function validateString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new ConfigParseError(
      `Invalid type for '${fieldPath}': expected string, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validates that a value is a number.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated number.
 * @throws ConfigParseError if value is not a number.
 */
function validateNumber(value: unknown, fieldPath: string): number {
  if (typeof value !== 'number') {
    throw new ConfigParseError(
      `Invalid type for '${fieldPath}': expected number, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated boolean.
 * @throws ConfigParseError if value is not a boolean.
 */
function validateBoolean(value: unknown, fieldPath: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ConfigParseError(
      `Invalid type for '${fieldPath}': expected boolean, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Parses model assignments from raw TOML data.
 *
 * @param raw - Raw TOML object for models section.
 * @returns Validated model assignments merged with defaults.
 */
function parseModelAssignments(raw: Record<string, unknown> | undefined): ModelAssignments {
  if (raw === undefined) {
    return { ...DEFAULT_MODEL_ASSIGNMENTS };
  }

  const result: ModelAssignments = { ...DEFAULT_MODEL_ASSIGNMENTS };

  if ('architect_model' in raw) {
    result.architect_model = validateString(raw.architect_model, 'models.architect_model');
  }
  if ('auditor_model' in raw) {
    result.auditor_model = validateString(raw.auditor_model, 'models.auditor_model');
  }
  if ('structurer_model' in raw) {
    result.structurer_model = validateString(raw.structurer_model, 'models.structurer_model');
  }
  if ('worker_model' in raw) {
    result.worker_model = validateString(raw.worker_model, 'models.worker_model');
  }
  if ('fallback_model' in raw) {
    result.fallback_model = validateString(raw.fallback_model, 'models.fallback_model');
  }

  return result;
}

/**
 * Parses path configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for paths section.
 * @returns Validated path configuration merged with defaults.
 */
function parsePaths(raw: Record<string, unknown> | undefined): PathConfig {
  if (raw === undefined) {
    return { ...DEFAULT_PATHS };
  }

  const result: PathConfig = { ...DEFAULT_PATHS };

  if ('specs' in raw) {
    result.specs = validateString(raw.specs, 'paths.specs');
  }
  if ('archive' in raw) {
    result.archive = validateString(raw.archive, 'paths.archive');
  }
  if ('state' in raw) {
    result.state = validateString(raw.state, 'paths.state');
  }
  if ('logs' in raw) {
    result.logs = validateString(raw.logs, 'paths.logs');
  }
  if ('ledger' in raw) {
    result.ledger = validateString(raw.ledger, 'paths.ledger');
  }

  return result;
}

/**
 * Parses threshold configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for thresholds section.
 * @returns Validated threshold configuration merged with defaults.
 */
function parseThresholds(raw: Record<string, unknown> | undefined): ThresholdConfig {
  if (raw === undefined) {
    return { ...DEFAULT_THRESHOLDS };
  }

  const result: ThresholdConfig = { ...DEFAULT_THRESHOLDS };

  if ('context_token_upgrade' in raw) {
    result.context_token_upgrade = validateNumber(
      raw.context_token_upgrade,
      'thresholds.context_token_upgrade'
    );
  }
  if ('signature_complexity_upgrade' in raw) {
    result.signature_complexity_upgrade = validateNumber(
      raw.signature_complexity_upgrade,
      'thresholds.signature_complexity_upgrade'
    );
  }
  if ('max_retry_attempts' in raw) {
    result.max_retry_attempts = validateNumber(
      raw.max_retry_attempts,
      'thresholds.max_retry_attempts'
    );
  }
  if ('retry_base_delay_ms' in raw) {
    result.retry_base_delay_ms = validateNumber(
      raw.retry_base_delay_ms,
      'thresholds.retry_base_delay_ms'
    );
  }
  if ('performance_variance_threshold' in raw) {
    result.performance_variance_threshold = validateNumber(
      raw.performance_variance_threshold,
      'thresholds.performance_variance_threshold'
    );
  }

  return result;
}

/**
 * Parses a notification hook from raw TOML data.
 *
 * @param raw - Raw TOML object for a single hook.
 * @param hookName - Name of the hook for error messages.
 * @returns Validated notification hook.
 */
function parseNotificationHook(raw: unknown, hookName: string): NotificationHook | undefined {
  if (raw === undefined || typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const hookRaw = raw as Record<string, unknown>;
  const hook: Partial<NotificationHook> = {};

  if ('command' in hookRaw) {
    hook.command = validateString(hookRaw.command, `notifications.hooks.${hookName}.command`);
  }

  if ('enabled' in hookRaw) {
    hook.enabled = validateBoolean(hookRaw.enabled, `notifications.hooks.${hookName}.enabled`);
  }

  if (hook.command === undefined || hook.enabled === undefined) {
    return undefined;
  }

  return {
    command: hook.command,
    enabled: hook.enabled,
  };
}

/**
 * Validates that a shell command exists and is executable.
 *
 * @param command - The shell command to validate.
 * @param hookName - Name of the hook for warning messages.
 * @returns Whether the command exists.
 */
async function validateCommandExists(command: string, hookName: string): Promise<boolean> {
  const commandName = command.split(' ')[0];
  if (commandName === undefined) {
    console.warn(`Warning: Invalid command for hook '${hookName}'. The hook will not execute.`);
    return false;
  }

  try {
    await execa('which', [commandName], {
      reject: true,
      timeout: 1000,
    });
    return true;
  } catch {
    console.warn(
      `Warning: Command '${commandName}' not found for hook '${hookName}'. ` +
        `The hook will not execute. Please ensure the command is available in PATH.`
    );
    return false;
  }
}

/**
 * Parses notification hooks from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications.hooks section.
 * @returns Validated notification hooks.
 */
async function parseNotificationHooks(
  raw: Record<string, unknown> | undefined
): Promise<NotificationHooks> {
  if (raw === undefined) {
    return {};
  }

  const hooks: NotificationHooks = {};

  if ('on_block' in raw) {
    const hook = parseNotificationHook(raw.on_block, 'on_block');
    if (hook !== undefined) {
      await validateCommandExists(hook.command, 'on_block');
      hooks.on_block = hook;
    }
  }

  if ('on_complete' in raw) {
    const hook = parseNotificationHook(raw.on_complete, 'on_complete');
    if (hook !== undefined) {
      await validateCommandExists(hook.command, 'on_complete');
      hooks.on_complete = hook;
    }
  }

  if ('on_error' in raw) {
    const hook = parseNotificationHook(raw.on_error, 'on_error');
    if (hook !== undefined) {
      await validateCommandExists(hook.command, 'on_error');
      hooks.on_error = hook;
    }
  }

  if ('on_phase_change' in raw) {
    const hook = parseNotificationHook(raw.on_phase_change, 'on_phase_change');
    if (hook !== undefined) {
      await validateCommandExists(hook.command, 'on_phase_change');
      hooks.on_phase_change = hook;
    }
  }

  return hooks;
}

/**
 * Parses notification configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications section.
 * @returns Validated notification configuration merged with defaults.
 */
async function parseNotifications(
  raw: Record<string, unknown> | undefined
): Promise<NotificationConfig> {
  if (raw === undefined) {
    return { ...DEFAULT_NOTIFICATIONS };
  }

  const result: NotificationConfig = { ...DEFAULT_NOTIFICATIONS };

  if ('enabled' in raw) {
    result.enabled = validateBoolean(raw.enabled, 'notifications.enabled');
  }

  if ('channel' in raw) {
    const channel = validateString(raw.channel, 'notifications.channel');
    if (channel !== 'slack' && channel !== 'email' && channel !== 'webhook') {
      throw new ConfigParseError(
        `Invalid value for 'notifications.channel': expected 'slack', 'email', or 'webhook', got '${channel}'`
      );
    }
    result.channel = channel;
  }

  if ('endpoint' in raw) {
    result.endpoint = validateString(raw.endpoint, 'notifications.endpoint');
  }

  if ('hooks' in raw) {
    result.hooks = await parseNotificationHooks(raw.hooks as Record<string, unknown> | undefined);
  }

  return result;
}

/**
 * Parses Mass Defect targets configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for mass_defect.targets section.
 * @returns Validated targets configuration merged with defaults.
 */
function parseMassDefectTargets(raw: Record<string, unknown> | undefined): MassDefectTargetsConfig {
  if (raw === undefined) {
    return { ...DEFAULT_MASS_DEFECT_TARGETS };
  }

  const result: MassDefectTargetsConfig = { ...DEFAULT_MASS_DEFECT_TARGETS };

  if ('max_cyclomatic_complexity' in raw) {
    result.max_cyclomatic_complexity = validateNumber(
      raw.max_cyclomatic_complexity,
      'mass_defect.targets.max_cyclomatic_complexity'
    );
  }
  if ('max_function_length_lines' in raw) {
    result.max_function_length_lines = validateNumber(
      raw.max_function_length_lines,
      'mass_defect.targets.max_function_length_lines'
    );
  }
  if ('max_nesting_depth' in raw) {
    result.max_nesting_depth = validateNumber(
      raw.max_nesting_depth,
      'mass_defect.targets.max_nesting_depth'
    );
  }
  if ('min_test_coverage' in raw) {
    result.min_test_coverage = validateNumber(
      raw.min_test_coverage,
      'mass_defect.targets.min_test_coverage'
    );
  }

  return result;
}

/**
 * Parses Mass Defect configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for mass_defect section.
 * @returns Validated Mass Defect configuration merged with defaults.
 */
function parseMassDefect(raw: Record<string, unknown> | undefined): MassDefectConfig {
  if (raw === undefined) {
    return { ...DEFAULT_MASS_DEFECT };
  }

  const result: MassDefectConfig = { ...DEFAULT_MASS_DEFECT };

  if ('targets' in raw) {
    result.targets = parseMassDefectTargets(raw.targets as Record<string, unknown> | undefined);
  }
  if ('catalog_path' in raw) {
    result.catalog_path = validateString(raw.catalog_path, 'mass_defect.catalog_path');
  }

  return result;
}

/**
 * Parses CLI configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for cli section.
 * @returns Validated CLI configuration merged with defaults.
 */
function parseCliSettings(raw: Record<string, unknown> | undefined): CliSettingsConfig {
  if (raw === undefined) {
    return { ...DEFAULT_CLI_CONFIG };
  }

  const result: CliSettingsConfig = { ...DEFAULT_CLI_CONFIG };

  if ('colors' in raw) {
    result.colors = validateBoolean(raw.colors, 'cli.colors');
  }
  if ('watch_interval' in raw) {
    result.watch_interval = validateNumber(raw.watch_interval, 'cli.watch_interval');
    if (!Number.isFinite(result.watch_interval) || result.watch_interval <= 0) {
      throw new ConfigParseError(
        `Invalid value for 'cli.watch_interval': must be a finite positive number, got ${String(result.watch_interval)}`
      );
    }
  }
  if ('unicode' in raw) {
    result.unicode = validateBoolean(raw.unicode, 'cli.unicode');
  }

  return result;
}

/**
 * Parses a TOML string into a validated Config object.
 *
 * @param tomlContent - Raw TOML content as a string.
 * @returns Validated configuration object with defaults applied for missing fields.
 * @throws ConfigParseError for invalid TOML syntax or invalid field values.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './config/parser.js';
 *
 * const toml = `
 * [models]
 * worker_model = "custom-model"
 *
 * [thresholds]
 * max_retry_attempts = 5
 * `;
 *
 * const config = parseConfig(toml);
 * console.log(config.models.worker_model); // "custom-model"
 * console.log(config.thresholds.max_retry_attempts); // 5
 * ```
 */
export async function parseConfig(tomlContent: string): Promise<Config> {
  let parsed: Record<string, unknown>;

  try {
    parsed = TOML.parse(tomlContent) as Record<string, unknown>;
  } catch (error) {
    const tomlError = error as Error;
    throw new ConfigParseError(`Invalid TOML syntax: ${tomlError.message}`, tomlError);
  }

  return {
    models: parseModelAssignments(parsed.models as Record<string, unknown> | undefined),
    paths: parsePaths(parsed.paths as Record<string, unknown> | undefined),
    thresholds: parseThresholds(parsed.thresholds as Record<string, unknown> | undefined),
    notifications: await parseNotifications(
      parsed.notifications as Record<string, unknown> | undefined
    ),
    mass_defect: parseMassDefect(parsed.mass_defect as Record<string, unknown> | undefined),
    cli: parseCliSettings(parsed.cli as Record<string, unknown> | undefined),
  };
}

/**
 * Parses an empty TOML string, returning all default values.
 *
 * @returns Default configuration object.
 *
 * @example
 * ```typescript
 * import { getDefaultConfig } from './config/parser.js';
 *
 * const config = getDefaultConfig();
 * console.log(config.models.architect_model); // "claude-opus-4.5"
 * ```
 */
export async function getDefaultConfig(): Promise<Config> {
  return { ...DEFAULT_CONFIG };
}
