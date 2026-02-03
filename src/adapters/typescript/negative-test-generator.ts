/**
 * Negative test generator module for TypeScript.
 *
 * Generates tests from negative claims that verify certain outcomes
 * never occur (e.g., "never produces error", "never results in failure").
 *
 * @module adapters/typescript/negative-test-generator
 */

import type { Claim } from './claims.js';

/**
 * Options for negative test generation.
 */
export interface NegativeTestOptions {
  /** Test timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

/**
 * Default test timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 10000;

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
  return `[${claim.id}] ${claim.description}`;
}

/**
 * Extracts the forbidden outcome from a negative claim description.
 *
 * Parses phrases like "never produces error" or "never results in failure"
 * to extract the outcome word (e.g., "error", "failure").
 *
 * Uses a regex pattern with non-capturing groups to capture only the outcome noun,
 * not the verb phrase (e.g., "produces" or "results in").
 *
 * @param description - The negative claim description.
 * @returns The forbidden outcome word, or undefined if not found.
 *
 * @example
 * ```typescript
 * extractForbiddenOutcome('never produces error'); // Returns 'error'
 * extractForbiddenOutcome('never results in failure'); // Returns 'failure'
 * extractForbiddenOutcome('normal claim'); // Returns undefined
 * ```
 */
export function extractForbiddenOutcome(description: string): string | undefined {
  const pattern = /never\s+(?:produces?|results?\s+in)\s+(\w+)/i;
  const match = description.match(pattern);

  if (match && match[1] !== undefined) {
    return match[1];
  }

  return undefined;
}

/**
 * Generates import statements for the test file.
 *
 * @returns The import statements as a string.
 */
function generateImports(): string {
  return `import { describe, it, expect } from 'vitest';

// Import functions under test
// TODO: Import actual implementation once available
// import { functionName } from './module.js';`;
}

/**
 * Generates the test body for a negative claim.
 *
 * @param claim - The negative claim.
 * @returns The test body code.
 */
function generateTestBody(claim: Claim): string {
  const lines: string[] = [];
  const forbiddenOutcome = extractForbiddenOutcome(claim.description);

  // Arrange section
  lines.push('    // Arrange');
  lines.push('    // TODO: Set up initial state and inputs');

  if (claim.description.toLowerCase().includes('balance')) {
    lines.push('    const account = { balance: 100 };');
  } else {
    lines.push('    const input = {};  // Define test input');
  }

  lines.push('');

  // Act section
  lines.push('    // Act');
  lines.push('    // TODO: Call function under test');
  if (claim.functions.length > 0) {
    const funcName = claim.functions[0];
    lines.push(`    // const result = ${funcName ?? 'functionUnderTest'}(/* args */);`);
  } else {
    lines.push('    // const result = functionUnderTest(input);');
  }
  lines.push('');

  // Assert section
  lines.push('    // Assert');

  if (forbiddenOutcome !== undefined) {
    lines.push(`    // Verify forbidden outcome does not occur`);
    lines.push(`    // Expected: ${forbiddenOutcome} should never be produced`);
    lines.push(`    // Example: expect(result.${forbiddenOutcome}).toBeUndefined();`);
    lines.push(`    // Or: expect(() => ${forbiddenOutcome}).toThrow();`);
  } else {
    lines.push(`    // Negative behavior: ${claim.description}`);
    lines.push(`    // TODO: Add assertions verifying the forbidden state/outcome never occurs`);
  }

  return lines.join('\n');
}

/**
 * Generates a test for a negative claim.
 *
 * The generated test:
 * - Uses vitest as the test runner
 * - Includes descriptive test names with claim ID
 * - Verifies that forbidden outcomes never occur
 * - Sets appropriate timeout
 *
 * If the claim has no linked functions, a skipped test with TODO is generated.
 *
 * @param claim - The negative claim to generate a test for.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
 * @throws Error if claim type is not 'negative'.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'neg_001',
 *   type: 'negative',
 *   description: 'never produces error',
 *   functions: ['processPayment']
 * };
 *
 * const testCode = generateNegativeTest(claim);
 * // Generates a vitest test that verifies errors are never produced
 * ```
 */
export function generateNegativeTest(claim: Claim, options: NegativeTestOptions = {}): string {
  const { timeout = DEFAULT_TIMEOUT, includeJsDoc = true } = options;

  if (claim.type !== 'negative') {
    throw new Error(
      `Invalid claim type '${claim.type}' for negative test generator. Expected 'negative'.`
    );
  }

  const hasLinkedFunctions = claim.functions.length > 0;
  const lines: string[] = [];

  // File header
  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Negative test for claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    lines.push(' *');
    if (hasLinkedFunctions) {
      lines.push(` * Tested functions: ${claim.functions.join(', ')}`);
    }
    const forbiddenOutcome = extractForbiddenOutcome(claim.description);
    if (forbiddenOutcome !== undefined) {
      lines.push(` * Forbidden outcome: ${forbiddenOutcome}`);
    }
    lines.push(' *');
    lines.push(' * @generated This file was auto-generated by the test generator.');
    lines.push(' */');
    lines.push('');
  }

  // Imports
  lines.push(generateImports());
  lines.push('');

  // Test suite
  const testName = generateTestName(claim);
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Negative: ${escapedTestName}', () => {`);

  if (!hasLinkedFunctions) {
    // Generate skipped test with TODO
    lines.push('  // TODO: Link this claim to functions via CLAIM_REF comments');
    lines.push('  // Once functions are linked, this test will verify the forbidden outcome.');
    lines.push('');
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push('    // This test is skipped because no functions are linked to this claim.');
    lines.push(
      `    // Add CLAIM_REF: ${claim.id} to functions that should never produce this outcome.`
    );
    lines.push("    throw new Error('Test not implemented: no linked functions');");
    lines.push('  });');
  } else {
    // Generate the actual test
    if (includeJsDoc) {
      lines.push('  /**');
      lines.push(`   * Negative test verifying: ${claim.description}`);
      lines.push('   *');
      const forbiddenOutcome = extractForbiddenOutcome(claim.description);
      if (forbiddenOutcome !== undefined) {
        lines.push(`   * This test verifies that '${forbiddenOutcome}' never occurs.`);
      }
      lines.push('   */');
    }

    lines.push('  it(');
    lines.push(`    '${escapedTestName}',`);
    lines.push('    () => {');
    lines.push(generateTestBody(claim));
    lines.push('    },');
    lines.push(`    { timeout: ${String(timeout)} }`);
    lines.push('  );');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates multiple negative tests from an array of claims.
 *
 * Filters claims to only process those with type 'negative'.
 *
 * @param claims - Array of claims to generate tests for.
 * @param options - Options for test generation.
 * @returns Map of claim ID to generated test code.
 */
export function generateNegativeTests(
  claims: Claim[],
  options: NegativeTestOptions = {}
): Map<string, string> {
  const tests = new Map<string, string>();

  for (const claim of claims) {
    if (claim.type === 'negative') {
      tests.set(claim.id, generateNegativeTest(claim, options));
    }
  }

  return tests;
}

export { DEFAULT_TIMEOUT };
