/**
 * Tests for semantic verifier with risk-based test execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTransformation } from './semantic-verifier.js';
import type { RiskLevel, VerificationContext } from './types.js';

// Mock the adapter functions
vi.mock('../adapters/typescript/typecheck.js', () => ({
  runTypeCheck: vi.fn(),
}));

vi.mock('../adapters/typescript/testrunner.js', () => ({
  runTests: vi.fn(),
}));

import { runTypeCheck } from '../adapters/typescript/typecheck.js';
import { runTests as runVitestTests } from '../adapters/typescript/testrunner.js';

/**
 * Creates a test verification context.
 */
function createContext(overrides?: Partial<VerificationContext>): VerificationContext {
  return {
    filePath: 'src/utils.ts',
    functionName: 'calculateTotal',
    workingDir: '/test-project',
    moduleName: 'utils',
    ...overrides,
  };
}

describe('semantic-verifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyTransformation', () => {
    it('Risk 1 (Trivial): passes when compilation succeeds', async () => {
      const risk = 1 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(0);
      expect(runTypeCheck).toHaveBeenCalledWith(context.workingDir);
      expect(runVitestTests).not.toHaveBeenCalled();
    });

    it('Risk 1 (Trivial): fails when compilation has errors', async () => {
      const risk = 1 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: false,
        errors: [
          {
            file: context.filePath,
            line: 10,
            column: 5,
            code: 'TS2322',
            message: "Type 'string' is not assignable to type 'number'",
            typeDetails: { expected: 'number', actual: 'string' },
          },
        ],
        errorCount: 1,
        warningCount: 0,
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Type error');
      expect(result.errors[0]).toContain("Type 'string' is not assignable to type 'number'");
      expect(result.testsRun).toBe(0);
      expect(runVitestTests).not.toHaveBeenCalled();
    });

    it('Risk 2 (Safe): passes when compilation and function tests pass', async () => {
      const risk = 2 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: true,
        totalTests: 3,
        passedTests: 3,
        failedTests: 0,
        skippedTests: 0,
        tests: [
          {
            name: 'should calculate total',
            fullName: 'calculateTotal should calculate total',
            file: 'src/utils.test.ts',
            status: 'passed',
            durationMs: 10,
          },
          {
            name: 'should handle empty input',
            fullName: 'calculateTotal should handle empty input',
            file: 'src/utils.test.ts',
            status: 'passed',
            durationMs: 5,
          },
          {
            name: 'should handle negative values',
            fullName: 'calculateTotal should handle negative values',
            file: 'src/utils.test.ts',
            status: 'passed',
            durationMs: 8,
          },
        ],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(3);
      expect(runTypeCheck).toHaveBeenCalledWith(context.workingDir);
      expect(runVitestTests).toHaveBeenCalledWith('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: context.functionName,
      });
    });

    it('Risk 2 (Safe): fails when function tests fail', async () => {
      const risk = 2 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: false,
        totalTests: 3,
        passedTests: 2,
        failedTests: 1,
        skippedTests: 0,
        tests: [
          {
            name: 'should calculate total',
            fullName: 'calculateTotal should calculate total',
            file: 'src/utils.test.ts',
            status: 'passed',
            durationMs: 10,
          },
          {
            name: 'should handle empty input',
            fullName: 'calculateTotal should handle empty input',
            file: 'src/utils.test.ts',
            status: 'passed',
            durationMs: 5,
          },
          {
            name: 'should handle negative values',
            fullName: 'calculateTotal should handle negative values',
            file: 'src/utils.test.ts',
            status: 'failed',
            durationMs: 8,
            error: { message: 'Expected 5 but got 4', stack: 'Error at test' },
          },
        ],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Test failure');
      expect(result.errors[0]).toContain('calculateTotal should handle negative values');
      expect(result.errors[0]).toContain('Expected 5 but got 4');
      expect(result.testsRun).toBe(3);
      expect(runVitestTests).toHaveBeenCalledWith('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: context.functionName,
      });
    });

    it('Risk 3 (Moderate): passes when compilation and module tests pass', async () => {
      const risk = 3 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        tests: [],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(10);
      expect(runVitestTests).toHaveBeenCalledWith('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: context.moduleName,
      });
    });

    it('Risk 3 (Moderate): fails when compilation has type error', async () => {
      const risk = 3 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: false,
        errors: [
          {
            file: context.filePath,
            line: 15,
            column: 8,
            code: 'TS2339',
            message: "Property 'length' does not exist on type 'never'",
            typeDetails: { expected: 'string', actual: 'never' },
          },
        ],
        errorCount: 1,
        warningCount: 0,
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Type error');
      expect(result.errors[0]).toContain("Property 'length' does not exist on type 'never'");
      expect(result.testsRun).toBe(0);
      expect(runVitestTests).not.toHaveBeenCalled();
    });

    it('Risk 4 (Structural): passes when compilation and full test suite pass', async () => {
      const risk = 4 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: true,
        totalTests: 50,
        passedTests: 50,
        failedTests: 0,
        skippedTests: 0,
        tests: [],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(50);
      expect(runVitestTests).toHaveBeenCalledWith('**/*.test.ts', {
        cwd: context.workingDir,
      });
    });

    it('Risk 4 (Structural): detects when transformation breaks unrelated test', async () => {
      const risk = 4 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: false,
        totalTests: 50,
        passedTests: 49,
        failedTests: 1,
        skippedTests: 0,
        tests: [
          {
            name: 'should serialize user data',
            fullName: 'serializeUser should serialize user data',
            file: 'src/user.test.ts',
            status: 'failed',
            durationMs: 15,
            error: { message: 'undefined is not an object', stack: 'Error at test' },
          },
        ],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Test failure');
      expect(result.errors[0]).toContain('serializeUser should serialize user data');
      expect(result.errors[0]).toContain('undefined is not an object');
      expect(result.testsRun).toBe(50);
    });

    it('provides clear error message for revert decision on failure', async () => {
      const risk = 3 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: false,
        errors: [
          {
            file: context.filePath,
            line: 20,
            column: 12,
            code: 'TS2345',
            message: "Argument of type 'string' is not assignable to parameter of type 'number'",
            typeDetails: { expected: 'number', actual: 'string' },
          },
        ],
        errorCount: 1,
        warningCount: 0,
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Type error.*src\/utils\.ts.*20.*12/);
      expect(result.errors[0]).toContain(
        "Argument of type 'string' is not assignable to parameter of type 'number'"
      );
    });

    it('handles module tests when moduleName is not provided in context', async () => {
      const risk = 3 as RiskLevel;
      const context = createContext();
      // Remove moduleName to test fallback behavior
      const { moduleName: _, ...contextWithoutModuleName } = context;

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: true,
        totalTests: 5,
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        tests: [],
      });

      const result = await verifyTransformation(
        'original code',
        'transformed code',
        risk,
        contextWithoutModuleName
      );

      expect(result.passed).toBe(true);
      expect(result.testsRun).toBe(5);
      expect(runVitestTests).toHaveBeenCalledWith('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: context.filePath,
      });
    });

    it('handles empty test results gracefully', async () => {
      const risk = 2 as RiskLevel;
      const context = createContext();

      vi.mocked(runTypeCheck).mockResolvedValue({
        success: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      });

      vi.mocked(runVitestTests).mockResolvedValue({
        success: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        tests: [],
      });

      const result = await verifyTransformation('original code', 'transformed code', risk, context);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.testsRun).toBe(0);
    });
  });
});
