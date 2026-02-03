/**
 * TypeScript AST manipulation module using ts-morph.
 *
 * @module adapters/typescript/ast
 */

import {
  Project,
  type ProjectOptions,
  type FunctionDeclaration,
  type MethodDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  SyntaxKind,
  type SourceFile,
} from 'ts-morph';
import * as path from 'node:path';
import { safeExistsSync } from '../../utils/safe-fs.js';

/**
 * Error thrown when a tsconfig.json file cannot be found.
 */
export class TsConfigNotFoundError extends Error {
  constructor(tsConfigPath: string) {
    super(`tsconfig.json not found at path: ${tsConfigPath}`);
    this.name = 'TsConfigNotFoundError';
  }
}

/**
 * Creates a ts-morph Project for AST manipulation.
 *
 * @param tsConfigPath - Optional path to a tsconfig.json file. If provided,
 *   the project will use the TypeScript configuration from that file.
 *   If not provided, sensible defaults with strict mode enabled are used.
 * @returns A ts-morph Project instance configured for the target codebase.
 * @throws {TsConfigNotFoundError} If tsConfigPath is provided but the file does not exist.
 *
 * @example
 * // Using a specific tsconfig.json
 * const project = createProject('./tsconfig.json');
 *
 * @example
 * // Using default compiler options with strict: true
 * const project = createProject();
 */
export function createProject(tsConfigPath?: string): Project {
  if (tsConfigPath !== undefined) {
    const resolvedPath = path.resolve(tsConfigPath);

    if (!safeExistsSync(resolvedPath)) {
      throw new TsConfigNotFoundError(resolvedPath);
    }

    return new Project({
      tsConfigFilePath: resolvedPath,
    });
  }

  const defaultOptions: ProjectOptions = {
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      target: 99, // ScriptTarget.ESNext
      module: 199, // ModuleKind.NodeNext
      moduleResolution: 99, // ModuleResolutionKind.NodeNext
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
    },
  };

  return new Project(defaultOptions);
}

/**
 * Represents a function with a TODO body that needs implementation.
 */
export interface TodoFunction {
  /** The name of the function (or '<anonymous>' for unnamed functions) */
  name: string;
  /** The absolute file path where the function is defined */
  filePath: string;
  /** The line number where the function starts (1-indexed) */
  line: number;
  /** The function signature as a string */
  signature: string;
  /** Whether the function body contains a TODO marker */
  hasTodoBody: true;
}

/**
 * Internal type for function-like declarations that can have TODO bodies.
 */
type FunctionLike = FunctionDeclaration | MethodDeclaration | ArrowFunction | FunctionExpression;

/**
 * Regular expression patterns for detecting TODO markers.
 * Matches:
 * - throw new Error('TODO')
 * - throw new Error("TODO")
 * - todo!() macro-style comment pattern
 */
const TODO_PATTERNS = [/throw\s+new\s+Error\s*\(\s*['"]TODO['"]\s*\)/, /\/\/\s*todo!\s*\(\s*\)/i];

/**
 * Singleton project for validation to avoid repeated initialization overhead.
 * Using in-memory file system for speed.
 */
const VALIDATION_PROJECT = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    strict: true,
    target: 99, // ScriptTarget.ESNext
    module: 199, // ModuleKind.NodeNext
  },
});

/**
 * Checks if a function body contains a TODO marker.
 *
 * @param functionNode - The function-like node to check.
 * @returns True if the function body contains a TODO marker.
 */
function hasTodoMarker(functionNode: FunctionLike): boolean {
  const body = functionNode.getBody();
  if (!body) {
    return false;
  }

  const bodyText = body.getText();

  return TODO_PATTERNS.some((pattern) => pattern.test(bodyText));
}

/**
 * Extracts the function signature as a string.
 *
 * @param functionNode - The function-like node.
 * @returns The function signature.
 */
function extractSignature(functionNode: FunctionLike): string {
  const body = functionNode.getBody();
  if (!body) {
    return functionNode.getText();
  }

  // Get full text and remove the body to get just the signature
  const fullText = functionNode.getText();
  const bodyText = body.getText();
  const bodyIndex = fullText.lastIndexOf(bodyText);

  if (bodyIndex > 0) {
    return fullText.substring(0, bodyIndex).trim();
  }

  return fullText;
}

/**
 * Gets the name of a function-like node.
 *
 * @param functionNode - The function-like node.
 * @returns The function name or '<anonymous>' if unnamed.
 */
function getFunctionName(functionNode: FunctionLike): string {
  if ('getName' in functionNode) {
    const name = functionNode.getName();
    if (name !== undefined && name !== '') {
      return name;
    }
  }

  // For arrow functions and function expressions assigned to variables
  const parent = functionNode.getParent();
  if (parent.getKind() === SyntaxKind.VariableDeclaration) {
    const varDecl = parent.asKind(SyntaxKind.VariableDeclaration);
    if (varDecl !== undefined) {
      return varDecl.getName();
    }
  }

  // For property assignments like { myFunc: () => {} }
  if (parent.getKind() === SyntaxKind.PropertyAssignment) {
    const propAssign = parent.asKind(SyntaxKind.PropertyAssignment);
    if (propAssign !== undefined) {
      return propAssign.getName();
    }
  }

  return '<anonymous>';
}

/**
 * Collects all function-like declarations from a source file.
 *
 * @param sourceFile - The source file to scan.
 * @returns Array of function-like nodes.
 */
function collectFunctions(sourceFile: SourceFile): FunctionLike[] {
  const functions: FunctionLike[] = [];

  // Collect top-level function declarations
  functions.push(...sourceFile.getFunctions());

  // Collect class methods
  for (const classDecl of sourceFile.getClasses()) {
    functions.push(...classDecl.getMethods());
  }

  // Recursively collect arrow functions and function expressions using optimized traversal
  const arrows = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
  const expressions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);

  functions.push(...arrows);
  functions.push(...expressions);

  return functions;
}

/**
 * Builds a call graph for the given functions.
 * Returns a map of function name to the names of functions it calls.
 *
 * @param functions - Array of function-like nodes.
 * @returns Map of function name to called function names.
 */
function buildCallGraph(functions: FunctionLike[]): Map<string, Set<string>> {
  const functionNames = new Set(functions.map((f) => getFunctionName(f)));
  const callGraph = new Map<string, Set<string>>();

  for (const func of functions) {
    const name = getFunctionName(func);
    const calls = new Set<string>();

    // Find all call expressions in the function body
    const body = func.getBody();
    if (body) {
      // Use getDescendantsOfKind for optimized traversal
      const callExpressions = body.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const callExpr of callExpressions) {
        const expr = callExpr.getExpression();
        // Get the identifier being called
        if (expr.getKind() === SyntaxKind.Identifier) {
          const calledName = expr.getText();
          // Only track calls to functions in our set
          if (functionNames.has(calledName) && calledName !== name) {
            calls.add(calledName);
          }
        }
      }
    }

    callGraph.set(name, calls);
  }

  return callGraph;
}

/**
 * Finds strongly connected components (cycles) in the dependency graph using Tarjan's algorithm.
 * Returns SCCs in reverse topological order (leaves first).
 *
 * @param nodes - Set of node names.
 * @param dependsOn - Map of node name to nodes it depends on (calls).
 * @returns Array of SCCs, where each SCC is an array of node names.
 */
function findStronglyConnectedComponents(
  nodes: Set<string>,
  dependsOn: Map<string, Set<string>>
): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowLinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const deps = dependsOn.get(v) ?? new Set<string>();
    for (const w of deps) {
      if (!nodes.has(w)) {
        continue;
      }
      if (!indices.has(w)) {
        strongConnect(w);
        lowLinks.set(v, Math.min(lowLinks.get(v) ?? 0, lowLinks.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowLinks.set(v, Math.min(lowLinks.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }

    if (lowLinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w !== v && w !== undefined);
      sccs.push(scc.sort()); // Sort for deterministic ordering
    }
  }

  // Process nodes in sorted order for determinism
  const sortedNodes = [...nodes].sort();
  for (const v of sortedNodes) {
    if (!indices.has(v)) {
      strongConnect(v);
    }
  }

  return sccs;
}

/**
 * Performs topological sort on functions based on their call dependencies.
 * Returns functions in order where leaves (functions that don't call other TODO functions) come first.
 * This ensures we implement dependencies before the functions that depend on them.
 * Handles cycles by grouping cycle members together as a batch.
 *
 * @param functions - Array of TodoFunction objects.
 * @param callGraph - Map of function name to called function names.
 * @returns Sorted array with leaves first (dependencies before dependents).
 *          Functions in cycles are grouped together as a batch.
 */
function topologicalSort(
  functions: TodoFunction[],
  callGraph: Map<string, Set<string>>
): TodoFunction[] {
  // Only consider functions that are in our TODO list
  const todoNames = new Set(functions.map((f) => f.name));

  // Filter call graph to only include calls to other TODO functions
  // This graph shows: caller -> [callees it depends on]
  const dependsOn = new Map<string, Set<string>>();
  for (const func of functions) {
    const calls = callGraph.get(func.name);
    const filteredCalls = new Set<string>();
    if (calls) {
      for (const called of calls) {
        if (todoNames.has(called)) {
          filteredCalls.add(called);
        }
      }
    }
    dependsOn.set(func.name, filteredCalls);
  }

  // Find SCCs (cycle detection) - returns SCCs in reverse topological order
  const sccs = findStronglyConnectedComponents(todoNames, dependsOn);

  // Build SCC-level dependency graph
  const nodeToScc = new Map<string, number>();
  for (let i = 0; i < sccs.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- safe array access with numeric loop counter
    const scc = sccs[i];
    if (scc) {
      for (const node of scc) {
        nodeToScc.set(node, i);
      }
    }
  }

  // Build SCC-level dependencies
  const sccDepsOn = new Map<number, Set<number>>();
  for (let i = 0; i < sccs.length; i++) {
    sccDepsOn.set(i, new Set());
  }
  for (const [caller, callees] of dependsOn) {
    const callerScc = nodeToScc.get(caller);
    if (callerScc === undefined) {
      continue;
    }
    for (const callee of callees) {
      const calleeScc = nodeToScc.get(callee);
      if (calleeScc !== undefined && calleeScc !== callerScc) {
        sccDepsOn.get(callerScc)?.add(calleeScc);
      }
    }
  }

  // Topologically sort SCCs using Kahn's algorithm
  const sccOutDegree = new Map<number, number>();
  const sccDependedOnBy = new Map<number, Set<number>>();
  for (let i = 0; i < sccs.length; i++) {
    sccOutDegree.set(i, sccDepsOn.get(i)?.size ?? 0);
    sccDependedOnBy.set(i, new Set());
  }
  for (const [scc, deps] of sccDepsOn) {
    for (const dep of deps) {
      sccDependedOnBy.get(dep)?.add(scc);
    }
  }

  // Start with SCCs that have no outgoing dependencies (leaves)
  const sccQueue: number[] = [];
  for (const [scc, degree] of sccOutDegree) {
    if (degree === 0) {
      sccQueue.push(scc);
    }
  }
  sccQueue.sort((a, b) => a - b);

  const result: TodoFunction[] = [];
  const funcMap = new Map(functions.map((f) => [f.name, f]));
  const processedSccs = new Set<number>();

  while (sccQueue.length > 0) {
    const sccIndex = sccQueue.shift();
    if (sccIndex === undefined || processedSccs.has(sccIndex)) {
      continue;
    }
    processedSccs.add(sccIndex);

    // eslint-disable-next-line security/detect-object-injection -- safe array access with validated numeric index
    const scc = sccs[sccIndex];
    if (scc) {
      // Add all functions in this SCC (already sorted for determinism)
      for (const name of scc) {
        const func = funcMap.get(name);
        if (func !== undefined) {
          result.push(func);
        }
      }
    }

    // Update SCC-level dependencies
    const dependents = sccDependedOnBy.get(sccIndex);
    if (dependents) {
      for (const dependent of dependents) {
        const newDegree = (sccOutDegree.get(dependent) ?? 1) - 1;
        sccOutDegree.set(dependent, newDegree);
        if (newDegree === 0 && !processedSccs.has(dependent)) {
          // Insert in sorted position
          const insertIndex = sccQueue.findIndex((q) => q > dependent);
          if (insertIndex === -1) {
            sccQueue.push(dependent);
          } else {
            sccQueue.splice(insertIndex, 0, dependent);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Orders functions by their dependencies using topological sort.
 * Functions are returned with leaves first (functions that don't depend on other TODO functions).
 * This enables injection to proceed from independent functions to those that depend on them.
 *
 * @param functions - Array of TodoFunction objects to order.
 * @param project - The ts-morph Project containing the source files.
 * @returns Functions in topological order with leaves first.
 *          Functions in cycles are grouped together as a batch.
 *
 * @example
 * // If A calls B and B calls C, order is [C, B, A]
 * const ordered = orderByDependency([A, B, C], project);
 * // ordered === [C, B, A]
 *
 * @example
 * // If A and B call each other (cycle), they are returned as a batch
 * const ordered = orderByDependency([A, B], project);
 * // ordered contains both A and B adjacent to each other
 */
export function orderByDependency(functions: TodoFunction[], project: Project): TodoFunction[] {
  if (functions.length === 0) {
    return [];
  }

  // Get all source files from the project
  const allFunctions: FunctionLike[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue;
    }
    allFunctions.push(...collectFunctions(sourceFile));
  }

  // Build call graph from all functions
  const callGraph = buildCallGraph(allFunctions);

  // Perform topological sort
  return topologicalSort(functions, callGraph);
}

/**
 * Error thrown when attempting to inject into a function that doesn't exist.
 */
export class FunctionNotFoundError extends Error {
  constructor(functionName: string, filePath: string) {
    super(`Function '${functionName}' not found in file: ${filePath}`);
    this.name = 'FunctionNotFoundError';
  }
}

/**
 * Error thrown when the injected body contains syntax errors.
 */
export class InvalidBodySyntaxError extends Error {
  constructor(functionName: string, originalMessage: string) {
    super(`Invalid body syntax for function '${functionName}': ${originalMessage}`);
    this.name = 'InvalidBodySyntaxError';
  }
}

/**
 * Finds a function-like declaration by name in a source file.
 *
 * @param sourceFile - The source file to search in.
 * @param functionName - The name of the function to find.
 * @returns The function-like node if found, undefined otherwise.
 */
function findFunctionByName(
  sourceFile: SourceFile,
  functionName: string
): FunctionLike | undefined {
  // Check top-level function declarations
  for (const func of sourceFile.getFunctions()) {
    if (func.getName() === functionName) {
      return func;
    }
  }

  // Check class methods
  for (const classDecl of sourceFile.getClasses()) {
    for (const method of classDecl.getMethods()) {
      if (method.getName() === functionName) {
        return method;
      }
    }
  }

  // Check arrow functions and function expressions assigned to variables
  for (const statement of sourceFile.getStatements()) {
    if (statement.getKind() === SyntaxKind.VariableStatement) {
      const varStatement = statement.asKind(SyntaxKind.VariableStatement);
      if (varStatement !== undefined) {
        for (const decl of varStatement.getDeclarationList().getDeclarations()) {
          if (decl.getName() === functionName) {
            const initializer = decl.getInitializer();
            if (initializer) {
              if (
                initializer.getKind() === SyntaxKind.ArrowFunction ||
                initializer.getKind() === SyntaxKind.FunctionExpression
              ) {
                return initializer as ArrowFunction | FunctionExpression;
              }
            }
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Validates that a body string is syntactically valid TypeScript.
 *
 * @param body - The body string to validate.
 * @param isAsync - Whether the function is async (allows await).
 * @param isGenerator - Whether the function is a generator (allows yield).
 * @returns An error message if invalid, undefined if valid.
 */
function validateBodySyntax(
  body: string,
  isAsync: boolean,
  isGenerator: boolean
): string | undefined {
  // Use the singleton project to parse the body
  const tempProject = VALIDATION_PROJECT;

  // Wrap body in a function to validate it as a function body
  let functionPrefix = 'function __validate__() ';
  if (isAsync && isGenerator) {
    functionPrefix = 'async function* __validate__() ';
  } else if (isAsync) {
    functionPrefix = 'async function __validate__() ';
  } else if (isGenerator) {
    functionPrefix = 'function* __validate__() ';
  }

  const wrappedBody = `${functionPrefix}{ ${body} }`;

  try {
    // Use overwrite: true to handle repeated calls
    const tempFile = tempProject.createSourceFile('__validate__.ts', wrappedBody, {
      overwrite: true,
    });
    const diagnostics = tempFile.getPreEmitDiagnostics();

    // Filter for syntax errors (not type errors)
    const syntaxErrors = diagnostics.filter((d) => {
      const code = d.getCode();
      // TypeScript error codes 1000-1999 are generally parse/syntax errors
      return code >= 1000 && code < 2000;
    });

    if (syntaxErrors.length > 0) {
      const firstError = syntaxErrors[0];
      if (firstError) {
        const messageText = firstError.getMessageText();
        // getMessageText() returns string | DiagnosticMessageChain
        if (typeof messageText === 'string') {
          return messageText;
        }
        // DiagnosticMessageChain has a messageText property
        return messageText.getMessageText();
      }
      return 'Unknown syntax error';
    }

    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unknown parse error';
  } finally {
    // Clean up the source file to keep the project clean
    const sourceFile = tempProject.getSourceFile('__validate__.ts');
    if (sourceFile) {
      tempProject.removeSourceFile(sourceFile);
    }
  }
}

/**
 * Injects a function body into an existing function, replacing the current body.
 *
 * This function:
 * - Replaces the existing function body (including `throw new Error('TODO')`) with the new body
 * - Preserves function signature, decorators, JSDoc comments
 * - Handles async functions (body may contain await)
 * - Handles generator functions (body may contain yield)
 * - Saves changes to the source file after injection
 *
 * @param project - The ts-morph Project containing the file.
 * @param filePath - The path to the source file containing the function.
 * @param functionName - The name of the function to inject into.
 * @param body - The new function body to inject (without curly braces).
 * @throws {FunctionNotFoundError} If the function doesn't exist in the file.
 * @throws {InvalidBodySyntaxError} If the body contains syntax errors.
 *
 * @example
 * // Injecting 'return a + b;' into add(a, b) { throw new Error('TODO'); }
 * // produces add(a, b) { return a + b; }
 * injectFunctionBody(project, './math.ts', 'add', 'return a + b;');
 */
export function injectFunctionBody(
  project: Project,
  filePath: string,
  functionName: string,
  body: string
): void {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    throw new FunctionNotFoundError(functionName, filePath);
  }

  const func = findFunctionByName(sourceFile, functionName);
  if (!func) {
    throw new FunctionNotFoundError(functionName, filePath);
  }

  // Determine if the function is async or generator
  let isAsync = false;
  let isGenerator = false;

  if (
    func.getKind() === SyntaxKind.FunctionDeclaration ||
    func.getKind() === SyntaxKind.MethodDeclaration ||
    func.getKind() === SyntaxKind.FunctionExpression
  ) {
    const funcDecl = func as FunctionDeclaration | MethodDeclaration | FunctionExpression;
    isAsync = funcDecl.isAsync();
    isGenerator = funcDecl.isGenerator();
  } else if (func.getKind() === SyntaxKind.ArrowFunction) {
    const arrowFunc = func as ArrowFunction;
    isAsync = arrowFunc.isAsync();
    // Arrow functions cannot be generators
    isGenerator = false;
  }

  // Validate the body syntax before modifying the file
  const syntaxError = validateBodySyntax(body, isAsync, isGenerator);
  if (syntaxError !== undefined) {
    throw new InvalidBodySyntaxError(functionName, syntaxError);
  }

  // Get the existing body
  const existingBody = func.getBody();
  if (!existingBody) {
    // Function has no body (e.g., abstract method or overload declaration)
    throw new FunctionNotFoundError(functionName, filePath);
  }

  // For arrow functions with expression body, we need to set a block body
  if (func.getKind() === SyntaxKind.ArrowFunction) {
    const arrowFunc = func as ArrowFunction;
    // Use setBodyText which handles both expression and block bodies
    arrowFunc.setBodyText(body);
  } else {
    // For function declarations, methods, and function expressions, use setBodyText
    const funcWithBody = func as FunctionDeclaration | MethodDeclaration | FunctionExpression;
    funcWithBody.setBodyText(body);
  }

  // Save the source file
  sourceFile.saveSync();
}

/**
 * Finds all functions containing TODO markers in a project.
 *
 * Detects the following patterns as TODO markers:
 * - `throw new Error('TODO')`
 * - `throw new Error("TODO")`
 * - `// todo!()` macro-style comments
 *
 * @param project - The ts-morph Project to scan.
 * @returns Array of TodoFunction objects sorted in topological order (leaves first).
 *
 * @example
 * const project = createProject('./tsconfig.json');
 * const todos = findTodoFunctions(project);
 * // Returns functions like: { name: 'add', filePath: '/src/math.ts', line: 5, ... }
 */
export function findTodoFunctions(project: Project): TodoFunction[] {
  const todoFunctions: TodoFunction[] = [];
  const allFunctions: FunctionLike[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules and declaration files
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue;
    }

    const functions = collectFunctions(sourceFile);
    allFunctions.push(...functions);

    for (const func of functions) {
      if (hasTodoMarker(func)) {
        todoFunctions.push({
          name: getFunctionName(func),
          filePath: sourceFile.getFilePath(),
          line: func.getStartLineNumber(),
          signature: extractSignature(func),
          hasTodoBody: true,
        });
      }
    }
  }

  // Build call graph and sort topologically
  const callGraph = buildCallGraph(allFunctions);
  return topologicalSort(todoFunctions, callGraph);
}

/**
 * Information about a function inspected by AST analysis.
 */
export interface InspectedFunction {
  /** The function name. */
  readonly name: string;
  /** The line number where the function is defined. */
  readonly line: number;
  /** Whether the function has a body. */
  readonly hasBody: boolean;
  /** Whether the function body is a TODO placeholder. */
  readonly hasTodoBody: boolean;
}

/**
 * A detected logic pattern that may indicate logic leakage.
 */
export interface LogicPattern {
  /** The line number where the pattern was found. */
  readonly line: number;
  /** Description of the pattern. */
  readonly description: string;
  /** The function or context where it was found. */
  readonly context?: string;
  /** Severity of the finding. */
  readonly severity: 'error' | 'warning';
}

/**
 * Result of AST inspection.
 */
export interface AstInspectionResult {
  /** All functions found in the file. */
  readonly functions: readonly InspectedFunction[];
  /** Logic patterns that may indicate leakage. */
  readonly logicPatterns?: readonly LogicPattern[];
  /** Whether the inspection passed (no errors). */
  readonly passed: boolean;
}

/**
 * Options for AST inspection.
 */
export interface AstInspectionOptions {
  /** Whether to check function bodies for TODO patterns. Default: true. */
  readonly checkFunctionBodies?: boolean;
  /** Whether to specifically check for TODO pattern compliance. Default: true. */
  readonly checkTodoPattern?: boolean;
  /** Whether to detect logic patterns that shouldn't be in Lattice output. Default: true. */
  readonly detectLogicPatterns?: boolean;
}

/**
 * Patterns that indicate logic leakage (code that shouldn't be in Lattice output).
 */
const LOGIC_LEAKAGE_PATTERNS: {
  pattern: RegExp;
  description: string;
  severity: 'error' | 'warning';
}[] = [
  {
    pattern: /\bfetch\s*\(/,
    description: 'Network call (fetch) detected - implementation logic',
    severity: 'error',
  },
  {
    pattern: /\bawait\s+(?!Promise\.)/,
    description: 'Await expression detected - may indicate implementation logic',
    severity: 'warning',
  },
  {
    pattern: /\bfs\.\w+\s*\(/,
    description: 'File system operation detected - implementation logic',
    severity: 'error',
  },
  {
    pattern: /\bconsole\.(log|warn|error|info)\s*\(/,
    description: 'Console output detected - implementation logic',
    severity: 'warning',
  },
  {
    pattern: /\bfor\s*\(|\.forEach\s*\(|\.map\s*\(|\.filter\s*\(/,
    description: 'Loop or array processing detected - possible implementation logic',
    severity: 'warning',
  },
  {
    pattern: /\bif\s*\(|\?\s*:/,
    description: 'Conditional logic detected - possible implementation logic',
    severity: 'warning',
  },
  {
    pattern: /\btry\s*\{/,
    description: 'Try-catch block detected - implementation logic',
    severity: 'warning',
  },
  {
    pattern: /\bnew\s+(?!Error\s*\(\s*['"]TODO['"]\s*\))/,
    description: 'Object instantiation detected (not Error TODO) - implementation logic',
    severity: 'warning',
  },
];

/**
 * Inspects a TypeScript file's AST to verify structural integrity.
 *
 * This function analyzes the AST of a TypeScript file to:
 * - Enumerate all functions and their body status
 * - Detect whether functions have TODO placeholder bodies
 * - Find logic patterns that shouldn't exist in Lattice output
 *
 * @param filePath - Path to the TypeScript file to inspect.
 * @param options - Inspection options.
 * @returns The inspection result.
 *
 * @example
 * ```typescript
 * const result = await inspectAst('./generated/types.ts', {
 *   checkFunctionBodies: true,
 *   checkTodoPattern: true,
 * });
 *
 * if (!result.passed) {
 *   console.log('Logic leakage detected:', result.logicPatterns);
 * }
 * ```
 */
export function inspectAst(
  filePath: string,
  options: AstInspectionOptions = {}
): AstInspectionResult {
  const {
    checkFunctionBodies = true,
    checkTodoPattern = true,
    detectLogicPatterns = true,
  } = options;

  // Create a project and add the file
  const project = new Project({
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      target: 99, // ScriptTarget.ESNext
      module: 199, // ModuleKind.NodeNext
    },
  });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch {
    return {
      functions: [],
      logicPatterns: [
        {
          line: 0,
          description: `Could not parse file: ${filePath}`,
          severity: 'error',
        },
      ],
      passed: false,
    };
  }

  const inspectedFunctions: InspectedFunction[] = [];
  const logicPatterns: LogicPattern[] = [];

  // Collect all functions
  const functions = collectFunctions(sourceFile);

  for (const func of functions) {
    const name = getFunctionName(func);
    const line = func.getStartLineNumber();
    const body = func.getBody();
    const hasBody = body !== undefined;

    // Compute strict isTodoBody: body must ONLY contain TODO patterns (nothing else)
    let isTodoBody = false;
    if (hasBody) {
      const bodyText = body.getText();

      // TODO-only patterns: entire body must match exactly
      const todoOnlyPatterns = [
        /^\{\s*\}$/, // Empty body {}
        /^\{\s*throw\s+new\s+Error\s*\(\s*['"]TODO['"]\s*\)\s*;?\s*\}$/i, // Only throw new Error('TODO')
      ];

      isTodoBody = todoOnlyPatterns.some((pattern) => pattern.test(bodyText));
    }

    // hasTodoBody in InspectedFunction indicates presence of TODO marker
    const hasTodoBody = hasBody && hasTodoMarker(func);

    inspectedFunctions.push({
      name,
      line,
      hasBody,
      hasTodoBody,
    });

    // Check for non-TODO bodies when required
    // Run LOGIC_LEAKAGE_PATTERNS scan only when not isTodoBody (strict check)
    if (checkFunctionBodies && checkTodoPattern && hasBody && !isTodoBody) {
      // This is a function with implementation - check if it's allowed
      // For Lattice output, only TODO bodies should exist
      // body is guaranteed to exist since hasBody is true
      const bodyText = body.getText();

      if (detectLogicPatterns) {
        // Use unique context key including file path and line number
        const contextKey = `${filePath}:${String(line)}:${name}`;

        // Check for specific logic patterns
        for (const { pattern, description, severity } of LOGIC_LEAKAGE_PATTERNS) {
          if (pattern.test(bodyText)) {
            logicPatterns.push({
              line,
              description,
              context: contextKey,
              severity,
            });
          }
        }

        // If no specific pattern matched but body is not TODO-only, flag it
        if (
          logicPatterns.filter((p) => p.context === contextKey).length === 0 &&
          !bodyText.includes("throw new Error('TODO')") &&
          !bodyText.includes('throw new Error("TODO")')
        ) {
          logicPatterns.push({
            line,
            description: 'Function has implementation body instead of TODO placeholder',
            context: contextKey,
            severity: 'error',
          });
        }
      }
    }
  }

  // Determine if inspection passed
  const hasErrors = logicPatterns.some((p) => p.severity === 'error');

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  if (logicPatterns.length > 0) {
    return {
      functions: inspectedFunctions,
      logicPatterns,
      passed: !hasErrors,
    };
  }

  return {
    functions: inspectedFunctions,
    passed: !hasErrors,
  };
}
