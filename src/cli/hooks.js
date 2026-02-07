"use strict";
/**
 * Notification hook execution module.
 *
 * Executes shell commands configured as notification hooks for
 * various protocol events (block, complete, error, phase change).
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationHooksExecutor = void 0;
exports.createHooksExecutor = createHooksExecutor;
var execa_1 = require("execa");
/**
 * Substitutes template variables in hook command.
 *
 * @param command - Command with placeholders like {phase}, {error}, {timestamp}.
 * @param variables - Variables to substitute.
 * @returns Command with variables replaced.
 */
function substituteVariables(command, variables) {
    var result = command;
    if (variables.phase !== undefined) {
        result = result.replace(/\{phase\}/g, variables.phase);
    }
    if (variables.error !== undefined) {
        result = result.replace(/\{error\}/g, variables.error);
    }
    if (variables.timestamp !== undefined) {
        result = result.replace(/\{timestamp\}/g, variables.timestamp);
    }
    return result;
}
/**
 * Executes a single notification hook.
 *
 * @param hook - The hook configuration.
 * @param variables - Variables for template substitution.
 * @param cwd - Working directory for command execution.
 * @returns Whether the hook executed successfully.
 */
function executeHook(hook, variables, cwd) {
    return __awaiter(this, void 0, void 0, function () {
        var command, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!hook.enabled) {
                        return [2 /*return*/, false];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    command = substituteVariables(hook.command, variables);
                    return [4 /*yield*/, (0, execa_1.execa)('sh', ['-c', command], {
                            cwd: cwd,
                            reject: false,
                            timeout: 5000,
                        })];
                case 2:
                    _b.sent();
                    return [2 /*return*/, true];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Hooks module for executing notification hooks.
 */
var NotificationHooksExecutor = /** @class */ (function () {
    /**
     * Creates a new NotificationHooksExecutor.
     *
     * @param hooks - Notification hooks configuration.
     * @param cwd - Working directory for command execution. Default: process.cwd().
     */
    function NotificationHooksExecutor(hooks, cwd) {
        this.hooks = hooks;
        this.cwd = cwd !== null && cwd !== void 0 ? cwd : process.cwd();
    }
    /**
     * Executes on_block hook when protocol enters blocking state.
     *
     * @param query - The blocking query.
     * @returns Whether the hook executed.
     */
    NotificationHooksExecutor.prototype.onBlock = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var variables;
            return __generator(this, function (_a) {
                if (this.hooks.on_block === undefined) {
                    return [2 /*return*/, false];
                }
                variables = {
                    error: query,
                    timestamp: new Date().toISOString(),
                };
                return [2 /*return*/, executeHook(this.hooks.on_block, variables, this.cwd)];
            });
        });
    };
    /**
     * Executes on_complete hook when protocol completes successfully.
     *
     * @param phase - The final phase.
     * @returns Whether the hook executed.
     */
    NotificationHooksExecutor.prototype.onComplete = function (phase) {
        return __awaiter(this, void 0, void 0, function () {
            var variables;
            return __generator(this, function (_a) {
                if (this.hooks.on_complete === undefined) {
                    return [2 /*return*/, false];
                }
                variables = {
                    phase: phase,
                    timestamp: new Date().toISOString(),
                };
                return [2 /*return*/, executeHook(this.hooks.on_complete, variables, this.cwd)];
            });
        });
    };
    /**
     * Executes on_error hook when an error occurs.
     *
     * @param error - The error message.
     * @param phase - The phase where error occurred.
     * @returns Whether the hook executed.
     */
    NotificationHooksExecutor.prototype.onError = function (error, phase) {
        return __awaiter(this, void 0, void 0, function () {
            var variables;
            return __generator(this, function (_a) {
                if (this.hooks.on_error === undefined) {
                    return [2 /*return*/, false];
                }
                variables = {
                    error: error,
                    timestamp: new Date().toISOString(),
                };
                if (phase !== undefined) {
                    variables.phase = phase;
                }
                return [2 /*return*/, executeHook(this.hooks.on_error, variables, this.cwd)];
            });
        });
    };
    /**
     * Executes on_phase_change hook when phase changes.
     *
     * @param _fromPhase - The previous phase (unused in current implementation).
     * @param toPhase - The new phase.
     * @returns Whether the hook executed.
     */
    NotificationHooksExecutor.prototype.onPhaseChange = function (_fromPhase, toPhase) {
        return __awaiter(this, void 0, void 0, function () {
            var variables;
            return __generator(this, function (_a) {
                if (this.hooks.on_phase_change === undefined) {
                    return [2 /*return*/, false];
                }
                variables = {
                    phase: toPhase,
                    timestamp: new Date().toISOString(),
                };
                return [2 /*return*/, executeHook(this.hooks.on_phase_change, variables, this.cwd)];
            });
        });
    };
    return NotificationHooksExecutor;
}());
exports.NotificationHooksExecutor = NotificationHooksExecutor;
/**
 * Creates a notification hooks executor.
 *
 * @param hooks - Notification hooks configuration.
 * @param cwd - Working directory for command execution.
 * @returns A NotificationHooksExecutor instance.
 */
function createHooksExecutor(hooks, cwd) {
    return new NotificationHooksExecutor(hooks, cwd);
}
