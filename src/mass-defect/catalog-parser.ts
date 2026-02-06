/**
 * TOML catalog parser for Mass Defect phase.
 *
 * Parses smell and pattern definitions from TOML files with validation.
 *
 * @packageDocumentation
 */

import * as toml from '@iarna/toml';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PatternReference,
  DetectionCriteria,
  ToolRule,
  SmellDefinition,
  PatternDefinition,
  VerificationScope,
  PromptTemplate,
  TransformationCatalog,
  SmellCategory,
  RiskLevel,
  DetectedSmell,
  FunctionContext,
  TransformationType,
} from './types.js';

/**
 * Error type for catalog parsing failures.
 */
export interface CatalogParseError {
  /** Discriminator for error type. */
  error: true;
  /** Type of parsing error. */
  type: 'parse_error' | 'validation_error';
  /** Human-readable error message. */
  message: string;
  /** Path to the file that caused the error. */
  filePath: string;
  /** Field name that caused the error. */
  field?: string;
}

/**
 * Result type for parsing functions.
 */
export type ParseResult<T> = T | CatalogParseError;

/**
 * Type guard to check if a result is an error.
 */
export function isCatalogError<T>(result: ParseResult<T>): result is CatalogParseError {
  return typeof result === 'object' && result !== null && 'error' in result && result.error;
}

/**
 * Creates a catalog parse error.
 */
function createError(
  type: 'parse_error' | 'validation_error',
  message: string,
  filePath: string,
  field?: string
): CatalogParseError {
  if (field !== undefined) {
    return { error: true, type, message, filePath, field };
  }
  return { error: true, type, message, filePath };
}

/**
 * Valid smell categories.
 */
const VALID_SMELL_CATEGORIES = new Set<SmellCategory>([
  'control-flow',
  'duplication',
  'idiom-violation',
  'dead-weight',
  'clarity-debt',
]);

/**
 * Valid risk levels.
 */
const VALID_RISK_LEVELS = [1, 2, 3, 4] as const;

/**
 * Parses a smell definition from TOML string.
 *
 * @param tomlStr - The TOML string to parse.
 * @returns Either a SmellDefinition or a CatalogParseError.
 */
export function parseSmellDefinition(tomlStr: string): ParseResult<SmellDefinition> {
  let parsed: unknown;
  try {
    parsed = toml.parse(tomlStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createError('parse_error', `Failed to parse TOML: ${message}`, '<string>');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return createError('validation_error', 'Parsed TOML is not an object', '<string>');
  }

  const root = parsed as Record<string, unknown>;

  const smellSection = root.smell;
  if (typeof smellSection !== 'object' || smellSection === null) {
    return createError('validation_error', 'Missing [smell] section', '<string>');
  }

  const smell = smellSection as Record<string, unknown>;

  const id = smell.id;
  if (typeof id !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "id" field in [smell]',
      '<string>',
      'smell.id'
    );
  }

  const name = smell.name;
  if (typeof name !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "name" field in [smell]',
      '<string>',
      'smell.name'
    );
  }

  const category = smell.category;
  if (typeof category !== 'string' || !VALID_SMELL_CATEGORIES.has(category as SmellCategory)) {
    return createError(
      'validation_error',
      `Invalid "category" field in [smell]. Must be one of: ${Array.from(VALID_SMELL_CATEGORIES).join(', ')}`,
      '<string>',
      'smell.category'
    );
  }

  const description = smell.description;
  if (typeof description !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "description" field in [smell]',
      '<string>',
      'smell.description'
    );
  }

  const detectionSection = root.detection;
  if (typeof detectionSection !== 'object' || detectionSection === null) {
    return createError('validation_error', 'Missing [detection] section', '<string>');
  }

  const detection = detectionSection as Record<string, unknown>;
  const detectionCriteria: DetectionCriteria = {
    tools: [],
    heuristics: [],
  };

  const thresholdsRecord: Record<string, number> = {};
  for (const [key, value] of Object.entries(detection)) {
    if (key === 'tools' || key === 'heuristics' || key === 'thresholds') {
      continue;
    }
    if (typeof value === 'number') {
      thresholdsRecord[key] = value;
    }
  }

  if (Object.keys(thresholdsRecord).length > 0) {
    detectionCriteria.thresholds = thresholdsRecord;
  }

  const tools = detection.tools;
  if (!Array.isArray(tools)) {
    return createError(
      'validation_error',
      'Missing or invalid "tools" field in [detection]',
      '<string>',
      'detection.tools'
    );
  }

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i] as Record<string, unknown> | null;
    if (tool === null || typeof tool !== 'object') {
      return createError(
        'validation_error',
        `Invalid tool at index ${String(i)} in detection.tools`,
        '<string>',
        `detection.tools[${String(i)}]`
      );
    }

    const toolObj: Record<string, unknown> = tool;
    const name = toolObj.name;
    const rule = toolObj.rule;
    if (typeof name !== 'string') {
      return createError(
        'validation_error',
        `Missing "name" in tool at index ${String(i)}`,
        '<string>',
        `detection.tools[${String(i)}].name`
      );
    }
    if (typeof rule !== 'string') {
      return createError(
        'validation_error',
        `Missing "rule" in tool at index ${String(i)}`,
        '<string>',
        `detection.tools[${String(i)}].rule`
      );
    }
    detectionCriteria.tools.push({ name, rule } as ToolRule);
  }

  const heuristicsSection = detection.heuristics;
  if (
    typeof heuristicsSection === 'object' &&
    heuristicsSection !== null &&
    'patterns' in heuristicsSection &&
    Array.isArray(heuristicsSection.patterns)
  ) {
    const patterns = heuristicsSection.patterns;
    for (const pattern of patterns) {
      if (typeof pattern === 'string') {
        detectionCriteria.heuristics.push(pattern);
      }
    }
  }

  const applicablePatterns = root.applicable_patterns;
  const parsedPatterns: PatternReference[] = [];
  if (Array.isArray(applicablePatterns)) {
    for (let i = 0; i < applicablePatterns.length; i++) {
      const pattern = applicablePatterns[i] as Record<string, unknown> | null;
      if (pattern === null || typeof pattern !== 'object') {
        return createError(
          'validation_error',
          `Invalid applicable pattern at index ${String(i)}`,
          '<string>',
          `applicable_patterns[${String(i)}]`
        );
      }

      const patternObj: Record<string, unknown> = pattern;
      const patternId = patternObj.pattern;
      const risk = patternObj.risk;
      const rationale = patternObj.rationale;

      if (typeof patternId !== 'string') {
        return createError(
          'validation_error',
          `Missing "pattern" at index ${String(i)}`,
          '<string>',
          `applicable_patterns[${String(i)}].pattern`
        );
      }

      if (typeof risk !== 'number' || !VALID_RISK_LEVELS.includes(risk as RiskLevel)) {
        return createError(
          'validation_error',
          `Invalid "risk" at index ${String(i)}. Must be 1, 2, 3, or 4`,
          '<string>',
          `applicable_patterns[${String(i)}].risk`
        );
      }

      if (typeof rationale !== 'string') {
        return createError(
          'validation_error',
          `Missing "rationale" at index ${String(i)}`,
          '<string>',
          `applicable_patterns[${String(i)}].rationale`
        );
      }

      parsedPatterns.push({
        patternId,
        risk: risk as RiskLevel,
        rationale,
      } as PatternReference);
    }
  }

  return {
    id,
    name,
    category: category as SmellCategory,
    description,
    detection: detectionCriteria,
    applicablePatterns: parsedPatterns,
  };
}

/**
 * Parses a pattern definition from TOML string.
 *
 * @param tomlStr - The TOML string to parse.
 * @returns Either a PatternDefinition or a CatalogParseError.
 */
export function parsePatternDefinition(tomlStr: string): ParseResult<PatternDefinition> {
  let parsed: unknown;
  try {
    parsed = toml.parse(tomlStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createError('parse_error', `Failed to parse TOML: ${message}`, '<string>');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return createError('validation_error', 'Parsed TOML is not an object', '<string>');
  }

  const root = parsed as Record<string, unknown>;

  const patternSection = root.pattern;
  if (typeof patternSection !== 'object' || patternSection === null) {
    return createError('validation_error', 'Missing [pattern] section', '<string>');
  }

  const pattern = patternSection as Record<string, unknown>;

  const id = pattern.id;
  if (typeof id !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "id" field in [pattern]',
      '<string>',
      'pattern.id'
    );
  }

  const name = pattern.name;
  if (typeof name !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "name" field in [pattern]',
      '<string>',
      'pattern.name'
    );
  }

  const description = pattern.description;
  if (typeof description !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "description" field in [pattern]',
      '<string>',
      'pattern.description'
    );
  }

  const risk = pattern.risk;
  if (typeof risk !== 'number' || !VALID_RISK_LEVELS.includes(risk as RiskLevel)) {
    return createError(
      'validation_error',
      `Invalid "risk" field in [pattern]. Must be 1, 2, 3, or 4`,
      '<string>',
      'pattern.risk'
    );
  }

  const riskRationale = pattern.risk_rationale;
  if (typeof riskRationale !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "risk_rationale" field in [pattern]',
      '<string>',
      'pattern.risk_rationale'
    );
  }

  const verificationSection = root.verification;
  if (typeof verificationSection !== 'object' || verificationSection === null) {
    return createError('validation_error', 'Missing [verification] section', '<string>');
  }

  const verification = verificationSection as Record<string, unknown>;
  const required = verification.required;
  if (!Array.isArray(required)) {
    return createError(
      'validation_error',
      'Missing or invalid "required" field in [verification]',
      '<string>',
      'verification.required'
    );
  }

  const verificationScope = parseVerificationScope(required);
  if (verificationScope === null) {
    return createError(
      'validation_error',
      'Invalid verification scope in [verification]',
      '<string>',
      'verification.required'
    );
  }

  const guardsSection = root.guards;
  let guards: string[] = [];
  if (typeof guardsSection === 'object' && guardsSection !== null) {
    const guardsObj = guardsSection as Record<string, unknown>;
    const conditions = guardsObj.conditions;
    if (Array.isArray(conditions)) {
      guards = conditions.filter((c): c is string => typeof c === 'string');
    }
  }

  const enablesSection = root.enables;
  let enables: string[] = [];
  if (typeof enablesSection === 'object' && enablesSection !== null) {
    const enablesObj = enablesSection as Record<string, unknown>;
    const patterns = enablesObj.patterns;
    if (Array.isArray(patterns)) {
      enables = patterns.filter((p): p is string => typeof p === 'string');
    }
  }

  const promptSection = root.prompt;
  if (typeof promptSection !== 'object' || promptSection === null) {
    return createError('validation_error', 'Missing [prompt] section', '<string>');
  }

  const prompt = promptSection as Record<string, unknown>;
  const template = prompt.template;
  if (typeof template !== 'string') {
    return createError(
      'validation_error',
      'Missing or invalid "template" field in [prompt]',
      '<string>',
      'prompt.template'
    );
  }

  const promptTemplate: PromptTemplate = { template };

  return {
    id,
    name,
    description,
    risk: risk as RiskLevel,
    riskRationale,
    verification: verificationScope,
    guards,
    enables,
    prompt: promptTemplate,
  };
}

/**
 * Parses verification scope from required array.
 */
function parseVerificationScope(required: unknown[]): VerificationScope | null {
  const set = new Set(required);
  if (set.has('compile') && set.has('unit_tests_target_function')) {
    return { type: 'unit_tests', scope: 'target_function' };
  }
  if (set.has('compile') && set.has('integration_tests_module')) {
    return { type: 'integration_tests', scope: 'module' };
  }
  if (set.has('compile') && set.has('full_test_suite')) {
    return { type: 'full_test_suite' };
  }
  if (set.has('compile') && set.size === 1) {
    return { type: 'compile_only' };
  }
  return null;
}

/**
 * Loads a transformation catalog from a directory.
 *
 * The directory should contain:
 * - smells/ subdirectory with .toml files
 * - patterns/ subdirectory with .toml files
 *
 * @param catalogDir - Path to catalog directory.
 * @returns A Promise that resolves to a TransformationCatalog or rejects with error.
 */
export async function loadCatalog(catalogDir: string): Promise<TransformationCatalog> {
  const smellsDir = join(catalogDir, 'smells');
  const patternsDir = join(catalogDir, 'patterns');

  const smellFiles = await loadTomlFiles(smellsDir);
  const patternFiles = await loadTomlFiles(patternsDir);

  const smellsMap = new Map<string, SmellDefinition>();
  const patternsMap = new Map<string, PatternDefinition>();

  const errors: CatalogParseError[] = [];

  for (const { path, content } of smellFiles) {
    const result = parseSmellDefinition(content);
    if (isCatalogError(result)) {
      errors.push({ ...result, filePath: path });
    } else {
      smellsMap.set(result.id, result);
    }
  }

  for (const { path, content } of patternFiles) {
    const result = parsePatternDefinition(content);
    if (isCatalogError(result)) {
      errors.push({ ...result, filePath: path });
    } else {
      patternsMap.set(result.id, result);
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map((e) => `${e.filePath}: ${e.message}`).join('\n');
    throw new Error(`Failed to load catalog:\n${errorMessages}`);
  }

  return new CatalogImpl(smellsMap, patternsMap);
}

/**
 * Loads all .toml files from a directory recursively.
 */
async function loadTomlFiles(dir: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nestedFiles = await loadTomlFiles(fullPath);
        files.push(...nestedFiles);
      } else if (entry.isFile() && entry.name.endsWith('.toml')) {
        const content = await readFile(fullPath, 'utf-8');
        files.push({ path: fullPath, content });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  return files;
}

/**
 * Internal implementation of TransformationCatalog.
 */
class CatalogImpl implements TransformationCatalog {
  constructor(
    private readonly smells: Map<string, SmellDefinition>,
    private readonly patterns: Map<string, PatternDefinition>
  ) {}

  getSmell(id: string): SmellDefinition | null {
    return this.smells.get(id) ?? null;
  }

  getPattern(id: string): PatternDefinition | null {
    return this.patterns.get(id) ?? null;
  }

  getSmellsByCategory(category: SmellCategory): SmellDefinition[] {
    return Array.from(this.smells.values()).filter((s) => s.category === category);
  }

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
