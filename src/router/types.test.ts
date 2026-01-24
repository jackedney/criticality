/**
 * Tests for Model Router types.
 *
 * Verifies type safety, error handling, and interface contracts.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  type ModelAlias,
  type ModelRouter,
  type ModelRouterRequest,
  type ModelRouterResponse,
  type ModelRouterResult,
  type StreamChunk,
  MODEL_ALIASES,
  ERROR_KINDS,
  isValidModelAlias,
  isModelRouterError,
  isRetryableError,
  createRateLimitError,
  createAuthenticationError,
  createModelError,
  createTimeoutError,
  createNetworkError,
  createValidationError,
  createSuccessResult,
  createFailureResult,
} from './types.js';

describe('ModelAlias', () => {
  it('includes all expected aliases', () => {
    expect(MODEL_ALIASES).toContain('architect');
    expect(MODEL_ALIASES).toContain('auditor');
    expect(MODEL_ALIASES).toContain('structurer');
    expect(MODEL_ALIASES).toContain('worker');
    expect(MODEL_ALIASES).toContain('fallback');
    expect(MODEL_ALIASES).toHaveLength(5);
  });

  describe('isValidModelAlias', () => {
    it('returns true for valid aliases', () => {
      for (const alias of MODEL_ALIASES) {
        expect(isValidModelAlias(alias)).toBe(true);
      }
    });

    it('returns false for invalid aliases', () => {
      expect(isValidModelAlias('invalid')).toBe(false);
      expect(isValidModelAlias('')).toBe(false);
      expect(isValidModelAlias('ARCHITECT')).toBe(false);
    });

    it('property: all MODEL_ALIASES are valid', () => {
      fc.assert(
        fc.property(fc.constantFrom(...MODEL_ALIASES), (alias) => {
          return isValidModelAlias(alias);
        })
      );
    });

    it('property: random strings are likely invalid', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !MODEL_ALIASES.includes(s as ModelAlias)),
          (str) => {
            return !isValidModelAlias(str);
          }
        )
      );
    });
  });
});

describe('ModelRouterRequest', () => {
  it('can be created with minimal fields', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt: 'Hello, world!',
    };
    expect(request.modelAlias).toBe('worker');
    expect(request.prompt).toBe('Hello, world!');
    expect(request.parameters).toBeUndefined();
    expect(request.requestId).toBeUndefined();
  });

  it('can be created with all fields', () => {
    const request: ModelRouterRequest = {
      modelAlias: 'architect',
      prompt: 'Design a system',
      parameters: {
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        stopSequences: ['END'],
        systemPrompt: 'You are a helpful assistant',
      },
      requestId: 'req-123',
    };
    expect(request.parameters?.maxTokens).toBe(1000);
    expect(request.parameters?.temperature).toBe(0.7);
    expect(request.requestId).toBe('req-123');
  });
});

describe('ModelRouterResponse', () => {
  it('can be created with all required fields', () => {
    const response: ModelRouterResponse = {
      content: 'Generated text',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      metadata: {
        modelId: 'claude-3-opus',
        provider: 'claude-code',
        latencyMs: 150,
      },
    };
    expect(response.content).toBe('Generated text');
    expect(response.usage.totalTokens).toBe(30);
    expect(response.metadata.provider).toBe('claude-code');
  });

  it('can include optional requestId', () => {
    const response: ModelRouterResponse = {
      content: 'Response',
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      metadata: { modelId: 'model', provider: 'provider', latencyMs: 100 },
      requestId: 'req-456',
    };
    expect(response.requestId).toBe('req-456');
  });
});

describe('ModelRouterError', () => {
  describe('createRateLimitError', () => {
    it('creates error with minimal fields', () => {
      const error = createRateLimitError('Rate limited');
      expect(error.kind).toBe('RateLimitError');
      expect(error.message).toBe('Rate limited');
      expect(error.retryable).toBe(true);
    });

    it('creates error with all optional fields', () => {
      const cause = new Error('underlying');
      const request: ModelRouterRequest = { modelAlias: 'worker', prompt: 'test' };
      const error = createRateLimitError('Rate limited', {
        retryAfterMs: 5000,
        cause,
        request,
      });
      expect(error.retryAfterMs).toBe(5000);
      expect(error.cause).toBe(cause);
      expect(error.request).toBe(request);
    });
  });

  describe('createAuthenticationError', () => {
    it('creates error with required fields', () => {
      const error = createAuthenticationError('Auth failed', 'claude-code');
      expect(error.kind).toBe('AuthenticationError');
      expect(error.message).toBe('Auth failed');
      expect(error.provider).toBe('claude-code');
      expect(error.retryable).toBe(false);
    });
  });

  describe('createModelError', () => {
    it('creates retryable error', () => {
      const error = createModelError('Model overloaded', true);
      expect(error.kind).toBe('ModelError');
      expect(error.retryable).toBe(true);
    });

    it('creates non-retryable error', () => {
      const error = createModelError('Content filtered', false, {
        errorCode: 'CONTENT_FILTER',
        modelId: 'claude-3-opus',
      });
      expect(error.retryable).toBe(false);
      expect(error.errorCode).toBe('CONTENT_FILTER');
      expect(error.modelId).toBe('claude-3-opus');
    });
  });

  describe('createTimeoutError', () => {
    it('creates error with timeout', () => {
      const error = createTimeoutError('Request timed out', 30000);
      expect(error.kind).toBe('TimeoutError');
      expect(error.timeoutMs).toBe(30000);
      expect(error.retryable).toBe(true);
    });
  });

  describe('createNetworkError', () => {
    it('creates error with endpoint', () => {
      const error = createNetworkError('Connection failed', {
        endpoint: 'https://api.example.com',
      });
      expect(error.kind).toBe('NetworkError');
      expect(error.endpoint).toBe('https://api.example.com');
      expect(error.retryable).toBe(true);
    });
  });

  describe('createValidationError', () => {
    it('creates error with invalid fields', () => {
      const error = createValidationError('Invalid request', {
        invalidFields: ['prompt', 'modelAlias'],
      });
      expect(error.kind).toBe('ValidationError');
      expect(error.invalidFields).toEqual(['prompt', 'modelAlias']);
      expect(error.retryable).toBe(false);
    });
  });

  describe('isModelRouterError', () => {
    it('returns true for valid errors', () => {
      expect(isModelRouterError(createRateLimitError('test'))).toBe(true);
      expect(isModelRouterError(createAuthenticationError('test', 'p'))).toBe(true);
      expect(isModelRouterError(createModelError('test', true))).toBe(true);
      expect(isModelRouterError(createTimeoutError('test', 1000))).toBe(true);
      expect(isModelRouterError(createNetworkError('test'))).toBe(true);
      expect(isModelRouterError(createValidationError('test'))).toBe(true);
    });

    it('returns false for non-errors', () => {
      expect(isModelRouterError(null)).toBe(false);
      expect(isModelRouterError(undefined)).toBe(false);
      expect(isModelRouterError('string')).toBe(false);
      expect(isModelRouterError(123)).toBe(false);
      expect(isModelRouterError({})).toBe(false);
      expect(isModelRouterError({ kind: 'Unknown', message: 'test' })).toBe(false);
    });

    it('property: all error kinds are recognized', () => {
      fc.assert(
        fc.property(fc.constantFrom(...ERROR_KINDS), (kind) => {
          const error = { kind, message: 'test' };
          return isModelRouterError(error);
        })
      );
    });
  });

  describe('isRetryableError', () => {
    it('correctly identifies retryable errors', () => {
      expect(isRetryableError(createRateLimitError('test'))).toBe(true);
      expect(isRetryableError(createTimeoutError('test', 1000))).toBe(true);
      expect(isRetryableError(createNetworkError('test'))).toBe(true);
      expect(isRetryableError(createModelError('test', true))).toBe(true);
    });

    it('correctly identifies non-retryable errors', () => {
      expect(isRetryableError(createAuthenticationError('test', 'p'))).toBe(false);
      expect(isRetryableError(createValidationError('test'))).toBe(false);
      expect(isRetryableError(createModelError('test', false))).toBe(false);
    });
  });
});

describe('ModelRouterResult', () => {
  describe('createSuccessResult', () => {
    it('creates success result', () => {
      const response: ModelRouterResponse = {
        content: 'Hello',
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        metadata: { modelId: 'model', provider: 'provider', latencyMs: 100 },
      };
      const result = createSuccessResult(response);
      expect(result.success).toBe(true);
      expect(result.response).toBe(response);
    });
  });

  describe('createFailureResult', () => {
    it('creates failure result', () => {
      const error = createRateLimitError('Rate limited');
      const result = createFailureResult(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  it('result type narrowing works correctly', () => {
    const successResult = createSuccessResult({
      content: 'test',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      metadata: { modelId: 'm', provider: 'p', latencyMs: 1 },
    });

    const failureResult = createFailureResult(createRateLimitError('test'));

    // Verify success result properties
    expect(successResult.success).toBe(true);
    expect(successResult.response.content).toBe('test');

    // Verify failure result properties
    expect(failureResult.success).toBe(false);
    expect(failureResult.error.kind).toBe('RateLimitError');
  });
});

describe('StreamChunk', () => {
  it('can represent intermediate chunk', () => {
    const chunk: StreamChunk = {
      content: 'partial',
      done: false,
    };
    expect(chunk.done).toBe(false);
    expect(chunk.usage).toBeUndefined();
  });

  it('can represent final chunk with usage', () => {
    const chunk: StreamChunk = {
      content: 'final',
      done: true,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
      },
    };
    expect(chunk.done).toBe(true);
    expect(chunk.usage?.promptTokens).toBe(10);
  });
});

describe('ModelRouter interface', () => {
  it('can be implemented by any backend', () => {
    // This test verifies that the interface can be implemented.
    // A mock implementation demonstrates the contract.
    const mockRouter: ModelRouter = {
      prompt(_modelAlias: ModelAlias, _prompt: string): Promise<ModelRouterResult> {
        return Promise.resolve(
          createSuccessResult({
            content: 'response',
            usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
            metadata: { modelId: 'mock', provider: 'test', latencyMs: 50 },
          })
        );
      },

      complete(_request: ModelRouterRequest): Promise<ModelRouterResult> {
        return Promise.resolve(
          createSuccessResult({
            content: 'response',
            usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
            metadata: { modelId: 'mock', provider: 'test', latencyMs: 50 },
          })
        );
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async *stream(
        _request: ModelRouterRequest
      ): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
        yield { content: 'chunk1', done: false };
        yield { content: 'chunk2', done: false };
        return createSuccessResult({
          content: 'chunk1chunk2',
          usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
          metadata: { modelId: 'mock', provider: 'test', latencyMs: 100 },
        });
      },
    };

    // Verify the mock implements the interface correctly
    expect(typeof mockRouter.prompt).toBe('function');
    expect(typeof mockRouter.complete).toBe('function');
    expect(typeof mockRouter.stream).toBe('function');
  });

  it('implementation with correct types compiles', async () => {
    // Create a class implementation to verify interface compatibility
    class TestRouter implements ModelRouter {
      prompt(modelAlias: ModelAlias, prompt: string): Promise<ModelRouterResult> {
        return Promise.resolve(
          createSuccessResult({
            content: `Response to ${prompt} from ${modelAlias}`,
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 1 },
          })
        );
      }

      complete(request: ModelRouterRequest): Promise<ModelRouterResult> {
        return this.prompt(request.modelAlias, request.prompt);
      }

      async *stream(
        request: ModelRouterRequest
      ): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
        yield { content: 'streaming...', done: false };
        const result = await this.prompt(request.modelAlias, request.prompt);
        return result;
      }
    }

    const router = new TestRouter();
    const result = await router.prompt('worker', 'Hello');

    expect(result.success).toBe(true);
    const successResult = result as Extract<ModelRouterResult, { success: true }>;
    expect(successResult.response.content).toContain('Hello');
    expect(successResult.response.content).toContain('worker');
  });

  // The following test demonstrates that TypeScript catches missing methods.
  // This is a compile-time check, so we verify the type system works by
  // showing that a correctly typed implementation works.
  it('negative case: TypeScript enforces interface contract', () => {
    // This test documents that implementations missing required methods
    // will fail type checking at compile time.
    //
    // The following code would cause a TypeScript error if uncommented:
    //
    // const incompleteRouter: ModelRouter = {
    //   prompt() { return Promise.resolve(createSuccessResult({...})); },
    //   // Missing: complete, stream
    // };
    //
    // TypeScript error: Property 'complete' is missing in type...
    // TypeScript error: Property 'stream' is missing in type...

    // Instead, we verify that a complete implementation works
    const completeRouter: ModelRouter = {
      prompt: () =>
        Promise.resolve(
          createSuccessResult({
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            metadata: { modelId: '', provider: '', latencyMs: 0 },
          })
        ),
      complete: () =>
        Promise.resolve(
          createSuccessResult({
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            metadata: { modelId: '', provider: '', latencyMs: 0 },
          })
        ),
      // eslint-disable-next-line @typescript-eslint/require-await, require-yield
      stream: async function* () {
        return createSuccessResult({
          content: '',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          metadata: { modelId: '', provider: '', latencyMs: 0 },
        });
      },
    };

    // If we can assign to ModelRouter, the interface is satisfied
    expect(completeRouter).toBeDefined();
    expect(typeof completeRouter.prompt).toBe('function');
    expect(typeof completeRouter.complete).toBe('function');
    expect(typeof completeRouter.stream).toBe('function');
  });
});

describe('ERROR_KINDS constant', () => {
  it('includes all expected error kinds', () => {
    expect(ERROR_KINDS).toContain('RateLimitError');
    expect(ERROR_KINDS).toContain('AuthenticationError');
    expect(ERROR_KINDS).toContain('ModelError');
    expect(ERROR_KINDS).toContain('TimeoutError');
    expect(ERROR_KINDS).toContain('NetworkError');
    expect(ERROR_KINDS).toContain('ValidationError');
    expect(ERROR_KINDS).toHaveLength(6);
  });
});
