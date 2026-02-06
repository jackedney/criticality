/* eslint-disable security/detect-object-injection -- Test code with controlled indices */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { Logger } from './logger.js';

describe('Logger', () => {
  let capturedOutput: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    capturedOutput = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = vi.fn((chunk: string | Uint8Array): boolean => {
      capturedOutput.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  function getOutput(index: number): string {
    const output = capturedOutput[index];
    if (output === undefined) {
      throw new Error(`Expected output at index ${String(index)} but got undefined`);
    }
    return output;
  }

  function parseOutput(index: number): Record<string, unknown> {
    const output = getOutput(index);
    return JSON.parse(output.trim()) as Record<string, unknown>;
  }

  describe('safe JSON.stringify', () => {
    it('should handle circular references without throwing', () => {
      const logger = new Logger({ component: 'TestLogger' });

      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => {
        logger.info('circular_test', circularObj);
      }).not.toThrow();

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('info');
      expect(parsed.component).toBe('TestLogger');
      expect(parsed.event).toBe('circular_test');
      expect(parsed.serializationError).toBeDefined();
      expect(typeof parsed.serializationError).toBe('string');
      expect((parsed.serializationError as string).length).toBeGreaterThan(0);
      expect(parsed.originalData).toBe('[unserializable]');
    });

    it('should handle BigInt values without throwing', () => {
      const logger = new Logger({ component: 'TestLogger' });

      const dataWithBigInt = { value: BigInt(9007199254740991) };

      expect(() => {
        logger.info('bigint_test', dataWithBigInt as unknown as Record<string, unknown>);
      }).not.toThrow();

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('info');
      expect(parsed.component).toBe('TestLogger');
      expect(parsed.event).toBe('bigint_test');
      expect(parsed.serializationError).toBeDefined();
      expect(parsed.originalData).toBe('[unserializable]');
    });

    it('should output single JSON line even when serialization fails', () => {
      const logger = new Logger({ component: 'TestLogger' });

      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      logger.error('error_with_circular', circularObj);

      expect(capturedOutput.length).toBe(1);
      const output = getOutput(0);

      // Should be valid JSON on a single line
      expect(output.endsWith('\n')).toBe(true);
      expect(output.trim().split('\n').length).toBe(1);
      expect(() => JSON.parse(output.trim()) as unknown).not.toThrow();
    });

    it('should include timestamp, level, component, and event in fallback entry', () => {
      const logger = new Logger({ component: 'FallbackTest' });

      const circularObj: Record<string, unknown> = {};
      circularObj.ref = circularObj;

      logger.warn('fallback_fields', circularObj);

      const parsed = parseOutput(0);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(parsed.level).toBe('warn');
      expect(parsed.component).toBe('FallbackTest');
      expect(parsed.event).toBe('fallback_fields');
    });

    it('should handle arbitrary values without throwing (property-based)', () => {
      const logger = new Logger({ component: 'PropertyTest' });

      fc.assert(
        fc.property(fc.anything(), (arbitraryData) => {
          // Reset captured output for each run
          capturedOutput = [];

          expect(() => {
            logger.info('fuzz_test', arbitraryData as Record<string, unknown>);
          }).not.toThrow();

          expect(capturedOutput.length).toBe(1);
          const output = getOutput(0);

          // Should be valid JSON
          let parsed: Record<string, unknown>;
          expect(() => {
            parsed = JSON.parse(output.trim()) as Record<string, unknown>;
          }).not.toThrow();

          // Check basic fields
          parsed = JSON.parse(output.trim()) as Record<string, unknown>;
          expect(parsed.level).toBe('info');
          expect(parsed.component).toBe('PropertyTest');
          expect(parsed.event).toBe('fuzz_test');

          // If serialization failed, we should have the error fields
          if (parsed.serializationError) {
            expect(parsed.originalData).toBe('[unserializable]');
          }
        })
      );
    });
  });

  describe('normal logging', () => {
    it('should log info messages correctly', () => {
      const logger = new Logger({ component: 'TestLogger' });

      logger.info('test_event', { key: 'value' });

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('info');
      expect(parsed.event).toBe('test_event');
      expect(parsed.data).toEqual({ key: 'value' });
    });

    it('should not log debug messages when debugMode is false', () => {
      const logger = new Logger({ component: 'TestLogger', debugMode: false });

      logger.debug('debug_event', { key: 'value' });

      expect(capturedOutput.length).toBe(0);
    });

    it('should log debug messages when debugMode is true', () => {
      const logger = new Logger({ component: 'TestLogger', debugMode: true });

      logger.debug('debug_event', { key: 'value' });

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('debug');
    });

    it('should log warn messages correctly', () => {
      const logger = new Logger({ component: 'TestLogger' });

      logger.warn('warning_event', { reason: 'test' });

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('warn');
      expect(parsed.event).toBe('warning_event');
      expect(parsed.data).toEqual({ reason: 'test' });
    });

    it('should log error messages correctly', () => {
      const logger = new Logger({ component: 'TestLogger' });

      logger.error('error_event', { code: 500 });

      expect(capturedOutput.length).toBe(1);
      const parsed = parseOutput(0);

      expect(parsed.level).toBe('error');
      expect(parsed.event).toBe('error_event');
      expect(parsed.data).toEqual({ code: 500 });
    });
  });
});
