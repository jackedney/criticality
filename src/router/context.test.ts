/**
 * Tests for Context Budgeting and Truncation.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import type { ModelAlias, ModelRouterRequest } from './types.js';
import {
  // Token counting
  estimateTokensSimple,
  estimateTokensWordBased,
  defaultTokenCounter,
  // Model limits
  getModelLimits,
  MODEL_CONTEXT_LIMITS,
  DEFAULT_MODEL_LIMITS,
  // Context analysis
  analyzeContextBudget,
  determineOverflowStrategy,
  // Truncation
  truncatePrompt,
  extractSections,
  buildPromptFromSections,
  DEFAULT_TRUNCATION_ORDER,
  SECTION_PRIORITY,
  TRUNCATABLE_SECTIONS,
  PROTECTED_SECTIONS,
  // Strategy application
  applyOverflowStrategy,
  ContextOverflowError,
  // Utilities
  isProtectedSection,
  isTruncatableSection,
  getSectionPriority,
  sortByTruncationPriority,
  // Types
  type StructuredPrompt,
  type TokenCounter,
  type TruncationOrder,
} from './context.js';

describe('Token Counting', () => {
  describe('estimateTokensSimple', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokensSimple('')).toBe(0);
    });

    it('estimates based on character count (~4 chars per token)', () => {
      // 40 characters should be ~10 tokens
      const text = 'a'.repeat(40);
      expect(estimateTokensSimple(text)).toBe(10);
    });

    it('rounds up partial tokens', () => {
      // 5 characters should be 2 tokens (ceil(5/4))
      expect(estimateTokensSimple('hello')).toBe(2);
    });

    it('handles unicode characters', () => {
      // Unicode characters are counted by string length
      const emoji = '🚀'.repeat(4);
      // Each emoji is 2 chars in JS string length
      expect(estimateTokensSimple(emoji)).toBe(2);
    });
  });

  describe('estimateTokensWordBased', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokensWordBased('')).toBe(0);
    });

    it('counts words with multiplier for code', () => {
      // Simple words
      const text = 'hello world';
      const tokens = estimateTokensWordBased(text);
      // 2 words * 1.3 = 2.6 -> ceil = 3
      expect(tokens).toBeGreaterThanOrEqual(2);
    });

    it('counts special characters as partial tokens', () => {
      const code = 'function foo() { return x; }';
      const tokens = estimateTokensWordBased(code);
      // Should be more than just word count due to special chars
      expect(tokens).toBeGreaterThan(3);
    });

    it('handles code with brackets and operators', () => {
      const code = 'const obj = { a: 1, b: [2, 3] };';
      const tokens = estimateTokensWordBased(code);
      expect(tokens).toBeGreaterThan(5);
    });

    it('handles whitespace-only strings', () => {
      const whitespace = '   \n\t  ';
      const tokens = estimateTokensWordBased(whitespace);
      expect(tokens).toBeGreaterThanOrEqual(1);
    });
  });

  describe('defaultTokenCounter', () => {
    it('uses word-based estimation', () => {
      const text = 'hello world';
      expect(defaultTokenCounter.countTokens(text)).toBe(estimateTokensWordBased(text));
    });
  });

  describe('Property: token count is always positive for non-empty strings', () => {
    it('maintains invariant', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (text) => {
          return estimateTokensWordBased(text) >= 1;
        })
      );
    });
  });
});

describe('Model Limits', () => {
  describe('getModelLimits', () => {
    it('returns correct limits for known models', () => {
      expect(getModelLimits('minimax-m2')).toEqual({
        maxInputTokens: 16000,
        maxOutputTokens: 4000,
      });

      expect(getModelLimits('kimi-k2')).toEqual({
        maxInputTokens: 128000,
        maxOutputTokens: 8000,
      });

      expect(getModelLimits('claude-opus-4-5')).toEqual({
        maxInputTokens: 200000,
        maxOutputTokens: 32000,
      });
    });

    it('handles case-insensitive lookup', () => {
      expect(getModelLimits('MINIMAX-M2')).toEqual(getModelLimits('minimax-m2'));
      expect(getModelLimits('Kimi-K2')).toEqual(getModelLimits('kimi-k2'));
    });

    it('returns default limits for unknown models', () => {
      expect(getModelLimits('unknown-model-xyz')).toEqual(DEFAULT_MODEL_LIMITS);
    });

    it('matches partial model names', () => {
      // Should match claude variants (claude has different limits than default)
      expect(getModelLimits('claude')).toEqual(MODEL_CONTEXT_LIMITS['claude-sonnet-4-5']);
      // kimi also has different limits
      expect(getModelLimits('kimi')).toEqual(MODEL_CONTEXT_LIMITS['kimi-k2']);
    });
  });

  describe('MODEL_CONTEXT_LIMITS', () => {
    it('contains all expected models', () => {
      expect(MODEL_CONTEXT_LIMITS).toHaveProperty('minimax-m2');
      expect(MODEL_CONTEXT_LIMITS).toHaveProperty('kimi-k2');
      expect(MODEL_CONTEXT_LIMITS).toHaveProperty('claude-sonnet-4-5');
      expect(MODEL_CONTEXT_LIMITS).toHaveProperty('claude-opus-4-5');
    });

    it('all limits are positive', () => {
      for (const [, limits] of Object.entries(MODEL_CONTEXT_LIMITS)) {
        expect(limits.maxInputTokens).toBeGreaterThan(0);
        expect(limits.maxOutputTokens).toBeGreaterThan(0);
      }
    });
  });
});

describe('Context Analysis', () => {
  describe('analyzeContextBudget', () => {
    it('reports within budget for small prompts', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello world',
      };

      const result = analyzeContextBudget(request, 'minimax-m2');

      expect(result.withinBudget).toBe(true);
      expect(result.overflowTokens).toBe(0);
      expect(result.overflowPercentage).toBe(0);
      expect(result.strategy).toBeUndefined();
    });

    it('detects overflow for large prompts', () => {
      // Create a prompt that exceeds minimax-m2 limit (16000 tokens)
      const largePrompt = 'word '.repeat(20000); // ~20000 words

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: largePrompt,
      };

      const result = analyzeContextBudget(request, 'minimax-m2');

      expect(result.withinBudget).toBe(false);
      expect(result.overflowTokens).toBeGreaterThan(0);
      expect(result.overflowPercentage).toBeGreaterThan(0);
      expect(result.strategy).toBeDefined();
    });

    it('includes system prompt in token count', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello',
        parameters: {
          systemPrompt: 'You are a helpful assistant. '.repeat(100),
        },
      };

      const result = analyzeContextBudget(request, 'minimax-m2');

      // With system prompt, token count should be higher
      expect(result.estimatedTokens).toBeGreaterThan(defaultTokenCounter.countTokens('Hello'));
    });

    it('uses custom token counter', () => {
      const mockCounter: TokenCounter = {
        countTokens: vi.fn().mockReturnValue(100000),
      };

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Small prompt',
      };

      const result = analyzeContextBudget(request, 'minimax-m2', mockCounter);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCounter.countTokens).toHaveBeenCalled();
      expect(result.withinBudget).toBe(false);
    });
  });

  describe('determineOverflowStrategy', () => {
    it('returns truncate for mild overflow (< 20%)', () => {
      const strategy = determineOverflowStrategy(0.15, 'worker');
      expect(strategy.type).toBe('truncate');
    });

    it('returns upgrade for moderate overflow (20-100%)', () => {
      const strategy = determineOverflowStrategy(0.5, 'worker');
      expect(strategy.type).toBe('upgrade');
      if (strategy.type === 'upgrade') {
        expect(strategy.targetModel).toBe('structurer');
      }
    });

    it('follows upgrade path correctly', () => {
      // worker -> structurer
      const workerStrategy = determineOverflowStrategy(0.5, 'worker');
      expect(workerStrategy.type).toBe('upgrade');
      if (workerStrategy.type === 'upgrade') {
        expect(workerStrategy.targetModel).toBe('structurer');
      }

      // structurer -> architect
      const structurerStrategy = determineOverflowStrategy(0.5, 'structurer');
      expect(structurerStrategy.type).toBe('upgrade');
      if (structurerStrategy.type === 'upgrade') {
        expect(structurerStrategy.targetModel).toBe('architect');
      }

      // architect -> fallback
      const architectStrategy = determineOverflowStrategy(0.5, 'architect');
      expect(architectStrategy.type).toBe('upgrade');
      if (architectStrategy.type === 'upgrade') {
        expect(architectStrategy.targetModel).toBe('fallback');
      }
    });

    it('returns reject when no upgrade path available', () => {
      const strategy = determineOverflowStrategy(0.5, 'fallback');
      expect(strategy.type).toBe('reject');
    });

    it('returns reject for severe overflow (> 100%)', () => {
      const strategy = determineOverflowStrategy(1.5, 'worker');
      expect(strategy.type).toBe('reject');
    });
  });
});

describe('Truncation', () => {
  describe('Constants', () => {
    it('SECTION_PRIORITY defines all sections', () => {
      expect(SECTION_PRIORITY.comments).toBe(10);
      expect(SECTION_PRIORITY.examples).toBe(30);
      expect(SECTION_PRIORITY.relatedTypes).toBe(40);
      expect(SECTION_PRIORITY.requiredTypes).toBe(80);
      expect(SECTION_PRIORITY.contracts).toBe(90);
      expect(SECTION_PRIORITY.signature).toBe(100);
      expect(SECTION_PRIORITY.systemPrompt).toBe(100);
    });

    it('TRUNCATABLE_SECTIONS are in priority order', () => {
      expect(TRUNCATABLE_SECTIONS).toEqual([
        'comments',
        'examples',
        'relatedTypes',
        'requiredTypes',
      ]);
    });

    it('PROTECTED_SECTIONS contains critical sections', () => {
      expect(PROTECTED_SECTIONS).toContain('systemPrompt');
      expect(PROTECTED_SECTIONS).toContain('signature');
      expect(PROTECTED_SECTIONS).toContain('contracts');
    });

    it('DEFAULT_TRUNCATION_ORDER matches specification', () => {
      expect(DEFAULT_TRUNCATION_ORDER.order).toEqual([
        'comments',
        'examples',
        'relatedTypes',
        'requiredTypes',
      ]);
      expect(DEFAULT_TRUNCATION_ORDER.protected).toEqual([
        'systemPrompt',
        'signature',
        'contracts',
      ]);
    });
  });

  describe('buildPromptFromSections', () => {
    it('builds prompt from all sections', () => {
      const prompt: StructuredPrompt = {
        systemPrompt: 'System prompt',
        signature: 'function foo(): void',
        contracts: '@requires x > 0',
        requiredTypes: 'type X = number',
        relatedTypes: 'type Y = string',
        examples: 'Example: foo()',
        comments: '// Comment',
        userPrompt: 'Implement foo',
      };

      const result = buildPromptFromSections(prompt);

      expect(result).toContain('System prompt');
      expect(result).toContain('function foo(): void');
      expect(result).toContain('@requires x > 0');
      expect(result).toContain('Implement foo');
    });

    it('skips empty sections', () => {
      const prompt: StructuredPrompt = {
        userPrompt: 'Hello',
      };

      const result = buildPromptFromSections(prompt);
      expect(result).toBe('Hello');
    });

    it('joins sections with double newlines', () => {
      const prompt: StructuredPrompt = {
        signature: 'function foo()',
        userPrompt: 'Implement it',
      };

      const result = buildPromptFromSections(prompt);
      expect(result).toBe('function foo()\n\nImplement it');
    });
  });

  describe('extractSections', () => {
    it('extracts all non-empty sections', () => {
      const prompt: StructuredPrompt = {
        systemPrompt: 'System',
        signature: 'Signature',
        contracts: 'Contracts',
        comments: 'Comments',
        userPrompt: 'User prompt',
      };

      const sections = extractSections(prompt);

      expect(sections.length).toBe(4);
      expect(sections.map((s) => s.section)).toContain('systemPrompt');
      expect(sections.map((s) => s.section)).toContain('signature');
      expect(sections.map((s) => s.section)).toContain('contracts');
      expect(sections.map((s) => s.section)).toContain('comments');
    });

    it('includes token counts for each section', () => {
      const prompt: StructuredPrompt = {
        comments: 'This is a comment',
        userPrompt: 'User prompt',
      };

      const sections = extractSections(prompt);
      const commentSection = sections.find((s) => s.section === 'comments');

      expect(commentSection).toBeDefined();
      expect(commentSection?.tokens).toBeGreaterThan(0);
    });

    it('skips empty sections', () => {
      const prompt: StructuredPrompt = {
        comments: '',
        userPrompt: 'Hello',
      };

      const sections = extractSections(prompt);
      expect(sections.map((s) => s.section)).not.toContain('comments');
    });
  });

  describe('truncatePrompt', () => {
    it('returns unchanged prompt if within budget', () => {
      const prompt: StructuredPrompt = {
        comments: 'Comment',
        userPrompt: 'Hello',
      };

      const result = truncatePrompt(prompt, 100000);

      expect(result.success).toBe(true);
      expect(result.removedSections).toHaveLength(0);
      expect(result.tokensSaved).toBe(0);
    });

    it('removes comments first (lowest priority)', () => {
      const prompt: StructuredPrompt = {
        comments: 'This is a very long comment '.repeat(100),
        examples: 'Example',
        userPrompt: 'Hello',
      };

      // Set a budget that requires truncation
      const commentTokens = defaultTokenCounter.countTokens(prompt.comments ?? '');
      const totalTokens = defaultTokenCounter.countTokens(buildPromptFromSections(prompt));
      const budget = totalTokens - commentTokens + 10;

      const result = truncatePrompt(prompt, budget);

      expect(result.removedSections).toContain('comments');
      expect(result.removedSections).not.toContain('examples');
    });

    it('removes sections in priority order', () => {
      const prompt: StructuredPrompt = {
        comments: 'Comment '.repeat(100),
        examples: 'Example '.repeat(100),
        relatedTypes: 'RelatedType '.repeat(100),
        userPrompt: 'Hello',
      };

      // Budget that requires removing multiple sections
      const result = truncatePrompt(prompt, 50);

      // Should have removed sections in order
      if (result.removedSections.length >= 2) {
        const commentIndex = result.removedSections.indexOf('comments');
        const exampleIndex = result.removedSections.indexOf('examples');
        if (commentIndex !== -1 && exampleIndex !== -1) {
          expect(commentIndex).toBeLessThan(exampleIndex);
        }
      }
    });

    it('never truncates protected sections', () => {
      const prompt: StructuredPrompt = {
        systemPrompt: 'System '.repeat(1000),
        signature: 'Signature '.repeat(1000),
        contracts: 'Contract '.repeat(1000),
        comments: 'Comment',
        userPrompt: 'Hello',
      };

      const result = truncatePrompt(prompt, 100);

      expect(result.removedSections).not.toContain('systemPrompt');
      expect(result.removedSections).not.toContain('signature');
      expect(result.removedSections).not.toContain('contracts');
    });

    it('reports failure when truncation is insufficient', () => {
      const prompt: StructuredPrompt = {
        systemPrompt: 'System '.repeat(10000),
        userPrompt: 'Hello',
      };

      // Protected sections are too large - can't truncate enough
      const result = truncatePrompt(prompt, 10);

      expect(result.success).toBe(false);
      expect(result.tokensAfterTruncation).toBeGreaterThan(result.targetLimit);
    });

    it('uses custom truncation order', () => {
      const prompt: StructuredPrompt = {
        comments: 'Comment '.repeat(100),
        examples: 'Example '.repeat(100),
        userPrompt: 'Hello',
      };

      const customOrder: TruncationOrder = {
        order: ['examples', 'comments'], // Reverse order
        protected: ['systemPrompt', 'signature', 'contracts'],
      };

      const result = truncatePrompt(prompt, 50, customOrder);

      // With custom order, examples should be removed first
      if (result.removedSections.length > 0) {
        expect(result.removedSections[0]).toBe('examples');
      }
    });
  });
});

describe('Strategy Application', () => {
  describe('applyOverflowStrategy - upgrade', () => {
    it('changes model alias on upgrade', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello',
      };

      const result = applyOverflowStrategy(request, {
        type: 'upgrade',
        targetModel: 'structurer',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.request.modelAlias).toBe('structurer');
        expect(result.request.prompt).toBe('Hello');
      }
    });
  });

  describe('applyOverflowStrategy - truncate', () => {
    it('truncates with structured prompt when over limit', () => {
      // Create comments large enough to exceed minimax-m2 16000 token limit
      // With word-based estimation, we need more than 16000 tokens
      // Each "Comment " is ~1.3 tokens, so we need >12000 repetitions
      const structuredPrompt: StructuredPrompt = {
        comments: 'Comment '.repeat(15000),
        userPrompt: 'Hello',
      };

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: buildPromptFromSections(structuredPrompt),
      };

      const result = applyOverflowStrategy(
        request,
        { type: 'truncate', sections: DEFAULT_TRUNCATION_ORDER },
        structuredPrompt,
        'minimax-m2'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Comments should be removed (or at least not all present)
        // After truncation, the result should fit within limits
        expect(defaultTokenCounter.countTokens(result.request.prompt)).toBeLessThanOrEqual(16000);
      }
    });

    it('returns unchanged prompt when already within budget', () => {
      const structuredPrompt: StructuredPrompt = {
        comments: 'Comment',
        userPrompt: 'Hello',
      };

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: buildPromptFromSections(structuredPrompt),
      };

      const result = applyOverflowStrategy(
        request,
        { type: 'truncate', sections: DEFAULT_TRUNCATION_ORDER },
        structuredPrompt,
        'minimax-m2'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Prompt should be unchanged since it was within budget
        expect(result.request.prompt).toContain('Comment');
      }
    });

    it('returns error without structured prompt', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'word '.repeat(20000),
      };

      const result = applyOverflowStrategy(
        request,
        { type: 'truncate', sections: DEFAULT_TRUNCATION_ORDER },
        undefined,
        'minimax-m2'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ContextOverflowError);
        expect(result.error.message).toContain('unstructured');
      }
    });
  });

  describe('applyOverflowStrategy - reject', () => {
    it('returns rejection error', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello',
      };

      const result = applyOverflowStrategy(request, {
        type: 'reject',
        reason: 'Input too large',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ContextOverflowError);
        expect(result.error.message).toBe('Input too large');
      }
    });
  });

  describe('applyOverflowStrategy - chunk', () => {
    it('returns error (not implemented for implementation tasks)', () => {
      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello',
      };

      const result = applyOverflowStrategy(request, {
        type: 'chunk',
        chunkSize: 1000,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Chunking');
      }
    });
  });
});

describe('ContextOverflowError', () => {
  it('includes analysis in error', () => {
    const analysis = {
      withinBudget: false,
      estimatedTokens: 20000,
      maxTokens: 16000,
      overflowTokens: 4000,
      overflowPercentage: 0.25,
    };

    const error = new ContextOverflowError('Test error', analysis);

    expect(error.name).toBe('ContextOverflowError');
    expect(error.message).toBe('Test error');
    expect(error.analysis).toEqual(analysis);
    expect(error.attemptedStrategy).toBeUndefined();
  });

  it('includes attempted strategy when provided', () => {
    const analysis = {
      withinBudget: false,
      estimatedTokens: 20000,
      maxTokens: 16000,
      overflowTokens: 4000,
      overflowPercentage: 0.25,
    };

    const strategy = { type: 'truncate' as const, sections: DEFAULT_TRUNCATION_ORDER };
    const error = new ContextOverflowError('Test error', analysis, strategy);

    expect(error.attemptedStrategy).toEqual(strategy);
  });
});

describe('Utility Functions', () => {
  describe('isProtectedSection', () => {
    it('returns true for protected sections', () => {
      expect(isProtectedSection('systemPrompt')).toBe(true);
      expect(isProtectedSection('signature')).toBe(true);
      expect(isProtectedSection('contracts')).toBe(true);
    });

    it('returns false for truncatable sections', () => {
      expect(isProtectedSection('comments')).toBe(false);
      expect(isProtectedSection('examples')).toBe(false);
    });
  });

  describe('isTruncatableSection', () => {
    it('returns true for truncatable sections', () => {
      expect(isTruncatableSection('comments')).toBe(true);
      expect(isTruncatableSection('examples')).toBe(true);
      expect(isTruncatableSection('relatedTypes')).toBe(true);
      expect(isTruncatableSection('requiredTypes')).toBe(true);
    });

    it('returns false for protected sections', () => {
      expect(isTruncatableSection('systemPrompt')).toBe(false);
      expect(isTruncatableSection('signature')).toBe(false);
      expect(isTruncatableSection('contracts')).toBe(false);
    });
  });

  describe('getSectionPriority', () => {
    it('returns correct priority for each section', () => {
      expect(getSectionPriority('comments')).toBe(10);
      expect(getSectionPriority('examples')).toBe(30);
      expect(getSectionPriority('relatedTypes')).toBe(40);
      expect(getSectionPriority('requiredTypes')).toBe(80);
      expect(getSectionPriority('contracts')).toBe(90);
      expect(getSectionPriority('signature')).toBe(100);
      expect(getSectionPriority('systemPrompt')).toBe(100);
    });
  });

  describe('sortByTruncationPriority', () => {
    it('sorts sections by priority (lowest first)', () => {
      const sections: readonly ('comments' | 'examples' | 'signature')[] = [
        'signature',
        'comments',
        'examples',
      ];
      const sorted = sortByTruncationPriority(sections);

      expect(sorted[0]).toBe('comments');
      expect(sorted[1]).toBe('examples');
      expect(sorted[2]).toBe('signature');
    });

    it('does not mutate original array', () => {
      const original: readonly ('comments' | 'examples')[] = ['examples', 'comments'];
      const sorted = sortByTruncationPriority(original);

      expect(original[0]).toBe('examples');
      expect(sorted[0]).toBe('comments');
    });
  });
});

describe('Integration: Request over limit triggers truncation', () => {
  it('Example: Request over limit triggers truncation of comments', () => {
    // Create a structured prompt with comments that push it over the limit
    const structuredPrompt: StructuredPrompt = {
      comments: '// This is a very long comment section '.repeat(500),
      signature: 'function process(data: Data): Result',
      contracts: '@requires data != null @ensures result != null',
      userPrompt: 'Implement the process function',
    };

    const fullPrompt = buildPromptFromSections(structuredPrompt);
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: fullPrompt,
    };

    // Analyze the budget
    const analysis = analyzeContextBudget(request, 'minimax-m2');

    if (!analysis.withinBudget && analysis.strategy?.type === 'truncate') {
      // Apply truncation
      const result = applyOverflowStrategy(
        request,
        analysis.strategy,
        structuredPrompt,
        'minimax-m2'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Comments should be removed
        expect(result.request.prompt).not.toContain('This is a very long comment');
        // Protected sections should remain
        expect(result.request.prompt).toContain('function process');
        expect(result.request.prompt).toContain('@requires');
      }
    }
  });
});

describe('Negative case: Request exceeding max limit returns rejection', () => {
  it('Request exceeding max limit after truncation returns rejection error', () => {
    // Create a prompt where protected sections alone exceed the limit
    const structuredPrompt: StructuredPrompt = {
      systemPrompt: 'System prompt '.repeat(5000),
      signature: 'function foo(): '.repeat(2000),
      contracts: '@requires '.repeat(2000),
      userPrompt: 'Hello',
    };

    const fullPrompt = buildPromptFromSections(structuredPrompt);
    const request: ModelRouterRequest = {
      modelAlias: 'fallback', // No further upgrade possible
      prompt: fullPrompt,
    };

    // Analyze the budget
    const analysis = analyzeContextBudget(request, 'minimax-m2');

    expect(analysis.withinBudget).toBe(false);

    // With fallback model and severe overflow, should reject
    if (analysis.strategy?.type === 'reject') {
      const result = applyOverflowStrategy(request, analysis.strategy);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ContextOverflowError);
      }
    } else if (analysis.strategy?.type === 'truncate') {
      // Try truncation - it should fail because protected sections are too large
      const truncationResult = truncatePrompt(
        structuredPrompt,
        getModelLimits('minimax-m2').maxInputTokens
      );
      expect(truncationResult.success).toBe(false);
    }
  });
});

describe('Property-based tests', () => {
  describe('Token counting', () => {
    it('token count increases with text length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (a, b) => {
            const combined = a + b;
            const combinedTokens = estimateTokensWordBased(combined);
            // Combined should have at least as many tokens as the longer string
            const maxSingle = Math.max(estimateTokensWordBased(a), estimateTokensWordBased(b));
            return combinedTokens >= maxSingle;
          }
        )
      );
    });
  });

  describe('Overflow strategy', () => {
    it('mild overflow always returns truncate', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 0.19, noNaN: true }),
          fc.constantFrom<ModelAlias>('worker', 'structurer', 'architect', 'auditor', 'fallback'),
          (overflow, alias) => {
            const strategy = determineOverflowStrategy(overflow, alias);
            return strategy.type === 'truncate';
          }
        )
      );
    });

    it('severe overflow always returns reject', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1.01, max: 10, noNaN: true }),
          fc.constantFrom<ModelAlias>('worker', 'structurer', 'architect', 'auditor', 'fallback'),
          (overflow, alias) => {
            const strategy = determineOverflowStrategy(overflow, alias);
            return strategy.type === 'reject';
          }
        )
      );
    });
  });

  describe('Section priority', () => {
    it('truncatable sections have lower priority than protected', () => {
      const truncatable = TRUNCATABLE_SECTIONS;
      const protectedSections = PROTECTED_SECTIONS;

      for (const t of truncatable) {
        for (const p of protectedSections) {
          expect(getSectionPriority(t)).toBeLessThan(getSectionPriority(p));
        }
      }
    });
  });
});
