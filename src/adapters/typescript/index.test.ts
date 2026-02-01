/**
 * Integration tests for TypeScript adapter facade.
 *
 * These tests exercise of full adapter workflow including:
 * - Initialization on TypeScript projects
 * - TODO function detection
 * - Context extraction
 * - Code injection
 * - Verification
 *
 * @module adapters/typescript/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TypeScriptAdapter,
  AdapterNotInitializedError,
  NotTypeScriptProjectError,
  FunctionNotFoundError,
} from './index.js';
import {
  safeWriteFileSync,
  safeReadFileSync,
  safeExistsSync,
  safeMkdirSync,
  safeRmSync,
} from '../../utils/safe-fs.js';

/**
 * Creates a temporary directory for test fixtures.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ts-adapter-test-'));
}

/**
 * Removes a directory and all its contents recursively.
 */
function removeTempDir(dirPath: string): void {
  if (safeExistsSync(dirPath)) {
    safeRmSync(dirPath, { recursive: true, force: true });
  }
}

describe('TypeScriptAdapter', () => {
  describe('initialization', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should initialize with a valid TypeScript project (with tsconfig.json)', async () => {
      // Create a minimal TypeScript project
      const tsConfig = {
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      };
      safeMkdirSync(path.join(tempDir, 'src'));
      safeWriteFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsConfig));
      safeWriteFileSync(
        path.join(tempDir, 'src', 'index.ts'),
        'export function hello(): string { return "hello"; }'
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      expect(adapter.getProjectPath()).toBe(path.resolve(tempDir));
    });

    it('should initialize with TypeScript files but no tsconfig.json', async () => {
      // Create a directory with .ts files but no tsconfig
      safeWriteFileSync(
        path.join(tempDir, 'example.ts'),
        'export function example(): number { return 1; }'
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      expect(adapter.getProjectPath()).toBe(path.resolve(tempDir));
    });

    it('should throw NotTypeScriptProjectError for non-TypeScript project', async () => {
      // Create a directory with no .ts files and no tsconfig
      safeWriteFileSync(path.join(tempDir, 'readme.md'), '# Hello');

      const adapter = new TypeScriptAdapter();

      await expect(adapter.initialize(tempDir)).rejects.toThrow(NotTypeScriptProjectError);
    });

    it('should throw NotTypeScriptProjectError for non-existent directory', async () => {
      const adapter = new TypeScriptAdapter();

      await expect(adapter.initialize('/non/existent/path')).rejects.toThrow(
        NotTypeScriptProjectError
      );
    });

    it('should detect npm workspace packages', async () => {
      // Create a monorepo structure
      const packageJson = {
        name: 'monorepo-root',
        workspaces: ['packages/*'],
      };
      safeWriteFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson));
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } })
      );

      // Create a package
      const packagesDir = path.join(tempDir, 'packages');
      const packageADir = path.join(packagesDir, 'package-a');
      safeMkdirSync(packageADir, { recursive: true });
      safeWriteFileSync(
        path.join(packageADir, 'package.json'),
        JSON.stringify({ name: '@mono/package-a' })
      );
      safeWriteFileSync(path.join(packageADir, 'tsconfig.json'), JSON.stringify({}));
      safeWriteFileSync(path.join(packageADir, 'index.ts'), 'export const a = 1;');

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const packages = adapter.getWorkspacePackages();
      expect(packages.length).toBe(1);
      expect(packages[0]?.name).toBe('@mono/package-a');
      expect(packages[0]?.hasTsConfig).toBe(true);
    });
  });

  describe('not initialized errors', () => {
    it('should throw AdapterNotInitializedError when calling findTodoFunctions without init', () => {
      const adapter = new TypeScriptAdapter();

      expect(() => adapter.findTodoFunctions()).toThrow(AdapterNotInitializedError);
    });

    it('should throw AdapterNotInitializedError when calling extractContext without init', () => {
      const adapter = new TypeScriptAdapter();

      expect(() => adapter.extractContext('test')).toThrow(AdapterNotInitializedError);
    });

    it('should throw AdapterNotInitializedError when calling inject without init', () => {
      const adapter = new TypeScriptAdapter();

      expect(() => adapter.inject('test', 'return 1;')).toThrow(AdapterNotInitializedError);
    });

    it('should throw AdapterNotInitializedError when calling verify without init', async () => {
      const adapter = new TypeScriptAdapter();

      await expect(adapter.verify()).rejects.toThrow(AdapterNotInitializedError);
    });

    it('should throw AdapterNotInitializedError when calling runTests without init', async () => {
      const adapter = new TypeScriptAdapter();

      await expect(adapter.runTests('**/*.test.ts')).rejects.toThrow(AdapterNotInitializedError);
    });
  });

  describe('findTodoFunctions', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should find functions with TODO markers', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'math.ts'),
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}

export function subtract(a: number, b: number): number {
  return a - b;  // Already implemented
}

export function multiply(a: number, b: number): number {
  throw new Error("TODO");
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const todos = adapter.findTodoFunctions();

      expect(todos.length).toBe(2);
      expect(todos.map((t) => t.name).sort()).toEqual(['add', 'multiply']);
    });

    it('should return functions in topological order', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'chain.ts'),
        `
// A calls B, B calls C
export function funcA(): number {
  throw new Error('TODO');
  return funcB() + 1;
}

export function funcB(): number {
  throw new Error('TODO');
  return funcC() * 2;
}

export function funcC(): number {
  throw new Error('TODO');
  return 42;
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const todos = adapter.findTodoFunctions();

      // C should come first (leaf), then B, then A
      expect(todos.length).toBe(3);
      const names = todos.map((t) => t.name);
      const cIndex = names.indexOf('funcC');
      const bIndex = names.indexOf('funcB');
      const aIndex = names.indexOf('funcA');

      expect(cIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(aIndex);
    });
  });

  describe('extractContext', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should extract function signature', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'math.ts'),
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const context = adapter.extractContext('add');

      expect(context.signature.name).toBe('add');
      expect(context.signature.parameters).toHaveLength(2);
      expect(context.signature.parameters[0]?.name).toBe('a');
      expect(context.signature.parameters[0]?.type).toBe('number');
      expect(context.signature.parameters[1]?.name).toBe('b');
      expect(context.signature.parameters[1]?.type).toBe('number');
      expect(context.signature.returnType).toBe('number');
    });

    it('should extract referenced types', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'types.ts'),
        `
export interface User {
  id: number;
  name: string;
}

export interface Result {
  success: boolean;
  data: User;
}

export function processUser(user: User): Result {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const context = adapter.extractContext('processUser');

      expect(context.referencedTypes.length).toBeGreaterThanOrEqual(2);
      const typeNames = context.referencedTypes.map((t) => t.name);
      expect(typeNames).toContain('User');
      expect(typeNames).toContain('Result');
    });

    it('should extract contract from JSDoc', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'contract.ts'),
        `
/**
 * Divides two numbers.
 * @requires divisor !== 0
 * @ensures result * divisor === dividend
 * @complexity O(1)
 * @purity pure
 */
export function divide(dividend: number, divisor: number): number {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const context = adapter.extractContext('divide');

      expect(context.contract).toBeDefined();
      expect(context.contract?.requires).toContain('divisor !== 0');
      expect(context.contract?.ensures).toContain('result * divisor === dividend');
      expect(context.contract?.complexity).toBe('O(1)');
      expect(context.contract?.purity).toBe('pure');
      expect(context.serializedContract).toContain('REQUIRES: divisor !== 0');
      expect(context.serializedContract).toContain('ENSURES: result * divisor === dividend');
    });

    it('should throw FunctionNotFoundError for non-existent function', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(path.join(tempDir, 'empty.ts'), 'export const x = 1;');

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      expect(() => adapter.extractContext('nonExistent')).toThrow(FunctionNotFoundError);
    });

    it('should disambiguate functions with same name using filePath', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'file1.ts'),
        `export function helper(x: number): number { throw new Error('TODO'); }`
      );
      safeWriteFileSync(
        path.join(tempDir, 'file2.ts'),
        `export function helper(x: string): string { throw new Error('TODO'); }`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const context1 = adapter.extractContext('helper', path.join(tempDir, 'file1.ts'));
      const context2 = adapter.extractContext('helper', path.join(tempDir, 'file2.ts'));

      expect(context1.signature.parameters[0]?.type).toBe('number');
      expect(context2.signature.parameters[0]?.type).toBe('string');
    });
  });

  describe('inject', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should inject function body successfully', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      const filePath = path.join(tempDir, 'math.ts');
      safeWriteFileSync(
        filePath,
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const result = adapter.inject('add', 'return a + b;');

      expect(result.success).toBe(true);
      expect(result.functionName).toBe('add');

      // Verify the file was modified
      const content = safeReadFileSync(filePath, 'utf-8');
      expect(content).toContain('return a + b;');
      expect(content).not.toContain("throw new Error('TODO')");
    });

    it('should return error for non-existent function', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(path.join(tempDir, 'empty.ts'), 'export const x = 1;');

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const result = adapter.inject('nonExistent', 'return 1;');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for invalid syntax', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'math.ts'),
        `
export function add(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const result = adapter.inject('add', 'return a + ; // invalid syntax');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('verify', () => {
    // These tests use the existing test fixtures since they have access to tsc
    // through the main project's node_modules
    const FIXTURES_DIR = path.resolve(import.meta.dirname, '../../../test-fixtures');

    it('should verify a clean project', async () => {
      const adapter = new TypeScriptAdapter();
      await adapter.initialize(path.join(FIXTURES_DIR, 'typecheck-clean'));

      const result = await adapter.verify();

      expect(result.success).toBe(true);
      expect(result.typeCheck.errorCount).toBe(0);
    });

    it('should detect type errors', async () => {
      const adapter = new TypeScriptAdapter();
      await adapter.initialize(path.join(FIXTURES_DIR, 'typecheck-errors'));

      const result = await adapter.verify();

      expect(result.success).toBe(false);
      expect(result.typeCheck.errorCount).toBeGreaterThan(0);
      expect(result.typeCheck.errors.length).toBeGreaterThan(0);
    });
  });

  describe('full workflow integration', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should complete full workflow: find -> extract -> inject -> verify', async () => {
      // Setup project with complete tsconfig
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['*.ts'],
      };
      safeWriteFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig));
      safeWriteFileSync(
        path.join(tempDir, 'math.ts'),
        `
/**
 * Adds two numbers.
 * @requires a >= 0
 * @requires b >= 0
 * @ensures result >= a
 * @ensures result >= b
 */
export function add(a: number, b: number): number {
  throw new Error('TODO');
}

export function multiply(a: number, b: number): number {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();

      // Step 1: Initialize
      await adapter.initialize(tempDir);

      // Step 2: Find TODO functions
      const todos = adapter.findTodoFunctions();
      expect(todos.length).toBe(2);

      // Step 3: Extract context for first function
      const addContext = adapter.extractContext('add');
      expect(addContext.signature.name).toBe('add');
      expect(addContext.contract?.requires.length).toBe(2);

      // Step 4: Inject implementation
      const addResult = adapter.inject('add', 'return a + b;');
      expect(addResult.success).toBe(true);

      // Step 5: Inject second function
      const multiplyResult = adapter.inject('multiply', 'return a * b;');
      expect(multiplyResult.success).toBe(true);

      // Step 6: Verify file contents were modified correctly
      // Note: We don't test verify() here because temp dirs don't have tsc access
      // The verify() method is tested separately with test fixtures
      const content = safeReadFileSync(path.join(tempDir, 'math.ts'), 'utf-8');
      expect(content).toContain('return a + b;');
      expect(content).toContain('return a * b;');
      expect(content).not.toContain("throw new Error('TODO')");
    });

    it('should handle async functions in workflow', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022' }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'async.ts'),
        `
export async function fetchData(url: string): Promise<string> {
  throw new Error('TODO');
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const todos = adapter.findTodoFunctions();
      expect(todos.length).toBe(1);

      const context = adapter.extractContext('fetchData');
      expect(context.signature.isAsync).toBe(true);

      const result = adapter.inject(
        'fetchData',
        'const response = await fetch(url); return response.text();'
      );
      expect(result.success).toBe(true);
    });

    it('should handle class methods in workflow', async () => {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['*.ts'],
      };
      safeWriteFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig));
      safeWriteFileSync(
        path.join(tempDir, 'class.ts'),
        `
export class Calculator {
  add(a: number, b: number): number {
    throw new Error('TODO');
  }
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const todos = adapter.findTodoFunctions();
      expect(todos.length).toBe(1);
      expect(todos[0]?.name).toBe('add');

      const context = adapter.extractContext('add');
      expect(context.signature.name).toBe('add');

      const result = adapter.inject('add', 'return a + b;');
      expect(result.success).toBe(true);

      // Verify file was modified
      const content = safeReadFileSync(path.join(tempDir, 'class.ts'), 'utf-8');
      expect(content).toContain('return a + b;');
      expect(content).not.toContain("throw new Error('TODO')");
    });
  });

  describe('orderByDependency', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tempDir);
    });

    it('should order functions with leaves first', async () => {
      safeWriteFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
      );
      safeWriteFileSync(
        path.join(tempDir, 'deps.ts'),
        `
export function root(): number {
  throw new Error('TODO');
  return middle() + 1;
}

export function middle(): number {
  throw new Error('TODO');
  return leaf() * 2;
}

export function leaf(): number {
  throw new Error('TODO');
  return 42;
}
`
      );

      const adapter = new TypeScriptAdapter();
      await adapter.initialize(tempDir);

      const todos = adapter.findTodoFunctions();
      const ordered = adapter.orderByDependency(todos);

      const names = ordered.map((t) => t.name);
      expect(names.indexOf('leaf')).toBeLessThan(names.indexOf('middle'));
      expect(names.indexOf('middle')).toBeLessThan(names.indexOf('root'));
    });
  });
});
