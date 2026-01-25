/**
 * Tests for retry logic with exponential backoff.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_RETRY_CONFIG,
  validateRetryConfig,
  calculateBackoffDelay,
  shouldRetry,
  withRetry,
  createRetrier,
  wrapWithRetry,
  type RetryConfig,
  type RetryAttemptInfo,
} from './retry.js';
import {
  createRateLimitError,
  createAuthenticationError,
  createModelError,
  createTimeoutError,
  createNetworkError,
  createValidationError,
  createSuccessResult,
  createFailureResult,
  type ModelRouterResponse,
} from './types.js';

describe('retry module', () => {
  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.jitterFactor).toBe(0.2);
    });
  });

  describe('validateRetryConfig', () => {
    it('should return defaults when no config provided', () => {
      const config = validateRetryConfig();
      expect(config).toEqual(DEFAULT_RETRY_CONFIG);
    });

    it('should merge partial config with defaults', () => {
      const config = validateRetryConfig({ maxRetries: 5 });
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs);
    });

    it('should accept valid custom config', () => {
      const config = validateRetryConfig({
        maxRetries: 5,
        baseDelayMs: 500,
        maxDelayMs: 10000,
        jitterFactor: 0.1,
      });
      expect(config).toEqual({
        maxRetries: 5,
        baseDelayMs: 500,
        maxDelayMs: 10000,
        jitterFactor: 0.1,
      });
    });

    it('should accept zero retries', () => {
      const config = validateRetryConfig({ maxRetries: 0 });
      expect(config.maxRetries).toBe(0);
    });

    it('should throw on negative maxRetries', () => {
      expect(() => validateRetryConfig({ maxRetries: -1 })).toThrow(
        'maxRetries must be a non-negative integer'
      );
    });

    it('should throw on non-integer maxRetries', () => {
      expect(() => validateRetryConfig({ maxRetries: 2.5 })).toThrow(
        'maxRetries must be a non-negative integer'
      );
    });

    it('should throw on negative baseDelayMs', () => {
      expect(() => validateRetryConfig({ baseDelayMs: -100 })).toThrow(
        'baseDelayMs must be non-negative'
      );
    });

    it('should throw when maxDelayMs < baseDelayMs', () => {
      expect(() => validateRetryConfig({ baseDelayMs: 1000, maxDelayMs: 500 })).toThrow(
        'maxDelayMs (500) must be >= baseDelayMs (1000)'
      );
    });

    it('should throw on jitterFactor < 0', () => {
      expect(() => validateRetryConfig({ jitterFactor: -0.1 })).toThrow(
        'jitterFactor must be between 0 and 1'
      );
    });

    it('should throw on jitterFactor > 1', () => {
      expect(() => validateRetryConfig({ jitterFactor: 1.5 })).toThrow(
        'jitterFactor must be between 0 and 1'
      );
    });

    it('should accept edge values for jitterFactor', () => {
      expect(validateRetryConfig({ jitterFactor: 0 }).jitterFactor).toBe(0);
      expect(validateRetryConfig({ jitterFactor: 1 }).jitterFactor).toBe(1);
    });
  });

  describe('calculateBackoffDelay', () => {
    const baseConfig: RetryConfig = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterFactor: 0,
    };

    it('should calculate exponential delays without jitter', () => {
      // 1000 * 2^0 = 1000
      expect(calculateBackoffDelay(0, baseConfig, undefined, () => 0.5)).toBe(1000);
      // 1000 * 2^1 = 2000
      expect(calculateBackoffDelay(1, baseConfig, undefined, () => 0.5)).toBe(2000);
      // 1000 * 2^2 = 4000
      expect(calculateBackoffDelay(2, baseConfig, undefined, () => 0.5)).toBe(4000);
      // 1000 * 2^3 = 8000
      expect(calculateBackoffDelay(3, baseConfig, undefined, () => 0.5)).toBe(8000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config: RetryConfig = { ...baseConfig, maxDelayMs: 5000 };
      // 1000 * 2^4 = 16000, capped to 5000
      expect(calculateBackoffDelay(4, config, undefined, () => 0.5)).toBe(5000);
    });

    it('should apply jitter factor', () => {
      const config: RetryConfig = { ...baseConfig, jitterFactor: 0.2 };

      // With random() = 0, multiplier = 1 - 0.2 + 0 * 0.4 = 0.8
      // delay = 1000 * 0.8 = 800
      expect(calculateBackoffDelay(0, config, undefined, () => 0)).toBe(800);

      // With random() = 0.5, multiplier = 1 - 0.2 + 0.5 * 0.4 = 1.0
      // delay = 1000 * 1.0 = 1000
      expect(calculateBackoffDelay(0, config, undefined, () => 0.5)).toBe(1000);

      // With random() = 1, multiplier = 1 - 0.2 + 1 * 0.4 = 1.2
      // delay = 1000 * 1.2 = 1200
      expect(calculateBackoffDelay(0, config, undefined, () => 1)).toBe(1200);
    });

    it('should use retryAfterMs from rate limit error when available', () => {
      const error = createRateLimitError('Rate limited', { retryAfterMs: 5000 });
      expect(calculateBackoffDelay(0, baseConfig, error)).toBe(5000);
    });

    it('should cap retryAfterMs at maxDelayMs', () => {
      const config: RetryConfig = { ...baseConfig, maxDelayMs: 2000 };
      const error = createRateLimitError('Rate limited', { retryAfterMs: 5000 });
      expect(calculateBackoffDelay(0, config, error)).toBe(2000);
    });

    it('should use exponential backoff when rate limit error has no retryAfterMs', () => {
      const error = createRateLimitError('Rate limited');
      expect(calculateBackoffDelay(0, baseConfig, error, () => 0.5)).toBe(1000);
    });

    it('should use exponential backoff for non-rate-limit errors', () => {
      const error = createTimeoutError('Timeout', 30000);
      expect(calculateBackoffDelay(1, baseConfig, error, () => 0.5)).toBe(2000);
    });
  });

  describe('shouldRetry', () => {
    describe('retryable errors', () => {
      it('should return true for RateLimitError', () => {
        const error = createRateLimitError('Rate limited');
        expect(shouldRetry(error)).toBe(true);
      });

      it('should return true for TimeoutError', () => {
        const error = createTimeoutError('Timeout', 30000);
        expect(shouldRetry(error)).toBe(true);
      });

      it('should return true for NetworkError', () => {
        const error = createNetworkError('Connection failed');
        expect(shouldRetry(error)).toBe(true);
      });

      it('should return true for retryable ModelError', () => {
        const error = createModelError('Transient model failure', true);
        expect(shouldRetry(error)).toBe(true);
      });
    });

    describe('non-retryable errors', () => {
      it('should return false for AuthenticationError', () => {
        const error = createAuthenticationError('Invalid API key', 'claude-code');
        expect(shouldRetry(error)).toBe(false);
      });

      it('should return false for ValidationError', () => {
        const error = createValidationError('Invalid request');
        expect(shouldRetry(error)).toBe(false);
      });

      it('should return false for non-retryable ModelError', () => {
        const error = createModelError('Content policy violation', false);
        expect(shouldRetry(error)).toBe(false);
      });
    });
  });

  describe('withRetry', () => {
    const mockResponse: ModelRouterResponse = {
      content: 'Success!',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };

    const noopSleep = vi.fn().mockResolvedValue(undefined);
    const fixedRandom = (): number => 0.5;

    beforeEach(() => {
      noopSleep.mockClear();
    });

    it('should return success on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue(createSuccessResult(mockResponse));

      const result = await withRetry(operation, { sleep: noopSleep, random: fixedRandom });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('should retry on retryable error and succeed', async () => {
      const error = createRateLimitError('Rate limited');
      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
        random: fixedRandom,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
      expect(noopSleep).toHaveBeenCalledTimes(1);
    });

    it('should not retry on auth error - returns immediately', async () => {
      const error = createAuthenticationError('Invalid key', 'test-provider');
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
        random: fixedRandom,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('AuthenticationError');
      }
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('should not retry on non-retryable model error - returns immediately', async () => {
      const error = createModelError('Content filter violation', false);
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
        random: fixedRandom,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.retryable).toBe(false);
      }
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('should exhaust all retries on persistent transient failure', async () => {
      const error = createNetworkError('Connection failed');
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));

      const result = await withRetry(operation, {
        config: { maxRetries: 2 },
        sleep: noopSleep,
        random: fixedRandom,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.message).toContain('All 3 attempts failed');
        expect(result.error.message).toContain('Connection failed');
      }
      // Initial attempt + 2 retries = 3 calls
      expect(operation).toHaveBeenCalledTimes(3);
      expect(noopSleep).toHaveBeenCalledTimes(2);
    });

    it('should succeed on final retry attempt', async () => {
      const error = createTimeoutError('Timeout', 30000);
      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const result = await withRetry(operation, {
        config: { maxRetries: 2 },
        sleep: noopSleep,
        random: fixedRandom,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use increasing delays with exponential backoff', async () => {
      const error = createRateLimitError('Rate limited');
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));
      const sleepMock = vi.fn().mockResolvedValue(undefined);

      await withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0 },
        sleep: sleepMock,
        random: () => 0.5, // multiplier = 1 with jitter=0
      });

      // Check delays are exponential: 100, 200, 400
      expect(sleepMock).toHaveBeenNthCalledWith(1, 100);
      expect(sleepMock).toHaveBeenNthCalledWith(2, 200);
      expect(sleepMock).toHaveBeenNthCalledWith(3, 400);
    });

    it('should call onRetry callback with correct info', async () => {
      const error = createNetworkError('Connection failed');
      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const onRetry = vi.fn();

      await withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 1000, jitterFactor: 0 },
        sleep: noopSleep,
        random: () => 0.5,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      const info = onRetry.mock.calls[0]?.[0] as RetryAttemptInfo;
      expect(info.attempt).toBe(2);
      expect(info.totalAttempts).toBe(4);
      expect(info.delayMs).toBe(1000);
      expect(info.previousError).toEqual(error);
    });

    it('should work with zero retries (no retries)', async () => {
      const error = createNetworkError('Connection failed');
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));

      const result = await withRetry(operation, {
        config: { maxRetries: 0 },
        sleep: noopSleep,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // With 0 retries, we get the original error (not "retries exhausted")
        // because we only make 1 attempt
        expect(result.error.message).toContain('All 1 attempts failed');
      }
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('should respect retryAfterMs from rate limit error', async () => {
      const error = createRateLimitError('Rate limited', { retryAfterMs: 5000 });
      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const sleepMock = vi.fn().mockResolvedValue(undefined);

      await withRetry(operation, {
        config: { maxRetries: 3, baseDelayMs: 100 },
        sleep: sleepMock,
      });

      // Should use retryAfterMs (5000) instead of exponential (100)
      expect(sleepMock).toHaveBeenCalledWith(5000);
    });
  });

  describe('createRetrier', () => {
    const mockResponse: ModelRouterResponse = {
      content: 'Success!',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };

    it('should create a reusable retrier with default options', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const retrier = createRetrier({
        config: { maxRetries: 2 },
        sleep: noopSleep,
        random: () => 0.5,
      });

      const operation = vi.fn().mockResolvedValue(createSuccessResult(mockResponse));
      const result = await retrier(operation);

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should allow overriding options per call', async () => {
      const defaultOnRetry = vi.fn();
      const callOnRetry = vi.fn();
      const noopSleep = vi.fn().mockResolvedValue(undefined);

      const retrier = createRetrier({
        config: { maxRetries: 5 },
        onRetry: defaultOnRetry,
        sleep: noopSleep,
        random: () => 0.5,
      });

      const error = createNetworkError('Failed');
      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      await retrier(operation, { onRetry: callOnRetry });

      // Should use the call-specific callback
      expect(callOnRetry).toHaveBeenCalledTimes(1);
      expect(defaultOnRetry).not.toHaveBeenCalled();
    });

    it('should merge config options', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const retrier = createRetrier({
        config: { maxRetries: 5, baseDelayMs: 100 },
        sleep: noopSleep,
        random: () => 0.5,
      });

      const error = createNetworkError('Failed');
      const operation = vi.fn().mockResolvedValue(createFailureResult(error));

      // Override maxRetries but keep baseDelayMs
      await retrier(operation, { config: { maxRetries: 1 } });

      // Initial + 1 retry = 2 calls
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('wrapWithRetry', () => {
    const mockResponse: ModelRouterResponse = {
      content: 'Success!',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };

    it('should wrap a method with retry logic', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const error = createRateLimitError('Rate limited');
      const method = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const wrappedMethod = wrapWithRetry(method, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
        random: () => 0.5,
      });

      const request = { modelAlias: 'worker' as const, prompt: 'Hello' };
      const result = await wrappedMethod(request);

      expect(result.success).toBe(true);
      expect(method).toHaveBeenCalledTimes(2);
      expect(method).toHaveBeenCalledWith(request);
    });

    it('should pass request to the wrapped method on each attempt', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const error = createNetworkError('Failed');
      const method = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const wrappedMethod = wrapWithRetry(method, {
        config: { maxRetries: 1 },
        sleep: noopSleep,
        random: () => 0.5,
      });

      const request = { modelAlias: 'architect' as const, prompt: 'Design a system' };
      await wrappedMethod(request);

      expect(method).toHaveBeenCalledTimes(2);
      expect(method).toHaveBeenNthCalledWith(1, request);
      expect(method).toHaveBeenNthCalledWith(2, request);
    });
  });

  describe('integration scenarios', () => {
    const mockResponse: ModelRouterResponse = {
      content: 'Result',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };

    it('rate limit error retries with increasing delay', async () => {
      const sleepMock = vi.fn().mockResolvedValue(undefined);
      const error = createRateLimitError('Rate limited');

      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createFailureResult(error))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const result = await withRetry(operation, {
        config: { maxRetries: 5, baseDelayMs: 1000, jitterFactor: 0 },
        sleep: sleepMock,
        random: () => 0.5,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
      // Verify exponential backoff: 1000, 2000
      expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepMock).toHaveBeenNthCalledWith(2, 2000);
    });

    it('successful retry after transient failure returns response', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const transientError = createNetworkError('Temporary connection issue');

      const operation = vi
        .fn()
        .mockResolvedValueOnce(createFailureResult(transientError))
        .mockResolvedValueOnce(createSuccessResult(mockResponse));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.content).toBe('Result');
      }
    });

    it('auth error does not retry and returns immediately', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const authError = createAuthenticationError('Invalid credentials', 'claude-code');

      const operation = vi.fn().mockResolvedValue(createFailureResult(authError));

      const result = await withRetry(operation, {
        config: { maxRetries: 5 },
        sleep: noopSleep,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('AuthenticationError');
        expect(result.error.message).toBe('Invalid credentials');
      }
      // Should only call once - no retries
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('validation error does not retry', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const validationError = createValidationError('Invalid prompt format');

      const operation = vi.fn().mockResolvedValue(createFailureResult(validationError));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ValidationError');
      }
      expect(operation).toHaveBeenCalledTimes(1);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('permanent model error does not retry', async () => {
      const noopSleep = vi.fn().mockResolvedValue(undefined);
      const modelError = createModelError('Content policy violation', false);

      const operation = vi.fn().mockResolvedValue(createFailureResult(modelError));

      const result = await withRetry(operation, {
        config: { maxRetries: 3 },
        sleep: noopSleep,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.retryable).toBe(false);
      }
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
