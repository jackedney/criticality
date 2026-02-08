"use strict";
/**
 * Live display component for protocol execution.
 *
 * Provides real-time terminal updates using @opentui/core with:
 * - Animated spinner with phase/task/operation hierarchy
 * - Elapsed time counter updating every second
 * - Recent log entries (last 3-5 lines) below spinner
 * - Efficient rendering without flicker
 * - Terminal resize handling
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveDisplay = void 0;
var types_js_1 = require("../../protocol/types.js");
/**
 * Spinner frame characters for animation.
 */
var SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/**
 * Fallback spinner for non-Unicode terminals.
 */
var ASCII_SPINNER_FRAMES = ['-', '\\', '|', '/'];
/**
 * Live display class for protocol execution.
 *
 * Uses efficient terminal rendering with live updates,
 * elapsed time, and log scrolling.
 */
var LiveDisplay = /** @class */ (function () {
    /**
     * Create a new LiveDisplay instance.
     *
     * @param options - Display configuration options.
     */
    function LiveDisplay(options) {
        var _a;
        this.startTime = 0;
        this.timerInterval = null;
        this.spinnerInterval = null;
        this.currentFrame = 0;
        this.logBuffer = [];
        this.phase = 'Ignition';
        this.substate = { kind: 'Active' };
        this.isRunning = false;
        this.lastOutput = '';
        this.options = options;
        this.maxLogEntries = (_a = options.maxLogEntries) !== null && _a !== void 0 ? _a : 5;
        this.isTty = process.stdout.isTTY;
    }
    /**
     * Initialize the live display.
     */
    LiveDisplay.prototype.start = function () {
        var _this = this;
        this.startTime = Date.now();
        this.isRunning = true;
        if (this.isTty) {
            this.spinnerInterval = setInterval(function () {
                _this.update();
            }, 100);
            this.timerInterval = setInterval(function () {
                _this.update();
            }, 1000);
            this.update();
        }
        else {
            process.stdout.write(this.getStaticDisplay() + '\n');
        }
    };
    /**
     * Stop the live display.
     */
    LiveDisplay.prototype.stop = function () {
        this.isRunning = false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
        if (this.isTty) {
            process.stdout.write('\r\x1b[2K');
            process.stdout.write('\x1b[?25l');
        }
    };
    /**
     * Update the phase and substate.
     *
     * @param phase - The protocol phase.
     * @param substate - The protocol substate.
     */
    LiveDisplay.prototype.updatePhase = function (phase, substate) {
        this.phase = phase;
        this.substate = substate;
        this.addLog("Phase: ".concat(phase, " > ").concat(this.formatSubstate(substate)));
        this.update();
    };
    /**
     * Add a log entry.
     *
     * @param message - The log message.
     */
    LiveDisplay.prototype.addLog = function (message) {
        var entry = {
            timestamp: new Date(),
            message: message,
        };
        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.maxLogEntries) {
            this.logBuffer.shift();
        }
        this.update();
    };
    /**
     * Update the display output.
     */
    LiveDisplay.prototype.update = function () {
        if (!this.isRunning || !this.isTty) {
            return;
        }
        var output = this.getDisplay();
        if (output !== this.lastOutput) {
            this.lastOutput = output;
            process.stdout.write('\r\x1b[2K' + output);
        }
    };
    /**
     * Get the current display text.
     *
     * @returns The formatted display text.
     */
    LiveDisplay.prototype.getDisplay = function () {
        var spinnerLine = this.getSpinnerLine();
        var timeLine = this.getElapsedTimeLine();
        var logs = this.getLogLines();
        return spinnerLine + '\n' + timeLine + '\n' + logs.join('\n');
    };
    /**
     * Get static display for non-TTY environments.
     *
     * @returns The formatted static display text.
     */
    LiveDisplay.prototype.getStaticDisplay = function () {
        var timeLine = this.getElapsedTimeLine();
        return "".concat(this.phase, " > ").concat(this.formatSubstate(this.substate), "\n").concat(timeLine);
    };
    /**
     * Get the spinner line.
     *
     * @returns The formatted spinner line.
     */
    LiveDisplay.prototype.getSpinnerLine = function () {
        var frames = this.options.unicode ? SPINNER_FRAMES : ASCII_SPINNER_FRAMES;
        var frame = String(frames[this.currentFrame % frames.length]);
        var substateText = this.formatSubstate(this.substate);
        return "".concat(frame, " ").concat(this.phase).concat(substateText !== 'active' ? ' > ' + substateText : '');
    };
    /**
     * Get the elapsed time line.
     *
     * @returns The formatted elapsed time.
     */
    LiveDisplay.prototype.getElapsedTimeLine = function () {
        var elapsed = Date.now() - this.startTime;
        var seconds = Math.floor(elapsed / 1000);
        var minutes = Math.floor(seconds / 60);
        var remainingSeconds = seconds % 60;
        if (minutes > 0) {
            return "".concat(String(minutes), "m ").concat(String(remainingSeconds), "s elapsed");
        }
        return "".concat(String(seconds), "s elapsed");
    };
    /**
     * Get the log lines.
     *
     * @returns The formatted log lines.
     */
    LiveDisplay.prototype.getLogLines = function () {
        var lines = [];
        var dimCode = this.options.colors ? '\x1b[2m' : '';
        var resetCode = this.options.colors ? '\x1b[0m' : '';
        for (var i = 0; i < this.maxLogEntries; i++) {
            var entry = this.logBuffer[i];
            if (entry) {
                var timeStr = entry.timestamp.toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                });
                lines.push("".concat(dimCode, "[").concat(timeStr, "]").concat(resetCode, " ").concat(entry.message));
            }
        }
        return lines;
    };
    /**
     * Format the substate for display.
     *
     * @param substate - The protocol substate.
     * @returns Formatted substate string.
     */
    LiveDisplay.prototype.formatSubstate = function (substate) {
        var kind = substate.kind;
        if (kind === 'Active') {
            if ((0, types_js_1.isActiveSubstate)(substate)) {
                var parts = [];
                if (substate.task !== undefined) {
                    parts.push(substate.task);
                }
                if (substate.operation !== undefined) {
                    parts.push(substate.operation);
                }
                if (parts.length === 0) {
                    return 'active';
                }
                return parts.join(' > ');
            }
            return 'active';
        }
        if (kind === 'Blocking') {
            var query = substate.query;
            return "blocked: ".concat(query.substring(0, 30)).concat(query.length > 30 ? '...' : '');
        }
        var error = substate.error;
        return "failed: ".concat(error.substring(0, 30)).concat(error.length > 30 ? '...' : '');
    };
    return LiveDisplay;
}());
exports.LiveDisplay = LiveDisplay;
