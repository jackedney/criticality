import { describe, it, expect, beforeEach } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import {
  extractSignature,
  extractOverloadSignatures,
  extractMethodOverloadSignatures,
  type SignatureNode,
} from './signature.js';
import { createProject } from './ast.js';

/**
 * Helper to assert a value is defined and return it with proper typing.
 */
function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

describe('extractSignature', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject();
  });

  /**
   * Helper to get the first function from source code.
   */
  function getFunction(code: string): SignatureNode {
    const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
    const func = sourceFile.getFunctions()[0];
    if (!func) {
      throw new Error('No function found in source code');
    }
    return func;
  }

  /**
   * Helper to get the first arrow function from source code.
   */
  function getArrowFunction(code: string): SignatureNode {
    const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
    const arrowFuncs = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
    const func = arrowFuncs[0];
    if (!func) {
      throw new Error('No arrow function found in source code');
    }
    return func;
  }

  /**
   * Helper to get the first method from a class in source code.
   */
  function getMethod(code: string): SignatureNode {
    const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
    const classDecl = sourceFile.getClasses()[0];
    if (!classDecl) {
      throw new Error('No class found in source code');
    }
    const method = classDecl.getMethods()[0];
    if (!method) {
      throw new Error('No method found in class');
    }
    return method;
  }

  /**
   * Helper to get a function expression from source code.
   */
  function getFunctionExpression(code: string): SignatureNode {
    const sourceFile = project.createSourceFile('test.ts', code, { overwrite: true });
    const funcExprs = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);
    const func = funcExprs[0];
    if (!func) {
      throw new Error('No function expression found in source code');
    }
    return func;
  }

  describe('basic function declarations', () => {
    it('extracts a simple function signature', () => {
      const func = getFunction(`
        function add(a: number, b: number): number {
          return a + b;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('add');
      expect(sig.parameters).toHaveLength(2);
      expect(sig.parameters[0]).toEqual({
        name: 'a',
        type: 'number',
        isOptional: false,
        isRest: false,
      });
      expect(sig.parameters[1]).toEqual({
        name: 'b',
        type: 'number',
        isOptional: false,
        isRest: false,
      });
      expect(sig.returnType).toBe('number');
      expect(sig.typeParameters).toHaveLength(0);
      expect(sig.isAsync).toBe(false);
      expect(sig.isGenerator).toBe(false);
    });

    it('extracts generic function signature', () => {
      const func = getFunction(`
        function identity<T>(value: T): T {
          return value;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('identity');
      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]).toEqual({ name: 'T' });
      expect(sig.parameters[0]?.type).toBe('T');
      expect(sig.returnType).toBe('T');
    });

    it('extracts function with multiple type parameters', () => {
      const func = getFunction(`
        function map<T, U>(arr: T[], fn: (item: T) => U): U[] {
          return arr.map(fn);
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('map');
      expect(sig.typeParameters).toHaveLength(2);
      expect(sig.typeParameters[0]?.name).toBe('T');
      expect(sig.typeParameters[1]?.name).toBe('U');
      expect(sig.parameters).toHaveLength(2);
      expect(sig.returnType).toBe('U[]');
    });

    it('extracts type parameter with constraint', () => {
      const func = getFunction(`
        function process<T extends object>(value: T): T {
          return value;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]).toEqual({
        name: 'T',
        constraint: 'object',
      });
    });

    it('extracts type parameter with default', () => {
      const func = getFunction(`
        function create<T = string>(): T {
          return undefined as T;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]).toEqual({
        name: 'T',
        default: 'string',
      });
    });

    it('extracts type parameter with constraint and default', () => {
      const func = getFunction(`
        function wrap<T extends object = Record<string, unknown>>(value: T): T {
          return value;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]).toEqual({
        name: 'T',
        constraint: 'object',
        default: 'Record<string, unknown>',
      });
    });
  });

  describe('async functions', () => {
    it('extracts async function signature with isAsync=true', () => {
      const func = getFunction(`
        async function fetchData(): Promise<string> {
          return "data";
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('fetchData');
      expect(sig.isAsync).toBe(true);
      expect(sig.returnType).toBe('Promise<string>');
    });

    it('extracts async function bar(): Promise<void> as specified in acceptance criteria', () => {
      const func = getFunction(`
        async function bar(): Promise<void> {
          await Promise.resolve();
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('bar');
      expect(sig.isAsync).toBe(true);
      expect(sig.returnType).toBe('Promise<void>');
    });
  });

  describe('generator functions', () => {
    it('extracts generator function signature with isGenerator=true', () => {
      const func = getFunction(`
        function* generateNumbers(): Generator<number> {
          yield 1;
          yield 2;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('generateNumbers');
      expect(sig.isGenerator).toBe(true);
      expect(sig.isAsync).toBe(false);
    });

    it('extracts async generator function', () => {
      const func = getFunction(`
        async function* asyncGenerator(): AsyncGenerator<number> {
          yield await Promise.resolve(1);
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('asyncGenerator');
      expect(sig.isAsync).toBe(true);
      expect(sig.isGenerator).toBe(true);
    });
  });

  describe('complex parameters', () => {
    it('extracts optional parameters', () => {
      const func = getFunction(`
        function greet(name: string, greeting?: string): string {
          return greeting ? \`\${greeting}, \${name}\` : \`Hello, \${name}\`;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.parameters).toHaveLength(2);
      expect(sig.parameters[0]?.isOptional).toBe(false);
      expect(sig.parameters[1]?.isOptional).toBe(true);
    });

    it('extracts parameters with default values', () => {
      const func = getFunction(`
        function greet(name: string, greeting: string = "Hello"): string {
          return \`\${greeting}, \${name}\`;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.parameters).toHaveLength(2);
      expect(sig.parameters[1]).toEqual({
        name: 'greeting',
        type: 'string',
        isOptional: true,
        isRest: false,
        defaultValue: '"Hello"',
      });
    });

    it('extracts rest parameters', () => {
      const func = getFunction(`
        function sum(...numbers: number[]): number {
          return numbers.reduce((a, b) => a + b, 0);
        }
      `);

      const sig = extractSignature(func);

      expect(sig.parameters).toHaveLength(1);
      expect(sig.parameters[0]).toEqual({
        name: 'numbers',
        type: 'number[]',
        isOptional: false,
        isRest: true,
      });
    });

    it('extracts complex parameter types', () => {
      const func = getFunction(`
        function process(data: { name: string; age: number }): void {
          console.log(data);
        }
      `);

      const sig = extractSignature(func);

      expect(sig.parameters).toHaveLength(1);
      expect(sig.parameters[0]?.type).toBe('{ name: string; age: number }');
    });
  });

  describe('acceptance criteria example: function foo<T>(x: T, y: number): Promise<T>', () => {
    it('extracts all components correctly', () => {
      const func = getFunction(`
        function foo<T>(x: T, y: number): Promise<T> {
          return Promise.resolve(x);
        }
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('foo');
      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]?.name).toBe('T');
      expect(sig.parameters).toHaveLength(2);
      expect(sig.parameters[0]?.name).toBe('x');
      expect(sig.parameters[0]?.type).toBe('T');
      expect(sig.parameters[1]?.name).toBe('y');
      expect(sig.parameters[1]?.type).toBe('number');
      expect(sig.returnType).toBe('Promise<T>');
    });
  });

  describe('arrow functions', () => {
    it('extracts arrow function assigned to variable', () => {
      const func = getArrowFunction(`
        const increment = (n: number): number => n + 1;
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('increment');
      expect(sig.parameters).toHaveLength(1);
      expect(sig.parameters[0]?.type).toBe('number');
      expect(sig.returnType).toBe('number');
      expect(sig.isAsync).toBe(false);
    });

    it('extracts generic arrow function', () => {
      const func = getArrowFunction(`
        const identity = <T>(value: T): T => value;
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('identity');
      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]?.name).toBe('T');
    });

    it('extracts async arrow function', () => {
      const func = getArrowFunction(`
        const fetchData = async (): Promise<string> => {
          return "data";
        };
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('fetchData');
      expect(sig.isAsync).toBe(true);
      expect(sig.isGenerator).toBe(false);
    });

    it('arrow functions cannot be generators (isGenerator=false)', () => {
      // Arrow functions syntactically cannot be generators
      const func = getArrowFunction(`
        const fn = (x: number): number => x * 2;
      `);

      const sig = extractSignature(func);

      expect(sig.isGenerator).toBe(false);
    });
  });

  describe('method declarations in classes', () => {
    it('extracts class method signature', () => {
      const method = getMethod(`
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `);

      const sig = extractSignature(method);

      expect(sig.name).toBe('add');
      expect(sig.parameters).toHaveLength(2);
      expect(sig.returnType).toBe('number');
    });

    it('extracts async class method', () => {
      const method = getMethod(`
        class DataService {
          async fetch(): Promise<string> {
            return "data";
          }
        }
      `);

      const sig = extractSignature(method);

      expect(sig.name).toBe('fetch');
      expect(sig.isAsync).toBe(true);
    });

    it('extracts generator method', () => {
      const method = getMethod(`
        class NumberGenerator {
          *generate(): Generator<number> {
            yield 1;
          }
        }
      `);

      const sig = extractSignature(method);

      expect(sig.name).toBe('generate');
      expect(sig.isGenerator).toBe(true);
    });

    it('extracts generic method', () => {
      const method = getMethod(`
        class Container {
          wrap<T>(value: T): T[] {
            return [value];
          }
        }
      `);

      const sig = extractSignature(method);

      expect(sig.name).toBe('wrap');
      expect(sig.typeParameters).toHaveLength(1);
      expect(sig.typeParameters[0]?.name).toBe('T');
    });
  });

  describe('method declarations in object literals', () => {
    it('extracts method from object literal', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        const obj = {
          calculate(x: number): number {
            return x * 2;
          }
        };
      `,
        { overwrite: true }
      );

      // Get the method from the object literal
      const methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
      const method = assertDefined(methods[0], 'Expected method in object literal');

      const sig = extractSignature(method);

      expect(sig.name).toBe('calculate');
      expect(sig.parameters).toHaveLength(1);
    });

    it('extracts arrow function from property assignment', () => {
      const func = getArrowFunction(`
        const obj = {
          process: (x: number): number => x + 1
        };
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('process');
    });
  });

  describe('function expressions', () => {
    it('extracts named function expression', () => {
      const func = getFunctionExpression(`
        const fn = function multiply(a: number, b: number): number {
          return a * b;
        };
      `);

      const sig = extractSignature(func);

      // Function expression name is "multiply", but we use the variable name
      // since it's more useful for identification
      expect(sig.name).toBe('fn');
    });

    it('extracts function expression assigned to variable', () => {
      const func = getFunctionExpression(`
        const compute = function(x: number): number {
          return x * 2;
        };
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('compute');
      expect(sig.parameters).toHaveLength(1);
    });

    it('extracts generator function expression', () => {
      const func = getFunctionExpression(`
        const gen = function*(): Generator<number> {
          yield 1;
        };
      `);

      const sig = extractSignature(func);

      expect(sig.name).toBe('gen');
      expect(sig.isGenerator).toBe(true);
    });
  });

  describe('anonymous functions', () => {
    it('returns <anonymous> for anonymous function expression without variable binding', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        [1, 2, 3].map(function(x: number): number { return x * 2; });
      `,
        { overwrite: true }
      );

      const funcExprs = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);
      const func = assertDefined(funcExprs[0], 'Expected function expression');

      const sig = extractSignature(func);

      expect(sig.name).toBe('<anonymous>');
    });

    it('returns <anonymous> for anonymous arrow function passed as callback', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        [1, 2, 3].map((x: number): number => x * 2);
      `,
        { overwrite: true }
      );

      const arrowFuncs = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
      const func = assertDefined(arrowFuncs[0], 'Expected arrow function');

      const sig = extractSignature(func);

      expect(sig.name).toBe('<anonymous>');
    });

    it('returns <anonymous> for immediately invoked function expression', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        (function(x: number): number { return x; })(5);
      `,
        { overwrite: true }
      );

      const funcExprs = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);
      const func = assertDefined(funcExprs[0], 'Expected function expression');

      const sig = extractSignature(func);

      expect(sig.name).toBe('<anonymous>');
    });
  });

  describe('complex return types', () => {
    it('extracts union return type', () => {
      const func = getFunction(`
        function parse(input: string): number | null {
          return input ? parseInt(input) : null;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.returnType).toBe('number | null');
    });

    it('extracts intersection return type', () => {
      const func = getFunction(`
        function merge<A, B>(a: A, b: B): A & B {
          return { ...a, ...b } as A & B;
        }
      `);

      const sig = extractSignature(func);

      expect(sig.returnType).toBe('A & B');
    });

    it('extracts complex generic return type', () => {
      const func = getFunction(`
        function createMap<K, V>(): Map<K, V> {
          return new Map();
        }
      `);

      const sig = extractSignature(func);

      expect(sig.returnType).toBe('Map<K, V>');
    });
  });
});

describe('extractOverloadSignatures', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject();
  });

  it('extracts all overload signatures from function declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function parse(input: string): number;
      function parse(input: number): string;
      function parse(input: string | number): number | string {
        return typeof input === 'string' ? parseInt(input) : String(input);
      }
    `,
      { overwrite: true }
    );

    // Get the implementation (last function declaration with same name)
    const func = assertDefined(
      sourceFile.getFunctions().find((f) => !f.isOverload()),
      'Expected function implementation'
    );

    const overloads = extractOverloadSignatures(func);

    expect(overloads).toHaveLength(2);
    expect(overloads[0]?.parameters[0]?.type).toBe('string');
    expect(overloads[0]?.returnType).toBe('number');
    expect(overloads[1]?.parameters[0]?.type).toBe('number');
    expect(overloads[1]?.returnType).toBe('string');
  });

  it('returns empty array when no overloads exist', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function simple(x: number): number {
        return x;
      }
    `,
      { overwrite: true }
    );

    const func = assertDefined(sourceFile.getFunctions()[0], 'Expected function');

    const overloads = extractOverloadSignatures(func);

    expect(overloads).toHaveLength(0);
  });

  it('extracts overloads with different parameter counts', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function create(): object;
      function create(name: string): object;
      function create(name: string, value: number): object;
      function create(name?: string, value?: number): object {
        return { name, value };
      }
    `,
      { overwrite: true }
    );

    const func = assertDefined(
      sourceFile.getFunctions().find((f) => !f.isOverload()),
      'Expected function implementation'
    );

    const overloads = extractOverloadSignatures(func);

    expect(overloads).toHaveLength(3);
    expect(overloads[0]?.parameters).toHaveLength(0);
    expect(overloads[1]?.parameters).toHaveLength(1);
    expect(overloads[2]?.parameters).toHaveLength(2);
  });

  it('extracts generic overloads', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function wrap<T>(value: T): T[];
      function wrap<T>(value: T, count: number): T[];
      function wrap<T>(value: T, count?: number): T[] {
        return count ? Array(count).fill(value) : [value];
      }
    `,
      { overwrite: true }
    );

    const func = assertDefined(
      sourceFile.getFunctions().find((f) => !f.isOverload()),
      'Expected function implementation'
    );

    const overloads = extractOverloadSignatures(func);

    expect(overloads).toHaveLength(2);
    expect(overloads[0]?.typeParameters).toHaveLength(1);
    expect(overloads[0]?.typeParameters[0]?.name).toBe('T');
  });
});

describe('extractMethodOverloadSignatures', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject();
  });

  it('extracts all overload signatures from method declaration', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      class Converter {
        convert(input: string): number;
        convert(input: number): string;
        convert(input: string | number): number | string {
          return typeof input === 'string' ? parseInt(input) : String(input);
        }
      }
    `,
      { overwrite: true }
    );

    const classDecl = assertDefined(sourceFile.getClasses()[0], 'Expected class declaration');

    // Get the implementation method (not an overload)
    const method = assertDefined(
      classDecl.getMethods().find((m) => !m.isOverload() && m.getName() === 'convert'),
      'Expected method implementation'
    );

    const overloads = extractMethodOverloadSignatures(method);

    expect(overloads).toHaveLength(2);
    expect(overloads[0]?.name).toBe('convert');
    expect(overloads[0]?.parameters[0]?.type).toBe('string');
    expect(overloads[0]?.returnType).toBe('number');
    expect(overloads[1]?.parameters[0]?.type).toBe('number');
    expect(overloads[1]?.returnType).toBe('string');
  });

  it('returns empty array when no method overloads exist', () => {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      class Simple {
        process(x: number): number {
          return x * 2;
        }
      }
    `,
      { overwrite: true }
    );

    const classDecl = assertDefined(sourceFile.getClasses()[0], 'Expected class declaration');

    const method = assertDefined(classDecl.getMethods()[0], 'Expected method');

    const overloads = extractMethodOverloadSignatures(method);

    expect(overloads).toHaveLength(0);
  });
});
