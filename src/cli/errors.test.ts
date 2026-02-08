/**
 * Error suggestion system tests.
 *
 * Verifies that error suggestions are correctly formatted and displayed
 * for different error types.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  formatErrorWithSuggestions,
  displayErrorWithSuggestions,
  inferErrorType,
  isErrorRecoverable,
  type ErrorContext,
  type ErrorType,
} from './errors.js';

/**
 * Strips ANSI escape sequences from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Error suggestion system', () => {
  const displayOptions = {
    colors: true,
    unicode: true,
  };

  const plainOptions = {
    colors: false,
    unicode: false,
  };

  describe('inferErrorType', () => {
    it('should identify model failure errors', () => {
      expect(inferErrorType('Model call failed: Authentication failed')).toBe('model_failure');
      expect(inferErrorType('Rate limit exceeded')).toBe('model_failure');
      expect(inferErrorType('Network error: connection refused')).toBe('model_failure');
      expect(inferErrorType('Timeout error: request took too long')).toBe('model_failure');
      expect(inferErrorType('API error: invalid key')).toBe('model_failure');
    });

    it('should identify compilation errors', () => {
      expect(inferErrorType('Compilation failed with exit code 1')).toBe('compilation_error');
      expect(inferErrorType('TypeScript error: Type string is not assignable')).toBe(
        'compilation_error'
      );
      expect(inferErrorType('Build failed: syntax error')).toBe('compilation_error');
      expect(inferErrorType('Type error: Property foo does not exist')).toBe('compilation_error');
    });

    it('should identify test failures', () => {
      expect(inferErrorType('Tests failed with exit code 1')).toBe('test_failure');
      expect(inferErrorType('Test spec failed: assertion error')).toBe('test_failure');
      expect(inferErrorType('Vitest error: test failed')).toBe('test_failure');
      expect(inferErrorType('Assertion failed: expected true to be false')).toBe('test_failure');
    });

    it('should identify state corruption errors', () => {
      expect(inferErrorType('State file corrupted: invalid JSON')).toBe('state_corruption');
      expect(inferErrorType('Parse error: unexpected token')).toBe('state_corruption');
      expect(inferErrorType('Invalid state: missing required field')).toBe('state_corruption');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(inferErrorType('Unexpected error: something went wrong')).toBe('unknown');
      expect(inferErrorType('Generic error')).toBe('unknown');
    });
  });

  describe('formatErrorWithSuggestions', () => {
    it('should format model failure errors with suggestions', () => {
      const errorMessage = 'Rate limit exceeded: too many requests';
      const context: Partial<ErrorContext> = {
        errorType: 'model_failure',
        phase: 'Ignition',
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain('Error: Rate limit exceeded: too many requests');
      expect(plainResult).toContain('Suggestions:');
      expect(plainResult).toContain('Check your API key is configured correctly');
      expect(plainResult).toContain('Verify you have not exceeded API rate limits');
      expect(plainResult).toContain('Phase: Ignition');
    });

    it('should format compilation errors with file path', () => {
      const errorMessage = 'TypeScript error: Type string is not assignable to number';
      const context: Partial<ErrorContext> = {
        errorType: 'compilation_error',
        details: {
          filePath: 'src/main.ts',
          lineNumber: '42',
          recoverable: true,
        },
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain(
        'Error: TypeScript error: Type string is not assignable to number'
      );
      expect(plainResult).toContain('File: src/main.ts');
      expect(plainResult).toContain(':42');
      expect(plainResult).toContain('Suggestions:');
      expect(plainResult).toContain('Review the file and line number in the error message');
      expect(plainResult).toContain('Fix syntax or type errors in the indicated file');
    });

    it('should format test failures with test name', () => {
      const errorMessage = 'Test failed: expected true to be false';
      const context: Partial<ErrorContext> = {
        errorType: 'test_failure',
        details: {
          testName: 'should validate input',
          recoverable: true,
        },
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain('Error: Test failed: expected true to be false');
      expect(plainResult).toContain('Test: should validate input');
      expect(plainResult).toContain('Suggestions:');
      expect(plainResult).toContain('Identify which test(s) failed from the output');
      expect(plainResult).toContain('Run the specific failing test with verbose output');
    });

    it('should format state corruption errors with recovery options', () => {
      const errorMessage = 'State file corrupted: invalid JSON structure';
      const context: Partial<ErrorContext> = {
        errorType: 'state_corruption',
        details: {
          recoverable: false,
        },
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain('Error: State file corrupted: invalid JSON structure');
      expect(plainResult).toContain('Suggestions:');
      expect(plainResult).toContain('Check if a backup archive exists');
      expect(plainResult).toContain('Restore from a recent backup if available');
      expect(plainResult).toContain('Reset protocol state to initial checkpoint');
    });

    it('should handle unknown error types', () => {
      const errorMessage = 'Unexpected error: something went wrong';
      const context: Partial<ErrorContext> = {
        errorType: 'unknown',
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain('Error: Unexpected error: something went wrong');
      expect(plainResult).toContain('Suggestions:');
      expect(plainResult).toContain('Check the error logs for detailed information');
      expect(plainResult).toContain('Review recent protocol activity');
      expect(plainResult).toContain('Run verbose mode for more debugging output');
    });

    it('should include retry time for rate limit errors', () => {
      const errorMessage = 'Rate limit exceeded';
      const context: Partial<ErrorContext> = {
        errorType: 'model_failure',
        details: {
          retryAfterMs: 60000,
        },
      };

      const result = formatErrorWithSuggestions(errorMessage, context, displayOptions);
      const plainResult = stripAnsi(result);

      expect(plainResult).toContain('Wait: 60s before retrying');
    });

    it('should disable colors when colors option is false', () => {
      const errorMessage = 'Model call failed';
      const context: Partial<ErrorContext> = {
        errorType: 'model_failure',
      };

      const result = formatErrorWithSuggestions(errorMessage, context, {
        colors: false,
        unicode: false,
      });

      expect(result).not.toContain('\x1b[');
    });
  });

  describe('displayErrorWithSuggestions', () => {
    it('should output formatted error to console', () => {
      const errorMessage = 'Test failed';
      const context: Partial<ErrorContext> = {
        errorType: 'test_failure',
      };

      const consoleErrorSpy = vi.spyOn(console, 'error');

      displayErrorWithSuggestions(errorMessage, context, displayOptions);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Suggestions:'));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('isErrorRecoverable', () => {
    it('should return true for recoverable error types', () => {
      expect(isErrorRecoverable('model_failure')).toBe(true);
      expect(isErrorRecoverable('compilation_error')).toBe(true);
      expect(isErrorRecoverable('test_failure')).toBe(true);
    });

    it('should return false for non-recoverable error types', () => {
      expect(isErrorRecoverable('state_corruption')).toBe(false);
      expect(isErrorRecoverable('unknown')).toBe(false);
    });

    it('should handle all error types', () => {
      const errorTypes: ErrorType[] = [
        'model_failure',
        'compilation_error',
        'test_failure',
        'state_corruption',
        'unknown',
      ];

      for (const errorType of errorTypes) {
        const result = isErrorRecoverable(errorType);
        expect(typeof result).toBe('boolean');
      }
    });
  });

  describe('integration example', () => {
    it('should match the example format from acceptance criteria', () => {
      const errorMessage = 'Model rate limit exceeded';
      const result = formatErrorWithSuggestions(errorMessage, {}, plainOptions);

      expect(result).toContain('Error: Model rate limit exceeded');
      expect(result).toContain('Suggestions:');
      expect(result).toMatch(/\d+\./);
      expect(result).toContain('Check your API key is configured correctly');
    });
  });
});
