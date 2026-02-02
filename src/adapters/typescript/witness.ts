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
    // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
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
    // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
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

/**
 * Options for generating fast-check Arbitrary instances.
 */
export interface ArbitraryOptions {
  /** Include JSDoc comments in generated code */
  includeJsDoc?: boolean;
  /** Maximum number of filter attempts before throwing (for detecting unsatisfiable invariants) */
  maxFilterAttempts?: number;
}

/**
 * Generates base type information for fast-check arbitrary generation.
 */
interface BaseArbitraryInfo {
  /** The fast-check arbitrary expression */
  arbitrary: string;
  /** Whether the arbitrary can be optimized for specific constraints */
  optimizable: boolean;
  /** The shrink target value for this type (if applicable) */
  shrinkTarget?: string;
}

/**
 * Analyzes a base type to determine the appropriate fast-check arbitrary.
 *
 * @param baseType - The TypeScript base type string.
 * @param invariant - The invariant expression (for optimization hints).
 * @returns Information about the base arbitrary to use.
 */
function analyzeBaseArbitrary(baseType: string, invariant?: string): BaseArbitraryInfo {
  const trimmed = baseType.trim();

  // String types
  if (trimmed === 'string') {
    // Check for common string invariants that can be optimized
    if (invariant !== undefined) {
      const minLengthMatch = /value\.length\s*>=?\s*(\d+)/.exec(invariant);
      const maxLengthMatch = /value\.length\s*<=?\s*(\d+)/.exec(invariant);

      const minLengthValue = minLengthMatch?.[1];
      const maxLengthValue = maxLengthMatch?.[1];

      if (minLengthValue !== undefined || maxLengthValue !== undefined) {
        const options: string[] = [];
        if (minLengthValue !== undefined) {
          const minLength = invariant.includes('>=')
            ? minLengthValue
            : String(Number(minLengthValue) + 1);
          options.push(`minLength: ${minLength}`);
        }
        if (maxLengthValue !== undefined) {
          const maxLength = invariant.includes('<=')
            ? maxLengthValue
            : String(Number(maxLengthValue) - 1);
          options.push(`maxLength: ${maxLength}`);
        }
        return {
          arbitrary: `fc.string({ ${options.join(', ')} })`,
          optimizable: true,
          shrinkTarget: "''",
        };
      }
    }
    return { arbitrary: 'fc.string()', optimizable: false, shrinkTarget: "''" };
  }

  // Number types
  if (trimmed === 'number') {
    // Check for common number invariants that can be optimized
    if (invariant !== undefined) {
      // eslint-disable-next-line security/detect-unsafe-regex -- Short invariant strings from code analysis
      const minMatch = /value[ \t]*>=?[ \t]*(-?\d+(?:\.\d+)?)/.exec(invariant);
      // eslint-disable-next-line security/detect-unsafe-regex -- Short invariant strings from code analysis
      const maxMatch = /value[ \t]*<=?[ \t]*(-?\d+(?:\.\d+)?)/.exec(invariant);

      // For non-negative numbers, use fc.float with min: 0
      const minValue = minMatch?.[1];
      if (minMatch !== null && minValue !== undefined && Number(minValue) >= 0) {
        const options: string[] = [];
        const min = invariant.includes('>=') ? minValue : String(Number(minValue) + 0.0001);
        options.push(`min: ${min}`);
        const maxValue = maxMatch?.[1];
        if (maxMatch !== null && maxValue !== undefined) {
          const max = invariant.includes('<=') ? maxValue : String(Number(maxValue) - 0.0001);
          options.push(`max: ${max}`);
        }
        // Use noNaN to avoid NaN which typically doesn't satisfy number invariants
        options.push('noNaN: true');
        return {
          arbitrary: `fc.float({ ${options.join(', ')} })`,
          optimizable: true,
          shrinkTarget: min,
        };
      }
    }
    return { arbitrary: 'fc.float({ noNaN: true })', optimizable: false, shrinkTarget: '0' };
  }

  // Integer check (when invariant mentions integer)
  if (trimmed === 'number' && (invariant?.includes('Number.isInteger') ?? false)) {
    return { arbitrary: 'fc.integer()', optimizable: true, shrinkTarget: '0' };
  }

  // Boolean
  if (trimmed === 'boolean') {
    return { arbitrary: 'fc.boolean()', optimizable: false };
  }

  // Bigint
  if (trimmed === 'bigint') {
    return { arbitrary: 'fc.bigInt()', optimizable: false, shrinkTarget: '0n' };
  }

  // Array types
  if (trimmed.endsWith('[]')) {
    const elementType = trimmed.slice(0, -2).trim();
    const elementArb = analyzeBaseArbitrary(elementType);

    // Check for non-empty array invariant
    if (invariant !== undefined && /value\.length\s*>\s*0/.test(invariant)) {
      return {
        arbitrary: `fc.array(${elementArb.arbitrary}, { minLength: 1 })`,
        optimizable: true,
        shrinkTarget: '[]',
      };
    }

    return {
      arbitrary: `fc.array(${elementArb.arbitrary})`,
      optimizable: false,
      shrinkTarget: '[]',
    };
  }

  // Array<T> syntax
  if (trimmed.startsWith('Array<') && trimmed.endsWith('>')) {
    const elementType = trimmed.slice(6, -1).trim();
    const elementArb = analyzeBaseArbitrary(elementType);

    // Check for non-empty array invariant
    if (invariant !== undefined && /value\.length\s*>\s*0/.test(invariant)) {
      return {
        arbitrary: `fc.array(${elementArb.arbitrary}, { minLength: 1 })`,
        optimizable: true,
        shrinkTarget: '[]',
      };
    }

    return {
      arbitrary: `fc.array(${elementArb.arbitrary})`,
      optimizable: false,
      shrinkTarget: '[]',
    };
  }

  // Tuple types
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    const elements = splitTupleElements(inner);
    const elementArbs = elements.map((el) => analyzeBaseArbitrary(el).arbitrary);
    return {
      arbitrary: `fc.tuple(${elementArbs.join(', ')})`,
      optimizable: false,
    };
  }

  // Map types
  if (trimmed.startsWith('Map<') && trimmed.endsWith('>')) {
    const inner = trimmed.slice(4, -1);
    const [keyType, valueType] = splitGenericParams(inner);
    const keyArb = analyzeBaseArbitrary(keyType ?? 'unknown');
    const valueArb = analyzeBaseArbitrary(valueType ?? 'unknown');
    return {
      arbitrary: `fc.array(fc.tuple(${keyArb.arbitrary}, ${valueArb.arbitrary})).map(entries => new Map(entries))`,
      optimizable: false,
    };
  }

  // Set types
  if (trimmed.startsWith('Set<') && trimmed.endsWith('>')) {
    const elementType = trimmed.slice(4, -1).trim();
    const elementArb = analyzeBaseArbitrary(elementType);
    return {
      arbitrary: `fc.array(${elementArb.arbitrary}).map(items => new Set(items))`,
      optimizable: false,
    };
  }

  // Object literal types
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') {
      return { arbitrary: 'fc.constant({})', optimizable: false };
    }

    const props = parseObjectProperties(inner);
    const propArbs = props.map((prop) => {
      const propArb = analyzeBaseArbitrary(prop.type);
      if (prop.optional) {
        return `${prop.name}: fc.option(${propArb.arbitrary}, { nil: undefined })`;
      }
      return `${prop.name}: ${propArb.arbitrary}`;
    });
    return {
      arbitrary: `fc.record({ ${propArbs.join(', ')} })`,
      optimizable: false,
    };
  }

  // Generic type parameters - return a placeholder that can be substituted
  if (/^[A-Z]$/.test(trimmed) || /^[A-Z]\w*$/.test(trimmed)) {
    return {
      arbitrary: `arb${trimmed}`,
      optimizable: false,
    };
  }

  // Default to fc.anything() for unknown types
  return { arbitrary: 'fc.anything()', optimizable: false };
}

/**
 * Splits a comma-separated list of tuple elements, respecting nested generics.
 */
function splitTupleElements(inner: string): string[] {
  return splitByTopLevelComma(inner);
}

/**
 * Splits generic parameters by comma at the top level.
 */
function splitGenericParams(inner: string): string[] {
  return splitByTopLevelComma(inner);
}

/**
 * Splits a string by comma at the top level (not inside brackets).
 */
function splitByTopLevelComma(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of str) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
    }

    if (char === ',' && depth === 0) {
      if (current.trim() !== '') {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim() !== '') {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Represents a parsed object property.
 */
interface ObjectProperty {
  name: string;
  type: string;
  optional: boolean;
}

/**
 * Parses object literal properties from a type string.
 */
function parseObjectProperties(inner: string): ObjectProperty[] {
  const props: ObjectProperty[] = [];
  const parts = splitByTopLevelSemicolonOrComma(inner);

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }

    // Match "name?: type" or "name: type" patterns
    const match = /^(\w+)(\?)?:\s*(.+)$/.exec(trimmed);
    if (match !== null) {
      props.push({
        name: match[1] ?? '',
        type: match[3]?.trim() ?? 'unknown',
        optional: match[2] === '?',
      });
    }
  }

  return props;
}

/**
 * Splits by semicolon or comma at the top level.
 */
function splitByTopLevelSemicolonOrComma(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of str) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
    }

    if ((char === ';' || char === ',') && depth === 0) {
      if (current.trim() !== '') {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim() !== '') {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Generates a fast-check Arbitrary instance for a witness type.
 *
 * The generated arbitrary:
 * - Produces only values that satisfy the witness invariant
 * - Uses optimized constraints where possible (e.g., minLength for strings)
 * - Falls back to fc.filter() for complex invariants
 * - Supports custom shrinking that maintains invariant validity
 *
 * @param witness - The witness definition to generate an arbitrary for.
 * @param options - Options for code generation.
 * @returns The TypeScript code for the arbitrary as a string.
 * @throws InvalidBaseTypeError if the base type is invalid.
 *
 * @example
 * // Non-negative decimal
 * generateArbitrary({
 *   name: 'NonNegativeDecimal',
 *   baseType: 'number',
 *   invariant: 'value >= 0'
 * })
 * // Returns code generating: fc.float({ min: 0, noNaN: true }).filter(n => n >= 0)
 *
 * @example
 * // Non-empty string (optimized)
 * generateArbitrary({
 *   name: 'NonEmptyString',
 *   baseType: 'string',
 *   invariant: 'value.length > 0'
 * })
 * // Returns code generating: fc.string({ minLength: 1 })
 *
 * @example
 * // Generic non-empty array
 * generateArbitrary({
 *   name: 'NonEmptyArray',
 *   baseType: 'T[]',
 *   typeParameters: [{ name: 'T' }],
 *   invariant: 'value.length > 0'
 * })
 * // Returns a function that takes an arbitrary for T
 */
export function generateArbitrary(
  witness: WitnessDefinition,
  options: ArbitraryOptions = {}
): string {
  // Validate the base type
  validateBaseType(witness.baseType);

  const { includeJsDoc = true, maxFilterAttempts = 1000 } = options;
  const name = witness.name;
  const trimmedBase = witness.baseType.trim();
  const hasTypeParams = witness.typeParameters !== undefined && witness.typeParameters.length > 0;

  // Analyze the base type to determine the optimal arbitrary
  const baseArbInfo = analyzeBaseArbitrary(trimmedBase, witness.invariant);

  const lines: string[] = [];

  // Parse invariant conditions for filter generation
  const conditions = parseInvariantConditions(witness.invariant);
  const hasInvariant = conditions.length > 0;

  if (hasTypeParams) {
    // Generate a factory function for generic witnesses
    const typeParams = witness.typeParameters ?? [];
    const arbParams = typeParams.map((tp) => `arb${tp.name}: fc.Arbitrary<${tp.name}>`).join(', ');
    const typeParamStr = typeParams.map((tp) => tp.name).join(', ');

    if (includeJsDoc) {
      lines.push(`/**`);
      lines.push(` * Creates a fast-check Arbitrary for ${name}<${typeParamStr}> values.`);
      if (witness.invariant !== undefined && witness.invariant !== '') {
        lines.push(` * Generated values satisfy: ${witness.invariant}`);
      }
      lines.push(
        ` * @param ${typeParams.map((tp) => `arb${tp.name} - Arbitrary for type parameter ${tp.name}`).join('\n * @param ')}`
      );
      lines.push(` * @returns An Arbitrary that generates valid ${name} values.`);
      lines.push(` */`);
    }

    lines.push(
      `function arbitrary${name}<${typeParamStr}>(${arbParams}): fc.Arbitrary<${name}<${typeParamStr}>> {`
    );

    // Build the arbitrary expression with type parameter substitution
    let arbExpr = baseArbInfo.arbitrary;
    // Replace placeholder arbitraries with actual type param arbitraries
    for (const tp of typeParams) {
      arbExpr = arbExpr.replace(new RegExp(`arb${tp.name}`, 'g'), `arb${tp.name}`);
    }

    if (hasInvariant) {
      // Generate filter with custom shrinking
      const filterExpr = conditions
        .map((c) => `(${c.expression.replace(/value/g, 'v')})`)
        .join(' && ');
      lines.push(`  const baseArb = ${arbExpr};`);
      lines.push(`  return baseArb.filter((v): v is ${name}<${typeParamStr}> => ${filterExpr});`);
    } else {
      lines.push(`  return ${arbExpr} as fc.Arbitrary<${name}<${typeParamStr}>>;`);
    }

    lines.push(`}`);
  } else {
    // Generate a constant arbitrary for non-generic witnesses
    if (includeJsDoc) {
      lines.push(`/**`);
      lines.push(` * A fast-check Arbitrary for ${name} values.`);
      if (witness.invariant !== undefined && witness.invariant !== '') {
        lines.push(` * Generated values satisfy: ${witness.invariant}`);
      }
      lines.push(` */`);
    }

    if (hasInvariant) {
      // Generate filtered arbitrary with custom shrinking
      const filterExpr = conditions
        .map((c) => `(${c.expression.replace(/value/g, 'v')})`)
        .join(' && ');

      // Check if we can use the optimized arbitrary directly without filter
      // (when the arbitrary constraints already satisfy the invariant)
      const canSkipFilter = canOptimizeAwayFilter(witness.invariant ?? '', baseArbInfo);

      if (canSkipFilter) {
        lines.push(
          `const arbitrary${name}: fc.Arbitrary<${name}> = ${baseArbInfo.arbitrary} as fc.Arbitrary<${name}>;`
        );
      } else {
        // Use filter for complex invariants, with shrinking that respects the invariant
        lines.push(`const arbitrary${name}: fc.Arbitrary<${name}> = ${baseArbInfo.arbitrary}`);
        lines.push(`  .filter((v): v is ${name} => ${filterExpr});`);
      }
    } else {
      // No invariant - just cast the base arbitrary
      lines.push(
        `const arbitrary${name}: fc.Arbitrary<${name}> = ${baseArbInfo.arbitrary} as fc.Arbitrary<${name}>;`
      );
    }
  }

  // Generate a helper for detecting unsatisfiable invariants
  if (hasInvariant && !hasTypeParams) {
    lines.push('');
    if (includeJsDoc) {
      lines.push(`/**`);
      lines.push(` * Validates that the ${name} arbitrary can generate values.`);
      lines.push(` * @throws Error if the invariant appears to be unsatisfiable.`);
      lines.push(` */`);
    }
    lines.push(`function validate${name}Arbitrary(): void {`);
    lines.push(`  let attempts = 0;`);
    lines.push(`  const maxAttempts = ${String(maxFilterAttempts)};`);
    lines.push(`  `);
    lines.push(`  // Try to generate a single value to validate the arbitrary`);
    lines.push(`  try {`);
    lines.push(`    fc.sample(arbitrary${name}, { numRuns: 1 });`);
    lines.push(`  } catch (e) {`);
    lines.push(`    throw new Error(`);
    lines.push(
      `      \`${name} arbitrary failed to generate a value. The invariant "${escapeString(witness.invariant ?? '')}" may be unsatisfiable.\``
    );
    lines.push(`    );`);
    lines.push(`  }`);
    lines.push(`}`);
  }

  return lines.join('\n');
}

/**
 * Determines if the filter can be optimized away because the arbitrary
 * constraints already satisfy the invariant.
 */
function canOptimizeAwayFilter(invariant: string, arbInfo: BaseArbitraryInfo): boolean {
  if (!arbInfo.optimizable) {
    return false;
  }

  // For string length constraints, if minLength is specified in the arbitrary,
  // we can skip the filter for "value.length > 0" or "value.length >= 1"
  if (arbInfo.arbitrary.includes('minLength: 1') && /value\.length\s*>\s*0/.test(invariant)) {
    return true;
  }

  if (
    arbInfo.arbitrary.includes('minLength: 1') &&
    /value\.length[ \t]*>=[ \t]*1/.test(invariant)
  ) {
    return true;
  }

  // For number constraints with min, check if the invariant is covered
  // eslint-disable-next-line security/detect-unsafe-regex -- Short arbitrary strings from internal generation
  const minMatch = /min:[ \t]*(-?\d+(?:\.\d+)?)/.exec(arbInfo.arbitrary);
  if (minMatch !== null) {
    const arbMin = Number(minMatch[1]);
    // eslint-disable-next-line security/detect-unsafe-regex -- Short invariant strings from code analysis
    const invMinMatch = /value[ \t]*>=[ \t]*(-?\d+(?:\.\d+)?)/.exec(invariant);
    if (invMinMatch !== null && Number(invMinMatch[1]) === arbMin) {
      // The min constraint in the arbitrary matches the invariant
      // We still need the filter for the type guard, but it will rarely reject
      return false; // Keep filter for type safety, but it's optimized
    }
  }

  return false;
}
