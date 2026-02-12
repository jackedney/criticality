/**
 * Ledger-to-prompt formatter.
 *
 * Formats active ledger decisions for injection into LLM prompts,
 * grouping by confidence level per spec section 5.1 "Injection Into Phases".
 *
 * @packageDocumentation
 */

import type { Decision, DecisionPhase } from './types.js';
import type { Ledger } from './ledger.js';

/**
 * Ordered protocol phases for filtering.
 */
const PHASE_ORDER: readonly DecisionPhase[] = [
  'design',
  'ignition',
  'lattice',
  'composition_audit',
  'injection',
  'mesoscopic',
  'mass_defect',
];

/**
 * Options for formatting ledger decisions into prompt text.
 */
export interface FormatLedgerOptions {
  /** Only include decisions from this phase and earlier. */
  phase?: DecisionPhase;
  /** Include the closing instruction line. Default: true. */
  includeInstruction?: boolean;
}

/**
 * Formats active ledger decisions for injection into LLM prompts.
 *
 * Groups decisions into CANONICAL, INFERRED, and SUSPENDED buckets
 * per the spec-defined format. Blocking decisions are excluded (they
 * halt the protocol rather than being fed to prompts). The rationale
 * field is never included per spec: "rationale field is for human
 * audit only and is NEVER included in LLM prompts".
 *
 * @param ledger - The ledger instance to format decisions from.
 * @param options - Formatting options.
 * @returns Formatted prompt text, or empty string if no active decisions.
 */
export function formatLedgerForPrompt(ledger: Ledger, options?: FormatLedgerOptions): string {
  let decisions = ledger.getActiveDecisions();

  // Filter by phase if specified (include decisions from this phase and earlier)
  if (options?.phase !== undefined) {
    const maxPhaseIndex = PHASE_ORDER.indexOf(options.phase);
    if (maxPhaseIndex !== -1) {
      decisions = decisions.filter((d) => {
        const phaseIndex = PHASE_ORDER.indexOf(d.phase);
        return phaseIndex !== -1 && phaseIndex <= maxPhaseIndex;
      });
    }
  }

  // Exclude blocking decisions — they halt the protocol, not fed to prompts
  decisions = decisions.filter((d) => d.confidence !== 'blocking');

  if (decisions.length === 0) {
    return '';
  }

  // Group by confidence bucket
  const canonical: Decision[] = [];
  const inferred: Decision[] = [];
  const suspended: Decision[] = [];

  for (const d of decisions) {
    switch (d.confidence) {
      case 'canonical':
        canonical.push(d);
        break;
      case 'suspended':
        suspended.push(d);
        break;
      default:
        // inferred, delegated, provisional all go under INFERRED
        inferred.push(d);
        break;
    }
  }

  const sections: string[] = [];

  // CANONICAL section
  sections.push('CANONICAL (user-confirmed):');
  if (canonical.length > 0) {
    for (const d of canonical) {
      sections.push(`- ${d.constraint} [${d.id}]`);
    }
  } else {
    sections.push('- None currently');
  }

  // INFERRED section
  sections.push('');
  sections.push('INFERRED (may be revised if contradicted):');
  if (inferred.length > 0) {
    for (const d of inferred) {
      sections.push(`- ${d.constraint} [${d.id}]`);
    }
  } else {
    sections.push('- None currently');
  }

  // SUSPENDED section
  sections.push('');
  sections.push('SUSPENDED (require explicit confirmation):');
  if (suspended.length > 0) {
    for (const d of suspended) {
      sections.push(`- ${d.constraint} [${d.id}]`);
    }
  } else {
    sections.push('- None currently');
  }

  // Closing instruction (only when canonical decisions exist)
  if (canonical.length > 0 && options?.includeInstruction !== false) {
    sections.push('');
    sections.push('Your work must satisfy all canonical constraints.');
  }

  return sections.join('\n');
}
