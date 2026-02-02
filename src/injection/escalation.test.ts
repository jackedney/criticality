/**
 * Tests for the escalation logic module.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  type EscalationAction,
  // Constants
  MODEL_TIER_ORDER,
  MODEL_TIER_TO_ALIAS,
  DEFAULT_ESCALATION_CONFIG,
  // Functions
  getNextTier,
  isHighestTier,
  createFunctionAttempts,
  recordAttempt,
  recordSyntaxHint,
  resetSyntaxHint,
  isSyntaxRecoverable,
  generateSyntaxHint,
  determineEscalation,
  generateFailureSummary,
  createSyntaxFailure,
  createTypeFailure,
  createTestFailure,
  createTimeoutFailure,
  createSemanticFailure,
  createComplexityFailure,
  createSecurityFailure,
  createCoherenceFailure,
  requiresImmediateEscalation,
  causesCircuitBreak,
  getRetryLimit,
  formatEscalationAction,
} from './escalation.js';

// ============================================================================
// Model Tier Tests
// ============================================================================

describe('Model Tiers', () => {
  describe('MODEL_TIER_ORDER', () => {
    it('should have correct escalation order', () => {
      expect(MODEL_TIER_ORDER).toEqual(['worker', 'fallback', 'architect']);
    });

    it('should have worker as first tier', () => {
      expect(MODEL_TIER_ORDER[0]).toBe('worker');
    });

    it('should have architect as highest tier', () => {
      expect(MODEL_TIER_ORDER[MODEL_TIER_ORDER.length - 1]).toBe('architect');
    });
  });

  describe('MODEL_TIER_TO_ALIAS', () => {
    it('should map worker to worker alias', () => {
      expect(MODEL_TIER_TO_ALIAS.worker).toBe('worker');
    });

    it('should map fallback to fallback alias', () => {
      expect(MODEL_TIER_TO_ALIAS.fallback).toBe('fallback');
    });

    it('should map architect to architect alias', () => {
      expect(MODEL_TIER_TO_ALIAS.architect).toBe('architect');
    });
  });

  describe('getNextTier', () => {
    it('should return fallback for worker', () => {
      expect(getNextTier('worker')).toBe('fallback');
    });

    it('should return architect for fallback', () => {
      expect(getNextTier('fallback')).toBe('architect');
    });

    it('should return undefined for architect (highest tier)', () => {
      expect(getNextTier('architect')).toBeUndefined();
    });
  });

  describe('isHighestTier', () => {
    it('should return true for architect', () => {
      expect(isHighestTier('architect')).toBe(true);
    });

    it('should return false for worker', () => {
      expect(isHighestTier('worker')).toBe(false);
    });

    it('should return false for fallback', () => {
      expect(isHighestTier('fallback')).toBe(false);
    });
  });
});

// ============================================================================
// Attempt Tracking Tests
// ============================================================================

describe('Attempt Tracking', () => {
  describe('createFunctionAttempts', () => {
    it('should create empty attempts tracker', () => {
      const attempts = createFunctionAttempts('myFunction');

      expect(attempts.functionId).toBe('myFunction');
      expect(attempts.totalAttempts).toBe(0);
      expect(attempts.attemptsByTier.get('worker')).toBe(0);
      expect(attempts.attemptsByTier.get('fallback')).toBe(0);
      expect(attempts.attemptsByTier.get('architect')).toBe(0);
      expect(attempts.lastFailure).toBeUndefined();
      expect(attempts.syntaxHintProvided).toBe(false);
    });
  });

  describe('recordAttempt', () => {
    it('should increment attempt count for specified tier', () => {
      const initial = createFunctionAttempts('test');
      const updated = recordAttempt(initial, 'worker');

      expect(updated.attemptsByTier.get('worker')).toBe(1);
      expect(updated.attemptsByTier.get('fallback')).toBe(0);
      expect(updated.totalAttempts).toBe(1);
    });

    it('should record failure type', () => {
      const initial = createFunctionAttempts('test');
      const failure = createTypeFailure('Type mismatch');
      const updated = recordAttempt(initial, 'worker', failure);

      expect(updated.lastFailure).toEqual(failure);
    });

    it('should not modify original object', () => {
      const initial = createFunctionAttempts('test');
      const updated = recordAttempt(initial, 'worker');

      expect(initial.totalAttempts).toBe(0);
      expect(updated.totalAttempts).toBe(1);
    });

    it('should accumulate multiple attempts', () => {
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'worker');
      attempts = recordAttempt(attempts, 'worker');
      attempts = recordAttempt(attempts, 'fallback');

      expect(attempts.attemptsByTier.get('worker')).toBe(2);
      expect(attempts.attemptsByTier.get('fallback')).toBe(1);
      expect(attempts.totalAttempts).toBe(3);
    });
  });

  describe('recordSyntaxHint', () => {
    it('should set syntaxHintProvided to true', () => {
      const initial = createFunctionAttempts('test');
      const updated = recordSyntaxHint(initial);

      expect(updated.syntaxHintProvided).toBe(true);
    });
  });

  describe('resetSyntaxHint', () => {
    it('should reset syntaxHintProvided to false', () => {
      let attempts = createFunctionAttempts('test');
      attempts = recordSyntaxHint(attempts);
      attempts = resetSyntaxHint(attempts);

      expect(attempts.syntaxHintProvided).toBe(false);
    });
  });
});

// ============================================================================
// Syntax Error Detection Tests
// ============================================================================

describe('Syntax Error Detection', () => {
  describe('isSyntaxRecoverable', () => {
    it('should detect missing semicolon as recoverable', () => {
      expect(isSyntaxRecoverable('Missing semicolon at line 10')).toBe(true);
    });

    it('should detect expected token as recoverable', () => {
      expect(isSyntaxRecoverable("Expected '}' at line 5")).toBe(true);
    });

    it('should detect unexpected token as recoverable', () => {
      expect(isSyntaxRecoverable("Unexpected token ')' at position 42")).toBe(true);
    });

    it('should detect unterminated string as recoverable', () => {
      expect(isSyntaxRecoverable('Unterminated string literal at line 20')).toBe(true);
    });

    it('should detect unexpected end as recoverable', () => {
      expect(isSyntaxRecoverable('Unexpected end of input')).toBe(true);
    });

    it('should treat unknown errors as not recoverable', () => {
      expect(isSyntaxRecoverable('Some completely unknown error')).toBe(false);
    });
  });

  describe('generateSyntaxHint', () => {
    it('should include the parse error in the hint', () => {
      const hint = generateSyntaxHint('Missing semicolon');
      expect(hint).toContain('Missing semicolon');
    });

    it('should mention TypeScript validity', () => {
      const hint = generateSyntaxHint('Any error');
      expect(hint).toContain('TypeScript');
    });
  });
});

// ============================================================================
// Escalation Decision Tests
// ============================================================================

describe('Escalation Decisions', () => {
  describe('Syntax Failures', () => {
    it('should retry recoverable syntax error on first attempt', () => {
      const failure = createSyntaxFailure('Missing semicolon', true);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('retry_same');
      expect(decision.nextTier).toBe('worker');
    });

    it('should retry with hint on second attempt for recoverable syntax', () => {
      const failure = createSyntaxFailure('Missing semicolon', true);
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'worker', failure);
      attempts = recordAttempt(attempts, 'worker', failure);

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('retry_same');
      if (decision.action.type === 'retry_same') {
        expect(decision.action.withHint).toBe(true);
      }
    });

    it('should escalate fatal syntax error immediately', () => {
      const failure = createSyntaxFailure('Fatal parse error', false);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('fallback');
      }
    });

    it('should circuit break for fatal syntax on architect', () => {
      const failure = createSyntaxFailure('Fatal parse error', false);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
    });
  });

  describe('Type Failures', () => {
    it('should retry with hint on first type error', () => {
      const failure = createTypeFailure('Type mismatch: expected number, got string');
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('retry_same');
      expect(decision.nextTier).toBe('worker');
    });

    it('should escalate after type retry limit on worker (attempt 2)', () => {
      const failure = createTypeFailure('Type mismatch');
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'worker', failure);
      attempts = recordAttempt(attempts, 'worker', failure);

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('fallback');
      }
    });

    it('should escalate from fallback to architect after limit', () => {
      const failure = createTypeFailure('Type mismatch');
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'fallback', failure);
      attempts = recordAttempt(attempts, 'fallback', failure);

      const decision = determineEscalation(failure, attempts, 'fallback');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('architect');
      }
    });

    it('should circuit break after type error on architect attempt 2', () => {
      const failure = createTypeFailure('Type mismatch');
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'architect', failure);
      attempts = recordAttempt(attempts, 'architect', failure);

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
    });
  });

  describe('Test Failures', () => {
    it('should retry test failure on same model', () => {
      const failure = createTestFailure([{ testName: 'test1', expected: '42', actual: '0' }]);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('retry_same');
      expect(decision.nextTier).toBe('worker');
    });

    it('should escalate after 3 test failures on worker', () => {
      const failure = createTestFailure([{ testName: 'test1', expected: '42', actual: '0' }]);
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'worker', failure);
      attempts = recordAttempt(attempts, 'worker', failure);
      attempts = recordAttempt(attempts, 'worker', failure);

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('fallback');
      }
    });

    it('should require human review for test failure circuit break on architect', () => {
      const failure = createTestFailure([{ testName: 'test1', expected: '42', actual: '0' }]);
      let attempts = createFunctionAttempts('test');
      attempts = recordAttempt(attempts, 'architect', failure);
      attempts = recordAttempt(attempts, 'architect', failure);
      attempts = recordAttempt(attempts, 'architect', failure);

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
      if (decision.action.type === 'circuit_break') {
        expect(decision.action.requiresHumanReview).toBe(true);
      }
    });
  });

  describe('Timeout Failures', () => {
    it('should escalate timeout immediately', () => {
      const failure = createTimeoutFailure('time', 30000);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('fallback');
      }
    });

    it('should circuit break timeout on architect', () => {
      const failure = createTimeoutFailure('time', 30000);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
    });
  });

  describe('Semantic Failures', () => {
    it('should escalate semantic violation immediately on worker', () => {
      const failure = createSemanticFailure({
        type: 'contract',
        description: 'Postcondition violated',
      });
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('fallback');
      }
    });

    it('should escalate semantic violation immediately on fallback', () => {
      const failure = createSemanticFailure({
        type: 'invariant',
        description: 'Invariant violated',
      });
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'fallback');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('architect');
      }
    });

    it('should circuit break with human review for semantic on architect', () => {
      const failure = createSemanticFailure({
        type: 'postcondition',
        description: 'Postcondition violated',
      });
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
      if (decision.action.type === 'circuit_break') {
        expect(decision.action.requiresHumanReview).toBe(true);
      }
    });
  });

  describe('Security Failures', () => {
    it('should escalate security vulnerability directly to architect from worker', () => {
      const failure = createSecurityFailure('injection');
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('architect');
      }
    });

    it('should escalate security vulnerability directly to architect from fallback', () => {
      const failure = createSecurityFailure('xss');
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'fallback');

      expect(decision.action.type).toBe('escalate');
      if (decision.action.type === 'escalate') {
        expect(decision.action.toTier).toBe('architect');
      }
    });

    it('should circuit break with human review for security on architect', () => {
      const failure = createSecurityFailure('path-traversal');
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'architect');

      expect(decision.action.type).toBe('circuit_break');
      if (decision.action.type === 'circuit_break') {
        expect(decision.action.requiresHumanReview).toBe(true);
      }
    });
  });

  describe('Coherence Failures', () => {
    it('should always circuit break for coherence failures', () => {
      const failure = createCoherenceFailure(['funcA', 'funcB']);
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('circuit_break');
    });

    it('should circuit break coherence on any tier', () => {
      const failure = createCoherenceFailure(['funcA', 'funcB']);
      const attempts = createFunctionAttempts('test');

      const workerDecision = determineEscalation(failure, attempts, 'worker');
      const fallbackDecision = determineEscalation(failure, attempts, 'fallback');
      const architectDecision = determineEscalation(failure, attempts, 'architect');

      expect(workerDecision.action.type).toBe('circuit_break');
      expect(fallbackDecision.action.type).toBe('circuit_break');
      expect(architectDecision.action.type).toBe('circuit_break');
    });
  });

  describe('Complexity Failures', () => {
    it('should treat complexity failures like test failures', () => {
      const failure = createComplexityFailure('O(n)', 'O(n^2)');
      const attempts = createFunctionAttempts('test');

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('retry_same');
      expect(decision.nextTier).toBe('worker');
    });
  });

  describe('Max Attempts', () => {
    it('should circuit break when max attempts exceeded', () => {
      const failure = createTestFailure([{ testName: 'test1', expected: '42', actual: '0' }]);
      let attempts = createFunctionAttempts('test');

      // Record 8 attempts (default max)
      for (let i = 0; i < 8; i++) {
        attempts = recordAttempt(attempts, 'worker', failure);
      }

      const decision = determineEscalation(failure, attempts, 'worker');

      expect(decision.action.type).toBe('circuit_break');
      expect(decision.reason).toContain('Exceeded max attempts');
    });
  });
});

// ============================================================================
// Failure Summary Tests
// ============================================================================

describe('Failure Summary', () => {
  it('should generate summary for syntax failure', () => {
    const failure = createSyntaxFailure('Missing semicolon');
    const summary = generateFailureSummary('myFunc', 'function myFunc(): void', failure);

    expect(summary).toContain('FUNCTION: myFunc');
    expect(summary).toContain('FAILURE TYPE: Syntax');
    expect(summary).toContain('Missing semicolon');
    expect(summary).toContain('Previous attempts discarded');
  });

  it('should generate summary for type failure', () => {
    const failure = createTypeFailure('Type mismatch: expected number');
    const summary = generateFailureSummary('myFunc', 'function myFunc(): number', failure);

    expect(summary).toContain('FAILURE TYPE: Type');
    expect(summary).toContain('Type mismatch');
  });

  it('should generate summary for test failure with test names', () => {
    const failure = createTestFailure([
      { testName: 'test1', expected: '42', actual: '0' },
      { testName: 'test2', expected: 'true', actual: 'false' },
    ]);
    const summary = generateFailureSummary('myFunc', 'function myFunc(): number', failure);

    expect(summary).toContain('FAILURE TYPE: Test');
    expect(summary).toContain('test1');
    expect(summary).toContain('test2');
    expect(summary).toContain('expected 42, got 0');
  });

  it('should generate summary for security failure', () => {
    const failure = createSecurityFailure('injection');
    const summary = generateFailureSummary(
      'myFunc',
      'function myFunc(input: string): void',
      failure
    );

    expect(summary).toContain('FAILURE TYPE: Security');
    expect(summary).toContain('VULNERABILITY: injection');
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('requiresImmediateEscalation', () => {
    it('should return true for security', () => {
      expect(requiresImmediateEscalation(createSecurityFailure('xss'))).toBe(true);
    });

    it('should return true for timeout', () => {
      expect(requiresImmediateEscalation(createTimeoutFailure('time', 30000))).toBe(true);
    });

    it('should return true for semantic', () => {
      expect(
        requiresImmediateEscalation(
          createSemanticFailure({ type: 'contract', description: 'test' })
        )
      ).toBe(true);
    });

    it('should return true for coherence', () => {
      expect(requiresImmediateEscalation(createCoherenceFailure(['a', 'b']))).toBe(true);
    });

    it('should return true for fatal syntax', () => {
      expect(requiresImmediateEscalation(createSyntaxFailure('error', false))).toBe(true);
    });

    it('should return false for recoverable syntax', () => {
      expect(requiresImmediateEscalation(createSyntaxFailure('error', true))).toBe(false);
    });

    it('should return false for type failures', () => {
      expect(requiresImmediateEscalation(createTypeFailure('error'))).toBe(false);
    });

    it('should return false for test failures', () => {
      expect(
        requiresImmediateEscalation(
          createTestFailure([{ testName: 't', expected: 'a', actual: 'b' }])
        )
      ).toBe(false);
    });
  });

  describe('causesCircuitBreak', () => {
    it('should return true for coherence failures', () => {
      expect(causesCircuitBreak(createCoherenceFailure(['a', 'b']))).toBe(true);
    });

    it('should return false for other failures', () => {
      expect(causesCircuitBreak(createSecurityFailure('xss'))).toBe(false);
      expect(causesCircuitBreak(createTypeFailure('error'))).toBe(false);
    });
  });

  describe('getRetryLimit', () => {
    it('should return syntax retry limit for syntax failures', () => {
      expect(getRetryLimit(createSyntaxFailure('error'))).toBe(
        DEFAULT_ESCALATION_CONFIG.syntaxRetryLimit
      );
    });

    it('should return type retry limit for type failures', () => {
      expect(getRetryLimit(createTypeFailure('error'))).toBe(
        DEFAULT_ESCALATION_CONFIG.typeRetryLimit
      );
    });

    it('should return test retry limit for test failures', () => {
      expect(
        getRetryLimit(createTestFailure([{ testName: 't', expected: 'a', actual: 'b' }]))
      ).toBe(DEFAULT_ESCALATION_CONFIG.testRetryLimit);
    });

    it('should return 0 for immediate escalation failures', () => {
      expect(getRetryLimit(createSecurityFailure('xss'))).toBe(0);
      expect(getRetryLimit(createTimeoutFailure('time', 30000))).toBe(0);
      expect(getRetryLimit(createCoherenceFailure(['a']))).toBe(0);
    });
  });

  describe('formatEscalationAction', () => {
    it('should format retry without hint', () => {
      const action: EscalationAction = { type: 'retry_same', withHint: false };
      expect(formatEscalationAction(action)).toBe('Retry');
    });

    it('should format retry with hint', () => {
      const action: EscalationAction = { type: 'retry_same', withHint: true, hint: 'test hint' };
      expect(formatEscalationAction(action)).toBe('Retry with hint');
    });

    it('should format escalate', () => {
      const action: EscalationAction = { type: 'escalate', toTier: 'fallback' };
      expect(formatEscalationAction(action)).toBe('Escalate to fallback');
    });

    it('should format circuit break', () => {
      const action: EscalationAction = {
        type: 'circuit_break',
        reason: 'Test reason',
        requiresHumanReview: false,
      };
      expect(formatEscalationAction(action)).toContain('Circuit break');
      expect(formatEscalationAction(action)).toContain('Test reason');
    });

    it('should indicate human review required', () => {
      const action: EscalationAction = {
        type: 'circuit_break',
        reason: 'Security issue',
        requiresHumanReview: true,
      };
      expect(formatEscalationAction(action)).toContain('human review required');
    });
  });
});

// ============================================================================
// Failure Type Constructor Tests
// ============================================================================

describe('Failure Type Constructors', () => {
  it('should auto-detect syntax recoverability', () => {
    const recoverable = createSyntaxFailure('Missing semicolon at line 10');
    const fatal = createSyntaxFailure('Completely broken code xyz123');

    expect(recoverable.recoverable).toBe(true);
    expect(fatal.recoverable).toBe(false);
  });

  it('should allow override of syntax recoverability', () => {
    const forced = createSyntaxFailure('Missing semicolon', false);
    expect(forced.recoverable).toBe(false);
  });

  it('should create valid type failure', () => {
    const failure = createTypeFailure('Type error message');
    expect(failure.type).toBe('type');
    expect(failure.compilerError).toBe('Type error message');
  });

  it('should create valid test failure', () => {
    const tests = [{ testName: 'test1', expected: '1', actual: '2' }];
    const failure = createTestFailure(tests);
    expect(failure.type).toBe('test');
    expect(failure.failingTests).toEqual(tests);
  });

  it('should create valid timeout failure', () => {
    const failure = createTimeoutFailure('memory', 1000);
    expect(failure.type).toBe('timeout');
    expect(failure.resource).toBe('memory');
    expect(failure.limit).toBe(1000);
  });

  it('should create valid semantic failure', () => {
    const violation = {
      type: 'invariant' as const,
      description: 'test',
      violatedClause: '@invariant x > 0',
    };
    const failure = createSemanticFailure(violation);
    expect(failure.type).toBe('semantic');
    expect(failure.violation).toEqual(violation);
  });

  it('should create valid complexity failure', () => {
    const failure = createComplexityFailure('O(n)', 'O(n^2)');
    expect(failure.type).toBe('complexity');
    expect(failure.expected).toBe('O(n)');
    expect(failure.measured).toBe('O(n^2)');
  });

  it('should create valid security failure', () => {
    const failure = createSecurityFailure('xss');
    expect(failure.type).toBe('security');
    expect(failure.vulnerability).toBe('xss');
  });

  it('should create valid coherence failure', () => {
    const failure = createCoherenceFailure(['func1', 'func2']);
    expect(failure.type).toBe('coherence');
    expect(failure.conflictingFunctions).toEqual(['func1', 'func2']);
  });
});
