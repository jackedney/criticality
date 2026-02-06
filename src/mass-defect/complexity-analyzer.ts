/**
 * Complexity analyzer and smell detector for Mass Defect phase.
 *
 * Analyzes code complexity metrics and detects code smells using
 * ESLint rules and custom heuristics.
 *
 * @packageDocumentation
 */

import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import type { Linter } from 'eslint';
import type {
  ComplexityMetrics,
  DetectedSmell,
  CodeLocation,
  TransformationCatalog,
  SmellDefinition,
} from './types.js';

type FunctionNode = ReturnType<SourceFile['getFunctions']>[number];

/**
 * ESLint instance configured for smell detection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eslintInstance: any = null;

/**
 * Initializes ESLint instance with required rules for smell detection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function initializeESLint(): Promise<any> {
  if (eslintInstance) {
    return eslintInstance;
  }

  const { ESLint } = await import('eslint');
  eslintInstance = new ESLint({
    overrideConfig: {
      rules: {
        complexity: ['error', { max: 10 }],
        'max-depth': ['error', { max: 3 }],
        'max-lines-per-function': ['error', { max: 50, skipComments: true }],
        'no-magic-numbers': ['error', { ignore: [0, 1, -1], ignoreArrayIndexes: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ForStatement',
            message:
              'Use functional transformations (map/filter/reduce) instead of traditional for loops',
          },
        ],
      },
    },
    overrideConfigFile: undefined,
  });

  return eslintInstance;
}

/**
 * Analyzes complexity metrics for a source file using ts-morph.
 *
 * @param sourceFile - The ts-morph SourceFile to analyze.
 * @returns ComplexityMetrics with cyclomatic complexity, function length, nesting depth, and test coverage.
 */
export function analyzeComplexity(sourceFile: SourceFile): ComplexityMetrics {
  let maxCyclomaticComplexity = 0;
  let maxFunctionLength = 0;
  let maxNestingDepth = 0;

  const functions = sourceFile.getFunctions();

  for (const func of functions) {
    const functionLength = func.getBody()?.getFullText().split('\n').length ?? 0;
    maxFunctionLength = Math.max(maxFunctionLength, functionLength);

    const cyclomaticComplexity = calculateCyclomaticComplexity(func);
    maxCyclomaticComplexity = Math.max(maxCyclomaticComplexity, cyclomaticComplexity);

    const nestingDepth = calculateNestingDepth(func);
    maxNestingDepth = Math.max(maxNestingDepth, nestingDepth);
  }

  return {
    cyclomaticComplexity: maxCyclomaticComplexity,
    functionLength: maxFunctionLength,
    nestingDepth: maxNestingDepth,
    testCoverage: 0,
  };
}

/**
 * Calculates cyclomatic complexity for a function.
 *
 * Complexity = 1 + number of binary decision points.
 */
function calculateCyclomaticComplexity(func: FunctionNode): number {
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
 * Calculates maximum nesting depth for a function.
 */
function calculateNestingDepth(func: FunctionNode): number {
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
 * Detects code smells in a source file using ESLint and heuristics.
 *
 * @param sourceFile - The ts-morph SourceFile to analyze.
 * @param catalog - The transformation catalog containing smell definitions.
 * @returns Array of DetectedSmell objects with smellId, severity, and location.
 */
export async function detectSmells(
  sourceFile: SourceFile,
  catalog: TransformationCatalog
): Promise<DetectedSmell[]> {
  const detectedSmells: DetectedSmell[] = [];

  const eslintResults = await runESLint(sourceFile);
  detectedSmells.push(...processESLintResults(eslintResults, catalog));

  const heuristicResults = runHeuristics(sourceFile, catalog);
  detectedSmells.push(...heuristicResults);

  return detectedSmells;
}

/**
 * Runs ESLint on a source file and returns violations.
 */
async function runESLint(
  sourceFile: SourceFile
): Promise<{ messages: Linter.LintMessage[]; filePath: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const eslint = await initializeESLint();
  const filePath = sourceFile.getFilePath();

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await eslint.lintFiles([filePath]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (results.length === 0) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    return results.map((result: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      messages: result.messages ?? [],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      filePath: result.filePath ?? filePath,
    }));
  } catch {
    return [];
  }
}

/**
 * Processes ESLint results and maps them to DetectedSmell objects.
 */
function processESLintResults(
  eslintResults: { messages: Linter.LintMessage[]; filePath: string }[],
  catalog: TransformationCatalog
): DetectedSmell[] {
  const detectedSmells: DetectedSmell[] = [];

  for (const eslintResult of eslintResults) {
    const { messages, filePath } = eslintResult;

    for (const message of messages) {
      const smellId = mapESLintRuleToSmell(message.ruleId ?? '');
      const smell = catalog.getSmell(smellId);

      if (!smell) {
        continue;
      }

      const location: CodeLocation = {
        filePath,
        line: message.line,
        column: message.column,
      };

      const severity = calculateSeverity(smell, message);

      detectedSmells.push({
        smellId,
        severity,
        location,
      });
    }
  }

  return detectedSmells;
}

/**
 * Maps ESLint rule IDs to smell IDs.
 */
function mapESLintRuleToSmell(ruleId: string): string {
  const ruleToSmellMap: Record<string, string> = {
    complexity: 'high-cyclomatic-complexity',
    'max-depth': 'deep-nesting',
    'max-lines-per-function': 'long-function-body',
    'no-unused-vars': 'unused-binding',
    'no-unreachable': 'unreachable-code',
    'no-magic-numbers': 'magic-values',
    'no-restricted-syntax': 'imperative-loop',
  };

  // eslint-disable-next-line security/detect-object-injection
  return ruleToSmellMap[ruleId] ?? '';
}

/**
 * Calculates severity for a detected smell.
 *
 * Severity is based on how much threshold is exceeded.
 */
function calculateSeverity(smell: SmellDefinition, message: Linter.LintMessage): number {
  const thresholds = smell.detection.thresholds;

  if (!thresholds || Object.keys(thresholds).length === 0) {
    return 1;
  }

  let maxSeverity = 1;

  const entries = Object.entries(thresholds);

  for (const [key, threshold] of entries) {
    if (typeof threshold !== 'number') {
      continue;
    }

    if (message.ruleId === 'complexity' && key === 'max_cyclomatic_complexity') {
      const complexityMatch = message.message.match(/\d+/);
      const complexity = complexityMatch?.[0] ?? '10';
      const actualValue = parseInt(complexity, 10);
      if (actualValue > threshold) {
        maxSeverity = Math.max(maxSeverity, Math.ceil((actualValue - threshold) / threshold));
      }
    }

    if (message.ruleId === 'max-depth' && key === 'max_nesting_depth') {
      const depthMatch = message.message.match(/\d+/);
      const depth = depthMatch?.[0] ?? '3';
      const actualValue = parseInt(depth, 10);
      if (actualValue > threshold) {
        maxSeverity = Math.max(maxSeverity, Math.ceil((actualValue - threshold) / threshold));
      }
    }

    if (message.ruleId === 'max-lines-per-function' && key === 'max_function_length_lines') {
      const linesMatch = message.message.match(/\d+/);
      const lines = linesMatch?.[0] ?? '50';
      const actualValue = parseInt(lines, 10);
      if (actualValue > threshold) {
        maxSeverity = Math.max(maxSeverity, Math.ceil((actualValue - threshold) / threshold));
      }
    }
  }

  return maxSeverity;
}

/**
 * Runs heuristic-based detection logic for smells ESLint misses.
 */
function runHeuristics(sourceFile: SourceFile, catalog: TransformationCatalog): DetectedSmell[] {
  const detectedSmells: DetectedSmell[] = [];

  const overDocumentationSmell = detectOverDocumentation(sourceFile, catalog);
  if (overDocumentationSmell) {
    detectedSmells.push(overDocumentationSmell);
  }

  return detectedSmells;
}

/**
 * Detects over-documentation smell using comment-to-code ratio heuristic.
 */
function detectOverDocumentation(
  sourceFile: SourceFile,
  catalog: TransformationCatalog
): DetectedSmell | null {
  const smell = catalog.getSmell('over-documentation');

  if (!smell) {
    return null;
  }

  const threshold = smell.detection.thresholds?.max_comment_to_code_ratio ?? 0.5;

  const functions = sourceFile.getFunctions();

  for (const func of functions) {
    const body = func.getBody();

    if (!body) {
      continue;
    }

    const bodyText = body.getFullText();
    const lines = bodyText.split('\n');

    let commentLines = 0;
    let codeLines = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*')
      ) {
        commentLines++;
      } else if (trimmedLine.length > 0) {
        codeLines++;
      }
    }

    if (codeLines === 0) {
      continue;
    }

    const ratio = commentLines / codeLines;

    if (ratio > threshold) {
      const startLine = func.getStartLineNumber();

      const location: CodeLocation = {
        filePath: sourceFile.getFilePath(),
        line: startLine,
        column: 0,
      };

      return {
        smellId: 'over-documentation',
        severity: Math.ceil(ratio / threshold),
        location,
      };
    }
  }

  return null;
}

/**
 * Creates a ts-morph SourceFile from source code string.
 *
 * Useful for testing smell detection with code snippets.
 *
 * @param code - The source code string.
 * @param fileName - Optional file name for the source file.
 * @returns A ts-morph SourceFile object.
 */
export function createSourceFileFromString(code: string, fileName = 'temp.ts'): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
  });

  return project.createSourceFile(fileName, code);
}
