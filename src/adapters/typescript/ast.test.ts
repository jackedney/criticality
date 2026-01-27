import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Project } from 'ts-morph';
import {
  createProject,
  TsConfigNotFoundError,
  findTodoFunctions,
  injectFunctionBody,
  FunctionNotFoundError,
  InvalidBodySyntaxError,
  orderByDependency,
  type TodoFunction,
} from './ast.js';

describe('createProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('with tsconfig.json path', () => {
    it('returns a Project instance when valid tsconfig.json exists', () => {
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      const tsConfigContent = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          strict: true,
        },
      };
      fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfigContent, null, 2));

      const project = createProject(tsConfigPath);

      expect(project).toBeInstanceOf(Project);
    });

    it('uses compiler options from the provided tsconfig.json', () => {
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      const tsConfigContent = {
        compilerOptions: {
          target: 'ES2020',
          strict: false,
          noImplicitAny: false,
        },
      };
      fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfigContent, null, 2));

      const project = createProject(tsConfigPath);
      const compilerOptions = project.getCompilerOptions();

      // ts-morph resolves paths, so check a boolean option instead
      expect(compilerOptions.strict).toBe(false);
      expect(compilerOptions.noImplicitAny).toBe(false);
    });

    it('throws TsConfigNotFoundError for nonexistent path', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.json');

      expect(() => createProject(nonExistentPath)).toThrow(TsConfigNotFoundError);
    });

    it('includes the path in the error message', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.json');

      expect(() => createProject(nonExistentPath)).toThrow(
        new RegExp(nonExistentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
    });

    it('resolves relative paths correctly', () => {
      const tsConfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: {} }));

      const cwd = process.cwd();
      process.chdir(tempDir);
      try {
        const project = createProject('./tsconfig.json');
        expect(project).toBeInstanceOf(Project);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  describe('without arguments (default options)', () => {
    it('returns a Project instance', () => {
      const project = createProject();

      expect(project).toBeInstanceOf(Project);
    });

    it('uses strict: true by default', () => {
      const project = createProject();
      const compilerOptions = project.getCompilerOptions();

      expect(compilerOptions.strict).toBe(true);
    });

    it('enables esModuleInterop by default', () => {
      const project = createProject();
      const compilerOptions = project.getCompilerOptions();

      expect(compilerOptions.esModuleInterop).toBe(true);
    });

    it('enables skipLibCheck by default', () => {
      const project = createProject();
      const compilerOptions = project.getCompilerOptions();

      expect(compilerOptions.skipLibCheck).toBe(true);
    });

    it('enables declaration by default', () => {
      const project = createProject();
      const compilerOptions = project.getCompilerOptions();

      expect(compilerOptions.declaration).toBe(true);
    });
  });

  describe('TsConfigNotFoundError', () => {
    it('has the correct name property', () => {
      const error = new TsConfigNotFoundError('/path/to/config.json');

      expect(error.name).toBe('TsConfigNotFoundError');
    });

    it('is an instance of Error', () => {
      const error = new TsConfigNotFoundError('/path/to/config.json');

      expect(error).toBeInstanceOf(Error);
    });

    it('includes the path in the message', () => {
      const testPath = '/some/path/tsconfig.json';
      const error = new TsConfigNotFoundError(testPath);

      expect(error.message).toContain(testPath);
    });
  });
});

describe('findTodoFunctions', () => {
  let tempDir: string;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-test-'));
    project = createProject();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function addSourceFile(filename: string, content: string): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    project.addSourceFileAtPath(filePath);
    return filePath;
  }

  describe('detecting TODO patterns', () => {
    it('detects throw new Error("TODO") with single quotes', () => {
      const filePath = addSourceFile(
        'single-quotes.ts',
        `
        export function add(a: number, b: number): number {
          throw new Error('TODO');
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('add');
      expect(todos[0]?.filePath).toBe(filePath);
      expect(todos[0]?.hasTodoBody).toBe(true);
    });

    it('detects throw new Error("TODO") with double quotes', () => {
      addSourceFile(
        'double-quotes.ts',
        `
        export function multiply(a: number, b: number): number {
          throw new Error("TODO");
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('multiply');
    });

    it('detects todo!() macro-style comment pattern', () => {
      addSourceFile(
        'macro-style.ts',
        `
        export function subtract(a: number, b: number): number {
          // todo!()
          return 0;
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('subtract');
    });

    it('detects TODO with extra whitespace', () => {
      addSourceFile(
        'whitespace.ts',
        `
        export function process(): void {
          throw  new   Error(  'TODO'  );
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
    });
  });

  describe('negative cases', () => {
    it('does NOT detect implemented functions', () => {
      addSourceFile(
        'implemented.ts',
        `
        export function divide(a: number, b: number): number {
          return a / b;
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(0);
    });

    it('does NOT detect throw new Error("Something else")', () => {
      addSourceFile(
        'other-error.ts',
        `
        export function validate(input: string): void {
          throw new Error('Something else');
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(0);
    });

    it('does NOT detect // TODO comment without throw', () => {
      addSourceFile(
        'comment-only.ts',
        `
        export function calculate(x: number): number {
          // TODO: implement this properly
          return x * 2;
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(0);
    });
  });

  describe('TodoFunction interface', () => {
    it('includes all required fields', () => {
      const filePath = addSourceFile(
        'full-signature.ts',
        `
        export function processData(input: string, count: number): Promise<string[]> {
          throw new Error('TODO');
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      const todo = todos[0];
      expect(todo).toBeDefined();

      expect(todo?.name).toBe('processData');
      expect(todo?.filePath).toBe(filePath);
      expect(todo?.line).toBeGreaterThan(0);
      expect(todo?.signature).toContain('processData');
      expect(todo?.signature).toContain('input: string');
      expect(todo?.signature).toContain('count: number');
      expect(todo?.signature).toContain('Promise<string[]>');
      expect(todo?.hasTodoBody).toBe(true);
    });

    it('extracts signature without the body', () => {
      addSourceFile(
        'signature.ts',
        `
        export function add(a: number, b: number): number {
          throw new Error('TODO');
        }
      `
      );

      const todos = findTodoFunctions(project);
      const todo = todos[0];
      expect(todo).toBeDefined();

      expect(todo?.signature).not.toContain('throw');
      expect(todo?.signature).not.toContain('Error');
    });
  });

  describe('class methods', () => {
    it('detects TODO in class methods', () => {
      addSourceFile(
        'class-method.ts',
        `
        export class Calculator {
          add(a: number, b: number): number {
            throw new Error('TODO');
          }

          subtract(a: number, b: number): number {
            return a - b;
          }
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('add');
    });
  });

  describe('arrow functions', () => {
    it('detects TODO in arrow functions assigned to variables', () => {
      addSourceFile(
        'arrow.ts',
        `
        export const increment = (n: number): number => {
          throw new Error('TODO');
        };
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('increment');
    });

    it('detects TODO in arrow functions without implemented siblings', () => {
      addSourceFile(
        'arrows.ts',
        `
        export const increment = (n: number): number => {
          throw new Error('TODO');
        };

        export const decrement = (n: number): number => {
          return n - 1;
        };
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('increment');
    });
  });

  describe('topological ordering', () => {
    it('returns functions sorted with leaves first', () => {
      addSourceFile(
        'dependency-chain.ts',
        `
        export function functionA(): number {
          throw new Error('TODO');
          return functionB() + 1;
        }

        export function functionB(): number {
          throw new Error('TODO');
          return functionC() * 2;
        }

        export function functionC(): number {
          throw new Error('TODO');
          return 42;
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(3);
      // C is a leaf (called by B, calls nothing)
      // B is called by A, calls C
      // A is the root (calls B, called by nothing)
      // Expected order: C first, then B, then A
      expect(todos[0]?.name).toBe('functionC');
      expect(todos[1]?.name).toBe('functionB');
      expect(todos[2]?.name).toBe('functionA');
    });

    it('handles functions with no dependencies (all leaves)', () => {
      addSourceFile(
        'no-deps.ts',
        `
        export function alpha(): number {
          throw new Error('TODO');
        }

        export function beta(): number {
          throw new Error('TODO');
        }

        export function gamma(): number {
          throw new Error('TODO');
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(3);
      // All are leaves, should be sorted alphabetically for determinism
      expect(todos[0]?.name).toBe('alpha');
      expect(todos[1]?.name).toBe('beta');
      expect(todos[2]?.name).toBe('gamma');
    });

    it('handles functions calling external (non-TODO) functions as leaves', () => {
      addSourceFile(
        'external-deps.ts',
        `
        function helperImpl(): number {
          return 42;
        }

        export function todoFunc(): number {
          throw new Error('TODO');
          return helperImpl();
        }
      `
      );

      const todos = findTodoFunctions(project);

      // todoFunc calls helperImpl (not a TODO), so it's treated as a leaf
      expect(todos).toHaveLength(1);
      expect(todos[0]?.name).toBe('todoFunc');
    });
  });

  describe('mixed patterns', () => {
    it('detects multiple TODO functions with various patterns', () => {
      addSourceFile(
        'mixed.ts',
        `
        export function todoSingle(x: number): number {
          throw new Error('TODO');
        }

        export function todoDouble(x: number): number {
          throw new Error("TODO");
        }

        export function todoMacro(x: number): number {
          // todo!()
          return 0;
        }

        export function implemented(x: number): number {
          return x * 2;
        }

        export function notTodo(x: number): number {
          throw new Error('Not implemented yet');
        }
      `
      );

      const todos = findTodoFunctions(project);

      expect(todos).toHaveLength(3);
      const names = todos.map((t) => t.name);
      expect(names).toContain('todoSingle');
      expect(names).toContain('todoDouble');
      expect(names).toContain('todoMacro');
      expect(names).not.toContain('implemented');
      expect(names).not.toContain('notTodo');
    });
  });

  describe('using test fixture files', () => {
    it('detects TODO in fixture file with single quotes', () => {
      const fixtureDir = path.resolve(process.cwd(), 'test-fixtures/todo-patterns');
      const fixturePath = path.join(fixtureDir, 'todo-single-quotes.ts');

      if (fs.existsSync(fixturePath)) {
        const fixtureProject = createProject();
        fixtureProject.addSourceFileAtPath(fixturePath);

        const todos = findTodoFunctions(fixtureProject);

        expect(todos).toHaveLength(1);
        expect(todos[0]?.name).toBe('add');
      }
    });

    it('detects TODO in fixture file with double quotes', () => {
      const fixtureDir = path.resolve(process.cwd(), 'test-fixtures/todo-patterns');
      const fixturePath = path.join(fixtureDir, 'todo-double-quotes.ts');

      if (fs.existsSync(fixturePath)) {
        const fixtureProject = createProject();
        fixtureProject.addSourceFileAtPath(fixturePath);

        const todos = findTodoFunctions(fixtureProject);

        expect(todos).toHaveLength(1);
        expect(todos[0]?.name).toBe('multiply');
      }
    });
  });
});

describe('injectFunctionBody', () => {
  let tempDir: string;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-test-'));
    project = createProject();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function addSourceFile(filename: string, content: string): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    project.addSourceFileAtPath(filePath);
    return filePath;
  }

  function readFileContent(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  describe('basic injection', () => {
    it('injects body into function with throw new Error("TODO")', () => {
      const filePath = addSourceFile(
        'add.ts',
        `export function add(a: number, b: number): number {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'add', 'return a + b;');

      const content = readFileContent(filePath);
      expect(content).toContain('return a + b;');
      expect(content).not.toContain("throw new Error('TODO')");
    });

    it('preserves function signature', () => {
      const filePath = addSourceFile(
        'multiply.ts',
        `export function multiply(a: number, b: number): number {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'multiply', 'return a * b;');

      const content = readFileContent(filePath);
      expect(content).toContain('function multiply(a: number, b: number): number');
    });

    it('preserves export modifier', () => {
      const filePath = addSourceFile(
        'exported.ts',
        `export function exported(): string {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'exported', "return 'hello';");

      const content = readFileContent(filePath);
      expect(content).toContain('export function exported');
    });
  });

  describe('preserving decorators and JSDoc', () => {
    it('preserves JSDoc comments', () => {
      const filePath = addSourceFile(
        'documented.ts',
        `/**
 * Adds two numbers.
 * @param a First number
 * @param b Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'add', 'return a + b;');

      const content = readFileContent(filePath);
      expect(content).toContain('Adds two numbers.');
      expect(content).toContain('@param a First number');
      expect(content).toContain('@returns Sum of a and b');
      expect(content).toContain('return a + b;');
    });

    it('preserves decorators on class methods', () => {
      const filePath = addSourceFile(
        'decorated.ts',
        `function MyDecorator(target: unknown, key: string) {}

class Service {
  @MyDecorator
  process(input: string): string {
    throw new Error('TODO');
  }
}`
      );

      injectFunctionBody(project, filePath, 'process', 'return input.toUpperCase();');

      const content = readFileContent(filePath);
      expect(content).toContain('@MyDecorator');
      expect(content).toContain('return input.toUpperCase();');
    });
  });

  describe('async functions', () => {
    it('handles async function with await in body', () => {
      const filePath = addSourceFile(
        'async-func.ts',
        `export async function fetchData(url: string): Promise<string> {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(
        project,
        filePath,
        'fetchData',
        `const response = await fetch(url);
return await response.text();`
      );

      const content = readFileContent(filePath);
      expect(content).toContain('await fetch(url)');
      expect(content).toContain('await response.text()');
    });

    it('preserves async modifier', () => {
      const filePath = addSourceFile(
        'async-preserve.ts',
        `export async function asyncFunc(): Promise<number> {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'asyncFunc', 'return await Promise.resolve(42);');

      const content = readFileContent(filePath);
      expect(content).toContain('async function asyncFunc');
    });
  });

  describe('generator functions', () => {
    it('handles generator function with yield in body', () => {
      const filePath = addSourceFile(
        'generator.ts',
        `export function* range(start: number, end: number): Generator<number> {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(
        project,
        filePath,
        'range',
        `for (let i = start; i < end; i++) {
  yield i;
}`
      );

      const content = readFileContent(filePath);
      expect(content).toContain('yield i;');
    });

    it('preserves generator asterisk', () => {
      const filePath = addSourceFile(
        'generator-preserve.ts',
        `export function* numbers(): Generator<number> {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'numbers', 'yield 1; yield 2; yield 3;');

      const content = readFileContent(filePath);
      expect(content).toContain('function* numbers');
    });
  });

  describe('class methods', () => {
    it('injects body into class method', () => {
      const filePath = addSourceFile(
        'calculator.ts',
        `export class Calculator {
  add(a: number, b: number): number {
    throw new Error('TODO');
  }
}`
      );

      injectFunctionBody(project, filePath, 'add', 'return a + b;');

      const content = readFileContent(filePath);
      expect(content).toContain('return a + b;');
      expect(content).not.toContain("throw new Error('TODO')");
    });

    it('preserves class structure', () => {
      const filePath = addSourceFile(
        'service.ts',
        `export class Service {
  private value: number = 0;

  getValue(): number {
    throw new Error('TODO');
  }

  setValue(v: number): void {
    this.value = v;
  }
}`
      );

      injectFunctionBody(project, filePath, 'getValue', 'return this.value;');

      const content = readFileContent(filePath);
      expect(content).toContain('private value: number = 0;');
      expect(content).toContain('return this.value;');
      expect(content).toContain('setValue(v: number): void');
    });
  });

  describe('arrow functions', () => {
    it('injects body into arrow function assigned to variable', () => {
      const filePath = addSourceFile(
        'arrow.ts',
        `export const increment = (n: number): number => {
  throw new Error('TODO');
};`
      );

      injectFunctionBody(project, filePath, 'increment', 'return n + 1;');

      const content = readFileContent(filePath);
      expect(content).toContain('return n + 1;');
    });

    it('handles async arrow function', () => {
      const filePath = addSourceFile(
        'async-arrow.ts',
        `export const asyncFunc = async (x: number): Promise<number> => {
  throw new Error('TODO');
};`
      );

      injectFunctionBody(project, filePath, 'asyncFunc', 'return await Promise.resolve(x * 2);');

      const content = readFileContent(filePath);
      expect(content).toContain('await Promise.resolve(x * 2)');
    });
  });

  describe('function expressions', () => {
    it('injects body into function expression assigned to variable', () => {
      const filePath = addSourceFile(
        'func-expr.ts',
        `export const double = function(n: number): number {
  throw new Error('TODO');
};`
      );

      injectFunctionBody(project, filePath, 'double', 'return n * 2;');

      const content = readFileContent(filePath);
      expect(content).toContain('return n * 2;');
    });
  });

  describe('preserving surrounding code', () => {
    it('preserves code before and after the function', () => {
      const filePath = addSourceFile(
        'surrounded.ts',
        `import { something } from 'somewhere';

const CONSTANT = 42;

export function add(a: number, b: number): number {
  throw new Error('TODO');
}

export function existingFunc(): void {
  console.log('existing');
}

export const exportedValue = 'hello';`
      );

      injectFunctionBody(project, filePath, 'add', 'return a + b;');

      const content = readFileContent(filePath);
      expect(content).toContain("import { something } from 'somewhere';");
      expect(content).toContain('const CONSTANT = 42;');
      expect(content).toContain('return a + b;');
      expect(content).toContain("console.log('existing');");
      expect(content).toContain("export const exportedValue = 'hello';");
    });

    it('does not modify other functions in the file', () => {
      const filePath = addSourceFile(
        'multiple.ts',
        `export function first(): number {
  throw new Error('TODO');
}

export function second(): string {
  return 'already implemented';
}

export function third(): boolean {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'first', 'return 1;');

      const content = readFileContent(filePath);
      expect(content).toContain('return 1;');
      expect(content).toContain("return 'already implemented';");
      expect(content).toContain("throw new Error('TODO');"); // third function still has TODO
    });
  });

  describe('negative cases', () => {
    it('throws FunctionNotFoundError for non-existent function', () => {
      const filePath = addSourceFile(
        'existing.ts',
        `export function existing(): void {
  throw new Error('TODO');
}`
      );

      expect(() => {
        injectFunctionBody(project, filePath, 'nonExistent', 'return 42;');
      }).toThrow(FunctionNotFoundError);
    });

    it('throws FunctionNotFoundError with function name in message', () => {
      const filePath = addSourceFile('test.ts', `export function test(): void {}`);

      expect(() => {
        injectFunctionBody(project, filePath, 'missing', 'return;');
      }).toThrow(/missing/);
    });

    it('throws FunctionNotFoundError with file path in message', () => {
      const filePath = addSourceFile('test2.ts', `export function test(): void {}`);

      expect(() => {
        injectFunctionBody(project, filePath, 'missing', 'return;');
      }).toThrow(new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('throws FunctionNotFoundError for non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.ts');

      expect(() => {
        injectFunctionBody(project, nonExistentPath, 'any', 'return;');
      }).toThrow(FunctionNotFoundError);
    });

    it('throws InvalidBodySyntaxError for syntactically invalid body', () => {
      const filePath = addSourceFile(
        'syntax-error.ts',
        `export function test(): void {
  throw new Error('TODO');
}`
      );

      expect(() => {
        injectFunctionBody(project, filePath, 'test', 'return {{{ invalid syntax');
      }).toThrow(InvalidBodySyntaxError);
    });

    it('throws InvalidBodySyntaxError with function name in message', () => {
      const filePath = addSourceFile(
        'syntax-error2.ts',
        `export function myFunc(): void {
  throw new Error('TODO');
}`
      );

      expect(() => {
        injectFunctionBody(project, filePath, 'myFunc', 'return )');
      }).toThrow(/myFunc/);
    });

    it('does not save file when body is invalid', () => {
      const filePath = addSourceFile(
        'no-save.ts',
        `export function test(): number {
  throw new Error('TODO');
}`
      );

      const originalContent = readFileContent(filePath);

      try {
        injectFunctionBody(project, filePath, 'test', 'return {{{');
      } catch {
        // Expected to throw
      }

      const afterContent = readFileContent(filePath);
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('edge cases', () => {
    it('handles multi-line body', () => {
      const filePath = addSourceFile(
        'multiline.ts',
        `export function process(items: number[]): number {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(
        project,
        filePath,
        'process',
        `let sum = 0;
for (const item of items) {
  sum += item;
}
return sum;`
      );

      const content = readFileContent(filePath);
      expect(content).toContain('let sum = 0;');
      expect(content).toContain('for (const item of items)');
      expect(content).toContain('return sum;');
    });

    it('handles empty body', () => {
      const filePath = addSourceFile(
        'empty.ts',
        `export function noop(): void {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'noop', '');

      const content = readFileContent(filePath);
      expect(content).not.toContain("throw new Error('TODO')");
    });

    it('handles body with comments', () => {
      const filePath = addSourceFile(
        'comments.ts',
        `export function withComments(): number {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(
        project,
        filePath,
        'withComments',
        `// This is the implementation
const value = 42; // the answer
/* multi-line
   comment */
return value;`
      );

      const content = readFileContent(filePath);
      expect(content).toContain('// This is the implementation');
      expect(content).toContain('return value;');
    });

    it('handles generic function', () => {
      const filePath = addSourceFile(
        'generic.ts',
        `export function identity<T>(value: T): T {
  throw new Error('TODO');
}`
      );

      injectFunctionBody(project, filePath, 'identity', 'return value;');

      const content = readFileContent(filePath);
      expect(content).toContain('function identity<T>(value: T): T');
      expect(content).toContain('return value;');
    });
  });

  describe('error classes', () => {
    it('FunctionNotFoundError has correct name property', () => {
      const error = new FunctionNotFoundError('myFunc', '/path/to/file.ts');

      expect(error.name).toBe('FunctionNotFoundError');
    });

    it('FunctionNotFoundError is an instance of Error', () => {
      const error = new FunctionNotFoundError('myFunc', '/path/to/file.ts');

      expect(error).toBeInstanceOf(Error);
    });

    it('InvalidBodySyntaxError has correct name property', () => {
      const error = new InvalidBodySyntaxError('myFunc', 'unexpected token');

      expect(error.name).toBe('InvalidBodySyntaxError');
    });

    it('InvalidBodySyntaxError is an instance of Error', () => {
      const error = new InvalidBodySyntaxError('myFunc', 'unexpected token');

      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe('orderByDependency', () => {
  let tempDir: string;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topo-test-'));
    project = createProject();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function addSourceFile(filename: string, content: string): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    project.addSourceFileAtPath(filePath);
    return filePath;
  }

  function createTodoFunction(name: string, filePath: string, line: number): TodoFunction {
    return {
      name,
      filePath,
      line,
      signature: `function ${name}()`,
      hasTodoBody: true,
    };
  }

  describe('linear dependency chain', () => {
    it('returns functions in topological order (leaves first) for A -> B -> C', () => {
      const filePath = addSourceFile(
        'chain.ts',
        `
        export function functionA(): number {
          return functionB() + 1;
        }

        export function functionB(): number {
          return functionC() * 2;
        }

        export function functionC(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('functionA', filePath, 2),
        createTodoFunction('functionB', filePath, 6),
        createTodoFunction('functionC', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(3);
      // C is a leaf (called by B, calls nothing)
      // B is called by A, calls C
      // A is the root (calls B, called by nothing)
      // Expected order: C first, then B, then A
      expect(ordered[0]?.name).toBe('functionC');
      expect(ordered[1]?.name).toBe('functionB');
      expect(ordered[2]?.name).toBe('functionA');
    });
  });

  describe('independent functions (no dependencies)', () => {
    it('returns functions sorted alphabetically for determinism', () => {
      const filePath = addSourceFile(
        'independent.ts',
        `
        export function zeta(): number {
          return 1;
        }

        export function alpha(): number {
          return 2;
        }

        export function beta(): number {
          return 3;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('zeta', filePath, 2),
        createTodoFunction('alpha', filePath, 6),
        createTodoFunction('beta', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(3);
      // All are leaves, should be sorted alphabetically for determinism
      expect(ordered[0]?.name).toBe('alpha');
      expect(ordered[1]?.name).toBe('beta');
      expect(ordered[2]?.name).toBe('zeta');
    });
  });

  describe('cycle handling', () => {
    it('groups functions in a two-node cycle together', () => {
      const filePath = addSourceFile(
        'cycle-two.ts',
        `
        export function funcA(): number {
          return funcB() + 1;
        }

        export function funcB(): number {
          return funcA() - 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('funcA', filePath, 2),
        createTodoFunction('funcB', filePath, 6),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // Both should be in the result, adjacent to each other (as a batch)
      const names = ordered.map((f) => f.name);
      expect(names).toContain('funcA');
      expect(names).toContain('funcB');
      // They should be adjacent (both in the same SCC batch)
      const indexA = names.indexOf('funcA');
      const indexB = names.indexOf('funcB');
      expect(Math.abs(indexA - indexB)).toBe(1);
    });

    it('groups functions in a three-node cycle together', () => {
      const filePath = addSourceFile(
        'cycle-three.ts',
        `
        export function cycleA(): number {
          return cycleB() + 1;
        }

        export function cycleB(): number {
          return cycleC() + 1;
        }

        export function cycleC(): number {
          return cycleA() + 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('cycleA', filePath, 2),
        createTodoFunction('cycleB', filePath, 6),
        createTodoFunction('cycleC', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(3);
      // All three should be grouped together as a batch
      const names = ordered.map((f) => f.name);
      expect(names).toContain('cycleA');
      expect(names).toContain('cycleB');
      expect(names).toContain('cycleC');
    });

    it('handles cycle with external dependency', () => {
      const filePath = addSourceFile(
        'cycle-with-external.ts',
        `
        export function cycleX(): number {
          return cycleY() + helper();
        }

        export function cycleY(): number {
          return cycleX() - 1;
        }

        function helper(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('cycleX', filePath, 2),
        createTodoFunction('cycleY', filePath, 6),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      const names = ordered.map((f) => f.name);
      expect(names).toContain('cycleX');
      expect(names).toContain('cycleY');
    });

    it('orders cycle after its dependencies', () => {
      const filePath = addSourceFile(
        'cycle-with-dependency.ts',
        `
        export function leaf(): number {
          return 1;
        }

        export function cycleP(): number {
          return cycleQ() + leaf();
        }

        export function cycleQ(): number {
          return cycleP() - 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('leaf', filePath, 2),
        createTodoFunction('cycleP', filePath, 6),
        createTodoFunction('cycleQ', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(3);
      // leaf should come first as it has no dependencies
      expect(ordered[0]?.name).toBe('leaf');
      // Then the cycle (cycleP and cycleQ)
      const remainingNames = ordered.slice(1).map((f) => f.name);
      expect(remainingNames).toContain('cycleP');
      expect(remainingNames).toContain('cycleQ');
    });

    it('handles diamond dependency with cycle', () => {
      const filePath = addSourceFile(
        'diamond-cycle.ts',
        `
        export function top(): number {
          return left() + right();
        }

        export function left(): number {
          return bottom();
        }

        export function right(): number {
          return bottom();
        }

        export function bottom(): number {
          return 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('top', filePath, 2),
        createTodoFunction('left', filePath, 6),
        createTodoFunction('right', filePath, 10),
        createTodoFunction('bottom', filePath, 14),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(4);
      // bottom should come first (leaf)
      expect(ordered[0]?.name).toBe('bottom');
      // left and right can be in any order (both depend on bottom)
      const middleNames = ordered.slice(1, 3).map((f) => f.name);
      expect(middleNames).toContain('left');
      expect(middleNames).toContain('right');
      // top should come last (depends on left and right)
      expect(ordered[3]?.name).toBe('top');
    });
  });

  describe('external dependencies (node_modules)', () => {
    it('treats function with external-only dependencies as leaf', () => {
      const filePath = addSourceFile(
        'external-deps.ts',
        `
        import * as fs from 'fs';

        export function readFile(path: string): string {
          return fs.readFileSync(path, 'utf-8');
        }

        export function processFile(path: string): string {
          return readFile(path).toUpperCase();
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('readFile', filePath, 4),
        createTodoFunction('processFile', filePath, 8),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // readFile is a leaf (only calls external fs)
      // processFile calls readFile
      expect(ordered[0]?.name).toBe('readFile');
      expect(ordered[1]?.name).toBe('processFile');
    });

    it('ignores calls to non-project functions', () => {
      const filePath = addSourceFile(
        'external-only.ts',
        `
        export function funcWithExternalCalls(): void {
          console.log('hello');
          JSON.stringify({});
        }

        export function anotherFunc(): void {
          funcWithExternalCalls();
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('funcWithExternalCalls', filePath, 2),
        createTodoFunction('anotherFunc', filePath, 7),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // funcWithExternalCalls is a leaf (only calls globals)
      expect(ordered[0]?.name).toBe('funcWithExternalCalls');
      expect(ordered[1]?.name).toBe('anotherFunc');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      addSourceFile('empty.ts', `export function foo(): void {}`);

      const ordered = orderByDependency([], project);

      expect(ordered).toHaveLength(0);
    });

    it('handles single function', () => {
      const filePath = addSourceFile(
        'single.ts',
        `
        export function onlyOne(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [createTodoFunction('onlyOne', filePath, 2)];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(1);
      expect(ordered[0]?.name).toBe('onlyOne');
    });

    it('handles self-recursive function', () => {
      const filePath = addSourceFile(
        'recursive.ts',
        `
        export function factorial(n: number): number {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
      `
      );

      const todos: TodoFunction[] = [createTodoFunction('factorial', filePath, 2)];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(1);
      expect(ordered[0]?.name).toBe('factorial');
    });

    it('handles method calls (not tracked as dependencies)', () => {
      const filePath = addSourceFile(
        'method-calls.ts',
        `
        export function funcA(): number {
          const arr = [1, 2, 3];
          return arr.map(x => x * 2).reduce((a, b) => a + b);
        }

        export function funcB(): number {
          return funcA() + 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('funcA', filePath, 2),
        createTodoFunction('funcB', filePath, 7),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      expect(ordered[0]?.name).toBe('funcA');
      expect(ordered[1]?.name).toBe('funcB');
    });

    it('handles functions across multiple files', () => {
      const fileA = addSourceFile(
        'fileA.ts',
        `
        export function funcInA(): number {
          return funcInB();
        }

        declare function funcInB(): number;
      `
      );

      const fileB = addSourceFile(
        'fileB.ts',
        `
        export function funcInB(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('funcInA', fileA, 2),
        createTodoFunction('funcInB', fileB, 2),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // funcInB is a leaf, funcInA depends on it
      expect(ordered[0]?.name).toBe('funcInB');
      expect(ordered[1]?.name).toBe('funcInA');
    });

    it('handles complex multi-node dependency graph requiring sorted insertion', () => {
      // Create a linear dependency chain: A -> B -> C -> D
      // Tests the sorted insertion logic in topological sort
      // Structure: sccA -> sccB -> sccC -> sccD (chain without cycles)
      const filePath = addSourceFile(
        'multi-scc-chain.ts',
        `
        export function sccD(): number {
          return 1;
        }

        export function sccC(): number {
          return sccD() + 1;
        }

        export function sccB(): number {
          return sccC() + 1;
        }

        export function sccA(): number {
          return sccB() + 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('sccA', filePath, 14),
        createTodoFunction('sccB', filePath, 10),
        createTodoFunction('sccC', filePath, 6),
        createTodoFunction('sccD', filePath, 2),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(4);
      // Should be in order: D, C, B, A (leaves first)
      expect(ordered[0]?.name).toBe('sccD');
      expect(ordered[1]?.name).toBe('sccC');
      expect(ordered[2]?.name).toBe('sccB');
      expect(ordered[3]?.name).toBe('sccA');
    });

    it('handles multiple independent subgraphs that merge', () => {
      // Two independent chains that merge: (A -> C) and (B -> C)
      // This tests sorted insertion when multiple nodes become ready
      const filePath = addSourceFile(
        'merge-subgraphs.ts',
        `
        export function chainA(): number {
          return common() + 1;
        }

        export function chainB(): number {
          return common() + 2;
        }

        export function common(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('chainA', filePath, 2),
        createTodoFunction('chainB', filePath, 6),
        createTodoFunction('common', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(3);
      // common should come first (leaf)
      expect(ordered[0]?.name).toBe('common');
      // chainA and chainB both depend on common, should be sorted alphabetically
      expect(ordered[1]?.name).toBe('chainA');
      expect(ordered[2]?.name).toBe('chainB');
    });

    it('handles TODO function calling non-TODO function that calls another TODO function', () => {
      // A (TODO) -> helper (not TODO) -> B (TODO)
      // Tests that call graph correctly identifies direct dependencies only
      const filePath = addSourceFile(
        'indirect-deps.ts',
        `
        export function todoA(): number {
          return helper() + 1;
        }

        function helper(): number {
          return todoB() + 1;
        }

        export function todoB(): number {
          return 42;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('todoA', filePath, 2),
        createTodoFunction('todoB', filePath, 10),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // todoA doesn't directly call todoB (it calls helper)
      // so they should be sorted alphabetically as independent
      const names = ordered.map((f) => f.name);
      expect(names).toContain('todoA');
      expect(names).toContain('todoB');
    });

    it('handles multiple cycles that depend on each other', () => {
      // Cycle1: (A <-> B), Cycle2: (C <-> D), where A calls C
      // Tests that cycles are properly ordered when one cycle depends on another
      const filePath = addSourceFile(
        'dependent-cycles.ts',
        `
        export function cycleA1(): number {
          return cycleA2() + cycleB1();
        }

        export function cycleA2(): number {
          return cycleA1() - 1;
        }

        export function cycleB1(): number {
          return cycleB2() + 1;
        }

        export function cycleB2(): number {
          return cycleB1() - 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('cycleA1', filePath, 2),
        createTodoFunction('cycleA2', filePath, 6),
        createTodoFunction('cycleB1', filePath, 10),
        createTodoFunction('cycleB2', filePath, 14),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(4);
      // Cycle B (B1, B2) should come before cycle A (A1, A2)
      // because cycle A depends on cycle B
      const names = ordered.map((f) => f.name);

      // B1 and B2 should appear before A1 and A2
      const indexB1 = names.indexOf('cycleB1');
      const indexB2 = names.indexOf('cycleB2');
      const indexA1 = names.indexOf('cycleA1');
      const indexA2 = names.indexOf('cycleA2');

      // Both B functions should come before both A functions
      expect(indexB1).toBeLessThan(indexA1);
      expect(indexB1).toBeLessThan(indexA2);
      expect(indexB2).toBeLessThan(indexA1);
      expect(indexB2).toBeLessThan(indexA2);
    });

    it('filters calls correctly when TODO function calls both TODO and non-TODO functions', () => {
      // todoFunc calls both todoOther (in TODO list) and helper (not in TODO list)
      // The dependency on helper should be ignored
      const filePath = addSourceFile(
        'mixed-calls.ts',
        `
        export function todoFunc(): number {
          return todoOther() + helper();
        }

        export function todoOther(): number {
          return 42;
        }

        function helper(): number {
          return 1;
        }
      `
      );

      const todos: TodoFunction[] = [
        createTodoFunction('todoFunc', filePath, 2),
        createTodoFunction('todoOther', filePath, 6),
      ];

      const ordered = orderByDependency(todos, project);

      expect(ordered).toHaveLength(2);
      // todoOther is a leaf (called by todoFunc)
      expect(ordered[0]?.name).toBe('todoOther');
      expect(ordered[1]?.name).toBe('todoFunc');
    });
  });
});
