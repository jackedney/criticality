/**
 * Context extraction module for Ralph Loop injection.
 *
 * Extracts minimal context for each function:
 * - Function signature from AST
 * - Micro-contracts from JSDoc
 * - Required type definitions (parameters, return type, referenced types)
 * - Witness definitions for witnessed types
 * - Context size tracking for model routing decisions
 * - Circular type reference detection and flattening
 *
 * Example: withdraw function -> extracts Account, PositiveDecimal,
 * NonNegativeDecimal, InsufficientFunds types
 *
 * @packageDocumentation
 */

import {
  Project,
  type SourceFile,
  type ArrowFunction,
  type FunctionExpression,
  type TypeAliasDeclaration,
  type InterfaceDeclaration,
  type EnumDeclaration,
  type ClassDeclaration,
  SyntaxKind,
} from 'ts-morph';
import type { TodoFunction } from '../adapters/typescript/ast.js';
import { parseContracts, serializeContractForPrompt } from '../adapters/typescript/contracts.js';
import type { MicroContract } from '../adapters/typescript/assertions.js';
import {
  extractSignature,
  calculateSignatureComplexity,
  type SignatureNode,
  type FunctionSignature,
} from '../adapters/typescript/signature.js';

/**
 * Represents extracted context for a function.
 *
 * Contains all information needed for LLM prompts:
 * - Signature, contracts, types, witnesses
 * - Size tracking for model routing
 */
export interface ExtractedContext {
  /** The function signature object with detailed info. */
  readonly signature: FunctionSignature;
  /** The function signature as a formatted string. */
  readonly signatureText: string;
  /** The function's micro-contracts from JSDoc. */
  readonly contracts: readonly MicroContract[];
  /** Required type definitions that the function depends on. */
  readonly requiredTypes: readonly ExtractedTypeDefinition[];
  /** Witness type definitions used by the function. */
  readonly witnessDefinitions: readonly ExtractedTypeDefinition[];
  /** The file path containing the function. */
  readonly filePath: string;
  /** The function name. */
  readonly functionName: string;
  /** Context size metrics for model routing. */
  readonly sizeMetrics: ContextSizeMetrics;
  /** Whether circular references were detected and flattened. */
  readonly hadCircularReferences: boolean;
  /** Names of types that were involved in circular references. */
  readonly circularTypeNames: readonly string[];
}

/**
 * Represents an extracted type definition.
 */
export interface ExtractedTypeDefinition {
  /** The type name. */
  readonly name: string;
  /** The kind of type (type, interface, enum, class). */
  readonly kind: 'type' | 'interface' | 'enum' | 'class';
  /** The full type definition as a string. */
  readonly definition: string;
  /** The source file path where this type is defined. */
  readonly sourcePath: string;
  /** Whether this is a witness (branded) type. */
  readonly isWitness: boolean;
  /** Types that this type references (for dependency tracking). */
  readonly referencedTypes: readonly string[];
}

/**
 * Context size metrics for model routing decisions.
 *
 * Used to determine which model should handle the implementation
 * based on context complexity.
 */
export interface ContextSizeMetrics {
  /** Total characters in the serialized context. */
  readonly totalCharacters: number;
  /** Estimated token count (chars / 4 approximation). */
  readonly estimatedTokens: number;
  /** Number of type definitions included. */
  readonly typeCount: number;
  /** Number of witness definitions included. */
  readonly witnessCount: number;
  /** Number of contracts to satisfy. */
  readonly contractCount: number;
  /** Signature complexity score. */
  readonly signatureComplexity: number;
  /** Overall complexity score for routing. */
  readonly complexityScore: number;
}

/**
 * Options for context extraction.
 */
export interface ContextExtractionOptions {
  /** Maximum depth for transitive type extraction. Default: 5. */
  readonly maxTypeDepth?: number;
  /** Maximum total types to extract (prevents explosion). Default: 50. */
  readonly maxTypes?: number;
}

/**
 * Set of built-in TypeScript/JavaScript types to exclude.
 */
const BUILTIN_TYPES = new Set([
  // Primitives
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'undefined',
  'null',
  'void',
  'never',
  'unknown',
  'any',
  'object',
  // Built-in objects
  'Object',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Function',
  'Array',
  'Date',
  'RegExp',
  'Error',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
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
  'JSON',
  'Math',
  'Proxy',
  'Reflect',
  'Intl',
  // Utility types
  'Partial',
  'Required',
  'Readonly',
  'Record',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'Parameters',
  'ConstructorParameters',
  'ReturnType',
  'InstanceType',
  'ThisParameterType',
  'OmitThisParameter',
  'ThisType',
  'Uppercase',
  'Lowercase',
  'Capitalize',
  'Uncapitalize',
  'Awaited',
  'NoInfer',
  // Iterators/Generators
  'Iterator',
  'Iterable',
  'IterableIterator',
  'Generator',
  'GeneratorFunction',
  'AsyncIterator',
  'AsyncIterable',
  'AsyncIterableIterator',
  'AsyncGenerator',
  'AsyncGeneratorFunction',
]);

/**
 * Checks if a type name is a built-in type.
 */
function isBuiltinType(typeName: string): boolean {
  const baseName = typeName.split('<')[0]?.trim() ?? typeName;
  return BUILTIN_TYPES.has(baseName);
}

/**
 * Internal state for type extraction with cycle detection.
 */
interface ExtractionState {
  /** Types that have been fully extracted. */
  readonly extracted: Map<string, ExtractedTypeDefinition>;
  /** Types currently being processed (for cycle detection). */
  readonly visiting: Set<string>;
  /** Types that were found to be in cycles. */
  readonly cycleParticipants: Set<string>;
  /** Current depth of extraction. */
  depth: number;
  /** Options for extraction. */
  readonly options: Required<ContextExtractionOptions>;
}

/**
 * Finds a function node by name in a source file.
 */
function findFunctionNode(sourceFile: SourceFile, name: string): SignatureNode | undefined {
  // Check top-level function declarations
  for (const func of sourceFile.getFunctions()) {
    if (func.getName() === name) {
      return func;
    }
  }

  // Check class methods
  for (const classDecl of sourceFile.getClasses()) {
    for (const method of classDecl.getMethods()) {
      if (method.getName() === name) {
        return method;
      }
    }
  }

  // Check arrow functions and function expressions in variable declarations
  for (const statement of sourceFile.getStatements()) {
    if (statement.getKind() === SyntaxKind.VariableStatement) {
      const varStatement = statement.asKind(SyntaxKind.VariableStatement);
      if (varStatement !== undefined) {
        for (const decl of varStatement.getDeclarationList().getDeclarations()) {
          if (decl.getName() === name) {
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
 * Extracts type names from a type string.
 *
 * Handles:
 * - Simple types: Foo
 * - Generic types: Foo<Bar, Baz>
 * - Union types: Foo | Bar
 * - Intersection types: Foo & Bar
 * - Array types: Foo[]
 * - Nested types: Map<Foo, Bar<Baz>>
 */
function extractTypeNamesFromString(typeStr: string): Set<string> {
  const names = new Set<string>();

  // Pattern to match type identifiers (capitalized names)
  const typePattern = /\b([A-Z][a-zA-Z0-9_]*)\b/g;
  let match;

  while ((match = typePattern.exec(typeStr)) !== null) {
    const name = match[1];
    if (name !== undefined && !isBuiltinType(name)) {
      names.add(name);
    }
  }

  return names;
}

/**
 * Extracts type names from a function signature.
 */
function extractTypeNamesFromSignature(signature: FunctionSignature): Set<string> {
  const names = new Set<string>();

  // From parameters
  for (const param of signature.parameters) {
    for (const name of extractTypeNamesFromString(param.type)) {
      names.add(name);
    }
  }

  // From return type
  for (const name of extractTypeNamesFromString(signature.returnType)) {
    names.add(name);
  }

  // From type parameters constraints
  for (const tp of signature.typeParameters) {
    if (tp.constraint !== undefined) {
      for (const name of extractTypeNamesFromString(tp.constraint)) {
        names.add(name);
      }
    }
    if (tp.default !== undefined) {
      for (const name of extractTypeNamesFromString(tp.default)) {
        names.add(name);
      }
    }
  }

  return names;
}

/**
 * Checks if a type definition is a witness (branded) type.
 */
function isWitnessType(text: string): boolean {
  return text.includes('__brand');
}

/**
 * Extracts referenced types from a type alias.
 */
function extractReferencedFromTypeAlias(typeAlias: TypeAliasDeclaration): Set<string> {
  const typeNode = typeAlias.getTypeNode();
  if (typeNode === undefined) {
    return new Set();
  }
  return extractTypeNamesFromString(typeNode.getText());
}

/**
 * Extracts referenced types from an interface.
 */
function extractReferencedFromInterface(iface: InterfaceDeclaration): Set<string> {
  const names = new Set<string>();

  // From extends
  for (const ext of iface.getExtends()) {
    for (const name of extractTypeNamesFromString(ext.getText())) {
      names.add(name);
    }
  }

  // From properties
  for (const prop of iface.getProperties()) {
    const typeNode = prop.getTypeNode();
    if (typeNode !== undefined) {
      for (const name of extractTypeNamesFromString(typeNode.getText())) {
        names.add(name);
      }
    }
  }

  // From methods
  for (const method of iface.getMethods()) {
    const returnType = method.getReturnTypeNode();
    if (returnType !== undefined) {
      for (const name of extractTypeNamesFromString(returnType.getText())) {
        names.add(name);
      }
    }
    for (const param of method.getParameters()) {
      const paramType = param.getTypeNode();
      if (paramType !== undefined) {
        for (const name of extractTypeNamesFromString(paramType.getText())) {
          names.add(name);
        }
      }
    }
  }

  return names;
}

/**
 * Extracts referenced types from a class.
 */
function extractReferencedFromClass(classDecl: ClassDeclaration): Set<string> {
  const names = new Set<string>();

  // From extends
  const ext = classDecl.getExtends();
  if (ext !== undefined) {
    for (const name of extractTypeNamesFromString(ext.getText())) {
      names.add(name);
    }
  }

  // From implements
  for (const impl of classDecl.getImplements()) {
    for (const name of extractTypeNamesFromString(impl.getText())) {
      names.add(name);
    }
  }

  // From properties
  for (const prop of classDecl.getProperties()) {
    const typeNode = prop.getTypeNode();
    if (typeNode !== undefined) {
      for (const name of extractTypeNamesFromString(typeNode.getText())) {
        names.add(name);
      }
    }
  }

  return names;
}

/**
 * Finds a type declaration by name across the entire project.
 */
function findTypeDeclaration(
  project: Project,
  typeName: string
):
  | { kind: 'type'; decl: TypeAliasDeclaration; sourceFile: SourceFile }
  | { kind: 'interface'; decl: InterfaceDeclaration; sourceFile: SourceFile }
  | { kind: 'enum'; decl: EnumDeclaration; sourceFile: SourceFile }
  | { kind: 'class'; decl: ClassDeclaration; sourceFile: SourceFile }
  | undefined {
  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules and declaration files
    const filePath = sourceFile.getFilePath();
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue;
    }

    // Check type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (typeAlias.getName() === typeName) {
        return { kind: 'type', decl: typeAlias, sourceFile };
      }
    }

    // Check interfaces
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.getName() === typeName) {
        return { kind: 'interface', decl: iface, sourceFile };
      }
    }

    // Check enums
    for (const enumDecl of sourceFile.getEnums()) {
      if (enumDecl.getName() === typeName) {
        return { kind: 'enum', decl: enumDecl, sourceFile };
      }
    }

    // Check classes
    for (const classDecl of sourceFile.getClasses()) {
      if (classDecl.getName() === typeName) {
        return { kind: 'class', decl: classDecl, sourceFile };
      }
    }
  }

  return undefined;
}

/**
 * Extracts a type definition and its transitive dependencies.
 *
 * @param project - The ts-morph Project.
 * @param typeName - The type name to extract.
 * @param state - Current extraction state (for cycle detection).
 */
function extractTypeWithDependencies(
  project: Project,
  typeName: string,
  state: ExtractionState
): void {
  // Skip if already extracted
  if (state.extracted.has(typeName)) {
    return;
  }

  // Skip built-in types
  if (isBuiltinType(typeName)) {
    return;
  }

  // Check for max types limit
  if (state.extracted.size >= state.options.maxTypes) {
    return;
  }

  // Check depth limit
  if (state.depth > state.options.maxTypeDepth) {
    return;
  }

  // Check for cycle
  if (state.visiting.has(typeName)) {
    state.cycleParticipants.add(typeName);
    return;
  }

  // Find the type declaration
  const found = findTypeDeclaration(project, typeName);
  if (found === undefined) {
    return;
  }

  // Mark as visiting
  state.visiting.add(typeName);
  state.depth++;

  // Extract referenced types based on kind
  let referencedTypes: Set<string>;
  let definition: string;
  let isWitness = false;

  switch (found.kind) {
    case 'type': {
      definition = found.decl.getText();
      isWitness = isWitnessType(definition);
      referencedTypes = extractReferencedFromTypeAlias(found.decl);
      break;
    }
    case 'interface': {
      definition = found.decl.getText();
      referencedTypes = extractReferencedFromInterface(found.decl);
      break;
    }
    case 'enum': {
      definition = found.decl.getText();
      referencedTypes = new Set(); // Enums don't reference other types
      break;
    }
    case 'class': {
      definition = found.decl.getText();
      referencedTypes = extractReferencedFromClass(found.decl);
      break;
    }
  }

  // Check for self-reference (circular reference to itself)
  if (referencedTypes.has(typeName)) {
    state.cycleParticipants.add(typeName);
    referencedTypes.delete(typeName);
  }

  // Recursively extract referenced types first (if not in a cycle)
  for (const refTypeName of referencedTypes) {
    extractTypeWithDependencies(project, refTypeName, state);
  }

  // Check max types limit again after processing dependencies
  // (we may have hit the limit while processing transitive dependencies)
  if (state.extracted.size >= state.options.maxTypes) {
    state.visiting.delete(typeName);
    state.depth--;
    return;
  }

  // Now add this type
  const extractedType: ExtractedTypeDefinition = {
    name: typeName,
    kind: found.kind,
    definition,
    sourcePath: found.sourceFile.getFilePath(),
    isWitness,
    referencedTypes: [...referencedTypes],
  };

  state.extracted.set(typeName, extractedType);

  // Unmark as visiting
  state.visiting.delete(typeName);
  state.depth--;
}

/**
 * Formats a function signature as a string.
 */
function formatSignatureAsString(signature: FunctionSignature): string {
  const parts: string[] = [];

  // Handle async/generator
  if (signature.isAsync) {
    parts.push('async ');
  }
  parts.push('function ');
  if (signature.isGenerator) {
    parts.push('* ');
  }

  // Name
  parts.push(signature.name);

  // Type parameters
  if (signature.typeParameters.length > 0) {
    const tpStrs = signature.typeParameters.map((tp) => {
      let str = tp.name;
      if (tp.constraint !== undefined) {
        str += ` extends ${tp.constraint}`;
      }
      if (tp.default !== undefined) {
        str += ` = ${tp.default}`;
      }
      return str;
    });
    parts.push(`<${tpStrs.join(', ')}>`);
  }

  // Parameters
  const paramStrs = signature.parameters.map((p) => {
    let str = '';
    if (p.isRest) {
      str += '...';
    }
    str += p.name;
    if (p.isOptional && p.defaultValue === undefined) {
      str += '?';
    }
    str += `: ${p.type}`;
    if (p.defaultValue !== undefined) {
      str += ` = ${p.defaultValue}`;
    }
    return str;
  });
  parts.push(`(${paramStrs.join(', ')})`);

  // Return type
  parts.push(`: ${signature.returnType}`);

  return parts.join('');
}

/**
 * Calculates context size metrics.
 */
function calculateSizeMetrics(
  signatureText: string,
  signature: FunctionSignature,
  contracts: readonly MicroContract[],
  requiredTypes: readonly ExtractedTypeDefinition[],
  witnessDefinitions: readonly ExtractedTypeDefinition[]
): ContextSizeMetrics {
  // Calculate total characters
  let totalChars = signatureText.length;

  for (const contract of contracts) {
    totalChars += serializeContractForPrompt(contract).length;
  }

  for (const typeDef of requiredTypes) {
    totalChars += typeDef.definition.length;
  }

  for (const witnessDef of witnessDefinitions) {
    totalChars += witnessDef.definition.length;
  }

  // Calculate complexity score
  const signatureComplexity = calculateSignatureComplexity(signature);

  // Count individual contract conditions, not just the number of MicroContract objects
  let contractConditionCount = 0;
  for (const contract of contracts) {
    contractConditionCount +=
      contract.requires.length + contract.ensures.length + contract.invariants.length;
  }

  // Overall complexity: weighted sum of factors
  const complexityScore =
    signatureComplexity * 2 +
    contractConditionCount * 1.5 +
    requiredTypes.length * 1 +
    witnessDefinitions.length * 1.5 +
    totalChars / 500;

  return {
    totalCharacters: totalChars,
    estimatedTokens: Math.ceil(totalChars / 4),
    typeCount: requiredTypes.length,
    witnessCount: witnessDefinitions.length,
    contractCount: contractConditionCount,
    signatureComplexity,
    complexityScore,
  };
}

/**
 * Extracts minimal context for a function.
 *
 * This is the main entry point for context extraction. It:
 * 1. Extracts the function signature from AST
 * 2. Extracts micro-contracts from JSDoc
 * 3. Extracts required type definitions (parameters, return type, referenced types)
 * 4. Extracts witness definitions for witnessed types
 * 5. Tracks context size for model routing decisions
 * 6. Detects and flattens circular type references
 *
 * @param project - The ts-morph Project.
 * @param todoFunction - The TODO function to extract context for.
 * @param options - Extraction options.
 * @returns The extracted context with all relevant information.
 *
 * @example
 * ```typescript
 * // For: function withdraw(account: Account, amount: PositiveDecimal): Account | InsufficientFunds
 * const context = extractContext(project, todoFunction);
 *
 * // Extracts: Account, PositiveDecimal, InsufficientFunds types
 * // Plus any types they reference transitively
 * ```
 */
export function extractContext(
  project: Project,
  todoFunction: TodoFunction,
  options: ContextExtractionOptions = {}
): ExtractedContext {
  const resolvedOptions: Required<ContextExtractionOptions> = {
    maxTypeDepth: options.maxTypeDepth ?? 5,
    maxTypes: options.maxTypes ?? 50,
  };

  // Get source file
  const sourceFile = project.getSourceFile(todoFunction.filePath);
  if (sourceFile === undefined) {
    throw new Error(`Source file not found: ${todoFunction.filePath}`);
  }

  // Find function node and extract signature
  const funcNode = findFunctionNode(sourceFile, todoFunction.name);
  let signature: FunctionSignature;

  if (funcNode !== undefined) {
    signature = extractSignature(funcNode);
  } else {
    // Fallback: parse from signature string
    signature = {
      name: todoFunction.name,
      parameters: [],
      returnType: 'unknown',
      typeParameters: [],
      isAsync: todoFunction.signature.startsWith('async '),
      isGenerator: todoFunction.signature.includes('function*'),
    };
  }

  const signatureText = formatSignatureAsString(signature);

  // Extract contracts
  const allContracts = parseContracts(project, todoFunction.filePath);
  const contracts = allContracts.filter((c) => c.functionName === todoFunction.name);

  // Extract type names from signature
  const typeNames = extractTypeNamesFromSignature(signature);

  // Initialize extraction state
  const state: ExtractionState = {
    extracted: new Map(),
    visiting: new Set(),
    cycleParticipants: new Set(),
    depth: 0,
    options: resolvedOptions,
  };

  // Extract all types with transitive dependencies
  for (const typeName of typeNames) {
    extractTypeWithDependencies(project, typeName, state);
  }

  // Separate witnesses from regular types
  const requiredTypes: ExtractedTypeDefinition[] = [];
  const witnessDefinitions: ExtractedTypeDefinition[] = [];

  for (const typeDef of state.extracted.values()) {
    if (typeDef.isWitness) {
      witnessDefinitions.push(typeDef);
    } else {
      requiredTypes.push(typeDef);
    }
  }

  // Sort by name for consistent output
  requiredTypes.sort((a, b) => a.name.localeCompare(b.name));
  witnessDefinitions.sort((a, b) => a.name.localeCompare(b.name));

  // Calculate size metrics
  const sizeMetrics = calculateSizeMetrics(
    signatureText,
    signature,
    contracts,
    requiredTypes,
    witnessDefinitions
  );

  return {
    signature,
    signatureText,
    contracts,
    requiredTypes,
    witnessDefinitions,
    filePath: todoFunction.filePath,
    functionName: todoFunction.name,
    sizeMetrics,
    hadCircularReferences: state.cycleParticipants.size > 0,
    circularTypeNames: [...state.cycleParticipants].sort(),
  };
}

/**
 * Serializes extracted context to a prompt-ready format.
 *
 * @param context - The extracted context.
 * @returns A formatted string for LLM prompts.
 */
export function serializeContextForPrompt(context: ExtractedContext): string {
  const lines: string[] = [];

  lines.push('FUNCTION SIGNATURE:');
  lines.push('```typescript');
  lines.push(context.signatureText);
  lines.push('```');
  lines.push('');

  if (context.contracts.length > 0) {
    lines.push('CONTRACTS (must be satisfied):');
    for (const contract of context.contracts) {
      lines.push(serializeContractForPrompt(contract));
    }
    lines.push('');
  }

  if (context.requiredTypes.length > 0) {
    lines.push('REQUIRED TYPES:');
    lines.push('```typescript');
    for (const typeDef of context.requiredTypes) {
      lines.push(typeDef.definition);
    }
    lines.push('```');
    lines.push('');
  }

  if (context.witnessDefinitions.length > 0) {
    lines.push('WITNESS TYPES:');
    lines.push('```typescript');
    for (const witnessDef of context.witnessDefinitions) {
      lines.push(witnessDef.definition);
    }
    lines.push('```');
    lines.push('');
  }

  if (context.hadCircularReferences) {
    const circularNames = context.circularTypeNames.join(', ');
    lines.push(`Note: Circular type references detected in: ${circularNames}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Determines if the context should be handled by a larger model.
 *
 * Based on complexity score and size metrics, recommends whether
 * to use a more capable model for implementation.
 *
 * @param context - The extracted context.
 * @param threshold - Complexity threshold for escalation. Default: 15.
 * @returns True if a larger model is recommended.
 */
export function shouldEscalateToLargerModel(context: ExtractedContext, threshold = 15): boolean {
  const { sizeMetrics } = context;

  // Escalate if:
  // - Complexity score exceeds threshold
  // - Too many tokens (context might get truncated)
  // - Circular references (more complex to reason about)
  // - Many contracts to satisfy
  return (
    sizeMetrics.complexityScore > threshold ||
    sizeMetrics.estimatedTokens > 2000 ||
    context.hadCircularReferences ||
    sizeMetrics.contractCount > 5
  );
}

/**
 * Re-export for convenience.
 */
export type { FunctionSignature, MicroContract };
