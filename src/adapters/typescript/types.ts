/**
 * Type extraction module for TypeScript AST analysis.
 *
 * Extracts type definitions referenced by function signatures for
 * inclusion in minimal injection context.
 *
 * @module adapters/typescript/types
 */

import { type Project, type Symbol as TsSymbol, type SourceFile, Node } from 'ts-morph';
import type { FunctionSignature } from './signature.js';

/**
 * The kind of type definition extracted.
 */
export type ExtractedTypeKind = 'interface' | 'type' | 'enum' | 'class';

/**
 * Represents a member of an extracted type (property, method, enum member).
 */
export interface TypeMember {
  /** The member name */
  name: string;
  /** The member type as a string (for properties/methods) or value (for enum members) */
  type: string;
  /** Whether the member is optional (for interface/class properties) */
  isOptional?: boolean;
}

/**
 * Represents a type parameter on an extracted type definition.
 */
export interface ExtractedTypeParameter {
  /** The type parameter name (e.g., "T", "K", "V") */
  name: string;
  /** The constraint type as a string, if any */
  constraint?: string;
  /** The default type as a string, if any */
  default?: string;
}

/**
 * Represents an extracted type definition from the project.
 */
export interface ExtractedType {
  /** The type name */
  name: string;
  /** The kind of type (interface, type alias, enum, class) */
  kind: ExtractedTypeKind;
  /** The full type definition as a string */
  definition: string;
  /** Type parameters if the type is generic */
  typeParameters: ExtractedTypeParameter[];
  /** Members of the type (properties, methods, enum members) */
  members: TypeMember[];
}

/**
 * Set of built-in TypeScript/JavaScript types that should not be extracted.
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
 * Checks if a source file is from node_modules.
 */
function isFromNodeModules(sourceFile: SourceFile | undefined): boolean {
  if (!sourceFile) {
    return true; // Treat undefined as external
  }
  const filePath = sourceFile.getFilePath();
  return filePath.includes('node_modules') || filePath.includes('/lib.');
}

/**
 * Checks if a type name is a built-in type.
 */
function isBuiltinType(typeName: string): boolean {
  // Strip generic parameters for comparison
  const baseName = typeName.split('<')[0]?.trim() ?? typeName;
  return BUILTIN_TYPES.has(baseName);
}

/**
 * Extracts type parameters from a type symbol.
 */
function extractTypeParameters(symbol: TsSymbol): ExtractedTypeParameter[] {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return [];
  }

  const decl = declarations[0];
  if (!decl) {
    return [];
  }

  // Check if this declaration has type parameters
  if (
    Node.isInterfaceDeclaration(decl) ||
    Node.isTypeAliasDeclaration(decl) ||
    Node.isClassDeclaration(decl)
  ) {
    return decl.getTypeParameters().map((tp) => {
      const constraint = tp.getConstraint();
      const defaultType = tp.getDefault();
      return {
        name: tp.getName(),
        ...(constraint && { constraint: constraint.getText() }),
        ...(defaultType && { default: defaultType.getText() }),
      };
    });
  }

  return [];
}

/**
 * Extracts members from a type symbol.
 */
function extractMembers(symbol: TsSymbol, kind: ExtractedTypeKind): TypeMember[] {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return [];
  }

  const decl = declarations[0];
  if (!decl) {
    return [];
  }

  const members: TypeMember[] = [];

  if (kind === 'enum' && Node.isEnumDeclaration(decl)) {
    for (const member of decl.getMembers()) {
      const value = member.getValue();
      members.push({
        name: member.getName(),
        type: value !== undefined ? String(value) : 'auto',
      });
    }
  } else if (kind === 'interface' && Node.isInterfaceDeclaration(decl)) {
    for (const prop of decl.getProperties()) {
      const typeNode = prop.getTypeNode();
      members.push({
        name: prop.getName(),
        type: typeNode ? typeNode.getText() : prop.getType().getText(),
        isOptional: prop.hasQuestionToken(),
      });
    }
    for (const method of decl.getMethods()) {
      const returnType = method.getReturnTypeNode();
      const params = method
        .getParameters()
        .map((p) => {
          const pType = p.getTypeNode();
          return `${p.getName()}: ${pType ? pType.getText() : p.getType().getText()}`;
        })
        .join(', ');
      members.push({
        name: method.getName(),
        type: `(${params}) => ${returnType ? returnType.getText() : method.getReturnType().getText()}`,
        isOptional: method.hasQuestionToken(),
      });
    }
  } else if (kind === 'class' && Node.isClassDeclaration(decl)) {
    for (const prop of decl.getProperties()) {
      const typeNode = prop.getTypeNode();
      members.push({
        name: prop.getName(),
        type: typeNode ? typeNode.getText() : prop.getType().getText(),
        isOptional: prop.hasQuestionToken(),
      });
    }
    for (const method of decl.getMethods()) {
      const returnType = method.getReturnTypeNode();
      const params = method
        .getParameters()
        .map((p) => {
          const pType = p.getTypeNode();
          return `${p.getName()}: ${pType ? pType.getText() : p.getType().getText()}`;
        })
        .join(', ');
      members.push({
        name: method.getName(),
        type: `(${params}) => ${returnType ? returnType.getText() : method.getReturnType().getText()}`,
      });
    }
  } else if (kind === 'type' && Node.isTypeAliasDeclaration(decl)) {
    // For type aliases, we extract members from the underlying type if it's an object type
    const typeNode = decl.getTypeNode();
    if (typeNode && Node.isTypeLiteral(typeNode)) {
      for (const prop of typeNode.getProperties()) {
        const propTypeNode = prop.getTypeNode();
        members.push({
          name: prop.getName(),
          type: propTypeNode ? propTypeNode.getText() : prop.getType().getText(),
          isOptional: prop.hasQuestionToken(),
        });
      }
    }
  }

  return members;
}

/**
 * Gets the definition string for a type symbol.
 */
function getTypeDefinition(symbol: TsSymbol, _kind: ExtractedTypeKind): string {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return '';
  }

  const decl = declarations[0];
  if (!decl) {
    return '';
  }

  // Return the full declaration text
  return decl.getText();
}

/**
 * Determines the kind of a type symbol.
 */
function getTypeKind(symbol: TsSymbol): ExtractedTypeKind | null {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return null;
  }

  const decl = declarations[0];
  if (!decl) {
    return null;
  }

  if (Node.isInterfaceDeclaration(decl)) {
    return 'interface';
  }
  if (Node.isTypeAliasDeclaration(decl)) {
    return 'type';
  }
  if (Node.isEnumDeclaration(decl)) {
    return 'enum';
  }
  if (Node.isClassDeclaration(decl)) {
    return 'class';
  }

  return null;
}

/**
 * Extracts all types referenced by a function signature.
 *
 * This function:
 * - Follows type references transitively (if Foo references Bar, both are included)
 * - Handles interfaces, type aliases, enums, and classes
 * - Handles generic type parameters and their constraints
 * - Handles union types, intersection types, mapped types, conditional types
 * - Excludes built-in types (string, number, Promise, etc.)
 * - Excludes types from node_modules (ambient/external types)
 *
 * @param signature - The function signature to extract types from.
 * @param project - The ts-morph Project containing the types.
 * @returns Array of ExtractedType objects for all referenced project types.
 *
 * @example
 * // For: function process(user: User): Result
 * // Extracts User and Result type definitions
 *
 * @example
 * // For: type Wrapper<T> = { value: T }
 * //      function unwrap<T>(w: Wrapper<T>): T
 * // Extracts Wrapper type definition
 *
 * @example
 * // For: function greet(name: string): Promise<void>
 * // Returns empty array (string and Promise are built-in)
 */
export function extractReferencedTypes(
  signature: FunctionSignature,
  project: Project
): ExtractedType[] {
  const collectedSymbols = new Set<TsSymbol>();
  const visitedNames = new Set<string>();

  // Collect types from parameters
  for (const param of signature.parameters) {
    collectSymbolsFromTypeName(param.type, project, collectedSymbols, visitedNames);
  }

  // Collect types from return type
  collectSymbolsFromTypeName(signature.returnType, project, collectedSymbols, visitedNames);

  // Collect types from type parameter constraints
  for (const typeParam of signature.typeParameters) {
    if (typeParam.constraint !== undefined && typeParam.constraint !== '') {
      collectSymbolsFromTypeName(typeParam.constraint, project, collectedSymbols, visitedNames);
    }
    if (typeParam.default !== undefined && typeParam.default !== '') {
      collectSymbolsFromTypeName(typeParam.default, project, collectedSymbols, visitedNames);
    }
  }

  // Convert collected symbols to ExtractedType objects
  const extractedTypes: ExtractedType[] = [];
  for (const symbol of collectedSymbols) {
    const kind = getTypeKind(symbol);
    if (kind === null) {
      continue;
    }

    extractedTypes.push({
      name: symbol.getName(),
      kind,
      definition: getTypeDefinition(symbol, kind),
      typeParameters: extractTypeParameters(symbol),
      members: extractMembers(symbol, kind),
    });
  }

  // Sort by name for consistent output
  return extractedTypes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collects all type symbols referenced by a type name string.
 * Directly searches for declarations instead of going through the type system.
 */
function collectSymbolsFromTypeName(
  typeName: string,
  project: Project,
  collected: Set<TsSymbol>,
  visitedNames: Set<string>
): void {
  // Remove leading/trailing whitespace and parentheses
  let cleaned = typeName.trim();
  while (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Prevent infinite recursion on the same type name
  if (visitedNames.has(cleaned)) {
    return;
  }
  visitedNames.add(cleaned);

  // Handle union types (A | B) - split at top level only
  const unionParts = splitTypeAtTopLevel(cleaned, '|');
  if (unionParts.length > 1) {
    for (const part of unionParts) {
      collectSymbolsFromTypeName(part.trim(), project, collected, visitedNames);
    }
    return;
  }

  // Handle intersection types (A & B) - split at top level only
  const intersectionParts = splitTypeAtTopLevel(cleaned, '&');
  if (intersectionParts.length > 1) {
    for (const part of intersectionParts) {
      collectSymbolsFromTypeName(part.trim(), project, collected, visitedNames);
    }
    return;
  }

  // Handle array types (Type[])
  if (cleaned.endsWith('[]')) {
    collectSymbolsFromTypeName(cleaned.slice(0, -2), project, collected, visitedNames);
    return;
  }

  // Strip generic parameters for base name lookup
  const baseName = cleaned.split('<')[0]?.trim() ?? cleaned;

  // For generic types, also search the type arguments
  if (cleaned.includes('<')) {
    const genericMatch = /<(.+)>$/.exec(cleaned);
    const typeArgContent = genericMatch?.[1];
    if (typeArgContent !== undefined && typeArgContent !== '') {
      // Parse the type arguments
      const args = parseTypeArguments(typeArgContent);
      // Find types for each argument
      for (const arg of args) {
        collectSymbolsFromTypeName(arg.trim(), project, collected, visitedNames);
      }
    }
  }

  // Skip built-in types for the base name itself
  if (isBuiltinType(baseName)) {
    return;
  }

  // Search through all source files for the type declaration
  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules
    if (isFromNodeModules(sourceFile)) {
      continue;
    }

    // Check interfaces
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.getName() === baseName) {
        const symbol = iface.getSymbol();
        if (symbol) {
          collected.add(symbol);
          // Follow transitive references from interface members
          for (const prop of iface.getProperties()) {
            const propTypeNode = prop.getTypeNode();
            if (propTypeNode) {
              collectSymbolsFromTypeName(propTypeNode.getText(), project, collected, visitedNames);
            }
          }
          // Extended interfaces
          for (const ext of iface.getExtends()) {
            collectSymbolsFromTypeName(ext.getText(), project, collected, visitedNames);
          }
        }
        return;
      }
    }

    // Check type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (typeAlias.getName() === baseName) {
        const symbol = typeAlias.getSymbol();
        if (symbol) {
          collected.add(symbol);
          // Follow transitive references from the type alias body
          const typeNode = typeAlias.getTypeNode();
          if (typeNode) {
            // If it's a type literal, extract types from its members
            if (Node.isTypeLiteral(typeNode)) {
              for (const prop of typeNode.getProperties()) {
                const propTypeNode = prop.getTypeNode();
                if (propTypeNode) {
                  collectSymbolsFromTypeName(
                    propTypeNode.getText(),
                    project,
                    collected,
                    visitedNames
                  );
                }
              }
            } else {
              // For other types (unions, intersections, named types, etc.)
              collectSymbolsFromTypeName(typeNode.getText(), project, collected, visitedNames);
            }
          }
        }
        return;
      }
    }

    // Check enums
    for (const enumDecl of sourceFile.getEnums()) {
      if (enumDecl.getName() === baseName) {
        const symbol = enumDecl.getSymbol();
        if (symbol) {
          collected.add(symbol);
        }
        return;
      }
    }

    // Check classes
    for (const classDecl of sourceFile.getClasses()) {
      if (classDecl.getName() === baseName) {
        const symbol = classDecl.getSymbol();
        if (symbol) {
          collected.add(symbol);
          // Follow transitive references from class members
          for (const prop of classDecl.getProperties()) {
            const propTypeNode = prop.getTypeNode();
            if (propTypeNode) {
              collectSymbolsFromTypeName(propTypeNode.getText(), project, collected, visitedNames);
            }
          }
          // Extended class
          const ext = classDecl.getExtends();
          if (ext) {
            collectSymbolsFromTypeName(ext.getText(), project, collected, visitedNames);
          }
          // Implemented interfaces
          for (const impl of classDecl.getImplements()) {
            collectSymbolsFromTypeName(impl.getText(), project, collected, visitedNames);
          }
        }
        return;
      }
    }
  }
}

/**
 * Splits a type string at a specific operator at the top level only.
 * Respects nesting from <>, (), {}, [].
 */
function splitTypeAtTopLevel(typeName: string, operator: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of typeName) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === operator && depth === 0) {
      const trimmed = current.trim();
      if (trimmed !== '') {
        result.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed !== '') {
    result.push(trimmed);
  }

  return result;
}

/**
 * Parses type arguments from a generic type string.
 * Handles nested generics by tracking angle bracket depth.
 */
function parseTypeArguments(typeArgs: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of typeArgs) {
    if (char === '<') {
      depth++;
      current += char;
    } else if (char === '>') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}
