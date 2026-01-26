/**
 * Tests for the benchmark test generator.
 *
 * @module adapters/typescript/benchmark-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generateBenchmarkTest, generateBenchmarkTests } from './benchmark-test-generator.js';
import type { Claim } from './claims.js';

describe('benchmark-test-generator', () => {
  it('generates a vitest file with performance.now() setup', () => {
    const claim: Claim = {
      id: 'perf_001',
      type: 'performance',
      description: 'Lookup is O(1)',
      functions: ['lookup'],
    };

    const result = generateBenchmarkTest(claim);

    // Check for performance import
    expect(result).toContain("import { performance } from 'node:perf_hooks';");

    // Check for vitest imports
    expect(result).toContain("import { describe, it, expect } from 'vitest';");

    // Check for input sizes
    expect(result).toContain('const inputSizes = [10, 100, 1000, 10000];');

    // Check for timing loop
    expect(result).toContain('performance.now()');
    expect(result).toContain('for (let i = 0; i < numSamples; i++)');
  });

  it('includes scaling check logic for O(1) claims', () => {
    const claim: Claim = {
      id: 'perf_002',
      type: 'performance',
      description: 'Operation is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain("if (desc.includes('o(1)'))");
    expect(result).toContain('O(1) Check: Time should be constant');
  });

  it('includes scaling check logic for O(n) claims', () => {
    const claim: Claim = {
      id: 'perf_003',
      type: 'performance',
      description: 'Operation is O(n)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain("if (desc.includes('o(n)'))");
    expect(result).toContain('O(n) Check: Time should scale linearly');
  });

  it('respects options for input sizes and variance', () => {
    const claim: Claim = {
      id: 'perf_004',
      type: 'performance',
      description: 'Test performance',
      functions: [],
    };

    const result = generateBenchmarkTest(claim, {
      inputSizes: [100, 200, 300],
      allowedVariance: 0.1,
    });

    expect(result).toContain('const inputSizes = [100, 200, 300];');
    expect(result).toContain('const allowedVariance = 0.1;');
  });

  it('generates multiple tests for performance claims only', () => {
    const claims: Claim[] = [
      { id: 'perf_1', type: 'performance', description: 'P1', functions: [] },
      { id: 'inv_1', type: 'invariant', description: 'I1', functions: [] },
      { id: 'perf_2', type: 'performance', description: 'P2', functions: [] },
    ];

    const results = generateBenchmarkTests(claims);

    expect(results.size).toBe(2);
    expect(results.has('perf_1')).toBe(true);
    expect(results.has('perf_2')).toBe(true);
    expect(results.has('inv_1')).toBe(false);
  });
});
