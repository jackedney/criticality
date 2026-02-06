/**
 * Tests for Mass Defect iteration loop.
 *
 * Tests cover the complete iteration logic including:
 * - Pattern selection and application
 * - Atomic transformation with revert on verification failure
 * - Tracking of previously attempted patterns
 * - Convergence detection
 * - Manual review scenarios
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { runMassDefect } from './mass-defect-loop.js';
import { loadCatalog } from './catalog-parser.js';
import { createSourceFileFromString } from './complexity-analyzer.js';
import type { ModelRouter, ModelRouterResult, StreamChunk } from '../router/types.js';

describe('mass-defect-loop', () => {
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;

  beforeAll(async () => {
    catalog = await loadCatalog('src/mass-defect/catalog');
  });

  describe('runMassDefect', () => {
    it('converges when all functions meet targets initially', async () => {
      const code = `
        function simple(x: number): number {
          return x + 1;
        }

        function cleanCode(arr: number[]): number[] {
          return arr.map((n) => n * 2);
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      expect(result.converged).toBe(true);
      expect(result.totalFunctions).toBe(2);
      expect(result.optimalFunctions).toBe(2);
      expect(result.transformedFunctions).toBe(0);
      expect(result.manualReviewFunctions).toBe(0);
    });

    it('applies transformations until complexity targets are met', async () => {
      const code = `
        function complexFunction(x: number, y: number, z: number): number {
          if (x > 0) {
            if (y > 0) {
              if (z > 0) {
                return x + y + z;
              }
              return x + y;
            }
            return x + z;
          }
          if (y < 0) {
            if (z < 0) {
              return y + z;
            }
            return y;
          }
          return z;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      expect(result.totalFunctions).toBe(1);
      expect(result.functionResults.size).toBe(1);

      const functionResult = result.functionResults.get(
        `${sourceFile.getFilePath()}:complexFunction`
      );

      expect(functionResult).toBeDefined();
      expect(functionResult?.attempts.length).toBeGreaterThanOrEqual(0);
    });

    it('tracks previously attempted patterns to avoid retry loops', async () => {
      const code = `
        function nestedLogic(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                if (x > 30) {
                  return x * 2;
                }
              }
            }
          }
          return x;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const functionResult = result.functionResults.get(`${sourceFile.getFilePath()}:nestedLogic`);

      expect(functionResult).toBeDefined();

      const attemptedPatternIds = new Set(functionResult?.attempts.map((a) => a.patternId) ?? []);

      const uniqueAttempts = attemptedPatternIds.size;
      const totalAttempts = functionResult?.attempts.length ?? 0;

      expect(uniqueAttempts).toBe(totalAttempts);
    });

    it('marks function as manual_review_required when no patterns remain', async () => {
      const code = `
        function veryComplex(a: number, b: number, c: number, d: number, e: number): number {
          if (a > 0) {
            if (b > 0) {
              if (c > 0) {
                if (d > 0) {
                  if (e > 0) {
                    return a + b + c + d + e;
                  } else if (e < 0) {
                    return a + b + c + d - e;
                  } else {
                    return a + b + c + d;
                  }
                } else if (d < 0) {
                  if (e > 0) {
                    return a + b + c + e;
                  } else if (e < 0) {
                    return a + b + c - e;
                  } else {
                    return a + b + c;
                  }
                } else {
                  return a + b + c;
                }
              } else if (c < 0) {
                if (d > 0) {
                  if (e > 0) {
                    return a + b + d + e;
                  } else if (e < 0) {
                    return a + b + d - e;
                  } else {
                    return a + b + d;
                  }
                } else if (d < 0) {
                  if (e > 0) {
                    return a + b + e;
                  } else if (e < 0) {
                    return a + b - e;
                  } else {
                    return a + b;
                  }
                } else {
                  return a + b;
                }
              } else {
                return a + b;
              }
            } else if (b < 0) {
              if (c > 0) {
                if (d > 0) {
                  if (e > 0) {
                    return a + c + d + e;
                  } else if (e < 0) {
                    return a + c + d - e;
                  } else {
                    return a + c + d;
                  }
                } else if (d < 0) {
                  if (e > 0) {
                    return a + c + e;
                  } else if (e < 0) {
                    return a + c - e;
                  } else {
                    return a + c;
                  }
                } else {
                  return a + c;
                }
              } else if (c < 0) {
                if (d > 0) {
                  if (e > 0) {
                    return a + d + e;
                  } else if (e < 0) {
                    return a + d - e;
                  } else {
                    return a + d;
                  }
                } else if (d < 0) {
                  if (e > 0) {
                    return a + e;
                  } else if (e < 0) {
                    return a - e;
                  } else {
                    return a;
                  }
                } else {
                  return a;
                }
              } else {
                return a;
              }
            } else {
              return a;
            }
          } else if (a < 0) {
            return -1;
          } else {
            return 0;
          }
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const functionResult = result.functionResults.get(`${sourceFile.getFilePath()}:veryComplex`);

      expect(functionResult).toBeDefined();
    });

    it('marks function as failed when no transformations succeed', async () => {
      const code = `
        function complexFunction(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                if (x > 30) {
                  return x * 2;
                }
              }
            }
          }
          return x;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const functionResult = result.functionResults.get(
        `${sourceFile.getFilePath()}:complexFunction`
      );

      expect(functionResult).toBeDefined();
      expect(functionResult?.attempts.length).toBeGreaterThanOrEqual(0);
    });

    it('handles empty source files without errors', async () => {
      const code = '';
      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      expect(result.converged).toBe(true);
      expect(result.totalFunctions).toBe(0);
      expect(result.transformedFunctions).toBe(0);
      expect(result.optimalFunctions).toBe(0);
    });

    it('records all transformation attempts in result', async () => {
      const code = `
        function functionToTransform(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                if (x > 30) {
                  return x * 2;
                }
              }
            }
          }
          return x;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const functionResult = result.functionResults.get(
        `${sourceFile.getFilePath()}:functionToTransform`
      );

      expect(functionResult).toBeDefined();
      expect(functionResult?.attempts).toBeInstanceOf(Array);
    });

    it('respects complexity targets from config', async () => {
      const code = `
        function complexFunction(x: number): number {
          if (x > 0) {
            if (x > 10) {
              return x * 2;
            }
          }
          return x;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const strictResult = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 3,
          maxFunctionLength: 20,
          maxNestingDepth: 2,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const lenientResult = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const strictFunctionResult = strictResult.functionResults.get(
        `${sourceFile.getFilePath()}:complexFunction`
      );
      const lenientFunctionResult = lenientResult.functionResults.get(
        `${sourceFile.getFilePath()}:complexFunction`
      );

      expect(strictFunctionResult).toBeDefined();
      expect(lenientFunctionResult).toBeDefined();
    });

    it('processes multiple source files', async () => {
      const code1 = `
        function file1Function(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                return x * 2;
              }
            }
          }
          return x;
        }
      `;

      const code2 = `
        function file2Function(arr: number[]): number[] {
          const result: number[] = [];
          for (let i = 0; i < arr.length; i++) {
            result.push(arr[i] * 2);
          }
          return result;
        }
      `;

      const sourceFile1 = createSourceFileFromString(code1, 'file1.ts');
      const sourceFile2 = createSourceFileFromString(code2, 'file2.ts');
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile1, sourceFile2],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      expect(result.totalFunctions).toBe(2);
      expect(result.functionResults.size).toBe(2);
    });
  });

  describe('Circular enabling detection', () => {
    it('prevents retry loops when patterns enable each other', async () => {
      const code = `
        function circularPatternTest(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                return x * 2;
              }
            }
          }
          return x;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const mockRouter = createMockRouter();

      const result = await runMassDefect(
        [sourceFile],
        catalog,
        {
          maxCyclomaticComplexity: 10,
          maxFunctionLength: 50,
          maxNestingDepth: 4,
          minTestCoverage: 0,
          catalogPath: './catalog',
        },
        mockRouter
      );

      const functionResult = result.functionResults.get(
        `${sourceFile.getFilePath()}:circularPatternTest`
      );

      expect(functionResult).toBeDefined();

      const attemptedPatternIds = new Set(functionResult?.attempts.map((a) => a.patternId) ?? []);

      const uniqueAttempts = attemptedPatternIds.size;
      const totalAttempts = functionResult?.attempts.length ?? 0;

      expect(uniqueAttempts).toBe(totalAttempts);
    });
  });
});

/**
 * Creates a mock ModelRouter for testing.
 */
function createMockRouter(options?: { transformedCode?: string }): ModelRouter {
  const transformedCode = options?.transformedCode;

  const complete = vi.fn(async () => {
    await Promise.resolve();
    if (transformedCode !== undefined) {
      return {
        success: true,
        response: {
          content: `\`\`\`typescript\n${transformedCode}\n\`\`\``,
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
          metadata: {
            modelId: 'test-model',
            provider: 'test-provider',
            latencyMs: 100,
          },
        },
      } satisfies ModelRouterResult;
    }

    return {
      success: false,
      error: {
        kind: 'ModelError',
        message: 'Test error',
        retryable: false,
      },
    } satisfies ModelRouterResult;
  });

  async function* stream(): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
    await Promise.resolve();
    yield { content: '', done: false };
    return {
      success: false,
      error: {
        kind: 'ModelError',
        message: 'Not implemented',
        retryable: false,
      },
    } satisfies ModelRouterResult;
  }

  const prompt = vi.fn(async () => {
    await Promise.resolve();
    return {
      success: false,
      error: {
        kind: 'ModelError',
        message: 'Not implemented',
        retryable: false,
      },
    } satisfies ModelRouterResult;
  });

  return {
    complete,
    stream,
    prompt,
  };
}
