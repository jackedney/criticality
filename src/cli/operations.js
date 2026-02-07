"use strict";
/**
 * ExternalOperations implementation for CLI context.
 *
 * Provides real implementations for model calls, compilation, tests,
 * archiving, and notifications used by the orchestrator.
 *
 * @packageDocumentation
 */
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
exports.CliOperations = void 0;
exports.createCliOperations = createCliOperations;
var claude_code_client_js_1 = require("../router/claude-code-client.js");
var execa_1 = require("execa");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var telemetry_js_1 = require("./telemetry.js");
var hooks_js_1 = require("./hooks.js");
/**
 * Mapping from protocol phases to model aliases.
 */
var PHASE_TO_MODEL_ALIAS = new Map([
    ['Ignition', 'architect'],
    ['Lattice', 'structurer'],
    ['CompositionAudit', 'auditor'],
    ['Injection', 'worker'],
    ['Mesoscopic', 'auditor'],
    ['MassDefect', 'worker'],
]);
/**
 * Gets the model alias for a given phase.
 *
 * @param phase - The protocol phase.
 * @returns The model alias to use.
 */
function getModelAliasForPhase(phase) {
    var alias = PHASE_TO_MODEL_ALIAS.get(phase);
    if (alias === undefined) {
        return 'architect';
    }
    return alias;
}
/**
 * CLI-specific implementation of ExternalOperations.
 *
 * Uses Claude Code CLI for model calls, runs subprocesses for
 * compilation and tests, creates backups for archiving, and
 * triggers notification hooks.
 */
var CliOperations = /** @class */ (function () {
    /**
     * Creates a new CliOperations instance.
     *
     * @param options - Configuration options.
     */
    function CliOperations(options) {
        var _a, _b, _c, _d;
        this.modelClient = null;
        this.config = options.config;
        this.statePath = options.statePath;
        this.cwd = (_a = options.cwd) !== null && _a !== void 0 ? _a : process.cwd();
        this.collectTelemetry = (_b = options.collectTelemetry) !== null && _b !== void 0 ? _b : true;
        this.onTelemetryUpdate = options.onTelemetryUpdate;
        this.telemetryCollector = (_c = options.telemetryCollector) !== null && _c !== void 0 ? _c : new telemetry_js_1.TelemetryCollector();
        this.hooksExecutor = (0, hooks_js_1.createHooksExecutor)((_d = this.config.notifications.hooks) !== null && _d !== void 0 ? _d : {}, this.cwd);
        this.telemetry = {
            modelCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
            executionTimeMs: 0,
        };
        this.currentPhase = 'Ignition';
    }
    /**
     * Sets the current protocol phase for telemetry tracking.
     *
     * @param phase - The protocol phase.
     */
    CliOperations.prototype.setCurrentPhase = function (phase) {
        this.currentPhase = phase;
    };
    /**
     * Initializes the model client.
     *
     * @throws Error if Claude Code CLI is not installed.
     */
    CliOperations.prototype.ensureModelClient = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.modelClient !== null) {
                            return [2 /*return*/, this.modelClient];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        _a = this;
                        return [4 /*yield*/, (0, claude_code_client_js_1.createClaudeCodeClient)({
                                config: this.config,
                                cwd: this.cwd,
                            })];
                    case 2:
                        _a.modelClient = _b.sent();
                        return [2 /*return*/, this.modelClient];
                    case 3:
                        error_1 = _b.sent();
                        if (error_1 &&
                            typeof error_1 === 'object' &&
                            'message' in error_1 &&
                            typeof error_1.message === 'string') {
                            throw new Error("Failed to initialize model client: ".concat(error_1.message, "\n\n") +
                                'Please install Claude Code: https://claude.ai/download');
                        }
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Updates telemetry and triggers callback if configured.
     */
    CliOperations.prototype.updateTelemetry = function (delta, phase) {
        var _a, _b, _c;
        if (!this.collectTelemetry) {
            return;
        }
        if (delta.modelCalls !== undefined) {
            this.telemetry.modelCalls += delta.modelCalls;
        }
        if (delta.promptTokens !== undefined) {
            this.telemetry.promptTokens += delta.promptTokens;
        }
        if (delta.completionTokens !== undefined) {
            this.telemetry.completionTokens += delta.completionTokens;
        }
        if (delta.executionTimeMs !== undefined) {
            this.telemetry.executionTimeMs += delta.executionTimeMs;
        }
        if (delta.modelCalls !== undefined && delta.modelCalls > 0) {
            this.telemetryCollector.recordModelCall(phase, (_a = delta.promptTokens) !== null && _a !== void 0 ? _a : 0, (_b = delta.completionTokens) !== null && _b !== void 0 ? _b : 0, (_c = delta.executionTimeMs) !== null && _c !== void 0 ? _c : 0);
        }
        else if (delta.executionTimeMs !== undefined) {
            this.telemetryCollector.recordExecutionTime(phase, delta.executionTimeMs);
        }
        this.onTelemetryUpdate(this.telemetry);
    };
    /**
     * Execute a model call and return artifacts on success.
     *
     * @param phase - The protocol phase.
     * @returns Action result with success status.
     */
    CliOperations.prototype.executeModelCall = function (phase) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, client, modelAlias, result, error, errorMessage, recoverable, elapsed, error_2, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.ensureModelClient()];
                    case 2:
                        client = _a.sent();
                        modelAlias = getModelAliasForPhase(phase);
                        return [4 /*yield*/, client.prompt(modelAlias, "Execute ".concat(phase, " phase"))];
                    case 3:
                        result = _a.sent();
                        if (!result.success) {
                            error = result.error;
                            errorMessage = "Model call failed: ".concat(error.message);
                            recoverable = true;
                            switch (error.kind) {
                                case 'AuthenticationError':
                                    errorMessage =
                                        "Authentication failed: ".concat(error.message, "\n\n") +
                                            'Please check your API key or Claude Code authentication.';
                                    recoverable = false;
                                    break;
                                case 'RateLimitError':
                                    errorMessage = "Rate limit exceeded: ".concat(error.message);
                                    if (error.retryAfterMs !== undefined) {
                                        errorMessage += "\nWait ".concat(Math.ceil(error.retryAfterMs / 1000).toString(), "s before retrying.");
                                    }
                                    break;
                                case 'TimeoutError':
                                    errorMessage = "Model call timed out after ".concat(String(error.timeoutMs), "ms");
                                    break;
                                case 'NetworkError':
                                    errorMessage = "Network error: ".concat(error.message);
                                    break;
                                default:
                                    errorMessage = "Model error: ".concat(error.message);
                            }
                            return [2 /*return*/, {
                                    success: false,
                                    error: errorMessage,
                                    recoverable: recoverable,
                                }];
                        }
                        elapsed = Date.now() - startTime;
                        this.updateTelemetry({
                            modelCalls: 1,
                            promptTokens: result.response.usage.promptTokens,
                            completionTokens: result.response.usage.completionTokens,
                            executionTimeMs: elapsed,
                        }, phase);
                        return [2 /*return*/, {
                                success: true,
                            }];
                    case 4:
                        error_2 = _a.sent();
                        errorMessage = error_2 instanceof Error ? error_2.message : String(error_2);
                        return [2 /*return*/, {
                                success: false,
                                error: "Model call failed: ".concat(errorMessage),
                                recoverable: true,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run compilation and return result.
     *
     * @returns Action result with success status.
     */
    CliOperations.prototype.runCompilation = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, result, elapsed, error_3, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, execa_1.execa)('npm', ['run', 'build'], {
                                cwd: this.cwd,
                                reject: false,
                            })];
                    case 2:
                        result = _a.sent();
                        elapsed = Date.now() - startTime;
                        if (result.exitCode !== 0) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "Compilation failed with exit code ".concat(String(result.exitCode), "\n").concat(result.stderr),
                                    recoverable: true,
                                }];
                        }
                        this.updateTelemetry({
                            executionTimeMs: elapsed,
                        }, this.currentPhase);
                        return [2 /*return*/, {
                                success: true,
                            }];
                    case 3:
                        error_3 = _a.sent();
                        errorMessage = error_3 instanceof Error ? error_3.message : String(error_3);
                        return [2 /*return*/, {
                                success: false,
                                error: "Compilation failed: ".concat(errorMessage),
                                recoverable: true,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run tests and return result.
     *
     * @returns Action result with success status.
     */
    CliOperations.prototype.runTests = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, result, elapsed, error_4, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, execa_1.execa)('npm', ['test', '--', '--run'], {
                                cwd: this.cwd,
                                reject: false,
                            })];
                    case 2:
                        result = _a.sent();
                        elapsed = Date.now() - startTime;
                        if (result.exitCode !== 0) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "Tests failed with exit code ".concat(String(result.exitCode), "\n").concat(result.stderr),
                                    recoverable: true,
                                }];
                        }
                        this.updateTelemetry({
                            executionTimeMs: elapsed,
                        }, this.currentPhase);
                        return [2 /*return*/, {
                                success: true,
                            }];
                    case 3:
                        error_4 = _a.sent();
                        errorMessage = error_4 instanceof Error ? error_4.message : String(error_4);
                        return [2 /*return*/, {
                                success: false,
                                error: "Tests failed: ".concat(errorMessage),
                                recoverable: true,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Archive artifacts for the completed phase.
     *
     * Creates a timestamped backup of the current state file.
     *
     * @param phase - The protocol phase being archived.
     * @returns Action result with success status.
     */
    CliOperations.prototype.archivePhaseArtifacts = function (phase) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, timestamp, stateDir, stateBasename, archiveDir, archivePath, elapsed, error_5, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        stateDir = node_path_1.default.dirname(this.statePath);
                        stateBasename = node_path_1.default.basename(this.statePath);
                        archiveDir = node_path_1.default.join(stateDir, '.criticality', 'archives');
                        return [4 /*yield*/, (0, promises_1.mkdir)(archiveDir, { recursive: true })];
                    case 2:
                        _a.sent();
                        archivePath = node_path_1.default.join(archiveDir, "".concat(stateBasename, ".").concat(phase, ".").concat(timestamp));
                        return [4 /*yield*/, (0, promises_1.copyFile)(this.statePath, archivePath)];
                    case 3:
                        _a.sent();
                        elapsed = Date.now() - startTime;
                        this.updateTelemetry({
                            executionTimeMs: elapsed,
                        }, phase);
                        return [2 /*return*/, {
                                success: true,
                            }];
                    case 4:
                        error_5 = _a.sent();
                        errorMessage = error_5 instanceof Error ? error_5.message : String(error_5);
                        return [2 /*return*/, {
                                success: false,
                                error: "Archive failed: ".concat(errorMessage),
                                recoverable: true,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send blocking notification.
     *
     * Triggers notification hooks configured in criticality.toml.
     *
     * @param query - The blocking query.
     */
    CliOperations.prototype.sendBlockingNotification = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var endpoint, channel, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, , 5]);
                        if (!this.config.notifications.enabled) {
                            return [2 /*return*/];
                        }
                        endpoint = this.config.notifications.endpoint;
                        if (endpoint === undefined) {
                            return [2 /*return*/];
                        }
                        channel = this.config.notifications.channel;
                        if (!(channel === 'webhook' && endpoint)) return [3 /*break*/, 2];
                        return [4 /*yield*/, (0, execa_1.execa)('curl', [
                                '-X',
                                'POST',
                                '-H',
                                'Content-Type: application/json',
                                '-d',
                                JSON.stringify({ query: query }),
                                endpoint,
                            ], {
                                cwd: this.cwd,
                                reject: false,
                            })];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2: return [4 /*yield*/, this.hooksExecutor.onBlock(query)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _b.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets the current telemetry data.
     *
     * @returns The collected telemetry.
     */
    CliOperations.prototype.getTelemetry = function () {
        return __assign({}, this.telemetry);
    };
    /**
     * Gets per-phase telemetry data.
     *
     * @returns The collected telemetry data with per-phase breakdown.
     */
    CliOperations.prototype.getPerPhaseTelemetry = function () {
        return this.telemetryCollector.getTelemetryData();
    };
    /**
     * Resets telemetry counters.
     */
    CliOperations.prototype.resetTelemetry = function () {
        this.telemetry = {
            modelCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
            executionTimeMs: 0,
        };
        this.telemetryCollector.reset();
        this.onTelemetryUpdate(this.telemetry);
    };
    return CliOperations;
}());
exports.CliOperations = CliOperations;
/**
 * Creates CLI operations with the given configuration.
 *
 * @param options - Configuration options.
 * @returns A configured CliOperations instance.
 */
function createCliOperations(options) {
    return __awaiter(this, void 0, void 0, function () {
        var telemetryCollector, operations;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    telemetryCollector = (_a = options.telemetryCollector) !== null && _a !== void 0 ? _a : new telemetry_js_1.TelemetryCollector();
                    operations = new CliOperations(__assign(__assign({}, options), { telemetryCollector: telemetryCollector }));
                    return [4 /*yield*/, operations.ensureModelClient()];
                case 1:
                    _b.sent();
                    return [2 /*return*/, operations];
            }
        });
    });
}
