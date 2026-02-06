/**
 * Tests for deterministic model routing logic.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  // Constants
  TASK_TYPES,
  DEFAULT_SIGNATURE_PARAMS,
  DEFAULT_ROUTING_SIGNALS,
  DEFAULT_ROUTING_THRESHOLDS,
  TASK_TYPE_TO_BASE_MODEL,
  // Type guards
  isValidTaskType,
  // Core functions
  calculateSignatureComplexity,
  getBaseModel,
  determineRouting,
  createRoutingSignals,
  applyRoutingDecision,
  routeRequest,
  // Utility functions
  isWorkerTask,
  canPreemptivelyUpgrade,
  validateRoutingThresholds,
  validateSignatureParams,
  // Types
  type TaskType,
  type SignatureComplexityParams,
  type RoutingSignals,
  type RoutingThresholds,
} from './routing.js';
import type { ModelRouterRequest } from './types.js';

describe('TaskType', () => {
  describe('TASK_TYPES', () => {
    it('contains all task types', () => {
      expect(TASK_TYPES).toContain('implement');
      expect(TASK_TYPES).toContain('audit');
      expect(TASK_TYPES).toContain('transform');
      expect(TASK_TYPES).toContain('synthesize');
      expect(TASK_TYPES).toContain('structure');
      expect(TASK_TYPES).toHaveLength(5);
    });
  });

  describe('isValidTaskType', () => {
    it('returns true for valid task types', () => {
      expect(isValidTaskType('implement')).toBe(true);
      expect(isValidTaskType('audit')).toBe(true);
      expect(isValidTaskType('transform')).toBe(true);
      expect(isValidTaskType('synthesize')).toBe(true);
      expect(isValidTaskType('structure')).toBe(true);
    });

    it('returns false for invalid task types', () => {
      expect(isValidTaskType('invalid')).toBe(false);
      expect(isValidTaskType('')).toBe(false);
      expect(isValidTaskType('IMPLEMENT')).toBe(false);
    });
  });
});

describe('calculateSignatureComplexity', () => {
  describe('formula verification', () => {
    it('returns 0 for default params', () => {
      expect(calculateSignatureComplexity(DEFAULT_SIGNATURE_PARAMS)).toBe(0);
    });

    it('weights genericParams by 2', () => {
      const result = calculateSignatureComplexity({
        ...DEFAULT_SIGNATURE_PARAMS,
        genericParams: 3,
      });
      expect(result).toBe(6); // 3 * 2
    });

    it('weights unionMembers by 1', () => {
      const result = calculateSignatureComplexity({
        ...DEFAULT_SIGNATURE_PARAMS,
        unionMembers: 4,
      });
      expect(result).toBe(4); // 4 * 1
    });

    it('weights lifetimeParams by 2', () => {
      const result = calculateSignatureComplexity({
        ...DEFAULT_SIGNATURE_PARAMS,
        lifetimeParams: 2,
      });
      expect(result).toBe(4); // 2 * 2
    });

    it('weights nestedTypeDepth by 1', () => {
      const result = calculateSignatureComplexity({
        ...DEFAULT_SIGNATURE_PARAMS,
        nestedTypeDepth: 5,
      });
      expect(result).toBe(5); // 5 * 1
    });

    it('weights paramCount by 0.5', () => {
      const result = calculateSignatureComplexity({
        ...DEFAULT_SIGNATURE_PARAMS,
        paramCount: 6,
      });
      expect(result).toBe(3); // 6 * 0.5
    });

    it('combines all factors correctly', () => {
      const result = calculateSignatureComplexity({
        genericParams: 2, // 4
        unionMembers: 3, // 3
        lifetimeParams: 1, // 2
        nestedTypeDepth: 2, // 2
        paramCount: 4, // 2
      });
      expect(result).toBe(13); // 4 + 3 + 2 + 2 + 2
    });
  });

  describe('specification examples', () => {
    it('simple function: no generics, 2 params → complexity 1', () => {
      const result = calculateSignatureComplexity({
        genericParams: 0,
        unionMembers: 0,
        lifetimeParams: 0,
        nestedTypeDepth: 0,
        paramCount: 2,
      });
      expect(result).toBe(1); // 2 * 0.5
    });

    it('complex function: 2 generics, 3 union members, depth 2, 4 params → complexity 11', () => {
      const result = calculateSignatureComplexity({
        genericParams: 2, // 4
        unionMembers: 3, // 3
        lifetimeParams: 0, // 0
        nestedTypeDepth: 2, // 2
        paramCount: 4, // 2
      });
      expect(result).toBe(11); // 4 + 3 + 0 + 2 + 2
    });
  });

  describe('property-based tests', () => {
    it('complexity is always non-negative for non-negative inputs', () => {
      fc.assert(
        fc.property(
          fc.nat(100),
          fc.nat(100),
          fc.nat(100),
          fc.nat(100),
          fc.nat(100),
          (genericParams, unionMembers, lifetimeParams, nestedTypeDepth, paramCount) => {
            const result = calculateSignatureComplexity({
              genericParams,
              unionMembers,
              lifetimeParams,
              nestedTypeDepth,
              paramCount,
            });
            expect(result).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });

    it('complexity increases with any parameter increase', () => {
      fc.assert(
        fc.property(
          fc.nat(50),
          fc.nat(50),
          fc.nat(50),
          fc.nat(50),
          fc.nat(50),
          fc.nat(50),
          (genericParams, unionMembers, lifetimeParams, nestedTypeDepth, paramCount, increase) => {
            const base: SignatureComplexityParams = {
              genericParams,
              unionMembers,
              lifetimeParams,
              nestedTypeDepth,
              paramCount,
            };

            const baseResult = calculateSignatureComplexity(base);

            // Increasing any parameter should increase complexity
            const withMoreGenerics = calculateSignatureComplexity({
              ...base,
              genericParams: genericParams + increase,
            });
            expect(withMoreGenerics).toBeGreaterThanOrEqual(baseResult);
          }
        )
      );
    });
  });
});

describe('getBaseModel', () => {
  it('returns worker for implement tasks', () => {
    expect(getBaseModel('implement')).toBe('worker');
  });

  it('returns worker for transform tasks', () => {
    expect(getBaseModel('transform')).toBe('worker');
  });

  it('returns auditor for audit tasks', () => {
    expect(getBaseModel('audit')).toBe('auditor');
  });

  it('returns architect for synthesize tasks', () => {
    expect(getBaseModel('synthesize')).toBe('architect');
  });

  it('returns structurer for structure tasks', () => {
    expect(getBaseModel('structure')).toBe('structurer');
  });

  it('matches TASK_TYPE_TO_BASE_MODEL mapping', () => {
    for (const taskType of TASK_TYPES) {
      expect(getBaseModel(taskType)).toBe(TASK_TYPE_TO_BASE_MODEL.get(taskType));
    }
  });
});

describe('determineRouting', () => {
  describe('base model selection', () => {
    it('selects worker for implement tasks with low complexity', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 1000,
        signatureComplexity: 2,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('worker');
      expect(decision.wasUpgraded).toBe(false);
      expect(decision.baseModel).toBe('worker');
    });

    it('selects auditor for audit tasks', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'audit',
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('auditor');
      expect(decision.wasUpgraded).toBe(false);
    });

    it('selects architect for synthesize tasks', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'synthesize',
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('architect');
      expect(decision.wasUpgraded).toBe(false);
    });

    it('selects structurer for structure tasks', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'structure',
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(false);
    });
  });

  describe('input token threshold upgrade', () => {
    it('upgrades to structurer when tokens > 12000 for implement task', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 13000,
        signatureComplexity: 1,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.baseModel).toBe('worker');
      expect(decision.upgradeRule).toBe('token_threshold');
      expect(decision.reason).toContain('13000');
      expect(decision.reason).toContain('12000');
    });

    it('upgrades to structurer when tokens > 12000 for transform task', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'transform',
        estimatedInputTokens: 15000,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.upgradeRule).toBe('token_threshold');
    });

    it('does not upgrade when tokens = 12000 (boundary)', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 12000,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('worker');
      expect(decision.wasUpgraded).toBe(false);
    });

    it('does not upgrade non-worker tasks even with high tokens', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'audit',
        estimatedInputTokens: 20000,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('auditor');
      expect(decision.wasUpgraded).toBe(false);
    });
  });

  describe('signature complexity threshold upgrade', () => {
    it('upgrades to structurer when complexity > 5 for implement task', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 1000,
        signatureComplexity: 6,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.baseModel).toBe('worker');
      expect(decision.upgradeRule).toBe('complexity_threshold');
      expect(decision.reason).toContain('6');
      expect(decision.reason).toContain('5');
    });

    it('upgrades to structurer when complexity > 5 for transform task', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'transform',
        signatureComplexity: 10,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.upgradeRule).toBe('complexity_threshold');
    });

    it('does not upgrade when complexity = 5 (boundary)', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        signatureComplexity: 5,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('worker');
      expect(decision.wasUpgraded).toBe(false);
    });

    it('does not upgrade non-worker tasks even with high complexity', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'synthesize',
        signatureComplexity: 20,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('architect');
      expect(decision.wasUpgraded).toBe(false);
    });
  });

  describe('rule priority', () => {
    it('token threshold rule takes priority over complexity threshold', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 15000,
        signatureComplexity: 10,
      };

      const decision = determineRouting(signals);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.upgradeRule).toBe('token_threshold');
    });
  });

  describe('custom thresholds', () => {
    it('respects custom input token threshold', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        estimatedInputTokens: 8000,
      };

      const customThresholds: RoutingThresholds = {
        inputTokenThreshold: 5000,
        complexityThreshold: 5,
      };

      const decision = determineRouting(signals, customThresholds);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.upgradeRule).toBe('token_threshold');
    });

    it('respects custom complexity threshold', () => {
      const signals: RoutingSignals = {
        ...DEFAULT_ROUTING_SIGNALS,
        taskType: 'implement',
        signatureComplexity: 4,
      };

      const customThresholds: RoutingThresholds = {
        inputTokenThreshold: 12000,
        complexityThreshold: 3,
      };

      const decision = determineRouting(signals, customThresholds);

      expect(decision.modelAlias).toBe('structurer');
      expect(decision.wasUpgraded).toBe(true);
      expect(decision.upgradeRule).toBe('complexity_threshold');
    });
  });
});

describe('createRoutingSignals', () => {
  it('creates signals from a simple request', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Implement a function that adds two numbers',
    };

    const signals = createRoutingSignals(request, 'implement');

    expect(signals.taskType).toBe('implement');
    expect(signals.estimatedInputTokens).toBeGreaterThan(0);
    expect(signals.signatureComplexity).toBe(0);
  });

  it('includes system prompt tokens in estimate', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Short prompt',
      parameters: {
        systemPrompt: 'You are a helpful assistant that writes TypeScript code.',
      },
    };

    const signals = createRoutingSignals(request, 'implement');

    // Should be higher than just prompt tokens
    const promptOnly = createRoutingSignals(
      { modelAlias: 'worker', prompt: 'Short prompt' },
      'implement'
    );

    expect(signals.estimatedInputTokens).toBeGreaterThan(promptOnly.estimatedInputTokens);
  });

  it('calculates signature complexity from params', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Implement generic function',
    };

    const signatureParams: SignatureComplexityParams = {
      genericParams: 2,
      unionMembers: 1,
      lifetimeParams: 0,
      nestedTypeDepth: 1,
      paramCount: 3,
    };

    const signals = createRoutingSignals(request, 'implement', signatureParams);

    expect(signals.signatureComplexity).toBe(calculateSignatureComplexity(signatureParams));
  });

  it('uses provided maxTokens for output estimate', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Test',
      parameters: {
        maxTokens: 8000,
      },
    };

    const signals = createRoutingSignals(request, 'implement');

    expect(signals.estimatedOutputTokens).toBe(8000);
  });
});

describe('applyRoutingDecision', () => {
  it('returns same request if model unchanged', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Test',
    };

    const decision = {
      modelAlias: 'worker' as const,
      wasUpgraded: false,
      baseModel: 'worker' as const,
      reason: 'No upgrade needed',
    };

    const result = applyRoutingDecision(request, decision);

    expect(result).toBe(request);
  });

  it('returns new request with updated model alias', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Test',
    };

    const decision = {
      modelAlias: 'structurer' as const,
      wasUpgraded: true,
      baseModel: 'worker' as const,
      reason: 'Upgrade due to complexity',
    };

    const result = applyRoutingDecision(request, decision);

    expect(result).not.toBe(request);
    expect(result.modelAlias).toBe('structurer');
    expect(result.prompt).toBe('Test');
  });
});

describe('routeRequest', () => {
  it('routes simple request without upgrade', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Simple task',
    };

    const { routedRequest, decision } = routeRequest(request, 'implement');

    expect(routedRequest.modelAlias).toBe('worker');
    expect(decision.wasUpgraded).toBe(false);
  });

  it('upgrades request with complex signature', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Complex generic function',
    };

    const signatureParams: SignatureComplexityParams = {
      genericParams: 3, // 6
      unionMembers: 2, // 2
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 2, // 1
    }; // Total: 9 > 5

    const { routedRequest, decision } = routeRequest(request, 'implement', signatureParams);

    expect(routedRequest.modelAlias).toBe('structurer');
    expect(decision.wasUpgraded).toBe(true);
    expect(decision.upgradeRule).toBe('complexity_threshold');
  });

  it('negative case: simple signature stays on worker model', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Simple function',
    };

    const simpleSignature: SignatureComplexityParams = {
      genericParams: 0,
      unionMembers: 0,
      lifetimeParams: 0,
      nestedTypeDepth: 0,
      paramCount: 2, // Only 1 complexity point
    };

    const { routedRequest, decision } = routeRequest(request, 'implement', simpleSignature);

    expect(routedRequest.modelAlias).toBe('worker');
    expect(decision.wasUpgraded).toBe(false);
    expect(decision.baseModel).toBe('worker');
  });
});

describe('utility functions', () => {
  describe('isWorkerTask', () => {
    it('returns true for implement', () => {
      expect(isWorkerTask('implement')).toBe(true);
    });

    it('returns true for transform', () => {
      expect(isWorkerTask('transform')).toBe(true);
    });

    it('returns false for audit', () => {
      expect(isWorkerTask('audit')).toBe(false);
    });

    it('returns false for synthesize', () => {
      expect(isWorkerTask('synthesize')).toBe(false);
    });

    it('returns false for structure', () => {
      expect(isWorkerTask('structure')).toBe(false);
    });
  });

  describe('canPreemptivelyUpgrade', () => {
    it('returns true for worker tasks', () => {
      expect(canPreemptivelyUpgrade('implement')).toBe(true);
      expect(canPreemptivelyUpgrade('transform')).toBe(true);
    });

    it('returns false for non-worker tasks', () => {
      expect(canPreemptivelyUpgrade('audit')).toBe(false);
      expect(canPreemptivelyUpgrade('synthesize')).toBe(false);
      expect(canPreemptivelyUpgrade('structure')).toBe(false);
    });
  });

  describe('validateRoutingThresholds', () => {
    it('validates default thresholds', () => {
      const result = validateRoutingThresholds(DEFAULT_ROUTING_THRESHOLDS);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects negative input token threshold', () => {
      const result = validateRoutingThresholds({
        inputTokenThreshold: -1,
        complexityThreshold: 5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('inputTokenThreshold must be non-negative');
    });

    it('rejects negative complexity threshold', () => {
      const result = validateRoutingThresholds({
        inputTokenThreshold: 12000,
        complexityThreshold: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('complexityThreshold must be non-negative');
    });
  });

  describe('validateSignatureParams', () => {
    it('validates default params', () => {
      const result = validateSignatureParams(DEFAULT_SIGNATURE_PARAMS);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects negative genericParams', () => {
      const result = validateSignatureParams({
        ...DEFAULT_SIGNATURE_PARAMS,
        genericParams: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('genericParams must be non-negative');
    });

    it('validates all fields', () => {
      const result = validateSignatureParams({
        genericParams: -1,
        unionMembers: -1,
        lifetimeParams: -1,
        nestedTypeDepth: -1,
        paramCount: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(5);
    });
  });
});

describe('deterministic behavior', () => {
  it('always produces same result for same inputs', () => {
    fc.assert(
      fc.property(
        fc.nat(50000),
        fc.nat(20),
        fc.constantFrom('implement', 'audit', 'transform', 'synthesize', 'structure'),
        (tokens, complexity, taskType) => {
          const signals: RoutingSignals = {
            ...DEFAULT_ROUTING_SIGNALS,
            taskType: taskType as TaskType,
            estimatedInputTokens: tokens,
            signatureComplexity: complexity,
          };

          const result1 = determineRouting(signals);
          const result2 = determineRouting(signals);

          expect(result1.modelAlias).toBe(result2.modelAlias);
          expect(result1.wasUpgraded).toBe(result2.wasUpgraded);
          expect(result1.baseModel).toBe(result2.baseModel);
          expect(result1.upgradeRule).toBe(result2.upgradeRule);
        }
      )
    );
  });
});
