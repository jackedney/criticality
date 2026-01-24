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
