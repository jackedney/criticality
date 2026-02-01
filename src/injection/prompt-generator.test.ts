/**
 * Tests for minimal prompt generation.
 *
 * Verifies:
 * - Generate prompt with: FUNCTION, SIGNATURE, CONTRACTS, TYPE DEFINITIONS sections
 * - Prompt ends with 'IMPLEMENT THE FUNCTION. Output only the function body.'
 * - No reasoning traces, no prior attempts, no other functions included
 * - Format matches SPECIFICATION.md example
 * - Negative case: Context exceeds 12k tokens -> trigger pre-emptive model upgrade
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Project, ScriptTarget, ModuleKind } from 'ts-morph';
import {
  generateMinimalPrompt,
  generateMinimalPromptFromComponents,
  estimateTokenCount,
  shouldTriggerModelUpgrade,
  DEFAULT_TOKEN_LIMIT,
} from './prompt-generator.js';
import { extractContext } from './context-extractor.js';
import type { TodoFunction } from '../adapters/typescript/ast.js';
import type { MicroContract } from '../adapters/typescript/assertions.js';

describe('generateMinimalPrompt', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        target: ScriptTarget.ESNext,
        module: ModuleKind.NodeNext,
      },
    });
  });

  describe('format structure', () => {
    it('should generate prompt with FUNCTION section', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('FUNCTION: add');
    });

    it('should generate prompt with SIGNATURE section', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function multiply(x: number, y: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'multiply',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function multiply(x: number, y: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('SIGNATURE:');
      expect(result.prompt).toContain('multiply');
    });

    it('should generate prompt with CONTRACTS section when contracts exist', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
/**
 * @requires a > 0
 * @ensures result > 0
 * @complexity O(1)
 * @purity pure
 */
function square(a: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'square',
        filePath: '/test/example.ts',
        line: 8,
        signature: 'function square(a: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('CONTRACTS:');
      expect(result.prompt).toContain('REQUIRES: a > 0');
      expect(result.prompt).toContain('ENSURES: result > 0');
      expect(result.prompt).toContain('COMPLEXITY: O(1)');
      expect(result.prompt).toContain('PURITY: pure');
    });

    it('should generate prompt with TYPE DEFINITIONS section when types exist', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
interface User {
  id: string;
  name: string;
}

function createUser(name: string): User {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createUser',
        filePath: '/test/example.ts',
        line: 7,
        signature: 'function createUser(name: string): User',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('TYPE DEFINITIONS:');
      expect(result.prompt).toContain('interface User');
    });

    it('should generate prompt with WITNESS DEFINITIONS section for branded types', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
type PositiveNumber = number & { readonly __brand: 'PositiveNumber' };

function double(n: PositiveNumber): PositiveNumber {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'double',
        filePath: '/test/example.ts',
        line: 4,
        signature: 'function double(n: PositiveNumber): PositiveNumber',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('WITNESS DEFINITIONS:');
      expect(result.prompt).toContain('PositiveNumber');
      expect(result.prompt).toContain('__brand');
    });

    it('should end with the exact final instruction', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function identity(x: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'identity',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function identity(x: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt.endsWith('IMPLEMENT THE FUNCTION. Output only the function body.')).toBe(
        true
      );
    });
  });

  describe('format matches SPECIFICATION.md', () => {
    it('should match the binary_search example format structure', () => {
      project.createSourceFile(
        '/test/search.ts',
        `
type SortedArray<T> = T[] & { readonly __brand: 'SortedArray' };

/**
 * @requires haystack is sorted ascending (witnessed by SortedArray type)
 * @requires haystack.length > 0
 * @ensures result !== undefined implies haystack[result] === needle
 * @ensures result === undefined implies !haystack.includes(needle)
 * @complexity O(log n) where n = haystack.length
 * @purity pure
 */
function binarySearch(haystack: SortedArray<number>, needle: number): number | undefined {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'binarySearch',
        filePath: '/test/search.ts',
        line: 13,
        signature:
          'function binarySearch(haystack: SortedArray<number>, needle: number): number | undefined',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // Verify structure matches SPECIFICATION.md format
      const lines = result.prompt.split('\n');

      // First line: FUNCTION: name
      expect(lines[0]).toBe('FUNCTION: binarySearch');

      // Second line: SIGNATURE: signature
      expect(lines[1]).toContain('SIGNATURE:');
      expect(lines[1]).toContain('binarySearch');

      // Should have CONTRACTS section
      expect(result.prompt).toContain('CONTRACTS:');
      expect(result.prompt).toContain('  REQUIRES:'); // Indented
      expect(result.prompt).toContain('  ENSURES:'); // Indented
      expect(result.prompt).toContain('  COMPLEXITY:');
      expect(result.prompt).toContain('  PURITY:');

      // Should have type definitions
      expect(result.prompt).toContain('WITNESS DEFINITIONS:');
      expect(result.prompt).toContain('SortedArray');

      // Final instruction
      expect(result.prompt).toContain('IMPLEMENT THE FUNCTION. Output only the function body.');
    });
  });

  describe('no extraneous content', () => {
    it('should not include reasoning traces', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // Should not contain reasoning language
      expect(result.prompt.toLowerCase()).not.toContain('let me think');
      expect(result.prompt.toLowerCase()).not.toContain("let's analyze");
      expect(result.prompt.toLowerCase()).not.toContain('reasoning');
      expect(result.prompt.toLowerCase()).not.toContain('step by step');
    });

    it('should not include prior attempts', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // Should not contain attempt-related language
      expect(result.prompt.toLowerCase()).not.toContain('attempt');
      expect(result.prompt.toLowerCase()).not.toContain('previous');
      expect(result.prompt.toLowerCase()).not.toContain('failed');
      expect(result.prompt.toLowerCase()).not.toContain('retry');
    });

    it('should not include other functions', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function helperFunction(x: number): number {
  return x * 2;
}

function targetFunction(a: number): number {
  throw new Error('TODO');
}

function anotherHelper(y: string): string {
  return y.toUpperCase();
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'targetFunction',
        filePath: '/test/example.ts',
        line: 6,
        signature: 'function targetFunction(a: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // Should only reference target function
      expect(result.prompt).toContain('targetFunction');
      expect(result.prompt).not.toContain('helperFunction');
      expect(result.prompt).not.toContain('anotherHelper');
    });
  });

  describe('token counting and model upgrade', () => {
    it('should return estimated token count', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.characterCount).toBeGreaterThan(0);
      // Token estimate should be approximately chars / 4
      expect(result.estimatedTokens).toBe(Math.ceil(result.characterCount / 4));
    });

    it('should return exceedsTokenLimit: false for small contexts', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.exceedsTokenLimit).toBe(false);
    });

    it('should return exceedsTokenLimit: true when context exceeds 12k tokens', () => {
      // Create a large type that will generate many tokens
      // 4000 fields should generate ~48k chars / 4 = ~12k tokens, exceeding the limit
      const largeInterface = Array(4000)
        .fill(null)
        .map((_, i) => `  field${String(i)}: string;`)
        .join('\n');

      project.createSourceFile(
        '/test/large.ts',
        `
interface LargeType {
${largeInterface}
}

function processLarge(data: LargeType): LargeType {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'processLarge',
        filePath: '/test/large.ts',
        line: 4003,
        signature: 'function processLarge(data: LargeType): LargeType',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // With 4000+ fields, should exceed the 12k token limit
      expect(result.estimatedTokens).toBeGreaterThan(12000);
      expect(result.exceedsTokenLimit).toBe(true);
    });

    it('should respect custom token limit option', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

function createUser(name: string): User {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createUser',
        filePath: '/test/example.ts',
        line: 10,
        signature: 'function createUser(name: string): User',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // With very low limit, should exceed
      const resultLow = generateMinimalPrompt(context, { tokenLimit: 10 });
      expect(resultLow.exceedsTokenLimit).toBe(true);

      // With very high limit, should not exceed
      const resultHigh = generateMinimalPrompt(context, { tokenLimit: 100000 });
      expect(resultHigh.exceedsTokenLimit).toBe(false);
    });
  });

  describe('contract formatting', () => {
    it('should format multiple requires clauses', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
/**
 * @requires a > 0
 * @requires b > 0
 * @requires a !== b
 */
function divide(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'divide',
        filePath: '/test/example.ts',
        line: 7,
        signature: 'function divide(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('REQUIRES: a > 0');
      expect(result.prompt).toContain('REQUIRES: b > 0');
      expect(result.prompt).toContain('REQUIRES: a !== b');
    });

    it('should format multiple ensures clauses', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
/**
 * @ensures result > 0
 * @ensures result < a + b
 */
function average(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'average',
        filePath: '/test/example.ts',
        line: 6,
        signature: 'function average(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('ENSURES: result > 0');
      expect(result.prompt).toContain('ENSURES: result < a + b');
    });

    it('should format invariant clauses', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
/**
 * @invariant sum is always positive
 */
function accumulate(values: number[]): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'accumulate',
        filePath: '/test/example.ts',
        line: 5,
        signature: 'function accumulate(values: number[]): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('INVARIANT: sum is always positive');
    });

    it('should not include CONTRACTS section when no contracts exist', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).not.toContain('CONTRACTS:');
    });
  });

  describe('type formatting', () => {
    it('should format multiple type definitions', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
interface Account {
  id: string;
  balance: number;
}

interface Transaction {
  from: string;
  to: string;
  amount: number;
}

function transfer(acc: Account, tx: Transaction): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'transfer',
        filePath: '/test/example.ts',
        line: 13,
        signature: 'function transfer(acc: Account, tx: Transaction): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).toContain('TYPE DEFINITIONS:');
      expect(result.prompt).toContain('interface Account');
      expect(result.prompt).toContain('interface Transaction');
    });

    it('should not include TYPE DEFINITIONS section when no types exist', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.prompt).not.toContain('TYPE DEFINITIONS:');
    });

    it('should separate witness types from regular types', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
interface Account {
  id: string;
}

type PositiveDecimal = number & { readonly __brand: 'PositiveDecimal' };

function deposit(acc: Account, amount: PositiveDecimal): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'deposit',
        filePath: '/test/example.ts',
        line: 8,
        signature: 'function deposit(acc: Account, amount: PositiveDecimal): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      // Should have separate sections
      expect(result.prompt).toContain('TYPE DEFINITIONS:');
      expect(result.prompt).toContain('WITNESS DEFINITIONS:');

      // Account in regular types
      const typeDefIndex = result.prompt.indexOf('TYPE DEFINITIONS:');
      const witnessDefIndex = result.prompt.indexOf('WITNESS DEFINITIONS:');

      expect(typeDefIndex).toBeLessThan(witnessDefIndex);

      // Check Account appears before witness section
      const accountIndex = result.prompt.indexOf('interface Account');
      expect(accountIndex).toBeGreaterThan(typeDefIndex);
      expect(accountIndex).toBeLessThan(witnessDefIndex);

      // Check PositiveDecimal type definition appears in witness section
      // (note: PositiveDecimal also appears in signature, so search for the type definition)
      const positiveDecimalDefIndex = result.prompt.indexOf(
        'type PositiveDecimal',
        witnessDefIndex
      );
      expect(positiveDecimalDefIndex).toBeGreaterThan(witnessDefIndex);
    });
  });

  describe('result metadata', () => {
    it('should return the function name', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function myFunction(x: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'myFunction',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function myFunction(x: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.functionName).toBe('myFunction');
    });

    it('should return character count', () => {
      project.createSourceFile(
        '/test/example.ts',
        `
function test(): void {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'test',
        filePath: '/test/example.ts',
        line: 2,
        signature: 'function test(): void',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);
      const result = generateMinimalPrompt(context);

      expect(result.characterCount).toBe(result.prompt.length);
    });
  });
});

describe('generateMinimalPromptFromComponents', () => {
  it('should generate prompt from raw components', () => {
    const contracts: MicroContract[] = [
      {
        functionName: 'add',
        filePath: '/test/add.ts',
        requires: ['a > 0', 'b > 0'],
        ensures: ['result === a + b'],
        invariants: [],
        claimRefs: [],
        complexity: 'O(1)',
        purity: 'pure',
      },
    ];

    const result = generateMinimalPromptFromComponents(
      'add',
      'function add(a: number, b: number): number',
      contracts,
      [],
      []
    );

    expect(result.prompt).toContain('FUNCTION: add');
    expect(result.prompt).toContain('SIGNATURE: function add(a: number, b: number): number');
    expect(result.prompt).toContain('CONTRACTS:');
    expect(result.prompt).toContain('REQUIRES: a > 0');
    expect(result.prompt).toContain('REQUIRES: b > 0');
    expect(result.prompt).toContain('ENSURES: result === a + b');
    expect(result.prompt).toContain('COMPLEXITY: O(1)');
    expect(result.prompt).toContain('PURITY: pure');
    expect(result.prompt).toContain('IMPLEMENT THE FUNCTION. Output only the function body.');
  });

  it('should include type definitions when provided', () => {
    const result = generateMinimalPromptFromComponents(
      'createUser',
      'function createUser(name: string): User',
      [],
      ['interface User {\n  id: string;\n  name: string;\n}'],
      []
    );

    expect(result.prompt).toContain('TYPE DEFINITIONS:');
    expect(result.prompt).toContain('interface User');
  });

  it('should include witness definitions when provided', () => {
    const result = generateMinimalPromptFromComponents(
      'validate',
      'function validate(n: PositiveNumber): boolean',
      [],
      [],
      ["type PositiveNumber = number & { readonly __brand: 'PositiveNumber' };"]
    );

    expect(result.prompt).toContain('WITNESS DEFINITIONS:');
    expect(result.prompt).toContain('PositiveNumber');
  });
});

describe('estimateTokenCount', () => {
  it('should estimate tokens as characters / 4', () => {
    expect(estimateTokenCount(100)).toBe(25);
    expect(estimateTokenCount(400)).toBe(100);
    expect(estimateTokenCount(1000)).toBe(250);
  });

  it('should round up for fractional tokens', () => {
    expect(estimateTokenCount(101)).toBe(26);
    expect(estimateTokenCount(103)).toBe(26);
    expect(estimateTokenCount(105)).toBe(27);
  });

  it('should return 0 for empty content', () => {
    expect(estimateTokenCount(0)).toBe(0);
  });
});

describe('shouldTriggerModelUpgrade', () => {
  it('should return false when under default limit', () => {
    expect(
      shouldTriggerModelUpgrade({
        totalCharacters: 1000,
        estimatedTokens: 250,
        typeCount: 2,
        witnessCount: 1,
        contractCount: 3,
        signatureComplexity: 5,
        complexityScore: 10,
      })
    ).toBe(false);
  });

  it('should return true when exceeding default limit', () => {
    expect(
      shouldTriggerModelUpgrade({
        totalCharacters: 50000,
        estimatedTokens: 12500,
        typeCount: 20,
        witnessCount: 5,
        contractCount: 30,
        signatureComplexity: 10,
        complexityScore: 50,
      })
    ).toBe(true);
  });

  it('should respect custom token limit', () => {
    const metrics = {
      totalCharacters: 1000,
      estimatedTokens: 250,
      typeCount: 2,
      witnessCount: 1,
      contractCount: 3,
      signatureComplexity: 5,
      complexityScore: 10,
    };

    expect(shouldTriggerModelUpgrade(metrics, 200)).toBe(true);
    expect(shouldTriggerModelUpgrade(metrics, 300)).toBe(false);
  });

  it('should use DEFAULT_TOKEN_LIMIT of 12000', () => {
    expect(DEFAULT_TOKEN_LIMIT).toBe(12000);
  });
});
