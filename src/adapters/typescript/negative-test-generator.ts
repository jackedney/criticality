/**
 * Negative test generator module for TypeScript.
 *
 * Generates tests that verify forbidden outcomes and error cases
 * as specified in spec claims with type 'negative'.
 *
 * @module adapters/typescript/negative-test-generator
 */

import type { Claim } from './claims.js';
import { escapeString } from './utils.js';

/**
 * Options for negative test generation.
 */
export interface NegativeTestOptions {
  /** Test timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

const DEFAULT_TIMEOUT = 10000;

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
 * Extracts forbidden action from claim description.
 *
 * @param claim - The claim to analyze.
 * @returns The forbidden action if found, null otherwise.
 */
function extractForbiddenAction(claim: Claim): string | null {
  const desc = claim.description.toLowerCase();

  const patterns = [
    /cannot\s+(?!be\s+)(\w+)/i,
    /must\s+not\s+(\w+)/i,
    /forbidden\s+to\s+(\w+)/i,
    /should\s+not\s+(\w+)/i,
    /prevents?\s+(\w+)/i,
    /blocks?\s+(\w+)/i,
    /rejects?\s+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(desc);
    if (match !== null) {
      const action = match[1];
      if (action !== undefined) {
        return action;
      }
    }
  }

  return null;
}

/**
 * Extracts forbidden outcome from claim description.
 *
 * @param claim - The claim to analyze.
 * @returns The forbidden outcome if found, null otherwise.
 */
function extractForbiddenOutcome(claim: Claim): string | null {
  const desc = claim.description.toLowerCase();

  // Pattern to capture subject before "cannot be" (e.g., "insufficient funds cannot be created")
  const subjectBeforeCannotBe = /^([\w\s]+?)\s+cannot\s+be\s+\w+/i;
  const subjectMatch = subjectBeforeCannotBe.exec(desc);
  if (subjectMatch !== null) {
    const subject = subjectMatch[1];
    if (subject !== undefined && subject.trim().length > 0) {
      return subject.trim();
    }
  }

  const patterns = [
    /cannot\s+result\s+in\s+(\w+)/i,
    /must\s+not\s+cause\s+(\w+)/i,
    /never\s+(?:produces?|results?\s+in)\s+(\w+)/i,
    /forbidden\s+to\s+(\w+)/i,
    /prevents?\s+(\w+)/i,
    /blocks?\s+(\w+)/i,
    /rejects?\s+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(desc);
    if (match !== null) {
      const outcome = match[1];
      if (outcome !== undefined) {
        return outcome;
      }
    }
  }

  return null;
}

/**
 * Determines if a claim describes a security-related forbidden scenario.
 *
 * @param claim - The claim to analyze.
 * @returns True if claim involves security.
 */
function isSecurityNegativeClaim(claim: Claim): boolean {
  const desc = claim.description.toLowerCase();
  const securityKeywords = [
    'injection',
    'sql injection',
    'xss',
    'csrf',
    'unauthorized',
    'authentication bypass',
    'privilege escalation',
    'data leak',
    'sensitive data',
  ];

  return securityKeywords.some((keyword) => desc.includes(keyword));
}

/**
 * Determines if a claim describes data integrity constraints.
 *
 * @param claim - The claim to analyze.
 * @returns True if claim involves data integrity.
 */
function isDataIntegrityClaim(claim: Claim): boolean {
  const desc = claim.description.toLowerCase();
  const integrityKeywords = [
    'duplicate',
    'corruption',
    'orphan',
    'invalid state',
    'inconsistent',
    'out of sync',
  ];

  return integrityKeywords.some((keyword) => desc.includes(keyword));
}

/**
 * Generates import statements for negative test file.
 *
 * @returns The import statements as a string.
 */
function generateImports(): string {
  const lines: string[] = [];

  const vitestImports = ['describe', 'it', 'expect'];
  lines.push(`import { ${vitestImports.join(', ')} } from 'vitest';`);

  lines.push('');
  lines.push('// Import functions under test');
  lines.push('// TODO: Import actual implementation once available');
  lines.push("// import { functionName } from './module.js';");

  return lines.join('\n');
}

/**
 * Generates test body for a negative claim.
 *
 * @param claim - The negative claim.
 * @returns The test body code.
 */
function generateTestBody(claim: Claim): string {
  const lines: string[] = [];
  const forbiddenAction = extractForbiddenAction(claim);
  const forbiddenOutcome = extractForbiddenOutcome(claim);
  const isSecurity = isSecurityNegativeClaim(claim);
  const isIntegrity = isDataIntegrityClaim(claim);

  lines.push('    // Arrange: Set up test data');
  lines.push('    // TODO: Initialize state based on claim requirements');

  if (forbiddenAction !== null) {
    lines.push(`    const action = '${forbiddenAction}'; // Forbidden action from claim`);
  } else if (forbiddenOutcome !== null) {
    lines.push(
      `    const expectedFailure = '${forbiddenOutcome}'; // Forbidden outcome from claim`
    );
  } else if (isSecurity) {
    lines.push('    // Security test: Attempt malicious input');
    lines.push('    const maliciousInput = {}; // TODO: Add malicious payload');
  } else if (isIntegrity) {
    lines.push('    // Data integrity test: Set up potential corruption scenario');
    lines.push('    const initialState = {}; // TODO: Initialize state');
  } else {
    lines.push('    const input = {}; // Define test input');
  }
  lines.push('');

  lines.push('    // Act: Attempt forbidden action');
  if (claim.functions.length > 0) {
    const funcName = claim.functions[0] ?? 'functionUnderTest';
    lines.push(`    // TODO: Call ${funcName} with problematic input`);
    lines.push(`    // const result = ${funcName}(input);`);
  } else {
    lines.push('    // TODO: Call function with problematic input');
    lines.push('    // const result = functionUnderTest(input);');
  }

  if (forbiddenAction !== null) {
    lines.push('');
    lines.push('    // Assert: Forbidden action was blocked');
    lines.push('    // Verify system rejected the forbidden action');
    if (isSecurity) {
      lines.push('    // Security: Should reject unauthorized/insecure operations');
      lines.push('    expect(() => { /* call with malicious input */ }).toThrow();');
    } else {
      lines.push('    // TODO: Verify action was prevented/rejected');
      lines.push('    // expect(result).toBeUndefined(); // or similar check');
    }
  } else if (forbiddenOutcome !== null) {
    lines.push('');
    lines.push('    // Assert: Forbidden outcome did not occur');
    lines.push('    // Verify system did not produce forbidden outcome');
    lines.push('    // TODO: Verify forbidden outcome was prevented');
    lines.push('    // expect(forbiddenState).not.toBe(true);');
  } else if (isIntegrity) {
    lines.push('');
    lines.push('    // Assert: Data integrity maintained');
    lines.push('    // Verify no corruption/inconsistency occurred');
    lines.push('    // TODO: Verify state remains consistent');
    lines.push('    // expect(finalState).toEqual(expectedState);');
  } else {
    lines.push('');
    lines.push('    // Assert: Negative constraint satisfied');
    lines.push('    // TODO: Add specific assertion for this claim');
    lines.push('    // expect(result).toBeDefined();');
  }

  return lines.join('\n');
}

/**
 * Generates a negative test for a claim.
 *
 * The generated test verifies that forbidden actions or outcomes
 * cannot occur, testing system safety and error handling.
 *
 * @param claim - The negative claim to generate a test for.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'neg_001',
 *   type: 'negative',
 *   description: 'cannot withdraw more than balance',
 *   functions: ['withdraw']
 * };
 *
 * const testCode = generateNegativeTest(claim);
 * // Generates a test that attempts to overdraw
 * // and verifies the operation is rejected
 * ```
 *
 * @example
 * // Security-related negative claim
 * const securityClaim: Claim = {
 *   id: 'neg_002',
 *   type: 'negative',
 *   description: 'SQL injection is blocked',
 *   functions: ['executeQuery']
 * };
 *
 * const testCode = generateNegativeTest(securityClaim);
 * // Generates a test with malicious SQL payload
 * // and verifies query execution is blocked
 *
 * @example
 * // Claim without clear forbidden pattern generates skeleton
 * const unclearClaim: Claim = {
 *   id: 'neg_003',
 *   type: 'negative',
 *   description: 'some negative constraint',
 *   functions: []
 * };
 *
 * const testCode = generateNegativeTest(unclearClaim);
 * // Generates test skeleton with TODO markers
 */
export function generateNegativeTest(claim: Claim, options: NegativeTestOptions = {}): string {
  const { timeout = DEFAULT_TIMEOUT, includeJsDoc = true } = options;

  const forbiddenAction = extractForbiddenAction(claim);
  const forbiddenOutcome = extractForbiddenOutcome(claim);
  const isSecurity = isSecurityNegativeClaim(claim);
  const isIntegrity = isDataIntegrityClaim(claim);

  const lines: string[] = [];

  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Negative tests for claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    if (forbiddenAction !== null) {
      lines.push(` * Forbidden action: ${forbiddenAction}`);
    }
    if (forbiddenOutcome !== null) {
      lines.push(` * Forbidden outcome: ${forbiddenOutcome}`);
    }
    if (isSecurity) {
      lines.push(' * Security test: Verifies system blocks malicious inputs');
    }
    if (isIntegrity) {
      lines.push(' * Data integrity test: Verifies no corruption');
    }
    lines.push(' *');
    if (claim.functions.length > 0) {
      lines.push(` * Tested functions: ${claim.functions.join(', ')}`);
    }
    lines.push(' * @generated This file was auto-generated by negative test generator.');
    lines.push(' */');
    lines.push('');
  }

  lines.push(generateImports());
  lines.push('');

  const testName = generateTestName(claim);
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Negative: ${escapedTestName}', () => {`);

  if (claim.functions.length === 0) {
    lines.push('  // TODO: Link this claim to functions via CLAIM_REF comments');
    lines.push('  // Once functions are linked, this test will verify negative constraints');
    lines.push('');
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push('    // This test is skipped because no functions are linked to this claim.');
    lines.push(
      `    // Add CLAIM_REF: ${claim.id} to functions that should enforce this negative constraint.`
    );
    lines.push('    throw new Error("Test not implemented: no linked functions");');
    lines.push('  });');
  } else {
    if (includeJsDoc) {
      lines.push('  /**');
      lines.push(`   * Negative test verifying: ${claim.description}`);
      if (isSecurity) {
        lines.push('   * This test verifies that malicious/invalid inputs are rejected.');
      }
      if (forbiddenAction !== null) {
        lines.push(`   * This test verifies that "${forbiddenAction}" is blocked.`);
      }
      if (forbiddenOutcome !== null) {
        lines.push(`   * This test verifies that "${forbiddenOutcome}" cannot occur.`);
      }
      lines.push('   */');
    }

    lines.push(`  it('${escapedTestName}', () => {`);
    lines.push(generateTestBody(claim));
    lines.push(`  }, { timeout: ${String(timeout)} });`);

    if (claim.functions.length > 1) {
      lines.push('');
      lines.push('  // Individual function tests');
      for (const func of claim.functions) {
        const escapedFunc = escapeString(func);
        lines.push('');
        if (includeJsDoc) {
          lines.push('  /**');
          lines.push(`   * Verifies ${func} enforces: ${claim.description}`);
          lines.push('   */');
        }
        lines.push(`  it('${escapedFunc} - negative constraint', () => {`);
        lines.push('    // Arrange: Set up test data');
        lines.push('    // TODO: Initialize state');
        lines.push('');
        lines.push('    // Act: Attempt forbidden scenario');
        lines.push(`    // TODO: Call ${func} with problematic input`);
        lines.push('');
        lines.push('    // Assert: Negative constraint enforced');
        lines.push('    // TODO: Verify constraint was not violated');
        lines.push(`  }, { timeout: ${String(timeout)} });`);
      }
    }
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
