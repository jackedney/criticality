/**
 * Minimal prompt generation for injection phase.
 *
 * Generates prompts in the exact format specified in SPECIFICATION.md:
 * - FUNCTION: function_name
 * - SIGNATURE: full signature
 * - CONTRACTS: requires/ensures/invariant/complexity/purity
 * - TYPE DEFINITIONS: required types
 * - IMPLEMENT THE FUNCTION. Output only the function body.
 *
 * No reasoning traces, no prior attempts, no other functions included.
 *
 * @packageDocumentation
 */

import type { ExtractedContext, ContextSizeMetrics } from './context-extractor.js';
import type { MicroContract } from '../adapters/typescript/assertions.js';

/**
 * Default token limit for triggering pre-emptive model upgrade.
 * Per routing_002, contexts exceeding 12k tokens should upgrade to a more capable model.
 */
export const DEFAULT_TOKEN_LIMIT = 12000;

/**
 * Result of minimal prompt generation.
 */
export interface MinimalPromptResult {
  /** The generated prompt text. */
  readonly prompt: string;
  /** The function name. */
  readonly functionName: string;
  /** Estimated token count of the prompt. */
  readonly estimatedTokens: number;
  /** Whether the context exceeds the token limit (requires model upgrade). */
  readonly exceedsTokenLimit: boolean;
  /** Character count of the prompt. */
  readonly characterCount: number;
}

/**
 * Options for minimal prompt generation.
 */
export interface MinimalPromptOptions {
  /** Token limit for triggering model upgrade. Default: 12000. */
  readonly tokenLimit?: number;
  /** Whether to include witness types separately. Default: true. */
  readonly separateWitnessTypes?: boolean;
}

/**
 * Formats contracts in SPECIFICATION.md format.
 *
 * Format:
 * ```
 * CONTRACTS:
 *   REQUIRES: condition
 *   ENSURES: condition
 *   COMPLEXITY: O(n)
 *   PURITY: pure
 * ```
 *
 * @param contracts - The micro-contracts to format.
 * @returns Formatted contracts section or empty string if no contracts.
 */
function formatContracts(contracts: readonly MicroContract[]): string {
  if (contracts.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('CONTRACTS:');

  for (const contract of contracts) {
    // Add REQUIRES clauses
    for (const req of contract.requires) {
      lines.push(`  REQUIRES: ${req}`);
    }

    // Add ENSURES clauses
    for (const ens of contract.ensures) {
      lines.push(`  ENSURES: ${ens}`);
    }

    // Add INVARIANT clauses
    for (const inv of contract.invariants) {
      lines.push(`  INVARIANT: ${inv}`);
    }

    // Add inline assertion invariants if present
    if (contract.inlineAssertions !== undefined) {
      for (const assertion of contract.inlineAssertions) {
        if (assertion.type === 'invariant') {
          lines.push(`  INVARIANT: ${assertion.expression}`);
        } else {
          lines.push(`  ASSERT: ${assertion.expression}`);
        }
      }
    }

    // Add COMPLEXITY if present
    if (contract.complexity !== undefined) {
      lines.push(`  COMPLEXITY: ${contract.complexity}`);
    }

    // Add PURITY if present
    if (contract.purity !== undefined) {
      lines.push(`  PURITY: ${contract.purity}`);
    }
  }

  // Return empty if only the header was added (no actual contract content)
  if (lines.length === 1) {
    return '';
  }

  return lines.join('\n');
}

/**
 * Formats type definitions in SPECIFICATION.md format.
 *
 * Format:
 * ```
 * TYPE DEFINITIONS:
 *   interface Foo { ... }
 *   type Bar = ...
 * ```
 *
 * @param types - Array of type definition strings.
 * @param header - Section header (e.g., 'TYPE DEFINITIONS' or 'WITNESS DEFINITIONS').
 * @returns Formatted type definitions section or empty string if no types.
 */
function formatTypeDefinitions(types: readonly string[], header: string): string {
  if (types.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`${header}:`);

  for (const typeDef of types) {
    // Indent each line of the type definition
    const defLines = typeDef.split('\n');
    for (const line of defLines) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n');
}

/**
 * Estimates token count from character count.
 *
 * Uses the approximation of ~4 characters per token, which is
 * generally accurate for code content.
 *
 * @param characterCount - Number of characters.
 * @returns Estimated token count.
 */
export function estimateTokenCount(characterCount: number): number {
  return Math.ceil(characterCount / 4);
}

/**
 * Generates a minimal prompt for function implementation.
 *
 * The generated prompt follows the SPECIFICATION.md format exactly:
 * ```
 * FUNCTION: function_name
 * SIGNATURE: function signature(params): return_type
 *
 * CONTRACTS:
 *   REQUIRES: condition
 *   ENSURES: condition
 *   COMPLEXITY: O(n)
 *   PURITY: pure
 *
 * TYPE DEFINITIONS:
 *   interface Foo { ... }
 *
 * IMPLEMENT THE FUNCTION. Output only the function body.
 * ```
 *
 * No reasoning traces, no prior attempts, no other functions included.
 *
 * @param context - The extracted context for the function.
 * @param options - Generation options.
 * @returns The minimal prompt result with token metrics.
 *
 * @example
 * ```typescript
 * const context = extractContext(project, todoFunction);
 * const result = generateMinimalPrompt(context);
 *
 * if (result.exceedsTokenLimit) {
 *   // Trigger pre-emptive model upgrade per routing_002
 *   console.log('Context exceeds 12k tokens, upgrading model');
 * }
 *
 * // Use result.prompt for LLM request
 * ```
 */
export function generateMinimalPrompt(
  context: ExtractedContext,
  options: MinimalPromptOptions = {}
): MinimalPromptResult {
  const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  const separateWitnessTypes = options.separateWitnessTypes ?? true;

  const lines: string[] = [];

  // FUNCTION: name
  lines.push(`FUNCTION: ${context.functionName}`);

  // SIGNATURE: full signature
  lines.push(`SIGNATURE: ${context.signatureText}`);
  lines.push('');

  // CONTRACTS section (if any)
  const contractsSection = formatContracts(context.contracts);
  if (contractsSection !== '') {
    lines.push(contractsSection);
    lines.push('');
  }

  // TYPE DEFINITIONS section
  const typeDefs = context.requiredTypes.map((t) => t.definition);
  const typeDefsSection = formatTypeDefinitions(typeDefs, 'TYPE DEFINITIONS');
  if (typeDefsSection !== '') {
    lines.push(typeDefsSection);
    lines.push('');
  }

  // WITNESS DEFINITIONS section (if separate and present)
  if (separateWitnessTypes && context.witnessDefinitions.length > 0) {
    const witnessDefs = context.witnessDefinitions.map((w) => w.definition);
    const witnessSection = formatTypeDefinitions(witnessDefs, 'WITNESS DEFINITIONS');
    if (witnessSection !== '') {
      // Add invariant comments for witness types
      lines.push(witnessSection);
      lines.push('');
    }
  }

  // Final instruction
  lines.push('IMPLEMENT THE FUNCTION. Output only the function body.');

  const prompt = lines.join('\n');
  const characterCount = prompt.length;
  const estimatedTokens = estimateTokenCount(characterCount);
  const exceedsTokenLimit = estimatedTokens > tokenLimit;

  return {
    prompt,
    functionName: context.functionName,
    estimatedTokens,
    exceedsTokenLimit,
    characterCount,
  };
}

/**
 * Checks if the context size metrics indicate a need for model upgrade.
 *
 * Based on SPECIFICATION.md routing_002:
 * - Context exceeding 12k tokens should trigger pre-emptive model upgrade
 *
 * @param metrics - The context size metrics.
 * @param tokenLimit - Token limit for upgrade trigger. Default: 12000.
 * @returns True if context exceeds the token limit.
 */
export function shouldTriggerModelUpgrade(
  metrics: ContextSizeMetrics,
  tokenLimit: number = DEFAULT_TOKEN_LIMIT
): boolean {
  return metrics.estimatedTokens > tokenLimit;
}

/**
 * Generates a minimal prompt from raw context components.
 *
 * This is a lower-level function that accepts individual components
 * rather than an ExtractedContext object.
 *
 * @param functionName - The function name.
 * @param signatureText - The function signature as text.
 * @param contracts - Array of micro-contracts.
 * @param typeDefinitions - Array of type definition strings.
 * @param witnessDefinitions - Array of witness type definition strings.
 * @param options - Generation options.
 * @returns The minimal prompt result with token metrics.
 */
export function generateMinimalPromptFromComponents(
  functionName: string,
  signatureText: string,
  contracts: readonly MicroContract[],
  typeDefinitions: readonly string[],
  witnessDefinitions: readonly string[] = [],
  options: MinimalPromptOptions = {}
): MinimalPromptResult {
  const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  const separateWitnessTypes = options.separateWitnessTypes ?? true;

  const lines: string[] = [];

  // FUNCTION: name
  lines.push(`FUNCTION: ${functionName}`);

  // SIGNATURE: full signature
  lines.push(`SIGNATURE: ${signatureText}`);
  lines.push('');

  // CONTRACTS section (if any)
  const contractsSection = formatContracts(contracts);
  if (contractsSection !== '') {
    lines.push(contractsSection);
    lines.push('');
  }

  // TYPE DEFINITIONS section
  const typeDefsSection = formatTypeDefinitions(typeDefinitions, 'TYPE DEFINITIONS');
  if (typeDefsSection !== '') {
    lines.push(typeDefsSection);
    lines.push('');
  }

  // WITNESS DEFINITIONS section (if separate and present)
  if (separateWitnessTypes && witnessDefinitions.length > 0) {
    const witnessSection = formatTypeDefinitions(witnessDefinitions, 'WITNESS DEFINITIONS');
    if (witnessSection !== '') {
      lines.push(witnessSection);
      lines.push('');
    }
  }

  // Final instruction
  lines.push('IMPLEMENT THE FUNCTION. Output only the function body.');

  const prompt = lines.join('\n');
  const characterCount = prompt.length;
  const estimatedTokens = estimateTokenCount(characterCount);
  const exceedsTokenLimit = estimatedTokens > tokenLimit;

  return {
    prompt,
    functionName,
    estimatedTokens,
    exceedsTokenLimit,
    characterCount,
  };
}
