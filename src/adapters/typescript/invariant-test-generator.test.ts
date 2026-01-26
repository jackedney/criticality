/**
 * Tests for the invariant test generator module.
 *
 * @module adapters/typescript/invariant-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateInvariantTest,
  generateInvariantTests,
  DEFAULT_TIMEOUT,
  DEFAULT_NUM_RUNS,
} from './invariant-test-generator.js';
import type { Claim } from './claims.js';
import type { WitnessDefinition } from './witness.js';

describe('generateInvariantTest', () => {
  describe('basic test generation', () => {
    it('generates vitest test file with fast-check property tests', () => {
      const claim: Claim = {
        id: 'inv_001',
        type: 'invariant',
        description: 'Account balance is never negative',
        functions: ['getBalance', 'withdraw'],
      };

      const witnesses: WitnessDefinition[] = [
        {
          name: 'NonNegativeDecimal',
          baseType: 'number',
          invariant: 'value >= 0',
        },
      ];

      const result = generateInvariantTest(claim, witnesses);

      // Should include vitest imports
      expect(result).toContain("import { describe, it, expect } from 'vitest';");

      // Should include fast-check import
      expect(result).toContain("import * as fc from 'fast-check';");

      // Should use describe block
      expect(result).toContain("describe('Invariant:");

      // Should use fc.assert and fc.property
      expect(result).toContain('fc.assert(');
      expect(result).toContain('fc.property(');
    });

    it('generates descriptive test names including claim ID', () => {
      const claim: Claim = {
        id: 'inv_002',
        type: 'invariant',
        description: 'User permissions are consistent',
        functions: ['addPermission'],
      };

      const result = generateInvariantTest(claim, []);

      // Test name should include claim ID for traceability
      expect(result).toContain('[inv_002]');
      expect(result).toContain('User permissions are consistent');
    });

    it('includes appropriate test timeout for property tests', () => {
      const claim: Claim = {
        id: 'inv_003',
        type: 'invariant',
        description: 'Test invariant',
        functions: ['someFunction'],
      };

      const result = generateInvariantTest(claim, []);

      // Should include timeout configuration
      expect(result).toContain(`timeout: ${String(DEFAULT_TIMEOUT)}`);
    });

    it('respects custom timeout option', () => {
      const claim: Claim = {
        id: 'inv_004',
        type: 'invariant',
        description: 'Test invariant',
        functions: ['someFunction'],
      };

      const result = generateInvariantTest(claim, [], { timeout: 60000 });

      expect(result).toContain('timeout: 60000');
    });

    it('respects custom numRuns option', () => {
      const claim: Claim = {
        id: 'inv_005',
        type: 'invariant',
        description: 'Test invariant',
        functions: ['someFunction'],
      };

      const result = generateInvariantTest(claim, [], { numRuns: 500 });

      expect(result).toContain('numRuns: 500');
    });
  });

  describe('uses generated arbitraries for witness types', () => {
    it('references arbitraries for non-generic witnesses', () => {
      const claim: Claim = {
        id: 'inv_010',
        type: 'invariant',
        description: 'Balance never negative',
        functions: ['withdraw'],
      };

      const witnesses: WitnessDefinition[] = [
        {
          name: 'NonNegativeDecimal',
          baseType: 'number',
          invariant: 'value >= 0',
        },
      ];

      const result = generateInvariantTest(claim, witnesses);

      // Should reference the arbitrary
      expect(result).toContain('arbitraryNonNegativeDecimal');
    });

    it('references arbitraries for generic witnesses', () => {
      const claim: Claim = {
        id: 'inv_011',
        type: 'invariant',
        description: 'Array is never empty',
        functions: ['pop'],
      };

      const witnesses: WitnessDefinition[] = [
        {
          name: 'NonEmptyArray',
          baseType: 'T[]',
          typeParameters: [{ name: 'T' }],
          invariant: 'value.length > 0',
        },
      ];

      const result = generateInvariantTest(claim, witnesses);

      // Should call the generic arbitrary factory
      expect(result).toContain('arbitraryNonEmptyArray(');
    });

    it('handles multiple witnesses', () => {
      const claim: Claim = {
        id: 'inv_012',
        type: 'invariant',
        description: 'Account balances are valid',
        functions: ['transfer'],
      };

      const witnesses: WitnessDefinition[] = [
        {
          name: 'NonNegativeDecimal',
          baseType: 'number',
          invariant: 'value >= 0',
        },
        {
          name: 'PositiveInteger',
          baseType: 'number',
          invariant: 'value > 0 && Number.isInteger(value)',
        },
      ];

      const result = generateInvariantTest(claim, witnesses);

      // Should reference both arbitraries
      expect(result).toContain('arbitraryNonNegativeDecimal');
      expect(result).toContain('arbitraryPositiveInteger');
    });
  });

  describe('tests invariant holds for all generated inputs', () => {
    it('generates property test that verifies invariant', () => {
      const claim: Claim = {
        id: 'inv_020',
        type: 'invariant',
        description: 'Balance never negative',
        functions: ['withdraw'],
      };

      const result = generateInvariantTest(claim, []);

      // Should generate a property that can verify the invariant
      expect(result).toContain('fc.property(');
      expect(result).toContain('Invariant:');
    });

    it('includes comment about invariant being tested', () => {
      const claim: Claim = {
        id: 'inv_021',
        type: 'invariant',
        description: 'User count is accurate',
        functions: ['addUser'],
      };

      const result = generateInvariantTest(claim, []);

      // Should include description of invariant
      expect(result).toContain('User count is accurate');
    });
  });

  describe('claim without linked functions generates skipped test', () => {
    it('generates skipped test when no functions are linked', () => {
      const claim: Claim = {
        id: 'inv_030',
        type: 'invariant',
        description: 'Orphan invariant without linked functions',
        functions: [],
      };

      const result = generateInvariantTest(claim, []);

      // Should use it.skip
      expect(result).toContain('it.skip(');
    });

    it('includes TODO comment for skipped test', () => {
      const claim: Claim = {
        id: 'inv_031',
        type: 'invariant',
        description: 'Another orphan invariant',
        functions: [],
      };

      const result = generateInvariantTest(claim, []);

      // Should include TODO comment
      expect(result).toContain('TODO');
      expect(result).toContain('CLAIM_REF');
    });

    it('skipped test explains why it is skipped', () => {
      const claim: Claim = {
        id: 'inv_032',
        type: 'invariant',
        description: 'Unlinked invariant',
        functions: [],
      };

      const result = generateInvariantTest(claim, []);

      // Should explain the skip reason
      expect(result).toContain('no functions are linked');
      expect(result).toContain('Add CLAIM_REF');
    });
  });

  describe('example: balance never negative generates proper test', () => {
    it('generates test that checks balance >= 0 for random operations', () => {
      const claim: Claim = {
        id: 'inv_balance_001',
        type: 'invariant',
        description: 'Account balance is never negative',
        functions: ['getBalance', 'withdraw', 'deposit'],
      };

      const witnesses: WitnessDefinition[] = [
        {
          name: 'NonNegativeDecimal',
          baseType: 'number',
          invariant: 'value >= 0',
        },
      ];

      const result = generateInvariantTest(claim, witnesses);

      // Should generate test for the balance invariant
      expect(result).toContain('[inv_balance_001]');
      expect(result).toContain('Account balance is never negative');

      // Should reference the NonNegativeDecimal arbitrary
      expect(result).toContain('arbitraryNonNegativeDecimal');

      // Should include tests for linked functions
      expect(result).toContain('getBalance');
      expect(result).toContain('withdraw');
      expect(result).toContain('deposit');

      // Should include the example pattern
      expect(result).toContain('balance');
      expect(result).toContain('toBeGreaterThanOrEqual');
    });
  });

  describe('generated test structure', () => {
    it('generates valid vitest file structure', () => {
      const claim: Claim = {
        id: 'inv_struct_001',
        type: 'invariant',
        description: 'Test structure',
        functions: ['testFunc'],
      };

      const result = generateInvariantTest(claim, []);

      // Should have proper file structure
      expect(result).toContain('import');
      expect(result).toContain('describe(');
      expect(result).toContain('it(');
      expect(result).toContain('expect(');
    });

    it('includes file header with claim information', () => {
      const claim: Claim = {
        id: 'inv_struct_002',
        type: 'invariant',
        description: 'Header test',
        functions: ['func1', 'func2'],
      };

      const result = generateInvariantTest(claim, []);

      // Should include JSDoc header
      expect(result).toContain('/**');
      expect(result).toContain('Property-based tests for invariant claim');
      expect(result).toContain('inv_struct_002');
      expect(result).toContain('Linked functions:');
    });

    it('can disable JSDoc generation', () => {
      const claim: Claim = {
        id: 'inv_struct_003',
        type: 'invariant',
        description: 'No JSDoc test',
        functions: ['func'],
      };

      const result = generateInvariantTest(claim, [], { includeJsDoc: false });

      // Should not include file header JSDoc
      expect(result).not.toMatch(/^\/\*\*/);
    });

    it('includes @generated annotation', () => {
      const claim: Claim = {
        id: 'inv_struct_004',
        type: 'invariant',
        description: 'Generated test',
        functions: ['func'],
      };

      const result = generateInvariantTest(claim, []);

      expect(result).toContain('@generated');
    });
  });

  describe('generates tests for each linked function', () => {
    it('generates individual test for each linked function', () => {
      const claim: Claim = {
        id: 'inv_func_001',
        type: 'invariant',
        description: 'Invariant maintained by multiple functions',
        functions: ['funcA', 'funcB', 'funcC'],
      };

      const result = generateInvariantTest(claim, []);

      // Should have a test for each function
      expect(result).toContain("'funcA maintains invariant'");
      expect(result).toContain("'funcB maintains invariant'");
      expect(result).toContain("'funcC maintains invariant'");
    });

    it('individual function tests use fast-check', () => {
      const claim: Claim = {
        id: 'inv_func_002',
        type: 'invariant',
        description: 'Test invariant',
        functions: ['someFunction'],
      };

      const result = generateInvariantTest(claim, []);

      // The individual function test should also use fast-check
      const funcTestMatch = /someFunction maintains invariant[\s\S]*?fc\.assert/.exec(result);
      expect(funcTestMatch).not.toBeNull();
    });
  });

  describe('escapes special characters in test names', () => {
    it('escapes single quotes in description', () => {
      const claim: Claim = {
        id: 'inv_escape_001',
        type: 'invariant',
        description: "User's balance can't be negative",
        functions: ['withdraw'],
      };

      const result = generateInvariantTest(claim, []);

      // Should properly escape the apostrophe
      expect(result).toContain("\\'");
      // Should not have unescaped quotes breaking the string
      expect(result).not.toMatch(/it\('[^']*'[^']*'/);
    });

    it('escapes backticks in description', () => {
      const claim: Claim = {
        id: 'inv_escape_002',
        type: 'invariant',
        description: 'Value is `valid`',
        functions: ['validate'],
      };

      const result = generateInvariantTest(claim, []);

      // Should escape backticks
      expect(result).toContain('\\`');
    });
  });
});

describe('generateInvariantTests', () => {
  it('generates tests for all invariant claims', () => {
    const claims: Claim[] = [
      {
        id: 'inv_001',
        type: 'invariant',
        description: 'First invariant',
        functions: ['func1'],
      },
      {
        id: 'inv_002',
        type: 'invariant',
        description: 'Second invariant',
        functions: ['func2'],
      },
      {
        id: 'beh_001',
        type: 'behavioral',
        description: 'Behavioral claim',
        functions: ['func3'],
      },
    ];

    const result = generateInvariantTests(claims, []);

    // Should only generate for invariant claims
    expect(result.size).toBe(2);
    expect(result.has('inv_001')).toBe(true);
    expect(result.has('inv_002')).toBe(true);
    expect(result.has('beh_001')).toBe(false);
  });

  it('returns empty map when no invariant claims', () => {
    const claims: Claim[] = [
      {
        id: 'beh_001',
        type: 'behavioral',
        description: 'Behavioral claim',
        functions: ['func1'],
      },
      {
        id: 'perf_001',
        type: 'performance',
        description: 'Performance claim',
        functions: ['func2'],
      },
    ];

    const result = generateInvariantTests(claims, []);

    expect(result.size).toBe(0);
  });

  it('passes witnesses to each generated test', () => {
    const claims: Claim[] = [
      {
        id: 'inv_001',
        type: 'invariant',
        description: 'Test with witness',
        functions: ['func'],
      },
    ];

    const witnesses: WitnessDefinition[] = [
      {
        name: 'TestWitness',
        baseType: 'number',
        invariant: 'value > 0',
      },
    ];

    const result = generateInvariantTests(claims, witnesses);

    const testCode = result.get('inv_001');
    expect(testCode).toBeDefined();
    expect(testCode).toContain('arbitraryTestWitness');
  });

  it('passes options to each generated test', () => {
    const claims: Claim[] = [
      {
        id: 'inv_001',
        type: 'invariant',
        description: 'Test with options',
        functions: ['func'],
      },
    ];

    const result = generateInvariantTests(claims, [], { timeout: 45000, numRuns: 200 });

    const testCode = result.get('inv_001');
    expect(testCode).toBeDefined();
    expect(testCode).toContain('timeout: 45000');
    expect(testCode).toContain('numRuns: 200');
  });
});

describe('constants', () => {
  it('DEFAULT_TIMEOUT is 30000ms', () => {
    expect(DEFAULT_TIMEOUT).toBe(30000);
  });

  it('DEFAULT_NUM_RUNS is 100', () => {
    expect(DEFAULT_NUM_RUNS).toBe(100);
  });
});
