/**
 * Injection module - Ralph Loop for atomic function implementation.
 *
 * @packageDocumentation
 */

export {
  RalphLoop,
  createRalphLoop,
  generateImplementationPrompt,
  parseImplementationResponse,
  extractRequiredTypes,
  extractWitnessTypes,
  buildFunctionContext,
  buildExtractedContext,
  formatRalphLoopReport,
  type FunctionContext,
  type ImplementationAttempt,
  type RalphLoopResult,
  type RalphLoopOptions,
} from './ralph-loop.js';

export {
  extractContext,
  serializeContextForPrompt,
  shouldEscalateToLargerModel,
  type ExtractedContext,
  type ExtractedTypeDefinition,
  type ContextSizeMetrics,
  type ContextExtractionOptions,
} from './context-extractor.js';

export {
  generateMinimalPrompt,
  generateMinimalPromptFromComponents,
  estimateTokenCount,
  shouldTriggerModelUpgrade,
  DEFAULT_TOKEN_LIMIT,
  type MinimalPromptResult,
  type MinimalPromptOptions,
} from './prompt-generator.js';
