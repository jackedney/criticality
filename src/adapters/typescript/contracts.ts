/**
 * JSDoc contract parser module for TypeScript.
 *
 * Parses micro-contracts from JSDoc comments to extract semantic constraints
 * for injection context.
 *
 * @module adapters/typescript/contracts
 */

import {
  type Project,
  type JSDocTag,
  type JSDocableNode,
  type FunctionDeclaration,
  type MethodDeclaration,
  Node,
  SyntaxKind,
} from 'ts-morph';
import { type MicroContract, type InlineAssertion, ContractParseError } from './assertions.js';

/**
 * Error thrown when a contract tag has malformed syntax.
 * Extends ContractParseError with line number information.
 */
export class ContractSyntaxError extends ContractParseError {
  constructor(
    message: string,
    expression: string,
    reason: string,
    public readonly lineNumber: number,
    public readonly tagName: string
  ) {
    super(message, expression, reason);
    this.name = 'ContractSyntaxError';
  }
}

/**
 * Valid purity classifications for functions.
 */
export type PurityLevel = 'pure' | 'reads' | 'writes' | 'io';

/**
 * Checks if a string is a valid purity level.
 *
 * @param value - The value to check.
 * @returns True if the value is a valid purity level.
 */
function isValidPurity(value: string): value is PurityLevel {
  return value === 'pure' || value === 'reads' || value === 'writes' || value === 'io';
}

/**
 * Set of recognized contract tag names.
 */
const CONTRACT_TAGS = new Set(['requires', 'ensures', 'invariant', 'complexity', 'purity']);

/**
 * Regular expression to match CLAIM_REF comments.
 * Format: CLAIM_REF: claim_id or CLAIM_REF:claim_id
 */
const CLAIM_REF_PATTERN = /CLAIM_REF:\s*(\S+)/g;

/**
 * Regular expression to match inline @invariant: comments with expression (single-line only).
 * Format: // @invariant: expression
 * Note: Must start with // (not /* or block comments)
 */
const INLINE_INVARIANT_PATTERN = /^[ \t]*\/\/\s*@invariant:\s*(.+)$/;

/**
 * Regular expression to detect @invariant: comment without expression (for error reporting).
 */
const INLINE_INVARIANT_EMPTY_PATTERN = /^[ \t]*\/\/\s*@invariant:\s*$/;

/**
 * Regular expression to match inline @assert: comments with expression (single-line only).
 * Format: // @assert: expression
 */
const INLINE_ASSERT_PATTERN = /^[ \t]*\/\/\s*@assert:\s*(.+)$/;

/**
 * Regular expression to detect @assert: comment without expression (for error reporting).
 */
const INLINE_ASSERT_EMPTY_PATTERN = /^[ \t]*\/\/\s*@assert:\s*$/;

/**
 * Regular expression to match inline CLAIM_REF comments (single-line only).
 * Format: // CLAIM_REF: claim_id
 */
const INLINE_CLAIM_REF_PATTERN = /^[ \t]*\/\/\s*CLAIM_REF:\s*(\S+)/;

/**
 * Extracts the text content from a JSDoc tag.
 *
 * Only extracts content up to the first newline (or end of tag),
 * as JSDoc tags typically have their value on the same line.
 *
 * @param tag - The JSDoc tag to extract from.
 * @returns The text content of the tag, or empty string if none.
 */
function getTagText(tag: JSDocTag): string {
  // getCommentText() returns the text after the tag name
  const commentText = tag.getCommentText();
  if (commentText !== undefined) {
    // Only take the first line - subsequent lines may be other content
    const firstLine = commentText.split('\n')[0] ?? '';
    return firstLine.trim();
  }
  return '';
}

/**
 * Extracts the tag name from a JSDoc tag.
 *
 * @param tag - The JSDoc tag.
 * @returns The tag name without the @ prefix.
 */
function getTagName(tag: JSDocTag): string {
  // getTagName() includes the @ symbol, we want just the name
  const fullName = tag.getTagName();
  return fullName.startsWith('@') ? fullName.slice(1) : fullName;
}

/**
 * Gets the line number of a JSDoc tag.
 *
 * @param tag - The JSDoc tag.
 * @returns The 1-indexed line number.
 */
function getTagLineNumber(tag: JSDocTag): number {
  return tag.getStartLineNumber();
}

/**
 * Validates that a contract expression is not empty.
 *
 * @param expression - The expression to validate.
 * @param tagName - The tag name for error messages.
 * @param lineNumber - The line number for error messages.
 * @throws ContractSyntaxError if the expression is empty.
 */
function validateNotEmpty(expression: string, tagName: string, lineNumber: number): void {
  if (expression.trim() === '') {
    throw new ContractSyntaxError(
      `@${tagName} without expression at line ${String(lineNumber)}`,
      '',
      `@${tagName} tag requires an expression`,
      lineNumber,
      tagName
    );
  }
}

/**
 * Parses a single JSDoc tag and adds its content to the contract.
 *
 * @param tag - The JSDoc tag to parse.
 * @param contract - The contract to add to.
 * @throws ContractSyntaxError if the tag has malformed syntax.
 */
function parseContractTag(
  tag: JSDocTag,
  contract: {
    requires: string[];
    ensures: string[];
    invariants: string[];
    complexity?: string;
    purity?: PurityLevel;
    claimRefs: string[];
  }
): void {
  const tagName = getTagName(tag);
  const tagText = getTagText(tag);
  const lineNumber = getTagLineNumber(tag);

  switch (tagName) {
    case 'requires':
      validateNotEmpty(tagText, 'requires', lineNumber);
      contract.requires.push(tagText);
      break;

    case 'ensures':
      validateNotEmpty(tagText, 'ensures', lineNumber);
      contract.ensures.push(tagText);
      break;

    case 'invariant':
      validateNotEmpty(tagText, 'invariant', lineNumber);
      contract.invariants.push(tagText);
      break;

    case 'complexity':
      validateNotEmpty(tagText, 'complexity', lineNumber);
      contract.complexity = tagText;
      break;

    case 'purity': {
      validateNotEmpty(tagText, 'purity', lineNumber);
      const normalizedPurity = tagText.toLowerCase().trim();
      if (!isValidPurity(normalizedPurity)) {
        throw new ContractSyntaxError(
          `Invalid @purity value "${tagText}" at line ${String(lineNumber)}. Must be one of: pure, reads, writes, io`,
          tagText,
          'invalid purity value',
          lineNumber,
          'purity'
        );
      }
      contract.purity = normalizedPurity;
      break;
    }

    // Unknown tags are ignored per acceptance criteria
    default:
      // Do nothing - unknown tags are not an error
      break;
  }
}

/**
 * Extracts CLAIM_REF comments from JSDoc text.
 *
 * @param text - The full JSDoc text including comments.
 * @returns Array of claim reference IDs.
 */
function extractClaimRefs(text: string): string[] {
  const claimRefs: string[] = [];
  let match;

  // Reset lastIndex for global regex
  CLAIM_REF_PATTERN.lastIndex = 0;

  while ((match = CLAIM_REF_PATTERN.exec(text)) !== null) {
    const claimId = match[1];
    if (claimId !== undefined && claimId !== '') {
      claimRefs.push(claimId);
    }
  }

  return claimRefs;
}

/**
 * Result of parsing inline assertions from a function body.
 */
interface InlineParseResult {
  /** Inline assertions found (both @invariant: and @assert:) */
  inlineAssertions: InlineAssertion[];
  /** Claim references found in inline comments */
  claimRefs: string[];
}

/**
 * Parses inline assertions from function body text.
 *
 * This function extracts:
 * - `// @invariant: expression` - Inline invariants
 * - `// @assert: expression` - Inline assertions
 * - `// CLAIM_REF: claim_id` - Inline claim references
 *
 * Note: Only single-line comments (`//`) are parsed. Block comments (`/* *\/`)
 * containing these patterns are ignored per the acceptance criteria.
 *
 * @param bodyText - The function body text.
 * @param startLine - The starting line number of the function body (1-indexed).
 * @returns Object containing inline assertions and claim refs.
 * @throws ContractSyntaxError if an inline assertion is malformed.
 */
function parseInlineAssertions(bodyText: string, startLine: number): InlineParseResult {
  const inlineAssertions: InlineAssertion[] = [];
  const claimRefs: string[] = [];

  const lines = bodyText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }

    const lineNumber = startLine + i;

    // Check for empty @invariant: (malformed - error case)
    if (INLINE_INVARIANT_EMPTY_PATTERN.test(line)) {
      throw new ContractSyntaxError(
        `@invariant: without expression at line ${String(lineNumber)}`,
        '',
        '@invariant: requires an expression',
        lineNumber,
        '@invariant:'
      );
    }

    // Check for empty @assert: (malformed - error case)
    if (INLINE_ASSERT_EMPTY_PATTERN.test(line)) {
      throw new ContractSyntaxError(
        `@assert: without expression at line ${String(lineNumber)}`,
        '',
        '@assert: requires an expression',
        lineNumber,
        '@assert:'
      );
    }

    // Check for inline @invariant: with expression
    const invariantMatch = INLINE_INVARIANT_PATTERN.exec(line);
    if (invariantMatch !== null) {
      const expression = invariantMatch[1]?.trim();
      if (expression !== undefined && expression !== '') {
        inlineAssertions.push({
          type: 'invariant',
          expression,
          lineNumber,
        });
      }
      continue;
    }

    // Check for inline @assert: with expression
    const assertMatch = INLINE_ASSERT_PATTERN.exec(line);
    if (assertMatch !== null) {
      const expression = assertMatch[1]?.trim();
      if (expression !== undefined && expression !== '') {
        inlineAssertions.push({
          type: 'assert',
          expression,
          lineNumber,
        });
      }
      continue;
    }

    // Check for inline CLAIM_REF:
    const claimRefMatch = INLINE_CLAIM_REF_PATTERN.exec(line);
    if (claimRefMatch !== null) {
      const claimId = claimRefMatch[1];
      if (claimId !== undefined && claimId !== '') {
        claimRefs.push(claimId);
      }
    }
  }

  return { inlineAssertions, claimRefs };
}

/**
 * Checks if a function body contains any inline assertion comments.
 *
 * This includes both valid patterns with expressions and empty patterns
 * (which will trigger errors during parsing).
 *
 * @param bodyText - The function body text.
 * @returns True if the body contains inline assertions or claim refs.
 */
function hasInlineAssertions(bodyText: string): boolean {
  const lines = bodyText.split('\n');

  for (const line of lines) {
    if (
      INLINE_INVARIANT_PATTERN.test(line) ||
      INLINE_INVARIANT_EMPTY_PATTERN.test(line) ||
      INLINE_ASSERT_PATTERN.test(line) ||
      INLINE_ASSERT_EMPTY_PATTERN.test(line) ||
      INLINE_CLAIM_REF_PATTERN.test(line)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Gets the function body text and start line from a function-like node.
 *
 * @param node - The function or method declaration.
 * @returns Object with body text and start line, or null if no body.
 */
function getFunctionBodyInfo(
  node: FunctionDeclaration | MethodDeclaration
): { text: string; startLine: number } | null {
  const body = node.getBody();
  if (!body) {
    return null;
  }

  return {
    text: body.getText(),
    startLine: body.getStartLineNumber(),
  };
}

/**
 * Gets the name of a function-like node.
 *
 * @param node - The node to get the name from.
 * @returns The function name or '<anonymous>' if unnamed.
 */
function getFunctionName(node: FunctionDeclaration | MethodDeclaration): string {
  return node.getName() ?? '<anonymous>';
}

/**
 * Checks if a node has any contract-related JSDoc tags.
 *
 * @param node - The node to check.
 * @returns True if the node has contract tags.
 */
function hasContractTags(node: JSDocableNode): boolean {
  const jsDocs = node.getJsDocs();

  for (const jsDoc of jsDocs) {
    for (const tag of jsDoc.getTags()) {
      const tagName = getTagName(tag);
      if (CONTRACT_TAGS.has(tagName)) {
        return true;
      }
    }

    // Also check for CLAIM_REF in the JSDoc text
    const fullText = jsDoc.getText();
    if (CLAIM_REF_PATTERN.test(fullText)) {
      return true;
    }
    // Reset lastIndex after test
    CLAIM_REF_PATTERN.lastIndex = 0;
  }

  return false;
}

/**
 * Parses micro-contracts from JSDoc comments and inline comments in a TypeScript file.
 *
 * This function extracts semantic constraints from JSDoc tags:
 * - `@requires` - Preconditions that must hold before function execution
 * - `@ensures` - Postconditions that must hold after function execution
 * - `@invariant` - Invariants that must hold throughout stateful operations
 * - `@complexity` - Performance requirements (e.g., `O(n)`, `O(n log n)`)
 * - `@purity` - Side effect classification: `pure`, `reads`, `writes`, or `io`
 *
 * Additionally extracts inline assertions from function bodies (single-line comments only):
 * - `// @invariant: expression` - Inline invariants
 * - `// @assert: expression` - Inline assertions
 * - `// CLAIM_REF: claim_id` - Inline claim references for traceability
 *
 * Note: Block comments (`/* *\/`) containing these patterns are ignored.
 *
 * @param project - The ts-morph Project containing the file.
 * @param filePath - The path to the source file to parse.
 * @returns Array of MicroContract objects extracted from the file.
 * @throws ContractSyntaxError if a contract tag or inline assertion has malformed syntax.
 *
 * @example
 * // For JSDoc: /** @requires x > 0 @ensures result > x *\/
 * // Returns: [{ requires: ['x > 0'], ensures: ['result > x'], ... }]
 *
 * @example
 * // For JSDoc: /** @complexity O(n log n) *\/
 * // Returns: [{ complexity: 'O(n log n)', ... }]
 *
 * @example
 * // For inline: // @invariant: this.count >= 0
 * // Returns: [{ inlineAssertions: [{ type: 'invariant', expression: 'this.count >= 0', lineNumber: N }], ... }]
 *
 * @example
 * // For inline: // CLAIM_REF: perf_001
 * // Links the function to spec claim perf_001
 *
 * @example
 * // Unknown tags like @foobar are ignored (not an error)
 *
 * @example
 * // @requires without expression throws ContractSyntaxError with line number
 */
export function parseContracts(project: Project, filePath: string): MicroContract[] {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return [];
  }

  const contracts: MicroContract[] = [];

  // Process function declarations
  for (const func of sourceFile.getFunctions()) {
    const bodyInfo = getFunctionBodyInfo(func);
    const hasJsDocContracts = hasContractTags(func);
    const hasInline = bodyInfo !== null && hasInlineAssertions(bodyInfo.text);

    if (hasJsDocContracts || hasInline) {
      const contract = parseNodeContracts(func, filePath);
      if (contract !== null) {
        contracts.push(contract);
      }
    }
  }

  // Process class methods
  for (const classDecl of sourceFile.getClasses()) {
    for (const method of classDecl.getMethods()) {
      const bodyInfo = getFunctionBodyInfo(method);
      const hasJsDocContracts = hasContractTags(method);
      const hasInline = bodyInfo !== null && hasInlineAssertions(bodyInfo.text);

      if (hasJsDocContracts || hasInline) {
        const contract = parseNodeContracts(method, filePath);
        if (contract !== null) {
          contracts.push(contract);
        }
      }
    }
  }

  // Process arrow functions and function expressions assigned to variables
  for (const statement of sourceFile.getStatements()) {
    if (statement.getKind() === SyntaxKind.VariableStatement) {
      const varStatement = statement.asKind(SyntaxKind.VariableStatement);
      if (varStatement !== undefined) {
        for (const decl of varStatement.getDeclarationList().getDeclarations()) {
          const initializer = decl.getInitializer();
          if (
            initializer &&
            (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
          ) {
            // Check if the variable declaration has JSDoc or the function body has inline assertions
            const hasJsDocContracts = hasContractTags(varStatement);
            const bodyText = initializer.getText();
            const hasInline = hasInlineAssertions(bodyText);

            if (hasJsDocContracts || hasInline) {
              const contract = parseVariableContracts(
                varStatement,
                decl.getName(),
                filePath,
                initializer
              );
              if (contract !== null) {
                contracts.push(contract);
              }
            }
          }
        }
      }
    }
  }

  return contracts;
}

/**
 * Parses contracts from a JSDocable node (function or method declaration).
 *
 * @param node - The node to parse contracts from.
 * @param filePath - The file path for the contract.
 * @returns The parsed MicroContract, or null if no contracts found.
 */
function parseNodeContracts(
  node: FunctionDeclaration | MethodDeclaration,
  filePath: string
): MicroContract | null {
  const contract: {
    requires: string[];
    ensures: string[];
    invariants: string[];
    complexity?: string;
    purity?: PurityLevel;
    claimRefs: string[];
    inlineAssertions: InlineAssertion[];
  } = {
    requires: [],
    ensures: [],
    invariants: [],
    claimRefs: [],
    inlineAssertions: [],
  };

  const jsDocs = node.getJsDocs();

  for (const jsDoc of jsDocs) {
    // Parse contract tags
    for (const tag of jsDoc.getTags()) {
      parseContractTag(tag, contract);
    }

    // Extract CLAIM_REF comments from the full JSDoc text
    const fullText = jsDoc.getText();
    const claimRefs = extractClaimRefs(fullText);
    contract.claimRefs.push(...claimRefs);
  }

  // Parse inline assertions from function body
  const bodyInfo = getFunctionBodyInfo(node);
  if (bodyInfo !== null) {
    const inlineResult = parseInlineAssertions(bodyInfo.text, bodyInfo.startLine);
    contract.inlineAssertions.push(...inlineResult.inlineAssertions);
    contract.claimRefs.push(...inlineResult.claimRefs);
  }

  // Only return a contract if there's at least one contract element
  if (
    contract.requires.length === 0 &&
    contract.ensures.length === 0 &&
    contract.invariants.length === 0 &&
    contract.complexity === undefined &&
    contract.purity === undefined &&
    contract.claimRefs.length === 0 &&
    contract.inlineAssertions.length === 0
  ) {
    return null;
  }

  const result: MicroContract = {
    functionName: getFunctionName(node),
    filePath,
    requires: contract.requires,
    ensures: contract.ensures,
    invariants: contract.invariants,
    claimRefs: contract.claimRefs,
  };

  // Only add optional properties if they have values (exactOptionalPropertyTypes)
  if (contract.complexity !== undefined) {
    result.complexity = contract.complexity;
  }
  if (contract.purity !== undefined) {
    result.purity = contract.purity;
  }
  if (contract.inlineAssertions.length > 0) {
    result.inlineAssertions = contract.inlineAssertions;
  }

  return result;
}

/**
 * Serializes a micro-contract into a human-readable format suitable for LLM prompts.
 *
 * The output format is concise to minimize token usage while providing clear
 * constraint information for the Injection phase. CLAIM_REF information is
 * excluded as it's for internal traceability, not for LLM consumption.
 *
 * @param contract - The micro-contract to serialize.
 * @returns A formatted string representation of the contract clauses, or empty string if no clauses.
 *
 * @example
 * // For a contract with requires, ensures, complexity, and purity:
 * serializeContractForPrompt({
 *   functionName: 'process',
 *   filePath: 'file.ts',
 *   requires: ['x > 0'],
 *   ensures: ['result > x'],
 *   invariants: [],
 *   claimRefs: ['inv_001'],
 *   complexity: 'O(n)',
 *   purity: 'pure'
 * })
 * // Returns:
 * // 'REQUIRES: x > 0
 * // ENSURES: result > x
 * // COMPLEXITY: O(n)
 * // PURITY: pure'
 *
 * @example
 * // For a contract with no clauses:
 * serializeContractForPrompt({
 *   functionName: 'func',
 *   filePath: 'file.ts',
 *   requires: [],
 *   ensures: [],
 *   invariants: [],
 *   claimRefs: ['inv_001']  // Excluded from output
 * })
 * // Returns: ''
 */
export function serializeContractForPrompt(contract: MicroContract): string {
  const lines: string[] = [];

  // Add REQUIRES clauses
  for (const req of contract.requires) {
    lines.push(`REQUIRES: ${req}`);
  }

  // Add ENSURES clauses
  for (const ens of contract.ensures) {
    lines.push(`ENSURES: ${ens}`);
  }

  // Add INVARIANT clauses (from JSDoc @invariant)
  for (const inv of contract.invariants) {
    lines.push(`INVARIANT: ${inv}`);
  }

  // Add inline assertion invariants if present
  if (contract.inlineAssertions !== undefined) {
    for (const assertion of contract.inlineAssertions) {
      if (assertion.type === 'invariant') {
        lines.push(`INVARIANT: ${assertion.expression}`);
      } else {
        // assertion.type === 'assert'
        lines.push(`ASSERT: ${assertion.expression}`);
      }
    }
  }

  // Add COMPLEXITY if present
  if (contract.complexity !== undefined) {
    lines.push(`COMPLEXITY: ${contract.complexity}`);
  }

  // Add PURITY if present
  if (contract.purity !== undefined) {
    lines.push(`PURITY: ${contract.purity}`);
  }

  // Note: CLAIM_REF is intentionally excluded (internal traceability, not for LLM)

  return lines.join('\n');
}

/**
 * Parses contracts from a variable statement containing an arrow function or function expression.
 *
 * @param varStatement - The variable statement with JSDoc.
 * @param functionName - The name of the variable.
 * @param filePath - The file path for the contract.
 * @param initializer - The arrow function or function expression node (optional).
 * @returns The parsed MicroContract, or null if no contracts found.
 */
function parseVariableContracts(
  varStatement: JSDocableNode,
  functionName: string,
  filePath: string,
  initializer?: Node
): MicroContract | null {
  const contract: {
    requires: string[];
    ensures: string[];
    invariants: string[];
    complexity?: string;
    purity?: PurityLevel;
    claimRefs: string[];
    inlineAssertions: InlineAssertion[];
  } = {
    requires: [],
    ensures: [],
    invariants: [],
    claimRefs: [],
    inlineAssertions: [],
  };

  const jsDocs = varStatement.getJsDocs();

  for (const jsDoc of jsDocs) {
    // Parse contract tags
    for (const tag of jsDoc.getTags()) {
      parseContractTag(tag, contract);
    }

    // Extract CLAIM_REF comments from the full JSDoc text
    const fullText = jsDoc.getText();
    const claimRefs = extractClaimRefs(fullText);
    contract.claimRefs.push(...claimRefs);
  }

  // Parse inline assertions from the arrow function or function expression body
  if (initializer !== undefined) {
    const bodyText = initializer.getText();
    const startLine = initializer.getStartLineNumber();
    const inlineResult = parseInlineAssertions(bodyText, startLine);
    contract.inlineAssertions.push(...inlineResult.inlineAssertions);
    contract.claimRefs.push(...inlineResult.claimRefs);
  }

  // Only return a contract if there's at least one contract element
  if (
    contract.requires.length === 0 &&
    contract.ensures.length === 0 &&
    contract.invariants.length === 0 &&
    contract.complexity === undefined &&
    contract.purity === undefined &&
    contract.claimRefs.length === 0 &&
    contract.inlineAssertions.length === 0
  ) {
    return null;
  }

  const result: MicroContract = {
    functionName,
    filePath,
    requires: contract.requires,
    ensures: contract.ensures,
    invariants: contract.invariants,
    claimRefs: contract.claimRefs,
  };

  // Only add optional properties if they have values (exactOptionalPropertyTypes)
  if (contract.complexity !== undefined) {
    result.complexity = contract.complexity;
  }
  if (contract.purity !== undefined) {
    result.purity = contract.purity;
  }
  if (contract.inlineAssertions.length > 0) {
    result.inlineAssertions = contract.inlineAssertions;
  }

  return result;
}
