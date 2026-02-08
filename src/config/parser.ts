/**
 * TOML configuration parser for criticality.toml.
 *
 * @packageDocumentation
 */

import * as TOML from '@iarna/toml';
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
  NotificationChannelConfig,
  NotificationConfig,
  PathConfig,
  ThresholdConfig,
} from './types.js';
import { isValidCronExpression } from '../notifications/cron.js';

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
 * Validates that a value is an array.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated array.
 * @throws ConfigParseError if value is not an array.
 */
function validateArray(value: unknown, fieldPath: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ConfigParseError(
      `Invalid type for '${fieldPath}': expected array, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validates that a URL is valid.
 *
 * @param url - URL string to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated URL string.
 * @throws ConfigParseError if URL is invalid.
 */
function validateUrl(url: string, fieldPath: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigParseError(
        `Invalid value for '${fieldPath}': URL must use http or https protocol`
      );
    }
    return url;
  } catch (error) {
    if (error instanceof ConfigParseError) {
      throw error;
    }
    throw new ConfigParseError(`Invalid value for '${fieldPath}': '${url}' is not a valid URL`);
  }
}

/**
 * Validates that a cron expression is valid.
 *
 * @param cron - Cron expression to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated cron expression.
 * @throws ConfigParseError if cron expression is invalid.
 */
function validateCron(cron: string, fieldPath: string): string {
  if (!isValidCronExpression(cron)) {
    throw new ConfigParseError(
      `Invalid value for '${fieldPath}': '${cron}' is not a valid cron expression. Expected format: 'minute hour day month weekday' (e.g., '0 9 * * *' for daily at 9am)`
    );
  }
  return cron;
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
 * Parses a notification channel configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for a single channel.
 * @param index - Index of the channel for error messages.
 * @returns Validated notification channel configuration.
 */
function parseNotificationChannel(raw: unknown, index: number): NotificationChannelConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigParseError(
      `Invalid type for 'notifications.channels[${String(index)}]': expected object`
    );
  }

  const channelRaw = raw as Record<string, unknown>;

  const typeRaw = channelRaw.type;
  if (typeof typeRaw !== 'string') {
    throw new ConfigParseError(
      `Missing required field 'type' for 'notifications.channels[${String(index)}]'`
    );
  }
  const type = validateString(typeRaw, `notifications.channels[${String(index)}].type`);
  if (type !== 'webhook' && type !== 'slack' && type !== 'email') {
    throw new ConfigParseError(
      `Invalid value for 'notifications.channels[${String(index)}].type': expected 'webhook', 'slack', or 'email', got '${type}'`
    );
  }

  const endpointRaw = channelRaw.endpoint;
  if (typeof endpointRaw !== 'string') {
    throw new ConfigParseError(
      `Missing required field 'endpoint' for 'notifications.channels[${String(index)}]'`
    );
  }
  const endpoint = validateUrl(
    validateString(endpointRaw, `notifications.channels[${String(index)}].endpoint`),
    `notifications.channels[${String(index)}].endpoint`
  );

  const enabled =
    'enabled' in channelRaw
      ? validateBoolean(channelRaw.enabled, `notifications.channels[${String(index)}].enabled`)
      : true;

  let events: readonly string[] = ['block'];
  if ('events' in channelRaw) {
    const eventsRaw = validateArray(
      channelRaw.events,
      `notifications.channels[${String(index)}].events`
    );
    const eventsArr: string[] = [];
    for (let i = 0; i < eventsRaw.length; i++) {
      const event = eventsRaw[i];
      if (typeof event !== 'string') {
        throw new ConfigParseError(
          `Invalid type for 'notifications.channels[${String(index)}].events[${String(i)}]': expected string, got ${typeof event}`
        );
      }
      if (
        event !== 'block' &&
        event !== 'complete' &&
        event !== 'error' &&
        event !== 'phase_change'
      ) {
        throw new ConfigParseError(
          `Invalid value for 'notifications.channels[${String(index)}].events[${String(i)}]': expected 'block', 'complete', 'error', or 'phase_change', got '${event}'`
        );
      }
      eventsArr.push(event);
    }
    events = eventsArr;
  }

  return {
    type,
    endpoint,
    enabled,
    events,
  };
}

/**
 * Parses notification channels from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications.channels section.
 * @returns Validated notification channels array.
 */
function parseNotificationChannels(raw: unknown): readonly NotificationChannelConfig[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const channelsRaw = validateArray(raw, 'notifications.channels');
  if (channelsRaw.length === 0) {
    return undefined;
  }

  const channels: NotificationChannelConfig[] = [];
  for (let i = 0; i < channelsRaw.length; i++) {
    channels.push(parseNotificationChannel(channelsRaw[i], i));
  }

  return channels;
}

/**
 * Parses notification configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications section.
 * @returns Validated notification configuration merged with defaults.
 */
function parseNotifications(raw: Record<string, unknown> | undefined): NotificationConfig {
  if (raw === undefined) {
    return { ...DEFAULT_NOTIFICATIONS };
  }

  const enabled =
    'enabled' in raw
      ? validateBoolean(raw.enabled, 'notifications.enabled')
      : DEFAULT_NOTIFICATIONS.enabled;

  const channels =
    'channels' in raw ? parseNotificationChannels(raw.channels) : DEFAULT_NOTIFICATIONS.channels;

  const reminder_schedule =
    'reminder_schedule' in raw
      ? validateCron(
          validateString(raw.reminder_schedule, 'notifications.reminder_schedule'),
          'notifications.reminder_schedule'
        )
      : DEFAULT_NOTIFICATIONS.reminder_schedule;

  let channel: 'slack' | 'email' | 'webhook' | undefined = DEFAULT_NOTIFICATIONS.channel;
  if ('channel' in raw) {
    const channelValue = validateString(raw.channel, 'notifications.channel');
    if (channelValue !== 'slack' && channelValue !== 'email' && channelValue !== 'webhook') {
      throw new ConfigParseError(
        `Invalid value for 'notifications.channel': expected 'slack', 'email', or 'webhook', got '${channelValue}'`
      );
    }
    channel = channelValue;
  }

  const endpoint =
    'endpoint' in raw
      ? validateString(raw.endpoint, 'notifications.endpoint')
      : DEFAULT_NOTIFICATIONS.endpoint;

  return {
    enabled,
    channels,
    reminder_schedule,
    channel,
    endpoint,
  };
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
 * Parses a TOML string and validates the configuration.
 *
 * @param tomlContent - The TOML configuration string.
 * @returns Validated configuration object.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './config/parser.js';
 * const config = parseConfig('[models]\nworker_model = "custom"');
 * console.log(config.models.worker_model); // "custom"
 * console.log(config.thresholds.max_retry_attempts); // 5
 * ```
 */
export function parseConfig(tomlContent: string): Config {
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
    notifications: parseNotifications(parsed.notifications as Record<string, unknown> | undefined),
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
export function getDefaultConfig(): Promise<Config> {
  return Promise.resolve({ ...DEFAULT_CONFIG });
}
