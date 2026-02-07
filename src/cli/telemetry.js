"use strict";
/**
 * Telemetry collector for protocol execution.
 *
 * Tracks model calls, token usage, and execution time per phase
 * for display in status command and persistence.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryCollector = void 0;
/**
 * Telemetry collector for tracking protocol execution metrics.
 */
var TelemetryCollector = /** @class */ (function () {
    /**
     * Creates a new TelemetryCollector.
     */
    function TelemetryCollector() {
        this.phases = new Map();
    }
    /**
     * Records a model call for a specific phase.
     *
     * @param phase - The protocol phase.
     * @param promptTokens - Prompt tokens used.
     * @param completionTokens - Completion tokens used.
     * @param executionTimeMs - Execution time in milliseconds.
     */
    TelemetryCollector.prototype.recordModelCall = function (phase, promptTokens, completionTokens, executionTimeMs) {
        var phaseData = this.getOrCreatePhaseData(phase);
        phaseData.modelCalls += 1;
        phaseData.promptTokens += promptTokens;
        phaseData.completionTokens += completionTokens;
        phaseData.executionTimeMs += executionTimeMs;
    };
    /**
     * Records execution time for a specific phase (non-model operations).
     *
     * @param phase - The protocol phase.
     * @param executionTimeMs - Execution time in milliseconds.
     */
    TelemetryCollector.prototype.recordExecutionTime = function (phase, executionTimeMs) {
        var phaseData = this.getOrCreatePhaseData(phase);
        phaseData.executionTimeMs += executionTimeMs;
    };
    /**
     * Gets or creates phase telemetry data.
     *
     * @param phase - The protocol phase.
     * @returns The phase telemetry data.
     */
    TelemetryCollector.prototype.getOrCreatePhaseData = function (phase) {
        var phaseData = this.phases.get(phase);
        if (phaseData === undefined) {
            phaseData = {
                modelCalls: 0,
                promptTokens: 0,
                completionTokens: 0,
                executionTimeMs: 0,
            };
            this.phases.set(phase, phaseData);
        }
        return phaseData;
    };
    /**
     * Gets the full telemetry data.
     *
     * @returns The collected telemetry data.
     */
    TelemetryCollector.prototype.getTelemetryData = function () {
        var totalModelCalls = 0;
        var totalPromptTokens = 0;
        var totalCompletionTokens = 0;
        var totalExecutionTimeMs = 0;
        for (var _i = 0, _a = this.phases; _i < _a.length; _i++) {
            var _b = _a[_i], _ = _b[0], phaseData = _b[1];
            totalModelCalls += phaseData.modelCalls;
            totalPromptTokens += phaseData.promptTokens;
            totalCompletionTokens += phaseData.completionTokens;
            totalExecutionTimeMs += phaseData.executionTimeMs;
        }
        return {
            summary: {
                modelCalls: totalModelCalls,
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                executionTimeMs: totalExecutionTimeMs,
            },
            phases: this.phases,
        };
    };
    /**
     * Checks if any telemetry data has been collected.
     *
     * @returns True if at least one model call has been recorded.
     */
    TelemetryCollector.prototype.hasData = function () {
        for (var _i = 0, _a = this.phases; _i < _a.length; _i++) {
            var _b = _a[_i], phaseData = _b[1];
            if (phaseData.modelCalls > 0) {
                return true;
            }
        }
        return false;
    };
    /**
     * Resets all telemetry data.
     */
    TelemetryCollector.prototype.reset = function () {
        this.phases.clear();
    };
    /**
     * Formats execution time for display.
     *
     * @param ms - Time in milliseconds.
     * @returns Formatted time string (e.g., "45s", "8.2s", "1m 30s").
     */
    TelemetryCollector.formatTime = function (ms) {
        var totalSeconds = ms / 1000;
        if (totalSeconds < 60) {
            return "".concat(totalSeconds.toFixed(1), "s");
        }
        var minutes = Math.floor(totalSeconds / 60);
        var remainingSeconds = (totalSeconds % 60).toFixed(0);
        return "".concat(String(minutes), "m ").concat(remainingSeconds, "s");
    };
    /**
     * Formats token count with thousands separator.
     *
     * @param tokens - Token count.
     * @returns Formatted token string (e.g., "12,345").
     */
    TelemetryCollector.formatTokens = function (tokens) {
        return tokens.toLocaleString('en-US');
    };
    /**
     * Formats telemetry summary for status display.
     *
     * @param telemetry - The telemetry data.
     * @returns Formatted telemetry string or "No data collected".
     */
    TelemetryCollector.formatSummary = function (telemetry) {
        if (!TelemetryCollector.hasTelemetryData(telemetry)) {
            return 'Telemetry: No data collected';
        }
        var summary = telemetry.summary;
        var totalTokens = summary.promptTokens + summary.completionTokens;
        var formattedTime = TelemetryCollector.formatTime(summary.executionTimeMs);
        var formattedTokens = TelemetryCollector.formatTokens(totalTokens);
        return "Telemetry: ".concat(String(summary.modelCalls), " model calls | ").concat(formattedTokens, " tokens | ").concat(formattedTime, " execution");
    };
    /**
     * Formats per-phase telemetry breakdown for verbose display.
     *
     * @param telemetry - The telemetry data.
     * @returns Array of formatted per-phase strings.
     */
    TelemetryCollector.formatPerPhase = function (telemetry) {
        var lines = [];
        for (var _i = 0, _a = telemetry.phases; _i < _a.length; _i++) {
            var _b = _a[_i], phase = _b[0], phaseData = _b[1];
            if (phaseData.modelCalls > 0) {
                var totalTokens = phaseData.promptTokens + phaseData.completionTokens;
                var formattedTime = TelemetryCollector.formatTime(phaseData.executionTimeMs);
                var formattedTokens = TelemetryCollector.formatTokens(totalTokens);
                lines.push("".concat(phase, " phase: ").concat(String(phaseData.modelCalls), " call").concat(phaseData.modelCalls === 1 ? '' : 's', ", ").concat(formattedTokens, " tokens, ").concat(formattedTime));
            }
        }
        return lines;
    };
    /**
     * Checks if telemetry data has been collected.
     *
     * @param telemetry - The telemetry data.
     * @returns True if at least one model call has been recorded.
     */
    TelemetryCollector.hasTelemetryData = function (telemetry) {
        for (var _i = 0, _a = telemetry.phases; _i < _a.length; _i++) {
            var _b = _a[_i], phaseData = _b[1];
            if (phaseData.modelCalls > 0) {
                return true;
            }
        }
        return false;
    };
    /**
     * Serializes telemetry data to a plain object for JSON serialization.
     *
     * @param telemetry - The telemetry data to serialize.
     * @returns Plain object representation.
     */
    TelemetryCollector.serialize = function (telemetry) {
        var phasesObj = {};
        for (var _i = 0, _a = telemetry.phases; _i < _a.length; _i++) {
            var _b = _a[_i], phase = _b[0], phaseData = _b[1];
            phasesObj[phase] = {
                modelCalls: phaseData.modelCalls,
                promptTokens: phaseData.promptTokens,
                completionTokens: phaseData.completionTokens,
                executionTimeMs: phaseData.executionTimeMs,
            };
        }
        return {
            summary: {
                modelCalls: telemetry.summary.modelCalls,
                promptTokens: telemetry.summary.promptTokens,
                completionTokens: telemetry.summary.completionTokens,
                executionTimeMs: telemetry.summary.executionTimeMs,
            },
            phases: phasesObj,
        };
    };
    /**
     * Deserializes telemetry data from a plain object.
     *
     * @param data - The plain object to deserialize.
     * @returns The deserialized telemetry data.
     * @throws Error if data is invalid.
     */
    TelemetryCollector.deserialize = function (data) {
        if (data === null || typeof data !== 'object') {
            throw new Error('Invalid telemetry data: expected an object');
        }
        var obj = data;
        if (typeof obj.summary !== 'object' || obj.summary === null) {
            throw new Error('Invalid telemetry data: missing or invalid summary');
        }
        var summary = obj.summary;
        var summaryModelCalls = typeof summary.modelCalls === 'number' ? summary.modelCalls : 0;
        var summaryPromptTokens = typeof summary.promptTokens === 'number' ? summary.promptTokens : 0;
        var summaryCompletionTokens = typeof summary.completionTokens === 'number' ? summary.completionTokens : 0;
        var summaryExecutionTimeMs = typeof summary.executionTimeMs === 'number' ? summary.executionTimeMs : 0;
        var summaryData = {
            modelCalls: summaryModelCalls,
            promptTokens: summaryPromptTokens,
            completionTokens: summaryCompletionTokens,
            executionTimeMs: summaryExecutionTimeMs,
        };
        if (typeof obj.phases !== 'object' || obj.phases === null) {
            return { summary: summaryData, phases: new Map() };
        }
        var phases = new Map();
        var phasesObj = obj.phases;
        for (var _i = 0, _a = Object.entries(phasesObj); _i < _a.length; _i++) {
            var _b = _a[_i], phaseName = _b[0], phaseValue = _b[1];
            if (typeof phaseValue !== 'object' || phaseValue === null) {
                continue;
            }
            var phaseData = phaseValue;
            var modelCalls = typeof phaseData.modelCalls === 'number' ? phaseData.modelCalls : 0;
            var promptTokens = typeof phaseData.promptTokens === 'number' ? phaseData.promptTokens : 0;
            var completionTokens = typeof phaseData.completionTokens === 'number' ? phaseData.completionTokens : 0;
            var executionTimeMs = typeof phaseData.executionTimeMs === 'number' ? phaseData.executionTimeMs : 0;
            if (isValidProtocolPhase(phaseName)) {
                phases.set(phaseName, {
                    modelCalls: modelCalls,
                    promptTokens: promptTokens,
                    completionTokens: completionTokens,
                    executionTimeMs: executionTimeMs,
                });
            }
        }
        return { summary: summaryData, phases: phases };
    };
    return TelemetryCollector;
}());
exports.TelemetryCollector = TelemetryCollector;
/**
 * Checks if a string is a valid ProtocolPhase.
 *
 * @param value - The string to check.
 * @returns True if value is a valid ProtocolPhase.
 */
function isValidProtocolPhase(value) {
    var validPhases = [
        'Ignition',
        'Lattice',
        'CompositionAudit',
        'Injection',
        'Mesoscopic',
        'MassDefect',
    ];
    return validPhases.includes(value);
}
