/**
 * Runtime assertion generation module for TypeScript.
 *
 * Generates runtime assertion code from micro-contracts to verify
 * preconditions, postconditions, and invariants during test execution.
 *
 * @module adapters/typescript/assertions
 */

/**
 * Represents an inline assertion found within a function body.
 *
 * Inline assertions are specified using single-line comments:
 * - `// @invariant: expression` - Inline invariant
 * - `// @assert: expression` - Inline assertion
 */
export interface InlineAssertion {
  /** The type of inline assertion */
  type: 'invariant' | 'assert';
  /** The assertion expression */
  expression: string;
  /** The 1-indexed line number where the assertion appears */
  lineNumber: number;
}

/**
 * Represents a micro-contract extracted from a function's JSDoc comments.
 *
 * A micro-contract specifies the behavioral contract of a function including
 * preconditions (requires), postconditions (ensures), invariants, and other
 * metadata used for verification and test generation.
 */
export interface MicroContract {
  /** The name of the function this contract applies to */
  functionName: string;
  /** The file path where the function is defined */
  filePath: string;
  /** Precondition expressions that must hold before function execution (from @requires) */
  requires: string[];
  /** Postcondition expressions that must hold after function execution (from @ensures) */
  ensures: string[];
  /** Invariant expressions that must hold throughout stateful operations (from @invariant) */
  invariants: string[];
  /** Complexity claim for the function (e.g., "O(n)", "O(1)") */
  complexity?: string;
  /** Purity classification: "pure", "reads", "writes", or "io" */
  purity?: 'pure' | 'reads' | 'writes' | 'io';
  /** References to spec claims linked to this function */
  claimRefs: string[];
  /** Inline assertions found within the function body */
  inlineAssertions?: InlineAssertion[];
}

/**
 * Error thrown when an assertion fails at runtime.
 *
 * Used by generated assertion code to indicate contract violations.
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly assertionType: 'precondition' | 'postcondition' | 'invariant',
    public readonly expression: string
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Error thrown when a contract assertion expression is malformed or cannot be parsed.
 */
export class ContractParseError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'ContractParseError';
  }
}

/**
 * Options for generating runtime assertions.
 */
export interface AssertionGenerationOptions {
  /** Include JSDoc comments in generated code */
  includeJsDoc?: boolean;
  /** Name to use for the result variable in postconditions (default: "result") */
  resultVariableName?: string;
}

/**
 * Validates that an assertion expression is syntactically valid.
 *
 * Checks for:
 * - Empty or whitespace-only expressions
 * - Unbalanced brackets (parentheses, square brackets, curly braces)
 * - Basic JavaScript expression validity
 *
 * @param expression - The assertion expression to validate.
 * @param clauseType - The type of clause for error messages.
 * @throws ContractParseError if the expression is malformed.
 */
function validateExpression(
  expression: string,
  clauseType: 'requires' | 'ensures' | 'invariant'
): void {
  const trimmed = expression.trim();

  if (trimmed === '') {
    throw new ContractParseError(
      `Empty ${clauseType} expression`,
      expression,
      'expression cannot be empty'
    );
  }

  // Check for unbalanced brackets
  let parentheses = 0;
  let squareBrackets = 0;
  let curlyBrackets = 0;

  for (const char of trimmed) {
    switch (char) {
      case '(':
        parentheses++;
        break;
      case ')':
        parentheses--;
        break;
      case '[':
        squareBrackets++;
        break;
      case ']':
        squareBrackets--;
        break;
      case '{':
        curlyBrackets++;
        break;
      case '}':
        curlyBrackets--;
        break;
    }

    // Check for negative counts (closing before opening)
    if (parentheses < 0 || squareBrackets < 0 || curlyBrackets < 0) {
      throw new ContractParseError(
        `Malformed ${clauseType} expression: unbalanced brackets`,
        expression,
        'unbalanced brackets'
      );
    }
  }

  if (parentheses !== 0) {
    throw new ContractParseError(
      `Malformed ${clauseType} expression: unbalanced parentheses`,
      expression,
      'unbalanced parentheses ()'
    );
  }
  if (squareBrackets !== 0) {
    throw new ContractParseError(
      `Malformed ${clauseType} expression: unbalanced square brackets`,
      expression,
      'unbalanced square brackets []'
    );
  }
  if (curlyBrackets !== 0) {
    throw new ContractParseError(
      `Malformed ${clauseType} expression: unbalanced curly brackets`,
      expression,
      'unbalanced curly brackets {}'
    );
  }

  // Check for obviously invalid expressions
  // Empty after trimming already checked
  // Check for invalid starting characters
  const invalidStartPatterns = [
    /^[)}\]]/, // Starting with closing bracket
    /^[,;]/, // Starting with separator
    /^=/, // Starting with equals (would be assignment, not expression)
  ];

  for (const pattern of invalidStartPatterns) {
    if (pattern.test(trimmed)) {
      throw new ContractParseError(
        `Malformed ${clauseType} expression: invalid syntax`,
        expression,
        'expression starts with invalid character'
      );
    }
  }

  // Check for invalid ending characters
  const invalidEndPatterns = [
    /[({[]$/, // Ending with opening bracket
    /[,;]$/, // Ending with separator (incomplete)
  ];

  for (const pattern of invalidEndPatterns) {
    if (pattern.test(trimmed)) {
      throw new ContractParseError(
        `Malformed ${clauseType} expression: invalid syntax`,
        expression,
        'expression ends with invalid character'
      );
    }
  }
}

/**
 * Escapes a string for use in a JavaScript string literal.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Generates runtime assertion code from a micro-contract.
 *
 * The generated code includes:
 * - Precondition checks that run before function body execution
 * - Postcondition checks that run after function returns (accessing `result`)
 * - Invariant checks for stateful operations
 *
 * All assertions throw AssertionError with descriptive messages on failure.
 *
 * @param contract - The micro-contract to generate assertions for.
 * @param options - Options for code generation.
 * @returns The generated TypeScript assertion code as a string.
 * @throws ContractParseError if any assertion expression is malformed.
 *
 * @example
 * // Generate precondition from @requires x > 0
 * generateRuntimeAssertions({
 *   functionName: 'sqrt',
 *   filePath: 'math.ts',
 *   requires: ['x > 0'],
 *   ensures: ['result >= 0'],
 *   invariants: [],
 *   claimRefs: []
 * })
 * // Generates:
 * // // Precondition checks
 * // if (!(x > 0)) {
 * //   throw new AssertionError('Precondition failed: x > 0', 'precondition', 'x > 0');
 * // }
 */
export function generateRuntimeAssertions(
  contract: MicroContract,
  options: AssertionGenerationOptions = {}
): string {
  const { includeJsDoc = true, resultVariableName = 'result' } = options;

  // Validate all expressions first
  for (const expr of contract.requires) {
    validateExpression(expr, 'requires');
  }
  for (const expr of contract.ensures) {
    validateExpression(expr, 'ensures');
  }
  for (const expr of contract.invariants) {
    validateExpression(expr, 'invariant');
  }

  const lines: string[] = [];

  // Generate precondition checks
  if (contract.requires.length > 0) {
    if (includeJsDoc) {
      lines.push('// Precondition checks');
    }
    for (const req of contract.requires) {
      const trimmed = req.trim();
      lines.push(`if (!(${trimmed})) {`);
      lines.push(
        `  throw new AssertionError('Precondition failed: ${escapeString(trimmed)}', 'precondition', '${escapeString(trimmed)}');`
      );
      lines.push(`}`);
    }
    lines.push('');
  }

  // Generate invariant checks (for stateful operations, checked before and after)
  if (contract.invariants.length > 0) {
    if (includeJsDoc) {
      lines.push('// Invariant checks (pre-execution)');
    }
    for (const inv of contract.invariants) {
      const trimmed = inv.trim();
      lines.push(`if (!(${trimmed})) {`);
      lines.push(
        `  throw new AssertionError('Invariant violated: ${escapeString(trimmed)}', 'invariant', '${escapeString(trimmed)}');`
      );
      lines.push(`}`);
    }
    lines.push('');
  }

  // Generate postcondition check function
  if (contract.ensures.length > 0) {
    if (includeJsDoc) {
      lines.push(
        `// Postcondition checks (call after function returns with ${resultVariableName})`
      );
    }
    lines.push(`function __checkPostconditions(${resultVariableName}: unknown): void {`);
    for (const ens of contract.ensures) {
      const trimmed = ens.trim();
      lines.push(`  if (!(${trimmed})) {`);
      lines.push(
        `    throw new AssertionError('Postcondition failed: ${escapeString(trimmed)}', 'postcondition', '${escapeString(trimmed)}');`
      );
      lines.push(`  }`);
    }
    lines.push(`}`);
    lines.push('');
  }

  // Generate invariant post-check function (for stateful operations)
  if (contract.invariants.length > 0) {
    if (includeJsDoc) {
      lines.push('// Invariant checks (post-execution)');
    }
    lines.push('function __checkInvariantsPost(): void {');
    for (const inv of contract.invariants) {
      const trimmed = inv.trim();
      lines.push(`  if (!(${trimmed})) {`);
      lines.push(
        `    throw new AssertionError('Invariant violated after execution: ${escapeString(trimmed)}', 'invariant', '${escapeString(trimmed)}');`
      );
      lines.push(`  }`);
    }
    lines.push('}');
  }

  return lines.join('\n');
}

/**
 * Generates a single precondition assertion statement.
 *
 * @param expression - The precondition expression.
 * @returns The assertion code for the precondition.
 * @throws ContractParseError if the expression is malformed.
 */
export function generatePreconditionCheck(expression: string): string {
  validateExpression(expression, 'requires');
  const trimmed = expression.trim();
  return [
    `if (!(${trimmed})) {`,
    `  throw new AssertionError('Precondition failed: ${escapeString(trimmed)}', 'precondition', '${escapeString(trimmed)}');`,
    `}`,
  ].join('\n');
}

/**
 * Generates a single postcondition assertion statement.
 *
 * @param expression - The postcondition expression.
 * @param resultVar - The name of the variable holding the function result.
 * @returns The assertion code for the postcondition.
 * @throws ContractParseError if the expression is malformed.
 */
export function generatePostconditionCheck(expression: string, resultVar = 'result'): string {
  validateExpression(expression, 'ensures');
  const trimmed = expression.trim();
  // Replace 'result' with the actual result variable if different
  const normalizedExpr =
    resultVar !== 'result' ? trimmed.replace(/\bresult\b/g, resultVar) : trimmed;
  return [
    `if (!(${normalizedExpr})) {`,
    `  throw new AssertionError('Postcondition failed: ${escapeString(trimmed)}', 'postcondition', '${escapeString(trimmed)}');`,
    `}`,
  ].join('\n');
}

/**
 * Generates a single invariant assertion statement.
 *
 * @param expression - The invariant expression.
 * @returns The assertion code for the invariant.
 * @throws ContractParseError if the expression is malformed.
 */
export function generateInvariantCheck(expression: string): string {
  validateExpression(expression, 'invariant');
  const trimmed = expression.trim();
  return [
    `if (!(${trimmed})) {`,
    `  throw new AssertionError('Invariant violated: ${escapeString(trimmed)}', 'invariant', '${escapeString(trimmed)}');`,
    `}`,
  ].join('\n');
}
