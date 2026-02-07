"use strict";
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
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvCoercionError = void 0;
exports.readEnvOverrides = readEnvOverrides;
exports.applyEnvOverrides = applyEnvOverrides;
exports.getEnvVarDocumentation = getEnvVarDocumentation;
/**
 * Gets the default environment from Node.js process.env.
 * Returns an empty object if process is not available (e.g., browser environment).
 */
function getDefaultEnv() {
    var _a;
    // Use globalThis to safely access process in a way that works in all environments
    var globalProcess = globalThis.process;
    return (_a = globalProcess === null || globalProcess === void 0 ? void 0 : globalProcess.env) !== null && _a !== void 0 ? _a : {};
}
/**
 * Error class for environment variable coercion errors.
 */
var EnvCoercionError = /** @class */ (function (_super) {
    __extends(EnvCoercionError, _super);
    /**
     * Creates a new EnvCoercionError.
     *
     * @param envVar - The environment variable name.
     * @param rawValue - The raw string value from the environment.
     * @param expectedType - The type the value should be coerced to.
     * @param message - Optional detailed error message.
     */
    function EnvCoercionError(envVar, rawValue, expectedType, message) {
        var _this = this;
        var defaultMessage = "Cannot coerce environment variable '".concat(envVar, "' value '").concat(rawValue, "' to ").concat(expectedType);
        _this = _super.call(this, message !== null && message !== void 0 ? message : defaultMessage) || this;
        _this.name = 'EnvCoercionError';
        _this.envVar = envVar;
        _this.rawValue = rawValue;
        _this.expectedType = expectedType;
        return _this;
    }
    return EnvCoercionError;
}(Error));
exports.EnvCoercionError = EnvCoercionError;
/**
 * Mapping from environment variable names to config paths.
 *
 * Format: CRITICALITY_<SECTION>_<FIELD> maps to config.<section>.<field>
 * For convenience, some shortcuts are provided (e.g., CRITICALITY_MODEL).
 */
var ENV_VAR_MAPPINGS = {
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
function coerceToNumber(value, envVar) {
    var trimmed = value.trim();
    if (trimmed === '') {
        throw new EnvCoercionError(envVar, value, 'number', "Empty value for '".concat(envVar, "'"));
    }
    var num = Number(trimmed);
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
function coerceToBoolean(value, envVar) {
    var trimmed = value.trim().toLowerCase();
    var truthy = ['true', '1', 'yes', 'on'];
    var falsy = ['false', '0', 'no', 'off'];
    if (truthy.includes(trimmed)) {
        return true;
    }
    if (falsy.includes(trimmed)) {
        return false;
    }
    throw new EnvCoercionError(envVar, value, 'boolean', "Cannot coerce '".concat(envVar, "' value '").concat(value, "' to boolean. Expected one of: ").concat(__spreadArray(__spreadArray([], truthy, true), falsy, true).join(', ')));
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
function coerceValue(value, type, envVar) {
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
function readEnvOverrides(env, options) {
    var _a;
    var _b;
    if (env === void 0) { env = getDefaultEnv(); }
    if (options === void 0) { options = {}; }
    var _c = options.collectErrors, collectErrors = _c === void 0 ? false : _c;
    var overrides = {};
    var appliedVars = [];
    var errors = [];
    for (var _i = 0, _d = Object.entries(ENV_VAR_MAPPINGS); _i < _d.length; _i++) {
        var _e = _d[_i], envVar = _e[0], mapping = _e[1];
        // eslint-disable-next-line security/detect-object-injection -- safe: envVar comes from Object.entries iteration over controlled ENV_VAR_MAPPINGS
        var value = env[envVar];
        if (value === undefined || value === '') {
            continue;
        }
        try {
            var coerced = coerceValue(value, mapping.type, envVar);
            // Initialize section if needed
            (_a = overrides[_b = mapping.section]) !== null && _a !== void 0 ? _a : (overrides[_b] = {});
            // Set the value - using type assertion since we know the structure
            overrides[mapping.section][mapping.field] = coerced;
            appliedVars.push(envVar);
        }
        catch (error) {
            if (error instanceof EnvCoercionError) {
                if (collectErrors) {
                    errors.push(error);
                }
                else {
                    throw error;
                }
            }
            else {
                throw error;
            }
        }
    }
    return { overrides: overrides, appliedVars: appliedVars, errors: errors };
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
function applyEnvOverrides(config, env) {
    if (env === void 0) { env = getDefaultEnv(); }
    var overrides = readEnvOverrides(env).overrides;
    return mergeConfig(config, overrides);
}
/**
 * Merges a partial configuration into a full configuration.
 *
 * @param base - The base configuration.
 * @param partial - The partial configuration to merge.
 * @returns A new configuration with partial values merged in.
 */
function mergeConfig(base, partial) {
    var _a;
    return {
        models: __assign(__assign({}, base.models), partial.models),
        paths: __assign(__assign({}, base.paths), partial.paths),
        thresholds: __assign(__assign({}, base.thresholds), partial.thresholds),
        notifications: __assign(__assign({}, base.notifications), partial.notifications),
        mass_defect: __assign(__assign(__assign({}, base.mass_defect), partial.mass_defect), { targets: __assign(__assign({}, base.mass_defect.targets), (_a = partial.mass_defect) === null || _a === void 0 ? void 0 : _a.targets) }),
        cli: __assign(__assign({}, base.cli), partial.cli),
    };
}
/**
 * Gets documentation for all supported environment variables.
 *
 * @returns Documentation object mapping env var names to descriptions.
 */
function getEnvVarDocumentation() {
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
            description: 'Override performance variance threshold (shortcut for CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD)',
            type: 'number',
        },
        CRITICALITY_MAX_RETRIES: {
            description: 'Override max retry attempts (shortcut for CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS)',
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
