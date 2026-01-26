/**
 * Tests for the contract syntax validation module.
 *
 * @module adapters/typescript/validation.test
 */

import { describe, it, expect } from 'vitest';
import { validateContracts, validateContractsWithScope } from './validation.js';
import type { MicroContract } from './assertions.js';

describe('validateContracts', () => {
  describe('valid contracts', () => {
    it('returns valid for empty contract array', () => {
      const result = validateContracts([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid for contract with valid @requires expression', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'sqrt',
          filePath: 'math.ts',
          requires: ['x > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid for contract with valid @ensures expression using result', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'abs',
          filePath: 'math.ts',
          requires: ['x'],
          ensures: ['result >= 0'],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid for contract with valid @invariant expression using this', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'withdraw',
          filePath: 'account.ts',
          requires: ['amount > 0'],
          ensures: [],
          invariants: ['this.balance >= 0'],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid for contract with complex expression', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'process',
          filePath: 'utils.ts',
          requires: ['arr.length > 0 && arr.every(x => x !== null)'],
          ensures: ['result !== undefined'],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid for all O complexity patterns', () => {
      const validComplexities = [
        'O(1)',
        'O(n)',
        'O(m)',
        'O(n^2)',
        'O(n^3)',
        'O(log n)',
        'O(n log n)',
        'O(2^n)',
        'O(n!)',
        'O(n + m)',
        'O(m + n)',
        'O(n * m)',
        'O(nm)',
        'O(mn)',
      ];

      for (const complexity of validComplexities) {
        const contracts: MicroContract[] = [
          {
            functionName: 'test',
            filePath: 'test.ts',
            requires: [],
            ensures: [],
            invariants: [],
            claimRefs: [],
            complexity,
          },
        ];

        const result = validateContracts(contracts);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });

    it('returns valid for all purity values', () => {
      const validPurities: ('pure' | 'reads' | 'writes' | 'io')[] = [
        'pure',
        'reads',
        'writes',
        'io',
      ];

      for (const purity of validPurities) {
        const contracts: MicroContract[] = [
          {
            functionName: 'test',
            filePath: 'test.ts',
            requires: [],
            ensures: [],
            invariants: [],
            claimRefs: [],
            purity,
          },
        ];

        const result = validateContracts(contracts);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });

    it('returns valid for properly formatted CLAIM_REF IDs', () => {
      const validClaimRefs = [
        'inv_001',
        'perf_123',
        'behavior_002',
        'safety_1',
        'test_99',
        'myCategory_42',
        'ABC_123',
      ];

      for (const claimRef of validClaimRefs) {
        const contracts: MicroContract[] = [
          {
            functionName: 'test',
            filePath: 'test.ts',
            requires: [],
            ensures: [],
            invariants: [],
            claimRefs: [claimRef],
          },
        ];

        const result = validateContracts(contracts);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });

    it('returns valid for complete contract with all fields', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'transfer',
          filePath: 'account.ts',
          requires: ['amount > 0', 'this.balance >= amount'],
          ensures: ['result === true', 'this.balance >= 0'],
          invariants: ['this.balance >= 0'],
          claimRefs: ['inv_001', 'behavior_002'],
          complexity: 'O(1)',
          purity: 'writes',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('acceptance criteria examples', () => {
    it('@requires x > 0 with parameter x is valid', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'sqrt',
          filePath: 'math.ts',
          requires: ['x > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('@requires nonexistent > 0 fails with unknown variable: nonexistent', () => {
      // This test validates behavior when variable scope is explicitly provided
      const contracts: MicroContract[] = [
        {
          functionName: 'sqrt',
          filePath: 'math.ts',
          requires: ['nonexistent > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      // With explicit scope that doesn't include 'nonexistent'
      const scopes = new Map<string, Set<string>>();
      scopes.set('sqrt', new Set(['x', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toBe('unknown variable: nonexistent');
    });

    it('@complexity O(fast) fails with invalid complexity format', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'sort',
          filePath: 'sort.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'O(fast)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('complexity');
      expect(result.errors[0]?.message).toContain('invalid complexity format');
      expect(result.errors[0]?.message).toContain('O(fast)');
    });
  });

  describe('invalid TypeScript expressions', () => {
    it('fails for empty expression', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [''],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('fails for unbalanced parentheses', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: ['x > (0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('fails for invalid syntax', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: ['x > > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('variable scope validation', () => {
    it('fails when requires references unknown variable with explicit scope', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'sqrt',
          filePath: 'math.ts',
          requires: ['unknownVar > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
        },
      ];

      // Provide explicit scope without unknownVar
      const scopes = new Map<string, Set<string>>();
      scopes.set('sqrt', new Set(['x', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toBe('unknown variable: unknownVar');
      expect(result.errors[0]?.type).toBe('requires');
    });

    it('fails when ensures references unknown variable with explicit scope', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'process',
          filePath: 'utils.ts',
          requires: ['x > 0'],
          ensures: ['unknownOutput !== null'],
          invariants: [],
          claimRefs: [],
        },
      ];

      const scopes = new Map<string, Set<string>>();
      scopes.set('process', new Set(['x', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toBe('unknown variable: unknownOutput');
      expect(result.errors[0]?.type).toBe('ensures');
    });

    it('allows result variable in ensures', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'getValue',
          filePath: 'test.ts',
          requires: [],
          ensures: ['result !== null', 'result > 0'],
          invariants: [],
          claimRefs: [],
        },
      ];

      const scopes = new Map<string, Set<string>>();
      scopes.set('getValue', new Set(['result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('allows this variable in invariants', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'withdraw',
          filePath: 'account.ts',
          requires: [],
          ensures: [],
          invariants: ['this.balance >= 0', 'this.transactions.length >= 0'],
          claimRefs: [],
        },
      ];

      const scopes = new Map<string, Set<string>>();
      scopes.set('withdraw', new Set(['amount', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('allows built-in identifiers without them being in scope', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'process',
          filePath: 'utils.ts',
          requires: ['Array.isArray(arr)', 'Number.isFinite(n)', 'Math.abs(n) > 0'],
          ensures: ['typeof result === "string"'],
          invariants: [],
          claimRefs: [],
        },
      ];

      // Scope only includes arr and n
      const scopes = new Map<string, Set<string>>();
      scopes.set('process', new Set(['arr', 'n', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('complexity validation', () => {
    it('fails for invalid complexity format O(fast)', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'O(fast)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('complexity');
      expect(result.errors[0]?.value).toBe('O(fast)');
    });

    it('fails for missing O notation', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'n^2',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('complexity');
    });

    it('fails for lowercase o notation', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'o(n)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('complexity');
    });

    it('fails for invalid complexity expression', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'O(constant)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('purity validation', () => {
    it('purity is already validated during parsing', () => {
      // Since purity is validated during parsing (in contracts.ts),
      // and the type is constrained to 'pure' | 'reads' | 'writes' | 'io',
      // validation here mainly confirms the type constraint.
      // The parser throws ContractSyntaxError for invalid values.

      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          purity: 'pure',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
    });
  });

  describe('CLAIM_REF validation', () => {
    it('fails for CLAIM_REF without underscore separator', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: ['inv001'],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('claimRef');
      expect(result.errors[0]?.message).toContain('invalid CLAIM_REF format');
    });

    it('fails for CLAIM_REF starting with number', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: ['123_inv'],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('claimRef');
    });

    it('fails for CLAIM_REF without number suffix', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: ['inv_abc'],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('claimRef');
    });

    it('fails for empty CLAIM_REF', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [''],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('claimRef');
    });
  });

  describe('multiple errors', () => {
    it('collects all errors from a single contract', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'badFunction',
          filePath: 'bad.ts',
          requires: ['x > (0'],
          ensures: [],
          invariants: [],
          claimRefs: ['badref'],
          complexity: 'O(fast)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      // Should have errors for: invalid expression, invalid complexity, invalid claimRef
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('collects errors from multiple contracts', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'func1',
          filePath: 'a.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'O(bad)',
        },
        {
          functionName: 'func2',
          filePath: 'b.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: ['invalid'],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);

      // Check errors are from different functions
      const func1Errors = result.errors.filter((e) => e.functionName === 'func1');
      const func2Errors = result.errors.filter((e) => e.functionName === 'func2');

      expect(func1Errors).toHaveLength(1);
      expect(func2Errors).toHaveLength(1);
    });
  });

  describe('inline assertions validation', () => {
    it('validates inline assertion expressions', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'process',
          filePath: 'utils.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          inlineAssertions: [
            { type: 'invariant', expression: 'count >= 0', lineNumber: 10 },
            { type: 'assert', expression: 'value !== null', lineNumber: 15 },
          ],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails for invalid inline assertion expression with explicit scope', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'process',
          filePath: 'utils.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          inlineAssertions: [{ type: 'invariant', expression: 'unknownVar >= 0', lineNumber: 10 }],
        },
      ];

      const scopes = new Map<string, Set<string>>();
      scopes.set('process', new Set(['result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toBe('unknown variable: unknownVar');
      expect(result.errors[0]?.lineNumber).toBe(10);
    });

    it('includes line number in error for inline assertions', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'test',
          filePath: 'test.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          inlineAssertions: [{ type: 'assert', expression: 'x > (0', lineNumber: 42 }],
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors[0]?.lineNumber).toBe(42);
    });
  });

  describe('validateContractsWithScope', () => {
    it('uses provided scope for validation', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'add',
          filePath: 'math.ts',
          requires: ['a > 0', 'b > 0'],
          ensures: ['result > 0'],
          invariants: [],
          claimRefs: [],
        },
      ];

      const scopes = new Map<string, Set<string>>();
      scopes.set('add', new Set(['a', 'b', 'result', 'this']));

      const result = validateContractsWithScope(contracts, scopes);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('falls back to built scope when function not in scope map', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'multiply',
          filePath: 'math.ts',
          requires: ['x > 0', 'y > 0'],
          ensures: ['result > 0'],
          invariants: [],
          claimRefs: [],
        },
      ];

      // Provide empty scope map - should fall back to building scope from contract
      const scopes = new Map<string, Set<string>>();

      const result = validateContractsWithScope(contracts, scopes);

      // Should be valid because it builds scope from the expressions
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('error object structure', () => {
    it('ContractError has correct properties', () => {
      const contracts: MicroContract[] = [
        {
          functionName: 'badFunc',
          filePath: 'bad/path.ts',
          requires: [],
          ensures: [],
          invariants: [],
          claimRefs: [],
          complexity: 'O(invalid)',
        },
      ];

      const result = validateContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);

      const error = result.errors[0];
      expect(error).toBeDefined();
      expect(error?.functionName).toBe('badFunc');
      expect(error?.filePath).toBe('bad/path.ts');
      expect(error?.type).toBe('complexity');
      expect(error?.value).toBe('O(invalid)');
      expect(typeof error?.message).toBe('string');
    });
  });
});

describe('ValidationResult', () => {
  it('valid is true when errors array is empty', () => {
    const result = validateContracts([]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('valid is false when errors array has items', () => {
    const contracts: MicroContract[] = [
      {
        functionName: 'test',
        filePath: 'test.ts',
        requires: [],
        ensures: [],
        invariants: [],
        claimRefs: [],
        complexity: 'invalid',
      },
    ];

    const result = validateContracts(contracts);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
