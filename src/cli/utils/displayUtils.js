"use strict";
/**
 * Shared display utilities for CLI commands.
 *
 * Provides common formatting functions for time, confidence levels,
 * and box-drawing borders used across multiple CLI commands.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRelativeTime = formatRelativeTime;
exports.formatConfidence = formatConfidence;
exports.getBorderChars = getBorderChars;
exports.wrapInBox = wrapInBox;
function formatRelativeTime(timestamp) {
    var now = new Date();
    var then = new Date(timestamp);
    var diffMs = now.getTime() - then.getTime();
    var seconds = Math.floor(diffMs / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    if (days > 0) {
        return "".concat(String(days), "d ago");
    }
    if (hours > 0) {
        return "".concat(String(hours), "h ago");
    }
    if (minutes > 0) {
        return "".concat(String(minutes), "m ago");
    }
    return 'just now';
}
function formatConfidence(confidence, options) {
    var boldCode = options.colors ? '\x1b[1m' : '';
    var dimCode = options.colors ? '\x1b[2m' : '';
    var resetCode = options.colors ? '\x1b[0m' : '';
    if (confidence === 'canonical') {
        return "".concat(boldCode, "[canonical]").concat(resetCode);
    }
    if (confidence === 'suspended' || confidence === 'blocking') {
        return "".concat(dimCode, "[").concat(confidence, "]").concat(resetCode);
    }
    return "[".concat(confidence, "]");
}
function getBorderChars(options) {
    if (options.unicode) {
        return {
            topLeft: '┌',
            topRight: '┐',
            bottomLeft: '└',
            bottomRight: '┘',
            horizontal: '─',
            vertical: '│',
            topDivider: '┬',
            bottomDivider: '┴',
            leftDivider: '├',
            rightDivider: '┤',
            cross: '┼',
        };
    }
    return {
        topLeft: '+',
        topRight: '+',
        bottomLeft: '+',
        bottomRight: '+',
        horizontal: '-',
        vertical: '|',
        topDivider: '+',
        bottomDivider: '+',
        leftDivider: '+',
        rightDivider: '+',
        cross: '+',
    };
}
/**
 * Strips ANSI escape sequences from a string to get visible length.
 *
 * @param str - The string potentially containing ANSI codes.
 * @returns The string with ANSI codes removed.
 */
function stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}
function wrapInBox(text, options) {
    var border = getBorderChars(options);
    var lines = text.split('\n');
    var maxLength = Math.max.apply(Math, lines.map(function (line) { return stripAnsi(line).length; }));
    var horizontalBorder = border.horizontal.repeat(maxLength + 2);
    var result = border.topLeft + horizontalBorder + border.topRight + '\n';
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        var visibleLength = stripAnsi(line).length;
        var padding = ' '.repeat(maxLength - visibleLength);
        result += border.vertical + ' ' + line + padding + ' ' + border.vertical + '\n';
    }
    result += border.bottomLeft + horizontalBorder + border.bottomRight;
    return result;
}
