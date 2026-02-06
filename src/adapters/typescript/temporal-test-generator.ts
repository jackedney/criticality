/**
 * Temporal test generator module for TypeScript.
 *
 * Generates tests that verify temporal properties (e.g., time-bounded invariants)
 * such as "after X, Y holds until Z" scenarios.
 *
 * @module adapters/typescript/temporal-test-generator
 */

import type { Claim } from './claims.js';
import { escapeString } from './utils.js';

/**
 * Options for temporal test generation.
 */
export interface TemporalTestOptions {
  /** Test timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
}

const DEFAULT_TIMEOUT = 30000;

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
 * Determines if a claim describes a state-change-after-event scenario.
 *
 * @param claim - The claim to analyze.
 * @returns True if claim involves state changes after an event.
 */
function isStateChangeAfterEvent(claim: Claim): boolean {
  const lowerDesc = claim.description.toLowerCase();
  return (
    lowerDesc.includes('after') ||
    lowerDesc.includes('until') ||
    lowerDesc.includes('within') ||
    lowerDesc.includes('before') ||
    lowerDesc.includes('expires')
  );
}

/**
 * Extracts time-based keywords from claim description.
 *
 * @param claim - The claim to analyze.
 * @returns Array of time-related keywords found.
 */
function extractTimeKeywords(claim: Claim): string[] {
  const keywords: string[] = [];
  const lowerDesc = claim.description.toLowerCase();

  const timePatterns = [
    { pattern: /(\d+)\s*ms/, keyword: 'millisecond' },
    { pattern: /(\d+)\s*seconds?\b/, keyword: 'second' },
    { pattern: /(\d+)\s*minutes?\b/, keyword: 'minute' },
    { pattern: /(\d+)\s*hours?\b/, keyword: 'hour' },
    { pattern: /(\d+)\s*days?\b/, keyword: 'day' },
  ];

  for (const { pattern, keyword } of timePatterns) {
    const match = pattern.exec(lowerDesc);
    if (match !== null) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

/**
 * Generates import statements for temporal test file.
 *
 * @param hasTimedOperations - Whether timed operations are used.
 * @returns The import statements as a string.
 */
function generateImports(hasTimedOperations: boolean): string {
  const lines: string[] = [];

  lines.push("import { describe, it, expect, vi } from 'vitest';");
  lines.push('');
  lines.push('// Import functions under test');
  lines.push('// TODO: Import actual implementation once available');
  lines.push("// import { functionName } from './module.js';");
  lines.push('');

  if (hasTimedOperations) {
    lines.push('// Vitest timers for testing temporal properties');
    lines.push('vi.useFakeTimers();');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates test body for a temporal claim.
 *
 * @param claim - The temporal claim.
 * @returns The test body code.
 */
function generateTestBody(claim: Claim): string {
  const lines: string[] = [];
  const timeKeywords = extractTimeKeywords(claim);
  const isStateChange = isStateChangeAfterEvent(claim);

  lines.push('    // Arrange: Set up initial state');
  lines.push('    // TODO: Initialize state based on claim requirements');
  lines.push('');

  const desc = claim.description.toLowerCase();

  if (desc.includes('session') && (desc.includes('valid') || desc.includes('expires'))) {
    lines.push('    const sessionCreationTime = Date.now();');
    lines.push('    const sessionDurationMs = 30 * 60 * 1000;');

    if (desc.includes('valid')) {
      lines.push('');
      lines.push('    // Act: Check session validity during valid period');
      lines.push('    const midSessionTime = sessionCreationTime + sessionDurationMs / 2;');
      lines.push('    const midIsValid = false;');
      lines.push('    // TODO: Call session validation function');
      lines.push('    // const isValid = validateSession(midSessionTime);');
      lines.push('');
      lines.push('    // Assert: Session should be valid');
      lines.push('    // expect(isValid).toBe(true);');
      lines.push("    console.log('Session valid at midpoint:', midIsValid);");
    }

    if (desc.includes('expires') || desc.includes('invalid')) {
      lines.push('');
      lines.push('    // Act: Check session invalidity after expiration');
      lines.push('    const afterExpirationTime = sessionCreationTime + sessionDurationMs + 1000;');
      lines.push('    const afterIsValid = false;');
      lines.push('    // TODO: Call session validation function');
      lines.push('    // const isValid = validateSession(afterExpirationTime);');
      lines.push('');
      lines.push('    // Assert: Session should be invalid');
      lines.push('    // expect(isValid).toBe(false);');
      lines.push("    console.log('Session invalid after expiration:', afterIsValid);");
    }
  } else if (desc.includes('timeout') && desc.includes('within')) {
    lines.push('    const timeoutMs = 5000;');
    lines.push('    const startTime = Date.now();');
    lines.push('');
    lines.push('    // Act: Start operation that should complete within timeout');
    lines.push('    // TODO: Call operation');
    lines.push('    // const promise = operationUnderTest();');
    lines.push('');
    lines.push('    // Assert: Operation completes before timeout');
    lines.push('    // await expect(promise).resolves.toBeDefined();');
    lines.push('    // const elapsed = Date.now() - startTime;');
    lines.push('    // expect(elapsed).toBeLessThan(timeoutMs);');
  } else if (desc.includes('once') && desc.includes('set')) {
    lines.push('    let valueSet = false;');
    lines.push('');
    lines.push('    // Act: Set value multiple times');
    lines.push('    // TODO: Call setter operation');
    lines.push('    // setValue(100);');
    lines.push('    // setValue(200);');
    lines.push('    // setValue(300);');
    lines.push('');
    lines.push('    // Assert: Value was only set once');
    lines.push('    // expect(valueSet).toBe(true);');
  } else {
    lines.push('    const initialState = {}; // TODO: Set up based on claim');
    lines.push('    const triggerEvent = {}; // TODO: Define trigger event');
    lines.push('');
    lines.push('    // Act: Trigger temporal scenario');
    lines.push('    // TODO: Call function that should respond to trigger');
    lines.push('    // const result = handleEvent(triggerEvent);');
    lines.push('');
    lines.push('    // Assert: Verify temporal property holds');
    if (isStateChange) {
      lines.push('    // Verify state changes according to temporal rules');
      lines.push('    // TODO: Add state change assertions');
      lines.push('    // expect(finalState).toEqual(expectedState);');
    } else {
      lines.push('    // TODO: Verify temporal constraint from claim');
      lines.push('    // expect(result).toBeDefined();');
    }
  }

  if (timeKeywords.length > 0) {
    lines.push('');
    lines.push(`    // Time constraints detected: ${timeKeywords.join(', ')};`);
  }

  return lines.join('\n');
}

/**
 * Generates a temporal test for a claim.
 *
 * The generated test verifies temporal properties such as:
 * - "after X, Y holds until Z" - time-bounded invariants
 * - "session valid for 30min" - expiration periods
 * - "timeout within 5s" - timing constraints
 * - "once set, never changes" - set-once semantics
 *
 * @param claim - The temporal claim to generate a test for.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
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
 * // Generates a vitest test checking session validity
 * // at creation, midpoint, and after expiration
 * ```
 *
 * @example
 * // Claim without clear temporal pattern generates skeleton
 * const unclearClaim: Claim = {
 *   id: 'temp_002',
 *   type: 'temporal',
 *   description: 'some temporal property',
 *   functions: []
 * };
 *
 * const testCode = generateTemporalTest(unclearClaim);
 * // Generates test skeleton with TODO markers
 */
export function generateTemporalTest(claim: Claim, options: TemporalTestOptions = {}): string {
  const { timeout = DEFAULT_TIMEOUT, includeJsDoc = true } = options;

  const lines: string[] = [];
  const timeKeywords = extractTimeKeywords(claim);

  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Temporal tests for claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    if (timeKeywords.length > 0) {
      lines.push(` * Time constraints: ${timeKeywords.join(', ')}`);
    }
    if (claim.functions.length > 0) {
      lines.push(` * Tested functions: ${claim.functions.join(', ')}`);
    }
    lines.push(' * @generated This file was auto-generated by temporal test generator.');
    lines.push(' */');
    lines.push('');
  }

  lines.push(generateImports(timeKeywords.length > 0));
  lines.push('');

  const testName = generateTestName(claim);
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Temporal: ${escapedTestName}', () => {`);

  if (claim.functions.length === 0) {
    lines.push('  // TODO: Link this claim to functions via CLAIM_REF comments');
    lines.push('  // Once functions are linked, this test will verify temporal properties');
    lines.push('');
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push('    // This test is skipped because no functions are linked to this claim.');
    lines.push(
      `    // Add CLAIM_REF: ${claim.id} to functions that should maintain this temporal property.`
    );
    lines.push('    throw new Error("Test not implemented: no linked functions");');
    lines.push('  });');
  } else {
    if (includeJsDoc) {
      lines.push('  /**');
      lines.push(`   * Temporal test verifying: ${claim.description}`);
      lines.push('   *');
      lines.push('   * This test verifies time-based constraints and state');
      lines.push('   * transitions described in temporal claim.');
      lines.push('   */');
    }

    lines.push(`  it('${escapedTestName}', () => {`);
    lines.push(generateTestBody(claim));
    lines.push(`  }, { timeout: ${String(timeout)} });`);

    if (claim.functions.length > 0) {
      lines.push('');
      lines.push('  // Individual function tests');
      for (const func of claim.functions) {
        const escapedFunc = escapeString(func);
        lines.push('');
        if (includeJsDoc) {
          lines.push('  /**');
          lines.push(`   * Verifies ${func} maintains temporal: ${claim.description}`);
          lines.push('   */');
        }
        lines.push(`  it('${escapedFunc} - temporal constraint', () => {`);
        lines.push(`    // TODO: Test ${func} specifically for temporal property`);
        lines.push('    // Arrange: Set up initial state');
        lines.push('    // Act: Call function with timing constraints');
        lines.push('    // Assert: Verify temporal property holds');
        lines.push(`  }, { timeout: ${String(timeout)} });`);
      }
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
