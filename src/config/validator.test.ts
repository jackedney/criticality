import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ConfigValidationError,
  isRecognizedModel,
  RECOGNIZED_MODELS,
  validateConfig,
  assertConfigValid,
  type PathChecker,
  type PathCheckResult,
} from './validator.js';
import { DEFAULT_CONFIG, parseConfig } from './index.js';

describe('Config Validator', () => {
  describe('validateConfig', () => {
    describe('model name validation', () => {
      it('should pass validation for config with valid model names', () => {
        // Using default config which has valid model names
        const result = validateConfig(DEFAULT_CONFIG);
        const modelErrors = result.errors.filter((e) => e.field.startsWith('models.'));
        expect(modelErrors).toHaveLength(0);
      });

      it('should pass validation for claude-3-opus model name', () => {
        const toml = `
[models]
architect_model = "claude-3-opus"
auditor_model = "claude-3-opus"
structurer_model = "claude-3-opus"
worker_model = "claude-3-opus"
fallback_model = "claude-3-opus"
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);
        const modelErrors = result.errors.filter((e) => e.field.startsWith('models.'));
        expect(modelErrors).toHaveLength(0);
      });

      it('should return validation error for unknown model name gpt-99', () => {
        const toml = `
[models]
worker_model = "gpt-99"
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const workerError = result.errors.find((e) => e.field === 'models.worker_model');
        expect(workerError).toBeDefined();
        expect(workerError?.value).toBe('gpt-99');
        expect(workerError?.message).toContain('Unknown model name');
        expect(workerError?.message).toContain('gpt-99');
      });

      it('should return errors for multiple unknown model names', () => {
        const toml = `
[models]
architect_model = "unknown-1"
auditor_model = "unknown-2"
structurer_model = "unknown-3"
worker_model = "unknown-4"
fallback_model = "unknown-5"
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const modelErrors = result.errors.filter((e) => e.field.startsWith('models.'));
        expect(modelErrors).toHaveLength(5);
      });

      it('should allow unrecognized models when option is set', () => {
        const toml = `
[models]
worker_model = "custom-internal-model"
`;
        const config = parseConfig(toml);
        const result = validateConfig(config, { allowUnrecognizedModels: true });

        const modelErrors = result.errors.filter((e) => e.field.startsWith('models.'));
        expect(modelErrors).toHaveLength(0);
      });

      it('should validate all recognized models pass', () => {
        for (const model of RECOGNIZED_MODELS) {
          const toml = `
[models]
worker_model = "${model}"
`;
          const config = parseConfig(toml);
          const result = validateConfig(config);
          const workerError = result.errors.find((e) => e.field === 'models.worker_model');
          expect(workerError).toBeUndefined();
        }
      });
    });

    describe('threshold validation', () => {
      it('should pass validation for valid thresholds', () => {
        const result = validateConfig(DEFAULT_CONFIG);
        const thresholdErrors = result.errors.filter((e) => e.field.startsWith('thresholds.'));
        expect(thresholdErrors).toHaveLength(0);
      });

      it('should return range error for threshold > 1.0', () => {
        const toml = `
[thresholds]
performance_variance_threshold = 1.5
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const thresholdError = result.errors.find(
          (e) => e.field === 'thresholds.performance_variance_threshold'
        );
        expect(thresholdError).toBeDefined();
        expect(thresholdError?.value).toBe(1.5);
        expect(thresholdError?.message).toContain('between');
        expect(thresholdError?.message).toContain('0');
        expect(thresholdError?.message).toContain('1');
      });

      it('should return error for threshold <= 0', () => {
        const toml = `
[thresholds]
performance_variance_threshold = 0
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const thresholdError = result.errors.find(
          (e) =>
            e.field === 'thresholds.performance_variance_threshold' &&
            e.message.includes('greater than 0')
        );
        expect(thresholdError).toBeDefined();
      });

      it('should return error for negative threshold', () => {
        const toml = `
[thresholds]
performance_variance_threshold = -0.5
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const thresholdErrors = result.errors.filter(
          (e) => e.field === 'thresholds.performance_variance_threshold'
        );
        expect(thresholdErrors.length).toBeGreaterThan(0);
      });

      it('should return error for non-integer retry attempts', () => {
        const toml = `
[thresholds]
max_retry_attempts = 3.5
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const retryError = result.errors.find((e) => e.field === 'thresholds.max_retry_attempts');
        expect(retryError).toBeDefined();
        expect(retryError?.message).toContain('positive integer');
      });

      it('should return error for zero retry attempts', () => {
        const toml = `
[thresholds]
max_retry_attempts = 0
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const retryError = result.errors.find((e) => e.field === 'thresholds.max_retry_attempts');
        expect(retryError).toBeDefined();
      });

      it('should return error for excessively large context_token_upgrade', () => {
        const toml = `
[thresholds]
context_token_upgrade = 2000000
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const tokenError = result.errors.find(
          (e) => e.field === 'thresholds.context_token_upgrade'
        );
        expect(tokenError).toBeDefined();
        expect(tokenError?.message).toContain('exceeds reasonable maximum');
      });

      it('should return error for excessively large retry delay', () => {
        const toml = `
[thresholds]
retry_base_delay_ms = 7200000
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        const delayError = result.errors.find((e) => e.field === 'thresholds.retry_base_delay_ms');
        expect(delayError).toBeDefined();
        expect(delayError?.message).toContain('exceeds reasonable maximum');
      });

      it('should pass validation for threshold at exactly 1.0', () => {
        const toml = `
[thresholds]
performance_variance_threshold = 1.0
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        const thresholdError = result.errors.find(
          (e) =>
            e.field === 'thresholds.performance_variance_threshold' && e.message.includes('between')
        );
        expect(thresholdError).toBeUndefined();
      });

      it('should pass validation for small positive threshold', () => {
        const toml = `
[thresholds]
performance_variance_threshold = 0.001
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        const thresholdError = result.errors.find(
          (e) => e.field === 'thresholds.performance_variance_threshold'
        );
        expect(thresholdError).toBeUndefined();
      });
    });

    describe('path validation', () => {
      it('should not check paths by default', () => {
        const toml = `
[paths]
specs = "nonexistent/specs"
archive = "nonexistent/archive"
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        const pathErrors = result.errors.filter((e) => e.field.startsWith('paths.'));
        expect(pathErrors).toHaveLength(0);
      });

      it('should validate paths exist when pathChecker is provided', () => {
        const toml = `
[paths]
specs = "nonexistent/specs"
`;
        const config = parseConfig(toml);

        // Mock path checker that says nothing exists
        const pathChecker: PathChecker = (): PathCheckResult => ({
          exists: false,
          errorMessage: 'Path does not exist',
        });

        const result = validateConfig(config, { pathChecker });

        expect(result.valid).toBe(false);
        const specsError = result.errors.find((e) => e.field === 'paths.specs');
        expect(specsError).toBeDefined();
        expect(specsError?.message).toContain('does not exist');
      });

      it('should pass validation when paths exist', () => {
        // Mock path checker that says everything exists as expected
        const pathChecker: PathChecker = (_path, isDirectory): PathCheckResult => ({
          exists: true,
          isDirectory,
        });

        const config = parseConfig('');
        const result = validateConfig(config, { pathChecker });

        const pathErrors = result.errors.filter((e) => e.field.startsWith('paths.'));
        expect(pathErrors).toHaveLength(0);
      });

      it('should return error when path is file instead of directory', () => {
        const toml = `
[paths]
specs = "some/file.txt"
`;
        const config = parseConfig(toml);

        // Mock path checker that says it's a file, not a directory
        const pathChecker: PathChecker = (): PathCheckResult => ({
          exists: true,
          isDirectory: false,
        });

        const result = validateConfig(config, { pathChecker });

        const specsError = result.errors.find((e) => e.field === 'paths.specs');
        expect(specsError).toBeDefined();
        expect(specsError?.message).toContain('not a directory');
      });

      it('should use custom error message from pathChecker', () => {
        const toml = `
[paths]
specs = "nonexistent/specs"
`;
        const config = parseConfig(toml);

        const pathChecker: PathChecker = (): PathCheckResult => ({
          exists: false,
          errorMessage: 'Custom error: cannot access this path',
        });

        const result = validateConfig(config, { pathChecker });

        const specsError = result.errors.find((e) => e.field === 'paths.specs');
        expect(specsError).toBeDefined();
        expect(specsError?.message).toContain('Custom error');
      });
    });

    describe('combined validation', () => {
      it('should return all errors for config with multiple issues', () => {
        const toml = `
[models]
worker_model = "unknown-model"
fallback_model = "another-unknown"

[thresholds]
performance_variance_threshold = 2.0
max_retry_attempts = 0
`;
        const config = parseConfig(toml);
        const result = validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(4);

        // Check for model errors
        const modelErrors = result.errors.filter((e) => e.field.startsWith('models.'));
        expect(modelErrors.length).toBeGreaterThanOrEqual(2);

        // Check for threshold errors
        const thresholdErrors = result.errors.filter((e) => e.field.startsWith('thresholds.'));
        expect(thresholdErrors.length).toBeGreaterThanOrEqual(2);
      });

      it('should return valid for completely valid config', () => {
        const result = validateConfig(DEFAULT_CONFIG);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('assertConfigValid', () => {
    it('should not throw for valid config', () => {
      expect(() => {
        assertConfigValid(DEFAULT_CONFIG);
      }).not.toThrow();
    });

    it('should throw ConfigValidationError for invalid config', () => {
      const toml = `
[models]
worker_model = "unknown-model"
`;
      const config = parseConfig(toml);

      expect(() => {
        assertConfigValid(config);
      }).toThrow(ConfigValidationError);
    });

    it('should include all errors in thrown exception', () => {
      const toml = `
[models]
worker_model = "unknown-1"
fallback_model = "unknown-2"
`;
      const config = parseConfig(toml);

      try {
        assertConfigValid(config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        const validationError = error as ConfigValidationError;
        expect(validationError.errors.length).toBeGreaterThanOrEqual(2);
        expect(validationError.message).toContain('error(s)');
      }
    });

    it('should format error message with field details', () => {
      const toml = `
[models]
worker_model = "gpt-99"
`;
      const config = parseConfig(toml);

      try {
        assertConfigValid(config);
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ConfigValidationError;
        expect(validationError.message).toContain('models.worker_model');
        expect(validationError.message).toContain('Unknown model name');
      }
    });
  });

  describe('isRecognizedModel', () => {
    it('should return true for claude-3-opus', () => {
      expect(isRecognizedModel('claude-3-opus')).toBe(true);
    });

    it('should return false for gpt-99', () => {
      expect(isRecognizedModel('gpt-99')).toBe(false);
    });

    it('should return true for all models in RECOGNIZED_MODELS', () => {
      for (const model of RECOGNIZED_MODELS) {
        expect(isRecognizedModel(model)).toBe(true);
      }
    });

    it('should return false for empty string', () => {
      expect(isRecognizedModel('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isRecognizedModel('Claude-3-Opus')).toBe(false);
      expect(isRecognizedModel('CLAUDE-3-OPUS')).toBe(false);
    });
  });

  describe('RECOGNIZED_MODELS', () => {
    it('should contain Claude models', () => {
      expect(RECOGNIZED_MODELS.has('claude-opus-4.5')).toBe(true);
      expect(RECOGNIZED_MODELS.has('claude-sonnet-4.5')).toBe(true);
      expect(RECOGNIZED_MODELS.has('claude-3-opus')).toBe(true);
    });

    it('should contain Kimi models', () => {
      expect(RECOGNIZED_MODELS.has('kimi-k2')).toBe(true);
    });

    it('should contain MiniMax models', () => {
      expect(RECOGNIZED_MODELS.has('minimax-m2')).toBe(true);
    });

    it('should be immutable (ReadonlySet)', () => {
      // TypeScript enforces this at compile time
      // This test documents the expectation
      expect(RECOGNIZED_MODELS).toBeInstanceOf(Set);
    });
  });

  describe('ValidationError interface', () => {
    it('should have expected structure', () => {
      const toml = `
[models]
worker_model = "unknown-model"
`;
      const config = parseConfig(toml);
      const result = validateConfig(config);

      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors[0];

      expect(error).toHaveProperty('field');
      expect(error).toHaveProperty('value');
      expect(error).toHaveProperty('message');
      expect(typeof error?.field).toBe('string');
      expect(typeof error?.message).toBe('string');
    });
  });

  describe('property-based tests', () => {
    it('should always return valid result for default config', () => {
      fc.assert(
        fc.property(fc.constant(DEFAULT_CONFIG), (config) => {
          const result = validateConfig(config);
          return result.valid && result.errors.length === 0;
        }),
        { numRuns: 10 }
      );
    });

    it('should reject any model name not in RECOGNIZED_MODELS', () => {
      // Generate strings that are definitely not in RECOGNIZED_MODELS
      // Filter out TOML special characters that would cause parse errors
      const isValidTomlString = (s: string): boolean =>
        s.length > 0 &&
        !s.includes('"') &&
        !s.includes('\\') &&
        !s.includes('\n') &&
        !s.includes('\r') &&
        !s.includes('\t') &&
        !RECOGNIZED_MODELS.has(s);

      const invalidModelArb = fc.string({ minLength: 1, maxLength: 50 }).filter(isValidTomlString);

      fc.assert(
        fc.property(invalidModelArb, (invalidModel) => {
          const toml = `
[models]
worker_model = "${invalidModel}"
`;
          const config = parseConfig(toml);
          const result = validateConfig(config);

          const hasWorkerError = result.errors.some(
            (e) => e.field === 'models.worker_model' && e.value === invalidModel
          );
          return hasWorkerError;
        }),
        { numRuns: 50 }
      );
    });

    it('should accept any threshold in valid range (0, 1]', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.001, max: 1.0, noNaN: true }), (threshold) => {
          const toml = `
[thresholds]
performance_variance_threshold = ${String(threshold)}
`;
          const config = parseConfig(toml);
          const result = validateConfig(config);

          // Check no range errors for this threshold
          const rangeError = result.errors.find(
            (e) =>
              e.field === 'thresholds.performance_variance_threshold' &&
              (e.message.includes('between') || e.message.includes('greater than 0'))
          );
          return rangeError === undefined;
        }),
        { numRuns: 100 }
      );
    });

    it('should reject any threshold > 1.0', () => {
      fc.assert(
        fc.property(fc.double({ min: 1.01, max: 100, noNaN: true }), (threshold) => {
          const toml = `
[thresholds]
performance_variance_threshold = ${String(threshold)}
`;
          const config = parseConfig(toml);
          const result = validateConfig(config);

          const rangeError = result.errors.find(
            (e) =>
              e.field === 'thresholds.performance_variance_threshold' &&
              e.message.includes('between')
          );
          return rangeError !== undefined;
        }),
        { numRuns: 50 }
      );
    });

    it('should accept any positive integer for retry attempts up to 100', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (retryAttempts) => {
          const toml = `
[thresholds]
max_retry_attempts = ${String(retryAttempts)}
`;
          const config = parseConfig(toml);
          const result = validateConfig(config);

          const retryError = result.errors.find((e) => e.field === 'thresholds.max_retry_attempts');
          return retryError === undefined;
        }),
        { numRuns: 50 }
      );
    });
  });
});
