/**
 * Ralph Loop implementation for atomic function implementation.
 *
 * Iterates over TODO functions, extracts minimal local context, prompts the
 * worker_model via ModelRouter, injects implementations via AST, and verifies
 * through compilation + tests. Accept or discard atomically.
 *
 * Key features:
 * - Extract minimal local context: signature, contracts, required types, witness definitions
 * - No prior implementation attempts included in context (context drift prevention)
 * - Use worker_model via ModelRouter as primary
 * - Accept/discard atomically based on compilation + test results
 * - Leaves-first ordering via topological sort for dependency-aware implementation
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Project } from 'ts-morph';
import {
  findTodoFunctions,
  injectFunctionBody,
  orderByDependency,
  type TodoFunction,
} from '../adapters/typescript/ast.js';
import { serializeContractForPrompt } from '../adapters/typescript/contracts.js';
import { type MicroContract } from '../adapters/typescript/assertions.js';
import { runTypeCheck, type TypeCheckResult } from '../adapters/typescript/typecheck.js';
import { runTests, type TestRunResult } from '../adapters/typescript/testrunner.js';
import type { ModelRouter, ModelRouterRequest } from '../router/types.js';
import {
  extractContext,
  type ExtractedContext,
  type ContextSizeMetrics,
} from './context-extractor.js';
import {
  CircuitBreaker,
  createCircuitBreaker,
  type StructuralDefectReport,
  type CircuitBreakerConfig,
} from './circuit-breaker.js';

/**
 * Local context for a single function implementation.
 * Contains ONLY: signature, contracts, required types, witness definitions.
 * NO prior implementation attempts.
 */
export interface FunctionContext {
  /** The function signature (name, parameters, return type). */
  readonly signature: string;
  /** The function's micro-contracts (requires, ensures, invariant, etc.). */
  readonly contracts: readonly MicroContract[];
  /** Required type definitions that the function depends on. */
  readonly requiredTypes: readonly string[];
  /** Witness type definitions used by the function. */
  readonly witnessDefinitions: readonly string[];
  /** The file path containing the function. */
  readonly filePath: string;
  /** The function name. */
  readonly functionName: string;
  /** Context size metrics for model routing decisions. */
  readonly sizeMetrics?: ContextSizeMetrics;
  /** Whether circular references were detected. */
  readonly hadCircularReferences?: boolean;
}

/**
 * Result of attempting to implement a single function.
 */
export interface ImplementationAttempt {
  /** The function that was attempted. */
  readonly function: TodoFunction;
  /** Whether the implementation was accepted. */
  readonly accepted: boolean;
  /** The generated implementation body. */
  readonly generatedBody: string;
  /** Compilation result after injection. */
  readonly compilationResult: TypeCheckResult;
  /** Test result after injection (only if compilation succeeded). */
  readonly testResult?: TestRunResult;
  /** Reason for rejection (if not accepted). */
  readonly rejectionReason?: string;
  /** Duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Result of full Ralph Loop execution.
 */
export interface RalphLoopResult {
  /** Whether all functions were successfully implemented. */
  readonly success: boolean;
  /** Total number of TODO functions found. */
  readonly totalFunctions: number;
  /** Number of functions successfully implemented. */
  readonly implementedCount: number;
  /** Number of functions that failed implementation. */
  readonly failedCount: number;
  /** Individual attempt results. */
  readonly attempts: readonly ImplementationAttempt[];
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Functions that remain unimplemented. */
  readonly remainingTodos: readonly TodoFunction[];
  /** Circuit breaker structural defect report (if circuit tripped). */
  readonly structuralDefectReport?: StructuralDefectReport;
  /** Whether the circuit breaker tripped. */
  readonly circuitTripped: boolean;
}

/**
 * Options for Ralph Loop.
 */
export interface RalphLoopOptions {
  /** Path to project directory. */
  readonly projectPath: string;
  /** Path to tsconfig.json (optional). */
  readonly tsconfigPath?: string;
  /** ModelRouter instance for generating implementations. */
  readonly modelRouter: ModelRouter;
  /** Maximum attempts per function before giving up. Default: 3. */
  readonly maxAttemptsPerFunction?: number;
  /** Specific files to process (if not provided, processes entire project). */
  readonly files?: readonly string[];
  /** Test file pattern to run for verification. Default: matches function file. */
  readonly testPattern?: string;
  /** Logger for progress messages. */
  readonly logger?: (message: string) => void;
  /** Circuit breaker configuration (optional, uses defaults if not provided). */
  readonly circuitBreakerConfig?: CircuitBreakerConfig;
}

/**
 * System prompt for the worker model to generate function implementations.
 */
const IMPLEMENTATION_SYSTEM_PROMPT = `You are a precise TypeScript implementation assistant. Your task is to implement function bodies based on the provided signature and contracts.

CRITICAL RULES:
1. Return ONLY the function body code (the code that goes inside the function braces)
2. Do NOT include the function signature, name, or surrounding braces
3. Follow the contracts EXACTLY - they define the function's behavior
4. Use the provided types correctly
5. Keep implementations simple and focused
6. Do NOT add any explanation or markdown - just the raw code

EXAMPLE:
If given signature: function add(a: number, b: number): number
And contract: @ensures result === a + b
You return ONLY: return a + b;`;

/**
 * Generates the implementation prompt for a function.
 *
 * @param context - The function context with minimal local information.
 * @returns The prompt string for the model.
 */
export function generateImplementationPrompt(context: FunctionContext): string {
  const lines: string[] = [];

  lines.push('Implement the following TypeScript function body.');
  lines.push('');
  lines.push('FUNCTION SIGNATURE:');
  lines.push('```typescript');
  lines.push(context.signature);
  lines.push('```');
  lines.push('');

  if (context.contracts.length > 0) {
    lines.push('CONTRACTS (must be satisfied):');
    for (const contract of context.contracts) {
      lines.push(serializeContractForPrompt(contract));
    }
    lines.push('');
  }

  if (context.requiredTypes.length > 0) {
    lines.push('REQUIRED TYPES:');
    lines.push('```typescript');
    for (const typeDef of context.requiredTypes) {
      lines.push(typeDef);
    }
    lines.push('```');
    lines.push('');
  }

  if (context.witnessDefinitions.length > 0) {
    lines.push('WITNESS TYPES:');
    lines.push('```typescript');
    for (const witnessDef of context.witnessDefinitions) {
      lines.push(witnessDef);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('Return ONLY the function body code (no signature, no braces, no explanation).');

  return lines.join('\n');
}

/**
 * Parses the implementation response from the model.
 *
 * Extracts the function body from the model's response, handling
 * potential markdown code blocks.
 *
 * @param response - The raw model response.
 * @returns The extracted function body.
 */
export function parseImplementationResponse(response: string): string {
  let body = response.trim();

  // Remove markdown code block if present
  if (body.startsWith('```')) {
    // Find the end of the opening fence (handles ```typescript, ```ts, etc.)
    const firstNewline = body.indexOf('\n');
    if (firstNewline !== -1) {
      body = body.substring(firstNewline + 1);
    }
    // Remove closing fence
    const lastFence = body.lastIndexOf('```');
    if (lastFence !== -1) {
      body = body.substring(0, lastFence);
    }
  }

  return body.trim();
}

/**
 * Extracts required types for a function from the project.
 *
 * Analyzes the function's parameter types and return type to find
 * the type definitions that need to be included in the context.
 *
 * @param project - The ts-morph Project.
 * @param todoFunction - The TODO function to analyze.
 * @returns Array of type definition strings.
 */
export function extractRequiredTypes(project: Project, todoFunction: TodoFunction): string[] {
  const types: string[] = [];
  const sourceFile = project.getSourceFile(todoFunction.filePath);

  if (sourceFile === undefined) {
    return types;
  }

  // Find the function declaration
  const funcDecl = sourceFile.getFunction(todoFunction.name);
  if (funcDecl === undefined) {
    return types;
  }

  // Collect type names from parameters and return type
  const typeNames = new Set<string>();

  // Extract type names from the signature
  const signature = todoFunction.signature;

  // Simple regex to find type references (handles common patterns)
  // Matches: TypeName, TypeName<...>, TypeName[], etc.
  const typePattern = /:\s*([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = typePattern.exec(signature)) !== null) {
    const typeName = match[1];
    if (typeName !== undefined && !isBuiltInType(typeName)) {
      typeNames.add(typeName);
    }
  }

  // Also check generic type parameters
  const genericPattern = /<([A-Z][a-zA-Z0-9]*)/g;
  while ((match = genericPattern.exec(signature)) !== null) {
    const typeName = match[1];
    if (typeName !== undefined && !isBuiltInType(typeName)) {
      typeNames.add(typeName);
    }
  }

  // Find type definitions in the source file
  for (const typeName of typeNames) {
    // Check for type aliases
    const typeAlias = sourceFile.getTypeAlias(typeName);
    if (typeAlias !== undefined) {
      types.push(typeAlias.getText());
      continue;
    }

    // Check for interfaces
    const iface = sourceFile.getInterface(typeName);
    if (iface !== undefined) {
      types.push(iface.getText());
      continue;
    }

    // Check for classes
    const classDecl = sourceFile.getClass(typeName);
    if (classDecl !== undefined) {
      // For classes, just include a simplified interface-like declaration
      types.push(`// Class: ${typeName}`);
    }
  }

  return types;
}

/**
 * Checks if a type name is a built-in TypeScript type.
 *
 * @param typeName - The type name to check.
 * @returns True if it's a built-in type.
 */
function isBuiltInType(typeName: string): boolean {
  const builtIns = new Set([
    'String',
    'Number',
    'Boolean',
    'Object',
    'Array',
    'Function',
    'Symbol',
    'BigInt',
    'Promise',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Date',
    'RegExp',
    'Error',
    'ReadonlyArray',
    'Readonly',
    'Partial',
    'Required',
    'Pick',
    'Omit',
    'Record',
    'Exclude',
    'Extract',
    'NonNullable',
    'Parameters',
    'ReturnType',
    'InstanceType',
    'ThisType',
  ]);
  return builtIns.has(typeName);
}

/**
 * Extracts witness type definitions from a file.
 *
 * Looks for branded types that follow the witness pattern:
 * type Foo = string & { readonly __brand: 'Foo' }
 *
 * @param project - The ts-morph Project.
 * @param filePath - The file to search.
 * @param typeNames - Set of type names to look for.
 * @returns Array of witness type definition strings.
 */
export function extractWitnessTypes(
  project: Project,
  filePath: string,
  typeNames: Set<string>
): string[] {
  const witnesses: string[] = [];
  const sourceFile = project.getSourceFile(filePath);

  if (sourceFile === undefined) {
    return witnesses;
  }

  // Look for type aliases that match the witness pattern
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    if (!typeNames.has(name)) {
      continue;
    }

    const text = typeAlias.getText();
    // Check if it's a branded type (contains __brand)
    if (text.includes('__brand')) {
      witnesses.push(text);
    }
  }

  return witnesses;
}

/**
 * Builds the minimal local context for a function.
 *
 * Uses the new context extraction module which provides:
 * - Function signature extraction from AST
 * - Micro-contract extraction from JSDoc
 * - Required type definitions (with transitive dependencies)
 * - Witness type definitions
 * - Context size metrics for model routing
 * - Circular reference detection
 *
 * @param project - The ts-morph Project.
 * @param todoFunction - The TODO function to build context for.
 * @returns The function context.
 */
export function buildFunctionContext(
  project: Project,
  todoFunction: TodoFunction
): FunctionContext {
  // Use the new context extractor for comprehensive extraction
  const extracted = extractContext(project, todoFunction);

  // Convert ExtractedContext to FunctionContext for backward compatibility
  return {
    signature: extracted.signatureText,
    contracts: extracted.contracts,
    requiredTypes: extracted.requiredTypes.map((t) => t.definition),
    witnessDefinitions: extracted.witnessDefinitions.map((w) => w.definition),
    filePath: extracted.filePath,
    functionName: extracted.functionName,
    sizeMetrics: extracted.sizeMetrics,
    hadCircularReferences: extracted.hadCircularReferences,
  };
}

/**
 * Builds context using the new extractor and returns the full extracted context.
 *
 * This is useful when you need access to all the extracted information,
 * including structured type definitions and detailed size metrics.
 *
 * @param project - The ts-morph Project.
 * @param todoFunction - The TODO function to build context for.
 * @returns The full extracted context.
 */
export function buildExtractedContext(
  project: Project,
  todoFunction: TodoFunction
): ExtractedContext {
  return extractContext(project, todoFunction);
}

/**
 * Ralph Loop for atomic function implementation.
 *
 * Iterates over TODO functions in dependency order (leaves first),
 * extracts minimal context, prompts worker model, injects
 * implementation, and verifies through compilation + tests.
 */
export class RalphLoop {
  private readonly options: Required<
    Omit<RalphLoopOptions, 'testPattern' | 'circuitBreakerConfig'>
  > & {
    testPattern: string | undefined;
    circuitBreakerConfig: CircuitBreakerConfig | undefined;
  };
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: RalphLoopOptions) {
    this.options = {
      projectPath: path.resolve(options.projectPath),
      tsconfigPath: options.tsconfigPath ?? '',
      modelRouter: options.modelRouter,
      maxAttemptsPerFunction: options.maxAttemptsPerFunction ?? 3,
      files: options.files ?? [],
      testPattern: options.testPattern,
      // eslint-disable-next-line no-console
      logger: options.logger ?? console.log,
      circuitBreakerConfig: options.circuitBreakerConfig ?? undefined,
    };
    this.circuitBreaker = createCircuitBreaker(options.circuitBreakerConfig);
  }

  /**
   * Runs Ralph Loop on project.
   *
   * 1. Find all TODO functions
   * 2. Order by dependency (leaves first)
   * 3. For each function:
   *    a. Extract minimal local context
   *    b. Prompt worker_model for implementation
   *    c. Inject implementation via AST
   *    d. Verify compilation
   *    e. Verify tests (if compilation passes)
   *    f. Accept if both pass, discard otherwise
   * 4. Check circuit breaker after each attempt
   * 5. If circuit trips, return to Lattice with structural defect report
   *
   * @returns The loop result with all attempt details.
   */
  async run(): Promise<RalphLoopResult> {
    const startTime = Date.now();
    const attempts: ImplementationAttempt[] = [];

    this.options.logger(`Starting Ralph Loop for ${this.options.projectPath}`);

    // Create ts-morph project
    const project = new Project({
      tsConfigFilePath:
        this.options.tsconfigPath !== ''
          ? path.resolve(this.options.projectPath, this.options.tsconfigPath)
          : path.resolve(this.options.projectPath, 'tsconfig.json'),
    });

    // Find all TODO functions
    let todoFunctions = findTodoFunctions(project);

    // Register all functions with circuit breaker
    for (const todo of todoFunctions) {
      const functionId = `${todo.filePath}:${todo.name}`;
      this.circuitBreaker.registerFunction(functionId, todo.filePath);
    }

    // Filter to specific files if provided
    if (this.options.files.length > 0) {
      const absoluteFiles = this.options.files.map((f) =>
        path.resolve(this.options.projectPath, f)
      );
      todoFunctions = todoFunctions.filter((fn) => absoluteFiles.includes(fn.filePath));
    }

    this.options.logger(`Found ${String(todoFunctions.length)} TODO functions`);

    if (todoFunctions.length === 0) {
      return {
        success: true,
        totalFunctions: 0,
        implementedCount: 0,
        failedCount: 0,
        attempts: [],
        totalDurationMs: Date.now() - startTime,
        remainingTodos: [],
        circuitTripped: false,
      };
    }

    // Order by dependency (leaves first)
    const orderedFunctions = orderByDependency(todoFunctions, project);
    this.options.logger(`Ordered functions: ${orderedFunctions.map((f) => f.name).join(', ')}`);

    // Process each function
    let implementedCount = 0;
    let failedCount = 0;
    const remainingTodos: TodoFunction[] = [];

    for (const todoFunction of orderedFunctions) {
      this.options.logger(`Processing: ${todoFunction.name}`);

      const functionId = `${todoFunction.filePath}:${todoFunction.name}`;
      const attempt = await this.implementFunction(project, todoFunction);
      attempts.push(attempt);

      if (attempt.accepted) {
        implementedCount++;
        this.options.logger(`  Accepted: ${todoFunction.name}`);
        this.circuitBreaker.recordSuccess(functionId);
      } else {
        failedCount++;
        remainingTodos.push(todoFunction);
        this.options.logger(
          `  Rejected: ${todoFunction.name} - ${attempt.rejectionReason ?? 'unknown reason'}`
        );

        let failure:
          | {
              type: 'test';
              failingTests: readonly {
                testName: string;
                expected: string;
                actual: string;
                errorMessage?: string;
              }[];
            }
          | { type: 'type'; compilerError: string };

        if (attempt.testResult !== undefined && !attempt.testResult.success) {
          failure = {
            type: 'test',
            failingTests: attempt.testResult.tests
              .filter((t) => t.status === 'failed' && t.error !== undefined)
              .map((t) => ({
                testName: t.name,
                expected: '<unknown>',
                actual: '<unknown>',
                errorMessage: t.error?.message ?? 'Test failed',
              })),
          };
        } else {
          failure = {
            type: 'type',
            compilerError: attempt.rejectionReason ?? 'Unknown error',
          };
        }

        this.circuitBreaker.recordFailure(functionId, failure);
      }

      // Check circuit breaker after each attempt
      const circuitCheck = this.circuitBreaker.check();

      if (circuitCheck.shouldTrip) {
        const tripType = circuitCheck.tripReason?.type ?? 'unknown';
        this.options.logger(`[CIRCUIT BREAKER TRIPPED] ${tripType}`);

        const report = this.circuitBreaker.generateReport();

        if (report === undefined) {
          throw new Error('Circuit breaker tripped but no report generated');
        }

        const result: RalphLoopResult = {
          success: false,
          totalFunctions: todoFunctions.length,
          implementedCount,
          failedCount,
          attempts,
          totalDurationMs: Date.now() - startTime,
          remainingTodos,
          circuitTripped: true,
          structuralDefectReport: report,
        };

        return result;
      }
    }

    const result: RalphLoopResult = {
      success: failedCount === 0,
      totalFunctions: todoFunctions.length,
      implementedCount,
      failedCount,
      attempts,
      totalDurationMs: Date.now() - startTime,
      remainingTodos,
      circuitTripped: false,
    };

    this.options.logger(
      `Ralph Loop complete: ${String(implementedCount)}/${String(todoFunctions.length)} implemented`
    );

    return result;
  }

  /**
   * Attempts to implement a single function.
   *
   * @param project - The ts-morph Project.
   * @param todoFunction - The function to implement.
   * @returns The implementation attempt result.
   */
  private async implementFunction(
    project: Project,
    todoFunction: TodoFunction
  ): Promise<ImplementationAttempt> {
    const startTime = Date.now();

    // Build minimal local context
    const context = buildFunctionContext(project, todoFunction);

    // Generate implementation prompt
    const prompt = generateImplementationPrompt(context);

    // Request implementation from worker_model
    const request: ModelRouterRequest = {
      modelAlias: 'worker',
      prompt,
      parameters: {
        systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
        maxTokens: 2000,
        temperature: 0.2, // Low temperature for deterministic code generation
      },
    };

    let generatedBody = '';
    let compilationResult: TypeCheckResult;

    try {
      const result = await this.options.modelRouter.complete(request);

      if (!result.success) {
        return this.createRejectedAttempt(
          todoFunction,
          '',
          `Model error: ${result.error.message}`,
          startTime
        );
      }

      generatedBody = parseImplementationResponse(result.response.content);

      if (generatedBody === '') {
        return this.createRejectedAttempt(
          todoFunction,
          '',
          'Empty implementation returned',
          startTime
        );
      }

      // Save original file content for potential rollback
      const originalContent = await fs.readFile(todoFunction.filePath, 'utf-8');

      // Inject implementation via AST
      try {
        injectFunctionBody(project, todoFunction.filePath, todoFunction.name, generatedBody);
      } catch (injectError) {
        return this.createRejectedAttempt(
          todoFunction,
          generatedBody,
          `Failed to inject function body: ${injectError instanceof Error ? injectError.message : String(injectError)}`,
          startTime
        );
      }

      // Verify compilation
      compilationResult = await this.runCompilationCheck();

      if (!compilationResult.success) {
        // Rollback: restore original file
        await fs.writeFile(todoFunction.filePath, originalContent, 'utf-8');
        // Refresh the project to pick up the restored file
        void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();

        const errorMessages = compilationResult.errors
          .slice(0, 3)
          .map((e) => `${e.code}: ${e.message}`)
          .join('; ');

        return {
          function: todoFunction,
          accepted: false,
          generatedBody,
          compilationResult,
          rejectionReason: `Compilation failed: ${errorMessages}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Verify tests (only if compilation passes)
      const testResult = await this.runTestVerification(todoFunction);

      if (testResult !== undefined && !testResult.success) {
        // Rollback: restore original file
        await fs.writeFile(todoFunction.filePath, originalContent, 'utf-8');
        void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();

        const failedTests = testResult.tests
          .filter((t) => t.status === 'failed')
          .slice(0, 3)
          .map((t) => t.name)
          .join(', ');

        return {
          function: todoFunction,
          accepted: false,
          generatedBody,
          compilationResult,
          testResult,
          rejectionReason: `Tests failed: ${failedTests}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Success! Accept the implementation
      // Build result conditionally to satisfy exactOptionalPropertyTypes
      if (testResult !== undefined) {
        return {
          function: todoFunction,
          accepted: true,
          generatedBody,
          compilationResult,
          testResult,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        function: todoFunction,
        accepted: true,
        generatedBody,
        compilationResult,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return this.createRejectedAttempt(
        todoFunction,
        generatedBody,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        startTime
      );
    }
  }

  /**
   * Creates a rejected attempt result.
   */
  private createRejectedAttempt(
    todoFunction: TodoFunction,
    generatedBody: string,
    reason: string,
    startTime: number
  ): ImplementationAttempt {
    return {
      function: todoFunction,
      accepted: false,
      generatedBody,
      compilationResult: {
        success: false,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      },
      rejectionReason: reason,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Runs compilation check on the project.
   */
  private async runCompilationCheck(): Promise<TypeCheckResult> {
    // Build options conditionally
    if (this.options.tsconfigPath !== '') {
      return runTypeCheck(this.options.projectPath, {
        tsconfigPath: this.options.tsconfigPath,
      });
    }
    return runTypeCheck(this.options.projectPath, {});
  }

  /**
   * Runs test verification for a function.
   *
   * @param todoFunction - The function being tested.
   * @returns Test results, or undefined if no tests found.
   */
  private async runTestVerification(
    todoFunction: TodoFunction
  ): Promise<TestRunResult | undefined> {
    // Determine test pattern
    let testPattern = this.options.testPattern;

    if (testPattern === undefined) {
      // Default: look for a test file matching the source file
      const baseName = path.basename(todoFunction.filePath, '.ts');
      const dirName = path.dirname(todoFunction.filePath);
      const testFile = path.join(dirName, `${baseName}.test.ts`);

      // Check if test file exists
      try {
        await fs.access(testFile);
        testPattern = testFile;
      } catch {
        // No matching test file found, skip test verification
        this.options.logger(
          `  No test file found for ${todoFunction.name}, skipping test verification`
        );
        return undefined;
      }
    }

    try {
      return await runTests(testPattern, {
        cwd: this.options.projectPath,
      });
    } catch (error) {
      this.options.logger(
        `  Test execution error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Return a failed result rather than undefined to trigger rejection
      return {
        success: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 1,
        skippedTests: 0,
        tests: [],
      };
    }
  }
}

/**
 * Creates a Ralph Loop instance.
 *
 * @param options - Loop options.
 * @returns A new Ralph Loop instance.
 *
 * @example
 * ```typescript
 * const loop = createRalphLoop({
 *   projectPath: './my-project',
 *   modelRouter: router,
 * });
 *
 * const result = await loop.run();
 *
 * if (result.success) {
 *   console.log(`Implemented ${result.implementedCount} functions`);
 * } else {
 *   console.log(`Failed to implement ${result.failedCount} functions`);
 *   for (const fn of result.remainingTodos) {
 *     console.log(`  - ${fn.name}`);
 *   }
 * }
 * ```
 */
export function createRalphLoop(options: RalphLoopOptions): RalphLoop {
  return new RalphLoop(options);
}

/**
 * Formats a Ralph Loop result as a human-readable report.
 *
 * @param result - The loop result.
 * @returns A formatted string representation.
 */
export function formatRalphLoopReport(result: RalphLoopResult): string {
  const lines: string[] = [
    '================================================================================',
    '                           RALPH LOOP REPORT                                    ',
    '================================================================================',
    '',
    `Status: ${result.success ? 'SUCCESS' : 'INCOMPLETE'}`,
    `Total Functions: ${String(result.totalFunctions)}`,
    `Implemented: ${String(result.implementedCount)}`,
    `Failed: ${String(result.failedCount)}`,
    `Duration: ${String(result.totalDurationMs)}ms`,
    '',
  ];

  if (result.attempts.length > 0) {
    lines.push('ATTEMPTS:');
    lines.push('--------------------------------------------------------------------------------');

    for (const attempt of result.attempts) {
      const status = attempt.accepted ? '[ACCEPTED]' : '[REJECTED]';
      lines.push(`${status} ${attempt.function.name} (${String(attempt.durationMs)}ms)`);

      if (!attempt.accepted && attempt.rejectionReason !== undefined) {
        lines.push(`  Reason: ${attempt.rejectionReason}`);
      }
    }
    lines.push('');
  }

  if (result.remainingTodos.length > 0) {
    lines.push('REMAINING TODO FUNCTIONS:');
    lines.push('--------------------------------------------------------------------------------');

    for (const fn of result.remainingTodos) {
      lines.push(`  - ${fn.name} (${fn.filePath}:${String(fn.line)})`);
    }
    lines.push('');
  }

  lines.push('================================================================================');

  return lines.join('\n');
}

// Re-export context extraction utilities for external use
export {
  extractContext,
  serializeContextForPrompt,
  shouldEscalateToLargerModel,
  type ExtractedContext,
  type ContextSizeMetrics,
  type ExtractedTypeDefinition,
  type ContextExtractionOptions,
} from './context-extractor.js';
