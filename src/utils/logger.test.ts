/* eslint-disable security/detect-object-injection -- Test code with controlled indices */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      expect(parsed.serializationError).toContain('circular');
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
  });
});
