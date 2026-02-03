/**
 * Tests for negative test generator.
 *
 * @module adapters/typescript/negative-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateNegativeTest,
  generateNegativeTests,
  extractForbiddenOutcome,
} from './negative-test-generator.js';

describe('negative-test-generator', () => {
  describe('generateNegativeTest', () => {
    it('should generate a test for forbidden action', () => {
      const claim = {
        id: 'neg_001',
        type: 'negative' as const,
        description: 'cannot withdraw more than balance',
        functions: ['withdraw'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      expect(testCode).toContain(
        `describe('Negative: [neg_001] cannot withdraw more than balance', () => {`
      );
      expect(testCode).toContain(`'[neg_001] cannot withdraw more than balance',`);
      expect(testCode).toContain('// TODO: Set up initial state and inputs');
      expect(testCode).toContain('const account = { balance: 100 };');
    });

    it('should generate a test for forbidden outcome with error', () => {
      const claim = {
        id: 'neg_002',
        type: 'negative' as const,
        description: 'never produces error',
        functions: ['processPayment'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      const forbiddenOutcome = extractForbiddenOutcome(claim.description);
      expect(forbiddenOutcome).toBe('error');
      expect(testCode).toContain('// Verify forbidden outcome does not occur');
      expect(testCode).toContain('// Expected: error should never be produced');
      expect(testCode).toContain('// Example: expect(result.error).toBeUndefined();');
    });

    it('should generate a test for "never results in failure"', () => {
      const claim = {
        id: 'neg_003',
        type: 'negative' as const,
        description: 'never results in failure',
        functions: ['validateInput'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      const forbiddenOutcome = extractForbiddenOutcome(claim.description);
      expect(forbiddenOutcome).toBe('failure');
      expect(testCode).toContain('// Verify forbidden outcome does not occur');
      expect(testCode).toContain('// Expected: failure should never be produced');
      expect(testCode).toContain('// Example: expect(result.failure).toBeUndefined();');
    });

    it('should handle claim without linked functions', () => {
      const claim = {
        id: 'neg_004',
        type: 'negative' as const,
        description: 'some negative constraint',
        functions: [],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('it.skip');
      expect(testCode).toContain('no linked functions');
      expect(testCode).toContain("throw new Error('Test not implemented: no linked functions');");
    });

    it('should generate test with account when description contains balance', () => {
      const claim = {
        id: 'neg_005',
        type: 'negative' as const,
        description: 'never produces negative balance',
        functions: ['calculateBalance'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('const account = { balance: 100 };');
      expect(testCode).toContain('// Verify forbidden outcome does not occur');
      expect(testCode).not.toContain('const input = {};');
    });

    describe('generateNegativeTests', () => {
      it('should generate multiple negative tests', () => {
        const claims = [
          {
            id: 'neg_001',
            type: 'negative' as const,
            description: 'never produces error',
            functions: ['withdraw'],
          },
          {
            id: 'neg_002',
            type: 'negative' as const,
            description: 'never results in failure',
            functions: ['createAccount'],
          },
        ];

        const tests = generateNegativeTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(2);
        expect(tests.get('neg_001')).toBeDefined();
        expect(tests.get('neg_002')).toBeDefined();
        expect(tests.get('neg_001')).toContain(
          "describe('Negative: [neg_001] never produces error', () => {"
        );
        expect(tests.get('neg_002')).toContain(
          "describe('Negative: [neg_002] never results in failure', () => {"
        );
      });

      it('should filter claims by negative type', () => {
        const claims = [
          {
            id: 'neg_001',
            type: 'negative' as const,
            description: 'never produces error',
            functions: ['withdraw'],
          },
          {
            id: 'inv_001',
            type: 'invariant' as const,
            description: 'balance is never negative',
            functions: ['getBalance'],
          },
          {
            id: 'neg_002',
            type: 'negative' as const,
            description: 'never results in failure',
            functions: ['createAccount'],
          },
        ];

        const tests = generateNegativeTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(2);
        expect(tests.get('neg_001')).toBeDefined();
        expect(tests.get('inv_001')).toBeUndefined();
        expect(tests.get('neg_002')).toBeDefined();
        expect(tests.get('neg_001')).toContain(
          "describe('Negative: [neg_001] never produces error', () => {"
        );
        expect(tests.get('neg_002')).toContain(
          "describe('Negative: [neg_002] never results in failure', () => {"
        );
      });
    });
  });

  describe('extractForbiddenOutcome', () => {
    it('should extract outcome from "never produces" pattern', () => {
      const result = extractForbiddenOutcome('never produces error');
      expect(result).toBe('error');
    });

    it('should extract outcome from "never result in" pattern', () => {
      const result = extractForbiddenOutcome('never results in failure');
      expect(result).toBe('failure');
    });

    it('should extract outcome from "never produce" pattern', () => {
      const result = extractForbiddenOutcome('never produce exception');
      expect(result).toBe('exception');
    });

    it('should be case-insensitive', () => {
      const result = extractForbiddenOutcome('NEVER PRODUCES Error');
      expect(result).toBe('Error');
    });

    it('should return undefined for non-negative claims', () => {
      const result = extractForbiddenOutcome('balance is always positive');
      expect(result).toBeUndefined();
    });

    it('should extract single word outcomes', () => {
      expect(extractForbiddenOutcome('never produces null')).toBe('null');
      expect(extractForbiddenOutcome('never results in timeout')).toBe('timeout');
    });

    it('should extract multi-word outcomes', () => {
      expect(extractForbiddenOutcome('never produces runtime error')).toBe('runtime');
    });
  });
});
