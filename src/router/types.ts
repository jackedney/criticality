/**
 * Model Router types for the Criticality Protocol.
 *
 * Defines the abstract interface for model routing, allowing different
 * backends (Claude Code, OpenCode, etc.) to be used interchangeably.
 *
 * @packageDocumentation
 */

/**
 * Model alias used for routing requests.
 * These correspond to the role-based model assignments in configuration.
 */
export type ModelAlias = 'architect' | 'auditor' | 'structurer' | 'worker' | 'fallback';

/**
 * Parameters for model completion requests.
 */
export interface ModelParameters {
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Temperature for sampling (0-1). */
  temperature?: number;
  /** Top-p sampling parameter. */
  topP?: number;
  /** Stop sequences to terminate generation. */
  stopSequences?: readonly string[];
  /** System prompt to prepend to the request. */
  systemPrompt?: string;
}

/**
 * Request to the model router for completion.
 */
export interface ModelRouterRequest {
  /** Model alias to route the request to. */
  modelAlias: ModelAlias;
  /** The prompt to send to the model. */
  prompt: string;
  /** Optional parameters for the completion. */
  parameters?: ModelParameters;
  /** Optional request ID for tracking/correlation. */
  requestId?: string;
}

/**
 * Usage statistics from a model response.
 */
export interface ModelUsage {
  /** Number of tokens in the prompt. */
  promptTokens: number;
  /** Number of tokens in the completion. */
  completionTokens: number;
  /** Total tokens used. */
  totalTokens: number;
}

/**
 * Metadata about the model that processed the request.
 */
export interface ModelMetadata {
  /** The actual model identifier used (e.g., 'claude-3-opus'). */
  modelId: string;
  /** The backend provider (e.g., 'claude-code', 'opencode'). */
  provider: string;
  /** Latency in milliseconds. */
  latencyMs: number;
}

/**
 * Response from the model router.
 */
export interface ModelRouterResponse {
  /** The generated content. */
  content: string;
  /** Token usage statistics. */
  usage: ModelUsage;
  /** Metadata about the model and request. */
  metadata: ModelMetadata;
  /** The original request ID if provided. */
  requestId?: string;
}

/**
 * Discriminated union of model router error types.
 */
export type ModelRouterErrorKind =
  | 'RateLimitError'
  | 'AuthenticationError'
  | 'ModelError'
  | 'TimeoutError'
  | 'NetworkError'
  | 'ValidationError';

/**
 * Base interface for all model router errors.
 */
export interface ModelRouterErrorBase {
  /** Discriminant for error type. */
  readonly kind: ModelRouterErrorKind;
  /** Human-readable error message. */
  readonly message: string;
  /** Optional underlying error. */
  readonly cause?: Error;
  /** The request that caused the error, if available. */
  readonly request?: ModelRouterRequest;
}

/**
 * Error when rate limit is exceeded.
 */
export interface RateLimitError extends ModelRouterErrorBase {
  readonly kind: 'RateLimitError';
  /** Milliseconds to wait before retrying. */
  readonly retryAfterMs?: number;
  /** Whether the error is transient and can be retried. */
  readonly retryable: true;
}

/**
 * Error when authentication fails.
 */
export interface AuthenticationError extends ModelRouterErrorBase {
  readonly kind: 'AuthenticationError';
  /** The provider that rejected authentication. */
  readonly provider: string;
  /** Whether the error is transient and can be retried. */
  readonly retryable: false;
}

/**
 * Error from the model itself (e.g., content filter, invalid request).
 */
export interface ModelError extends ModelRouterErrorBase {
  readonly kind: 'ModelError';
  /** Error code from the model provider. */
  readonly errorCode?: string;
  /** The model that produced the error. */
  readonly modelId?: string;
  /** Whether the error is transient and can be retried. */
  readonly retryable: boolean;
}

/**
 * Error when request times out.
 */
export interface TimeoutError extends ModelRouterErrorBase {
  readonly kind: 'TimeoutError';
  /** The timeout duration in milliseconds. */
  readonly timeoutMs: number;
  /** Whether the error is transient and can be retried. */
  readonly retryable: true;
}

/**
 * Error for network-level failures.
 */
export interface NetworkError extends ModelRouterErrorBase {
  readonly kind: 'NetworkError';
  /** The endpoint that failed. */
  readonly endpoint?: string;
  /** Whether the error is transient and can be retried. */
  readonly retryable: true;
}

/**
 * Error when request validation fails.
 */
export interface ValidationError extends ModelRouterErrorBase {
  readonly kind: 'ValidationError';
  /** Fields that failed validation. */
  readonly invalidFields?: readonly string[];
  /** Whether the error is transient and can be retried. */
  readonly retryable: false;
}

/**
 * Union type of all model router errors.
 */
export type ModelRouterError =
  | RateLimitError
  | AuthenticationError
  | ModelError
  | TimeoutError
  | NetworkError
  | ValidationError;

/**
 * Type guard to check if an error is retryable.
 *
 * @param error - The error to check.
 * @returns True if the error can be retried.
 */
export function isRetryableError(error: ModelRouterError): boolean {
  return error.retryable;
}

/**
 * Type guard to check if a value is a ModelRouterError.
 *
 * @param value - The value to check.
 * @returns True if the value is a ModelRouterError.
 */
export function isModelRouterError(value: unknown): value is ModelRouterError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.kind === 'string' &&
    ERROR_KINDS.includes(obj.kind as ModelRouterErrorKind) &&
    typeof obj.message === 'string'
  );
}

/**
 * Creates a RateLimitError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A RateLimitError instance.
 */
export function createRateLimitError(
  message: string,
  options?: {
    retryAfterMs?: number;
    cause?: Error;
    request?: ModelRouterRequest;
  }
): RateLimitError {
  const base: RateLimitError = {
    kind: 'RateLimitError',
    message,
    retryable: true,
  };

  // Build conditionally to satisfy exactOptionalPropertyTypes
  const { retryAfterMs, cause, request } = options ?? {};

  if (retryAfterMs !== undefined && cause !== undefined && request !== undefined) {
    return { ...base, retryAfterMs, cause, request };
  }
  if (retryAfterMs !== undefined && cause !== undefined) {
    return { ...base, retryAfterMs, cause };
  }
  if (retryAfterMs !== undefined && request !== undefined) {
    return { ...base, retryAfterMs, request };
  }
  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (retryAfterMs !== undefined) {
    return { ...base, retryAfterMs };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Creates an AuthenticationError.
 *
 * @param message - Error message.
 * @param provider - The provider that rejected authentication.
 * @param options - Additional options.
 * @returns An AuthenticationError instance.
 */
export function createAuthenticationError(
  message: string,
  provider: string,
  options?: {
    cause?: Error;
    request?: ModelRouterRequest;
  }
): AuthenticationError {
  const base: AuthenticationError = {
    kind: 'AuthenticationError',
    message,
    provider,
    retryable: false,
  };

  const { cause, request } = options ?? {};

  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Creates a ModelError.
 *
 * @param message - Error message.
 * @param retryable - Whether the error can be retried.
 * @param options - Additional options.
 * @returns A ModelError instance.
 */
export function createModelError(
  message: string,
  retryable: boolean,
  options?: {
    errorCode?: string;
    modelId?: string;
    cause?: Error;
    request?: ModelRouterRequest;
  }
): ModelError {
  const base = {
    kind: 'ModelError' as const,
    message,
    retryable,
  };

  const { errorCode, modelId, cause, request } = options ?? {};

  // Build conditionally for exactOptionalPropertyTypes compliance
  // Using explicit object construction to avoid readonly assignment issues
  if (
    errorCode !== undefined &&
    modelId !== undefined &&
    cause !== undefined &&
    request !== undefined
  ) {
    return { ...base, errorCode, modelId, cause, request };
  }
  if (errorCode !== undefined && modelId !== undefined && cause !== undefined) {
    return { ...base, errorCode, modelId, cause };
  }
  if (errorCode !== undefined && modelId !== undefined && request !== undefined) {
    return { ...base, errorCode, modelId, request };
  }
  if (errorCode !== undefined && cause !== undefined && request !== undefined) {
    return { ...base, errorCode, cause, request };
  }
  if (modelId !== undefined && cause !== undefined && request !== undefined) {
    return { ...base, modelId, cause, request };
  }
  if (errorCode !== undefined && modelId !== undefined) {
    return { ...base, errorCode, modelId };
  }
  if (errorCode !== undefined && cause !== undefined) {
    return { ...base, errorCode, cause };
  }
  if (errorCode !== undefined && request !== undefined) {
    return { ...base, errorCode, request };
  }
  if (modelId !== undefined && cause !== undefined) {
    return { ...base, modelId, cause };
  }
  if (modelId !== undefined && request !== undefined) {
    return { ...base, modelId, request };
  }
  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (errorCode !== undefined) {
    return { ...base, errorCode };
  }
  if (modelId !== undefined) {
    return { ...base, modelId };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Creates a TimeoutError.
 *
 * @param message - Error message.
 * @param timeoutMs - The timeout duration in milliseconds.
 * @param options - Additional options.
 * @returns A TimeoutError instance.
 */
export function createTimeoutError(
  message: string,
  timeoutMs: number,
  options?: {
    cause?: Error;
    request?: ModelRouterRequest;
  }
): TimeoutError {
  const base: TimeoutError = {
    kind: 'TimeoutError',
    message,
    timeoutMs,
    retryable: true,
  };

  const { cause, request } = options ?? {};

  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Creates a NetworkError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A NetworkError instance.
 */
export function createNetworkError(
  message: string,
  options?: {
    endpoint?: string;
    cause?: Error;
    request?: ModelRouterRequest;
  }
): NetworkError {
  const base = {
    kind: 'NetworkError' as const,
    message,
    retryable: true as const,
  };

  const { endpoint, cause, request } = options ?? {};

  // Build conditionally for exactOptionalPropertyTypes compliance
  if (endpoint !== undefined && cause !== undefined && request !== undefined) {
    return { ...base, endpoint, cause, request };
  }
  if (endpoint !== undefined && cause !== undefined) {
    return { ...base, endpoint, cause };
  }
  if (endpoint !== undefined && request !== undefined) {
    return { ...base, endpoint, request };
  }
  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (endpoint !== undefined) {
    return { ...base, endpoint };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Creates a ValidationError.
 *
 * @param message - Error message.
 * @param options - Additional options.
 * @returns A ValidationError instance.
 */
export function createValidationError(
  message: string,
  options?: {
    invalidFields?: readonly string[];
    cause?: Error;
    request?: ModelRouterRequest;
  }
): ValidationError {
  const base = {
    kind: 'ValidationError' as const,
    message,
    retryable: false as const,
  };

  const { invalidFields, cause, request } = options ?? {};

  // Build conditionally for exactOptionalPropertyTypes compliance
  if (invalidFields !== undefined && cause !== undefined && request !== undefined) {
    return { ...base, invalidFields, cause, request };
  }
  if (invalidFields !== undefined && cause !== undefined) {
    return { ...base, invalidFields, cause };
  }
  if (invalidFields !== undefined && request !== undefined) {
    return { ...base, invalidFields, request };
  }
  if (cause !== undefined && request !== undefined) {
    return { ...base, cause, request };
  }
  if (invalidFields !== undefined) {
    return { ...base, invalidFields };
  }
  if (cause !== undefined) {
    return { ...base, cause };
  }
  if (request !== undefined) {
    return { ...base, request };
  }

  return base;
}

/**
 * Result type for model router operations.
 * Either a successful response or an error.
 */
export type ModelRouterResult =
  | { readonly success: true; readonly response: ModelRouterResponse }
  | { readonly success: false; readonly error: ModelRouterError };

/**
 * Creates a successful result.
 *
 * @param response - The successful response.
 * @returns A successful ModelRouterResult.
 */
export function createSuccessResult(
  response: ModelRouterResponse
): Extract<ModelRouterResult, { success: true }> {
  return { success: true, response };
}

/**
 * Creates a failure result.
 *
 * @param error - The error that occurred.
 * @returns A failure ModelRouterResult.
 */
export function createFailureResult(
  error: ModelRouterError
): Extract<ModelRouterResult, { success: false }> {
  return { success: false, error };
}

/**
 * Streaming chunk from the model.
 */
export interface StreamChunk {
  /** The text content of this chunk. */
  content: string;
  /** Whether this is the final chunk. */
  done: boolean;
  /** Partial usage stats (may only be complete on final chunk). */
  usage?: Partial<ModelUsage>;
}

/**
 * Abstract interface for model routing.
 *
 * @remarks
 * This interface defines the contract that all model router implementations
 * must fulfill. It allows different backends (Claude Code, OpenCode, etc.)
 * to be used interchangeably.
 *
 * Implementations must provide:
 * - `prompt`: Send a simple prompt and get a response
 * - `complete`: Send a full request with parameters and get a response
 * - `stream`: Stream responses chunk by chunk
 *
 * @example
 * ```typescript
 * // Example implementation skeleton
 * class ClaudeCodeRouter implements ModelRouter {
 *   async prompt(modelAlias: ModelAlias, prompt: string): Promise<ModelRouterResult> {
 *     // Implementation using Claude Code CLI
 *   }
 *
 *   async complete(request: ModelRouterRequest): Promise<ModelRouterResult> {
 *     // Implementation with full parameters
 *   }
 *
 *   async *stream(request: ModelRouterRequest): AsyncGenerator<StreamChunk, ModelRouterResult> {
 *     // Streaming implementation
 *   }
 * }
 * ```
 */
export interface ModelRouter {
  /**
   * Send a simple prompt to a model.
   *
   * @param modelAlias - The model alias to route to.
   * @param prompt - The prompt text.
   * @param timeoutMs - Optional timeout in milliseconds for this request.
   * @returns A result containing the response or an error.
   */
  prompt(modelAlias: ModelAlias, prompt: string, timeoutMs?: number): Promise<ModelRouterResult>;

  /**
   * Send a complete request with parameters.
   *
   * @param request - The full request with model alias, prompt, and parameters.
   * @returns A result containing the response or an error.
   */
  complete(request: ModelRouterRequest): Promise<ModelRouterResult>;

  /**
   * Stream a response from the model.
   *
   * @param request - The full request with model alias, prompt, and parameters.
   * @yields StreamChunk objects as they arrive.
   * @returns The final ModelRouterResult when streaming completes.
   */
  stream(request: ModelRouterRequest): AsyncGenerator<StreamChunk, ModelRouterResult, unknown>;
}

/**
 * Array of all valid model aliases.
 * Useful for validation and iteration.
 */
export const MODEL_ALIASES: readonly ModelAlias[] = [
  'architect',
  'auditor',
  'structurer',
  'worker',
  'fallback',
] as const;

/**
 * Checks if a string is a valid ModelAlias.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid ModelAlias.
 */
export function isValidModelAlias(value: string): value is ModelAlias {
  return MODEL_ALIASES.includes(value as ModelAlias);
}

/**
 * Array of all valid error kinds.
 * Useful for validation and iteration.
 */
export const ERROR_KINDS: readonly ModelRouterErrorKind[] = [
  'RateLimitError',
  'AuthenticationError',
  'ModelError',
  'TimeoutError',
  'NetworkError',
  'ValidationError',
] as const;
