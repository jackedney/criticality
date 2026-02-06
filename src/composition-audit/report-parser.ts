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

let yaml: typeof import('js-yaml') | null = null;
let yamlLoadPromise: Promise<void> | null = null;

const USE_JS_YAML = process.env.PARSE_WITH_JSYAML === 'true';

if (USE_JS_YAML) {
  yamlLoadPromise = (async (): Promise<void> => {
    yaml ??= await import('js-yaml');
  })();
}

/**
 * Ensures the js-yaml module is loaded when PARSE_WITH_JSYAML is enabled.
 * Call this before using parseWithJsYaml to avoid race conditions.
 */
export async function ensureYamlLoaded(): Promise<void> {
  if (yamlLoadPromise) {
    await yamlLoadPromise;
  }
}

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
 * Safely assigns a value to an object, rejecting dangerous keys.
 *
 * @param obj - The object to assign to.
 * @param key - The key to assign.
 * @param value - The value to assign.
 * @throws ContradictionReportParseError if key is dangerous or invalid.
 */
function safeAssign(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof key !== 'string' || key === '') {
    throw new ContradictionReportParseError(
      'Invalid key in YAML: key must be a non-empty string',
      'validation_error',
      { details: `Key: ${key}` }
    );
  }

  if (DANGEROUS_KEYS.has(key)) {
    throw new ContradictionReportParseError(
      'Rejected dangerous key in YAML input',
      'validation_error',
      { details: `Blocked key: ${key}` }
    );
  }

  // eslint-disable-next-line security/detect-object-injection -- safe: key validated against DANGEROUS_KEYS
  obj[key] = value;
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
 * Parses a string as YAML using js-yaml library.
 *
 * This function is only used when the PARSE_WITH_JSYAML environment variable is set.
 * It provides full YAML parsing support for complex YAML structures.
 *
 * @param content - The raw content string.
 * @returns The parsed object or null if parsing fails.
 */
function parseWithJsYaml(content: string): unknown {
  if (yaml === null) {
    return null;
  }

  try {
    const yamlBlockMatch = /```(?:yaml|yml)?\s*([\s\S]*?)```/.exec(content);
    const yamlContent = yamlBlockMatch?.[1]?.trim() ?? content.trim();
    const parsed = yaml.load(yamlContent);
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
 * Attempts to parse a string as YAML.
 *
 * Uses a simple YAML-like parsing for common LLM output patterns.
 * This is not a full YAML parser but handles the structured output
 * that LLMs typically produce.
 *
 * TODO: Migrate to js-yaml v4.1.1 for full YAML parsing support.
 * Current implementation handles common LLM output patterns with high test coverage.
 * See src/composition-audit/report-parser.test.ts for existing test coverage.
 * To enable js-yaml fallback, set PARSE_WITH_JSYAML environment variable to 'true'.
 *
 * @param content - The raw content string.
 * @returns The parsed object or null if parsing fails.
 */
export function tryParseYaml(content: string): unknown {
  if (USE_JS_YAML) {
    return parseWithJsYaml(content);
  }

  // Try to extract YAML from markdown code block
  const yamlBlockMatch = /```(?:yaml|yml)?\s*([\s\S]*?)```/.exec(content);
  const yamlContent = yamlBlockMatch?.[1]?.trim() ?? content.trim();

  // Simple YAML-like parsing for common patterns
  // This handles the basic structure LLMs typically output
  try {
    const lines = yamlContent.split('\n');
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let currentKey: string | null = null;
    let currentArray: unknown[] | null = null;
    let currentObject: Record<string, unknown> | null = null;
    let inArrayOfObjects = false;
    let nestedArrayKey: string | null = null;
    let nestedArray: unknown[] | null = null;
    let nestedObject: Record<string, unknown> | null = null;
    let inNestedArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // Count leading spaces to determine indent level
      const leadingSpaces = line.length - line.trimStart().length;

      // Check for top-level key (no indentation)
      const keyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(trimmed);
      if (keyMatch !== null && leadingSpaces === 0) {
        const [, key, value] = keyMatch;
        if (key === undefined) {
          continue;
        }

        // Finalize previous nested array if any
        if (
          inNestedArray &&
          nestedArrayKey !== null &&
          nestedArray !== null &&
          currentObject !== null
        ) {
          if (nestedObject !== null) {
            nestedArray.push(nestedObject);
          }
          safeAssign(currentObject, nestedArrayKey, nestedArray);
          nestedArrayKey = null;
          nestedArray = null;
          nestedObject = null;
          inNestedArray = false;
        }

        // Finalize previous array if any
        if (currentKey !== null && currentArray !== null) {
          if (inArrayOfObjects && currentObject !== null) {
            currentArray.push(currentObject);
          }
          safeAssign(result, currentKey, currentArray);
        }

        currentKey = key;
        currentArray = null;
        currentObject = null;
        inArrayOfObjects = false;

        if (value !== undefined && value !== '') {
          // Inline value
          safeAssign(result, key, parseYamlValue(value));
          currentKey = null;
        }
        continue;
      }

      // Check for top-level array item (2 spaces indent)
      if (trimmed.startsWith('- ') && currentKey !== null && leadingSpaces === 2) {
        // Finalize previous nested array if any
        if (
          inNestedArray &&
          nestedArrayKey !== null &&
          nestedArray !== null &&
          currentObject !== null
        ) {
          if (nestedObject !== null) {
            nestedArray.push(nestedObject);
          }
          safeAssign(currentObject, nestedArrayKey, nestedArray);
          nestedArrayKey = null;
          nestedArray = null;
          nestedObject = null;
          inNestedArray = false;
        }

        currentArray ??= [];

        // Finalize previous object in array
        if (inArrayOfObjects && currentObject !== null) {
          currentArray.push(currentObject);
          currentObject = null;
        }

        const itemContent = trimmed.substring(2).trim();

        // Check if this is an object in array (starts with key:)
        const objKeyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(itemContent);
        if (objKeyMatch !== null) {
          inArrayOfObjects = true;
          currentObject = Object.create(null) as Record<string, unknown>;
          const [, objKey, objValue] = objKeyMatch;
          if (objKey !== undefined && objValue !== undefined) {
            safeAssign(currentObject, objKey, parseYamlValue(objValue));
          }
        } else {
          // Simple array item
          currentArray.push(parseYamlValue(itemContent));
        }
        continue;
      }

      // Check for nested array item (6 spaces indent) - arrays inside objects inside arrays
      if (
        trimmed.startsWith('- ') &&
        inNestedArray &&
        nestedArray !== null &&
        leadingSpaces === 6
      ) {
        // Finalize previous nested object if any
        if (nestedObject !== null) {
          nestedArray.push(nestedObject);
          nestedObject = null;
        }

        const itemContent = trimmed.substring(2).trim();

        // Check if this is an object in nested array (starts with key:)
        const objKeyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(itemContent);
        if (objKeyMatch !== null) {
          nestedObject = Object.create(null) as Record<string, unknown>;
          const [, objKey, objValue] = objKeyMatch;
          if (objKey !== undefined && objValue !== undefined) {
            safeAssign(nestedObject, objKey, parseYamlValue(objValue));
          }
        } else {
          // Simple array item
          nestedArray.push(parseYamlValue(itemContent));
        }
        continue;
      }

      // Check for nested object property (8 spaces indent) - properties of objects inside nested arrays
      if (nestedObject !== null && leadingSpaces === 8) {
        const nestedObjKeyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(trimmed);
        if (nestedObjKeyMatch !== null) {
          const [, nestedObjKey, nestedObjValue] = nestedObjKeyMatch;
          if (nestedObjKey !== undefined && nestedObjValue !== undefined) {
            safeAssign(nestedObject, nestedObjKey, parseYamlValue(nestedObjValue));
          }
        }
        continue;
      }

      // Check for nested key in object (4 spaces indent) - properties of objects inside top-level arrays
      if (inArrayOfObjects && currentObject !== null && leadingSpaces === 4) {
        // Finalize previous nested array if any
        if (inNestedArray && nestedArrayKey !== null && nestedArray !== null) {
          if (nestedObject !== null) {
            nestedArray.push(nestedObject);
            nestedObject = null;
          }
          safeAssign(currentObject, nestedArrayKey, nestedArray);
          nestedArrayKey = null;
          nestedArray = null;
          inNestedArray = false;
        }

        const nestedKeyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(trimmed);
        if (nestedKeyMatch !== null) {
          const [, nestedKey, nestedValue] = nestedKeyMatch;
          if (nestedKey !== undefined) {
            if (nestedValue !== undefined && nestedValue !== '') {
              safeAssign(currentObject, nestedKey, parseYamlValue(nestedValue));
            } else {
              // This might be the start of a nested array
              nestedArrayKey = nestedKey;
              nestedArray = [];
              inNestedArray = true;
            }
          }
        }
        continue;
      }
    }

    // Finalize last nested array
    if (
      inNestedArray &&
      nestedArrayKey !== null &&
      nestedArray !== null &&
      currentObject !== null
    ) {
      if (nestedObject !== null) {
        nestedArray.push(nestedObject);
      }
      safeAssign(currentObject, nestedArrayKey, nestedArray);
    }

    // Finalize last array
    if (currentKey !== null && currentArray !== null) {
      if (inArrayOfObjects && currentObject !== null) {
        currentArray.push(currentObject);
      }
      safeAssign(result, currentKey, currentArray);
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    // Re-throw ContradictionReportParseError (e.g., from safeAssign)
    if (error instanceof ContradictionReportParseError) {
      throw error;
    }
    // Catch other parsing errors
    return null;
  }
}

/**
 * Parses a YAML scalar value.
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  // Boolean
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  // Null
  if (trimmed === 'null' || trimmed === '~' || trimmed === '') {
    return null;
  }

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return num;
  }

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Plain string
  return trimmed;
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
export async function parseContradictionOutput(
  content: string,
  options?: ContradictionParseOptions
): Promise<ContradictionParseResult> {
  const opts: Required<ContradictionParseOptions> = {
    ...getParseOptions(),
    ...options,
  };

  // Ensure js-yaml module is loaded before attempting YAML parsing
  if (USE_JS_YAML && opts.tryYaml) {
    await ensureYamlLoaded();
  }

  // Try JSON first
  let parsed = tryParseJson(content);

  // Try YAML if JSON fails and YAML is enabled
  if (parsed === null && opts.tryYaml) {
    try {
      parsed = tryParseYaml(content);
    } catch (error) {
      // Re-throw ContradictionReportParseError (e.g., from safeAssign)
      if (error instanceof ContradictionReportParseError) {
        return {
          success: false,
          error,
        };
      }
      // Other parsing errors return null
      parsed = null;
    }
  }

  // If both fail, return parse error
  if (parsed === null) {
    return {
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
    };
  }

  // Extract data
  const contradictions = extractContradictions(parsed);
  const summary = extractSummary(parsed);
  const hasContradictions = hasContradictionsFlag(parsed, contradictions);

  return {
    success: true,
    contradictions,
    summary,
    hasContradictions,
  };
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
