/**
 * Tests for the behavioral test generator module.
 *
 * @module adapters/typescript/behavioral-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import {
  generateBehavioralTest,
  generateBehavioralTests,
  DEFAULT_TIMEOUT,
} from './behavioral-test-generator.js';
import type { Claim } from './claims.js';

describe('generateBehavioralTest', () => {
  describe('basic test generation', () => {
    it('generates vitest test file with integration test structure', () => {
      const claim: Claim = {
        id: 'beh_001',
        type: 'behavioral',
        description: 'transfer moves funds between accounts',
        functions: ['transfer'],
      };

      const result = generateBehavioralTest(claim);

      // Should include vitest imports
      expect(result).toContain('import { describe, it, expect');

      // Should use describe block
      expect(result).toContain("describe('Behavioral:");

      // Should use it() for tests
      expect(result).toContain('it(');
    });

    it('includes claim ID in test name for traceability', () => {
      const claim: Claim = {
        id: 'beh_002',
        type: 'behavioral',
        description: 'payment processing validates card',
        functions: ['processPayment'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('[beh_002]');
      expect(result).toContain('payment processing validates card');
    });

    it('includes appropriate test timeout', () => {
      const claim: Claim = {
        id: 'beh_003',
        type: 'behavioral',
        description: 'user registration creates account',
        functions: ['register'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain(`timeout: ${String(DEFAULT_TIMEOUT)}`);
    });

    it('respects custom timeout option', () => {
      const claim: Claim = {
        id: 'beh_004',
        type: 'behavioral',
        description: 'slow operation completes',
        functions: ['slowOp'],
      };

      const result = generateBehavioralTest(claim, { timeout: 30000 });

      expect(result).toContain('timeout: 30000');
    });
  });

  describe('input/output assertion patterns', () => {
    it('generates Arrange-Act-Assert structure', () => {
      const claim: Claim = {
        id: 'beh_io_001',
        type: 'behavioral',
        description: 'returns calculated total when given items',
        functions: ['calculateTotal'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('// Arrange');
      expect(result).toContain('// Act');
      expect(result).toContain('// Assert');
    });

    it('generates return value assertions for "returns" claims', () => {
      const claim: Claim = {
        id: 'beh_io_002',
        type: 'behavioral',
        description: 'returns user profile when ID is valid',
        functions: ['getUserProfile'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('return value');
      expect(result).toContain('expectedOutput');
    });

    it('generates assertions for "produces" claims', () => {
      const claim: Claim = {
        id: 'beh_io_003',
        type: 'behavioral',
        description: 'produces formatted report',
        functions: ['generateReport'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('return value');
    });
  });

  describe('mocking dependencies', () => {
    it('imports vi for mocking when side effects detected', () => {
      const claim: Claim = {
        id: 'beh_mock_001',
        type: 'behavioral',
        description: 'auditLog.record is called when transaction completes',
        functions: ['completeTransaction'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain("import { vi } from 'vitest'");
    });

    it('generates mock setup for detected services', () => {
      const claim: Claim = {
        id: 'beh_mock_002',
        type: 'behavioral',
        description: 'logger.log is called with transaction details',
        functions: ['processTransaction'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('vi.fn()');
      expect(result).toContain('mock');
    });

    it('detects common mock targets from description', () => {
      const claim: Claim = {
        id: 'beh_mock_003',
        type: 'behavioral',
        description: 'notification service sends email confirmation',
        functions: ['sendConfirmation'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('notification');
      expect(result).toContain('email');
    });
  });

  describe('side-effect verification', () => {
    it('generates toHaveBeenCalled assertions for "called" claims', () => {
      const claim: Claim = {
        id: 'beh_side_001',
        type: 'behavioral',
        description: 'auditLog.record was called when payment processed',
        functions: ['processPayment'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('toHaveBeenCalled');
      expect(result).toContain('Verify side effects');
    });

    it('generates verification for "logs" behavior', () => {
      const claim: Claim = {
        id: 'beh_side_002',
        type: 'behavioral',
        description: 'system logs error when validation fails',
        functions: ['validate'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('toHaveBeenCalled');
    });

    it('generates verification for "notifies" behavior', () => {
      const claim: Claim = {
        id: 'beh_side_003',
        type: 'behavioral',
        description: 'service notifies subscribers on update',
        functions: ['update'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('side effects');
    });

    it('generates verification for "sends" behavior', () => {
      const claim: Claim = {
        id: 'beh_side_004',
        type: 'behavioral',
        description: 'handler sends response to client',
        functions: ['handleRequest'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('side effects');
    });

    it('generates verification for "emits" behavior', () => {
      const claim: Claim = {
        id: 'beh_side_005',
        type: 'behavioral',
        description: 'event emitter emits "complete" event',
        functions: ['finish'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('side effects');
    });
  });

  describe('state change verification', () => {
    it('generates state assertions for "moves" behavior', () => {
      const claim: Claim = {
        id: 'beh_state_001',
        type: 'behavioral',
        description: 'transfer moves funds between accounts',
        functions: ['transfer'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('state changes');
      expect(result).toContain('finalState');
    });

    it('generates state assertions for "changes" behavior', () => {
      const claim: Claim = {
        id: 'beh_state_002',
        type: 'behavioral',
        description: 'update changes user status',
        functions: ['updateStatus'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('state changes');
    });

    it('generates state assertions for "modifies" behavior', () => {
      const claim: Claim = {
        id: 'beh_state_003',
        type: 'behavioral',
        description: 'editor modifies document content',
        functions: ['edit'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('state changes');
    });
  });

  describe('setup/teardown hooks', () => {
    it('generates beforeEach hook when mocking is needed', () => {
      const claim: Claim = {
        id: 'beh_hook_001',
        type: 'behavioral',
        description: 'auditLog.record is called on success',
        functions: ['execute'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('beforeEach');
      expect(result).toContain('vi.clearAllMocks()');
    });

    it('generates afterEach hook for cleanup', () => {
      const claim: Claim = {
        id: 'beh_hook_002',
        type: 'behavioral',
        description: 'service.notify triggers notification',
        functions: ['notify'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('afterEach');
      expect(result).toContain('Cleanup after each test');
    });

    it('can disable hooks generation', () => {
      const claim: Claim = {
        id: 'beh_hook_003',
        type: 'behavioral',
        description: 'function returns result',
        functions: ['getResult'],
      };

      const result = generateBehavioralTest(claim, { generateHooks: false });

      expect(result).not.toContain('beforeEach');
      expect(result).not.toContain('afterEach');
    });
  });

  describe('example: transfer moves funds between accounts', () => {
    it('generates test with two accounts and balance assertions', () => {
      const claim: Claim = {
        id: 'beh_example_001',
        type: 'behavioral',
        description: 'transfer moves funds between accounts',
        functions: ['transfer'],
      };

      const result = generateBehavioralTest(claim);

      // Should set up two accounts
      expect(result).toContain('sourceAccount');
      expect(result).toContain('targetAccount');
      expect(result).toContain('balance');

      // Should have assertions about funds
      expect(result).toContain('Verify funds moved');
    });
  });

  describe('example: auditLog.record was called', () => {
    it('generates test verifying side effect was called', () => {
      const claim: Claim = {
        id: 'beh_example_002',
        type: 'behavioral',
        description: 'auditLog.record was called after payment',
        functions: ['processPayment'],
      };

      const result = generateBehavioralTest(claim);

      // Should have audit-related mock
      expect(result).toContain('audit');
      expect(result).toContain('toHaveBeenCalled');
      expect(result).toContain('vi.fn()');
    });
  });

  describe('negative case: claim without clear behavior', () => {
    it('generates test skeleton with TODO for unclear claim', () => {
      const claim: Claim = {
        id: 'beh_neg_001',
        type: 'behavioral',
        description: 'system functionality',
        functions: [],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('it.skip(');
      expect(result).toContain('TODO');
      expect(result).toContain('unclear behavior');
    });

    it('includes guidance for improving the claim', () => {
      const claim: Claim = {
        id: 'beh_neg_002',
        type: 'behavioral',
        description: 'generic operation',
        functions: [],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('clearer behavioral specification');
      expect(result).toContain('CLAIM_REF');
    });
  });

  describe('generated test structure', () => {
    it('generates valid vitest file structure', () => {
      const claim: Claim = {
        id: 'beh_struct_001',
        type: 'behavioral',
        description: 'operation should succeed when valid',
        functions: ['operation'],
      };

      const result = generateBehavioralTest(claim);

      // Should have proper structure
      expect(result).toContain('import');
      expect(result).toContain('describe(');
      expect(result).toContain('it(');
    });

    it('includes file header with claim information', () => {
      const claim: Claim = {
        id: 'beh_struct_002',
        type: 'behavioral',
        description: 'test description',
        functions: ['func1', 'func2'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('/**');
      expect(result).toContain('Integration tests for behavioral claim');
      expect(result).toContain('beh_struct_002');
      expect(result).toContain('Tested functions:');
    });

    it('can disable JSDoc generation', () => {
      const claim: Claim = {
        id: 'beh_struct_003',
        type: 'behavioral',
        description: 'no jsdoc test',
        functions: ['func'],
      };

      const result = generateBehavioralTest(claim, { includeJsDoc: false });

      // Should not include file header JSDoc
      expect(result).not.toMatch(/^\/\*\*/);
    });

    it('includes @generated annotation', () => {
      const claim: Claim = {
        id: 'beh_struct_004',
        type: 'behavioral',
        description: 'generated annotation test',
        functions: ['func'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('@generated');
    });
  });

  describe('multiple linked functions', () => {
    it('generates tests for each linked function', () => {
      const claim: Claim = {
        id: 'beh_multi_001',
        type: 'behavioral',
        description: 'operation validates input correctly',
        functions: ['validate', 'check', 'verify'],
      };

      const result = generateBehavioralTest(claim);

      // Should have test for first function in main test
      expect(result).toContain('validate');

      // Should have individual tests for other functions
      expect(result).toContain("'check -");
      expect(result).toContain("'verify -");
    });
  });

  describe('escapes special characters', () => {
    it('escapes single quotes in description', () => {
      const claim: Claim = {
        id: 'beh_escape_001',
        type: 'behavioral',
        description: "user's data should be protected",
        functions: ['protect'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain("\\'");
    });

    it('escapes backticks in description', () => {
      const claim: Claim = {
        id: 'beh_escape_002',
        type: 'behavioral',
        description: 'value is `validated`',
        functions: ['validate'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('\\`');
    });
  });

  describe('function reference in test body', () => {
    it('references linked function in Act section', () => {
      const claim: Claim = {
        id: 'beh_ref_001',
        type: 'behavioral',
        description: 'operation should complete successfully',
        functions: ['completeOperation'],
      };

      const result = generateBehavioralTest(claim);

      expect(result).toContain('completeOperation');
    });
  });
});

describe('generateBehavioralTests', () => {
  it('generates tests for all behavioral claims', () => {
    const claims: Claim[] = [
      {
        id: 'beh_001',
        type: 'behavioral',
        description: 'first behavior',
        functions: ['func1'],
      },
      {
        id: 'beh_002',
        type: 'behavioral',
        description: 'second behavior',
        functions: ['func2'],
      },
      {
        id: 'inv_001',
        type: 'invariant',
        description: 'invariant claim',
        functions: ['func3'],
      },
    ];

    const result = generateBehavioralTests(claims);

    expect(result.size).toBe(2);
    expect(result.has('beh_001')).toBe(true);
    expect(result.has('beh_002')).toBe(true);
    expect(result.has('inv_001')).toBe(false);
  });

  it('returns empty map when no behavioral claims', () => {
    const claims: Claim[] = [
      {
        id: 'inv_001',
        type: 'invariant',
        description: 'invariant',
        functions: ['func1'],
      },
      {
        id: 'perf_001',
        type: 'performance',
        description: 'performance',
        functions: ['func2'],
      },
    ];

    const result = generateBehavioralTests(claims);

    expect(result.size).toBe(0);
  });

  it('passes options to each generated test', () => {
    const claims: Claim[] = [
      {
        id: 'beh_001',
        type: 'behavioral',
        description: 'test with options',
        functions: ['func'],
      },
    ];

    const result = generateBehavioralTests(claims, { timeout: 25000 });

    const testCode = result.get('beh_001');
    expect(testCode).toBeDefined();
    expect(testCode).toContain('timeout: 25000');
  });
});

describe('constants', () => {
  it('DEFAULT_TIMEOUT is 10000ms', () => {
    expect(DEFAULT_TIMEOUT).toBe(10000);
  });
});
