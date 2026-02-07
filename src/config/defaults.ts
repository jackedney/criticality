/**
 * Default configuration values for criticality.toml.
 *
 * @packageDocumentation
 */

import type {
  CliSettingsConfig,
  Config,
  MassDefectConfig,
  MassDefectTargetsConfig,
  ModelAssignments,
  NotificationConfig,
  PathConfig,
  ThresholdConfig,
} from './types.js';

/**
 * Default model assignments based on design decisions.
 * Uses Claude Opus 4.5 for architect, Kimi K2 for auditing,
 * Claude Sonnet 4.5 for structure and fallback, and MiniMax M2 for worker tasks.
 */
export const DEFAULT_MODEL_ASSIGNMENTS: ModelAssignments = {
  architect_model: 'claude-opus-4.5',
  auditor_model: 'kimi-k2',
  structurer_model: 'claude-sonnet-4.5',
  worker_model: 'minimax-m2',
  fallback_model: 'claude-sonnet-4.5',
};

/**
 * Default path configuration relative to project root.
 */
export const DEFAULT_PATHS: PathConfig = {
  specs: '.criticality/specs',
  archive: '.criticality/archive',
  state: '.criticality/state.json',
  logs: '.criticality/logs',
  ledger: '.criticality/ledger',
};

/**
 * Default threshold values from design decisions.
 */
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  context_token_upgrade: 12000,
  signature_complexity_upgrade: 5,
  max_retry_attempts: 3,
  retry_base_delay_ms: 1000,
  performance_variance_threshold: 0.2,
};

/**
 * Default notification configuration (disabled).
 */
export const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  enabled: false,
};

/**
 * Default Mass Defect complexity targets.
 */
export const DEFAULT_MASS_DEFECT_TARGETS: MassDefectTargetsConfig = {
  max_cyclomatic_complexity: 10,
  max_function_length_lines: 50,
  max_nesting_depth: 4,
  min_test_coverage: 0.8,
};

/**
 * Default Mass Defect configuration.
 */
export const DEFAULT_MASS_DEFECT: MassDefectConfig = {
  targets: DEFAULT_MASS_DEFECT_TARGETS,
  catalog_path: './mass-defect-catalog',
};

/**
 * Default CLI configuration.
 */
export const DEFAULT_CLI_CONFIG: CliSettingsConfig = {
  colors: true,
  watch_interval: 2000,
  unicode: true,
};

/**
 * Complete default configuration.
 */
export const DEFAULT_CONFIG: Config = {
  models: DEFAULT_MODEL_ASSIGNMENTS,
  paths: DEFAULT_PATHS,
  thresholds: DEFAULT_THRESHOLDS,
  notifications: DEFAULT_NOTIFICATIONS,
  mass_defect: DEFAULT_MASS_DEFECT,
  cli: DEFAULT_CLI_CONFIG,
};
