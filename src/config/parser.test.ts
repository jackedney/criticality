import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ConfigParseError, DEFAULT_CONFIG, getDefaultConfig, parseConfig } from './index.js';

describe('Config Parser', () => {
  describe('parseConfig', () => {
    describe('valid TOML parsing', () => {
      it('should parse empty TOML to default config', () => {
        const config = parseConfig('');
        expect(config).toEqual(DEFAULT_CONFIG);
      });

      it('should parse complete valid configuration', () => {
        const toml = `
[models]
architect_model = "custom-architect"
auditor_model = "custom-auditor"
structurer_model = "custom-structurer"
worker_model = "custom-worker"
fallback_model = "custom-fallback"

[paths]
specs = "custom/specs"
archive = "custom/archive"
state = "custom/state.json"
logs = "custom/logs"
ledger = "custom/ledger"

[thresholds]
context_token_upgrade = 15000
signature_complexity_upgrade = 7
max_retry_attempts = 5
retry_base_delay_ms = 2000
performance_variance_threshold = 0.3

[notifications]
enabled = true
channel = "slack"
endpoint = "https://hooks.slack.com/test"

[mass_defect.targets]
max_cyclomatic_complexity = 8
max_function_length_lines = 40
max_nesting_depth = 3
min_test_coverage = 0.9

[mass_defect]
catalog_path = "./custom-catalog"
`;
        const config = parseConfig(toml);

        expect(config.models.architect_model).toBe('custom-architect');
        expect(config.models.auditor_model).toBe('custom-auditor');
        expect(config.models.structurer_model).toBe('custom-structurer');
        expect(config.models.worker_model).toBe('custom-worker');
        expect(config.models.fallback_model).toBe('custom-fallback');

        expect(config.paths.specs).toBe('custom/specs');
        expect(config.paths.archive).toBe('custom/archive');
        expect(config.paths.state).toBe('custom/state.json');
        expect(config.paths.logs).toBe('custom/logs');
        expect(config.paths.ledger).toBe('custom/ledger');

        expect(config.thresholds.context_token_upgrade).toBe(15000);
        expect(config.thresholds.signature_complexity_upgrade).toBe(7);
        expect(config.thresholds.max_retry_attempts).toBe(5);
        expect(config.thresholds.retry_base_delay_ms).toBe(2000);
        expect(config.thresholds.performance_variance_threshold).toBe(0.3);

        expect(config.notifications.enabled).toBe(true);
        expect(config.notifications.channel).toBe('slack');
        expect(config.notifications.endpoint).toBe('https://hooks.slack.com/test');

        expect(config.mass_defect.targets.max_cyclomatic_complexity).toBe(8);
        expect(config.mass_defect.targets.max_function_length_lines).toBe(40);
        expect(config.mass_defect.targets.max_nesting_depth).toBe(3);
        expect(config.mass_defect.targets.min_test_coverage).toBe(0.9);
        expect(config.mass_defect.catalog_path).toBe('./custom-catalog');
      });

      it('should use default values for missing optional fields', () => {
        const toml = `
[models]
worker_model = "custom-worker"
`;
        const config = parseConfig(toml);

        expect(config.models.worker_model).toBe('custom-worker');

        expect(config.models.architect_model).toBe('claude-opus-4.5');
        expect(config.models.auditor_model).toBe('kimi-k2');
        expect(config.models.structurer_model).toBe('claude-sonnet-4.5');
        expect(config.models.fallback_model).toBe('claude-sonnet-4.5');

        expect(config.paths).toEqual(DEFAULT_CONFIG.paths);

        expect(config.thresholds).toEqual(DEFAULT_CONFIG.thresholds);

        expect(config.notifications).toEqual(DEFAULT_CONFIG.notifications);

        expect(config.mass_defect).toEqual(DEFAULT_CONFIG.mass_defect);
      });

      it('should handle partial sections correctly', () => {
        const toml = `
[thresholds]
max_retry_attempts = 10
`;
        const config = parseConfig(toml);

        expect(config.thresholds.max_retry_attempts).toBe(10);
        expect(config.thresholds.context_token_upgrade).toBe(12000);
        expect(config.thresholds.signature_complexity_upgrade).toBe(5);
      });

      it('should parse mass_defect targets section with overrides', () => {
        const toml = `
[mass_defect.targets]
max_cyclomatic_complexity = 8
`;
        const config = parseConfig(toml);

        expect(config.mass_defect.targets.max_cyclomatic_complexity).toBe(8);
        expect(config.mass_defect.targets.max_function_length_lines).toBe(50);
        expect(config.mass_defect.targets.max_nesting_depth).toBe(4);
        expect(config.mass_defect.targets.min_test_coverage).toBe(0.8);
      });

      it('should parse mass_defect catalog_path with override', () => {
        const toml = `
[mass_defect]
catalog_path = "./my-catalog"
`;
        const config = parseConfig(toml);

        expect(config.mass_defect.catalog_path).toBe('./my-catalog');
        expect(config.mass_defect.targets).toEqual(DEFAULT_CONFIG.mass_defect.targets);
      });

      it('should use default mass_defect when section omitted', () => {
        const config = parseConfig('');

        expect(config.mass_defect).toEqual(DEFAULT_CONFIG.mass_defect);
        expect(config.mass_defect.targets.max_cyclomatic_complexity).toBe(10);
        expect(config.mass_defect.targets.max_function_length_lines).toBe(50);
        expect(config.mass_defect.targets.max_nesting_depth).toBe(4);
        expect(config.mass_defect.targets.min_test_coverage).toBe(0.8);
        expect(config.mass_defect.catalog_path).toBe('./mass-defect-catalog');
      });

      it('should parse all valid notification channels', () => {
        const channels = ['slack', 'email', 'webhook'] as const;

        for (const channel of channels) {
          const toml = `
[notifications]
enabled = true
channel = "${channel}"
endpoint = "test-endpoint"
`;
          const config = parseConfig(toml);
          expect(config.notifications.channel).toBe(channel);
        }
      });

      it('should parse notifications with channels array', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
endpoint = "https://example.com/webhook1"
enabled = true
events = ["block", "complete"]

[[notifications.channels]]
type = "webhook"
endpoint = "https://example.com/webhook2"
enabled = true
events = ["error"]
`;
        const config = parseConfig(toml);

        expect(config.notifications.enabled).toBe(true);
        expect(config.notifications.channels).toBeDefined();
        const channels = config.notifications.channels;
        if (
          channels !== undefined &&
          channels.length >= 2 &&
          channels[0] !== undefined &&
          channels[1] !== undefined
        ) {
          expect(channels[0].type).toBe('webhook');
          expect(channels[0].endpoint).toBe('https://example.com/webhook1');
          expect(channels[0].enabled).toBe(true);
          expect(channels[0].events).toEqual(['block', 'complete']);
          expect(channels[1].type).toBe('webhook');
          expect(channels[1].endpoint).toBe('https://example.com/webhook2');
          expect(channels[1].enabled).toBe(true);
          expect(channels[1].events).toEqual(['error']);
        }
      });

      it('should parse notifications with reminder_schedule cron expression', () => {
        const toml = `
[notifications]
enabled = true
reminder_schedule = "0 9 * * *"
`;
        const config = parseConfig(toml);

        expect(config.notifications.enabled).toBe(true);
        expect(config.notifications.reminder_schedule).toBe('0 9 * * *');
      });

      it('should parse complete notification config with channels and reminder_schedule', () => {
        const toml = `
[notifications]
enabled = true
reminder_schedule = "0 9 * * *"

[[notifications.channels]]
type = "webhook"
endpoint = "https://hooks.example.com/webhook1"
enabled = true
events = ["block", "complete", "error"]

[[notifications.channels]]
type = "webhook"
endpoint = "https://hooks.example.com/webhook2"
enabled = true
events = ["block"]
`;
        const config = parseConfig(toml);

        expect(config.notifications.enabled).toBe(true);
        expect(config.notifications.reminder_schedule).toBe('0 9 * * *');
        expect(config.notifications.channels).toBeDefined();
        const channels = config.notifications.channels;
        if (
          channels !== undefined &&
          channels.length >= 2 &&
          channels[0] !== undefined &&
          channels[1] !== undefined
        ) {
          expect(channels[0].endpoint).toBe('https://hooks.example.com/webhook1');
          expect(channels[1].endpoint).toBe('https://hooks.example.com/webhook2');
        }
      });

      it('should use default values for optional channel fields', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
endpoint = "https://example.com/webhook"
`;
        const config = parseConfig(toml);

        expect(config.notifications.channels).toBeDefined();
        const channels = config.notifications.channels;
        if (channels !== undefined && channels.length >= 1 && channels[0] !== undefined) {
          expect(channels[0].enabled).toBe(true);
          expect(channels[0].events).toEqual(['block']);
        }
      });

      it('should handle empty channels array as undefined', () => {
        const toml = `
[notifications]
enabled = true
channels = []
`;
        const config = parseConfig(toml);

        expect(config.notifications.channels).toBeUndefined();
      });
    });

    describe('notification validation errors', () => {
      it('should error for invalid cron expression', () => {
        const toml = `
[notifications]
enabled = true
reminder_schedule = "invalid-cron"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain('not a valid cron expression');
        }
      });

      it('should error for incomplete cron expression', () => {
        const toml = `
[notifications]
enabled = true
reminder_schedule = "0 9 * *"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain('not a valid cron expression');
        }
      });

      it('should error for invalid webhook URL', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
endpoint = "not-a-valid-url"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain('not a valid URL');
        }
      });

      it('should error for webhook URL with invalid protocol', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
endpoint = "ftp://example.com/webhook"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain('http or https protocol');
        }
      });

      it('should error for missing channel type', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
endpoint = "https://example.com/webhook"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain("Missing required field 'type'");
        }
      });

      it('should error for missing channel endpoint', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain(
            "Missing required field 'endpoint'"
          );
        }
      });

      it('should error for invalid channel type', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "telegram"
endpoint = "https://example.com/webhook"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain(
            "expected 'webhook', 'slack', or 'email'"
          );
        }
      });

      it('should error for invalid event type', () => {
        const toml = `
[notifications]
enabled = true

[[notifications.channels]]
type = "webhook"
endpoint = "https://example.com/webhook"
events = ["invalid-event"]
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain(
            "expected 'block', 'complete', 'error', or 'phase_change'"
          );
        }
      });
    });

    describe('invalid TOML syntax', () => {
      it('should return descriptive error for malformed TOML', () => {
        const invalidToml = `
[models
worker_model = "test"
`;
        expect(() => parseConfig(invalidToml)).toThrow(ConfigParseError);

        try {
          parseConfig(invalidToml);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigParseError);
          expect((error as ConfigParseError).message).toContain('Invalid TOML syntax');
        }
      });

      it('should return descriptive error for invalid key format', () => {
        const invalidToml = `
[models]
= "no key"
`;
        expect(() => parseConfig(invalidToml)).toThrow(ConfigParseError);
      });

      it('should return descriptive error for unclosed string', () => {
        const invalidToml = `
[models]
worker_model = "unclosed
`;
        expect(() => parseConfig(invalidToml)).toThrow(ConfigParseError);
      });
    });

    describe('type validation errors', () => {
      it('should error when string field receives number', () => {
        const toml = `
[models]
worker_model = 123
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect((error as ConfigParseError).message).toContain(
            "Invalid type for 'models.worker_model'"
          );
          expect((error as ConfigParseError).message).toContain('expected string');
        }
      });

      it('should error when number field receives string', () => {
        const toml = `
[thresholds]
max_retry_attempts = "five"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect((error as ConfigParseError).message).toContain(
            "Invalid type for 'thresholds.max_retry_attempts'"
          );
          expect((error as ConfigParseError).message).toContain('expected number');
        }
      });

      it('should error when boolean field receives string', () => {
        const toml = `
[notifications]
enabled = "true"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect((error as ConfigParseError).message).toContain(
            "Invalid type for 'notifications.enabled'"
          );
          expect((error as ConfigParseError).message).toContain('expected boolean');
        }
      });

      it('should error for invalid notification channel value', () => {
        const toml = `
[notifications]
enabled = true
channel = "telegram"
`;
        expect(() => parseConfig(toml)).toThrow(ConfigParseError);

        try {
          parseConfig(toml);
        } catch (error) {
          expect((error as ConfigParseError).message).toContain(
            "Invalid value for 'notifications.channel'"
          );
          expect((error as ConfigParseError).message).toContain('telegram');
        }
      });
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a copy of default config', async () => {
      const config1 = await getDefaultConfig();
      const config2 = await getDefaultConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should have all expected default model assignments', async () => {
      const config = await getDefaultConfig();

      expect(config.models.architect_model).toBe('claude-opus-4.5');
      expect(config.models.auditor_model).toBe('kimi-k2');
      expect(config.models.structurer_model).toBe('claude-sonnet-4.5');
      expect(config.models.worker_model).toBe('minimax-m2');
      expect(config.models.fallback_model).toBe('claude-sonnet-4.5');
    });

    it('should have all expected default paths', async () => {
      const config = await getDefaultConfig();

      expect(config.paths.specs).toBe('.criticality/specs');
      expect(config.paths.archive).toBe('.criticality/archive');
      expect(config.paths.state).toBe('.criticality/state.json');
      expect(config.paths.logs).toBe('.criticality/logs');
      expect(config.paths.ledger).toBe('.criticality/ledger');
    });

    it('should have all expected default thresholds', async () => {
      const config = await getDefaultConfig();

      expect(config.thresholds.context_token_upgrade).toBe(12000);
      expect(config.thresholds.signature_complexity_upgrade).toBe(5);
      expect(config.thresholds.max_retry_attempts).toBe(3);
      expect(config.thresholds.retry_base_delay_ms).toBe(1000);
      expect(config.thresholds.performance_variance_threshold).toBe(0.2);
    });

    it('should have notifications disabled by default', async () => {
      const config = await getDefaultConfig();

      expect(config.notifications.enabled).toBe(false);
      expect(config.notifications.channel).toBeUndefined();
      expect(config.notifications.endpoint).toBeUndefined();
    });
  });

  describe('ConfigParseError', () => {
    it('should preserve error name', () => {
      const error = new ConfigParseError('test error');
      expect(error.name).toBe('ConfigParseError');
    });

    it('should preserve error message', () => {
      const error = new ConfigParseError('test message');
      expect(error.message).toBe('test message');
    });

    it('should preserve original cause', () => {
      const cause = new Error('original error');
      const error = new ConfigParseError('wrapper error', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('property-based tests', () => {
    it('should always return valid config for empty input', () => {
      fc.assert(
        fc.property(fc.constant(''), (input) => {
          const config = parseConfig(input);
          return (
            typeof config.models.architect_model === 'string' &&
            typeof config.paths.specs === 'string' &&
            typeof config.thresholds.max_retry_attempts === 'number' &&
            typeof config.notifications.enabled === 'boolean'
          );
        }),
        { numRuns: 10 }
      );
    });

    it('should preserve string values when provided', () => {
      const isValidTomlString = (s: string): boolean =>
        s.length > 0 &&
        !s.includes('"') &&
        !s.includes('\\') &&
        !s.includes('\n') &&
        !s.includes('\r') &&
        !s.includes('\t');

      fc.assert(
        fc.property(fc.string().filter(isValidTomlString), (modelName) => {
          const toml = `
[models]
worker_model = "${modelName}"
`;
          const config = parseConfig(toml);
          return config.models.worker_model === modelName;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve positive integer thresholds', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100000 }), (retryAttempts) => {
          const toml = `
[thresholds]
max_retry_attempts = ${String(retryAttempts)}
`;
          const config = parseConfig(toml);
          return config.thresholds.max_retry_attempts === retryAttempts;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve float thresholds', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.01, max: 1.0, noNaN: true }), (threshold) => {
          const toml = `
[thresholds]
performance_variance_threshold = ${String(threshold)}
`;
          const config = parseConfig(toml);
          return Math.abs(config.thresholds.performance_variance_threshold - threshold) < 0.0001;
        }),
        { numRuns: 50 }
      );
    });
  });
});
