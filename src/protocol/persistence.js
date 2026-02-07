"use strict";
/**
 * Protocol state persistence module.
 *
 * Provides serialization and deserialization of protocol state to/from JSON files
 * with atomic writes to prevent corruption and clear error handling.
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
exports.PERSISTED_STATE_VERSION = exports.StatePersistenceError = void 0;
exports.serializeState = serializeState;
exports.deserializeState = deserializeState;
exports.saveState = saveState;
exports.loadState = loadState;
exports.stateFileExists = stateFileExists;
exports.createInitialStateSnapshot = createInitialStateSnapshot;
var safe_fs_js_1 = require("../utils/safe-fs.js");
var node_path_1 = require("node:path");
var node_crypto_1 = require("node:crypto");
var types_js_1 = require("./types.js");
/**
 * Error class for protocol state serialization/deserialization errors.
 */
var StatePersistenceError = /** @class */ (function (_super) {
    __extends(StatePersistenceError, _super);
    /**
     * Creates a new StatePersistenceError.
     *
     * @param message - Human-readable error message.
     * @param errorType - The type of persistence error.
     * @param options - Additional error options.
     */
    function StatePersistenceError(message, errorType, options) {
        var _this = _super.call(this, message) || this;
        _this.name = 'StatePersistenceError';
        _this.errorType = errorType;
        _this.details = options === null || options === void 0 ? void 0 : options.details;
        _this.cause = options === null || options === void 0 ? void 0 : options.cause;
        return _this;
    }
    return StatePersistenceError;
}(Error));
exports.StatePersistenceError = StatePersistenceError;
/**
 * Current schema version for persisted state.
 */
exports.PERSISTED_STATE_VERSION = '1.0.0';
/**
 * Serializes a substate to its persisted form.
 *
 * @param substate - The substate to serialize.
 * @returns The persisted substate data.
 */
function serializeSubstate(substate) {
    switch (substate.kind) {
        case 'Active':
            return { kind: 'Active' };
        case 'Blocking': {
            var base = {
                kind: 'Blocking',
                query: substate.query,
                blockedAt: substate.blockedAt,
            };
            // Handle optional fields for exactOptionalPropertyTypes
            if (substate.options !== undefined && substate.timeoutMs !== undefined) {
                return __assign(__assign({}, base), { options: substate.options, timeoutMs: substate.timeoutMs });
            }
            if (substate.options !== undefined) {
                return __assign(__assign({}, base), { options: substate.options });
            }
            if (substate.timeoutMs !== undefined) {
                return __assign(__assign({}, base), { timeoutMs: substate.timeoutMs });
            }
            return base;
        }
        case 'Failed': {
            var base = {
                kind: 'Failed',
                error: substate.error,
                failedAt: substate.failedAt,
                recoverable: substate.recoverable,
            };
            // Handle optional fields for exactOptionalPropertyTypes
            if (substate.code !== undefined && substate.context !== undefined) {
                return __assign(__assign({}, base), { code: substate.code, context: substate.context });
            }
            if (substate.code !== undefined) {
                return __assign(__assign({}, base), { code: substate.code });
            }
            if (substate.context !== undefined) {
                return __assign(__assign({}, base), { context: substate.context });
            }
            return base;
        }
    }
}
/**
 * Deserializes substate data to a ProtocolSubstate.
 *
 * @param data - The persisted substate data.
 * @returns The deserialized substate.
 * @throws StatePersistenceError if the data is invalid.
 */
function deserializeSubstate(data) {
    switch (data.kind) {
        case 'Active':
            return { kind: 'Active' };
        case 'Blocking': {
            var base = {
                kind: 'Blocking',
                query: data.query,
                blockedAt: data.blockedAt,
            };
            // Handle optional fields for exactOptionalPropertyTypes
            if (data.options !== undefined && data.timeoutMs !== undefined) {
                return __assign(__assign({}, base), { options: data.options, timeoutMs: data.timeoutMs });
            }
            if (data.options !== undefined) {
                return __assign(__assign({}, base), { options: data.options });
            }
            if (data.timeoutMs !== undefined) {
                return __assign(__assign({}, base), { timeoutMs: data.timeoutMs });
            }
            return base;
        }
        case 'Failed': {
            var base = {
                kind: 'Failed',
                error: data.error,
                failedAt: data.failedAt,
                recoverable: data.recoverable,
            };
            // Handle optional fields for exactOptionalPropertyTypes
            if (data.code !== undefined && data.context !== undefined) {
                return __assign(__assign({}, base), { code: data.code, context: data.context });
            }
            if (data.code !== undefined) {
                return __assign(__assign({}, base), { code: data.code });
            }
            if (data.context !== undefined) {
                return __assign(__assign({}, base), { context: data.context });
            }
            return base;
        }
        default: {
            // Type-safe exhaustive check
            var _exhaustive = data;
            throw new StatePersistenceError("Unknown substate kind: ".concat(JSON.stringify(_exhaustive)), 'schema_error');
        }
    }
}
/**
 * Serializes a protocol state snapshot to a JSON string.
 *
 * @param snapshot - The state snapshot to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the state.
 *
 * @example
 * ```typescript
 * const snapshot: ProtocolStateSnapshot = {
 *   state: createActiveState('Lattice'),
 *   artifacts: ['spec'],
 *   blockingQueries: [],
 * };
 * const json = serializeState(snapshot);
 * ```
 */
function serializeState(snapshot, options) {
    var _a;
    var data = {
        version: exports.PERSISTED_STATE_VERSION,
        persistedAt: new Date().toISOString(),
        phase: snapshot.state.phase,
        substate: serializeSubstate(snapshot.state.substate),
        artifacts: snapshot.artifacts,
        blockingQueries: snapshot.blockingQueries,
    };
    var pretty = (options === null || options === void 0 ? void 0 : options.pretty) !== false; // Default to true
    var indent = (_a = options === null || options === void 0 ? void 0 : options.indent) !== null && _a !== void 0 ? _a : 2;
    if (pretty) {
        return JSON.stringify(data, null, indent);
    }
    return JSON.stringify(data);
}
/**
 * Validates and deserializes a JSON string to a protocol state snapshot.
 *
 * @param json - JSON string to parse.
 * @returns The deserialized state snapshot.
 * @throws StatePersistenceError if the JSON is invalid or malformed.
 *
 * @example
 * ```typescript
 * const json = fs.readFileSync('state.json', 'utf-8');
 * const snapshot = deserializeState(json);
 * console.log(snapshot.state.phase); // 'Lattice'
 * ```
 */
function deserializeState(json) {
    // Parse JSON
    var data;
    try {
        data = JSON.parse(json);
    }
    catch (error) {
        var parseError = error instanceof Error ? error : new Error(String(error));
        throw new StatePersistenceError("Failed to parse state JSON: ".concat(parseError.message), 'parse_error', { cause: parseError, details: 'The file does not contain valid JSON' });
    }
    // Validate basic structure
    if (data === null || typeof data !== 'object') {
        throw new StatePersistenceError('Invalid state format: expected an object', 'schema_error', {
            details: "Received ".concat(data === null ? 'null' : typeof data, " instead of object"),
        });
    }
    var obj = data;
    // Check for required top-level fields
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
            throw new StatePersistenceError("Invalid state format: missing required field \"".concat(field, "\""), 'schema_error', { details: "State file must contain: ".concat(requiredFields.join(', ')) });
        }
    }
    // Validate version
    if (typeof obj.version !== 'string') {
        throw new StatePersistenceError('Invalid state format: version must be a string', 'schema_error');
    }
    var versionPattern = /^\d+\.\d+\.\d+$/;
    if (!versionPattern.test(obj.version)) {
        throw new StatePersistenceError("Invalid state format: version \"".concat(obj.version, "\" does not match semver pattern"), 'schema_error', { details: 'Version must be in format X.Y.Z (e.g., "1.0.0")' });
    }
    // Validate phase
    if (typeof obj.phase !== 'string') {
        throw new StatePersistenceError('Invalid state format: phase must be a string', 'schema_error');
    }
    if (!(0, types_js_1.isValidPhase)(obj.phase)) {
        throw new StatePersistenceError("Invalid state format: phase \"".concat(obj.phase, "\" is not a valid protocol phase"), 'validation_error', { details: "Valid phases: ".concat(types_js_1.PROTOCOL_PHASES.join(', ')) });
    }
    var phase = obj.phase;
    // Validate substate
    if (obj.substate === null || typeof obj.substate !== 'object') {
        throw new StatePersistenceError('Invalid state format: substate must be an object', 'schema_error');
    }
    var substateObj = obj.substate;
    if (!('kind' in substateObj) || typeof substateObj.kind !== 'string') {
        throw new StatePersistenceError('Invalid state format: substate must have a "kind" field', 'schema_error');
    }
    if (!['Active', 'Blocking', 'Failed'].includes(substateObj.kind)) {
        throw new StatePersistenceError("Invalid state format: substate kind \"".concat(substateObj.kind, "\" is not valid"), 'validation_error', { details: 'Valid kinds: Active, Blocking, Failed' });
    }
    // Validate substate-specific fields
    if (substateObj.kind === 'Blocking') {
        if (typeof substateObj.query !== 'string') {
            throw new StatePersistenceError('Invalid state format: Blocking substate must have a "query" string', 'schema_error');
        }
        if (typeof substateObj.blockedAt !== 'string') {
            throw new StatePersistenceError('Invalid state format: Blocking substate must have a "blockedAt" string', 'schema_error');
        }
    }
    if (substateObj.kind === 'Failed') {
        if (typeof substateObj.error !== 'string') {
            throw new StatePersistenceError('Invalid state format: Failed substate must have an "error" string', 'schema_error');
        }
        if (typeof substateObj.failedAt !== 'string') {
            throw new StatePersistenceError('Invalid state format: Failed substate must have a "failedAt" string', 'schema_error');
        }
        if (typeof substateObj.recoverable !== 'boolean') {
            throw new StatePersistenceError('Invalid state format: Failed substate must have a "recoverable" boolean', 'schema_error');
        }
    }
    var substate = deserializeSubstate(obj.substate);
    // Validate artifacts
    if (!Array.isArray(obj.artifacts)) {
        throw new StatePersistenceError('Invalid state format: artifacts must be an array', 'schema_error');
    }
    for (var _a = 0, _b = obj.artifacts; _a < _b.length; _a++) {
        var artifact = _b[_a];
        if (typeof artifact !== 'string') {
            throw new StatePersistenceError("Invalid state format: artifact must be a string, got ".concat(typeof artifact), 'schema_error');
        }
    }
    var artifacts = obj.artifacts;
    // Validate blocking queries
    if (!Array.isArray(obj.blockingQueries)) {
        throw new StatePersistenceError('Invalid state format: blockingQueries must be an array', 'schema_error');
    }
    // Basic validation of blocking query structure
    for (var _c = 0, _d = obj.blockingQueries; _c < _d.length; _c++) {
        var query = _d[_c];
        if (query === null || typeof query !== 'object') {
            throw new StatePersistenceError('Invalid state format: blocking query must be an object', 'schema_error');
        }
        var queryObj = query;
        if (typeof queryObj.id !== 'string') {
            throw new StatePersistenceError('Invalid state format: blocking query must have an "id" string', 'schema_error');
        }
        if (typeof queryObj.phase !== 'string') {
            throw new StatePersistenceError('Invalid state format: blocking query must have a "phase" string', 'schema_error');
        }
        if (typeof queryObj.query !== 'string') {
            throw new StatePersistenceError('Invalid state format: blocking query must have a "query" string', 'schema_error');
        }
        if (typeof queryObj.blockedAt !== 'string') {
            throw new StatePersistenceError('Invalid state format: blocking query must have a "blockedAt" string', 'schema_error');
        }
        if (typeof queryObj.resolved !== 'boolean') {
            throw new StatePersistenceError('Invalid state format: blocking query must have a "resolved" boolean', 'schema_error');
        }
    }
    var blockingQueries = obj.blockingQueries;
    return {
        state: { phase: phase, substate: substate },
        artifacts: artifacts,
        blockingQueries: blockingQueries,
    };
}
/**
 * Saves protocol state to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the state file.
 *
 * @param snapshot - The state snapshot to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws StatePersistenceError if the file cannot be written.
 *
 * @example
 * ```typescript
 * const snapshot: ProtocolStateSnapshot = {
 *   state: createActiveState('Lattice'),
 *   artifacts: ['spec'],
 *   blockingQueries: [],
 * };
 * await saveState(snapshot, '/path/to/state.json');
 * ```
 */
function saveState(snapshot, filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var json, tempPath, error_1, _a, fileError;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    json = serializeState(snapshot, options);
                    tempPath = (0, node_path_1.join)((0, node_path_1.dirname)(filePath), ".state-".concat((0, node_crypto_1.randomUUID)(), ".tmp"));
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 9]);
                    // Write to temporary file first
                    return [4 /*yield*/, (0, safe_fs_js_1.safeWriteFile)(tempPath, json, 'utf-8')];
                case 2:
                    // Write to temporary file first
                    _b.sent();
                    // Atomic rename to target path
                    return [4 /*yield*/, (0, safe_fs_js_1.safeRename)(tempPath, filePath)];
                case 3:
                    // Atomic rename to target path
                    _b.sent();
                    return [3 /*break*/, 9];
                case 4:
                    error_1 = _b.sent();
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, safe_fs_js_1.safeUnlink)(tempPath)];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _a = _b.sent();
                    return [3 /*break*/, 8];
                case 8:
                    fileError = error_1 instanceof Error ? error_1 : new Error(String(error_1));
                    throw new StatePersistenceError("Failed to save state to \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError, details: 'Check that the directory exists and is writable' });
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Loads protocol state from a JSON file.
 *
 * Reads the file, parses the JSON, and validates the structure.
 *
 * @param filePath - Path to the state JSON file.
 * @returns The deserialized state snapshot.
 * @throws StatePersistenceError if the file cannot be read or contains invalid data.
 *
 * @example
 * ```typescript
 * const snapshot = await loadState('/path/to/state.json');
 * console.log(snapshot.state.phase); // 'Lattice'
 * ```
 */
function loadState(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var content, error_2, fileError, isNotFound;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, safe_fs_js_1.safeReadFile)(filePath, 'utf-8')];
                case 1:
                    content = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    fileError = error_2 instanceof Error ? error_2 : new Error(String(error_2));
                    isNotFound = fileError instanceof Error &&
                        'code' in fileError &&
                        fileError.code === 'ENOENT';
                    if (isNotFound) {
                        throw new StatePersistenceError("State file not found: \"".concat(filePath, "\""), 'file_error', {
                            cause: fileError,
                            details: 'The specified state file does not exist',
                        });
                    }
                    throw new StatePersistenceError("Failed to read state file \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError });
                case 3:
                    // Check for empty or whitespace-only content
                    if (content.trim() === '') {
                        throw new StatePersistenceError("State file \"".concat(filePath, "\" is empty"), 'corruption_error', {
                            details: 'The file exists but contains no data',
                        });
                    }
                    // Deserialize with validation
                    try {
                        return [2 /*return*/, deserializeState(content)];
                    }
                    catch (error) {
                        // Re-wrap errors with file path context
                        if (error instanceof StatePersistenceError) {
                            throw new StatePersistenceError("Error loading state from \"".concat(filePath, "\": ").concat(error.message), error.errorType, { cause: error.cause, details: error.details });
                        }
                        throw error;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Checks if a state file exists.
 *
 * @param filePath - Path to check.
 * @returns True if the file exists.
 */
function stateFileExists(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, safe_fs_js_1.safeStat)(filePath)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, true];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Creates an initial state snapshot for the Ignition phase.
 *
 * @returns A new state snapshot at the beginning of protocol execution.
 */
function createInitialStateSnapshot() {
    return {
        state: {
            phase: 'Ignition',
            substate: { kind: 'Active' },
        },
        artifacts: [],
        blockingQueries: [],
    };
}
