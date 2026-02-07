"use strict";
/**
 * Claude Code CLI client for the Criticality Protocol.
 *
 * Implements the ModelRouter interface using Claude Code CLI as the backend.
 * Spawns subprocesses to execute Claude Code commands and parses the JSON output.
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
exports.ClaudeCodeClient = exports.ClaudeCodeNotInstalledError = void 0;
exports.checkClaudeCodeInstalled = checkClaudeCodeInstalled;
exports.createClaudeCodeClient = createClaudeCodeClient;
var typed_map_js_1 = require("../utils/typed-map.js");
var execa_1 = require("execa");
var types_js_1 = require("./types.js");
/**
 * Error thrown when Claude Code CLI is not installed or not accessible.
 */
var ClaudeCodeNotInstalledError = /** @class */ (function (_super) {
    __extends(ClaudeCodeNotInstalledError, _super);
    function ClaudeCodeNotInstalledError(message, cause) {
        var _this = _super.call(this, message) || this;
        _this.code = 'CLAUDE_CODE_NOT_INSTALLED';
        _this.name = 'ClaudeCodeNotInstalledError';
        if (cause !== undefined) {
            _this.cause = cause;
        }
        return _this;
    }
    return ClaudeCodeNotInstalledError;
}(Error));
exports.ClaudeCodeNotInstalledError = ClaudeCodeNotInstalledError;
/**
 * Checks if Claude Code CLI is installed and accessible.
 *
 * @param executablePath - Path to the claude executable.
 * @returns True if Claude Code is available.
 * @throws ClaudeCodeNotInstalledError if not installed.
 */
function checkClaudeCodeInstalled() {
    return __awaiter(this, arguments, void 0, function (executablePath) {
        var result, error_1, execaError;
        if (executablePath === void 0) { executablePath = 'claude'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, execa_1.execa)(executablePath, ['--version'], {
                            timeout: 10000,
                            reject: false,
                        })];
                case 1:
                    result = _a.sent();
                    if (result.exitCode !== 0) {
                        throw new ClaudeCodeNotInstalledError("Claude Code CLI returned non-zero exit code: ".concat(String(result.exitCode), ". ") +
                            "Stderr: ".concat(result.stderr || '(empty)'));
                    }
                    return [2 /*return*/, true];
                case 2:
                    error_1 = _a.sent();
                    if (error_1 instanceof ClaudeCodeNotInstalledError) {
                        throw error_1;
                    }
                    execaError = error_1;
                    if (execaError.code === 'ENOENT') {
                        throw new ClaudeCodeNotInstalledError("Claude Code CLI not found at '".concat(executablePath, "'. ") +
                            "Please install Claude Code: https://claude.ai/download", execaError);
                    }
                    throw new ClaudeCodeNotInstalledError("Failed to check Claude Code installation: ".concat(execaError.message || String(error_1)), execaError);
                case 3: return [2 /*return*/];
            }
        });
    });
}
var MODEL_ALIAS_MAP = typed_map_js_1.TypedMap.fromObject({
    architect: 'architect_model',
    auditor: 'auditor_model',
    structurer: 'structurer_model',
    worker: 'worker_model',
    fallback: 'fallback_model',
});
/**
 * Resolves a model alias to the actual model identifier.
 *
 * @param alias - The model alias to resolve.
 * @param config - Configuration containing model assignments.
 * @returns The resolved model identifier.
 */
function resolveModelAlias(alias, config) {
    var _a;
    var configKey = (_a = MODEL_ALIAS_MAP.get(alias)) !== null && _a !== void 0 ? _a : 'architect_model';
    return config.models[configKey];
}
/**
 * Parses Claude Code JSON output to extract the response.
 *
 * @param output - The raw JSON output from Claude Code.
 * @returns Parsed response content, usage, and metadata.
 */
function parseClaudeCodeOutput(output) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    var lines = output.trim().split('\n');
    var content = '';
    var usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    var latencyMs = 0;
    var modelId = '';
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (!line.trim()) {
            continue;
        }
        try {
            var parsed = JSON.parse(line);
            // Extract content from assistant messages
            if (parsed.type === 'assistant' && ((_a = parsed.message) === null || _a === void 0 ? void 0 : _a.content)) {
                for (var _t = 0, _u = parsed.message.content; _t < _u.length; _t++) {
                    var contentBlock = _u[_t];
                    if (contentBlock.type === 'text' && contentBlock.text !== undefined) {
                        content += contentBlock.text;
                    }
                }
                // Extract model from message
                if (parsed.message.model !== undefined && parsed.message.model !== '') {
                    modelId = parsed.message.model;
                }
                // Extract usage from message
                if (parsed.message.usage) {
                    var msgUsage = parsed.message.usage;
                    usage = {
                        promptTokens: ((_b = msgUsage.input_tokens) !== null && _b !== void 0 ? _b : 0) +
                            ((_c = msgUsage.cache_read_input_tokens) !== null && _c !== void 0 ? _c : 0) +
                            ((_d = msgUsage.cache_creation_input_tokens) !== null && _d !== void 0 ? _d : 0),
                        completionTokens: (_e = msgUsage.output_tokens) !== null && _e !== void 0 ? _e : 0,
                        totalTokens: ((_f = msgUsage.input_tokens) !== null && _f !== void 0 ? _f : 0) +
                            ((_g = msgUsage.cache_read_input_tokens) !== null && _g !== void 0 ? _g : 0) +
                            ((_h = msgUsage.cache_creation_input_tokens) !== null && _h !== void 0 ? _h : 0) +
                            ((_j = msgUsage.output_tokens) !== null && _j !== void 0 ? _j : 0),
                    };
                }
            }
            // Extract result summary (may override content if present)
            if (parsed.type === 'result') {
                if (parsed.result !== undefined && !content) {
                    content = parsed.result;
                }
                if (parsed.duration_ms !== undefined) {
                    latencyMs = parsed.duration_ms;
                }
                // Override with result-level usage if available
                if (parsed.usage) {
                    var resultUsage = parsed.usage;
                    usage = {
                        promptTokens: ((_k = resultUsage.input_tokens) !== null && _k !== void 0 ? _k : 0) +
                            ((_l = resultUsage.cache_read_input_tokens) !== null && _l !== void 0 ? _l : 0) +
                            ((_m = resultUsage.cache_creation_input_tokens) !== null && _m !== void 0 ? _m : 0),
                        completionTokens: (_o = resultUsage.output_tokens) !== null && _o !== void 0 ? _o : 0,
                        totalTokens: ((_p = resultUsage.input_tokens) !== null && _p !== void 0 ? _p : 0) +
                            ((_q = resultUsage.cache_read_input_tokens) !== null && _q !== void 0 ? _q : 0) +
                            ((_r = resultUsage.cache_creation_input_tokens) !== null && _r !== void 0 ? _r : 0) +
                            ((_s = resultUsage.output_tokens) !== null && _s !== void 0 ? _s : 0),
                    };
                }
            }
        }
        catch (_v) {
            // Skip lines that aren't valid JSON
            continue;
        }
    }
    return {
        content: content,
        usage: usage,
        metadata: {
            modelId: modelId || 'unknown',
            latencyMs: latencyMs,
        },
    };
}
/**
 * Claude Code CLI client implementing the ModelRouter interface.
 *
 * @example
 * ```typescript
 * const client = new ClaudeCodeClient({ config });
 * const result = await client.prompt('worker', 'What is 2+2?');
 * if (result.success) {
 *   console.log(result.response.content);
 * }
 * ```
 */
var ClaudeCodeClient = /** @class */ (function () {
    /**
     * Creates a new ClaudeCodeClient.
     *
     * @param options - Client configuration options.
     */
    function ClaudeCodeClient(options) {
        var _a, _b, _c;
        this.config = options.config;
        this.executablePath = (_a = options.executablePath) !== null && _a !== void 0 ? _a : 'claude';
        this.additionalFlags = (_b = options.additionalFlags) !== null && _b !== void 0 ? _b : [];
        this.timeoutMs = (_c = options.timeoutMs) !== null && _c !== void 0 ? _c : 300000; // 5 minutes
        this.cwd = options.cwd;
    }
    /**
     * Builds CLI arguments for a request.
     *
     * @param request - The model router request.
     * @returns Array of CLI arguments.
     */
    ClaudeCodeClient.prototype.buildArgs = function (request) {
        var _a;
        var modelId = resolveModelAlias(request.modelAlias, this.config);
        var args = __spreadArray([
            '-p', // Print mode (non-interactive)
            '--output-format',
            'json',
            '--model',
            modelId,
            '--no-session-persistence'
        ], this.additionalFlags, true);
        // Add system prompt if provided
        if (((_a = request.parameters) === null || _a === void 0 ? void 0 : _a.systemPrompt) !== undefined && request.parameters.systemPrompt !== '') {
            args.push('--system-prompt', request.parameters.systemPrompt);
        }
        // Add max tokens if provided
        // Note: Claude Code CLI uses --max-budget-usd for cost limits, not token limits
        // The model handles max tokens internally based on model capabilities
        // Add the prompt as the final positional argument
        args.push(request.prompt);
        return args;
    };
    /**
     * Executes a Claude Code subprocess and returns result.
     *
     * @param args - CLI arguments.
     * @param request - The original request (for error context).
     * @param requestTimeoutMs - Optional timeout in milliseconds for this request.
     * @returns The parsed model router result.
     */
    ClaudeCodeClient.prototype.executeSubprocess = function (args, request, requestTimeoutMs) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, result, _a, stderrStr, parsed, endTime, response, error_2, execaError;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        startTime = Date.now();
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 6, , 7]);
                        if (!(this.cwd !== undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, (0, execa_1.execa)(this.executablePath, args, {
                                timeout: requestTimeoutMs !== null && requestTimeoutMs !== void 0 ? requestTimeoutMs : this.timeoutMs,
                                reject: false,
                                cwd: this.cwd,
                            })];
                    case 2:
                        _a = _d.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, (0, execa_1.execa)(this.executablePath, args, {
                            timeout: requestTimeoutMs !== null && requestTimeoutMs !== void 0 ? requestTimeoutMs : this.timeoutMs,
                            reject: false,
                        })];
                    case 4:
                        _a = _d.sent();
                        _d.label = 5;
                    case 5:
                        result = _a;
                        if (result.exitCode !== 0) {
                            stderrStr = result.stderr;
                            if (stderrStr.includes('command not found') || stderrStr.includes('ENOENT')) {
                                return [2 /*return*/, (0, types_js_1.createFailureResult)((0, types_js_1.createModelError)("Claude Code CLI not found: ".concat(stderrStr || 'command not found'), false, { errorCode: 'CLAUDE_CODE_NOT_FOUND', request: request }))];
                            }
                            return [2 /*return*/, (0, types_js_1.createFailureResult)((0, types_js_1.createModelError)("Claude Code execution failed with exit code ".concat(String(result.exitCode)), true, {
                                    errorCode: "EXIT_".concat(String(result.exitCode)),
                                    request: request,
                                }))];
                        }
                        parsed = parseClaudeCodeOutput(result.stdout);
                        endTime = Date.now();
                        response = {
                            content: parsed.content,
                            usage: parsed.usage,
                            metadata: {
                                modelId: (_b = parsed.metadata.modelId) !== null && _b !== void 0 ? _b : 'unknown',
                                provider: 'claude-code',
                                latencyMs: (_c = parsed.metadata.latencyMs) !== null && _c !== void 0 ? _c : endTime - startTime,
                            },
                        };
                        if (request.requestId !== undefined) {
                            return [2 /*return*/, (0, types_js_1.createSuccessResult)(__assign(__assign({}, response), { requestId: request.requestId }))];
                        }
                        return [2 /*return*/, (0, types_js_1.createSuccessResult)(response)];
                    case 6:
                        error_2 = _d.sent();
                        execaError = error_2;
                        // Handle timeout
                        if (execaError.timedOut) {
                            return [2 /*return*/, (0, types_js_1.createFailureResult)((0, types_js_1.createModelError)("Request timed out after ".concat(String(this.timeoutMs), "ms"), true, {
                                    errorCode: 'TIMEOUT',
                                    request: request,
                                }))];
                        }
                        // Handle network/process errors
                        if (execaError.code === 'ENOENT') {
                            return [2 /*return*/, (0, types_js_1.createFailureResult)((0, types_js_1.createNetworkError)("Claude Code CLI not found at '".concat(this.executablePath, "'. Please install Claude Code."), { endpoint: this.executablePath, request: request }))];
                        }
                        return [2 /*return*/, (0, types_js_1.createFailureResult)((0, types_js_1.createModelError)("Subprocess execution failed: ".concat(execaError.message || String(error_2)), true, {
                                request: request,
                            }))];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send a simple prompt to a model.
     *
     * @param modelAlias - The model alias to route to.
     * @param prompt - The prompt text.
     * @param timeoutMs - Optional timeout in milliseconds for this request.
     * @returns A result containing the response or an error.
     */
    ClaudeCodeClient.prototype.prompt = function (modelAlias, prompt, timeoutMs) {
        return __awaiter(this, void 0, void 0, function () {
            var request, args;
            return __generator(this, function (_a) {
                request = { modelAlias: modelAlias, prompt: prompt };
                args = this.buildArgs(request);
                return [2 /*return*/, this.executeSubprocess(args, request, timeoutMs)];
            });
        });
    };
    /**
     * Send a complete request with parameters.
     *
     * @param request - The full request with model alias, prompt, and parameters.
     * @returns A result containing the response or an error.
     */
    ClaudeCodeClient.prototype.complete = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var args;
            return __generator(this, function (_a) {
                args = this.buildArgs(request);
                return [2 /*return*/, this.executeSubprocess(args, request)];
            });
        });
    };
    /**
     * Stream a response from the model.
     *
     * @param request - The full request with model alias, prompt, and parameters.
     * @yields StreamChunk objects as they arrive.
     * @returns The final ModelRouterResult when streaming completes.
     */
    ClaudeCodeClient.prototype.stream = function (request) {
        return __asyncGenerator(this, arguments, function stream_1() {
            var modelId, startTime, args, subprocess, fullContent, finalUsage, detectedModelId, latencyMs, buffer, _a, _b, _c, chunk, lines, _i, lines_2, line, parsed, _d, _e, contentBlock, msgUsage, resultUsage, _f, e_1_1, result, endTime, response;
            var _g, e_1, _h, _j;
            var _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
            return __generator(this, function (_4) {
                switch (_4.label) {
                    case 0:
                        modelId = resolveModelAlias(request.modelAlias, this.config);
                        startTime = Date.now();
                        args = __spreadArray([
                            '-p',
                            '--output-format',
                            'stream-json',
                            '--model',
                            modelId,
                            '--no-session-persistence'
                        ], this.additionalFlags, true);
                        if (((_k = request.parameters) === null || _k === void 0 ? void 0 : _k.systemPrompt) !== undefined && request.parameters.systemPrompt !== '') {
                            args.push('--system-prompt', request.parameters.systemPrompt);
                        }
                        args.push(request.prompt);
                        subprocess = this.cwd !== undefined
                            ? (0, execa_1.execa)(this.executablePath, args, {
                                timeout: this.timeoutMs,
                                reject: false,
                                cwd: this.cwd,
                            })
                            : (0, execa_1.execa)(this.executablePath, args, {
                                timeout: this.timeoutMs,
                                reject: false,
                            });
                        fullContent = '';
                        finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
                        detectedModelId = modelId;
                        latencyMs = 0;
                        buffer = '';
                        _4.label = 1;
                    case 1:
                        _4.trys.push([1, 16, 17, 22]);
                        _a = true, _b = __asyncValues(subprocess.stdout);
                        _4.label = 2;
                    case 2: return [4 /*yield*/, __await(_b.next())];
                    case 3:
                        if (!(_c = _4.sent(), _g = _c.done, !_g)) return [3 /*break*/, 15];
                        _j = _c.value;
                        _a = false;
                        chunk = _j;
                        buffer += String(chunk);
                        lines = buffer.split('\n');
                        // Keep the last incomplete line in the buffer
                        buffer = (_l = lines.pop()) !== null && _l !== void 0 ? _l : '';
                        _i = 0, lines_2 = lines;
                        _4.label = 4;
                    case 4:
                        if (!(_i < lines_2.length)) return [3 /*break*/, 14];
                        line = lines_2[_i];
                        if (!line.trim()) {
                            return [3 /*break*/, 13];
                        }
                        _4.label = 5;
                    case 5:
                        _4.trys.push([5, 12, , 13]);
                        parsed = JSON.parse(line);
                        if (!(parsed.type === 'assistant' && ((_m = parsed.message) === null || _m === void 0 ? void 0 : _m.content))) return [3 /*break*/, 11];
                        _d = 0, _e = parsed.message.content;
                        _4.label = 6;
                    case 6:
                        if (!(_d < _e.length)) return [3 /*break*/, 10];
                        contentBlock = _e[_d];
                        if (!(contentBlock.type === 'text' && contentBlock.text !== undefined)) return [3 /*break*/, 9];
                        fullContent += contentBlock.text;
                        return [4 /*yield*/, __await({
                                content: contentBlock.text,
                                done: false,
                            })];
                    case 7: return [4 /*yield*/, _4.sent()];
                    case 8:
                        _4.sent();
                        _4.label = 9;
                    case 9:
                        _d++;
                        return [3 /*break*/, 6];
                    case 10:
                        if (parsed.message.model !== undefined && parsed.message.model !== '') {
                            detectedModelId = parsed.message.model;
                        }
                        if (parsed.message.usage) {
                            msgUsage = parsed.message.usage;
                            finalUsage = {
                                promptTokens: ((_o = msgUsage.input_tokens) !== null && _o !== void 0 ? _o : 0) +
                                    ((_p = msgUsage.cache_read_input_tokens) !== null && _p !== void 0 ? _p : 0) +
                                    ((_q = msgUsage.cache_creation_input_tokens) !== null && _q !== void 0 ? _q : 0),
                                completionTokens: (_r = msgUsage.output_tokens) !== null && _r !== void 0 ? _r : 0,
                                totalTokens: ((_s = msgUsage.input_tokens) !== null && _s !== void 0 ? _s : 0) +
                                    ((_t = msgUsage.cache_read_input_tokens) !== null && _t !== void 0 ? _t : 0) +
                                    ((_u = msgUsage.cache_creation_input_tokens) !== null && _u !== void 0 ? _u : 0) +
                                    ((_v = msgUsage.output_tokens) !== null && _v !== void 0 ? _v : 0),
                            };
                        }
                        _4.label = 11;
                    case 11:
                        if (parsed.type === 'result') {
                            if (parsed.duration_ms !== undefined) {
                                latencyMs = parsed.duration_ms;
                            }
                            if (parsed.usage) {
                                resultUsage = parsed.usage;
                                finalUsage = {
                                    promptTokens: ((_w = resultUsage.input_tokens) !== null && _w !== void 0 ? _w : 0) +
                                        ((_x = resultUsage.cache_read_input_tokens) !== null && _x !== void 0 ? _x : 0) +
                                        ((_y = resultUsage.cache_creation_input_tokens) !== null && _y !== void 0 ? _y : 0),
                                    completionTokens: (_z = resultUsage.output_tokens) !== null && _z !== void 0 ? _z : 0,
                                    totalTokens: ((_0 = resultUsage.input_tokens) !== null && _0 !== void 0 ? _0 : 0) +
                                        ((_1 = resultUsage.cache_read_input_tokens) !== null && _1 !== void 0 ? _1 : 0) +
                                        ((_2 = resultUsage.cache_creation_input_tokens) !== null && _2 !== void 0 ? _2 : 0) +
                                        ((_3 = resultUsage.output_tokens) !== null && _3 !== void 0 ? _3 : 0),
                                };
                            }
                        }
                        return [3 /*break*/, 13];
                    case 12:
                        _f = _4.sent();
                        // Skip non-JSON lines
                        return [3 /*break*/, 13];
                    case 13:
                        _i++;
                        return [3 /*break*/, 4];
                    case 14:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 15: return [3 /*break*/, 22];
                    case 16:
                        e_1_1 = _4.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 22];
                    case 17:
                        _4.trys.push([17, , 20, 21]);
                        if (!(!_a && !_g && (_h = _b.return))) return [3 /*break*/, 19];
                        return [4 /*yield*/, __await(_h.call(_b))];
                    case 18:
                        _4.sent();
                        _4.label = 19;
                    case 19: return [3 /*break*/, 21];
                    case 20:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 21: return [7 /*endfinally*/];
                    case 22: return [4 /*yield*/, __await(subprocess)];
                    case 23:
                        result = _4.sent();
                        endTime = Date.now();
                        return [4 /*yield*/, __await({
                                content: '',
                                done: true,
                                usage: finalUsage,
                            })];
                    case 24: 
                    // Yield the final done chunk
                    return [4 /*yield*/, _4.sent()];
                    case 25:
                        // Yield the final done chunk
                        _4.sent();
                        if (!(result.exitCode !== 0)) return [3 /*break*/, 27];
                        return [4 /*yield*/, __await((0, types_js_1.createFailureResult)((0, types_js_1.createModelError)("Claude Code execution failed with exit code ".concat(String(result.exitCode)), true, {
                                errorCode: "EXIT_".concat(String(result.exitCode)),
                                request: request,
                            })))];
                    case 26: return [2 /*return*/, _4.sent()];
                    case 27:
                        response = {
                            content: fullContent,
                            usage: finalUsage,
                            metadata: {
                                modelId: detectedModelId,
                                provider: 'claude-code',
                                latencyMs: latencyMs || endTime - startTime,
                            },
                        };
                        if (!(request.requestId !== undefined)) return [3 /*break*/, 29];
                        return [4 /*yield*/, __await((0, types_js_1.createSuccessResult)(__assign(__assign({}, response), { requestId: request.requestId })))];
                    case 28: return [2 /*return*/, _4.sent()];
                    case 29: return [4 /*yield*/, __await((0, types_js_1.createSuccessResult)(response))];
                    case 30: return [2 /*return*/, _4.sent()];
                }
            });
        });
    };
    return ClaudeCodeClient;
}());
exports.ClaudeCodeClient = ClaudeCodeClient;
/**
 * Creates a Claude Code client with installation check.
 *
 * @param options - Client configuration options.
 * @returns A configured ClaudeCodeClient.
 * @throws ClaudeCodeNotInstalledError if Claude Code is not installed.
 *
 * @example
 * ```typescript
 * try {
 *   const client = await createClaudeCodeClient({ config });
 *   const result = await client.prompt('worker', 'Hello!');
 * } catch (error) {
 *   if (error instanceof ClaudeCodeNotInstalledError) {
 *     console.error('Please install Claude Code first.');
 *   }
 * }
 * ```
 */
function createClaudeCodeClient(options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkClaudeCodeInstalled(options.executablePath)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, new ClaudeCodeClient(options)];
            }
        });
    });
}
