/**
 * TypeScript adapter facade for the Criticality Protocol.
 *
 * Provides a unified interface for interacting with TypeScript targets,
 * including TODO detection, context extraction, code injection, verification,
 * and test execution.
 *
 * @module adapters/typescript
 */

import { type Project } from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  createProject,
  findTodoFunctions as findTodoFunctionsFromAst,
  injectFunctionBody,
  orderByDependency,
  type TodoFunction,
} from './ast.js';
import { extractSignature, type FunctionSignature } from './signature.js';
import { extractReferencedTypes, type ExtractedType } from './types.js';
import { parseContracts, serializeContractForPrompt } from './contracts.js';
import { type MicroContract } from './assertions.js';
import { runTypeCheck, type TypeCheckResult } from './typecheck.js';
import { runTests as runVitestTests, type TestRunResult } from './testrunner.js';

// Re-export types for consumers
export type { TodoFunction } from './ast.js';
export type { FunctionSignature, ParameterInfo, TypeParameterInfo } from './signature.js';
export type { ExtractedType, TypeMember, ExtractedTypeParameter } from './types.js';
export type { MicroContract, InlineAssertion } from './assertions.js';
export type { TypeCheckResult, CompilerError, TypeDetails } from './typecheck.js';
export type { TestRunResult, TestResult, TestError, TestStatus } from './testrunner.js';

/**
 * Error thrown when attempting to use an adapter that hasn't been initialized.
 */
export class AdapterNotInitializedError extends Error {
  constructor() {
    super('Adapter not initialized. Call initialize() first.');
    this.name = 'AdapterNotInitializedError';
  }
}

/**
 * Error thrown when the target project is not a TypeScript project.
 */
export class NotTypeScriptProjectError extends Error {
  constructor(projectPath: string) {
    super(
      `Not a TypeScript project: ${projectPath}. ` +
        'No tsconfig.json found and no .ts files present.'
    );
    this.name = 'NotTypeScriptProjectError';
  }
}

/**
 * Error thrown when a function cannot be found for context extraction.
 */
export class FunctionNotFoundError extends Error {
  constructor(functionName: string, filePath?: string) {
    const location = filePath !== undefined && filePath !== '' ? ` in ${filePath}` : '';
    super(`Function '${functionName}' not found${location}`);
    this.name = 'FunctionNotFoundError';
  }
}

/**
 * Represents a workspace package in a monorepo.
 */
export interface WorkspacePackage {
  /** The package name from package.json */
  name: string;
  /** Absolute path to the package directory */
  path: string;
  /** Whether this package has a tsconfig.json */
  hasTsConfig: boolean;
}

/**
 * Context information for a function, used during the Injection phase.
 */
export interface FunctionContext {
  /** The function signature */
  signature: FunctionSignature;
  /** Referenced types needed for implementation */
  referencedTypes: ExtractedType[];
  /** The micro-contract for this function, if any */
  contract?: MicroContract;
  /** Serialized contract for LLM prompt, if contract exists */
  serializedContract?: string;
  /** The file path where the function is defined */
  filePath: string;
  /** The line number where the function starts */
  line: number;
}

/**
 * Result of injecting a function body.
 */
export interface InjectionResult {
  /** Whether the injection was successful */
  success: boolean;
  /** The file path that was modified */
  filePath: string;
  /** The function name that was injected */
  functionName: string;
  /** Error message if injection failed */
  error?: string;
}

/**
 * Result of verifying the project after injection.
 */
export interface VerificationResult {
  /** Whether the verification passed (no type errors) */
  success: boolean;
  /** The type check result */
  typeCheck: TypeCheckResult;
}

/**
 * The TargetAdapter interface defines the contract for language-specific adapters.
 *
 * Implementations provide access to TODO detection, context extraction,
 * code injection, and verification for a specific target language.
 */
export interface TargetAdapter {
  /**
   * Initializes the adapter for a specific project.
   *
   * @param projectPath - Path to the project directory.
   * @throws {NotTypeScriptProjectError} If the project is not a valid TypeScript project.
   */
  initialize(projectPath: string): Promise<void>;

  /**
   * Finds all functions with TODO bodies that need implementation.
   *
   * @returns Array of TodoFunction objects sorted in topological order.
   * @throws {AdapterNotInitializedError} If initialize() hasn't been called.
   */
  findTodoFunctions(): TodoFunction[];

  /**
   * Extracts context for a specific function to support code generation.
   *
   * @param functionName - The name of the function.
   * @param filePath - Optional file path to disambiguate functions with the same name.
   * @returns The function context including signature, types, and contract.
   * @throws {AdapterNotInitializedError} If initialize() hasn't been called.
   * @throws {FunctionNotFoundError} If the function cannot be found.
   */
  extractContext(functionName: string, filePath?: string): FunctionContext;

  /**
   * Injects a generated function body into a TODO stub.
   *
   * @param functionName - The name of the function to inject into.
   * @param body - The new function body (without curly braces).
   * @param filePath - Optional file path to disambiguate functions with the same name.
   * @returns The result of the injection.
   * @throws {AdapterNotInitializedError} If initialize() hasn't been called.
   */
  inject(functionName: string, body: string, filePath?: string): InjectionResult;

  /**
   * Verifies the project compiles without errors after injection.
   *
   * @returns The verification result including type check details.
   * @throws {AdapterNotInitializedError} If initialize() hasn't been called.
   */
  verify(): Promise<VerificationResult>;

  /**
   * Runs tests matching the specified pattern.
   *
   * @param pattern - Test file pattern (e.g., "**\/*.test.ts").
   * @returns The test run result.
   * @throws {AdapterNotInitializedError} If initialize() hasn't been called.
   */
  runTests(pattern: string): Promise<TestRunResult>;
}

/**
 * TypeScript adapter implementing the TargetAdapter interface.
 *
 * Provides full Criticality Protocol support for TypeScript projects:
 * - TODO detection using AST analysis
 * - Context extraction including signatures, types, and contracts
 * - Code injection with syntax validation
 * - Type checking via tsc
 * - Test execution via vitest
 *
 * @example
 * const adapter = new TypeScriptAdapter();
 * await adapter.initialize('./my-project');
 *
 * const todos = adapter.findTodoFunctions();
 * for (const todo of todos) {
 *   const context = adapter.extractContext(todo.name, todo.filePath);
 *   // Generate implementation using context...
 *   adapter.inject(todo.name, generatedBody, todo.filePath);
 * }
 *
 * const verification = await adapter.verify();
 * if (!verification.success) {
 *   console.log('Type errors:', verification.typeCheck.errors);
 * }
 */
export class TypeScriptAdapter implements TargetAdapter {
  private project: Project | null = null;
  private projectPath: string | null = null;
  private workspacePackages: WorkspacePackage[] = [];
  private isInitialized = false;

  /**
   * Initializes the adapter for a TypeScript project.
   *
   * This method:
   * - Validates the project is a TypeScript project
   * - Creates a ts-morph Project instance
   * - Detects monorepo workspace packages
   * - Adds source files to the project
   *
   * @param projectPath - Path to the project directory.
   * @throws {NotTypeScriptProjectError} If no tsconfig.json or .ts files found.
   *
   * @example
   * const adapter = new TypeScriptAdapter();
   * await adapter.initialize('./my-typescript-project');
   */
  async initialize(projectPath: string): Promise<void> {
    const resolvedPath = path.resolve(projectPath);

    // Validate the project exists
    if (!fs.existsSync(resolvedPath)) {
      throw new NotTypeScriptProjectError(resolvedPath);
    }

    // Check for tsconfig.json
    const tsConfigPath = path.join(resolvedPath, 'tsconfig.json');
    const hasTsConfig = fs.existsSync(tsConfigPath);

    // If no tsconfig, check for .ts files
    if (!hasTsConfig) {
      const hasTypeScriptFiles = await this.hasTypeScriptFiles(resolvedPath);
      if (!hasTypeScriptFiles) {
        throw new NotTypeScriptProjectError(resolvedPath);
      }
    }

    // Create the project
    const project = hasTsConfig ? createProject(tsConfigPath) : createProject();
    this.project = project;
    this.projectPath = resolvedPath;

    // Detect workspace packages
    this.workspacePackages = this.detectWorkspacePackages(resolvedPath);

    // Add source files
    if (hasTsConfig) {
      // ts-morph will handle files based on tsconfig
      // But we also need to add .ts files for discovery
      this.addSourceFiles(resolvedPath, project);
    } else {
      // No tsconfig - add all .ts files manually
      this.addSourceFiles(resolvedPath, project);
    }

    this.isInitialized = true;
  }

  /**
   * Finds all functions with TODO bodies in the project.
   *
   * Functions are returned in topological order with leaves first,
   * enabling injection to proceed from dependencies to dependents.
   *
   * @returns Array of TodoFunction objects.
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  findTodoFunctions(): TodoFunction[] {
    const { project } = this.ensureInitialized();
    return findTodoFunctionsFromAst(project);
  }

  /**
   * Extracts context for a function to support code generation.
   *
   * The context includes:
   * - Full function signature with parameters and types
   * - All referenced types (interfaces, type aliases, etc.)
   * - Micro-contract (if defined via JSDoc)
   * - Serialized contract for LLM prompts
   *
   * @param functionName - The function name to extract context for.
   * @param filePath - Optional file path to disambiguate.
   * @returns The function context.
   * @throws {AdapterNotInitializedError} If not initialized.
   * @throws {FunctionNotFoundError} If function not found.
   */
  extractContext(functionName: string, filePath?: string): FunctionContext {
    const { project } = this.ensureInitialized();

    // Find the function in the project
    const func = this.findFunction(functionName, filePath, project);
    if (func === null) {
      throw new FunctionNotFoundError(functionName, filePath);
    }

    // Extract signature
    const signature = extractSignature(func.node);

    // Extract referenced types
    const referencedTypes = extractReferencedTypes(signature, project);

    // Parse contracts from the file
    const contracts = parseContracts(project, func.filePath);
    const contract = contracts.find((c) => c.functionName === functionName);

    // Build the context
    const context: FunctionContext = {
      signature,
      referencedTypes,
      filePath: func.filePath,
      line: func.line,
    };

    if (contract) {
      context.contract = contract;
      const serialized = serializeContractForPrompt(contract);
      if (serialized !== '') {
        context.serializedContract = serialized;
      }
    }

    return context;
  }

  /**
   * Injects a function body into a TODO stub.
   *
   * The injection:
   * - Validates syntax before modifying files
   * - Preserves function signature, decorators, and JSDoc
   * - Supports async and generator functions
   *
   * @param functionName - The function name to inject into.
   * @param body - The new function body (without curly braces).
   * @param filePath - Optional file path to disambiguate.
   * @returns The injection result.
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  inject(functionName: string, body: string, filePath?: string): InjectionResult {
    const { project } = this.ensureInitialized();

    // Find the function
    const func = this.findFunction(functionName, filePath, project);
    if (func === null) {
      return {
        success: false,
        filePath: filePath ?? '',
        functionName,
        error: `Function '${functionName}' not found`,
      };
    }

    try {
      injectFunctionBody(project, func.filePath, functionName, body);
      return {
        success: true,
        filePath: func.filePath,
        functionName,
      };
    } catch (error) {
      return {
        success: false,
        filePath: func.filePath,
        functionName,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verifies the project compiles without type errors.
   *
   * Uses TypeScript's --noEmit mode to check types without generating output.
   *
   * @returns The verification result.
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  async verify(): Promise<VerificationResult> {
    const { projectPath } = this.ensureInitialized();

    const typeCheck = await runTypeCheck(projectPath);

    return {
      success: typeCheck.success,
      typeCheck,
    };
  }

  /**
   * Runs tests matching the specified pattern.
   *
   * @param pattern - Test file pattern (e.g., "**\/*.test.ts").
   * @returns The test run result.
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  async runTests(pattern: string): Promise<TestRunResult> {
    const { projectPath } = this.ensureInitialized();

    return runVitestTests(pattern, {
      cwd: projectPath,
    });
  }

  /**
   * Gets the detected workspace packages (for monorepo support).
   *
   * @returns Array of workspace packages.
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  getWorkspacePackages(): WorkspacePackage[] {
    this.ensureInitialized();
    return [...this.workspacePackages];
  }

  /**
   * Gets the project path.
   *
   * @returns The project path or null if not initialized.
   */
  getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Orders functions by their dependencies for injection.
   *
   * @param functions - The functions to order.
   * @returns Functions in topological order (leaves first).
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  orderByDependency(functions: TodoFunction[]): TodoFunction[] {
    const { project } = this.ensureInitialized();
    return orderByDependency(functions, project);
  }

  /**
   * Ensures the adapter has been initialized and returns the project.
   *
   * @throws {AdapterNotInitializedError} If not initialized.
   */
  private ensureInitialized(): { project: Project; projectPath: string } {
    if (!this.isInitialized || this.project === null || this.projectPath === null) {
      throw new AdapterNotInitializedError();
    }
    return { project: this.project, projectPath: this.projectPath };
  }

  /**
   * Checks if a directory contains TypeScript files.
   */
  private async hasTypeScriptFiles(dirPath: string): Promise<boolean> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const hasTs = await this.hasTypeScriptFiles(fullPath);
        if (hasTs) {
          return true;
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detects workspace packages in a monorepo.
   *
   * Supports:
   * - npm/yarn workspaces defined in package.json
   * - pnpm workspaces defined in pnpm-workspace.yaml
   * - Lerna packages
   */
  private detectWorkspacePackages(projectPath: string): WorkspacePackage[] {
    const packages: WorkspacePackage[] = [];

    // Check for npm/yarn workspaces in package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
          workspaces?: string[] | { packages?: string[] };
        };

        let workspacePatterns: string[] = [];

        if (Array.isArray(packageJson.workspaces)) {
          workspacePatterns = packageJson.workspaces;
        } else if (packageJson.workspaces?.packages) {
          workspacePatterns = packageJson.workspaces.packages;
        }

        for (const pattern of workspacePatterns) {
          const foundPackages = this.findPackagesMatchingPattern(projectPath, pattern);
          packages.push(...foundPackages);
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check for pnpm workspaces
    const pnpmWorkspacePath = path.join(projectPath, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWorkspacePath) && packages.length === 0) {
      try {
        const content = fs.readFileSync(pnpmWorkspacePath, 'utf-8');
        // Simple YAML parsing for packages array
        const packagesMatch = /packages:\s*\n((?:\s+-\s+.+\n?)+)/i.exec(content);
        const matchContent = packagesMatch?.[1];
        if (matchContent !== undefined) {
          const patterns = matchContent
            .split('\n')
            .map((line) => line.trim().replace(/^-\s*/, '').replace(/['"`]/g, ''))
            .filter((p) => p !== '');

          for (const pattern of patterns) {
            const foundPackages = this.findPackagesMatchingPattern(projectPath, pattern);
            packages.push(...foundPackages);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    return packages;
  }

  /**
   * Finds packages matching a workspace pattern.
   */
  private findPackagesMatchingPattern(basePath: string, pattern: string): WorkspacePackage[] {
    const packages: WorkspacePackage[] = [];

    // Simple glob expansion - handles patterns like "packages/*" or "apps/*"
    if (pattern.endsWith('/*')) {
      const dirPath = path.join(basePath, pattern.slice(0, -2));
      if (fs.existsSync(dirPath)) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const packagePath = path.join(dirPath, entry.name);
            const packageJsonPath = path.join(packagePath, 'package.json');
            const tsConfigPath = path.join(packagePath, 'tsconfig.json');

            if (fs.existsSync(packageJsonPath)) {
              try {
                const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
                  name?: string;
                };
                packages.push({
                  name: pkgJson.name ?? entry.name,
                  path: packagePath,
                  hasTsConfig: fs.existsSync(tsConfigPath),
                });
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } else {
      // Direct path (no glob)
      const packagePath = path.join(basePath, pattern);
      const packageJsonPath = path.join(packagePath, 'package.json');
      const tsConfigPath = path.join(packagePath, 'tsconfig.json');

      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
            name?: string;
          };
          packages.push({
            name: pkgJson.name ?? path.basename(pattern),
            path: packagePath,
            hasTsConfig: fs.existsSync(tsConfigPath),
          });
        } catch {
          // Ignore parse errors
        }
      }
    }

    return packages;
  }

  /**
   * Adds source files to the project.
   */
  private addSourceFiles(dirPath: string, project: Project): void {
    const srcDir = path.join(dirPath, 'src');
    if (fs.existsSync(srcDir)) {
      project.addSourceFilesAtPaths(`${srcDir}/**/*.ts`);
    } else {
      // No src directory - add all .ts files from root
      project.addSourceFilesAtPaths(`${dirPath}/**/*.ts`);
    }
  }

  /**
   * Finds a function by name in the project.
   */
  private findFunction(
    functionName: string,
    filePath: string | undefined,
    project: Project
  ): {
    node: import('ts-morph').FunctionDeclaration | import('ts-morph').MethodDeclaration;
    filePath: string;
    line: number;
  } | null {
    const sourceFiles =
      filePath !== undefined && filePath !== ''
        ? [project.getSourceFile(filePath)].filter(
            (sf): sf is import('ts-morph').SourceFile => sf !== undefined
          )
        : project.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      const sfPath = sourceFile.getFilePath();
      if (sfPath.includes('node_modules') || sfPath.endsWith('.d.ts')) {
        continue;
      }

      // Check function declarations
      for (const func of sourceFile.getFunctions()) {
        if (func.getName() === functionName) {
          return {
            node: func,
            filePath: sfPath,
            line: func.getStartLineNumber(),
          };
        }
      }

      // Check class methods
      for (const classDecl of sourceFile.getClasses()) {
        for (const method of classDecl.getMethods()) {
          if (method.getName() === functionName) {
            return {
              node: method,
              filePath: sfPath,
              line: method.getStartLineNumber(),
            };
          }
        }
      }
    }

    return null;
  }
}
// Re-export test generators
export {
  generateTemporalTests,
  generateTemporalTest,
  type TemporalTestOptions,
  DEFAULT_TIMEOUT as TEMPORAL_DEFAULT_TIMEOUT,
} from './temporal-test-generator.js';

export {
  generateNegativeTests,
  generateNegativeTest,
  type NegativeTestOptions,
  DEFAULT_TIMEOUT as NEGATIVE_DEFAULT_TIMEOUT,
} from './negative-test-generator.js';

export {
  generateSpecDrivenTests,
  SpecDrivenTestOptions,
  SpecDrivenTestError,
} from './mesoscopic/spec-driven-test-generator.js';
