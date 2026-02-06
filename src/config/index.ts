/**
 * Configuration module for criticality.toml parsing and validation.
 *
 * Provides typed configuration parsing with sensible defaults, semantic validation,
 * and environment variable overrides.
 *
 * Override precedence: env > config file > defaults
 *
 * @packageDocumentation
 */

export { ConfigParseError, getDefaultConfig, parseConfig } from './parser.js';
export type {
  Config,
  MassDefectConfig,
  MassDefectTargetsConfig,
  ModelAssignments,
  NotificationConfig,
  PartialConfig,
  PathConfig,
  ThresholdConfig,
} from './types.js';
export {
  DEFAULT_CONFIG,
  DEFAULT_MASS_DEFECT,
  DEFAULT_MASS_DEFECT_TARGETS,
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
export {
  EnvCoercionError,
  readEnvOverrides,
  applyEnvOverrides,
  getEnvVarDocumentation,
} from './env.js';
export type { EnvOverrideResult, EnvRecord } from './env.js';
