/**
 * Tests for the benchmark test generator.
 *
 * @module adapters/typescript/benchmark-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateBenchmarkTest,
  generateBenchmarkTests,
  extractComplexity,
} from './benchmark-test-generator.js';
import type { Claim } from './claims.js';

describe('extractComplexity', () => {
  it('extracts O(1) complexity', () => {
    expect(extractComplexity('lookup is O(1)')).toBe('O(1)');
    expect(extractComplexity('Operation runs in O(1) time')).toBe('O(1)');
  });

  it('extracts O(n) complexity', () => {
    expect(extractComplexity('scan is O(n)')).toBe('O(n)');
    expect(extractComplexity('Linear O(n) search')).toBe('O(n)');
  });

  it('extracts O(log n) complexity', () => {
    expect(extractComplexity('binary search is O(log n)')).toBe('O(log n)');
    expect(extractComplexity('Operation is O(log n) complexity')).toBe('O(log n)');
  });

  it('extracts O(n log n) complexity', () => {
    expect(extractComplexity('sort is O(n log n)')).toBe('O(n log n)');
    expect(extractComplexity('Merge sort runs in O(n log n) time')).toBe('O(n log n)');
    expect(extractComplexity('complexity is O(n * log n)')).toBe('O(n log n)');
  });

  it('extracts O(n^2) complexity', () => {
    expect(extractComplexity('nested loop is O(n^2)')).toBe('O(n^2)');
    expect(extractComplexity('Quadratic O(n^2) algorithm')).toBe('O(n^2)');
    expect(extractComplexity('bubble sort is O(n * n)')).toBe('O(n^2)');
    expect(extractComplexity('runs in O(n2) time')).toBe('O(n^2)');
  });

  it('returns null for unknown complexity', () => {
    expect(extractComplexity('fast operation')).toBeNull();
    expect(extractComplexity('efficient lookup')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(extractComplexity('Lookup is o(1)')).toBe('O(1)');
    expect(extractComplexity('SORT IS O(N LOG N)')).toBe('O(n log n)');
  });
});

describe('generateBenchmarkTest', () => {
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

  it('generates O(1) verification with expect statements', () => {
    const claim: Claim = {
      id: 'perf_002',
      type: 'performance',
      description: 'Operation is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    // Check for O(1) verification
    expect(result).toContain('O(1) Check: Time should be constant');
    expect(result).toContain('const times = results.map(r => r.avgTime);');
    expect(result).toContain('const mean = times.reduce((a, b) => a + b, 0) / times.length;');

    // The critical check: expect statements are NOT commented out
    expect(result).toContain('expect(variance,');
    expect(result).toContain('O(1) violation');
    expect(result).toContain('.toBeLessThan(allowedVariance)');
  });

  it('generates O(n) verification with expect statements', () => {
    const claim: Claim = {
      id: 'perf_003',
      type: 'performance',
      description: 'Operation is O(n)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    // Check for O(n) verification
    expect(result).toContain('O(n) Check: Time should scale linearly');
    expect(result).toContain('const linearRatios = results.map(r => r.avgTime / r.size);');
    expect(result).toContain('O(n) violation');
    expect(result).toContain('.toBeLessThan(allowedVariance)');
  });

  it('generates O(log n) verification', () => {
    const claim: Claim = {
      id: 'perf_004',
      type: 'performance',
      description: 'Binary search is O(log n)',
      functions: ['binarySearch'],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('O(log n) Check: Time should scale logarithmically');
    expect(result).toContain('const logRatios = results.map(r => r.avgTime / Math.log2(r.size));');
    expect(result).toContain('O(log n) violation');
    expect(result).toContain('.toBeLessThan(allowedVariance)');
  });

  it('generates O(n log n) verification', () => {
    const claim: Claim = {
      id: 'perf_005',
      type: 'performance',
      description: 'Sort is O(n log n)',
      functions: ['mergeSort'],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('O(n log n) Check: Time should scale as n * log(n)');
    expect(result).toContain('r.avgTime / (r.size * Math.log2(r.size))');
    expect(result).toContain('O(n log n) violation');
  });

  it('generates O(n^2) verification', () => {
    const claim: Claim = {
      id: 'perf_006',
      type: 'performance',
      description: 'Bubble sort is O(n^2)',
      functions: ['bubbleSort'],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('O(n^2) Check: Time should scale quadratically');
    expect(result).toContain('const quadRatios = results.map(r => r.avgTime / (r.size * r.size));');
    expect(result).toContain('O(n^2) violation');
  });

  it('generates TODO when no complexity detected', () => {
    const claim: Claim = {
      id: 'perf_007',
      type: 'performance',
      description: 'Fast operation',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('No complexity class detected');
    expect(result).toContain('TODO: Add appropriate complexity verification');
    expect(result).toContain('console.log("Benchmark results:", results);');
  });

  it('includes function name in comments when provided', () => {
    const claim: Claim = {
      id: 'perf_008',
      type: 'performance',
      description: 'lookup is O(1)',
      functions: ['lookup', 'get'],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('// TODO: Import the function(s) under test');
    expect(result).toContain("// import { lookup } from './path-to-module.js';");
    expect(result).toContain("// import { get } from './path-to-module.js';");
    expect(result).toContain('// lookup(input);');
  });

  it('includes warm-up loop to avoid JIT skew', () => {
    const claim: Claim = {
      id: 'perf_009',
      type: 'performance',
      description: 'Operation is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('Warm up to avoid JIT compilation');
    expect(result).toContain('for (let i = 0; i < 10; i++)');
  });

  it('respects options for input sizes and variance', () => {
    const claim: Claim = {
      id: 'perf_010',
      type: 'performance',
      description: 'Test performance O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim, {
      inputSizes: [100, 200, 300],
      allowedVariance: 0.1,
    });

    expect(result).toContain('const inputSizes = [100, 200, 300];');
    expect(result).toContain('const allowedVariance = 0.1;');
  });

  it('respects timeout option', () => {
    const claim: Claim = {
      id: 'perf_011',
      type: 'performance',
      description: 'Operation is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim, {
      timeout: 120000,
    });

    expect(result).toContain('}, 120000);');
  });

  it('includes JSDoc with complexity class', () => {
    const claim: Claim = {
      id: 'perf_012',
      type: 'performance',
      description: 'Lookup is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim);

    expect(result).toContain('* Expected complexity: O(1)');
    expect(result).toContain('@generated');
  });

  it('omits JSDoc when includeJsDoc is false', () => {
    const claim: Claim = {
      id: 'perf_013',
      type: 'performance',
      description: 'Lookup is O(1)',
      functions: [],
    };

    const result = generateBenchmarkTest(claim, { includeJsDoc: false });

    expect(result).not.toContain('/**');
    expect(result).not.toContain('@generated');
  });
});

describe('generateBenchmarkTests', () => {
  it('generates multiple tests for performance claims only', () => {
    const claims: Claim[] = [
      { id: 'perf_1', type: 'performance', description: 'O(1) op', functions: [] },
      { id: 'inv_1', type: 'invariant', description: 'I1', functions: [] },
      { id: 'perf_2', type: 'performance', description: 'O(n) op', functions: [] },
    ];

    const results = generateBenchmarkTests(claims);

    expect(results.size).toBe(2);
    expect(results.has('perf_1')).toBe(true);
    expect(results.has('perf_2')).toBe(true);
    expect(results.has('inv_1')).toBe(false);
  });

  it('returns empty map when no performance claims', () => {
    const claims: Claim[] = [
      { id: 'inv_1', type: 'invariant', description: 'I1', functions: [] },
      { id: 'beh_1', type: 'behavioral', description: 'B1', functions: [] },
    ];

    const results = generateBenchmarkTests(claims);

    expect(results.size).toBe(0);
  });

  it('passes options to each generated test', () => {
    const claims: Claim[] = [
      { id: 'perf_1', type: 'performance', description: 'O(1) lookup', functions: [] },
    ];

    const results = generateBenchmarkTests(claims, {
      inputSizes: [5, 10, 15],
      allowedVariance: 0.5,
    });

    const test = results.get('perf_1');
    expect(test).toBeDefined();
    expect(test).toContain('const inputSizes = [5, 10, 15];');
    expect(test).toContain('const allowedVariance = 0.5;');
  });
});
