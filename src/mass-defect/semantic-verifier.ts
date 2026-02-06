/**
 * Semantic verifier for Mass Defect phase.
 *
 * Runs appropriate tests based on transformation risk level to ensure
 * refactorings preserve program behavior.
 *
 * @packageDocumentation
 */

import type { RiskLevel, VerificationResult, VerificationContext } from './types.js';
import { runTypeCheck } from '../adapters/typescript/typecheck.js';
import { runTests as runVitestTests } from '../adapters/typescript/testrunner.js';

/**
 * Verifies a transformation preserves program behavior.
 *
 * Executes risk-appropriate verification based on the transformation risk level:
 * - Risk 1 (Trivial): TypeScript compilation only
 * - Risk 2 (Safe): TypeScript compilation + unit tests for target function
 * - Risk 3 (Moderate): TypeScript compilation + unit tests for entire module
 * - Risk 4 (Structural): TypeScript compilation + full test suite
 *
 * @param original - The original function code.
 * @param transformed - The transformed function code.
 * @param risk - The risk level of the transformation.
 * @param context - Verification context including file path and function name.
 * @returns Promise resolving to verification result.
 *
 * @remarks
 * The verifier:
 * - Always runs TypeScript type checking via tsc
 * - Uses vitest for test execution with appropriate filters
 * - Returns clear error messages on failure for revert decisions
 * - Counts all tests run for reporting
 *
 * @example
 * // Risk 2 transformation compiles and function tests pass
 * const result = await verifyTransformation(
 *   originalCode,
 *   transformedCode,
 *   2,
 *   { filePath: 'src/utils.ts', functionName: 'calculateTotal', workingDir: '/project' }
 * );
 * // result.passed === true
 *
 * @example
 * // Risk 3 transformation causes type error
 * const result = await verifyTransformation(
 *   originalCode,
 *   transformedCode,
 *   3,
 *   { filePath: 'src/utils.ts', functionName: 'calculateTotal', workingDir: '/project' }
 * );
 * // result.passed === false, result.errors includes tsc error
 *
 * @example
 * // Risk 4 transformation breaks unrelated test
 * const result = await verifyTransformation(
 *   originalCode,
 *   transformedCode,
 *   4,
 *   { filePath: 'src/utils.ts', functionName: 'calculateTotal', workingDir: '/project' }
 * );
 * // result.passed === false, result.errors includes test failure
 */
export async function verifyTransformation(
  _original: string,
  _transformed: string,
  risk: RiskLevel,
  context: VerificationContext
): Promise<VerificationResult> {
  const errors: string[] = [];
  let testsRun = 0;

  // Always run TypeScript compilation first
  const typeCheckResult = await runTypeCheck(context.workingDir);
  if (!typeCheckResult.success) {
    for (const error of typeCheckResult.errors) {
      errors.push(
        `Type error: ${error.file}:${String(error.line)}:${String(error.column)} - ${error.message}`
      );
    }
    return {
      passed: false,
      errors,
      testsRun,
    };
  }

  // Run tests based on risk level
  switch (risk) {
    case 1: {
      // Trivial: Compilation only (already done above)
      break;
    }

    case 2: {
      // Safe: Run tests for target function only
      const functionTestResult = await runVitestTests('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: context.functionName,
      });
      testsRun += functionTestResult.totalTests;
      if (!functionTestResult.success) {
        for (const test of functionTestResult.tests.filter((t) => t.status === 'failed')) {
          errors.push(`Test failure: ${test.fullName} - ${test.error?.message ?? 'Unknown error'}`);
        }
      }
      break;
    }

    case 3: {
      // Moderate: Run tests for entire module
      const modulePattern =
        context.moduleName !== undefined ? context.moduleName : context.filePath;
      const moduleTestResult = await runVitestTests('**/*.test.ts', {
        cwd: context.workingDir,
        testNamePattern: modulePattern,
      });
      testsRun += moduleTestResult.totalTests;
      if (!moduleTestResult.success) {
        for (const test of moduleTestResult.tests.filter((t) => t.status === 'failed')) {
          errors.push(`Test failure: ${test.fullName} - ${test.error?.message ?? 'Unknown error'}`);
        }
      }
      break;
    }

    case 4: {
      // Structural: Run full test suite
      const fullTestResult = await runVitestTests('**/*.test.ts', {
        cwd: context.workingDir,
      });
      testsRun += fullTestResult.totalTests;
      if (!fullTestResult.success) {
        for (const test of fullTestResult.tests.filter((t) => t.status === 'failed')) {
          errors.push(`Test failure: ${test.fullName} - ${test.error?.message ?? 'Unknown error'}`);
        }
      }
      break;
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    testsRun,
  };
}
