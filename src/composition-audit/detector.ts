/**
 * Contradiction detector for the Composition Audit phase.
 *
 * Analyzes the composition of spec constraints, function contracts, and type witnesses
 * to detect contradictions that would make implementation impossible.
 *
 * Uses auditor_model for detection and architect_model for cross-verification
 * of complex cases.
 *
 * @packageDocumentation
 */

import type { ModelRouter } from '../router/types.js';
import type {
  CompositionAuditInput,
  CompositionAuditResult,
  CompositionAuditOptions,
  Contradiction,
  ContradictionSeverity,
  InvolvedElement,
  CrossVerificationResult,
} from './types.js';
import { isValidContradictionType } from './types.js';
import {
  createContradictionAuditorSystemPrompt,
  createContradictionAuditorUserPrompt,
  createCrossVerificationSystemPrompt,
  createCrossVerificationUserPrompt,
  generateContradictionId,
} from './prompts.js';

/**
 * Default options for composition audit.
 */
const DEFAULT_OPTIONS: Required<CompositionAuditOptions> = {
  enableCrossVerification: true,
  complexityThreshold: 3,
  timeoutMs: 120000,

  logger: (_message: string) => {},
};

/**
 * Extracts JSON from a response using various strategies.
 *
 * @param content - The raw response content.
 * @returns Extracted JSON string or null if not found.
 */
function extractJSON(content: string): string | null {
  // Strategy 1: Try to extract JSON by matching braces from first opening brace
  const firstBraceIndex = content.indexOf('{');
  if (firstBraceIndex !== -1) {
    let braceCount = 0;
    for (let i = firstBraceIndex; i < content.length; i++) {
      if (content.charAt(i) === '{') {
        braceCount++;
      } else if (content.charAt(i) === '}') {
        braceCount--;
        if (braceCount === 0) {
          const jsonCandidate = content.slice(firstBraceIndex, i + 1);
          try {
            JSON.parse(jsonCandidate);
            return jsonCandidate;
          } catch {
            // Continue to next strategy
            break;
          }
        }
      }
    }
  }

  // Strategy 2: Find the last closing brace and work backwards to matching opening brace
  const lastBraceIndex = content.lastIndexOf('}');
  if (lastBraceIndex !== -1) {
    let braceCount = 0;
    for (let i = lastBraceIndex; i >= 0; i--) {
      if (content.charAt(i) === '}') {
        braceCount++;
      } else if (content.charAt(i) === '{') {
        braceCount--;
        if (braceCount === 0) {
          const jsonCandidate = content.slice(i, lastBraceIndex + 1);
          try {
            JSON.parse(jsonCandidate);
            return jsonCandidate;
          } catch {
            break;
          }
        }
      }
    }
  }

  // Strategy 3: Iteratively try substrings until JSON.parse succeeds
  if (firstBraceIndex !== -1 && lastBraceIndex !== -1) {
    let length = lastBraceIndex - firstBraceIndex + 1;
    while (length > 0) {
      const substring = content.slice(firstBraceIndex, firstBraceIndex + length);
      try {
        JSON.parse(substring);
        return substring;
      } catch {
        length--;
      }
    }
  }

  return null;
}

/**
 * Parses the auditor's JSON response into contradictions.
 *
 * @param content - The raw response content.
 * @returns Parsed contradictions and summary.
 */
function parseAuditorResponse(content: string): {
  contradictions: Contradiction[];
  summary: string;
  hasContradictions: boolean;
} {
  try {
    const jsonStr = extractJSON(content);
    if (jsonStr === null) {
      return {
        contradictions: [],
        summary: 'Failed to parse auditor response - no JSON found',
        hasContradictions: false,
      };
    }

    const parsed = JSON.parse(jsonStr) as {
      hasContradictions?: boolean;
      contradictions?: {
        type?: string;
        severity?: string;
        description?: string;
        involved?: {
          elementType?: string;
          id?: string;
          name?: string;
          text?: string;
          location?: string;
        }[];
        analysis?: string;
        minimalScenario?: string;
        suggestedResolutions?: string[];
      }[];
      summary?: string;
    };

    const contradictions: Contradiction[] = [];

    if (Array.isArray(parsed.contradictions)) {
      for (const item of parsed.contradictions) {
        // Validate type
        const type = item.type;
        if (typeof type !== 'string' || !isValidContradictionType(type)) {
          continue;
        }

        // Validate severity
        const severity = item.severity;
        if (typeof severity !== 'string' || !['critical', 'warning'].includes(severity)) {
          continue;
        }

        // Validate required fields
        const description = item.description;
        if (typeof description !== 'string' || description.trim() === '') {
          continue;
        }

        const analysis = item.analysis;
        if (typeof analysis !== 'string' || analysis.trim() === '') {
          continue;
        }

        const minimalScenario = item.minimalScenario;
        if (typeof minimalScenario !== 'string' || minimalScenario.trim() === '') {
          continue;
        }

        // Parse involved elements
        const involved: InvolvedElement[] = [];
        if (Array.isArray(item.involved)) {
          for (const inv of item.involved) {
            const elementType = inv.elementType;
            if (
              typeof elementType !== 'string' ||
              !['constraint', 'contract', 'witness', 'claim'].includes(elementType)
            ) {
              continue;
            }

            const id = inv.id;
            if (typeof id !== 'string') {
              continue;
            }

            const name = inv.name;
            if (typeof name !== 'string') {
              continue;
            }

            const text = inv.text;
            if (typeof text !== 'string') {
              continue;
            }

            const baseInvolved: InvolvedElement = {
              elementType: elementType as InvolvedElement['elementType'],
              id,
              name,
              text,
            };

            // Add location if present
            const location = inv.location;
            if (typeof location === 'string') {
              involved.push({ ...baseInvolved, location });
            } else {
              involved.push(baseInvolved);
            }
          }
        }

        // Need at least one involved element for a valid contradiction
        if (involved.length === 0) {
          continue;
        }

        // Parse suggested resolutions
        const suggestedResolutions: string[] = [];
        if (Array.isArray(item.suggestedResolutions)) {
          for (const res of item.suggestedResolutions) {
            if (typeof res === 'string' && res.trim() !== '') {
              suggestedResolutions.push(res.trim());
            }
          }
        }

        // Generate ID and add contradiction
        contradictions.push({
          id: generateContradictionId(type),
          type,
          severity: severity as ContradictionSeverity,
          description: description.trim(),
          involved,
          analysis: analysis.trim(),
          minimalScenario: minimalScenario.trim(),
          suggestedResolutions,
        });
      }
    }

    return {
      contradictions,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary provided',
      hasContradictions: parsed.hasContradictions === true || contradictions.length > 0,
    };
  } catch {
    return {
      contradictions: [],
      summary: 'Failed to parse auditor response - invalid JSON',
      hasContradictions: false,
    };
  }
}

/**
 * Parses the architect's cross-verification response.
 *
 * @param content - The raw response content.
 * @returns Parsed verification results.
 */
function parseCrossVerificationResponse(content: string): CrossVerificationResult[] {
  try {
    const jsonStr = extractJSON(content);
    if (jsonStr === null) {
      return [];
    }

    const parsed = JSON.parse(jsonStr) as {
      verifications?: {
        contradictionId?: string;
        confirmed?: boolean;
        analysis?: string;
        refinement?: string;
        adjustedSeverity?: string;
      }[];
    };

    const results: CrossVerificationResult[] = [];

    if (Array.isArray(parsed.verifications)) {
      for (const item of parsed.verifications) {
        const contradictionId = item.contradictionId;
        if (typeof contradictionId !== 'string') {
          continue;
        }

        const analysis = item.analysis;
        if (typeof analysis !== 'string') {
          continue;
        }

        const confirmed = item.confirmed;
        if (typeof confirmed !== 'boolean') {
          continue;
        }

        const baseResult: CrossVerificationResult = {
          contradictionId,
          confirmed,
          analysis,
        };

        // Add optional fields
        const refinement = item.refinement;
        const adjustedSeverity = item.adjustedSeverity;

        if (
          typeof refinement === 'string' &&
          typeof adjustedSeverity === 'string' &&
          ['critical', 'warning'].includes(adjustedSeverity)
        ) {
          results.push({
            ...baseResult,
            refinement,
            adjustedSeverity: adjustedSeverity as ContradictionSeverity,
          });
        } else if (typeof refinement === 'string') {
          results.push({ ...baseResult, refinement });
        } else if (
          typeof adjustedSeverity === 'string' &&
          ['critical', 'warning'].includes(adjustedSeverity)
        ) {
          results.push({
            ...baseResult,
            adjustedSeverity: adjustedSeverity as ContradictionSeverity,
          });
        } else {
          results.push(baseResult);
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Applies cross-verification results to contradictions.
 *
 * Removes unconfirmed contradictions and adjusts severities as indicated.
 *
 * @param contradictions - Original contradictions.
 * @param verifications - Cross-verification results.
 * @returns Filtered and adjusted contradictions.
 */
function applyVerificationResults(
  contradictions: readonly Contradiction[],
  verifications: readonly CrossVerificationResult[]
): Contradiction[] {
  const verificationMap = new Map<string, CrossVerificationResult>();
  for (const v of verifications) {
    verificationMap.set(v.contradictionId, v);
  }

  const result: Contradiction[] = [];

  for (const contradiction of contradictions) {
    const verification = verificationMap.get(contradiction.id);

    // If not verified, keep the original contradiction
    if (verification === undefined) {
      result.push(contradiction);
      continue;
    }

    // If not confirmed, skip this contradiction (false positive)
    if (!verification.confirmed) {
      continue;
    }

    // Apply severity adjustment if present
    if (verification.adjustedSeverity !== undefined) {
      result.push({
        ...contradiction,
        severity: verification.adjustedSeverity,
        // Append refinement to analysis if present
        analysis:
          verification.refinement !== undefined
            ? `${contradiction.analysis}\n\n[Architect Refinement]: ${verification.refinement}`
            : contradiction.analysis,
      });
    } else if (verification.refinement !== undefined) {
      result.push({
        ...contradiction,
        analysis: `${contradiction.analysis}\n\n[Architect Refinement]: ${verification.refinement}`,
      });
    } else {
      result.push(contradiction);
    }
  }

  return result;
}

/**
 * Determines if a case is complex enough to warrant cross-verification.
 *
 * A case is considered complex if:
 * - There are multiple contradictions of different types
 * - Any contradiction involves 3+ elements
 * - There are interactions between contradictions (shared elements)
 *
 * @param contradictions - The detected contradictions.
 * @param threshold - The complexity threshold.
 * @returns True if cross-verification should be performed.
 */
function isComplexCase(contradictions: readonly Contradiction[], threshold: number): boolean {
  if (contradictions.length === 0) {
    return false;
  }

  // Multiple contradictions of different types is complex
  const types = new Set(contradictions.map((c) => c.type));
  if (types.size >= 2) {
    return true;
  }

  // Any contradiction with many involved elements is complex
  const hasComplexContradiction = contradictions.some((c) => c.involved.length >= threshold);
  if (hasComplexContradiction) {
    return true;
  }

  // Check for shared elements between contradictions
  if (contradictions.length >= 2) {
    const allElementIds = new Set<string>();
    let hasOverlap = false;

    for (const contradiction of contradictions) {
      for (const involved of contradiction.involved) {
        if (allElementIds.has(involved.id)) {
          hasOverlap = true;
          break;
        }
        allElementIds.add(involved.id);
      }
      if (hasOverlap) {
        break;
      }
    }

    if (hasOverlap) {
      return true;
    }
  }

  return false;
}

/**
 * Performs contradiction detection on the composition.
 *
 * Uses auditor_model to analyze constraints, contracts, and witnesses for
 * logical contradictions that would make implementation impossible.
 *
 * @param input - The composition audit input.
 * @param modelRouter - The model router for LLM calls.
 * @param options - Audit options.
 * @returns The audit result.
 *
 * @example
 * ```typescript
 * const result = await detectContradictions(
 *   {
 *     constraints: spec.constraints,
 *     contracts: latticeOutput.contracts,
 *     witnesses: latticeOutput.witnesses,
 *     claims: spec.claims
 *   },
 *   modelRouter,
 *   { enableCrossVerification: true }
 * );
 *
 * if (result.hasCriticalContradictions) {
 *   // Block proceeding to Injection
 * } else if (!result.hasContradictions) {
 *   // Proceed to Injection immediately
 * }
 * ```
 */
export async function detectContradictions(
  input: CompositionAuditInput,
  modelRouter: ModelRouter,
  options?: CompositionAuditOptions
): Promise<CompositionAuditResult> {
  const opts: Required<CompositionAuditOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Check if there's anything to audit
  const hasContent =
    (input.constraints.functional?.length ?? 0) > 0 ||
    (input.constraints.non_functional?.length ?? 0) > 0 ||
    (input.constraints.security?.length ?? 0) > 0 ||
    input.contracts.length > 0 ||
    input.witnesses.length > 0 ||
    Object.keys(input.claims).length > 0;

  if (!hasContent) {
    return {
      hasContradictions: false,
      contradictions: [],
      hasCriticalContradictions: false,
      summary: 'No constraints, contracts, witnesses, or claims to audit.',
      auditedAt: new Date().toISOString(),
      crossVerified: false,
    };
  }

  // Call auditor_model to detect contradictions
  const auditorPrompt = `${createContradictionAuditorSystemPrompt()}\n\n${createContradictionAuditorUserPrompt(input)}`;

  const auditorResult = await modelRouter.prompt('auditor', auditorPrompt, opts.timeoutMs);

  if (!auditorResult.success) {
    opts.logger(
      `Composition audit failed: ${auditorResult.error.message}. Proceeding without contradiction check.`
    );
    return {
      hasContradictions: false,
      contradictions: [],
      hasCriticalContradictions: false,
      summary: `Auditor analysis failed: ${auditorResult.error.message}`,
      auditedAt: new Date().toISOString(),
      crossVerified: false,
    };
  }

  // Parse the response
  const parsed = parseAuditorResponse(auditorResult.response.content);

  // If no contradictions found, return immediately
  if (!parsed.hasContradictions || parsed.contradictions.length === 0) {
    return {
      hasContradictions: false,
      contradictions: [],
      hasCriticalContradictions: false,
      summary: parsed.summary,
      auditedAt: new Date().toISOString(),
      crossVerified: false,
    };
  }

  let finalContradictions = parsed.contradictions;
  let crossVerified = false;

  // Perform cross-verification for complex cases
  if (
    opts.enableCrossVerification &&
    isComplexCase(parsed.contradictions, opts.complexityThreshold)
  ) {
    const crossVerifyPrompt = `${createCrossVerificationSystemPrompt()}\n\n${createCrossVerificationUserPrompt(parsed.contradictions, input)}`;

    const architectResult = await modelRouter.prompt(
      'architect',
      crossVerifyPrompt,
      opts.timeoutMs
    );

    if (architectResult.success) {
      const verifications = parseCrossVerificationResponse(architectResult.response.content);
      finalContradictions = applyVerificationResults(parsed.contradictions, verifications);
      crossVerified = true;
    } else {
      opts.logger(
        `Cross-verification failed: ${architectResult.error.message}. Using auditor results only.`
      );
    }
  }

  // Determine if there are critical contradictions
  const hasCriticalContradictions = finalContradictions.some((c) => c.severity === 'critical');

  return {
    hasContradictions: finalContradictions.length > 0,
    contradictions: finalContradictions,
    hasCriticalContradictions,
    summary: parsed.summary,
    auditedAt: new Date().toISOString(),
    crossVerified,
  };
}

/**
 * Creates an empty audit result for when auditing is skipped or fails gracefully.
 *
 * @param reason - The reason for the empty result.
 * @returns An empty CompositionAuditResult.
 */
export function createEmptyAuditResult(reason: string): CompositionAuditResult {
  return {
    hasContradictions: false,
    contradictions: [],
    hasCriticalContradictions: false,
    summary: reason,
    auditedAt: new Date().toISOString(),
    crossVerified: false,
  };
}

/**
 * Formats a contradiction for display.
 *
 * @param contradiction - The contradiction to format.
 * @returns Formatted string for display.
 */
export function formatContradiction(contradiction: Contradiction): string {
  const lines: string[] = [];

  // Header with severity indicator
  const severityEmoji = contradiction.severity === 'critical' ? '🔴' : '🟡';
  const typeLabel = contradiction.type.toUpperCase().replace(/_/g, ' ');
  lines.push(`${severityEmoji} [${typeLabel}] ${contradiction.description}`);
  lines.push('');

  // Involved elements
  lines.push('Involved elements:');
  for (const inv of contradiction.involved) {
    lines.push(`  • [${inv.elementType}] ${inv.id}: ${inv.text}`);
  }
  lines.push('');

  // Analysis
  lines.push(`Analysis: ${contradiction.analysis}`);
  lines.push('');

  // Minimal scenario
  lines.push(`Minimal scenario: ${contradiction.minimalScenario}`);

  // Suggested resolutions
  if (contradiction.suggestedResolutions.length > 0) {
    lines.push('');
    lines.push('Suggested resolutions:');
    for (const res of contradiction.suggestedResolutions) {
      lines.push(`  • ${res}`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats the complete audit result for display.
 *
 * @param result - The audit result.
 * @returns Formatted string for display.
 */
export function formatAuditResult(result: CompositionAuditResult): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                   COMPOSITION AUDIT RESULTS                    ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  if (!result.hasContradictions) {
    lines.push('✅ No contradictions detected. The composition appears consistent.');
    lines.push('');
    lines.push(`Summary: ${result.summary}`);
    lines.push('');
    lines.push('→ Proceeding to Injection phase...');
  } else {
    lines.push(`Summary: ${result.summary}`);
    if (result.crossVerified) {
      lines.push('(cross-verified by architect_model)');
    }
    lines.push('');
    lines.push(`Found ${String(result.contradictions.length)} contradiction(s):`);
    lines.push(
      `  • Critical: ${String(result.contradictions.filter((c) => c.severity === 'critical').length)}`
    );
    lines.push(
      `  • Warning: ${String(result.contradictions.filter((c) => c.severity === 'warning').length)}`
    );
    lines.push('');

    let index = 1;
    for (const contradiction of result.contradictions) {
      lines.push(
        `────────────────── Contradiction ${String(index)} of ${String(result.contradictions.length)} ──────────────────`
      );
      lines.push('');
      lines.push(formatContradiction(contradiction));
      lines.push('');
      index++;
    }

    if (result.hasCriticalContradictions) {
      lines.push('⛔ Critical contradictions detected. Cannot proceed to Injection.');
      lines.push('Please resolve the critical contradictions and re-run the audit.');
    } else {
      lines.push('⚠️ Warning-level contradictions detected.');
      lines.push('Review recommended before proceeding to Injection.');
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`Audited at: ${result.auditedAt}`);

  return lines.join('\n');
}

/**
 * Gets only the critical contradictions from a result.
 *
 * @param result - The audit result.
 * @returns Only the critical severity contradictions.
 */
export function getCriticalContradictions(
  result: CompositionAuditResult
): readonly Contradiction[] {
  return result.contradictions.filter((c) => c.severity === 'critical');
}

/**
 * Checks if the audit result allows proceeding to Injection.
 *
 * Proceeding is allowed if:
 * - No contradictions were found, OR
 * - All contradictions are warnings (none are critical)
 *
 * @param result - The audit result.
 * @returns True if proceeding to Injection is allowed.
 */
export function canProceedToInjection(result: CompositionAuditResult): boolean {
  return !result.hasCriticalContradictions;
}
