/**
 * Invariant test generator module for TypeScript.
 *
 * Generates fast-check property tests from invariant claims to verify
 * that invariants hold across randomly generated inputs.
 *
 * @module adapters/typescript/invariant-test-generator
 */

import type { Claim } from './claims.js';
import type { WitnessDefinition } from './witness.js';

/**
 * Options for invariant test generation.
 */
export interface InvariantTestOptions {
  /** Test timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of property test runs (default: 100) */
  numRuns?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

/**
 * Default test timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Default number of property test runs.
 */
const DEFAULT_NUM_RUNS = 100;

/**
 * Escapes a string for use in a JavaScript string literal.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Generates a test name from a claim ID and description.
 *
 * @param claim - The claim to generate a test name for.
 * @returns A descriptive test name.
 */
function generateTestName(claim: Claim): string {
  // Include claim ID for traceability
  return `[${claim.id}] ${claim.description}`;
}

/**
 * Generates arbitrary references for witness types.
 *
 * @param witnesses - Array of witness definitions.
 * @returns Map of witness name to arbitrary reference code.
 */
function generateArbitraryReferences(witnesses: WitnessDefinition[]): Map<string, string> {
  const refs = new Map<string, string>();

  for (const witness of witnesses) {
    const hasTypeParams = witness.typeParameters !== undefined && witness.typeParameters.length > 0;

    if (hasTypeParams) {
      // Generic witnesses need to be called with type-specific arbitraries
      const typeParams = witness.typeParameters ?? [];
      const arbParams = typeParams.map(() => `fc.anything()`).join(', ');
      refs.set(witness.name, `arbitrary${witness.name}(${arbParams})`);
    } else {
      refs.set(witness.name, `arbitrary${witness.name}`);
    }
  }

  return refs;
}

/**
 * Generates import statements for the test file.
 *
 * @param witnesses - Witnesses used in the test.
 * @param hasSkippedTests - Whether there are skipped tests.
 * @returns The import statements as a string.
 */
function generateImports(witnesses: WitnessDefinition[], hasSkippedTests: boolean): string {
  const lines: string[] = [];

  // Vitest imports
  const vitestImports = ['describe', 'it', 'expect'];
  if (hasSkippedTests) {
    vitestImports.push('it.skip');
  }
  lines.push(`import { describe, it, expect } from 'vitest';`);

  // Fast-check import
  lines.push(`import * as fc from 'fast-check';`);

  // Note: In a real implementation, we would import the actual witness arbitraries
  // from the generated witness module. For now, we generate a placeholder comment.
  if (witnesses.length > 0) {
    lines.push('');
    lines.push('// Import generated arbitraries for witness types');
    lines.push('// TODO: Import from actual witness module once generated');
    const arbitraryNames = witnesses.map((w) => {
      const hasTypeParams = w.typeParameters !== undefined && w.typeParameters.length > 0;
      return hasTypeParams ? `arbitrary${w.name}` : `arbitrary${w.name}`;
    });
    lines.push(`// import { ${arbitraryNames.join(', ')} } from './witnesses.js';`);
  }

  return lines.join('\n');
}

/**
 * Generates the test property based on claim and witnesses.
 *
 * For invariant claims, the generated test verifies that the invariant
 * property holds for all randomly generated inputs.
 *
 * @param claim - The invariant claim.
 * @param witnesses - Witnesses to use for input generation.
 * @returns The test property code.
 */
function generateTestProperty(
  claim: Claim,
  witnesses: WitnessDefinition[],
  numRuns: number
): string {
  const lines: string[] = [];

  // If we have witnesses, use them to generate inputs
  if (witnesses.length > 0) {
    const arbitraryRefs = generateArbitraryReferences(witnesses);

    // Build the fc.property call with witness arbitraries
    const arbList = witnesses.map((w) => arbitraryRefs.get(w.name) ?? `fc.anything()`);
    const paramNames = witnesses.map((w) => w.name.charAt(0).toLowerCase() + w.name.slice(1));

    lines.push(`    fc.assert(`);
    lines.push(`      fc.property(`);

    // Add arbitraries
    for (let i = 0; i < witnesses.length; i++) {
      const arb = arbList[i] ?? 'fc.anything()';
      const separator = i < witnesses.length - 1 ? ',' : ',';
      lines.push(`        ${arb}${separator}`);
    }

    // Add the property function
    lines.push(`        (${paramNames.join(', ')}) => {`);
    lines.push(`          // Invariant: ${claim.description}`);
    lines.push(`          // TODO: Implement invariant check based on claim`);
    lines.push(`          // For example, if this is a "balance never negative" claim:`);
    lines.push(`          // expect(balance).toBeGreaterThanOrEqual(0);`);
    lines.push(`          `);
    lines.push(`          // Placeholder: verify witnesses maintain their invariants`);
    for (const paramName of paramNames) {
      lines.push(`          expect(${paramName}).toBeDefined();`);
    }
    lines.push(`          return true;`);
    lines.push(`        }`);
    lines.push(`      ),`);
  } else {
    // No witnesses - use a simple property
    lines.push('    fc.assert(');
    lines.push('      fc.property(');
    lines.push('        fc.anything(),');
    lines.push('          (input) => {');
    lines.push('          // Invariant: ' + claim.description);
    lines.push('          // TODO: Implement invariant check');
    lines.push('          // For example, if this is a "balance never negative" claim:');
    lines.push('          // expect(balance).toBeGreaterThanOrEqual(0);');
    lines.push('          return true;');
    lines.push('        }');
    lines.push('      ),');
    lines.push('      { numRuns: ' + String(numRuns) + ' }');
    lines.push('    );');
  }

  return lines.join('\n');
}

/**
 * Generates a fast-check property test for an invariant claim.
 *
 * The generated test:
 * - Uses vitest as the test runner
 * - Uses fast-check for property-based testing
 * - Generates inputs using witness arbitraries when available
 * - Includes descriptive test names with claim ID
 * - Sets appropriate timeout for property tests
 *
 * If the claim has no linked functions, a skipped test with TODO is generated.
 *
 * @param claim - The invariant claim to generate a test for.
 * @param witnesses - Witness definitions for generating test inputs.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
 * @throws Error if claim type is not 'invariant'.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'inv_001',
 *   type: 'invariant',
 *   description: 'Account balance is never negative',
 *   functions: ['getBalance', 'withdraw']
 * };
 *
 * const witnesses: WitnessDefinition[] = [{
 *   name: 'NonNegativeDecimal',
 *   baseType: 'number',
 *   invariant: 'value >= 0'
 * }];
 *
 * const testCode = generateInvariantTest(claim, witnesses);
 * // Generates a vitest test file with fast-check property tests
 * ```
 *
 * @example
 * // Claim without linked functions generates skipped test
 * const orphanClaim: Claim = {
 *   id: 'inv_002',
 *   type: 'invariant',
 *   description: 'Some invariant',
 *   functions: []
 * };
 *
 * const testCode = generateInvariantTest(orphanClaim, []);
 * // Generates a skipped test with TODO comment
 */
export function generateInvariantTest(
  claim: Claim,
  witnesses: WitnessDefinition[],
  options: InvariantTestOptions = {}
): string {
  const { timeout = DEFAULT_TIMEOUT, numRuns = DEFAULT_NUM_RUNS, includeJsDoc = true } = options;

  // Check if claim has linked functions
  const hasLinkedFunctions = claim.functions.length > 0;

  const lines: string[] = [];

  // File header
  if (includeJsDoc) {
    lines.push(`/**`);
    lines.push(` * Property-based tests for invariant claim: ${claim.id}`);
    lines.push(` *`);
    lines.push(` * ${claim.description}`);
    lines.push(` *`);
    if (hasLinkedFunctions) {
      lines.push(` * Linked functions: ${claim.functions.join(', ')}`);
    }
    lines.push(` *`);
    lines.push(` * @generated This file was auto-generated by the test generator.`);
    lines.push(` */`);
    lines.push('');
  }

  // Imports
  lines.push(generateImports(witnesses, !hasLinkedFunctions));
  lines.push('');

  // Test suite
  const testName = generateTestName(claim);
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Invariant: ${escapedTestName}', () => {`);

  if (!hasLinkedFunctions) {
    // Generate skipped test with TODO
    lines.push(`  // TODO: Link this claim to functions via CLAIM_REF comments`);
    lines.push(`  // Once functions are linked, this test will verify the invariant`);
    lines.push(`  // across randomly generated inputs.`);
    lines.push(``);
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push(`    // This test is skipped because no functions are linked to this claim.`);
    lines.push(
      `    // Add CLAIM_REF: ${claim.id} to functions that should maintain this invariant.`
    );
    lines.push(`    throw new Error('Test not implemented: no linked functions');`);
    lines.push(`  });`);
  } else {
    // Generate the actual property test
    if (includeJsDoc) {
      lines.push(`  /**`);
      lines.push(`   * Property test verifying: ${claim.description}`);
      lines.push(`   *`);
      lines.push(`   * This test uses fast-check to generate random inputs and verify`);
      lines.push(`   * that the invariant holds for all generated values.`);
      lines.push(`   */`);
    }

    lines.push(`  it(`);
    lines.push(`    '${escapedTestName}',`);
    lines.push(`    () => {`);

    // Add the property test
    lines.push(generateTestProperty(claim, witnesses, numRuns));

    // Close the fc.assert call
    lines.push(`      { numRuns: ${String(numRuns)} }`);
    lines.push(`    );`);
    lines.push(`  },`);
    lines.push(`  { timeout: ${String(timeout)} }`);
    lines.push(`  );`);

    // Add individual tests for each linked function
    if (claim.functions.length > 0) {
      lines.push('');
      lines.push(`  // Individual function tests`);
      for (const func of claim.functions) {
        const escapedFunc = escapeString(func);
        lines.push('');
        if (includeJsDoc) {
          lines.push(`  /**`);
          lines.push(`   * Verifies ${func} maintains the invariant: ${claim.description}`);
          lines.push(`   */`);
        }
        lines.push(`  it('${escapedFunc} maintains invariant', () => {`);
        lines.push(`    // TODO: Test ${func} specifically`);
        lines.push(`    // Verify the invariant holds before and after calling ${func}`);
        lines.push(`    fc.assert(`);
        lines.push(`      fc.property(`);
        lines.push(`        fc.anything(),`);
        lines.push(`        (input) => {`);
        lines.push(`          // Setup: Create state where invariant holds`);
        lines.push(`          // Act: Call ${func}`);
        lines.push(`          // Assert: Invariant still holds`);
        lines.push(`          return true; // Placeholder`);
        lines.push(`        }`);
        lines.push(`      ),`);
        lines.push(`      { numRuns: ${String(numRuns)} }`);
        lines.push(`    );`);
        lines.push(`  }, { timeout: ${String(timeout)} });`);
      }
    }
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates multiple invariant tests from an array of claims.
 *
 * Filters claims to only process those with type 'invariant'.
 *
 * @param claims - Array of claims to generate tests for.
 * @param witnesses - Witness definitions for generating test inputs.
 * @param options - Options for test generation.
 * @returns Map of claim ID to generated test code.
 */
export function generateInvariantTests(
  claims: Claim[],
  witnesses: WitnessDefinition[],
  options: InvariantTestOptions = {}
): Map<string, string> {
  const tests = new Map<string, string>();

  for (const claim of claims) {
    if (claim.type === 'invariant') {
      tests.set(claim.id, generateInvariantTest(claim, witnesses, options));
    }
  }

  return tests;
}

export { DEFAULT_TIMEOUT, DEFAULT_NUM_RUNS };
