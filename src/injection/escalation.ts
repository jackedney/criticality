/**
 * Escalation logic for the Injection phase.
 *
 * Implements the escalation table from SPECIFICATION.md section 5.4 with:
 * - FailureType discriminated union for all failure categories
 * - Escalation chain: worker_model -> fallback_model -> architect_model
 * - Different escalation rules for different failure types
 * - Attempt tracking per model per function
 * - Security vulnerabilities escalate to architect_model immediately
 * - Syntax hint retry logic for recoverable errors
 *
 * @packageDocumentation
 */

import type { ModelAlias } from '../router/types.js';
import { TypedMap } from '../utils/typed-map.js';

// ============================================================================
// Failure Types
// ============================================================================

/**
 * Represents a test failure with details.
 */
export interface TestFailure {
  /** The name of the failing test. */
  readonly testName: string;
  /** The expected value. */
  readonly expected: string;
  /** The actual value. */
  readonly actual: string;
  /** Optional error message. */
  readonly errorMessage?: string;
}

/**
 * Resource types for timeout failures.
 */
export type Resource = 'cpu' | 'memory' | 'time' | 'network';

/**
 * Semantic violation types.
 */
export interface SemanticViolation {
  /** The type of semantic violation. */
  readonly type: 'contract' | 'invariant' | 'postcondition' | 'precondition';
  /** Description of the violation. */
  readonly description: string;
  /** The contract clause that was violated. */
  readonly violatedClause?: string;
}

/**
 * Big-O complexity notation.
 */
export type BigO = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)' | 'O(n^3)' | 'O(2^n)';

/**
 * Security vulnerability types (OWASP Top 10 + CWE).
 */
export type VulnerabilityType =
  | 'injection' // CWE-89 SQL Injection, CWE-78 OS Command Injection
  | 'broken-auth'
  | 'sensitive-data-exposure'
  | 'xxe'
  | 'broken-access-control'
  | 'security-misconfiguration'
  | 'xss' // CWE-79
  | 'insecure-deserialization'
  | 'known-vulnerable-components'
  | 'insufficient-logging'
  | 'path-traversal'; // CWE-22

/**
 * Discriminated union of all failure types.
 * Matches SPECIFICATION.md section 5.4 Failure Taxonomy.
 */
export type FailureType =
  | { readonly type: 'syntax'; readonly parseError: string; readonly recoverable: boolean }
  | { readonly type: 'type'; readonly compilerError: string }
  | { readonly type: 'test'; readonly failingTests: readonly TestFailure[] }
  | { readonly type: 'timeout'; readonly resource: Resource; readonly limit: number }
  | { readonly type: 'semantic'; readonly violation: SemanticViolation }
  | { readonly type: 'complexity'; readonly expected: BigO; readonly measured: BigO }
  | { readonly type: 'security'; readonly vulnerability: VulnerabilityType }
  | { readonly type: 'coherence'; readonly conflictingFunctions: readonly string[] };

// ============================================================================
// Model Tiers
// ============================================================================

/**
 * Model tier for escalation tracking.
 * Maps to the escalation chain: worker -> fallback -> architect.
 */
export type ModelTier = 'worker' | 'fallback' | 'architect';

/**
 * Array of model tiers in escalation order.
 */
export const MODEL_TIER_ORDER: readonly ModelTier[] = ['worker', 'fallback', 'architect'] as const;

/**
 * Maps ModelTier to ModelAlias for routing.
 */
export const MODEL_TIER_TO_ALIAS: Readonly<Record<ModelTier, ModelAlias>> = {
  worker: 'worker',
  fallback: 'fallback',
  architect: 'architect',
} as const;

/**
 * Gets the next tier in the escalation chain.
 *
 * @param currentTier - The current model tier.
 * @returns The next tier, or undefined if at the top.
 */
export function getNextTier(currentTier: ModelTier): ModelTier | undefined {
  const currentIndex = MODEL_TIER_ORDER.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex >= MODEL_TIER_ORDER.length - 1) {
    return undefined;
  }
  return MODEL_TIER_ORDER[currentIndex + 1];
}

/**
 * Checks if a tier is the highest (architect).
 *
 * @param tier - The tier to check.
 * @returns True if this is the highest tier.
 */
export function isHighestTier(tier: ModelTier): boolean {
  return tier === 'architect';
}

// ============================================================================
// Attempt Tracking
// ============================================================================

/**
 * Tracks attempts per model tier for a single function.
 */
export interface FunctionAttempts {
  /** The function identifier (name or qualified name). */
  readonly functionId: string;
  /** Attempts per model tier. */
  readonly attemptsByTier: TypedMap<ModelTier, number>;
  /** Total attempts across all tiers. */
  readonly totalAttempts: number;
  /** The last failure type encountered. */
  readonly lastFailure?: FailureType;
  /** Whether a syntax hint was already provided for the current attempt. */
  readonly syntaxHintProvided: boolean;
}

/**
 * Creates a new empty function attempts tracker.
 *
 * @param functionId - The function identifier.
 * @returns A new FunctionAttempts object.
 */
export function createFunctionAttempts(functionId: string): FunctionAttempts {
  return {
    functionId,
    attemptsByTier: new TypedMap<ModelTier, number>()
      .set('worker', 0)
      .set('fallback', 0)
      .set('architect', 0),
    totalAttempts: 0,
    syntaxHintProvided: false,
  };
}

/**
 * Records an attempt for a function on a specific tier.
 *
 * @param attempts - The current attempts tracker.
 * @param tier - The model tier that was used.
 * @param failure - Optional failure type if the attempt failed.
 * @returns A new FunctionAttempts with the updated counts.
 */
export function recordAttempt(
  attempts: FunctionAttempts,
  tier: ModelTier,
  failure?: FailureType
): FunctionAttempts {
  const currentCount = attempts.attemptsByTier.get(tier) ?? 0;
  const newAttemptsByTier = new TypedMap<ModelTier, number>();
  const entriesArray = Array.from(attempts.attemptsByTier.entries());
  for (const [k, v] of entriesArray) {
    newAttemptsByTier.set(k, v);
  }
  newAttemptsByTier.set(tier, currentCount + 1);

  const base = {
    functionId: attempts.functionId,
    attemptsByTier: newAttemptsByTier,
    totalAttempts: attempts.totalAttempts + 1,
    syntaxHintProvided: attempts.syntaxHintProvided,
  };

  if (failure !== undefined) {
    return { ...base, lastFailure: failure };
  }

  return base;
}

/**
 * Records that a syntax hint was provided.
 *
 * @param attempts - The current attempts tracker.
 * @returns A new FunctionAttempts with syntaxHintProvided set to true.
 */
export function recordSyntaxHint(attempts: FunctionAttempts): FunctionAttempts {
  return {
    ...attempts,
    syntaxHintProvided: true,
  };
}

/**
 * Resets the syntax hint flag (called when moving to a new tier).
 *
 * @param attempts - The current attempts tracker.
 * @returns A new FunctionAttempts with syntaxHintProvided reset.
 */
export function resetSyntaxHint(attempts: FunctionAttempts): FunctionAttempts {
  return {
    ...attempts,
    syntaxHintProvided: false,
  };
}

// ============================================================================
// Escalation Configuration
// ============================================================================

/**
 * Configuration for escalation behavior.
 */
export interface EscalationConfig {
  /** Maximum retries on same model for syntax errors with hint. Default: 2. */
  readonly syntaxRetryLimit: number;
  /** Maximum retries on same model for type errors before escalation. Default: 2. */
  readonly typeRetryLimit: number;
  /** Maximum retries on same model for test failures before escalation. Default: 3. */
  readonly testRetryLimit: number;
  /** Maximum total attempts per function across all tiers. Default: 8. */
  readonly maxAttemptsPerFunction: number;
}

/**
 * Default escalation configuration from SPECIFICATION.md.
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  syntaxRetryLimit: 2,
  typeRetryLimit: 2,
  testRetryLimit: 3,
  maxAttemptsPerFunction: 8,
} as const;

// ============================================================================
// Escalation Decision
// ============================================================================

/**
 * Actions that can be taken based on escalation logic.
 */
export type EscalationAction =
  | { readonly type: 'retry_same'; readonly withHint: boolean; readonly hint?: string }
  | { readonly type: 'escalate'; readonly toTier: ModelTier }
  | {
      readonly type: 'circuit_break';
      readonly reason: string;
      readonly requiresHumanReview: boolean;
    };

/**
 * Result of determining the escalation action.
 */
export interface EscalationDecision {
  /** The action to take. */
  readonly action: EscalationAction;
  /** The model tier to use for the next attempt (if not circuit breaking). */
  readonly nextTier?: ModelTier;
  /** Reason for the decision. */
  readonly reason: string;
}

/**
 * Checks if a syntax error is recoverable.
 *
 * Recoverable syntax errors include:
 * - Missing semicolons
 * - Missing brackets/braces
 * - Simple typos
 *
 * Fatal syntax errors include:
 * - Completely malformed code
 * - Language-level issues
 *
 * @param parseError - The parse error message.
 * @returns True if the error seems recoverable with a hint.
 */
export function isSyntaxRecoverable(parseError: string): boolean {
  const recoverablePatterns = [
    /missing.*semicolon/i,
    /expected.*[;{}()[\]]/i,
    /unexpected token/i,
    /unterminated.*string/i,
    /unexpected end/i,
  ];

  return recoverablePatterns.some((pattern) => pattern.test(parseError));
}

/**
 * Generates a syntax hint for a recoverable error.
 *
 * @param parseError - The parse error message.
 * @returns A hint string to include in the retry prompt.
 */
export function generateSyntaxHint(parseError: string): string {
  return (
    `SYNTAX ERROR in previous attempt:\n${parseError}\n\n` +
    `Please ensure the code is syntactically valid TypeScript. ` +
    `Check for missing semicolons, brackets, and proper string termination.`
  );
}

/**
 * Determines the escalation action based on failure type and attempt history.
 *
 * Implements the escalation table from SPECIFICATION.md section 5.4:
 *
 * | Failure | Model | Attempt | Action |
 * |---------|-------|---------|--------|
 * | Syntax (recoverable) | worker | 1 | Retry same model |
 * | Syntax (recoverable) | worker | 2 | Retry with syntax hint |
 * | Syntax (fatal) | worker | 1 | Escalate to fallback |
 * | Type | worker | 1 | Retry with expanded type context |
 * | Type | worker | 2 | Escalate to fallback |
 * | Type | fallback | 2 | Escalate to architect |
 * | Type | architect | 2 | Circuit break |
 * | Test | worker | 1-2 | Retry same model |
 * | Test | worker | 3 | Escalate to fallback |
 * | Test | fallback | 2 | Escalate to architect |
 * | Test | architect | 2 | Circuit break + human review |
 * | Timeout | Any | 1 | Escalate immediately |
 * | Semantic | worker | 1 | Escalate to fallback |
 * | Semantic | fallback | 1 | Escalate to architect |
 * | Semantic | architect | 1 | Circuit break + human review |
 * | Security | Any | 1 | Escalate to architect immediately |
 * | Coherence | Any | 1 | Circuit break (return to Lattice) |
 *
 * @param failure - The failure that occurred.
 * @param attempts - The attempt history for this function.
 * @param currentTier - The current model tier.
 * @param config - Optional escalation configuration.
 * @returns The escalation decision.
 */
export function determineEscalation(
  failure: FailureType,
  attempts: FunctionAttempts,
  currentTier: ModelTier,
  config: EscalationConfig = DEFAULT_ESCALATION_CONFIG
): EscalationDecision {
  const currentAttempts = attempts.attemptsByTier.get(currentTier) ?? 0;

  // Check for max attempts exceeded
  if (attempts.totalAttempts >= config.maxAttemptsPerFunction) {
    return {
      action: {
        type: 'circuit_break',
        reason: `Maximum attempts (${String(config.maxAttemptsPerFunction)}) exceeded`,
        requiresHumanReview: false,
      },
      reason: `Exceeded max attempts per function (${String(attempts.totalAttempts)}/${String(config.maxAttemptsPerFunction)})`,
    };
  }

  switch (failure.type) {
    case 'syntax':
      return handleSyntaxFailure(failure, attempts, currentTier, config);

    case 'type':
      return handleTypeFailure(currentAttempts, currentTier, config);

    case 'test':
      return handleTestFailure(currentAttempts, currentTier, config);

    case 'timeout':
      return handleTimeoutFailure(currentTier);

    case 'semantic':
      return handleSemanticFailure(currentTier);

    case 'security':
      return handleSecurityFailure(currentTier);

    case 'coherence':
      return handleCoherenceFailure();

    case 'complexity':
      // Treat complexity failures like test failures
      return handleTestFailure(currentAttempts, currentTier, config);
  }
}

/**
 * Handles syntax failure escalation.
 */
function handleSyntaxFailure(
  failure: Extract<FailureType, { type: 'syntax' }>,
  attempts: FunctionAttempts,
  currentTier: ModelTier,
  config: EscalationConfig
): EscalationDecision {
  const currentAttempts = attempts.attemptsByTier.get(currentTier) ?? 0;

  // Fatal syntax errors always escalate
  if (!failure.recoverable) {
    return escalateOrBreak(currentTier, 'Fatal syntax error - escalating');
  }

  // Recoverable syntax errors
  if (currentAttempts < config.syntaxRetryLimit) {
    // First attempt: retry same model
    if (!attempts.syntaxHintProvided) {
      return {
        action: { type: 'retry_same', withHint: false },
        nextTier: currentTier,
        reason: `Recoverable syntax error, retry ${String(currentAttempts + 1)}/${String(config.syntaxRetryLimit)}`,
      };
    }

    // Already provided hint, retry with it again
    return {
      action: {
        type: 'retry_same',
        withHint: true,
        hint: generateSyntaxHint(failure.parseError),
      },
      nextTier: currentTier,
      reason: `Recoverable syntax error with hint, retry ${String(currentAttempts + 1)}/${String(config.syntaxRetryLimit)}`,
    };
  }

  // Reached retry limit
  if (currentAttempts === config.syntaxRetryLimit && !attempts.syntaxHintProvided) {
    // Last retry on this tier, provide hint
    return {
      action: {
        type: 'retry_same',
        withHint: true,
        hint: generateSyntaxHint(failure.parseError),
      },
      nextTier: currentTier,
      reason: 'Final retry with syntax hint before escalation',
    };
  }

  // Exceeded retry limit, escalate
  return escalateOrBreak(currentTier, 'Syntax error retry limit exceeded');
}

/**
 * Handles type failure escalation.
 */
function handleTypeFailure(
  currentAttempts: number,
  currentTier: ModelTier,
  config: EscalationConfig
): EscalationDecision {
  // First attempt: retry with expanded type context
  if (currentAttempts < config.typeRetryLimit) {
    return {
      action: {
        type: 'retry_same',
        withHint: true,
        hint: 'Please ensure all types are used correctly. Review the type definitions provided.',
      },
      nextTier: currentTier,
      reason: `Type error, retry ${String(currentAttempts + 1)}/${String(config.typeRetryLimit)} with expanded context`,
    };
  }

  // Reached retry limit, escalate
  return escalateOrBreak(currentTier, 'Type error retry limit exceeded');
}

/**
 * Handles test failure escalation.
 */
function handleTestFailure(
  currentAttempts: number,
  currentTier: ModelTier,
  config: EscalationConfig
): EscalationDecision {
  // Retry on same model until limit
  if (currentAttempts < config.testRetryLimit) {
    return {
      action: { type: 'retry_same', withHint: false },
      nextTier: currentTier,
      reason: `Test failure, retry ${String(currentAttempts + 1)}/${String(config.testRetryLimit)}`,
    };
  }

  // Reached retry limit, escalate
  const result = escalateOrBreak(currentTier, 'Test failure retry limit exceeded');

  // Test failures on architect require human review
  if (result.action.type === 'circuit_break' && currentTier === 'architect') {
    return {
      action: {
        type: 'circuit_break',
        reason: result.action.reason,
        requiresHumanReview: true,
      },
      reason: result.reason + ' - requires human review',
    };
  }

  return result;
}

/**
 * Handles timeout failure escalation.
 * Timeouts always escalate immediately.
 */
function handleTimeoutFailure(currentTier: ModelTier): EscalationDecision {
  return escalateOrBreak(currentTier, 'Timeout - immediate escalation');
}

/**
 * Handles semantic failure escalation.
 * Semantic failures always escalate on first attempt.
 */
function handleSemanticFailure(currentTier: ModelTier): EscalationDecision {
  const result = escalateOrBreak(currentTier, 'Semantic violation - immediate escalation');

  // Semantic failures on architect require human review
  if (result.action.type === 'circuit_break' && currentTier === 'architect') {
    return {
      action: {
        type: 'circuit_break',
        reason: result.action.reason,
        requiresHumanReview: true,
      },
      reason: result.reason + ' - requires human review',
    };
  }

  return result;
}

/**
 * Handles security vulnerability escalation.
 * Security vulnerabilities ALWAYS escalate to architect immediately.
 */
function handleSecurityFailure(currentTier: ModelTier): EscalationDecision {
  // If already on architect, circuit break
  if (currentTier === 'architect') {
    return {
      action: {
        type: 'circuit_break',
        reason: 'Security vulnerability detected - requires human review',
        requiresHumanReview: true,
      },
      reason: 'Security vulnerability on architect model - circuit break with human review',
    };
  }

  // Always escalate directly to architect
  return {
    action: { type: 'escalate', toTier: 'architect' },
    nextTier: 'architect',
    reason: 'Security vulnerability - immediate escalation to architect',
  };
}

/**
 * Handles coherence failure.
 * Coherence failures always circuit break (return to Lattice).
 */
function handleCoherenceFailure(): EscalationDecision {
  return {
    action: {
      type: 'circuit_break',
      reason: 'Coherence failure - conflicting function implementations',
      requiresHumanReview: false,
    },
    reason: 'Coherence failure detected - return to Lattice for structural review',
  };
}

/**
 * Helper to escalate to next tier or circuit break if at top.
 */
function escalateOrBreak(currentTier: ModelTier, reason: string): EscalationDecision {
  const nextTier = getNextTier(currentTier);

  if (nextTier === undefined) {
    return {
      action: {
        type: 'circuit_break',
        reason: `All model tiers exhausted: ${reason}`,
        requiresHumanReview: false,
      },
      reason: `Cannot escalate from ${currentTier} - circuit break`,
    };
  }

  return {
    action: { type: 'escalate', toTier: nextTier },
    nextTier,
    reason: `${reason} - escalating from ${currentTier} to ${nextTier}`,
  };
}

// ============================================================================
// Failure Summary (for escalation prompts)
// ============================================================================

/**
 * Generates a failure summary for escalation prompts.
 *
 * Per SPECIFICATION.md, we pass WHAT failed, not HOW we tried.
 * Previous attempts are discarded.
 *
 * @param functionId - The function identifier.
 * @param signature - The function signature.
 * @param failure - The failure that occurred.
 * @returns A formatted failure summary string.
 */
export function generateFailureSummary(
  functionId: string,
  signature: string,
  failure: FailureType
): string {
  const lines: string[] = [
    `FUNCTION: ${functionId}`,
    `SIGNATURE: ${signature}`,
    '',
    `FAILURE TYPE: ${failure.type.charAt(0).toUpperCase() + failure.type.slice(1)}`,
  ];

  switch (failure.type) {
    case 'syntax':
      lines.push(`PARSE ERROR: ${failure.parseError}`);
      break;

    case 'type':
      lines.push(`COMPILER ERROR: ${failure.compilerError}`);
      break;

    case 'test':
      lines.push('FAILING TESTS:');
      for (const test of failure.failingTests.slice(0, 5)) {
        lines.push(`  - ${test.testName}: expected ${test.expected}, got ${test.actual}`);
      }
      break;

    case 'timeout':
      lines.push(`TIMEOUT: ${failure.resource} exceeded limit of ${String(failure.limit)}ms`);
      break;

    case 'semantic':
      lines.push(`VIOLATION: ${failure.violation.type} - ${failure.violation.description}`);
      if (failure.violation.violatedClause !== undefined) {
        lines.push(`CLAUSE: ${failure.violation.violatedClause}`);
      }
      break;

    case 'complexity':
      lines.push(`EXPECTED: ${failure.expected}`);
      lines.push(`MEASURED: ${failure.measured}`);
      break;

    case 'security':
      lines.push(`VULNERABILITY: ${failure.vulnerability}`);
      break;

    case 'coherence':
      lines.push(`CONFLICTING FUNCTIONS: ${failure.conflictingFunctions.join(', ')}`);
      break;
  }

  lines.push('');
  lines.push('NOTE: Previous attempts discarded. Implement from scratch.');

  return lines.join('\n');
}

// ============================================================================
// Failure Type Constructors
// ============================================================================

/**
 * Creates a syntax failure type.
 *
 * @param parseError - The parse error message.
 * @param recoverable - Whether the error is recoverable (auto-detected if not provided).
 * @returns A syntax failure type.
 */
export function createSyntaxFailure(
  parseError: string,
  recoverable?: boolean
): Extract<FailureType, { type: 'syntax' }> {
  return {
    type: 'syntax',
    parseError,
    recoverable: recoverable ?? isSyntaxRecoverable(parseError),
  };
}

/**
 * Creates a type failure.
 *
 * @param compilerError - The compiler error message.
 * @returns A type failure type.
 */
export function createTypeFailure(compilerError: string): Extract<FailureType, { type: 'type' }> {
  return {
    type: 'type',
    compilerError,
  };
}

/**
 * Creates a test failure.
 *
 * @param failingTests - Array of failing test details.
 * @returns A test failure type.
 */
export function createTestFailure(
  failingTests: readonly TestFailure[]
): Extract<FailureType, { type: 'test' }> {
  return {
    type: 'test',
    failingTests,
  };
}

/**
 * Creates a timeout failure.
 *
 * @param resource - The resource that timed out.
 * @param limit - The timeout limit in milliseconds.
 * @returns A timeout failure type.
 */
export function createTimeoutFailure(
  resource: Resource,
  limit: number
): Extract<FailureType, { type: 'timeout' }> {
  return {
    type: 'timeout',
    resource,
    limit,
  };
}

/**
 * Creates a semantic failure.
 *
 * @param violation - The semantic violation details.
 * @returns A semantic failure type.
 */
export function createSemanticFailure(
  violation: SemanticViolation
): Extract<FailureType, { type: 'semantic' }> {
  return {
    type: 'semantic',
    violation,
  };
}

/**
 * Creates a complexity failure.
 *
 * @param expected - The expected complexity.
 * @param measured - The measured complexity.
 * @returns A complexity failure type.
 */
export function createComplexityFailure(
  expected: BigO,
  measured: BigO
): Extract<FailureType, { type: 'complexity' }> {
  return {
    type: 'complexity',
    expected,
    measured,
  };
}

/**
 * Creates a security failure.
 *
 * @param vulnerability - The type of vulnerability detected.
 * @returns A security failure type.
 */
export function createSecurityFailure(
  vulnerability: VulnerabilityType
): Extract<FailureType, { type: 'security' }> {
  return {
    type: 'security',
    vulnerability,
  };
}

/**
 * Creates a coherence failure.
 *
 * @param conflictingFunctions - The function IDs that conflict.
 * @returns A coherence failure type.
 */
export function createCoherenceFailure(
  conflictingFunctions: readonly string[]
): Extract<FailureType, { type: 'coherence' }> {
  return {
    type: 'coherence',
    conflictingFunctions,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a failure type requires immediate escalation.
 *
 * @param failure - The failure to check.
 * @returns True if the failure should escalate immediately.
 */
export function requiresImmediateEscalation(failure: FailureType): boolean {
  return (
    failure.type === 'security' ||
    failure.type === 'timeout' ||
    failure.type === 'semantic' ||
    failure.type === 'coherence' ||
    (failure.type === 'syntax' && !failure.recoverable)
  );
}

/**
 * Checks if a failure type causes a circuit break.
 *
 * @param failure - The failure to check.
 * @returns True if the failure type always causes circuit break.
 */
export function causesCircuitBreak(failure: FailureType): boolean {
  return failure.type === 'coherence';
}

/**
 * Gets the retry limit for a failure type.
 *
 * @param failure - The failure type.
 * @param config - The escalation configuration.
 * @returns The retry limit for this failure type.
 */
export function getRetryLimit(
  failure: FailureType,
  config: EscalationConfig = DEFAULT_ESCALATION_CONFIG
): number {
  switch (failure.type) {
    case 'syntax':
      return config.syntaxRetryLimit;
    case 'type':
      return config.typeRetryLimit;
    case 'test':
    case 'complexity':
      return config.testRetryLimit;
    case 'timeout':
    case 'semantic':
    case 'security':
    case 'coherence':
      return 0; // Immediate escalation or circuit break
  }
}

/**
 * Formats an escalation action for logging.
 *
 * @param action - The escalation action.
 * @returns A formatted string.
 */
export function formatEscalationAction(action: EscalationAction): string {
  switch (action.type) {
    case 'retry_same':
      return action.withHint ? 'Retry with hint' : 'Retry';
    case 'escalate':
      return `Escalate to ${action.toTier}`;
    case 'circuit_break':
      return action.requiresHumanReview
        ? `Circuit break (human review required): ${action.reason}`
        : `Circuit break: ${action.reason}`;
  }
}
