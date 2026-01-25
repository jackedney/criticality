import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Project } from 'ts-morph';
import { createProject, TsConfigNotFoundError, findTodoFunctions } from './ast.js';

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
