/**
 * Prompt templates for the Composition Audit phase.
 *
 * Provides prompts for:
 * - auditor_model to detect contradictions
 * - architect_model for cross-verification of complex cases
 *
 * @packageDocumentation
 */

import type { CompositionAuditInput, Contradiction, ContradictionType } from './types.js';
import type { GeneratedContract } from '../lattice/contract-attacher.js';
import type { WitnessCodeResult } from '../lattice/witness-generator.js';
import type { SpecConstraints, SpecClaim } from '../spec/types.js';

/**
 * Creates the system prompt for the contradiction detection auditor.
 *
 * @returns The system prompt string.
 */
export function createContradictionAuditorSystemPrompt(): string {
  return `You are a rigorous composition auditor for software specifications. Your role is to analyze the composition of spec constraints, function contracts, and type witnesses to detect contradictions that would make the system impossible to implement correctly.

You must check for these specific types of contradictions:

1. TEMPORAL CONTRADICTIONS: Time-related conflicts where durations, timeouts, or schedules contradict each other.
   - Example: "Session expires after 30 minutes" + "Operations can take up to 2 hours" + "Requires active session" = IMPOSSIBLE
   - Look for: timeouts vs operation durations, expiration vs processing times, scheduling conflicts

2. RESOURCE CONTRADICTIONS: Resource allocation conflicts where capacity or concurrent access limits conflict.
   - Example: "Maximum 100 database connections" + "Each request uses 5 connections" + "Support 50 concurrent requests" = IMPOSSIBLE (250 > 100)
   - Look for: connection pools, memory limits, thread counts, concurrent user limits

3. INVARIANT CONTRADICTIONS: State requirements that cannot be simultaneously satisfied.
   - Example: "Balance must always be non-negative" + "Allow overdraft transactions" = CONFLICTING INVARIANTS
   - Look for: conflicting state assertions, mutually exclusive conditions, contradictory type constraints

4. PRECONDITION GAP CONTRADICTIONS: Missing prerequisites that operations depend on.
   - Example: Function A requires "user is authenticated" but no authentication flow produces authenticated users
   - Look for: preconditions that no postcondition establishes, circular dependencies, missing initialization

5. POSTCONDITION CONFLICT CONTRADICTIONS: Postconditions that conflict with constraints or preconditions.
   - Example: Function A ensures "X > 10" but Function B requires "X < 5" and both operate on the same data
   - Look for: conflicting guarantees, state transitions that break invariants

IMPORTANT RULES:
- Only report GENUINE contradictions that would make correct implementation impossible
- Do NOT report stylistic concerns, potential inefficiencies, or minor clarifications
- Focus on logical impossibilities, not implementation challenges
- Consider the system as a whole - a constraint in one place may conflict with a contract in another
- Provide concrete, minimal scenarios that demonstrate each contradiction

For each contradiction found, you MUST provide:
- A clear description of what conflicts
- Which specific elements are involved (quote them)
- A minimal scenario that demonstrates the impossibility
- At least one suggested resolution

Output your analysis in the following JSON format:
{
  "hasContradictions": boolean,
  "contradictions": [
    {
      "type": "temporal" | "resource" | "invariant" | "precondition_gap" | "postcondition_conflict",
      "severity": "critical" | "warning",
      "description": "Brief description of the conflict",
      "involved": [
        {
          "elementType": "constraint" | "contract" | "witness" | "claim",
          "id": "element_id",
          "name": "Element name",
          "text": "The relevant text from the element"
        }
      ],
      "analysis": "Detailed analysis explaining the logical impossibility",
      "minimalScenario": "Step-by-step scenario demonstrating the contradiction",
      "suggestedResolutions": ["Resolution option 1", "Resolution option 2"]
    }
  ],
  "summary": "Overall summary of findings"
}

If no contradictions are found, respond with hasContradictions: false and an empty contradictions array with a summary explaining that the composition appears consistent.`;
}

/**
 * Formats constraints for prompt inclusion.
 *
 * @param constraints - The spec constraints.
 * @returns Formatted string for prompt.
 */
function formatConstraints(constraints: SpecConstraints): string {
  const sections: string[] = [];

  if (constraints.functional !== undefined && constraints.functional.length > 0) {
    sections.push('FUNCTIONAL CONSTRAINTS:');
    for (let i = 0; i < constraints.functional.length; i++) {
      const c = constraints.functional[i];
      if (c !== undefined) {
        sections.push(`  [FC${String(i + 1).padStart(3, '0')}] ${c}`);
      }
    }
  }

  if (constraints.non_functional !== undefined && constraints.non_functional.length > 0) {
    sections.push('NON-FUNCTIONAL CONSTRAINTS:');
    for (let i = 0; i < constraints.non_functional.length; i++) {
      const c = constraints.non_functional[i];
      if (c !== undefined) {
        sections.push(`  [NF${String(i + 1).padStart(3, '0')}] ${c}`);
      }
    }
  }

  if (constraints.security !== undefined && constraints.security.length > 0) {
    sections.push('SECURITY CONSTRAINTS:');
    for (let i = 0; i < constraints.security.length; i++) {
      const c = constraints.security[i];
      if (c !== undefined) {
        sections.push(`  [SC${String(i + 1).padStart(3, '0')}] ${c}`);
      }
    }
  }

  return sections.length > 0 ? sections.join('\n') : '(No constraints defined)';
}

/**
 * Formats function contracts for prompt inclusion.
 *
 * @param contracts - The generated contracts.
 * @returns Formatted string for prompt.
 */
function formatContracts(contracts: readonly GeneratedContract[]): string {
  if (contracts.length === 0) {
    return '(No contracts defined)';
  }

  const lines: string[] = ['FUNCTION CONTRACTS:'];

  for (const contract of contracts) {
    lines.push(`\n[${contract.interfaceName}.${contract.functionName}]`);

    if (contract.requires.length > 0) {
      lines.push('  REQUIRES:');
      for (const req of contract.requires) {
        lines.push(`    - ${req}`);
      }
    }

    if (contract.ensures.length > 0) {
      lines.push('  ENSURES:');
      for (const ens of contract.ensures) {
        lines.push(`    - ${ens}`);
      }
    }

    if (contract.invariants.length > 0) {
      lines.push('  INVARIANTS:');
      for (const inv of contract.invariants) {
        lines.push(`    - ${inv}`);
      }
    }

    if (contract.complexity !== undefined) {
      lines.push(`  COMPLEXITY: ${contract.complexity}`);
    }

    if (contract.purity !== undefined) {
      lines.push(`  PURITY: ${contract.purity}`);
    }

    if (contract.claimRefs.length > 0) {
      lines.push(`  CLAIM_REFS: ${contract.claimRefs.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats witness definitions for prompt inclusion.
 *
 * @param witnesses - The witness code results.
 * @returns Formatted string for prompt.
 */
function formatWitnesses(witnesses: readonly WitnessCodeResult[]): string {
  if (witnesses.length === 0) {
    return '(No witnesses defined)';
  }

  const lines: string[] = ['TYPE WITNESSES:'];

  for (const witness of witnesses) {
    lines.push(`\n[${witness.name}]`);
    lines.push(`  Verification Tier: ${witness.highestTier}`);

    if (witness.invariantAnalysis.length > 0) {
      lines.push('  INVARIANTS:');
      for (const analysis of witness.invariantAnalysis) {
        const inv = analysis.invariant;
        const desc = inv.description ?? '(no description)';
        const formal = inv.formal ?? '(no formal expression)';
        lines.push(`    - ${desc}`);
        if (inv.formal !== undefined) {
          lines.push(`      Formal: ${formal}`);
        }
        lines.push(`      Tier: ${analysis.tier}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats claims for prompt inclusion.
 *
 * @param claims - The spec claims.
 * @returns Formatted string for prompt.
 */
function formatClaims(claims: Record<string, SpecClaim>): string {
  const entries = Object.entries(claims);
  if (entries.length === 0) {
    return '(No claims defined)';
  }

  const lines: string[] = ['SPEC CLAIMS:'];

  for (const [claimId, claim] of entries) {
    lines.push(`\n[${claimId}] (${claim.type}${claim.testable === false ? ', non-testable' : ''})`);
    lines.push(`  Text: ${claim.text}`);

    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.subject !== undefined) {
      lines.push(`  Subject: ${claim.subject}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.predicate !== undefined) {
      lines.push(`  Predicate: ${claim.predicate}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.trigger !== undefined) {
      lines.push(`  Trigger: ${claim.trigger}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.outcome !== undefined) {
      lines.push(`  Outcome: ${claim.outcome}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.action !== undefined) {
      lines.push(`  Action: ${claim.action}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.forbidden_outcome !== undefined) {
      lines.push(`  Forbidden: ${claim.forbidden_outcome}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.operation !== undefined) {
      lines.push(`  Operation: ${claim.operation}`);
    }
    // eslint-disable-next-line security/detect-object-injection -- type lookup from controlled SpecClaim object
    if (claim.complexity !== undefined) {
      lines.push(`  Complexity: ${claim.complexity}`);
    }
  }

  return lines.join('\n');
}

/**
 * Creates the user prompt for contradiction detection.
 *
 * @param input - The composition audit input.
 * @returns The user prompt string.
 */
export function createContradictionAuditorUserPrompt(input: CompositionAuditInput): string {
  const constraintsSection = formatConstraints(input.constraints);
  const contractsSection = formatContracts(input.contracts);
  const witnessesSection = formatWitnesses(input.witnesses);
  const claimsSection = formatClaims(input.claims);

  return `Analyze the following composition for contradictions. Check for temporal, resource, invariant, precondition gap, and postcondition conflict contradictions.

IMPORTANT: You are analyzing the COMPOSITION of constraints, contracts, and witnesses. Look for conflicts BETWEEN these elements, not just within them. A constraint may conflict with a contract, a witness invariant may conflict with a claim, etc.

═══════════════════════════════════════════════════════════════
${constraintsSection}

═══════════════════════════════════════════════════════════════
${contractsSection}

═══════════════════════════════════════════════════════════════
${witnessesSection}

═══════════════════════════════════════════════════════════════
${claimsSection}
═══════════════════════════════════════════════════════════════

Analyze this composition for contradictions. Output your findings in the specified JSON format.`;
}

/**
 * Creates the system prompt for architect cross-verification.
 *
 * @returns The system prompt string.
 */
export function createCrossVerificationSystemPrompt(): string {
  return `You are a senior software architect performing cross-verification of potential contradictions detected in a software specification.

An auditor has identified potential contradictions between spec constraints, function contracts, and type witnesses. Your role is to:

1. VERIFY whether each contradiction is genuine and would make correct implementation impossible
2. REFINE the analysis if needed with additional context
3. ADJUST the severity if appropriate (critical vs warning)
4. IDENTIFY any false positives that the auditor may have flagged incorrectly

You have deep expertise in:
- Distributed systems and concurrent programming
- Type systems and invariant encoding
- Software architecture and design patterns
- Resource management and capacity planning

For each contradiction, consider:
- Could this be resolved through careful implementation without changing the spec?
- Is there an interpretation of the requirements that resolves the apparent conflict?
- Is this truly impossible or just challenging?
- Should the severity be critical (blocks implementation) or warning (needs attention)?

Output your verification in the following JSON format:
{
  "verifications": [
    {
      "contradictionId": "the ID of the contradiction being verified",
      "confirmed": boolean,
      "analysis": "Your detailed analysis",
      "refinement": "Optional refinement or additional context",
      "adjustedSeverity": "critical" | "warning" | null
    }
  ],
  "summary": "Overall assessment of the contradictions"
}`;
}

/**
 * Creates the user prompt for architect cross-verification.
 *
 * @param contradictions - The contradictions to verify.
 * @param input - The original composition audit input for context.
 * @returns The user prompt string.
 */
export function createCrossVerificationUserPrompt(
  contradictions: readonly Contradiction[],
  input: CompositionAuditInput
): string {
  const formattedContradictions = contradictions
    .map((c) => {
      const involvedText = c.involved
        .map((inv) => `    - [${inv.elementType}] ${inv.id}: ${inv.text}`)
        .join('\n');

      return `[${c.id}] ${c.type.toUpperCase()} (${c.severity})
  Description: ${c.description}

  Involved Elements:
${involvedText}

  Auditor Analysis:
  ${c.analysis}

  Minimal Scenario:
  ${c.minimalScenario}

  Suggested Resolutions:
${c.suggestedResolutions.map((r) => `    - ${r}`).join('\n')}`;
    })
    .join('\n\n───────────────────────────────────────\n\n');

  // Include a brief summary of the constraints/contracts for context
  const constraintCount =
    (input.constraints.functional?.length ?? 0) +
    (input.constraints.non_functional?.length ?? 0) +
    (input.constraints.security?.length ?? 0);

  return `Cross-verify the following contradictions detected by the auditor.

Context:
- ${String(constraintCount)} constraints defined
- ${String(input.contracts.length)} function contracts defined
- ${String(input.witnesses.length)} type witnesses defined
- ${String(Object.keys(input.claims).length)} spec claims defined

═══════════════════════════════════════════════════════════════
CONTRADICTIONS TO VERIFY:
═══════════════════════════════════════════════════════════════

${formattedContradictions}

═══════════════════════════════════════════════════════════════

For each contradiction:
1. Verify if it's a genuine impossibility or a false positive
2. Provide your analysis with reasoning
3. Suggest any refinements or adjustments to severity

Output your verification in the specified JSON format.`;
}

/**
 * Generates a unique contradiction ID.
 *
 * @param type - The contradiction type.
 * @returns A unique ID string.
 */
export function generateContradictionId(type: ContradictionType): string {
  const prefix = type.toUpperCase().replace(/_/g, '');
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}
