/**
 * Witness generation integration for the Lattice phase.
 *
 * Transforms spec.toml witnesses into TypeScript code with:
 * - Branded type definitions for type-encodable invariants
 * - Validation factory functions for runtime validation
 * - Fast-check Arbitrary instances for property testing
 * - Witness verification tier reports
 *
 * @packageDocumentation
 */

import type { Spec, SpecWitness, WitnessInvariant } from '../spec/types.js';
import {
  generateBrandedType,
  generateValidationFactory,
  generateArbitrary,
  InvalidBaseTypeError,
  type WitnessDefinition,
  type WitnessTypeParameter,
} from '../adapters/typescript/witness.js';

/**
 * Verification tier levels for witness invariants.
 *
 * - proof: Invariant is encoded in the type system (compile-time guarantee)
 * - distinction: Type distinguishes valid from invalid (branded type)
 * - runtime: Validation happens at runtime via factory functions
 * - doc: Invariant is documented only (no enforcement)
 */
export type WitnessVerificationTier = 'proof' | 'distinction' | 'runtime' | 'doc';

/**
 * Result of analyzing a single invariant for encoding capability.
 */
export interface InvariantAnalysis {
  /** The invariant being analyzed. */
  invariant: WitnessInvariant;
  /** The verification tier achieved for this invariant. */
  tier: WitnessVerificationTier;
  /** Whether this invariant is type-encodable. */
  isTypeEncodable: boolean;
  /** Reason for the tier assignment. */
  reason: string;
}

/**
 * Result of generating code for a single witness.
 */
export interface WitnessCodeResult {
  /** The witness name. */
  name: string;
  /** The branded type definition code. */
  brandedType: string;
  /** The validation factory code (make/assert/is functions). */
  validationFactory: string;
  /** The fast-check Arbitrary code. */
  arbitrary: string;
  /** Analysis results for each invariant. */
  invariantAnalysis: readonly InvariantAnalysis[];
  /** The highest verification tier achieved. */
  highestTier: WitnessVerificationTier;
  /** JSDoc comment for the witness. */
  jsDoc: string;
  /** Whether generation was successful. */
  success: boolean;
  /** Error message if generation failed. */
  error?: string;
  /** Warnings generated during code generation. */
  warnings: readonly WitnessWarning[];
}

/**
 * A warning about a witness generation issue.
 */
export interface WitnessWarning {
  /** The witness name. */
  witnessName: string;
  /** The warning message. */
  message: string;
  /** The invariant that caused the warning (if applicable). */
  invariantId?: string;
  /** Whether generation fell back to runtime validation. */
  fellBackToRuntime: boolean;
}

/**
 * Witness verification tier report for a generated codebase.
 */
export interface WitnessVerificationReport {
  /** Total number of witnesses processed. */
  totalWitnesses: number;
  /** Total number of invariants processed. */
  totalInvariants: number;
  /** Breakdown by verification tier. */
  tierBreakdown: {
    proof: number;
    distinction: number;
    runtime: number;
    doc: number;
  };
  /** Per-witness analysis results. */
  witnessResults: readonly WitnessCodeResult[];
  /** Generation warnings. */
  warnings: readonly WitnessWarning[];
  /** Summary statistics. */
  summary: {
    /** Percentage of invariants with compile-time guarantees (proof + distinction). */
    compileTimePercentage: number;
    /** Percentage of invariants with any enforcement (proof + distinction + runtime). */
    enforcedPercentage: number;
    /** Number of witnesses that fell back to runtime validation due to errors. */
    fallbackCount: number;
  };
}

/**
 * Result of generating all witness code from a spec.
 */
export interface WitnessGenerationResult {
  /** The generated TypeScript code. */
  code: string;
  /** Per-witness code results. */
  witnesses: readonly WitnessCodeResult[];
  /** The verification tier report. */
  report: WitnessVerificationReport;
  /** Generation warnings. */
  warnings: readonly WitnessWarning[];
}

/**
 * Options for witness generation.
 */
export interface WitnessGeneratorOptions {
  /** Whether to generate validation factories. Default: true. */
  generateValidationFactories?: boolean;
  /** Whether to generate fast-check Arbitraries. Default: true. */
  generateArbitraries?: boolean;
  /** Whether to include JSDoc comments. Default: true. */
  includeJsDoc?: boolean;
  /** Whether to emit warnings. Default: true. */
  emitWarnings?: boolean;
  /** Custom logger for warnings (defaults to console.warn). */
  logger?: (message: string) => void;
}

/**
 * Determines if an invariant can be type-encoded (compile-time guarantee).
 *
 * Type-encodable invariants are those that can be represented as TypeScript types
 * without runtime checks. Examples:
 * - NonEmpty: T[] where length > 0 -> NonEmpty<T> (distinction tier - branded)
 * - Sorted: T[] where elements are ordered -> not encodable in TS types (runtime tier)
 *
 * @param invariant - The invariant to analyze.
 * @returns Analysis result with tier and encodability.
 */
function analyzeInvariant(invariant: WitnessInvariant): InvariantAnalysis {
  const formal = invariant.formal?.trim() ?? '';
  const description = invariant.description ?? '';

  // Check for invariants that can be proven at compile time
  // (These are very rare in TypeScript - mostly impossible without dependent types)
  // For now, we don't have any proof-level guarantees in TS

  // Check for invariants that can be type-encoded as branded types (distinction tier)
  // These are invariants that we can validate and then "brand" the type
  // Only brandable if the invariant is actually testable (testable !== false)
  const isTypeEncodable = invariant.testable !== false && canBrandInvariant(formal, description);

  if (isTypeEncodable) {
    return {
      invariant,
      tier: 'distinction',
      isTypeEncodable: true,
      reason: 'Invariant can be enforced via branded type with validation factory',
    };
  }

  // Check if the invariant is at least testable (runtime tier)
  const isTestable = invariant.testable !== false && formal !== '';

  if (isTestable) {
    return {
      invariant,
      tier: 'runtime',
      isTypeEncodable: false,
      reason: 'Invariant requires runtime validation',
    };
  }

  // Documentation only
  return {
    invariant,
    tier: 'doc',
    isTypeEncodable: false,
    reason: 'Invariant is documentation only (no formal expression or marked as non-testable)',
  };
}

/**
 * Determines if an invariant can be encoded as a branded type.
 *
 * Branded types provide compile-time distinction between validated
 * and unvalidated values, even though the actual validation is runtime.
 *
 * The key insight is that ANY testable invariant can be branded:
 * if we can validate it at runtime, we can create a factory function
 * that validates and returns a branded type. The "distinction" tier
 * means the type system distinguishes validated from unvalidated values,
 * not that the invariant itself is encoded in the type system.
 */
function canBrandInvariant(formal: string, _description: string): boolean {
  // If there's a formal expression, the invariant can be validated
  // at runtime and the result can be branded. This includes:
  // - Simple predicates: value >= 0, value.length > 0
  // - Complex expressions: value.every((v, i, arr) => ...)
  // - Custom predicates: isSorted(value)
  //
  // The formal expression just needs to be non-empty to be brandable,
  // because the validation factory will use it for runtime checks
  // and then brand the result for compile-time distinction.
  return formal !== '';
}

/**
 * Converts a spec witness to a WitnessDefinition for the TypeScriptAdapter.
 */
function specWitnessToDefinition(witness: SpecWitness): WitnessDefinition {
  const typeParameters: WitnessTypeParameter[] = [];

  if (witness.type_params !== undefined) {
    for (const param of witness.type_params) {
      if (param.name !== undefined) {
        const typeParam: WitnessTypeParameter = { name: param.name };
        if (param.bounds !== undefined && param.bounds.length > 0) {
          typeParam.constraint = param.bounds.join(' & ');
        }
        typeParameters.push(typeParam);
      }
    }
  }

  // Combine invariants into a single expression
  const invariants = witness.invariants
    .map((inv) => inv.formal)
    .filter((formal): formal is string => formal !== undefined && formal.trim() !== '')
    .join(' && ');

  const definition: WitnessDefinition = {
    name: witness.name,
    baseType: witness.base_type ?? 'unknown',
  };

  if (typeParameters.length > 0) {
    definition.typeParameters = typeParameters;
  }

  if (invariants !== '') {
    definition.invariant = invariants;
  }

  return definition;
}

/**
 * Generates JSDoc comment for a witness.
 */
function generateWitnessJsDoc(witness: SpecWitness): string {
  const lines: string[] = ['/**'];

  // Add description
  if (witness.description !== undefined) {
    lines.push(` * ${witness.description}`);
  } else {
    lines.push(` * ${witness.name} type witness.`);
  }

  // Add invariants
  if (witness.invariants.length > 0) {
    lines.push(' *');
    lines.push(' * @invariants');
    for (const inv of witness.invariants) {
      const id = inv.id ?? 'invariant';
      const desc = inv.description ?? inv.formal ?? 'undocumented';
      lines.push(` * - ${id}: ${desc}`);
      if (inv.formal !== undefined) {
        lines.push(` *   Formal: \`${inv.formal}\``);
      }
    }
  }

  // Add constructors
  if (witness.constructors !== undefined && witness.constructors.length > 0) {
    lines.push(' *');
    lines.push(' * @constructors');
    for (const ctor of witness.constructors) {
      const name = ctor.name ?? 'constructor';
      const desc = ctor.description ?? 'Creates a new instance';
      const trust = ctor.trust_level ?? 'safe';
      lines.push(` * - ${name} (${trust}): ${desc}`);
      if (ctor.precondition !== undefined) {
        lines.push(`   *   Precondition: ${ctor.precondition}`);
      }
    }
  }

  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generates witness code for a single spec witness.
 *
 * This includes:
 * - Branded type definition
 * - Validation factory (make/assert/is functions)
 * - Fast-check Arbitrary
 *
 * If generation fails, logs a warning and falls back to runtime-only validation.
 */
function generateWitnessCode(
  witness: SpecWitness,
  options: WitnessGeneratorOptions
): WitnessCodeResult {
  const warnings: WitnessWarning[] = [];
  const invariantAnalysis = witness.invariants.map(analyzeInvariant);
  // eslint-disable-next-line no-console -- console.warn is the appropriate default logger
  const logger = options.logger ?? console.warn;

  // Determine highest tier achieved
  const tiers: WitnessVerificationTier[] = invariantAnalysis.map((a) => a.tier);
  const highestTier = getHighestTier(tiers);

  // Convert to WitnessDefinition
  const definition = specWitnessToDefinition(witness);

  // Generate JSDoc
  const jsDoc = options.includeJsDoc !== false ? generateWitnessJsDoc(witness) : '';

  // Generate branded type
  let brandedType = '';
  let validationFactory = '';
  let arbitrary = '';
  let success = true;
  let error: string | undefined;

  try {
    brandedType = generateBrandedType(definition);
  } catch (e) {
    const message =
      e instanceof InvalidBaseTypeError
        ? `Invalid base type for ${witness.name}: ${e.reason}`
        : `Failed to generate branded type for ${witness.name}: ${String(e)}`;

    if (options.emitWarnings !== false) {
      logger(`Warning: ${message}`);
    }

    warnings.push({
      witnessName: witness.name,
      message,
      fellBackToRuntime: true,
    });

    // Fallback: Generate a type alias without branding
    brandedType = `type ${witness.name} = ${definition.baseType}; // Fallback: branding failed`;
    success = false;
    error = message;
  }

  // Generate validation factory
  if (options.generateValidationFactories !== false) {
    try {
      validationFactory = generateValidationFactory(definition, {
        includeJsDoc: options.includeJsDoc !== false,
      });
    } catch (e) {
      const message = `Failed to generate validation factory for ${witness.name}: ${String(e)}`;

      if (options.emitWarnings !== false) {
        logger(`Warning: ${message}`);
      }

      warnings.push({
        witnessName: witness.name,
        message,
        fellBackToRuntime: true,
      });

      // Fallback: Generate stub functions
      validationFactory = generateFallbackFactory(witness.name, definition.baseType);
      success = false;
      error = error ?? message;
    }
  }

  // Generate Arbitrary
  if (options.generateArbitraries !== false) {
    try {
      arbitrary = generateArbitrary(definition, {
        includeJsDoc: options.includeJsDoc !== false,
      });
    } catch (e) {
      const message = `Failed to generate Arbitrary for ${witness.name}: ${String(e)}`;

      if (options.emitWarnings !== false) {
        logger(`Warning: ${message}`);
      }

      warnings.push({
        witnessName: witness.name,
        message,
        fellBackToRuntime: false, // Arbitrary is optional
      });

      // Fallback: Generate a simple arbitrary without constraints
      arbitrary = generateFallbackArbitrary(witness.name, definition.baseType);
      // Don't mark as failure just for arbitrary generation
    }
  }

  const result: WitnessCodeResult = {
    name: witness.name,
    brandedType,
    validationFactory,
    arbitrary,
    invariantAnalysis,
    highestTier,
    jsDoc,
    success,
    warnings,
  };

  if (error !== undefined) {
    return { ...result, error };
  }

  return result;
}

/**
 * Returns the highest verification tier from a list.
 */
function getHighestTier(tiers: WitnessVerificationTier[]): WitnessVerificationTier {
  if (tiers.includes('proof')) {
    return 'proof';
  }
  if (tiers.includes('distinction')) {
    return 'distinction';
  }
  if (tiers.includes('runtime')) {
    return 'runtime';
  }
  return 'doc';
}

/**
 * Generates a fallback validation factory when normal generation fails.
 */
function generateFallbackFactory(name: string, baseType: string): string {
  return `// Fallback validation factory for ${name}
function make${name}(value: ${baseType}): ${name} | null {
  // Warning: Validation failed to generate, accepting all values
  return value as ${name};
}

function assert${name}(value: ${baseType}): ${name} {
  // Warning: Validation failed to generate, accepting all values
  return value as ${name};
}

function is${name}(value: unknown): value is ${name} {
  // Warning: Validation failed to generate, basic type check only
  return typeof value === '${getBaseTypeofCheck(baseType)}';
}`;
}

/**
 * Gets the typeof check string for a base type.
 */
function getBaseTypeofCheck(baseType: string): string {
  if (baseType === 'string') {
    return 'string';
  }
  if (baseType === 'number') {
    return 'number';
  }
  if (baseType === 'boolean') {
    return 'boolean';
  }
  if (baseType === 'bigint') {
    return 'bigint';
  }
  return 'object';
}

/**
 * Generates a fallback Arbitrary when normal generation fails.
 */
function generateFallbackArbitrary(name: string, baseType: string): string {
  const fcArb = getFallbackFcArbitrary(baseType);
  return `// Fallback arbitrary for ${name} (generation failed)
const arbitrary${name}: fc.Arbitrary<${name}> = ${fcArb} as fc.Arbitrary<${name}>;`;
}

/**
 * Gets a basic fast-check arbitrary for a base type.
 */
function getFallbackFcArbitrary(baseType: string): string {
  if (baseType === 'string') {
    return 'fc.string()';
  }
  if (baseType === 'number') {
    return 'fc.float({ noNaN: true })';
  }
  if (baseType === 'boolean') {
    return 'fc.boolean()';
  }
  if (baseType === 'bigint') {
    return 'fc.bigInt()';
  }
  if (baseType.endsWith('[]')) {
    return 'fc.array(fc.anything())';
  }
  return 'fc.anything()';
}

/**
 * Generates a witness verification tier report.
 */
function generateReport(
  results: readonly WitnessCodeResult[],
  warnings: readonly WitnessWarning[]
): WitnessVerificationReport {
  const tierBreakdown = {
    proof: 0,
    distinction: 0,
    runtime: 0,
    doc: 0,
  };

  let totalInvariants = 0;
  let fallbackCount = 0;

  for (const result of results) {
    for (const analysis of result.invariantAnalysis) {
      tierBreakdown[analysis.tier]++;
      totalInvariants++;
    }

    if (!result.success) {
      fallbackCount++;
    }
  }

  const compileTime = tierBreakdown.proof + tierBreakdown.distinction;
  const enforced = compileTime + tierBreakdown.runtime;

  return {
    totalWitnesses: results.length,
    totalInvariants,
    tierBreakdown,
    witnessResults: results,
    warnings,
    summary: {
      compileTimePercentage: totalInvariants > 0 ? (compileTime / totalInvariants) * 100 : 0,
      enforcedPercentage: totalInvariants > 0 ? (enforced / totalInvariants) * 100 : 0,
      fallbackCount,
    },
  };
}

/**
 * Generates TypeScript witness code from a specification.
 *
 * This function:
 * - Uses existing TypeScriptAdapter witness generation
 * - Generates branded type witnesses for all spec invariants marked as type-encodable
 * - Generates validation factory functions for runtime-only witnesses
 * - Generates fast-check Arbitrary instances for property testing
 * - Produces witness verification tier report showing proof/distinction/runtime/doc levels
 * - Falls back to runtime validation with logged warning on generation failures
 *
 * @param spec - The parsed specification.
 * @param options - Generation options.
 * @returns The generated code and verification report.
 *
 * @example
 * ```typescript
 * const spec = parseSpec(tomlContent);
 * const result = generateWitnessIntegration(spec, {
 *   generateValidationFactories: true,
 *   generateArbitraries: true,
 *   includeJsDoc: true,
 * });
 *
 * // Write the generated code
 * await fs.writeFile('witnesses.ts', result.code);
 *
 * // Check the verification report
 * console.log(`Compile-time guarantees: ${result.report.summary.compileTimePercentage}%`);
 * ```
 *
 * @example
 * Example: SortedArray<T> invariant -> branded type + fromUnsorted factory + isSorted validator
 * ```typescript
 * // Input spec witness:
 * // [witnesses.SortedArray]
 * // name = "SortedArray"
 * // base_type = "T[]"
 * // type_params = [{ name = "T" }]
 * // [[witnesses.SortedArray.invariants]]
 * // id = "sorted"
 * // description = "Elements are in ascending order"
 * // formal = "value.every((v, i, arr) => i === 0 || arr[i-1] <= v)"
 *
 * // Output:
 * type SortedArray<T> = T[] & { readonly __brand: unique symbol };
 *
 * function makeSortedArray<T>(value: T[]): SortedArray<T> | null {
 *   if (value.every((v, i, arr) => i === 0 || arr[i-1] <= v)) {
 *     return value as SortedArray<T>;
 *   }
 *   return null;
 * }
 *
 * // Plus assert, is functions and Arbitrary
 * ```
 */
export function generateWitnessIntegration(
  spec: Spec,
  options: WitnessGeneratorOptions = {}
): WitnessGenerationResult {
  const results: WitnessCodeResult[] = [];
  const allWarnings: WitnessWarning[] = [];

  // Process each witness in the spec
  if (spec.witnesses !== undefined) {
    for (const [_key, witness] of Object.entries(spec.witnesses)) {
      const result = generateWitnessCode(witness, options);
      results.push(result);
      allWarnings.push(...result.warnings);
    }
  }

  // Generate the verification report
  const report = generateReport(results, allWarnings);

  // Build the complete code output
  const codeLines: string[] = [
    '/**',
    ' * Generated type witnesses from spec.toml.',
    ' *',
    ' * This file was auto-generated by the Lattice phase witness generator.',
    ' * Do not edit manually.',
    ' *',
    ' * @packageDocumentation',
    ' */',
    '',
  ];

  // Add branded types section
  if (results.length > 0) {
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Branded Type Witnesses');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const result of results) {
      if (options.includeJsDoc !== false && result.jsDoc !== '') {
        codeLines.push(result.jsDoc);
      }
      codeLines.push(result.brandedType);
      codeLines.push('');
    }
  }

  // Add validation factories section
  if (options.generateValidationFactories !== false && results.length > 0) {
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Validation Factories');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const result of results) {
      if (result.validationFactory !== '') {
        codeLines.push(result.validationFactory);
        codeLines.push('');
      }
    }
  }

  // Add Arbitraries section
  if (options.generateArbitraries !== false && results.length > 0) {
    codeLines.push("import * as fc from 'fast-check';");
    codeLines.push('');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Fast-Check Arbitraries');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const result of results) {
      if (result.arbitrary !== '') {
        codeLines.push(result.arbitrary);
        codeLines.push('');
      }
    }
  }

  // Add verification report as a comment
  codeLines.push(
    '// ============================================================================='
  );
  codeLines.push('// Witness Verification Report');
  codeLines.push(
    '// ============================================================================='
  );
  codeLines.push('/*');
  codeLines.push(`Total Witnesses: ${String(report.totalWitnesses)}`);
  codeLines.push(`Total Invariants: ${String(report.totalInvariants)}`);
  codeLines.push('');
  codeLines.push('Tier Breakdown:');
  codeLines.push(`  - Proof (compile-time guarantee): ${String(report.tierBreakdown.proof)}`);
  codeLines.push(`  - Distinction (branded type): ${String(report.tierBreakdown.distinction)}`);
  codeLines.push(`  - Runtime (validation factory): ${String(report.tierBreakdown.runtime)}`);
  codeLines.push(`  - Doc (documentation only): ${String(report.tierBreakdown.doc)}`);
  codeLines.push('');
  codeLines.push('Summary:');
  codeLines.push(
    `  - Compile-time guarantees: ${report.summary.compileTimePercentage.toFixed(1)}%`
  );
  codeLines.push(`  - Enforced invariants: ${report.summary.enforcedPercentage.toFixed(1)}%`);
  codeLines.push(`  - Fallback count: ${String(report.summary.fallbackCount)}`);
  codeLines.push('*/');
  codeLines.push('');

  return {
    code: codeLines.join('\n'),
    witnesses: results,
    report,
    warnings: allWarnings,
  };
}

/**
 * Generates witness code for a specific domain, filtering by witness names.
 *
 * @param spec - The parsed specification.
 * @param witnessNames - Array of witness names to include.
 * @param options - Generation options.
 * @returns The generated code and verification report for the domain.
 */
export function generateDomainWitnessIntegration(
  spec: Spec,
  witnessNames: readonly string[],
  options: WitnessGeneratorOptions = {}
): WitnessGenerationResult {
  // Create a filtered spec with only the specified witnesses
  const filteredWitnesses: Record<string, SpecWitness> = {};

  if (spec.witnesses !== undefined) {
    for (const name of witnessNames) {
      const witness = spec.witnesses[name];
      if (witness !== undefined) {
        filteredWitnesses[name] = witness;
      }
    }
  }

  const hasWitnesses = Object.keys(filteredWitnesses).length > 0;
  const filteredSpec: Spec = {
    ...spec,
    ...(hasWitnesses ? { witnesses: filteredWitnesses } : {}),
  };

  // Remove witnesses from filtered spec if there are none
  if (!hasWitnesses) {
    delete filteredSpec.witnesses;
  }

  return generateWitnessIntegration(filteredSpec, options);
}

/**
 * Formats a witness verification report as a human-readable string.
 *
 * @param report - The verification report to format.
 * @returns A formatted string representation of the report.
 */
export function formatVerificationReport(report: WitnessVerificationReport): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║                        WITNESS VERIFICATION REPORT                           ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    `║ Total Witnesses: ${String(report.totalWitnesses).padEnd(59)}║`,
    `║ Total Invariants: ${String(report.totalInvariants).padEnd(58)}║`,
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    '║ TIER BREAKDOWN                                                               ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
  ];

  const tiers: [string, number, string][] = [
    ['Proof', report.tierBreakdown.proof, 'Compile-time type system guarantee'],
    ['Distinction', report.tierBreakdown.distinction, 'Branded type with validation'],
    ['Runtime', report.tierBreakdown.runtime, 'Validation factory enforcement'],
    ['Doc', report.tierBreakdown.doc, 'Documentation only'],
  ];

  for (const [name, count, desc] of tiers) {
    const bar = '█'.repeat(
      Math.min(30, Math.floor((count / Math.max(1, report.totalInvariants)) * 30))
    );
    lines.push(
      `║ ${name.padEnd(12)} ${String(count).padStart(4)} ${bar.padEnd(30)} ${desc.substring(0, 25).padEnd(25)}║`
    );
  }

  lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
  lines.push('║ SUMMARY                                                                      ║');
  lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
  lines.push(
    `║ Compile-time guarantees: ${report.summary.compileTimePercentage.toFixed(1).padStart(5)}%                                           ║`
  );
  lines.push(
    `║ Enforced invariants:     ${report.summary.enforcedPercentage.toFixed(1).padStart(5)}%                                           ║`
  );
  lines.push(
    `║ Fallback count:          ${String(report.summary.fallbackCount).padStart(5)}                                             ║`
  );

  if (report.warnings.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    lines.push('║ WARNINGS                                                                     ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    for (const warning of report.warnings.slice(0, 5)) {
      const msg = warning.message.substring(0, 74);
      lines.push(`║ • ${msg.padEnd(74)}║`);
    }
    if (report.warnings.length > 5) {
      lines.push(
        `║ ... and ${String(report.warnings.length - 5)} more warnings                                                  ║`
      );
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
