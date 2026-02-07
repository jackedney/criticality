"use strict";
/**
 * Protocol state types for the Criticality Protocol orchestrator.
 *
 * Defines the state representation for protocol phases, including
 * active, blocking, and failed substates.
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
exports.PROTOCOL_PHASES = void 0;
exports.isActiveSubstate = isActiveSubstate;
exports.isBlockingSubstate = isBlockingSubstate;
exports.isFailedSubstate = isFailedSubstate;
exports.createActiveSubstate = createActiveSubstate;
exports.createBlockingSubstate = createBlockingSubstate;
exports.createFailedSubstate = createFailedSubstate;
exports.createProtocolState = createProtocolState;
exports.createActiveState = createActiveState;
exports.isValidPhase = isValidPhase;
exports.getPhaseIndex = getPhaseIndex;
exports.isTerminalState = isTerminalState;
exports.canTransition = canTransition;
/**
 * Array of all protocol phases in execution order.
 * Useful for iteration and validation.
 */
exports.PROTOCOL_PHASES = [
    'Ignition',
    'Lattice',
    'CompositionAudit',
    'Injection',
    'Mesoscopic',
    'MassDefect',
    'Complete',
];
/**
 * Type guard to check if a substate is Active.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Active.
 */
function isActiveSubstate(substate) {
    return substate.kind === 'Active';
}
/**
 * Type guard to check if a substate is Blocking.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Blocking.
 */
function isBlockingSubstate(substate) {
    return substate.kind === 'Blocking';
}
/**
 * Type guard to check if a substate is Failed.
 *
 * @param substate - The substate to check.
 * @returns True if the substate is Failed.
 */
function isFailedSubstate(substate) {
    return substate.kind === 'Failed';
}
/**
 * Creates an Active substate.
 *
 * @param options - Optional task and operation information.
 * @returns A new Active substate.
 */
function createActiveSubstate(options) {
    if (options === undefined) {
        return { kind: 'Active' };
    }
    var task = options.task, operation = options.operation;
    if (task !== undefined && operation !== undefined) {
        return { kind: 'Active', task: task, operation: operation };
    }
    if (task !== undefined) {
        return { kind: 'Active', task: task };
    }
    if (operation !== undefined) {
        return { kind: 'Active', operation: operation };
    }
    return { kind: 'Active' };
}
/**
 * Creates a Blocking substate.
 *
 * @param options - Options for the blocking substate.
 * @returns A new Blocking substate.
 */
function createBlockingSubstate(options) {
    var base = {
        kind: 'Blocking',
        query: options.query,
        blockedAt: new Date().toISOString(),
    };
    // Build result conditionally to satisfy exactOptionalPropertyTypes
    if (options.options !== undefined && options.timeoutMs !== undefined) {
        return __assign(__assign({}, base), { options: options.options, timeoutMs: options.timeoutMs });
    }
    if (options.options !== undefined) {
        return __assign(__assign({}, base), { options: options.options });
    }
    if (options.timeoutMs !== undefined) {
        return __assign(__assign({}, base), { timeoutMs: options.timeoutMs });
    }
    return base;
}
/**
 * Creates a Failed substate.
 *
 * @param options - Options for the failed substate.
 * @returns A new Failed substate.
 */
function createFailedSubstate(options) {
    var _a;
    var base = {
        kind: 'Failed',
        error: options.error,
        failedAt: new Date().toISOString(),
        recoverable: (_a = options.recoverable) !== null && _a !== void 0 ? _a : false,
    };
    // Build result conditionally to satisfy exactOptionalPropertyTypes
    // We need explicit type guards for TypeScript to narrow correctly
    var code = options.code;
    var context = options.context;
    if (code !== undefined && context !== undefined) {
        return __assign(__assign({}, base), { code: code, context: context });
    }
    if (code !== undefined) {
        return __assign(__assign({}, base), { code: code });
    }
    if (context !== undefined) {
        return __assign(__assign({}, base), { context: context });
    }
    return base;
}
/**
 * Creates a ProtocolState with the given phase and substate.
 *
 * @param phase - The protocol phase.
 * @param substate - The substate within the phase.
 * @returns A new ProtocolState.
 */
function createProtocolState(phase, substate) {
    return { phase: phase, substate: substate };
}
/**
 * Creates an active ProtocolState for the given phase.
 *
 * @param phase - The protocol phase.
 * @param options - Optional task and operation information.
 * @returns A new ProtocolState in Active substate.
 */
function createActiveState(phase, options) {
    return createProtocolState(phase, createActiveSubstate(options));
}
/**
 * Checks if a string is a valid ProtocolPhase.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid ProtocolPhase.
 */
function isValidPhase(value) {
    return exports.PROTOCOL_PHASES.includes(value);
}
/**
 * Gets the index of a phase in the execution order.
 *
 * @param phase - The phase to look up.
 * @returns The zero-based index of the phase.
 */
function getPhaseIndex(phase) {
    return exports.PROTOCOL_PHASES.indexOf(phase);
}
/**
 * Checks if the protocol is in a terminal state.
 *
 * @param state - The protocol state to check.
 * @returns True if the protocol is complete or has failed.
 */
function isTerminalState(state) {
    return state.phase === 'Complete' || isFailedSubstate(state.substate);
}
/**
 * Checks if the protocol can accept new transitions.
 *
 * @param state - The protocol state to check.
 * @returns True if the protocol is active and not in a terminal state.
 */
function canTransition(state) {
    return isActiveSubstate(state.substate) && !isTerminalState(state);
}
