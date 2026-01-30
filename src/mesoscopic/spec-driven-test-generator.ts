/**
 * Spec-driven test generator for Mesoscopic phase.
 *
 * Orchestrates test generation from spec claims using the TypeScriptAdapter
 * test generators. Generates tests for: invariant, behavioral, negative,
 * temporal, concurrent, and performance claim types.
 *
 * Tests verify spec compliance (not implementation details) and use
 * structurer_model via ModelRouter for LLM-based test synthesis.
 *
 * @packageDocumentation
 */

import type { ModelRouter } from '../../router/index.js';
import type { Spec } from '../../spec/types.js';
import type { SpecClaim } from '../../spec/types.js';
import type { ClusterDefinition } from './types.js';

import { parseSpec, SpecParseError } from '../../spec/index.js';
import type { Claim } from '../../adapters/typescript/claims.js';

import {
  generateInvariantTests,
  type InvariantTestOptions,
} from '../../adapters/typescript/invariant-test-generator.js';

import {
  generateBehavioralTests,
  type BehavioralTestOptions,
} from '../../adapters/typescript/behavioral-test-generator.js';

import {
  generateConcurrentTests,
  type ConcurrentTestOptions,
} from '../../adapters/typescript/concurrent-test-generator.js';

import {
  generateBenchmarkTests,
  type BenchmarkTestOptions,
} from '../../adapters/typescript/benchmark-test-generator.js';

import {
  generateTemporalTests,
  type TemporalTestOptions,
} from '../../adapters/typescript/temporal-test-generator.js';

import {
  generateNegativeTests,
  type NegativeTestOptions,
} from '../../adapters/typescript/negative-test-generator.js';

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
}

const DEFAULT_TIMEOUT = 60000;

/**
 * Converts a SpecClaim to a Claim object.
 *
 * @param id - The claim identifier.
 * @param specClaim - The spec claim from spec.toml.
 * @returns A Claim object for test generation.
 */
function specClaimToClaim(id: string, specClaim: SpecClaim): Claim {
  return {
    id,
    type: specClaim.type,
    description: specClaim.text,
    functions: [], // Populated later via CLAIM_REF linkage
  };
}

/**
 * Error codes for spec-driven test generation.
 */
export type SpecDrivenTestErrorCode =
  | 'SPEC_PARSE_ERROR'
  | 'CLAIM_EXTRACTION_ERROR'
  | 'TEST_GENERATION_ERROR'
  | 'MODEL_ROUTER_ERROR';

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
 * Parses spec claims and converts them to Claim objects.
 *
 * @param spec - The parsed specification.
 * @returns Map of claim ID to Claim objects.
 * @throws SpecDrivenTestError if spec parsing fails.
 */
function extractClaimsFromSpec(spec: Spec): Map<string, Claim> {
  const claims = new Map<string, Claim>();

  if (spec.claims !== undefined) {
    for (const [claimId, specClaim] of Object.entries(spec.claims)) {
      claims.set(claimId, specClaimToClaim(claimId, specClaim));
    }
  }

  return claims;
}

/**
 * Links functions to claims based on CLAIM_REF comments.
 *
 * @param claims - Map of claim ID to Claim objects.
 * @param functionClaimRefs - Map of function name to array of claim IDs.
 * @returns The claims map with functions array populated.
 */
function linkClaimsToFunctions(
  claims: Map<string, Claim>,
  functionClaimRefs: Map<string, string[]>
): Map<string, Claim> {
  // Update claims with their linked functions
  for (const [functionName, claimIds] of functionClaimRefs) {
    for (const claimId of claimIds) {
      const claim = claims.get(claimId);
      if (claim !== undefined && !claim.functions.includes(functionName)) {
        claim.functions.push(functionName);
      }
    }
  }

  return claims;
}

/**
 * Generates tests for a cluster.
 *
 * @param claims - The claims to generate tests for.
 * @param options - Test generation options.
 * @param cluster - The cluster being tested (for logging).
 * @returns Map of claim ID to generated test code.
 */
function generateTestsForCluster(
  claims: Claim[],
  options: SpecDrivenTestOptions,
  cluster?: ClusterDefinition
): Map<string, string> {
  const tests = new Map<string, string>();
  const skippedClaims: { claimId: string; reason: string }[] = [];

  // Generate tests by claim type
  const invariantClaims = claims.filter((c) => c.type === 'invariant');
  const behavioralClaims = claims.filter((c) => c.type === 'behavioral');
  const negativeClaims = claims.filter((c) => c.type === 'negative');
  const temporalClaims = claims.filter((c) => c.type === 'temporal');
  const concurrentClaims = claims.filter((c) => c.type === 'concurrent');
  const performanceClaims = claims.filter((c) => c.type === 'performance');

  // Check testable flag
  for (const claim of claims) {
    if (claim.testable === false && (options.skipUntestable ?? true)) {
      skippedClaims.push({
        claimId: claim.id,
        reason: 'Untestable claim (testable: false)',
      });
    }
  }

  // Generate tests for each claim type
  if (invariantClaims.length > 0) {
    const invariantTests = generateInvariantTests(invariantClaims, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of invariantTests) {
      tests.set(claimId, testCode);
    }
  }

  if (behavioralClaims.length > 0) {
    const behavioralTests = generateBehavioralTests(behavioralClaims, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of behavioralTests) {
      tests.set(claimId, testCode);
    }
  }

  if (negativeClaims.length > 0) {
    const negativeTests = generateNegativeTests(negativeClaims, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of negativeTests) {
      tests.set(claimId, testCode);
    }
  }

  if (temporalClaims.length > 0) {
    const temporalTests = generateTemporalTests(temporalClaims, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of temporalTests) {
      tests.set(claimId, testCode);
    }
  }

  if (concurrentClaims.length > 0) {
    const concurrentTests = generateConcurrentTests(concurrentClaims, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of concurrentTests) {
      tests.set(claimId, testCode);
    }
  }

  if (performanceClaims.length > 0) {
    // Check for missing complexity thresholds
    const performanceClaimsWithoutThreshold = performanceClaims.filter((c) => {
      const specClaim = claims.get(c.id + '_raw');
      return specClaim ? specClaim.complexity === undefined : false;
    });

    for (const claim of performanceClaimsWithoutThreshold) {
      console.warn(
        `[SpecDrivenTestGenerator] Performance claim ${claim.id} has no complexity threshold. Using default O(n) threshold.`
      );
    }

    const benchmarkTests = generateBenchmarkTests(performanceClaims, {
      inputSizes: [10, 100, 1000],
      allowedVariance: 0.2,
      numSamples: 100,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      includeJsDoc: options.includeJsDoc ?? true,
    });

    for (const [claimId, testCode] of benchmarkTests) {
      tests.set(claimId, testCode);
    }
  }

  return tests;
}

/**
 * Generates spec-driven tests from a spec file and cluster definitions.
 *
 * This is the main orchestration function for spec-driven test generation.
 * It:
 * - Parses spec.toml to extract claims
 * - Links claims to functions based on CLAIM_REF comments
 * - Generates appropriate tests for each claim type
 * - Skips untestable claims with documentation
 * - Logs warnings for performance claims without thresholds
 *
 * @param specPath - Path to the spec.toml file.
 * @param functionClaimRefs - Map of function name to array of claim IDs from CLAIM_REF comments.
 * @param options - Options for test generation.
 * @param cluster - Optional cluster definition for logging.
 * @returns Object containing generated tests and metadata.
 * @throws SpecDrivenTestError if spec cannot be parsed or test generation fails.
 *
 * @example
 * ```typescript
 * import { generateSpecDrivenTests } from './spec-driven-test-generator.js';
 * import { parseSpec } from '../spec/index.js';
 *
 * const spec = parseSpec(specPath);
 * const functionClaimRefs = parseFunctionClaims('./src');
 * const result = generateSpecDrivenTests(specPath, functionClaimRefs);
 *
 * console.log(\`Generated \${result.testCount} tests for \${result.skippedCount} skipped claims\`);
 * ```
 *
 * @example
 * // Untestable claim is skipped with documentation
 * ```typescript
 * const spec = parseSpec('./spec.toml');
 * const result = generateSpecDrivenTests(specPath, new Map());
 *
 * if (result.skippedClaims.length > 0) {
 *   console.log('Skipped claims:', result.skippedClaims);
 * }
 * // Output:
 * // {
 * //   tests: Map of claim ID to test code,
 * //   testCount: number of generated tests,
 * //   skippedClaims: array of skipped claim info
 * // }
 */
export async function generateSpecDrivenTests(
  specPath: string,
  functionClaimRefs: Map<string, string[]>,
  options: SpecDrivenTestOptions = {},
  cluster?: ClusterDefinition
): Promise<{
  tests: Map<string, string>;
  testCount: number;
  skippedClaims: { claimId: string; reason: string }[];
}> {
  try {
    const specContent = await read(specPath, 'utf-8');
    const spec = parseSpec(specContent);
    const claims = extractClaimsFromSpec(spec);
    const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

    const generatedTests = generateTestsForCluster(
      Array.from(linkedClaims.values()),
      options,
      cluster
    );

    const testCount = generatedTests.size;
    const skippedClaims: { claimId: string; reason: string }[] = [];

    for (const claim of Array.from(linkedClaims.values())) {
      const specClaim = claims.get(claim.id + '_raw');
      if (specClaim?.testable === false) {
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
function read(path: string, encoding = 'utf-8'): Promise<string> {
  return import('fs').then((fs) => {
    fs.readFile(path, { encoding });
  });
}

export { DEFAULT_TIMEOUT };
