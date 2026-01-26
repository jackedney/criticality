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
