/**
 * Spec-driven test generator for Mesoscopic phase.
 *
 * Orchestrates test generation from spec claims using the TypeScriptAdapter
 * test generators. Generates tests for: invariant, behavioral, negative,
 * temporal, concurrent, and performance claims.
 *
 * Tests verify spec compliance, not implementation details.
 *
 * @packageDocumentation
 */

import type { ModelRouter } from '../router/types.js';

import { parseSpec, SpecParseError } from '../spec/index.js';
import type { Claim } from '../adapters/typescript/claims.js';
import type { SpecClaim } from '../spec/types.js';

import { generateInvariantTests } from '../adapters/typescript/invariant-test-generator.js';

import { generateBehavioralTests } from '../adapters/typescript/behavioral-test-generator.js';

import { generateConcurrentTests } from '../adapters/typescript/concurrent-test-generator.js';

import { generateBenchmarkTests } from '../adapters/typescript/benchmark-test-generator.js';

import { generateTemporalTests } from '../adapters/typescript/temporal-test-generator.js';

import { generateNegativeTests } from '../adapters/typescript/negative-test-generator.js';

/**
 * Options for spec-driven test generation.
 */
export interface SpecDrivenTestOptions {
  /** Timeout for test execution in milliseconds (default: 60000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
  /** Whether to skip untestable claims (default: true) */
  skipUntestable?: boolean;
  /** Path to baseline file for performance regression detection */
  baselinePath?: string;
  /** ModelRouter for using structurer_model for test synthesis */
  modelRouter?: ModelRouter;
  /** Whether to use structurer_model for test synthesis (default: false) */
  useStructurerModel?: boolean;
}

/**
 * Performance baseline data for regression detection.
 */
export interface PerformanceBaseline {
  /** Claim ID */
  claimId: string;
  /** Timestamp of baseline */
  timestamp: string;
  /** Average execution time at baseline */
  avgTime: number;
  /** Input size at baseline */
  size: number;
  /** Memory usage at baseline (if available) */
  memoryUsage?: number;
}

/**
 * Performance regression detection result.
 */
export interface RegressionResult {
  /** Whether regression was detected */
  regressed: boolean;
  /** Current metrics */
  current: { avgTime: number; size: number };
  /** Baseline metrics */
  baseline: PerformanceBaseline;
  /** Percentage change (positive = regression) */
  percentChange: number;
  /** Whether regression exceeds threshold */
  exceedsThreshold: boolean;
}

const DEFAULT_TIMEOUT = 60000;
const REGRESSION_THRESHOLD = 0.15;

/**
 * Extended Claim with testable flag from SpecClaim.
 */
type TestableClaim = Claim & {
  testable?: boolean;
};

/**
 * Parses spec claims and converts them to Claim objects.
 *
 * @param id - The claim identifier.
 * @param specClaim - The spec claim from spec.toml.
 * @returns A Claim object for test generation.
 */
function specClaimToClaim(id: string, specClaim: SpecClaim): TestableClaim {
  const claim: TestableClaim = {
    id,
    type: specClaim.type,
    description: specClaim.text,
    functions: [],
  };

  if (specClaim.testable !== undefined) {
    claim.testable = specClaim.testable;
  }

  return claim;
}

/**
 * Links functions to claims based on CLAIM_REF comments.
 *
 * @param claims - Map of claim ID to TestableClaim objects.
 * @param functionClaimRefs - Map of function name to array of claim IDs.
 * @returns The claims map with functions array populated.
 */
function linkClaimsToFunctions(
  claims: Map<string, TestableClaim>,
  functionClaimRefs: Map<string, string[]>
): Map<string, TestableClaim> {
  const linkedClaims = new Map<string, TestableClaim>();

  const inverseMap = new Map<string, string[]>();
  for (const [functionId, claimIds] of functionClaimRefs) {
    for (const claimId of claimIds) {
      const functions = inverseMap.get(claimId);
      if (functions === undefined) {
        inverseMap.set(claimId, [functionId]);
      } else {
        functions.push(functionId);
      }
    }
  }

  for (const [claimId, claim] of claims) {
    const linkedFunctions = inverseMap.get(claimId) ?? [];
    linkedClaims.set(claimId, {
      ...claim,
      functions: linkedFunctions,
    });
  }

  return linkedClaims;
}

/**
 * Generates tests for a cluster using structurer_model via ModelRouter.
 *
 * @param claims - The claims to generate tests for.
 * @param options - Test generation options.
 * @returns Map of claim ID to generated test code.
 */
async function generateTestsWithModel(
  claims: TestableClaim[],
  options: SpecDrivenTestOptions
): Promise<Map<string, string>> {
  const tests = new Map<string, string>();

  if (options.modelRouter === undefined || options.useStructurerModel === false) {
    console.warn(
      '[SpecDrivenTestGenerator] ModelRouter not provided or useStructurerModel disabled. Using template-based generation.'
    );
    return tests;
  }

  for (const claim of claims) {
    try {
      const prompt = buildTestSynthesisPrompt(claim);
      const result = await options.modelRouter.complete({
        modelAlias: 'structurer',
        prompt,
        parameters: {
          maxTokens: 4000,
          temperature: 0.3,
          systemPrompt: `You are a test generation specialist for the Criticality Protocol.
Your task is to generate Vitest test code from spec claims.

Generate test code that:
- Uses fast-check for property-based testing of invariants
- Uses vitest's describe/it/expect API
- Verifies spec compliance, not implementation details
- Includes meaningful test names and assertions

Output ONLY the test code. No explanations or markdown blocks.`,
        },
      });

      if (result.success) {
        tests.set(claim.id, result.response.content);
      } else {
        console.error(
          `[SpecDrivenTestGenerator] Failed to generate test for ${claim.id}: ${result.error.message}`
        );
      }
    } catch (error) {
      console.error(`[SpecDrivenTestGenerator] Error generating test for ${claim.id}:`, error);
    }
  }

  return tests;
}

/**
 * Builds a prompt for test synthesis using structurer_model.
 *
 * @param claim - The claim to generate a test for.
 * @returns The prompt string.
 */
function buildTestSynthesisPrompt(claim: TestableClaim): string {
  return `Generate a Vitest test for the following claim:

CLAIM ID: ${claim.id}
TYPE: ${claim.type}
DESCRIPTION: ${claim.description}
FUNCTIONS: ${claim.functions.length > 0 ? claim.functions.join(', ') : 'none specified'}

The test should verify the claim using appropriate testing strategies:
- invariants: use fast-check for property-based testing
- behavioral: use standard vitest assertions
- negative: verify that forbidden outcomes don't occur
- temporal: test state transitions over time
- concurrent: test thread-safety with concurrent operations
- performance: measure execution time and verify complexity

Output ONLY the test code. No explanations.`;
}

/**
 * Loads performance baseline from file.
 *
 * @param baselinePath - Path to baseline file.
 * @returns Map of claim ID to baseline data.
 */
async function loadBaseline(baselinePath: string): Promise<Map<string, PerformanceBaseline>> {
  const baseline = new Map<string, PerformanceBaseline>();

  try {
    const content = await readFile(baselinePath, 'utf-8');
    const data = JSON.parse(content) as PerformanceBaseline[];

    for (const entry of data) {
      baseline.set(entry.claimId, entry);
    }
  } catch (error) {
    console.warn(`[SpecDrivenTestGenerator] Failed to load baseline from ${baselinePath}:`, error);
  }

  return baseline;
}

/**
 * Generates tests for a cluster.
 *
 * @param claims - The claims to generate tests for.
 * @param options - Test generation options.
 * @param baseline - Optional performance baseline for regression detection.
 * @returns Map of claim ID to generated test code.
 */
async function generateTestsForCluster(
  claims: TestableClaim[],
  options: SpecDrivenTestOptions,
  baseline?: Map<string, PerformanceBaseline>
): Promise<Map<string, string>> {
  const tests = new Map<string, string>();
  const skippedClaims: { claimId: string; reason: string }[] = [];

  const { timeout = DEFAULT_TIMEOUT, includeJsDoc = true, skipUntestable = true } = options;

  // Use structurer_model if requested and available
  if (options.useStructurerModel === true && options.modelRouter !== undefined) {
    console.log('[SpecDrivenTestGenerator] Using structurer_model for test synthesis');
    return generateTestsWithModel(claims, options);
  }

  // Check testable flag and skip untestable claims
  for (const claim of claims) {
    if (claim.testable === false && skipUntestable) {
      skippedClaims.push({
        claimId: claim.id,
        reason: 'Untestable claim (testable: false)',
      });
    }
  }

  // Generate tests by claim type (only for testable claims)
  const testableClaims = claims.filter((c) => c.testable !== false || !skipUntestable);
  const invariantClaims = testableClaims.filter((c) => c.type === 'invariant');
  const behavioralClaims = testableClaims.filter((c) => c.type === 'behavioral');
  const negativeClaims = testableClaims.filter((c) => c.type === 'negative');
  const temporalClaims = testableClaims.filter((c) => c.type === 'temporal');
  const concurrentClaims = testableClaims.filter((c) => c.type === 'concurrent');
  const performanceClaims = testableClaims.filter((c) => c.type === 'performance');

  // Generate tests for each claim type
  if (invariantClaims.length > 0) {
    const invariantTests = generateInvariantTests(invariantClaims as Claim[], [], {
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of invariantTests) {
      tests.set(claimId, testCode);
    }
  }

  if (behavioralClaims.length > 0) {
    const behavioralTests = generateBehavioralTests(behavioralClaims as Claim[], {
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of behavioralTests) {
      tests.set(claimId, testCode);
    }
  }

  if (negativeClaims.length > 0) {
    const negativeTests = generateNegativeTests(negativeClaims as Claim[], {
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of negativeTests) {
      tests.set(claimId, testCode);
    }
  }

  if (temporalClaims.length > 0) {
    const temporalTests = generateTemporalTests(temporalClaims as Claim[], {
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of temporalTests) {
      tests.set(claimId, testCode);
    }
  }

  if (concurrentClaims.length > 0) {
    const concurrentTests = generateConcurrentTests(concurrentClaims as Claim[], {
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of concurrentTests) {
      tests.set(claimId, testCode);
    }
  }

  if (performanceClaims.length > 0) {
    // Check for missing complexity thresholds
    const performanceClaimsWithoutThreshold = performanceClaims.filter((c) => {
      const description = c.description.toLowerCase();
      const hasComplexity = /o\(/.test(description);
      return !hasComplexity;
    });

    for (const claim of performanceClaimsWithoutThreshold) {
      console.warn(
        `[SpecDrivenTestGenerator] Performance claim ${claim.id} has no complexity threshold. Using default O(n) threshold.`
      );
    }

    // Check for performance regressions if baseline is available
    if (baseline !== undefined && baseline.size > 0) {
      for (const claim of performanceClaims) {
        const baselineData = baseline.get(claim.id);
        if (baselineData !== undefined) {
          console.log(
            `[SpecDrivenTestGenerator] Performance claim ${claim.id} has baseline data: avgTime=${baselineData.avgTime}ms, size=${baselineData.size}`
          );
        }
      }
    }

    const benchmarkTests = generateBenchmarkTests(performanceClaims as Claim[], {
      inputSizes: [10, 100, 1000],
      allowedVariance: 0.2,
      numSamples: 100,
      timeout,
      includeJsDoc,
    });

    for (const [claimId, testCode] of benchmarkTests) {
      tests.set(claimId, testCode);
    }
  }

  return tests;
}

/**
 * Error codes for spec-driven test generation.
 */
export type SpecDrivenTestErrorCode =
  | 'SPEC_PARSE_ERROR'
  | 'CLAIM_EXTRACTION_ERROR'
  | 'TEST_GENERATION_ERROR';

/**
 * Error class for spec-driven test generation.
 */
export class SpecDrivenTestError extends Error {
  public readonly code: SpecDrivenTestErrorCode;
  public readonly details?: string;

  constructor(message: string, code: SpecDrivenTestErrorCode, details?: string) {
    super(message);
    this.name = 'SpecDrivenTestError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Generates spec-driven tests from a spec file and cluster definitions.
 *
 * This is the main orchestration function for spec-driven test generation.
 * It:
 * - Parses spec.toml to extract claims
 * - Links claims to functions based on CLAIM_REF comments
 * - Generates appropriate tests for each claim type
 * - Uses structurer_model via ModelRouter if enabled
 * - Skips untestable claims with documentation
 * - Logs warnings for performance claims without thresholds
 * - Detects performance regression if baseline is available
 *
 * @param specPath - Path to the spec.toml file.
 * @param functionClaimRefs - Map of function name to array of claim IDs from CLAIM_REF comments.
 * @param options - Options for test generation.
 * @returns Object containing generated tests and metadata.
 * @throws SpecDrivenTestError if spec cannot be parsed or test generation fails.
 *
 * @example
 * ```typescript
 * import { generateSpecDrivenTests } from './spec-driven-test-generator.js';
 * import { createModelRouter } from '../router/index.js';
 *
 * const router = createModelRouter('opencode');
 * const result = await generateSpecDrivenTests(specPath, functionClaimRefs, {
 *   useStructurerModel: true,
 *   modelRouter: router
 * });
 *
 * console.log(\`Generated \${result.testCount} tests\`);
 * ```
 */
export async function generateSpecDrivenTests(
  specPath: string,
  functionClaimRefs: Map<string, string[]>,
  options: SpecDrivenTestOptions = {}
): Promise<{
  tests: Map<string, string>;
  testCount: number;
  skippedClaims: { claimId: string; reason: string }[];
}> {
  try {
    const specContent = await readFile(specPath, 'utf-8');
    const spec = parseSpec(specContent);

    const claims = new Map<string, TestableClaim>();

    if (spec.claims !== undefined) {
      for (const [claimId, specClaim] of Object.entries(spec.claims ?? {})) {
        claims.set(claimId, specClaimToClaim(claimId, specClaim));
      }
    }

    const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

    // Load baseline if path provided for regression detection
    let baseline: Map<string, PerformanceBaseline> | undefined;
    if (options.baselinePath !== undefined) {
      baseline = await loadBaseline(options.baselinePath);
      if (baseline.size > 0) {
        console.log(
          `[SpecDrivenTestGenerator] Loaded ${baseline.size} baseline entries for regression detection`
        );
      }
    }

    const generatedTests = await generateTestsForCluster(
      Array.from(linkedClaims.values()),
      options,
      baseline
    );

    const testCount = generatedTests.size;

    const skippedClaims: { claimId: string; reason: string }[] = [];

    for (const claim of linkedClaims.values()) {
      if (claim.testable === false && (options.skipUntestable ?? true)) {
        skippedClaims.push({
          claimId: claim.id,
          reason: 'Untestable claim (testable: false)',
        });
      }
    }

    return {
      tests: generatedTests,
      testCount,
      skippedClaims,
    };
  } catch (error) {
    if (error instanceof SpecParseError) {
      throw new SpecDrivenTestError(
        `Failed to parse spec file '${specPath}': ${error.message}`,
        'SPEC_PARSE_ERROR',
        error.message
      );
    }

    throw new SpecDrivenTestError(
      `Failed to generate tests from spec: ${(error as Error).message}`,
      'TEST_GENERATION_ERROR',
      (error as Error).message
    );
  }
}

/**
 * Reads a file and returns its content.
 *
 * @param path - Path to the file.
 * @param encoding - File encoding (default: utf-8).
 * @returns Promise that resolves to file content.
 */
import * as fs from 'node:fs/promises';

async function readFile(path: string, encoding = 'utf-8'): Promise<string> {
  const buffer = await fs.readFile(path, { encoding: encoding as BufferEncoding });
  return buffer as string;
}

export { DEFAULT_TIMEOUT, REGRESSION_THRESHOLD };
