"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnvVarDocumentation = exports.applyEnvOverrides = exports.readEnvOverrides = exports.EnvCoercionError = exports.RECOGNIZED_MODELS = exports.isRecognizedModel = exports.assertConfigValid = exports.validateConfig = exports.ConfigValidationError = exports.DEFAULT_THRESHOLDS = exports.DEFAULT_PATHS = exports.DEFAULT_NOTIFICATIONS = exports.DEFAULT_MODEL_ASSIGNMENTS = exports.DEFAULT_MASS_DEFECT_TARGETS = exports.DEFAULT_MASS_DEFECT = exports.DEFAULT_CONFIG = exports.DEFAULT_CLI_CONFIG = exports.parseConfig = exports.getDefaultConfig = exports.ConfigParseError = void 0;
var parser_js_1 = require("./parser.js");
Object.defineProperty(exports, "ConfigParseError", { enumerable: true, get: function () { return parser_js_1.ConfigParseError; } });
Object.defineProperty(exports, "getDefaultConfig", { enumerable: true, get: function () { return parser_js_1.getDefaultConfig; } });
Object.defineProperty(exports, "parseConfig", { enumerable: true, get: function () { return parser_js_1.parseConfig; } });
var defaults_js_1 = require("./defaults.js");
Object.defineProperty(exports, "DEFAULT_CLI_CONFIG", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_CLI_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_MASS_DEFECT", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_MASS_DEFECT; } });
Object.defineProperty(exports, "DEFAULT_MASS_DEFECT_TARGETS", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_MASS_DEFECT_TARGETS; } });
Object.defineProperty(exports, "DEFAULT_MODEL_ASSIGNMENTS", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_MODEL_ASSIGNMENTS; } });
Object.defineProperty(exports, "DEFAULT_NOTIFICATIONS", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_NOTIFICATIONS; } });
Object.defineProperty(exports, "DEFAULT_PATHS", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_PATHS; } });
Object.defineProperty(exports, "DEFAULT_THRESHOLDS", { enumerable: true, get: function () { return defaults_js_1.DEFAULT_THRESHOLDS; } });
var validator_js_1 = require("./validator.js");
Object.defineProperty(exports, "ConfigValidationError", { enumerable: true, get: function () { return validator_js_1.ConfigValidationError; } });
Object.defineProperty(exports, "validateConfig", { enumerable: true, get: function () { return validator_js_1.validateConfig; } });
Object.defineProperty(exports, "assertConfigValid", { enumerable: true, get: function () { return validator_js_1.assertConfigValid; } });
Object.defineProperty(exports, "isRecognizedModel", { enumerable: true, get: function () { return validator_js_1.isRecognizedModel; } });
Object.defineProperty(exports, "RECOGNIZED_MODELS", { enumerable: true, get: function () { return validator_js_1.RECOGNIZED_MODELS; } });
var env_js_1 = require("./env.js");
Object.defineProperty(exports, "EnvCoercionError", { enumerable: true, get: function () { return env_js_1.EnvCoercionError; } });
Object.defineProperty(exports, "readEnvOverrides", { enumerable: true, get: function () { return env_js_1.readEnvOverrides; } });
Object.defineProperty(exports, "applyEnvOverrides", { enumerable: true, get: function () { return env_js_1.applyEnvOverrides; } });
Object.defineProperty(exports, "getEnvVarDocumentation", { enumerable: true, get: function () { return env_js_1.getEnvVarDocumentation; } });
