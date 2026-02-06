/**
 * Tests for Mass Defect reporting and summary generation.
 */

import { describe, it, expect } from 'vitest';
import {
  formatMassDefectReport,
  generateMassDefectSummary,
  type MassDefectSummary,
  type MetricsImprovement,
  type ConvergenceStatus,
} from './reporter.js';
import type {
  MassDefectResult,
  ComplexityMetrics,
  TransformationAttempt,
  FunctionResult,
} from './types.js';

describe('formatMassDefectReport', () => {
  it('generates human-readable report for successful transformations', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 10,
      transformedFunctions: 7,
      optimalFunctions: 2,
      manualReviewFunctions: 1,
      converged: false,
    });

    const report = formatMassDefectReport(result);

    expect(report).toContain('Mass Defect Report');
    expect(report).toContain('Functions analyzed: 10');
    expect(report).toContain('Transformed: 7');
    expect(report).toContain('Already optimal: 2');
    expect(report).toContain('Manual review required: 1');
    expect(report).toContain('Converged: No');
  });

  it('shows metrics before/after transformations', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 3,
      transformedFunctions: 2,
      optimalFunctions: 1,
      manualReviewFunctions: 0,
      converged: true,
    });

    const report = formatMassDefectReport(result);

    expect(report).toContain('Metrics Improvement');
    expect(report).toContain('Avg Complexity:');
    expect(report).toContain('Avg Length:');
    expect(report).toContain('Avg Nesting:');
    expect(report).toContain('Avg Coverage:');
  });

  it('includes functions requiring manual review with reasons', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 2,
      transformedFunctions: 0,
      optimalFunctions: 0,
      manualReviewFunctions: 2,
      converged: false,
    });

    const report = formatMassDefectReport(result);

    expect(report).toContain('Functions Requiring Manual Review');
    expect(report).toContain('Reason:');
    expect(report).toContain('Current metrics:');
  });

  it('shows configuration targets', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 1,
      transformedFunctions: 0,
      optimalFunctions: 1,
      manualReviewFunctions: 0,
      converged: true,
    });

    const report = formatMassDefectReport(result);

    expect(report).toContain('Configuration');
    expect(report).toContain('Max Cyclomatic Complexity: 10');
    expect(report).toContain('Max Function Length: 50');
    expect(report).toContain('Max Nesting Depth: 4');
    expect(report).toContain('Min Test Coverage: 80%');
  });

  it('handles empty result (no functions analyzed)', () => {
    const result: MassDefectResult = {
      converged: true,
      totalFunctions: 0,
      transformedFunctions: 0,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      functionResults: new Map(),
      config: {
        maxCyclomaticComplexity: 10,
        maxFunctionLength: 50,
        maxNestingDepth: 4,
        minTestCoverage: 0.8,
        catalogPath: './catalog',
      },
    };

    const report = formatMassDefectReport(result);

    expect(report).toContain('Mass Defect Report');
    expect(report).toContain('Functions analyzed: 0');
    expect(report).toContain('Transformed: 0');
    expect(report).toContain('Already optimal: 0');
    expect(report).toContain('Manual review required: 0');
    expect(report).toContain('Converged: Yes');
  });

  it('shows pattern application details for transformed functions', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 1,
      transformedFunctions: 1,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      converged: true,
    });

    const report = formatMassDefectReport(result);

    expect(report).toContain('Transformed Functions');
    expect(report).toContain('Attempts:');
    expect(report).toMatch(/✓/);
  });
});

describe('generateMassDefectSummary', () => {
  it('generates summary with required fields', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 10,
      transformedFunctions: 7,
      optimalFunctions: 2,
      manualReviewFunctions: 1,
      converged: false,
    });

    const summary = generateMassDefectSummary(result);

    expect(summary.totalFunctions).toBe(10);
    expect(summary.transformedCount).toBe(7);
    expect(summary.optimalCount).toBe(2);
    expect(summary.manualReviewCount).toBe(1);
  });

  it('includes metrics improvement with before/after values', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 2,
      transformedFunctions: 2,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      converged: true,
      avgComplexityBefore: 12,
      avgComplexityAfter: 8,
    });

    const summary = generateMassDefectSummary(result);

    expect(summary.metricsImprovement.avgComplexity.before).toBe(13);
    expect(summary.metricsImprovement.avgComplexity.after).toBe(8.5);
  });

  it('calculates failed count from failed status functions', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 3,
      transformedFunctions: 1,
      optimalFunctions: 0,
      manualReviewFunctions: 1,
      converged: false,
    });

    const functionResults = Array.from(result.functionResults.values());
    if (functionResults[1]) {
      functionResults[1].status = 'failed';
    }

    const summary = generateMassDefectSummary(result);

    expect(summary.failedCount).toBe(1);
  });

  it('sets convergence status correctly', () => {
    const convergedResult = createMockMassDefectResult({
      totalFunctions: 1,
      transformedFunctions: 0,
      optimalFunctions: 1,
      manualReviewFunctions: 0,
      converged: true,
    });

    const manualReviewResult = createMockMassDefectResult({
      totalFunctions: 1,
      transformedFunctions: 0,
      optimalFunctions: 0,
      manualReviewFunctions: 1,
      converged: false,
    });

    const failedResult = createMockMassDefectResult({
      totalFunctions: 1,
      transformedFunctions: 0,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      converged: false,
    });

    const failedFunctionResults = Array.from(failedResult.functionResults.values());
    if (failedFunctionResults[0]) {
      failedFunctionResults[0].status = 'failed';
    }

    const convergedSummary = generateMassDefectSummary(convergedResult);
    const manualReviewSummary = generateMassDefectSummary(manualReviewResult);
    const failedSummary = generateMassDefectSummary(failedResult);

    expect(convergedSummary.convergenceStatus).toBe('converged');
    expect(manualReviewSummary.convergenceStatus).toBe('manual_review_required');
    expect(failedSummary.convergenceStatus).toBe('failed');
  });

  it('counts patterns applied successfully', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 2,
      transformedFunctions: 2,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      converged: true,
    });

    const summary = generateMassDefectSummary(result);

    expect(summary.patternsApplied).toBeGreaterThan(0);
  });

  it('handles empty result gracefully', () => {
    const result: MassDefectResult = {
      converged: true,
      totalFunctions: 0,
      transformedFunctions: 0,
      optimalFunctions: 0,
      manualReviewFunctions: 0,
      functionResults: new Map(),
      config: {
        maxCyclomaticComplexity: 10,
        maxFunctionLength: 50,
        maxNestingDepth: 4,
        minTestCoverage: 0.8,
        catalogPath: './catalog',
      },
    };

    const summary = generateMassDefectSummary(result);

    expect(summary.totalFunctions).toBe(0);
    expect(summary.transformedCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.optimalCount).toBe(0);
    expect(summary.manualReviewCount).toBe(0);
    expect(summary.convergenceStatus).toBe('converged');
    expect(summary.patternsApplied).toBe(0);
    expect(summary.metricsImprovement.avgComplexity.before).toBe(0);
    expect(summary.metricsImprovement.avgComplexity.after).toBe(0);
  });

  it('calculates average metrics correctly across all functions', () => {
    const result = createMockMassDefectResult({
      totalFunctions: 3,
      transformedFunctions: 2,
      optimalFunctions: 1,
      manualReviewFunctions: 0,
      converged: true,
      avgComplexityBefore: 12,
      avgComplexityAfter: 8,
    });

    const summary = generateMassDefectSummary(result);

    expect(summary.metricsImprovement.avgComplexity.before).toBeCloseTo(10.33, 2);
    expect(summary.metricsImprovement.avgComplexity.after).toBeCloseTo(7.33, 2);
  });
});

describe('MassDefectSummary type', () => {
  it('accepts valid MassDefectSummary structure', () => {
    const summary: MassDefectSummary = {
      totalFunctions: 10,
      transformedCount: 7,
      failedCount: 1,
      optimalCount: 2,
      manualReviewCount: 1,
      convergenceStatus: 'converged',
      metricsImprovement: {
        avgComplexity: { before: 12.5, after: 7.3 },
        avgLength: { before: 60, after: 45 },
        avgNesting: { before: 5, after: 3 },
        avgCoverage: { before: 0.6, after: 0.8 },
      },
      patternsApplied: 15,
    };

    expect(summary.totalFunctions).toBe(10);
    expect(summary.convergenceStatus).toBe('converged');
  });

  it('accepts all convergence status values', () => {
    const statuses: ConvergenceStatus[] = ['converged', 'manual_review_required', 'failed'];

    expect(statuses).toHaveLength(3);
  });

  it('accepts valid MetricsImprovement structure', () => {
    const metrics: MetricsImprovement = {
      avgComplexity: { before: 12.5, after: 7.3 },
      avgLength: { before: 60, after: 45 },
      avgNesting: { before: 5, after: 3 },
      avgCoverage: { before: 0.6, after: 0.8 },
    };

    expect(metrics.avgComplexity.before).toBe(12.5);
  });
});

function createMockMassDefectResult(config: {
  totalFunctions: number;
  transformedFunctions: number;
  optimalFunctions: number;
  manualReviewFunctions: number;
  converged: boolean;
  avgComplexityBefore?: number;
  avgComplexityAfter?: number;
}): MassDefectResult {
  const functionResults = new Map<string, FunctionResult>();
  const {
    totalFunctions,
    transformedFunctions,
    optimalFunctions,
    manualReviewFunctions,
    converged,
    avgComplexityBefore = 12,
    avgComplexityAfter = 8,
  } = config;

  let funcIndex = 0;

  for (let i = 0; i < transformedFunctions; i++) {
    const initialMetrics = createMockMetrics(avgComplexityBefore + i * 2);
    const finalMetrics = createMockMetrics(avgComplexityAfter + i * 1);
    const attempts: TransformationAttempt[] = [
      {
        patternId: 'early-return',
        success: true,
        risk: 2,
        beforeMetrics: initialMetrics,
        afterMetrics: finalMetrics,
      },
    ];

    functionResults.set(`function-${String(funcIndex)}`, {
      functionId: `function-${String(funcIndex)}`,
      status: 'converged',
      initialMetrics,
      finalMetrics,
      attempts,
    });
    funcIndex++;
  }

  for (let i = 0; i < optimalFunctions; i++) {
    const initialMetrics = createMockMetrics(5);
    const finalMetrics = createMockMetrics(5);

    functionResults.set(`function-${String(funcIndex)}`, {
      functionId: `function-${String(funcIndex)}`,
      status: 'optimal',
      initialMetrics,
      finalMetrics,
      attempts: [],
    });
    funcIndex++;
  }

  for (let i = 0; i < manualReviewFunctions; i++) {
    const initialMetrics = createMockMetrics(20);
    const finalMetrics = createMockMetrics(18);
    const attempts: TransformationAttempt[] = [
      {
        patternId: 'extract-helper',
        success: false,
        risk: 3,
        beforeMetrics: initialMetrics,
        afterMetrics: finalMetrics,
        error: 'Verification failed',
      },
    ];

    functionResults.set(`function-${String(funcIndex)}`, {
      functionId: `function-${String(funcIndex)}`,
      status: 'manual_review_required',
      initialMetrics,
      finalMetrics,
      attempts,
      reason: 'No applicable patterns remain',
    });
    funcIndex++;
  }

  return {
    converged,
    totalFunctions,
    transformedFunctions,
    optimalFunctions,
    manualReviewFunctions,
    functionResults,
    config: {
      maxCyclomaticComplexity: 10,
      maxFunctionLength: 50,
      maxNestingDepth: 4,
      minTestCoverage: 0.8,
      catalogPath: './catalog',
    },
  };
}

function createMockMetrics(complexity: number): ComplexityMetrics {
  return {
    cyclomaticComplexity: complexity,
    functionLength: complexity * 4,
    nestingDepth: Math.ceil(complexity / 3),
    testCoverage: 0.6,
  };
}
