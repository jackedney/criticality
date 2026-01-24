/**
 * Retry logic with exponential backoff for the Criticality Protocol.
 *
 * Provides automatic retry functionality for transient failures with
 * configurable exponential backoff and jitter.
 *
 * @packageDocumentation
 */

import type { ModelRouterRequest, ModelRouterResult, ModelRouterError } from './types.js';
import { isRetryableError, createModelError, createFailureResult } from './types.js';

/**
 * Configuration options for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000). */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000). */
  maxDelayMs: number;
  /** Jitter factor (0-1) for randomizing delays (default: 0.2). */
  jitterFactor: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
} as const;

/**
 * Validates retry configuration values.
 *
 * @param config - Partial retry configuration to validate.
 * @returns Valid retry configuration with defaults applied.
 * @throws Error if configuration values are invalid.
 */
export function validateRetryConfig(config: Partial<RetryConfig> = {}): RetryConfig {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitterFactor = DEFAULT_RETRY_CONFIG.jitterFactor,
  } = config;

  if (maxRetries < 0 || !Number.isInteger(maxRetries)) {
    throw new Error(`maxRetries must be a non-negative integer, got: ${String(maxRetries)}`);
  }

  if (baseDelayMs < 0) {
    throw new Error(`baseDelayMs must be non-negative, got: ${String(baseDelayMs)}`);
  }

  if (maxDelayMs < baseDelayMs) {
    throw new Error(
      `maxDelayMs (${String(maxDelayMs)}) must be >= baseDelayMs (${String(baseDelayMs)})`
    );
  }

  if (jitterFactor < 0 || jitterFactor > 1) {
    throw new Error(`jitterFactor must be between 0 and 1, got: ${String(jitterFactor)}`);
  }

  return {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    jitterFactor,
  };
}

/**
 * Calculates the delay before the next retry attempt using exponential backoff with jitter.
 *
 * The delay is calculated as: min(maxDelayMs, baseDelayMs * 2^attempt) * (1 ± jitter)
 *
 * If the error includes a retryAfterMs hint (e.g., from rate limit headers),
 * that value is used instead, capped at maxDelayMs.
 *
 * @param attempt - The retry attempt number (0-indexed).
 * @param config - Retry configuration.
 * @param error - Optional error that may contain retry hints.
 * @param random - Random function for jitter (injectable for testing).
 * @returns Delay in milliseconds before the next retry.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  error?: ModelRouterError,
  random: () => number = Math.random
): number {
  // Check for rate limit error with retry-after hint
  if (error?.kind === 'RateLimitError') {
    const rateLimitError = error;
    if (rateLimitError.retryAfterMs !== undefined) {
      return Math.min(rateLimitError.retryAfterMs, config.maxDelayMs);
    }
  }

  // Calculate exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Apply jitter: delay * (1 - jitterFactor + random() * 2 * jitterFactor)
  // This gives a range of [delay * (1 - jitterFactor), delay * (1 + jitterFactor)]
  const jitterMultiplier = 1 - config.jitterFactor + random() * 2 * config.jitterFactor;
  const delayWithJitter = cappedDelay * jitterMultiplier;

  return Math.round(delayWithJitter);
}

/**
 * Determines if an error should trigger a retry.
 *
 * Errors that should NOT be retried:
 * - AuthenticationError: Permanent auth failure
 * - ValidationError: Invalid request that won't succeed on retry
 * - ModelError with retryable: false: Permanent model rejection (e.g., content filter)
 *
 * Errors that SHOULD be retried:
 * - RateLimitError: Temporary capacity issue
 * - TimeoutError: Request took too long
 * - NetworkError: Temporary connectivity issue
 * - ModelError with retryable: true: Transient model error
 *
 * @param error - The error to evaluate.
 * @returns True if the error is retryable.
 */
export function shouldRetry(error: ModelRouterError): boolean {
  return isRetryableError(error);
}

/**
 * Information about a retry attempt.
 */
export interface RetryAttemptInfo {
  /** The attempt number (1-indexed). */
  attempt: number;
  /** Total attempts that will be made (initial + retries). */
  totalAttempts: number;
  /** Delay before this attempt in milliseconds (0 for first attempt). */
  delayMs: number;
  /** The error from the previous attempt, if any. */
  previousError?: ModelRouterError;
}

/**
 * Callback type for retry attempt notifications.
 */
export type RetryCallback = (info: RetryAttemptInfo) => void;

/**
 * Options for the withRetry function.
 */
export interface WithRetryOptions {
  /** Retry configuration (uses defaults if not provided). */
  config?: Partial<RetryConfig>;
  /** Callback invoked before each retry attempt. */
  onRetry?: RetryCallback;
  /** Sleep function for delays (injectable for testing). */
  sleep?: (ms: number) => Promise<void>;
  /** Random function for jitter (injectable for testing). */
  random?: () => number;
}

/**
 * Default sleep implementation using setTimeout.
 *
 * @param ms - Milliseconds to sleep.
 * @returns Promise that resolves after the delay.
 */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async operation with retry logic using exponential backoff.
 *
 * @param operation - The async function to execute with retries.
 * @param options - Retry options.
 * @returns The result of the operation (success or final failure).
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => client.complete(request),
 *   {
 *     config: { maxRetries: 3, baseDelayMs: 1000 },
 *     onRetry: (info) => console.log(`Retry attempt ${info.attempt}...`)
 *   }
 * );
 * ```
 */
export async function withRetry(
  operation: () => Promise<ModelRouterResult>,
  options: WithRetryOptions = {}
): Promise<ModelRouterResult> {
  const config = validateRetryConfig(options.config);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const onRetry = options.onRetry;

  let lastError: ModelRouterError | undefined;
  const totalAttempts = config.maxRetries + 1;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Notify callback before retry (not on first attempt)
    if (attempt > 0 && lastError !== undefined) {
      const delayMs = calculateBackoffDelay(attempt - 1, config, lastError, random);

      if (onRetry !== undefined) {
        onRetry({
          attempt: attempt + 1,
          totalAttempts,
          delayMs,
          previousError: lastError,
        });
      }

      await sleep(delayMs);
    }

    const result = await operation();

    if (result.success) {
      return result;
    }

    // Check if we should retry this error
    const error = result.error;
    if (!shouldRetry(error)) {
      // Non-retryable error, return immediately
      return result;
    }

    lastError = error;
  }

  // All retries exhausted
  if (lastError !== undefined) {
    // Build options conditionally for exactOptionalPropertyTypes compliance
    const errorOptions: {
      errorCode: string;
      cause?: Error;
      request?: ModelRouterRequest;
    } = { errorCode: 'RETRIES_EXHAUSTED' };

    if (lastError.cause !== undefined) {
      errorOptions.cause = lastError.cause;
    }
    if (lastError.request !== undefined) {
      errorOptions.request = lastError.request;
    }

    return createFailureResult(
      createModelError(
        `All ${String(totalAttempts)} attempts failed. Last error: ${lastError.message}`,
        false,
        errorOptions
      )
    );
  }

  // This should never happen, but TypeScript needs it
  return createFailureResult(
    createModelError('Unexpected state: no result after retries', false, {
      errorCode: 'UNEXPECTED_STATE',
    })
  );
}

/**
 * Creates a retry wrapper function with pre-configured options.
 *
 * @param defaultOptions - Default options for all retried operations.
 * @returns A function that wraps operations with retry logic.
 *
 * @example
 * ```typescript
 * const retrier = createRetrier({
 *   config: { maxRetries: 5, baseDelayMs: 500 },
 *   onRetry: (info) => logger.warn(`Retry ${info.attempt}/${info.totalAttempts}`)
 * });
 *
 * const result = await retrier(() => client.complete(request));
 * ```
 */
export function createRetrier(
  defaultOptions: WithRetryOptions = {}
): (
  operation: () => Promise<ModelRouterResult>,
  options?: WithRetryOptions
) => Promise<ModelRouterResult> {
  return (operation, options = {}) => {
    // Merge options with defaults
    const mergedConfig = {
      ...defaultOptions.config,
      ...options.config,
    };

    const mergedOptions: WithRetryOptions = {
      ...defaultOptions,
      ...options,
      config: mergedConfig,
    };

    // Prefer specific callbacks over defaults
    if (options.onRetry !== undefined) {
      mergedOptions.onRetry = options.onRetry;
    }
    if (options.sleep !== undefined) {
      mergedOptions.sleep = options.sleep;
    }
    if (options.random !== undefined) {
      mergedOptions.random = options.random;
    }

    return withRetry(operation, mergedOptions);
  };
}

/**
 * Wraps a ModelRouter method with retry logic.
 *
 * This is a convenience function for adding retry behavior to existing router methods.
 *
 * @param method - The router method to wrap.
 * @param options - Retry options.
 * @returns A wrapped method with automatic retry.
 *
 * @example
 * ```typescript
 * const retryingComplete = wrapWithRetry(
 *   (req) => client.complete(req),
 *   { config: { maxRetries: 3 } }
 * );
 *
 * const result = await retryingComplete(request);
 * ```
 */
export function wrapWithRetry(
  method: (request: ModelRouterRequest) => Promise<ModelRouterResult>,
  options: WithRetryOptions = {}
): (request: ModelRouterRequest) => Promise<ModelRouterResult> {
  return (request: ModelRouterRequest) => {
    return withRetry(() => method(request), options);
  };
}
