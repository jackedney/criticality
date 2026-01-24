/**
 * Configuration module for criticality.toml parsing and validation.
 *
 * Provides typed configuration parsing with sensible defaults and semantic validation.
 *
 * @packageDocumentation
 */

export { ConfigParseError, getDefaultConfig, parseConfig } from './parser.js';
export type {
  Config,
  ModelAssignments,
  NotificationConfig,
  PartialConfig,
  PathConfig,
  ThresholdConfig,
} from './types.js';
export {
  DEFAULT_CONFIG,
  DEFAULT_MODEL_ASSIGNMENTS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PATHS,
  DEFAULT_THRESHOLDS,
} from './defaults.js';
export {
  ConfigValidationError,
  validateConfig,
  assertConfigValid,
  isRecognizedModel,
  RECOGNIZED_MODELS,
} from './validator.js';
export type {
  PathChecker,
  PathCheckResult,
  ValidationError,
  ValidationResult,
  ValidateConfigOptions,
} from './validator.js';
