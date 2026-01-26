/**
 * Type witness generation module for TypeScript.
 *
 * Generates branded type definitions that provide compile-time guarantees
 * through the TypeScript type system.
 *
 * @module adapters/typescript/witness
 */

/**
 * Represents a type parameter for a witness definition.
 */
export interface WitnessTypeParameter {
  /** The type parameter name (e.g., "T", "K", "V") */
  name: string;
  /** The constraint type as a string, if any (e.g., "string", "number[]") */
  constraint?: string;
  /** The default type as a string, if any */
  default?: string;
}

/**
 * Represents a witness type definition used to generate branded types.
 *
 * A witness provides compile-time type safety by creating a branded version
 * of a base type that cannot be accidentally substituted.
 */
export interface WitnessDefinition {
  /** The name of the branded type (e.g., "NonNegativeDecimal", "NonEmptyString") */
  name: string;
  /** The base type to brand (e.g., "number", "string", "T[]", "{ value: T }") */
  baseType: string;
  /** Type parameters for generic witnesses */
  typeParameters?: WitnessTypeParameter[];
  /** Human-readable description of the invariant (for documentation) */
  invariant?: string;
}

/**
 * Error thrown when an invalid base type is provided to the witness generator.
 */
export class InvalidBaseTypeError extends Error {
  constructor(
    public readonly baseType: string,
    public readonly reason: string
  ) {
    super(`Invalid base type "${baseType}": ${reason}`);
    this.name = 'InvalidBaseTypeError';
  }
}

/**
 * Set of reserved TypeScript keywords that cannot be used as base types directly.
 */
const RESERVED_KEYWORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
]);

/**
 * Validates that a base type is syntactically valid for use in a branded type.
 *
 * @param baseType - The base type string to validate.
 * @throws InvalidBaseTypeError if the base type is invalid.
 */
function validateBaseType(baseType: string): void {
  const trimmed = baseType.trim();

  if (trimmed === '') {
    throw new InvalidBaseTypeError(baseType, 'base type cannot be empty');
  }

  // Check for unbalanced brackets
  // We need to handle the => arrow operator specially since > appears after =
  let angleBrackets = 0;
  let squareBrackets = 0;
  let curlyBrackets = 0;
  let parentheses = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    const prevChar = i > 0 ? trimmed[i - 1] : '';

    switch (char) {
      case '<':
        angleBrackets++;
        break;
      case '>':
        // Skip > if it's part of => arrow operator
        if (prevChar !== '=') {
          angleBrackets--;
        }
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
      case '(':
        parentheses++;
        break;
      case ')':
        parentheses--;
        break;
    }

    // Check for negative counts (closing before opening)
    if (angleBrackets < 0 || squareBrackets < 0 || curlyBrackets < 0 || parentheses < 0) {
      throw new InvalidBaseTypeError(baseType, 'unbalanced brackets');
    }
  }

  if (angleBrackets !== 0) {
    throw new InvalidBaseTypeError(baseType, 'unbalanced angle brackets <>');
  }
  if (squareBrackets !== 0) {
    throw new InvalidBaseTypeError(baseType, 'unbalanced square brackets []');
  }
  if (curlyBrackets !== 0) {
    throw new InvalidBaseTypeError(baseType, 'unbalanced curly brackets {}');
  }
  if (parentheses !== 0) {
    throw new InvalidBaseTypeError(baseType, 'unbalanced parentheses ()');
  }

  // Check for reserved keywords used alone as the base type
  if (RESERVED_KEYWORDS.has(trimmed)) {
    throw new InvalidBaseTypeError(baseType, `"${trimmed}" is a reserved keyword`);
  }
}

/**
 * Formats type parameters for a type declaration.
 *
 * @param typeParams - Array of type parameter definitions.
 * @returns Formatted type parameter string (e.g., "<T, K extends string>").
 */
function formatTypeParameters(typeParams: WitnessTypeParameter[] | undefined): string {
  if (!typeParams || typeParams.length === 0) {
    return '';
  }

  const formatted = typeParams.map((tp) => {
    let result = tp.name;
    if (tp.constraint !== undefined && tp.constraint !== '') {
      result += ` extends ${tp.constraint}`;
    }
    if (tp.default !== undefined && tp.default !== '') {
      result += ` = ${tp.default}`;
    }
    return result;
  });

  return `<${formatted.join(', ')}>`;
}

/**
 * Generates a TypeScript branded type definition from a witness definition.
 *
 * The generated type follows the branded type pattern:
 * ```typescript
 * type Name = BaseType & { readonly __brand: unique symbol }
 * ```
 *
 * This pattern ensures that values of the branded type cannot be accidentally
 * substituted with plain values of the base type, providing compile-time
 * guarantees that witnesses have been properly validated.
 *
 * @param witness - The witness definition specifying the type to generate.
 * @returns The TypeScript branded type definition as a string.
 * @throws InvalidBaseTypeError if the base type is invalid.
 *
 * @example
 * // Simple primitive branding
 * generateBrandedType({ name: 'NonNegativeDecimal', baseType: 'number' })
 * // Returns: "type NonNegativeDecimal = number & { readonly __brand: unique symbol };"
 *
 * @example
 * // String branding
 * generateBrandedType({ name: 'NonEmptyString', baseType: 'string' })
 * // Returns: "type NonEmptyString = string & { readonly __brand: unique symbol };"
 *
 * @example
 * // Generic branded type
 * generateBrandedType({
 *   name: 'NonEmpty',
 *   baseType: 'T[]',
 *   typeParameters: [{ name: 'T' }]
 * })
 * // Returns: "type NonEmpty<T> = T[] & { readonly __brand: unique symbol };"
 *
 * @example
 * // Complex object type
 * generateBrandedType({
 *   name: 'ValidUser',
 *   baseType: '{ id: string; email: string }'
 * })
 * // Returns: "type ValidUser = { id: string; email: string } & { readonly __brand: unique symbol };"
 *
 * @example
 * // Generic with constraint
 * generateBrandedType({
 *   name: 'NonEmptyArray',
 *   baseType: 'T[]',
 *   typeParameters: [{ name: 'T', constraint: 'object' }]
 * })
 * // Returns: "type NonEmptyArray<T extends object> = T[] & { readonly __brand: unique symbol };"
 *
 * @example
 * // Union type
 * generateBrandedType({
 *   name: 'StringOrNumber',
 *   baseType: 'string | number'
 * })
 * // Returns: "type StringOrNumber = (string | number) & { readonly __brand: unique symbol };"
 */
export function generateBrandedType(witness: WitnessDefinition): string {
  // Validate the base type
  validateBaseType(witness.baseType);

  const typeParams = formatTypeParameters(witness.typeParameters);
  const trimmedBase = witness.baseType.trim();

  // For union or intersection types at the top level, wrap in parentheses
  // to ensure correct precedence with the brand intersection
  const needsParens = shouldWrapInParentheses(trimmedBase);
  const baseTypeFormatted = needsParens ? `(${trimmedBase})` : trimmedBase;

  return `type ${witness.name}${typeParams} = ${baseTypeFormatted} & { readonly __brand: unique symbol };`;
}

/**
 * Determines if a base type needs to be wrapped in parentheses.
 *
 * Union types need parentheses because the brand intersection has higher
 * precedence than union, which would incorrectly brand only the last member.
 *
 * @param baseType - The base type string.
 * @returns True if the base type should be wrapped in parentheses.
 */
function shouldWrapInParentheses(baseType: string): boolean {
  // Check for top-level union (|) operators
  // We need to ignore | inside generics, arrays, objects, or function types
  let depth = 0;

  for (const char of baseType) {
    switch (char) {
      case '<':
      case '(':
      case '{':
      case '[':
        depth++;
        break;
      case '>':
      case ')':
      case '}':
      case ']':
        depth--;
        break;
      case '|':
        if (depth === 0) {
          return true;
        }
        break;
    }
  }

  return false;
}

/**
 * Represents a validation condition for a witness invariant.
 */
export interface InvariantCondition {
  /** The condition expression (e.g., "value >= 0", "value.length > 0") */
  expression: string;
  /** Human-readable description of what this condition checks */
  description?: string;
}

/**
 * Options for generating validation factories.
 */
export interface ValidationFactoryOptions {
  /** Include JSDoc comments in generated code */
  includeJsDoc?: boolean;
}

/**
 * Converts a witness name to a valid function name for the factory.
 *
 * @param name - The witness type name.
 * @returns The name formatted for use in function names.
 */
function toFunctionName(name: string): string {
  // If name starts with uppercase, keep it for camelCase naming
  return name;
}

/**
 * Formats type parameters for a function declaration (without constraints/defaults).
 *
 * @param typeParams - Array of type parameter definitions.
 * @returns Formatted type parameter string for function use.
 */
function formatTypeParametersForFunction(typeParams: WitnessTypeParameter[] | undefined): string {
  if (!typeParams || typeParams.length === 0) {
    return '';
  }
  return `<${typeParams.map((tp) => tp.name).join(', ')}>`;
}

/**
 * Generates a validation factory function, assertion function, and type guard
 * for a witness type.
 *
 * The generated code includes:
 * - `makeXxx(value: BaseType): Xxx | null` - Returns branded value or null
 * - `assertXxx(value: BaseType): Xxx` - Returns branded value or throws
 * - `isXxx(value: unknown): value is Xxx` - Type guard for runtime checking
 *
 * @param witness - The witness definition to generate factories for.
 * @param options - Options for code generation.
 * @returns The generated TypeScript code as a string.
 * @throws InvalidBaseTypeError if the base type is invalid.
 *
 * @example
 * // Simple number validation
 * generateValidationFactory({
 *   name: 'NonNegativeDecimal',
 *   baseType: 'number',
 *   invariant: 'value >= 0'
 * })
 * // Generates:
 * // function makeNonNegativeDecimal(value: number): NonNegativeDecimal | null { ... }
 * // function assertNonNegativeDecimal(value: number): NonNegativeDecimal { ... }
 * // function isNonNegativeDecimal(value: unknown): value is NonNegativeDecimal { ... }
 *
 * @example
 * // Generic non-empty array
 * generateValidationFactory({
 *   name: 'NonEmptyArray',
 *   baseType: 'T[]',
 *   typeParameters: [{ name: 'T' }],
 *   invariant: 'value.length > 0'
 * })
 */
export function generateValidationFactory(
  witness: WitnessDefinition,
  options: ValidationFactoryOptions = {}
): string {
  // Validate the base type
  validateBaseType(witness.baseType);

  const { includeJsDoc = true } = options;
  const name = toFunctionName(witness.name);
  const typeParams = formatTypeParameters(witness.typeParameters);
  const funcTypeParams = formatTypeParametersForFunction(witness.typeParameters);
  const trimmedBase = witness.baseType.trim();

  // Parse the invariant conditions
  const conditions = parseInvariantConditions(witness.invariant);

  const lines: string[] = [];

  // Generate the make factory function
  if (includeJsDoc) {
    lines.push(`/**`);
    lines.push(` * Creates a ${witness.name} from a ${trimmedBase} value.`);
    if (witness.invariant !== undefined && witness.invariant !== '') {
      lines.push(` * Validates that: ${witness.invariant}`);
    }
    lines.push(` * @param value - The value to validate and brand.`);
    lines.push(` * @returns The branded value if valid, null otherwise.`);
    lines.push(` */`);
  }
  lines.push(
    `function make${name}${funcTypeParams}(value: ${trimmedBase}): ${witness.name}${funcTypeParams} | null {`
  );
  if (conditions.length === 0) {
    // No invariant - always succeed (handles unsatisfiable invariant case)
    lines.push(`  return value as ${witness.name}${funcTypeParams};`);
  } else {
    const conditionExpr = conditions.map((c) => `(${c.expression})`).join(' && ');
    lines.push(`  if (${conditionExpr}) {`);
    lines.push(`    return value as ${witness.name}${funcTypeParams};`);
    lines.push(`  }`);
    lines.push(`  return null;`);
  }
  lines.push(`}`);
  lines.push('');

  // Generate the assertion function
  if (includeJsDoc) {
    lines.push(`/**`);
    lines.push(` * Asserts that a value is a valid ${witness.name} and returns it.`);
    if (witness.invariant !== undefined && witness.invariant !== '') {
      lines.push(` * Validates that: ${witness.invariant}`);
    }
    lines.push(` * @param value - The value to validate and brand.`);
    lines.push(` * @returns The branded value.`);
    lines.push(` * @throws Error if the value does not satisfy the invariant.`);
    lines.push(` */`);
  }
  lines.push(
    `function assert${name}${funcTypeParams}(value: ${trimmedBase}): ${witness.name}${funcTypeParams} {`
  );
  if (conditions.length === 0) {
    // No invariant - always succeed
    lines.push(`  return value as ${witness.name}${funcTypeParams};`);
  } else {
    const conditionExpr = conditions.map((c) => `(${c.expression})`).join(' && ');
    const errorMessage =
      witness.invariant !== undefined && witness.invariant !== ''
        ? `Assertion failed: ${witness.invariant}`
        : `Assertion failed for ${witness.name}`;
    lines.push(`  if (!(${conditionExpr})) {`);
    lines.push(`    throw new Error('${escapeString(errorMessage)}');`);
    lines.push(`  }`);
    lines.push(`  return value as ${witness.name}${funcTypeParams};`);
  }
  lines.push(`}`);
  lines.push('');

  // Generate the type guard
  if (includeJsDoc) {
    lines.push(`/**`);
    lines.push(` * Type guard to check if a value is a valid ${witness.name}.`);
    if (witness.invariant !== undefined && witness.invariant !== '') {
      lines.push(` * Checks that: ${witness.invariant}`);
    }
    lines.push(` * @param value - The value to check.`);
    lines.push(` * @returns True if the value satisfies the ${witness.name} invariant.`);
    lines.push(` */`);
  }
  lines.push(`function is${name}(value: unknown): value is ${witness.name}${typeParams} {`);
  // Type guard needs to check the base type first
  const typeCheck = generateTypeCheck(trimmedBase);
  if (conditions.length === 0) {
    // No invariant - just check the base type
    lines.push(`  return ${typeCheck};`);
  } else {
    const conditionExpr = conditions.map((c) => `(${c.expression})`).join(' && ');
    lines.push(`  return ${typeCheck} && ${conditionExpr};`);
  }
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Parses an invariant string into individual conditions.
 *
 * Handles:
 * - Single conditions: "value >= 0"
 * - Multiple conditions separated by "&&": "value >= 0 && value <= 100"
 * - Empty/undefined invariants (returns empty array)
 *
 * @param invariant - The invariant string to parse.
 * @returns Array of parsed conditions.
 */
function parseInvariantConditions(invariant: string | undefined): InvariantCondition[] {
  if (invariant === undefined || invariant.trim() === '') {
    return [];
  }

  // Split by && at the top level (not inside parentheses)
  const parts = splitByTopLevelOperator(invariant.trim(), '&&');

  return parts.map((part) => ({
    expression: part.trim(),
  }));
}

/**
 * Splits a string by an operator at the top level (not inside brackets/parens).
 *
 * @param str - The string to split.
 * @param operator - The operator to split by.
 * @returns Array of parts.
 */
function splitByTopLevelOperator(str: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i] ?? '';

    // Track nesting depth - only parentheses, brackets, and braces
    // We don't track angle brackets because in invariant expressions, < and > are comparison operators
    if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
    }

    // Check for operator at top level
    if (depth === 0 && str.slice(i, i + operator.length) === operator) {
      if (current.trim() !== '') {
        parts.push(current.trim());
      }
      current = '';
      i += operator.length - 1; // Skip the operator
      continue;
    }

    current = current + char;
  }

  if (current.trim() !== '') {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Generates a runtime type check expression for a base type.
 *
 * @param baseType - The base type to generate a check for.
 * @returns A TypeScript expression that checks if `value` is of the base type.
 */
function generateTypeCheck(baseType: string): string {
  const trimmed = baseType.trim();

  // Primitive types
  if (trimmed === 'string') {
    return `typeof value === 'string'`;
  }
  if (trimmed === 'number') {
    return `typeof value === 'number'`;
  }
  if (trimmed === 'boolean') {
    return `typeof value === 'boolean'`;
  }
  if (trimmed === 'bigint') {
    return `typeof value === 'bigint'`;
  }
  if (trimmed === 'symbol') {
    return `typeof value === 'symbol'`;
  }
  if (trimmed === 'undefined') {
    return `typeof value === 'undefined'`;
  }
  if (trimmed === 'null') {
    return `value === null`;
  }

  // Array types
  if (trimmed.endsWith('[]')) {
    return `Array.isArray(value)`;
  }
  if (trimmed.startsWith('Array<')) {
    return `Array.isArray(value)`;
  }
  if (trimmed.startsWith('readonly ') && trimmed.endsWith('[]')) {
    return `Array.isArray(value)`;
  }
  if (trimmed.startsWith('ReadonlyArray<')) {
    return `Array.isArray(value)`;
  }

  // Tuple types
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return `Array.isArray(value)`;
  }

  // Object types (includes interfaces, object literals, etc.)
  if (trimmed.startsWith('{')) {
    return `typeof value === 'object' && value !== null`;
  }

  // Function types
  if (trimmed.includes('=>')) {
    return `typeof value === 'function'`;
  }

  // Map, Set, etc. - check for object
  if (trimmed.startsWith('Map<')) {
    return `value instanceof Map`;
  }
  if (trimmed.startsWith('Set<')) {
    return `value instanceof Set`;
  }
  if (trimmed.startsWith('Promise<')) {
    return `value instanceof Promise`;
  }

  // Default to object check for complex types
  return `typeof value === 'object' && value !== null`;
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
