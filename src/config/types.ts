/**
 * Configuration types for criticality.toml parsing.
 *
 * @packageDocumentation
 */

/**
 * Model role aliases for routing requests.
 * Maps semantic roles to actual model identifiers.
 */
export interface ModelAssignments {
  /** Model for high-level architecture and user interaction. */
  architect_model: string;
  /** Model for logical consistency auditing. */
  auditor_model: string;
  /** Model for structure generation (Lattice phase). */
  structurer_model: string;
  /** Model for primary function implementation. */
  worker_model: string;
  /** Model for fallback when worker fails. */
  fallback_model: string;
}

/**
 * Path configuration for artifacts and state.
 */
export interface PathConfig {
  /** Directory for specification artifacts. */
  specs: string;
  /** Directory for archived phase artifacts. */
  archive: string;
  /** File path for protocol state persistence. */
  state: string;
  /** Directory for telemetry and logs. */
  logs: string;
  /** Directory for decision ledger. */
  ledger: string;
}

/**
 * Threshold configuration for routing and circuit breakers.
 */
export interface ThresholdConfig {
  /** Context token threshold for model upgrade (default: 12000). */
  context_token_upgrade: number;
  /** Signature complexity threshold for model upgrade (default: 5). */
  signature_complexity_upgrade: number;
  /** Maximum retry attempts before circuit breaker triggers. */
  max_retry_attempts: number;
  /** Base delay in milliseconds for exponential backoff. */
  retry_base_delay_ms: number;
  /** Variance threshold for performance claim verification (default: 0.2). */
  performance_variance_threshold: number;
}

/**
 * Notification configuration for blocking states.
 */
export interface NotificationConfig {
  /** Whether notifications are enabled. */
  enabled: boolean;
  /** Notification channel type. */
  channel?: 'slack' | 'email' | 'webhook';
  /** Webhook URL or email address. */
  endpoint?: string;
}

/**
 * Complete configuration object parsed from criticality.toml.
 */
export interface Config {
  /** Model role to actual model mappings. */
  models: ModelAssignments;
  /** Path configuration for artifacts. */
  paths: PathConfig;
  /** Threshold values for routing decisions. */
  thresholds: ThresholdConfig;
  /** Notification settings for blocking states. */
  notifications: NotificationConfig;
}

/**
 * Partial configuration for merging with defaults.
 * All fields are optional.
 */
export interface PartialConfig {
  models?: Partial<ModelAssignments>;
  paths?: Partial<PathConfig>;
  thresholds?: Partial<ThresholdConfig>;
  notifications?: Partial<NotificationConfig>;
}
