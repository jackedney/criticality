/**
 * Configuration module for criticality.toml parsing.
 *
 * Provides typed configuration parsing with sensible defaults.
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
