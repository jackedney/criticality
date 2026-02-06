/**
 * Mass Defect reporting and summary generation for Phase IV.
 *
 * Provides human-readable reports and structured summaries for Mass Defect results,
 * enabling integration with the orchestrator and developer workflows.
 *
 * @packageDocumentation
 */

import type { MassDefectResult } from './types.js';

/**
 * Metrics improvement summary showing before/after comparisons.
 */
export interface MetricsImprovement {
  /** Average cyclomatic complexity before and after transformations. */
  avgComplexity: { before: number; after: number };
  /** Average function length before and after transformations. */
  avgLength: { before: number; after: number };
  /** Average nesting depth before and after transformations. */
  avgNesting: { before: number; after: number };
  /** Average test coverage before and after transformations. */
  avgCoverage: { before: number; after: number };
}

/**
 * Convergence status for the Mass Defect phase.
 */
export type ConvergenceStatus = 'converged' | 'manual_review_required' | 'failed';

/**
 * Structured summary of Mass Defect results for orchestrator integration.
 */
export interface MassDefectSummary {
  /** Total number of functions analyzed. */
  totalFunctions: number;
  /** Number of functions successfully transformed. */
  transformedCount: number;
  /** Number of functions that failed to converge. */
  failedCount: number;
  /** Number of functions already meeting targets. */
  optimalCount: number;
  /** Number of functions requiring manual review. */
  manualReviewCount: number;
  /** Overall convergence status. */
  convergenceStatus: ConvergenceStatus;
  /** Metrics improvement across all functions. */
  metricsImprovement: MetricsImprovement;
  /** Number of patterns applied across all transformations. */
  patternsApplied: number;
}

/**
 * Formats Mass Defect results into a human-readable report.
 *
 * @param result - The MassDefectResult to format.
 * @returns Formatted report string.
 *
 * @remarks
 * The report shows:
 * - Summary statistics (functions transformed, optimal, requiring manual review)
 * - Metrics before/after transformations
 * - Details of patterns applied
 * - Functions requiring manual review
 *
 * @example
 * ```ts
 * const report = formatMassDefectReport(result);
 * console.log(report);
 * // "Mass Defect Report
 * // ================
 * // Functions: 10
 * // Transformed: 7, Already optimal: 2, Manual review: 1
 * // ..."
 * ```
 */
export function formatMassDefectReport(result: MassDefectResult): string {
  const lines: string[] = [];

  lines.push('Mass Defect Report');
  lines.push('==================');
  lines.push('');

  lines.push('Summary');
  lines.push('-------');
  lines.push(`Functions analyzed: ${result.totalFunctions.toString()}`);
  lines.push(`Transformed: ${result.transformedFunctions.toString()}`);
  lines.push(`Already optimal: ${result.optimalFunctions.toString()}`);
  lines.push(`Manual review required: ${result.manualReviewFunctions.toString()}`);
  lines.push(`Converged: ${result.converged ? 'Yes' : 'No'}`);
  lines.push('');

  if (result.totalFunctions > 0) {
    const metricsImprovement = calculateMetricsImprovement(result);
    lines.push('Metrics Improvement');
    lines.push('------------------');
    lines.push(
      `Avg Complexity: ${metricsImprovement.avgComplexity.before.toFixed(2)} → ${metricsImprovement.avgComplexity.after.toFixed(2)}`
    );
    lines.push(
      `Avg Length: ${metricsImprovement.avgLength.before.toFixed(2)} → ${metricsImprovement.avgLength.after.toFixed(2)}`
    );
    lines.push(
      `Avg Nesting: ${metricsImprovement.avgNesting.before.toFixed(2)} → ${metricsImprovement.avgNesting.after.toFixed(2)}`
    );
    lines.push(
      `Avg Coverage: ${(metricsImprovement.avgCoverage.before * 100).toFixed(1)}% → ${(metricsImprovement.avgCoverage.after * 100).toFixed(1)}%`
    );
    lines.push('');
  }

  const transformedFunctions = Array.from(result.functionResults.values()).filter(
    (r) => r.status === 'converged' && r.attempts.length > 0
  );

  if (transformedFunctions.length > 0) {
    lines.push('Transformed Functions');
    lines.push('--------------------');

    for (const funcResult of transformedFunctions) {
      lines.push(`\nFunction: ${funcResult.functionId}`);
      lines.push(
        `  Initial: Complexity=${String(funcResult.initialMetrics.cyclomaticComplexity)}, Length=${String(funcResult.initialMetrics.functionLength)}, Nesting=${String(funcResult.initialMetrics.nestingDepth)}`
      );
      lines.push(
        `  Final: Complexity=${String(funcResult.finalMetrics.cyclomaticComplexity)}, Length=${String(funcResult.finalMetrics.functionLength)}, Nesting=${String(funcResult.finalMetrics.nestingDepth)}`
      );
      lines.push(`  Attempts: ${String(funcResult.attempts.length)}`);

      for (const attempt of funcResult.attempts) {
        if (attempt.success) {
          lines.push(`    ✓ ${attempt.patternId} (Risk ${String(attempt.risk)})`);
          if (attempt.afterMetrics) {
            lines.push(
              `      Complexity: ${String(attempt.beforeMetrics.cyclomaticComplexity)} → ${String(attempt.afterMetrics.cyclomaticComplexity)}`
            );
          }
        } else {
          lines.push(
            `    ✗ ${attempt.patternId} (Risk ${String(attempt.risk)}): ${attempt.error ?? 'Failed'}`
          );
        }
      }
    }
    lines.push('');
  }

  const manualReviewFunctions = Array.from(result.functionResults.values()).filter(
    (r) => r.status === 'manual_review_required'
  );

  if (manualReviewFunctions.length > 0) {
    lines.push('Functions Requiring Manual Review');
    lines.push('---------------------------------');

    for (const funcResult of manualReviewFunctions) {
      lines.push(`\nFunction: ${funcResult.functionId}`);
      lines.push(
        `  Current metrics: Complexity=${String(funcResult.finalMetrics.cyclomaticComplexity)}, Length=${String(funcResult.finalMetrics.functionLength)}, Nesting=${String(funcResult.finalMetrics.nestingDepth)}`
      );
      lines.push(`  Reason: ${funcResult.reason ?? 'No applicable patterns remain'}`);
      lines.push(`  Attempts: ${String(funcResult.attempts.length)}`);

      for (const attempt of funcResult.attempts) {
        if (attempt.success) {
          lines.push(`    ✓ ${attempt.patternId} (Risk ${String(attempt.risk)})`);
        } else {
          lines.push(
            `    ✗ ${attempt.patternId} (Risk ${String(attempt.risk)}): ${attempt.error ?? 'Failed'}`
          );
        }
      }
    }
    lines.push('');
  }

  lines.push('Configuration');
  lines.push('-------------');
  lines.push(`Max Cyclomatic Complexity: ${result.config.maxCyclomaticComplexity.toString()}`);
  lines.push(`Max Function Length: ${result.config.maxFunctionLength.toString()}`);
  lines.push(`Max Nesting Depth: ${result.config.maxNestingDepth.toString()}`);
  lines.push(`Min Test Coverage: ${(result.config.minTestCoverage * 100).toFixed(0)}%`);

  return lines.join('\n');
}

/**
 * Generates a structured summary of Mass Defect results for orchestrator integration.
 *
 * @param result - The MassDefectResult to summarize.
 * @returns MassDefectSummary with aggregated metrics and convergence status.
 *
 * @remarks
 * The summary provides:
 * - Total functions analyzed and their breakdown by status
 * - Overall convergence status
 * - Metrics improvement (before/after averages)
 * - Total patterns applied
 *
 * @example
 * ```ts
 * const summary = generateMassDefectSummary(result);
 * // summary.metricsImprovement.avgComplexity.before === 12.5
 * // summary.metricsImprovement.avgComplexity.after === 7.3
 * ```
 */
export function generateMassDefectSummary(result: MassDefectResult): MassDefectSummary {
  const metricsImprovement = calculateMetricsImprovement(result);
  const failedCount = Array.from(result.functionResults.values()).filter(
    (r) => r.status === 'failed'
  ).length;

  let convergenceStatus: ConvergenceStatus;
  if (result.converged) {
    convergenceStatus = 'converged';
  } else if (result.manualReviewFunctions > 0) {
    convergenceStatus = 'manual_review_required';
  } else {
    convergenceStatus = 'failed';
  }

  const patternsApplied = Array.from(result.functionResults.values()).reduce(
    (sum, funcResult) => sum + funcResult.attempts.filter((a) => a.success).length,
    0
  );

  return {
    totalFunctions: result.totalFunctions,
    transformedCount: result.transformedFunctions,
    failedCount,
    optimalCount: result.optimalFunctions,
    manualReviewCount: result.manualReviewFunctions,
    convergenceStatus,
    metricsImprovement,
    patternsApplied,
  };
}

/**
 * Calculates metrics improvement from Mass Defect results.
 *
 * @param result - The MassDefectResult to analyze.
 * @returns MetricsImprovement with before/after averages.
 *
 * @remarks
 * Computes average metrics across all functions, comparing initial
 * and final values to show improvement.
 */
function calculateMetricsImprovement(result: MassDefectResult): MetricsImprovement {
  const functionResults = Array.from(result.functionResults.values());

  if (functionResults.length === 0) {
    return {
      avgComplexity: { before: 0, after: 0 },
      avgLength: { before: 0, after: 0 },
      avgNesting: { before: 0, after: 0 },
      avgCoverage: { before: 0, after: 0 },
    };
  }

  let totalComplexityBefore = 0;
  let totalComplexityAfter = 0;
  let totalLengthBefore = 0;
  let totalLengthAfter = 0;
  let totalNestingBefore = 0;
  let totalNestingAfter = 0;
  let totalCoverageBefore = 0;
  let totalCoverageAfter = 0;

  for (const funcResult of functionResults) {
    totalComplexityBefore += funcResult.initialMetrics.cyclomaticComplexity;
    totalComplexityAfter += funcResult.finalMetrics.cyclomaticComplexity;
    totalLengthBefore += funcResult.initialMetrics.functionLength;
    totalLengthAfter += funcResult.finalMetrics.functionLength;
    totalNestingBefore += funcResult.initialMetrics.nestingDepth;
    totalNestingAfter += funcResult.finalMetrics.nestingDepth;
    totalCoverageBefore += funcResult.initialMetrics.testCoverage;
    totalCoverageAfter += funcResult.finalMetrics.testCoverage;
  }

  const count = functionResults.length;

  return {
    avgComplexity: {
      before: totalComplexityBefore / count,
      after: totalComplexityAfter / count,
    },
    avgLength: {
      before: totalLengthBefore / count,
      after: totalLengthAfter / count,
    },
    avgNesting: {
      before: totalNestingBefore / count,
      after: totalNestingAfter / count,
    },
    avgCoverage: {
      before: totalCoverageBefore / count,
      after: totalCoverageAfter / count,
    },
  };
}
