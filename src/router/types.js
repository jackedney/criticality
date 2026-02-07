"use strict";
/**
 * Model Router types for the Criticality Protocol.
 *
 * Defines the abstract interface for model routing, allowing different
 * backends (Claude Code, OpenCode, etc.) to be used interchangeably.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_KINDS = exports.MODEL_ALIASES = void 0;
exports.isRetryableError = isRetryableError;
exports.isModelRouterError = isModelRouterError;
exports.createRateLimitError = createRateLimitError;
exports.createAuthenticationError = createAuthenticationError;
exports.createModelError = createModelError;
exports.createTimeoutError = createTimeoutError;
exports.createNetworkError = createNetworkError;
exports.createValidationError = createValidationError;
exports.createSuccessResult = createSuccessResult;
exports.createFailureResult = createFailureResult;
exports.isValidModelAlias = isValidModelAlias;
/**
 * Type guard to check if an error is retryable.
 *
 * @param error - The error to check.
 * @returns True if the error can be retried.
 */
function isRetryableError(error) {
    return error.retryable;
}
/**
 * Type guard to check if a value is a ModelRouterError.
 *
 * @param value - The value to check.
 * @returns True if the value is a ModelRouterError.
 */
function isModelRouterError(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    var obj = value;
    var validKinds = [
        'RateLimitError',
        'AuthenticationError',
        'ModelError',
        'TimeoutError',
        'NetworkError',
        'ValidationError',
    ];
    return (typeof obj.kind === 'string' &&
        validKinds.includes(obj.kind) &&
        typeof obj.message === 'string');
}
/**
 * Creates a RateLimitError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A RateLimitError instance.
 */
function createRateLimitError(message, options) {
    var base = {
        kind: 'RateLimitError',
        message: message,
        retryable: true,
    };
    // Build conditionally to satisfy exactOptionalPropertyTypes
    var _a = options !== null && options !== void 0 ? options : {}, retryAfterMs = _a.retryAfterMs, cause = _a.cause, request = _a.request;
    if (retryAfterMs !== undefined && cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { retryAfterMs: retryAfterMs, cause: cause, request: request });
    }
    if (retryAfterMs !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { retryAfterMs: retryAfterMs, cause: cause });
    }
    if (retryAfterMs !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { retryAfterMs: retryAfterMs, request: request });
    }
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (retryAfterMs !== undefined) {
        return __assign(__assign({}, base), { retryAfterMs: retryAfterMs });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates an AuthenticationError.
 *
 * @param message - Error message.
 * @param provider - The provider that rejected authentication.
 * @param options - Additional options.
 * @returns An AuthenticationError instance.
 */
function createAuthenticationError(message, provider, options) {
    var base = {
        kind: 'AuthenticationError',
        message: message,
        provider: provider,
        retryable: false,
    };
    var _a = options !== null && options !== void 0 ? options : {}, cause = _a.cause, request = _a.request;
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates a ModelError.
 *
 * @param message - Error message.
 * @param retryable - Whether the error can be retried.
 * @param options - Additional options.
 * @returns A ModelError instance.
 */
function createModelError(message, retryable, options) {
    var base = {
        kind: 'ModelError',
        message: message,
        retryable: retryable,
    };
    var _a = options !== null && options !== void 0 ? options : {}, errorCode = _a.errorCode, modelId = _a.modelId, cause = _a.cause, request = _a.request;
    // Build conditionally for exactOptionalPropertyTypes compliance
    // Using explicit object construction to avoid readonly assignment issues
    if (errorCode !== undefined &&
        modelId !== undefined &&
        cause !== undefined &&
        request !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, modelId: modelId, cause: cause, request: request });
    }
    if (errorCode !== undefined && modelId !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, modelId: modelId, cause: cause });
    }
    if (errorCode !== undefined && modelId !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, modelId: modelId, request: request });
    }
    if (errorCode !== undefined && cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, cause: cause, request: request });
    }
    if (modelId !== undefined && cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { modelId: modelId, cause: cause, request: request });
    }
    if (errorCode !== undefined && modelId !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, modelId: modelId });
    }
    if (errorCode !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, cause: cause });
    }
    if (errorCode !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode, request: request });
    }
    if (modelId !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { modelId: modelId, cause: cause });
    }
    if (modelId !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { modelId: modelId, request: request });
    }
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (errorCode !== undefined) {
        return __assign(__assign({}, base), { errorCode: errorCode });
    }
    if (modelId !== undefined) {
        return __assign(__assign({}, base), { modelId: modelId });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates a TimeoutError.
 *
 * @param message - Error message.
 * @param timeoutMs - The timeout duration in milliseconds.
 * @param options - Additional options.
 * @returns A TimeoutError instance.
 */
function createTimeoutError(message, timeoutMs, options) {
    var base = {
        kind: 'TimeoutError',
        message: message,
        timeoutMs: timeoutMs,
        retryable: true,
    };
    var _a = options !== null && options !== void 0 ? options : {}, cause = _a.cause, request = _a.request;
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates a NetworkError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A NetworkError instance.
 */
function createNetworkError(message, options) {
    var base = {
        kind: 'NetworkError',
        message: message,
        retryable: true,
    };
    var _a = options !== null && options !== void 0 ? options : {}, endpoint = _a.endpoint, cause = _a.cause, request = _a.request;
    // Build conditionally for exactOptionalPropertyTypes compliance
    if (endpoint !== undefined && cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { endpoint: endpoint, cause: cause, request: request });
    }
    if (endpoint !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { endpoint: endpoint, cause: cause });
    }
    if (endpoint !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { endpoint: endpoint, request: request });
    }
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (endpoint !== undefined) {
        return __assign(__assign({}, base), { endpoint: endpoint });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates a ValidationError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A ValidationError instance.
 */
function createValidationError(message, options) {
    var base = {
        kind: 'ValidationError',
        message: message,
        retryable: false,
    };
    var _a = options !== null && options !== void 0 ? options : {}, invalidFields = _a.invalidFields, cause = _a.cause, request = _a.request;
    // Build conditionally for exactOptionalPropertyTypes compliance
    if (invalidFields !== undefined && cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { invalidFields: invalidFields, cause: cause, request: request });
    }
    if (invalidFields !== undefined && cause !== undefined) {
        return __assign(__assign({}, base), { invalidFields: invalidFields, cause: cause });
    }
    if (invalidFields !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { invalidFields: invalidFields, request: request });
    }
    if (cause !== undefined && request !== undefined) {
        return __assign(__assign({}, base), { cause: cause, request: request });
    }
    if (invalidFields !== undefined) {
        return __assign(__assign({}, base), { invalidFields: invalidFields });
    }
    if (cause !== undefined) {
        return __assign(__assign({}, base), { cause: cause });
    }
    if (request !== undefined) {
        return __assign(__assign({}, base), { request: request });
    }
    return base;
}
/**
 * Creates a successful result.
 *
 * @param response - The successful response.
 * @returns A successful ModelRouterResult.
 */
function createSuccessResult(response) {
    return { success: true, response: response };
}
/**
 * Creates a failure result.
 *
 * @param error - The error that occurred.
 * @returns A failure ModelRouterResult.
 */
function createFailureResult(error) {
    return { success: false, error: error };
}
/**
 * Array of all valid model aliases.
 * Useful for validation and iteration.
 */
exports.MODEL_ALIASES = [
    'architect',
    'auditor',
    'structurer',
    'worker',
    'fallback',
];
/**
 * Checks if a string is a valid ModelAlias.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid ModelAlias.
 */
function isValidModelAlias(value) {
    return exports.MODEL_ALIASES.includes(value);
}
/**
 * Array of all valid error kinds.
 * Useful for validation and iteration.
 */
exports.ERROR_KINDS = [
    'RateLimitError',
    'AuthenticationError',
    'ModelError',
    'TimeoutError',
    'NetworkError',
    'ValidationError',
];
