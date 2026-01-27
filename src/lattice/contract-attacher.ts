/**
 * Contract attachment module for the Lattice phase.
 *
 * Generates JSDoc micro-contracts for all functions with TODO bodies,
 * providing semantic guidance for the Injection phase.
 *
 * Contracts include:
 * - @requires - Preconditions that must hold before function execution
 * - @ensures - Postconditions that must hold after function execution
 * - @invariant - Invariants that must hold throughout stateful operations
 * - @complexity - Performance requirements (e.g., O(1), O(n), O(log n))
 * - @purity - Side effect classification: pure, reads, writes, or io
 * - @claim_ref - References to spec claim IDs for traceability
 *
 * @packageDocumentation
 */

import type {
  Spec,
  SpecClaim,
  SpecMethod,
  SpecInterface,
  SpecDataModel,
  ClaimType,
} from '../spec/types.js';
import type { PurityLevel } from '../adapters/typescript/contracts.js';

/**
 * A micro-contract clause to be attached to a function.
 */
export interface ContractClause {
  /** The type of contract clause. */
  readonly type: 'requires' | 'ensures' | 'invariant' | 'complexity' | 'purity' | 'claim_ref';
  /** The expression or value for this clause. */
  readonly value: string;
}

/**
 * Represents a generated micro-contract for a function.
 */
export interface GeneratedContract {
  /** The function name this contract is for. */
  readonly functionName: string;
  /** The interface this function belongs to. */
  readonly interfaceName: string;
  /** Precondition expressions. */
  readonly requires: readonly string[];
  /** Postcondition expressions. */
  readonly ensures: readonly string[];
  /** Invariant expressions. */
  readonly invariants: readonly string[];
  /** Complexity notation (e.g., O(1), O(n log n)). */
  readonly complexity?: string;
  /** Purity classification. */
  readonly purity?: PurityLevel;
  /** References to spec claim IDs. */
  readonly claimRefs: readonly string[];
  /** The generated JSDoc comment. */
  readonly jsDoc: string;
}

/**
 * Warning when a spec claim cannot be matched to a function.
 */
export interface UnmatchedClaimWarning {
  /** The claim ID that couldn't be matched. */
  readonly claimId: string;
  /** The claim text. */
  readonly claimText: string;
  /** The claim type. */
  readonly claimType: ClaimType;
  /** Reason why the claim couldn't be matched. */
  readonly reason: string;
}

/**
 * Result of attaching contracts to functions.
 */
export interface ContractAttachmentResult {
  /** The generated contracts for each function. */
  readonly contracts: readonly GeneratedContract[];
  /** Warnings about spec claims with no matching function. */
  readonly unmatchedClaimWarnings: readonly UnmatchedClaimWarning[];
  /** Map of function names to their contracts. */
  readonly contractsByFunction: ReadonlyMap<string, GeneratedContract>;
  /** Summary statistics. */
  readonly summary: {
    /** Total number of functions processed. */
    readonly totalFunctions: number;
    /** Number of functions with contracts. */
    readonly functionsWithContracts: number;
    /** Total number of spec claims. */
    readonly totalClaims: number;
    /** Number of claims successfully linked. */
    readonly linkedClaims: number;
    /** Number of unmatched claims. */
    readonly unmatchedClaims: number;
  };
}

/**
 * Options for contract attachment.
 */
export interface ContractAttachmentOptions {
  /** Whether to include @complexity annotations. Default: true. */
  readonly includeComplexity?: boolean;
  /** Whether to include @purity annotations. Default: true. */
  readonly includePurity?: boolean;
  /** Whether to include @claim_ref annotations. Default: true. */
  readonly includeClaimRefs?: boolean;
  /** Custom logger for warnings. Defaults to console.warn. */
  readonly logger?: (message: string) => void;
  /** Whether to emit warnings for unmatched claims. Default: true. */
  readonly emitWarnings?: boolean;
}

/**
 * Infers purity level from method contracts and return type.
 *
 * @param method - The spec method to analyze.
 * @returns The inferred purity level.
 */
function inferPurity(method: SpecMethod): PurityLevel {
  const contracts = method.contracts ?? [];
  const returns = method.returns.toLowerCase();

  // Check contracts for explicit purity hints
  for (const contract of contracts) {
    const lowerContract = contract.toLowerCase();
    if (lowerContract.includes('pure') || lowerContract.includes('no side effects')) {
      return 'pure';
    }
    if (lowerContract.includes('reads') || lowerContract.includes('read-only')) {
      return 'reads';
    }
    if (
      lowerContract.includes('writes') ||
      lowerContract.includes('modifies') ||
      lowerContract.includes('mutates')
    ) {
      return 'writes';
    }
    if (lowerContract.includes('io') || lowerContract.includes('network')) {
      return 'io';
    }
  }

  // Infer from method name patterns
  const methodName = method.name.toLowerCase();
  if (methodName.startsWith('get') || methodName.startsWith('is') || methodName.startsWith('has')) {
    return 'reads';
  }
  if (
    methodName.startsWith('set') ||
    methodName.startsWith('update') ||
    methodName.startsWith('delete') ||
    methodName.startsWith('create') ||
    methodName.startsWith('add') ||
    methodName.startsWith('remove')
  ) {
    return 'writes';
  }

  // Infer from return type
  if (returns === 'void' || returns.includes('promise<void>')) {
    return 'writes'; // Void returns typically indicate side effects
  }

  // Default to 'reads' as a conservative assumption
  return 'reads';
}

/**
 * Infers complexity from method contracts and signature.
 *
 * @param method - The spec method to analyze.
 * @returns The inferred complexity notation, or undefined if not determinable.
 */
function inferComplexity(method: SpecMethod): string | undefined {
  const contracts = method.contracts ?? [];

  // Check contracts for explicit complexity
  for (const contract of contracts) {
    // Match O(n), O(1), O(log n), O(n^2), O(n log n), etc.
    const complexityMatch = /O\([^)]+\)/i.exec(contract);
    if (complexityMatch !== null) {
      return complexityMatch[0];
    }

    // Match "constant time", "linear time", etc.
    const lowerContract = contract.toLowerCase();
    if (lowerContract.includes('constant time') || lowerContract.includes('constant-time')) {
      return 'O(1)';
    }
    if (lowerContract.includes('linear time') || lowerContract.includes('linear-time')) {
      return 'O(n)';
    }
    if (lowerContract.includes('logarithmic')) {
      return 'O(log n)';
    }
    if (lowerContract.includes('quadratic')) {
      return 'O(n^2)';
    }
  }

  // Infer from method name patterns
  const methodName = method.name.toLowerCase();
  if (methodName.includes('sort')) {
    return 'O(n log n)';
  }
  if (methodName.includes('search') && methodName.includes('binary')) {
    return 'O(log n)';
  }
  if (methodName === 'find' || methodName === 'filter' || methodName === 'map') {
    return 'O(n)';
  }

  return undefined;
}

/**
 * Parses a contract string into requires/ensures clauses.
 *
 * Contract strings from the spec can be in formats:
 * - "requires: x > 0"
 * - "ensures: result.length > 0"
 * - "REQUIRES x > 0"
 * - "precondition: valid(input)"
 * - Plain expressions (treated as requires)
 *
 * @param contract - The contract string to parse.
 * @returns Object with type and expression.
 */
function parseContractClause(contract: string): {
  type: 'requires' | 'ensures';
  expression: string;
} {
  const trimmed = contract.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // Check for explicit ensures/postcondition
  if (lowerTrimmed.startsWith('ensures:') || lowerTrimmed.startsWith('ensures ')) {
    return { type: 'ensures', expression: trimmed.slice(8).trim() };
  }
  if (lowerTrimmed.startsWith('postcondition:')) {
    return { type: 'ensures', expression: trimmed.slice(14).trim() };
  }

  // Check for explicit requires/precondition
  if (lowerTrimmed.startsWith('requires:') || lowerTrimmed.startsWith('requires ')) {
    return { type: 'requires', expression: trimmed.slice(9).trim() };
  }
  if (lowerTrimmed.startsWith('precondition:')) {
    return { type: 'requires', expression: trimmed.slice(13).trim() };
  }

  // Check for result-related expressions (treat as ensures)
  if (
    lowerTrimmed.includes('result') ||
    lowerTrimmed.includes('return') ||
    lowerTrimmed.includes('output')
  ) {
    return { type: 'ensures', expression: trimmed };
  }

  // Default to requires
  return { type: 'requires', expression: trimmed };
}

/**
 * Finds claims relevant to a specific method.
 *
 * A claim is considered relevant if:
 * - Its subject references the method or interface name
 * - Its operation references the method name
 * - Its trigger mentions the method
 *
 * @param method - The method to find claims for.
 * @param interfaceName - The interface name.
 * @param claims - All claims from the spec.
 * @returns Array of claim IDs and claim objects that are relevant.
 */
function findRelevantClaims(
  method: SpecMethod,
  interfaceName: string,
  claims: Record<string, SpecClaim>
): { id: string; claim: SpecClaim }[] {
  const relevant: { id: string; claim: SpecClaim }[] = [];
  const methodNameLower = method.name.toLowerCase();
  const interfaceNameLower = interfaceName.toLowerCase();

  for (const [claimId, claim] of Object.entries(claims)) {
    const claimIdLower = claimId.toLowerCase();

    // Check if claim ID contains method or interface name
    if (claimIdLower.includes(methodNameLower) || claimIdLower.includes(interfaceNameLower)) {
      relevant.push({ id: claimId, claim });
      continue;
    }

    // Check subject field
    if (claim.subject !== undefined) {
      const subjectLower = claim.subject.toLowerCase();
      if (subjectLower.includes(methodNameLower) || subjectLower.includes(interfaceNameLower)) {
        relevant.push({ id: claimId, claim });
        continue;
      }
    }

    // Check operation field
    if (claim.operation !== undefined) {
      const operationLower = claim.operation.toLowerCase();
      if (operationLower.includes(methodNameLower)) {
        relevant.push({ id: claimId, claim });
        continue;
      }
    }

    // Check trigger field
    if (claim.trigger !== undefined) {
      const triggerLower = claim.trigger.toLowerCase();
      if (triggerLower.includes(methodNameLower)) {
        relevant.push({ id: claimId, claim });
        continue;
      }
    }

    // Check text content
    const textLower = claim.text.toLowerCase();
    if (textLower.includes(methodNameLower)) {
      relevant.push({ id: claimId, claim });
    }
  }

  return relevant;
}

/**
 * Extracts invariant expressions from claims.
 *
 * @param claims - Claims relevant to a function.
 * @returns Array of invariant expressions.
 */
function extractInvariantsFromClaims(
  claims: { id: string; claim: SpecClaim }[]
): readonly string[] {
  const invariants: string[] = [];

  for (const { claim } of claims) {
    if (claim.type === 'invariant') {
      // Use predicate if available, otherwise use text
      if (claim.predicate !== undefined) {
        invariants.push(claim.predicate);
      } else if (claim.subject !== undefined) {
        invariants.push(`${claim.subject}: ${claim.text}`);
      }
    }
  }

  return invariants;
}

/**
 * Extracts requires/ensures from claims based on their type.
 *
 * @param claims - Claims relevant to a function.
 * @returns Object with requires and ensures arrays.
 */
function extractContractsFromClaims(claims: { id: string; claim: SpecClaim }[]): {
  requires: readonly string[];
  ensures: readonly string[];
} {
  const requires: string[] = [];
  const ensures: string[] = [];

  for (const { claim } of claims) {
    switch (claim.type) {
      case 'behavioral':
        // Behavioral claims typically define postconditions
        if (claim.outcome !== undefined) {
          ensures.push(claim.outcome);
        } else if (claim.trigger !== undefined && claim.text !== '') {
          ensures.push(`When ${claim.trigger}: ${claim.text}`);
        }
        break;

      case 'negative':
        // Negative claims define forbidden outcomes as postconditions
        if (claim.forbidden_outcome !== undefined) {
          ensures.push(`NOT ${claim.forbidden_outcome}`);
        } else if (claim.action !== undefined) {
          ensures.push(`${claim.action} must not ${claim.text}`);
        }
        break;

      case 'temporal':
        // Temporal claims may have setup (precondition) and termination (postcondition)
        if (claim.setup !== undefined) {
          requires.push(claim.setup);
        }
        if (claim.termination !== undefined) {
          ensures.push(claim.termination);
        }
        break;

      case 'performance':
        // Performance claims are handled separately via complexity
        break;

      case 'concurrent':
        // Concurrent claims typically define invariants or postconditions
        if (claim.operation !== undefined && claim.text !== '') {
          ensures.push(`Concurrent ${claim.operation}: ${claim.text}`);
        }
        break;

      // invariant handled separately
      default:
        break;
    }
  }

  return { requires, ensures };
}

/**
 * Generates a JSDoc comment block for a contract.
 *
 * @param contract - The contract to generate JSDoc for.
 * @param method - The original method for description.
 * @param options - Attachment options.
 * @returns The JSDoc comment string.
 */
function generateJsDocFromContract(
  contract: Omit<GeneratedContract, 'jsDoc'>,
  method: SpecMethod,
  options: ContractAttachmentOptions
): string {
  const lines: string[] = ['/**'];

  // Add description
  if (method.description !== undefined) {
    lines.push(` * ${method.description}`);
  } else {
    lines.push(` * TODO: Add description for ${method.name}`);
  }
  lines.push(' *');

  // Add @requires clauses
  for (const req of contract.requires) {
    lines.push(` * @requires ${req}`);
  }

  // Add @ensures clauses
  for (const ens of contract.ensures) {
    lines.push(` * @ensures ${ens}`);
  }

  // Add @invariant clauses
  for (const inv of contract.invariants) {
    lines.push(` * @invariant ${inv}`);
  }

  // Add @complexity if enabled
  if (options.includeComplexity !== false && contract.complexity !== undefined) {
    lines.push(` * @complexity ${contract.complexity}`);
  }

  // Add @purity if enabled
  if (options.includePurity !== false && contract.purity !== undefined) {
    lines.push(` * @purity ${contract.purity}`);
  }

  // Add @claim_ref if enabled
  if (options.includeClaimRefs !== false && contract.claimRefs.length > 0) {
    for (const claimRef of contract.claimRefs) {
      lines.push(` * @claim_ref ${claimRef}`);
    }
  }

  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generates a contract for a single method.
 *
 * @param method - The spec method.
 * @param interfaceName - The interface name.
 * @param claims - All claims from the spec.
 * @param options - Attachment options.
 * @returns The generated contract and list of used claim IDs.
 */
function generateMethodContract(
  method: SpecMethod,
  interfaceName: string,
  claims: Record<string, SpecClaim>,
  options: ContractAttachmentOptions
): { contract: GeneratedContract; usedClaimIds: readonly string[] } {
  // Parse existing contracts from the method
  const methodContracts = method.contracts ?? [];
  const parsedContracts = methodContracts.map(parseContractClause);

  const requires = parsedContracts.filter((c) => c.type === 'requires').map((c) => c.expression);
  const ensures = parsedContracts.filter((c) => c.type === 'ensures').map((c) => c.expression);

  // Find and process relevant claims
  const relevantClaims = findRelevantClaims(method, interfaceName, claims);
  const claimRefs = relevantClaims.map((c) => c.id);

  // Extract invariants from claims
  const invariantsFromClaims = extractInvariantsFromClaims(relevantClaims);

  // Extract requires/ensures from claims
  const contractsFromClaims = extractContractsFromClaims(relevantClaims);

  // Merge all contracts
  const allRequires = [...requires, ...contractsFromClaims.requires];
  const allEnsures = [...ensures, ...contractsFromClaims.ensures];
  const allInvariants = [...invariantsFromClaims];

  // Infer complexity and purity
  const complexity = inferComplexity(method);
  const purity = inferPurity(method);

  // Build the contract object
  const contractWithoutJsDoc: Omit<GeneratedContract, 'jsDoc'> = {
    functionName: method.name,
    interfaceName,
    requires: allRequires,
    ensures: allEnsures,
    invariants: allInvariants,
    claimRefs,
  };

  // Add optional fields only if they have values
  const contractBase = { ...contractWithoutJsDoc };
  if (complexity !== undefined) {
    (contractBase as { complexity?: string }).complexity = complexity;
  }
  // purity is always defined (inferPurity always returns a value)
  (contractBase as { purity?: PurityLevel }).purity = purity;

  // Generate JSDoc
  const jsDoc = generateJsDocFromContract(contractBase, method, options);

  const contract: GeneratedContract = {
    ...contractBase,
    jsDoc,
  };

  return { contract, usedClaimIds: claimRefs };
}

/**
 * Checks if an interface or method matches a claim subject/operation.
 *
 * @param claimId - The claim ID.
 * @param claim - The claim object.
 * @param interfaces - All interfaces from the spec.
 * @param dataModels - All data models from the spec.
 * @returns True if the claim can be matched to some interface/method.
 */
function canClaimBeMatched(
  claimId: string,
  claim: SpecClaim,
  interfaces: Record<string, SpecInterface>,
  dataModels?: Record<string, SpecDataModel>
): boolean {
  const claimIdLower = claimId.toLowerCase();
  const subjectLower = claim.subject?.toLowerCase() ?? '';
  const operationLower = claim.operation?.toLowerCase() ?? '';
  const triggerLower = claim.trigger?.toLowerCase() ?? '';
  const textLower = claim.text.toLowerCase();

  // Check against all interfaces and their methods
  for (const [interfaceName, iface] of Object.entries(interfaces)) {
    const interfaceNameLower = interfaceName.toLowerCase();

    // Check if interface name matches
    if (
      claimIdLower.includes(interfaceNameLower) ||
      subjectLower.includes(interfaceNameLower) ||
      textLower.includes(interfaceNameLower)
    ) {
      return true;
    }

    // Check each method
    for (const method of iface.methods) {
      const methodNameLower = method.name.toLowerCase();
      if (
        claimIdLower.includes(methodNameLower) ||
        subjectLower.includes(methodNameLower) ||
        operationLower.includes(methodNameLower) ||
        triggerLower.includes(methodNameLower) ||
        textLower.includes(methodNameLower)
      ) {
        return true;
      }
    }
  }

  // Check against data models (for invariant claims)
  if (dataModels !== undefined) {
    for (const modelName of Object.keys(dataModels)) {
      const modelNameLower = modelName.toLowerCase();
      if (
        claimIdLower.includes(modelNameLower) ||
        subjectLower.includes(modelNameLower) ||
        textLower.includes(modelNameLower)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Attaches micro-contracts to all functions with TODO bodies in the spec.
 *
 * This function:
 * - Generates JSDoc micro-contracts for all spec interface methods
 * - Contracts include: @requires, @ensures, @invariant, @complexity, @purity, @claim_ref
 * - Uses TypeScriptAdapter contract parser format for generated contracts
 * - CLAIM_REF links to spec claim IDs for traceability
 * - Logs warnings for spec claims with no matching function
 *
 * @param spec - The parsed specification.
 * @param options - Attachment options.
 * @returns The contract attachment result.
 *
 * @example
 * ```typescript
 * const spec = parseSpec(tomlContent);
 * const result = attachContracts(spec, {
 *   includeComplexity: true,
 *   includePurity: true,
 *   includeClaimRefs: true,
 * });
 *
 * // Use generated contracts
 * for (const contract of result.contracts) {
 *   console.log(contract.jsDoc);
 * }
 *
 * // Check for unmatched claims
 * for (const warning of result.unmatchedClaimWarnings) {
 *   console.warn(`Unmatched claim: ${warning.claimId}`);
 * }
 * ```
 *
 * @example
 * Example output for a deposit function:
 * ```
 * /**
 *  * Deposits funds into an account.
 *  *
 *  * @requires amount > 0
 *  * @ensures self.balance += amount
 *  * @complexity O(1)
 *  * @purity writes
 *  * @claim_ref balance_001
 *  *\/
 * ```
 */
export function attachContracts(
  spec: Spec,
  options: ContractAttachmentOptions = {}
): ContractAttachmentResult {
  const contracts: GeneratedContract[] = [];
  const unmatchedClaimWarnings: UnmatchedClaimWarning[] = [];
  const usedClaimIds = new Set<string>();
  // eslint-disable-next-line no-console -- console.warn is the appropriate default logger
  const logger = options.logger ?? console.warn;

  // Get claims from spec
  const claims = spec.claims ?? {};
  const interfaces = spec.interfaces ?? {};

  // Process each interface and its methods
  for (const [interfaceName, iface] of Object.entries(interfaces)) {
    for (const method of iface.methods) {
      const { contract, usedClaimIds: methodClaimIds } = generateMethodContract(
        method,
        interfaceName,
        claims,
        options
      );
      contracts.push(contract);

      for (const claimId of methodClaimIds) {
        usedClaimIds.add(claimId);
      }
    }
  }

  // Find unmatched claims
  for (const [claimId, claim] of Object.entries(claims)) {
    if (!usedClaimIds.has(claimId)) {
      // Check if this claim could potentially be matched but wasn't
      const couldBeMatched = canClaimBeMatched(claimId, claim, interfaces, spec.data_models);

      const warning: UnmatchedClaimWarning = {
        claimId,
        claimText: claim.text,
        claimType: claim.type,
        reason: couldBeMatched
          ? 'Claim references exist in spec but no direct function match found'
          : 'Claim does not reference any known interface or method',
      };

      unmatchedClaimWarnings.push(warning);

      if (options.emitWarnings !== false) {
        logger(
          `Warning: Spec claim '${claimId}' has no matching function - manual review required`
        );
      }
    }
  }

  // Build the contracts map
  const contractsByFunction = new Map<string, GeneratedContract>();
  for (const contract of contracts) {
    const key = `${contract.interfaceName}.${contract.functionName}`;
    contractsByFunction.set(key, contract);
  }

  // Build summary
  const totalClaims = Object.keys(claims).length;
  const summary = {
    totalFunctions: contracts.length,
    functionsWithContracts: contracts.filter(
      (c) => c.requires.length > 0 || c.ensures.length > 0 || c.invariants.length > 0
    ).length,
    totalClaims,
    linkedClaims: usedClaimIds.size,
    unmatchedClaims: unmatchedClaimWarnings.length,
  };

  return {
    contracts,
    unmatchedClaimWarnings,
    contractsByFunction,
    summary,
  };
}

/**
 * Generates JSDoc contract comments for a specific interface.
 *
 * @param spec - The parsed specification.
 * @param interfaceName - The name of the interface to generate contracts for.
 * @param options - Attachment options.
 * @returns The contract attachment result for the specific interface.
 * @throws Error if the interface is not found.
 */
export function attachContractsForInterface(
  spec: Spec,
  interfaceName: string,
  options: ContractAttachmentOptions = {}
): ContractAttachmentResult {
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

  return attachContracts(filteredSpec, options);
}

/**
 * Formats a contract attachment result as a human-readable report.
 *
 * @param result - The contract attachment result.
 * @returns A formatted string representation.
 */
export function formatContractReport(result: ContractAttachmentResult): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║                      CONTRACT ATTACHMENT REPORT                              ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    `║ Total Functions: ${String(result.summary.totalFunctions).padEnd(59)}║`,
    `║ Functions with Contracts: ${String(result.summary.functionsWithContracts).padEnd(50)}║`,
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    '║ CLAIM TRACEABILITY                                                           ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    `║ Total Spec Claims: ${String(result.summary.totalClaims).padEnd(57)}║`,
    `║ Linked to Functions: ${String(result.summary.linkedClaims).padEnd(55)}║`,
    `║ Unmatched Claims: ${String(result.summary.unmatchedClaims).padEnd(58)}║`,
  ];

  // Calculate percentages
  if (result.summary.totalClaims > 0) {
    const linkedPercentage = (
      (result.summary.linkedClaims / result.summary.totalClaims) *
      100
    ).toFixed(1);
    lines.push(
      `║ Coverage: ${linkedPercentage.padStart(5)}% of claims linked to functions ${' '.repeat(33)}║`
    );
  }

  // Show unmatched claims
  if (result.unmatchedClaimWarnings.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');
    lines.push('║ UNMATCHED CLAIMS (require manual review)                                     ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

    for (const warning of result.unmatchedClaimWarnings.slice(0, 5)) {
      const msg = `${warning.claimId} (${warning.claimType}): ${warning.claimText.substring(0, 40)}`;
      lines.push(`║ • ${msg.padEnd(74)}║`);
    }

    if (result.unmatchedClaimWarnings.length > 5) {
      lines.push(
        `║ ... and ${String(result.unmatchedClaimWarnings.length - 5)} more unmatched claims                                       ║`
      );
    }
  }

  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * Serializes a generated contract to a string suitable for code generation.
 *
 * This produces the JSDoc comment that should precede a function definition.
 *
 * @param contract - The contract to serialize.
 * @returns The JSDoc comment string.
 */
export function serializeContract(contract: GeneratedContract): string {
  return contract.jsDoc;
}

/**
 * Updates function declarations in generated code with their contracts.
 *
 * Given generated function code (with TODO bodies) and contracts,
 * this function prepends the appropriate JSDoc to each function.
 *
 * @param functionCode - The generated function code.
 * @param contracts - Map of function names to contracts.
 * @returns The updated code with contracts attached.
 */
export function attachContractsToCode(
  functionCode: string,
  contracts: ReadonlyMap<string, GeneratedContract>
): string {
  let result = functionCode;

  // Pattern to match function declarations that might need contracts
  // Matches: export (async)? function name(...
  const functionPattern = /^(\/\*\*[\s\S]*?\*\/\s*)?^(export\s+(?:async\s+)?function\s+(\w+))/gm;

  // Find all function declarations and their positions
  const matches: {
    fullMatch: string;
    existingDoc: string;
    funcStart: string;
    funcName: string;
    index: number;
  }[] = [];
  let match;

  while ((match = functionPattern.exec(functionCode)) !== null) {
    matches.push({
      fullMatch: match[0],
      existingDoc: match[1] ?? '',
      funcStart: match[2] ?? '',
      funcName: match[3] ?? '',
      index: match.index,
    });
  }

  // Process matches in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m === undefined) {
      continue;
    }

    // Look up contract by function name
    // Try multiple key formats since interface.method is the primary format
    let contract: GeneratedContract | undefined;
    for (const [key, c] of contracts) {
      if (key.endsWith(`.${m.funcName}`) || key === m.funcName) {
        contract = c;
        break;
      }
    }

    if (contract !== undefined) {
      // Replace existing JSDoc or add new one
      const newDoc = contract.jsDoc + '\n';
      if (m.existingDoc !== '') {
        // Replace existing doc
        result =
          result.slice(0, m.index) +
          newDoc +
          m.funcStart +
          result.slice(m.index + m.fullMatch.length);
      } else {
        // Add new doc
        result = result.slice(0, m.index) + newDoc + result.slice(m.index);
      }
    }
  }

  return result;
}
