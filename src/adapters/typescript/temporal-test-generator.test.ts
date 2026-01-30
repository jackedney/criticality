/**
 * Tests for temporal claims.
 *
 * @module adapters/typescript/temporal-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateTemporalTest,
  generateTemporalTests,
  type TemporalTestOptions,
} from './temporal-test-generator.js';

describe('temporal-test-generator', () => {
  describe('generateTemporalTest', () => {
    it('should generate a temporal test', () => {
      const claim = {
        id: 'temp_001',
        type: 'temporal' as const,
        description: 'session is valid for 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain(
        'describe("Temporal: [temp_001] session is valid for 30 minutes", () => {'
      );
      expect(testCode).toContain('Session validity during valid period');
      expect(testCode).toContain('Session should be valid');
      expect(testCode).toContain('const sessionCreationTime = Date.now();');
      expect(testCode).toContain('const sessionDurationMs = 30 * 60 * 1000;');
      expect(testCode).toContain(
        'const midSessionTime = sessionCreationTime + sessionDurationMs / 2;'
      );
      expect(testCode).toContain('const isValid = validateSession(midSessionTime);');
      expect(testCode).toContain('expect(isValid).toBe(true);');
      expect(testCode).toContain("console.log('Session valid at midpoint:', isValid);");
      expect(testCode).toContain('Session should be invalid after expiration');
      expect(testCode).toContain(
        'const afterExpirationTime = sessionCreationTime + sessionDurationMs + 1000;'
      );
      expect(testCode).toContain('const isValid = validateSession(afterExpirationTime);');
      expect(testCode).toContain('expect(isValid).toBe(false);');
      expect(testCode).toContain("console.log('Session invalid after expiration:', isValid);");
      expect(testCode).toContain('Session expires after 30 minutes');
      expect(testCode).toContain('Time constraints detected: minute');
      expect(testCode).toContain("it('[temp_001] session is valid for 30 minutes', () => {");
      expect(testCode).toContain('},');
      expect(testCode).toContain('{ timeout: 30000 }');
      expect(testCode).toContain('});');
    });

    it('should generate test with session expiration', () => {
      const claim = {
        id: 'temp_002',
        type: 'temporal' as const,
        description: 'session expires after 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('Session should be invalid after expiration');
      expect(testCode).toContain(
        'const afterExpirationTime = sessionCreationTime + sessionDurationMs + 1000;'
      );
      expect(testCode).toContain('const isValid = validateSession(afterExpirationTime);');
      expect(testCode).toContain('expect(isValid).toBe(false);');
      expect(testCode).toContain("console.log('Session invalid after expiration:', isValid);");
    });

    it('should generate test with timeout constraint', () => {
      const claim = {
        id: 'temp_003',
        type: 'temporal' as const,
        description: 'operation completes within 5 seconds',
        functions: ['performOperation'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('operation completes within 5 seconds');
      expect(testCode).toContain('const timeoutMs = 5000;');
      expect(testCode).toContain('const startTime = Date.now();');
      expect(testCode).toContain('const promise = operationUnderTest();');
      expect(testCode).toContain('const elapsed = Date.now() - startTime;');
      expect(testCode).toContain('expect(elapsed).toBeLessThan(timeoutMs);');
      expect(testCode).toContain('Time constraints detected: second');
      expect(testCode).toContain('it("[temp_003] operation completes within 5 seconds", () => {');
      expect(testCode).toContain('},');
      expect(testCode).toContain('{ timeout: 30000 }');
      expect(testCode).toContain('});');
    });

    it('should generate test without linked functions', () => {
      const claim = {
        id: 'temp_004',
        type: 'temporal' as const,
        description: 'some temporal constraint',
        functions: [],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('it.skip');
      expect(testCode).toContain('no linked functions');
    });
  });

  describe('generateTemporalTests', () => {
    it('should generate multiple temporal tests', () => {
      const claims = [
        {
          id: 'temp_001',
          type: 'temporal' as const,
          description: 'session is valid for 30 minutes',
          functions: ['validateSession'],
        },
        {
          id: 'temp_002',
          type: 'temporal' as const,
          description: 'session expires after 30 minutes',
          functions: ['validateSession'],
        },
      ];

      const tests = generateTemporalTests(claims, { includeJsDoc: false });
      expect(tests.size).toBe(2);
      expect(tests.get('temp_001')).toContain('session is valid for 30 minutes');
      expect(tests.get('temp_002')).toContain('session expires after 30 minutes');
    });

    it('should filter claims by temporal type', () => {
      const claims = [
        {
          id: 'temp_001',
          type: 'temporal' as const,
          description: 'session is valid for 30 minutes',
          functions: ['validateSession'],
        },
        {
          id: 'inv_001',
          type: 'invariant' as const,
          description: 'balance is never negative',
          functions: ['getBalance'],
        },
        {
          id: 'neg_001',
          type: 'negative' as const,
          description: 'cannot withdraw more than balance',
          functions: ['withdraw'],
        },
      ];

      const tests = generateTemporalTests(claims, { includeJsDoc: false });
      expect(tests.size).toBe(1);
      expect(tests.has('temp_001')).toBe(true);
      expect(tests.has('inv_001')).toBe(false);
      expect(tests.has('neg_001')).toBe(false);
    });
  });
});
