/**
 * LLM-based claim parser for the Criticality Protocol.
 *
 * Uses a model router to parse natural language claims from spec.toml
 * into structured testable properties as specified in SPECIFICATION.md section 6.
 *
 * @packageDocumentation
 */

import type { ModelRouter } from '../../router/index.js';
import type { SpecClaim } from '../../spec/types.js';

/**
 * Result of parsing a single claim.
 */
export interface ClaimParseResult {
  /** The original claim ID. */
  id: string;
  /** The structured claim data. */
  structuredClaim: SpecClaim;
  /** Whether parsing was successful. */
  success: boolean;
  /** Error message if parsing failed. */
  error?: string;
}

/**
 * System prompt for claim parsing.
 */
const CLAIM_PARSER_SYSTEM_PROMPT = `
You are a formal logic auditor for the Criticality Protocol.
Your task is to parse natural language claims into a structured JSON format.

Claims fall into these categories:
- invariant: "X is always true" (e.g., "Balance never negative")
- behavioral: "When X happens, Y results" (e.g., "Transfer updates balances")
- negative: "X cannot cause Y" (e.g., "Overdrafting is blocked")
- temporal: "After X, Y holds until Z" (e.g., "Session valid for 30min")
- concurrent: "Concurrent X preserves Y" (e.g., "Race-free increments")
- performance: "X completes in O(f(n))" (e.g., "Lookup is O(1)")

Output ONLY valid JSON matching the following schema. No explanations or markdown blocks.

{
  "type": "invariant" | "behavioral" | "negative" | "temporal" | "concurrent" | "performance",
  "testable": boolean,
  "subject": string (optional, for invariants),
  "predicate": string (optional, for invariants),
  "trigger": string (optional, for behavioral),
  "outcome": string (optional, for behavioral),
  "action": string (optional, for negative),
  "forbidden_outcome": string (optional, for negative),
  "setup": string (optional, for temporal),
  "invariant": string (optional, for temporal),
  "termination": string (optional, for temporal),
  "operation": string (optional, for concurrent/performance),
  "complexity": string (optional, for performance),
  "requires_mocking": string[] (optional)
}
`;

/**
 * LLM-based claim parser.
 */
export class ClaimParser {
  private readonly router: ModelRouter;

  /**
   * Creates a new ClaimParser.
   *
   * @param router - The model router to use for LLM calls.
   */
  constructor(router: ModelRouter) {
    this.router = router;
  }

  /**
   * Parses a natural language claim into a structured SpecClaim.
   *
   * @param id - The claim identifier.
   * @param claim - The raw claim from the spec.
   * @returns A promise that resolves to the parse result.
   */
  async parseClaim(id: string, claim: SpecClaim): Promise<ClaimParseResult> {
    const userPrompt = `
Parse the following claim:
ID: ${id}
TYPE: ${claim.type}
TEXT: ${claim.text}

Return structured JSON.
`;

    try {
      const result = await this.router.complete({
        modelAlias: 'auditor',
        prompt: userPrompt,
        parameters: {
          systemPrompt: CLAIM_PARSER_SYSTEM_PROMPT,
        },
      });

      if (!result.success) {
        return {
          id,
          structuredClaim: claim,
          success: false,
          error: result.error.message,
        };
      }

      // Extract JSON from response (handling potential markdown blocks if LLM ignores instructions)
      let jsonText = result.response.content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const structured = JSON.parse(jsonText) as Partial<SpecClaim>;

      // Merge with original claim to preserve fields if LLM missed them
      const finalClaim: SpecClaim = {
        ...claim,
        ...structured,
        // Ensure text and ID-related fields are preserved correctly
        text: claim.text,
        type: structured.type ?? claim.type,
      };

      return {
        id,
        structuredClaim: finalClaim,
        success: true,
      };
    } catch (error) {
      return {
        id,
        structuredClaim: claim,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parses multiple claims in parallel.
   *
   * @param claims - Map of claim ID to SpecClaim.
   * @returns A promise that resolves to a map of claim ID to parse result.
   */
  async parseClaims(claims: Record<string, SpecClaim>): Promise<Map<string, ClaimParseResult>> {
    const results = new Map<string, ClaimParseResult>();
    const promises = Object.entries(claims).map(([id, claim]) =>
      this.parseClaim(id, claim).then((res) => results.set(id, res))
    );

    await Promise.all(promises);
    return results;
  }
}
