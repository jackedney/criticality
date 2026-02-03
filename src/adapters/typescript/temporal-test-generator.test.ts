/**
 * Tests for temporal test generator.
 *
 * @module adapters/typescript/temporal-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateTemporalTest,
  generateTemporalTests,
  DEFAULT_TIMEOUT,
} from './temporal-test-generator.js';

describe('temporal-test-generator', () => {
  describe('generateTemporalTest', () => {
    it('should generate a temporal test for session validity', () => {
      const claim = {
        id: 'temp_001',
        type: 'temporal' as const,
        description: 'session is valid for 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain(
        "describe('Temporal: [temp_001] session is valid for 30 minutes', () => {"
      );
      expect(testCode).toContain('it(');
      expect(testCode).toContain("'[temp_001] session is valid for 30 minutes',");
      expect(testCode).toContain('const midIsValid = false;');
      expect(testCode).toContain('const afterIsValid = false;');
      expect(testCode).toContain("console.log('Testing session validity at 15 minute mark');");
      expect(testCode).toContain('// midIsValid = validateSession(session, 15);');
      expect(testCode).toContain("console.log('Mid-session validation result:', midIsValid);");
      expect(testCode).toContain("console.log('Testing session validity after 30 minutes');");
      expect(testCode).toContain('// afterIsValid = validateSession(session, 31);');
      expect(testCode).toContain('expect(midIsValid).toBe(true);');
      expect(testCode).toContain('expect(afterIsValid).toBe(false);');
      expect(testCode).toContain('}, { timeout: 30000 });');
    });

    it('should generate a temporal test with custom timeout', () => {
      const claim = {
        id: 'temp_002',
        type: 'temporal' as const,
        description: 'cache expires after 5 minutes',
        functions: ['validateCache'],
      };

      const testCode = generateTemporalTest(claim, { timeout: 60000 });
      expect(testCode).toContain('}, { timeout: 60000 });');
    });

    it('should generate individual function tests', () => {
      const claim = {
        id: 'temp_001',
        type: 'temporal' as const,
        description: 'session is valid for 30 minutes',
        functions: ['validateSession', 'checkExpiration'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain("it('validateSession maintains temporal property', () => {");
      expect(testCode).toContain("it('checkExpiration maintains temporal property', () => {");
      expect(testCode).toContain('console.log');
      expect(testCode).toContain('TODO string for validateSession');
      expect(testCode).toContain('TODO string for checkExpiration');
    });

    it('should generate skipped test when no functions are linked', () => {
      const claim = {
        id: 'temp_003',
        type: 'temporal' as const,
        description: 'some temporal property',
        functions: [],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('it.skip');
      expect(testCode).toContain('no linked functions');
      expect(testCode).toContain("throw new Error('Test not implemented: no linked functions');");
    });

    it('should throw error for non-temporal claim type', () => {
      const claim = {
        id: 'inv_001',
        type: 'invariant' as const,
        description: 'balance is never negative',
        functions: ['getBalance'],
      };

      expect(() => generateTemporalTest(claim)).toThrow(
        "Invalid claim type 'invariant' for temporal test generator. Expected 'temporal'."
      );
    });

    it('should include JSDoc comments when enabled', () => {
      const claim = {
        id: 'temp_001',
        type: 'temporal' as const,
        description: 'session is valid for 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: true });
      expect(testCode).toContain('/**');
      expect(testCode).toContain('* Temporal test for claim: temp_001');
      expect(testCode).toContain('* Tested functions: validateSession');
      expect(testCode).toContain('* @generated This file was auto-generated');
      expect(testCode).toContain('* Temporal test verifying: session is valid for 30 minutes');
      expect(testCode).toContain('* This test verifies properties that hold over time periods.');
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
            description: 'cache expires after 5 minutes',
            functions: ['validateCache'],
          },
        ];

        const tests = generateTemporalTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(2);
        expect(tests.get('temp_001')).toBeDefined();
        expect(tests.get('temp_002')).toBeDefined();
        expect(tests.get('temp_001')).toContain(
          "describe('Temporal: [temp_001] session is valid for 30 minutes', () => {"
        );
        expect(tests.get('temp_002')).toContain(
          "describe('Temporal: [temp_002] cache expires after 5 minutes', () => {"
        );
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
            id: 'temp_002',
            type: 'temporal' as const,
            description: 'cache expires after 5 minutes',
            functions: ['validateCache'],
          },
        ];

        const tests = generateTemporalTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(2);
        expect(tests.get('temp_001')).toBeDefined();
        expect(tests.get('inv_001')).toBeUndefined();
        expect(tests.get('temp_002')).toBeDefined();
      });
    });

    it('should export DEFAULT_TIMEOUT constant', () => {
      expect(DEFAULT_TIMEOUT).toBe(30000);
    });
  });
});
