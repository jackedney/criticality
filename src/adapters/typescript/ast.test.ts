import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Project } from 'ts-morph';
import { createProject, TsConfigNotFoundError } from './ast.js';

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
