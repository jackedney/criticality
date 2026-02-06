/**
 * Tests for cluster executor.
 *
 * Validates test execution for clusters, result collection,
 * and infrastructure failure handling.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { executeClusters, type ClusterExecutionSummary } from './cluster-executor.js';
import type { ClusterDefinition } from './types.js';
import type { runTests as runTestsType } from '../adapters/typescript/testrunner.js';

vi.mock('../adapters/typescript/testrunner.js');

const { runTests } = (await import('../adapters/typescript/testrunner.js')) as unknown as {
  runTests: Mock<typeof runTestsType>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

describe('cluster-executor', () => {
  const mockClusters: ClusterDefinition[] = [
    {
      id: 'accounting',
      name: 'accounting',
      modules: ['account', 'transaction'],
      claimIds: ['balance_001', 'balance_002'],
      isCrossModule: false,
    },
    {
      id: 'auth',
      name: 'auth',
      modules: ['auth', 'session'],
      claimIds: ['auth_001', 'auth_002'],
      isCrossModule: true,
    },
  ];

  describe('executeClusters basic functionality', () => {
    it('should execute tests for all clusters', async () => {
      vi.mocked(runTests).mockResolvedValue({
        success: true,
        totalTests: 2,
        passedTests: 2,
        failedTests: 0,
        skippedTests: 0,
        tests: [
          {
            name: 'balance_001',
            fullName: 'accounting balance_001',
            file: 'src/accounting/balance_001.test.ts',
            status: 'passed',
            durationMs: 100,
          },
          {
            name: 'balance_002',
            fullName: 'accounting balance_002',
            file: 'src/accounting/balance_002.test.ts',
            status: 'passed',
            durationMs: 150,
          },
        ],
      });

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
      });

      expect(result.success).toBe(true);
      expect(result.totalClaims).toBe(4);
      expect(result.passedClaims).toBe(2);
      expect(result.failedClaims).toBe(0);
      expect(result.skippedClaims).toBe(2);
      expect(result.clusters).toHaveLength(2);

      const cluster = result.clusters[0];
      if (cluster) {
        expect(cluster.clusterId).toBe('accounting');
        expect(cluster.success).toBe(true);
        expect(cluster.claimResults).toHaveLength(2);

        const balance001 = cluster.claimResults[0];
        const balance002 = cluster.claimResults[1];

        if (balance001 && balance002) {
          expect(balance001.claimId).toBe('balance_001');
          expect(balance001.status).toBe('passed');
          expect(balance002.claimId).toBe('balance_002');
          expect(balance002.status).toBe('passed');
        }
      }

      expect(runTests).toHaveBeenCalledTimes(2);
    });

    it('should stop execution on cluster failure when continueOnFailure is false', async () => {
      vi.mocked(runTests)
        .mockResolvedValueOnce({
          success: false,
          totalTests: 1,
          passedTests: 0,
          failedTests: 1,
          skippedTests: 0,
          tests: [
            {
              name: 'balance_001',
              fullName: 'accounting balance_001',
              file: 'src/accounting/balance_001.test.ts',
              status: 'failed',
              durationMs: 100,
              error: {
                message: 'AssertionError: expected true to be false',
                stack: 'Error: ...',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          success: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          tests: [],
        });

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
        continueOnFailure: false,
      });

      expect(result.success).toBe(false);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0]?.clusterId).toBe('accounting');

      expect(runTests).toHaveBeenCalledTimes(1);
    });

    it('should continue execution on cluster failure when continueOnFailure is true', async () => {
      vi.mocked(runTests)
        .mockResolvedValueOnce({
          success: false,
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
          skippedTests: 0,
          tests: [
            {
              name: 'balance_001',
              fullName: 'accounting balance_001',
              file: 'src/accounting/balance_001.test.ts',
              status: 'failed',
              durationMs: 100,
              error: {
                message: 'AssertionError: expected true to be false',
                stack: 'Error: ...',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          totalTests: 2,
          passedTests: 2,
          failedTests: 0,
          skippedTests: 0,
          tests: [
            {
              name: 'auth_001',
              fullName: 'auth auth_001',
              file: 'src/auth/auth_001.test.ts',
              status: 'passed',
              durationMs: 100,
            },
            {
              name: 'auth_002',
              fullName: 'auth auth_002',
              file: 'src/auth/auth_002.test.ts',
              status: 'passed',
              durationMs: 150,
            },
          ],
        });

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
        continueOnFailure: true,
      });

      expect(result.success).toBe(false);
      expect(result.clusters).toHaveLength(2);
      const cluster0 = result.clusters[0];
      const cluster1 = result.clusters[1];
      if (cluster0 && cluster1) {
        expect(cluster0.success).toBe(false);
        expect(cluster1.success).toBe(true);
      }

      expect(runTests).toHaveBeenCalledTimes(2);
    });

    it('should handle test runner not found error', async () => {
      const error = Object.assign(new Error('vitest not found'), { code: 'ENOENT' });
      vi.mocked(runTests).mockRejectedValue(error);

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
      });

      expect(result.success).toBe(false);
      // Only 1 cluster because execution stops on error when continueOnFailure is false (default)
      expect(result.clusters).toHaveLength(1);
      // First cluster has 2 claims that become 'error' status
      expect(result.errorClaims).toBe(2);
      expect(result.clusters[0]?.claimResults[0]?.status).toBe('error');
      expect(result.clusters[0]?.claimResults[0]?.error).toContain('vitest not found');

      expect(runTests).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable infrastructure failures', async () => {
      vi.useFakeTimers();

      try {
        let attemptCount = 0;
        runTests.mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            const error = new Error('Temporary failure');
            return Promise.reject(error);
          }
          return Promise.resolve({
            success: true,
            totalTests: 1,
            passedTests: 1,
            failedTests: 0,
            skippedTests: 0,
            tests: [
              {
                name: 'balance_001',
                fullName: 'accounting balance_001',
                file: 'src/accounting/balance_001.test.ts',
                status: 'passed',
                durationMs: 100,
              },
            ],
          });
        });

        const resultPromise = executeClusters(mockClusters, {
          projectPath: '/fake/project',
          maxRetries: 5,
        });

        // Advance timers to trigger retry backoffs (multiple retries with exponential backoff)
        await vi.runAllTimersAsync();

        const result = await resultPromise;

        // 3 attempts for first cluster (2 failures + 1 success) + 1 for second cluster = 4 total
        expect(runTests).toHaveBeenCalledTimes(4);
        expect(result.success).toBe(true);
        // Both clusters are processed
        expect(result.clusters).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('ClusterExecutionSummary structure', () => {
    it('should have correct structure', () => {
      const summary = {
        clusters: [],
        success: true,
        totalClaims: 10,
        passedClaims: 8,
        failedClaims: 2,
        skippedClaims: 0,
        errorClaims: 0,
        totalDurationMs: 1000,
      } as ClusterExecutionSummary;

      expect(summary).toHaveProperty('clusters');
      expect(summary).toHaveProperty('success');
      expect(summary).toHaveProperty('totalClaims');
      expect(summary).toHaveProperty('passedClaims');
      expect(summary).toHaveProperty('failedClaims');
      expect(summary).toHaveProperty('skippedClaims');
      expect(summary).toHaveProperty('errorClaims');
      expect(summary).toHaveProperty('totalDurationMs');
    });
  });
});
