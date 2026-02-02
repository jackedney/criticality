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
import {
  runSecurityScan,
  securityScanToFailure,
  type SecurityScanResult,
} from './security-scanner.js';
import type { FailureType } from './escalation.js';
import {
  determineEscalation,
  type ModelTier,
  createFunctionAttempts,
  recordAttempt,
  MODEL_TIER_TO_ALIAS,
} from './escalation.js';
import { safeExists, safeReadFile, safeWriteFile } from '../utils/safe-fs.js';

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
  /** Security scan result (if performed). */
  readonly securityScanResult?: SecurityScanResult;
  /** Reason for rejection (if not accepted). */
  readonly rejectionReason?: string;
  /** The failure type for circuit breaker tracking. */
  readonly failureType?: FailureType;
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
      const finalAttempt = await this.implementFunctionWithRetry(project, todoFunction, functionId);

      for (const attempt of finalAttempt.attempts) {
        attempts.push(attempt);
      }

      if (finalAttempt.accepted) {
        implementedCount++;
        this.options.logger(`  Accepted: ${todoFunction.name}`);
        this.circuitBreaker.recordSuccess(functionId);
      } else {
        failedCount++;
        remainingTodos.push(todoFunction);
        this.options.logger(
          `  Rejected: ${todoFunction.name} - ${finalAttempt.finalRejectionReason ?? 'unknown reason'}`
        );

        // Always record failure for circuit breaker tracking
        // Use the actual failure type if available, otherwise create a fallback semantic failure
        const failureToRecord: FailureType = finalAttempt.finalFailureType ?? {
          type: 'semantic',
          violation: {
            type: 'contract',
            description:
              finalAttempt.finalRejectionReason ??
              'Implementation failed without specific failure type',
          },
        };
        this.circuitBreaker.recordFailure(functionId, failureToRecord);
      }

      // Check circuit breaker after each function
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
   * @param tier - The model tier to use.
   * @returns The implementation attempt result.
   */
  private async implementFunction(
    project: Project,
    todoFunction: TodoFunction,
    tier: ModelTier = 'worker'
  ): Promise<ImplementationAttempt> {
    const startTime = Date.now();

    // Build minimal local context
    const context = buildFunctionContext(project, todoFunction);

    // Generate implementation prompt
    const prompt = generateImplementationPrompt(context);

    // Request implementation from the appropriate model tier
    const request: ModelRouterRequest = {
      // eslint-disable-next-line security/detect-object-injection -- tier is ModelTier enum with known literal keys
      modelAlias: MODEL_TIER_TO_ALIAS[tier],
      prompt,
      parameters: {
        systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
        maxTokens: 2000,
        temperature: 0.2, // Low temperature for deterministic code generation
      },
    };

    let generatedBody = '';
    let compilationResult: TypeCheckResult;
    // Track original content for rollback - will be set before injection
    let originalContent = '';
    let injectionOccurred = false;

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
      originalContent = (await safeReadFile(todoFunction.filePath, 'utf-8')) as string;

      // Inject implementation via AST
      try {
        injectFunctionBody(project, todoFunction.filePath, todoFunction.name, generatedBody);
        injectionOccurred = true;
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
        await safeWriteFile(todoFunction.filePath, originalContent, 'utf-8');
        // Refresh to pick up the restored file
        void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();

        const errorMessages = compilationResult.errors
          .slice(0, 3)
          .map((e) => `${e.code}: ${e.message}`)
          .join('; ');

        const failure: FailureType = {
          type: 'type',
          compilerError: errorMessages,
        };

        return {
          function: todoFunction,
          accepted: false,
          generatedBody,
          compilationResult,
          rejectionReason: `Compilation failed: ${errorMessages}`,
          failureType: failure,
          durationMs: Date.now() - startTime,
        };
      }

      // Verify security scan (only if compilation passes)
      const securityScanResult = await this.runSecurityVerification(todoFunction);

      if (securityScanResult.hasCriticalVulnerabilities) {
        const failure = securityScanToFailure(securityScanResult) ?? {
          type: 'security' as const,
          vulnerability: 'injection' as const,
        };

        // Rollback: restore original file
        await safeWriteFile(todoFunction.filePath, originalContent, 'utf-8');
        void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();

        const vulnSummary = securityScanResult.vulnerabilities
          .filter((v) => v.severity === 'critical')
          .slice(0, 3)
          .map((v) => `${v.cweId ?? 'unknown'}: ${v.message}`)
          .join('; ');

        return {
          function: todoFunction,
          accepted: false,
          generatedBody,
          compilationResult,
          securityScanResult,
          rejectionReason: `Security vulnerabilities: ${vulnSummary}`,
          failureType: failure,
          durationMs: Date.now() - startTime,
        };
      }

      // Verify tests (only if compilation passes and no critical vulnerabilities)
      const testResult = await this.runTestVerification(todoFunction);

      if (testResult !== undefined && !testResult.success) {
        // Rollback: restore original file
        await safeWriteFile(todoFunction.filePath, originalContent, 'utf-8');
        void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();

        const failedTests = testResult.tests
          .filter((t) => t.status === 'failed')
          .slice(0, 3)
          .map((t) => t.name)
          .join(', ');

        const failure: FailureType = {
          type: 'test',
          failingTests: testResult.tests
            .filter((t) => t.status === 'failed' && t.error !== undefined)
            .map((t) => ({
              testName: t.name,
              expected: '<unknown>',
              actual: '<unknown>',
              errorMessage: t.error?.message ?? 'Test failed',
            })),
        };

        return {
          function: todoFunction,
          accepted: false,
          generatedBody,
          compilationResult,
          testResult,
          securityScanResult,
          rejectionReason: `Tests failed: ${failedTests}`,
          failureType: failure,
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
          securityScanResult,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        function: todoFunction,
        accepted: true,
        generatedBody,
        compilationResult,
        securityScanResult,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Rollback: restore original file if injection occurred
      if (injectionOccurred) {
        try {
          await safeWriteFile(todoFunction.filePath, originalContent, 'utf-8');
          void project.getSourceFile(todoFunction.filePath)?.refreshFromFileSystem();
        } catch {
          // Rollback failed - log but continue with error reporting
          this.options.logger(`  Warning: Failed to rollback ${todoFunction.filePath} after error`);
        }
      }

      return this.createRejectedAttempt(
        todoFunction,
        generatedBody,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        startTime
      );
    }
  }

  /**
   * Attempts to implement a single function with retry and escalation.
   *
   * This method implements the retry/escalation logic:
   * - Retries up to maxAttemptsPerFunction
   * - Escalates to higher tiers based on failure type
   * - Records attempts to circuit breaker
   *
   * @param project - The ts-morph Project.
   * @param todoFunction - The function to implement.
   * @param functionId - The function ID for circuit breaker tracking.
   * @returns An object with all attempts and final status.
   */
  private async implementFunctionWithRetry(
    project: Project,
    todoFunction: TodoFunction,
    functionId: string
  ): Promise<{
    accepted: boolean;
    attempts: ImplementationAttempt[];
    finalRejectionReason?: string;
    finalFailureType?: FailureType;
  }> {
    const attempts: ImplementationAttempt[] = [];
    let currentTier: ModelTier = 'worker';

    // Maintain persistent attempts tracker for this function across retries
    let functionAttempts = createFunctionAttempts(functionId);

    for (let attemptNum = 0; attemptNum < this.options.maxAttemptsPerFunction; attemptNum++) {
      // Record attempt start with circuit breaker
      this.circuitBreaker.recordAttemptStart(functionId, currentTier);

      // Attempt implementation at current tier
      const attempt = await this.implementFunction(project, todoFunction, currentTier);
      attempts.push(attempt);

      if (attempt.accepted) {
        return { accepted: true, attempts };
      }

      // Extract failure type from attempt
      const failureType = attempt.failureType;

      // Update the persistent attempts tracker with this attempt (and failure if present)
      functionAttempts = recordAttempt(functionAttempts, currentTier, failureType);

      if (failureType === undefined) {
        // No specific failure type, give up
        const base = { accepted: false, attempts };
        if (attempt.rejectionReason !== undefined) {
          return { ...base, finalRejectionReason: attempt.rejectionReason };
        }
        return base;
      }

      // Determine escalation action using persistent attempts tracker
      const decision = determineEscalation(failureType, functionAttempts, currentTier);

      this.options.logger(
        `  Attempt ${String(attemptNum + 1)} (${currentTier}): ${decision.reason}`
      );

      // Check for circuit break decision
      if (decision.action.type === 'circuit_break') {
        this.options.logger(`  Circuit breaker: ${decision.action.reason}`);
        const base = { accepted: false, attempts };
        if (attempt.rejectionReason !== undefined) {
          return { ...base, finalRejectionReason: attempt.rejectionReason };
        }
        return { ...base, finalFailureType: failureType };
      }

      // Check for escalation decision
      if (decision.action.type === 'escalate') {
        if (decision.nextTier !== undefined) {
          this.circuitBreaker.recordEscalation(functionId, decision.nextTier);
          currentTier = decision.nextTier;
          this.options.logger(`  Escalating to ${currentTier}`);
          continue; // Retry with new tier
        }
      }

      // Otherwise, retry on same tier
      if (decision.action.type === 'retry_same') {
        this.options.logger(`  Retrying same tier ${currentTier}`);
        continue;
      }
    }

    // Max attempts exceeded
    const lastRejectionReason =
      attempts[attempts.length - 1]?.rejectionReason ?? 'Max attempts exceeded';
    return { accepted: false, attempts, finalRejectionReason: lastRejectionReason };
  }

  /**
   * Creates a rejected attempt result.
   */
  private createRejectedAttempt(
    todoFunction: TodoFunction,
    generatedBody: string,
    reason: string,
    startTime: number,
    failureType?: FailureType
  ): ImplementationAttempt {
    const base = {
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

    if (failureType !== undefined) {
      return { ...base, failureType };
    }

    return base;
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
   * Runs security verification for a function.
   *
   * @param todoFunction - The function being verified.
   * @returns Security scan result.
   */
  private async runSecurityVerification(todoFunction: TodoFunction): Promise<SecurityScanResult> {
    this.options.logger(`  Running security scan for ${todoFunction.name}...`);

    const scanResult = await runSecurityScan({
      projectPath: this.options.projectPath,
      files: [todoFunction.filePath],
      failFastOnCritical: false, // We handle critical vulnerabilities ourselves
      logger: this.options.logger,
    });

    return scanResult;
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
      // Try both .test.ts and .spec.ts conventions
      const baseName = path.basename(todoFunction.filePath, '.ts');
      const dirName = path.dirname(todoFunction.filePath);
      const testFile = path.join(dirName, `${baseName}.test.ts`);
      const specFile = path.join(dirName, `${baseName}.spec.ts`);

      // Check if .test.ts file exists first, then fall back to .spec.ts
      const testFileExists = await safeExists(testFile);
      if (testFileExists) {
        testPattern = testFile;
      } else {
        const specFileExists = await safeExists(specFile);
        if (specFileExists) {
          testPattern = specFile;
        } else {
          // Neither test file convention found, skip test verification
          this.options.logger(
            `  No test file found for ${todoFunction.name}, skipping test verification`
          );
          return undefined;
        }
      }
    }

    try {
      return await runTests(testPattern, {
        cwd: this.options.projectPath,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.options.logger(`  Test execution error: ${errorMessage}`);

      // Return a consistent failed result with synthetic test entry
      // Build error object conditionally to satisfy exactOptionalPropertyTypes
      const testError: { message: string; stack?: string } = {
        message: errorMessage,
      };
      if (errorStack !== undefined) {
        testError.stack = errorStack;
      }

      return {
        success: false,
        totalTests: 1,
        passedTests: 0,
        failedTests: 1,
        skippedTests: 0,
        tests: [
          {
            name: `${todoFunction.name} (execution error)`,
            fullName: `${todoFunction.name} test execution failed`,
            file: todoFunction.filePath,
            status: 'failed',
            durationMs: 0,
            error: testError,
          },
        ],
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
