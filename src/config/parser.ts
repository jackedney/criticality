/**
 * TOML configuration parser for criticality.toml.
 *
 * @packageDocumentation
 */

import * as TOML from '@iarna/toml';
import {
  DEFAULT_CONFIG,
  DEFAULT_MODEL_ASSIGNMENTS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PATHS,
  DEFAULT_THRESHOLDS,
} from './defaults.js';
import type {
  Config,
  ModelAssignments,
  NotificationConfig,
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
 * Parses notification configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications section.
 * @returns Validated notification configuration merged with defaults.
 */
function parseNotifications(raw: Record<string, unknown> | undefined): NotificationConfig {
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
export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}
