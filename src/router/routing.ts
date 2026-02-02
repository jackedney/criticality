/**
 * Deterministic Model Routing Logic for the Criticality Protocol.
 *
 * Provides purely deterministic routing rules based on measurable signals.
 * No LLM reasoning is used for routing decisions - all logic is based on
 * concrete thresholds and formulas defined in SPECIFICATION.md Section 7.1.
 *
 * @packageDocumentation
 */

import { TypedMap } from '../utils/typed-map.js';
import type { ModelAlias, ModelRouterRequest } from './types.js';
import { defaultTokenCounter, type TokenCounter } from './context.js';

/**
 * Task types that determine base model selection.
 */
export type TaskType = 'implement' | 'audit' | 'transform' | 'synthesize' | 'structure';

/**
 * Array of all valid task types.
 */
export const TASK_TYPES: readonly TaskType[] = [
  'implement',
  'audit',
  'transform',
  'synthesize',
  'structure',
] as const;

/**
 * Checks if a string is a valid TaskType.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid TaskType.
 */
export function isValidTaskType(value: string): value is TaskType {
  return TASK_TYPES.includes(value as TaskType);
}

/**
 * Parameters for calculating signature complexity.
 */
export interface SignatureComplexityParams {
  /** Number of generic/type parameters (e.g., <T, U>). */
  readonly genericParams: number;
  /** Number of union type members (e.g., string | number has 2). */
  readonly unionMembers: number;
  /** Number of lifetime parameters (Rust-specific). */
  readonly lifetimeParams: number;
  /** Maximum depth of nested types. */
  readonly nestedTypeDepth: number;
  /** Total number of function parameters. */
  readonly paramCount: number;
}

/**
 * Default signature complexity params (simplest case).
 */
export const DEFAULT_SIGNATURE_PARAMS: SignatureComplexityParams = {
  genericParams: 0,
  unionMembers: 0,
  lifetimeParams: 0,
  nestedTypeDepth: 0,
  paramCount: 0,
} as const;

/**
 * Routing signals from the specification.
 *
 * These signals are used by the deterministic routing logic to decide
 * which model to use for a given task.
 */
export interface RoutingSignals {
  /** Estimated input tokens for the request. */
  readonly estimatedInputTokens: number;
  /** Estimated output tokens for the response. */
  readonly estimatedOutputTokens: number;
  /** Type of task being performed. */
  readonly taskType: TaskType;
  /** Signature complexity (for Injection phase). */
  readonly signatureComplexity: number;
  /** Number of type/function dependencies. */
  readonly dependencyCount: number;
  /** Number of micro-contract clauses. */
  readonly contractCount: number;
  /** Prior escalations in the same session. */
  readonly priorEscalations: number;
  /** Current module's escalation rate. */
  readonly moduleEscalationRate: number;
}

/**
 * Default routing signals (minimal values).
 */
export const DEFAULT_ROUTING_SIGNALS: RoutingSignals = {
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
  taskType: 'implement',
  signatureComplexity: 0,
  dependencyCount: 0,
  contractCount: 0,
  priorEscalations: 0,
  moduleEscalationRate: 0,
} as const;

/**
 * Routing thresholds from SPECIFICATION.md Section 7.1.
 */
export interface RoutingThresholds {
  /** Input token threshold for upgrade (default: 12000). */
  readonly inputTokenThreshold: number;
  /** Signature complexity threshold for upgrade (default: 5). */
  readonly complexityThreshold: number;
}

/**
 * Default routing thresholds per specification.
 */
export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  inputTokenThreshold: 12000,
  complexityThreshold: 5,
} as const;

/**
 * Result of a routing decision.
 */
export interface RoutingDecision {
  /** The selected model alias. */
  readonly modelAlias: ModelAlias;
  /** Whether the model was upgraded from the base. */
  readonly wasUpgraded: boolean;
  /** The original base model (before any upgrade). */
  readonly baseModel: ModelAlias;
  /** The reason for the routing decision. */
  readonly reason: string;
  /** Which rule triggered the upgrade (if any). */
  readonly upgradeRule?: 'token_threshold' | 'complexity_threshold';
}

/**
 * Map from task type to base model alias.
 */
export const TASK_TYPE_TO_BASE_MODEL: TypedMap<TaskType, ModelAlias> = TypedMap.fromEntries([
  ['implement', 'worker'],
  ['audit', 'auditor'],
  ['transform', 'worker'],
  ['synthesize', 'architect'],
  ['structure', 'structurer'],
]);

/**
 * Calculate signature complexity using the formula from SPECIFICATION.md.
 *
 * Formula:
 * ```
 * signatureComplexity =
 *     genericParams * 2 +
 *     unionMembers +
 *     lifetimeParams * 2 +
 *     nestedTypeDepth +
 *     paramCount * 0.5
 * ```
 *
 * @param params - The signature parameters to analyze.
 * @returns The calculated complexity score.
 *
 * @example
 * ```typescript
 * // Simple function with no generics
 * calculateSignatureComplexity({
 *   genericParams: 0,
 *   unionMembers: 0,
 *   lifetimeParams: 0,
 *   nestedTypeDepth: 0,
 *   paramCount: 2
 * }); // Returns 1 (2 * 0.5)
 *
 * // Complex function with generics and unions
 * calculateSignatureComplexity({
 *   genericParams: 2,  // <T, U>
 *   unionMembers: 3,   // A | B | C
 *   lifetimeParams: 0,
 *   nestedTypeDepth: 2,
 *   paramCount: 4
 * }); // Returns 11 (2*2 + 3 + 0 + 2 + 4*0.5)
 * ```
 */
export function calculateSignatureComplexity(params: SignatureComplexityParams): number {
  const { genericParams, unionMembers, lifetimeParams, nestedTypeDepth, paramCount } = params;

  return genericParams * 2 + unionMembers + lifetimeParams * 2 + nestedTypeDepth + paramCount * 0.5;
}

/**
 * Get the base model for a task type.
 *
 * @param taskType - The type of task.
 * @returns The base model alias for this task type.
 */
export function getBaseModel(taskType: TaskType): ModelAlias {
  return TASK_TYPE_TO_BASE_MODEL.get(taskType) ?? 'worker';
}

/**
 * Determine if a request should be upgraded based on routing signals.
 *
 * This implements the pre-emption rules from SPECIFICATION.md Section 7.1:
 * 1. estimatedInputTokens > 12000 → upgrade to structurer_model
 * 2. signatureComplexity > 5 → upgrade to structurer_model
 *
 * Rules are evaluated in order; first match wins.
 *
 * @param signals - The routing signals to evaluate.
 * @param thresholds - The thresholds to use (defaults to specification values).
 * @returns The routing decision.
 *
 * @example
 * ```typescript
 * // Simple task - no upgrade
 * determineRouting({
 *   ...DEFAULT_ROUTING_SIGNALS,
 *   taskType: 'implement',
 *   estimatedInputTokens: 5000,
 *   signatureComplexity: 2
 * });
 * // Returns: { modelAlias: 'worker', wasUpgraded: false, ... }
 *
 * // Complex signature - upgrade
 * determineRouting({
 *   ...DEFAULT_ROUTING_SIGNALS,
 *   taskType: 'implement',
 *   signatureComplexity: 7
 * });
 * // Returns: { modelAlias: 'structurer', wasUpgraded: true, upgradeRule: 'complexity_threshold', ... }
 * ```
 */
export function determineRouting(
  signals: RoutingSignals,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS
): RoutingDecision {
  const baseModel = getBaseModel(signals.taskType);

  // Rule 1: Check input token threshold
  // Only upgrade if base model is worker (implement/transform tasks)
  if (signals.estimatedInputTokens > thresholds.inputTokenThreshold && baseModel === 'worker') {
    return {
      modelAlias: 'structurer',
      wasUpgraded: true,
      baseModel,
      reason: `Input tokens (${String(signals.estimatedInputTokens)}) exceed threshold (${String(thresholds.inputTokenThreshold)})`,
      upgradeRule: 'token_threshold',
    };
  }

  // Rule 2: Check signature complexity threshold
  // Only upgrade if base model is worker (implement/transform tasks)
  if (signals.signatureComplexity > thresholds.complexityThreshold && baseModel === 'worker') {
    return {
      modelAlias: 'structurer',
      wasUpgraded: true,
      baseModel,
      reason: `Signature complexity (${String(signals.signatureComplexity)}) exceeds threshold (${String(thresholds.complexityThreshold)})`,
      upgradeRule: 'complexity_threshold',
    };
  }

  // No upgrade needed - use base model
  return {
    modelAlias: baseModel,
    wasUpgraded: false,
    baseModel,
    reason: `Task type '${signals.taskType}' uses base model '${baseModel}'`,
  };
}

/**
 * Create routing signals from a model router request.
 *
 * @param request - The model router request.
 * @param taskType - The type of task (defaults to 'implement').
 * @param signatureParams - Optional signature complexity parameters.
 * @param counter - Token counter to use.
 * @returns Routing signals derived from the request.
 */
export function createRoutingSignals(
  request: ModelRouterRequest,
  taskType: TaskType = 'implement',
  signatureParams?: SignatureComplexityParams,
  counter: TokenCounter = defaultTokenCounter
): RoutingSignals {
  // Calculate input tokens
  let estimatedInputTokens = counter.countTokens(request.prompt);
  if (request.parameters?.systemPrompt !== undefined) {
    estimatedInputTokens += counter.countTokens(request.parameters.systemPrompt);
  }

  // Calculate signature complexity if params provided
  const signatureComplexity =
    signatureParams !== undefined ? calculateSignatureComplexity(signatureParams) : 0;

  // Build signals object
  return {
    estimatedInputTokens,
    estimatedOutputTokens: request.parameters?.maxTokens ?? 4000,
    taskType,
    signatureComplexity,
    dependencyCount: 0, // Not calculated from request alone
    contractCount: 0, // Not calculated from request alone
    priorEscalations: 0, // Requires session context
    moduleEscalationRate: 0, // Requires session context
  };
}

/**
 * Apply routing decision to a model router request.
 *
 * @param request - The original request.
 * @param decision - The routing decision.
 * @returns A new request with the model alias from the decision.
 */
export function applyRoutingDecision(
  request: ModelRouterRequest,
  decision: RoutingDecision
): ModelRouterRequest {
  if (decision.modelAlias === request.modelAlias) {
    return request;
  }

  return {
    ...request,
    modelAlias: decision.modelAlias,
  };
}

/**
 * Convenience function to route a request in one call.
 *
 * Combines createRoutingSignals, determineRouting, and applyRoutingDecision.
 *
 * @param request - The original request.
 * @param taskType - The type of task.
 * @param signatureParams - Optional signature complexity parameters.
 * @param thresholds - Optional routing thresholds.
 * @param counter - Token counter to use.
 * @returns Object with routed request and routing decision.
 *
 * @example
 * ```typescript
 * const request: ModelRouterRequest = {
 *   modelAlias: 'worker',
 *   prompt: 'Implement function X...',
 * };
 *
 * const { routedRequest, decision } = routeRequest(
 *   request,
 *   'implement',
 *   { genericParams: 3, unionMembers: 2, lifetimeParams: 0, nestedTypeDepth: 1, paramCount: 4 }
 * );
 *
 * // If complexity > 5, routedRequest.modelAlias will be 'structurer'
 * ```
 */
export function routeRequest(
  request: ModelRouterRequest,
  taskType: TaskType = 'implement',
  signatureParams?: SignatureComplexityParams,
  thresholds?: RoutingThresholds,
  counter: TokenCounter = defaultTokenCounter
): { readonly routedRequest: ModelRouterRequest; readonly decision: RoutingDecision } {
  const signals = createRoutingSignals(request, taskType, signatureParams, counter);
  const decision = determineRouting(signals, thresholds);
  const routedRequest = applyRoutingDecision(request, decision);

  return { routedRequest, decision };
}

/**
 * Check if a task type uses the worker model as its base.
 *
 * @param taskType - The task type to check.
 * @returns True if the task type uses worker model.
 */
export function isWorkerTask(taskType: TaskType): boolean {
  return (TASK_TYPE_TO_BASE_MODEL.get(taskType) ?? 'worker') === 'worker';
}

/**
 * Check if pre-emptive upgrade rules apply to a task type.
 *
 * Pre-emptive upgrades only apply to worker tasks (implement, transform).
 *
 * @param taskType - The task type to check.
 * @returns True if pre-emptive upgrades can apply.
 */
export function canPreemptivelyUpgrade(taskType: TaskType): boolean {
  return isWorkerTask(taskType);
}

/**
 * Validate routing thresholds.
 *
 * @param thresholds - Thresholds to validate.
 * @returns Object with valid flag and any errors.
 */
export function validateRoutingThresholds(thresholds: RoutingThresholds): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  if (thresholds.inputTokenThreshold < 0) {
    errors.push('inputTokenThreshold must be non-negative');
  }

  if (thresholds.complexityThreshold < 0) {
    errors.push('complexityThreshold must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate signature complexity parameters.
 *
 * @param params - Parameters to validate.
 * @returns Object with valid flag and any errors.
 */
export function validateSignatureParams(params: SignatureComplexityParams): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];

  if (params.genericParams < 0) {
    errors.push('genericParams must be non-negative');
  }

  if (params.unionMembers < 0) {
    errors.push('unionMembers must be non-negative');
  }

  if (params.lifetimeParams < 0) {
    errors.push('lifetimeParams must be non-negative');
  }

  if (params.nestedTypeDepth < 0) {
    errors.push('nestedTypeDepth must be non-negative');
  }

  if (params.paramCount < 0) {
    errors.push('paramCount must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
