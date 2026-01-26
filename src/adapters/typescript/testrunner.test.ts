/**
 * Integration tests for the vitest test runner wrapper.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runTests, ToolchainNotInstalledError } from './testrunner.js';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../../../test-fixtures');

describe('runTests', () => {
  describe('passing tests', () => {
    it('should return success for all passing tests', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-passing');
      // Use empty pattern to let vitest config define includes
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      expect(result.success).toBe(true);
      expect(result.failedTests).toBe(0);
      expect(result.passedTests).toBeGreaterThan(0);
      expect(result.totalTests).toBe(result.passedTests + result.failedTests + result.skippedTests);
    });

    it('should include all test details', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-passing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      expect(result.tests.length).toBeGreaterThan(0);

      for (const test of result.tests) {
        expect(test.name).toBeTruthy();
        expect(test.fullName).toBeTruthy();
        expect(test.file).toBeTruthy();
        expect(test.status).toBe('passed');
        expect(typeof test.durationMs).toBe('number');
        expect(test.durationMs).toBeGreaterThanOrEqual(0);
        expect(test.error).toBeUndefined();
      }
    });
  });

  describe('failing tests', () => {
    it('should return failure status for failing tests', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-failing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      expect(result.success).toBe(false);
      expect(result.failedTests).toBeGreaterThan(0);
    });

    it('should include error details for failed tests', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-failing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      const failedTests = result.tests.filter((t) => t.status === 'failed');
      expect(failedTests.length).toBeGreaterThan(0);

      for (const test of failedTests) {
        expect(test.error).toBeDefined();
        expect(test.error?.message).toBeTruthy();
        // Verify the error message contains assertion details
        expect(test.error?.message).toMatch(/expected/i);
      }
    });

    it('should include assertion message in error', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-failing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      const addFailure = result.tests.find((t) => t.name === 'should add two numbers correctly');
      expect(addFailure).toBeDefined();
      expect(addFailure?.status).toBe('failed');
      // The assertion message should mention expected vs actual
      expect(addFailure?.error?.message).toContain('expected');
    });
  });

  describe('test name pattern', () => {
    it('should filter tests by name pattern', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-passing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
        testNamePattern: 'should add',
      });

      // When using -t flag, vitest reports all tests but skips non-matching ones
      expect(result.passedTests).toBeGreaterThan(0);
      // Only matching tests should have 'passed' status
      const passedTests = result.tests.filter((t) => t.status === 'passed');
      expect(passedTests.length).toBe(1);
      expect(passedTests[0]?.name).toMatch(/should add/i);
    });
  });

  describe('specific file pattern', () => {
    it('should run only tests matching the file pattern', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-passing');
      const result = await runTests('math.test.ts', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      expect(result.tests.length).toBeGreaterThan(0);
      for (const test of result.tests) {
        expect(test.file).toContain('math.test.ts');
      }
    });
  });

  describe('invalid test pattern', () => {
    it('should skip all tests for non-matching test name patterns', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-passing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
        testNamePattern: 'nonexistent test name pattern xyz',
      });

      // When pattern matches nothing, vitest marks all tests as skipped but still reports success
      expect(result.success).toBe(true);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      // Tests are reported but all should be skipped
      const passedOrFailed = result.tests.filter(
        (t) => t.status === 'passed' || t.status === 'failed'
      );
      expect(passedOrFailed.length).toBe(0);
    });
  });

  describe('ToolchainNotInstalledError', () => {
    it('should have correct error name', () => {
      const error = new ToolchainNotInstalledError('vitest');
      expect(error.name).toBe('ToolchainNotInstalledError');
      expect(error.message).toContain('vitest');
      expect(error.message).toContain('not found in PATH');
    });
  });

  describe('mixed test results', () => {
    it('should correctly separate passed and failed tests', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'vitest-failing');
      const result = await runTests('', {
        cwd: projectPath,
        configPath: 'vitest.config.ts',
      });

      const passedTests = result.tests.filter((t) => t.status === 'passed');
      const failedTests = result.tests.filter((t) => t.status === 'failed');

      expect(passedTests.length).toBe(result.passedTests);
      expect(failedTests.length).toBe(result.failedTests);
      expect(passedTests.length + failedTests.length).toBe(result.totalTests);
    });
  });
});
