/**
 * Circuit breaker for the Injection phase.
 *
 * Implements circuit breaking logic to stop runaway failures:
 * - Break if: single function fails across all model tiers (must include architect_model attempt)
 * - Break if: max attempts per function exceeded (default: 8)
 * - Break if: >20% of functions in module escalate
 * - Break if: >10% of all functions fail
 * - On break: return to Lattice with structural defect report
 *
 * @packageDocumentation
 */

import type { FailureType, ModelTier } from './escalation.js';
import { isHighestTier } from './escalation.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for circuit breaker thresholds.
 */
export interface CircuitBreakerConfig {
  /** Maximum attempts per function across all tiers. Default: 8. */
  readonly maxAttemptsPerFunction: number;
  /** Module escalation rate threshold (>X% triggers break). Default: 0.20 (20%). */
  readonly moduleEscalationThreshold: number;
  /** Module escalation rate threshold for warning (>X% logs warning). Default: 0.19 (19%). */
  readonly moduleEscalationWarningThreshold: number;
  /** Global failure rate threshold (>X% triggers break). Default: 0.10 (10%). */
  readonly globalFailureThreshold: number;
  /** Global failure rate threshold for warning (>X% logs warning). Default: 0.08 (8%). */
  readonly globalFailureWarningThreshold: number;
}

/**
 * Default circuit breaker configuration from SPECIFICATION.md.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxAttemptsPerFunction: 8,
  moduleEscalationThreshold: 0.2,
  moduleEscalationWarningThreshold: 0.19,
  globalFailureThreshold: 0.1,
  globalFailureWarningThreshold: 0.08,
} as const;

// ============================================================================
// Circuit Breaker State
// ============================================================================

/**
 * Function implementation status for tracking.
 */
export type FunctionStatus = 'pending' | 'in_progress' | 'success' | 'escalated' | 'failed';

/**
 * Tracks the implementation status of a single function.
 */
export interface FunctionState {
  /** The function identifier (qualified name like "module/functionName"). */
  readonly functionId: string;
  /** The module this function belongs to. */
  readonly modulePath: string;
  /** Current implementation status. */
  readonly status: FunctionStatus;
  /** Current model tier being used. */
  readonly currentTier: ModelTier;
  /** Whether architect tier was attempted. */
  readonly architectAttempted: boolean;
  /** Total attempts across all tiers. */
  readonly totalAttempts: number;
  /** Whether the function escalated from worker. */
  readonly didEscalate: boolean;
  /** The last failure encountered. */
  readonly lastFailure?: FailureType;
}

/**
 * State for the entire injection session.
 */
export interface CircuitBreakerState {
  /** Map of function ID to function state. */
  readonly functions: ReadonlyMap<string, FunctionState>;
  /** Whether the circuit has been tripped. */
  readonly isTripped: boolean;
  /** The trip reason (if tripped). */
  readonly tripReason?: CircuitTripReason;
  /** Warnings emitted (near-threshold states). */
  readonly warnings: readonly CircuitWarning[];
}

// ============================================================================
// Circuit Trip Reasons
// ============================================================================

/**
 * Reasons for circuit breaker trip.
 */
export type CircuitTripReason =
  | {
      readonly type: 'function_exhausted';
      readonly functionId: string;
      readonly totalAttempts: number;
      readonly architectAttempted: boolean;
    }
  | {
      readonly type: 'max_attempts_exceeded';
      readonly functionId: string;
      readonly totalAttempts: number;
      readonly maxAttempts: number;
    }
  | {
      readonly type: 'module_escalation_rate';
      readonly modulePath: string;
      readonly escalatedCount: number;
      readonly totalCount: number;
      readonly rate: number;
      readonly threshold: number;
    }
  | {
      readonly type: 'global_failure_rate';
      readonly failedCount: number;
      readonly totalCount: number;
      readonly rate: number;
      readonly threshold: number;
    };

/**
 * Warning for near-threshold states.
 */
export interface CircuitWarning {
  readonly type: 'module_escalation_warning' | 'global_failure_warning';
  readonly message: string;
  readonly rate: number;
  readonly threshold: number;
  readonly timestamp: number;
}

// ============================================================================
// Structural Defect Report
// ============================================================================

/**
 * A single defect entry in the structural defect report.
 */
export interface StructuralDefect {
  /** The function that failed. */
  readonly functionId: string;
  /** The module containing the function. */
  readonly modulePath: string;
  /** Reason for failure. */
  readonly reason: string;
  /** Total attempts made. */
  readonly totalAttempts: number;
  /** Whether architect tier was attempted. */
  readonly architectAttempted: boolean;
  /** The last failure type. */
  readonly lastFailure?: FailureType;
}

/**
 * Report returned when circuit breaks for Lattice to review.
 */
export interface StructuralDefectReport {
  /** When the report was generated. */
  readonly timestamp: number;
  /** The reason for the circuit break. */
  readonly tripReason: CircuitTripReason;
  /** All functions that failed. */
  readonly failedFunctions: readonly StructuralDefect[];
  /** All functions that escalated. */
  readonly escalatedFunctions: readonly StructuralDefect[];
  /** Module-level summary. */
  readonly moduleSummary: ReadonlyMap<string, ModuleSummary>;
  /** Overall statistics. */
  readonly statistics: CircuitStatistics;
  /** Recommendations for Lattice. */
  readonly recommendations: readonly string[];
}

/**
 * Summary for a single module.
 */
export interface ModuleSummary {
  readonly modulePath: string;
  readonly totalFunctions: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly escalatedCount: number;
  readonly escalationRate: number;
}

/**
 * Overall statistics for the injection session.
 */
export interface CircuitStatistics {
  readonly totalFunctions: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly escalatedCount: number;
  readonly pendingCount: number;
  readonly globalFailureRate: number;
  readonly globalEscalationRate: number;
}

// ============================================================================
// Circuit Breaker Creation
// ============================================================================

/**
 * Creates an empty circuit breaker state.
 *
 * @returns A new empty CircuitBreakerState.
 */
export function createCircuitBreakerState(): CircuitBreakerState {
  return {
    functions: new Map(),
    isTripped: false,
    warnings: [],
  };
}

/**
 * Creates a new function state entry.
 *
 * @param functionId - The function identifier.
 * @param modulePath - The module path.
 * @returns A new FunctionState.
 */
export function createFunctionState(functionId: string, modulePath: string): FunctionState {
  return {
    functionId,
    modulePath,
    status: 'pending',
    currentTier: 'worker',
    architectAttempted: false,
    totalAttempts: 0,
    didEscalate: false,
  };
}

// ============================================================================
// State Updates
// ============================================================================

/**
 * Registers a function in the circuit breaker state.
 *
 * @param state - Current state.
 * @param functionId - The function identifier.
 * @param modulePath - The module path.
 * @returns Updated state with the function registered.
 */
export function registerFunction(
  state: CircuitBreakerState,
  functionId: string,
  modulePath: string
): CircuitBreakerState {
  if (state.functions.has(functionId)) {
    return state;
  }

  const newFunctions = new Map(state.functions);
  newFunctions.set(functionId, createFunctionState(functionId, modulePath));

  return {
    ...state,
    functions: newFunctions,
  };
}

/**
 * Records that a function implementation attempt started.
 *
 * @param state - Current state.
 * @param functionId - The function identifier.
 * @param tier - The model tier being used.
 * @returns Updated state.
 */
export function recordAttemptStart(
  state: CircuitBreakerState,
  functionId: string,
  tier: ModelTier
): CircuitBreakerState {
  const funcState = state.functions.get(functionId);
  if (funcState === undefined) {
    return state;
  }

  const newFunctions = new Map(state.functions);
  newFunctions.set(functionId, {
    ...funcState,
    status: 'in_progress',
    currentTier: tier,
    totalAttempts: funcState.totalAttempts + 1,
    architectAttempted: funcState.architectAttempted || isHighestTier(tier),
  });

  return {
    ...state,
    functions: newFunctions,
  };
}

/**
 * Records a successful function implementation.
 *
 * @param state - Current state.
 * @param functionId - The function identifier.
 * @returns Updated state.
 */
export function recordSuccess(state: CircuitBreakerState, functionId: string): CircuitBreakerState {
  const funcState = state.functions.get(functionId);
  if (funcState === undefined) {
    return state;
  }

  const newFunctions = new Map(state.functions);
  newFunctions.set(functionId, {
    ...funcState,
    status: 'success',
  });

  return {
    ...state,
    functions: newFunctions,
  };
}

/**
 * Records that a function escalated to a higher tier.
 *
 * @param state - Current state.
 * @param functionId - The function identifier.
 * @param newTier - The new model tier.
 * @returns Updated state.
 */
export function recordEscalation(
  state: CircuitBreakerState,
  functionId: string,
  newTier: ModelTier
): CircuitBreakerState {
  const funcState = state.functions.get(functionId);
  if (funcState === undefined) {
    return state;
  }

  const newFunctions = new Map(state.functions);
  newFunctions.set(functionId, {
    ...funcState,
    status: 'escalated',
    currentTier: newTier,
    didEscalate: true,
    architectAttempted: funcState.architectAttempted || isHighestTier(newTier),
  });

  return {
    ...state,
    functions: newFunctions,
  };
}

/**
 * Records a function failure.
 *
 * @param state - Current state.
 * @param functionId - The function identifier.
 * @param failure - The failure type.
 * @returns Updated state.
 */
export function recordFailure(
  state: CircuitBreakerState,
  functionId: string,
  failure: FailureType
): CircuitBreakerState {
  const funcState = state.functions.get(functionId);
  if (funcState === undefined) {
    return state;
  }

  const newFunctions = new Map(state.functions);
  newFunctions.set(functionId, {
    ...funcState,
    status: 'failed',
    lastFailure: failure,
  });

  return {
    ...state,
    functions: newFunctions,
  };
}

// ============================================================================
// Circuit Breaker Check
// ============================================================================

/**
 * Result of checking the circuit breaker.
 */
export interface CircuitCheckResult {
  /** Whether the circuit should trip. */
  readonly shouldTrip: boolean;
  /** The trip reason (if shouldTrip is true). */
  readonly tripReason?: CircuitTripReason;
  /** Any warnings to emit. */
  readonly warnings: readonly CircuitWarning[];
}

/**
 * Checks if the circuit breaker should trip based on current state.
 *
 * Implements all circuit breaking conditions from SPECIFICATION.md:
 * - Break if: single function fails across all model tiers (must include architect_model attempt)
 * - Break if: max attempts per function exceeded (default: 8)
 * - Break if: >20% of functions in module escalate
 * - Break if: >10% of all functions fail
 *
 * @param state - Current circuit breaker state.
 * @param config - Circuit breaker configuration.
 * @returns The check result.
 */
export function checkCircuitBreaker(
  state: CircuitBreakerState,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
): CircuitCheckResult {
  const warnings: CircuitWarning[] = [];

  // Check for function exhaustion (all tiers tried including architect)
  for (const [functionId, funcState] of state.functions) {
    // Check: function failed after architect attempt
    if (funcState.status === 'failed' && funcState.architectAttempted) {
      return {
        shouldTrip: true,
        tripReason: {
          type: 'function_exhausted',
          functionId,
          totalAttempts: funcState.totalAttempts,
          architectAttempted: true,
        },
        warnings,
      };
    }

    // Check: max attempts reached
    if (funcState.totalAttempts >= config.maxAttemptsPerFunction) {
      return {
        shouldTrip: true,
        tripReason: {
          type: 'max_attempts_exceeded',
          functionId,
          totalAttempts: funcState.totalAttempts,
          maxAttempts: config.maxAttemptsPerFunction,
        },
        warnings,
      };
    }
  }

  // Check module escalation rates
  const moduleStats = computeModuleStatistics(state);
  for (const [modulePath, stats] of moduleStats) {
    if (stats.totalFunctions > 0) {
      const escalationRate = stats.escalatedCount / stats.totalFunctions;

      // Check for trip
      if (escalationRate > config.moduleEscalationThreshold) {
        return {
          shouldTrip: true,
          tripReason: {
            type: 'module_escalation_rate',
            modulePath,
            escalatedCount: stats.escalatedCount,
            totalCount: stats.totalFunctions,
            rate: escalationRate,
            threshold: config.moduleEscalationThreshold,
          },
          warnings,
        };
      }

      // Check for warning (19% case from spec example)
      if (
        escalationRate >= config.moduleEscalationWarningThreshold &&
        escalationRate < config.moduleEscalationThreshold
      ) {
        warnings.push({
          type: 'module_escalation_warning',
          message: `Module ${modulePath} escalation rate ${(escalationRate * 100).toFixed(1)}% approaching threshold ${(config.moduleEscalationThreshold * 100).toFixed(0)}%`,
          rate: escalationRate,
          threshold: config.moduleEscalationThreshold,
          timestamp: Date.now(),
        });
      }
    }
  }

  // Check global failure rate
  const stats = computeStatistics(state);
  if (stats.totalFunctions > 0) {
    const failureRate = stats.failedCount / stats.totalFunctions;

    // Check for trip
    if (failureRate > config.globalFailureThreshold) {
      return {
        shouldTrip: true,
        tripReason: {
          type: 'global_failure_rate',
          failedCount: stats.failedCount,
          totalCount: stats.totalFunctions,
          rate: failureRate,
          threshold: config.globalFailureThreshold,
        },
        warnings,
      };
    }

    // Check for warning
    if (
      failureRate > config.globalFailureWarningThreshold &&
      failureRate <= config.globalFailureThreshold
    ) {
      warnings.push({
        type: 'global_failure_warning',
        message: `Global failure rate ${(failureRate * 100).toFixed(1)}% approaching threshold ${(config.globalFailureThreshold * 100).toFixed(0)}%`,
        rate: failureRate,
        threshold: config.globalFailureThreshold,
        timestamp: Date.now(),
      });
    }
  }

  return {
    shouldTrip: false,
    warnings,
  };
}

/**
 * Trips the circuit breaker with the given reason.
 *
 * @param state - Current state.
 * @param reason - The trip reason.
 * @returns Updated state with circuit tripped.
 */
export function tripCircuit(
  state: CircuitBreakerState,
  reason: CircuitTripReason
): CircuitBreakerState {
  return {
    ...state,
    isTripped: true,
    tripReason: reason,
  };
}

/**
 * Adds warnings to the state.
 *
 * @param state - Current state.
 * @param warnings - Warnings to add.
 * @returns Updated state with warnings added.
 */
export function addWarnings(
  state: CircuitBreakerState,
  warnings: readonly CircuitWarning[]
): CircuitBreakerState {
  if (warnings.length === 0) {
    return state;
  }

  return {
    ...state,
    warnings: [...state.warnings, ...warnings],
  };
}

// ============================================================================
// Statistics Computation
// ============================================================================

/**
 * Computes overall statistics from the circuit breaker state.
 *
 * @param state - The circuit breaker state.
 * @returns Circuit statistics.
 */
export function computeStatistics(state: CircuitBreakerState): CircuitStatistics {
  let successCount = 0;
  let failedCount = 0;
  let escalatedCount = 0;
  let pendingCount = 0;

  for (const funcState of state.functions.values()) {
    switch (funcState.status) {
      case 'success':
        successCount++;
        if (funcState.didEscalate) {
          escalatedCount++;
        }
        break;
      case 'failed':
        failedCount++;
        if (funcState.didEscalate) {
          escalatedCount++;
        }
        break;
      case 'escalated':
        escalatedCount++;
        break;
      case 'pending':
      case 'in_progress':
        pendingCount++;
        break;
    }
  }

  const totalFunctions = state.functions.size;

  return {
    totalFunctions,
    successCount,
    failedCount,
    escalatedCount,
    pendingCount,
    globalFailureRate: totalFunctions > 0 ? failedCount / totalFunctions : 0,
    globalEscalationRate: totalFunctions > 0 ? escalatedCount / totalFunctions : 0,
  };
}

/**
 * Computes per-module statistics.
 *
 * @param state - The circuit breaker state.
 * @returns Map of module path to module summary.
 */
export function computeModuleStatistics(
  state: CircuitBreakerState
): ReadonlyMap<string, ModuleSummary> {
  const moduleMap = new Map<
    string,
    { total: number; success: number; failed: number; escalated: number }
  >();

  for (const funcState of state.functions.values()) {
    const existing = moduleMap.get(funcState.modulePath);
    const stats = existing ?? { total: 0, success: 0, failed: 0, escalated: 0 };

    stats.total++;

    if (funcState.status === 'success') {
      stats.success++;
    } else if (funcState.status === 'failed') {
      stats.failed++;
    }

    if (funcState.didEscalate || funcState.status === 'escalated') {
      stats.escalated++;
    }

    moduleMap.set(funcState.modulePath, stats);
  }

  const result = new Map<string, ModuleSummary>();

  for (const [modulePath, stats] of moduleMap) {
    result.set(modulePath, {
      modulePath,
      totalFunctions: stats.total,
      successCount: stats.success,
      failedCount: stats.failed,
      escalatedCount: stats.escalated,
      escalationRate: stats.total > 0 ? stats.escalated / stats.total : 0,
    });
  }

  return result;
}

// ============================================================================
// Structural Defect Report Generation
// ============================================================================

/**
 * Generates a structural defect report for Lattice to review.
 *
 * @param state - The circuit breaker state.
 * @param tripReason - The reason for circuit break.
 * @returns The structural defect report.
 */
export function generateStructuralDefectReport(
  state: CircuitBreakerState,
  tripReason: CircuitTripReason
): StructuralDefectReport {
  const failedFunctions: StructuralDefect[] = [];
  const escalatedFunctions: StructuralDefect[] = [];

  for (const funcState of state.functions.values()) {
    // Build defect conditionally to satisfy exactOptionalPropertyTypes
    const baseDefect = {
      functionId: funcState.functionId,
      modulePath: funcState.modulePath,
      reason: formatFailureReason(funcState),
      totalAttempts: funcState.totalAttempts,
      architectAttempted: funcState.architectAttempted,
    };

    const defect: StructuralDefect =
      funcState.lastFailure !== undefined
        ? { ...baseDefect, lastFailure: funcState.lastFailure }
        : baseDefect;

    if (funcState.status === 'failed') {
      failedFunctions.push(defect);
    }

    if (funcState.didEscalate || funcState.status === 'escalated') {
      escalatedFunctions.push(defect);
    }
  }

  const statistics = computeStatistics(state);
  const moduleSummary = computeModuleStatistics(state);
  const recommendations = generateRecommendations(tripReason, statistics, moduleSummary);

  return {
    timestamp: Date.now(),
    tripReason,
    failedFunctions,
    escalatedFunctions,
    moduleSummary,
    statistics,
    recommendations,
  };
}

/**
 * Formats a failure reason from function state.
 */
function formatFailureReason(funcState: FunctionState): string {
  if (funcState.lastFailure === undefined) {
    return `Status: ${funcState.status}`;
  }

  switch (funcState.lastFailure.type) {
    case 'syntax':
      return `Syntax error: ${funcState.lastFailure.parseError}`;
    case 'type':
      return `Type error: ${funcState.lastFailure.compilerError}`;
    case 'test':
      return `Test failures: ${funcState.lastFailure.failingTests.map((t) => t.testName).join(', ')}`;
    case 'timeout':
      return `Timeout: ${funcState.lastFailure.resource} (${String(funcState.lastFailure.limit)}ms)`;
    case 'semantic':
      return `Semantic violation: ${funcState.lastFailure.violation.description}`;
    case 'complexity':
      return `Complexity violation: expected ${funcState.lastFailure.expected}, measured ${funcState.lastFailure.measured}`;
    case 'security':
      return `Security vulnerability: ${funcState.lastFailure.vulnerability}`;
    case 'coherence':
      return `Coherence failure: conflicts with ${funcState.lastFailure.conflictingFunctions.join(', ')}`;
  }
}

/**
 * Generates recommendations based on the trip reason and statistics.
 */
function generateRecommendations(
  tripReason: CircuitTripReason,
  statistics: CircuitStatistics,
  moduleSummary: ReadonlyMap<string, ModuleSummary>
): string[] {
  const recommendations: string[] = [];

  switch (tripReason.type) {
    case 'function_exhausted':
      recommendations.push(
        `Review function ${tripReason.functionId}: implementation may require manual intervention`,
        'Consider simplifying function contract or splitting into smaller functions',
        'Check if type definitions are correct and complete'
      );
      break;

    case 'max_attempts_exceeded':
      recommendations.push(
        `Function ${tripReason.functionId} exceeded ${String(tripReason.maxAttempts)} attempts`,
        'Review function complexity and consider refactoring',
        'Ensure contracts are implementable with available type constraints'
      );
      break;

    case 'module_escalation_rate':
      recommendations.push(
        `Module ${tripReason.modulePath} has high escalation rate (${(tripReason.rate * 100).toFixed(1)}%)`,
        'Review module structure and function contracts',
        'Consider splitting complex functions into simpler units',
        'Check for systemic issues in type definitions'
      );
      break;

    case 'global_failure_rate':
      recommendations.push(
        `Global failure rate ${(tripReason.rate * 100).toFixed(1)}% exceeds threshold`,
        'Review overall project structure in Lattice',
        'Check for fundamental issues in type system design',
        'Consider reviewing spec constraints for feasibility'
      );
      break;
  }

  // Add module-specific recommendations for problematic modules
  for (const [modulePath, summary] of moduleSummary) {
    if (summary.escalationRate > 0.15) {
      recommendations.push(
        `Module ${modulePath} has ${(summary.escalationRate * 100).toFixed(1)}% escalation rate - review contracts`
      );
    }
  }

  // Add overall recommendations based on statistics
  if (statistics.globalEscalationRate > 0.15) {
    recommendations.push(
      'High overall escalation rate suggests spec constraints may be too complex for worker model'
    );
  }

  return recommendations;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Formats a circuit trip reason for logging.
 *
 * @param reason - The trip reason.
 * @returns A formatted string.
 */
export function formatTripReason(reason: CircuitTripReason): string {
  switch (reason.type) {
    case 'function_exhausted':
      return `Function ${reason.functionId} failed after ${String(reason.totalAttempts)} attempts (architect attempted: ${String(reason.architectAttempted)})`;

    case 'max_attempts_exceeded':
      return `Function ${reason.functionId} exceeded max attempts (${String(reason.totalAttempts)}/${String(reason.maxAttempts)})`;

    case 'module_escalation_rate':
      return `Module ${reason.modulePath} escalation rate ${(reason.rate * 100).toFixed(1)}% exceeds threshold ${(reason.threshold * 100).toFixed(0)}% (${String(reason.escalatedCount)}/${String(reason.totalCount)} functions)`;

    case 'global_failure_rate':
      return `Global failure rate ${(reason.rate * 100).toFixed(1)}% exceeds threshold ${(reason.threshold * 100).toFixed(0)}% (${String(reason.failedCount)}/${String(reason.totalCount)} functions)`;
  }
}

/**
 * Formats a structural defect report as a human-readable string.
 *
 * @param report - The structural defect report.
 * @returns A formatted string.
 */
export function formatStructuralDefectReport(report: StructuralDefectReport): string {
  const lines: string[] = [
    '================================================================================',
    '                      STRUCTURAL DEFECT REPORT                                  ',
    '================================================================================',
    '',
    `Timestamp: ${new Date(report.timestamp).toISOString()}`,
    `Trip Reason: ${formatTripReason(report.tripReason)}`,
    '',
    'STATISTICS:',
    `  Total Functions: ${String(report.statistics.totalFunctions)}`,
    `  Successful: ${String(report.statistics.successCount)}`,
    `  Failed: ${String(report.statistics.failedCount)}`,
    `  Escalated: ${String(report.statistics.escalatedCount)}`,
    `  Pending: ${String(report.statistics.pendingCount)}`,
    `  Global Failure Rate: ${(report.statistics.globalFailureRate * 100).toFixed(1)}%`,
    `  Global Escalation Rate: ${(report.statistics.globalEscalationRate * 100).toFixed(1)}%`,
    '',
  ];

  if (report.failedFunctions.length > 0) {
    lines.push('FAILED FUNCTIONS:');
    lines.push('--------------------------------------------------------------------------------');
    for (const defect of report.failedFunctions) {
      lines.push(`  ${defect.functionId} (${defect.modulePath})`);
      lines.push(`    Reason: ${defect.reason}`);
      lines.push(
        `    Attempts: ${String(defect.totalAttempts)}, Architect: ${String(defect.architectAttempted)}`
      );
    }
    lines.push('');
  }

  if (report.escalatedFunctions.length > 0) {
    lines.push('ESCALATED FUNCTIONS:');
    lines.push('--------------------------------------------------------------------------------');
    for (const defect of report.escalatedFunctions) {
      lines.push(`  ${defect.functionId} (${defect.modulePath})`);
      lines.push(`    Attempts: ${String(defect.totalAttempts)}`);
    }
    lines.push('');
  }

  lines.push('MODULE SUMMARY:');
  lines.push('--------------------------------------------------------------------------------');
  for (const [modulePath, summary] of report.moduleSummary) {
    lines.push(
      `  ${modulePath}: ${String(summary.successCount)}/${String(summary.totalFunctions)} success, ` +
        `${String(summary.failedCount)} failed, ${String(summary.escalatedCount)} escalated ` +
        `(${(summary.escalationRate * 100).toFixed(1)}% escalation)`
    );
  }
  lines.push('');

  if (report.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS:');
    lines.push('--------------------------------------------------------------------------------');
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');
  }

  lines.push('================================================================================');

  return lines.join('\n');
}

// ============================================================================
// High-Level Circuit Breaker Class
// ============================================================================

/**
 * Circuit breaker manager for the Injection phase.
 *
 * Provides a high-level interface for managing circuit breaker state,
 * checking conditions, and generating reports.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: (message: string) => void;

  constructor(
    config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
    logger?: (message: string) => void
  ) {
    this.state = createCircuitBreakerState();
    this.config = config;
    // eslint-disable-next-line no-console
    this.logger = logger ?? console.log;
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitBreakerState {
    return {
      ...this.state,
      functions: new Map(this.state.functions),
      warnings: Array.from(this.state.warnings),
    };
  }

  /**
   * Checks if the circuit is tripped.
   */
  isTripped(): boolean {
    return this.state.isTripped;
  }

  /**
   * Gets the trip reason if tripped.
   */
  getTripReason(): CircuitTripReason | undefined {
    return this.state.tripReason;
  }

  /**
   * Registers a function for tracking.
   *
   * @param functionId - The function identifier.
   * @param modulePath - The module path.
   */
  registerFunction(functionId: string, modulePath: string): void {
    this.state = registerFunction(this.state, functionId, modulePath);
  }

  /**
   * Records the start of an implementation attempt.
   *
   * @param functionId - The function identifier.
   * @param tier - The model tier being used.
   * @returns The check result (may indicate circuit should trip).
   */
  recordAttemptStart(functionId: string, tier: ModelTier): CircuitCheckResult {
    this.state = recordAttemptStart(this.state, functionId, tier);
    return this.check();
  }

  /**
   * Records a successful implementation.
   *
   * @param functionId - The function identifier.
   */
  recordSuccess(functionId: string): void {
    this.state = recordSuccess(this.state, functionId);
  }

  /**
   * Records that a function escalated.
   *
   * @param functionId - The function identifier.
   * @param newTier - The new model tier.
   * @returns The check result (may indicate circuit should trip).
   */
  recordEscalation(functionId: string, newTier: ModelTier): CircuitCheckResult {
    this.state = recordEscalation(this.state, functionId, newTier);
    return this.check();
  }

  /**
   * Records a function failure.
   *
   * @param functionId - The function identifier.
   * @param failure - The failure type.
   * @returns The check result (may indicate circuit should trip).
   */
  recordFailure(functionId: string, failure: FailureType): CircuitCheckResult {
    this.state = recordFailure(this.state, functionId, failure);
    return this.check();
  }

  /**
   * Manually checks the circuit breaker conditions.
   *
   * @returns The check result.
   */
  check(): CircuitCheckResult {
    const result = checkCircuitBreaker(this.state, this.config);

    // Log warnings
    for (const warning of result.warnings) {
      this.logger(`[CIRCUIT BREAKER WARNING] ${warning.message}`);
    }

    // Add warnings to state
    if (result.warnings.length > 0) {
      this.state = addWarnings(this.state, result.warnings);
    }

    // Trip if needed
    if (result.shouldTrip && result.tripReason !== undefined) {
      this.logger(`[CIRCUIT BREAKER TRIPPED] ${formatTripReason(result.tripReason)}`);
      this.state = tripCircuit(this.state, result.tripReason);
    }

    return result;
  }

  /**
   * Generates a structural defect report.
   *
   * @returns The report, or undefined if circuit hasn't tripped.
   */
  generateReport(): StructuralDefectReport | undefined {
    if (!this.state.isTripped || this.state.tripReason === undefined) {
      return undefined;
    }

    return generateStructuralDefectReport(this.state, this.state.tripReason);
  }

  /**
   * Gets current statistics.
   */
  getStatistics(): CircuitStatistics {
    return computeStatistics(this.state);
  }

  /**
   * Gets module-level statistics.
   */
  getModuleStatistics(): ReadonlyMap<string, ModuleSummary> {
    return computeModuleStatistics(this.state);
  }

  /**
   * Gets all warnings that have been emitted.
   */
  getWarnings(): readonly CircuitWarning[] {
    return this.state.warnings;
  }
}

/**
 * Creates a new circuit breaker instance.
 *
 * @param config - Optional configuration.
 * @param logger - Optional logger function.
 * @returns A new CircuitBreaker instance.
 */
export function createCircuitBreaker(
  config?: CircuitBreakerConfig,
  logger?: (message: string) => void
): CircuitBreaker {
  return new CircuitBreaker(config, logger);
}
