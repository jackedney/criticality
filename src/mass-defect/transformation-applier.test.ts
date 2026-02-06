/**
 * Tests for transformation applier with LLM integration.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ModelRouter, ModelRouterResult, StreamChunk } from '../router/types.js';
import { applyTransformation } from './transformation-applier.js';
import type { TransformationType, RiskLevel } from './types.js';

/**
 * Creates a mock ModelRouter.
 */
function createMockRouter(overrides: { response?: string; error?: string }): ModelRouter {
  const mockRouter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async prompt(): Promise<ModelRouterResult> {
      throw new Error('Not implemented');
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async complete(): Promise<ModelRouterResult> {
      if (overrides.error) {
        return {
          success: false,
          error: {
            kind: 'ModelError',
            message: overrides.error,
            retryable: false,
          },
        };
      }

      const response = overrides.response ?? '';
      return {
        success: true,
        response: {
          content: response,
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
          metadata: {
            modelId: 'test-model',
            provider: 'test-provider',
            latencyMs: 100,
          },
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async *stream(): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
      yield {
        content: '',
        done: true,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };
      return {
        success: true,
        response: {
          content: overrides.response ?? '',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
          metadata: {
            modelId: 'test-model',
            provider: 'test-provider',
            latencyMs: 100,
          },
        },
      };
    },
  };

  return mockRouter;
}

/**
 * Creates a test transformation.
 */
function createTransformation(
  patternId: string,
  risk: RiskLevel,
  prompt: string
): TransformationType {
  return {
    patternId,
    smell: 'test-smell',
    risk,
    prompt,
  };
}

describe('transformation-applier', () => {
  describe('applyTransformation', () => {
    it('applies early-return pattern to deeply nested function', async () => {
      const originalCode =
        'function processUser(user: User | null): Result {\n' +
        '  if (user !== null) {\n' +
        '    if (user.isActive) {\n' +
        '      if (user.hasPermission("read")) {\n' +
        '        const data = fetchData(user.id);\n' +
        '        return { success: true, data };\n' +
        '      } else {\n' +
        '        return { success: false, error: "No permission" };\n' +
        '      }\n' +
        '    } else {\n' +
        '      return { success: false, error: "User inactive" };\n' +
        '    }\n' +
        '  } else {\n' +
        '    return { success: false, error: "No user" };\n' +
        '  }\n' +
        '}';

      const transformedCode =
        'function processUser(user: User | null): Result {\n' +
        '  if (user === null) {\n' +
        '    return { success: false, error: "No user" };\n' +
        '  }\n' +
        '  if (!user.isActive) {\n' +
        '    return { success: false, error: "User inactive" };\n' +
        '  }\n' +
        '  if (!user.hasPermission("read")) {\n' +
        '    return { success: false, error: "No permission" };\n' +
        '  }\n' +
        '  const data = fetchData(user.id);\n' +
        '  return { success: true, data };\n' +
        '}';

      const prompt = 'Apply early return pattern';
      const pattern = createTransformation('early-return', 2, prompt);

      const router = createMockRouter({
        response: '```typescript\n' + transformedCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.patternId).toBe('early-return');
      expect(result.originalCode).toBe(originalCode);
      expect(result.transformedCode).toBeDefined();
      expect(result.transformedCode).toContain('if (user === null)');
    });

    it('applies remove-unused-binding to function with unused var', async () => {
      const originalCode =
        'function process(data: string, options: ProcessOptions): Result {\n' +
        '  const config = loadConfig();\n' +
        '  console.log("Processing...");\n' +
        '  return { success: true };\n' +
        '}';

      const transformedCode =
        'function process(data: string, options: ProcessOptions): Result {\n' +
        '  console.log("Processing...");\n' +
        '  return { success: true };\n' +
        '}';

      const prompt = 'Remove unused binding';
      const pattern = createTransformation('remove-unused-binding', 1, prompt);

      const router = createMockRouter({
        response: '```typescript\n' + transformedCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.patternId).toBe('remove-unused-binding');
      expect(result.transformedCode).toBeDefined();
      expect(result.transformedCode).not.toContain('const config = loadConfig();');
    });

    it('returns failure when LLM returns malformed response', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: 'No code block in response',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to extract transformed code');
      expect(result.originalCode).toBe(originalCode);
    });

    it('returns failure when LLM returns unchanged code', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: '```typescript\n' + originalCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transformation had no effect');
      expect(result.originalCode).toBe(originalCode);
    });

    it('returns failure when LLM request fails', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        error: 'LLM API error',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM request failed');
      expect(result.originalCode).toBe(originalCode);
    });

    it('uses worker model for risk level 1', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Remove unused binding';
      const pattern = createTransformation('remove-unused-binding', 1, prompt);

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: '```typescript\nfunction test() { return 2; }\n```',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
      });

      const router: ModelRouter = {
        // eslint-disable-next-line @typescript-eslint/require-await
        prompt: async () =>
          ({
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          }) as ModelRouterResult,
        complete: mockComplete,
        // eslint-disable-next-line @typescript-eslint/require-await
        stream: async function* () {
          yield {
            content: '',
            done: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
          return {
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          } as ModelRouterResult;
        },
      };

      await applyTransformation(originalCode, pattern, router);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          modelAlias: 'worker',
        })
      );
    });

    it('uses worker model for risk level 2', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Apply early return';
      const pattern = createTransformation('early-return', 2, prompt);

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: '```typescript\nfunction test() { return 2; }\n```',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
      });

      const router: ModelRouter = {
        // eslint-disable-next-line @typescript-eslint/require-await
        prompt: async () =>
          ({
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          }) as ModelRouterResult,
        complete: mockComplete,
        // eslint-disable-next-line @typescript-eslint/require-await
        stream: async function* () {
          yield {
            content: '',
            done: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
          return {
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          } as ModelRouterResult;
        },
      };

      await applyTransformation(originalCode, pattern, router);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          modelAlias: 'worker',
        })
      );
    });

    it('uses architect model for risk level 3', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Extract helper';
      const pattern = createTransformation('extract-helper', 3, prompt);

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: '```typescript\nfunction test() { return 2; }\n```',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
      });

      const router: ModelRouter = {
        // eslint-disable-next-line @typescript-eslint/require-await
        prompt: async () =>
          ({
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          }) as ModelRouterResult,
        complete: mockComplete,
        // eslint-disable-next-line @typescript-eslint/require-await
        stream: async function* () {
          yield {
            content: '',
            done: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
          return {
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          } as ModelRouterResult;
        },
      };

      await applyTransformation(originalCode, pattern, router);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          modelAlias: 'architect',
        })
      );
    });

    it('uses architect model for risk level 4', async () => {
      const originalCode = 'function test() { return 1; }';
      const prompt = 'Introduce type alias';
      const pattern = createTransformation('introduce-type-alias', 4, prompt);

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
        response: {
          content: '```typescript\nfunction test() { return 2; }\n```',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
      });

      const router: ModelRouter = {
        // eslint-disable-next-line @typescript-eslint/require-await
        prompt: async () =>
          ({
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          }) as ModelRouterResult,
        complete: mockComplete,
        // eslint-disable-next-line @typescript-eslint/require-await
        stream: async function* () {
          yield {
            content: '',
            done: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
          return {
            success: true,
            response: {
              content: '',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
            },
          } as ModelRouterResult;
        },
      };

      await applyTransformation(originalCode, pattern, router);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          modelAlias: 'architect',
        })
      );
    });

    it('extracts code from markdown block with language identifier', async () => {
      const originalCode = 'function test() { return 1; }';
      const transformedCode = 'function test() { return 2; }';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response:
          'Here is the transformed code:\n\n```typescript\n' +
          transformedCode +
          '\n```\n\nI hope this helps!',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.transformedCode).toBeDefined();
      expect(result.transformedCode).toContain('return 2;');
    });

    it('extracts code from markdown block without language identifier', async () => {
      const originalCode = 'function test() { return 1; }';
      const transformedCode = 'function test() { return 2; }';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: '```\n' + transformedCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.transformedCode).toBeDefined();
    });

    it('preserves JSDoc comments from original function', async () => {
      const originalCode =
        '/**\n * Test function documentation\n */\n' +
        'function test() {\n' +
        '  return 1;\n' +
        '}';

      const transformedCode = 'function test() {\n' + '  return 2;\n' + '}';

      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: '```typescript\n' + transformedCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.transformedCode).toContain('/**');
      expect(result.transformedCode).toContain('Test function documentation');
    });

    it('preserves Micro-Contract comments from original function', async () => {
      const originalCode =
        '/// REQUIRES: data is not null\n' +
        'function test(data: string) {\n' +
        '  return data.length;\n' +
        '}';

      const transformedCode = 'function test(data: string) {\n' + '  return data.length;\n' + '}';

      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: '```typescript\n' + transformedCode + '\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result.success).toBe(true);
      expect(result.transformedCode).toContain('/// REQUIRES');
    });

    it('handles empty code gracefully', async () => {
      const originalCode = '';
      const prompt = 'Apply pattern';
      const pattern = createTransformation('test-pattern', 1, prompt);

      const router = createMockRouter({
        response: '```typescript\nfunction test() { return 1; }\n```',
      });

      const result = await applyTransformation(originalCode, pattern, router);

      expect(result).toBeDefined();
      expect(result.originalCode).toBe('');
    });
  });
});
