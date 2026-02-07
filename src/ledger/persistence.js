"use strict";
/**
 * Decision Ledger persistence module.
 *
 * Provides serialization and deserialization of ledgers to/from JSON files
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
exports.LedgerSerializationError = void 0;
exports.serialize = serialize;
exports.deserialize = deserialize;
exports.saveLedger = saveLedger;
exports.loadLedger = loadLedger;
var node_path_1 = require("node:path");
var node_crypto_1 = require("node:crypto");
var ledger_js_1 = require("./ledger.js");
var safe_fs_js_1 = require("../utils/safe-fs.js");
/**
 * Error class for ledger serialization/deserialization errors.
 */
var LedgerSerializationError = /** @class */ (function (_super) {
    __extends(LedgerSerializationError, _super);
    /**
     * Creates a new LedgerSerializationError.
     *
     * @param message - Human-readable error message.
     * @param errorType - The type of serialization error.
     * @param options - Additional error options.
     */
    function LedgerSerializationError(message, errorType, options) {
        var _this = _super.call(this, message) || this;
        _this.name = 'LedgerSerializationError';
        _this.errorType = errorType;
        _this.details = options === null || options === void 0 ? void 0 : options.details;
        _this.cause = options === null || options === void 0 ? void 0 : options.cause;
        return _this;
    }
    return LedgerSerializationError;
}(Error));
exports.LedgerSerializationError = LedgerSerializationError;
/**
 * Serializes a ledger to a JSON string.
 *
 * The output matches the ledger.schema.json specification.
 *
 * @param ledger - The ledger to serialize.
 * @param options - Serialization options.
 * @returns JSON string representation of the ledger.
 *
 * @example
 * ```typescript
 * const ledger = new Ledger({ project: 'my-project' });
 * ledger.append({ ... });
 * const json = serialize(ledger);
 * console.log(json);
 * ```
 */
function serialize(ledger, options) {
    var _a;
    var data = ledger.toData();
    var pretty = (options === null || options === void 0 ? void 0 : options.pretty) !== false; // Default to true
    var indent = (_a = options === null || options === void 0 ? void 0 : options.indent) !== null && _a !== void 0 ? _a : 2;
    if (pretty) {
        return JSON.stringify(data, null, indent);
    }
    return JSON.stringify(data);
}
/**
 * Deserializes a JSON string to a Ledger instance.
 *
 * Validates the JSON structure and all decisions against the schema.
 *
 * @param json - JSON string to parse.
 * @param options - Deserialization options.
 * @returns A new Ledger instance populated with the data.
 * @throws LedgerSerializationError if the JSON is invalid or malformed.
 * @throws LedgerValidationError if any decision fails validation.
 * @throws DuplicateDecisionIdError if duplicate IDs are found.
 *
 * @example
 * ```typescript
 * const json = fs.readFileSync('ledger.json', 'utf-8');
 * const ledger = deserialize(json);
 * ```
 */
function deserialize(json, options) {
    // Parse JSON
    var data;
    try {
        data = JSON.parse(json);
    }
    catch (error) {
        var parseError = error instanceof Error ? error : new Error(String(error));
        throw new LedgerSerializationError("Failed to parse ledger JSON: ".concat(parseError.message), 'parse_error', { cause: parseError, details: 'The file does not contain valid JSON' });
    }
    // Validate basic structure
    if (data === null || typeof data !== 'object') {
        throw new LedgerSerializationError('Invalid ledger format: expected an object', 'schema_error', { details: "Received ".concat(data === null ? 'null' : typeof data, " instead of object") });
    }
    var obj = data;
    // Check for required top-level fields
    if (!('meta' in obj)) {
        throw new LedgerSerializationError('Invalid ledger format: missing required field "meta"', 'schema_error', { details: 'The ledger file is missing the meta section' });
    }
    if (!('decisions' in obj)) {
        throw new LedgerSerializationError('Invalid ledger format: missing required field "decisions"', 'schema_error', { details: 'The ledger file is missing the decisions array' });
    }
    // Validate meta structure
    if (obj.meta === null || typeof obj.meta !== 'object') {
        throw new LedgerSerializationError('Invalid ledger format: "meta" must be an object', 'schema_error', { details: "meta is ".concat(obj.meta === null ? 'null' : typeof obj.meta) });
    }
    var meta = obj.meta;
    // Check required meta fields
    var requiredMetaFields = ['version', 'created', 'project'];
    for (var _i = 0, requiredMetaFields_1 = requiredMetaFields; _i < requiredMetaFields_1.length; _i++) {
        var field = requiredMetaFields_1[_i];
        if (!(field in meta)) {
            throw new LedgerSerializationError("Invalid ledger format: missing required meta field \"".concat(field, "\""), 'schema_error', { details: "The meta section must contain: ".concat(requiredMetaFields.join(', ')) });
        }
    }
    // Validate version format
    if (typeof meta.version !== 'string') {
        throw new LedgerSerializationError('Invalid ledger format: meta.version must be a string', 'schema_error');
    }
    var versionPattern = /^\d+\.\d+\.\d+$/;
    if (!versionPattern.test(meta.version)) {
        throw new LedgerSerializationError("Invalid ledger format: meta.version \"".concat(meta.version, "\" does not match semver pattern"), 'schema_error', { details: 'Version must be in format X.Y.Z (e.g., "1.0.0")' });
    }
    // Validate decisions is an array
    if (!Array.isArray(obj.decisions)) {
        throw new LedgerSerializationError('Invalid ledger format: "decisions" must be an array', 'schema_error', { details: "decisions is ".concat(typeof obj.decisions) });
    }
    // At this point, the basic structure is valid
    // Let fromData handle the detailed validation of each decision
    try {
        return (0, ledger_js_1.fromData)(obj, options);
    }
    catch (error) {
        // Re-throw known validation errors
        if (error instanceof ledger_js_1.LedgerValidationError) {
            throw new LedgerSerializationError("Invalid decision data: ".concat(error.message), 'validation_error', { cause: error, details: 'One or more decisions failed validation' });
        }
        if (error instanceof ledger_js_1.DuplicateDecisionIdError) {
            throw new LedgerSerializationError("Duplicate decision ID: ".concat(error.message), 'validation_error', { cause: error, details: 'The ledger contains duplicate decision IDs' });
        }
        throw error;
    }
}
/**
 * Saves a ledger to a file with atomic write semantics.
 *
 * Uses a write-to-temp-then-rename strategy to prevent partial writes
 * from corrupting the ledger file.
 *
 * @param ledger - The ledger to save.
 * @param filePath - Path to the output file.
 * @param options - Save options.
 * @throws LedgerSerializationError if the file cannot be written.
 *
 * @example
 * ```typescript
 * const ledger = new Ledger({ project: 'my-project' });
 * await saveLedger(ledger, '/path/to/ledger.json');
 * ```
 */
function saveLedger(ledger, filePath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var json, tempPath, error_1, _a, fileError;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    json = serialize(ledger, options);
                    tempPath = (0, node_path_1.join)((0, node_path_1.dirname)(filePath), ".ledger-".concat((0, node_crypto_1.randomUUID)(), ".tmp"));
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
                    throw new LedgerSerializationError("Failed to save ledger to \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError, details: 'Check that the directory exists and is writable' });
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Loads a ledger from a JSON file.
 *
 * Reads the file, parses the JSON, validates the structure and all decisions.
 *
 * @param filePath - Path to the ledger JSON file.
 * @param options - Load options.
 * @returns A new Ledger instance populated with the data.
 * @throws LedgerSerializationError if the file cannot be read or contains invalid data.
 *
 * @example
 * ```typescript
 * const ledger = await loadLedger('/path/to/ledger.json');
 * console.log(ledger.size); // Number of decisions
 * ```
 */
function loadLedger(filePath, options) {
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
                        throw new LedgerSerializationError("Ledger file not found: \"".concat(filePath, "\""), 'file_error', {
                            cause: fileError,
                            details: 'The specified ledger file does not exist',
                        });
                    }
                    throw new LedgerSerializationError("Failed to read ledger file \"".concat(filePath, "\": ").concat(fileError.message), 'file_error', { cause: fileError });
                case 3:
                    // Check for empty or whitespace-only content
                    if (content.trim() === '') {
                        throw new LedgerSerializationError("Ledger file \"".concat(filePath, "\" is empty"), 'corruption_error', {
                            details: 'The file exists but contains no data',
                        });
                    }
                    // Deserialize with validation
                    try {
                        return [2 /*return*/, deserialize(content, options)];
                    }
                    catch (error) {
                        // Re-wrap errors with file path context
                        if (error instanceof LedgerSerializationError) {
                            throw new LedgerSerializationError("Error loading ledger from \"".concat(filePath, "\": ").concat(error.message), error.errorType, { cause: error.cause, details: error.details });
                        }
                        throw error;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
