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
 * Complexity targets for Mass Defect phase.
 */
export interface MassDefectTargetsConfig {
  /** Maximum allowed cyclomatic complexity. */
  max_cyclomatic_complexity: number;
  /** Maximum allowed function length in lines. */
  max_function_length_lines: number;
  /** Maximum allowed nesting depth. */
  max_nesting_depth: number;
  /** Minimum required test coverage (0-1). */
  min_test_coverage: number;
}

/**
 * Configuration for Mass Defect phase.
 */
export interface MassDefectConfig {
  /** Complexity targets for transformation. */
  targets: MassDefectTargetsConfig;
  /** Path to transformation catalog directory relative to project root. */
  catalog_path: string;
}

/**
 * CLI configuration for terminal behavior.
 */
export interface CliSettingsConfig {
  /** Whether to use ANSI colors in output. */
  colors: boolean;
  /** Watch mode refresh interval in milliseconds. */
  watch_interval: number;
  /** Whether to use Unicode box-drawing characters. */
  unicode: boolean;
}

/**
 * Notification hook configuration.
 * Hooks are shell commands executed on specific protocol events.
 */
export interface NotificationHook {
  /** Shell command to execute when hook triggers. */
  command: string;
  /** Whether the hook is enabled. */
  enabled: boolean;
}

/**
 * All notification hooks for different protocol events.
 */
export interface NotificationHooks {
  /** Hook triggered when protocol enters blocking state. */
  on_block?: NotificationHook;
  /** Hook triggered when protocol completes successfully. */
  on_complete?: NotificationHook;
  /** Hook triggered when an error occurs. */
  on_error?: NotificationHook;
  /** Hook triggered when phase changes. */
  on_phase_change?: NotificationHook;
}

/**
 * Notification channel configuration.
 */
export interface NotificationChannelConfig {
  /** Type of notification channel. */
  readonly type: 'webhook' | 'slack' | 'email';
  /** Endpoint URL for sending notifications. */
  readonly endpoint: string;
  /** Whether this channel is enabled. */
  readonly enabled: boolean;
  /** Events that this channel subscribes to. */
  readonly events: readonly string[];
}

/**
 * Notification configuration for blocking states.
 */
export interface NotificationConfig {
  /** Whether notifications are enabled. */
  readonly enabled: boolean;
  /** Notification channels array. */
  readonly channels?: readonly NotificationChannelConfig[] | undefined;
  /** Reminder schedule as cron expression. */
  readonly reminder_schedule?: string | undefined;
  /** Notification channel type (legacy, use channels instead). */
  readonly channel?: 'slack' | 'email' | 'webhook' | undefined;
  /** Webhook URL or email address (legacy, use channels instead). */
  readonly endpoint?: string | undefined;
  /** Shell command hooks for protocol events. */
  readonly hooks?: NotificationHooks | undefined;
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
  /** Mass Defect phase configuration. */
  mass_defect: MassDefectConfig;
  /** CLI settings for terminal behavior. */
  cli: CliSettingsConfig;
}

/**
 * Partial configuration for merging with defaults.
 * All fields are optional.
 */
export interface PartialConfig {
  models?: Partial<ModelAssignments>;
  paths?: Partial<PathConfig>;
  thresholds?: Partial<ThresholdConfig>;
  notifications?: Partial<NotificationConfig> & {
    hooks?: Partial<NotificationHooks>;
    channels?: readonly NotificationChannelConfig[];
  };
  mass_defect?: {
    targets?: Partial<MassDefectTargetsConfig>;
    catalog_path?: string;
  };
  cli?: Partial<CliSettingsConfig>;
}
