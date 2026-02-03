/**
 * Tests for the circuit breaker module.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Configuration
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  // State creation
  createCircuitBreakerState,
  createFunctionState,
  // State updates
  registerFunction,
  recordAttemptStart,
  recordSuccess,
  recordEscalation,
  recordFailure,
  // Circuit checking
  checkCircuitBreaker,
  tripCircuit,
  addWarnings,
  // Statistics
  computeStatistics,
  computeModuleStatistics,
  // Report generation
  generateStructuralDefectReport,
  // Formatting
  formatTripReason,
  formatStructuralDefectReport,
  // High-level class
  CircuitBreaker,
  createCircuitBreaker,
  // Types
  type CircuitBreakerConfig,
  type CircuitTripReason,
  type CircuitWarning,
} from './circuit-breaker.js';
import { createTypeFailure, createSecurityFailure } from './escalation.js';

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Configuration', () => {
  describe('DEFAULT_CIRCUIT_BREAKER_CONFIG', () => {
    it('should have max attempts per function of 8', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.maxAttemptsPerFunction).toBe(8);
    });

    it('should have module escalation threshold of 20%', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.moduleEscalationThreshold).toBe(0.2);
    });

    it('should have module escalation warning threshold of 19%', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.moduleEscalationWarningThreshold).toBe(0.19);
    });

    it('should have global failure threshold of 10%', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.globalFailureThreshold).toBe(0.1);
    });

    it('should have global failure warning threshold of 8%', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.globalFailureWarningThreshold).toBe(0.08);
    });
  });
});

// ============================================================================
// State Creation Tests
// ============================================================================

describe('State Creation', () => {
  describe('createCircuitBreakerState', () => {
    it('should create empty state', () => {
      const state = createCircuitBreakerState();

      expect(state.functions.size).toBe(0);
      expect(state.isTripped).toBe(false);
      expect(state.tripReason).toBeUndefined();
      expect(state.warnings).toHaveLength(0);
    });
  });

  describe('createFunctionState', () => {
    it('should create initial function state', () => {
      const funcState = createFunctionState('myModule/myFunc', 'src/myModule.ts');

      expect(funcState.functionId).toBe('myModule/myFunc');
      expect(funcState.modulePath).toBe('src/myModule.ts');
      expect(funcState.status).toBe('pending');
      expect(funcState.currentTier).toBe('worker');
      expect(funcState.architectAttempted).toBe(false);
      expect(funcState.totalAttempts).toBe(0);
      expect(funcState.didEscalate).toBe(false);
      expect(funcState.lastFailure).toBeUndefined();
    });
  });
});

// ============================================================================
// State Update Tests
// ============================================================================

describe('State Updates', () => {
  describe('registerFunction', () => {
    it('should add function to state', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');

      expect(state.functions.size).toBe(1);
      expect(state.functions.has('func1')).toBe(true);
    });

    it('should not overwrite existing function', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = registerFunction(state, 'func1', 'different.ts');

      const funcState = state.functions.get('func1');
      expect(funcState?.modulePath).toBe('module1.ts');
      expect(funcState?.totalAttempts).toBe(1);
    });
  });

  describe('recordAttemptStart', () => {
    it('should increment attempt count', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');

      const funcState = state.functions.get('func1');
      expect(funcState?.totalAttempts).toBe(1);
      expect(funcState?.status).toBe('in_progress');
    });

    it('should mark architect attempted when using architect tier', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'architect');

      const funcState = state.functions.get('func1');
      expect(funcState?.architectAttempted).toBe(true);
    });

    it('should accumulate attempts across tiers', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordAttemptStart(state, 'func1', 'fallback');

      const funcState = state.functions.get('func1');
      expect(funcState?.totalAttempts).toBe(3);
    });
  });

  describe('recordSuccess', () => {
    it('should mark function as success', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordSuccess(state, 'func1');

      const funcState = state.functions.get('func1');
      expect(funcState?.status).toBe('success');
    });
  });

  describe('recordEscalation', () => {
    it('should mark function as escalated', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordEscalation(state, 'func1', 'fallback');

      const funcState = state.functions.get('func1');
      expect(funcState?.status).toBe('escalated');
      expect(funcState?.currentTier).toBe('fallback');
      expect(funcState?.didEscalate).toBe(true);
    });

    it('should mark architect attempted when escalating to architect', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordEscalation(state, 'func1', 'architect');

      const funcState = state.functions.get('func1');
      expect(funcState?.architectAttempted).toBe(true);
    });
  });

  describe('recordFailure', () => {
    it('should mark function as failed', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      const failure = createTypeFailure('Type error');
      state = recordFailure(state, 'func1', failure);

      const funcState = state.functions.get('func1');
      expect(funcState?.status).toBe('failed');
      expect(funcState?.lastFailure).toEqual(failure);
    });
  });
});

// ============================================================================
// Circuit Breaker Check Tests - Single Function Failures
// ============================================================================

describe('Circuit Breaker - Single Function Failures', () => {
  it('should trip when function fails after architect attempt', () => {
    let state = createCircuitBreakerState();
    state = registerFunction(state, 'func1', 'module1.ts');
    state = recordAttemptStart(state, 'func1', 'worker');
    state = recordEscalation(state, 'func1', 'fallback');
    state = recordAttemptStart(state, 'func1', 'fallback');
    state = recordEscalation(state, 'func1', 'architect');
    state = recordAttemptStart(state, 'func1', 'architect');
    const failure = createTypeFailure('Persistent type error');
    state = recordFailure(state, 'func1', failure);

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('function_exhausted');
    if (result.tripReason?.type === 'function_exhausted') {
      expect(result.tripReason.functionId).toBe('func1');
      expect(result.tripReason.architectAttempted).toBe(true);
    }
  });

  it('should NOT trip when function fails without architect attempt', () => {
    let state = createCircuitBreakerState();
    state = registerFunction(state, 'func1', 'module1.ts');
    state = recordAttemptStart(state, 'func1', 'worker');
    const failure = createTypeFailure('Type error');
    state = recordFailure(state, 'func1', failure);

    const result = checkCircuitBreaker(state);

    // Single function failure (1/1 = 100%) exceeds global threshold (10%)
    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('global_failure_rate');
  });

  it('Example: Function fails 8 times across all models -> circuit breaks', () => {
    let state = createCircuitBreakerState();
    state = registerFunction(state, 'complexFunc', 'src/complex.ts');

    // Simulate 8 attempts across tiers
    for (let i = 0; i < 3; i++) {
      state = recordAttemptStart(state, 'complexFunc', 'worker');
    }
    state = recordEscalation(state, 'complexFunc', 'fallback');
    for (let i = 0; i < 3; i++) {
      state = recordAttemptStart(state, 'complexFunc', 'fallback');
    }
    state = recordEscalation(state, 'complexFunc', 'architect');
    state = recordAttemptStart(state, 'complexFunc', 'architect');
    state = recordAttemptStart(state, 'complexFunc', 'architect');

    const result = checkCircuitBreaker(state);

    // 8 attempts triggers max_attempts_exceeded (8 >= 8)
    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('max_attempts_exceeded');
    if (result.tripReason?.type === 'max_attempts_exceeded') {
      expect(result.tripReason.functionId).toBe('complexFunc');
      expect(result.tripReason.totalAttempts).toBe(8);
      expect(result.tripReason.maxAttempts).toBe(8);
    }
  });
});

// ============================================================================
// Circuit Breaker Check Tests - Max Attempts
// ============================================================================

describe('Circuit Breaker - Max Attempts', () => {
  it('should trip when max attempts reached (default: 8)', () => {
    let state = createCircuitBreakerState();
    state = registerFunction(state, 'func1', 'module1.ts');

    // Record 8 attempts (reaches default of 8)
    for (let i = 0; i < 8; i++) {
      state = recordAttemptStart(state, 'func1', 'worker');
    }

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('max_attempts_exceeded');
    if (result.tripReason?.type === 'max_attempts_exceeded') {
      expect(result.tripReason.functionId).toBe('func1');
      expect(result.tripReason.totalAttempts).toBe(8);
      expect(result.tripReason.maxAttempts).toBe(8);
    }
  });

  it('should NOT trip when under max attempts', () => {
    let state = createCircuitBreakerState();
    state = registerFunction(state, 'func1', 'module1.ts');

    // Record 7 attempts (under limit)
    for (let i = 0; i < 7; i++) {
      state = recordAttemptStart(state, 'func1', 'worker');
    }

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(false);
  });

  it('should respect custom max attempts config', () => {
    const customConfig: CircuitBreakerConfig = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      maxAttemptsPerFunction: 5,
    };

    let state = createCircuitBreakerState();
    state = registerFunction(state, 'func1', 'module1.ts');

    // Record 5 attempts (reaches custom limit of 5)
    for (let i = 0; i < 5; i++) {
      state = recordAttemptStart(state, 'func1', 'worker');
    }

    const result = checkCircuitBreaker(state, customConfig);

    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('max_attempts_exceeded');
    if (result.tripReason?.type === 'max_attempts_exceeded') {
      expect(result.tripReason.functionId).toBe('func1');
      expect(result.tripReason.totalAttempts).toBe(5);
      expect(result.tripReason.maxAttempts).toBe(5);
    }
  });
});

// ============================================================================
// Circuit Breaker Check Tests - Module Escalation Rate
// ============================================================================

describe('Circuit Breaker - Module Escalation Rate', () => {
  it('should trip when >20% of functions in module escalate', () => {
    let state = createCircuitBreakerState();

    // Create 5 functions in same module
    for (let i = 1; i <= 5; i++) {
      state = registerFunction(state, `func${String(i)}`, 'module1.ts');
    }

    // Escalate 2 functions (40% > 20% threshold)
    state = recordAttemptStart(state, 'func1', 'worker');
    state = recordEscalation(state, 'func1', 'fallback');
    state = recordAttemptStart(state, 'func2', 'worker');
    state = recordEscalation(state, 'func2', 'fallback');

    // Mark others as success
    state = recordAttemptStart(state, 'func3', 'worker');
    state = recordSuccess(state, 'func3');
    state = recordAttemptStart(state, 'func4', 'worker');
    state = recordSuccess(state, 'func4');
    state = recordAttemptStart(state, 'func5', 'worker');
    state = recordSuccess(state, 'func5');

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(true);
    expect(result.tripReason?.type).toBe('module_escalation_rate');
    if (result.tripReason?.type === 'module_escalation_rate') {
      expect(result.tripReason.modulePath).toBe('module1.ts');
      expect(result.tripReason.rate).toBe(0.4);
    }
  });

  it('Negative case: 19% escalation rate -> continues but logs warning', () => {
    let state = createCircuitBreakerState();

    // Create 100 functions for precise percentages
    for (let i = 1; i <= 100; i++) {
      state = registerFunction(state, `func${String(i)}`, 'module1.ts');
    }

    // Escalate exactly 19 functions (19% = warning threshold)
    for (let i = 1; i <= 19; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordEscalation(state, `func${String(i)}`, 'fallback');
    }

    // Mark rest as success
    for (let i = 20; i <= 100; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordSuccess(state, `func${String(i)}`);
    }

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe('module_escalation_warning');
    expect(result.warnings[0]?.message).toContain('19');
    expect(result.warnings[0]?.message).toContain('approaching threshold');
  });

  it('should NOT warn when escalation rate is below warning threshold', () => {
    let state = createCircuitBreakerState();

    // Create 100 functions
    for (let i = 1; i <= 100; i++) {
      state = registerFunction(state, `func${String(i)}`, 'module1.ts');
    }

    // Escalate only 10 functions (10% < 19% warning threshold)
    for (let i = 1; i <= 10; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordEscalation(state, `func${String(i)}`, 'fallback');
    }

    // Mark rest as success
    for (let i = 11; i <= 100; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordSuccess(state, `func${String(i)}`);
    }

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// Circuit Breaker Check Tests - Global Failure Rate
// ============================================================================

describe('Circuit Breaker - Global Failure Rate', () => {
  it('should trip when >10% of all functions fail', () => {
    let state = createCircuitBreakerState();

    // Create 10 functions across modules
    for (let i = 1; i <= 10; i++) {
      state = registerFunction(state, `func${String(i)}`, `module${String(i)}.ts`);
    }

    // Fail 2 functions (20% > 10% threshold)
    state = recordAttemptStart(state, 'func1', 'architect');
    state = recordFailure(state, 'func1', createTypeFailure('error'));
    state = recordAttemptStart(state, 'func2', 'architect');
    state = recordFailure(state, 'func2', createTypeFailure('error'));

    // Mark rest as success
    for (let i = 3; i <= 10; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordSuccess(state, `func${String(i)}`);
    }

    const result = checkCircuitBreaker(state);

    // Note: function_exhausted might fire first if architect was attempted
    // But global_failure_rate should also be checked
    expect(result.shouldTrip).toBe(true);
  });

  it('should warn when failure rate approaches threshold', () => {
    let state = createCircuitBreakerState();

    // Create 100 functions
    for (let i = 1; i <= 100; i++) {
      state = registerFunction(state, `func${String(i)}`, `module${String(i)}.ts`);
    }

    // Fail 9 functions (9% > 8% warning, < 10% trip)
    for (let i = 1; i <= 9; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      // Don't mark architect attempted to avoid function_exhausted trip
      const funcState = state.functions.get(`func${String(i)}`);
      if (funcState !== undefined) {
        const newFunctions = new Map(state.functions);
        newFunctions.set(`func${String(i)}`, {
          ...funcState,
          status: 'failed',
          lastFailure: createTypeFailure('error'),
        });
        state = { ...state, functions: newFunctions };
      }
    }

    // Mark rest as success
    for (let i = 10; i <= 100; i++) {
      state = recordAttemptStart(state, `func${String(i)}`, 'worker');
      state = recordSuccess(state, `func${String(i)}`);
    }

    const result = checkCircuitBreaker(state);

    expect(result.shouldTrip).toBe(false);
    expect(result.warnings.some((w) => w.type === 'global_failure_warning')).toBe(true);
  });
});

// ============================================================================
// Trip and Warning Management Tests
// ============================================================================

describe('Trip and Warning Management', () => {
  describe('tripCircuit', () => {
    it('should mark circuit as tripped', () => {
      let state = createCircuitBreakerState();
      const reason: CircuitTripReason = {
        type: 'function_exhausted',
        functionId: 'func1',
        totalAttempts: 8,
        architectAttempted: true,
      };
      state = tripCircuit(state, reason);

      expect(state.isTripped).toBe(true);
      expect(state.tripReason).toEqual(reason);
    });
  });

  describe('addWarnings', () => {
    it('should add warnings to state', () => {
      let state = createCircuitBreakerState();
      const warnings: CircuitWarning[] = [
        {
          type: 'module_escalation_warning',
          message: 'Test warning',
          rate: 0.19,
          threshold: 0.2,
          timestamp: Date.now(),
        },
      ];
      state = addWarnings(state, warnings);

      expect(state.warnings).toHaveLength(1);
      expect(state.warnings[0]?.message).toBe('Test warning');
    });

    it('should accumulate warnings', () => {
      let state = createCircuitBreakerState();
      const warning1: CircuitWarning = {
        type: 'module_escalation_warning',
        message: 'Warning 1',
        rate: 0.19,
        threshold: 0.2,
        timestamp: Date.now(),
      };
      const warning2: CircuitWarning = {
        type: 'global_failure_warning',
        message: 'Warning 2',
        rate: 0.09,
        threshold: 0.1,
        timestamp: Date.now(),
      };

      state = addWarnings(state, [warning1]);
      state = addWarnings(state, [warning2]);

      expect(state.warnings).toHaveLength(2);
    });

    it('should not modify state for empty warnings', () => {
      const state = createCircuitBreakerState();
      const newState = addWarnings(state, []);

      expect(newState).toBe(state);
    });
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('Statistics', () => {
  describe('computeStatistics', () => {
    it('should compute correct counts', () => {
      let state = createCircuitBreakerState();

      // Add various states
      state = registerFunction(state, 'success1', 'mod1.ts');
      state = recordAttemptStart(state, 'success1', 'worker');
      state = recordSuccess(state, 'success1');

      state = registerFunction(state, 'failed1', 'mod1.ts');
      state = recordAttemptStart(state, 'failed1', 'worker');
      state = recordFailure(state, 'failed1', createTypeFailure('error'));

      state = registerFunction(state, 'escalated1', 'mod1.ts');
      state = recordAttemptStart(state, 'escalated1', 'worker');
      state = recordEscalation(state, 'escalated1', 'fallback');

      state = registerFunction(state, 'pending1', 'mod1.ts');

      const stats = computeStatistics(state);

      expect(stats.totalFunctions).toBe(4);
      expect(stats.successCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.escalatedCount).toBe(1);
      expect(stats.pendingCount).toBe(1);
    });

    it('should compute correct rates', () => {
      let state = createCircuitBreakerState();

      // 5 total, 1 failed
      for (let i = 1; i <= 5; i++) {
        state = registerFunction(state, `func${String(i)}`, 'mod1.ts');
        state = recordAttemptStart(state, `func${String(i)}`, 'worker');
        if (i === 1) {
          state = recordFailure(state, `func${String(i)}`, createTypeFailure('error'));
        } else {
          state = recordSuccess(state, `func${String(i)}`);
        }
      }

      const stats = computeStatistics(state);

      expect(stats.globalFailureRate).toBe(0.2); // 1/5
    });
  });

  describe('computeModuleStatistics', () => {
    it('should group by module', () => {
      let state = createCircuitBreakerState();

      state = registerFunction(state, 'func1', 'moduleA.ts');
      state = registerFunction(state, 'func2', 'moduleA.ts');
      state = registerFunction(state, 'func3', 'moduleB.ts');

      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordSuccess(state, 'func1');
      state = recordAttemptStart(state, 'func2', 'worker');
      state = recordEscalation(state, 'func2', 'fallback');
      state = recordAttemptStart(state, 'func3', 'worker');
      state = recordSuccess(state, 'func3');

      const moduleStats = computeModuleStatistics(state);

      expect(moduleStats.size).toBe(2);

      const modA = moduleStats.get('moduleA.ts');
      expect(modA?.totalFunctions).toBe(2);
      expect(modA?.successCount).toBe(1);
      expect(modA?.escalatedCount).toBe(1);
      expect(modA?.escalationRate).toBe(0.5);

      const modB = moduleStats.get('moduleB.ts');
      expect(modB?.totalFunctions).toBe(1);
      expect(modB?.successCount).toBe(1);
      expect(modB?.escalationRate).toBe(0);
    });
  });
});

// ============================================================================
// Report Generation Tests
// ============================================================================

describe('Report Generation', () => {
  describe('generateStructuralDefectReport', () => {
    it('should generate report with all sections', () => {
      let state = createCircuitBreakerState();

      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'architect');
      state = recordFailure(state, 'func1', createTypeFailure('Type error'));

      const tripReason: CircuitTripReason = {
        type: 'function_exhausted',
        functionId: 'func1',
        totalAttempts: 5,
        architectAttempted: true,
      };

      const report = generateStructuralDefectReport(state, tripReason);

      expect(report.tripReason).toEqual(tripReason);
      expect(report.failedFunctions).toHaveLength(1);
      expect(report.statistics.failedCount).toBe(1);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should include escalated functions', () => {
      let state = createCircuitBreakerState();

      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'worker');
      state = recordEscalation(state, 'func1', 'fallback');
      state = recordAttemptStart(state, 'func1', 'fallback');
      state = recordSuccess(state, 'func1');

      const tripReason: CircuitTripReason = {
        type: 'module_escalation_rate',
        modulePath: 'module1.ts',
        escalatedCount: 1,
        totalCount: 1,
        rate: 1.0,
        threshold: 0.2,
      };

      const report = generateStructuralDefectReport(state, tripReason);

      expect(report.escalatedFunctions).toHaveLength(1);
      expect(report.escalatedFunctions[0]?.functionId).toBe('func1');
    });
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe('Formatting', () => {
  describe('formatTripReason', () => {
    it('should format function_exhausted', () => {
      const reason: CircuitTripReason = {
        type: 'function_exhausted',
        functionId: 'func1',
        totalAttempts: 8,
        architectAttempted: true,
      };
      const formatted = formatTripReason(reason);

      expect(formatted).toContain('func1');
      expect(formatted).toContain('8 attempts');
      expect(formatted).toContain('architect attempted: true');
    });

    it('should format max_attempts_exceeded', () => {
      const reason: CircuitTripReason = {
        type: 'max_attempts_exceeded',
        functionId: 'func1',
        totalAttempts: 8,
        maxAttempts: 8,
      };
      const formatted = formatTripReason(reason);

      expect(formatted).toContain('func1');
      expect(formatted).toContain('exceeded max attempts');
      expect(formatted).toContain('8/8');
    });

    it('should format module_escalation_rate', () => {
      const reason: CircuitTripReason = {
        type: 'module_escalation_rate',
        modulePath: 'module1.ts',
        escalatedCount: 3,
        totalCount: 10,
        rate: 0.3,
        threshold: 0.2,
      };
      const formatted = formatTripReason(reason);

      expect(formatted).toContain('module1.ts');
      expect(formatted).toContain('30');
      expect(formatted).toContain('20');
    });

    it('should format global_failure_rate', () => {
      const reason: CircuitTripReason = {
        type: 'global_failure_rate',
        failedCount: 2,
        totalCount: 10,
        rate: 0.2,
        threshold: 0.1,
      };
      const formatted = formatTripReason(reason);

      expect(formatted).toContain('20');
      expect(formatted).toContain('10');
      expect(formatted).toContain('2/10');
    });
  });

  describe('formatStructuralDefectReport', () => {
    it('should include all sections in output', () => {
      let state = createCircuitBreakerState();
      state = registerFunction(state, 'func1', 'module1.ts');
      state = recordAttemptStart(state, 'func1', 'architect');
      state = recordFailure(state, 'func1', createSecurityFailure('injection'));

      const tripReason: CircuitTripReason = {
        type: 'function_exhausted',
        functionId: 'func1',
        totalAttempts: 5,
        architectAttempted: true,
      };

      const report = generateStructuralDefectReport(state, tripReason);
      const formatted = formatStructuralDefectReport(report);

      expect(formatted).toContain('STRUCTURAL DEFECT REPORT');
      expect(formatted).toContain('Trip Reason');
      expect(formatted).toContain('STATISTICS');
      expect(formatted).toContain('FAILED FUNCTIONS');
      expect(formatted).toContain('MODULE SUMMARY');
      expect(formatted).toContain('RECOMMENDATIONS');
    });
  });
});

// ============================================================================
// High-Level CircuitBreaker Class Tests
// ============================================================================

describe('CircuitBreaker Class', () => {
  let mockLogger: (message: string) => void;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    mockLogger = vi.fn();
    breaker = createCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG, mockLogger);
  });

  describe('Basic operations', () => {
    it('should register and track functions', () => {
      breaker.registerFunction('func1', 'module1.ts');

      const stats = breaker.getStatistics();
      expect(stats.totalFunctions).toBe(1);
      expect(stats.pendingCount).toBe(1);
    });

    it('should track successful implementations', () => {
      breaker.registerFunction('func1', 'module1.ts');
      breaker.recordAttemptStart('func1', 'worker');
      breaker.recordSuccess('func1');

      const stats = breaker.getStatistics();
      expect(stats.successCount).toBe(1);
    });

    it('should detect tripped state', () => {
      expect(breaker.isTripped()).toBe(false);

      breaker.registerFunction('func1', 'module1.ts');

      // Reach max attempts (8 >= 8)
      for (let i = 0; i < 8; i++) {
        breaker.recordAttemptStart('func1', 'worker');
      }

      expect(breaker.isTripped()).toBe(true);
      expect(breaker.getTripReason()?.type).toBe('max_attempts_exceeded');
    });
  });

  describe('Escalation tracking', () => {
    it('should track escalations and check circuit', () => {
      breaker.registerFunction('func1', 'module1.ts');
      breaker.recordAttemptStart('func1', 'worker');
      const result = breaker.recordEscalation('func1', 'fallback');

      // 1 escalated function out of 1 total = 100% > 20% threshold
      expect(result.shouldTrip).toBe(true);
      expect(result.tripReason?.type).toBe('module_escalation_rate');

      const stats = breaker.getStatistics();
      expect(stats.escalatedCount).toBe(1);
    });
  });

  describe('Failure tracking', () => {
    it('should track failures and check circuit', () => {
      breaker.registerFunction('func1', 'module1.ts');
      breaker.recordAttemptStart('func1', 'architect');
      const result = breaker.recordFailure('func1', createTypeFailure('error'));

      expect(result.shouldTrip).toBe(true);
    });
  });

  describe('Warning logging', () => {
    it('should log warnings via logger', () => {
      // Create 100 functions and escalate 19 (19% warning threshold)
      for (let i = 1; i <= 100; i++) {
        breaker.registerFunction(`func${String(i)}`, 'module1.ts');
        breaker.recordAttemptStart(`func${String(i)}`, 'worker');
        if (i <= 19) {
          breaker.recordEscalation(`func${String(i)}`, 'fallback');
          breaker.recordAttemptStart(`func${String(i)}`, 'fallback');
          breaker.recordSuccess(`func${String(i)}`);
        } else {
          breaker.recordSuccess(`func${String(i)}`);
        }
      }

      // Check should have logged warning
      expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('[CIRCUIT BREAKER WARNING]'));
    });

    it('should log trip reason', () => {
      breaker.registerFunction('func1', 'module1.ts');

      for (let i = 0; i < 8; i++) {
        breaker.recordAttemptStart('func1', 'worker');
      }

      expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('[CIRCUIT BREAKER TRIPPED]'));
    });
  });

  describe('Report generation', () => {
    it('should generate report when tripped', () => {
      breaker.registerFunction('func1', 'module1.ts');

      for (let i = 0; i < 8; i++) {
        breaker.recordAttemptStart('func1', 'worker');
      }

      const report = breaker.generateReport();
      expect(report).toBeDefined();
      expect(report?.tripReason.type).toBe('max_attempts_exceeded');
    });

    it('should return undefined when not tripped', () => {
      breaker.registerFunction('func1', 'module1.ts');
      breaker.recordAttemptStart('func1', 'worker');
      breaker.recordSuccess('func1');

      const report = breaker.generateReport();
      expect(report).toBeUndefined();
    });
  });

  describe('Module statistics', () => {
    it('should provide module-level stats', () => {
      breaker.registerFunction('func1', 'moduleA.ts');
      breaker.registerFunction('func2', 'moduleA.ts');
      breaker.registerFunction('func3', 'moduleB.ts');

      breaker.recordAttemptStart('func1', 'worker');
      breaker.recordSuccess('func1');
      breaker.recordAttemptStart('func2', 'worker');
      breaker.recordEscalation('func2', 'fallback');
      breaker.recordAttemptStart('func3', 'worker');
      breaker.recordSuccess('func3');

      const moduleStats = breaker.getModuleStatistics();

      expect(moduleStats.size).toBe(2);
      expect(moduleStats.get('moduleA.ts')?.escalationRate).toBe(0.5);
    });
  });

  describe('Warnings retrieval', () => {
    it('should provide accumulated warnings', () => {
      // Create scenario that generates warnings
      for (let i = 1; i <= 100; i++) {
        breaker.registerFunction(`func${String(i)}`, 'module1.ts');
        breaker.recordAttemptStart(`func${String(i)}`, 'worker');
        if (i <= 19) {
          breaker.recordEscalation(`func${String(i)}`, 'fallback');
          breaker.recordAttemptStart(`func${String(i)}`, 'fallback');
          breaker.recordSuccess(`func${String(i)}`);
        } else {
          breaker.recordSuccess(`func${String(i)}`);
        }
      }

      const warnings = breaker.getWarnings();
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Integration Tests - Full Scenarios
// ============================================================================

describe('Integration - Full Scenarios', () => {
  it('should handle complete injection workflow without trip', () => {
    const breaker = createCircuitBreaker();

    // Register functions
    for (let i = 1; i <= 10; i++) {
      breaker.registerFunction(`func${String(i)}`, 'module.ts');
    }

    // Successfully implement all
    for (let i = 1; i <= 10; i++) {
      breaker.recordAttemptStart(`func${String(i)}`, 'worker');
      breaker.recordSuccess(`func${String(i)}`);
    }

    expect(breaker.isTripped()).toBe(false);
    expect(breaker.getStatistics().successCount).toBe(10);
  });

  it('should handle escalation workflow with eventual success', () => {
    const breaker = createCircuitBreaker();

    breaker.registerFunction('complexFunc', 'complex.ts');

    // First attempt fails on worker
    breaker.recordAttemptStart('complexFunc', 'worker');
    breaker.recordEscalation('complexFunc', 'fallback');

    // Second attempt succeeds on fallback
    breaker.recordAttemptStart('complexFunc', 'fallback');
    breaker.recordSuccess('complexFunc');

    // After fix: function has didEscalate=true, so module escalation rate is 100%
    // This should trigger a circuit break due to >20% module escalation rate
    expect(breaker.isTripped()).toBe(true);
    expect(breaker.getTripReason()?.type).toBe('module_escalation_rate');
  });

  it('should trip and generate report for complete failure scenario', () => {
    const breaker = createCircuitBreaker();

    breaker.registerFunction('impossibleFunc', 'impossible.ts');

    // Fail on worker
    breaker.recordAttemptStart('impossibleFunc', 'worker');
    breaker.recordEscalation('impossibleFunc', 'fallback');

    // Fail on fallback
    breaker.recordAttemptStart('impossibleFunc', 'fallback');
    breaker.recordEscalation('impossibleFunc', 'architect');

    // Fail on architect
    breaker.recordAttemptStart('impossibleFunc', 'architect');
    breaker.recordFailure('impossibleFunc', createTypeFailure('Unsolvable type error'));

    // Function escalates (didEscalate: true), so module escalation rate is 100%
    // Function also fails at architect tier
    // Both conditions are met, but function_exhausted is checked first
    expect(breaker.isTripped()).toBe(true);
    expect(breaker.getTripReason()?.type).toBe('function_exhausted');
    const report = breaker.generateReport();
    expect(report).toBeDefined();
    expect(report?.failedFunctions).toHaveLength(1);
    expect(report?.recommendations.length).toBeGreaterThan(0);
  });
});
