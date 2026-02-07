"use strict";
/**
 * Error suggestion system for the Criticality Protocol CLI.
 *
 * Provides contextual suggestions based on error types to help users
 * resolve issues quickly.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferErrorType = inferErrorType;
exports.formatErrorWithSuggestions = formatErrorWithSuggestions;
exports.displayErrorWithSuggestions = displayErrorWithSuggestions;
exports.isErrorRecoverable = isErrorRecoverable;
/**
 * Error suggestion mappings.
 */
var ERROR_SUGGESTIONS = {
    model_failure: [
        {
            text: 'Check your API key is configured correctly',
            action: 'crit config --check-api-key',
        },
        {
            text: 'Verify you have not exceeded API rate limits',
            action: 'Check API dashboard for rate limits',
        },
        {
            text: 'Ensure the model service is available',
            action: 'Try: ping -c 3 api.anthropic.com',
        },
        {
            text: 'Check network connectivity',
            action: 'Try: curl -I https://api.anthropic.com',
        },
    ],
    compilation_error: [
        {
            text: 'Review the file and line number in the error message',
        },
        {
            text: 'Fix syntax or type errors in the indicated file',
        },
        {
            text: 'If changes are recent, consider rolling back',
            action: 'git diff --stat to see changes',
        },
        {
            text: 'Run TypeScript compiler directly for details',
            action: 'npx tsc --noEmit',
        },
    ],
    test_failure: [
        {
            text: 'Identify which test(s) failed from the output',
        },
        {
            text: 'Run the specific failing test with verbose output',
            action: 'npm test -- --run <test-file>',
        },
        {
            text: 'Check for broken test expectations',
            action: 'Review test assertions',
        },
        {
            text: 'Run tests with coverage to understand gaps',
            action: 'npm run test:coverage',
        },
    ],
    state_corruption: [
        {
            text: 'Check if a backup archive exists',
            action: 'ls .criticality/archives/',
        },
        {
            text: 'Restore from a recent backup if available',
            action: 'crit restore <backup-file>',
        },
        {
            text: 'Reset protocol state to initial checkpoint',
            action: 'crit init --force',
        },
        {
            text: 'Manual fix: edit state file (advanced)',
            action: 'vim .criticality/state.json',
        },
    ],
    unknown: [
        {
            text: 'Check the error logs for detailed information',
            action: 'cat .ralph/errors.log',
        },
        {
            text: 'Review recent protocol activity',
            action: 'crit status --watch',
        },
        {
            text: 'Run verbose mode for more debugging output',
            action: 'crit resume --verbose',
        },
        {
            text: 'Report the issue if it persists',
            action: 'https://github.com/anomalyco/criticality/issues',
        },
    ],
};
/**
 * Extracts error type from error message or context.
 *
 * @param errorMessage - The error message to analyze.
 * @returns The identified error type.
 */
function inferErrorType(errorMessage) {
    var lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('model') ||
        lowerMessage.includes('api') ||
        lowerMessage.includes('anthropic') ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('rate limit') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('network')) {
        return 'model_failure';
    }
    if (lowerMessage.includes('compilation') ||
        lowerMessage.includes('compile') ||
        lowerMessage.includes('typescript') ||
        lowerMessage.includes('tsc') ||
        lowerMessage.includes('build') ||
        lowerMessage.includes('syntax') ||
        lowerMessage.includes('type error')) {
        return 'compilation_error';
    }
    if (lowerMessage.includes('test') ||
        lowerMessage.includes('spec') ||
        lowerMessage.includes('assert') ||
        lowerMessage.includes('vitest')) {
        return 'test_failure';
    }
    if (lowerMessage.includes('state') ||
        lowerMessage.includes('corruption') ||
        lowerMessage.includes('invalid') ||
        lowerMessage.includes('parse error') ||
        lowerMessage.includes('json')) {
        return 'state_corruption';
    }
    return 'unknown';
}
/**
 * Gets suggestions for a given error type.
 *
 * @param errorType - The type of error.
 * @returns Array of suggestions.
 */
function getSuggestions(errorType) {
    return ERROR_SUGGESTIONS[errorType];
}
/**
 * Formats a suggestion for display.
 *
 * @param suggestion - The suggestion to format.
 * @param index - The suggestion index (1-based).
 * @param options - Display options.
 * @returns Formatted suggestion string.
 */
function formatSuggestion(suggestion, index, options) {
    var yellowCode = options.colors ? '\x1b[33m' : '';
    var resetCode = options.colors ? '\x1b[0m' : '';
    var dimCode = options.colors ? '\x1b[2m' : '';
    var prefix = "".concat(yellowCode).concat(String(index), ".").concat(resetCode);
    var actionText = suggestion.action ? "\n    ".concat(dimCode).concat(suggestion.action).concat(resetCode) : '';
    return "  ".concat(prefix, " ").concat(suggestion.text).concat(actionText);
}
/**
 * Formats error message with contextual suggestions.
 *
 * @param errorMessage - The error message.
 * @param context - Additional error context.
 * @param options - Display options.
 * @returns Formatted error with suggestions.
 */
function formatErrorWithSuggestions(errorMessage, context, options) {
    var _a, _b, _c, _d;
    if (context === void 0) { context = {}; }
    if (options === void 0) { options = { colors: true, unicode: true }; }
    var errorType = (_a = context.errorType) !== null && _a !== void 0 ? _a : inferErrorType(errorMessage);
    var suggestions = getSuggestions(errorType);
    var boldCode = options.colors ? '\x1b[1m' : '';
    var resetCode = options.colors ? '\x1b[0m' : '';
    var redCode = options.colors ? '\x1b[31m' : '';
    var yellowCode = options.colors ? '\x1b[33m' : '';
    var result = "".concat(redCode, "Error:").concat(resetCode, " ").concat(errorMessage);
    if (((_b = context.details) === null || _b === void 0 ? void 0 : _b.filePath) !== undefined) {
        result += "\n  ".concat(yellowCode, "File:").concat(resetCode, " ").concat(context.details.filePath);
        if (context.details.lineNumber !== undefined) {
            result += ":".concat(context.details.lineNumber);
        }
    }
    if (((_c = context.details) === null || _c === void 0 ? void 0 : _c.testName) !== undefined) {
        result += "\n  ".concat(yellowCode, "Test:").concat(resetCode, " ").concat(context.details.testName);
    }
    if (((_d = context.details) === null || _d === void 0 ? void 0 : _d.retryAfterMs) !== undefined) {
        var waitSeconds = Math.ceil(context.details.retryAfterMs / 1000);
        result += "\n  ".concat(yellowCode, "Wait:").concat(resetCode, " ").concat(String(waitSeconds), "s before retrying");
    }
    if (context.phase !== undefined) {
        result += "\n  ".concat(yellowCode, "Phase:").concat(resetCode, " ").concat(context.phase);
    }
    result += "\n\n".concat(boldCode, "Suggestions:").concat(resetCode);
    for (var i = 0; i < suggestions.length; i++) {
        var suggestion = suggestions[i];
        if (suggestion !== undefined) {
            result += '\n' + formatSuggestion(suggestion, i + 1, options);
        }
    }
    return result;
}
/**
 * Displays error message with suggestions to console.
 *
 * @param errorMessage - The error message.
 * @param context - Additional error context.
 * @param options - Display options.
 */
function displayErrorWithSuggestions(errorMessage, context, options) {
    if (context === void 0) { context = {}; }
    if (options === void 0) { options = { colors: true, unicode: true }; }
    console.error();
    console.error(formatErrorWithSuggestions(errorMessage, context, options));
    console.error();
}
/**
 * Gets recoverable status for error type.
 *
 * @param errorType - The type of error.
 * @returns Whether the error is typically recoverable.
 */
function isErrorRecoverable(errorType) {
    switch (errorType) {
        case 'model_failure':
            return true;
        case 'compilation_error':
            return true;
        case 'test_failure':
            return true;
        case 'state_corruption':
            return false;
        case 'unknown':
            return false;
        default: {
            // Exhaustive check - if new ErrorType is added, this will error
            var exhaustiveCheck = errorType;
            return exhaustiveCheck;
        }
    }
}
