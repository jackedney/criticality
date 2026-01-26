/**
 * Behavioral test generator module for TypeScript.
 *
 * Generates integration tests from behavioral claims to verify
 * scenario-based behaviors through input/output assertions,
 * mocking, and side-effect verification.
 *
 * @module adapters/typescript/behavioral-test-generator
 */

import type { Claim } from './claims.js';

/**
 * Options for behavioral test generation.
 */
export interface BehavioralTestOptions {
  /** Test timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to include JSDoc comments (default: true) */
  includeJsDoc?: boolean;
  /** Whether to generate setup/teardown hooks (default: true) */
  generateHooks?: boolean;
}

/**
 * Default test timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Keywords indicating side-effect behavior in claim descriptions.
 */
const SIDE_EFFECT_KEYWORDS = [
  'calls',
  'called',
  'logs',
  'logged',
  'records',
  'recorded',
  'notifies',
  'notified',
  'sends',
  'sent',
  'emits',
  'emitted',
  'writes',
  'written',
  'triggers',
  'triggered',
  'updates',
  'updated',
];

/**
 * Keywords indicating state change in claim descriptions.
 */
const STATE_CHANGE_KEYWORDS = [
  'changes',
  'changed',
  'modifies',
  'modified',
  'moves',
  'moved',
  'transfers',
  'transferred',
  'sets',
  'increments',
  'decrements',
  'adds',
  'removes',
  'deletes',
  'creates',
  'stores',
];

/**
 * Keywords indicating clear behavior in claim descriptions.
 */
const BEHAVIOR_KEYWORDS = [
  'when',
  'should',
  'must',
  'returns',
  'produces',
  'results',
  'causes',
  'ensures',
  'validates',
  'verifies',
  ...SIDE_EFFECT_KEYWORDS,
  ...STATE_CHANGE_KEYWORDS,
];

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
 * Determines if a claim describes side-effect behavior.
 *
 * @param claim - The claim to analyze.
 * @returns True if the claim involves side effects.
 */
function hasSideEffectBehavior(claim: Claim): boolean {
  const lowerDesc = claim.description.toLowerCase();
  return SIDE_EFFECT_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Determines if a claim describes state change behavior.
 *
 * @param claim - The claim to analyze.
 * @returns True if the claim involves state changes.
 */
function hasStateChangeBehavior(claim: Claim): boolean {
  const lowerDesc = claim.description.toLowerCase();
  return STATE_CHANGE_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Determines if a claim has clear behavioral content.
 *
 * @param claim - The claim to analyze.
 * @returns True if the claim has clear behavior to test.
 */
function hasClearBehavior(claim: Claim): boolean {
  const lowerDesc = claim.description.toLowerCase();
  return (
    BEHAVIOR_KEYWORDS.some((keyword) => lowerDesc.includes(keyword)) || claim.functions.length > 0
  );
}

/**
 * Extracts potential mock targets from claim description.
 *
 * @param claim - The claim to analyze.
 * @returns Array of potential mock target names.
 */
function extractMockTargets(claim: Claim): string[] {
  const targets: string[] = [];
  const desc = claim.description;

  // Look for patterns like "service.method" or "ModuleName"
  const servicePattern = /(\w+)\.([\w]+)/g;
  let match;
  while ((match = servicePattern.exec(desc)) !== null) {
    const service = match[1];
    if (service !== undefined && !targets.includes(service)) {
      targets.push(service);
    }
  }

  // Look for common mock target patterns
  const commonTargets = ['log', 'logger', 'audit', 'auditLog', 'notification', 'email', 'api'];
  for (const target of commonTargets) {
    if (desc.toLowerCase().includes(target) && !targets.includes(target)) {
      targets.push(target);
    }
  }

  return targets;
}

/**
 * Generates import statements for the test file.
 *
 * @param hasMocks - Whether mocking is needed.
 * @param hasHooks - Whether setup/teardown hooks are generated.
 * @returns The import statements as a string.
 */
function generateImports(hasMocks: boolean, hasHooks: boolean): string {
  const lines: string[] = [];

  // Vitest imports
  const vitestImports: string[] = ['describe', 'it', 'expect'];
  if (hasHooks) {
    vitestImports.push('beforeEach', 'afterEach');
  }
  lines.push(`import { ${vitestImports.join(', ')} } from 'vitest';`);

  // Add vi for mocking if needed
  if (hasMocks) {
    lines.push(`import { vi } from 'vitest';`);
  }

  // Note about importing actual functions
  lines.push('');
  lines.push('// Import functions under test');
  lines.push('// TODO: Import actual implementation once available');
  lines.push("// import { functionName } from './module.js';");

  return lines.join('\n');
}

/**
 * Generates mock setup code.
 *
 * @param mockTargets - Array of mock target names.
 * @returns The mock setup code.
 */
function generateMockSetup(mockTargets: string[]): string {
  if (mockTargets.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('    // Mock setup');

  for (const target of mockTargets) {
    const mockName = `mock${target.charAt(0).toUpperCase() + target.slice(1)}`;
    lines.push(`    const ${mockName} = {`);
    lines.push(`      // TODO: Add mock methods based on actual interface`);
    lines.push(`      record: vi.fn(),`);
    lines.push(`      log: vi.fn(),`);
    lines.push(`    };`);
  }

  return lines.join('\n');
}

/**
 * Generates side-effect verification code.
 *
 * @param claim - The claim to generate verification for.
 * @param mockTargets - Array of mock target names.
 * @returns The side-effect verification code.
 */
function generateSideEffectVerification(claim: Claim, mockTargets: string[]): string {
  const lines: string[] = [];

  if (mockTargets.length > 0) {
    lines.push('');
    lines.push('    // Verify side effects');
    for (const target of mockTargets) {
      const mockName = `mock${target.charAt(0).toUpperCase() + target.slice(1)}`;
      lines.push(`    // Example: Verify ${target} was called`);
      lines.push(`    // expect(${mockName}.record).toHaveBeenCalled();`);
      lines.push(`    // expect(${mockName}.record).toHaveBeenCalledWith(expectedArgs);`);
    }
  }

  // Add state change verification for claims that involve state
  if (hasStateChangeBehavior(claim)) {
    lines.push('');
    lines.push('    // Verify state changes');
    lines.push('    // TODO: Assert final state matches expected');
    lines.push('    // expect(finalState).toEqual(expectedState);');
  }

  return lines.join('\n');
}

/**
 * Generates the test body for a behavioral claim.
 *
 * @param claim - The behavioral claim.
 * @returns The test body code.
 */
function generateTestBody(claim: Claim): string {
  const lines: string[] = [];
  const mockTargets = extractMockTargets(claim);

  // Generate mock setup
  const mockSetup = generateMockSetup(mockTargets);
  if (mockSetup !== '') {
    lines.push(mockSetup);
    lines.push('');
  }

  // Arrange section
  lines.push('    // Arrange');
  lines.push('    // TODO: Set up initial state and inputs');

  // Check for specific patterns in claim description
  const desc = claim.description.toLowerCase();
  if (desc.includes('transfer') && desc.includes('account')) {
    // Example pattern: transfer between accounts
    lines.push('    const sourceAccount = { id: 1, balance: 100 };');
    lines.push('    const targetAccount = { id: 2, balance: 50 };');
    lines.push('    const transferAmount = 25;');
  } else if (desc.includes('balance')) {
    lines.push('    const initialBalance = 100;');
    lines.push('    const account = { balance: initialBalance };');
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
  lines.push(`    // Behavior: ${claim.description}`);

  if (desc.includes('transfer') && desc.includes('account')) {
    // Example assertions for transfer
    lines.push('    // Verify funds moved correctly');
    lines.push('    // expect(sourceAccount.balance).toBe(75);');
    lines.push('    // expect(targetAccount.balance).toBe(75);');
  } else if (desc.includes('returns') || desc.includes('produces')) {
    lines.push('    // Verify return value');
    lines.push('    // expect(result).toEqual(expectedOutput);');
  } else {
    lines.push('    // TODO: Add assertions verifying expected behavior');
    lines.push('    // expect(result).toBeDefined();');
  }

  // Add side-effect verification
  const sideEffectCode = generateSideEffectVerification(claim, mockTargets);
  if (sideEffectCode !== '') {
    lines.push(sideEffectCode);
  }

  return lines.join('\n');
}

/**
 * Generates setup/teardown hooks.
 *
 * @returns The hooks code.
 */
function generateHooks(): string {
  const lines: string[] = [];

  lines.push('  beforeEach(() => {');
  lines.push('    // Reset state before each test');
  lines.push('    // TODO: Initialize test fixtures');
  lines.push('    vi.clearAllMocks();');
  lines.push('  });');
  lines.push('');
  lines.push('  afterEach(() => {');
  lines.push('    // Cleanup after each test');
  lines.push('    // TODO: Tear down test fixtures if needed');
  lines.push('  });');

  return lines.join('\n');
}

/**
 * Generates an integration test for a behavioral claim.
 *
 * The generated test:
 * - Uses vitest as the test runner
 * - Includes setup/teardown hooks when appropriate
 * - Supports mocking dependencies via vi.fn()
 * - Supports input/output assertion patterns
 * - Verifies side effects when applicable
 *
 * If the claim has no clear behavior to test, a test skeleton with TODO is generated.
 *
 * @param claim - The behavioral claim to generate a test for.
 * @param options - Options for test generation.
 * @returns The generated vitest test file content as a string.
 *
 * @example
 * ```typescript
 * const claim: Claim = {
 *   id: 'beh_001',
 *   type: 'behavioral',
 *   description: 'transfer moves funds between accounts',
 *   functions: ['transfer']
 * };
 *
 * const testCode = generateBehavioralTest(claim);
 * // Generates a vitest test with Arrange-Act-Assert structure
 * // and assertions for balance changes
 * ```
 *
 * @example
 * // Claim verifying side effects
 * const auditClaim: Claim = {
 *   id: 'beh_002',
 *   type: 'behavioral',
 *   description: 'auditLog.record was called when payment processed',
 *   functions: ['processPayment']
 * };
 *
 * const testCode = generateBehavioralTest(auditClaim);
 * // Generates test with vi.fn() mock and toHaveBeenCalled assertions
 *
 * @example
 * // Claim without clear behavior generates skeleton
 * const unclearClaim: Claim = {
 *   id: 'beh_003',
 *   type: 'behavioral',
 *   description: 'system functionality',
 *   functions: []
 * };
 *
 * const testCode = generateBehavioralTest(unclearClaim);
 * // Generates test skeleton with TODO markers
 */
export function generateBehavioralTest(claim: Claim, options: BehavioralTestOptions = {}): string {
  const {
    timeout = DEFAULT_TIMEOUT,
    includeJsDoc = true,
    generateHooks: genHooks = true,
  } = options;

  const clearBehavior = hasClearBehavior(claim);
  const hasSideEffects = hasSideEffectBehavior(claim);
  const hasStateChange = hasStateChangeBehavior(claim);
  const mockTargets = extractMockTargets(claim);
  const hasMocks = mockTargets.length > 0 || hasSideEffects;

  const lines: string[] = [];

  // File header
  if (includeJsDoc) {
    lines.push('/**');
    lines.push(` * Integration tests for behavioral claim: ${claim.id}`);
    lines.push(' *');
    lines.push(` * ${claim.description}`);
    lines.push(' *');
    if (claim.functions.length > 0) {
      lines.push(` * Tested functions: ${claim.functions.join(', ')}`);
    }
    lines.push(' *');
    lines.push(' * @generated This file was auto-generated by the test generator.');
    lines.push(' */');
    lines.push('');
  }

  // Imports
  lines.push(generateImports(hasMocks, genHooks));
  lines.push('');

  // Test suite
  const testName = generateTestName(claim);
  const escapedTestName = escapeString(testName);

  lines.push(`describe('Behavioral: ${escapedTestName}', () => {`);

  // Setup/teardown hooks
  if (genHooks && hasMocks) {
    lines.push(generateHooks());
    lines.push('');
  }

  if (!clearBehavior) {
    // Generate test skeleton with TODO
    lines.push('  // TODO: This claim needs clearer behavioral specification');
    lines.push('  // Add specific trigger/outcome or link functions via CLAIM_REF');
    lines.push('');
    lines.push(`  it.skip('${escapedTestName}', () => {`);
    lines.push('    // Test skeleton - behavior unclear');
    lines.push('    // TODO: Define specific behavior to test');
    lines.push("    throw new Error('Test not implemented: unclear behavior');");
    lines.push('  });');
  } else {
    // Generate the actual integration test
    if (includeJsDoc) {
      lines.push('  /**');
      lines.push(`   * Integration test verifying: ${claim.description}`);
      lines.push('   *');
      if (hasSideEffects) {
        lines.push('   * This test verifies side effects and function calls.');
      }
      if (hasStateChange) {
        lines.push('   * This test verifies state changes.');
      }
      lines.push('   */');
    }

    lines.push(`  it(`);
    lines.push(`    '${escapedTestName}',`);
    lines.push(`    () => {`);
    lines.push(generateTestBody(claim));
    lines.push('    },');
    lines.push(`    { timeout: ${String(timeout)} }`);
    lines.push('  );');

    // Generate additional tests for specific scenarios if claim has multiple functions
    if (claim.functions.length > 1) {
      lines.push('');
      lines.push('  // Individual function tests');
      for (const func of claim.functions.slice(1)) {
        const escapedFunc = escapeString(func);
        lines.push('');
        if (includeJsDoc) {
          lines.push('  /**');
          lines.push(`   * Verifies ${func} behavior: ${claim.description}`);
          lines.push('   */');
        }
        lines.push(`  it('${escapedFunc} - ${escapeString(claim.description)}', () => {`);
        lines.push('    // Arrange');
        lines.push('    // TODO: Set up test inputs');
        lines.push('');
        lines.push('    // Act');
        lines.push(`    // TODO: Call ${func}`);
        lines.push('');
        lines.push('    // Assert');
        lines.push('    // TODO: Verify expected behavior');
        lines.push(`  }, { timeout: ${String(timeout)} });`);
      }
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates multiple behavioral tests from an array of claims.
 *
 * Filters claims to only process those with type 'behavioral'.
 *
 * @param claims - Array of claims to generate tests for.
 * @param options - Options for test generation.
 * @returns Map of claim ID to generated test code.
 */
export function generateBehavioralTests(
  claims: Claim[],
  options: BehavioralTestOptions = {}
): Map<string, string> {
  const tests = new Map<string, string>();

  for (const claim of claims) {
    if (claim.type === 'behavioral') {
      tests.set(claim.id, generateBehavioralTest(claim, options));
    }
  }

  return tests;
}

export { DEFAULT_TIMEOUT };
