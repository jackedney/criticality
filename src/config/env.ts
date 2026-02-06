/**
 * Environment variable overrides for configuration.
 *
 * Provides support for CRITICALITY_* environment variables to override
 * configuration values at runtime. Environment variables take precedence
 * over config file values, which take precedence over defaults.
 *
 * Override precedence: env > config file > defaults
 *
 * @packageDocumentation
 */

import type { Config, PartialConfig } from './types.js';

/**
 * Type for environment record (matching process.env structure).
 */
export type EnvRecord = Record<string, string | undefined>;

/**
 * Gets the default environment from Node.js process.env.
 * Returns an empty object if process is not available (e.g., browser environment).
 */
function getDefaultEnv(): EnvRecord {
  // Use globalThis to safely access process in a way that works in all environments
  const globalProcess = (globalThis as { process?: { env?: EnvRecord } }).process;
  return globalProcess?.env ?? {};
}

/**
 * Error class for environment variable coercion errors.
 */
export class EnvCoercionError extends Error {
  /** The environment variable name that failed coercion. */
  public readonly envVar: string;
  /** The raw value from the environment variable. */
  public readonly rawValue: string;
  /** The expected type for the value. */
  public readonly expectedType: string;

  /**
   * Creates a new EnvCoercionError.
   *
   * @param envVar - The environment variable name.
   * @param rawValue - The raw string value from the environment.
   * @param expectedType - The type the value should be coerced to.
   * @param message - Optional detailed error message.
   */
  constructor(envVar: string, rawValue: string, expectedType: string, message?: string) {
    const defaultMessage = `Cannot coerce environment variable '${envVar}' value '${rawValue}' to ${expectedType}`;
    super(message ?? defaultMessage);
    this.name = 'EnvCoercionError';
    this.envVar = envVar;
    this.rawValue = rawValue;
    this.expectedType = expectedType;
  }
}

/**
 * Mapping from environment variable names to config paths.
 *
 * Format: CRITICALITY_<SECTION>_<FIELD> maps to config.<section>.<field>
 * For convenience, some shortcuts are provided (e.g., CRITICALITY_MODEL).
 */
const ENV_VAR_MAPPINGS: Record<
  string,
  { section: keyof Config; field: string; type: 'string' | 'number' | 'boolean' }
> = {
  // Model shortcuts (convenience aliases)
  CRITICALITY_MODEL: { section: 'models', field: 'worker_model', type: 'string' },
  CRITICALITY_ARCHITECT_MODEL: { section: 'models', field: 'architect_model', type: 'string' },
  CRITICALITY_AUDITOR_MODEL: { section: 'models', field: 'auditor_model', type: 'string' },
  CRITICALITY_STRUCTURER_MODEL: { section: 'models', field: 'structurer_model', type: 'string' },
  CRITICALITY_WORKER_MODEL: { section: 'models', field: 'worker_model', type: 'string' },
  CRITICALITY_FALLBACK_MODEL: { section: 'models', field: 'fallback_model', type: 'string' },

  // Full model paths
  CRITICALITY_MODELS_ARCHITECT_MODEL: {
    section: 'models',
    field: 'architect_model',
    type: 'string',
  },
  CRITICALITY_MODELS_AUDITOR_MODEL: { section: 'models', field: 'auditor_model', type: 'string' },
  CRITICALITY_MODELS_STRUCTURER_MODEL: {
    section: 'models',
    field: 'structurer_model',
    type: 'string',
  },
  CRITICALITY_MODELS_WORKER_MODEL: { section: 'models', field: 'worker_model', type: 'string' },
  CRITICALITY_MODELS_FALLBACK_MODEL: { section: 'models', field: 'fallback_model', type: 'string' },

  // Path configuration
  CRITICALITY_PATHS_SPECS: { section: 'paths', field: 'specs', type: 'string' },
  CRITICALITY_PATHS_ARCHIVE: { section: 'paths', field: 'archive', type: 'string' },
  CRITICALITY_PATHS_STATE: { section: 'paths', field: 'state', type: 'string' },
  CRITICALITY_PATHS_LOGS: { section: 'paths', field: 'logs', type: 'string' },
  CRITICALITY_PATHS_LEDGER: { section: 'paths', field: 'ledger', type: 'string' },

  // Threshold shortcuts
  CRITICALITY_THRESHOLD: {
    section: 'thresholds',
    field: 'performance_variance_threshold',
    type: 'number',
  },
  CRITICALITY_MAX_RETRIES: { section: 'thresholds', field: 'max_retry_attempts', type: 'number' },

  // Full threshold paths
  CRITICALITY_THRESHOLDS_CONTEXT_TOKEN_UPGRADE: {
    section: 'thresholds',
    field: 'context_token_upgrade',
    type: 'number',
  },
  CRITICALITY_THRESHOLDS_SIGNATURE_COMPLEXITY_UPGRADE: {
    section: 'thresholds',
    field: 'signature_complexity_upgrade',
    type: 'number',
  },
  CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS: {
    section: 'thresholds',
    field: 'max_retry_attempts',
    type: 'number',
  },
  CRITICALITY_THRESHOLDS_RETRY_BASE_DELAY_MS: {
    section: 'thresholds',
    field: 'retry_base_delay_ms',
    type: 'number',
  },
  CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD: {
    section: 'thresholds',
    field: 'performance_variance_threshold',
    type: 'number',
  },

  // Notification configuration
  CRITICALITY_NOTIFICATIONS_ENABLED: {
    section: 'notifications',
    field: 'enabled',
    type: 'boolean',
  },
  CRITICALITY_NOTIFICATIONS_CHANNEL: {
    section: 'notifications',
    field: 'channel',
    type: 'string',
  },
  CRITICALITY_NOTIFICATIONS_ENDPOINT: {
    section: 'notifications',
    field: 'endpoint',
    type: 'string',
  },
};

/**
 * Coerces a string value to a number.
 *
 * @param value - The string value to coerce.
 * @param envVar - The environment variable name for error reporting.
 * @returns The coerced number value.
 * @throws EnvCoercionError if the value cannot be converted to a valid number.
 */
function coerceToNumber(value: string, envVar: string): number {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new EnvCoercionError(envVar, value, 'number', `Empty value for '${envVar}'`);
  }

  const num = Number(trimmed);

  if (Number.isNaN(num)) {
    throw new EnvCoercionError(envVar, value, 'number');
  }

  return num;
}

/**
 * Coerces a string value to a boolean.
 *
 * Accepts: 'true', '1', 'yes', 'on' for true
 * Accepts: 'false', '0', 'no', 'off' for false
 * Case-insensitive.
 *
 * @param value - The string value to coerce.
 * @param envVar - The environment variable name for error reporting.
 * @returns The coerced boolean value.
 * @throws EnvCoercionError if the value cannot be converted to a boolean.
 */
function coerceToBoolean(value: string, envVar: string): boolean {
  const trimmed = value.trim().toLowerCase();

  const truthy = ['true', '1', 'yes', 'on'];
  const falsy = ['false', '0', 'no', 'off'];

  if (truthy.includes(trimmed)) {
    return true;
  }

  if (falsy.includes(trimmed)) {
    return false;
  }

  throw new EnvCoercionError(
    envVar,
    value,
    'boolean',
    `Cannot coerce '${envVar}' value '${value}' to boolean. Expected one of: ${[...truthy, ...falsy].join(', ')}`
  );
}

/**
 * Coerces a string value to the specified type.
 *
 * @param value - The string value to coerce.
 * @param type - The target type.
 * @param envVar - The environment variable name for error reporting.
 * @returns The coerced value.
 * @throws EnvCoercionError if coercion fails.
 */
function coerceValue(
  value: string,
  type: 'string' | 'number' | 'boolean',
  envVar: string
): string | number | boolean {
  switch (type) {
    case 'string':
      return value;
    case 'number':
      return coerceToNumber(value, envVar);
    case 'boolean':
      return coerceToBoolean(value, envVar);
  }
}

/**
 * Result of reading environment variable overrides.
 */
export interface EnvOverrideResult {
  /** Partial configuration with values from environment variables. */
  overrides: PartialConfig;
  /** List of environment variables that were applied. */
  appliedVars: string[];
  /** List of any coercion errors encountered. */
  errors: EnvCoercionError[];
}

/**
 * Reads environment variables and returns configuration overrides.
 *
 * Scans for CRITICALITY_* environment variables and returns a partial
 * configuration object with the values to override.
 *
 * @param env - The environment object to read from (defaults to process.env).
 * @param options - Options for reading environment variables.
 * @returns Result containing overrides and any errors.
 *
 * @example
 * ```typescript
 * import { readEnvOverrides } from './env.js';
 *
 * // With real environment
 * const result = readEnvOverrides();
 * console.log(result.overrides);
 * console.log(result.appliedVars);
 *
 * // With mock environment for testing
 * const mockEnv = { CRITICALITY_MODEL: 'claude-3-opus' };
 * const result = readEnvOverrides(mockEnv);
 * ```
 */
export function readEnvOverrides(
  env: EnvRecord = getDefaultEnv(),
  options: { collectErrors?: boolean } = {}
): EnvOverrideResult {
  const { collectErrors = false } = options;

  const overrides: PartialConfig = {};
  const appliedVars: string[] = [];
  const errors: EnvCoercionError[] = [];

  for (const [envVar, mapping] of Object.entries(ENV_VAR_MAPPINGS)) {
    // eslint-disable-next-line security/detect-object-injection -- safe: envVar comes from Object.entries iteration over controlled ENV_VAR_MAPPINGS
    const value = env[envVar];

    if (value === undefined || value === '') {
      continue;
    }

    try {
      const coerced = coerceValue(value, mapping.type, envVar);

      // Initialize section if needed
      overrides[mapping.section] ??= {} as Record<string, unknown>;

      // Set the value - using type assertion since we know the structure
      (overrides[mapping.section] as Record<string, unknown>)[mapping.field] = coerced;
      appliedVars.push(envVar);
    } catch (error) {
      if (error instanceof EnvCoercionError) {
        if (collectErrors) {
          errors.push(error);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  return { overrides, appliedVars, errors };
}

/**
 * Applies environment variable overrides to a configuration.
 *
 * Merges environment variable overrides with the provided configuration,
 * with environment variables taking precedence.
 *
 * Override precedence: env > config
 *
 * @param config - The base configuration to override.
 * @param env - The environment object to read from (defaults to process.env).
 * @returns The configuration with environment overrides applied.
 * @throws EnvCoercionError if an environment variable cannot be coerced.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './parser.js';
 * import { applyEnvOverrides } from './env.js';
 *
 * const baseConfig = parseConfig(tomlContent);
 * const configWithEnv = applyEnvOverrides(baseConfig);
 *
 * // Environment variables override config file values
 * // e.g., CRITICALITY_MODEL=claude-3-opus overrides worker_model
 * ```
 */
export function applyEnvOverrides(config: Config, env: EnvRecord = getDefaultEnv()): Config {
  const { overrides } = readEnvOverrides(env);

  return mergeConfig(config, overrides);
}

/**
 * Merges a partial configuration into a full configuration.
 *
 * @param base - The base configuration.
 * @param partial - The partial configuration to merge.
 * @returns A new configuration with partial values merged in.
 */
function mergeConfig(base: Config, partial: PartialConfig): Config {
  return {
    models: {
      ...base.models,
      ...partial.models,
    },
    paths: {
      ...base.paths,
      ...partial.paths,
    },
    thresholds: {
      ...base.thresholds,
      ...partial.thresholds,
    },
    notifications: {
      ...base.notifications,
      ...partial.notifications,
    },
    mass_defect: {
      ...base.mass_defect,
      ...partial.mass_defect,
      targets: {
        ...base.mass_defect.targets,
        ...partial.mass_defect?.targets,
      },
    },
  };
}

/**
 * Gets documentation for all supported environment variables.
 *
 * @returns Documentation object mapping env var names to descriptions.
 */
export function getEnvVarDocumentation(): Record<string, { description: string; type: string }> {
  return {
    // Model shortcuts
    CRITICALITY_MODEL: {
      description: 'Override the worker model (shortcut for CRITICALITY_WORKER_MODEL)',
      type: 'string',
    },
    CRITICALITY_ARCHITECT_MODEL: {
      description: 'Override the architect model',
      type: 'string',
    },
    CRITICALITY_AUDITOR_MODEL: {
      description: 'Override the auditor model',
      type: 'string',
    },
    CRITICALITY_STRUCTURER_MODEL: {
      description: 'Override the structurer model',
      type: 'string',
    },
    CRITICALITY_WORKER_MODEL: {
      description: 'Override the worker model',
      type: 'string',
    },
    CRITICALITY_FALLBACK_MODEL: {
      description: 'Override the fallback model',
      type: 'string',
    },

    // Threshold shortcuts
    CRITICALITY_THRESHOLD: {
      description:
        'Override performance variance threshold (shortcut for CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD)',
      type: 'number',
    },
    CRITICALITY_MAX_RETRIES: {
      description:
        'Override max retry attempts (shortcut for CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS)',
      type: 'number',
    },

    // Full paths for thresholds
    CRITICALITY_THRESHOLDS_CONTEXT_TOKEN_UPGRADE: {
      description: 'Override context token upgrade threshold',
      type: 'number',
    },
    CRITICALITY_THRESHOLDS_SIGNATURE_COMPLEXITY_UPGRADE: {
      description: 'Override signature complexity upgrade threshold',
      type: 'number',
    },
    CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS: {
      description: 'Override max retry attempts',
      type: 'number',
    },
    CRITICALITY_THRESHOLDS_RETRY_BASE_DELAY_MS: {
      description: 'Override retry base delay in milliseconds',
      type: 'number',
    },
    CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD: {
      description: 'Override performance variance threshold',
      type: 'number',
    },

    // Path overrides
    CRITICALITY_PATHS_SPECS: {
      description: 'Override specs directory path',
      type: 'string',
    },
    CRITICALITY_PATHS_ARCHIVE: {
      description: 'Override archive directory path',
      type: 'string',
    },
    CRITICALITY_PATHS_STATE: {
      description: 'Override state file path',
      type: 'string',
    },
    CRITICALITY_PATHS_LOGS: {
      description: 'Override logs directory path',
      type: 'string',
    },
    CRITICALITY_PATHS_LEDGER: {
      description: 'Override ledger directory path',
      type: 'string',
    },

    // Notification overrides
    CRITICALITY_NOTIFICATIONS_ENABLED: {
      description: 'Enable or disable notifications (true/false)',
      type: 'boolean',
    },
    CRITICALITY_NOTIFICATIONS_CHANNEL: {
      description: 'Override notification channel (slack, email, webhook)',
      type: 'string',
    },
    CRITICALITY_NOTIFICATIONS_ENDPOINT: {
      description: 'Override notification endpoint URL',
      type: 'string',
    },
  };
}
