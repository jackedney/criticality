"use strict";
/**
 * CLI state management module.
 *
 * Provides state read/write utilities for CLI with support for
 * tracking resolved queries and activity timestamps.
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
exports.getDefaultStatePath = getDefaultStatePath;
exports.getDefaultLedgerPath = getDefaultLedgerPath;
exports.createInitialCliState = createInitialCliState;
exports.loadCliState = loadCliState;
exports.saveCliState = saveCliState;
exports.updateStateAfterResolution = updateStateAfterResolution;
exports.loadCliStateWithRecovery = loadCliStateWithRecovery;
exports.withRecovery = withRecovery;
exports.loadStateWithRecovery = loadStateWithRecovery;
var persistence_js_1 = require("../protocol/persistence.js");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_readline_1 = require("node:readline");
var telemetry_js_1 = require("./telemetry.js");
/**
 * Default state file path for CLI state.
 */
var DEFAULT_STATE_PATH = '.criticality-state.json';
/**
 * Gets the default state file path.
 *
 * @returns The state file path.
 */
function getDefaultStatePath() {
    return DEFAULT_STATE_PATH;
}
/**
 * Gets the default ledger file path for a given state path.
 *
 * The ledger is stored in a .criticality subdirectory within the same
 * directory as the state file.
 *
 * @param statePath - Path to the state file.
 * @returns The ledger file path.
 */
function getDefaultLedgerPath(statePath) {
    return node_path_1.default.join(node_path_1.default.dirname(statePath), '.criticality', 'ledger');
}
/**
 * Creates an initial CLI state snapshot.
 *
 * @returns A new CLI state snapshot with current timestamp.
 */
function createInitialCliState() {
    var now = new Date().toISOString();
    return {
        state: {
            phase: 'Ignition',
            substate: { kind: 'Active' },
        },
        artifacts: [],
        blockingQueries: [],
        createdAt: now,
        lastActivity: now,
        resolvedQueries: [],
    };
}
/**
 * Loads CLI state from a file, migrating from legacy format if needed.
 *
 * @param filePath - Path to the state JSON file.
 * @returns The loaded CLI state snapshot.
 * @throws StatePersistenceError if file cannot be read or contains invalid data.
 */
function loadCliState(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var snapshot, error_1, fileError;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, persistence_js_1.loadState)(filePath)];
                case 1:
                    snapshot = _a.sent();
                    return [2 /*return*/, upgradeToCliState(snapshot)];
                case 2:
                    error_1 = _a.sent();
                    if (error_1 instanceof persistence_js_1.StatePersistenceError) {
                        throw error_1;
                    }
                    fileError = error_1 instanceof Error ? error_1 : new Error(String(error_1));
                    throw new persistence_js_1.StatePersistenceError("Failed to load CLI state from \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError });
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Saves CLI state to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the state file.
 *
 * @param snapshot - The CLI state snapshot to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws StatePersistenceError if file cannot be written.
 */
function saveCliState(snapshot, filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var serializedState, tempPath, writeError_1, _a, fileError, error_2, fileError;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 10, , 11]);
                    serializedState = serializeCliState(snapshot, options);
                    tempPath = "".concat(filePath, ".tmp");
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 9]);
                    return [4 /*yield*/, (0, promises_1.writeFile)(tempPath, serializedState, 'utf-8')];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, (0, promises_1.rename)(tempPath, filePath)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 9];
                case 4:
                    writeError_1 = _b.sent();
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, promises_1.unlink)(tempPath)];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _a = _b.sent();
                    return [3 /*break*/, 8];
                case 8:
                    fileError = writeError_1 instanceof Error ? writeError_1 : new Error(String(writeError_1));
                    throw new persistence_js_1.StatePersistenceError("Failed to save CLI state to \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError, details: 'Check that directory exists and is writable' });
                case 9: return [3 /*break*/, 11];
                case 10:
                    error_2 = _b.sent();
                    if (error_2 instanceof persistence_js_1.StatePersistenceError) {
                        throw error_2;
                    }
                    fileError = error_2 instanceof Error ? error_2 : new Error(String(error_2));
                    throw new persistence_js_1.StatePersistenceError("Failed to save CLI state to \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError });
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * Updates CLI state after resolving a query.
 *
 * Moves the resolved query from pending blocking queries to resolved queries,
 * updates the state to active, and updates the last activity timestamp.
 *
 * @param currentState - The current CLI state snapshot.
 * @param queryId - The ID of the query being resolved.
 * @param resolvedRecord - The updated blocking record with resolution.
 * @param newProtocolState - The new protocol state (should be Active).
 * @returns An updated CLI state snapshot.
 */
function updateStateAfterResolution(currentState, queryId, resolvedRecord, newProtocolState) {
    var now = new Date().toISOString();
    var resolvedQuery = {
        record: resolvedRecord,
        resolvedAt: now,
    };
    var updatedBlockingQueries = currentState.blockingQueries.filter(function (q) { return q.id !== queryId; });
    var updatedResolvedQueries = __spreadArray(__spreadArray([], currentState.resolvedQueries, true), [resolvedQuery], false);
    return {
        state: newProtocolState,
        artifacts: currentState.artifacts,
        blockingQueries: updatedBlockingQueries,
        createdAt: currentState.createdAt,
        lastActivity: now,
        resolvedQueries: updatedResolvedQueries,
    };
}
/**
 * Serializes a CLI state snapshot to JSON string.
 *
 * @param snapshot - The CLI state snapshot to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the CLI state.
 */
function serializeCliState(snapshot, options) {
    var _a;
    var createdAt = snapshot.createdAt, lastActivity = snapshot.lastActivity, resolvedQueries = snapshot.resolvedQueries, telemetry = snapshot.telemetry;
    var data = {
        state: snapshot.state,
        artifacts: snapshot.artifacts,
        blockingQueries: snapshot.blockingQueries,
        createdAt: createdAt,
        lastActivity: lastActivity,
        resolvedQueries: resolvedQueries,
        version: '1.0.0-cli',
    };
    if (telemetry !== undefined) {
        data.telemetry = telemetry_js_1.TelemetryCollector.serialize(telemetry);
    }
    var pretty = (options === null || options === void 0 ? void 0 : options.pretty) !== false;
    var indent = (_a = options === null || options === void 0 ? void 0 : options.indent) !== null && _a !== void 0 ? _a : 2;
    if (pretty) {
        return JSON.stringify(data, null, indent);
    }
    return JSON.stringify(data);
}
/**
 * Upgrades a legacy ProtocolStateSnapshot to a CliStateSnapshot.
 *
 * Adds createdAt, lastActivity, resolvedQueries, and telemetry fields with default values
 * if they don't exist (for backward compatibility).
 *
 * @param snapshot - The legacy protocol state snapshot.
 * @returns An upgraded CLI state snapshot.
 */
function upgradeToCliState(snapshot) {
    var _a, _b, _c;
    var now = new Date().toISOString();
    var maybeCliSnapshot = snapshot;
    var base = __assign(__assign({}, snapshot), { createdAt: (_a = maybeCliSnapshot.createdAt) !== null && _a !== void 0 ? _a : now, lastActivity: (_b = maybeCliSnapshot.lastActivity) !== null && _b !== void 0 ? _b : now, resolvedQueries: (_c = maybeCliSnapshot.resolvedQueries) !== null && _c !== void 0 ? _c : [] });
    if (maybeCliSnapshot.telemetry !== undefined) {
        try {
            return __assign(__assign({}, base), { telemetry: telemetry_js_1.TelemetryCollector.deserialize(maybeCliSnapshot.telemetry) });
        }
        catch (_d) {
            return base;
        }
    }
    return base;
}
/**
 * Loads CLI state with corruption detection and recovery.
 *
 * Attempts to load CLI state and provides user-friendly error handling
 * for corrupted state files, including offering recovery options.
 *
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded CLI state snapshot.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
function loadCliStateWithRecovery(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, withRecovery(function () { return loadCliState(filePath); }, function () { return __awaiter(_this, void 0, void 0, function () {
                    var initialState;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                initialState = createInitialCliState();
                                return [4 /*yield*/, saveCliState(initialState, filePath)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/, initialState];
                        }
                    });
                }); }, filePath, options)];
        });
    });
}
/**
 * Generic recovery helper for state loading with corruption handling.
 *
 * Encapsulates error classification, user prompting, file backup, and
 * recovery logic for corrupted state files.
 *
 * @template T - The type of state to load and return.
 * @param loadFn - Function that loads the state from the file.
 * @param resetFn - Function that creates and saves a fresh initial state.
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded or recovered state.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
function withRecovery(loadFn, resetFn, filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var promptUser, displayMessage, displayError, error_3, errorType, isCorruptableError, fileStats, lastModified, _a, response, normalizedResponse, timestamp, backupPath, initialState;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    promptUser = (_b = options === null || options === void 0 ? void 0 : options.promptUser) !== null && _b !== void 0 ? _b : defaultPromptUser;
                    displayMessage = (_c = options === null || options === void 0 ? void 0 : options.displayMessage) !== null && _c !== void 0 ? _c : console.log;
                    displayError = (_d = options === null || options === void 0 ? void 0 : options.displayError) !== null && _d !== void 0 ? _d : console.error;
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 11]);
                    return [4 /*yield*/, loadFn()];
                case 2: return [2 /*return*/, _e.sent()];
                case 3:
                    error_3 = _e.sent();
                    if (!(error_3 instanceof persistence_js_1.StatePersistenceError)) {
                        throw error_3;
                    }
                    errorType = error_3.errorType;
                    isCorruptableError = errorType === 'parse_error' ||
                        errorType === 'schema_error' ||
                        errorType === 'validation_error' ||
                        errorType === 'corruption_error';
                    if (!isCorruptableError) {
                        throw error_3;
                    }
                    displayMessage('');
                    displayMessage("State file corrupted: ".concat(error_3.message));
                    displayMessage('');
                    _e.label = 4;
                case 4:
                    _e.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, promises_1.stat)(filePath)];
                case 5:
                    fileStats = _e.sent();
                    lastModified = new Date(fileStats.mtime).toLocaleString();
                    displayMessage("File: ".concat(filePath));
                    displayMessage("Last modified: ".concat(lastModified));
                    return [3 /*break*/, 7];
                case 6:
                    _a = _e.sent();
                    displayMessage("File: ".concat(filePath));
                    return [3 /*break*/, 7];
                case 7:
                    displayMessage('');
                    displayError('The state file appears to be corrupted and cannot be loaded.');
                    displayMessage('');
                    return [4 /*yield*/, promptUser('Reset state to initial? This will lose current progress. (y/n): ')];
                case 8:
                    response = _e.sent();
                    normalizedResponse = response.trim().toLowerCase();
                    if (!(normalizedResponse === 'y' || normalizedResponse === 'yes')) return [3 /*break*/, 10];
                    try {
                        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        backupPath = "".concat(filePath, ".backup-").concat(timestamp);
                        (0, node_fs_1.renameSync)(filePath, backupPath);
                        displayMessage("Backup saved to: ".concat(backupPath));
                        displayMessage('');
                    }
                    catch (renameError) {
                        displayError("Warning: Could not backup corrupted file: ".concat(renameError instanceof Error ? renameError.message : String(renameError)));
                        displayMessage('Proceeding with reset anyway...');
                        displayMessage('');
                    }
                    return [4 /*yield*/, resetFn()];
                case 9:
                    initialState = _e.sent();
                    displayMessage('State has been reset to initial values.');
                    return [2 /*return*/, initialState];
                case 10:
                    displayMessage('State not modified. Please fix manually or backup and retry.');
                    throw new persistence_js_1.StatePersistenceError("State file corruption recovery declined by user: ".concat(error_3.message), errorType, { cause: error_3.cause, details: error_3.details });
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * Default user prompt handler using console readline.
 *
 * @param prompt - The prompt text to display.
 * @returns A promise resolving to the user's input.
 */
function defaultPromptUser(prompt) {
    return __awaiter(this, void 0, void 0, function () {
        var rl;
        return __generator(this, function (_a) {
            rl = node_readline_1.default.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            return [2 /*return*/, new Promise(function (resolve) {
                    rl.question(prompt, function (answer) {
                        rl.close();
                        resolve(answer);
                    });
                })];
        });
    });
}
/**
 * Loads protocol state with corruption detection and recovery.
 *
 * Attempts to load protocol state and provides user-friendly error handling
 * for corrupted state files, including offering recovery options.
 *
 * @param filePath - Path to the state JSON file.
 * @param options - Options for recovery behavior.
 * @returns The loaded protocol state snapshot.
 * @throws StatePersistenceError if file cannot be read or corruption is unrecoverable.
 */
function loadStateWithRecovery(filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, withRecovery(function () { return (0, persistence_js_1.loadState)(filePath); }, function () { return __awaiter(_this, void 0, void 0, function () {
                    var initialState;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                initialState = createInitialCliState();
                                return [4 /*yield*/, saveCliState(initialState, filePath)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/, {
                                        state: initialState.state,
                                        artifacts: initialState.artifacts,
                                        blockingQueries: initialState.blockingQueries,
                                    }];
                        }
                    });
                }); }, filePath, options)];
        });
    });
}
