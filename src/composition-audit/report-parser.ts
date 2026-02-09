/**
 * Contradiction report parser with retry logic and YAML support.
 *
 * Parses LLM contradiction output into structured ContradictionReport types,
 * with retry logic for malformed output and support for both JSON and YAML formats.
 *
 * @packageDocumentation
 */

import type { ModelRouter, ModelAlias } from '../router/types.js';
import type {
  Contradiction,
  ContradictionType,
  ContradictionSeverity,
  InvolvedElement,
  ContradictionParseOptions,
  ContradictionParseResult,
  ContradictionReport,
  ContradictionReportStats,
} from './types.js';
import { isValidContradictionType, ContradictionReportParseError } from './types.js';
import { generateContradictionId } from './prompts.js';
import * as yaml from 'js-yaml';

/**
 * Dangerous keys that could lead to prototype pollution attacks.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively validates parsed data for dangerous keys.
 *
 * @param data - The parsed data to validate.
 * @param visited - Set of visited objects to prevent circular reference issues.
 * @throws ContradictionReportParseError if a dangerous key is found.
 */
function validateNoDangerousKeys(data: unknown, visited: WeakSet<object> = new WeakSet()): void {
  if (data === null || typeof data !== 'object') {
    return;
  }

  if (visited.has(data)) {
    return;
  }
  visited.add(data);

  if (Array.isArray(data)) {
    for (const item of data) {
      validateNoDangerousKeys(item, visited);
    }
    return;
  }

  for (const key of Object.keys(data)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new ContradictionReportParseError(
        'Rejected dangerous key in YAML input',
        'validation_error',
        { details: `Blocked key: ${key}` }
      );
    }
    // eslint-disable-next-line security/detect-object-injection -- safe: key validated against DANGEROUS_KEYS
    validateNoDangerousKeys((data as Record<string, unknown>)[key], visited);
  }
}

/**
 * Current version of the contradiction report format.
 */
export const REPORT_VERSION = '1.0.0';

/**
 * Module-level default logger for parse operations.
 * Initially a no-op, can be configured via setDefaultParserLogger.
 */
let defaultParserLogger: (message: string) => void = (): void => {};

/**
 * Default parse options.
 */
const BASE_PARSE_OPTIONS = {
  maxRetries: 2,
  tryYaml: true,
  timeoutMs: 120_000,
} as const;

/**
 * Gets the default parse options with current logger.
 *
 * @returns The default parse options.
 */
function getParseOptions(): Required<ContradictionParseOptions> {
  return {
    ...BASE_PARSE_OPTIONS,
    logger: defaultParserLogger,
  };
}

/**
 * Sets the default logger for parse operations.
 *
 * Allows consumers to opt into logging for parse operations.
 *
 * @param logger - The logger function to use for warnings.
 */
export function setDefaultParserLogger(logger: ContradictionParseOptions['logger']): void {
  defaultParserLogger = logger ?? ((): void => {});
}

/**
 * Gets the current default logger for parse operations.
 *
 * @returns The current logger function.
 */
export function getDefaultParserLogger(): (message: string) => void {
  return defaultParserLogger;
}

/**
 * Attempts to parse a string as JSON, extracting JSON from markdown code blocks if needed.
 *
 * @param content - The raw content string.
 * @returns The parsed object or null if parsing fails.
 */
function tryParseJson(content: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(content);
  } catch {
    // Continue to extraction attempts
  }

  // Try to extract JSON from markdown code block
  const jsonBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  if (jsonBlockMatch?.[1] !== undefined) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try to find a JSON object in the content
  const jsonMatch = /\{[\s\S]*\}/.exec(content);
  if (jsonMatch !== null) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Attempts to parse a string as YAML.
 *
 * Uses js-yaml library for full YAML parsing support.
 *
 * @param content - The raw content string.
 * @returns The parsed object or null if parsing fails.
 */
export function tryParseYaml(content: string): unknown {
  // Try to extract YAML from markdown code block
  const yamlBlockMatch = /```(?:yaml|yml)?\s*([\s\S]*?)```/.exec(content);
  const yamlContent = yamlBlockMatch?.[1]?.trim() ?? content.trim();

  try {
    const parsed = yaml.load(yamlContent);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    validateNoDangerousKeys(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ContradictionReportParseError) {
      throw error;
    }
    return null;
  }
}

/**
 * Validates and extracts contradictions from parsed data.
 *
 * @param data - The parsed data object.
 * @returns Array of validated contradictions.
 */
function extractContradictions(data: unknown): Contradiction[] {
  if (data === null || typeof data !== 'object') {
    return [];
  }

  const obj = data as Record<string, unknown>;
  const rawContradictions = obj.contradictions;

  if (!Array.isArray(rawContradictions)) {
    return [];
  }

  const contradictions: Contradiction[] = [];

  for (const item of rawContradictions) {
    const contradiction = validateAndExtractContradiction(item);
    if (contradiction !== null) {
      contradictions.push(contradiction);
    }
  }

  return contradictions;
}

/**
 * Validates and extracts a single contradiction from raw data.
 *
 * @param item - Raw contradiction item.
 * @returns Validated contradiction or null if invalid.
 */
function validateAndExtractContradiction(item: unknown): Contradiction | null {
  if (item === null || typeof item !== 'object') {
    return null;
  }

  const raw = item as Record<string, unknown>;

  // Validate type
  const type = raw.type;
  if (typeof type !== 'string' || !isValidContradictionType(type)) {
    return null;
  }

  // Validate severity
  const severity = raw.severity;
  if (typeof severity !== 'string' || !['critical', 'warning'].includes(severity)) {
    return null;
  }

  // Validate required string fields
  const description = raw.description;
  if (typeof description !== 'string' || description.trim() === '') {
    return null;
  }

  const analysis = raw.analysis;
  if (typeof analysis !== 'string' || analysis.trim() === '') {
    return null;
  }

  // Handle minimalScenario with alternative key names
  const minimalScenarioRaw = raw.minimalScenario ?? raw.minimal_scenario ?? raw.scenario;
  if (typeof minimalScenarioRaw !== 'string' || minimalScenarioRaw.trim() === '') {
    return null;
  }
  const minimalScenario = minimalScenarioRaw.trim();

  // Extract involved elements
  const involvedRaw = raw.involved ?? raw.involved_elements ?? raw.elements;
  const involved = extractInvolvedElements(involvedRaw);
  if (involved.length === 0) {
    return null;
  }

  // Extract suggested resolutions
  const resolutionsRaw = raw.suggestedResolutions ?? raw.suggested_resolutions ?? raw.resolutions;
  const suggestedResolutions = extractStringArray(resolutionsRaw);

  // Use provided ID or generate one
  const id =
    typeof raw.id === 'string' && raw.id.trim() !== ''
      ? raw.id.trim()
      : generateContradictionId(type);

  return {
    id,
    type,
    severity: severity as ContradictionSeverity,
    description: description.trim(),
    involved,
    analysis: analysis.trim(),
    minimalScenario,
    suggestedResolutions,
  };
}

/**
 * Extracts involved elements from raw data.
 *
 * @param data - Raw involved elements data.
 * @returns Array of validated InvolvedElement objects.
 */
function extractInvolvedElements(data: unknown): InvolvedElement[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const elements: InvolvedElement[] = [];

  for (const item of data) {
    if (item === null || typeof item !== 'object') {
      continue;
    }

    const raw = item as Record<string, unknown>;

    // Handle alternative key names
    const elementType = raw.elementType ?? raw.element_type ?? raw.type;
    if (
      typeof elementType !== 'string' ||
      !['constraint', 'contract', 'witness', 'claim'].includes(elementType)
    ) {
      continue;
    }

    const id = raw.id;
    if (typeof id !== 'string') {
      continue;
    }

    const name = raw.name;
    if (typeof name !== 'string') {
      continue;
    }

    const text = raw.text;
    if (typeof text !== 'string') {
      continue;
    }

    const baseElement: InvolvedElement = {
      elementType: elementType as InvolvedElement['elementType'],
      id,
      name,
      text,
    };

    const location = raw.location;
    if (typeof location === 'string') {
      elements.push({ ...baseElement, location });
    } else {
      elements.push(baseElement);
    }
  }

  return elements;
}

/**
 * Extracts a string array from raw data.
 *
 * @param data - Raw array data.
 * @returns Array of strings.
 */
function extractStringArray(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const strings: string[] = [];
  for (const item of data) {
    if (typeof item === 'string' && item.trim() !== '') {
      strings.push(item.trim());
    }
  }
  return strings;
}

/**
 * Extracts the summary from parsed data.
 *
 * @param data - The parsed data object.
 * @returns The summary string or a default message.
 */
function extractSummary(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return 'No summary provided';
  }

  const obj = data as Record<string, unknown>;
  const summary = obj.summary;

  if (typeof summary === 'string' && summary.trim() !== '') {
    return summary.trim();
  }

  return 'No summary provided';
}

/**
 * Checks if the data indicates contradictions were found.
 *
 * @param data - The parsed data object.
 * @param contradictions - The extracted contradictions.
 * @returns True if contradictions exist.
 */
function hasContradictionsFlag(data: unknown, contradictions: Contradiction[]): boolean {
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.hasContradictions === 'boolean') {
      return obj.hasContradictions;
    }
    // Also check snake_case variant
    if (typeof obj.has_contradictions === 'boolean') {
      return obj.has_contradictions;
    }
  }
  return contradictions.length > 0;
}

/**
 * Creates the clarification prompt for retry on malformed output.
 *
 * @param originalContent - The original malformed content.
 * @param attemptNumber - Which retry attempt this is.
 * @returns The clarification prompt.
 */
export function createClarificationPrompt(originalContent: string, attemptNumber: number): string {
  return `Your previous response could not be parsed correctly. Please provide your analysis again in valid JSON format.

IMPORTANT: Output ONLY the JSON object, with no additional text before or after.

Your previous response started with:
${originalContent.substring(0, 500)}${originalContent.length > 500 ? '...' : ''}

Please respond with a JSON object in exactly this format:
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
          "text": "The relevant text"
        }
      ],
      "analysis": "Detailed analysis",
      "minimalScenario": "Step-by-step scenario",
      "suggestedResolutions": ["Resolution 1", "Resolution 2"]
    }
  ],
  "summary": "Overall summary"
}

This is retry attempt ${String(attemptNumber)} of the maximum allowed retries.`;
}

/**
 * Parses LLM contradiction output into structured form.
 *
 * Supports both JSON and YAML formats, with automatic format detection.
 * Handles markdown code blocks and extraction from mixed content.
 *
 * @param content - The raw LLM output.
 * @param options - Parse options.
 * @returns The parse result with contradictions or error.
 */
export function parseContradictionOutput(
  content: string,
  options?: ContradictionParseOptions
): Promise<ContradictionParseResult> {
  const opts: Required<ContradictionParseOptions> = {
    ...getParseOptions(),
    ...options,
  };

  // Try JSON first
  let parsed = tryParseJson(content);

  // Try YAML if JSON fails and YAML is enabled
  if (parsed === null && opts.tryYaml) {
    try {
      parsed = tryParseYaml(content);
    } catch (error) {
      // Re-throw ContradictionReportParseError (e.g., from safeAssign)
      if (error instanceof ContradictionReportParseError) {
        return Promise.resolve({
          success: false,
          error,
        });
      }
      // Other parsing errors return null
      parsed = null;
    }
  }

  // If both fail, return parse error
  if (parsed === null) {
    return Promise.resolve({
      success: false,
      error: new ContradictionReportParseError(
        'Failed to parse contradiction output - no valid JSON or YAML found',
        'parse_error',
        {
          details: 'The output does not contain valid JSON or YAML',
          rawContent: content.substring(0, 1000),
          retryAttempts: 0,
        }
      ),
    });
  }

  // Extract data
  const contradictions = extractContradictions(parsed);
  const summary = extractSummary(parsed);
  const hasContradictions = hasContradictionsFlag(parsed, contradictions);

  return Promise.resolve({
    success: true,
    contradictions,
    summary,
    hasContradictions,
  });
}

/**
 * Parses LLM contradiction output with retry logic.
 *
 * If the initial parse fails due to malformed output, sends a clarification
 * prompt to the model and retries parsing.
 *
 * @param content - The raw LLM output.
 * @param modelRouter - The model router for retry prompts.
 * @param modelAlias - The model alias to use for retries.
 * @param options - Parse options including max retries.
 * @returns The parse result with contradictions or error.
 */
export async function parseContradictionOutputWithRetry(
  content: string,
  modelRouter: ModelRouter,
  modelAlias: ModelAlias,
  options?: ContradictionParseOptions
): Promise<ContradictionParseResult> {
  const opts: Required<ContradictionParseOptions> = {
    ...getParseOptions(),
    ...options,
  };

  // First attempt
  let result = await parseContradictionOutput(content, opts);

  if (result.success) {
    return result;
  }

  // Retry loop
  let lastError = result.error;
  let currentContent = content;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    opts.logger(`Parse attempt ${String(attempt)} failed, retrying with clarification prompt...`);

    const clarificationPrompt = createClarificationPrompt(currentContent, attempt);
    const retryResult = await modelRouter.prompt(modelAlias, clarificationPrompt, opts.timeoutMs);

    if (!retryResult.success) {
      opts.logger(`Retry ${String(attempt)} failed: model error - ${retryResult.error.message}`);
      continue;
    }

    currentContent = retryResult.response.content;
    result = await parseContradictionOutput(currentContent, opts);

    if (result.success) {
      opts.logger(`Parse succeeded on retry attempt ${String(attempt)}`);
      return result;
    }

    lastError = result.error;
  }

  // All retries exhausted
  return {
    success: false,
    error: new ContradictionReportParseError(
      `Failed to parse contradiction output after ${String(opts.maxRetries)} retries`,
      'retry_exhausted',
      {
        details: lastError.details,
        rawContent: currentContent.substring(0, 1000),
        retryAttempts: opts.maxRetries,
      }
    ),
  };
}

/**
 * Creates statistics for a set of contradictions.
 *
 * @param contradictions - The contradictions to analyze.
 * @returns Statistics object.
 */
export function createContradictionStats(
  contradictions: readonly Contradiction[]
): ContradictionReportStats {
  const byType: Record<ContradictionType, number> = {
    temporal: 0,
    resource: 0,
    invariant: 0,
    precondition_gap: 0,
    postcondition_conflict: 0,
  };

  let critical = 0;
  let warning = 0;

  for (const contradiction of contradictions) {
    byType[contradiction.type]++;
    if (contradiction.severity === 'critical') {
      critical++;
    } else {
      warning++;
    }
  }

  return {
    total: contradictions.length,
    critical,
    warning,
    byType,
  };
}

/**
 * Creates a unique report ID.
 *
 * @returns A unique report ID string.
 */
export function generateReportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `AUDIT_${timestamp}_${random}`;
}

/**
 * Creates a ContradictionReport from parsed data.
 *
 * @param projectId - The project identifier.
 * @param contradictions - The detected contradictions.
 * @param summary - The audit summary.
 * @param crossVerified - Whether cross-verification was performed.
 * @returns A complete ContradictionReport.
 */
export function createContradictionReport(
  projectId: string,
  contradictions: readonly Contradiction[],
  summary: string,
  crossVerified: boolean
): ContradictionReport {
  return {
    id: generateReportId(),
    projectId,
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    summary,
    crossVerified,
    stats: createContradictionStats(contradictions),
    contradictions,
  };
}

/**
 * Validates a ContradictionReport structure.
 *
 * @param data - The data to validate.
 * @returns True if the data is a valid ContradictionReport.
 */
export function isValidContradictionReport(data: unknown): data is ContradictionReport {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check required string fields
  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    return false;
  }
  if (typeof obj.projectId !== 'string' || obj.projectId.trim() === '') {
    return false;
  }
  if (typeof obj.version !== 'string') {
    return false;
  }
  if (typeof obj.generatedAt !== 'string') {
    return false;
  }
  if (typeof obj.summary !== 'string') {
    return false;
  }
  if (typeof obj.crossVerified !== 'boolean') {
    return false;
  }

  // Check stats
  const stats = obj.stats;
  if (stats === null || typeof stats !== 'object') {
    return false;
  }
  const statsObj = stats as Record<string, unknown>;
  if (typeof statsObj.total !== 'number') {
    return false;
  }
  if (typeof statsObj.critical !== 'number') {
    return false;
  }
  if (typeof statsObj.warning !== 'number') {
    return false;
  }
  if (statsObj.byType === null || typeof statsObj.byType !== 'object') {
    return false;
  }

  // Check contradictions array
  if (!Array.isArray(obj.contradictions)) {
    return false;
  }

  // Validate each contradiction item using validateAndExtractContradiction
  for (const item of obj.contradictions) {
    if (validateAndExtractContradiction(item) === null) {
      return false;
    }
  }

  return true;
}
