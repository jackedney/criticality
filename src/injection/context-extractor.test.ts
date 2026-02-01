/**
 * Tests for the context extraction module.
 *
 * Verifies:
 * - Extract function signature from AST
 * - Extract micro-contracts from JSDoc
 * - Extract required type definitions (parameters, return type, referenced types)
 * - Extract witness definitions for witnessed types
 * - Context size tracked for model routing decisions
 * - Example: withdraw function -> extracts Account, PositiveDecimal, NonNegativeDecimal, InsufficientFunds types
 * - Negative case: Circular type reference -> detected and flattened to prevent infinite expansion
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Project, ScriptTarget, ModuleKind } from 'ts-morph';
import * as fc from 'fast-check';
import {
  extractContext,
  serializeContextForPrompt,
  shouldEscalateToLargerModel,
} from './context-extractor.js';
import type { TodoFunction } from '../adapters/typescript/ast.js';

describe('extractContext', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        target: ScriptTarget.ESNext,
        module: ModuleKind.NodeNext,
      },
    });
  });

  describe('signature extraction', () => {
    it('should extract function signature from AST', () => {
      project.createSourceFile(
        '/test/math.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/math.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.signature.name).toBe('add');
      expect(context.signature.parameters).toHaveLength(2);
      expect(context.signature.parameters[0]?.name).toBe('a');
      expect(context.signature.parameters[0]?.type).toBe('number');
      expect(context.signature.parameters[1]?.name).toBe('b');
      expect(context.signature.parameters[1]?.type).toBe('number');
      expect(context.signature.returnType).toBe('number');
    });

    it('should extract async function signature', () => {
      project.createSourceFile(
        '/test/async.ts',
        `
async function fetchData(url: string): Promise<string> {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'fetchData',
        filePath: '/test/async.ts',
        line: 2,
        signature: 'async function fetchData(url: string): Promise<string>',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.signature.isAsync).toBe(true);
      expect(context.signature.returnType).toBe('Promise<string>');
    });

    it('should extract generic function signature', () => {
      project.createSourceFile(
        '/test/generic.ts',
        `
function identity<T>(value: T): T {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'identity',
        filePath: '/test/generic.ts',
        line: 2,
        signature: 'function identity<T>(value: T): T',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.signature.typeParameters).toHaveLength(1);
      expect(context.signature.typeParameters[0]?.name).toBe('T');
    });
  });

  describe('contract extraction', () => {
    it('should extract micro-contracts from JSDoc', () => {
      project.createSourceFile(
        '/test/contracts.ts',
        `
/**
 * Adds two numbers.
 * @requires a >= 0 - a must be non-negative
 * @ensures result === a + b
 */
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'add',
        filePath: '/test/contracts.ts',
        line: 7,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.contracts).toHaveLength(1);
      expect(context.contracts[0]?.requires).toContain('a >= 0 - a must be non-negative');
      expect(context.contracts[0]?.ensures).toContain('result === a + b');
    });

    it('should extract multiple contracts', () => {
      project.createSourceFile(
        '/test/multi-contracts.ts',
        `
/**
 * @requires min <= max
 * @requires step > 0
 * @ensures result.length > 0
 * @invariant All elements are within [min, max]
 */
function range(min: number, max: number, step: number): number[] {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'range',
        filePath: '/test/multi-contracts.ts',
        line: 8,
        signature: 'function range(min: number, max: number, step: number): number[]',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.contracts).toHaveLength(1);
      const contract = context.contracts[0];
      expect(contract?.requires).toHaveLength(2);
      expect(contract?.ensures).toHaveLength(1);
      expect(contract?.invariants).toHaveLength(1);
    });
  });

  describe('type extraction', () => {
    it('should extract interface type from signature', () => {
      project.createSourceFile(
        '/test/types.ts',
        `
interface User {
  id: number;
  name: string;
}

function createUser(name: string): User {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createUser',
        filePath: '/test/types.ts',
        line: 7,
        signature: 'function createUser(name: string): User',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('User');
      expect(context.requiredTypes[0]?.kind).toBe('interface');
      expect(context.requiredTypes[0]?.definition).toContain('interface User');
    });

    it('should extract type alias from signature', () => {
      project.createSourceFile(
        '/test/types.ts',
        `
type Result = { success: boolean; data?: string };

function getResult(): Result {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'getResult',
        filePath: '/test/types.ts',
        line: 4,
        signature: 'function getResult(): Result',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Result');
      expect(context.requiredTypes[0]?.kind).toBe('type');
    });

    it('should extract enum from signature', () => {
      project.createSourceFile(
        '/test/types.ts',
        `
enum Status {
  Pending = 'pending',
  Active = 'active',
  Closed = 'closed',
}

function getStatus(): Status {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'getStatus',
        filePath: '/test/types.ts',
        line: 8,
        signature: 'function getStatus(): Status',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Status');
      expect(context.requiredTypes[0]?.kind).toBe('enum');
    });

    it('should extract types from parameter types', () => {
      project.createSourceFile(
        '/test/types.ts',
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

function processTransaction(account: Account, tx: Transaction): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'processTransaction',
        filePath: '/test/types.ts',
        line: 13,
        signature: 'function processTransaction(account: Account, tx: Transaction): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.requiredTypes).toHaveLength(2);
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toEqual(['Account', 'Transaction']);
    });

    it('should extract types from cross-file references', () => {
      // Create types in a separate file
      project.createSourceFile(
        '/test/types/account.ts',
        `
export interface Account {
  id: string;
  balance: number;
}
`
      );

      project.createSourceFile(
        '/test/service.ts',
        `
import { Account } from './types/account.js';

function getAccount(id: string): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'getAccount',
        filePath: '/test/service.ts',
        line: 4,
        signature: 'function getAccount(id: string): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should find Account from the other file
      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Account');
      expect(context.requiredTypes[0]?.sourcePath).toBe('/test/types/account.ts');
    });

    it('should extract transitive type references', () => {
      project.createSourceFile(
        '/test/types.ts',
        `
interface Address {
  street: string;
  city: string;
}

interface Account {
  id: string;
  address: Address;
}

function getAccount(id: string): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'getAccount',
        filePath: '/test/types.ts',
        line: 12,
        signature: 'function getAccount(id: string): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should include both Account and its referenced Address
      expect(context.requiredTypes).toHaveLength(2);
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toEqual(['Account', 'Address']);
    });

    it('should not include built-in types', () => {
      project.createSourceFile(
        '/test/builtin.ts',
        `
function process(data: string): Promise<number> {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'process',
        filePath: '/test/builtin.ts',
        line: 2,
        signature: 'function process(data: string): Promise<number>',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // No types should be extracted (string, Promise, number are built-in)
      expect(context.requiredTypes).toHaveLength(0);
    });
  });

  describe('witness extraction', () => {
    it('should extract witness (branded) types', () => {
      project.createSourceFile(
        '/test/witness.ts',
        `
type NonEmptyString = string & { readonly __brand: 'NonEmptyString' };
type PositiveNumber = number & { readonly __brand: 'PositiveNumber' };

function validate(input: NonEmptyString): PositiveNumber {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'validate',
        filePath: '/test/witness.ts',
        line: 5,
        signature: 'function validate(input: NonEmptyString): PositiveNumber',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Both should be identified as witness types
      expect(context.witnessDefinitions).toHaveLength(2);
      const witnessNames = context.witnessDefinitions.map((w) => w.name).sort();
      expect(witnessNames).toEqual(['NonEmptyString', 'PositiveNumber']);
      expect(context.witnessDefinitions.every((w) => w.isWitness)).toBe(true);
    });

    it('should separate witnesses from regular types', () => {
      project.createSourceFile(
        '/test/mixed.ts',
        `
interface Account {
  id: string;
  balance: number;
}

type PositiveDecimal = number & { readonly __brand: 'PositiveDecimal' };

function deposit(account: Account, amount: PositiveDecimal): Account {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'deposit',
        filePath: '/test/mixed.ts',
        line: 9,
        signature: 'function deposit(account: Account, amount: PositiveDecimal): Account',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Account should be in requiredTypes
      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Account');

      // PositiveDecimal should be in witnessDefinitions
      expect(context.witnessDefinitions).toHaveLength(1);
      expect(context.witnessDefinitions[0]?.name).toBe('PositiveDecimal');
    });
  });

  describe('withdraw function example (US-018 acceptance criteria)', () => {
    it('should extract Account, PositiveDecimal, NonNegativeDecimal, InsufficientFunds types', () => {
      project.createSourceFile(
        '/test/banking.ts',
        `
type PositiveDecimal = number & { readonly __brand: 'PositiveDecimal' };
type NonNegativeDecimal = number & { readonly __brand: 'NonNegativeDecimal' };

interface Account {
  id: string;
  balance: NonNegativeDecimal;
}

interface InsufficientFunds {
  kind: 'InsufficientFunds';
  requested: PositiveDecimal;
  available: NonNegativeDecimal;
}

/**
 * Withdraws money from an account.
 * @requires amount > 0
 * @ensures result is Account with updated balance OR InsufficientFunds error
 */
function withdraw(account: Account, amount: PositiveDecimal): Account | InsufficientFunds {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'withdraw',
        filePath: '/test/banking.ts',
        line: 20,
        signature:
          'function withdraw(account: Account, amount: PositiveDecimal): Account | InsufficientFunds',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Check required types (non-witness)
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toContain('Account');
      expect(typeNames).toContain('InsufficientFunds');

      // Check witness types
      const witnessNames = context.witnessDefinitions.map((w) => w.name).sort();
      expect(witnessNames).toContain('NonNegativeDecimal');
      expect(witnessNames).toContain('PositiveDecimal');

      // Verify all expected types are extracted
      const allTypeNames = [...typeNames, ...witnessNames].sort();
      expect(allTypeNames).toEqual([
        'Account',
        'InsufficientFunds',
        'NonNegativeDecimal',
        'PositiveDecimal',
      ]);
    });
  });

  describe('circular type reference detection', () => {
    it('should detect and flatten circular type references', () => {
      project.createSourceFile(
        '/test/circular.ts',
        `
// Circular: Node -> Node (self-reference)
interface Node {
  value: number;
  children: Node[];
}

function processNode(node: Node): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'processNode',
        filePath: '/test/circular.ts',
        line: 8,
        signature: 'function processNode(node: Node): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should still extract the type
      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Node');

      // Should detect the circular reference
      expect(context.hadCircularReferences).toBe(true);
      expect(context.circularTypeNames).toContain('Node');
    });

    it('should detect mutual circular references', () => {
      project.createSourceFile(
        '/test/mutual-circular.ts',
        `
// Mutual circular: A -> B -> A
interface A {
  value: number;
  b: B;
}

interface B {
  name: string;
  a: A;
}

function processA(a: A): number {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'processA',
        filePath: '/test/mutual-circular.ts',
        line: 13,
        signature: 'function processA(a: A): number',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should extract both types
      expect(context.requiredTypes).toHaveLength(2);
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toEqual(['A', 'B']);

      // Should detect the circular reference
      expect(context.hadCircularReferences).toBe(true);
    });

    it('should prevent infinite expansion', () => {
      // Even with deep circular references, should not hang
      project.createSourceFile(
        '/test/deep-circular.ts',
        `
interface Level1 {
  level2: Level2;
}

interface Level2 {
  level3: Level3;
}

interface Level3 {
  level1: Level1;
}

function process(input: Level1): void {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'process',
        filePath: '/test/deep-circular.ts',
        line: 14,
        signature: 'function process(input: Level1): void',
        hasTodoBody: true,
      };

      // Should complete without hanging
      const context = extractContext(project, todoFunction);

      expect(context.requiredTypes).toHaveLength(3);
      expect(context.hadCircularReferences).toBe(true);
    });
  });

  describe('class method/constructor/accessor type extraction', () => {
    it('should extract types from class methods', () => {
      project.createSourceFile(
        '/test/class-methods.ts',
        `
interface Data {
  value: string;
}

interface Result {
  success: boolean;
}

class Processor {
  process(data: Data): Result {
    throw new Error('TODO');
  }
}

function createProcessor(): Processor {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createProcessor',
        filePath: '/test/class-methods.ts',
        line: 14,
        signature: 'function createProcessor(): Processor',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should extract Processor class which references Data and Result
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toContain('Processor');
      expect(typeNames).toContain('Data');
      expect(typeNames).toContain('Result');
    });

    it('should extract types from class constructors', () => {
      project.createSourceFile(
        '/test/class-ctor.ts',
        `
interface Config {
  timeout: number;
}

class Service {
  constructor(config: Config) {
    throw new Error('TODO');
  }
}

function createService(config: Config): Service {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createService',
        filePath: '/test/class-ctor.ts',
        line: 12,
        signature: 'function createService(config: Config): Service',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should extract Service class which references Config
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toContain('Service');
      expect(typeNames).toContain('Config');
    });

    it('should extract types from class accessors', () => {
      project.createSourceFile(
        '/test/class-accessors.ts',
        `
interface Value {
  amount: number;
}

class Account {
  private _balance: Value;

  get balance(): Value {
    return this._balance;
  }

  set balance(value: Value) {
    this._balance = value;
  }
}

function getAccount(account: Account): Value {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'getAccount',
        filePath: '/test/class-accessors.ts',
        line: 18,
        signature: 'function getAccount(account: Account): Value',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should extract Account class which references Value
      const typeNames = context.requiredTypes.map((t) => t.name).sort();
      expect(typeNames).toContain('Account');
      expect(typeNames).toContain('Value');
    });

    it('should handle class with methods without types', () => {
      project.createSourceFile(
        '/test/class-no-types.ts',
        `
class Simple {
  doSomething() {
    throw new Error('TODO');
  }
}

function createSimple(): Simple {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'createSimple',
        filePath: '/test/class-no-types.ts',
        line: 9,
        signature: 'function createSimple(): Simple',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      // Should still extract Simple class even with untyped methods
      expect(context.requiredTypes).toHaveLength(1);
      expect(context.requiredTypes[0]?.name).toBe('Simple');
    });
  });

  describe('context size tracking', () => {
    it('should track context size metrics', () => {
      project.createSourceFile(
        '/test/metrics.ts',
        `
interface User {
  id: string;
  name: string;
  email: string;
}

/**
 * @requires user.name.length > 0
 * @ensures result includes user.id
 */
function formatUser(user: User): string {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'formatUser',
        filePath: '/test/metrics.ts',
        line: 12,
        signature: 'function formatUser(user: User): string',
        hasTodoBody: true,
      };

      const context = extractContext(project, todoFunction);

      expect(context.sizeMetrics).toBeDefined();
      expect(context.sizeMetrics.totalCharacters).toBeGreaterThan(0);
      expect(context.sizeMetrics.estimatedTokens).toBeGreaterThan(0);
      expect(context.sizeMetrics.typeCount).toBe(1);
      // 1 @requires + 1 @ensures = 2 contract conditions
      expect(context.sizeMetrics.contractCount).toBe(2);
      expect(context.sizeMetrics.signatureComplexity).toBeGreaterThanOrEqual(0);
      expect(context.sizeMetrics.complexityScore).toBeGreaterThan(0);
    });

    it('should calculate higher complexity for complex signatures', () => {
      project.createSourceFile(
        '/test/simple.ts',
        `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      project.createSourceFile(
        '/test/complex.ts',
        `
interface Options<T, K extends keyof T> {
  filter: (item: T) => boolean;
  keys: K[];
}

function processComplex<T extends object, K extends keyof T>(
  items: T[],
  options: Options<T, K>
): Map<K, T[]> | null {
  throw new Error('TODO');
}
`
      );

      const simpleTodo: TodoFunction = {
        name: 'add',
        filePath: '/test/simple.ts',
        line: 2,
        signature: 'function add(a: number, b: number): number',
        hasTodoBody: true,
      };

      const complexTodo: TodoFunction = {
        name: 'processComplex',
        filePath: '/test/complex.ts',
        line: 7,
        signature:
          'function processComplex<T extends object, K extends keyof T>(items: T[], options: Options<T, K>): Map<K, T[]> | null',
        hasTodoBody: true,
      };

      const simpleContext = extractContext(project, simpleTodo);
      const complexContext = extractContext(project, complexTodo);

      expect(complexContext.sizeMetrics.signatureComplexity).toBeGreaterThan(
        simpleContext.sizeMetrics.signatureComplexity
      );
      expect(complexContext.sizeMetrics.complexityScore).toBeGreaterThan(
        simpleContext.sizeMetrics.complexityScore
      );
    });
  });

  describe('extraction options', () => {
    it('should respect maxTypeDepth option', () => {
      project.createSourceFile(
        '/test/deep.ts',
        `
interface Level3 { value: number; }
interface Level2 { child: Level3; }
interface Level1 { child: Level2; }
interface Root { child: Level1; }

function process(root: Root): void {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'process',
        filePath: '/test/deep.ts',
        line: 7,
        signature: 'function process(root: Root): void',
        hasTodoBody: true,
      };

      // With low depth, should not extract all levels
      const shallowContext = extractContext(project, todoFunction, { maxTypeDepth: 1 });
      const deepContext = extractContext(project, todoFunction, { maxTypeDepth: 5 });

      expect(deepContext.requiredTypes.length).toBeGreaterThanOrEqual(
        shallowContext.requiredTypes.length
      );
    });

    it('should respect maxTypes option', () => {
      project.createSourceFile(
        '/test/many-types.ts',
        `
interface Type1 { a: number; }
interface Type2 { a: Type1; }
interface Type3 { a: Type2; }
interface Type4 { a: Type3; }
interface Type5 { a: Type4; }
interface Type6 { a: Type5; }
interface Type7 { a: Type6; }
interface Type8 { a: Type7; }
interface Type9 { a: Type8; }
interface Type10 { a: Type9; }

function process(t: Type10): void {
  throw new Error('TODO');
}
`
      );

      const todoFunction: TodoFunction = {
        name: 'process',
        filePath: '/test/many-types.ts',
        line: 13,
        signature: 'function process(t: Type10): void',
        hasTodoBody: true,
      };

      const limitedContext = extractContext(project, todoFunction, { maxTypes: 3 });

      expect(limitedContext.requiredTypes.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('serializeContextForPrompt', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        target: ScriptTarget.ESNext,
        module: ModuleKind.NodeNext,
      },
    });
  });

  it('should serialize context to prompt-ready format', () => {
    project.createSourceFile(
      '/test/example.ts',
      `
interface User { id: string; }
type NonEmptyString = string & { readonly __brand: 'NonEmptyString' };

/**
 * @requires name.length > 0
 * @ensures result !== null
 */
function createUser(name: NonEmptyString): User {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'createUser',
      filePath: '/test/example.ts',
      line: 9,
      signature: 'function createUser(name: NonEmptyString): User',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);
    const serialized = serializeContextForPrompt(context);

    expect(serialized).toContain('FUNCTION SIGNATURE:');
    expect(serialized).toContain('createUser');
    expect(serialized).toContain('CONTRACTS');
    expect(serialized).toContain('REQUIRED TYPES:');
    expect(serialized).toContain('interface User');
    expect(serialized).toContain('WITNESS TYPES:');
    expect(serialized).toContain('NonEmptyString');
  });

  it('should include circular reference note when present', () => {
    project.createSourceFile(
      '/test/circular.ts',
      `
interface Node {
  value: number;
  next: Node;
}

function traverse(node: Node): void {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'traverse',
      filePath: '/test/circular.ts',
      line: 7,
      signature: 'function traverse(node: Node): void',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);
    const serialized = serializeContextForPrompt(context);

    expect(serialized).toContain('Circular type references detected');
    expect(serialized).toContain('Node');
  });
});

describe('shouldEscalateToLargerModel', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        target: ScriptTarget.ESNext,
        module: ModuleKind.NodeNext,
      },
    });
  });

  it('should not escalate simple functions', () => {
    project.createSourceFile(
      '/test/simple.ts',
      `
function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'add',
      filePath: '/test/simple.ts',
      line: 2,
      signature: 'function add(a: number, b: number): number',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);
    expect(shouldEscalateToLargerModel(context)).toBe(false);
  });

  it('should escalate functions with circular references', () => {
    project.createSourceFile(
      '/test/circular.ts',
      `
interface Node {
  value: number;
  next: Node;
}

function traverse(node: Node): void {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'traverse',
      filePath: '/test/circular.ts',
      line: 7,
      signature: 'function traverse(node: Node): void',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);
    expect(shouldEscalateToLargerModel(context)).toBe(true);
  });

  it('should escalate functions with many contracts', () => {
    project.createSourceFile(
      '/test/many-contracts.ts',
      `
/**
 * @requires a > 0
 * @requires b > 0
 * @requires c > 0
 * @requires d > 0
 * @requires e > 0
 * @requires f > 0
 * @ensures result > 0
 */
function complex(a: number, b: number, c: number, d: number, e: number, f: number): number {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'complex',
      filePath: '/test/many-contracts.ts',
      line: 11,
      signature:
        'function complex(a: number, b: number, c: number, d: number, e: number, f: number): number',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);
    expect(shouldEscalateToLargerModel(context)).toBe(true);
  });

  it('should respect custom threshold', () => {
    project.createSourceFile(
      '/test/threshold.ts',
      `
interface Medium { value: number; }

function process(m: Medium): Medium {
  throw new Error('TODO');
}
`
    );

    const todoFunction: TodoFunction = {
      name: 'process',
      filePath: '/test/threshold.ts',
      line: 4,
      signature: 'function process(m: Medium): Medium',
      hasTodoBody: true,
    };

    const context = extractContext(project, todoFunction);

    // With a very low threshold, should escalate
    expect(shouldEscalateToLargerModel(context, 0.5)).toBe(true);

    // With a very high threshold, should not escalate
    expect(shouldEscalateToLargerModel(context, 1000)).toBe(false);
  });
});

describe('property-based tests', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        target: ScriptTarget.ESNext,
        module: ModuleKind.NodeNext,
      },
    });
  });

  // Arbitrary for generating valid TypeScript type names
  const typeNameArb = fc
    .stringMatching(/^[A-Z][a-zA-Z0-9]*$/)
    .filter((s) => s.length >= 1 && s.length <= 20);

  // Arbitrary for generating simple TypeScript type strings
  const simpleTypeArb = fc.oneof(
    fc.constant('string'),
    fc.constant('number'),
    fc.constant('boolean'),
    fc.constant('void'),
    fc.constant('unknown'),
    fc.constant('any')
  );

  // Arbitrary for generating interface definitions
  const interfaceArb = fc
    .tuple(
      typeNameArb,
      fc.array(
        fc.tuple(fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/), fc.oneof(simpleTypeArb, typeNameArb)),
        { minLength: 0, maxLength: 5 }
      )
    )
    .map(([name, props]) => {
      const propStrings = props.map(([propName, propType]) => `  ${propName}: ${propType};`);
      return {
        name,
        definition: `interface ${name} {\n${propStrings.join('\n')}\n}`,
      };
    });

  // Arbitrary for generating type alias definitions
  const typeAliasArb = fc
    .tuple(typeNameArb, fc.oneof(simpleTypeArb, typeNameArb))
    .map(([name, baseType]) => ({
      name,
      definition: `type ${name} = ${baseType};`,
    }));

  // Arbitrary for generating type definitions (interfaces or type aliases)
  const typeDefArb = fc.oneof(interfaceArb, typeAliasArb);

  // Arbitrary for generating function parameters
  const paramArb = fc
    .tuple(fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/), fc.oneof(simpleTypeArb, typeNameArb))
    .map(([name, type]) => ({ name, type }));

  // Arbitrary for generating function signatures
  const functionSignatureArb = fc
    .tuple(
      fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/).filter((s) => s.length >= 3),
      fc.array(paramArb, { minLength: 0, maxLength: 4 }),
      fc.oneof(simpleTypeArb, typeNameArb, fc.constant('void'))
    )
    .map(([fnName, params, returnType]) => {
      const paramStrings = params.map((p) => `${p.name}: ${p.type}`);
      const signature = `function ${fnName}(${paramStrings.join(', ')}): ${returnType}`;
      return { fnName, signature, params, returnType };
    });

  describe('extractContext type name extraction', () => {
    it('should consistently extract all referenced type names from signatures', () => {
      fc.assert(
        fc.property(
          fc.array(typeDefArb, { minLength: 1, maxLength: 5 }),
          functionSignatureArb,
          (typeDefs, fnSig) => {
            // Build source file with type definitions and function
            const typeDefsText = typeDefs.map((t) => t.definition).join('\n\n');
            const usedTypeNames = new Set<string>();

            // Collect type names used in parameters and return type
            fnSig.params.forEach((p) => {
              const match = typeDefs.find((t) => t.name === p.type);
              if (match) {
                usedTypeNames.add(match.name);
              }
            });
            const returnMatch = typeDefs.find((t) => t.name === fnSig.returnType);
            if (returnMatch) {
              usedTypeNames.add(returnMatch.name);
            }

            if (usedTypeNames.size === 0) {
              // Skip if no custom types are used
              return true;
            }

            const sourceCode = `${typeDefsText}\n\nfunction ${fnSig.fnName}(${fnSig.params
              .map((p) => `${p.name}: ${p.type}`)
              .join(', ')}): ${fnSig.returnType} {\n  throw new Error('TODO');\n}`;

            project.createSourceFile(`/test/property-${fnSig.fnName}.ts`, sourceCode, {
              overwrite: true,
            });

            const todoFunction: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/property-${fnSig.fnName}.ts`,
              line: typeDefsText.split('\n').length + 3,
              signature: fnSig.signature,
              hasTodoBody: true,
            };

            const context = extractContext(project, todoFunction);
            const serialized = serializeContextForPrompt(context);

            // Property: All used type names should appear in either requiredTypes or serialized output
            usedTypeNames.forEach((typeName) => {
              const foundInTypes = context.requiredTypes.some((t) => t.name === typeName);
              const foundInSerialized = serialized.includes(typeName);
              expect(foundInTypes || foundInSerialized).toBe(true);
            });

            return true;
          }
        ),
        { seed: 42, numRuns: 50, endOnFailure: true }
      );
    });

    it('should include all extracted type names in serialized output', () => {
      fc.assert(
        fc.property(
          fc.array(typeDefArb, { minLength: 1, maxLength: 5 }),
          functionSignatureArb,
          (typeDefs, fnSig) => {
            const typeDefsText = typeDefs.map((t) => t.definition).join('\n\n');
            const usedTypeNames = new Set<string>();

            fnSig.params.forEach((p) => {
              const match = typeDefs.find((t) => t.name === p.type);
              if (match) {
                usedTypeNames.add(match.name);
              }
            });
            const returnMatch = typeDefs.find((t) => t.name === fnSig.returnType);
            if (returnMatch) {
              usedTypeNames.add(returnMatch.name);
            }

            if (usedTypeNames.size === 0) {
              return true;
            }

            const sourceCode = `${typeDefsText}\n\nfunction ${fnSig.fnName}(${fnSig.params
              .map((p) => `${p.name}: ${p.type}`)
              .join(', ')}): ${fnSig.returnType} {\n  throw new Error('TODO');\n}`;

            project.createSourceFile(`/test/serial-${fnSig.fnName}.ts`, sourceCode, {
              overwrite: true,
            });

            const todoFunction: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/serial-${fnSig.fnName}.ts`,
              line: typeDefsText.split('\n').length + 3,
              signature: fnSig.signature,
              hasTodoBody: true,
            };

            const context = extractContext(project, todoFunction);
            const serialized = serializeContextForPrompt(context);

            // Property: serialized output must contain all type names from requiredTypes
            context.requiredTypes.forEach((type) => {
              expect(serialized).toContain(type.name);
            });

            return true;
          }
        ),
        { seed: 123, numRuns: 50, endOnFailure: true }
      );
    });
  });

  describe('shouldEscalateToLargerModel monotonicity', () => {
    it('should have monotonic behavior with increasing contract count', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 10 }),
          fc.nat({ max: 5 }),
          functionSignatureArb,
          (baseContracts, additionalContracts, fnSig) => {
            // Generate two versions: one with baseContracts, one with baseContracts + additionalContracts
            const contracts1 = Array.from({ length: baseContracts }, (_, i) => ({
              tag: 'requires' as const,
              condition: `condition${String(i)} > 0`,
            }));

            const contracts2 = Array.from(
              { length: baseContracts + additionalContracts },
              (_, i) => ({
                tag: 'requires' as const,
                condition: `condition${String(i)} > 0`,
              })
            );

            const makeSource = (contracts: Array<{ tag: string; condition: string }>): string => {
              const jsdoc =
                contracts.length > 0
                  ? `/**\n${contracts.map((c) => ` * @${c.tag} ${c.condition}`).join('\n')}\n */\n`
                  : '';
              return `${jsdoc}function ${fnSig.fnName}(${fnSig.params
                .map((p) => `${p.name}: ${p.type}`)
                .join(', ')}): ${fnSig.returnType} {\n  throw new Error('TODO');\n}`;
            };

            const source1 = makeSource(contracts1);
            const source2 = makeSource(contracts2);

            project.createSourceFile(`/test/mono1-${fnSig.fnName}.ts`, source1);
            project.createSourceFile(`/test/mono2-${fnSig.fnName}.ts`, source2);

            const todoFunction1: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/mono1-${fnSig.fnName}.ts`,
              line: contracts1.length > 0 ? contracts1.length + 2 : 1,
              signature: fnSig.signature,
              hasTodoBody: true,
            };

            const todoFunction2: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/mono2-${fnSig.fnName}.ts`,
              line: contracts2.length > 0 ? contracts2.length + 2 : 1,
              signature: fnSig.signature,
              hasTodoBody: true,
            };

            const context1 = extractContext(project, todoFunction1);
            const context2 = extractContext(project, todoFunction2);

            const score1 = context1.sizeMetrics.totalCharacters;
            const score2 = context2.sizeMetrics.totalCharacters;

            // Property: Adding contracts should not decrease the complexity score
            // (represented by totalCharacters as a proxy)
            if (additionalContracts > 0) {
              expect(score2).toBeGreaterThanOrEqual(score1);
            }

            return true;
          }
        ),
        { seed: 789, numRuns: 50, endOnFailure: true }
      );
    });

    it('should have monotonic escalation behavior with increasing type complexity', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 3 }),
          fc.nat({ max: 3 }),
          functionSignatureArb,
          (baseTypeCount, additionalTypeCount, fnSig) => {
            // Create a chain of dependent types
            const makeTypeChain = (count: number): { types: string[]; usedType: string } => {
              if (count === 0) {
                return { types: [], usedType: 'number' };
              }

              const types: string[] = [];
              for (let i = 0; i < count; i++) {
                if (i === 0) {
                  types.push(`interface Type${String(i)} { value: number; }`);
                } else {
                  types.push(`interface Type${String(i)} { value: Type${String(i - 1)}; }`);
                }
              }
              return { types, usedType: `Type${String(count - 1)}` };
            };

            const chain1 = makeTypeChain(baseTypeCount);
            const chain2 = makeTypeChain(baseTypeCount + additionalTypeCount);

            const makeSource = (chain: { types: string[]; usedType: string }): string => {
              const typeDefs = chain.types.join('\n');
              return `${typeDefs}${typeDefs ? '\n\n' : ''}function ${fnSig.fnName}(param: ${
                chain.usedType
              }): void {\n  throw new Error('TODO');\n}`;
            };

            const source1 = makeSource(chain1);
            const source2 = makeSource(chain2);

            project.createSourceFile(`/test/complex1-${fnSig.fnName}.ts`, source1);
            project.createSourceFile(`/test/complex2-${fnSig.fnName}.ts`, source2);

            const todoFunction1: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/complex1-${fnSig.fnName}.ts`,
              line: chain1.types.length + (chain1.types.length > 0 ? 2 : 0) + 1,
              signature: `function ${fnSig.fnName}(param: ${chain1.usedType}): void`,
              hasTodoBody: true,
            };

            const todoFunction2: TodoFunction = {
              name: fnSig.fnName,
              filePath: `/test/complex2-${fnSig.fnName}.ts`,
              line: chain2.types.length + (chain2.types.length > 0 ? 2 : 0) + 1,
              signature: `function ${fnSig.fnName}(param: ${chain2.usedType}): void`,
              hasTodoBody: true,
            };

            const context1 = extractContext(project, todoFunction1);
            const context2 = extractContext(project, todoFunction2);

            // Property: More types should result in higher or equal type count
            if (additionalTypeCount > 0) {
              expect(context2.requiredTypes.length).toBeGreaterThanOrEqual(
                context1.requiredTypes.length
              );
            }

            // Property: More types should not decrease escalation likelihood
            // If context1 escalates, context2 should also escalate (with same threshold)
            const threshold = 50;
            const escalates1 = shouldEscalateToLargerModel(context1, threshold);
            const escalates2 = shouldEscalateToLargerModel(context2, threshold);

            if (escalates1 && additionalTypeCount > 0) {
              expect(escalates2).toBe(true);
            }

            return true;
          }
        ),
        { seed: 456, numRuns: 50, endOnFailure: true }
      );
    });
  });
});
