/**
 * Tests for the concurrent test generator.
 *
 * @module adapters/typescript/concurrent-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generateConcurrentTest, generateConcurrentTests } from './concurrent-test-generator.js';
import type { Claim } from './claims.js';

describe('concurrent-test-generator', () => {
  describe('Promise.all strategy (default)', () => {
    it('generates a vitest file with Promise.all setup by default', () => {
      const claim: Claim = {
        id: 'conc_001',
        type: 'concurrent',
        description: 'Concurrent increments preserve counter',
        functions: ['incrementCounter'],
      };

      const result = generateConcurrentTest(claim);

      // Check for vitest imports
      expect(result).toContain("import { describe, it, expect } from 'vitest';");

      // Check for Promise.all usage
      expect(result).toContain('Promise.all(');

      // Check for async concurrent operation
      expect(result).toContain('concurrentOperation');
      expect(result).toContain('const operations = Array.from({ length: concurrentOps }');

      // Should NOT have worker_threads by default
      expect(result).not.toContain('isMainThread');
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

      expect(result).toContain('const concurrentOps = 8;');
      expect(result).toContain('const iterationsPerOp = 5000;');
    });

    it('generates race condition detection test', () => {
      const claim: Claim = {
        id: 'conc_004',
        type: 'concurrent',
        description: 'Verify thread safety',
        functions: [],
      };

      const result = generateConcurrentTest(claim);

      // Should include race condition detection test
      expect(result).toContain('should detect race conditions when synchronization is missing');
      expect(result).toContain('unsafeCounter');
      expect(result).toContain('Promise.resolve()'); // Yield point for race conditions
    });
  });

  describe('worker_threads strategy', () => {
    it('generates a vitest file with worker_threads setup when strategy is worker', () => {
      const claim: Claim = {
        id: 'conc_010',
        type: 'concurrent',
        description: 'Concurrent increments preserve counter',
        functions: ['incrementCounter'],
      };

      const result = generateConcurrentTest(claim, { strategy: 'worker' });

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

    it('uses worker counts and iterations in worker strategy', () => {
      const claim: Claim = {
        id: 'conc_011',
        type: 'concurrent',
        description: 'Test parallelism',
        functions: [],
      };

      const result = generateConcurrentTest(claim, {
        numWorkers: 8,
        iterationsPerWorker: 5000,
        strategy: 'worker',
      });

      expect(result).toContain('const numWorkers = 8;');
      expect(result).toContain('const iterations = 5000;');
    });
  });

  describe('balance updates are atomic example (AC-5)', () => {
    it('generates test spawning multiple async transfers for atomic balance claim', () => {
      const claim: Claim = {
        id: 'conc_balance_001',
        type: 'concurrent',
        description: 'balance updates are atomic',
        functions: ['updateBalance'],
      };

      const result = generateConcurrentTest(claim);

      // Should detect balance atomicity claim
      expect(result).toContain('initialBalance');
      expect(result).toContain('transferAmount');
      expect(result).toContain('performTransfer');

      // Should spawn multiple async transfers
      expect(result).toContain('Array.from({ length: concurrentOps }, () => performTransfer())');
      expect(result).toContain('Promise.all(operations)');

      // Should verify atomicity
      expect(result).toContain('expectedBalance');
      expect(result).toContain('concurrentOps * iterationsPerOp * transferAmount');
    });

    it('handles balance atomicity with worker_threads strategy', () => {
      const claim: Claim = {
        id: 'conc_balance_002',
        type: 'concurrent',
        description: 'balance updates are atomic under parallel load',
        functions: ['transfer'],
      };

      const result = generateConcurrentTest(claim, { strategy: 'worker' });

      // Should use SharedArrayBuffer for true parallelism
      expect(result).toContain('SharedArrayBuffer');
      expect(result).toContain('Int32Array');
      expect(result).toContain('Atomics.store');
      expect(result).toContain('Atomics.add');
      expect(result).toContain('Atomics.load');

      // Should verify final balance
      expect(result).toContain('finalBalance');
      expect(result).toContain('expectedBalance');
    });

    it('detects various atomic/balance keywords', () => {
      const claims: Claim[] = [
        {
          id: 'atomic_1',
          type: 'concurrent',
          description: 'transaction processing is atomic',
          functions: [],
        },
        {
          id: 'atomic_2',
          type: 'concurrent',
          description: 'fund transfers maintain atomicity',
          functions: [],
        },
        {
          id: 'atomic_3',
          type: 'concurrent',
          description: 'credit operations are atomically applied',
          functions: [],
        },
      ];

      for (const claim of claims) {
        const result = generateConcurrentTest(claim);
        expect(result).toContain('initialBalance');
        expect(result).toContain('performTransfer');
      }
    });
  });

  describe('generateConcurrentTests', () => {
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

    it('applies options to all generated tests', () => {
      const claims: Claim[] = [
        { id: 'conc_1', type: 'concurrent', description: 'C1', functions: [] },
        { id: 'conc_2', type: 'concurrent', description: 'C2', functions: [] },
      ];

      const results = generateConcurrentTests(claims, { numWorkers: 16 });

      for (const [, testCode] of results) {
        expect(testCode).toContain('const concurrentOps = 16;');
      }
    });
  });

  describe('test structure verification', () => {
    it('generates valid vitest test structure', () => {
      const claim: Claim = {
        id: 'struct_001',
        type: 'concurrent',
        description: 'Test structure',
        functions: ['testFunc'],
      };

      const result = generateConcurrentTest(claim);

      // Check for proper describe/it structure
      expect(result).toContain("describe('Concurrent:");
      expect(result).toContain("it('should preserve invariants");

      // Check for Arrange-Act-Assert pattern
      expect(result).toContain('// Arrange');
      expect(result).toContain('// Act');
      expect(result).toContain('// Assert');
    });

    it('includes function name reference in generated test', () => {
      const claim: Claim = {
        id: 'func_001',
        type: 'concurrent',
        description: 'Test function reference',
        functions: ['myAsyncOperation'],
      };

      const result = generateConcurrentTest(claim);

      expect(result).toContain('myAsyncOperation');
    });

    it('includes timeout configuration', () => {
      const claim: Claim = {
        id: 'timeout_001',
        type: 'concurrent',
        description: 'Test timeout',
        functions: [],
      };

      const result = generateConcurrentTest(claim, { timeout: 30000 });

      expect(result).toContain('30000');
    });

    it('includes strategy info in JSDoc header', () => {
      const claim: Claim = {
        id: 'header_001',
        type: 'concurrent',
        description: 'Test header',
        functions: [],
      };

      const promiseResult = generateConcurrentTest(claim, { strategy: 'promise' });
      expect(promiseResult).toContain('Promise.all (async race conditions)');

      const workerResult = generateConcurrentTest(claim, { strategy: 'worker' });
      expect(workerResult).toContain('worker_threads (true parallelism)');
    });
  });
});
