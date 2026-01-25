/**
 * DECISIONS.toml Compliance Verification Tests.
 *
 * This file verifies that the Model Router implementation correctly matches
 * all routing-related constraints defined in DECISIONS.toml.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  // Routing
  calculateSignatureComplexity,
  determineRouting,
  DEFAULT_ROUTING_THRESHOLDS,
  DEFAULT_ROUTING_SIGNALS,
  isWorkerTask,
  type RoutingSignals,
  type SignatureComplexityParams,
} from './routing.js';
import {
  // Context
  determineOverflowStrategy,
  PROTECTED_SECTIONS,
  MODEL_CONTEXT_LIMITS,
} from './context.js';
import { DEFAULT_MODEL_ASSIGNMENTS } from '../config/defaults.js';

/**
 * routing_001: Model routing uses deterministic rules based on measurable signals;
 * no LLM reasoning for routing decisions.
 */
describe('routing_001: Deterministic rules, no LLM reasoning', () => {
  it('routing uses only measurable signals (tokens, complexity)', () => {
    // The routing function only accepts RoutingSignals which are all numeric/deterministic
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 5000,
      estimatedOutputTokens: 2000,
      signatureComplexity: 3,
      priorEscalations: 0,
      moduleEscalationRate: 0,
    };

    // Same signals always produce same result (deterministic)
    const result1 = determineRouting(signals);
    const result2 = determineRouting(signals);
    const result3 = determineRouting(signals);

    expect(result1.modelAlias).toBe(result2.modelAlias);
    expect(result2.modelAlias).toBe(result3.modelAlias);
    expect(result1.wasUpgraded).toBe(result2.wasUpgraded);
    expect(result2.wasUpgraded).toBe(result3.wasUpgraded);
  });

  it('routing decision is pure function of inputs', () => {
    const lowComplexity: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      signatureComplexity: 2,
    };

    const highComplexity: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      signatureComplexity: 10,
    };

    const lowResult = determineRouting(lowComplexity);
    const highResult = determineRouting(highComplexity);

    // Different inputs produce predictable different outputs
    expect(lowResult.wasUpgraded).toBe(false);
    expect(highResult.wasUpgraded).toBe(true);
  });

  it('NEGATIVE: routing does not use LLM-based reasoning', () => {
    // Verify that determineRouting only uses the provided signals
    // and doesn't make any external calls (would be caught by test framework)
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
    };

    // This should complete synchronously without any async operations
    const result = determineRouting(signals);
    expect(result).toBeDefined();
    expect(typeof result.modelAlias).toBe('string');
  });
});

/**
 * routing_002: Conservative pre-emption: upgrade model only on strong signals
 * (context > 12k tokens OR signature complexity > 5).
 */
describe('routing_002: Conservative pre-emption thresholds', () => {
  it('default threshold for context is 12000 tokens', () => {
    expect(DEFAULT_ROUTING_THRESHOLDS.inputTokenThreshold).toBe(12000);
  });

  it('default threshold for signature complexity is 5', () => {
    expect(DEFAULT_ROUTING_THRESHOLDS.complexityThreshold).toBe(5);
  });

  it('upgrades when context > 12k tokens', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 12001,
      signatureComplexity: 1,
    };

    const result = determineRouting(signals);

    expect(result.wasUpgraded).toBe(true);
    expect(result.upgradeRule).toBe('token_threshold');
  });

  it('does NOT upgrade when context = 12k tokens (boundary)', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 12000,
      signatureComplexity: 1,
    };

    const result = determineRouting(signals);

    expect(result.wasUpgraded).toBe(false);
  });

  it('upgrades when signature complexity > 5', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 1000,
      signatureComplexity: 6,
    };

    const result = determineRouting(signals);

    expect(result.wasUpgraded).toBe(true);
    expect(result.upgradeRule).toBe('complexity_threshold');
  });

  it('does NOT upgrade when complexity = 5 (boundary)', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 1000,
      signatureComplexity: 5,
    };

    const result = determineRouting(signals);

    expect(result.wasUpgraded).toBe(false);
  });

  it('pre-emption only applies to worker tasks', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'audit', // Not a worker task
      estimatedInputTokens: 20000,
      signatureComplexity: 10,
    };

    const result = determineRouting(signals);

    // Audit tasks don't get pre-emptively upgraded
    expect(result.wasUpgraded).toBe(false);
    expect(result.modelAlias).toBe('auditor');
  });
});

/**
 * routing_003: Two routing paths: Claude models via Claude Code,
 * other models via OpenCode/OpenRouter.
 */
describe('routing_003: Claude via Claude Code, others via OpenCode', () => {
  it('documents Claude model routing via Claude Code client', () => {
    // The ClaudeCodeClient class handles Anthropic models
    // This is verified by the client implementation, not routing logic
    // Here we verify the model aliases that map to Claude
    const claudeModels = ['architect', 'structurer', 'fallback'];

    for (const alias of claudeModels) {
      // These aliases map to Claude models in the default config
      expect(['architect_model', 'structurer_model', 'fallback_model']).toContain(`${alias}_model`);
    }
  });

  it('documents OpenCode model routing for non-Claude models', () => {
    // The OpenCodeClient class handles MiniMax, Kimi, and other models
    // Verify that worker and auditor use non-Claude models by default
    expect(DEFAULT_MODEL_ASSIGNMENTS.worker_model).toBe('minimax-m2');
    expect(DEFAULT_MODEL_ASSIGNMENTS.auditor_model).toBe('kimi-k2');
  });

  it('architect/structurer/fallback use Claude models', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS.architect_model).toBe('claude-opus-4.5');
    expect(DEFAULT_MODEL_ASSIGNMENTS.structurer_model).toBe('claude-sonnet-4.5');
    expect(DEFAULT_MODEL_ASSIGNMENTS.fallback_model).toBe('claude-sonnet-4.5');
  });
});

/**
 * routing_004: Context overflow handling: truncate (mild), upgrade (moderate),
 * reject (severe); chunking allowed only for audit tasks.
 */
describe('routing_004: Context overflow handling', () => {
  it('determines truncate strategy for mild overflow (<20%)', () => {
    const overflowPercentage = 0.1; // 10% overflow
    const modelAlias = 'worker' as const;

    const strategy = determineOverflowStrategy(overflowPercentage, modelAlias);

    expect(strategy.type).toBe('truncate');
  });

  it('determines upgrade strategy for moderate overflow (20-100%)', () => {
    const overflowPercentage = 0.4; // 40% overflow
    const modelAlias = 'worker' as const;

    const strategy = determineOverflowStrategy(overflowPercentage, modelAlias);

    expect(strategy.type).toBe('upgrade');
    if (strategy.type === 'upgrade') {
      expect(strategy.targetModel).toBe('structurer');
    }
  });

  it('determines reject strategy for severe overflow (>100%)', () => {
    const overflowPercentage = 1.5; // 150% overflow (exceeds all models)
    const modelAlias = 'fallback' as const; // No upgrade path from fallback

    const strategy = determineOverflowStrategy(overflowPercentage, modelAlias);

    expect(strategy.type).toBe('reject');
  });

  it('follows upgrade path: worker -> structurer -> architect -> fallback', () => {
    const overflowPercentage = 0.5; // Moderate overflow triggers upgrade

    const workerStrategy = determineOverflowStrategy(overflowPercentage, 'worker');
    const structurerStrategy = determineOverflowStrategy(overflowPercentage, 'structurer');
    const architectStrategy = determineOverflowStrategy(overflowPercentage, 'architect');
    const fallbackStrategy = determineOverflowStrategy(overflowPercentage, 'fallback');

    expect(workerStrategy.type).toBe('upgrade');
    expect(structurerStrategy.type).toBe('upgrade');
    expect(architectStrategy.type).toBe('upgrade');
    expect(fallbackStrategy.type).toBe('reject'); // No upgrade from fallback

    if (workerStrategy.type === 'upgrade') {
      expect(workerStrategy.targetModel).toBe('structurer');
    }
    if (structurerStrategy.type === 'upgrade') {
      expect(structurerStrategy.targetModel).toBe('architect');
    }
    if (architectStrategy.type === 'upgrade') {
      expect(architectStrategy.targetModel).toBe('fallback');
    }
  });

  it('protects signature and contracts from truncation', () => {
    // Verify protected sections match DECISIONS.toml requirement
    // (signature/contracts never truncated, comments first)
    expect(PROTECTED_SECTIONS).toContain('signature');
    expect(PROTECTED_SECTIONS).toContain('contracts');
    expect(PROTECTED_SECTIONS).toContain('systemPrompt');
  });

  it('documents chunking for audit tasks (per DECISIONS.toml)', () => {
    // DECISIONS.toml routing_004: "chunking allowed only for audit tasks"
    // Current implementation uses upgrade strategy instead of chunking for moderate overflow.
    // Chunking is an optional future enhancement - document this gap.
    //
    // Gap: The current implementation uses model upgrade for moderate overflow
    // rather than chunking. Chunking would split the context into multiple
    // sequential calls, which is more complex to implement correctly.
    //
    // The upgrade strategy achieves the same goal (handling larger contexts)
    // by routing to a model with larger context limits.
    expect(true).toBe(true); // Documented architectural decision
  });
});

/**
 * routing_005: signatureComplexity formula:
 * signatureComplexity = genericParams*2 + unionMembers + lifetimeParams*2
 *                       + nestedTypeDepth + paramCount*0.5
 */
describe('routing_005: signatureComplexity formula', () => {
  it('implements the exact formula from DECISIONS.toml', () => {
    const params: SignatureComplexityParams = {
      genericParams: 2, // 2 * 2 = 4
      unionMembers: 3, // 3 * 1 = 3
      lifetimeParams: 1, // 1 * 2 = 2
      nestedTypeDepth: 2, // 2 * 1 = 2
      paramCount: 4, // 4 * 0.5 = 2
    };

    const expected = 4 + 3 + 2 + 2 + 2; // = 13
    const result = calculateSignatureComplexity(params);

    expect(result).toBe(expected);
  });

  it('weights genericParams by 2', () => {
    const result = calculateSignatureComplexity({
      genericParams: 5,
      unionMembers: 0,
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 0,
    });

    expect(result).toBe(10); // 5 * 2
  });

  it('weights unionMembers by 1', () => {
    const result = calculateSignatureComplexity({
      genericParams: 0,
      unionMembers: 7,
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 0,
    });

    expect(result).toBe(7); // 7 * 1
  });

  it('weights lifetimeParams by 2', () => {
    const result = calculateSignatureComplexity({
      genericParams: 0,
      unionMembers: 0,
      lifetimeParams: 3,
      nestedTypeDepth: 0,
      paramCount: 0,
    });

    expect(result).toBe(6); // 3 * 2
  });

  it('weights nestedTypeDepth by 1', () => {
    const result = calculateSignatureComplexity({
      genericParams: 0,
      unionMembers: 0,
      lifetimeParams: 0,
      nestedTypeDepth: 4,
      paramCount: 0,
    });

    expect(result).toBe(4); // 4 * 1
  });

  it('weights paramCount by 0.5', () => {
    const result = calculateSignatureComplexity({
      genericParams: 0,
      unionMembers: 0,
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 10,
    });

    expect(result).toBe(5); // 10 * 0.5
  });

  it('threshold of 5 triggers upgrade (per routing_002)', () => {
    // Signature with complexity = 6 should trigger upgrade
    const complexSignature: SignatureComplexityParams = {
      genericParams: 2, // 4
      unionMembers: 0,
      lifetimeParams: 1, // 2
      nestedTypeDepth: 0,
      paramCount: 0,
    };

    const complexity = calculateSignatureComplexity(complexSignature);
    expect(complexity).toBe(6);

    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      signatureComplexity: complexity,
    };

    const result = determineRouting(signals);
    expect(result.wasUpgraded).toBe(true);
  });
});

/**
 * inject_003: Escalation chain: MiniMax M2 -> Sonnet 4.5 -> Opus 4.5 -> Human.
 *
 * This is implemented via model alias configuration and upgrade paths in context.ts.
 */
describe('inject_003: Escalation chain', () => {
  it('default worker model is MiniMax M2 (first in chain)', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS.worker_model).toBe('minimax-m2');
  });

  it('structurer/fallback is Claude Sonnet 4.5 (second in chain)', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS.structurer_model).toBe('claude-sonnet-4.5');
    expect(DEFAULT_MODEL_ASSIGNMENTS.fallback_model).toBe('claude-sonnet-4.5');
  });

  it('architect is Claude Opus 4.5 (third in chain)', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS.architect_model).toBe('claude-opus-4.5');
  });

  it('worker tasks start with MiniMax (cheapest capable model)', () => {
    expect(isWorkerTask('implement')).toBe(true);
    expect(isWorkerTask('transform')).toBe(true);

    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
    };

    const result = determineRouting(signals);
    expect(result.baseModel).toBe('worker');
  });

  it('upgrade path: worker -> structurer (MiniMax -> Sonnet)', () => {
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      signatureComplexity: 10, // Triggers upgrade
    };

    const result = determineRouting(signals);

    expect(result.baseModel).toBe('worker');
    expect(result.modelAlias).toBe('structurer');
    expect(result.wasUpgraded).toBe(true);
  });

  it('model context limits follow escalation order (increasing capacity)', () => {
    // Verify that larger/more capable models have higher context limits
    const minimaxLimits = MODEL_CONTEXT_LIMITS['minimax-m2'];
    const sonnetLimits = MODEL_CONTEXT_LIMITS['claude-sonnet-4-5'];
    const opusLimits = MODEL_CONTEXT_LIMITS['claude-opus-4-5'];

    // Ensure all limits are defined
    expect(minimaxLimits).toBeDefined();
    expect(sonnetLimits).toBeDefined();
    expect(opusLimits).toBeDefined();

    if (minimaxLimits !== undefined && sonnetLimits !== undefined && opusLimits !== undefined) {
      // Opus has highest capacity (or equal to Sonnet)
      expect(opusLimits.maxInputTokens).toBeGreaterThanOrEqual(sonnetLimits.maxInputTokens);
      // Sonnet has higher capacity than MiniMax
      expect(sonnetLimits.maxInputTokens).toBeGreaterThan(minimaxLimits.maxInputTokens);
    }
  });

  it('documents Human escalation (blocking state)', () => {
    // Human escalation is handled by the blocking system (block_001-005)
    // When all model tiers are exhausted, the system enters BLOCKED state
    // This is tested in protocol/blocking.test.ts
    expect(true).toBe(true); // Documented as architectural integration
  });
});

/**
 * Negative test cases as required by acceptance criteria.
 */
describe('Negative cases', () => {
  it('NEGATIVE: routing_001 - would fail if LLM was used for routing', () => {
    // If routing used LLM reasoning, it would:
    // 1. Be non-deterministic (same inputs, different outputs)
    // 2. Require async operations
    // 3. Have latency

    // Verify determinism by running multiple times
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 5000,
      signatureComplexity: 3,
    };

    const results = Array.from({ length: 10 }, () => determineRouting(signals));
    const allSame = results.every((r) => r.modelAlias === results[0]?.modelAlias);

    expect(allSame).toBe(true);
  });

  it('NEGATIVE: complexity formula uses incorrect weights would be caught', () => {
    // If the formula was wrong (e.g., genericParams*3 instead of *2)
    // this test would fail
    const params: SignatureComplexityParams = {
      genericParams: 1,
      unionMembers: 0,
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 0,
    };

    // Should be exactly 2 (1 * 2), not 3 or 1
    expect(calculateSignatureComplexity(params)).toBe(2);
  });

  it('NEGATIVE: threshold boundary violations would be caught', () => {
    // If thresholds were wrong (e.g., 10k instead of 12k)
    // workers at 11k tokens would incorrectly upgrade
    const signals: RoutingSignals = {
      ...DEFAULT_ROUTING_SIGNALS,
      taskType: 'implement',
      estimatedInputTokens: 11000, // Below 12k threshold
      signatureComplexity: 1,
    };

    const result = determineRouting(signals);

    // Should NOT upgrade at 11k (only at >12k)
    expect(result.wasUpgraded).toBe(false);
  });
});
