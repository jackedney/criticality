"use strict";
/**
 * Blocking state management for human intervention.
 *
 * Provides functions to enter blocking state from any phase,
 * resolve blocking with human decisions, and handle timeouts.
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
exports.generateBlockingQueryId = generateBlockingQueryId;
exports.enterBlocking = enterBlocking;
exports.resolveBlocking = resolveBlocking;
exports.checkTimeout = checkTimeout;
exports.handleTimeout = handleTimeout;
exports.getRemainingTimeout = getRemainingTimeout;
exports.hasTimeout = hasTimeout;
exports.getTimeoutDeadline = getTimeoutDeadline;
var types_js_1 = require("./types.js");
/**
 * Mapping of decision phases to protocol phases.
 * Used when recording decisions to the ledger.
 */
function protocolPhaseToDecisionPhase(phase) {
    switch (phase) {
        case 'Ignition':
            return 'ignition';
        case 'Lattice':
            return 'lattice';
        case 'CompositionAudit':
            return 'composition_audit';
        case 'Injection':
            return 'injection';
        case 'Mesoscopic':
            return 'mesoscopic';
        case 'MassDefect':
            return 'mass_defect';
        case 'Complete':
            // Complete phase shouldn't be blocking, but map to design as fallback
            return 'design';
    }
}
/**
 * Generates a unique blocking query ID.
 *
 * @param phase - The phase in which blocking is occurring.
 * @returns A unique ID for the blocking query.
 */
function generateBlockingQueryId(phase) {
    var timestamp = Date.now();
    var random = Math.random().toString(36).substring(2, 8);
    return "blocking_".concat(phase.toLowerCase(), "_").concat(String(timestamp), "_").concat(random);
}
/**
 * Creates a blocking error.
 *
 * @param code - Error code.
 * @param message - Human-readable message.
 * @returns A BlockingError object.
 */
function createBlockingError(code, message) {
    return { code: code, message: message };
}
/**
 * Enters a blocking state from any phase.
 *
 * This transitions the protocol state to a blocking substate,
 * recording the query and available options for human intervention.
 *
 * @param currentState - The current protocol state.
 * @param options - Options for the blocking state.
 * @returns Result containing the new state and blocking record, or an error.
 *
 * @example
 * ```typescript
 * const state = createActiveState('Lattice');
 * const result = enterBlocking(state, {
 *   query: 'Approve architecture?',
 *   options: ['Yes', 'No', 'Revise'],
 *   timeoutMs: 300000, // 5 minutes
 * });
 *
 * if (result.success) {
 *   console.log(`Blocked: ${result.record.id}`);
 * }
 * ```
 */
function enterBlocking(currentState, options) {
    var _a;
    // Cannot block in Complete phase
    if (currentState.phase === 'Complete') {
        return {
            success: false,
            error: createBlockingError('INVALID_PHASE', 'Cannot enter blocking state in Complete phase'),
        };
    }
    // Cannot enter blocking if already blocking
    if ((0, types_js_1.isBlockingSubstate)(currentState.substate)) {
        return {
            success: false,
            error: createBlockingError('ALREADY_BLOCKING', "Already in blocking state with query: \"".concat(currentState.substate.query, "\"")),
        };
    }
    // Generate ID if not provided
    var blockingId = (_a = options.id) !== null && _a !== void 0 ? _a : generateBlockingQueryId(currentState.phase);
    // Create the blocking substate - handle optional fields for exactOptionalPropertyTypes
    var blockingOpts = { query: options.query };
    if (options.options !== undefined) {
        blockingOpts.options = options.options;
    }
    if (options.timeoutMs !== undefined) {
        blockingOpts.timeoutMs = options.timeoutMs;
    }
    var blockingSubstate = (0, types_js_1.createBlockingSubstate)(blockingOpts);
    // Create the new state
    var newState = (0, types_js_1.createProtocolState)(currentState.phase, blockingSubstate);
    // Create the blocking record
    var recordBase = {
        id: blockingId,
        phase: currentState.phase,
        query: options.query,
        blockedAt: blockingSubstate.blockedAt,
        resolved: false,
    };
    // Build record conditionally to satisfy exactOptionalPropertyTypes
    var record;
    if (options.options !== undefined && options.timeoutMs !== undefined) {
        record = __assign(__assign({}, recordBase), { options: options.options, timeoutMs: options.timeoutMs });
    }
    else if (options.options !== undefined) {
        record = __assign(__assign({}, recordBase), { options: options.options });
    }
    else if (options.timeoutMs !== undefined) {
        record = __assign(__assign({}, recordBase), { timeoutMs: options.timeoutMs });
    }
    else {
        record = recordBase;
    }
    return {
        success: true,
        state: newState,
        record: record,
    };
}
/**
 * Resolves a blocking state and records the decision to the ledger.
 *
 * This transitions the protocol state back to active and creates
 * a decision entry in the ledger recording the human intervention.
 *
 * @param currentState - The current protocol state (must be blocking).
 * @param record - The blocking record for this blocking state.
 * @param resolveOptions - Options for resolving the blocking.
 * @param ledger - The decision ledger to record the resolution.
 * @returns Result containing the new state, decision, and updated record, or an error.
 *
 * @example
 * ```typescript
 * const result = resolveBlocking(
 *   blockingState,
 *   blockingRecord,
 *   { response: 'Yes', rationale: 'Architecture meets requirements' },
 *   ledger
 * );
 *
 * if (result.success) {
 *   console.log(`Decision recorded: ${result.decision.id}`);
 * }
 * ```
 */
function resolveBlocking(currentState, record, resolveOptions, ledger) {
    // Must be in blocking state
    if (!(0, types_js_1.isBlockingSubstate)(currentState.substate)) {
        return {
            success: false,
            error: createBlockingError('NOT_BLOCKING', 'Cannot resolve: state is not in blocking substate'),
        };
    }
    // Check if already resolved
    if (record.resolved) {
        return {
            success: false,
            error: createBlockingError('ALREADY_RESOLVED', "Blocking query '".concat(record.id, "' has already been resolved")),
        };
    }
    // Validate response against options if options are provided
    var blockingSubstate = currentState.substate;
    if (blockingSubstate.options !== undefined &&
        blockingSubstate.options.length > 0 &&
        resolveOptions.allowCustomResponse !== true) {
        if (!blockingSubstate.options.includes(resolveOptions.response)) {
            return {
                success: false,
                error: createBlockingError('INVALID_RESPONSE', "Response '".concat(resolveOptions.response, "' is not in available options: ").concat(blockingSubstate.options.join(', '), ". Use allowCustomResponse: true to allow custom responses.")),
            };
        }
    }
    // Create the resolution
    var resolution = {
        response: resolveOptions.response,
        resolvedAt: new Date().toISOString(),
    };
    // Add rationale if provided - need to handle exactOptionalPropertyTypes
    var finalResolution;
    if (resolveOptions.rationale !== undefined) {
        finalResolution = __assign(__assign({}, resolution), { rationale: resolveOptions.rationale });
    }
    else {
        finalResolution = resolution;
    }
    // Record the decision to the ledger
    var decisionInputBase = {
        category: 'blocking',
        constraint: "Human resolution for query: \"".concat(record.query, "\" - Response: \"").concat(resolveOptions.response, "\""),
        source: 'human_resolution',
        confidence: 'canonical',
        phase: protocolPhaseToDecisionPhase(record.phase),
        human_query_id: record.id,
    };
    // Add rationale to decision input if provided
    var decisionInput;
    if (resolveOptions.rationale !== undefined) {
        decisionInput = __assign(__assign({}, decisionInputBase), { rationale: resolveOptions.rationale });
    }
    else {
        decisionInput = decisionInputBase;
    }
    var decision = ledger.append(decisionInput);
    // Create the active substate
    var activeSubstate = (0, types_js_1.createActiveSubstate)();
    // Create the new state
    var newState = (0, types_js_1.createProtocolState)(currentState.phase, activeSubstate);
    // Update the blocking record
    var updatedRecordBase = __assign(__assign({}, record), { resolved: true, resolution: finalResolution });
    // Preserve optional fields properly
    var updatedRecord;
    if (record.options !== undefined && record.timeoutMs !== undefined) {
        updatedRecord = __assign(__assign({}, updatedRecordBase), { options: record.options, timeoutMs: record.timeoutMs });
    }
    else if (record.options !== undefined) {
        updatedRecord = __assign(__assign({}, updatedRecordBase), { options: record.options });
    }
    else if (record.timeoutMs !== undefined) {
        updatedRecord = __assign(__assign({}, updatedRecordBase), { timeoutMs: record.timeoutMs });
    }
    else {
        updatedRecord = updatedRecordBase;
    }
    return {
        success: true,
        state: newState,
        decision: decision,
        record: updatedRecord,
    };
}
/**
 * Checks if a blocking state has timed out.
 *
 * @param record - The blocking record to check.
 * @param now - Optional current time for testing (defaults to Date.now()).
 * @returns Result indicating timeout status.
 *
 * @example
 * ```typescript
 * const result = checkTimeout(blockingRecord);
 *
 * if (result.timedOut) {
 *   console.log(`Timed out ${result.exceededByMs}ms ago`);
 * } else if (result.remainingMs !== undefined) {
 *   console.log(`${result.remainingMs}ms remaining`);
 * }
 * ```
 */
function checkTimeout(record, now) {
    // If no timeout configured, never times out
    if (record.timeoutMs === undefined) {
        return { timedOut: false };
    }
    var currentTime = now !== null && now !== void 0 ? now : Date.now();
    var blockedAtTime = new Date(record.blockedAt).getTime();
    var deadlineTime = blockedAtTime + record.timeoutMs;
    if (currentTime >= deadlineTime) {
        return {
            timedOut: true,
            exceededByMs: currentTime - deadlineTime,
        };
    }
    return {
        timedOut: false,
        remainingMs: deadlineTime - currentTime,
    };
}
/**
 * Handles a timeout on a blocked state.
 *
 * This function applies the specified timeout handling strategy:
 * - 'escalate': Returns error indicating timeout needs escalation
 * - 'default': Uses the default response and resolves the blocking
 * - 'fail': Transitions to failed state
 *
 * @param currentState - The current protocol state (must be blocking).
 * @param record - The blocking record for this blocking state.
 * @param options - Options for handling the timeout.
 * @param ledger - Optional ledger for recording decisions (required for 'default' strategy).
 * @returns Result containing the handled state or error.
 *
 * @example
 * ```typescript
 * // Check and handle timeout
 * const timeoutResult = checkTimeout(record);
 *
 * if (timeoutResult.timedOut) {
 *   const handleResult = handleTimeout(state, record, {
 *     strategy: 'default',
 *     defaultResponse: 'Yes',
 *     rationale: 'Timeout - using default response',
 *   }, ledger);
 * }
 * ```
 */
function handleTimeout(currentState, record, options, ledger) {
    var _a;
    // Must be in blocking state
    if (!(0, types_js_1.isBlockingSubstate)(currentState.substate)) {
        return {
            success: false,
            error: createBlockingError('NOT_BLOCKING', 'Cannot handle timeout: state is not in blocking substate'),
        };
    }
    // Check if timeout is configured
    if (record.timeoutMs === undefined) {
        return {
            success: false,
            error: createBlockingError('NO_TIMEOUT', 'Cannot handle timeout: no timeout configured for this blocking state'),
        };
    }
    // Check if already resolved
    if (record.resolved) {
        return {
            success: false,
            error: createBlockingError('ALREADY_RESOLVED', "Blocking query '".concat(record.id, "' has already been resolved")),
        };
    }
    switch (options.strategy) {
        case 'escalate': {
            // Return error indicating escalation needed
            return {
                success: false,
                error: createBlockingError('NOT_BLOCKING', // Reusing code; could define specific TIMEOUT_ESCALATION
                "Timeout on blocking query '".concat(record.id, "' requires escalation")),
            };
        }
        case 'default': {
            // Use default response to resolve
            if (options.defaultResponse === undefined) {
                return {
                    success: false,
                    error: createBlockingError('INVALID_RESPONSE', 'Default response required for "default" timeout strategy'),
                };
            }
            if (ledger === undefined) {
                return {
                    success: false,
                    error: createBlockingError('NOT_BLOCKING', // Reusing code
                    'Ledger required for "default" timeout strategy'),
                };
            }
            // Resolve with default response
            var resolveResult = resolveBlocking(currentState, record, {
                response: options.defaultResponse,
                rationale: (_a = options.rationale) !== null && _a !== void 0 ? _a : "Timeout after ".concat(String(record.timeoutMs), "ms - using default response"),
                allowCustomResponse: true, // Default may not be in options
            }, ledger);
            if (!resolveResult.success) {
                return resolveResult;
            }
            return {
                success: true,
                state: resolveResult.state,
                record: resolveResult.record,
                decision: resolveResult.decision,
            };
        }
        case 'fail': {
            // Transition to failed state
            var failedSubstate = {
                kind: 'Failed',
                error: "Timeout on blocking query: \"".concat(record.query, "\""),
                code: 'BLOCKING_TIMEOUT',
                failedAt: new Date().toISOString(),
                recoverable: true,
                context: "Blocking query ID: ".concat(record.id, ", Timeout: ").concat(String(record.timeoutMs), "ms"),
            };
            var newState = (0, types_js_1.createProtocolState)(currentState.phase, failedSubstate);
            // Update record as "resolved" (via timeout)
            var resolution = {
                response: 'TIMEOUT_FAILURE',
                resolvedAt: failedSubstate.failedAt,
            };
            // Add rationale if provided
            var finalResolution = void 0;
            if (options.rationale !== undefined) {
                finalResolution = __assign(__assign({}, resolution), { rationale: options.rationale });
            }
            else {
                finalResolution = __assign(__assign({}, resolution), { rationale: 'Timeout triggered failure' });
            }
            var updatedRecordBase = __assign(__assign({}, record), { resolved: true, resolution: finalResolution });
            // Preserve optional fields properly
            var updatedRecord = void 0;
            if (record.options !== undefined) {
                updatedRecord = __assign(__assign({}, updatedRecordBase), { options: record.options, timeoutMs: record.timeoutMs });
            }
            else {
                updatedRecord = __assign(__assign({}, updatedRecordBase), { timeoutMs: record.timeoutMs });
            }
            return {
                success: true,
                state: newState,
                record: updatedRecord,
            };
        }
    }
}
/**
 * Gets the remaining time until timeout.
 *
 * @param record - The blocking record.
 * @param now - Optional current time for testing.
 * @returns Remaining milliseconds, or undefined if no timeout or already timed out.
 */
function getRemainingTimeout(record, now) {
    var result = checkTimeout(record, now);
    if (result.timedOut) {
        return undefined;
    }
    return result.remainingMs;
}
/**
 * Checks if a blocking record has a timeout configured.
 *
 * @param record - The blocking record.
 * @returns True if timeout is configured.
 */
function hasTimeout(record) {
    return record.timeoutMs !== undefined;
}
/**
 * Gets the deadline timestamp for a blocking record.
 *
 * @param record - The blocking record.
 * @returns The deadline as ISO 8601 string, or undefined if no timeout.
 */
function getTimeoutDeadline(record) {
    if (record.timeoutMs === undefined) {
        return undefined;
    }
    var blockedAtTime = new Date(record.blockedAt).getTime();
    var deadlineTime = blockedAtTime + record.timeoutMs;
    return new Date(deadlineTime).toISOString();
}
