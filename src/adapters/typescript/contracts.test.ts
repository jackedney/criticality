/**
 * Tests for the JSDoc contract parser module.
 *
 * @module adapters/typescript/contracts.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Project } from 'ts-morph';
import { parseContracts, ContractSyntaxError } from './contracts.js';

describe('parseContracts', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        target: 99, // ESNext
        module: 199, // NodeNext
      },
    });
  });

  afterEach(() => {
    // Clean up any source files
    for (const sourceFile of project.getSourceFiles()) {
      project.removeSourceFile(sourceFile);
    }
  });

  describe('@requires tag parsing', () => {
    it('parses single @requires tag', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x > 0
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('sqrt');
      expect(contracts[0]?.requires).toEqual(['x > 0']);
    });

    it('parses multiple @requires tags', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x >= 0
         * @requires y !== 0
         */
        function divide(x: number, y: number): number {
          return x / y;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.requires).toEqual(['x >= 0', 'y !== 0']);
    });

    it('parses complex @requires expressions', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires arr.length > 0 && arr.every(x => x !== null)
         */
        function processArray(arr: number[]): number {
          return arr[0]!;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.requires).toEqual(['arr.length > 0 && arr.every(x => x !== null)']);
    });
  });

  describe('@ensures tag parsing', () => {
    it('parses single @ensures tag', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @ensures result !== null
         */
        function findUser(id: string): string | null {
          return id;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.ensures).toEqual(['result !== null']);
    });

    it('parses multiple @ensures tags', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @ensures result >= 0
         * @ensures result * result === x
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.ensures).toEqual(['result >= 0', 'result * result === x']);
    });
  });

  describe('@invariant tag parsing', () => {
    it('parses single @invariant tag', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Account {
          /**
           * @invariant this.balance >= 0
           */
          withdraw(amount: number): void {
            // implementation
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('withdraw');
      expect(contracts[0]?.invariants).toEqual(['this.balance >= 0']);
    });

    it('parses multiple @invariant tags', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Buffer {
          /**
           * @invariant this.size >= 0
           * @invariant this.size <= this.capacity
           */
          resize(newSize: number): void {
            // implementation
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.invariants).toEqual(['this.size >= 0', 'this.size <= this.capacity']);
    });
  });

  describe('@complexity tag parsing', () => {
    it('parses @complexity O(n)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity O(n)
         */
        function linearSearch(arr: number[], target: number): number {
          return arr.indexOf(target);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.complexity).toBe('O(n)');
    });

    it('parses @complexity O(n log n)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity O(n log n)
         */
        function sort(arr: number[]): number[] {
          return [...arr].sort((a, b) => a - b);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.complexity).toBe('O(n log n)');
    });

    it('parses @complexity O(1)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity O(1)
         */
        function getFirst(arr: number[]): number {
          return arr[0]!;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.complexity).toBe('O(1)');
    });

    it('parses @complexity O(n^2)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity O(n^2)
         */
        function bubbleSort(arr: number[]): number[] {
          return arr;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.complexity).toBe('O(n^2)');
    });
  });

  describe('@purity tag parsing', () => {
    it('parses @purity pure', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity pure
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.purity).toBe('pure');
    });

    it('parses @purity reads', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity reads
         */
        function getConfig(): string {
          return process.env.CONFIG ?? '';
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.purity).toBe('reads');
    });

    it('parses @purity writes', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity writes
         */
        function setConfig(value: string): void {
          // write to config
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.purity).toBe('writes');
    });

    it('parses @purity io', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity io
         */
        async function fetchData(): Promise<string> {
          return '';
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.purity).toBe('io');
    });

    it('normalizes purity to lowercase', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity PURE
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.purity).toBe('pure');
    });
  });

  describe('CLAIM_REF extraction', () => {
    it('extracts single CLAIM_REF', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * CLAIM_REF: inv_001
         */
        function withdraw(amount: number): void {
          // implementation
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toEqual(['inv_001']);
    });

    it('extracts multiple CLAIM_REFs', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * CLAIM_REF: inv_001
         * CLAIM_REF: behavior_002
         */
        function transfer(amount: number): void {
          // implementation
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.claimRefs).toEqual(['inv_001', 'behavior_002']);
    });

    it('extracts CLAIM_REF without space', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * CLAIM_REF:perf_001
         */
        function lookup(key: string): string | undefined {
          return undefined;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.claimRefs).toEqual(['perf_001']);
    });
  });

  describe('combined contracts', () => {
    it('parses all contract elements together', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * Transfers money between accounts.
         * @requires amount > 0
         * @requires from.balance >= amount
         * @ensures result === true
         * @ensures to.balance > old_to_balance
         * @invariant from.balance >= 0
         * @invariant to.balance >= 0
         * @complexity O(1)
         * @purity writes
         * CLAIM_REF: inv_001
         * CLAIM_REF: behavior_002
         */
        function transfer(from: Account, to: Account, amount: number): boolean {
          return true;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      const contract = contracts[0];
      expect(contract).toBeDefined();
      expect(contract?.functionName).toBe('transfer');
      expect(contract?.requires).toEqual(['amount > 0', 'from.balance >= amount']);
      expect(contract?.ensures).toEqual(['result === true', 'to.balance > old_to_balance']);
      expect(contract?.invariants).toEqual(['from.balance >= 0', 'to.balance >= 0']);
      expect(contract?.complexity).toBe('O(1)');
      expect(contract?.purity).toBe('writes');
      expect(contract?.claimRefs).toEqual(['inv_001', 'behavior_002']);
    });
  });

  describe('example from acceptance criteria', () => {
    it('correctly extracts @requires x > 0 @ensures result > x', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x > 0
         * @ensures result > x
         */
        function increment(x: number): number {
          return x + 1;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.requires).toEqual(['x > 0']);
      expect(contracts[0]?.ensures).toEqual(['result > x']);
    });

    it('correctly extracts @complexity O(n log n)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity O(n log n)
         */
        function mergeSort(arr: number[]): number[] {
          return arr;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.complexity).toBe('O(n log n)');
    });
  });

  describe('negative cases - malformed contracts', () => {
    it('throws ContractSyntaxError for @requires without expression', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@requires without expression');
    });

    it('throws ContractSyntaxError for @ensures without expression', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @ensures
         */
        function findUser(id: string): string | null {
          return id;
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@ensures without expression');
    });

    it('throws ContractSyntaxError for @invariant without expression', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Account {
          /**
           * @invariant
           */
          withdraw(amount: number): void {
            // implementation
          }
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@invariant without expression');
    });

    it('throws ContractSyntaxError for @complexity without value', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @complexity
         */
        function search(arr: number[], target: number): number {
          return arr.indexOf(target);
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@complexity without expression');
    });

    it('throws ContractSyntaxError for @purity without value', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@purity without expression');
    });

    it('throws ContractSyntaxError for invalid @purity value', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @purity invalid
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('Invalid @purity value');
      expect(() => parseContracts(project, 'test.ts')).toThrow(
        'Must be one of: pure, reads, writes, io'
      );
    });

    it('ContractSyntaxError includes line number', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }
      `
      );

      try {
        parseContracts(project, 'test.ts');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContractSyntaxError);
        const err = error as ContractSyntaxError;
        expect(err.lineNumber).toBeGreaterThan(0);
        expect(err.tagName).toBe('requires');
      }
    });
  });

  describe('unknown tags are ignored', () => {
    it('ignores @foobar tag (not an error)', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x > 0
         * @foobar something
         * @ensures result > 0
         */
        function process(x: number): number {
          return x + 1;
        }
      `
      );

      // Should not throw
      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.requires).toEqual(['x > 0']);
      expect(contracts[0]?.ensures).toEqual(['result > 0']);
    });

    it('ignores standard JSDoc tags like @param, @returns', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * Description of the function.
         * @param x - The input value
         * @returns The result value
         * @requires x > 0
         */
        function process(x: number): number {
          return x + 1;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.requires).toEqual(['x > 0']);
    });
  });

  describe('multiple functions in one file', () => {
    it('parses contracts from multiple functions', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x >= 0
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }

        /**
         * @ensures result !== null
         */
        function findUser(id: string): string | null {
          return id;
        }

        /**
         * @complexity O(n)
         */
        function search(arr: number[], target: number): number {
          return arr.indexOf(target);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(3);

      const sqrtContract = contracts.find((c) => c.functionName === 'sqrt');
      expect(sqrtContract?.requires).toEqual(['x >= 0']);

      const findUserContract = contracts.find((c) => c.functionName === 'findUser');
      expect(findUserContract?.ensures).toEqual(['result !== null']);

      const searchContract = contracts.find((c) => c.functionName === 'search');
      expect(searchContract?.complexity).toBe('O(n)');
    });
  });

  describe('class methods', () => {
    it('parses contracts from class methods', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Calculator {
          /**
           * @requires y !== 0
           */
          divide(x: number, y: number): number {
            return x / y;
          }

          /**
           * @purity pure
           */
          add(x: number, y: number): number {
            return x + y;
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(2);

      const divideContract = contracts.find((c) => c.functionName === 'divide');
      expect(divideContract?.requires).toEqual(['y !== 0']);

      const addContract = contracts.find((c) => c.functionName === 'add');
      expect(addContract?.purity).toBe('pure');
    });
  });

  describe('arrow functions', () => {
    it('parses contracts from arrow functions assigned to variables', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x > 0
         * @purity pure
         */
        const double = (x: number): number => x * 2;
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('double');
      expect(contracts[0]?.requires).toEqual(['x > 0']);
      expect(contracts[0]?.purity).toBe('pure');
    });
  });

  describe('function expressions', () => {
    it('parses contracts from function expressions assigned to variables', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires x >= 0
         * @ensures result >= 0
         */
        const sqrt = function(x: number): number {
          return Math.sqrt(x);
        };
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('sqrt');
      expect(contracts[0]?.requires).toEqual(['x >= 0']);
      expect(contracts[0]?.ensures).toEqual(['result >= 0']);
    });
  });

  describe('functions without contracts', () => {
    it('returns empty array for file with no contract tags', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * Regular JSDoc without contract tags.
         * @param x - The input value
         * @returns The result
         */
        function add(x: number, y: number): number {
          return x + y;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(0);
    });

    it('returns empty array for file without JSDoc', () => {
      project.createSourceFile(
        'test.ts',
        `
        function add(x: number, y: number): number {
          return x + y;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(0);
    });
  });

  describe('non-existent file', () => {
    it('returns empty array for non-existent file', () => {
      const contracts = parseContracts(project, 'nonexistent.ts');

      expect(contracts).toHaveLength(0);
    });
  });

  describe('file path in contract', () => {
    it('includes correct file path in contract', () => {
      project.createSourceFile(
        'src/math/operations.ts',
        `
        /**
         * @requires x > 0
         */
        function sqrt(x: number): number {
          return Math.sqrt(x);
        }
      `
      );

      const contracts = parseContracts(project, 'src/math/operations.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.filePath).toBe('src/math/operations.ts');
    });
  });

  describe('whitespace handling', () => {
    it('trims whitespace from expressions', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires   x > 0
         * @ensures   result !== null
         */
        function process(x: number): number | null {
          return x > 0 ? x : null;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts[0]?.requires).toEqual(['x > 0']);
      expect(contracts[0]?.ensures).toEqual(['result !== null']);
    });
  });
});

describe('inline assertion parsing', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        target: 99, // ESNext
        module: 199, // NodeNext
      },
    });
  });

  afterEach(() => {
    for (const sourceFile of project.getSourceFiles()) {
      project.removeSourceFile(sourceFile);
    }
  });

  describe('// @invariant: parsing', () => {
    it('parses single inline @invariant:', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Counter {
          count = 0;

          increment(): void {
            // @invariant: this.count >= 0
            this.count++;
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('increment');
      expect(contracts[0]?.inlineAssertions).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('invariant');
      expect(contracts[0]?.inlineAssertions?.[0]?.expression).toBe('this.count >= 0');
    });

    it('parses multiple inline @invariant: comments', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Buffer {
          size = 0;
          capacity = 100;

          resize(newSize: number): void {
            // @invariant: this.size >= 0
            // @invariant: this.size <= this.capacity
            this.size = newSize;
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions).toHaveLength(2);
      expect(contracts[0]?.inlineAssertions?.[0]?.expression).toBe('this.size >= 0');
      expect(contracts[0]?.inlineAssertions?.[1]?.expression).toBe('this.size <= this.capacity');
    });

    it('captures line numbers for inline @invariant:', () => {
      project.createSourceFile(
        'test.ts',
        `function test(): void {
  // @invariant: x > 0
}`
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.lineNumber).toBe(2);
    });
  });

  describe('// @assert: parsing', () => {
    it('parses single inline @assert:', () => {
      project.createSourceFile(
        'test.ts',
        `
        function process(arr: number[]): number {
          // @assert: arr.length > 0
          return arr[0]!;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('assert');
      expect(contracts[0]?.inlineAssertions?.[0]?.expression).toBe('arr.length > 0');
    });

    it('parses multiple inline @assert: comments', () => {
      project.createSourceFile(
        'test.ts',
        `
        function safeDivide(a: number, b: number): number {
          // @assert: b !== 0
          // @assert: Number.isFinite(a)
          return a / b;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions).toHaveLength(2);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('assert');
      expect(contracts[0]?.inlineAssertions?.[1]?.type).toBe('assert');
    });
  });

  describe('// CLAIM_REF: parsing', () => {
    it('parses inline CLAIM_REF:', () => {
      project.createSourceFile(
        'test.ts',
        `
        function performanceOptimized(): void {
          // CLAIM_REF: perf_001
          // Do something fast
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('perf_001');
    });

    it('parses multiple inline CLAIM_REF: comments', () => {
      project.createSourceFile(
        'test.ts',
        `
        function criticalOperation(): void {
          // CLAIM_REF: perf_001
          // CLAIM_REF: safety_002
          // Do something
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('perf_001');
      expect(contracts[0]?.claimRefs).toContain('safety_002');
    });

    it('combines JSDoc CLAIM_REF with inline CLAIM_REF', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * CLAIM_REF: doc_001
         */
        function dualClaimed(): void {
          // CLAIM_REF: inline_001
          // Do something
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('doc_001');
      expect(contracts[0]?.claimRefs).toContain('inline_001');
    });
  });

  describe('mixed inline assertions', () => {
    it('parses @invariant:, @assert:, and CLAIM_REF: together', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Account {
          balance = 0;

          withdraw(amount: number): void {
            // CLAIM_REF: safety_001
            // @assert: amount > 0
            // @invariant: this.balance >= 0
            this.balance -= amount;
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('safety_001');
      expect(contracts[0]?.inlineAssertions).toHaveLength(2);

      const assertAssertion = contracts[0]?.inlineAssertions?.find((a) => a.type === 'assert');
      const invariantAssertion = contracts[0]?.inlineAssertions?.find(
        (a) => a.type === 'invariant'
      );

      expect(assertAssertion?.expression).toBe('amount > 0');
      expect(invariantAssertion?.expression).toBe('this.balance >= 0');
    });

    it('combines JSDoc contracts with inline assertions', () => {
      project.createSourceFile(
        'test.ts',
        `
        /**
         * @requires amount > 0
         * @ensures result >= 0
         */
        function transfer(amount: number): number {
          // @invariant: amount <= 1000000
          return amount * 0.99;
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.requires).toEqual(['amount > 0']);
      expect(contracts[0]?.ensures).toEqual(['result >= 0']);
      expect(contracts[0]?.inlineAssertions).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('invariant');
    });
  });

  describe('example from acceptance criteria', () => {
    it('// @invariant: this.count >= 0 inside a method is captured', () => {
      project.createSourceFile(
        'test.ts',
        `
        class Counter {
          count = 0;

          decrement(): void {
            // @invariant: this.count >= 0
            this.count--;
          }
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('decrement');
      expect(contracts[0]?.inlineAssertions).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('invariant');
      expect(contracts[0]?.inlineAssertions?.[0]?.expression).toBe('this.count >= 0');
    });

    it('// CLAIM_REF: perf_001 links the function to spec claim perf_001', () => {
      project.createSourceFile(
        'test.ts',
        `
        function fastLookup(key: string): string | undefined {
          // CLAIM_REF: perf_001
          return cache.get(key);
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('perf_001');
    });
  });

  describe('negative case: block comments ignored', () => {
    it('@invariant in block comment (/* */) is ignored', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          /* @invariant: this.count >= 0 */
          console.log('test');
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      // Function has no contracts - should return empty
      expect(contracts).toHaveLength(0);
    });

    it('@assert in block comment (/* */) is ignored', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          /* @assert: x > 0 */
          console.log('test');
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(0);
    });

    it('CLAIM_REF in block comment (/* */) is ignored', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          /* CLAIM_REF: perf_001 */
          console.log('test');
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(0);
    });

    it('@invariant in multi-line block comment is ignored', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          /*
           * @invariant: this.count >= 0
           */
          console.log('test');
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(0);
    });
  });

  describe('negative case: malformed inline assertions', () => {
    it('throws ContractSyntaxError for @invariant: without expression', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          // @invariant:
          console.log('test');
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@invariant: without expression');
    });

    it('throws ContractSyntaxError for @assert: without expression', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          // @assert:
          console.log('test');
        }
      `
      );

      expect(() => parseContracts(project, 'test.ts')).toThrow(ContractSyntaxError);
      expect(() => parseContracts(project, 'test.ts')).toThrow('@assert: without expression');
    });

    it('ContractSyntaxError includes line number for inline assertions', () => {
      project.createSourceFile(
        'test.ts',
        `function test(): void {
  // @invariant:
}`
      );

      try {
        parseContracts(project, 'test.ts');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContractSyntaxError);
        const err = error as ContractSyntaxError;
        expect(err.lineNumber).toBeGreaterThan(0);
      }
    });
  });

  describe('arrow functions and function expressions', () => {
    it('parses inline assertions in arrow function body', () => {
      project.createSourceFile(
        'test.ts',
        `
        const process = (x: number): number => {
          // @assert: x > 0
          return x * 2;
        };
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.functionName).toBe('process');
      expect(contracts[0]?.inlineAssertions).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions?.[0]?.type).toBe('assert');
    });

    it('parses inline CLAIM_REF in function expression body', () => {
      project.createSourceFile(
        'test.ts',
        `
        const lookup = function(key: string): string | undefined {
          // CLAIM_REF: perf_001
          return map.get(key);
        };
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.claimRefs).toContain('perf_001');
    });
  });

  describe('whitespace handling', () => {
    it('handles various whitespace in inline assertions', () => {
      project.createSourceFile(
        'test.ts',
        `
        function test(): void {
          //   @invariant:   this.count >= 0
          //  @assert:  x > 0
          console.log('test');
        }
      `
      );

      const contracts = parseContracts(project, 'test.ts');

      expect(contracts).toHaveLength(1);
      expect(contracts[0]?.inlineAssertions).toHaveLength(2);
      expect(contracts[0]?.inlineAssertions?.[0]?.expression).toBe('this.count >= 0');
      expect(contracts[0]?.inlineAssertions?.[1]?.expression).toBe('x > 0');
    });
  });
});

describe('ContractSyntaxError', () => {
  it('has correct properties', () => {
    const error = new ContractSyntaxError(
      '@requires without expression at line 5',
      '',
      '@requires tag requires an expression',
      5,
      'requires'
    );

    expect(error.message).toBe('@requires without expression at line 5');
    expect(error.name).toBe('ContractSyntaxError');
    expect(error.expression).toBe('');
    expect(error.reason).toBe('@requires tag requires an expression');
    expect(error.lineNumber).toBe(5);
    expect(error.tagName).toBe('requires');
  });

  it('inherits from ContractParseError', () => {
    const error = new ContractSyntaxError('message', 'expr', 'reason', 1, 'requires');

    expect(error).toBeInstanceOf(Error);
  });
});
