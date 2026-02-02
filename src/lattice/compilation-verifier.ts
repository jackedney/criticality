/**
 * Compilation verification loop for the Lattice phase.
 *
 * Ensures generated Lattice output always compiles, maintaining structural
 * criticality. Uses TypeScriptAdapter for compilation and error parsing,
 * and ModelRouter for structural repairs.
 *
 * Key features:
 * - Run tsc after Lattice generation
 * - Parse compiler errors using TypeScriptAdapter
 * - Repair structural errors using structurer_model via ModelRouter
 * - Loop until compilation succeeds or max repair attempts reached
 * - AST inspection to verify no logic leakage (only type definitions and TODO bodies)
 * - BLOCKED state for unrepairable errors after max attempts
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import type { CompilerError, TypeCheckResult } from '../adapters/typescript/typecheck.js';
import { runTypeCheck } from '../adapters/typescript/typecheck.js';
import type { ModelRouter, ModelRouterRequest } from '../router/types.js';
import {
  inspectAst,
  type AstInspectionResult,
  type InspectedFunction,
} from '../adapters/typescript/ast.js';
import { safeReadFile, safeReaddir, safeWriteFile } from '../utils/safe-fs.js';

/**
 * Error types that can occur during compilation verification.
 */
export type CompilationErrorCategory =
  | 'missing_import' // Missing import statement
  | 'missing_type' // Type not defined
  | 'type_mismatch' // Type incompatibility
  | 'syntax_error' // Syntax issues
  | 'missing_property' // Property doesn't exist on type
  | 'argument_mismatch' // Wrong number/type of arguments
  | 'other'; // Uncategorized errors

/**
 * A categorized compiler error with repair hints.
 */
export interface CategorizedError {
  /** The original compiler error. */
  readonly error: CompilerError;
  /** The error category. */
  readonly category: CompilationErrorCategory;
  /** Suggested repair action. */
  readonly repairHint: string;
  /** Whether this error is likely auto-repairable. */
  readonly autoRepairable: boolean;
}

/**
 * Result of a single verification attempt.
 */
export interface VerificationAttempt {
  /** The attempt number (1-based). */
  readonly attempt: number;
  /** Whether compilation succeeded. */
  readonly success: boolean;
  /** Compiler errors, if any. */
  readonly errors: readonly CategorizedError[];
  /** Repairs applied in this attempt. */
  readonly repairsApplied: readonly AppliedRepair[];
  /** Time taken for this attempt in milliseconds. */
  readonly durationMs: number;
}

/**
 * A repair that was applied to fix a compilation error.
 */
export interface AppliedRepair {
  /** The error that was repaired. */
  readonly error: CategorizedError;
  /** The file that was modified. */
  readonly file: string;
  /** Description of the repair. */
  readonly description: string;
  /** The old content that was replaced. */
  readonly oldContent?: string;
  /** The new content that was inserted. */
  readonly newContent?: string;
}

/**
 * State of the compilation verification process.
 */
export type VerificationState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'verifying'; readonly attempt: number }
  | { readonly kind: 'success'; readonly attempts: readonly VerificationAttempt[] }
  | {
      readonly kind: 'blocked';
      readonly attempts: readonly VerificationAttempt[];
      readonly unresolvedErrors: readonly CategorizedError[];
      readonly reason: string;
    };

/**
 * Result of the full compilation verification loop.
 */
export interface CompilationVerificationResult {
  /** Final state of the verification. */
  readonly state: VerificationState;
  /** Whether compilation ultimately succeeded. */
  readonly success: boolean;
  /** All verification attempts. */
  readonly attempts: readonly VerificationAttempt[];
  /** Total time taken in milliseconds. */
  readonly totalDurationMs: number;
  /** AST inspection result (verifies no logic leakage). */
  readonly astInspection?: AstInspectionResult;
}

/**
 * Error thrown when files cannot be resolved for compilation verification.
 */
export class FilesNotResolvedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilesNotResolvedError';
  }
}

/**
 * Options for the compilation verifier.
 */
export interface CompilationVerifierOptions {
  /** Maximum number of repair attempts before entering BLOCKED state. Default: 5. */
  readonly maxRepairAttempts?: number;
  /** Path to the project or files to verify. */
  readonly projectPath: string;
  /** Specific files to verify (if not provided, verifies entire project). */
  readonly files?: readonly string[];
  /** Path to tsconfig.json (optional). */
  readonly tsconfigPath?: string;
  /** ModelRouter instance for generating repairs. */
  readonly modelRouter?: ModelRouter;
  /** Whether to run AST inspection to verify no logic leakage. Default: true. */
  readonly runAstInspection?: boolean;
  /** Logger for progress messages. */
  readonly logger?: (message: string) => void;
}

/**
 * Error codes for categorizing TypeScript errors.
 */
const ERROR_CATEGORIES: ReadonlyMap<string, CompilationErrorCategory> = new Map([
  // Missing imports / modules
  ['TS2307', 'missing_import'], // Cannot find module
  ['TS2305', 'missing_import'], // Module has no exported member
  ['TS2306', 'missing_import'], // Not a module

  // Missing types / names
  ['TS2304', 'missing_type'], // Cannot find name
  ['TS2749', 'missing_type'], // Refers to a value, but is being used as a type

  // Type mismatches
  ['TS2322', 'type_mismatch'], // Type is not assignable to type
  ['TS2345', 'type_mismatch'], // Argument of type is not assignable
  ['TS2741', 'type_mismatch'], // Property is missing in type
  ['TS2740', 'type_mismatch'], // Type is missing properties
  ['TS2559', 'type_mismatch'], // Type has no properties in common
  ['TS2352', 'type_mismatch'], // Conversion may be a mistake
  ['TS2769', 'type_mismatch'], // No overload matches this call

  // Missing properties
  ['TS2339', 'missing_property'], // Property does not exist on type
  ['TS2551', 'missing_property'], // Property does not exist, did you mean
  ['TS2353', 'missing_property'], // Object literal may only specify known properties

  // Argument mismatches
  ['TS2554', 'argument_mismatch'], // Expected N arguments, got M
  ['TS2555', 'argument_mismatch'], // Expected at least N arguments
  ['TS2556', 'argument_mismatch'], // Spread argument must be an array type

  // Syntax errors
  ['TS1005', 'syntax_error'], // Expected token
  ['TS1109', 'syntax_error'], // Expression expected
  ['TS1128', 'syntax_error'], // Declaration or statement expected
  ['TS1136', 'syntax_error'], // Property assignment expected
  ['TS1160', 'syntax_error'], // Unterminated template literal
]);

/**
 * Categorizes a compiler error and generates repair hints.
 *
 * @param error - The compiler error to categorize.
 * @returns The categorized error with repair hints.
 */
export function categorizeError(error: CompilerError): CategorizedError {
  const category = ERROR_CATEGORIES.get(error.code) ?? 'other';
  const { repairHint, autoRepairable } = generateRepairHint(error, category);

  return {
    error,
    category,
    repairHint,
    autoRepairable,
  };
}

/**
 * Generates a repair hint for a categorized error.
 *
 * @param error - The compiler error.
 * @param category - The error category.
 * @returns The repair hint and whether it's auto-repairable.
 */
function generateRepairHint(
  error: CompilerError,
  category: CompilationErrorCategory
): { repairHint: string; autoRepairable: boolean } {
  const typeDetails = error.typeDetails;

  switch (category) {
    case 'missing_import': {
      // Extract module name from the error message
      const moduleMatch = /Cannot find module '([^']+)'/.exec(error.message);
      if (moduleMatch?.[1] !== undefined) {
        return {
          repairHint: `Add import statement for module '${moduleMatch[1]}'`,
          autoRepairable: true,
        };
      }
      const memberMatch = /Module '.*' has no exported member '([^']+)'/.exec(error.message);
      if (memberMatch?.[1] !== undefined) {
        return {
          repairHint: `Export '${memberMatch[1]}' from the module or remove the import`,
          autoRepairable: true,
        };
      }
      return {
        repairHint: 'Fix import statement',
        autoRepairable: true,
      };
    }

    case 'missing_type': {
      if (typeDetails !== null) {
        return {
          repairHint: `Define or import type '${typeDetails.expected}'`,
          autoRepairable: true,
        };
      }
      const nameMatch = /Cannot find name '([^']+)'/.exec(error.message);
      if (nameMatch?.[1] !== undefined) {
        return {
          repairHint: `Define or import '${nameMatch[1]}'`,
          autoRepairable: true,
        };
      }
      return {
        repairHint: 'Define or import the missing type/name',
        autoRepairable: true,
      };
    }

    case 'type_mismatch': {
      if (typeDetails !== null) {
        return {
          repairHint: `Change type from '${typeDetails.actual}' to '${typeDetails.expected}'`,
          autoRepairable: true,
        };
      }
      return {
        repairHint: 'Fix type mismatch',
        autoRepairable: true,
      };
    }

    case 'missing_property': {
      const propMatch = /Property '([^']+)' does not exist/.exec(error.message);
      if (propMatch?.[1] !== undefined) {
        return {
          repairHint: `Add property '${propMatch[1]}' to the type definition or fix the property name`,
          autoRepairable: true,
        };
      }
      return {
        repairHint: 'Add missing property or fix property name',
        autoRepairable: true,
      };
    }

    case 'argument_mismatch': {
      if (typeDetails !== null) {
        return {
          repairHint: `Fix function call: expected ${typeDetails.expected}, got ${typeDetails.actual}`,
          autoRepairable: true,
        };
      }
      return {
        repairHint: 'Fix function arguments',
        autoRepairable: true,
      };
    }

    case 'syntax_error': {
      return {
        repairHint: `Fix syntax error: ${error.message}`,
        autoRepairable: false, // Syntax errors often require human review
      };
    }

    default: {
      return {
        repairHint: `Review and fix: ${error.message}`,
        autoRepairable: false,
      };
    }
  }
}

/**
 * Generates a repair prompt for the structurer_model.
 *
 * @param errors - The categorized errors to repair.
 * @param fileContents - Map of file paths to their contents.
 * @returns The prompt for the model.
 */
export function generateRepairPrompt(
  errors: readonly CategorizedError[],
  fileContents: ReadonlyMap<string, string>
): string {
  const lines: string[] = [
    'You are a TypeScript structural repair assistant. Your task is to fix compilation errors in generated Lattice code.',
    '',
    'IMPORTANT CONSTRAINTS:',
    '- You may ONLY fix structural issues (imports, type definitions, type annotations)',
    '- You must NOT add any implementation logic',
    "- Function bodies must remain as `throw new Error('TODO');`",
    '- Do not modify the semantic meaning of any type',
    '',
    'ERRORS TO FIX:',
    '',
  ];

  // Group errors by file
  const errorsByFile = new Map<string, CategorizedError[]>();
  for (const categorizedError of errors) {
    const file = categorizedError.error.file;
    const existing = errorsByFile.get(file) ?? [];
    existing.push(categorizedError);
    errorsByFile.set(file, existing);
  }

  for (const [file, fileErrors] of errorsByFile) {
    lines.push(`File: ${file}`);
    lines.push('');

    for (const categorizedError of fileErrors) {
      const { error, category, repairHint } = categorizedError;
      lines.push(`  Line ${String(error.line)}, Column ${String(error.column)}: ${error.code}`);
      lines.push(`  Message: ${error.message}`);
      lines.push(`  Category: ${category}`);
      lines.push(`  Suggested fix: ${repairHint}`);
      if (error.typeDetails !== null) {
        lines.push(
          `  Type details: expected '${error.typeDetails.expected}', got '${error.typeDetails.actual}'`
        );
      }
      lines.push('');
    }

    // Include file content if available
    const content = fileContents.get(file);
    if (content !== undefined) {
      lines.push('Current file content:');
      lines.push('```typescript');
      lines.push(content);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('');
  lines.push('Please provide the corrected file content(s) in the following format:');
  lines.push('');
  lines.push('--- FILE: <path> ---');
  lines.push('<corrected content>');
  lines.push('--- END FILE ---');
  lines.push('');
  lines.push('For each file that needs changes, include the complete corrected content.');

  return lines.join('\n');
}

/**
 * Parses repair response from the model.
 *
 * @param response - The model response text.
 * @returns Map of file paths to their corrected contents.
 */
export function parseRepairResponse(response: string): Map<string, string> {
  const repairs = new Map<string, string>();

  // Match FILE blocks: --- FILE: <path> --- ... --- END FILE ---
  const filePattern = /--- FILE: (.+?) ---\n([\s\S]*?)--- END FILE ---/g;
  let match;

  while ((match = filePattern.exec(response)) !== null) {
    const filePath = match[1]?.trim();
    let content = match[2] ?? '';

    if (filePath !== undefined) {
      // Remove markdown code block markers if present
      content = content.replace(/^```(?:typescript)?\n?/, '').replace(/\n?```\s*$/, '');
      repairs.set(filePath, content.trim());
    }
  }

  return repairs;
}

/**
 * Inspects generated code to verify no logic leakage.
 *
 * Lattice output should only contain:
 * - Type definitions (interfaces, type aliases, branded types)
 * - Function signatures with TODO bodies
 * - Import statements
 *
 * It should NOT contain:
 * - Implemented function bodies (anything other than throw new Error('TODO'))
 * - Business logic
 * - External API calls
 * - Data processing code
 *
 * @param projectPath - The project path.
 * @param files - Files to inspect.
 * @returns The AST inspection result.
 */
export function verifyNoLogicLeakage(
  projectPath: string,
  files: readonly string[]
): {
  passed: boolean;
  violations: readonly LogicLeakageViolation[];
  inspectedFunctions: readonly InspectedFunction[];
} {
  const violations: LogicLeakageViolation[] = [];
  const allInspectedFunctions: InspectedFunction[] = [];

  for (const file of files) {
    const filePath = path.resolve(projectPath, file);

    try {
      const result = inspectAst(filePath, {
        checkFunctionBodies: true,
        checkTodoPattern: true,
        detectLogicPatterns: true,
      });

      // Collect all inspected functions
      allInspectedFunctions.push(...result.functions);

      // Check for implemented functions
      for (const func of result.functions) {
        // A function is valid if:
        // 1. It has no body (declaration only)
        // 2. Its body is exactly `throw new Error('TODO');`
        // 3. Its body contains only a TODO throw statement

        if (func.hasBody && !func.hasTodoBody) {
          violations.push({
            file: filePath,
            line: func.line,
            functionName: func.name,
            violation: 'Function has implementation instead of TODO body',
            severity: 'error',
          });
        }
      }

      // Check for logic patterns that shouldn't exist
      for (const pattern of result.logicPatterns ?? []) {
        violations.push({
          file: filePath,
          line: pattern.line,
          functionName: pattern.context ?? 'unknown',
          violation: pattern.description,
          severity: pattern.severity,
        });
      }
    } catch (error) {
      // If we can't parse the file, we can't verify it
      violations.push({
        file: filePath,
        line: 0,
        functionName: 'N/A',
        violation: `Could not parse file for inspection: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
      });
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    inspectedFunctions: allInspectedFunctions,
  };
}

/**
 * A violation of the no-logic-leakage rule.
 */
export interface LogicLeakageViolation {
  /** The file where the violation was found. */
  readonly file: string;
  /** The line number. */
  readonly line: number;
  /** The function name, if applicable. */
  readonly functionName: string;
  /** Description of the violation. */
  readonly violation: string;
  /** Severity of the violation. */
  readonly severity: 'error' | 'warning';
}

/**
 * Reads tsconfig.json and extracts file inclusion patterns.
 *
 * @param tsconfigPath - Path to tsconfig.json file.
 * @returns Array of glob patterns or null if tsconfig is invalid.
 */
async function readTsconfigPatterns(tsconfigPath: string): Promise<string[] | null> {
  try {
    const tsconfigContent = (await safeReadFile(tsconfigPath, 'utf-8')) as string;
    const tsconfig = JSON.parse(tsconfigContent) as { include?: string[] };
    const include = tsconfig.include;
    if (include !== undefined && include.length > 0) {
      return include;
    }
  } catch {
    // tsconfig not found or invalid, fall back to default
  }
  return null;
}

/**
 * Finds TypeScript files recursively in a directory.
 *
 * @param dirPath - The directory path.
 * @param projectPath - The project path for resolving relative paths.
 * @returns Array of relative file paths.
 */
async function findTypeScriptFilesRecursive(
  dirPath: string,
  projectPath: string
): Promise<string[]> {
  const files: string[] = [];
  const entries = await safeReaddir(dirPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .git directories
      if (
        entry.name !== 'node_modules' &&
        entry.name !== '.git' &&
        entry.name !== 'dist' &&
        entry.name !== '.next'
      ) {
        const subFiles = await findTypeScriptFilesRecursive(fullPath, projectPath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // Return relative path from project path
      files.push(path.relative(projectPath, fullPath));
    }
  }

  return files;
}

/**
 * Derives file list from projectPath or tsconfigPath.
 *
 * @param projectPath - The project path.
 * @param tsconfigPath - Optional path to tsconfig.json.
 * @returns Array of relative file paths.
 * @throws {FilesNotResolvedError} If files cannot be resolved.
 */
async function deriveFileList(
  projectPath: string,
  tsconfigPath: string | undefined
): Promise<string[]> {
  const resolvedProjectPath = path.resolve(projectPath);

  // Read tsconfig to get included patterns (for future use)
  if (tsconfigPath !== undefined && tsconfigPath !== '') {
    const resolvedTsconfigPath = path.resolve(resolvedProjectPath, tsconfigPath);
    await readTsconfigPatterns(resolvedTsconfigPath);
  }

  // Find TypeScript files recursively
  const files = await findTypeScriptFilesRecursive(resolvedProjectPath, resolvedProjectPath);

  if (files.length === 0) {
    throw new FilesNotResolvedError(`No TypeScript files found in ${resolvedProjectPath}`);
  }

  return files;
}

/**
 * Normalizes a file path against the project path.
 *
 * @param filePath - The file path to normalize (can be relative or absolute).
 * @param projectPath - The project path.
 * @returns Normalized absolute file path.
 */
function normalizePath(filePath: string, projectPath: string): string {
  const resolvedProjectPath = path.resolve(projectPath);

  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }

  return path.normalize(path.resolve(resolvedProjectPath, filePath));
}

/**
 * Compilation verifier for Lattice output.
 *
 * Ensures generated code compiles and maintains structural integrity
 * by running a repair loop until compilation succeeds or max attempts
 * are reached.
 */
export class CompilationVerifier {
  private readonly options: Required<
    Omit<CompilationVerifierOptions, 'modelRouter' | 'files'> & {
      modelRouter: ModelRouter | undefined;
      files: readonly string[];
    }
  >;

  constructor(options: CompilationVerifierOptions) {
    const projectPath = path.resolve(options.projectPath);
    const tsconfigPath = options.tsconfigPath ?? '';

    // Default options without files - will be resolved lazily
    this.options = {
      maxRepairAttempts: options.maxRepairAttempts ?? 5,
      projectPath,
      files: options.files ?? [],
      tsconfigPath,
      modelRouter: options.modelRouter,
      runAstInspection: options.runAstInspection ?? true,
      // eslint-disable-next-line no-console -- console.log is the appropriate default logger
      logger: options.logger ?? console.log,
    };
  }

  /**
   * Gets the resolved file list, deriving from projectPath if needed.
   *
   * @returns Array of relative file paths.
   * @throws {FilesNotResolvedError} If files cannot be resolved.
   */
  private async getFiles(): Promise<string[]> {
    // If files were provided and non-empty, return them
    if (this.options.files.length > 0) {
      return [...this.options.files];
    }

    // Derive files from project path
    return await deriveFileList(this.options.projectPath, this.options.tsconfigPath || undefined);
  }

  /**
   * Runs the full compilation verification loop.
   *
   * 1. Run tsc to check for compilation errors
   * 2. If errors exist, categorize them and attempt repair
   * 3. Loop until compilation succeeds or max attempts reached
   * 4. If max attempts reached, enter BLOCKED state
   * 5. Optionally run AST inspection to verify no logic leakage
   *
   * @returns The compilation verification result.
   */
  async verify(): Promise<CompilationVerificationResult> {
    const startTime = Date.now();
    const attempts: VerificationAttempt[] = [];
    let currentState: VerificationState = { kind: 'pending' };

    this.options.logger(`Starting compilation verification for ${this.options.projectPath}`);

    for (let attempt = 1; attempt <= this.options.maxRepairAttempts; attempt++) {
      currentState = { kind: 'verifying', attempt };
      const attemptStart = Date.now();

      this.options.logger(
        `Verification attempt ${String(attempt)}/${String(this.options.maxRepairAttempts)}`
      );

      // Run type check
      const typeCheckResult = await this.runTypeCheck();

      if (typeCheckResult.success) {
        // Compilation succeeded
        const successAttempt: VerificationAttempt = {
          attempt,
          success: true,
          errors: [],
          repairsApplied: [],
          durationMs: Date.now() - attemptStart,
        };
        attempts.push(successAttempt);

        this.options.logger('Compilation successful!');

        // Run AST inspection if enabled
        let astInspection: AstInspectionResult | undefined;
        if (this.options.runAstInspection) {
          const files = await this.getFiles();
          const leakageResult = verifyNoLogicLeakage(this.options.projectPath, files);
          // Convert to AstInspectionResult format
          // Build conditionally to satisfy exactOptionalPropertyTypes
          if (leakageResult.violations.length > 0) {
            astInspection = {
              functions: leakageResult.inspectedFunctions,
              logicPatterns: leakageResult.violations.map((v) => ({
                line: v.line,
                description: v.violation,
                context: v.functionName,
                severity: v.severity,
              })),
              passed: leakageResult.passed,
            };
          } else {
            astInspection = {
              functions: leakageResult.inspectedFunctions,
              passed: leakageResult.passed,
            };
          }
          if (!leakageResult.passed) {
            this.options.logger(
              `AST inspection found ${String(leakageResult.violations.length)} logic leakage violations`
            );
          }
        }

        // Build result conditionally to satisfy exactOptionalPropertyTypes
        if (astInspection !== undefined) {
          return {
            state: { kind: 'success', attempts },
            success: true,
            attempts,
            totalDurationMs: Date.now() - startTime,
            astInspection,
          };
        }

        return {
          state: { kind: 'success', attempts },
          success: true,
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      }

      // Categorize errors
      const categorizedErrors = typeCheckResult.errors.map(categorizeError);
      const autoRepairableErrors = categorizedErrors.filter((e) => e.autoRepairable);

      this.options.logger(
        `Found ${String(typeCheckResult.errors.length)} errors (${String(autoRepairableErrors.length)} auto-repairable)`
      );

      // Attempt repair if we have a model router and repairable errors
      let repairsApplied: AppliedRepair[] = [];

      if (this.options.modelRouter !== undefined && autoRepairableErrors.length > 0) {
        repairsApplied = await this.attemptRepair(autoRepairableErrors);
        this.options.logger(`Applied ${String(repairsApplied.length)} repairs`);
      }

      const failedAttempt: VerificationAttempt = {
        attempt,
        success: false,
        errors: categorizedErrors,
        repairsApplied,
        durationMs: Date.now() - attemptStart,
      };
      attempts.push(failedAttempt);

      // If no repairs were applied, we can't make progress
      if (repairsApplied.length === 0) {
        this.options.logger('No repairs could be applied, entering BLOCKED state');
        break;
      }
    }

    // Max attempts reached or no repairs possible - enter BLOCKED state
    const lastAttempt = attempts[attempts.length - 1];
    const unresolvedErrors = lastAttempt?.errors ?? [];

    currentState = {
      kind: 'blocked',
      attempts,
      unresolvedErrors,
      reason: `Compilation failed after ${String(attempts.length)} repair attempts. ${String(unresolvedErrors.length)} errors remain unresolved.`,
    };

    this.options.logger(`Entering BLOCKED state: ${(currentState as { reason: string }).reason}`);

    return {
      state: currentState,
      success: false,
      attempts,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Runs TypeScript type checking.
   *
   * @returns The type check result.
   */
  private async runTypeCheck(): Promise<TypeCheckResult> {
    const { tsconfigPath } = this.options;
    const files = await this.getFiles();

    // Build options conditionally to satisfy exactOptionalPropertyTypes
    if (tsconfigPath !== '') {
      return runTypeCheck(this.options.projectPath, {
        files,
        tsconfigPath,
      });
    } else if (files.length > 0) {
      return runTypeCheck(this.options.projectPath, {
        files,
      });
    } else {
      return runTypeCheck(this.options.projectPath, {});
    }
  }

  /**
   * Attempts to repair compilation errors using the model router.
   *
   * @param errors - The errors to repair.
   * @returns The repairs that were applied.
   */
  private async attemptRepair(errors: readonly CategorizedError[]): Promise<AppliedRepair[]> {
    if (this.options.modelRouter === undefined) {
      return [];
    }

    // Collect file contents for the repair prompt
    const fileContents = new Map<string, string>();
    const uniqueFiles = new Set(errors.map((e) => e.error.file));

    for (const file of uniqueFiles) {
      try {
        const content = (await safeReadFile(file, 'utf-8')) as string;
        fileContents.set(file, content);
      } catch {
        // File might not exist or be readable
        this.options.logger(`Warning: Could not read file ${file}`);
      }
    }

    // Generate repair prompt
    const prompt = generateRepairPrompt(errors, fileContents);

    // Send to model router using structurer model alias
    const request: ModelRouterRequest = {
      modelAlias: 'structurer',
      prompt,
    };

    try {
      const result = await this.options.modelRouter.complete(request);
      if (!result.success) {
        this.options.logger(`Model router returned error: ${result.error.message}`);
        return [];
      }
      return await this.applyRepairs(result.response.content, errors);
    } catch (error) {
      this.options.logger(
        `Error during repair: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Applies repairs from the model response.
   *
   * @param content - The model response content.
   * @param errors - The errors that were being repaired.
   * @returns The repairs that were applied.
   */
  private async applyRepairs(
    content: string,
    errors: readonly CategorizedError[]
  ): Promise<AppliedRepair[]> {
    const applied: AppliedRepair[] = [];

    if (content === '') {
      return applied;
    }

    // Parse the repair response
    const repairs = parseRepairResponse(content);

    for (const [file, newContent] of repairs) {
      try {
        // Normalize file path
        const normalizedFile = normalizePath(file, this.options.projectPath);

        // Read the old content
        let oldContent: string | undefined;
        try {
          oldContent = (await safeReadFile(normalizedFile, 'utf-8')) as string;
        } catch {
          // File might be new
        }

        // Write the new content
        await safeWriteFile(normalizedFile, newContent, 'utf-8');

        // Find errors that this repair addresses (compare normalized paths)
        const addressedErrors = errors.filter(
          (e) => normalizePath(e.error.file, this.options.projectPath) === normalizedFile
        );
        for (const addressedError of addressedErrors) {
          // Build repair object conditionally to satisfy exactOptionalPropertyTypes
          if (oldContent !== undefined) {
            applied.push({
              error: addressedError,
              file: normalizedFile,
              description: addressedError.repairHint,
              oldContent,
              newContent,
            });
          } else {
            applied.push({
              error: addressedError,
              file: normalizedFile,
              description: addressedError.repairHint,
              newContent,
            });
          }
        }

        this.options.logger(`Applied repair to ${normalizedFile}`);
      } catch (error) {
        this.options.logger(
          `Failed to apply repair to ${file}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return applied;
  }
}

/**
 * Creates a compilation verifier with the given options.
 *
 * @param options - Verifier options.
 * @returns A new compilation verifier.
 *
 * @example
 * ```typescript
 * const verifier = createCompilationVerifier({
 *   projectPath: './generated',
 *   files: ['types.ts', 'functions.ts'],
 *   maxRepairAttempts: 5,
 *   modelRouter: router,
 * });
 *
 * const result = await verifier.verify();
 *
 * if (result.success) {
 *   console.log('Compilation successful!');
 * } else if (result.state.kind === 'blocked') {
 *   console.log('Compilation blocked:', result.state.reason);
 *   console.log('Unresolved errors:', result.state.unresolvedErrors);
 * }
 * ```
 */
export function createCompilationVerifier(
  options: CompilationVerifierOptions
): CompilationVerifier {
  return new CompilationVerifier(options);
}

/**
 * Formats a compilation verification result as a human-readable report.
 *
 * @param result - The verification result.
 * @returns A formatted string representation.
 */
export function formatVerificationReport(result: CompilationVerificationResult): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║                    COMPILATION VERIFICATION REPORT                           ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
  ];

  // Status
  const status = result.success ? '✓ SUCCESS' : '✗ BLOCKED';
  lines.push(`║ Status: ${status.padEnd(68)}║`);
  lines.push(`║ Total Duration: ${String(result.totalDurationMs).padEnd(59)}ms ║`);
  lines.push(`║ Attempts: ${String(result.attempts.length).padEnd(66)}║`);

  // Attempt details
  if (result.attempts.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    lines.push('║ ATTEMPT DETAILS                                                              ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

    for (const attempt of result.attempts) {
      const attemptStatus = attempt.success ? '✓' : '✗';
      lines.push(
        `║ Attempt ${String(attempt.attempt)}: ${attemptStatus} - ${String(attempt.errors.length)} errors, ${String(attempt.repairsApplied.length)} repairs (${String(attempt.durationMs)}ms)`.padEnd(
          77
        ) + '║'
      );
    }
  }

  // BLOCKED state details
  if (result.state.kind === 'blocked') {
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    lines.push('║ BLOCKED STATE                                                                ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

    const reason = result.state.reason.substring(0, 74);
    lines.push(`║ ${reason.padEnd(76)}║`);

    lines.push('║                                                                              ║');
    lines.push('║ Unresolved Errors:                                                           ║');

    for (const error of result.state.unresolvedErrors.slice(0, 5)) {
      const errorLine = `  ${error.error.code}: ${error.error.message.substring(0, 60)}`;
      lines.push(`║ ${errorLine.padEnd(76)}║`);
    }

    if (result.state.unresolvedErrors.length > 5) {
      lines.push(
        `║   ... and ${String(result.state.unresolvedErrors.length - 5)} more errors`.padEnd(77) +
          '║'
      );
    }
  }

  // AST inspection results
  if (result.astInspection !== undefined) {
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    lines.push('║ AST INSPECTION (Logic Leakage Check)                                         ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

    const inspectionStatus = result.astInspection.passed ? '✓ PASSED' : '✗ VIOLATIONS FOUND';
    lines.push(`║ ${inspectionStatus.padEnd(76)}║`);

    if (result.astInspection.logicPatterns !== undefined) {
      for (const pattern of result.astInspection.logicPatterns.slice(0, 3)) {
        const patternLine = `  Line ${String(pattern.line)}: ${pattern.description.substring(0, 55)}`;
        lines.push(`║ ${patternLine.padEnd(76)}║`);
      }
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
