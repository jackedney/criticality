/**
 * Benchmark test generator module for TypeScript.
 *
 * Generates tests that verify performance claims (e.g. O(1), O(n))
 * through empirical scaling tests as specified in SPECIFICATION.md section 5.4.
 *
 * @packageDocumentation
 */

import type { Claim } from './claims.js';

/**
 * Options for benchmark test generation.
 */
export interface BenchmarkTestOptions {
  /** Input sizes for scaling tests (default: [10, 100, 1000, 10000]) */
  inputSizes?: number[];
  /** Allowed variance from expected scaling (default: 0.20 = 20%) */
  allowedVariance?: number;
  /** Number of samples per size (default: 100) */
  numSamples?: number;
  /** Test timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

const DEFAULT_INPUT_SIZES = [10, 100, 1000, 10000];
const DEFAULT_VARIANCE = 0.2;
const DEFAULT_SAMPLES = 100;
const DEFAULT_TIMEOUT = 60000;

/**
 * Supported complexity patterns for benchmark verification.
 */
export type ComplexityClass = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)';

/**
 * Basic string escaping for generated code.
 */
function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/**
 * Extracts the complexity class from a claim description.
 * Searches for patterns like O(1), O(n), O(n log n), O(n^2), O(log n).
 *
 * @param description - The claim description to search.
 * @returns The detected complexity class or null if none found.
 */
export function extractComplexity(description: string): ComplexityClass | null {
  const lower = description.toLowerCase();

  // Order matters - check more specific patterns first
  if (/o\(n\s*log\s*n\)/i.test(lower) || /o\(n\s*\*\s*log\s*n\)/i.test(lower)) {
    return 'O(n log n)';
  }
  if (/o\(n\s*\^?\s*2\)/i.test(lower) || /o\(n\s*\*\s*n\)/i.test(lower)) {
    return 'O(n^2)';
  }
  if (/o\(log\s*n\)/i.test(lower)) {
    return 'O(log n)';
  }
  if (/o\(n\)/i.test(lower)) {
    return 'O(n)';
  }
  if (/o\(1\)/i.test(lower)) {
    return 'O(1)';
  }

  return null;
}

/**
 * Generates the complexity verification code for a specific complexity class.
 *
 * @param complexity - The complexity class to verify.
 * @returns The verification code as an array of lines.
 */
function generateComplexityVerification(complexity: ComplexityClass): string[] {
  const lines: string[] = [];

  switch (complexity) {
    case 'O(1)':
      lines.push('    // O(1) Check: Time should be constant across all sizes');
      lines.push('    // Variance from mean should be within tolerance');
      lines.push('    const times = results.map(r => r.avgTime);');
      lines.push('    const mean = times.reduce((a, b) => a + b, 0) / times.length;');
      lines.push('    for (const result of results) {');
      lines.push('      const variance = Math.abs(result.avgTime - mean) / mean;');
      lines.push(
        '      expect(variance, `O(1) violation: time at size ${result.size} deviates ${(variance * 100).toFixed(1)}% from mean`).toBeLessThan(allowedVariance);'
      );
      lines.push('    }');
      break;

    case 'O(log n)':
      lines.push('    // O(log n) Check: Time should scale logarithmically');
      lines.push('    // time / log(size) should be roughly constant');
      lines.push('    const logRatios = results.map(r => r.avgTime / Math.log2(r.size));');
      lines.push(
        '    const meanLogRatio = logRatios.reduce((a, b) => a + b, 0) / logRatios.length;'
      );
      lines.push('    for (let i = 0; i < results.length; i++) {');
      lines.push('      const result = results[i]!;');
      lines.push('      const ratio = logRatios[i]!;');
      lines.push('      const variance = Math.abs(ratio - meanLogRatio) / meanLogRatio;');
      lines.push(
        '      expect(variance, `O(log n) violation: scaling at size ${result.size} deviates ${(variance * 100).toFixed(1)}% from expected`).toBeLessThan(allowedVariance);'
      );
      lines.push('    }');
      break;

    case 'O(n)':
      lines.push('    // O(n) Check: Time should scale linearly with size');
      lines.push('    // time / size should be roughly constant');
      lines.push('    const linearRatios = results.map(r => r.avgTime / r.size);');
      lines.push(
        '    const meanLinearRatio = linearRatios.reduce((a, b) => a + b, 0) / linearRatios.length;'
      );
      lines.push('    for (let i = 0; i < results.length; i++) {');
      lines.push('      const result = results[i]!;');
      lines.push('      const ratio = linearRatios[i]!;');
      lines.push('      const variance = Math.abs(ratio - meanLinearRatio) / meanLinearRatio;');
      lines.push(
        '      expect(variance, `O(n) violation: scaling at size ${result.size} deviates ${(variance * 100).toFixed(1)}% from expected`).toBeLessThan(allowedVariance);'
      );
      lines.push('    }');
      break;

    case 'O(n log n)':
      lines.push('    // O(n log n) Check: Time should scale as n * log(n)');
      lines.push('    // time / (size * log(size)) should be roughly constant');
      lines.push(
        '    const nLogNRatios = results.map(r => r.avgTime / (r.size * Math.log2(r.size)));'
      );
      lines.push(
        '    const meanNLogNRatio = nLogNRatios.reduce((a, b) => a + b, 0) / nLogNRatios.length;'
      );
      lines.push('    for (let i = 0; i < results.length; i++) {');
      lines.push('      const result = results[i]!;');
      lines.push('      const ratio = nLogNRatios[i]!;');
      lines.push('      const variance = Math.abs(ratio - meanNLogNRatio) / meanNLogNRatio;');
      lines.push(
        '      expect(variance, `O(n log n) violation: scaling at size ${result.size} deviates ${(variance * 100).toFixed(1)}% from expected`).toBeLessThan(allowedVariance);'
      );
      lines.push('    }');
      break;

    case 'O(n^2)':
      lines.push('    // O(n^2) Check: Time should scale quadratically');
      lines.push('    // time / (size^2) should be roughly constant');
      lines.push('    const quadRatios = results.map(r => r.avgTime / (r.size * r.size));');
      lines.push(
        '    const meanQuadRatio = quadRatios.reduce((a, b) => a + b, 0) / quadRatios.length;'
      );
      lines.push('    for (let i = 0; i < results.length; i++) {');
      lines.push('      const result = results[i]!;');
      lines.push('      const ratio = quadRatios[i]!;');
      lines.push('      const variance = Math.abs(ratio - meanQuadRatio) / meanQuadRatio;');
      lines.push(
        '      expect(variance, `O(n^2) violation: scaling at size ${result.size} deviates ${(variance * 100).toFixed(1)}% from expected`).toBeLessThan(allowedVariance);'
      );
      lines.push('    }');
      break;
  }

  return lines;
}

/**
 * Generates a benchmark test for a performance claim.
 *
 * Creates a vitest test that measures execution time at exponentially increasing
 * input sizes and verifies the scaling matches the claimed complexity class
 * (e.g., O(1), O(n), O(n log n), O(n^2)).
 *
 * The generated test will fail if the measured scaling deviates from the expected
 * complexity by more than the allowed variance.
 *
 * @param claim - The performance claim to generate a benchmark test for.
 * @param options - Options for benchmark generation.
 * @returns The generated test code as a string.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'perf_001',
 *   type: 'performance',
 *   description: 'lookup is O(1)',
 *   functions: ['lookup']
 * };
 * const testCode = generateBenchmarkTest(claim);
 * // Generates a test that measures lookup time at n=10, 100, 1000, 10000
 * // and fails if time grows with input size (violating O(1))
 * ```
 */
export function generateBenchmarkTest(claim: Claim, options: BenchmarkTestOptions = {}): string {
  const {
    inputSizes = DEFAULT_INPUT_SIZES,
    allowedVariance = DEFAULT_VARIANCE,
    numSamples = DEFAULT_SAMPLES,
    timeout = DEFAULT_TIMEOUT,
    includeJsDoc = true,
  } = options;

  const lines: string[] = [];
  const complexity = extractComplexity(claim.description);

  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Benchmark tests for claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    if (complexity !== null) {
      lines.push(` * Expected complexity: ${complexity}`);
    }
    lines.push(' *');
    lines.push(' * @generated This file was auto-generated by the benchmark test generator.');
    lines.push(' */');
    lines.push('');
  }

  lines.push("import { performance } from 'node:perf_hooks';");
  lines.push("import { describe, it, expect } from 'vitest';");
  lines.push('');

  // Generate imports for the functions under test
  if (claim.functions.length > 0) {
    lines.push('// TODO: Import the function(s) under test');
    for (const func of claim.functions) {
      lines.push(`// import { ${func} } from './path-to-module.js';`);
    }
    lines.push('');
  }

  const testName = `[${claim.id}] ${claim.description}`;
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Benchmark: ${escapedTestName}', () => {`);
  lines.push(
    `  it('should satisfy ${complexity ?? 'performance'} complexity requirement', () => {`
  );
  lines.push(`    const inputSizes = [${inputSizes.join(', ')}];`);
  lines.push(`    const numSamples = ${String(numSamples)};`);
  lines.push(`    const allowedVariance = ${String(allowedVariance)};`);
  lines.push('');
  lines.push('    // Measure execution time at each input size');
  lines.push('    const results = inputSizes.map(size => {');
  lines.push('      // Generate test input of the specified size');
  lines.push('      const input = Array.from({ length: size }, (_, i) => i);');
  lines.push('');
  lines.push('      // Warm up to avoid JIT compilation skewing results');
  lines.push('      for (let i = 0; i < 10; i++) {');
  if (claim.functions.length > 0) {
    const funcName = claim.functions[0] ?? 'operationUnderTest';
    lines.push(`        // ${funcName}(input);`);
  } else {
    lines.push('        // operationUnderTest(input);');
  }
  lines.push('      }');
  lines.push('');
  lines.push('      // Measure execution time');
  lines.push('      const start = performance.now();');
  lines.push('      for (let i = 0; i < numSamples; i++) {');
  if (claim.functions.length > 0) {
    const funcName = claim.functions[0] ?? 'operationUnderTest';
    lines.push(`        // ${funcName}(input);`);
  } else {
    lines.push('        // operationUnderTest(input);');
  }
  lines.push('      }');
  lines.push('      const end = performance.now();');
  lines.push('');
  lines.push('      return {');
  lines.push('        size,');
  lines.push('        avgTime: (end - start) / numSamples');
  lines.push('      };');
  lines.push('    });');
  lines.push('');

  // Generate complexity-specific verification
  if (complexity !== null) {
    const verificationLines = generateComplexityVerification(complexity);
    lines.push(...verificationLines);
  } else {
    lines.push('    // No complexity class detected in claim description.');
    lines.push('    // TODO: Add appropriate complexity verification based on requirements.');
    lines.push('    // Available checks: O(1), O(log n), O(n), O(n log n), O(n^2)');
    lines.push('    console.log("Benchmark results:", results);');
  }

  lines.push(`  }, ${String(timeout)});`);
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates multiple benchmark tests from an array of claims.
 */
export function generateBenchmarkTests(
  claims: Claim[],
  options: BenchmarkTestOptions = {}
): Map<string, string> {
  const tests = new Map<string, string>();

  for (const claim of claims) {
    if (claim.type === 'performance') {
      tests.set(claim.id, generateBenchmarkTest(claim, options));
    }
  }

  return tests;
}
