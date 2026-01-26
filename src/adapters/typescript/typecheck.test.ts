/**
 * Integration tests for the TypeScript type checker wrapper.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runTypeCheck, ToolchainNotInstalledError } from './typecheck.js';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../../../test-fixtures');

describe('runTypeCheck', () => {
  describe('clean project', () => {
    it('should return success for a project with no type errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });

  describe('project with type errors', () => {
    it('should return structured errors for type mismatches', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      expect(result.success).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors.length).toBe(result.errorCount);
    });

    it('should include file, line, column, code, and message in errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      expect(result.errors.length).toBeGreaterThan(0);

      for (const error of result.errors) {
        expect(error.file).toBeTruthy();
        expect(error.file).toContain('type-mismatch.ts');
        expect(typeof error.line).toBe('number');
        expect(error.line).toBeGreaterThan(0);
        expect(typeof error.column).toBe('number');
        expect(error.column).toBeGreaterThan(0);
        expect(error.code).toMatch(/^TS\d+$/);
        expect(error.message).toBeTruthy();
      }
    });

    it('should detect TS2322 type assignment error', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      const ts2322Errors = result.errors.filter((e) => e.code === 'TS2322');
      expect(ts2322Errors.length).toBeGreaterThan(0);
    });
  });

  describe('specific file checking', () => {
    it('should check only specified files', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath, {
        files: ['valid.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('custom tsconfig', () => {
    it('should use custom tsconfig.json path', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath, {
        tsconfigPath: 'tsconfig.json',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('ToolchainNotInstalledError', () => {
    it('should have correct error name', () => {
      const error = new ToolchainNotInstalledError('tsc');
      expect(error.name).toBe('ToolchainNotInstalledError');
      expect(error.message).toContain('tsc');
      expect(error.message).toContain('not found in PATH');
    });
  });
});
