/**
 * Function signature generator for the Lattice phase.
 *
 * Transforms spec.toml interface methods into TypeScript function signatures
 * with TODO placeholder bodies for implementation.
 *
 * @packageDocumentation
 */

import type { Spec, SpecInterface, SpecMethod } from '../spec/types.js';
import type {
  FunctionSignature,
  ParameterInfo,
  TypeParameterInfo,
} from '../adapters/typescript/signature.js';

/**
 * Result of parsing a spec method parameter.
 */
export interface ParsedParameter {
  /** The parameter name. */
  name: string;
  /** The parameter type. */
  type: string;
  /** Whether the parameter is optional (has ? suffix). */
  isOptional: boolean;
}

/**
 * Result of parsing a spec method return type.
 */
export interface ParsedReturnType {
  /** The full return type string. */
  type: string;
  /** Whether this is a Result type. */
  isResult: boolean;
  /** The success type if Result. */
  successType?: string;
  /** The error type if Result. */
  errorType?: string;
}

/**
 * A generated function with signature and TODO body.
 */
export interface GeneratedFunction {
  /** The function name. */
  name: string;
  /** The interface this function belongs to. */
  interfaceName: string;
  /** The function signature extracted from the spec. */
  signature: FunctionSignature;
  /** The TypeScript function declaration. */
  declaration: string;
  /** The function body (throw new Error('TODO')). */
  body: string;
  /** The complete function code. */
  code: string;
  /** JSDoc for the function. */
  jsDoc: string;
  /** Contract clauses from the spec. */
  contracts: readonly string[];
}

/**
 * Result of generating functions from a spec.
 */
export interface FunctionGenerationResult {
  /** The generated functions. */
  functions: readonly GeneratedFunction[];
  /** The complete generated code. */
  code: string;
  /** Any warnings during generation. */
  warnings: readonly FunctionGenerationWarning[];
  /** Import statements needed for the types. */
  imports: readonly string[];
}

/**
 * A warning during function generation.
 */
export interface FunctionGenerationWarning {
  /** The interface and method where the warning occurred. */
  location: string;
  /** Description of the warning. */
  message: string;
  /** The original spec content that caused the warning. */
  original?: string;
}

/**
 * Options for function generation.
 */
export interface FunctionGeneratorOptions {
  /** Whether to include JSDoc comments. Default: true. */
  includeJsDoc?: boolean;
  /** Whether to include contract annotations in JSDoc. Default: true. */
  includeContracts?: boolean;
  /** Whether to generate async functions for Promise return types. Default: true. */
  asyncForPromise?: boolean;
  /** Whether to use .js extension in imports. Default: true. */
  useJsExtension?: boolean;
}

/**
 * Error thrown when a type reference in the spec cannot be resolved.
 */
export class InvalidTypeReferenceError extends Error {
  /** The invalid type reference. */
  public readonly typeReference: string;
  /** The location in the spec. */
  public readonly location: string;

  constructor(typeReference: string, location: string) {
    super(
      `Invalid type reference '${typeReference}' in ${location}. Ensure the type is defined in data_models, enums, or witnesses.`
    );
    this.name = 'InvalidTypeReferenceError';
    this.typeReference = typeReference;
    this.location = location;
  }
}

/**
 * Maps a spec type to a TypeScript type.
 *
 * Handles:
 * - Primitive types: string, number, boolean, etc.
 * - Result types: Result<T, E> -> T | E (with special handling)
 * - Array types: Type[] or Array<Type>
 * - Optional types: Type?
 * - Generic types: Map<K, V>, Set<T>
 * - Custom types: References to data models, enums, witnesses
 *
 * @param specType - The type from the spec.
 * @returns The corresponding TypeScript type.
 */
export function mapSpecTypeToTypeScript(specType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    integer: 'number',
    float: 'number',
    decimal: 'number',
    date: 'Date',
    datetime: 'Date',
    timestamp: 'Date',
    uuid: 'string',
    email: 'string',
    url: 'string',
    json: 'unknown',
    any: 'unknown',
    void: 'void',
    null: 'null',
    undefined: 'undefined',
  };

  const trimmed = specType.trim();
  const lowerType = trimmed.toLowerCase();

  // Check direct mapping
  if (typeMap[lowerType] !== undefined) {
    return typeMap[lowerType];
  }

  // Handle Result<T, E> type -> map to a union or keep as Result
  // For TypeScript, we'll represent Result as a discriminated union pattern
  if (trimmed.startsWith('Result<') && trimmed.endsWith('>')) {
    const inner = trimmed.slice(7, -1);
    const [successType, errorType] = splitGenericArgs(inner);
    if (successType !== undefined && errorType !== undefined) {
      const mappedSuccess = mapSpecTypeToTypeScript(successType);
      const mappedError = mapSpecTypeToTypeScript(errorType);
      return `Result<${mappedSuccess}, ${mappedError}>`;
    }
    return trimmed;
  }

  // Handle Promise<T> type
  if (trimmed.startsWith('Promise<') && trimmed.endsWith('>')) {
    const inner = trimmed.slice(8, -1);
    const mappedInner = mapSpecTypeToTypeScript(inner);
    return `Promise<${mappedInner}>`;
  }

  // Handle array types: Type[]
  if (trimmed.endsWith('[]')) {
    const elementType = trimmed.slice(0, -2);
    return `${mapSpecTypeToTypeScript(elementType)}[]`;
  }

  // Handle array types: Array<Type>
  if (trimmed.startsWith('Array<') && trimmed.endsWith('>')) {
    const elementType = trimmed.slice(6, -1);
    return `Array<${mapSpecTypeToTypeScript(elementType)}>`;
  }

  // Handle optional types: Type?
  if (trimmed.endsWith('?')) {
    const baseType = trimmed.slice(0, -1);
    return `${mapSpecTypeToTypeScript(baseType)} | null`;
  }

  // Handle Map types: Map<K, V>
  if (trimmed.startsWith('Map<') && trimmed.endsWith('>')) {
    const inner = trimmed.slice(4, -1);
    const [keyType, valueType] = splitGenericArgs(inner);
    if (keyType !== undefined && valueType !== undefined) {
      const mappedKey = mapSpecTypeToTypeScript(keyType);
      const mappedValue = mapSpecTypeToTypeScript(valueType);
      return `Map<${mappedKey}, ${mappedValue}>`;
    }
    return trimmed;
  }

  // Handle Set types: Set<T>
  if (trimmed.startsWith('Set<') && trimmed.endsWith('>')) {
    const inner = trimmed.slice(4, -1);
    return `Set<${mapSpecTypeToTypeScript(inner)}>`;
  }

  // Otherwise, assume it's a custom type (reference to data model, enum, witness)
  return trimmed;
}

/**
 * Splits generic type arguments, handling nested generics.
 *
 * @param args - The comma-separated type arguments.
 * @returns Array of type argument strings.
 */
function splitGenericArgs(args: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of args) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim() !== '') {
    result.push(current.trim());
  }

  return result;
}

/**
 * Parses a spec method parameter string.
 *
 * @param param - The parameter string in format 'name: Type' or 'name?: Type'.
 * @returns The parsed parameter.
 */
export function parseSpecParameter(param: string): ParsedParameter {
  const trimmed = param.trim();

  // Handle 'name?: Type' format
  const optionalColonMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\?\s*:\s*(.+)$/.exec(trimmed);
  if (optionalColonMatch?.[1] !== undefined && optionalColonMatch[2] !== undefined) {
    return {
      name: optionalColonMatch[1],
      type: mapSpecTypeToTypeScript(optionalColonMatch[2]),
      isOptional: true,
    };
  }

  // Handle 'name: Type?' format
  const colonOptionalMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)\?$/.exec(trimmed);
  if (colonOptionalMatch?.[1] !== undefined && colonOptionalMatch[2] !== undefined) {
    return {
      name: colonOptionalMatch[1],
      type: mapSpecTypeToTypeScript(colonOptionalMatch[2]) + ' | null',
      isOptional: true,
    };
  }

  // Handle standard 'name: Type' format
  const colonMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/.exec(trimmed);
  if (colonMatch?.[1] !== undefined && colonMatch[2] !== undefined) {
    return {
      name: colonMatch[1],
      type: mapSpecTypeToTypeScript(colonMatch[2]),
      isOptional: false,
    };
  }

  // If no colon, treat the whole thing as a name with 'any' type
  return {
    name: trimmed,
    type: 'unknown',
    isOptional: false,
  };
}

/**
 * Parses a spec method return type.
 *
 * @param returnType - The return type string.
 * @returns The parsed return type.
 */
export function parseSpecReturnType(returnType: string): ParsedReturnType {
  const trimmed = returnType.trim();
  const mapped = mapSpecTypeToTypeScript(trimmed);

  // Check if it's a Result type
  const resultMatch = /^Result<(.+),\s*(.+)>$/.exec(mapped);
  if (resultMatch?.[1] !== undefined && resultMatch[2] !== undefined) {
    return {
      type: mapped,
      isResult: true,
      successType: resultMatch[1],
      errorType: resultMatch[2],
    };
  }

  return {
    type: mapped,
    isResult: false,
  };
}

/**
 * Generates a FunctionSignature from a spec method.
 *
 * @param method - The spec method definition.
 * @param options - Generation options.
 * @returns The function signature.
 */
export function generateFunctionSignature(
  method: SpecMethod,
  options: FunctionGeneratorOptions = {}
): FunctionSignature {
  const params = method.params ?? [];
  const asyncForPromise = options.asyncForPromise !== false;

  // Parse parameters
  const parameters: ParameterInfo[] = params.map((param) => {
    const parsed = parseSpecParameter(param);
    return {
      name: parsed.name,
      type: parsed.type,
      isOptional: parsed.isOptional,
      isRest: false,
    };
  });

  // Parse return type
  const returnTypeParsed = parseSpecReturnType(method.returns);
  let returnType = returnTypeParsed.type;
  let isAsync = false;

  // Check if return type is Promise or async-like
  if (returnType.startsWith('Promise<')) {
    isAsync = asyncForPromise;
  }

  // If return type is Result, we might want to wrap in Promise for async functions
  if (returnTypeParsed.isResult && !returnType.startsWith('Promise<') && isAsync) {
    returnType = `Promise<${returnType}>`;
  }

  const typeParameters: TypeParameterInfo[] = [];

  return {
    name: method.name,
    parameters,
    returnType,
    typeParameters,
    isAsync,
    isGenerator: false,
  };
}

/**
 * Generates JSDoc for a function from a spec method.
 *
 * @param method - The spec method.
 * @param signature - The function signature.
 * @param options - Generation options.
 * @returns The JSDoc string.
 */
function generateJsDoc(
  method: SpecMethod,
  signature: FunctionSignature,
  options: FunctionGeneratorOptions
): string {
  const lines: string[] = ['/**'];

  // Add description
  if (method.description !== undefined) {
    lines.push(` * ${method.description}`);
    lines.push(` *`);
  } else {
    lines.push(` * TODO: Add description for ${method.name}`);
    lines.push(` *`);
  }

  // Add parameters
  for (const param of signature.parameters) {
    lines.push(` * @param ${param.name} - TODO: Add description`);
  }

  // Add return description
  if (signature.returnType !== 'void') {
    lines.push(` * @returns TODO: Add description`);
  }

  // Add contracts if enabled
  if (
    options.includeContracts !== false &&
    method.contracts !== undefined &&
    method.contracts.length > 0
  ) {
    lines.push(` *`);
    for (const contract of method.contracts) {
      // Determine contract type from content
      const lowerContract = contract.toLowerCase();
      if (lowerContract.startsWith('requires')) {
        lines.push(` * @requires ${contract}`);
      } else if (lowerContract.startsWith('ensures')) {
        lines.push(` * @ensures ${contract}`);
      } else if (lowerContract.startsWith('invariant')) {
        lines.push(` * @invariant ${contract}`);
      } else {
        lines.push(` * @contract ${contract}`);
      }
    }
  }

  lines.push(` */`);
  return lines.join('\n');
}

/**
 * Generates the function declaration line.
 *
 * @param signature - The function signature.
 * @param options - Generation options.
 * @returns The function declaration.
 */
function generateDeclaration(
  signature: FunctionSignature,
  _options: FunctionGeneratorOptions
): string {
  const asyncPrefix = signature.isAsync ? 'async ' : '';
  const generatorMark = signature.isGenerator ? '*' : '';

  // Build type parameters
  let typeParamStr = '';
  if (signature.typeParameters.length > 0) {
    const typeParams = signature.typeParameters.map((tp) => {
      let str = tp.name;
      if (tp.constraint !== undefined) {
        str += ` extends ${tp.constraint}`;
      }
      if (tp.default !== undefined) {
        str += ` = ${tp.default}`;
      }
      return str;
    });
    typeParamStr = `<${typeParams.join(', ')}>`;
  }

  // Build parameters
  const paramStrs = signature.parameters.map((param) => {
    const optional = param.isOptional ? '?' : '';
    const rest = param.isRest ? '...' : '';
    return `${rest}${param.name}${optional}: ${param.type}`;
  });

  return `export ${asyncPrefix}function${generatorMark} ${signature.name}${typeParamStr}(${paramStrs.join(', ')}): ${signature.returnType}`;
}

/**
 * Generates a single function from a spec method.
 *
 * @param interfaceName - The name of the interface containing the method.
 * @param method - The spec method.
 * @param options - Generation options.
 * @returns The generated function.
 */
export function generateFunction(
  interfaceName: string,
  method: SpecMethod,
  options: FunctionGeneratorOptions = {}
): GeneratedFunction {
  const signature = generateFunctionSignature(method, options);
  const declaration = generateDeclaration(signature, options);
  const jsDoc = options.includeJsDoc !== false ? generateJsDoc(method, signature, options) : '';

  // Generate the TODO body
  const body = `throw new Error('TODO');`;

  // Combine into complete function code
  const codeLines: string[] = [];
  if (jsDoc !== '') {
    codeLines.push(jsDoc);
  }
  codeLines.push(`${declaration} {`);
  codeLines.push(`  ${body}`);
  codeLines.push(`}`);

  return {
    name: method.name,
    interfaceName,
    signature,
    declaration,
    body,
    code: codeLines.join('\n'),
    jsDoc,
    contracts: method.contracts ?? [],
  };
}

/**
 * Collects all type references used in an interface.
 *
 * @param iface - The spec interface.
 * @returns Set of type names that need to be imported.
 */
function collectTypeReferences(iface: SpecInterface): Set<string> {
  const refs = new Set<string>();

  // Pattern to match custom type names (not primitives or built-ins)
  const primitives = new Set([
    'string',
    'number',
    'boolean',
    'void',
    'null',
    'undefined',
    'unknown',
    'any',
    'never',
    'Date',
    'Map',
    'Set',
    'Array',
    'Promise',
    'Result',
  ]);

  const extractTypeRefs = (typeStr: string): void => {
    // Remove generics for base type extraction
    const baseMatch = /^([A-Z][a-zA-Z0-9]*)/.exec(typeStr);
    if (baseMatch?.[1] !== undefined && !primitives.has(baseMatch[1])) {
      refs.add(baseMatch[1]);
    }

    // Extract types from generics
    const genericMatch = /<(.+)>/.exec(typeStr);
    if (genericMatch?.[1] !== undefined) {
      const args = splitGenericArgs(genericMatch[1]);
      for (const arg of args) {
        extractTypeRefs(arg.trim());
      }
    }

    // Handle array types
    if (typeStr.endsWith('[]')) {
      extractTypeRefs(typeStr.slice(0, -2));
    }
  };

  for (const method of iface.methods) {
    // Extract from return type
    extractTypeRefs(method.returns);

    // Extract from parameters
    if (method.params !== undefined) {
      for (const param of method.params) {
        const colonIdx = param.indexOf(':');
        if (colonIdx >= 0) {
          extractTypeRefs(param.slice(colonIdx + 1).trim());
        }
      }
    }
  }

  return refs;
}

/**
 * Validates that all type references in the spec can be resolved.
 *
 * @param spec - The specification.
 * @param typeRefs - The type references to validate.
 * @param location - The location for error messages.
 * @returns Array of warnings for unresolved types.
 */
function validateTypeReferences(
  spec: Spec,
  typeRefs: Set<string>,
  location: string
): FunctionGenerationWarning[] {
  const warnings: FunctionGenerationWarning[] = [];
  const definedTypes = new Set<string>();

  // Collect defined types from data_models
  if (spec.data_models !== undefined) {
    for (const modelName of Object.keys(spec.data_models)) {
      definedTypes.add(modelName);
    }
  }

  // Collect defined types from enums
  if (spec.enums !== undefined) {
    for (const enumName of Object.keys(spec.enums)) {
      definedTypes.add(enumName);
    }
  }

  // Collect defined types from witnesses
  if (spec.witnesses !== undefined) {
    for (const witness of Object.values(spec.witnesses)) {
      definedTypes.add(witness.name);
    }
  }

  // Standard types that don't need to be defined
  const builtInTypes = new Set([
    'Result',
    'Promise',
    'Map',
    'Set',
    'Array',
    'Date',
    'Error',
    'ReadonlyArray',
    'Readonly',
    'Partial',
    'Required',
  ]);

  // Check each reference
  for (const ref of typeRefs) {
    if (!definedTypes.has(ref) && !builtInTypes.has(ref)) {
      warnings.push({
        location,
        message: `Type '${ref}' is referenced but not defined in spec. Ensure it exists in data_models, enums, or witnesses.`,
        original: ref,
      });
    }
  }

  return warnings;
}

/**
 * Generates functions from all spec interfaces.
 *
 * This function:
 * - Generates function signatures for all spec interface methods
 * - Function bodies contain `throw new Error('TODO')` placeholder
 * - Signatures use generated type definitions
 * - Uses TypeScriptAdapter patterns for signature extraction
 *
 * @param spec - The parsed specification.
 * @param options - Generation options.
 * @returns The function generation result.
 *
 * @example
 * ```typescript
 * const spec = parseSpec(tomlContent);
 * const result = generateFunctionSignatures(spec, {
 *   includeJsDoc: true,
 *   includeContracts: true,
 * });
 *
 * // Write the generated code
 * await fs.writeFile('functions.ts', result.code);
 * ```
 */
export function generateFunctionSignatures(
  spec: Spec,
  options: FunctionGeneratorOptions = {}
): FunctionGenerationResult {
  const functions: GeneratedFunction[] = [];
  const warnings: FunctionGenerationWarning[] = [];
  const allTypeRefs = new Set<string>();

  // Process each interface
  if (spec.interfaces !== undefined) {
    for (const [interfaceName, iface] of Object.entries(spec.interfaces)) {
      // Collect type references for this interface
      const typeRefs = collectTypeReferences(iface);
      for (const ref of typeRefs) {
        allTypeRefs.add(ref);
      }

      // Validate type references
      const typeWarnings = validateTypeReferences(spec, typeRefs, interfaceName);
      warnings.push(...typeWarnings);

      // Generate functions for each method
      for (const method of iface.methods) {
        const func = generateFunction(interfaceName, method, options);
        functions.push(func);
      }
    }
  }

  // Generate imports for type references
  const imports = generateImports(allTypeRefs, options);

  // Build the complete code
  const codeLines: string[] = [
    '/**',
    ' * Generated function signatures from spec.toml interfaces.',
    ' *',
    ' * This file was auto-generated by the Lattice phase function generator.',
    ' * Do not edit manually.',
    ' *',
    ' * @packageDocumentation',
    ' */',
    '',
  ];

  // Add imports
  if (imports.length > 0) {
    codeLines.push(...imports);
    codeLines.push('');
  }

  // Add Result type definition if used
  if (
    allTypeRefs.has('Result') ||
    functions.some((f) => f.signature.returnType.includes('Result<'))
  ) {
    codeLines.push('// Result type for error handling');
    codeLines.push('// This should be imported from your types module or defined here');
    codeLines.push('export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };');
    codeLines.push('');
  }

  // Add function code
  for (const func of functions) {
    codeLines.push(func.code);
    codeLines.push('');
  }

  return {
    functions,
    code: codeLines.join('\n'),
    warnings,
    imports,
  };
}

/**
 * Generates import statements for type references.
 *
 * @param typeRefs - The type references to import.
 * @param options - Generation options.
 * @returns Array of import statement strings.
 */
function generateImports(typeRefs: Set<string>, options: FunctionGeneratorOptions): string[] {
  const extension = options.useJsExtension !== false ? '.js' : '';
  const imports: string[] = [];

  // Filter out built-in types
  const builtInTypes = new Set([
    'Result',
    'Promise',
    'Map',
    'Set',
    'Array',
    'Date',
    'Error',
    'ReadonlyArray',
    'Readonly',
    'Partial',
    'Required',
  ]);

  const customTypes = [...typeRefs].filter((t) => !builtInTypes.has(t)).sort();

  if (customTypes.length > 0) {
    // Generate import from types module
    imports.push(`import type { ${customTypes.join(', ')} } from './types${extension}';`);
  }

  return imports;
}

/**
 * Generates functions for a specific interface.
 *
 * @param spec - The parsed specification.
 * @param interfaceName - The name of the interface to generate functions for.
 * @param options - Generation options.
 * @returns The function generation result for the specific interface.
 * @throws Error if the interface is not found.
 */
export function generateFunctionsForInterface(
  spec: Spec,
  interfaceName: string,
  options: FunctionGeneratorOptions = {}
): FunctionGenerationResult {
  if (spec.interfaces?.[interfaceName] === undefined) {
    throw new Error(`Interface '${interfaceName}' not found in spec`);
  }

  // Create a filtered spec with only the requested interface
  const filteredSpec: Spec = {
    ...spec,
    interfaces: {
      [interfaceName]: spec.interfaces[interfaceName],
    },
  };

  return generateFunctionSignatures(filteredSpec, options);
}
