/**
 * Tests for negative test generator.
 *
 * @module adapters/typescript/negative-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generateNegativeTest, generateNegativeTests } from './negative-test-generator.js';

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
        'describe("Negative: [neg_001] cannot withdraw more than balance", () => {'
      );
      expect(testCode).toContain('it("[neg_001] cannot withdraw more than balance]", () => {');
      expect(testCode).toContain('const action = "withdraw";');
      expect(testCode).toContain('Assert: Forbidden action was blocked');
    });

    it('should generate a test for forbidden outcome', () => {
      const claim = {
        id: 'neg_002',
        type: 'negative' as const,
        description: 'insufficient funds cannot be created',
        functions: ['createAccount'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('Forbidden outcome: insufficient funds');
      expect(testCode).toContain('const expectedFailure = "insufficient funds";');
      expect(testCode).toContain('Assert: Forbidden outcome did not occur');
    });

    it('should generate a security test for SQL injection', () => {
      const claim = {
        id: 'neg_003',
        type: 'negative' as const,
        description: 'SQL injection is blocked',
        functions: ['executeQuery'],
      };

      const testCode = generateNegativeTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('Security test: Attempt malicious input');
      expect(testCode).toContain('const maliciousInput = {};');
      expect(testCode).toContain('Security: Should reject unauthorized/insecure operations');
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
    });

    describe('generateNegativeTests', () => {
      it('should generate multiple negative tests', () => {
        const claims = [
          {
            id: 'neg_001',
            type: 'negative' as const,
            description: 'cannot withdraw more than balance',
            functions: ['withdraw'],
          },
          {
            id: 'neg_002',
            type: 'negative' as const,
            description: 'insufficient funds cannot be created',
            functions: ['createAccount'],
          },
        ];

        const tests = generateNegativeTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(2);
        expect(tests.get('neg_001')).toBeDefined();
        expect(tests.get('neg_002')).toBeDefined();
        expect(tests.get('neg_001')).toContain('const action = "withdraw";');
        expect(tests.get('neg_002')).toContain('const expectedFailure = "insufficient funds";');
      });

      it('should filter claims by negative type', () => {
        const claims = [
          {
            id: 'neg_001',
            type: 'negative' as const,
            description: 'cannot withdraw more than balance',
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
            description: 'insufficient funds cannot be created',
            functions: ['createAccount'],
          },
        ];

        const tests = generateNegativeTests(claims, { includeJsDoc: false });
        expect(tests.size).toBe(1);
        expect(tests.get('neg_001')).toBeDefined();
        expect(tests.get('inv_001')).toBeUndefined();
        expect(tests.get('neg_001')).toContain('const action = "withdraw";');
        expect(tests.get('neg_002')).toBeDefined();
      });
    });
  });
});
