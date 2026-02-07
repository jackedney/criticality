"use strict";
/**
 * Protocol checkpoint and resume module.
 *
 * Provides functionality to detect existing state on startup, validate state
 * integrity, resume protocol execution from the last checkpoint, and handle
 * stale or corrupted state gracefully.
 *
 * @packageDocumentation
 */
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
exports.DEFAULT_MAX_STATE_AGE_MS = void 0;
exports.detectExistingState = detectExistingState;
exports.validateStateIntegrity = validateStateIntegrity;
exports.validatePersistedStructure = validatePersistedStructure;
exports.resumeFromCheckpoint = resumeFromCheckpoint;
exports.getStartupState = getStartupState;
exports.isStateCorrupted = isStateCorrupted;
var safe_fs_js_1 = require("../utils/safe-fs.js");
var persistence_js_1 = require("./persistence.js");
var types_js_1 = require("./types.js");
/**
 * Default maximum age for state before it's considered stale (24 hours).
 */
exports.DEFAULT_MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Known artifact types for validation.
 */
var KNOWN_ARTIFACT_TYPES = new Set([
    'spec',
    'latticeCode',
    'witnesses',
    'contracts',
    'validatedStructure',
    'implementedCode',
    'verifiedCode',
    'finalArtifact',
    'contradictionReport',
    'structuralDefectReport',
    'clusterFailureReport',
]);
/**
 * Detects whether an existing state file is present on startup.
 *
 * @param options - Detection options.
 * @returns Detection result indicating whether state was found.
 *
 * @example
 * ```typescript
 * const result = await detectExistingState({ filePath: './state.json' });
 * if (result.found) {
 *   console.log(`Found state file modified at ${result.modifiedAt}`);
 * }
 * ```
 */
function detectExistingState() {
    return __awaiter(this, arguments, void 0, function (options) {
        var filePath, exists, stats, _a;
        var _b;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    filePath = (_b = options.filePath) !== null && _b !== void 0 ? _b : '.criticality-state.json';
                    return [4 /*yield*/, (0, persistence_js_1.stateFileExists)(filePath)];
                case 1:
                    exists = _c.sent();
                    if (!exists) {
                        return [2 /*return*/, { found: false, filePath: filePath }];
                    }
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, safe_fs_js_1.safeStat)(filePath)];
                case 3:
                    stats = _c.sent();
                    return [2 /*return*/, {
                            found: true,
                            filePath: filePath,
                            modifiedAt: stats.mtime,
                        }];
                case 4:
                    _a = _c.sent();
                    // If we can't stat but file exists, report as found with current time
                    return [2 /*return*/, { found: true, filePath: filePath, modifiedAt: new Date() }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parses a semver version string to its components.
 *
 * @param version - The version string (e.g., "1.2.3").
 * @returns The parsed version or null if invalid.
 */
function parseVersion(version) {
    var match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) {
        return null;
    }
    var majorStr = match[1], minorStr = match[2], patchStr = match[3];
    if (majorStr === undefined || minorStr === undefined || patchStr === undefined) {
        return null;
    }
    return {
        major: parseInt(majorStr, 10),
        minor: parseInt(minorStr, 10),
        patch: parseInt(patchStr, 10),
    };
}
/**
 * Compares two semver versions.
 *
 * @param a - First version.
 * @param b - Second version.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
function compareVersions(a, b) {
    var parsedA = parseVersion(a);
    var parsedB = parseVersion(b);
    if (!parsedA || !parsedB) {
        return 0;
    }
    if (parsedA.major !== parsedB.major) {
        return parsedA.major < parsedB.major ? -1 : 1;
    }
    if (parsedA.minor !== parsedB.minor) {
        return parsedA.minor < parsedB.minor ? -1 : 1;
    }
    if (parsedA.patch !== parsedB.patch) {
        return parsedA.patch < parsedB.patch ? -1 : 1;
    }
    return 0;
}
/**
 * Gets required artifacts for a given phase based on forward transitions.
 *
 * @param phase - The protocol phase to check.
 * @returns Set of artifact types required to have reached this phase.
 */
function getRequiredArtifactsForPhase(phase) {
    var required = new Set();
    // Build up required artifacts from previous transitions
    var phaseIndex = types_js_1.PROTOCOL_PHASES.indexOf(phase);
    if (phaseIndex > 0) {
        // Ignition -> Lattice requires spec
        required.add('spec');
    }
    if (phaseIndex > 1) {
        // Lattice -> CompositionAudit requires latticeCode, witnesses, contracts
        required.add('latticeCode');
        required.add('witnesses');
        required.add('contracts');
    }
    if (phaseIndex > 2) {
        // CompositionAudit -> Injection requires validatedStructure
        required.add('validatedStructure');
    }
    if (phaseIndex > 3) {
        // Injection -> Mesoscopic requires implementedCode
        required.add('implementedCode');
    }
    if (phaseIndex > 4) {
        // Mesoscopic -> MassDefect requires verifiedCode
        required.add('verifiedCode');
    }
    if (phaseIndex > 5) {
        // MassDefect -> Complete requires finalArtifact
        required.add('finalArtifact');
    }
    return required;
}
/**
 * Validates the integrity of a state snapshot before resuming.
 *
 * Performs comprehensive validation including:
 * - Version compatibility check
 * - Phase validity check
 * - Substate structure validation
 * - Required artifacts validation
 * - Staleness check
 *
 * @param snapshot - The state snapshot to validate.
 * @param persistedAt - When the state was persisted (from the file).
 * @param options - Validation options.
 * @returns Validation result with errors and warnings.
 *
 * @example
 * ```typescript
 * const result = validateStateIntegrity(snapshot, new Date());
 * if (!result.valid) {
 *   console.error('State validation failed:', result.errors);
 * }
 * ```
 */
function validateStateIntegrity(snapshot, persistedAt, options) {
    var _a;
    if (options === void 0) { options = {}; }
    var errors = [];
    var warnings = [];
    var maxAgeMs = (_a = options.maxAgeMs) !== null && _a !== void 0 ? _a : exports.DEFAULT_MAX_STATE_AGE_MS;
    var allowStaleState = options.allowStaleState !== false;
    // 1. Validate phase
    if (!(0, types_js_1.isValidPhase)(snapshot.state.phase)) {
        errors.push({
            code: 'INVALID_PHASE',
            message: "Invalid protocol phase: \"".concat(String(snapshot.state.phase), "\""),
            details: "Valid phases are: ".concat(types_js_1.PROTOCOL_PHASES.join(', ')),
        });
    }
    // 2. Validate substate structure
    var substate = snapshot.state.substate;
    if (typeof substate !== 'object') {
        errors.push({
            code: 'INVALID_SUBSTATE',
            message: 'Missing or invalid substate',
        });
    }
    else if (!['Active', 'Blocking', 'Failed'].includes(substate.kind)) {
        errors.push({
            code: 'INVALID_SUBSTATE',
            message: "Invalid substate kind: \"".concat(substate.kind, "\""),
            details: 'Valid kinds are: Active, Blocking, Failed',
        });
    }
    // 3. Validate blocking substate has required fields
    if (substate.kind === 'Blocking') {
        if (typeof substate.query !== 'string' || substate.query.length === 0) {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: 'Blocking substate missing query',
            });
        }
        if (typeof substate.blockedAt !== 'string') {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: 'Blocking substate missing blockedAt timestamp',
            });
        }
        // Check if blocking timeout has expired
        if (substate.timeoutMs !== undefined && typeof substate.blockedAt === 'string') {
            var blockedAt = new Date(substate.blockedAt).getTime();
            var elapsed = Date.now() - blockedAt;
            if (elapsed > substate.timeoutMs) {
                warnings.push({
                    code: 'BLOCKING_TIMEOUT_EXPIRED',
                    message: 'Blocking state timeout has expired',
                    details: "Blocked at ".concat(substate.blockedAt, ", timeout was ").concat(String(substate.timeoutMs), "ms, elapsed: ").concat(String(elapsed), "ms"),
                });
            }
        }
    }
    // 4. Validate failed substate has required fields
    if (substate.kind === 'Failed') {
        if (typeof substate.error !== 'string') {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: 'Failed substate missing error message',
            });
        }
        if (typeof substate.recoverable !== 'boolean') {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: 'Failed substate missing recoverable flag',
            });
        }
    }
    // 5. Validate artifacts array
    if (!Array.isArray(snapshot.artifacts)) {
        errors.push({
            code: 'CORRUPTED_STRUCTURE',
            message: 'Missing or invalid artifacts array',
        });
    }
    else {
        // Check for unknown artifact types
        var unknownArtifacts = snapshot.artifacts.filter(function (a) { return !KNOWN_ARTIFACT_TYPES.has(a); });
        if (unknownArtifacts.length > 0) {
            warnings.push({
                code: 'UNKNOWN_ARTIFACTS',
                message: "Unknown artifact types: ".concat(unknownArtifacts.join(', ')),
                details: 'These may be from a newer version of the protocol',
            });
        }
        // Check for missing required artifacts based on current phase
        if ((0, types_js_1.isValidPhase)(snapshot.state.phase)) {
            var required = getRequiredArtifactsForPhase(snapshot.state.phase);
            var artifactSet = new Set(snapshot.artifacts);
            var missing = [];
            for (var _i = 0, required_1 = required; _i < required_1.length; _i++) {
                var artifact = required_1[_i];
                if (!artifactSet.has(artifact)) {
                    missing.push(artifact);
                }
            }
            if (missing.length > 0) {
                errors.push({
                    code: 'MISSING_ARTIFACTS',
                    message: "Missing required artifacts for phase ".concat(snapshot.state.phase, ": ").concat(missing.join(', ')),
                    details: "Phase ".concat(snapshot.state.phase, " requires: ").concat(__spreadArray([], required, true).join(', ')),
                });
            }
        }
    }
    // 6. Validate blocking queries array
    if (!Array.isArray(snapshot.blockingQueries)) {
        errors.push({
            code: 'CORRUPTED_STRUCTURE',
            message: 'Missing or invalid blockingQueries array',
        });
    }
    // 7. Check staleness
    var age = Date.now() - persistedAt.getTime();
    if (age > maxAgeMs) {
        var ageMinutes = String(Math.round(age / 1000 / 60));
        var thresholdMinutes = String(Math.round(maxAgeMs / 1000 / 60));
        if (allowStaleState) {
            warnings.push({
                code: 'STALE_STATE',
                message: "State file is ".concat(ageMinutes, " minutes old"),
                details: "Threshold is ".concat(thresholdMinutes, " minutes"),
            });
        }
        else {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: "State file is too old: ".concat(ageMinutes, " minutes"),
                details: "Maximum allowed age is ".concat(thresholdMinutes, " minutes. Set allowStaleState: true to resume anyway."),
            });
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
    };
}
/**
 * Validates a persisted state structure without loading the full snapshot.
 *
 * This performs structural validation on the raw persisted data.
 *
 * @param data - The raw persisted state data.
 * @returns Validation result.
 */
function validatePersistedStructure(data) {
    var errors = [];
    var warnings = [];
    if (data === null || typeof data !== 'object') {
        errors.push({
            code: 'CORRUPTED_STRUCTURE',
            message: 'State data is not an object',
        });
        return { valid: false, errors: errors, warnings: warnings };
    }
    var obj = data;
    // Check version
    if (typeof obj.version !== 'string') {
        errors.push({
            code: 'INVALID_VERSION',
            message: 'Missing or invalid version field',
        });
    }
    else {
        var versionMatch = /^\d+\.\d+\.\d+$/.exec(obj.version);
        if (!versionMatch) {
            errors.push({
                code: 'INVALID_VERSION',
                message: "Invalid version format: \"".concat(obj.version, "\""),
                details: 'Version must be in semver format (e.g., "1.0.0")',
            });
        }
        else {
            // Check version compatibility
            var comparison = compareVersions(obj.version, persistence_js_1.PERSISTED_STATE_VERSION);
            if (comparison > 0) {
                errors.push({
                    code: 'FUTURE_VERSION',
                    message: "State was saved with newer version: ".concat(obj.version, " (current: ").concat(persistence_js_1.PERSISTED_STATE_VERSION, ")"),
                    details: 'Upgrade your installation or use a compatible state file',
                });
            }
            else if (comparison < 0) {
                var parsed = parseVersion(obj.version);
                var current = parseVersion(persistence_js_1.PERSISTED_STATE_VERSION);
                if (parsed && current && parsed.major < current.major) {
                    errors.push({
                        code: 'INVALID_VERSION',
                        message: "Major version mismatch: ".concat(obj.version, " vs ").concat(persistence_js_1.PERSISTED_STATE_VERSION),
                        details: 'State file is from an incompatible major version',
                    });
                }
                else {
                    warnings.push({
                        code: 'OLD_VERSION',
                        message: "State was saved with older version: ".concat(obj.version),
                        details: "Current version is ".concat(persistence_js_1.PERSISTED_STATE_VERSION),
                    });
                }
            }
        }
    }
    // Check required fields exist
    var requiredFields = [
        'version',
        'persistedAt',
        'phase',
        'substate',
        'artifacts',
        'blockingQueries',
    ];
    for (var _i = 0, requiredFields_1 = requiredFields; _i < requiredFields_1.length; _i++) {
        var field = requiredFields_1[_i];
        if (!(field in obj)) {
            errors.push({
                code: 'CORRUPTED_STRUCTURE',
                message: "Missing required field: \"".concat(field, "\""),
            });
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
    };
}
/**
 * Attempts to resume protocol execution from a persisted state checkpoint.
 *
 * This function:
 * 1. Detects if a state file exists
 * 2. Loads and validates the state
 * 3. Returns the snapshot for resumption or a failure with recovery recommendation
 *
 * @param filePath - Path to the state file.
 * @param options - Validation options.
 * @returns Resume result indicating success or failure with details.
 *
 * @example
 * ```typescript
 * const result = await resumeFromCheckpoint('./state.json');
 * if (result.success) {
 *   console.log(`Resuming from phase: ${result.snapshot.state.phase}`);
 * } else {
 *   console.error(`Resume failed: ${result.reason}`);
 *   console.log(`Recommended action: ${result.recoveryAction}`);
 * }
 * ```
 */
function resumeFromCheckpoint(filePath_1) {
    return __awaiter(this, arguments, void 0, function (filePath, options) {
        var exists, snapshot, fileStats, error_1, error_2, errorType, validation, hasStaleError;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, persistence_js_1.stateFileExists)(filePath)];
                case 1:
                    exists = _a.sent();
                    if (!exists) {
                        return [2 /*return*/, {
                                success: false,
                                reason: 'NO_STATE_FILE',
                                recoveryAction: 'CLEAN_START',
                            }];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, safe_fs_js_1.safeStat)(filePath)];
                case 3:
                    fileStats = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            reason: 'READ_ERROR',
                            error: error_1 instanceof Error ? error_1 : new Error(String(error_1)),
                            recoveryAction: 'MANUAL_INTERVENTION',
                        }];
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, persistence_js_1.loadState)(filePath)];
                case 6:
                    snapshot = _a.sent();
                    return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    if (error_2 instanceof persistence_js_1.StatePersistenceError) {
                        errorType = error_2.errorType;
                        if (errorType === 'parse_error' || errorType === 'corruption_error') {
                            return [2 /*return*/, {
                                    success: false,
                                    reason: 'CORRUPTED_STATE',
                                    error: error_2,
                                    recoveryAction: 'CLEAN_START',
                                }];
                        }
                        if (errorType === 'schema_error' || errorType === 'validation_error') {
                            return [2 /*return*/, {
                                    success: false,
                                    reason: 'INVALID_STATE',
                                    error: error_2,
                                    recoveryAction: 'CLEAN_START',
                                }];
                        }
                    }
                    return [2 /*return*/, {
                            success: false,
                            reason: 'READ_ERROR',
                            error: error_2 instanceof Error ? error_2 : new Error(String(error_2)),
                            recoveryAction: 'MANUAL_INTERVENTION',
                        }];
                case 8:
                    validation = validateStateIntegrity(snapshot, fileStats.mtime, options);
                    // Check if stale state should be rejected
                    if (!validation.valid) {
                        return [2 /*return*/, {
                                success: false,
                                reason: 'INVALID_STATE',
                                recoveryAction: 'CLEAN_START',
                            }];
                    }
                    // Check for staleness with rejection
                    if (options.allowStaleState === false) {
                        hasStaleError = validation.errors.some(function (e) { return e.message.includes('too old'); });
                        if (hasStaleError) {
                            return [2 /*return*/, {
                                    success: false,
                                    reason: 'STALE_STATE_REJECTED',
                                    recoveryAction: 'CLEAN_START',
                                }];
                        }
                    }
                    return [2 /*return*/, {
                            success: true,
                            snapshot: snapshot,
                            validation: validation,
                        }];
            }
        });
    });
}
/**
 * Determines the appropriate startup action based on existing state.
 *
 * This is a high-level function that encapsulates the startup decision logic:
 * - If no state exists, returns a fresh initial snapshot
 * - If valid state exists, validates and returns it for resumption
 * - If corrupted/invalid state exists, handles recovery
 *
 * @param filePath - Path to the state file.
 * @param options - Validation options.
 * @returns The state snapshot to use (either resumed or fresh).
 *
 * @example
 * ```typescript
 * const { snapshot, resumed, warnings } = await getStartupState('./state.json');
 * if (resumed) {
 *   console.log(`Resumed from ${snapshot.state.phase}`);
 * } else {
 *   console.log('Starting fresh from Ignition');
 * }
 * ```
 */
function getStartupState(filePath_1) {
    return __awaiter(this, arguments, void 0, function (filePath, options) {
        var resumeResult;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resumeFromCheckpoint(filePath, options)];
                case 1:
                    resumeResult = _a.sent();
                    if (resumeResult.success) {
                        return [2 /*return*/, {
                                snapshot: resumeResult.snapshot,
                                resumed: true,
                                validation: resumeResult.validation,
                                recoveryPerformed: false,
                            }];
                    }
                    // Handle failure cases
                    if (resumeResult.reason === 'NO_STATE_FILE') {
                        // Clean start - no recovery needed
                        return [2 /*return*/, {
                                snapshot: (0, persistence_js_1.createInitialStateSnapshot)(),
                                resumed: false,
                                validation: null,
                                recoveryPerformed: false,
                            }];
                    }
                    // For corrupted/invalid/stale state, perform recovery by starting fresh
                    if (resumeResult.recoveryAction === 'CLEAN_START' ||
                        resumeResult.reason === 'CORRUPTED_STATE' ||
                        resumeResult.reason === 'INVALID_STATE' ||
                        resumeResult.reason === 'STALE_STATE_REJECTED') {
                        return [2 /*return*/, {
                                snapshot: (0, persistence_js_1.createInitialStateSnapshot)(),
                                resumed: false,
                                validation: null,
                                recoveryPerformed: true,
                            }];
                    }
                    // For manual intervention cases, also start fresh but indicate the issue
                    return [2 /*return*/, {
                            snapshot: (0, persistence_js_1.createInitialStateSnapshot)(),
                            resumed: false,
                            validation: null,
                            recoveryPerformed: true,
                        }];
            }
        });
    });
}
/**
 * Checks if a state file is likely corrupted based on quick structural checks.
 *
 * This is a fast check that doesn't fully parse the state.
 *
 * @param filePath - Path to the state file.
 * @returns True if the file appears corrupted.
 */
function isStateCorrupted(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, persistence_js_1.loadState)(filePath)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, false];
                case 2:
                    error_3 = _a.sent();
                    if (error_3 instanceof persistence_js_1.StatePersistenceError) {
                        return [2 /*return*/, (error_3.errorType === 'parse_error' ||
                                error_3.errorType === 'corruption_error' ||
                                error_3.errorType === 'schema_error')];
                    }
                    return [2 /*return*/, true];
                case 3: return [2 /*return*/];
            }
        });
    });
}
