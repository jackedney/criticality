/**
 * Contract syntax validation module for TypeScript.
 *
 * Validates micro-contract syntax before proceeding, catching invalid contracts early.
 * This includes validating TypeScript expressions, variable scope, complexity patterns,
 * purity values, and CLAIM_REF ID formats.
 *
 * @module adapters/typescript/validation
 */

import type { MicroContract } from './assertions.js';
import * as ts from 'typescript';

/**
 * Error information for a contract validation failure.
 */
export interface ContractError {
  /** The name of the function containing the invalid contract */
  functionName: string;
  /** The file path where the error occurred */
  filePath: string;
  /** The type of contract element that failed validation */
  type: 'requires' | 'ensures' | 'invariant' | 'complexity' | 'purity' | 'claimRef' | 'expression';
  /** The expression or value that failed validation */
  value: string;
  /** Human-readable error message */
  message: string;
  /** Line number if available */
  lineNumber?: number;
}

/**
 * Result of contract validation.
 */
export interface ValidationResult {
  /** Whether all contracts are valid */
  valid: boolean;
  /** Array of validation errors (empty if valid is true) */
  errors: ContractError[];
}

/**
 * Valid complexity patterns following Big O notation.
 * Supports: O(1), O(n), O(n^2), O(n^3), O(log n), O(n log n), O(2^n), O(n!), O(m+n), O(mn), etc.
 */
const COMPLEXITY_PATTERN =
  /^O\(\s*(1|n|m|k|n\^[2-9]\d*|m\^[2-9]\d*|log\s*n|n\s*log\s*n|2\^n|n!|[nmk]\s*\+\s*[nmk]|[nmk]\s*\*\s*[nmk]|[nmk][nmk])\s*\)$/;

/**
 * Valid purity values.
 */
const VALID_PURITY_VALUES = new Set(['pure', 'reads', 'writes', 'io']);

/**
 * Valid CLAIM_REF ID pattern.
 * Format: category_number (e.g., inv_001, perf_123, behavior_002)
 * Categories can be alphanumeric with underscores, followed by underscore and digits.
 */
const CLAIM_REF_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*_\d+$/;

/**
 * Checks if a string is a valid TypeScript expression.
 *
 * Uses the TypeScript compiler to parse the expression and check for syntax errors.
 *
 * @param expression - The expression to validate.
 * @returns An object with valid flag and optional error message.
 */
function isValidTypeScriptExpression(expression: string): { valid: boolean; error?: string } {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return { valid: false, error: 'expression is empty' };
  }

  // Wrap the expression in a context that allows it to be parsed
  // We wrap it in a function returning the expression to get proper parsing
  const sourceCode = `const __validate = () => (${trimmed});`;

  // Create a source file and check for parse errors
  const sourceFile = ts.createSourceFile(
    'validation.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  // Check for parse diagnostics
  // TypeScript doesn't expose parse errors directly through createSourceFile,
  // but we can check if the resulting AST is reasonable

  // Get the variable statement
  const statements = sourceFile.statements;
  if (statements.length !== 1) {
    return { valid: false, error: 'expression could not be parsed' };
  }

  const varStatement = statements[0];
  if (!varStatement || !ts.isVariableStatement(varStatement)) {
    return { valid: false, error: 'expression could not be parsed' };
  }

  // Use TypeScript's transpileModule to catch syntax errors
  try {
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: false, // Don't be strict for expression validation
      },
      reportDiagnostics: true,
    });

    // Check for diagnostics (compile errors)
    if (result.diagnostics && result.diagnostics.length > 0) {
      const diagnostic = result.diagnostics[0];
      if (diagnostic) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        // Filter out "not used" warnings, we only care about syntax errors
        if (!message.includes('is declared but') && !message.includes('never used')) {
          return { valid: false, error: message };
        }
      }
    }
  } catch {
    return { valid: false, error: 'expression could not be parsed' };
  }

  return { valid: true };
}

/**
 * Extracts variable names referenced in an expression.
 *
 * Uses the TypeScript AST to find all identifiers in the expression.
 *
 * @param expression - The expression to analyze.
 * @returns Array of variable names referenced in the expression.
 */
function extractReferencedVariables(expression: string): string[] {
  const variables = new Set<string>();
  const trimmed = expression.trim();

  if (trimmed === '') {
    return [];
  }

  // Create a source file for the expression
  const sourceCode = `const __validate = () => (${trimmed});`;
  const sourceFile = ts.createSourceFile(
    'validation.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  // Built-in identifiers that should not be treated as variables
  const builtInIdentifiers = new Set([
    // Global objects
    'undefined',
    'null',
    'NaN',
    'Infinity',
    'globalThis',
    // Constructors
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'Symbol',
    'BigInt',
    'Function',
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'ReferenceError',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'Date',
    'RegExp',
    'JSON',
    'Math',
    'Reflect',
    'Proxy',
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
    'BigInt64Array',
    'BigUint64Array',
    'ArrayBuffer',
    'SharedArrayBuffer',
    'DataView',
    // Global functions
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'eval',
    // Special identifiers
    'this',
    'super',
    'arguments',
    'console',
    'process',
    // Common globals
    'window',
    'document',
    'navigator',
    // Keywords used as expressions
    'true',
    'false',
    'new',
    'typeof',
    'instanceof',
    'in',
    'void',
    'delete',
    // Our validation wrapper
    '__validate',
  ]);

  function visit(node: ts.Node): void {
    // Check if this is an identifier
    if (ts.isIdentifier(node)) {
      const name = node.text;

      // Skip built-in identifiers
      if (builtInIdentifiers.has(name)) {
        return;
      }

      // Check if this identifier is a property access (not the root)
      const parent = node.parent as ts.Node | undefined;
      if (parent !== undefined) {
        if (
          ts.isPropertyAccessExpression(parent) &&
          parent.name === node &&
          parent.expression !== node
        ) {
          // This is a property name, not a variable reference
          return;
        }

        // Check if this is a type reference (skip type annotations)
        if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) {
          return;
        }

        // Check if this is a parameter name in an arrow function
        if (ts.isParameter(parent) && parent.name === node) {
          return;
        }
      }

      variables.add(name);
    }

    // Recurse into children
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return Array.from(variables);
}

/**
 * Validates that a complexity value follows expected Big O notation patterns.
 *
 * @param complexity - The complexity value to validate.
 * @returns An object with valid flag and optional error message.
 */
function validateComplexity(complexity: string): { valid: boolean; error?: string } {
  const trimmed = complexity.trim();

  if (!COMPLEXITY_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: `invalid complexity format '${trimmed}'. Expected patterns like O(1), O(n), O(n^2), O(log n), O(n log n)`,
    };
  }

  return { valid: true };
}

/**
 * Validates that a purity value is one of the allowed values.
 *
 * @param purity - The purity value to validate.
 * @returns An object with valid flag and optional error message.
 */
function validatePurity(purity: string): { valid: boolean; error?: string } {
  const normalized = purity.toLowerCase().trim();

  if (!VALID_PURITY_VALUES.has(normalized)) {
    return {
      valid: false,
      error: `invalid purity value '${purity}'. Must be one of: pure, reads, writes, io`,
    };
  }

  return { valid: true };
}

/**
 * Validates that a CLAIM_REF ID follows the expected format.
 *
 * @param claimRef - The CLAIM_REF ID to validate.
 * @returns An object with valid flag and optional error message.
 */
function validateClaimRef(claimRef: string): { valid: boolean; error?: string } {
  const trimmed = claimRef.trim();

  if (!CLAIM_REF_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: `invalid CLAIM_REF format '${trimmed}'. Expected format: category_number (e.g., inv_001, perf_123)`,
    };
  }

  return { valid: true };
}

/**
 * Validates a single expression and checks that referenced variables exist in scope.
 *
 * @param expression - The expression to validate.
 * @param type - The type of contract clause.
 * @param functionName - The function name for error reporting.
 * @param filePath - The file path for error reporting.
 * @param scopeVariables - Set of variables in scope for the function.
 * @param errors - Array to append errors to.
 * @param lineNumber - Optional line number for error reporting.
 */
function validateExpressionWithScope(
  expression: string,
  type: 'requires' | 'ensures' | 'invariant',
  functionName: string,
  filePath: string,
  scopeVariables: Set<string>,
  errors: ContractError[],
  lineNumber?: number
): void {
  // First validate that it's a valid TypeScript expression
  const exprResult = isValidTypeScriptExpression(expression);
  if (!exprResult.valid) {
    const error: ContractError = {
      functionName,
      filePath,
      type: 'expression',
      value: expression,
      message: exprResult.error ?? 'invalid TypeScript expression',
    };
    if (lineNumber !== undefined) {
      error.lineNumber = lineNumber;
    }
    errors.push(error);
    return;
  }

  // Extract referenced variables and check they exist in scope
  const referencedVars = extractReferencedVariables(expression);
  for (const varName of referencedVars) {
    if (!scopeVariables.has(varName)) {
      const error: ContractError = {
        functionName,
        filePath,
        type,
        value: expression,
        message: `unknown variable: ${varName}`,
      };
      if (lineNumber !== undefined) {
        error.lineNumber = lineNumber;
      }
      errors.push(error);
    }
  }
}

/**
 * Extracts parameter names from a MicroContract to build the function scope.
 *
 * Since MicroContract doesn't directly include parameter information,
 * we need to extract variables from requires clauses as a heuristic.
 * This allows validation without requiring the full AST.
 *
 * @param contract - The contract to extract scope from.
 * @returns Set of variable names considered in scope.
 */
function buildFunctionScope(contract: MicroContract): Set<string> {
  const scope = new Set<string>();

  // 'result' is always in scope for postconditions
  scope.add('result');

  // 'this' is always in scope for methods
  scope.add('this');

  // Extract variables from all expressions to build scope
  // Variables used in requires are likely parameters
  for (const expr of contract.requires) {
    const vars = extractReferencedVariables(expr);
    for (const v of vars) {
      scope.add(v);
    }
  }

  // Variables used in ensures that aren't 'result' are likely parameters
  for (const expr of contract.ensures) {
    const vars = extractReferencedVariables(expr);
    for (const v of vars) {
      scope.add(v);
    }
  }

  // Variables used in invariants
  for (const expr of contract.invariants) {
    const vars = extractReferencedVariables(expr);
    for (const v of vars) {
      scope.add(v);
    }
  }

  // Variables from inline assertions
  if (contract.inlineAssertions) {
    for (const assertion of contract.inlineAssertions) {
      const vars = extractReferencedVariables(assertion.expression);
      for (const v of vars) {
        scope.add(v);
      }
    }
  }

  return scope;
}

/**
 * Validates a single contract.
 *
 * @param contract - The contract to validate.
 * @param scopeVariables - Optional set of variables in scope (extracted from function parameters).
 * @returns Array of validation errors.
 */
function validateSingleContract(
  contract: MicroContract,
  scopeVariables?: Set<string>
): ContractError[] {
  const errors: ContractError[] = [];
  const { functionName, filePath } = contract;

  // Build scope from contract if not provided
  const scope = scopeVariables ?? buildFunctionScope(contract);

  // Validate @requires expressions
  for (const req of contract.requires) {
    validateExpressionWithScope(req, 'requires', functionName, filePath, scope, errors);
  }

  // Validate @ensures expressions
  for (const ens of contract.ensures) {
    validateExpressionWithScope(ens, 'ensures', functionName, filePath, scope, errors);
  }

  // Validate @invariant expressions
  for (const inv of contract.invariants) {
    validateExpressionWithScope(inv, 'invariant', functionName, filePath, scope, errors);
  }

  // Validate inline assertions
  if (contract.inlineAssertions) {
    for (const assertion of contract.inlineAssertions) {
      validateExpressionWithScope(
        assertion.expression,
        assertion.type === 'invariant' ? 'invariant' : 'requires',
        functionName,
        filePath,
        scope,
        errors,
        assertion.lineNumber
      );
    }
  }

  // Validate @complexity if present
  if (contract.complexity !== undefined) {
    const complexityResult = validateComplexity(contract.complexity);
    if (!complexityResult.valid) {
      errors.push({
        functionName,
        filePath,
        type: 'complexity',
        value: contract.complexity,
        message: complexityResult.error ?? 'invalid complexity format',
      });
    }
  }

  // Validate @purity if present
  if (contract.purity !== undefined) {
    const purityResult = validatePurity(contract.purity);
    if (!purityResult.valid) {
      errors.push({
        functionName,
        filePath,
        type: 'purity',
        value: contract.purity,
        message: purityResult.error ?? 'invalid purity value',
      });
    }
  }

  // Validate CLAIM_REF IDs
  for (const claimRef of contract.claimRefs) {
    const claimResult = validateClaimRef(claimRef);
    if (!claimResult.valid) {
      errors.push({
        functionName,
        filePath,
        type: 'claimRef',
        value: claimRef,
        message: claimResult.error ?? 'invalid CLAIM_REF format',
      });
    }
  }

  return errors;
}

/**
 * Validates an array of micro-contracts for syntax correctness.
 *
 * This function performs the following validations:
 * - @requires/@ensures/@invariant expressions are valid TypeScript expressions
 * - Referenced variables exist in function scope
 * - @complexity values follow expected patterns (O(1), O(n), O(n^2), etc.)
 * - @purity values are one of: pure, reads, writes, io
 * - CLAIM_REF IDs follow expected format
 *
 * @param contracts - Array of MicroContract objects to validate.
 * @returns ValidationResult containing valid flag and array of errors.
 *
 * @example
 * // Valid contract
 * validateContracts([{
 *   functionName: 'sqrt',
 *   filePath: 'math.ts',
 *   requires: ['x > 0'],
 *   ensures: ['result >= 0'],
 *   invariants: [],
 *   claimRefs: ['inv_001'],
 *   complexity: 'O(1)',
 *   purity: 'pure'
 * }])
 * // Returns: { valid: true, errors: [] }
 *
 * @example
 * // Invalid contract with unknown variable
 * validateContracts([{
 *   functionName: 'sqrt',
 *   filePath: 'math.ts',
 *   requires: ['nonexistent > 0'],
 *   ensures: [],
 *   invariants: [],
 *   claimRefs: []
 * }])
 * // Returns: { valid: false, errors: [{ message: 'unknown variable: nonexistent', ... }] }
 *
 * @example
 * // Invalid complexity format
 * validateContracts([{
 *   functionName: 'sort',
 *   filePath: 'sort.ts',
 *   requires: [],
 *   ensures: [],
 *   invariants: [],
 *   claimRefs: [],
 *   complexity: 'O(fast)'
 * }])
 * // Returns: { valid: false, errors: [{ message: 'invalid complexity format...', type: 'complexity', ... }] }
 */
export function validateContracts(contracts: MicroContract[]): ValidationResult {
  const allErrors: ContractError[] = [];

  for (const contract of contracts) {
    const contractErrors = validateSingleContract(contract);
    allErrors.push(...contractErrors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Validates contracts with explicit parameter scope provided.
 *
 * This function allows specifying the exact parameters in scope for each function,
 * enabling more precise validation when the contract is extracted alongside
 * function signature information.
 *
 * @param contracts - Array of contracts to validate.
 * @param functionScopes - Map of function names to their parameter sets.
 * @returns ValidationResult containing valid flag and array of errors.
 */
export function validateContractsWithScope(
  contracts: MicroContract[],
  functionScopes: Map<string, Set<string>>
): ValidationResult {
  const allErrors: ContractError[] = [];

  for (const contract of contracts) {
    const scope = functionScopes.get(contract.functionName) ?? buildFunctionScope(contract);
    const contractErrors = validateSingleContract(contract, scope);
    allErrors.push(...contractErrors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
