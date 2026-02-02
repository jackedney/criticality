/**
 * Context Budgeting and Truncation for the Criticality Protocol.
 *
 * Provides token counting, context limit management, and truncation
 * strategies to handle large prompts gracefully.
 *
 * @packageDocumentation
 */

import { TypedMap } from '../utils/typed-map.js';
import type { ModelAlias, ModelRouterRequest } from './types.js';

/**
 * Content section types that can be truncated.
 * Ordered by priority (lowest priority first - truncated first).
 */
export type TruncatableSection =
  | 'comments'
  | 'examples'
  | 'relatedTypes'
  | 'requiredTypes'
  | 'contracts'
  | 'signature'
  | 'systemPrompt';

/**
 * All section types including protected ones.
 */
export const SECTION_PRIORITY: Record<TruncatableSection, number> = {
  comments: 10,
  examples: 30,
  relatedTypes: 40,
  requiredTypes: 80,
  contracts: 90,
  signature: 100,
  systemPrompt: 100,
} as const;

/**
 * Sections that can be truncated (in priority order, lowest first).
 */
export const TRUNCATABLE_SECTIONS: readonly TruncatableSection[] = [
  'comments',
  'examples',
  'relatedTypes',
  'requiredTypes',
] as const;

/**
 * Sections that must never be truncated.
 */
export const PROTECTED_SECTIONS: readonly TruncatableSection[] = [
  'systemPrompt',
  'signature',
  'contracts',
] as const;

/**
 * Truncation order configuration.
 */
export interface TruncationOrder {
  /** Ordered list of sections to remove until under budget. */
  readonly order: readonly TruncatableSection[];
  /** Sections that must never be truncated. */
  readonly protected: readonly TruncatableSection[];
}

/**
 * Default truncation order per specification.
 */
export const DEFAULT_TRUNCATION_ORDER: TruncationOrder = {
  order: ['comments', 'examples', 'relatedTypes', 'requiredTypes'],
  protected: ['systemPrompt', 'signature', 'contracts'],
} as const;

/**
 * Model context limits in tokens.
 */
export interface ModelContextLimits {
  /** Maximum input tokens. */
  readonly maxInputTokens: number;
  /** Maximum output tokens. */
  readonly maxOutputTokens: number;
}

/**
 * Known model context limits from SPECIFICATION.md.
 */
export const MODEL_CONTEXT_LIMITS: TypedMap<string, ModelContextLimits> = TypedMap.fromObject({
  'minimax-m2': { maxInputTokens: 16000, maxOutputTokens: 4000 },
  'minimax-m2.1': { maxInputTokens: 16000, maxOutputTokens: 4000 },
  'minimax-text-01': { maxInputTokens: 16000, maxOutputTokens: 4000 },
  'kimi-k2': { maxInputTokens: 128000, maxOutputTokens: 8000 },
  'kimi-k2-instruct': { maxInputTokens: 128000, maxOutputTokens: 8000 },
  'kimi-k2-0711': { maxInputTokens: 128000, maxOutputTokens: 8000 },
  'claude-sonnet-4-5': { maxInputTokens: 200000, maxOutputTokens: 16000 },
  'claude-sonnet-4-20250514': { maxInputTokens: 200000, maxOutputTokens: 16000 },
  'claude-opus-4-5': { maxInputTokens: 200000, maxOutputTokens: 32000 },
  'claude-opus-4-20250514': { maxInputTokens: 200000, maxOutputTokens: 32000 },
});

/**
 * Default limits for unknown models.
 */
export const DEFAULT_MODEL_LIMITS: ModelContextLimits = {
  maxInputTokens: 16000,
  maxOutputTokens: 4000,
} as const;

/**
 * Context overflow strategy discriminated union.
 */
export type ContextOverflowStrategy =
  | { readonly type: 'upgrade'; readonly targetModel: ModelAlias }
  | { readonly type: 'truncate'; readonly sections: TruncationOrder }
  | { readonly type: 'chunk'; readonly chunkSize: number }
  | { readonly type: 'reject'; readonly reason: string };

/**
 * Result of context budget analysis.
 */
export interface ContextBudgetResult {
  /** Whether the input is within budget. */
  readonly withinBudget: boolean;
  /** Estimated input tokens. */
  readonly estimatedTokens: number;
  /** Model's max input tokens. */
  readonly maxTokens: number;
  /** Overflow amount (0 if within budget). */
  readonly overflowTokens: number;
  /** Overflow percentage (0 if within budget). */
  readonly overflowPercentage: number;
  /** Recommended strategy if over budget. */
  readonly strategy?: ContextOverflowStrategy;
}

/**
 * Content section with token count for truncation.
 */
export interface ContentSection {
  /** Section identifier. */
  readonly section: TruncatableSection;
  /** Raw content of this section. */
  readonly content: string;
  /** Estimated token count for this section. */
  readonly tokens: number;
}

/**
 * Structured prompt with sections.
 */
export interface StructuredPrompt {
  /** System prompt (protected). */
  readonly systemPrompt?: string;
  /** Function signature (protected). */
  readonly signature?: string;
  /** Contracts/constraints (protected). */
  readonly contracts?: string;
  /** Required types in signature. */
  readonly requiredTypes?: string;
  /** Related types not in signature. */
  readonly relatedTypes?: string;
  /** Examples. */
  readonly examples?: string;
  /** Comments. */
  readonly comments?: string;
  /** The main prompt/user message. */
  readonly userPrompt: string;
}

/**
 * Result of truncation operation.
 */
export interface TruncationResult {
  /** Whether truncation was successful (within budget after truncation). */
  readonly success: boolean;
  /** The truncated prompt (may still be over budget if truncation failed). */
  readonly truncatedPrompt: string;
  /** Sections that were removed. */
  readonly removedSections: readonly TruncatableSection[];
  /** Estimated tokens after truncation. */
  readonly tokensAfterTruncation: number;
  /** Tokens saved by truncation. */
  readonly tokensSaved: number;
  /** Original token count. */
  readonly originalTokens: number;
  /** Target token limit. */
  readonly targetLimit: number;
}

/**
 * Token counter interface for dependency injection.
 * Allows swapping in different tokenization strategies.
 */
export interface TokenCounter {
  /**
   * Count tokens in text.
   *
   * @param text - Text to count tokens for.
   * @returns Estimated token count.
   */
  countTokens(text: string): number;
}

/**
 * Simple character-based token estimation.
 * Uses ~4 characters per token as a conservative estimate.
 *
 * @remarks
 * This is a simple heuristic. For production use, consider using
 * a proper tokenizer like tiktoken or the model's native tokenizer.
 *
 * @param text - Text to estimate tokens for.
 * @returns Estimated token count.
 */
export function estimateTokensSimple(text: string): number {
  // Empty string has 0 tokens
  if (text.length === 0) {
    return 0;
  }

  // Conservative estimate: ~4 characters per token
  // This is a reasonable approximation for English text with code
  const CHARS_PER_TOKEN = 4;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Word-based token estimation with better accuracy for code.
 *
 * @remarks
 * Uses word boundaries and code-aware heuristics.
 * Assumes ~1.3 tokens per word for code.
 *
 * @param text - Text to estimate tokens for.
 * @returns Estimated token count.
 */
export function estimateTokensWordBased(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  // Split on whitespace and common code delimiters
  const words = text.split(/[\s\n\r\t]+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    // Just whitespace - still counts as some tokens
    return Math.max(1, Math.ceil(text.length / 10));
  }

  // Count special characters that often become separate tokens
  const specialChars = (text.match(/[{}[\]().,;:!?<>=/\\@#$%^&*|`~"']/g) ?? []).length;

  // Code tends to have more tokens per word due to camelCase, snake_case, etc.
  const TOKENS_PER_WORD = 1.3;
  const wordTokens = Math.ceil(words.length * TOKENS_PER_WORD);

  // Special characters often split into separate tokens
  const specialTokens = Math.ceil(specialChars * 0.5);

  return wordTokens + specialTokens;
}

/**
 * Default token counter using word-based estimation.
 */
export const defaultTokenCounter: TokenCounter = {
  countTokens: estimateTokensWordBased,
};

/**
 * Get context limits for a model.
 *
 * @param modelId - Model identifier.
 * @returns Context limits for the model.
 */
export function getModelLimits(modelId: string): ModelContextLimits {
  // Normalize model ID for lookup
  const normalizedId = modelId.toLowerCase();

  // Check for exact match first
  const exactMatch = MODEL_CONTEXT_LIMITS.get(normalizedId);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  // Check for partial match (model family)
  for (const [key, limits] of MODEL_CONTEXT_LIMITS.entries()) {
    if (normalizedId.includes(key) || key.includes(normalizedId)) {
      return limits;
    }
  }

  // Return default limits for unknown models
  return DEFAULT_MODEL_LIMITS;
}

/**
 * Determine overflow strategy based on overflow percentage.
 *
 * @param overflowPercentage - How much over the limit (e.g., 0.15 for 15% over).
 * @param currentModel - Current model alias.
 * @returns Recommended overflow strategy.
 */
export function determineOverflowStrategy(
  overflowPercentage: number,
  currentModel: ModelAlias
): ContextOverflowStrategy {
  // Mild overflow (< 20%) - try truncation first
  if (overflowPercentage < 0.2) {
    return {
      type: 'truncate',
      sections: DEFAULT_TRUNCATION_ORDER,
    };
  }

  // Moderate overflow (20-100%) - try upgrading to a larger model
  if (overflowPercentage <= 1.0) {
    // Upgrade path: worker -> structurer -> architect -> fallback
    const upgradeTargets: Record<ModelAlias, ModelAlias | null> = {
      worker: 'structurer',
      structurer: 'architect',
      architect: 'fallback',
      auditor: 'architect',
      fallback: null,
    };

    // eslint-disable-next-line security/detect-object-injection -- safe: currentModel is typed as ModelAlias with known literal keys
    const target = upgradeTargets[currentModel];
    if (target !== null) {
      return {
        type: 'upgrade',
        targetModel: target,
      };
    }
  }

  // Severe overflow (> 100%) or no upgrade path - reject
  return {
    type: 'reject',
    reason: `Input exceeds maximum context limit by ${String(Math.round(overflowPercentage * 100))}%. Cannot proceed.`,
  };
}

/**
 * Analyze context budget for a request.
 *
 * @param request - Model router request to analyze.
 * @param modelId - Actual model ID being used.
 * @param counter - Token counter to use.
 * @returns Context budget analysis result.
 */
export function analyzeContextBudget(
  request: ModelRouterRequest,
  modelId: string,
  counter: TokenCounter = defaultTokenCounter
): ContextBudgetResult {
  // Count tokens in prompt
  let totalTokens = counter.countTokens(request.prompt);

  // Add system prompt tokens if present
  if (request.parameters?.systemPrompt !== undefined) {
    totalTokens += counter.countTokens(request.parameters.systemPrompt);
  }

  // Get model limits
  const limits = getModelLimits(modelId);
  const maxTokens = limits.maxInputTokens;

  // Calculate overflow
  const overflowTokens = Math.max(0, totalTokens - maxTokens);
  const overflowPercentage = overflowTokens > 0 ? overflowTokens / maxTokens : 0;
  const withinBudget = totalTokens <= maxTokens;

  // Build base result
  const baseResult = {
    withinBudget,
    estimatedTokens: totalTokens,
    maxTokens,
    overflowTokens,
    overflowPercentage,
  };

  // Add strategy if over budget
  if (!withinBudget) {
    const strategy = determineOverflowStrategy(overflowPercentage, request.modelAlias);
    return {
      ...baseResult,
      strategy,
    };
  }

  return baseResult;
}

/**
 * Build a prompt from structured sections.
 *
 * @param prompt - Structured prompt with sections.
 * @returns Combined prompt string.
 */
export function buildPromptFromSections(prompt: StructuredPrompt): string {
  const parts: string[] = [];

  // Add sections in priority order (highest first, so protected come first)
  if (prompt.systemPrompt !== undefined && prompt.systemPrompt.length > 0) {
    parts.push(prompt.systemPrompt);
  }
  if (prompt.signature !== undefined && prompt.signature.length > 0) {
    parts.push(prompt.signature);
  }
  if (prompt.contracts !== undefined && prompt.contracts.length > 0) {
    parts.push(prompt.contracts);
  }
  if (prompt.requiredTypes !== undefined && prompt.requiredTypes.length > 0) {
    parts.push(prompt.requiredTypes);
  }
  if (prompt.relatedTypes !== undefined && prompt.relatedTypes.length > 0) {
    parts.push(prompt.relatedTypes);
  }
  if (prompt.examples !== undefined && prompt.examples.length > 0) {
    parts.push(prompt.examples);
  }
  if (prompt.comments !== undefined && prompt.comments.length > 0) {
    parts.push(prompt.comments);
  }

  // Always include user prompt last
  parts.push(prompt.userPrompt);

  return parts.join('\n\n');
}

/**
 * Extract content sections from a structured prompt.
 *
 * @param prompt - Structured prompt.
 * @param counter - Token counter.
 * @returns Array of content sections with token counts.
 */
export function extractSections(
  prompt: StructuredPrompt,
  counter: TokenCounter = defaultTokenCounter
): ContentSection[] {
  const sections: ContentSection[] = [];

  // Add truncatable sections (in truncation order - lowest priority first)
  if (prompt.comments !== undefined && prompt.comments.length > 0) {
    sections.push({
      section: 'comments',
      content: prompt.comments,
      tokens: counter.countTokens(prompt.comments),
    });
  }

  if (prompt.examples !== undefined && prompt.examples.length > 0) {
    sections.push({
      section: 'examples',
      content: prompt.examples,
      tokens: counter.countTokens(prompt.examples),
    });
  }

  if (prompt.relatedTypes !== undefined && prompt.relatedTypes.length > 0) {
    sections.push({
      section: 'relatedTypes',
      content: prompt.relatedTypes,
      tokens: counter.countTokens(prompt.relatedTypes),
    });
  }

  if (prompt.requiredTypes !== undefined && prompt.requiredTypes.length > 0) {
    sections.push({
      section: 'requiredTypes',
      content: prompt.requiredTypes,
      tokens: counter.countTokens(prompt.requiredTypes),
    });
  }

  // Add protected sections
  if (prompt.contracts !== undefined && prompt.contracts.length > 0) {
    sections.push({
      section: 'contracts',
      content: prompt.contracts,
      tokens: counter.countTokens(prompt.contracts),
    });
  }

  if (prompt.signature !== undefined && prompt.signature.length > 0) {
    sections.push({
      section: 'signature',
      content: prompt.signature,
      tokens: counter.countTokens(prompt.signature),
    });
  }

  if (prompt.systemPrompt !== undefined && prompt.systemPrompt.length > 0) {
    sections.push({
      section: 'systemPrompt',
      content: prompt.systemPrompt,
      tokens: counter.countTokens(prompt.systemPrompt),
    });
  }

  return sections;
}

/**
 * Truncate a structured prompt to fit within token limits.
 *
 * @param prompt - Structured prompt to truncate.
 * @param maxTokens - Maximum allowed tokens.
 * @param truncationOrder - Order in which to remove sections.
 * @param counter - Token counter.
 * @returns Truncation result.
 */
export function truncatePrompt(
  prompt: StructuredPrompt,
  maxTokens: number,
  truncationOrder: TruncationOrder = DEFAULT_TRUNCATION_ORDER,
  counter: TokenCounter = defaultTokenCounter
): TruncationResult {
  // Calculate original tokens
  const originalPromptString = buildPromptFromSections(prompt);
  const originalTokens = counter.countTokens(originalPromptString);

  // If already within budget, return unchanged
  if (originalTokens <= maxTokens) {
    return {
      success: true,
      truncatedPrompt: originalPromptString,
      removedSections: [],
      tokensAfterTruncation: originalTokens,
      tokensSaved: 0,
      originalTokens,
      targetLimit: maxTokens,
    };
  }

  // Build mutable copy of prompt
  const truncatedPrompt: StructuredPrompt = { ...prompt };
  const removedSections: TruncatableSection[] = [];
  let currentTokens = originalTokens;

  // Extract sections to know their token costs
  const sections = extractSections(prompt, counter);
  const sectionMap = new Map<TruncatableSection, ContentSection>();
  for (const section of sections) {
    sectionMap.set(section.section, section);
  }

  // Remove sections in order until within budget
  for (const sectionName of truncationOrder.order) {
    if (currentTokens <= maxTokens) {
      break;
    }

    // Skip if this section is protected
    if (truncationOrder.protected.includes(sectionName)) {
      continue;
    }

    const section = sectionMap.get(sectionName);
    if (section === undefined) {
      continue; // Section doesn't exist in this prompt
    }

    // Remove this section
    removedSections.push(sectionName);
    currentTokens -= section.tokens;

    // Clear the section in the truncated prompt
    // We need to cast to mutable since StructuredPrompt has optional readonly fields
    // eslint-disable-next-line security/detect-object-injection -- safe: sectionName comes from sortByTruncationPriority over controlled TruncatableSection enum
    (truncatedPrompt as unknown as Record<string, unknown>)[sectionName] = undefined;
  }

  // Build the final truncated prompt string
  const truncatedPromptString = buildPromptFromSections(truncatedPrompt);

  // Recalculate actual tokens (may differ slightly from our estimate)
  const tokensAfterTruncation = counter.countTokens(truncatedPromptString);
  const tokensSaved = originalTokens - tokensAfterTruncation;

  return {
    success: tokensAfterTruncation <= maxTokens,
    truncatedPrompt: truncatedPromptString,
    removedSections,
    tokensAfterTruncation,
    tokensSaved,
    originalTokens,
    targetLimit: maxTokens,
  };
}

/**
 * Error thrown when context exceeds limits and cannot be handled.
 */
export class ContextOverflowError extends Error {
  /** The overflow analysis that triggered this error. */
  readonly analysis: ContextBudgetResult;
  /** The strategy that was attempted (if any). */
  readonly attemptedStrategy?: ContextOverflowStrategy;

  constructor(
    message: string,
    analysis: ContextBudgetResult,
    attemptedStrategy?: ContextOverflowStrategy
  ) {
    super(message);
    this.name = 'ContextOverflowError';
    this.analysis = analysis;
    if (attemptedStrategy !== undefined) {
      this.attemptedStrategy = attemptedStrategy;
    }
  }
}

/**
 * Apply context overflow strategy to a request.
 *
 * @param request - Original request.
 * @param strategy - Strategy to apply.
 * @param structuredPrompt - Optional structured prompt for truncation.
 * @param modelId - Model ID for limit lookup.
 * @param counter - Token counter.
 * @returns Modified request or rejection error.
 */
export function applyOverflowStrategy(
  request: ModelRouterRequest,
  strategy: ContextOverflowStrategy,
  structuredPrompt?: StructuredPrompt,
  modelId?: string,
  counter: TokenCounter = defaultTokenCounter
):
  | { readonly success: true; readonly request: ModelRouterRequest }
  | { readonly success: false; readonly error: ContextOverflowError } {
  switch (strategy.type) {
    case 'upgrade': {
      // Simply change the model alias - let the router handle the actual model selection
      const upgradedRequest: ModelRouterRequest = {
        ...request,
        modelAlias: strategy.targetModel,
      };
      return { success: true, request: upgradedRequest };
    }

    case 'truncate': {
      // Need structured prompt for truncation
      if (structuredPrompt === undefined) {
        // Fall back to simple prompt truncation if no structured prompt
        const limits = getModelLimits(modelId ?? '');
        const maxTokens = limits.maxInputTokens;
        const currentTokens = counter.countTokens(request.prompt);

        if (currentTokens <= maxTokens) {
          return { success: true, request };
        }

        // Cannot truncate unstructured prompt meaningfully
        const analysis: ContextBudgetResult = {
          withinBudget: false,
          estimatedTokens: currentTokens,
          maxTokens,
          overflowTokens: currentTokens - maxTokens,
          overflowPercentage: (currentTokens - maxTokens) / maxTokens,
          strategy,
        };

        return {
          success: false,
          error: new ContextOverflowError(
            'Cannot truncate unstructured prompt. Provide structured prompt for truncation.',
            analysis,
            strategy
          ),
        };
      }

      // Perform truncation
      const limits = getModelLimits(modelId ?? '');
      const truncationResult = truncatePrompt(
        structuredPrompt,
        limits.maxInputTokens,
        strategy.sections,
        counter
      );

      if (truncationResult.success) {
        const truncatedRequest: ModelRouterRequest = {
          ...request,
          prompt: truncationResult.truncatedPrompt,
        };
        return { success: true, request: truncatedRequest };
      }

      // Truncation wasn't enough
      const analysis: ContextBudgetResult = {
        withinBudget: false,
        estimatedTokens: truncationResult.tokensAfterTruncation,
        maxTokens: truncationResult.targetLimit,
        overflowTokens: truncationResult.tokensAfterTruncation - truncationResult.targetLimit,
        overflowPercentage:
          (truncationResult.tokensAfterTruncation - truncationResult.targetLimit) /
          truncationResult.targetLimit,
        strategy,
      };

      return {
        success: false,
        error: new ContextOverflowError(
          `Truncation insufficient. Still ${String(truncationResult.tokensAfterTruncation - truncationResult.targetLimit)} tokens over limit after removing: ${truncationResult.removedSections.join(', ')}`,
          analysis,
          strategy
        ),
      };
    }

    case 'chunk': {
      // Chunking is not implemented in this story (it's for audit tasks only)
      // Return rejection for now
      const analysis: ContextBudgetResult = {
        withinBudget: false,
        estimatedTokens: counter.countTokens(request.prompt),
        maxTokens: strategy.chunkSize,
        overflowTokens: counter.countTokens(request.prompt) - strategy.chunkSize,
        overflowPercentage:
          (counter.countTokens(request.prompt) - strategy.chunkSize) / strategy.chunkSize,
        strategy,
      };

      return {
        success: false,
        error: new ContextOverflowError(
          'Chunking strategy not implemented for implementation tasks.',
          analysis,
          strategy
        ),
      };
    }

    case 'reject': {
      const currentTokens = counter.countTokens(request.prompt);
      const limits = getModelLimits(modelId ?? '');

      const analysis: ContextBudgetResult = {
        withinBudget: false,
        estimatedTokens: currentTokens,
        maxTokens: limits.maxInputTokens,
        overflowTokens: currentTokens - limits.maxInputTokens,
        overflowPercentage: (currentTokens - limits.maxInputTokens) / limits.maxInputTokens,
        strategy,
      };

      return {
        success: false,
        error: new ContextOverflowError(strategy.reason, analysis, strategy),
      };
    }
  }
}

/**
 * Check if a section is protected from truncation.
 *
 * @param section - Section to check.
 * @param truncationOrder - Truncation order configuration.
 * @returns True if the section is protected.
 */
export function isProtectedSection(
  section: TruncatableSection,
  truncationOrder: TruncationOrder = DEFAULT_TRUNCATION_ORDER
): boolean {
  return truncationOrder.protected.includes(section);
}

/**
 * Check if a section can be truncated.
 *
 * @param section - Section to check.
 * @param truncationOrder - Truncation order configuration.
 * @returns True if the section can be truncated.
 */
export function isTruncatableSection(
  section: TruncatableSection,
  truncationOrder: TruncationOrder = DEFAULT_TRUNCATION_ORDER
): boolean {
  return truncationOrder.order.includes(section) && !truncationOrder.protected.includes(section);
}

/**
 * Get the priority of a section.
 *
 * @param section - Section to get priority for.
 * @returns Priority number (higher = more important, less likely to be truncated).
 */
export function getSectionPriority(section: TruncatableSection): number {
  // eslint-disable-next-line security/detect-object-injection -- safe: section is typed as TruncatableSection enum with known literal keys
  return SECTION_PRIORITY[section];
}

/**
 * Sort sections by truncation priority (lowest priority first).
 *
 * @param sections - Sections to sort.
 * @returns Sorted sections.
 */
export function sortByTruncationPriority(
  sections: readonly TruncatableSection[]
): TruncatableSection[] {
  return [...sections].sort((a, b) => getSectionPriority(a) - getSectionPriority(b));
}
