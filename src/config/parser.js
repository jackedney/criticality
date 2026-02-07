"use strict";
/**
 * TOML configuration parser for criticality.toml.
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigParseError = void 0;
exports.parseConfig = parseConfig;
exports.getDefaultConfig = getDefaultConfig;
var TOML = require("@iarna/toml");
var execa_1 = require("execa");
var defaults_js_1 = require("./defaults.js");
/**
 * Error class for configuration parsing errors.
 */
var ConfigParseError = /** @class */ (function (_super) {
    __extends(ConfigParseError, _super);
    /**
     * Creates a new ConfigParseError.
     *
     * @param message - Descriptive error message.
     * @param cause - The underlying error, if any.
     */
    function ConfigParseError(message, cause) {
        var _this = _super.call(this, message) || this;
        _this.name = 'ConfigParseError';
        _this.cause = cause;
        return _this;
    }
    return ConfigParseError;
}(Error));
exports.ConfigParseError = ConfigParseError;
/**
 * Validates that a value is a string.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated string.
 * @throws ConfigParseError if value is not a string.
 */
function validateString(value, fieldPath) {
    if (typeof value !== 'string') {
        throw new ConfigParseError("Invalid type for '".concat(fieldPath, "': expected string, got ").concat(typeof value));
    }
    return value;
}
/**
 * Validates that a value is a number.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated number.
 * @throws ConfigParseError if value is not a number.
 */
function validateNumber(value, fieldPath) {
    if (typeof value !== 'number') {
        throw new ConfigParseError("Invalid type for '".concat(fieldPath, "': expected number, got ").concat(typeof value));
    }
    return value;
}
/**
 * Validates that a value is a boolean.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated boolean.
 * @throws ConfigParseError if value is not a boolean.
 */
function validateBoolean(value, fieldPath) {
    if (typeof value !== 'boolean') {
        throw new ConfigParseError("Invalid type for '".concat(fieldPath, "': expected boolean, got ").concat(typeof value));
    }
    return value;
}
/**
 * Parses model assignments from raw TOML data.
 *
 * @param raw - Raw TOML object for models section.
 * @returns Validated model assignments merged with defaults.
 */
function parseModelAssignments(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_MODEL_ASSIGNMENTS);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_MODEL_ASSIGNMENTS);
    if ('architect_model' in raw) {
        result.architect_model = validateString(raw.architect_model, 'models.architect_model');
    }
    if ('auditor_model' in raw) {
        result.auditor_model = validateString(raw.auditor_model, 'models.auditor_model');
    }
    if ('structurer_model' in raw) {
        result.structurer_model = validateString(raw.structurer_model, 'models.structurer_model');
    }
    if ('worker_model' in raw) {
        result.worker_model = validateString(raw.worker_model, 'models.worker_model');
    }
    if ('fallback_model' in raw) {
        result.fallback_model = validateString(raw.fallback_model, 'models.fallback_model');
    }
    return result;
}
/**
 * Parses path configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for paths section.
 * @returns Validated path configuration merged with defaults.
 */
function parsePaths(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_PATHS);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_PATHS);
    if ('specs' in raw) {
        result.specs = validateString(raw.specs, 'paths.specs');
    }
    if ('archive' in raw) {
        result.archive = validateString(raw.archive, 'paths.archive');
    }
    if ('state' in raw) {
        result.state = validateString(raw.state, 'paths.state');
    }
    if ('logs' in raw) {
        result.logs = validateString(raw.logs, 'paths.logs');
    }
    if ('ledger' in raw) {
        result.ledger = validateString(raw.ledger, 'paths.ledger');
    }
    return result;
}
/**
 * Parses threshold configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for thresholds section.
 * @returns Validated threshold configuration merged with defaults.
 */
function parseThresholds(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_THRESHOLDS);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_THRESHOLDS);
    if ('context_token_upgrade' in raw) {
        result.context_token_upgrade = validateNumber(raw.context_token_upgrade, 'thresholds.context_token_upgrade');
    }
    if ('signature_complexity_upgrade' in raw) {
        result.signature_complexity_upgrade = validateNumber(raw.signature_complexity_upgrade, 'thresholds.signature_complexity_upgrade');
    }
    if ('max_retry_attempts' in raw) {
        result.max_retry_attempts = validateNumber(raw.max_retry_attempts, 'thresholds.max_retry_attempts');
    }
    if ('retry_base_delay_ms' in raw) {
        result.retry_base_delay_ms = validateNumber(raw.retry_base_delay_ms, 'thresholds.retry_base_delay_ms');
    }
    if ('performance_variance_threshold' in raw) {
        result.performance_variance_threshold = validateNumber(raw.performance_variance_threshold, 'thresholds.performance_variance_threshold');
    }
    return result;
}
/**
 * Parses a notification hook from raw TOML data.
 *
 * @param raw - Raw TOML object for a single hook.
 * @param hookName - Name of the hook for error messages.
 * @returns Validated notification hook.
 */
function parseNotificationHook(raw, hookName) {
    if (raw === undefined || typeof raw !== 'object' || raw === null) {
        return undefined;
    }
    var hookRaw = raw;
    var hook = {};
    if ('command' in hookRaw) {
        hook.command = validateString(hookRaw.command, "notifications.hooks.".concat(hookName, ".command"));
    }
    if ('enabled' in hookRaw) {
        hook.enabled = validateBoolean(hookRaw.enabled, "notifications.hooks.".concat(hookName, ".enabled"));
    }
    if (hook.command === undefined || hook.enabled === undefined) {
        return undefined;
    }
    return {
        command: hook.command,
        enabled: hook.enabled,
    };
}
/**
 * Validates that a shell command exists and is executable.
 *
 * @param command - The shell command to validate.
 * @param hookName - Name of the hook for warning messages.
 * @returns Whether the command exists.
 */
function validateCommandExists(command, hookName) {
    return __awaiter(this, void 0, void 0, function () {
        var commandName, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    commandName = command.split(' ')[0];
                    if (commandName === undefined) {
                        console.warn("Warning: Invalid command for hook '".concat(hookName, "'. The hook will not execute."));
                        return [2 /*return*/, false];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, execa_1.execa)('which', [commandName], {
                            reject: true,
                            timeout: 1000,
                        })];
                case 2:
                    _b.sent();
                    return [2 /*return*/, true];
                case 3:
                    _a = _b.sent();
                    console.warn("Warning: Command '".concat(commandName, "' not found for hook '").concat(hookName, "'. ") +
                        "The hook will not execute. Please ensure the command is available in PATH.");
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parses notification hooks from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications.hooks section.
 * @returns Validated notification hooks.
 */
function parseNotificationHooks(raw) {
    return __awaiter(this, void 0, void 0, function () {
        var hooks, hook, hook, hook, hook;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (raw === undefined) {
                        return [2 /*return*/, {}];
                    }
                    hooks = {};
                    if (!('on_block' in raw)) return [3 /*break*/, 2];
                    hook = parseNotificationHook(raw.on_block, 'on_block');
                    if (!(hook !== undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, validateCommandExists(hook.command, 'on_block')];
                case 1:
                    _a.sent();
                    hooks.on_block = hook;
                    _a.label = 2;
                case 2:
                    if (!('on_complete' in raw)) return [3 /*break*/, 4];
                    hook = parseNotificationHook(raw.on_complete, 'on_complete');
                    if (!(hook !== undefined)) return [3 /*break*/, 4];
                    return [4 /*yield*/, validateCommandExists(hook.command, 'on_complete')];
                case 3:
                    _a.sent();
                    hooks.on_complete = hook;
                    _a.label = 4;
                case 4:
                    if (!('on_error' in raw)) return [3 /*break*/, 6];
                    hook = parseNotificationHook(raw.on_error, 'on_error');
                    if (!(hook !== undefined)) return [3 /*break*/, 6];
                    return [4 /*yield*/, validateCommandExists(hook.command, 'on_error')];
                case 5:
                    _a.sent();
                    hooks.on_error = hook;
                    _a.label = 6;
                case 6:
                    if (!('on_phase_change' in raw)) return [3 /*break*/, 8];
                    hook = parseNotificationHook(raw.on_phase_change, 'on_phase_change');
                    if (!(hook !== undefined)) return [3 /*break*/, 8];
                    return [4 /*yield*/, validateCommandExists(hook.command, 'on_phase_change')];
                case 7:
                    _a.sent();
                    hooks.on_phase_change = hook;
                    _a.label = 8;
                case 8: return [2 /*return*/, hooks];
            }
        });
    });
}
/**
 * Parses notification configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for notifications section.
 * @returns Validated notification configuration merged with defaults.
 */
function parseNotifications(raw) {
    return __awaiter(this, void 0, void 0, function () {
        var result, channel, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (raw === undefined) {
                        return [2 /*return*/, __assign({}, defaults_js_1.DEFAULT_NOTIFICATIONS)];
                    }
                    result = __assign({}, defaults_js_1.DEFAULT_NOTIFICATIONS);
                    if ('enabled' in raw) {
                        result.enabled = validateBoolean(raw.enabled, 'notifications.enabled');
                    }
                    if ('channel' in raw) {
                        channel = validateString(raw.channel, 'notifications.channel');
                        if (channel !== 'slack' && channel !== 'email' && channel !== 'webhook') {
                            throw new ConfigParseError("Invalid value for 'notifications.channel': expected 'slack', 'email', or 'webhook', got '".concat(channel, "'"));
                        }
                        result.channel = channel;
                    }
                    if ('endpoint' in raw) {
                        result.endpoint = validateString(raw.endpoint, 'notifications.endpoint');
                    }
                    if (!('hooks' in raw)) return [3 /*break*/, 2];
                    _a = result;
                    return [4 /*yield*/, parseNotificationHooks(raw.hooks)];
                case 1:
                    _a.hooks = _b.sent();
                    _b.label = 2;
                case 2: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Parses Mass Defect targets configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for mass_defect.targets section.
 * @returns Validated targets configuration merged with defaults.
 */
function parseMassDefectTargets(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_MASS_DEFECT_TARGETS);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_MASS_DEFECT_TARGETS);
    if ('max_cyclomatic_complexity' in raw) {
        result.max_cyclomatic_complexity = validateNumber(raw.max_cyclomatic_complexity, 'mass_defect.targets.max_cyclomatic_complexity');
    }
    if ('max_function_length_lines' in raw) {
        result.max_function_length_lines = validateNumber(raw.max_function_length_lines, 'mass_defect.targets.max_function_length_lines');
    }
    if ('max_nesting_depth' in raw) {
        result.max_nesting_depth = validateNumber(raw.max_nesting_depth, 'mass_defect.targets.max_nesting_depth');
    }
    if ('min_test_coverage' in raw) {
        result.min_test_coverage = validateNumber(raw.min_test_coverage, 'mass_defect.targets.min_test_coverage');
    }
    return result;
}
/**
 * Parses Mass Defect configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for mass_defect section.
 * @returns Validated Mass Defect configuration merged with defaults.
 */
function parseMassDefect(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_MASS_DEFECT);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_MASS_DEFECT);
    if ('targets' in raw) {
        result.targets = parseMassDefectTargets(raw.targets);
    }
    if ('catalog_path' in raw) {
        result.catalog_path = validateString(raw.catalog_path, 'mass_defect.catalog_path');
    }
    return result;
}
/**
 * Parses CLI configuration from raw TOML data.
 *
 * @param raw - Raw TOML object for cli section.
 * @returns Validated CLI configuration merged with defaults.
 */
function parseCliSettings(raw) {
    if (raw === undefined) {
        return __assign({}, defaults_js_1.DEFAULT_CLI_CONFIG);
    }
    var result = __assign({}, defaults_js_1.DEFAULT_CLI_CONFIG);
    if ('colors' in raw) {
        result.colors = validateBoolean(raw.colors, 'cli.colors');
    }
    if ('watch_interval' in raw) {
        result.watch_interval = validateNumber(raw.watch_interval, 'cli.watch_interval');
        if (!Number.isFinite(result.watch_interval) || result.watch_interval <= 0) {
            throw new ConfigParseError("Invalid value for 'cli.watch_interval': must be a finite positive number, got ".concat(String(result.watch_interval)));
        }
    }
    if ('unicode' in raw) {
        result.unicode = validateBoolean(raw.unicode, 'cli.unicode');
    }
    return result;
}
/**
 * Parses a TOML string into a validated Config object.
 *
 * @param tomlContent - Raw TOML content as a string.
 * @returns Validated configuration object with defaults applied for missing fields.
 * @throws ConfigParseError for invalid TOML syntax or invalid field values.
 *
 * @example
 * ```typescript
 * import { parseConfig } from './config/parser.js';
 *
 * const toml = `
 * [models]
 * worker_model = "custom-model"
 *
 * [thresholds]
 * max_retry_attempts = 5
 * `;
 *
 * const config = parseConfig(toml);
 * console.log(config.models.worker_model); // "custom-model"
 * console.log(config.thresholds.max_retry_attempts); // 5
 * ```
 */
function parseConfig(tomlContent) {
    return __awaiter(this, void 0, void 0, function () {
        var parsed, tomlError;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    try {
                        parsed = TOML.parse(tomlContent);
                    }
                    catch (error) {
                        tomlError = error;
                        throw new ConfigParseError("Invalid TOML syntax: ".concat(tomlError.message), tomlError);
                    }
                    _a = {
                        models: parseModelAssignments(parsed.models),
                        paths: parsePaths(parsed.paths),
                        thresholds: parseThresholds(parsed.thresholds)
                    };
                    return [4 /*yield*/, parseNotifications(parsed.notifications)];
                case 1: return [2 /*return*/, (_a.notifications = _b.sent(),
                        _a.mass_defect = parseMassDefect(parsed.mass_defect),
                        _a.cli = parseCliSettings(parsed.cli),
                        _a)];
            }
        });
    });
}
/**
 * Parses an empty TOML string, returning all default values.
 *
 * @returns Default configuration object.
 *
 * @example
 * ```typescript
 * import { getDefaultConfig } from './config/parser.js';
 *
 * const config = getDefaultConfig();
 * console.log(config.models.architect_model); // "claude-opus-4.5"
 * ```
 */
function getDefaultConfig() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, __assign({}, defaults_js_1.DEFAULT_CONFIG)];
        });
    });
}
