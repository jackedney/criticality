/**
 * Type definition generator for the Lattice phase.
 *
 * Transforms spec.toml data models and enums into TypeScript type definitions
 * with branded types for constraint witnesses.
 *
 * @packageDocumentation
 */

import type { Spec, SpecDataModel, SpecEnum, SpecField, SpecWitness } from '../spec/types.js';
import {
  generateBrandedType,
  generateValidationFactory,
  type WitnessDefinition,
  type WitnessTypeParameter,
} from '../adapters/typescript/witness.js';

/**
 * Constraint types that can be mapped to branded types.
 */
export type SupportedConstraintType =
  | 'non_negative'
  | 'positive'
  | 'non_empty'
  | 'max_length'
  | 'min_length'
  | 'range'
  | 'pattern'
  | 'unique'
  | 'required';

/**
 * A warning about an unsupported constraint.
 */
export interface ConstraintWarning {
  /** The field or model name where the constraint was found. */
  location: string;
  /** The unsupported constraint text. */
  constraint: string;
  /** Reason why the constraint is not supported. */
  reason: string;
}

/**
 * Result of generating a branded type for a constraint.
 */
export interface BrandedTypeResult {
  /** The branded type name. */
  typeName: string;
  /** The branded type definition. */
  typeDefinition: string;
  /** The validation factory code. */
  validationFactory: string;
  /** The base type that was branded. */
  baseType: string;
  /** The invariant expression. */
  invariant: string;
  /** JSDoc comment for the type. */
  jsDoc: string;
}

/**
 * Result of generating type definitions from a spec.
 */
export interface TypeGenerationResult {
  /** The generated TypeScript code. */
  code: string;
  /** Generated branded type definitions. */
  brandedTypes: readonly BrandedTypeResult[];
  /** Generated enum definitions. */
  enums: readonly string[];
  /** Generated interface definitions. */
  interfaces: readonly string[];
  /** Warnings about unsupported constraints. */
  warnings: readonly ConstraintWarning[];
}

/**
 * Options for type generation.
 */
export interface TypeGeneratorOptions {
  /** Whether to generate validation factories for branded types. Default: true. */
  generateValidationFactories?: boolean;
  /** Whether to include JSDoc comments. Default: true. */
  includeJsDoc?: boolean;
  /** Whether to emit warnings for unsupported constraints. Default: true. */
  emitWarnings?: boolean;
}

/**
 * Sanitizes a number value for use in a TypeScript identifier.
 *
 * Converts invalid characters like '-' and '.' to identifier-safe tokens.
 * Examples:
 *   -5 -> Neg5
 *   -10.5 -> Neg10P5
 *   3.14 -> 3P14
 *
 * @param num - The number value as a string.
 * @returns The sanitized identifier-safe string.
 */
function sanitizeNumberForIdentifier(num: string): string {
  return num.replace(/-/g, 'Neg').replace(/\./g, 'P');
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
 * Maps a spec field type to a TypeScript type.
 *
 * @param specType - The type from the spec.
 * @returns The corresponding TypeScript type.
 */
function mapSpecTypeToTypeScript(specType: string): string {
  // Handle common type mappings
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

  const lowerType = specType.toLowerCase();

  // Check direct mapping
  if (typeMap[lowerType] !== undefined) {
    return typeMap[lowerType];
  }

  // Handle array types: Type[] or Array<Type>
  if (specType.endsWith('[]')) {
    const elementType = specType.slice(0, -2);
    return `${mapSpecTypeToTypeScript(elementType)}[]`;
  }

  if (specType.startsWith('Array<') && specType.endsWith('>')) {
    const elementType = specType.slice(6, -1);
    return `Array<${mapSpecTypeToTypeScript(elementType)}>`;
  }

  // Handle optional types: Type?
  if (specType.endsWith('?')) {
    const baseType = specType.slice(0, -1);
    return `${mapSpecTypeToTypeScript(baseType)} | null`;
  }

  // Handle Map types: Map<K, V>
  if (specType.startsWith('Map<') && specType.endsWith('>')) {
    const inner = specType.slice(4, -1);
    const [keyType, valueType] = splitGenericArgs(inner);
    if (keyType !== undefined && valueType !== undefined) {
      const mappedKey = mapSpecTypeToTypeScript(keyType);
      const mappedValue = mapSpecTypeToTypeScript(valueType);
      return `Map<${mappedKey}, ${mappedValue}>`;
    }
    return specType;
  }

  // Handle Set types: Set<T>
  if (specType.startsWith('Set<') && specType.endsWith('>')) {
    const inner = specType.slice(4, -1);
    return `Set<${mapSpecTypeToTypeScript(inner)}>`;
  }

  // Otherwise, assume it's a custom type (e.g., reference to another data model)
  return specType;
}

/**
 * Parsed constraint info with additional string representation for range values.
 */
interface ParsedConstraint {
  type: SupportedConstraintType | 'unsupported';
  params: Record<string, string | number>;
  original: string;
  _minStr?: string;
  _maxStr?: string;
}

/**
 * Parses a constraint string to extract constraint type and parameters.
 *
 * @param constraint - The constraint string from the spec.
 * @returns The parsed constraint info or null if unrecognized.
 */
function parseConstraint(constraint: string): ParsedConstraint {
  const trimmed = constraint.trim().toLowerCase();
  const original = constraint.trim();

  // Non-negative: >= 0, non_negative, nonnegative
  if (
    trimmed === 'non_negative' ||
    trimmed === 'nonnegative' ||
    trimmed === '>= 0' ||
    trimmed === '>=0'
  ) {
    return { type: 'non_negative', params: {}, original };
  }

  // Positive: > 0, positive
  if (trimmed === 'positive' || trimmed === '> 0' || trimmed === '>0') {
    return { type: 'positive', params: {}, original };
  }

  // Non-empty: non_empty, nonempty, length > 0
  if (
    trimmed === 'non_empty' ||
    trimmed === 'nonempty' ||
    trimmed === 'not_empty' ||
    trimmed === 'length > 0' ||
    trimmed === 'length>0'
  ) {
    return { type: 'non_empty', params: {}, original };
  }

  // Max length: max_length(n), maxlength(n), length <= n
  const maxLengthMatch = /^(?:max_?length|length\s*<=?)\s*\(?(\d+)\)?$/.exec(trimmed);
  if (maxLengthMatch?.[1] !== undefined) {
    return { type: 'max_length', params: { max: parseInt(maxLengthMatch[1], 10) }, original };
  }

  // Min length: min_length(n), minlength(n), length >= n
  const minLengthMatch = /^(?:min_?length|length\s*>=?)\s*\(?(\d+)\)?$/.exec(trimmed);
  if (minLengthMatch?.[1] !== undefined) {
    return { type: 'min_length', params: { min: parseInt(minLengthMatch[1], 10) }, original };
  }

  // Range: range(min, max), [min, max], min..max
  const rangeMatch =
    /^(?:range\s*\(|\[)?\s*(-?\d+(?:\.\d+)?)\s*[,.\s]+\s*(-?\d+(?:\.\d+)?)\s*(?:\)|\])?$/.exec(
      trimmed
    );
  if (rangeMatch?.[1] !== undefined && rangeMatch[2] !== undefined) {
    return {
      type: 'range',
      params: {
        min: parseFloat(rangeMatch[1]),
        max: parseFloat(rangeMatch[2]),
      },
      original,
      _minStr: rangeMatch[1],
      _maxStr: rangeMatch[2],
    };
  }

  // Pattern: pattern(regex), regex(pattern), /pattern/
  const patternMatch = /^(?:pattern|regex)\s*\(\s*["'/]?(.+?)["'/]?\s*\)$/.exec(trimmed);
  if (patternMatch?.[1] !== undefined) {
    return { type: 'pattern', params: { pattern: patternMatch[1] }, original };
  }

  // Unique: unique
  if (trimmed === 'unique') {
    return { type: 'unique', params: {}, original };
  }

  // Required: required, not_null, notnull
  if (trimmed === 'required' || trimmed === 'not_null' || trimmed === 'notnull') {
    return { type: 'required', params: {}, original };
  }

  // Unsupported constraint
  return { type: 'unsupported', params: {}, original };
}

/**
 * Converts a constraint type to a branded type name.
 *
 * @param baseType - The base TypeScript type.
 * @param constraintType - The constraint type.
 * @param params - Constraint parameters.
 * @param minStr - Original string representation of min value (for Range).
 * @param maxStr - Original string representation of max value (for Range).
 * @returns The branded type name.
 */
function constraintToBrandedTypeName(
  baseType: string,
  constraintType: SupportedConstraintType,
  params: Record<string, string | number>,
  minStr?: string,
  maxStr?: string
): string {
  // Map base type to a clean suffix
  const baseTypeSuffix =
    baseType === 'number'
      ? 'Decimal'
      : baseType === 'string'
        ? 'String'
        : baseType.endsWith('[]')
          ? 'Array'
          : baseType;

  switch (constraintType) {
    case 'non_negative':
      return `NonNegative${baseTypeSuffix}`;
    case 'positive':
      return `Positive${baseTypeSuffix}`;
    case 'non_empty':
      return baseType === 'string' ? 'NonEmptyString' : 'NonEmptyArray';
    case 'max_length':
      return `MaxLength${String(params.max)}${baseTypeSuffix}`;
    case 'min_length':
      return `MinLength${String(params.min)}${baseTypeSuffix}`;
    case 'range': {
      const rangeMin = minStr ?? String(params.min);
      const rangeMax = maxStr ?? String(params.max);
      return `Range${sanitizeNumberForIdentifier(rangeMin)}To${sanitizeNumberForIdentifier(rangeMax)}${baseTypeSuffix}`;
    }
    case 'pattern':
      return `Patterned${baseTypeSuffix}`;
    case 'unique':
      return `Unique${baseTypeSuffix}`;
    case 'required':
      return baseType; // Required doesn't change the type name
    default:
      return baseType;
  }
}

/**
 * Converts a constraint type to an invariant expression.
 *
 * @param constraintType - The constraint type.
 * @param params - Constraint parameters.
 * @returns The invariant expression for the constraint.
 */
function constraintToInvariant(
  constraintType: SupportedConstraintType,
  params: Record<string, string | number>
): string {
  switch (constraintType) {
    case 'non_negative':
      return 'value >= 0';
    case 'positive':
      return 'value > 0';
    case 'non_empty':
      return 'value.length > 0';
    case 'max_length':
      return `value.length <= ${String(params.max)}`;
    case 'min_length':
      return `value.length >= ${String(params.min)}`;
    case 'range':
      return `value >= ${String(params.min)} && value <= ${String(params.max)}`;
    case 'pattern':
      return `/${String(params.pattern)}/.test(value)`;
    case 'unique':
      return '/* unique constraint - enforced at collection level */';
    case 'required':
      return 'value !== null && value !== undefined';
    default:
      return '';
  }
}

/**
 * Generates a branded type for a constraint.
 *
 * @param baseType - The base TypeScript type.
 * @param constraintType - The constraint type.
 * @param params - Constraint parameters.
 * @param description - Description for JSDoc.
 * @param options - Generation options.
 * @param minStr - Original string representation of min value (for Range).
 * @param maxStr - Original string representation of max value (for Range).
 * @returns The branded type result or null if not applicable.
 */
function generateBrandedTypeForConstraint(
  baseType: string,
  constraintType: SupportedConstraintType,
  params: Record<string, string | number>,
  description: string,
  options: TypeGeneratorOptions,
  minStr?: string,
  maxStr?: string
): BrandedTypeResult | null {
  // Skip constraints that don't generate branded types
  if (constraintType === 'unique' || constraintType === 'required') {
    return null;
  }

  const typeName = constraintToBrandedTypeName(baseType, constraintType, params, minStr, maxStr);
  const invariant = constraintToInvariant(constraintType, params);

  // Create witness definition
  const witnessDefinition: WitnessDefinition = {
    name: typeName,
    baseType,
    invariant,
  };

  // Generate the branded type definition
  const typeDefinition = generateBrandedType(witnessDefinition);

  // Generate the validation factory
  const validationFactory =
    options.generateValidationFactories !== false
      ? generateValidationFactory(witnessDefinition, {
          includeJsDoc: options.includeJsDoc !== false,
        })
      : '';

  // Generate JSDoc
  const jsDoc = `/**
 * ${description}
 *
 * @constraint ${constraintType}: ${invariant}
 */`;

  return {
    typeName,
    typeDefinition,
    validationFactory,
    baseType,
    invariant,
    jsDoc,
  };
}

/**
 * Generates an enum definition from a spec enum.
 *
 * @param enumName - The enum name.
 * @param specEnum - The spec enum definition.
 * @param includeJsDoc - Whether to include JSDoc.
 * @returns The generated enum code.
 */
function generateEnumDefinition(
  enumName: string,
  specEnum: SpecEnum,
  includeJsDoc: boolean
): string {
  const lines: string[] = [];

  // Generate JSDoc
  if (includeJsDoc) {
    lines.push('/**');
    if (specEnum.description !== undefined) {
      lines.push(` * ${specEnum.description}`);
    } else {
      lines.push(` * ${enumName} enumeration.`);
    }
    lines.push(' */');
  }

  // Generate enum declaration
  lines.push(`export enum ${enumName} {`);

  for (const variant of specEnum.variants) {
    // Convert variant to enum member format (UPPER_SNAKE_CASE value)
    const memberValue = variant;
    lines.push(`  ${variant} = '${memberValue}',`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generates an interface definition from a spec data model.
 *
 * @param modelName - The model name.
 * @param model - The spec data model.
 * @param brandedTypeMap - Map of field types to branded types.
 * @param includeJsDoc - Whether to include JSDoc.
 * @returns The generated interface code.
 */
function generateInterfaceDefinition(
  modelName: string,
  model: SpecDataModel,
  brandedTypeMap: Map<string, string>,
  includeJsDoc: boolean
): string {
  const lines: string[] = [];

  // Generate JSDoc for the interface
  if (includeJsDoc) {
    lines.push('/**');
    if (model.description !== undefined) {
      lines.push(` * ${model.description}`);
    } else {
      lines.push(` * ${modelName} data model.`);
    }

    // Document invariants
    if (model.invariants !== undefined && model.invariants.length > 0) {
      lines.push(' *');
      lines.push(' * @invariants');
      for (const invariant of model.invariants) {
        lines.push(` * - ${invariant}`);
      }
    }
    lines.push(' */');
  }

  // Generate interface declaration
  lines.push(`export interface ${modelName} {`);

  for (const field of model.fields) {
    // Generate field JSDoc
    if (includeJsDoc) {
      const hasConstraints = field.constraints !== undefined && field.constraints.length > 0;
      const hasDescription = field.description !== undefined;

      if (hasConstraints || hasDescription) {
        lines.push('  /**');
        if (hasDescription && field.description !== undefined) {
          lines.push(`   * ${field.description}`);
        }
        if (hasConstraints && field.constraints !== undefined) {
          if (hasDescription) {
            lines.push('   *');
          }
          lines.push('   * @constraints');
          for (const constraint of field.constraints) {
            lines.push(`   * - ${constraint}`);
          }
        }
        lines.push('   */');
      }
    }

    // Determine the field type
    const baseType = mapSpecTypeToTypeScript(field.type);
    const fieldKey = `${modelName}.${field.name}`;
    const fieldType = brandedTypeMap.get(fieldKey) ?? baseType;

    lines.push(`  readonly ${field.name}: ${fieldType};`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Processes a field's constraints and generates branded types.
 *
 * @param modelName - The model name containing the field.
 * @param field - The field definition.
 * @param options - Generation options.
 * @returns Results including branded types and warnings.
 */
function processFieldConstraints(
  modelName: string,
  field: SpecField,
  options: TypeGeneratorOptions
): {
  brandedTypes: BrandedTypeResult[];
  fieldType: string | null;
  warnings: ConstraintWarning[];
} {
  const brandedTypes: BrandedTypeResult[] = [];
  const warnings: ConstraintWarning[] = [];
  let fieldType: string | null = null;

  if (field.constraints === undefined || field.constraints.length === 0) {
    return { brandedTypes, fieldType, warnings };
  }

  const baseType = mapSpecTypeToTypeScript(field.type);

  for (const constraint of field.constraints) {
    const parsed = parseConstraint(constraint);

    if (parsed.type === 'unsupported') {
      // Generate warning for unsupported constraint
      if (options.emitWarnings !== false) {
        warnings.push({
          location: `${modelName}.${field.name}`,
          constraint: parsed.original,
          reason: 'Constraint type not supported for branded type generation',
        });
      }
      continue;
    }

    // Skip constraints that don't generate branded types
    if (parsed.type === 'unique' || parsed.type === 'required') {
      continue;
    }

    // Generate the branded type
    const description = field.description ?? `${field.name} with ${parsed.type} constraint`;
    const brandedResult = generateBrandedTypeForConstraint(
      baseType,
      parsed.type,
      parsed.params,
      description,
      options,
      parsed._minStr,
      parsed._maxStr
    );

    if (brandedResult !== null) {
      brandedTypes.push(brandedResult);
      fieldType = brandedResult.typeName;
    }
  }

  return { brandedTypes, fieldType, warnings };
}

/**
 * Generates branded types from spec witnesses.
 *
 * @param witnesses - The spec witness definitions.
 * @param options - Generation options.
 * @returns Array of branded type results.
 */
function generateWitnessBrandedTypes(
  witnesses: Record<string, SpecWitness>,
  options: TypeGeneratorOptions
): BrandedTypeResult[] {
  const results: BrandedTypeResult[] = [];

  for (const [_witnessKey, witness] of Object.entries(witnesses)) {
    // Get base type
    const baseType = witness.base_type ?? 'unknown';

    // Build type parameters
    const typeParameters: WitnessTypeParameter[] = [];
    if (witness.type_params !== undefined) {
      for (const param of witness.type_params) {
        if (param.name !== undefined) {
          const typeParam: WitnessTypeParameter = { name: param.name };
          const constraint = param.bounds?.join(' & ');
          if (constraint !== undefined) {
            typeParam.constraint = constraint;
          }
          typeParameters.push(typeParam);
        }
      }
    }

    // Combine invariants into a single expression
    const invariants = witness.invariants
      .map((inv) => inv.formal)
      .filter((formal): formal is string => formal !== undefined)
      .join(' && ');

    // Build description from invariants
    const descriptionParts = witness.invariants
      .map((inv) => inv.description)
      .filter((desc): desc is string => desc !== undefined);
    const description =
      witness.description ??
      (descriptionParts.length > 0 ? descriptionParts.join('; ') : witness.name);

    // Create witness definition
    const witnessDefinition: WitnessDefinition = {
      name: witness.name,
      baseType,
    };
    if (typeParameters.length > 0) {
      witnessDefinition.typeParameters = typeParameters;
    }
    if (invariants) {
      witnessDefinition.invariant = invariants;
    }

    // Generate branded type
    const typeDefinition = generateBrandedType(witnessDefinition);

    // Generate validation factory
    const validationFactory =
      options.generateValidationFactories !== false
        ? generateValidationFactory(witnessDefinition, {
            includeJsDoc: options.includeJsDoc !== false,
          })
        : '';

    // Generate JSDoc
    const jsDocLines = ['/**', ` * ${description}`];
    if (witness.invariants.length > 0) {
      jsDocLines.push(' *');
      jsDocLines.push(' * @invariants');
      for (const inv of witness.invariants) {
        if (inv.description !== undefined) {
          jsDocLines.push(` * - ${inv.id ?? 'invariant'}: ${inv.description}`);
        }
        if (inv.formal !== undefined) {
          jsDocLines.push(`   *   Formal: ${inv.formal}`);
        }
      }
    }
    jsDocLines.push(' */');
    const jsDoc = jsDocLines.join('\n');

    results.push({
      typeName: witness.name,
      typeDefinition,
      validationFactory,
      baseType,
      invariant: invariants,
      jsDoc,
    });
  }

  return results;
}

/**
 * Generates TypeScript type definitions from a specification.
 *
 * This function:
 * - Generates TypeScript interfaces/types for all spec data_models
 * - Generates enums for all spec enums
 * - Applies constraints as type witnesses where possible (branded types)
 * - Uses TypeScriptAdapter witness generation capabilities
 * - Types include JSDoc comments documenting constraints
 * - Falls back to doc-only with warning for unsupported constraint types
 *
 * @param spec - The parsed specification.
 * @param options - Generation options.
 * @returns The generated type definitions.
 *
 * @example
 * ```typescript
 * const spec = parseSpec(tomlContent);
 * const result = generateTypeDefinitions(spec, {
 *   generateValidationFactories: true,
 *   includeJsDoc: true,
 * });
 *
 * // Write the generated code
 * await fs.writeFile('types.ts', result.code);
 *
 * // Check for warnings about unsupported constraints
 * for (const warning of result.warnings) {
 *   console.warn(`Warning: ${warning.location} - ${warning.reason}`);
 * }
 * ```
 */
export function generateTypeDefinitions(
  spec: Spec,
  options: TypeGeneratorOptions = {}
): TypeGenerationResult {
  const allBrandedTypes: BrandedTypeResult[] = [];
  const allEnums: string[] = [];
  const allInterfaces: string[] = [];
  const allWarnings: ConstraintWarning[] = [];
  const brandedTypeMap = new Map<string, string>();
  const seenBrandedTypes = new Set<string>();

  const includeJsDoc = options.includeJsDoc !== false;

  // Process spec witnesses first (they define reusable branded types)
  if (spec.witnesses !== undefined) {
    const witnessBrandedTypes = generateWitnessBrandedTypes(spec.witnesses, options);
    for (const bt of witnessBrandedTypes) {
      if (!seenBrandedTypes.has(bt.typeName)) {
        seenBrandedTypes.add(bt.typeName);
        allBrandedTypes.push(bt);
      }
    }
  }

  // Generate enum definitions
  if (spec.enums !== undefined) {
    for (const [enumName, specEnum] of Object.entries(spec.enums)) {
      const enumDef = generateEnumDefinition(enumName, specEnum, includeJsDoc);
      allEnums.push(enumDef);
    }
  }

  // Process data models
  if (spec.data_models !== undefined) {
    // First pass: collect all branded types from field constraints
    for (const [modelName, model] of Object.entries(spec.data_models)) {
      for (const field of model.fields) {
        const { brandedTypes, fieldType, warnings } = processFieldConstraints(
          modelName,
          field,
          options
        );

        for (const bt of brandedTypes) {
          if (!seenBrandedTypes.has(bt.typeName)) {
            seenBrandedTypes.add(bt.typeName);
            allBrandedTypes.push(bt);
          }
        }

        if (fieldType !== null) {
          brandedTypeMap.set(`${modelName}.${field.name}`, fieldType);
        }

        allWarnings.push(...warnings);
      }
    }

    // Second pass: generate interface definitions
    for (const [modelName, model] of Object.entries(spec.data_models)) {
      const interfaceDef = generateInterfaceDefinition(
        modelName,
        model,
        brandedTypeMap,
        includeJsDoc
      );
      allInterfaces.push(interfaceDef);
    }
  }

  // Build the final code output
  const codeLines: string[] = [
    '/**',
    ' * Generated type definitions from spec.toml.',
    ' *',
    ' * This file was auto-generated by the Lattice phase type generator.',
    ' * Do not edit manually.',
    ' *',
    ' * @packageDocumentation',
    ' */',
    '',
  ];

  // Add branded types first (dependencies for interfaces)
  if (allBrandedTypes.length > 0) {
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Branded Types (Constraint Witnesses)');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const bt of allBrandedTypes) {
      if (includeJsDoc) {
        codeLines.push(bt.jsDoc);
      }
      codeLines.push(bt.typeDefinition);
      codeLines.push('');

      if (bt.validationFactory !== '') {
        codeLines.push(bt.validationFactory);
        codeLines.push('');
      }
    }
  }

  // Add enums
  if (allEnums.length > 0) {
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Enumerations');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const enumDef of allEnums) {
      codeLines.push(enumDef);
      codeLines.push('');
    }
  }

  // Add interfaces
  if (allInterfaces.length > 0) {
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('// Data Model Interfaces');
    codeLines.push(
      '// ============================================================================='
    );
    codeLines.push('');

    for (const interfaceDef of allInterfaces) {
      codeLines.push(interfaceDef);
      codeLines.push('');
    }
  }

  return {
    code: codeLines.join('\n'),
    brandedTypes: allBrandedTypes,
    enums: allEnums,
    interfaces: allInterfaces,
    warnings: allWarnings,
  };
}

/**
 * Generates type definitions for a specific domain.
 *
 * Filters the spec to only include data models and enums that belong
 * to the specified domain.
 *
 * @param spec - The parsed specification.
 * @param domainModels - Array of model names in this domain.
 * @param options - Generation options.
 * @returns The generated type definitions for the domain.
 */
export function generateDomainTypeDefinitions(
  spec: Spec,
  domainModels: readonly string[],
  options: TypeGeneratorOptions = {}
): TypeGenerationResult {
  // Create a filtered spec with only the domain's models
  const filteredDataModels: Record<string, SpecDataModel> = {};

  if (spec.data_models !== undefined) {
    for (const modelName of domainModels) {
      const model = spec.data_models[modelName];
      if (model !== undefined) {
        filteredDataModels[modelName] = model;
      }
    }
  }

  // Collect all type references from domain models to determine which enums and witnesses to include
  const referencedTypes = new Set<string>();
  for (const modelName of Object.keys(filteredDataModels)) {
    const model = filteredDataModels[modelName];
    if (model === undefined) {
      continue;
    }
    for (const field of model.fields) {
      // Add field type as a reference
      referencedTypes.add(field.type);
    }
  }

  // Filter enums - only include those referenced by domain models
  const filteredEnums: Record<string, SpecEnum> = {};
  if (spec.enums !== undefined) {
    for (const [enumName, enumDef] of Object.entries(spec.enums)) {
      if (referencedTypes.has(enumName)) {
        filteredEnums[enumName] = enumDef;
      }
    }
  }

  // Filter witnesses - only include those referenced by domain models
  const filteredWitnesses: Record<string, SpecWitness> = {};
  if (spec.witnesses !== undefined) {
    for (const [witnessKey, witnessDef] of Object.entries(spec.witnesses)) {
      if (referencedTypes.has(witnessDef.name)) {
        filteredWitnesses[witnessKey] = witnessDef;
      }
    }
  }

  // Create filtered spec
  const filteredSpec: Spec = { ...spec };
  if (Object.keys(filteredDataModels).length > 0) {
    filteredSpec.data_models = filteredDataModels;
  } else {
    delete filteredSpec.data_models;
  }
  if (Object.keys(filteredEnums).length > 0) {
    filteredSpec.enums = filteredEnums;
  } else {
    delete filteredSpec.enums;
  }
  if (Object.keys(filteredWitnesses).length > 0) {
    filteredSpec.witnesses = filteredWitnesses;
  } else {
    delete filteredSpec.witnesses;
  }

  return generateTypeDefinitions(filteredSpec, options);
}
