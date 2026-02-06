/**
 * Transformation catalog for Mass Defect phase.
 *
 * Provides indexed access to smells and patterns with pattern selection algorithm.
 *
 * @packageDocumentation
 */

import type {
  SmellDefinition,
  PatternDefinition,
  SmellCategory,
  RiskLevel,
  DetectedSmell,
  FunctionContext,
  TransformationType,
} from './types.js';

/**
 * Catalog for accessing smells and patterns with indexed lookups.
 */
export class TransformationCatalog {
  constructor(
    private readonly smells: Map<string, SmellDefinition>,
    private readonly patterns: Map<string, PatternDefinition>
  ) {}

  /**
   * Get a smell definition by ID.
   *
   * @param id - The smell ID.
   * @returns The smell definition or null if not found.
   */
  getSmell(id: string): SmellDefinition | null {
    return this.smells.get(id) ?? null;
  }

  /**
   * Get a pattern definition by ID.
   *
   * @param id - The pattern ID.
   * @returns The pattern definition or null if not found.
   */
  getPattern(id: string): PatternDefinition | null {
    return this.patterns.get(id) ?? null;
  }

  /**
   * Get all smells in a category.
   *
   * @param category - The smell category.
   * @returns Array of smell definitions in category.
   */
  getSmellsByCategory(category: SmellCategory): SmellDefinition[] {
    return Array.from(this.smells.values()).filter((s) => s.category === category);
  }

  /**
   * Select applicable patterns for detected smells.
   *
   * Algorithm:
   * 1. Collect all applicable patterns from detected smells
   * 2. Skip patterns already attempted on this function
   * 3. Deduplicate (same pattern may address multiple smells)
   * 4. Sort by: risk (ascending), then enables-count (descending)
   *
   * @param detectedSmells - Array of detected smells.
   * @param functionContext - Context about the function being transformed.
   * @returns Ordered array of transformations to attempt.
   */
  selectPatterns(
    detectedSmells: DetectedSmell[],
    functionContext: FunctionContext
  ): TransformationType[] {
    interface ScoredPattern {
      patternId: string;
      smellId: string;
      risk: RiskLevel;
      enablesCount: number;
      severity: number;
      prompt: string;
    }

    const candidates: ScoredPattern[] = [];

    for (const detected of detectedSmells) {
      const smell = this.getSmell(detected.smellId);
      if (!smell) {
        continue;
      }

      for (const ref of smell.applicablePatterns) {
        if (functionContext.previouslyAttempted.includes(ref.patternId)) {
          continue;
        }

        const pattern = this.getPattern(ref.patternId);
        if (!pattern) {
          continue;
        }

        candidates.push({
          patternId: ref.patternId,
          smellId: detected.smellId,
          risk: ref.risk,
          enablesCount: pattern.enables.length,
          severity: detected.severity,
          prompt: pattern.prompt.template,
        });
      }
    }

    const deduped = deduplicateByPatternId(candidates);

    deduped.sort((a, b) => {
      if (a.risk !== b.risk) {
        return a.risk - b.risk;
      }
      return b.enablesCount - a.enablesCount;
    });

    return deduped.map((p) => ({
      patternId: p.patternId,
      smell: p.smellId,
      risk: p.risk,
      prompt: p.prompt,
    }));
  }
}

/**
 * Deduplicates patterns by ID, keeping the one with highest severity.
 */
function deduplicateByPatternId(
  candidates: Array<{
    patternId: string;
    smellId: string;
    risk: RiskLevel;
    enablesCount: number;
    severity: number;
    prompt: string;
  }>
): Array<{
  patternId: string;
  smellId: string;
  risk: RiskLevel;
  enablesCount: number;
  severity: number;
  prompt: string;
}> {
  const seen = new Map<
    string,
    {
      patternId: string;
      smellId: string;
      risk: RiskLevel;
      enablesCount: number;
      severity: number;
      prompt: string;
    }
  >();

  for (const c of candidates) {
    const existing = seen.get(c.patternId);
    if (!existing || c.severity > existing.severity) {
      seen.set(c.patternId, c);
    }
  }

  return Array.from(seen.values());
}
