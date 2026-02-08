"use strict";
/**
 * Phase transition logic for the Criticality Protocol.
 *
 * Implements the state machine for phase transitions, including:
 * - Valid forward transitions (Ignition → Lattice → CompositionAudit → ...)
 * - Failure transitions (rollback to earlier phases)
 * - Artifact validation for transitions
 * - Context shedding at phase boundaries
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILURE_REQUIRED_ARTIFACTS = exports.REQUIRED_ARTIFACTS = exports.FAILURE_TRANSITIONS = exports.FORWARD_TRANSITIONS = void 0;
exports.createTransitionArtifacts = createTransitionArtifacts;
exports.isValidForwardTransition = isValidForwardTransition;
exports.isValidFailureTransition = isValidFailureTransition;
exports.isValidTransition = isValidTransition;
exports.getRequiredArtifacts = getRequiredArtifacts;
exports.validateArtifacts = validateArtifacts;
exports.shedContext = shedContext;
exports.transition = transition;
exports.getValidTransitions = getValidTransitions;
exports.getNextPhase = getNextPhase;
var types_js_1 = require("./types.js");
/**
 * Valid forward transitions as defined in SPECIFICATION.md.
 *
 * Each entry maps a source phase to its valid next phase in the
 * normal execution flow.
 */
exports.FORWARD_TRANSITIONS = new Map([
    ['Ignition', 'Lattice'],
    ['Lattice', 'CompositionAudit'],
    ['CompositionAudit', 'Injection'],
    ['Injection', 'Mesoscopic'],
    ['Mesoscopic', 'MassDefect'],
    ['MassDefect', 'Complete'],
]);
/**
 * Valid failure transitions as defined in SPECIFICATION.md.
 *
 * Each entry maps a source phase to the phases it can transition
 * to upon failure/rollback.
 */
exports.FAILURE_TRANSITIONS = new Map([
    ['CompositionAudit', ['Ignition']], // Contradiction found
    ['Injection', ['Lattice']], // Circuit breaker tripped
    ['Mesoscopic', ['Injection']], // Cluster failure - re-inject
]);
/**
 * Artifact requirements for forward transitions.
 *
 * Maps each transition to the artifacts required from the previous phase.
 */
exports.REQUIRED_ARTIFACTS = new Map([
    ['Lattice', ['spec']], // Ignition → Lattice requires spec.toml
    ['CompositionAudit', ['latticeCode', 'witnesses', 'contracts']], // Lattice output
    ['Injection', ['validatedStructure']], // CompositionAudit output
    ['Mesoscopic', ['implementedCode']], // Injection output
    ['MassDefect', ['verifiedCode']], // Mesoscopic output
    ['Complete', ['finalArtifact']], // MassDefect output
]);
/**
 * Artifact requirements for failure transitions.
 *
 * Maps each failure transition (from, to) to required artifacts.
 */
exports.FAILURE_REQUIRED_ARTIFACTS = new Map([
    ['CompositionAudit->Ignition', ['contradictionReport']],
    ['Injection->Lattice', ['structuralDefectReport']],
    ['Mesoscopic->Injection', ['clusterFailureReport']],
]);
/**
 * Creates a TransitionArtifacts object from an array of artifact types.
 *
 * @param artifacts - Array of available artifact types.
 * @returns A TransitionArtifacts object.
 */
function createTransitionArtifacts(artifacts) {
    return { available: new Set(artifacts) };
}
/**
 * Creates a successful transition result.
 *
 * @param state - The new protocol state.
 * @param contextShed - Whether context shedding was triggered.
 * @returns A successful transition result.
 */
function successResult(state, contextShed) {
    return { success: true, state: state, contextShed: contextShed };
}
/**
 * Creates a failed transition result.
 *
 * @param error - The transition error.
 * @returns A failed transition result.
 */
function errorResult(error) {
    return { success: false, error: error };
}
/**
 * Creates a transition error.
 *
 * @param code - Error code.
 * @param message - Human-readable message.
 * @param fromPhase - Source phase.
 * @param toPhase - Target phase.
 * @param missingArtifacts - Optional missing artifacts.
 * @returns A TransitionError.
 */
function createTransitionError(code, message, fromPhase, toPhase, missingArtifacts) {
    if (missingArtifacts !== undefined) {
        return { code: code, message: message, fromPhase: fromPhase, toPhase: toPhase, missingArtifacts: missingArtifacts };
    }
    return { code: code, message: message, fromPhase: fromPhase, toPhase: toPhase };
}
/**
 * Checks if a transition is a valid forward transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if this is a valid forward transition.
 */
function isValidForwardTransition(from, to) {
    return exports.FORWARD_TRANSITIONS.get(from) === to;
}
/**
 * Checks if a transition is a valid failure transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if this is a valid failure transition.
 */
function isValidFailureTransition(from, to) {
    var _a, _b;
    return (_b = (_a = exports.FAILURE_TRANSITIONS.get(from)) === null || _a === void 0 ? void 0 : _a.includes(to)) !== null && _b !== void 0 ? _b : false;
}
/**
 * Checks if a transition is valid (either forward or failure).
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns True if the transition is valid.
 */
function isValidTransition(from, to) {
    return isValidForwardTransition(from, to) || isValidFailureTransition(from, to);
}
/**
 * Gets the required artifacts for a transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns Array of required artifact types, or undefined if transition is invalid.
 */
function getRequiredArtifacts(from, to) {
    var _a, _b;
    if (isValidForwardTransition(from, to)) {
        return (_a = exports.REQUIRED_ARTIFACTS.get(to)) !== null && _a !== void 0 ? _a : [];
    }
    if (isValidFailureTransition(from, to)) {
        var key = "".concat(from, "->").concat(to);
        return (_b = exports.FAILURE_REQUIRED_ARTIFACTS.get(key)) !== null && _b !== void 0 ? _b : [];
    }
    return undefined;
}
/**
 * Validates that all required artifacts are present.
 *
 * @param required - Required artifact types.
 * @param available - Available artifacts.
 * @returns Array of missing artifact types.
 */
function validateArtifacts(required, available) {
    var missing = [];
    for (var _i = 0, required_1 = required; _i < required_1.length; _i++) {
        var artifact = required_1[_i];
        if (!available.available.has(artifact)) {
            missing.push(artifact);
        }
    }
    return missing;
}
/**
 * Placeholder function for context shedding.
 *
 * Context shedding destroys all LLM conversation history at phase boundaries
 * to prevent entropy accumulation. This is a placeholder that will be
 * implemented in a future story.
 *
 * @param fromPhase - The phase being exited.
 * @param toPhase - The phase being entered.
 * @returns True when context shedding is complete.
 */
function shedContext(fromPhase, toPhase) {
    // Placeholder: In the full implementation, this would:
    // 1. Archive any conversation artifacts that should be preserved
    // 2. Clear all LLM conversation state
    // 3. Record the transition in telemetry
    // 4. Return only the Decision Ledger and phase artifacts
    // For now, we just acknowledge the transition happened
    void fromPhase;
    void toPhase;
    return true;
}
/**
 * Generates a descriptive error message for an invalid transition.
 *
 * @param from - Source phase.
 * @param to - Target phase.
 * @returns Human-readable error message.
 */
function getInvalidTransitionMessage(from, to) {
    var _a;
    var validForward = exports.FORWARD_TRANSITIONS.get(from);
    var validFailures = exports.FAILURE_TRANSITIONS.get(from);
    var validTargets = [];
    if (validForward !== undefined) {
        validTargets.push(validForward);
    }
    if (validFailures !== undefined) {
        validTargets.push.apply(validTargets, validFailures);
    }
    if (validTargets.length === 0) {
        return "Phase '".concat(from, "' does not support any transitions");
    }
    var fromIndex = (0, types_js_1.getPhaseIndex)(from);
    var toIndex = (0, types_js_1.getPhaseIndex)(to);
    if (toIndex > fromIndex && toIndex !== fromIndex + 1) {
        return "Cannot skip phases: transition from '".concat(from, "' to '").concat(to, "' is not allowed. Valid next phase: '").concat(validForward !== null && validForward !== void 0 ? validForward : 'none', "'");
    }
    if (toIndex < fromIndex && !isValidFailureTransition(from, to)) {
        return "Cannot transition from '".concat(from, "' to '").concat(to, "': not a valid failure transition. Valid failure transitions: ").concat((_a = validFailures === null || validFailures === void 0 ? void 0 : validFailures.join(', ')) !== null && _a !== void 0 ? _a : 'none');
    }
    return "Invalid transition from '".concat(from, "' to '").concat(to, "'. Valid transitions: ").concat(validTargets.join(', '));
}
/**
 * Attempts to transition the protocol to a new phase.
 *
 * This function validates:
 * 1. The current state allows transitions (Active substate, not terminal)
 * 2. The target phase is reachable from the current phase
 * 3. All required artifacts are present
 *
 * On success, triggers context shedding and returns the new state.
 *
 * @param currentState - The current protocol state.
 * @param targetPhase - The phase to transition to.
 * @param options - Optional transition options.
 * @returns A TransitionResult indicating success or failure.
 *
 * @example
 * ```typescript
 * // Successful forward transition
 * const state = createActiveState('Ignition');
 * const artifacts = createTransitionArtifacts(['spec']);
 * const result = transition(state, 'Lattice', { artifacts });
 *
 * if (result.success) {
 *   console.log(`Transitioned to ${result.state.phase}`);
 * }
 *
 * // Invalid transition returns descriptive error
 * const badResult = transition(state, 'Injection');
 * if (!badResult.success) {
 *   console.log(badResult.error.message);
 *   // "Cannot skip phases: transition from 'Ignition' to 'Injection' is not allowed"
 * }
 * ```
 */
function transition(currentState, targetPhase, options) {
    var _a;
    var fromPhase = currentState.phase;
    // Check if current state allows transitions
    if (!(0, types_js_1.canTransition)(currentState)) {
        // Determine specific error based on substate
        if (currentState.substate.kind === 'Blocking') {
            return errorResult(createTransitionError('BLOCKED_STATE', "Cannot transition from '".concat(fromPhase, "' while in blocking state awaiting human intervention"), fromPhase, targetPhase));
        }
        if (currentState.substate.kind === 'Failed') {
            return errorResult(createTransitionError('FAILED_STATE', "Cannot transition from '".concat(fromPhase, "' which is in a failed state"), fromPhase, targetPhase));
        }
        if (fromPhase === 'Complete') {
            return errorResult(createTransitionError('ALREADY_COMPLETE', 'Protocol execution is already complete; no further transitions allowed', fromPhase, targetPhase));
        }
        return errorResult(createTransitionError('STATE_NOT_ACTIVE', "Cannot transition from '".concat(fromPhase, "': state is not active"), fromPhase, targetPhase));
    }
    // Check if transition is valid
    var isForward = isValidForwardTransition(fromPhase, targetPhase);
    var isFailure = isValidFailureTransition(fromPhase, targetPhase);
    if (!isForward && !isFailure) {
        return errorResult(createTransitionError('INVALID_TRANSITION', getInvalidTransitionMessage(fromPhase, targetPhase), fromPhase, targetPhase));
    }
    // Get required artifacts
    var requiredArtifacts = getRequiredArtifacts(fromPhase, targetPhase);
    // Validate artifacts if required
    if (requiredArtifacts !== undefined && requiredArtifacts.length > 0) {
        var availableArtifacts = (_a = options === null || options === void 0 ? void 0 : options.artifacts) !== null && _a !== void 0 ? _a : createTransitionArtifacts([]);
        var missingArtifacts = validateArtifacts(requiredArtifacts, availableArtifacts);
        if (missingArtifacts.length > 0) {
            var missingList = missingArtifacts.join(', ');
            return errorResult(createTransitionError('MISSING_ARTIFACTS', "Cannot transition from '".concat(fromPhase, "' to '").concat(targetPhase, "': missing required artifacts: ").concat(missingList), fromPhase, targetPhase, missingArtifacts));
        }
    }
    // Perform context shedding
    var contextShed = shedContext(fromPhase, targetPhase);
    // Create new state
    var newState = (0, types_js_1.createActiveState)(targetPhase);
    return successResult(newState, contextShed);
}
/**
 * Gets all valid target phases from a given phase.
 *
 * @param from - The source phase.
 * @returns Array of valid target phases (forward and failure).
 */
function getValidTransitions(from) {
    var targets = [];
    var forward = exports.FORWARD_TRANSITIONS.get(from);
    if (forward !== undefined) {
        targets.push(forward);
    }
    var failures = exports.FAILURE_TRANSITIONS.get(from);
    if (failures !== undefined) {
        targets.push.apply(targets, failures);
    }
    return targets;
}
/**
 * Gets the next phase in the normal forward progression.
 *
 * @param from - The source phase.
 * @returns The next phase, or undefined if at Complete or invalid.
 */
function getNextPhase(from) {
    return exports.FORWARD_TRANSITIONS.get(from);
}
