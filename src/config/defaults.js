"use strict";
/**
 * Default configuration values for criticality.toml.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.DEFAULT_CLI_CONFIG = exports.DEFAULT_MASS_DEFECT = exports.DEFAULT_MASS_DEFECT_TARGETS = exports.DEFAULT_NOTIFICATIONS = exports.DEFAULT_THRESHOLDS = exports.DEFAULT_PATHS = exports.DEFAULT_MODEL_ASSIGNMENTS = void 0;
/**
 * Default model assignments based on design decisions.
 * Uses Claude Opus 4.5 for architect, Kimi K2 for auditing,
 * Claude Sonnet 4.5 for structure and fallback, and MiniMax M2 for worker tasks.
 */
exports.DEFAULT_MODEL_ASSIGNMENTS = {
    architect_model: 'claude-opus-4.5',
    auditor_model: 'kimi-k2',
    structurer_model: 'claude-sonnet-4.5',
    worker_model: 'minimax-m2',
    fallback_model: 'claude-sonnet-4.5',
};
/**
 * Default path configuration relative to project root.
 */
exports.DEFAULT_PATHS = {
    specs: '.criticality/specs',
    archive: '.criticality/archive',
    state: '.criticality/state.json',
    logs: '.criticality/logs',
    ledger: '.criticality/ledger',
};
/**
 * Default threshold values from design decisions.
 */
exports.DEFAULT_THRESHOLDS = {
    context_token_upgrade: 12000,
    signature_complexity_upgrade: 5,
    max_retry_attempts: 3,
    retry_base_delay_ms: 1000,
    performance_variance_threshold: 0.2,
};
/**
 * Default notification configuration (disabled).
 */
exports.DEFAULT_NOTIFICATIONS = {
    enabled: false,
    hooks: {},
};
/**
 * Default Mass Defect complexity targets.
 */
exports.DEFAULT_MASS_DEFECT_TARGETS = {
    max_cyclomatic_complexity: 10,
    max_function_length_lines: 50,
    max_nesting_depth: 4,
    min_test_coverage: 0.8,
};
/**
 * Default Mass Defect configuration.
 */
exports.DEFAULT_MASS_DEFECT = {
    targets: exports.DEFAULT_MASS_DEFECT_TARGETS,
    catalog_path: './mass-defect-catalog',
};
/**
 * Default CLI configuration.
 */
exports.DEFAULT_CLI_CONFIG = {
    colors: true,
    watch_interval: 2000,
    unicode: true,
};
/**
 * Complete default configuration.
 */
exports.DEFAULT_CONFIG = {
    models: exports.DEFAULT_MODEL_ASSIGNMENTS,
    paths: exports.DEFAULT_PATHS,
    thresholds: exports.DEFAULT_THRESHOLDS,
    notifications: exports.DEFAULT_NOTIFICATIONS,
    mass_defect: exports.DEFAULT_MASS_DEFECT,
    cli: exports.DEFAULT_CLI_CONFIG,
};
