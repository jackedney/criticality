"use strict";
/**
 * Protocol orchestrator tick loop module.
 *
 * Implements the tick loop execution model as specified in orch_006:
 * Each tick evaluates guards, executes one transition, and persists state.
 *
 * The orchestrator is deterministic and performs no reasoning (orch_001).
 * It performs CLASSIFICATION not REASONING (orch_003).
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
exports.Actions = exports.Guards = void 0;
exports.executeTick = executeTick;
exports.createOrchestrator = createOrchestrator;
exports.getProtocolStatus = getProtocolStatus;
var transitions_js_1 = require("./transitions.js");
var blocking_js_1 = require("./blocking.js");
var persistence_js_1 = require("./persistence.js");
var checkpoint_js_1 = require("./checkpoint.js");
var types_js_1 = require("./types.js");
/**
 * Composable guard combinators.
 * Per orch_005: composable guards (and/or/not).
 */
exports.Guards = {
    /** Combine guards with AND logic. */
    and: function () {
        var guards = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            guards[_i] = arguments[_i];
        }
        return function (ctx) {
            return guards.every(function (g) { return g(ctx); });
        };
    },
    /** Combine guards with OR logic. */
    or: function () {
        var guards = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            guards[_i] = arguments[_i];
        }
        return function (ctx) {
            return guards.some(function (g) { return g(ctx); });
        };
    },
    /** Negate a guard. */
    not: function (guard) {
        return function (ctx) {
            return !guard(ctx);
        };
    },
    /** Guard that checks if artifacts are available. */
    hasArtifacts: function () {
        var artifacts = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            artifacts[_i] = arguments[_i];
        }
        return function (ctx) {
            return artifacts.every(function (a) { return ctx.artifacts.has(a); });
        };
    },
    /** Guard that checks if in active substate. */
    isActive: function () { return function (ctx) { return ctx.snapshot.state.substate.kind === 'Active'; }; },
    /** Guard that checks if blocking is resolved. */
    blockingResolved: function () { return function (ctx) { return ctx.pendingResolutions.length > 0; }; },
    /** Guard that always returns true. */
    always: function () { return function () { return true; }; },
    /** Guard that always returns false. */
    never: function () { return function () { return false; }; },
};
/**
 * Sequenceable action combinators.
 * Per orch_005: sequenceable actions.
 */
exports.Actions = {
    /** Execute actions in sequence, stopping on first failure. */
    sequence: function () {
        var actions = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            actions[_i] = arguments[_i];
        }
        return function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
            var collectedArtifacts, _i, actions_1, action, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        collectedArtifacts = [];
                        _i = 0, actions_1 = actions;
                        _a.label = 1;
                    case 1:
                        if (!(_i < actions_1.length)) return [3 /*break*/, 4];
                        action = actions_1[_i];
                        return [4 /*yield*/, action(ctx)];
                    case 2:
                        result = _a.sent();
                        if (!result.success) {
                            return [2 /*return*/, result];
                        }
                        if (result.artifacts !== undefined) {
                            collectedArtifacts.push.apply(collectedArtifacts, result.artifacts);
                        }
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        // Return with or without artifacts (avoiding undefined assignment for exactOptionalPropertyTypes)
                        if (collectedArtifacts.length > 0) {
                            return [2 /*return*/, { success: true, artifacts: collectedArtifacts }];
                        }
                        return [2 /*return*/, { success: true }];
                }
            });
        }); };
    },
    /** Create an action that produces specified artifacts. */
    produceArtifacts: function () {
        var artifacts = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            artifacts[_i] = arguments[_i];
        }
        return function () {
            return Promise.resolve({
                success: true,
                artifacts: artifacts,
            });
        };
    },
    /** Create an action that does nothing (no-op). */
    noop: function () { return function () { return Promise.resolve({ success: true }); }; },
    /** Create an action that calls external model. */
    callModel: function (phase) {
        return function (ctx) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, ctx.operations.executeModelCall(phase)];
        }); }); };
    },
    /** Create an action that runs compilation. */
    compile: function () { return function (ctx) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/, ctx.operations.runCompilation()];
    }); }); }; },
    /** Create an action that runs tests. */
    test: function () { return function (ctx) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/, ctx.operations.runTests()];
    }); }); }; },
    /** Create an action that archives phase artifacts. */
    archive: function (phase) {
        return function (ctx) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, ctx.operations.archivePhaseArtifacts(phase)];
        }); }); };
    },
};
/**
 * Get required artifacts for transitioning to a phase.
 *
 * @param toPhase - The target phase.
 * @returns Array of required artifact types.
 */
function getRequiredArtifactsForPhase(toPhase) {
    var _a;
    return (_a = transitions_js_1.REQUIRED_ARTIFACTS.get(toPhase)) !== null && _a !== void 0 ? _a : [];
}
/**
 * Check if all required artifacts are available for a transition.
 *
 * @param toPhase - Target phase.
 * @param available - Available artifacts.
 * @returns True if all required artifacts are present.
 */
function hasRequiredArtifacts(toPhase, available) {
    var required = getRequiredArtifactsForPhase(toPhase);
    return required.every(function (a) { return available.has(a); });
}
/**
 * Execute a single tick of the orchestrator.
 *
 * Per orch_006: Each tick evaluates guards, executes one transition, persists state.
 *
 * @param context - The tick context.
 * @param statePath - Path to persist state.
 * @returns The tick result.
 */
function executeTick(context, statePath) {
    return __awaiter(this, void 0, void 0, function () {
        var snapshot, _a, phase, substate, blockingRecordBase, blockingRecord, timeoutCheck, failedSubstate, newSnapshot, resolution, activeSubstate, newSnapshot, validTargets, _i, validTargets_1, targetPhase, transitionResult, newSnapshot;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    snapshot = context.snapshot;
                    _a = snapshot.state, phase = _a.phase, substate = _a.substate;
                    // Check if already complete
                    if (phase === 'Complete') {
                        return [2 /*return*/, {
                                transitioned: false,
                                snapshot: snapshot,
                                shouldContinue: false,
                                stopReason: 'COMPLETE',
                            }];
                    }
                    // Check if in failed state
                    if (substate.kind === 'Failed') {
                        return [2 /*return*/, {
                                transitioned: false,
                                snapshot: snapshot,
                                shouldContinue: false,
                                stopReason: 'FAILED',
                                error: substate.error,
                            }];
                    }
                    if (!(substate.kind === 'Blocking')) return [3 /*break*/, 5];
                    blockingRecordBase = {
                        id: "blocking-".concat(snapshot.state.phase),
                        phase: snapshot.state.phase,
                        query: substate.query,
                        blockedAt: substate.blockedAt,
                        resolved: false,
                    };
                    blockingRecord = substate.timeoutMs !== undefined
                        ? __assign(__assign({}, blockingRecordBase), { timeoutMs: substate.timeoutMs }) : blockingRecordBase;
                    timeoutCheck = (0, blocking_js_1.checkTimeout)(blockingRecord);
                    if (!timeoutCheck.timedOut) return [3 /*break*/, 2];
                    failedSubstate = (0, types_js_1.createFailedSubstate)({
                        error: "Blocking query timed out: ".concat(substate.query),
                        code: 'TIMEOUT',
                        recoverable: true,
                    });
                    newSnapshot = __assign(__assign({}, snapshot), { state: { phase: phase, substate: failedSubstate } });
                    return [4 /*yield*/, (0, persistence_js_1.saveState)(newSnapshot, statePath)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, {
                            transitioned: true,
                            snapshot: newSnapshot,
                            shouldContinue: false,
                            stopReason: 'FAILED',
                            error: "Blocking query timed out after ".concat(String((_b = substate.timeoutMs) !== null && _b !== void 0 ? _b : 0), "ms"),
                        }];
                case 2:
                    if (!(context.pendingResolutions.length > 0)) return [3 /*break*/, 4];
                    resolution = context.pendingResolutions[0];
                    if (!(resolution !== undefined)) return [3 /*break*/, 4];
                    activeSubstate = (0, types_js_1.createActiveSubstate)();
                    newSnapshot = __assign(__assign({}, snapshot), { state: { phase: phase, substate: activeSubstate } });
                    return [4 /*yield*/, (0, persistence_js_1.saveState)(newSnapshot, statePath)];
                case 3:
                    _c.sent();
                    return [2 /*return*/, {
                            transitioned: true,
                            snapshot: newSnapshot,
                            shouldContinue: true,
                        }];
                case 4: 
                // Still blocked, wait for resolution
                return [2 /*return*/, {
                        transitioned: false,
                        snapshot: snapshot,
                        shouldContinue: false,
                        stopReason: 'BLOCKED',
                    }];
                case 5:
                    validTargets = (0, transitions_js_1.getValidTransitions)(phase);
                    if (validTargets.length === 0) {
                        return [2 /*return*/, {
                                transitioned: false,
                                snapshot: snapshot,
                                shouldContinue: false,
                                stopReason: 'NO_VALID_TRANSITION',
                            }];
                    }
                    _i = 0, validTargets_1 = validTargets;
                    _c.label = 6;
                case 6:
                    if (!(_i < validTargets_1.length)) return [3 /*break*/, 9];
                    targetPhase = validTargets_1[_i];
                    if (!hasRequiredArtifacts(targetPhase, context.artifacts)) return [3 /*break*/, 8];
                    transitionResult = (0, transitions_js_1.transition)(snapshot.state, targetPhase, {
                        artifacts: { available: context.artifacts },
                    });
                    if (!transitionResult.success) return [3 /*break*/, 8];
                    newSnapshot = {
                        state: transitionResult.state,
                        artifacts: __spreadArray([], snapshot.artifacts, true),
                        blockingQueries: snapshot.blockingQueries,
                    };
                    return [4 /*yield*/, (0, persistence_js_1.saveState)(newSnapshot, statePath)];
                case 7:
                    _c.sent();
                    return [2 /*return*/, {
                            transitioned: true,
                            snapshot: newSnapshot,
                            shouldContinue: transitionResult.state.phase !== 'Complete',
                        }];
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9: 
                // No transition possible with current artifacts
                return [2 /*return*/, {
                        transitioned: false,
                        snapshot: snapshot,
                        shouldContinue: true, // Continue waiting for artifacts
                    }];
            }
        });
    });
}
/**
 * Create an orchestrator instance.
 *
 * @param options - Orchestrator options.
 * @returns Orchestrator state and control functions.
 */
function createOrchestrator(options) {
    return __awaiter(this, void 0, void 0, function () {
        /**
         * Execute a single tick.
         */
        function tick() {
            return __awaiter(this, void 0, void 0, function () {
                var context, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            context = {
                                snapshot: currentSnapshot,
                                artifacts: collectedArtifacts,
                                pendingResolutions: pendingResolutions,
                                operations: operations,
                            };
                            return [4 /*yield*/, executeTick(context, statePath)];
                        case 1:
                            result = _a.sent();
                            currentSnapshot = result.snapshot;
                            orchestratorState.snapshot = result.snapshot;
                            orchestratorState.tickCount++;
                            orchestratorState.lastTickResult = result;
                            // Clear pending resolutions after processing
                            if (result.transitioned && pendingResolutions.length > 0) {
                                pendingResolutions.length = 0;
                            }
                            return [2 /*return*/, result];
                    }
                });
            });
        }
        /**
         * Run the tick loop until completion, blocking, or failure.
         */
        function run() {
            return __awaiter(this, void 0, void 0, function () {
                var result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            orchestratorState.running = true;
                            _a.label = 1;
                        case 1: return [4 /*yield*/, tick()];
                        case 2:
                            result = _a.sent();
                            if (orchestratorState.tickCount >= maxTicks) {
                                orchestratorState.running = false;
                                return [2 /*return*/, __assign(__assign({}, result), { shouldContinue: false, stopReason: 'EXTERNAL_ERROR', error: "Maximum tick limit (".concat(String(maxTicks), ") reached") })];
                            }
                            _a.label = 3;
                        case 3:
                            if (result.shouldContinue) return [3 /*break*/, 1];
                            _a.label = 4;
                        case 4:
                            orchestratorState.running = false;
                            return [2 /*return*/, result];
                    }
                });
            });
        }
        /**
         * Add an artifact to the available set.
         */
        function addArtifact(artifact) {
            collectedArtifacts.add(artifact);
        }
        /**
         * Add a blocking resolution.
         */
        function addResolution(response) {
            pendingResolutions.push({
                response: response,
                resolvedAt: new Date().toISOString(),
            });
        }
        var statePath, operations, _a, maxTicks, startupResult, currentSnapshot, orchestratorState, collectedArtifacts, pendingResolutions;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    statePath = options.statePath, operations = options.operations, _a = options.maxTicks, maxTicks = _a === void 0 ? 1000 : _a;
                    return [4 /*yield*/, (0, checkpoint_js_1.getStartupState)(statePath)];
                case 1:
                    startupResult = _b.sent();
                    currentSnapshot = startupResult.snapshot;
                    orchestratorState = {
                        snapshot: currentSnapshot,
                        tickCount: 0,
                        running: false,
                        lastTickResult: undefined,
                    };
                    collectedArtifacts = new Set(currentSnapshot.artifacts);
                    pendingResolutions = [];
                    return [2 /*return*/, {
                            state: orchestratorState,
                            tick: tick,
                            run: run,
                            addArtifact: addArtifact,
                            resolveBlocking: addResolution,
                        }];
            }
        });
    });
}
/**
 * Get the current status of the protocol from a state snapshot.
 *
 * @param snapshot - The state snapshot.
 * @returns Human-readable status information.
 */
function getProtocolStatus(snapshot) {
    var state = snapshot.state, artifacts = snapshot.artifacts;
    var phase = state.phase, substate = state.substate;
    var blocking;
    var failed;
    if (substate.kind === 'Blocking') {
        blocking = {
            query: substate.query,
            blockedAt: substate.blockedAt,
        };
    }
    else if (substate.kind === 'Failed') {
        failed = {
            error: substate.error,
            recoverable: substate.recoverable,
        };
    }
    return {
        phase: phase,
        substate: substate.kind,
        artifacts: artifacts,
        blocking: blocking,
        failed: failed,
    };
}
