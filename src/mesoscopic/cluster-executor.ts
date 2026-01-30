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

function mapTestsToClaims(
  testRunResult: TestRunResult,
  claimIds: readonly string[]
): Map<string, ClaimResult> {
  const claimResults = new Map<string, ClaimResult>();

  for (const claimId of claimIds) {
    const testsForClaim = testRunResult.tests.filter((test) => {
      const testName = test.fullName.toLowerCase();
      return testName.includes(claimId.toLowerCase());
    });

    const claimResult: ClaimResult = {
      claimId,
      status: testsForClaim.length === 0 ? 'skipped' : 'passed',
      testCount: testsForClaim.length,
      passedCount: 0,
      failedCount: 0,
      failedTests: [],
      durationMs: 0,
    };

    for (const test of testsForClaim) {
      claimResult.durationMs += test.durationMs;

      if (test.status === 'passed') {
        claimResult.passedCount++;
      } else if (test.status === 'failed') {
        claimResult.failedCount++;
        claimResult.failedTests = [...claimResult.failedTests, test.fullName];
        claimResult.status = 'failed';
      }
    }

    if (testsForClaim.length > 0) {
      if (claimResult.failedCount === 0 && claimResult.passedCount > 0) {
        claimResult.status = 'passed';
      } else if (claimResult.failedCount > 0) {
        claimResult.status = 'failed';
      }
    }

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

    const totalPassed = claimResultsArray.filter((r) => r.status === 'passed').length;
    const totalFailed = claimResultsArray.filter((r) => r.status === 'failed').length;
    const skipped = claimResultsArray.filter((r) => r.status === 'skipped').length;

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
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const hasNotFoundError = errorMessage.includes('not found') || errorMessage.includes('ENOENT');

    if (hasNotFoundError) {
      throw new ClusterExecutionError(
        'Test runner not found for cluster ' + cluster.id + "': " + errorMessage,
        'TEST_RUNNER_ERROR',
        errorMessage,
        {
          type: 'TEST_RUNNER_NOT_FOUND',
          message: errorMessage,
          stack,
          retryable: false,
          attempts: 1,
        }
      );
    }

    const claimResults: ClaimResult[] = cluster.claimIds.map((claimId) => ({
      claimId,
      status: 'error',
      error: errorMessage,
      testCount: 0,
      passedCount: 0,
      failedCount: 0,
      failedTests: [],
      durationMs: 0,
    }));

    return {
      clusterId: cluster.id,
      clusterName: cluster.name,
      success: false,
      claimResults,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      durationMs,
    };
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
          console.warn(
            '[ClusterExecutor] Infrastructure failure for cluster ' + cluster.id + "' (attempt " + attempt + "/" + maxRetries + "): " + failure.type + ". Retrying..."
          );
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          return executeClusterWithRetry(cluster, options, attempt + 1);
        }

        console.error(
          '[ClusterExecutor] Infrastructure failure for cluster ' + cluster.id + "' after " + attempt + " attempts: " + failure.type
        );
      }

      const claimResults: ClaimResult[] = cluster.claimIds.map((claimId) => ({
        claimId,
        status: 'error',
        error: 'Infrastructure failure: ' + (failure !== undefined ? failure.message : 'unknown'),
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        failedTests: [],
        durationMs: 0,
      }));

      return {
        clusterId: cluster.id,
        clusterName: cluster.name,
        success: false,
        claimResults,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        durationMs: 0,
      };
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

      console.log(
        "[ClusterExecutor] Cluster '" + cluster.name + "' completed: " + (result.success ? 'PASSED' : 'FAILED') + " (" + result.durationMs + "ms)"
      );

      for (const claimResult of result.claimResults) {
        console.log(
          "[ClusterExecutor]   Claim '" + claimResult.claimId + "': " + claimResult.status + " (" + claimResult.testCount + " tests, " + claimResult.passedCount + " passed, " + claimResult.failedCount + " failed)"
        );
      }

      if (!result.success && options.continueOnFailure !== true) {
        console.log(
          '[ClusterExecutor] Stopping execution due to cluster failure (continueOnFailure=false)'
        );
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(
        "[ClusterExecutor] Error executing cluster '" + cluster.name + "': " + errorMessage
      );

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
  const totalClaims = clusterResults.flatMap((r) => r.claimResults).length;
  const passedClaims = clusterResults.flatMap((r) => r.claimResults).filter((r) => r.status === 'passed').length;
  const failedClaims = clusterResults.flatMap((r) => r.claimResults).filter((r) => r.status === 'failed').length;
  const skippedClaims = clusterResults.flatMap((r) => r.claimResults).filter((r) => r.status === 'skipped').length;
  const errorClaims = clusterResults.flatMap((r) => r.claimResults).filter((r) => r.status === 'error').length;

  const success = failedClaims === 0 && errorClaims === 0;

  console.log('[ClusterExecutor] Execution complete: ' + (success ? 'SUCCESS' : 'FAILED'));
  console.log('[ClusterExecutor] Total claims: ' + totalClaims);
  console.log('[ClusterExecutor] Passed claims: ' + passedClaims);
  console.log('[ClusterExecutor] Failed claims: ' + failedClaims);
  console.log('[ClusterExecutor] Skipped claims: ' + skippedClaims);
  console.log('[ClusterExecutor] Error claims: ' + errorClaims);
  console.log('[ClusterExecutor] Total duration: ' + totalDurationMs + 'ms');

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
