/**
 * Tests for the concurrent test generator.
 *
 * @module adapters/typescript/concurrent-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generateConcurrentTest, generateConcurrentTests } from './concurrent-test-generator.js';
import type { Claim } from './claims.js';

describe('concurrent-test-generator', () => {
  it('generates a vitest file with worker_threads setup', () => {
    const claim: Claim = {
      id: 'conc_001',
      type: 'concurrent',
      description: 'Concurrent increments preserve balance',
      functions: ['incrementBalance'],
    };

    const result = generateConcurrentTest(claim);

    // Check for worker_threads import
    expect(result).toContain(
      "import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';"
    );

    // Check for vitest imports
    expect(result).toContain("import { describe, it, expect } from 'vitest';");

    // Check for isMainThread branching
    expect(result).toContain('if (isMainThread) {');
    expect(result).toContain('} else {');

    // Check for worker logic
    expect(result).toContain('// Worker Thread Logic');
    expect(result).toContain('new Worker(fileURLToPath(import.meta.url)');
  });

  it('includes claim description and ID in the generated test', () => {
    const claim: Claim = {
      id: 'conc_002',
      type: 'concurrent',
      description: 'Race-free access to shared resource',
      functions: ['accessResource'],
    };

    const result = generateConcurrentTest(claim);

    expect(result).toContain('Concurrent: Race-free access to shared resource');
    expect(result).toContain('[conc_002]');
  });

  it('respects options for workers and iterations', () => {
    const claim: Claim = {
      id: 'conc_003',
      type: 'concurrent',
      description: 'Test concurrency',
      functions: [],
    };

    const result = generateConcurrentTest(claim, {
      numWorkers: 8,
      iterationsPerWorker: 5000,
    });

    expect(result).toContain('const numWorkers = 8;');
    expect(result).toContain('const iterations = 5000;');
  });

  it('generates multiple tests for concurrent claims only', () => {
    const claims: Claim[] = [
      { id: 'conc_1', type: 'concurrent', description: 'C1', functions: [] },
      { id: 'inv_1', type: 'invariant', description: 'I1', functions: [] },
      { id: 'conc_2', type: 'concurrent', description: 'C2', functions: [] },
    ];

    const results = generateConcurrentTests(claims);

    expect(results.size).toBe(2);
    expect(results.has('conc_1')).toBe(true);
    expect(results.has('conc_2')).toBe(true);
    expect(results.has('inv_1')).toBe(false);
  });
});
