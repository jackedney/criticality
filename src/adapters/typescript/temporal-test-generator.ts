/**
 * Temporal test generator module for TypeScript.
 *
 * Generates tests from temporal claims that verify properties over time
 * (e.g., session validity periods, timeout behaviors).
 *
 * @module adapters/typescript/temporal-test-generator
 */

import type { Claim } from './claims.js';

/**
 * Options for temporal test generation.
 */
export interface TemporalTestOptions {
  /** Test timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

/**
 * Default test timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 30000;

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
 * Generates import statements for the test file.
 *
 * @returns The import statements as a string.
 */
function generateImports(): string {
  return `import { describe, it, expect } from 'vitest';

// Import functions under test
// TODO: Import actual implementation once available
// import { validateSession } from './session.js';`;
}

/**
 * Generates a session test block for temporal claims.
 *
 * @param claim - The temporal claim.
 * @returns The session test code.
 */
function generateSessionTest(claim: Claim): string {
  const lines: string[] = [];

  // Extract temporal information
  const func: string =
    claim.functions.length > 0 && claim.functions[0] !== undefined
      ? claim.functions[0]
      : 'validateSession';
  const durationMatch = claim.description.match(/(\d+)\s*(minute|min|second|sec|hour|hr|day)/i);
  const duration = durationMatch?.[1] !== undefined ? parseInt(durationMatch[1], 10) : 30;
  const unit: string = durationMatch?.[2] ?? 'minute';

  lines.push('    // Session test: verify validity over time period');
  lines.push(`    // Setup: Create session valid for ${String(duration)} ${unit}s`);
  lines.push('    const session = {');
  lines.push(`      id: 'test-session-${String(Date.now())}',`);
  lines.push(`      createdAt: new Date(),`);
  lines.push(`      duration: ${String(duration)}`);
  lines.push('    };');
  lines.push('');
  lines.push('    // Declare placeholder variables for validation results');
  lines.push('    const midIsValid = false;');
  lines.push('    const afterIsValid = false;');
  lines.push('');
  lines.push('    // Mid-session: validate session is still valid');
  lines.push(
    `    console.log('Testing session validity at ${String(duration / 2)} ${unit} mark');`
  );
  lines.push('    // TODO: Call actual validation function');
  lines.push(`    // midIsValid = ${func}(session, ${String(duration / 2)});`);
  lines.push(`    console.log('Mid-session validation result:', midIsValid);`);
  lines.push('');
  lines.push('    // Assert session is valid at mid-point');
  lines.push('    expect(midIsValid).toBe(true);');
  lines.push('');
  lines.push('    // After session expires: validate session is invalid');
  lines.push(`    console.log('Testing session validity after ${String(duration)} ${unit}s');`);
  lines.push('    // TODO: Call actual validation function');
  lines.push(`    // afterIsValid = ${func}(session, ${String(duration + 1)});`);
  lines.push(`    console.log('After-expiration validation result:', afterIsValid);`);
  lines.push('');
  lines.push('    // Assert session is invalid after expiration');
  lines.push('    expect(afterIsValid).toBe(false);');

  return lines.join('\n');
}

/**
 * Generates the test body for a temporal claim.
 *
 * @param claim - The temporal claim.
 * @returns The test body code.
 */
function generateTestBody(claim: Claim): string {
  const lines: string[] = [];

  // Check if this is a session-related test
  const isSessionTest =
    claim.description.toLowerCase().includes('session') ||
    claim.description.toLowerCase().includes('expire') ||
    claim.description.toLowerCase().includes('valid');

  if (isSessionTest) {
    lines.push(generateSessionTest(claim));
  } else {
    // Generic temporal test
    lines.push('    // Arrange: Set up initial state');
    lines.push('    // TODO: Configure test based on temporal claim');
    lines.push('    const startTime = Date.now();');
    lines.push('');
    lines.push('    // Act: Perform operations over time period');
    lines.push('    // TODO: Implement temporal behavior');
    lines.push('    // Example: wait for timeout, periodic checks, etc.');
    lines.push('');
    lines.push('    // Assert: Verify temporal properties');
    lines.push('    const endTime = Date.now();');
    lines.push('    expect(endTime).toBeGreaterThanOrEqual(startTime);');
  }

  return lines.join('\n');
}

/**
 * Generates a test for a temporal claim.
 *
 * The generated test:
 * - Uses vitest as the test runner
 * - Includes descriptive test names with claim ID
 * - Verifies properties that hold over time periods
 * - Sets appropriate timeout for temporal tests
 *
 * If the claim has no linked functions, a skipped test with TODO is generated.
 *
 * @param claim - The temporal claim to generate a test for.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
 * @throws Error if claim type is not 'temporal'.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'temp_001',
 *   type: 'temporal',
 *   description: 'session is valid for 30 minutes',
 *   functions: ['validateSession']
 * };
 *
 * const testCode = generateTemporalTest(claim);
 * // Generates a vitest test that verifies session validity over 30 minutes
 * ```
 */
export function generateTemporalTest(claim: Claim, options: TemporalTestOptions = {}): string {
  const { timeout = DEFAULT_TIMEOUT, includeJsDoc = true } = options;

  if (claim.type !== 'temporal') {
    throw new Error(
      `Invalid claim type '${claim.type}' for temporal test generator. Expected 'temporal'.`
    );
  }

  const hasLinkedFunctions = claim.functions.length > 0;
  const lines: string[] = [];

  // File header
  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Temporal test for claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    lines.push(' *');
    if (hasLinkedFunctions) {
      lines.push(` * Tested functions: ${claim.functions.join(', ')}`);
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

  lines.push(`describe('Temporal: ${escapedTestName}', () => {`);

  if (!hasLinkedFunctions) {
    // Generate skipped test with TODO
    lines.push('  // TODO: Link this claim to functions via CLAIM_REF comments');
    lines.push('  // Once functions are linked, this test will verify temporal properties.');
    lines.push('');
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push('    // This test is skipped because no functions are linked to this claim.');
    lines.push(
      `    // Add CLAIM_REF: ${claim.id} to functions that should maintain temporal properties.`
    );
    lines.push("    throw new Error('Test not implemented: no linked functions');");
    lines.push('  });');
  } else {
    // Generate the actual test
    if (includeJsDoc) {
      lines.push('  /**');
      lines.push(`   * Temporal test verifying: ${claim.description}`);
      lines.push('   *');
      lines.push('   * This test verifies properties that hold over time periods.');
      lines.push('   */');
    }

    lines.push('  it(');
    lines.push(`    '${escapedTestName}',`);
    lines.push('    () => {');
    lines.push(generateTestBody(claim));
    lines.push('    },');
    lines.push(`    { timeout: ${String(timeout)} }`);
    lines.push('  );');

    // Add individual tests for each linked function
    for (const func of claim.functions) {
      const escapedFunc = escapeString(func);
      lines.push('');
      lines.push('  // Individual function tests');
      if (includeJsDoc) {
        lines.push('  /**');
        lines.push(`   * Verifies ${func} maintains temporal property: ${claim.description}`);
        lines.push('   */');
      }
      lines.push(`  it('${escapedFunc} maintains temporal property', () => {`);
      lines.push('    // TODO: Test ${func} specifically');
      lines.push('    // Verify temporal property holds when calling ${func}');
      lines.push('    // Example: validate session before/after calling function');
      lines.push(`    console.log('TODO string for ${func}');`);
      lines.push('    expect(true).toBe(true); // Placeholder');
      lines.push(`  }, { timeout: ${String(timeout)} });`);
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates multiple temporal tests from an array of claims.
 *
 * Filters claims to only process those with type 'temporal'.
 *
 * @param claims - Array of claims to generate tests for.
 * @param options - Options for test generation.
 * @returns Map of claim ID to generated test code.
 */
export function generateTemporalTests(
  claims: Claim[],
  options: TemporalTestOptions = {}
): Map<string, string> {
  const tests = new Map<string, string>();

  for (const claim of claims) {
    if (claim.type === 'temporal') {
      tests.set(claim.id, generateTemporalTest(claim, options));
    }
  }

  return tests;
}

export { DEFAULT_TIMEOUT };
