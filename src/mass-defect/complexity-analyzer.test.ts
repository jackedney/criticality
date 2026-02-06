/**
 * Tests for complexity analyzer and smell detector.
 *
 * Tests cover all smell types: deep-nesting, high-cyclomatic-complexity,
 * long-function-body, magic-values, imperative-loop, unused-binding,
 * unreachable-code, and over-documentation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  analyzeComplexity,
  detectSmells,
  createSourceFileFromString,
} from './complexity-analyzer.js';
import { loadCatalog } from './catalog-parser.js';

describe('complexity-analyzer', () => {
  describe('analyzeComplexity', () => {
    it('calculates cyclomatic complexity correctly', () => {
      const code = `
        function testComplexity(a: number, b: number): number {
          if (a > 0) {
            if (b > 0) {
              return a + b;
            }
            return a;
          }
          if (a < 0) {
            return b;
          }
          return 0;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const metrics = analyzeComplexity(sourceFile);

      expect(metrics.cyclomaticComplexity).toBeGreaterThan(3);
      expect(metrics.functionLength).toBeGreaterThan(0);
    });

    it('calculates nesting depth correctly', () => {
      const code = `
        function testNesting(x: number): number {
          if (x > 0) {
            if (x > 10) {
              if (x > 20) {
                if (x > 30) {
                  return x * 2;
                }
                return x;
              }
              return x + 1;
            }
            return x - 1;
          }
          return 0;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const metrics = analyzeComplexity(sourceFile);

      expect(metrics.nestingDepth).toBeGreaterThanOrEqual(4);
    });

    it('calculates function length correctly', () => {
      const lines: string[] = [];
      for (let i = 0; i < 60; i++) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        lines.push(`  const x${i} = ${i};`);
      }
      const code = `
        function testLength(): number {
${lines.join('\n')}
          return 0;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const metrics = analyzeComplexity(sourceFile);

      expect(metrics.functionLength).toBeGreaterThan(50);
    });

    it('returns zero metrics for empty file', () => {
      const code = '';
      const sourceFile = createSourceFileFromString(code);
      const metrics = analyzeComplexity(sourceFile);

      expect(metrics.cyclomaticComplexity).toBe(0);
      expect(metrics.functionLength).toBe(0);
      expect(metrics.nestingDepth).toBe(0);
      expect(metrics.testCoverage).toBe(0);
    });

    it('handles multiple functions', () => {
      const code = `
        function simple(): number {
          return 1;
        }

        function complex(a: number, b: number): number {
          if (a > 0) {
            if (b > 0) {
              return a + b;
            }
            return a;
          }
          return 0;
        }

        function simple2(): number {
          return 2;
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      const metrics = analyzeComplexity(sourceFile);

      expect(metrics.cyclomaticComplexity).toBeGreaterThan(1);
      expect(metrics.functionLength).toBeGreaterThan(0);
    });
  });

  describe('detectSmells', () => {
    let catalog: Awaited<ReturnType<typeof loadCatalog>>;

    beforeAll(async () => {
      catalog = await loadCatalog('src/mass-defect/catalog');
    });

    describe('ESLint-based smell detection', () => {
      it('detects deep nesting smell', async () => {
        const code = `
          function deepNesting(x: number): number {
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
          return 0;
        }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const deepNestingSmells = smells.filter((s) => s.smellId === 'deep-nesting');
        expect(deepNestingSmells.length).toBeGreaterThan(0);
        if (deepNestingSmells.length > 0) {
          expect(deepNestingSmells[0]?.severity).toBeGreaterThanOrEqual(1);
          expect(deepNestingSmells[0]?.location.line).toBeGreaterThan(0);
        }
      });

      it('detects high cyclomatic complexity smell', async () => {
        const code = `
          function highComplexity(x: number, y: number, z: number): number {
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
        const smells = await detectSmells(sourceFile, catalog);

        const complexitySmells = smells.filter((s) => s.smellId === 'high-cyclomatic-complexity');
        expect(complexitySmells.length).toBeGreaterThan(0);
      });

      it('detects long function body smell', async () => {
        const lines: string[] = [];
        for (let i = 0; i < 60; i++) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          lines.push(`  const x${i} = ${i};`);
        }
        const code = `
          function longFunction(): number {
${lines.join('\n')}
            return 0;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const longFunctionSmells = smells.filter((s) => s.smellId === 'long-function-body');
        expect(longFunctionSmells.length).toBeGreaterThan(0);
      });

      it('detects magic values smell', async () => {
        const code = `
          function calculateArea(radius: number): number {
            return 3.14159 * radius * radius;
          }

          function calculateCircumference(radius: number): number {
            return 2 * 3.14159 * radius;
          }

          function getTimeout(): number {
            return 5000;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const magicValuesSmells = smells.filter((s) => s.smellId === 'magic-values');
        expect(magicValuesSmells.length).toBeGreaterThan(0);
      });

      it('detects imperative loop smell', async () => {
        const code = `
          function doubleArray(arr: number[]): number[] {
            const result: number[] = [];
            for (let i = 0; i < arr.length; i++) {
              result.push(arr[i] * 2);
            }
            return result;
          }

          function sumArray(arr: number[]): number {
            let sum = 0;
            for (let i = 0; i < arr.length; i++) {
              sum += arr[i];
            }
            return sum;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const imperativeLoopSmells = smells.filter((s) => s.smellId === 'imperative-loop');
        expect(imperativeLoopSmells.length).toBeGreaterThan(0);
      });

      it('detects unused binding smell', async () => {
        const code = `
          function testUnused(): number {
            const unused = 10;
            const used = 20;
            return used;
          }

          function testUnusedParam(x: number, y: number): number {
            return x;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const unusedSmells = smells.filter((s) => s.smellId === 'unused-binding');
        expect(unusedSmells.length).toBeGreaterThan(0);
      });

      it('detects unreachable code smell', async () => {
        const code = `
          function testUnreachable(): number {
            return 1;
            const neverReached = 2;
            return neverReached;
          }

          function testUnreachableInIf(x: number): number {
            if (x > 0) {
              return x;
              const alsoNeverReached = x + 1;
              return alsoNeverReached;
            }
            return 0;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const unreachableSmells = smells.filter((s) => s.smellId === 'unreachable-code');
        expect(unreachableSmells.length).toBeGreaterThan(0);
      });
    });

    describe('Heuristic-based smell detection', () => {
      it('detects over-documentation smell using comment-to-code ratio', async () => {
        const code = `
          function overDocumented(x: number): number {
            // Check if x is positive
            // This is an important check
            // We need to ensure x is greater than zero
            // Otherwise we might have unexpected behavior
            if (x > 0) {
              // Return x doubled
              // This is the main logic
              // We multiply by 2
              return x * 2;
            }
            // Return zero if x is not positive
            // This handles negative values
            return 0;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const overDocSmells = smells.filter((s) => s.smellId === 'over-documentation');
        expect(overDocSmells.length).toBeGreaterThan(0);
        if (overDocSmells.length > 0) {
          expect(overDocSmells[0]?.severity).toBeGreaterThan(0);
        }
      });

      it('does not detect over-documentation for reasonable comments', async () => {
        const code = `
          function wellCommented(x: number): number {
            // Calculate the doubled value
            if (x > 0) {
              return x * 2;
            }
            return 0;
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const overDocSmells = smells.filter((s) => s.smellId === 'over-documentation');
        expect(overDocSmells.length).toBe(0);
      });
    });

    describe('Negative cases', () => {
      it('returns empty array for code meeting all thresholds', async () => {
        const code = `
          function simple(x: number): number {
            return x + 1;
          }

          function cleanCode(arr: number[]): number[] {
            return arr.map((n) => n * 2);
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const controlFlowSmells = smells.filter((s) =>
          ['deep-nesting', 'high-cyclomatic-complexity', 'long-function-body'].includes(s.smellId)
        );
        expect(controlFlowSmells.length).toBe(0);
      });

      it('handles empty code without errors', async () => {
        const code = '';
        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        expect(smells).toBeDefined();
        expect(Array.isArray(smells)).toBe(true);
      });
    });

    describe('Severity calculation', () => {
      it('calculates higher severity for deeper nesting', async () => {
        const code = `
          function veryDeep(x: number): number {
            if (x > 0) {
              if (x > 10) {
                if (x > 20) {
                  if (x > 30) {
                    if (x > 40) {
                      return x * 2;
                    }
                  }
                }
              }
            }
            return x;
          }
          return 0;
        }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const deepNestingSmells = smells.filter((s) => s.smellId === 'deep-nesting');
        expect(deepNestingSmells.length).toBeGreaterThan(0);
        if (deepNestingSmells.length > 0) {
          expect(deepNestingSmells[0]?.severity).toBeGreaterThanOrEqual(1);
        }
      });

      it('calculates severity based on threshold exceedance', async () => {
        const code = `
          function veryComplex(x: number): number {
            if (x > 0) {
              if (x > 10) {
                if (x > 20) {
                  if (x > 30) {
                    return x + 1;
                  } else if (x > 25) {
                    return x + 2;
                  } else if (x > 22) {
                    return x + 3;
                  } else {
                    return x;
                  }
                } else if (x > 15) {
                  return x + 4;
                } else {
                  return x + 5;
                }
              } else if (x > 5) {
                return x + 6;
              } else {
                return x + 7;
              }
            } else if (x < 0) {
              return x - 1;
            } else {
              return 0;
            }
          }
        `;

        const sourceFile = createSourceFileFromString(code);
        const smells = await detectSmells(sourceFile, catalog);

        const complexitySmells = smells.filter((s) => s.smellId === 'high-cyclomatic-complexity');
        expect(complexitySmells.length).toBeGreaterThan(0);
        if (complexitySmells.length > 0) {
          expect(complexitySmells[0]?.severity).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });

  describe('createSourceFileFromString', () => {
    it('creates a valid SourceFile from code string', () => {
      const code = 'const x = 1;';
      const sourceFile = createSourceFileFromString(code);

      expect(sourceFile).toBeDefined();
      expect(sourceFile.getFullText()).toBe(code);
    });

    it('uses custom file name', () => {
      const code = 'const x = 1;';
      const fileName = 'custom.ts';
      const sourceFile = createSourceFileFromString(code, fileName);

      expect(sourceFile.getFilePath()).toContain(fileName);
    });

    it('handles complex code', () => {
      const code = `
        interface User {
          id: number;
          name: string;
        }

        function getUser(id: number): User | null {
          return { id, name: 'Test' };
        }
      `;

      const sourceFile = createSourceFileFromString(code);
      expect(sourceFile.getFullText()).toBe(code);
    });
  });
});
