/**
 * Function signature extraction module for TypeScript AST analysis.
 *
 * @module adapters/typescript/signature
 */

import {
  type FunctionDeclaration,
  type MethodDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  type ParameterDeclaration,
  type TypeParameterDeclaration,
  Node,
} from 'ts-morph';

/**
 * Represents a function parameter with its name and type information.
 */
export interface ParameterInfo {
  /** The parameter name */
  name: string;
  /** The type as a string (e.g., "number", "T[]", "Map<string, number>") */
  type: string;
  /** Whether the parameter is optional (has ? or default value) */
  isOptional: boolean;
  /** Whether the parameter is a rest parameter (...args) */
  isRest: boolean;
  /** The default value expression as a string, if any */
  defaultValue?: string;
}

/**
 * Represents a type parameter (generic) with its name and constraints.
 */
export interface TypeParameterInfo {
  /** The type parameter name (e.g., "T", "K", "V") */
  name: string;
  /** The constraint type as a string, if any (e.g., "extends string") */
  constraint?: string;
  /** The default type as a string, if any */
  default?: string;
}

/**
 * Represents a complete function signature with all its components.
 */
export interface FunctionSignature {
  /** The function name (or '<anonymous>' for unnamed functions) */
  name: string;
  /** The parameters with their types */
  parameters: ParameterInfo[];
  /** The return type as a string (e.g., "Promise<T>", "void") */
  returnType: string;
  /** The type parameters (generics) */
  typeParameters: TypeParameterInfo[];
  /** Whether the function is async */
  isAsync: boolean;
  /** Whether the function is a generator (function*) */
  isGenerator: boolean;
}

/**
 * Union type for all function-like declarations that can have signatures extracted.
 */
export type SignatureNode =
  | FunctionDeclaration
  | MethodDeclaration
  | ArrowFunction
  | FunctionExpression;

/**
 * Extracts parameter information from a parameter declaration.
 *
 * @param param - The parameter declaration node.
 * @returns ParameterInfo with all parameter details.
 */
function extractParameterInfo(param: ParameterDeclaration): ParameterInfo {
  const name = param.getName();
  const typeNode = param.getTypeNode();
  const type = typeNode ? typeNode.getText() : param.getType().getText();
  const isRest = param.isRestParameter();
  // Rest parameters are not truly "optional" in the traditional sense
  // They just capture remaining arguments (zero or more)
  const isOptional = !isRest && (param.isOptional() || param.hasInitializer());
  const initializer = param.getInitializer();
  const defaultValue = initializer ? initializer.getText() : undefined;

  return {
    name,
    type,
    isOptional,
    isRest,
    ...(defaultValue !== undefined && { defaultValue }),
  };
}

/**
 * Extracts type parameter information from a type parameter declaration.
 *
 * @param typeParam - The type parameter declaration node.
 * @returns TypeParameterInfo with name and constraints.
 */
function extractTypeParameterInfo(typeParam: TypeParameterDeclaration): TypeParameterInfo {
  const name = typeParam.getName();
  const constraintNode = typeParam.getConstraint();
  const constraint = constraintNode ? constraintNode.getText() : undefined;
  const defaultNode = typeParam.getDefault();
  const defaultType = defaultNode ? defaultNode.getText() : undefined;

  return {
    name,
    ...(constraint !== undefined && { constraint }),
    ...(defaultType !== undefined && { default: defaultType }),
  };
}

/**
 * Gets the name of a function-like node.
 *
 * @param node - The function-like node.
 * @returns The function name or '<anonymous>' if unnamed.
 */
function getSignatureName(node: SignatureNode): string {
  // FunctionDeclaration and MethodDeclaration have getName()
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    const name = node.getName();
    if (name !== undefined && name !== '') {
      return name;
    }
  }

  // For arrow functions and function expressions assigned to variables
  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }

  // For property assignments like { myFunc: () => {} }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getName();
  }

  // For shorthand property assignments like { myFunc }
  if (Node.isShorthandPropertyAssignment(parent)) {
    return parent.getName();
  }

  return '<anonymous>';
}

/**
 * Checks if a function node is async.
 *
 * @param node - The function-like node.
 * @returns True if the function has the async modifier.
 */
function isAsyncFunction(node: SignatureNode): boolean {
  // Arrow functions and function expressions can check getAsyncKeyword
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    return node.isAsync();
  }

  // FunctionDeclaration and MethodDeclaration use hasModifier
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    return node.isAsync();
  }

  return false;
}

/**
 * Checks if a function node is a generator.
 *
 * @param node - The function-like node.
 * @returns True if the function is a generator (has asterisk).
 */
function isGeneratorFunction(node: SignatureNode): boolean {
  // Arrow functions cannot be generators
  if (Node.isArrowFunction(node)) {
    return false;
  }

  // FunctionDeclaration, FunctionExpression, and MethodDeclaration can be generators
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node)
  ) {
    return node.isGenerator();
  }

  return false;
}

/**
 * Gets the return type of a function node.
 *
 * @param node - The function-like node.
 * @returns The return type as a string.
 */
function getReturnType(node: SignatureNode): string {
  const returnTypeNode = node.getReturnTypeNode();
  if (returnTypeNode !== undefined) {
    return returnTypeNode.getText();
  }

  // Infer from the type checker if no explicit return type
  const signature = node.getSignature();
  const returnType = signature.getReturnType();
  return returnType.getText();
}

/**
 * Extracts a complete function signature from a function-like node.
 *
 * Handles:
 * - Function declarations: `function foo<T>(x: T): T { ... }`
 * - Method declarations: `class C { method(x: number): void { ... } }`
 * - Arrow functions: `const fn = (x: T) => ...`
 * - Function expressions: `const fn = function(x: T) { ... }`
 *
 * @param node - The function-like node to extract signature from.
 * @returns A FunctionSignature object with all components.
 *
 * @example
 * // For: function foo<T>(x: T, y: number): Promise<T> { ... }
 * // Returns:
 * // {
 * //   name: 'foo',
 * //   parameters: [
 * //     { name: 'x', type: 'T', isOptional: false, isRest: false },
 * //     { name: 'y', type: 'number', isOptional: false, isRest: false }
 * //   ],
 * //   returnType: 'Promise<T>',
 * //   typeParameters: [{ name: 'T' }],
 * //   isAsync: false,
 * //   isGenerator: false
 * // }
 *
 * @example
 * // For: async function bar(): Promise<void> { ... }
 * // Returns: { ..., isAsync: true }
 *
 * @example
 * // For anonymous function: (x: number) => x + 1
 * // Returns: { name: '<anonymous>', ... }
 */
export function extractSignature(node: SignatureNode): FunctionSignature {
  const name = getSignatureName(node);
  const parameters = node.getParameters().map(extractParameterInfo);
  const returnType = getReturnType(node);
  const typeParameters = node.getTypeParameters().map(extractTypeParameterInfo);
  const isAsync = isAsyncFunction(node);
  const isGenerator = isGeneratorFunction(node);

  return {
    name,
    parameters,
    returnType,
    typeParameters,
    isAsync,
    isGenerator,
  };
}

/**
 * Extracts all overloaded signatures from a function declaration.
 *
 * In TypeScript, a function can have multiple overload signatures followed by
 * a single implementation signature. This function returns all overload signatures
 * (not including the implementation signature).
 *
 * @param func - The function declaration (must be the implementation, not an overload).
 * @returns Array of FunctionSignature objects for each overload.
 *          Returns empty array if no overloads exist.
 *
 * @example
 * // For:
 * // function parse(input: string): number;
 * // function parse(input: number): string;
 * // function parse(input: string | number): number | string { ... }
 * // Returns two signatures (not the implementation).
 */
export function extractOverloadSignatures(func: FunctionDeclaration): FunctionSignature[] {
  const overloads = func.getOverloads();

  if (overloads.length === 0) {
    return [];
  }

  return overloads.map((overload) => extractSignature(overload));
}

/**
 * Extracts all overloaded signatures from a method declaration.
 *
 * @param method - The method declaration (must be the implementation, not an overload).
 * @returns Array of FunctionSignature objects for each overload.
 *          Returns empty array if no overloads exist.
 */
export function extractMethodOverloadSignatures(method: MethodDeclaration): FunctionSignature[] {
  const overloads = method.getOverloads();

  if (overloads.length === 0) {
    return [];
  }

  return overloads.map((overload) => extractSignature(overload));
}
