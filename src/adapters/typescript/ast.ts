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
  type Node,
} from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

    if (!fs.existsSync(resolvedPath)) {
      throw new TsConfigNotFoundError(resolvedPath);
    }

    return new Project({
      tsConfigFilePath: resolvedPath,
    });
  }

  const defaultOptions: ProjectOptions = {
    compilerOptions: {
      strict: true,
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

  // Recursively collect arrow functions and function expressions
  function visitNode(node: Node): void {
    if (
      node.getKind() === SyntaxKind.ArrowFunction ||
      node.getKind() === SyntaxKind.FunctionExpression
    ) {
      const funcNode = node as ArrowFunction | FunctionExpression;
      functions.push(funcNode);
    }

    for (const child of node.getChildren()) {
      visitNode(child);
    }
  }

  // Visit all statements to find arrow functions and function expressions
  for (const statement of sourceFile.getStatements()) {
    visitNode(statement);
  }

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
      body.forEachDescendant((node) => {
        if (node.getKind() === SyntaxKind.CallExpression) {
          const callExpr = node.asKind(SyntaxKind.CallExpression);
          if (callExpr) {
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
      });
    }

    callGraph.set(name, calls);
  }

  return callGraph;
}

/**
 * Performs topological sort on functions based on their call dependencies.
 * Returns functions in order where leaves (functions that don't call other TODO functions) come first.
 * This ensures we implement dependencies before the functions that depend on them.
 *
 * @param functions - Array of TodoFunction objects.
 * @param callGraph - Map of function name to called function names.
 * @returns Sorted array with leaves first (dependencies before dependents).
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

  // Build reverse graph: callee -> [callers that depend on it]
  const dependedOnBy = new Map<string, Set<string>>();
  for (const func of functions) {
    dependedOnBy.set(func.name, new Set());
  }
  for (const [caller, callees] of dependsOn) {
    for (const callee of callees) {
      dependedOnBy.get(callee)?.add(caller);
    }
  }

  // Kahn's algorithm: start with functions that have no dependencies (leaves)
  // out-degree in dependsOn = how many TODO functions this function calls
  const outDegree = new Map<string, number>();
  for (const func of functions) {
    outDegree.set(func.name, dependsOn.get(func.name)?.size ?? 0);
  }

  // Queue starts with functions that don't call any other TODO functions (leaves)
  const queue: string[] = [];
  for (const [name, degree] of outDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  // Sort queue for deterministic ordering
  queue.sort();

  const result: TodoFunction[] = [];
  const funcMap = new Map(functions.map((f) => [f.name, f]));

  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined) {
      break;
    }
    const func = funcMap.get(name);
    if (func !== undefined) {
      result.push(func);
    }

    // For each function that depends on the current one,
    // decrement its out-degree (one less dependency to satisfy)
    const callers = dependedOnBy.get(name);
    if (callers) {
      for (const caller of callers) {
        const newDegree = (outDegree.get(caller) ?? 1) - 1;
        outDegree.set(caller, newDegree);
        if (newDegree === 0) {
          // Insert in sorted position for deterministic ordering
          const insertIndex = queue.findIndex((q) => q > caller);
          if (insertIndex === -1) {
            queue.push(caller);
          } else {
            queue.splice(insertIndex, 0, caller);
          }
        }
      }
    }
  }

  // Handle cycles: add any remaining functions not in result
  const resultNames = new Set(result.map((f) => f.name));
  for (const func of functions) {
    if (!resultNames.has(func.name)) {
      result.push(func);
    }
  }

  return result;
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
  // Create a temporary project to parse the body
  const tempProject = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: 99, // ScriptTarget.ESNext
      module: 199, // ModuleKind.NodeNext
    },
  });

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
    const tempFile = tempProject.createSourceFile('__validate__.ts', wrappedBody);
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
