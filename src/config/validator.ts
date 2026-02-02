/**
 * Semantic validation for configuration values.
 *
 * Validates that configuration values are semantically correct beyond just type checking:
 * - Model names are recognized identifiers
 * - Paths can be validated via a custom function
 * - Thresholds are within valid ranges
 *
 * @packageDocumentation
 */

import type { Config, ThresholdConfig } from './types.js';

/**
 * Error class for semantic validation errors.
 */
export class ConfigValidationError extends Error {
  /** Array of validation failure details. */
  public readonly errors: ValidationError[];

  /**
   * Creates a new ConfigValidationError.
   *
   * @param message - Summary error message.
   * @param errors - Array of specific validation errors.
   */
  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}

/**
 * Individual validation error details.
 */
export interface ValidationError {
  /** The field path that failed validation. */
  field: string;
  /** The invalid value that was provided. */
  value: unknown;
  /** Human-readable description of the validation failure. */
  message: string;
}

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
  /** Whether validation passed. */
  valid: boolean;
  /** Array of validation errors (empty if valid). */
  errors: ValidationError[];
}

/**
 * Recognized model identifiers.
 * These are the models that the Criticality Protocol supports.
 */
export const RECOGNIZED_MODELS: ReadonlySet<string> = new Set([
  // Claude models
  'claude-opus-4.5',
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-3.5-sonnet',
  'claude-3.5-haiku',

  // Kimi models
  'kimi-k2',
  'kimi-k1.5',

  // MiniMax models
  'minimax-m2',
  'minimax-m1',

  // OpenAI models (for reference/testing)
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
]);

/**
 * Result of a path check operation.
 */
export interface PathCheckResult {
  /** Whether the path exists. */
  exists: boolean;
  /** Whether the path is a directory (if it exists). */
  isDirectory?: boolean;
  /** Error message if the check failed. */
  errorMessage?: string;
}

/**
 * Function type for checking path existence.
 */
export type PathChecker = (path: string, isDirectory: boolean) => PathCheckResult;

/**
 * Options for semantic validation.
 */
export interface ValidateConfigOptions {
  /**
   * Function to check if paths exist.
   * If not provided, path validation is skipped.
   */
  pathChecker?: PathChecker;

  /**
   * Whether to allow unrecognized model names.
   * Set to true for extensibility with custom models.
   * @defaultValue false
   */
  allowUnrecognizedModels?: boolean;
}

/**
 * Validates that a model name is a recognized identifier.
 *
 * @param modelName - The model name to validate.
 * @param fieldPath - The field path for error reporting.
 * @param errors - Array to accumulate errors into.
 * @param allowUnrecognized - Whether to allow unrecognized models.
 */
function validateModelName(
  modelName: string,
  fieldPath: string,
  errors: ValidationError[],
  allowUnrecognized: boolean
): void {
  if (!allowUnrecognized && !RECOGNIZED_MODELS.has(modelName)) {
    errors.push({
      field: fieldPath,
      value: modelName,
      message: `Unknown model name '${modelName}'. Recognized models: ${[...RECOGNIZED_MODELS].join(', ')}`,
    });
  }
}

/**
 * Validates that a path exists using the provided checker.
 *
 * @param pathValue - The path to validate.
 * @param fieldPath - The field path for error reporting.
 * @param pathChecker - Function to check path existence.
 * @param errors - Array to accumulate errors into.
 * @param isDirectory - Whether the path should be a directory.
 */
function validatePathExists(
  pathValue: string,
  fieldPath: string,
  pathChecker: PathChecker,
  errors: ValidationError[],
  isDirectory: boolean
): void {
  const result = pathChecker(pathValue, isDirectory);

  if (!result.exists) {
    errors.push({
      field: fieldPath,
      value: pathValue,
      message: result.errorMessage ?? `Path does not exist: '${pathValue}'`,
    });
    return;
  }

  if (isDirectory && result.isDirectory === false) {
    errors.push({
      field: fieldPath,
      value: pathValue,
      message: `Path exists but is not a directory: '${pathValue}'`,
    });
  }
}

/**
 * Validates a threshold value is within a valid range.
 *
 * @param value - The threshold value to validate.
 * @param fieldPath - The field path for error reporting.
 * @param min - Minimum allowed value (inclusive).
 * @param max - Maximum allowed value (inclusive).
 * @param errors - Array to accumulate errors into.
 */
function validateThresholdRange(
  value: number,
  fieldPath: string,
  min: number,
  max: number,
  errors: ValidationError[]
): void {
  if (value < min || value > max) {
    errors.push({
      field: fieldPath,
      value,
      message: `Threshold '${fieldPath}' must be between ${String(min)} and ${String(max)}, got ${String(value)}`,
    });
  }
}

/**
 * Validates that a threshold value is a positive integer.
 *
 * @param value - The threshold value to validate.
 * @param fieldPath - The field path for error reporting.
 * @param errors - Array to accumulate errors into.
 */
function validatePositiveInteger(
  value: number,
  fieldPath: string,
  errors: ValidationError[]
): void {
  if (!Number.isInteger(value) || value < 1) {
    errors.push({
      field: fieldPath,
      value,
      message: `'${fieldPath}' must be a positive integer, got ${String(value)}`,
    });
  }
}

/**
 * Validates all model assignments in the configuration.
 *
 * @param config - The configuration to validate.
 * @param errors - Array to accumulate errors into.
 * @param allowUnrecognized - Whether to allow unrecognized models.
 */
function validateModels(
  config: Config,
  errors: ValidationError[],
  allowUnrecognized: boolean
): void {
  const modelFields: (keyof Config['models'])[] = [
    'architect_model',
    'auditor_model',
    'structurer_model',
    'worker_model',
    'fallback_model',
  ];

  for (const field of modelFields) {
    // eslint-disable-next-line security/detect-object-injection -- safe: field is keyof Config['models'] with known literal keys
    validateModelName(config.models[field], `models.${field}`, errors, allowUnrecognized);
  }
}

/**
 * Validates all paths in the configuration.
 *
 * @param config - The configuration to validate.
 * @param errors - Array to accumulate errors into.
 * @param pathChecker - Function to check path existence.
 */
function validatePaths(config: Config, errors: ValidationError[], pathChecker: PathChecker): void {
  // Directory paths
  const directoryFields: (keyof Config['paths'])[] = ['specs', 'archive', 'logs', 'ledger'];
  for (const field of directoryFields) {
    // eslint-disable-next-line security/detect-object-injection -- safe: field is keyof Config['paths'] with known literal keys
    validatePathExists(config.paths[field], `paths.${field}`, pathChecker, errors, true);
  }

  // State file - check as file (parent directory existence)
  validatePathExists(config.paths.state, 'paths.state', pathChecker, errors, false);
}

/**
 * Validates all threshold values in the configuration.
 *
 * @param thresholds - The threshold configuration to validate.
 * @param errors - Array to accumulate errors into.
 */
function validateThresholds(thresholds: ThresholdConfig, errors: ValidationError[]): void {
  // context_token_upgrade: positive integer, reasonable maximum
  validatePositiveInteger(
    thresholds.context_token_upgrade,
    'thresholds.context_token_upgrade',
    errors
  );
  if (thresholds.context_token_upgrade > 1000000) {
    errors.push({
      field: 'thresholds.context_token_upgrade',
      value: thresholds.context_token_upgrade,
      message: `'thresholds.context_token_upgrade' exceeds reasonable maximum of 1000000`,
    });
  }

  // signature_complexity_upgrade: positive integer, reasonable range
  validatePositiveInteger(
    thresholds.signature_complexity_upgrade,
    'thresholds.signature_complexity_upgrade',
    errors
  );
  if (thresholds.signature_complexity_upgrade > 100) {
    errors.push({
      field: 'thresholds.signature_complexity_upgrade',
      value: thresholds.signature_complexity_upgrade,
      message: `'thresholds.signature_complexity_upgrade' exceeds reasonable maximum of 100`,
    });
  }

  // max_retry_attempts: positive integer, reasonable maximum
  validatePositiveInteger(thresholds.max_retry_attempts, 'thresholds.max_retry_attempts', errors);
  if (thresholds.max_retry_attempts > 100) {
    errors.push({
      field: 'thresholds.max_retry_attempts',
      value: thresholds.max_retry_attempts,
      message: `'thresholds.max_retry_attempts' exceeds reasonable maximum of 100`,
    });
  }

  // retry_base_delay_ms: positive integer, reasonable range (1ms to 1 hour)
  validatePositiveInteger(thresholds.retry_base_delay_ms, 'thresholds.retry_base_delay_ms', errors);
  if (thresholds.retry_base_delay_ms > 3600000) {
    errors.push({
      field: 'thresholds.retry_base_delay_ms',
      value: thresholds.retry_base_delay_ms,
      message: `'thresholds.retry_base_delay_ms' exceeds reasonable maximum of 3600000 (1 hour)`,
    });
  }

  // performance_variance_threshold: must be between 0 and 1 (exclusive 0, inclusive 1)
  validateThresholdRange(
    thresholds.performance_variance_threshold,
    'thresholds.performance_variance_threshold',
    0,
    1,
    errors
  );
  if (thresholds.performance_variance_threshold <= 0) {
    errors.push({
      field: 'thresholds.performance_variance_threshold',
      value: thresholds.performance_variance_threshold,
      message: `'thresholds.performance_variance_threshold' must be greater than 0`,
    });
  }
}

/**
 * Validates configuration semantically.
 *
 * Performs semantic validation beyond type checking:
 * - Validates model names are recognized identifiers
 * - Optionally validates paths exist using a provided checker function
 * - Validates thresholds are within valid ranges
 *
 * @param config - The parsed configuration to validate.
 * @param options - Validation options.
 * @returns Validation result with any errors.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './parser.js';
 * import { validateConfig } from './validator.js';
 *
 * const config = parseConfig(tomlContent);
 * const result = validateConfig(config);
 *
 * if (!result.valid) {
 *   for (const error of result.errors) {
 *     console.error(`${error.field}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function validateConfig(
  config: Config,
  options: ValidateConfigOptions = {}
): ValidationResult {
  const { pathChecker, allowUnrecognizedModels = false } = options;

  const errors: ValidationError[] = [];

  // Validate model names
  validateModels(config, errors, allowUnrecognizedModels);

  // Validate paths if checker is provided
  if (pathChecker !== undefined) {
    validatePaths(config, errors, pathChecker);
  }

  // Validate thresholds
  validateThresholds(config.thresholds, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates configuration and throws if invalid.
 *
 * Convenience function that throws a ConfigValidationError if validation fails.
 *
 * @param config - The parsed configuration to validate.
 * @param options - Validation options.
 * @throws ConfigValidationError if validation fails.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './parser.js';
 * import { assertConfigValid } from './validator.js';
 *
 * const config = parseConfig(tomlContent);
 *
 * try {
 *   assertConfigValid(config);
 *   // config is valid
 * } catch (error) {
 *   if (error instanceof ConfigValidationError) {
 *     console.error('Validation errors:', error.errors);
 *   }
 * }
 * ```
 */
export function assertConfigValid(config: Config, options: ValidateConfigOptions = {}): void {
  const result = validateConfig(config, options);

  if (!result.valid) {
    const errorMessages = result.errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n');
    throw new ConfigValidationError(
      `Configuration validation failed with ${String(result.errors.length)} error(s):\n${errorMessages}`,
      result.errors
    );
  }
}

/**
 * Checks if a model name is recognized.
 *
 * @param modelName - The model name to check.
 * @returns True if the model is recognized.
 *
 * @example
 * ```typescript
 * import { isRecognizedModel } from './validator.js';
 *
 * isRecognizedModel('claude-3-opus'); // true
 * isRecognizedModel('gpt-99'); // false
 * ```
 */
export function isRecognizedModel(modelName: string): boolean {
  return RECOGNIZED_MODELS.has(modelName);
}
