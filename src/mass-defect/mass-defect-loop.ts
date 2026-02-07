/**
 * Mass Defect iteration loop for Phase IV.
 *
 * Orchestrates the transformation loop that repeatedly applies
 * transformations until convergence or no applicable patterns remain.
 *
 * @packageDocumentation
 */

import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import type { ModelRouter } from '../router/types.js';
import type {
  TransformationCatalog,
  MassDefectConfig,
  MassDefectResult,
  FunctionResult,
  FunctionStatus,
  TransformationAttempt,
  ComplexityMetrics,
  FunctionId,
  FunctionContext,
  DetectedSmell,
  TransformationType,
} from './types.js';
import { detectSmells } from './complexity-analyzer.js';
import { applyTransformation } from './transformation-applier.js';
import { verifyTransformation } from './semantic-verifier.js';

/**
 * Tracks transformation state for a single function during iteration.
 */
interface FunctionIterationState {
  functionId: FunctionId;
  functionStartLine: number;
  functionEndLine: number;
  sourceFile: SourceFile;
  functionName: string;
  filePath: string;
  originalCode: string;
  currentCode: string;
  initialMetrics: ComplexityMetrics;
  currentMetrics: ComplexityMetrics;
  previouslyAttempted: string[];
  attempts: TransformationAttempt[];
  status: FunctionStatus;
  reason?: string;
}

/**
 * Runs the Mass Defect iteration loop on source files.
 *
 * @param sourceFiles - Array of ts-morph SourceFile objects to process.
 * @param catalog - Transformation catalog containing smell and pattern definitions.
 * @param config - Mass Defect configuration with complexity targets.
 * @param router - Model router for LLM transformations.
 * @returns Promise resolving to MassDefectResult with all transformation records.
 *
 * @remarks
 * The iteration loop:
 * - For each function exceeding complexity targets: detect smells, select patterns, apply transformations
 * - Tracks previouslyAttempted patterns per function to avoid retry loops
 * - After each successful transformation: re-analyze metrics, continue if still exceeding targets
 * - Stops iteration when: all functions meet targets OR no more applicable patterns for any function
 * - Applies transformations atomically: on verification failure, revert to original code
 * - Records all transformation attempts in MassDefectResult for reporting
 *
 * @example
 * // Function with complexity 15 -> apply early-return -> complexity 8 -> done (meets target 10)
 * const result = await runMassDefect(
 *   sourceFiles,
 *   catalog,
 *   { maxCyclomaticComplexity: 10, maxFunctionLength: 50, maxNestingDepth: 4, minTestCoverage: 0.8, catalogPath: './catalog' },
 *   router
 * );
 * // result.converged === true
 * // result.transformedFunctions === 1
 */
export async function runMassDefect(
  sourceFiles: SourceFile[],
  catalog: TransformationCatalog,
  config: MassDefectConfig,
  router: ModelRouter
): Promise<MassDefectResult> {
  const functionResults = new Map<FunctionId, FunctionResult>();

  for (const sourceFile of sourceFiles) {
    const functionStates = initializeFunctionStates(sourceFile, config);

    for (const state of functionStates) {
      const result = await processFunctionIteration(state, catalog, config, router);
      functionResults.set(state.functionId, result);
    }
  }

  return buildMassDefectResult(functionResults, config);
}

/**
 * Initializes iteration state for all functions in a source file.
 */
function initializeFunctionStates(
  sourceFile: SourceFile,
  config: MassDefectConfig
): FunctionIterationState[] {
  const states: FunctionIterationState[] = [];
  const filePath = sourceFile.getFilePath();

  const functions = sourceFile.getFunctions();

  for (const func of functions) {
    const startLine = func.getStartLineNumber();
    const endLine = func.getEndLineNumber();
    const functionName = func.getName() ?? 'anonymous';
    const functionId = `${filePath}:${functionName}:${String(startLine)}`;
    const functionCode = func.getFullText();

    const metrics = calculateFunctionMetrics(func);

    const state: FunctionIterationState = {
      functionId,
      functionStartLine: startLine,
      functionEndLine: endLine,
      sourceFile,
      functionName,
      filePath,
      originalCode: functionCode,
      currentCode: functionCode,
      initialMetrics: metrics,
      currentMetrics: metrics,
      previouslyAttempted: [],
      attempts: [],
      status: 'optimal',
    };

    if (!meetsComplexityTargets(metrics, config)) {
      state.status = 'manual_review_required';
    }

    states.push(state);
  }

  return states;
}

/**
 * Calculates complexity metrics for a single function.
 */
function calculateFunctionMetrics(
  func: ReturnType<SourceFile['getFunctions']>[number]
): ComplexityMetrics {
  let cyclomaticComplexity = 1;
  let nestingDepth = 0;
  const functionLength = func.getBody()?.getFullText().split('\n').length ?? 0;

  const body = func.getBody();
  if (body) {
    cyclomaticComplexity = calculateFunctionCyclomaticComplexity(func);
    nestingDepth = calculateFunctionNestingDepth(func);
  }

  return {
    cyclomaticComplexity,
    functionLength,
    nestingDepth,
    testCoverage: undefined,
  };
}

/**
 * Calculates cyclomatic complexity for a single function.
 */
function calculateFunctionCyclomaticComplexity(
  func: ReturnType<SourceFile['getFunctions']>[number]
): number {
  let complexity = 1;
  const body = func.getBody();

  if (!body) {
    return complexity;
  }

  const decisionPoints = [
    SyntaxKind.IfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.CaseClause,
    SyntaxKind.ConditionalExpression,
  ];

  const descendants = body.getDescendants();

  for (const descendant of descendants) {
    if (decisionPoints.includes(descendant.getKind())) {
      complexity++;
    }
  }

  return complexity;
}

/**
 * Calculates nesting depth for a single function.
 */
function calculateFunctionNestingDepth(
  func: ReturnType<SourceFile['getFunctions']>[number]
): number {
  const body = func.getBody();

  if (!body) {
    return 0;
  }

  const nestedStructures = [
    SyntaxKind.IfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.SwitchStatement,
  ];

  let maxDepth = 0;

  const traverse = (
    node: { getKind(): SyntaxKind; getChildren?(): unknown[] },
    depth: number
  ): void => {
    maxDepth = Math.max(maxDepth, depth);
    const children = node.getChildren?.() ?? [];
    for (const child of children) {
      const childNode = child as { getKind(): SyntaxKind; getChildren?(): unknown[] };
      const newDepth = nestedStructures.includes(childNode.getKind()) ? depth + 1 : depth;
      traverse(childNode, newDepth);
    }
  };

  traverse(body, 0);

  return maxDepth;
}

/**
 * Checks if function metrics meet complexity targets.
 *
 * Test coverage check is skipped when testCoverage is undefined or
 * when minTestCoverage is 0 (disabled).
 */
function meetsComplexityTargets(metrics: ComplexityMetrics, config: MassDefectConfig): boolean {
  const meetsComplexity = metrics.cyclomaticComplexity <= config.maxCyclomaticComplexity;
  const meetsLength = metrics.functionLength <= config.maxFunctionLength;
  const meetsNesting = metrics.nestingDepth <= config.maxNestingDepth;

  // Test coverage check is skipped when:
  // - minTestCoverage is 0 (coverage enforcement disabled)
  // - testCoverage is undefined (coverage not yet computed)
  const coverageEnforced = config.minTestCoverage > 0;
  const meetsCoverage =
    !coverageEnforced ||
    metrics.testCoverage === undefined ||
    metrics.testCoverage >= config.minTestCoverage;

  return meetsComplexity && meetsLength && meetsNesting && meetsCoverage;
}

/**
 * Processes iteration for a single function until convergence or no patterns remain.
 */
async function processFunctionIteration(
  state: FunctionIterationState,
  catalog: TransformationCatalog,
  config: MassDefectConfig,
  router: ModelRouter
): Promise<FunctionResult> {
  let madeProgress = true;

  while (madeProgress && !meetsComplexityTargets(state.currentMetrics, config)) {
    madeProgress = false;

    const smells = await detectSmells(state.sourceFile, catalog);
    const functionSmells = filterSmellsForFunction(smells, state);

    if (functionSmells.length === 0) {
      break;
    }

    const functionContext: FunctionContext = {
      functionId: state.functionId,
      currentMetrics: state.currentMetrics,
      previouslyAttempted: state.previouslyAttempted,
    };

    const transformations = catalog.selectPatterns(functionSmells, functionContext);

    if (transformations.length === 0) {
      break;
    }

    for (const transformation of transformations) {
      const result = await attemptTransformation(state, transformation, catalog, config, router);

      if (result) {
        madeProgress = true;
        state.previouslyAttempted.push(transformation.patternId);

        if (meetsComplexityTargets(state.currentMetrics, config)) {
          state.status = 'converged';
          break;
        }

        break;
      }
    }
  }

  if (!meetsComplexityTargets(state.currentMetrics, config)) {
    // If no attempts were made, it means no applicable patterns were found
    // If attempts were made but all failed, it still requires manual review
    state.status = 'manual_review_required';
    if (state.attempts.length === 0) {
      state.reason = 'No applicable patterns found';
    }
  } else if (state.status === 'manual_review_required') {
    state.status = 'converged';
  }

  const result: FunctionResult = {
    functionId: state.functionId,
    status: state.status,
    initialMetrics: state.initialMetrics,
    finalMetrics: state.currentMetrics,
    attempts: state.attempts,
  };

  if (state.status === 'manual_review_required') {
    result.reason = state.reason ?? 'No applicable patterns remain';
  }

  return result;
}

/**
 * Filters detected smells to those relevant to the current function.
 */
function filterSmellsForFunction(
  smells: DetectedSmell[],
  state: FunctionIterationState
): DetectedSmell[] {
  const functionStartLine = state.sourceFile
    .getFunctions()
    .find((f) => f.getName() === state.functionName)
    ?.getStartLineNumber();
  const functionEndLine = state.sourceFile
    .getFunctions()
    .find((f) => f.getName() === state.functionName)
    ?.getEndLineNumber();

  if (functionStartLine === undefined || functionEndLine === undefined) {
    return [];
  }

  return smells.filter((smell) => {
    return smell.location.line >= functionStartLine && smell.location.line <= functionEndLine;
  });
}

/**
 * Attempts to apply a transformation to a function.
 */
async function attemptTransformation(
  state: FunctionIterationState,
  transformation: TransformationType,
  catalog: TransformationCatalog,
  _config: MassDefectConfig,
  router: ModelRouter
): Promise<boolean> {
  const pattern = catalog.getPattern(transformation.patternId);

  if (!pattern) {
    return false;
  }

  const beforeMetrics = state.currentMetrics;
  const beforeCode = state.currentCode;

  const transformationResult = await applyTransformation(beforeCode, transformation, router);

  const attempt: TransformationAttempt = {
    patternId: transformation.patternId,
    success: transformationResult.success,
    risk: transformation.risk,
    beforeMetrics,
  };

  if (transformationResult.error !== undefined) {
    attempt.error = transformationResult.error;
  }

  if (!transformationResult.success || !transformationResult.transformedCode) {
    state.attempts.push(attempt);
    return false;
  }

  const updateSuccess = updateSourceFile(state, transformationResult.transformedCode);
  if (!updateSuccess) {
    attempt.error = 'Failed to update source file with transformed code';
    state.attempts.push(attempt);
    return false;
  }

  const func = state.sourceFile.getFunctions().find((f) => f.getName() === state.functionName);
  if (!func) {
    const revertSuccess = revertSourceFile(state, beforeCode);
    if (!revertSuccess) {
      attempt.error = 'Failed to revert source file after function not found';
    }
    state.attempts.push(attempt);
    return false;
  }

  const afterMetrics = calculateFunctionMetrics(func);

  attempt.afterMetrics = afterMetrics;

  const verificationResult = await verifyTransformation(
    beforeCode,
    transformationResult.transformedCode,
    transformation.risk,
    {
      filePath: state.filePath,
      functionName: state.functionName,
      workingDir: process.cwd(),
    }
  );

  attempt.verification = verificationResult;

  if (!verificationResult.passed) {
    const revertSuccess = revertSourceFile(state, beforeCode);
    if (!revertSuccess) {
      attempt.error = 'Failed to revert source file after verification failure';
    }
    state.attempts.push(attempt);
    return false;
  }

  state.currentCode = transformationResult.transformedCode;
  state.currentMetrics = afterMetrics;
  state.attempts.push(attempt);

  return true;
}

/**
 * Updates the source file with transformed code.
 *
 * @returns True if the update succeeded, false otherwise.
 */
function updateSourceFile(state: FunctionIterationState, newCode: string): boolean {
  const func = state.sourceFile.getFunctions().find((f) => f.getName() === state.functionName);

  if (!func) {
    return false;
  }

  const body = func.getBody();
  if (!body) {
    return false;
  }

  const project = new Project({ useInMemoryFileSystem: true });
  const tempSourceFile = project.createSourceFile('temp.ts', newCode);
  const tempFunc = tempSourceFile.getFunctions()[0];
  const tempBody = tempFunc?.getBody();

  if (tempBody) {
    body.replaceWithText(tempBody.getFullText());
    return true;
  }

  return false;
}

/**
 * Reverts the source file to original code.
 *
 * @returns True if the revert succeeded, false otherwise.
 */
function revertSourceFile(state: FunctionIterationState, originalCode: string): boolean {
  const func = state.sourceFile.getFunctions().find((f) => f.getName() === state.functionName);

  if (!func) {
    return false;
  }

  const body = func.getBody();
  if (!body) {
    return false;
  }

  const project = new Project({ useInMemoryFileSystem: true });
  const tempSourceFile = project.createSourceFile('temp.ts', originalCode);
  const tempFunc = tempSourceFile.getFunctions()[0];
  const tempBody = tempFunc?.getBody();

  if (tempBody) {
    body.replaceWithText(tempBody.getFullText());
    return true;
  }

  return false;
}

/**
 * Builds the final MassDefectResult from function results.
 */
function buildMassDefectResult(
  functionResults: Map<FunctionId, FunctionResult>,
  config: MassDefectConfig
): MassDefectResult {
  let transformedFunctions = 0;
  let optimalFunctions = 0;
  let manualReviewFunctions = 0;
  let failedFunctions = 0;

  for (const result of functionResults.values()) {
    if (result.status === 'converged' && result.attempts.length > 0) {
      transformedFunctions++;
    } else if (
      result.status === 'optimal' ||
      (result.status === 'converged' && result.attempts.length === 0)
    ) {
      optimalFunctions++;
    } else if (result.status === 'manual_review_required') {
      manualReviewFunctions++;
    } else if (result.status === 'failed') {
      failedFunctions++;
    }
  }

  const converged = manualReviewFunctions === 0 && failedFunctions === 0;

  return {
    converged,
    totalFunctions: functionResults.size,
    transformedFunctions,
    optimalFunctions,
    manualReviewFunctions,
    functionResults,
    config,
  };
}
