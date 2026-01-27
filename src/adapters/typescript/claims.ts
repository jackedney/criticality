/**
 * Claim parser module for test generation.
 *
 * Parses spec claims from spec.toml files to generate appropriate property tests.
 *
 * @module adapters/typescript/claims
 */

import * as fs from 'fs';
import { parseSpec, SpecParseError } from '../../spec/index.js';
import type { ClaimType, SpecClaim } from '../../spec/types.js';

/**
 * Represents a parsed claim for test generation.
 *
 * Claims are testable assertions extracted from spec.toml that describe
 * invariants, behaviors, negative cases, temporal properties, performance
 * characteristics, or concurrency requirements.
 */
export interface Claim {
  /** Unique identifier for the claim (e.g., 'inv_001', 'perf_001') */
  id: string;
  /** The type of claim for test generation strategy */
  type: ClaimType;
  /** Human-readable description of the claim */
  description: string;
  /** Function names that reference this claim via CLAIM_REF */
  functions: string[];
}

/**
 * Error thrown when parsing claims from a spec file fails.
 */
export class ClaimParseError extends Error {
  /** The path to the spec file that failed to parse */
  public readonly specPath: string;
  /** The original error that caused the parse failure, if any */
  public readonly cause: Error | undefined;

  /**
   * Creates a new ClaimParseError.
   *
   * @param message - Descriptive error message.
   * @param specPath - Path to the spec file.
   * @param cause - The underlying error, if any.
   */
  constructor(message: string, specPath: string, cause?: Error) {
    super(message);
    this.name = 'ClaimParseError';
    this.specPath = specPath;
    this.cause = cause;
  }
}

/**
 * Default claim type when not specified in the spec.
 */
const DEFAULT_CLAIM_TYPE: ClaimType = 'behavioral';

/**
 * Extracts the description from a SpecClaim.
 *
 * For claims, the primary description comes from the `text` field.
 *
 * @param claim - The spec claim to extract description from.
 * @returns The claim description.
 */
function getClaimDescription(claim: SpecClaim): string {
  return claim.text;
}

/**
 * Converts a SpecClaim to a Claim object.
 *
 * @param id - The claim identifier.
 * @param specClaim - The raw spec claim from TOML.
 * @returns The converted Claim object.
 */
function specClaimToClaim(id: string, specClaim: SpecClaim): Claim {
  return {
    id,
    type: specClaim.type,
    description: getClaimDescription(specClaim),
    functions: [], // Populated later via CLAIM_REF linkage
  };
}

/**
 * Parses claims from a spec.toml file.
 *
 * This function reads and parses spec claims from a TOML specification file,
 * extracting claim metadata needed for test generation. Claims describe testable
 * properties of the system including invariants, behaviors, and performance
 * characteristics.
 *
 * The `functions` field of each claim is initially empty and should be populated
 * by scanning the codebase for CLAIM_REF comments that reference each claim ID.
 *
 * @param specPath - Path to the spec.toml file.
 * @returns Array of parsed claims.
 * @throws ClaimParseError if the file cannot be read or has invalid TOML syntax.
 *
 * @example
 * ```typescript
 * import { parseClaims } from './claims.js';
 *
 * const claims = parseClaims('./spec.toml');
 * // Returns: [
 * //   { id: 'inv_001', type: 'invariant', description: 'balance is never negative', functions: [] },
 * //   { id: 'perf_001', type: 'performance', description: 'lookup is O(1)', functions: [] }
 * // ]
 * ```
 *
 * @example
 * // Claim without explicit type defaults to 'behavioral'
 * // Note: This requires modifying the spec to allow optional type
 *
 * @example
 * // Invalid spec.toml throws with parse error details
 * try {
 *   parseClaims('./invalid-spec.toml');
 * } catch (error) {
 *   if (error instanceof ClaimParseError) {
 *     console.log(error.message); // Contains parse error details
 *     console.log(error.specPath); // Path to the failing file
 *   }
 * }
 */
export function parseClaims(specPath: string): Claim[] {
  // Read the spec file
  let tomlContent: string;
  try {
    tomlContent = fs.readFileSync(specPath, 'utf-8');
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new ClaimParseError(
      `Failed to read spec file '${specPath}': ${fsError.message}`,
      specPath,
      fsError
    );
  }

  // Parse the TOML content
  let spec;
  try {
    spec = parseSpec(tomlContent);
  } catch (error) {
    if (error instanceof SpecParseError) {
      throw new ClaimParseError(
        `Invalid spec.toml at '${specPath}': ${error.message}`,
        specPath,
        error
      );
    }
    throw new ClaimParseError(
      `Failed to parse spec file '${specPath}': ${(error as Error).message}`,
      specPath,
      error as Error
    );
  }

  // Extract claims from the spec
  const claims: Claim[] = [];

  if (spec.claims !== undefined) {
    for (const [claimId, specClaim] of Object.entries(spec.claims)) {
      claims.push(specClaimToClaim(claimId, specClaim));
    }
  }

  return claims;
}

/**
 * Links function names to claims based on CLAIM_REF associations.
 *
 * This function takes a set of claims and a mapping of function names to
 * their referenced claim IDs, and populates the `functions` field of each
 * claim with the functions that reference it.
 *
 * @param claims - Array of claims to update.
 * @param functionClaimRefs - Map of function name to array of claim IDs it references.
 * @returns The claims with populated function references.
 *
 * @example
 * ```typescript
 * const claims = parseClaims('./spec.toml');
 * const refs = new Map([
 *   ['processPayment', ['inv_001', 'perf_001']],
 *   ['validateCard', ['inv_001']]
 * ]);
 * const linkedClaims = linkClaimsToFunctions(claims, refs);
 * // inv_001.functions = ['processPayment', 'validateCard']
 * // perf_001.functions = ['processPayment']
 * ```
 */
export function linkClaimsToFunctions(
  claims: Claim[],
  functionClaimRefs: Map<string, string[]>
): Claim[] {
  // Create a map for quick claim lookup
  const claimMap = new Map<string, Claim>();
  for (const claim of claims) {
    claimMap.set(claim.id, claim);
  }

  // Link functions to claims
  for (const [functionName, claimIds] of functionClaimRefs) {
    for (const claimId of claimIds) {
      const claim = claimMap.get(claimId);
      if (claim !== undefined && !claim.functions.includes(functionName)) {
        claim.functions.push(functionName);
      }
    }
  }

  return claims;
}

export { DEFAULT_CLAIM_TYPE };
