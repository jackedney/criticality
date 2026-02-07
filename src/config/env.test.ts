import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EnvCoercionError,
  readEnvOverrides,
  applyEnvOverrides,
  getEnvVarDocumentation,
} from './env.js';
import { DEFAULT_CONFIG, parseConfig } from './index.js';

describe('Environment Variable Overrides', () => {
  describe('readEnvOverrides', () => {
    describe('CRITICALITY_* env vars override corresponding config values', () => {
      it('should read CRITICALITY_MODEL and map to worker_model', () => {
        const env = { CRITICALITY_MODEL: 'claude-3-opus' };
        const result = readEnvOverrides(env);

        expect(result.overrides.models?.worker_model).toBe('claude-3-opus');
        expect(result.appliedVars).toContain('CRITICALITY_MODEL');
      });

      it('should read all model env vars', () => {
        const env = {
          CRITICALITY_ARCHITECT_MODEL: 'model-a',
          CRITICALITY_AUDITOR_MODEL: 'model-b',
          CRITICALITY_STRUCTURER_MODEL: 'model-c',
          CRITICALITY_WORKER_MODEL: 'model-d',
          CRITICALITY_FALLBACK_MODEL: 'model-e',
        };
        const result = readEnvOverrides(env);

        expect(result.overrides.models?.architect_model).toBe('model-a');
        expect(result.overrides.models?.auditor_model).toBe('model-b');
        expect(result.overrides.models?.structurer_model).toBe('model-c');
        expect(result.overrides.models?.worker_model).toBe('model-d');
        expect(result.overrides.models?.fallback_model).toBe('model-e');
      });

      it('should read path env vars', () => {
        const env = {
          CRITICALITY_PATHS_SPECS: '/custom/specs',
          CRITICALITY_PATHS_ARCHIVE: '/custom/archive',
          CRITICALITY_PATHS_STATE: '/custom/state.json',
          CRITICALITY_PATHS_LOGS: '/custom/logs',
          CRITICALITY_PATHS_LEDGER: '/custom/ledger',
        };
        const result = readEnvOverrides(env);

        expect(result.overrides.paths?.specs).toBe('/custom/specs');
        expect(result.overrides.paths?.archive).toBe('/custom/archive');
        expect(result.overrides.paths?.state).toBe('/custom/state.json');
        expect(result.overrides.paths?.logs).toBe('/custom/logs');
        expect(result.overrides.paths?.ledger).toBe('/custom/ledger');
      });

      it('should read threshold env vars with number coercion', () => {
        const env = {
          CRITICALITY_THRESHOLDS_CONTEXT_TOKEN_UPGRADE: '15000',
          CRITICALITY_THRESHOLDS_SIGNATURE_COMPLEXITY_UPGRADE: '7',
          CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS: '5',
          CRITICALITY_THRESHOLDS_RETRY_BASE_DELAY_MS: '2000',
          CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD: '0.3',
        };
        const result = readEnvOverrides(env);

        expect(result.overrides.thresholds?.context_token_upgrade).toBe(15000);
        expect(result.overrides.thresholds?.signature_complexity_upgrade).toBe(7);
        expect(result.overrides.thresholds?.max_retry_attempts).toBe(5);
        expect(result.overrides.thresholds?.retry_base_delay_ms).toBe(2000);
        expect(result.overrides.thresholds?.performance_variance_threshold).toBe(0.3);
      });

      it('should read notification env vars with boolean coercion', () => {
        const env = {
          CRITICALITY_NOTIFICATIONS_ENABLED: 'true',
          CRITICALITY_NOTIFICATIONS_CHANNEL: 'slack',
          CRITICALITY_NOTIFICATIONS_ENDPOINT: 'https://hooks.example.com',
        };
        const result = readEnvOverrides(env);

        expect(result.overrides.notifications?.enabled).toBe(true);
        expect(result.overrides.notifications?.channel).toBe('slack');
        expect(result.overrides.notifications?.endpoint).toBe('https://hooks.example.com');
      });

      it('should ignore unset env vars', () => {
        const env = { CRITICALITY_MODEL: 'test-model' };
        const result = readEnvOverrides(env);

        expect(result.overrides.paths).toBeUndefined();
        expect(result.appliedVars).toEqual(['CRITICALITY_MODEL']);
      });

      it('should ignore empty string env vars', () => {
        const env = { CRITICALITY_MODEL: '', CRITICALITY_WORKER_MODEL: 'test' };
        const result = readEnvOverrides(env);

        expect(result.overrides.models?.worker_model).toBe('test');
        expect(result.appliedVars).toEqual(['CRITICALITY_WORKER_MODEL']);
      });
    });

    describe('type coercion works correctly', () => {
      describe('string env var to number', () => {
        it('should coerce CRITICALITY_THRESHOLD=0.8 to number 0.8', () => {
          const env = { CRITICALITY_THRESHOLD: '0.8' };
          const result = readEnvOverrides(env);

          expect(result.overrides.thresholds?.performance_variance_threshold).toBe(0.8);
          expect(typeof result.overrides.thresholds?.performance_variance_threshold).toBe('number');
        });

        it('should coerce integer strings correctly', () => {
          const env = { CRITICALITY_MAX_RETRIES: '10' };
          const result = readEnvOverrides(env);

          expect(result.overrides.thresholds?.max_retry_attempts).toBe(10);
        });

        it('should coerce negative numbers', () => {
          const env = { CRITICALITY_THRESHOLDS_CONTEXT_TOKEN_UPGRADE: '-100' };
          const result = readEnvOverrides(env);

          // Note: validation will catch this, coercion just converts the type
          expect(result.overrides.thresholds?.context_token_upgrade).toBe(-100);
        });

        it('should handle whitespace in number strings', () => {
          const env = { CRITICALITY_THRESHOLD: '  0.5  ' };
          const result = readEnvOverrides(env);

          expect(result.overrides.thresholds?.performance_variance_threshold).toBe(0.5);
        });
      });

      describe('string env var to boolean', () => {
        const truthy = ['true', 'True', 'TRUE', '1', 'yes', 'Yes', 'YES', 'on', 'On', 'ON'];
        const falsy = ['false', 'False', 'FALSE', '0', 'no', 'No', 'NO', 'off', 'Off', 'OFF'];

        for (const val of truthy) {
          it(`should coerce '${val}' to true`, () => {
            const env = { CRITICALITY_NOTIFICATIONS_ENABLED: val };
            const result = readEnvOverrides(env);

            expect(result.overrides.notifications?.enabled).toBe(true);
          });
        }

        for (const val of falsy) {
          it(`should coerce '${val}' to false`, () => {
            const env = { CRITICALITY_NOTIFICATIONS_ENABLED: val };
            const result = readEnvOverrides(env);

            expect(result.overrides.notifications?.enabled).toBe(false);
          });
        }

        it('should handle whitespace in boolean strings', () => {
          const env = { CRITICALITY_NOTIFICATIONS_ENABLED: '  true  ' };
          const result = readEnvOverrides(env);

          expect(result.overrides.notifications?.enabled).toBe(true);
        });
      });
    });

    describe('invalid env var value returns coercion error', () => {
      it('should throw EnvCoercionError for non-numeric threshold', () => {
        const env = { CRITICALITY_THRESHOLD: 'high' };

        expect(() => readEnvOverrides(env)).toThrow(EnvCoercionError);

        try {
          readEnvOverrides(env);
        } catch (error) {
          expect(error).toBeInstanceOf(EnvCoercionError);
          const coercionError = error as EnvCoercionError;
          expect(coercionError.envVar).toBe('CRITICALITY_THRESHOLD');
          expect(coercionError.rawValue).toBe('high');
          expect(coercionError.expectedType).toBe('number');
        }
      });

      it('should throw EnvCoercionError for empty numeric value', () => {
        // Note: empty string is ignored, so we need a whitespace-only value
        const env = { CRITICALITY_THRESHOLD: '   ' };

        expect(() => readEnvOverrides(env)).toThrow(EnvCoercionError);
      });

      it('should throw EnvCoercionError for invalid boolean', () => {
        const env = { CRITICALITY_NOTIFICATIONS_ENABLED: 'maybe' };

        expect(() => readEnvOverrides(env)).toThrow(EnvCoercionError);

        try {
          readEnvOverrides(env);
        } catch (error) {
          const coercionError = error as EnvCoercionError;
          expect(coercionError.envVar).toBe('CRITICALITY_NOTIFICATIONS_ENABLED');
          expect(coercionError.rawValue).toBe('maybe');
          expect(coercionError.expectedType).toBe('boolean');
        }
      });

      it('should collect errors when collectErrors option is true', () => {
        const env = {
          CRITICALITY_THRESHOLD: 'invalid',
          CRITICALITY_NOTIFICATIONS_ENABLED: 'maybe',
        };

        const result = readEnvOverrides(env, { collectErrors: true });

        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]?.envVar).toBe('CRITICALITY_THRESHOLD');
        expect(result.errors[1]?.envVar).toBe('CRITICALITY_NOTIFICATIONS_ENABLED');
      });
    });

    describe('shortcut env vars', () => {
      it('should support CRITICALITY_MODEL shortcut for worker_model', () => {
        const env = { CRITICALITY_MODEL: 'claude-3-opus' };
        const result = readEnvOverrides(env);

        expect(result.overrides.models?.worker_model).toBe('claude-3-opus');
      });

      it('should support CRITICALITY_THRESHOLD shortcut for performance_variance_threshold', () => {
        const env = { CRITICALITY_THRESHOLD: '0.5' };
        const result = readEnvOverrides(env);

        expect(result.overrides.thresholds?.performance_variance_threshold).toBe(0.5);
      });

      it('should support CRITICALITY_MAX_RETRIES shortcut for max_retry_attempts', () => {
        const env = { CRITICALITY_MAX_RETRIES: '5' };
        const result = readEnvOverrides(env);

        expect(result.overrides.thresholds?.max_retry_attempts).toBe(5);
      });
    });
  });

  describe('applyEnvOverrides', () => {
    it('should merge env overrides with config', async () => {
      const config = await parseConfig('');
      const env = { CRITICALITY_MODEL: 'claude-3-opus' };

      const result = applyEnvOverrides(config, env);

      expect(result.models.worker_model).toBe('claude-3-opus');
      // Other values should remain from config/defaults
      expect(result.models.architect_model).toBe(DEFAULT_CONFIG.models.architect_model);
    });

    it('should demonstrate override precedence: env > config file', async () => {
      const toml = `
[models]
worker_model = "config-file-model"
`;
      const config = await parseConfig(toml);
      const env = { CRITICALITY_WORKER_MODEL: 'env-override-model' };

      const result = applyEnvOverrides(config, env);

      // Env var should win
      expect(result.models.worker_model).toBe('env-override-model');
    });

    it('should preserve config values not overridden by env', async () => {
      const toml = `
[models]
architect_model = "custom-architect"
worker_model = "custom-worker"

[thresholds]
max_retry_attempts = 10
`;
      const config = await parseConfig(toml);
      const env = { CRITICALITY_WORKER_MODEL: 'env-worker' };

      const result = applyEnvOverrides(config, env);

      expect(result.models.worker_model).toBe('env-worker');
      expect(result.models.architect_model).toBe('custom-architect');
      expect(result.thresholds.max_retry_attempts).toBe(10);
    });

    it('should apply multiple env overrides', () => {
      const config = DEFAULT_CONFIG;
      const env = {
        CRITICALITY_MODEL: 'new-model',
        CRITICALITY_THRESHOLD: '0.9',
        CRITICALITY_NOTIFICATIONS_ENABLED: 'true',
      };

      const result = applyEnvOverrides(config, env);

      expect(result.models.worker_model).toBe('new-model');
      expect(result.thresholds.performance_variance_threshold).toBe(0.9);
      expect(result.notifications.enabled).toBe(true);
    });
  });

  describe('EnvCoercionError', () => {
    it('should have correct error name', () => {
      const error = new EnvCoercionError('TEST_VAR', 'value', 'number');
      expect(error.name).toBe('EnvCoercionError');
    });

    it('should include env var info in message', () => {
      const error = new EnvCoercionError('TEST_VAR', 'invalid', 'number');
      expect(error.message).toContain('TEST_VAR');
      expect(error.message).toContain('invalid');
      expect(error.message).toContain('number');
    });

    it('should store envVar, rawValue, and expectedType', () => {
      const error = new EnvCoercionError('MY_VAR', 'my_value', 'boolean');
      expect(error.envVar).toBe('MY_VAR');
      expect(error.rawValue).toBe('my_value');
      expect(error.expectedType).toBe('boolean');
    });

    it('should use custom message when provided', () => {
      const error = new EnvCoercionError('MY_VAR', 'val', 'number', 'Custom error message');
      expect(error.message).toBe('Custom error message');
    });
  });

  describe('getEnvVarDocumentation', () => {
    it('should return documentation for all supported env vars', () => {
      const docs = getEnvVarDocumentation();

      expect(docs.CRITICALITY_MODEL).toBeDefined();
      expect(docs.CRITICALITY_MODEL?.description).toContain('worker model');
      expect(docs.CRITICALITY_MODEL?.type).toBe('string');

      expect(docs.CRITICALITY_THRESHOLD).toBeDefined();
      expect(docs.CRITICALITY_THRESHOLD?.type).toBe('number');

      expect(docs.CRITICALITY_NOTIFICATIONS_ENABLED).toBeDefined();
      expect(docs.CRITICALITY_NOTIFICATIONS_ENABLED?.type).toBe('boolean');
    });

    it('should document all model env vars', () => {
      const docs = getEnvVarDocumentation();

      expect(docs.CRITICALITY_ARCHITECT_MODEL).toBeDefined();
      expect(docs.CRITICALITY_AUDITOR_MODEL).toBeDefined();
      expect(docs.CRITICALITY_STRUCTURER_MODEL).toBeDefined();
      expect(docs.CRITICALITY_WORKER_MODEL).toBeDefined();
      expect(docs.CRITICALITY_FALLBACK_MODEL).toBeDefined();
    });

    it('should document all path env vars', () => {
      const docs = getEnvVarDocumentation();

      expect(docs.CRITICALITY_PATHS_SPECS).toBeDefined();
      expect(docs.CRITICALITY_PATHS_ARCHIVE).toBeDefined();
      expect(docs.CRITICALITY_PATHS_STATE).toBeDefined();
      expect(docs.CRITICALITY_PATHS_LOGS).toBeDefined();
      expect(docs.CRITICALITY_PATHS_LEDGER).toBeDefined();
    });

    it('should document all threshold env vars', () => {
      const docs = getEnvVarDocumentation();

      expect(docs.CRITICALITY_THRESHOLDS_CONTEXT_TOKEN_UPGRADE).toBeDefined();
      expect(docs.CRITICALITY_THRESHOLDS_SIGNATURE_COMPLEXITY_UPGRADE).toBeDefined();
      expect(docs.CRITICALITY_THRESHOLDS_MAX_RETRY_ATTEMPTS).toBeDefined();
      expect(docs.CRITICALITY_THRESHOLDS_RETRY_BASE_DELAY_MS).toBeDefined();
      expect(docs.CRITICALITY_THRESHOLDS_PERFORMANCE_VARIANCE_THRESHOLD).toBeDefined();
    });

    it('should document all notification env vars', () => {
      const docs = getEnvVarDocumentation();

      expect(docs.CRITICALITY_NOTIFICATIONS_ENABLED).toBeDefined();
      expect(docs.CRITICALITY_NOTIFICATIONS_CHANNEL).toBeDefined();
      expect(docs.CRITICALITY_NOTIFICATIONS_ENDPOINT).toBeDefined();
    });
  });

  describe('property-based tests', () => {
    it('should always preserve string values exactly', () => {
      // Filter out problematic characters
      const isValidEnvString = (s: string): boolean =>
        s.length > 0 && !s.includes('\0') && !s.includes('\n') && !s.includes('\r');

      fc.assert(
        fc.property(fc.string().filter(isValidEnvString), (modelName) => {
          const env = { CRITICALITY_MODEL: modelName };
          const result = readEnvOverrides(env);
          return result.overrides.models?.worker_model === modelName;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly coerce any valid number string', () => {
      fc.assert(
        fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (num) => {
          const env = { CRITICALITY_THRESHOLD: String(num) };
          const result = readEnvOverrides(env);
          // Allow small floating point differences
          const coerced = result.overrides.thresholds?.performance_variance_threshold;
          return coerced !== undefined && Math.abs(coerced - num) < 0.0001;
        }),
        { numRuns: 100 }
      );
    });

    it('should apply env overrides without losing other config values', () => {
      fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (modelName) => {
          const config = await parseConfig('');
          const env = { CRITICALITY_MODEL: modelName };
          const result = applyEnvOverrides(config, env);

          // Worker model should be overridden
          const workerMatch = result.models.worker_model === modelName;
          // Other values should be preserved
          const architectPreserved =
            result.models.architect_model === DEFAULT_CONFIG.models.architect_model;
          const pathsPreserved = result.paths.specs === DEFAULT_CONFIG.paths.specs;

          return workerMatch && architectPreserved && pathsPreserved;
        }),
        { numRuns: 50 }
      );
    });
  });
});
