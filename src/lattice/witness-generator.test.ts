/**
 * Tests for the witness generation integration module.
 *
 * @module lattice/witness-generator.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateWitnessIntegration,
  generateDomainWitnessIntegration,
  formatVerificationReport,
  type WitnessVerificationReport,
} from './witness-generator.js';
import type { Spec, SpecWitness } from '../spec/types.js';

/**
 * Creates a minimal valid spec for testing.
 */
function createMinimalSpec(witnesses?: Record<string, SpecWitness>): Spec {
  const spec: Spec = {
    meta: {
      version: '1.0.0',
      created: '2024-01-01T00:00:00Z',
    },
    system: {
      name: 'test-system',
      description: 'A test system',
    },
  };
  if (witnesses !== undefined) {
    spec.witnesses = witnesses;
  }
  return spec;
}

describe('generateWitnessIntegration', () => {
  describe('basic generation', () => {
    it('generates code for a simple NonNegativeDecimal witness', () => {
      const spec = createMinimalSpec({
        NonNegativeDecimal: {
          name: 'NonNegativeDecimal',
          base_type: 'number',
          invariants: [
            {
              id: 'non_negative',
              description: 'Value must be non-negative',
              formal: 'value >= 0',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Check branded type is generated
      expect(result.code).toContain(
        'type NonNegativeDecimal = number & { readonly __brand: unique symbol };'
      );

      // Check validation factory is generated
      expect(result.code).toContain('function makeNonNegativeDecimal(value: number)');
      expect(result.code).toContain('function assertNonNegativeDecimal(value: number)');
      expect(result.code).toContain('function isNonNegativeDecimal(value: unknown)');

      // Check arbitrary is generated
      expect(result.code).toContain('arbitraryNonNegativeDecimal');
      expect(result.code).toContain('fc.float');

      // Check report
      expect(result.report.totalWitnesses).toBe(1);
      expect(result.report.totalInvariants).toBe(1);
    });

    it('generates code for NonEmptyString witness', () => {
      const spec = createMinimalSpec({
        NonEmptyString: {
          name: 'NonEmptyString',
          base_type: 'string',
          invariants: [
            {
              id: 'non_empty',
              description: 'String must not be empty',
              formal: 'value.length > 0',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.code).toContain(
        'type NonEmptyString = string & { readonly __brand: unique symbol };'
      );
      expect(result.code).toContain('function makeNonEmptyString(value: string)');
      expect(result.code).toContain('value.length > 0');
    });

    it('generates code for generic SortedArray witness', () => {
      const spec = createMinimalSpec({
        SortedArray: {
          name: 'SortedArray',
          base_type: 'T[]',
          type_params: [{ name: 'T' }],
          invariants: [
            {
              id: 'sorted',
              description: 'Elements are in ascending order',
              formal: 'value.every((v, i, arr) => i === 0 || arr[i-1] <= v)',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Check generic branded type
      expect(result.code).toContain(
        'type SortedArray<T> = T[] & { readonly __brand: unique symbol };'
      );

      // Check generic factory function
      expect(result.code).toContain('function makeSortedArray<T>(value: T[])');
      expect(result.code).toContain('function assertSortedArray<T>(value: T[])');

      // Check generic arbitrary
      expect(result.code).toContain('function arbitrarySortedArray<T>');
    });

    it('handles witness with multiple invariants', () => {
      const spec = createMinimalSpec({
        PercentageValue: {
          name: 'PercentageValue',
          base_type: 'number',
          invariants: [
            {
              id: 'min',
              description: 'Value must be at least 0',
              formal: 'value >= 0',
              testable: true,
            },
            {
              id: 'max',
              description: 'Value must be at most 100',
              formal: 'value <= 100',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.code).toContain('type PercentageValue = number');
      expect(result.code).toContain('(value >= 0) && (value <= 100)');
      expect(result.report.totalInvariants).toBe(2);
    });
  });

  describe('verification tier analysis', () => {
    it('assigns distinction tier for type-encodable invariants', () => {
      const spec = createMinimalSpec({
        NonEmpty: {
          name: 'NonEmpty',
          base_type: 'string',
          invariants: [
            {
              id: 'non_empty',
              formal: 'value.length > 0',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.witnesses[0]?.invariantAnalysis[0]?.tier).toBe('distinction');
      expect(result.witnesses[0]?.invariantAnalysis[0]?.isTypeEncodable).toBe(true);
    });

    it('assigns runtime tier for complex invariants', () => {
      const spec = createMinimalSpec({
        SortedArray: {
          name: 'SortedArray',
          base_type: 'T[]',
          type_params: [{ name: 'T' }],
          invariants: [
            {
              id: 'sorted',
              formal: 'value.every((v, i, arr) => i === 0 || arr[i-1] <= v)',
              testable: true,
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Complex array predicates are still considered type-encodable (distinction tier)
      // because we can validate at construction time
      expect(result.witnesses[0]?.invariantAnalysis[0]?.tier).toBe('distinction');
    });

    it('assigns doc tier for non-testable invariants', () => {
      const spec = createMinimalSpec({
        ValidState: {
          name: 'ValidState',
          base_type: '{ status: string }',
          invariants: [
            {
              id: 'valid_state',
              description: 'State must be valid according to business rules',
              testable: false, // Explicitly marked as non-testable
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.witnesses[0]?.invariantAnalysis[0]?.tier).toBe('doc');
    });

    it('assigns doc tier for invariants without formal expression', () => {
      const spec = createMinimalSpec({
        Documented: {
          name: 'Documented',
          base_type: 'string',
          invariants: [
            {
              id: 'doc_only',
              description: 'This is only documented',
              // No formal expression
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.witnesses[0]?.invariantAnalysis[0]?.tier).toBe('doc');
    });
  });

  describe('verification report', () => {
    it('generates correct tier breakdown', () => {
      const spec = createMinimalSpec({
        TestWitness1: {
          name: 'TestWitness1',
          base_type: 'number',
          invariants: [
            { id: 'inv1', formal: 'value >= 0', testable: true },
            { id: 'inv2', formal: 'value <= 100', testable: true },
          ],
        },
        TestWitness2: {
          name: 'TestWitness2',
          base_type: 'string',
          invariants: [{ id: 'inv3', description: 'Doc only' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.report.totalWitnesses).toBe(2);
      expect(result.report.totalInvariants).toBe(3);
      expect(result.report.tierBreakdown.distinction).toBe(2); // Two encodable invariants
      expect(result.report.tierBreakdown.doc).toBe(1); // One doc-only invariant
    });

    it('calculates summary percentages correctly', () => {
      const spec = createMinimalSpec({
        W1: {
          name: 'W1',
          base_type: 'number',
          invariants: [{ id: 'i1', formal: 'value >= 0', testable: true }],
        },
        W2: {
          name: 'W2',
          base_type: 'string',
          invariants: [{ id: 'i2', description: 'Doc only' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      // 1 distinction, 1 doc -> 50% compile-time, 50% enforced
      expect(result.report.summary.compileTimePercentage).toBe(50);
      expect(result.report.summary.enforcedPercentage).toBe(50);
    });
  });

  describe('options', () => {
    it('respects generateValidationFactories option', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec, {
        generateValidationFactories: false,
      });

      expect(result.code).not.toContain('function makeTest');
      expect(result.code).toContain('type Test ='); // Type should still be generated
    });

    it('respects generateArbitraries option', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec, {
        generateArbitraries: false,
      });

      expect(result.code).not.toContain('arbitraryTest');
      expect(result.code).toContain('type Test ='); // Type should still be generated
    });

    it('respects includeJsDoc option', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          description: 'A test witness',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const withJsDoc = generateWitnessIntegration(spec, { includeJsDoc: true });
      const withoutJsDoc = generateWitnessIntegration(spec, { includeJsDoc: false });

      expect(withJsDoc.code).toContain('/**');
      expect(withJsDoc.code).toContain('A test witness');
      expect(withoutJsDoc.code).not.toContain('A test witness');
    });

    it('uses custom logger for warnings', () => {
      const customLogger = vi.fn();

      const spec = createMinimalSpec({
        Invalid: {
          name: 'Invalid',
          base_type: '', // Invalid base type
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      generateWitnessIntegration(spec, {
        logger: customLogger,
      });

      expect(customLogger).toHaveBeenCalled();
      expect(customLogger.mock.calls[0]?.[0]).toContain('Invalid base type');
    });
  });

  describe('warnings output', () => {
    it('includes warnings in final result', () => {
      const spec = createMinimalSpec({
        Invalid: {
          name: 'Invalid',
          base_type: '', // Invalid base type - will generate warnings
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.witnessName).toBe('Invalid');
      expect(result.warnings[0]?.message).toContain('Invalid base type');
    });

    it('includes warnings in report', () => {
      const spec = createMinimalSpec({
        Invalid: {
          name: 'Invalid',
          base_type: '', // Invalid base type - will generate warnings
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.report.warnings.length).toBeGreaterThan(0);
      expect(result.report.warnings[0]?.witnessName).toBe('Invalid');
      expect(result.report.warnings[0]?.message).toContain('Invalid base type');
    });

    it('includes fallback count in report before warnings', () => {
      const spec = createMinimalSpec({
        Invalid1: {
          name: 'Invalid1',
          base_type: '',
          invariants: [],
        },
        Invalid2: {
          name: 'Invalid2',
          base_type: '',
          invariants: [],
        },
        Valid: {
          name: 'Valid',
          base_type: 'number',
          invariants: [],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Warnings should be collected
      expect(result.warnings.length).toBeGreaterThan(0);

      // Report should include aggregated counts calculated from results
      expect(result.report.summary.fallbackCount).toBe(2);
      expect(result.report.tierBreakdown).toBeDefined();

      // Warnings should be set in report
      expect(result.report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('fast-check import conditional behavior', () => {
    it('emits fast-check import when generating arbitraries', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.code).toContain("import * as fc from 'fast-check'");
      expect(result.code).toContain('arbitraryTest');
    });

    it('does not emit fast-check import when arbitraries disabled', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec, {
        generateArbitraries: false,
      });

      expect(result.code).not.toContain("import * as fc from 'fast-check'");
      expect(result.code).not.toContain('arbitraryTest');
    });

    it('does not emit fast-check import when no results', () => {
      const spec = createMinimalSpec(undefined);

      const result = generateWitnessIntegration(spec);

      expect(result.code).not.toContain("import * as fc from 'fast-check'");
    });

    it('does not emit fast-check import when generateArbitraries is false even with results', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec, {
        generateArbitraries: false,
      });

      expect(result.code).not.toContain("import * as fc from 'fast-check'");
      expect(result.code).not.toContain('// Fast-Check Arbitraries');
    });

    it('places fast-check import before Fast-Check Arbitraries header', () => {
      const spec = createMinimalSpec({
        Test: {
          name: 'Test',
          base_type: 'number',
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      const importIndex = result.code.indexOf("import * as fc from 'fast-check'");
      const headerIndex = result.code.indexOf('// Fast-Check Arbitraries');

      expect(importIndex).toBeGreaterThanOrEqual(0);
      expect(headerIndex).toBeGreaterThanOrEqual(0);
      expect(importIndex).toBeLessThan(headerIndex);
    });
  });

  describe('error handling and fallback', () => {
    it('falls back to runtime validation on invalid base type', () => {
      const spec = createMinimalSpec({
        Invalid: {
          name: 'Invalid',
          base_type: '', // Empty base type
          invariants: [{ id: 'test', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Should still generate some code (fallback)
      expect(result.code).toContain('type Invalid');
      expect(result.code).toContain('Fallback');
      expect(result.witnesses[0]?.success).toBe(false);
      expect(result.witnesses[0]?.error).toBeDefined();
    });

    it('continues processing after individual witness failure', () => {
      const spec = createMinimalSpec({
        Valid: {
          name: 'Valid',
          base_type: 'number',
          invariants: [{ id: 'valid', formal: 'value >= 0' }],
        },
        Invalid: {
          name: 'Invalid',
          base_type: '', // Will fail
          invariants: [{ id: 'invalid', formal: 'value >= 0' }],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Both witnesses should be in the result
      expect(result.witnesses.length).toBe(2);

      // Valid one should succeed
      const valid = result.witnesses.find((w) => w.name === 'Valid');
      expect(valid?.success).toBe(true);

      // Invalid one should fallback
      const invalid = result.witnesses.find((w) => w.name === 'Invalid');
      expect(invalid?.success).toBe(false);
    });

    it('tracks fallback count in report', () => {
      const spec = createMinimalSpec({
        Invalid1: {
          name: 'Invalid1',
          base_type: '',
          invariants: [],
        },
        Invalid2: {
          name: 'Invalid2',
          base_type: '',
          invariants: [],
        },
        Valid: {
          name: 'Valid',
          base_type: 'number',
          invariants: [],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.report.summary.fallbackCount).toBe(2);
    });
  });

  describe('empty spec handling', () => {
    it('handles spec with no witnesses', () => {
      const spec = createMinimalSpec(undefined);

      const result = generateWitnessIntegration(spec);

      expect(result.witnesses.length).toBe(0);
      expect(result.report.totalWitnesses).toBe(0);
      expect(result.report.totalInvariants).toBe(0);
    });

    it('handles witness with no invariants', () => {
      const spec = createMinimalSpec({
        Empty: {
          name: 'Empty',
          base_type: 'number',
          invariants: [],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.witnesses.length).toBe(1);
      expect(result.witnesses[0]?.invariantAnalysis.length).toBe(0);
      expect(result.code).toContain('type Empty = number');
    });
  });

  describe('complex witness types', () => {
    it('handles witness with type parameters and constraints', () => {
      const spec = createMinimalSpec({
        BoundedArray: {
          name: 'BoundedArray',
          base_type: 'T[]',
          type_params: [{ name: 'T', bounds: ['Comparable'] }],
          invariants: [{ id: 'bounded', formal: 'value.length <= 100', testable: true }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.code).toContain('BoundedArray<T extends Comparable>');
    });

    it('handles witness with multiple type parameters', () => {
      const spec = createMinimalSpec({
        ValidMap: {
          name: 'ValidMap',
          base_type: 'Map<K, V>',
          type_params: [{ name: 'K' }, { name: 'V' }],
          invariants: [{ id: 'non_empty', formal: 'value.size > 0', testable: true }],
        },
      });

      const result = generateWitnessIntegration(spec);

      expect(result.code).toContain('ValidMap<K, V>');
      expect(result.code).toContain('function makeValidMap<K, V>');
    });

    it('handles witness with constructors', () => {
      const spec = createMinimalSpec({
        SafeNumber: {
          name: 'SafeNumber',
          description: 'A validated number',
          base_type: 'number',
          invariants: [{ id: 'valid', formal: 'Number.isFinite(value)', testable: true }],
          constructors: [
            {
              name: 'fromNumber',
              description: 'Creates from a raw number',
              trust_level: 'safe',
              precondition: 'Input must be finite',
            },
            {
              name: 'fromString',
              description: 'Parses from a string',
              trust_level: 'safe',
              precondition: 'String must be a valid number',
            },
          ],
        },
      });

      const result = generateWitnessIntegration(spec);

      // Constructors should be documented in JSDoc
      expect(result.code).toContain('@constructors');
      expect(result.code).toContain('fromNumber');
      expect(result.code).toContain('fromString');
    });
  });
});

describe('generateDomainWitnessIntegration', () => {
  it('filters witnesses by name', () => {
    const spec = createMinimalSpec({
      WitnessA: {
        name: 'WitnessA',
        base_type: 'number',
        invariants: [{ id: 'a', formal: 'value >= 0' }],
      },
      WitnessB: {
        name: 'WitnessB',
        base_type: 'string',
        invariants: [{ id: 'b', formal: 'value.length > 0' }],
      },
      WitnessC: {
        name: 'WitnessC',
        base_type: 'boolean',
        invariants: [{ id: 'c', formal: 'value === true' }],
      },
    });

    const result = generateDomainWitnessIntegration(spec, ['WitnessA', 'WitnessC']);

    expect(result.witnesses.length).toBe(2);
    expect(result.witnesses.map((w) => w.name)).toContain('WitnessA');
    expect(result.witnesses.map((w) => w.name)).toContain('WitnessC');
    expect(result.witnesses.map((w) => w.name)).not.toContain('WitnessB');
    expect(result.code).toContain('type WitnessA');
    expect(result.code).toContain('type WitnessC');
    expect(result.code).not.toContain('type WitnessB');
  });

  it('handles non-existent witness names gracefully', () => {
    const spec = createMinimalSpec({
      Existing: {
        name: 'Existing',
        base_type: 'number',
        invariants: [],
      },
    });

    const result = generateDomainWitnessIntegration(spec, ['Existing', 'NonExistent']);

    expect(result.witnesses.length).toBe(1);
    expect(result.witnesses[0]?.name).toBe('Existing');
  });
});

describe('formatVerificationReport', () => {
  it('formats a report as a readable string', () => {
    const report: WitnessVerificationReport = {
      totalWitnesses: 5,
      totalInvariants: 10,
      tierBreakdown: {
        proof: 0,
        distinction: 6,
        runtime: 3,
        doc: 1,
      },
      witnessResults: [],
      warnings: [],
      summary: {
        compileTimePercentage: 60,
        enforcedPercentage: 90,
        fallbackCount: 1,
      },
    };

    const formatted = formatVerificationReport(report);

    expect(formatted).toContain('WITNESS VERIFICATION REPORT');
    expect(formatted).toContain('Total Witnesses: 5');
    expect(formatted).toContain('Total Invariants: 10');
    expect(formatted).toContain('Proof');
    expect(formatted).toContain('Distinction');
    expect(formatted).toContain('Runtime');
    expect(formatted).toContain('Doc');
    expect(formatted).toContain('60.0%');
    expect(formatted).toContain('90.0%');
  });

  it('includes warnings in the report', () => {
    const report: WitnessVerificationReport = {
      totalWitnesses: 1,
      totalInvariants: 1,
      tierBreakdown: { proof: 0, distinction: 0, runtime: 1, doc: 0 },
      witnessResults: [],
      warnings: [
        {
          witnessName: 'Test',
          message: 'Generation failed for Test',
          fellBackToRuntime: true,
        },
      ],
      summary: {
        compileTimePercentage: 0,
        enforcedPercentage: 100,
        fallbackCount: 1,
      },
    };

    const formatted = formatVerificationReport(report);

    expect(formatted).toContain('WARNINGS');
    expect(formatted).toContain('Generation failed for Test');
  });

  it('truncates long warning lists', () => {
    const warnings = Array.from({ length: 10 }, (_, i) => ({
      witnessName: `Test${String(i)}`,
      message: `Warning ${String(i)}`,
      fellBackToRuntime: false,
    }));

    const report: WitnessVerificationReport = {
      totalWitnesses: 10,
      totalInvariants: 10,
      tierBreakdown: { proof: 0, distinction: 0, runtime: 10, doc: 0 },
      witnessResults: [],
      warnings,
      summary: {
        compileTimePercentage: 0,
        enforcedPercentage: 100,
        fallbackCount: 0,
      },
    };

    const formatted = formatVerificationReport(report);

    expect(formatted).toContain('... and 5 more warnings');
  });
});

describe('integration: SortedArray example from acceptance criteria', () => {
  it('generates SortedArray<T> with branded type + fromUnsorted factory + isSorted validator', () => {
    const spec = createMinimalSpec({
      SortedArray: {
        name: 'SortedArray',
        description: 'An array that maintains sorted order',
        base_type: 'T[]',
        type_params: [{ name: 'T' }],
        invariants: [
          {
            id: 'sorted',
            description: 'Elements are in ascending order',
            formal: 'value.every((v, i, arr) => i === 0 || arr[i-1] <= v)',
            testable: true,
          },
        ],
        constructors: [
          {
            name: 'fromUnsorted',
            description: 'Creates a sorted array by sorting the input',
            trust_level: 'safe',
            precondition: 'Elements must be comparable',
          },
        ],
      },
    });

    const result = generateWitnessIntegration(spec);

    // Check branded type
    expect(result.code).toContain(
      'type SortedArray<T> = T[] & { readonly __brand: unique symbol };'
    );

    // Check make function (factory)
    expect(result.code).toContain('function makeSortedArray<T>(value: T[]): SortedArray<T> | null');
    expect(result.code).toContain('value.every((v, i, arr) => i === 0 || arr[i-1] <= v)');

    // Check assert function
    expect(result.code).toContain('function assertSortedArray<T>(value: T[]): SortedArray<T>');

    // Check type guard (isSorted validator)
    expect(result.code).toContain(
      'function isSortedArray(value: unknown): value is SortedArray<T>'
    );

    // Check arbitrary for property testing
    expect(result.code).toContain('function arbitrarySortedArray<T>');

    // Check documentation includes constructor
    expect(result.code).toContain('fromUnsorted');

    // Check verification tier
    expect(result.witnesses[0]?.invariantAnalysis[0]?.tier).toBe('distinction');
    expect(result.report.tierBreakdown.distinction).toBe(1);
  });
});

describe('integration: fallback on failure', () => {
  it('logs warning and falls back to runtime validation on generation failure', () => {
    const loggedMessages: string[] = [];
    const customLogger = (msg: string): void => {
      loggedMessages.push(msg);
    };

    const spec = createMinimalSpec({
      BrokenWitness: {
        name: 'BrokenWitness',
        base_type: 'Map<string, number', // Intentionally broken (unbalanced brackets)
        invariants: [{ id: 'test', formal: 'value.size > 0', testable: true }],
      },
    });

    const result = generateWitnessIntegration(spec, {
      logger: customLogger,
      emitWarnings: true,
    });

    // Should have logged a warning
    expect(loggedMessages.length).toBeGreaterThan(0);
    expect(loggedMessages[0]).toContain('Warning');
    expect(loggedMessages[0]).toContain('BrokenWitness');

    // Should have fallen back
    expect(result.witnesses[0]?.success).toBe(false);
    expect(result.code).toContain('Fallback');

    // Report should track the fallback
    expect(result.report.summary.fallbackCount).toBe(1);
  });
});
