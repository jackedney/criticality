/**
 * Tests for cluster executor.
 *
 * Validates test execution for clusters, result collection,
 * and infrastructure failure handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { executeClusters, type ClusterExecutionSummary } from './cluster-executor.js';
import type { ClusterDefinition } from './types.js';

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
      const mockRunTests = vi.fn().mockResolvedValue({
        success: true,
        totalTests: 2,
        passedTests: 2,
        failedTests: 0,
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

      vi.doMock('../adapters/typescript/testrunner.js', () => ({
        runTests: mockRunTests,
      }));

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
      });

      expect(result.success).toBe(true);
      expect(result.totalClaims).toBe(4);
      expect(result.passedClaims).toBe(2);
      expect(result.skippedClaims).toBe(2);
      expect(result.failedClaims).toBe(0);
      expect(result.clusters).toHaveLength(2);

      const cluster = result.clusters[0];
      if (cluster) {
        expect(cluster.clusterId).toBe('accounting');
        expect(cluster.success).toBe(true);
        expect(cluster.claimResults).toHaveLength(2);

        const balance001 = cluster.claimResults[0];
        const balance002 = cluster.claimResults[1];

        expect(balance001.claimId).toBe('balance_001');
        expect(balance001.status).toBe('passed');
        expect(balance002.claimId).toBe('balance_002');
        expect(balance002.status).toBe('passed');
      }

      expect(mockRunTests).toHaveBeenCalledTimes(2);
    });

    it('should stop execution on cluster failure when continueOnFailure is false', async () => {
      const mockRunTests = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
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
          tests: [],
        });

      vi.doMock('../adapters/typescript/testrunner.js', () => ({
        runTests: mockRunTests,
      }));

      const result = await executeClusters(mockClusters, {
        continueOnFailure: false,
      });

      expect(result.success).toBe(false);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].clusterId).toBe('accounting');

      expect(mockRunTests).toHaveBeenCalledTimes(1);
    });

    it('should continue execution on cluster failure when continueOnFailure is true', async () => {
      const mockRunTests = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
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

      vi.doMock('../adapters/typescript/testrunner.js', () => ({
        runTests: mockRunTests,
      }));

      const result = await executeClusters(mockClusters, {
        continueOnFailure: true,
      });

      expect(result.success).toBe(false);
      expect(result.clusters).toHaveLength(2);
      expect(result.clusters[0].success).toBe(false);
      expect(result.clusters[1].success).toBe(true);

      expect(mockRunTests).toHaveBeenCalledTimes(2);
    });

    it('should handle test runner not found error', async () => {
      const mockRunTests = vi.fn().mockRejectedValue(new Error('vitest not found'));

      vi.doMock('../adapters/typescript/testrunner.js', () => ({
        runTests: mockRunTests,
      }));

      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].clusterId).toBe('accounting');
      expect(result.errorClaims).toBeGreaterThan(0);
      expect(result.clusters[0].claimResults[0].status).toBe('error');
      expect(result.clusters[0].claimResults[0].error).toContain('vitest not found');

      expect(mockRunTests).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable infrastructure failures', async () => {
      let callCount = 0;
      const mockRunTests = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Temporary failure'));
      });

      vi.doMock('../adapters/typescript/testrunner.js', () => ({
        runTests: mockRunTests,
      }));

      const startTime = Date.now();
      const result = await executeClusters(mockClusters, {
        projectPath: '/fake/project',
        maxRetries: 5,
      });
      const elapsedTime = Date.now() - startTime;

      expect(callCount).toBe(1);
      expect(result.clusters).toHaveLength(1);
      expect(elapsedTime).toBeLessThan(100);
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
