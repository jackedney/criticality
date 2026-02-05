/**
 * Cluster executor for Mesoscopic phase.
 *
 * Executes tests for each cluster and collects results per claim.
 * Handles infrastructure failures and retries test runner crashes.
 *
 * @packageDocumentation
 */

import type { ClusterDefinition } from './types.js';
import type { TestRunResult } from '../adapters/typescript/testrunner.js';
import { logger } from '../utils/logger.js';

export type ClaimStatus = 'passed' | 'failed' | 'skipped' | 'error';

export interface ClaimResult {
  readonly claimId: string;
  readonly status: ClaimStatus;
  readonly error?: string;
  readonly testCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly failedTests: readonly string[];
  readonly durationMs: number;
}

export interface ClusterExecutionResult {
  readonly clusterId: string;
  readonly clusterName: string;
  readonly success: boolean;
  readonly claimResults: readonly ClaimResult[];
  readonly totalTests: number;
  readonly totalPassed: number;
  readonly totalFailed: number;
  readonly durationMs: number;
}

export interface ClusterExecutionSummary {
  readonly clusters: readonly ClusterExecutionResult[];
  readonly success: boolean;
  readonly totalClaims: number;
  readonly passedClaims: number;
  readonly failedClaims: number;
  readonly skippedClaims: number;
  readonly errorClaims: number;
  readonly totalDurationMs: number;
}

export type InfrastructureFailureType =
  | 'TEST_RUNNER_NOT_FOUND'
  | 'TEST_RUNNER_CRASH'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface InfrastructureFailure {
  readonly type: InfrastructureFailureType;
  readonly message: string;
  readonly stack?: string;
  readonly retryable: boolean;
  readonly attempts: number;
}

export interface ClusterExecutionOptions {
  readonly projectPath: string;
  readonly testPattern?: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
  readonly continueOnFailure?: boolean;
  readonly claimTestPattern?: (claimId: string) => string;
}

export type ClusterExecutionErrorCode =
  | 'TEST_RUNNER_ERROR'
  | 'PATTERN_ERROR'
  | 'EXECUTION_ERROR'
  | 'INFRASTRUCTURE_FAILURE';

export class ClusterExecutionError extends Error {
  public readonly code: ClusterExecutionErrorCode;
  public readonly details?: string;
  public readonly infrastructureFailure?: InfrastructureFailure;

  constructor(
    message: string,
    code: ClusterExecutionErrorCode,
    details?: string,
    infrastructureFailure?: InfrastructureFailure
  ) {
    super(message);
    this.name = 'ClusterExecutionError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    if (infrastructureFailure !== undefined) {
      this.infrastructureFailure = infrastructureFailure;
    }
  }
}

const DEFAULT_TIMEOUT = 300000;
const DEFAULT_MAX_RETRIES = 3;

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapTestsToClaims(
  testRunResult: TestRunResult,
  claimIds: readonly string[]
): Map<string, ClaimResult> {
  const claimResults = new Map<string, ClaimResult>();

  for (const claimId of claimIds) {
    const escapedClaimId = escapeRegExp(claimId.toLowerCase());
    const claimPattern = new RegExp(`\\b${escapedClaimId}\\b`, 'i');
    const testsForClaim = testRunResult.tests.filter((test) => {
      return claimPattern.test(test.fullName);
    });

    let totalDurationMs = 0;
    let passedCount = 0;
    let failedCount = 0;
    const failedTests: string[] = [];

    for (const test of testsForClaim) {
      totalDurationMs += test.durationMs;

      if (test.status === 'passed') {
        passedCount++;
      } else if (test.status === 'failed') {
        failedCount++;
        failedTests.push(test.fullName);
      }
    }

    const status = testsForClaim.length === 0 ? 'skipped' : failedCount > 0 ? 'failed' : 'passed';

    const claimResult: ClaimResult = {
      claimId,
      status,
      testCount: testsForClaim.length,
      passedCount,
      failedCount,
      failedTests,
      durationMs: totalDurationMs,
    };

    claimResults.set(claimId, claimResult);
  }

  return claimResults;
}

async function executeCluster(
  cluster: ClusterDefinition,
  options: ClusterExecutionOptions
): Promise<ClusterExecutionResult> {
  const startTime = Date.now();

  try {
    let testPattern = '**/*.test.ts';
    if (options.testPattern !== undefined) {
      testPattern = options.testPattern;
    } else if (options.claimTestPattern !== undefined) {
      testPattern = options.claimTestPattern(cluster.claimIds.join('|'));
    }

    const { runTests } = await import('../adapters/typescript/testrunner.js');

    const testRunResult = await runTests(testPattern, {
      cwd: options.projectPath,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    });

    const claimResults = mapTestsToClaims(testRunResult, cluster.claimIds);
    const claimResultsArray = Array.from(claimResults.values());

    const totalFailed = claimResultsArray.filter((r) => r.status === 'failed').length;

    const success = totalFailed === 0 && claimResultsArray.length > 0;

    const durationMs = Date.now() - startTime;

    return {
      clusterId: cluster.id,
      clusterName: cluster.name,
      success,
      claimResults: claimResultsArray,
      totalTests: testRunResult.totalTests,
      totalPassed: testRunResult.passedTests,
      totalFailed: testRunResult.failedTests,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const hasNotFoundError =
      (error instanceof Error && (error as { code?: string }).code === 'ENOENT') ||
      (error instanceof Error && (error.name === 'NotFoundError' || error.name === 'ENOENT')) ||
      errorMessage.includes('ENOENT');

    if (hasNotFoundError) {
      const infrastructureFailure: {
        type: InfrastructureFailureType;
        message: string;
        stack?: string;
        retryable: boolean;
        attempts: number;
      } = {
        type: 'TEST_RUNNER_NOT_FOUND',
        message: errorMessage,
        retryable: false,
        attempts: 1,
      };

      if (stack !== undefined) {
        infrastructureFailure.stack = stack;
      }

      throw new ClusterExecutionError(
        `Test runner not found for cluster '${cluster.id}': ${errorMessage}`,
        'TEST_RUNNER_ERROR',
        errorMessage,
        infrastructureFailure
      );
    }

    const infrastructureFailure: {
      type: InfrastructureFailureType;
      message: string;
      stack?: string;
      retryable: boolean;
      attempts: number;
    } = {
      type: 'TEST_RUNNER_CRASH',
      message: errorMessage,
      retryable: true,
      attempts: 1,
    };

    if (stack !== undefined) {
      infrastructureFailure.stack = stack;
    }

    throw new ClusterExecutionError(
      `Test runner crashed for cluster '${cluster.id}': ${errorMessage}`,
      'TEST_RUNNER_ERROR',
      errorMessage,
      infrastructureFailure
    );
  }
}

async function executeClusterWithRetry(
  cluster: ClusterDefinition,
  options: ClusterExecutionOptions,
  attempt = 1
): Promise<ClusterExecutionResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  try {
    return await executeCluster(cluster, options);
  } catch (error) {
    const isClusterExecutionError = error instanceof ClusterExecutionError;

    if (isClusterExecutionError) {
      const clusterError = error as ClusterExecutionError;
      const failure = clusterError.infrastructureFailure;

      if (failure !== undefined) {
        if (attempt < maxRetries && failure.retryable) {
          logger.warn('Infrastructure failure - retrying', {
            clusterId: cluster.id,
            attempt,
            maxRetries,
            failureType: failure.type,
          });
          const baseDelayMs = 1000;
          const maxDelayMs = 30000;
          const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.random() * 100;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return executeClusterWithRetry(cluster, options, attempt + 1);
        }

        logger.error('Infrastructure failure - non-retryable', {
          clusterId: cluster.id,
          attempts: attempt,
          failureType: failure.type,
        });
        throw error;
      }
    }

    throw error;
  }
}

export async function executeClusters(
  clusters: readonly ClusterDefinition[],
  options: ClusterExecutionOptions
): Promise<ClusterExecutionSummary> {
  const startTime = Date.now();
  const clusterResults: ClusterExecutionResult[] = [];

  for (const cluster of clusters) {
    try {
      const result = await executeClusterWithRetry(cluster, options);
      clusterResults.push(result);

      logger.info('Cluster completed', {
        clusterId: cluster.id,
        clusterName: cluster.name,
        success: result.success,
        durationMs: result.durationMs,
      });

      for (const claimResult of result.claimResults) {
        logger.info('Claim result', {
          clusterId: cluster.id,
          claimId: claimResult.claimId,
          status: claimResult.status,
          testCount: claimResult.testCount,
          passedCount: claimResult.passedCount,
          failedCount: claimResult.failedCount,
        });
      }

      if (!result.success && options.continueOnFailure !== true) {
        logger.info('Stopping execution due to cluster failure', {
          clusterId: cluster.id,
          continueOnFailure: false,
        });
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Error executing cluster', {
        clusterId: cluster.id,
        clusterName: cluster.name,
        error: errorMessage,
      });

      const failedClaimResults: ClaimResult[] = cluster.claimIds.map((claimId) => ({
        claimId,
        status: 'error',
        error: errorMessage,
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        failedTests: [],
        durationMs: 0,
      }));

      clusterResults.push({
        clusterId: cluster.id,
        clusterName: cluster.name,
        success: false,
        claimResults: failedClaimResults,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        durationMs: 0,
      });

      if (options.continueOnFailure !== true) {
        break;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const stats = clusterResults.reduce(
    (acc, result) => {
      for (const claimResult of result.claimResults) {
        acc.totalClaims++;
        switch (claimResult.status) {
          case 'passed':
            acc.passedClaims++;
            break;
          case 'failed':
            acc.failedClaims++;
            break;
          case 'skipped':
            acc.skippedClaims++;
            break;
          case 'error':
            acc.errorClaims++;
            break;
        }
      }
      return acc;
    },
    { totalClaims: 0, passedClaims: 0, failedClaims: 0, skippedClaims: 0, errorClaims: 0 }
  );
  const { totalClaims, passedClaims, failedClaims, skippedClaims, errorClaims } = stats;

  const success = failedClaims === 0 && errorClaims === 0;

  logger.info('Execution complete', {
    success,
    totalClaims,
    passedClaims,
    failedClaims,
    skippedClaims,
    errorClaims,
    totalDurationMs,
  });

  return {
    clusters: clusterResults,
    success,
    totalClaims,
    passedClaims,
    failedClaims,
    skippedClaims,
    errorClaims,
    totalDurationMs,
  };
}

export { DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES };
