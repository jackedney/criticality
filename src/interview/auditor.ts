/**
 * Adversarial auditor for the Ignition phase.
 *
 * Challenges Architect proposals for logical consistency by checking for:
 * - Temporal contradictions (e.g., session timeout vs operation duration)
 * - Resource conflicts (e.g., conflicting resource requirements)
 * - Invariant violations (e.g., contradictory state requirements)
 * - Precondition gaps (e.g., missing prerequisites for operations)
 *
 * Uses auditor_model via ModelRouter to perform adversarial analysis.
 *
 * @packageDocumentation
 */

import type { ExtractedRequirement } from './types.js';
import type { ModelRouter } from '../router/types.js';

/**
 * Types of issues the auditor can detect.
 */
export type AuditorIssueType =
  | 'temporal_contradiction'
  | 'resource_conflict'
  | 'invariant_violation'
  | 'precondition_gap';

/**
 * Severity levels for auditor findings.
 */
export type AuditorIssueSeverity = 'critical' | 'warning' | 'info';

/**
 * An issue detected by the adversarial auditor.
 */
export interface AuditorIssue {
  /** Unique identifier for the issue. */
  readonly id: string;
  /** The type of issue detected. */
  readonly type: AuditorIssueType;
  /** Severity of the issue. */
  readonly severity: AuditorIssueSeverity;
  /** Human-readable description of the issue. */
  readonly description: string;
  /** IDs of requirements involved in the issue. */
  readonly involvedRequirementIds: readonly string[];
  /** Detailed analysis explaining the conflict. */
  readonly analysis: string;
  /** Example scenario that demonstrates the issue. */
  readonly exampleScenario?: string;
  /** Suggested resolutions for the issue. */
  readonly suggestedResolutions: readonly string[];
}

/**
 * Result of an auditor analysis.
 */
export interface AuditorResult {
  /** Whether any issues were found. */
  readonly hasIssues: boolean;
  /** List of detected issues. */
  readonly issues: readonly AuditorIssue[];
  /** Whether there are critical issues that require resolution. */
  readonly hasCriticalIssues: boolean;
  /** Summary of the analysis. */
  readonly summary: string;
  /** Timestamp of the analysis. */
  readonly analyzedAt: string;
}

/**
 * Response from the Architect addressing auditor findings.
 */
export interface ArchitectResponse {
  /** The issue ID being addressed. */
  readonly issueId: string;
  /** The Architect's explanation or defense. */
  readonly explanation: string;
  /** Whether the Architect accepts this is an issue. */
  readonly accepted: boolean;
  /** Proposed resolution if accepted. */
  readonly proposedResolution?: string;
}

/**
 * Combined finding with both auditor issue and architect response.
 */
export interface AuditorFinding {
  /** The auditor's detected issue. */
  readonly issue: AuditorIssue;
  /** The Architect's response to the issue. */
  readonly architectResponse?: ArchitectResponse;
  /** Final status after Architect review. */
  readonly status: 'pending' | 'resolved' | 'disputed' | 'user_decision_required';
}

/**
 * Options for the auditor analysis.
 */
export interface AuditorOptions {
  /** The model router to use for LLM calls. */
  readonly modelRouter: ModelRouter;
  /** Whether to include Architect responses. */
  readonly includeArchitectResponse?: boolean;
  /** Timeout for LLM calls in milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * Issue type descriptions for prompts.
 */
export const ISSUE_TYPE_DESCRIPTIONS: Readonly<Record<AuditorIssueType, string>> = {
  temporal_contradiction:
    'Time-related conflicts where durations, timeouts, or schedules contradict each other',
  resource_conflict: 'Conflicts in resource allocation, capacity, or concurrent access',
  invariant_violation:
    'Contradictions in state requirements that cannot be simultaneously satisfied',
  precondition_gap: 'Missing prerequisites or assumptions that operations depend on',
};

/**
 * All auditor issue types.
 */
export const AUDITOR_ISSUE_TYPES: readonly AuditorIssueType[] = [
  'temporal_contradiction',
  'resource_conflict',
  'invariant_violation',
  'precondition_gap',
] as const;

/**
 * Checks if a string is a valid AuditorIssueType.
 *
 * @param value - The string to check.
 * @returns True if the value is a valid AuditorIssueType.
 */
export function isValidAuditorIssueType(value: string): value is AuditorIssueType {
  return AUDITOR_ISSUE_TYPES.includes(value as AuditorIssueType);
}

/**
 * Generates a unique issue ID.
 */
function generateIssueId(type: AuditorIssueType): string {
  const prefix = type
    .split('_')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return `${prefix}_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates the system prompt for the adversarial auditor.
 */
function createAuditorSystemPrompt(): string {
  return `You are an adversarial auditor for software specifications. Your role is to critically analyze requirements and proposals to find logical inconsistencies, contradictions, and gaps.

You must check for these specific types of issues:

1. TEMPORAL CONTRADICTIONS: Time-related conflicts where durations, timeouts, or schedules contradict each other.
   Example: "Sessions expire after 30 minutes" conflicts with "File uploads can take up to 2 hours"

2. RESOURCE CONFLICTS: Conflicts in resource allocation, capacity, or concurrent access.
   Example: "Database supports 100 concurrent connections" conflicts with "Each user session uses 5 database connections" when supporting "1000 concurrent users"

3. INVARIANT VIOLATIONS: Contradictions in state requirements that cannot be simultaneously satisfied.
   Example: "Account balance must always be non-negative" conflicts with "Overdraft protection allows temporary negative balance"

4. PRECONDITION GAPS: Missing prerequisites or assumptions that operations depend on.
   Example: "User can view dashboard" but no mention of authentication requirements or how user identity is established

Be thorough but fair. Only report genuine issues, not stylistic preferences or minor clarifications.
For each issue found, provide:
- Clear description of the conflict
- Which requirements are involved
- A concrete example scenario demonstrating the problem
- Suggested resolutions

If no issues are found, explicitly state that the specification appears consistent.

Output your analysis in the following JSON format:
{
  "hasIssues": boolean,
  "issues": [
    {
      "type": "temporal_contradiction" | "resource_conflict" | "invariant_violation" | "precondition_gap",
      "severity": "critical" | "warning" | "info",
      "description": "Brief description",
      "involvedRequirementIds": ["id1", "id2"],
      "analysis": "Detailed analysis",
      "exampleScenario": "Optional concrete example",
      "suggestedResolutions": ["Resolution 1", "Resolution 2"]
    }
  ],
  "summary": "Overall summary of findings"
}`;
}

/**
 * Creates the user prompt for auditing requirements.
 *
 * @param requirements - The requirements to audit.
 */
function createAuditorUserPrompt(requirements: readonly ExtractedRequirement[]): string {
  const formattedRequirements = requirements
    .map((req) => `[${req.id}] (${req.category}, ${req.confidence} confidence): ${req.text}`)
    .join('\n');

  return `Analyze the following specification requirements for logical consistency. Look for temporal contradictions, resource conflicts, invariant violations, and precondition gaps.

REQUIREMENTS:
${formattedRequirements}

Provide your analysis in the specified JSON format. Be thorough but only report genuine issues.`;
}

/**
 * Creates the system prompt for the Architect to respond to auditor findings.
 */
function createArchitectResponseSystemPrompt(): string {
  return `You are the Architect defending a software specification. An adversarial auditor has identified potential issues with the specification.

For each issue, you must:
1. Carefully consider whether the auditor's concern is valid
2. Either accept the issue and propose a resolution, OR explain why it's not actually a problem
3. Be honest - if the auditor found a real issue, acknowledge it

Output your response in the following JSON format:
{
  "responses": [
    {
      "issueId": "the issue ID",
      "accepted": boolean,
      "explanation": "Your explanation",
      "proposedResolution": "If accepted, your proposed fix"
    }
  ]
}`;
}

/**
 * Creates the user prompt for the Architect to respond to issues.
 *
 * @param issues - The issues to respond to.
 * @param requirements - The original requirements for context.
 */
function createArchitectResponseUserPrompt(
  issues: readonly AuditorIssue[],
  requirements: readonly ExtractedRequirement[]
): string {
  const formattedRequirements = requirements.map((req) => `[${req.id}]: ${req.text}`).join('\n');

  const formattedIssues = issues
    .map(
      (issue) =>
        `[${issue.id}] ${issue.type} (${issue.severity}):
  Description: ${issue.description}
  Analysis: ${issue.analysis}
  Involved: ${issue.involvedRequirementIds.join(', ')}
  ${issue.exampleScenario !== undefined ? `Example: ${issue.exampleScenario}` : ''}`
    )
    .join('\n\n');

  return `ORIGINAL REQUIREMENTS:
${formattedRequirements}

AUDITOR FINDINGS:
${formattedIssues}

Respond to each issue. Accept valid concerns and propose fixes, or explain why the concern is not actually a problem.`;
}

/**
 * Parses the auditor's JSON response.
 *
 * @param content - The raw response content.
 * @returns Parsed issues or empty array if parsing fails.
 */
function parseAuditorResponse(content: string): {
  issues: AuditorIssue[];
  summary: string;
  hasIssues: boolean;
} {
  try {
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    const jsonMatch = /\{[\s\S]*\}/.exec(content);
    if (jsonMatch === null) {
      return { issues: [], summary: 'Failed to parse auditor response', hasIssues: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      hasIssues?: boolean;
      issues?: {
        type?: string;
        severity?: string;
        description?: string;
        involvedRequirementIds?: string[];
        analysis?: string;
        exampleScenario?: string;
        suggestedResolutions?: string[];
      }[];
      summary?: string;
    };

    const issues: AuditorIssue[] = [];

    if (Array.isArray(parsed.issues)) {
      for (const item of parsed.issues) {
        const type = item.type;
        if (typeof type !== 'string' || !isValidAuditorIssueType(type)) {
          continue;
        }

        const severity = item.severity;
        if (typeof severity !== 'string' || !['critical', 'warning', 'info'].includes(severity)) {
          continue;
        }

        const description = item.description;
        if (typeof description !== 'string') {
          continue;
        }

        const analysis = item.analysis;
        if (typeof analysis !== 'string') {
          continue;
        }

        const involvedRequirementIds = Array.isArray(item.involvedRequirementIds)
          ? item.involvedRequirementIds.filter((id): id is string => typeof id === 'string')
          : [];

        const suggestedResolutions = Array.isArray(item.suggestedResolutions)
          ? item.suggestedResolutions.filter((r): r is string => typeof r === 'string')
          : [];

        // Build issue with conditional exampleScenario
        const baseIssue = {
          id: generateIssueId(type),
          type,
          severity: severity as AuditorIssueSeverity,
          description,
          involvedRequirementIds,
          analysis,
          suggestedResolutions,
        };

        const exampleScenario = item.exampleScenario;
        if (typeof exampleScenario === 'string') {
          issues.push({ ...baseIssue, exampleScenario });
        } else {
          issues.push(baseIssue);
        }
      }
    }

    return {
      issues,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary provided',
      hasIssues: parsed.hasIssues === true || issues.length > 0,
    };
  } catch {
    return { issues: [], summary: 'Failed to parse auditor response', hasIssues: false };
  }
}

/**
 * Parses the Architect's response to auditor findings.
 *
 * @param content - The raw response content.
 * @returns Parsed responses.
 */
function parseArchitectResponses(content: string): ArchitectResponse[] {
  try {
    const jsonMatch = /\{[\s\S]*\}/.exec(content);
    if (jsonMatch === null) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      responses?: {
        issueId?: string;
        accepted?: boolean;
        explanation?: string;
        proposedResolution?: string;
      }[];
    };

    const responses: ArchitectResponse[] = [];

    if (Array.isArray(parsed.responses)) {
      for (const item of parsed.responses) {
        const issueId = item.issueId;
        if (typeof issueId !== 'string') {
          continue;
        }

        const explanation = item.explanation;
        if (typeof explanation !== 'string') {
          continue;
        }

        const accepted = item.accepted === true;

        const baseResponse = {
          issueId,
          accepted,
          explanation,
        };

        const proposedResolution = item.proposedResolution;
        if (accepted && typeof proposedResolution === 'string') {
          responses.push({ ...baseResponse, proposedResolution });
        } else {
          responses.push(baseResponse);
        }
      }
    }

    return responses;
  } catch {
    return [];
  }
}

/**
 * Performs adversarial audit on extracted requirements.
 *
 * Uses the auditor_model via ModelRouter to analyze requirements for
 * logical consistency issues.
 *
 * @param requirements - The extracted requirements to audit.
 * @param options - Audit options including the model router.
 * @returns The audit result.
 *
 * @example
 * ```typescript
 * const result = await auditRequirements(requirements, {
 *   modelRouter: router,
 *   includeArchitectResponse: true
 * });
 *
 * if (result.hasCriticalIssues) {
 *   // Present issues to user for resolution
 * }
 * ```
 */
export async function auditRequirements(
  requirements: readonly ExtractedRequirement[],
  options: AuditorOptions
): Promise<AuditorResult> {
  const { modelRouter, timeoutMs } = options;

  // If no requirements, return early with no issues
  if (requirements.length === 0) {
    return {
      hasIssues: false,
      issues: [],
      hasCriticalIssues: false,
      summary: 'No requirements to audit.',
      analyzedAt: new Date().toISOString(),
    };
  }

  // Call auditor_model to analyze requirements
  const auditorResult = await modelRouter.prompt(
    'auditor',
    `${createAuditorSystemPrompt()}\n\n${createAuditorUserPrompt(requirements)}`,
    timeoutMs
  );

  if (!auditorResult.success) {
    // Return empty result on error - don't block the process
    return {
      hasIssues: false,
      issues: [],
      hasCriticalIssues: false,
      summary: `Auditor analysis failed: ${auditorResult.error.message}`,
      analyzedAt: new Date().toISOString(),
    };
  }

  // Parse the response
  const parsed = parseAuditorResponse(auditorResult.response.content);

  // Determine if there are critical issues
  const hasCriticalIssues = parsed.issues.some((issue) => issue.severity === 'critical');

  return {
    hasIssues: parsed.hasIssues,
    issues: parsed.issues,
    hasCriticalIssues,
    summary: parsed.summary,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Gets Architect responses to auditor findings.
 *
 * @param issues - The issues detected by the auditor.
 * @param requirements - The original requirements for context.
 * @param options - Options including the model router.
 * @returns The Architect's responses.
 */
export async function getArchitectResponses(
  issues: readonly AuditorIssue[],
  requirements: readonly ExtractedRequirement[],
  options: AuditorOptions
): Promise<readonly ArchitectResponse[]> {
  const { modelRouter, timeoutMs } = options;

  if (issues.length === 0) {
    return [];
  }

  const architectResult = await modelRouter.prompt(
    'architect',
    `${createArchitectResponseSystemPrompt()}\n\n${createArchitectResponseUserPrompt(issues, requirements)}`,
    timeoutMs
  );

  if (!architectResult.success) {
    return [];
  }

  return parseArchitectResponses(architectResult.response.content);
}

/**
 * Combines auditor issues with Architect responses into findings.
 *
 * @param issues - The auditor's detected issues.
 * @param architectResponses - The Architect's responses.
 * @returns Combined findings with status.
 */
export function combineFindings(
  issues: readonly AuditorIssue[],
  architectResponses: readonly ArchitectResponse[]
): readonly AuditorFinding[] {
  const responseMap = new Map<string, ArchitectResponse>();
  for (const response of architectResponses) {
    responseMap.set(response.issueId, response);
  }

  return issues.map((issue) => {
    const architectResponse = responseMap.get(issue.id);

    let status: AuditorFinding['status'];
    if (architectResponse === undefined) {
      status = 'pending';
    } else if (architectResponse.accepted) {
      status = 'resolved';
    } else {
      // Architect disputed the issue - needs user decision
      status = 'user_decision_required';
    }

    // Build finding with conditional architectResponse
    if (architectResponse !== undefined) {
      return { issue, architectResponse, status };
    }
    return { issue, status };
  });
}

/**
 * Performs a full adversarial audit with Architect responses.
 *
 * This is the main entry point for the adversarial auditor integration.
 * It runs the auditor, gets Architect responses, and combines them into findings.
 *
 * @param requirements - The requirements to audit.
 * @param options - Audit options.
 * @returns Combined findings ready for user review.
 *
 * @example
 * ```typescript
 * const { result, findings } = await performAdversarialAudit(requirements, {
 *   modelRouter: router
 * });
 *
 * if (result.hasIssues) {
 *   for (const finding of findings) {
 *     console.log(`Issue: ${finding.issue.description}`);
 *     if (finding.architectResponse) {
 *       console.log(`Architect: ${finding.architectResponse.explanation}`);
 *     }
 *   }
 * } else {
 *   console.log('No issues found - proceeding');
 * }
 * ```
 */
export async function performAdversarialAudit(
  requirements: readonly ExtractedRequirement[],
  options: AuditorOptions
): Promise<{
  readonly result: AuditorResult;
  readonly findings: readonly AuditorFinding[];
}> {
  // Run the auditor
  const result = await auditRequirements(requirements, options);

  // If no issues, return early without bothering the Architect
  if (!result.hasIssues || result.issues.length === 0) {
    return {
      result,
      findings: [],
    };
  }

  // Get Architect responses if option is enabled (default: true)
  const includeArchitect = options.includeArchitectResponse !== false;

  let findings: readonly AuditorFinding[];
  if (includeArchitect) {
    const architectResponses = await getArchitectResponses(result.issues, requirements, options);
    findings = combineFindings(result.issues, architectResponses);
  } else {
    // No Architect responses - all findings are pending
    findings = result.issues.map((issue) => ({
      issue,
      status: 'pending' as const,
    }));
  }

  return { result, findings };
}

/**
 * Formats an auditor finding for display to the user.
 *
 * @param finding - The finding to format.
 * @returns Formatted string for display.
 */
export function formatFinding(finding: AuditorFinding): string {
  const { issue, architectResponse, status } = finding;

  const lines: string[] = [];

  // Issue header
  const severityEmoji =
    issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
  lines.push(
    `${severityEmoji} [${issue.type.toUpperCase().replace(/_/g, ' ')}] ${issue.description}`
  );
  lines.push('');

  // Analysis
  lines.push(`Analysis: ${issue.analysis}`);

  // Example scenario if present
  if (issue.exampleScenario !== undefined) {
    lines.push('');
    lines.push(`Example: ${issue.exampleScenario}`);
  }

  // Suggested resolutions
  if (issue.suggestedResolutions.length > 0) {
    lines.push('');
    lines.push('Suggested resolutions:');
    for (const resolution of issue.suggestedResolutions) {
      lines.push(`  • ${resolution}`);
    }
  }

  // Architect response if present
  if (architectResponse !== undefined) {
    lines.push('');
    lines.push('---');
    lines.push(`Architect response: ${architectResponse.accepted ? '✓ Accepted' : '✗ Disputed'}`);
    lines.push(architectResponse.explanation);
    if (architectResponse.proposedResolution !== undefined) {
      lines.push(`Proposed fix: ${architectResponse.proposedResolution}`);
    }
  }

  // Status
  lines.push('');
  lines.push(
    `Status: ${status === 'resolved' ? '✓ Resolved' : status === 'disputed' ? '⚠ Disputed' : status === 'user_decision_required' ? '❓ Requires your decision' : '⏳ Pending'}`
  );

  return lines.join('\n');
}

/**
 * Formats the complete audit result for display.
 *
 * @param result - The audit result.
 * @param findings - The combined findings.
 * @returns Formatted string for display.
 */
export function formatAuditResult(
  result: AuditorResult,
  findings: readonly AuditorFinding[]
): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    ADVERSARIAL AUDIT RESULTS                   ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  if (!result.hasIssues) {
    lines.push('✅ No issues detected. The specification appears logically consistent.');
    lines.push('');
    lines.push('The auditor checked for:');
    for (const [type, desc] of Object.entries(ISSUE_TYPE_DESCRIPTIONS)) {
      lines.push(`  • ${type.replace(/_/g, ' ')}: ${desc}`);
    }
    lines.push('');
    lines.push('Proceeding with specification...');
  } else {
    lines.push(`Summary: ${result.summary}`);
    lines.push('');
    lines.push(`Found ${String(result.issues.length)} issue(s):`);
    lines.push(
      `  • Critical: ${String(result.issues.filter((i) => i.severity === 'critical').length)}`
    );
    lines.push(
      `  • Warning: ${String(result.issues.filter((i) => i.severity === 'warning').length)}`
    );
    lines.push(`  • Info: ${String(result.issues.filter((i) => i.severity === 'info').length)}`);
    lines.push('');

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      if (finding === undefined) {
        continue;
      }
      lines.push(
        `────────────────────── Issue ${String(i + 1)} of ${String(findings.length)} ──────────────────────`
      );
      lines.push('');
      lines.push(formatFinding(finding));
      lines.push('');
    }
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Creates an empty audit result (for when auditing is skipped or fails).
 *
 * @param reason - The reason for the empty result.
 * @returns An AuditorResult with no issues.
 */
export function createEmptyAuditResult(reason: string): AuditorResult {
  return {
    hasIssues: false,
    issues: [],
    hasCriticalIssues: false,
    summary: reason,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Checks if any findings require user decision.
 *
 * @param findings - The findings to check.
 * @returns True if any finding needs user input.
 */
export function requiresUserDecision(findings: readonly AuditorFinding[]): boolean {
  return findings.some((f) => f.status === 'user_decision_required' || f.status === 'pending');
}

/**
 * Gets only the critical findings.
 *
 * @param findings - All findings.
 * @returns Only the critical severity findings.
 */
export function getCriticalFindings(
  findings: readonly AuditorFinding[]
): readonly AuditorFinding[] {
  return findings.filter((f) => f.issue.severity === 'critical');
}
