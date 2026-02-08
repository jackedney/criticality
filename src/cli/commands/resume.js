"use strict";
/**
 * Resume command handler for the Criticality Protocol CLI.
 *
 * Allows users to continue protocol execution from a blocked state
 * after resolving blocking queries.
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
exports.handleResumeCommand = handleResumeCommand;
var persistence_js_1 = require("../../protocol/persistence.js");
var state_js_1 = require("../state.js");
var persistence_js_2 = require("../../ledger/persistence.js");
var displayUtils_js_1 = require("../utils/displayUtils.js");
var orchestrator_js_1 = require("../../protocol/orchestrator.js");
var LiveDisplay_js_1 = require("../components/LiveDisplay.js");
var operations_js_1 = require("../operations.js");
var telemetry_js_1 = require("../telemetry.js");
var node_fs_1 = require("node:fs");
var index_js_1 = require("../../config/index.js");
var errors_js_1 = require("../errors.js");
/**
 * Loads configuration from criticality.toml.
 *
 * @returns The loaded configuration or defaults.
 */
function loadCliConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var configFilePath, tomlContent, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    configFilePath = 'criticality.toml';
                    if (!(0, node_fs_1.existsSync)(configFilePath)) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    tomlContent = (0, node_fs_1.readFileSync)(configFilePath, 'utf-8');
                    return [4 /*yield*/, (0, index_js_1.parseConfig)(tomlContent)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    error_1 = _a.sent();
                    console.warn("Warning: Failed to load config from ".concat(configFilePath, ": ").concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                    console.warn('Using default CLI settings.');
                    return [3 /*break*/, 4];
                case 4: return [4 /*yield*/, (0, index_js_1.parseConfig)('')];
                case 5: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Telemetry state for tracking operations.
 */
var telemetry = {
    modelCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    executionTimeMs: 0,
};
/**
 * Telemetry collector for per-phase tracking.
 */
var telemetryCollector = null;
/**
 * Gets the state file path.
 *
 * @returns The state file path.
 */
function getStatePath() {
    return (0, state_js_1.getDefaultStatePath)();
}
/**
 * Formats decisions summary for display.
 *
 * @param decisions - Array of decisions.
 * @param options - Display options.
 * @returns The formatted decisions text.
 */
function formatDecisionsSummary(decisions, options) {
    if (decisions.length === 0) {
        return 'No new decisions since block';
    }
    var boldCode = options.colors ? '\x1b[1m' : '';
    var resetCode = options.colors ? '\x1b[0m' : '';
    var dimCode = options.colors ? '\x1b[2m' : '';
    var yellowCode = options.colors ? '\x1b[33m' : '';
    var result = "".concat(boldCode).concat(String(decisions.length), " decision").concat(decisions.length === 1 ? '' : 's', " made since block:").concat(resetCode, "\n");
    for (var _i = 0, decisions_1 = decisions; _i < decisions_1.length; _i++) {
        var decision = decisions_1[_i];
        var timeAgo = (0, displayUtils_js_1.formatRelativeTime)(decision.timestamp);
        var confidence = (0, displayUtils_js_1.formatConfidence)(decision.confidence, options);
        // Highlight superseded or invalidated decisions
        var statusPrefix = '';
        if (decision.status === 'superseded') {
            statusPrefix = "".concat(yellowCode, "[superseded]").concat(resetCode, " ");
        }
        else if (decision.status === 'invalidated') {
            statusPrefix = "".concat(dimCode, "[invalidated]").concat(resetCode, " ");
        }
        result += "".concat(statusPrefix).concat(decision.id, " (").concat(timeAgo, ") ").concat(confidence, " ").concat(decision.constraint, "\n");
    }
    return result;
}
/**
 * Displays the resume summary with decisions made since blocking.
 *
 * @param snapshot - The CLI state snapshot.
 * @param statePath - Path to the ledger file.
 * @param options - Display options.
 */
function displayResumeSummary(snapshot, statePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var ledgerPath, decisions, ledger, blockTimestamps, earliestBlockTime_1, _a, decisionsSummary;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ledgerPath = (0, state_js_1.getDefaultLedgerPath)(statePath);
                    decisions = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, persistence_js_2.loadLedger)(ledgerPath)];
                case 2:
                    ledger = _b.sent();
                    decisions = ledger.getDecisions();
                    blockTimestamps = snapshot.resolvedQueries.map(function (r) { return r.record.blockedAt; });
                    earliestBlockTime_1 = blockTimestamps.length > 0
                        ? new Date(Math.min.apply(Math, blockTimestamps.map(function (t) { return new Date(t).getTime(); })))
                        : new Date();
                    // Filter decisions made since the block started
                    decisions = decisions.filter(function (d) {
                        var decisionTime = new Date(d.timestamp).getTime();
                        return decisionTime >= earliestBlockTime_1.getTime();
                    });
                    // Sort decisions chronologically
                    decisions = decisions.slice().sort(function (a, b) {
                        var timeA = new Date(a.timestamp).getTime();
                        var timeB = new Date(b.timestamp).getTime();
                        return timeA - timeB;
                    });
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    decisions = [];
                    return [3 /*break*/, 4];
                case 4:
                    decisionsSummary = formatDecisionsSummary(decisions, options);
                    console.log((0, displayUtils_js_1.wrapInBox)(decisionsSummary, options));
                    console.log();
                    console.log("Resuming protocol from ".concat(snapshot.state.phase, "..."));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Formats phases completed for display.
 *
 * @param artifacts - Available artifacts.
 * @returns Array of completed phase names.
 */
function getPhasesCompleted(artifacts) {
    var phaseArtifactMap = {
        Ignition: ['spec'],
        Lattice: ['lattice'],
        CompositionAudit: [],
        Injection: ['types', 'implementation'],
        Mesoscopic: ['tests'],
        MassDefect: [],
    };
    var completed = [];
    for (var _i = 0, _a = Object.entries(phaseArtifactMap); _i < _a.length; _i++) {
        var _b = _a[_i], phase = _b[0], requiredArtifacts = _b[1];
        if (requiredArtifacts.length === 0) {
            continue;
        }
        var allArtifactsPresent = requiredArtifacts.every(function (artifact) { return artifacts.includes(artifact); });
        if (allArtifactsPresent) {
            completed.push(phase);
        }
    }
    return completed;
}
/**
 * Formats compact summary line.
 *
 * @param data - Summary data.
 * @param options - Display options.
 * @param blockingQueryId - Optional blocking query ID.
 * @returns Formatted summary line.
 */
function formatCompactSummary(data, options, blockingQueryId) {
    var boldCode = options.colors ? '\x1b[1m' : '';
    var resetCode = options.colors ? '\x1b[0m' : '';
    var greenCode = options.colors ? '\x1b[32m' : '';
    var yellowCode = options.colors ? '\x1b[33m' : '';
    var parts = [];
    parts.push("Executed ".concat(String(data.tickCount), " ticks in ").concat(data.elapsedSec, "s"));
    if (data.phasesCompleted.length > 0) {
        var firstPhase = data.phasesCompleted[0];
        if (firstPhase === undefined) {
            return boldCode + parts.join(' | ') + resetCode;
        }
        var phaseStr = firstPhase;
        if (data.phasesCompleted.length > 1) {
            var lastPhase = data.phasesCompleted[data.phasesCompleted.length - 1];
            if (lastPhase !== undefined) {
                phaseStr = "".concat(phaseStr, " \u2192 ").concat(lastPhase);
            }
        }
        var completedStr = greenCode + 'Completed: ' + phaseStr + resetCode;
        parts.push(completedStr);
    }
    if (data.decisionsMade > 0) {
        parts.push("".concat(String(data.decisionsMade), " decision").concat(data.decisionsMade === 1 ? '' : 's', " made"));
    }
    if (data.stopReason === 'BLOCKED') {
        var idStr = blockingQueryId !== null && blockingQueryId !== void 0 ? blockingQueryId : 'unknown';
        var blockedStr = yellowCode + 'Blocked: ' + idStr + resetCode;
        parts.push(blockedStr);
    }
    else if (data.stopReason === 'COMPLETE') {
        var finishedStr = greenCode + 'Finished' + resetCode;
        parts.push(finishedStr);
    }
    else if (data.stopReason === 'FAILED') {
        parts.push('Failed');
    }
    else if (data.stopReason === 'EXTERNAL_ERROR') {
        parts.push('Interrupted');
    }
    var summaryLine = boldCode + parts.join(' | ') + resetCode;
    return summaryLine;
}
/**
 * Displays execution summary after tick loop completion.
 *
 * @param tickCount - Number of ticks executed.
 * @param stopReason - Reason for stopping.
 * @param snapshot - Final state snapshot.
 * @param startTime - When execution started.
 * @param initialSnapshot - Initial state snapshot before execution.
 * @param options - Display options.
 */
function displayExecutionSummary(tickCount, stopReason, snapshot, startTime, initialSnapshot, options) {
    return __awaiter(this, void 0, void 0, function () {
        var elapsed, elapsedSec, boldCode, resetCode, yellowCode, greenCode, redCode, phasesCompleted, substate, decisionsMade, latestBlockTime, ledgerPath, ledger, allDecisions, blockTimestamp_1, _a, blockingQueryId, summaryData, _i, _b, artifact;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    elapsed = Date.now() - startTime;
                    elapsedSec = (elapsed / 1000).toFixed(1);
                    boldCode = options.colors ? '\x1b[1m' : '';
                    resetCode = options.colors ? '\x1b[0m' : '';
                    yellowCode = options.colors ? '\x1b[33m' : '';
                    greenCode = options.colors ? '\x1b[32m' : '';
                    redCode = options.colors ? '\x1b[31m' : '';
                    phasesCompleted = getPhasesCompleted(snapshot.artifacts);
                    substate = snapshot.state.substate;
                    decisionsMade = 0;
                    if (!(initialSnapshot.resolvedQueries.length > 0)) return [3 /*break*/, 4];
                    latestBlockTime = (_c = initialSnapshot.resolvedQueries[initialSnapshot.resolvedQueries.length - 1]) === null || _c === void 0 ? void 0 : _c.record.blockedAt;
                    if (!(latestBlockTime !== undefined)) return [3 /*break*/, 4];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    ledgerPath = (0, state_js_1.getDefaultLedgerPath)(getStatePath());
                    return [4 /*yield*/, (0, persistence_js_2.loadLedger)(ledgerPath)];
                case 2:
                    ledger = _e.sent();
                    allDecisions = ledger.getDecisions();
                    blockTimestamp_1 = new Date(latestBlockTime).getTime();
                    decisionsMade = allDecisions.filter(function (d) {
                        var decisionTimestamp = new Date(d.timestamp).getTime();
                        return decisionTimestamp >= blockTimestamp_1;
                    }).length;
                    return [3 /*break*/, 4];
                case 3:
                    _a = _e.sent();
                    decisionsMade = 0;
                    return [3 /*break*/, 4];
                case 4:
                    blockingQueryId = (_d = snapshot.blockingQueries.find(function (q) { return !q.resolved; })) === null || _d === void 0 ? void 0 : _d.id;
                    summaryData = {
                        tickCount: tickCount,
                        elapsedSec: elapsedSec,
                        currentPhase: snapshot.state.phase,
                        phasesCompleted: phasesCompleted,
                        decisionsMade: decisionsMade,
                        stopReason: stopReason,
                    };
                    console.log();
                    if (tickCount === 0 && stopReason === 'BLOCKED') {
                        console.log("".concat(yellowCode, "Already blocked, no ticks executed").concat(resetCode));
                        console.log();
                        console.log("".concat(boldCode, "Blocking Query:").concat(resetCode, " ").concat(substate.kind === 'Blocking' ? substate.query : 'Unknown'));
                        console.log();
                        console.log("Run ".concat(greenCode, "crit resolve").concat(resetCode, " to continue."));
                        return [2 /*return*/];
                    }
                    console.log(formatCompactSummary(summaryData, options, blockingQueryId));
                    console.log();
                    if (telemetry.modelCalls > 0) {
                        console.log("".concat(boldCode, "Telemetry").concat(resetCode));
                        console.log("  Model calls: ".concat(String(telemetry.modelCalls)));
                        console.log("  Prompt tokens: ".concat(String(telemetry.promptTokens)));
                        console.log("  Completion tokens: ".concat(String(telemetry.completionTokens)));
                        console.log("  Total tokens: ".concat(String(telemetry.promptTokens + telemetry.completionTokens)));
                        console.log();
                    }
                    if (substate.kind === 'Blocking') {
                        console.log("".concat(yellowCode, "Status: Blocked").concat(resetCode));
                        console.log("  Query: ".concat(substate.query.substring(0, 80)).concat(substate.query.length > 80 ? '...' : ''));
                        console.log();
                        console.log("Run ".concat(greenCode, "crit resolve").concat(resetCode, " to continue."));
                    }
                    else if (substate.kind === 'Failed') {
                        console.log("".concat(redCode, "Status: Failed").concat(resetCode));
                        console.log("  Error: ".concat(substate.error));
                        if (substate.recoverable) {
                            console.log();
                            console.log("".concat(yellowCode, "This error is recoverable.").concat(resetCode));
                        }
                    }
                    else if (stopReason === 'COMPLETE') {
                        console.log("".concat(greenCode, "Status: Complete").concat(resetCode));
                        console.log("  Protocol execution finished successfully.");
                        if (snapshot.artifacts.length > 0) {
                            console.log();
                            console.log("".concat(boldCode, "Artifacts:").concat(resetCode));
                            for (_i = 0, _b = snapshot.artifacts; _i < _b.length; _i++) {
                                artifact = _b[_i];
                                console.log("  - ".concat(artifact));
                            }
                        }
                    }
                    else if (stopReason === 'EXTERNAL_ERROR') {
                        console.log("".concat(yellowCode, "Status: Interrupted").concat(resetCode));
                        console.log("  Execution stopped by user (Ctrl+C).");
                        console.log("  State saved at current position.");
                    }
                    else {
                        console.log("Status: ".concat(stopReason));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Handles resume command.
 *
 * Checks for blocked state with resolved queries, displays decision summary,
 * and triggers protocol orchestrator to continue execution.
 *
 * @param context - The CLI context.
 * @returns A promise resolving to command result.
 */
function handleResumeCommand(context) {
    return __awaiter(this, void 0, void 0, function () {
        var options, statePath, startTime, gracefulShutdown, snapshot, config, operations, orchestrator, liveDisplay_1, sigintHandler, result, tickCount, shouldContinueLoop, fromPhase, toPhase, telemetryData, currentState, updatedState, _a, telemetryData, currentState, updatedState, _b, errorType, error_2, message;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    options = {
                        colors: context.config.colors,
                        unicode: context.config.unicode,
                    };
                    statePath = getStatePath();
                    startTime = Date.now();
                    gracefulShutdown = false;
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 25, , 26]);
                    return [4 /*yield*/, (0, state_js_1.loadCliStateWithRecovery)(statePath)];
                case 2:
                    snapshot = _e.sent();
                    if (snapshot.resolvedQueries.length === 0) {
                        console.error('Error: No blocked state to resume');
                        return [2 /*return*/, { exitCode: 1, message: 'No resolved queries to resume from' }];
                    }
                    return [4 /*yield*/, displayResumeSummary(snapshot, statePath, options)];
                case 3:
                    _e.sent();
                    return [4 /*yield*/, loadCliConfig()];
                case 4:
                    config = _e.sent();
                    telemetryCollector = new telemetry_js_1.TelemetryCollector();
                    return [4 /*yield*/, (0, operations_js_1.createCliOperations)({
                            config: config,
                            statePath: statePath,
                            onTelemetryUpdate: function (newTelemetry) {
                                telemetry = newTelemetry;
                            },
                            telemetryCollector: telemetryCollector,
                        })];
                case 5:
                    operations = _e.sent();
                    return [4 /*yield*/, (0, orchestrator_js_1.createOrchestrator)({
                            statePath: statePath,
                            operations: operations,
                        })];
                case 6:
                    orchestrator = _e.sent();
                    liveDisplay_1 = new LiveDisplay_js_1.LiveDisplay({
                        colors: options.colors,
                        unicode: options.unicode,
                        maxLogEntries: 5,
                    });
                    liveDisplay_1.updatePhase(orchestrator.state.snapshot.state.phase, orchestrator.state.snapshot.state.substate);
                    liveDisplay_1.start();
                    sigintHandler = function () {
                        if (gracefulShutdown) {
                            // Second Ctrl+C: force exit
                            console.log('\nForce quitting...');
                            process.exit(1);
                        }
                        gracefulShutdown = true;
                        liveDisplay_1.stop();
                        console.log('Stopping... (Ctrl+C again to force quit)');
                    };
                    process.on('SIGINT', sigintHandler);
                    return [4 /*yield*/, orchestrator.tick()];
                case 7:
                    result = _e.sent();
                    tickCount = 0;
                    shouldContinueLoop = true;
                    _e.label = 8;
                case 8:
                    tickCount++;
                    // Update display with new phase/substate
                    liveDisplay_1.updatePhase(result.snapshot.state.phase, result.snapshot.state.substate);
                    // Add log entries for significant events
                    if (result.transitioned) {
                        fromPhase = orchestrator.state.snapshot.state.phase;
                        toPhase = result.snapshot.state.phase;
                        if (fromPhase !== toPhase) {
                            liveDisplay_1.addLog("Transitioned: ".concat(fromPhase, " \u2192 ").concat(toPhase));
                        }
                    }
                    if (!gracefulShutdown) return [3 /*break*/, 15];
                    // Stop after current tick
                    shouldContinueLoop = false;
                    liveDisplay_1.stop();
                    console.log('Interrupted by user');
                    console.log();
                    return [4 /*yield*/, displayExecutionSummary(tickCount, 'EXTERNAL_ERROR', orchestrator.state.snapshot, startTime, snapshot, options)];
                case 9:
                    _e.sent();
                    console.log();
                    if (!(telemetryCollector !== null)) return [3 /*break*/, 14];
                    telemetryData = telemetryCollector.getTelemetryData();
                    _e.label = 10;
                case 10:
                    _e.trys.push([10, 13, , 14]);
                    return [4 /*yield*/, (0, state_js_1.loadCliStateWithRecovery)(statePath)];
                case 11:
                    currentState = _e.sent();
                    updatedState = __assign(__assign({}, currentState), { telemetry: telemetryData });
                    return [4 /*yield*/, (0, state_js_1.saveCliState)(updatedState, statePath)];
                case 12:
                    _e.sent();
                    return [3 /*break*/, 14];
                case 13:
                    _a = _e.sent();
                    return [3 /*break*/, 14];
                case 14:
                    console.log('State saved successfully.');
                    return [2 /*return*/, { exitCode: 0 }];
                case 15:
                    // Stop if tick loop should not continue
                    if (!result.shouldContinue) {
                        shouldContinueLoop = false;
                    }
                    if (!shouldContinueLoop) return [3 /*break*/, 17];
                    return [4 /*yield*/, orchestrator.tick()];
                case 16:
                    result = _e.sent();
                    _e.label = 17;
                case 17:
                    if (shouldContinueLoop) return [3 /*break*/, 8];
                    _e.label = 18;
                case 18:
                    // Clean up
                    process.removeListener('SIGINT', sigintHandler);
                    liveDisplay_1.stop();
                    if (!(telemetryCollector !== null)) return [3 /*break*/, 23];
                    telemetryData = telemetryCollector.getTelemetryData();
                    _e.label = 19;
                case 19:
                    _e.trys.push([19, 22, , 23]);
                    return [4 /*yield*/, (0, state_js_1.loadCliStateWithRecovery)(statePath)];
                case 20:
                    currentState = _e.sent();
                    updatedState = __assign(__assign({}, currentState), { telemetry: telemetryData });
                    return [4 /*yield*/, (0, state_js_1.saveCliState)(updatedState, statePath)];
                case 21:
                    _e.sent();
                    return [3 /*break*/, 23];
                case 22:
                    _b = _e.sent();
                    return [3 /*break*/, 23];
                case 23: 
                // Display execution summary
                return [4 /*yield*/, displayExecutionSummary(tickCount, (_c = result.stopReason) !== null && _c !== void 0 ? _c : 'EXTERNAL_ERROR', result.snapshot, startTime, snapshot, options)];
                case 24:
                    // Display execution summary
                    _e.sent();
                    // Handle error states
                    if (result.stopReason === 'FAILED' && result.error !== undefined) {
                        errorType = (0, errors_js_1.inferErrorType)(result.error);
                        (0, errors_js_1.displayErrorWithSuggestions)(result.error, {
                            errorType: errorType,
                            phase: snapshot.state.phase,
                            details: {
                                recoverable: true,
                            },
                        }, options);
                        return [2 /*return*/, { exitCode: 1, message: result.error }];
                    }
                    return [2 /*return*/, { exitCode: 0 }];
                case 25:
                    error_2 = _e.sent();
                    if (error_2 instanceof persistence_js_1.StatePersistenceError) {
                        if (error_2.errorType === 'file_error' && ((_d = error_2.details) === null || _d === void 0 ? void 0 : _d.includes('does not exist'))) {
                            message = 'No protocol state found. Run criticality init to start.';
                            console.log(message);
                            return [2 /*return*/, { exitCode: 0 }];
                        }
                        console.error("Error loading state: ".concat(error_2.message));
                        return [2 /*return*/, { exitCode: 1, message: error_2.message }];
                    }
                    console.error("Unexpected error: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    return [2 /*return*/, { exitCode: 1 }];
                case 26: return [2 /*return*/];
            }
        });
    });
}
