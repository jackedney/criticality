/**
 * Model Router module for the Criticality Protocol.
 *
 * Provides the abstract interface and types for routing model requests
 * to different backends (Claude Code, OpenCode, etc.).
 *
 * @packageDocumentation
 */

export {
  // Core types
  type ModelAlias,
  type ModelParameters,
  type ModelRouterRequest,
  type ModelUsage,
  type ModelMetadata,
  type ModelRouterResponse,
  type StreamChunk,
  type ModelRouterResult,
  // Error types
  type ModelRouterErrorKind,
  type ModelRouterErrorBase,
  type RateLimitError,
  type AuthenticationError,
  type ModelError,
  type TimeoutError,
  type NetworkError,
  type ValidationError,
  type ModelRouterError,
  // Interface
  type ModelRouter,
  // Constants
  MODEL_ALIASES,
  ERROR_KINDS,
  // Type guards
  isValidModelAlias,
  isModelRouterError,
  isRetryableError,
  // Factory functions
  createRateLimitError,
  createAuthenticationError,
  createModelError,
  createTimeoutError,
  createNetworkError,
  createValidationError,
  createSuccessResult,
  createFailureResult,
} from './types.js';

// Claude Code client
export {
  ClaudeCodeClient,
  ClaudeCodeNotInstalledError,
  checkClaudeCodeInstalled,
  createClaudeCodeClient,
  type ClaudeCodeClientOptions,
} from './claude-code-client.js';

// OpenCode client
export {
  OpenCodeClient,
  OpenCodeNotInstalledError,
  checkOpenCodeInstalled,
  createOpenCodeClient,
  type OpenCodeClientOptions,
} from './opencode-client.js';

// Model interaction logging
export {
  // Types
  type ModelLogLevel,
  type ModelRequestLogEntry,
  type ModelResponseLogEntry,
  type ModelErrorLogEntry,
  type ModelLogEntry,
  type ModelLoggerOptions,
  // Constants
  MODEL_LOG_LEVELS,
  // Functions
  isValidModelLogLevel,
  computePromptHash,
  createModelLogger,
  readLogFile,
  getLogStats,
  // Class
  ModelLogger,
} from './logging.js';

// Retry logic with exponential backoff
export {
  // Types
  type RetryConfig,
  type RetryAttemptInfo,
  type RetryCallback,
  type WithRetryOptions,
  // Constants
  DEFAULT_RETRY_CONFIG,
  // Functions
  validateRetryConfig,
  calculateBackoffDelay,
  shouldRetry,
  withRetry,
  createRetrier,
  wrapWithRetry,
  defaultSleep,
} from './retry.js';

// Context budgeting and truncation
export {
  // Types
  type TruncatableSection,
  type TruncationOrder,
  type ModelContextLimits,
  type ContextOverflowStrategy,
  type ContextBudgetResult,
  type ContentSection,
  type StructuredPrompt,
  type TruncationResult,
  type TokenCounter,
  // Constants
  SECTION_PRIORITY,
  TRUNCATABLE_SECTIONS,
  PROTECTED_SECTIONS,
  DEFAULT_TRUNCATION_ORDER,
  MODEL_CONTEXT_LIMITS,
  DEFAULT_MODEL_LIMITS,
  // Token counting
  estimateTokensSimple,
  estimateTokensWordBased,
  defaultTokenCounter,
  // Model limits
  getModelLimits,
  // Context analysis
  analyzeContextBudget,
  determineOverflowStrategy,
  // Truncation
  truncatePrompt,
  extractSections,
  buildPromptFromSections,
  // Strategy application
  applyOverflowStrategy,
  ContextOverflowError,
  // Utilities
  isProtectedSection,
  isTruncatableSection,
  getSectionPriority,
  sortByTruncationPriority,
} from './context.js';

// Deterministic model routing logic
export {
  // Types
  type TaskType,
  type SignatureComplexityParams,
  type RoutingSignals,
  type RoutingThresholds,
  type RoutingDecision,
  // Constants
  TASK_TYPES,
  DEFAULT_SIGNATURE_PARAMS,
  DEFAULT_ROUTING_SIGNALS,
  DEFAULT_ROUTING_THRESHOLDS,
  TASK_TYPE_TO_BASE_MODEL,
  // Type guards
  isValidTaskType,
  // Core routing functions
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
} from './routing.js';
