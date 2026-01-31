/**
 * Spec artifact generator for the Ignition phase.
 *
 * Transforms interview state (extracted requirements) into a structured spec.toml
 * that serves as input for subsequent phases (Lattice, Injection, etc.).
 *
 * @packageDocumentation
 */

import * as TOML from '@iarna/toml';
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  ClaimType,
  Spec,
  SpecBoundaries,
  SpecClaim,
  SpecConstraints,
  SpecFeature,
} from '../spec/types.js';
import type { ExtractedRequirement, Feature, InterviewState } from './types.js';
import { FEATURE_CLASSIFICATIONS, isValidFeatureClassification } from './types.js';
import { getInterviewDir } from './persistence.js';

/**
 * Error class for spec generation errors.
 */
export class SpecGeneratorError extends Error {
  /** The error code for programmatic handling. */
  public readonly code: SpecGeneratorErrorCode;
  /** Additional details about the error. */
  public readonly details: string | undefined;

  constructor(message: string, code: SpecGeneratorErrorCode, details?: string) {
    super(message);
    this.name = 'SpecGeneratorError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Error codes for spec generator errors.
 */
export type SpecGeneratorErrorCode =
  | 'VALIDATION_ERROR'
  | 'SERIALIZATION_ERROR'
  | 'FILE_ERROR'
  | 'MISSING_REQUIRED_FIELD';

/**
 * Validation result for spec generation.
 */
export interface SpecValidationResult {
  /** Whether the spec is valid. */
  readonly valid: boolean;
  /** Validation errors if invalid. */
  readonly errors: readonly string[];
  /** Warnings that don't prevent generation. */
  readonly warnings: readonly string[];
}

/**
 * Options for spec generation.
 */
export interface SpecGeneratorOptions {
  /** System name override (kebab-case). */
  systemName?: string;
  /** System description override. */
  systemDescription?: string;
  /** Domain category. */
  domain?: string;
  /** Spec version. Default: '1.0.0'. */
  version?: string;
  /** Authors list. */
  authors?: string[];
}

/**
 * Result of saving a spec proposal.
 */
export interface SaveProposalResult {
  /** The version number assigned. */
  readonly version: number;
  /** The full path to the proposal file. */
  readonly path: string;
  /** The generated spec. */
  readonly spec: Spec;
}

/**
 * Result of finalizing a spec.
 */
export interface FinalizeSpecResult {
  /** The path where the final spec was written. */
  readonly path: string;
  /** The finalized spec. */
  readonly spec: Spec;
}

/**
 * Extracts claims from requirements.
 *
 * Analyzes requirement text to determine claim type and testability.
 */
function extractClaimFromRequirement(
  req: ExtractedRequirement,
  index: number
): { id: string; claim: SpecClaim } {
  const claimType = inferClaimType(req);
  const testable = isRequirementTestable(req);

  const claim: SpecClaim = {
    text: req.text,
    type: claimType,
    testable,
  };

  // Generate claim ID based on category and index
  const prefix = getCategoryPrefix(req.category);
  const id = `${prefix}_${String(index + 1).padStart(3, '0')}`;

  return { id, claim };
}

/**
 * Gets a prefix for claim IDs based on category.
 */
function getCategoryPrefix(category: ExtractedRequirement['category']): string {
  const prefixes: Record<ExtractedRequirement['category'], string> = {
    functional: 'func',
    non_functional: 'nfr',
    constraint: 'const',
    preference: 'pref',
  };
  return prefixes[category];
}

/**
 * Infers claim type from requirement text and category.
 *
 * The order of checks matters - more specific patterns should be checked first.
 */
function inferClaimType(req: ExtractedRequirement): ClaimType {
  const text = req.text.toLowerCase();

  // Check for performance indicators FIRST (most specific patterns)
  if (
    text.includes('latency') ||
    text.includes('throughput') ||
    text.includes('tps') ||
    text.includes('qps') ||
    text.includes('performance') ||
    text.includes('p99') ||
    text.includes('p95') ||
    text.includes('response time') ||
    /\d+\s*(ms|millisecond)/i.test(req.text)
  ) {
    return 'performance';
  }

  // Check for concurrent indicators (before temporal since they can overlap)
  if (
    text.includes('concurrent') ||
    text.includes('parallel') ||
    text.includes('simultaneous') ||
    text.includes('thread') ||
    text.includes('race')
  ) {
    return 'concurrent';
  }

  // Check for negative/forbidden indicators (before invariant since "must not" is negative)
  if (
    text.includes('must not') ||
    text.includes('cannot') ||
    text.includes('forbidden') ||
    text.includes('not allowed') ||
    text.includes('shall not')
  ) {
    return 'negative';
  }

  // Check for temporal indicators (specific time-related words)
  if (
    text.includes('timeout') ||
    text.includes('expire') ||
    /within\s+\d+/.test(text) ||
    /after\s+\d+/.test(text) ||
    /before\s+\d+/.test(text)
  ) {
    return 'temporal';
  }

  // Check for invariant indicators
  if (
    text.includes('always') ||
    text.includes('never') ||
    text.includes('must be') ||
    text.includes('invariant') ||
    text.includes('at all times')
  ) {
    return 'invariant';
  }

  // Check for looser temporal indicators (without numbers)
  if (text.includes('before') || text.includes('after') || text.includes('within')) {
    return 'temporal';
  }

  // Default to behavioral
  return 'behavioral';
}

/**
 * Determines if a requirement is testable.
 */
function isRequirementTestable(req: ExtractedRequirement): boolean {
  const text = req.text.toLowerCase();

  // High confidence requirements are generally testable
  if (req.confidence === 'high') {
    return true;
  }

  // Check for vague/subjective terms that make testing difficult
  const vagueTerms = [
    'user-friendly',
    'intuitive',
    'easy to use',
    'simple',
    'clean',
    'modern',
    'responsive',
    'fast',
    'efficient',
    'scalable',
    'flexible',
    'robust',
  ];

  for (const term of vagueTerms) {
    if (text.includes(term) && !hasQuantifiableMetric(text)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if text contains quantifiable metrics.
 */
function hasQuantifiableMetric(text: string): boolean {
  // Check for numbers with units
  if (/\d+\s*(ms|s|seconds?|minutes?|hours?|%|tps|qps|mb|gb|kb)/i.test(text)) {
    return true;
  }

  // Check for specific numeric thresholds
  if (/(?:less than|greater than|at least|at most|within|under|over)\s*\d+/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Extracts constraints from requirements by category.
 */
function extractConstraints(requirements: readonly ExtractedRequirement[]): SpecConstraints {
  const functional: string[] = [];
  const nonFunctional: string[] = [];
  const security: string[] = [];

  for (const req of requirements) {
    const text = req.text;
    const lowerText = text.toLowerCase();

    // Categorize into constraint types
    if (
      lowerText.includes('security') ||
      lowerText.includes('authentication') ||
      lowerText.includes('authorization') ||
      lowerText.includes('encrypt') ||
      lowerText.includes('pii') ||
      lowerText.includes('credential') ||
      lowerText.includes('password')
    ) {
      security.push(text);
    } else if (req.category === 'non_functional' || req.category === 'constraint') {
      // Performance, scalability, reliability constraints
      if (
        lowerText.includes('latency') ||
        lowerText.includes('throughput') ||
        lowerText.includes('availability') ||
        lowerText.includes('reliability') ||
        lowerText.includes('scalab')
      ) {
        nonFunctional.push(text);
      } else {
        functional.push(text);
      }
    } else {
      functional.push(text);
    }
  }

  const constraints: SpecConstraints = {};
  if (functional.length > 0) {
    constraints.functional = functional;
  }
  if (nonFunctional.length > 0) {
    constraints.non_functional = nonFunctional;
  }
  if (security.length > 0) {
    constraints.security = security;
  }

  return constraints;
}

/**
 * Extracts external systems from requirements.
 */
function extractExternalSystems(requirements: readonly ExtractedRequirement[]): string[] {
  const systems = new Set<string>();
  const patterns = [
    /integrat(?:e|ion)(?:s)?\s+(?:with\s+)?(?:the\s+)?["']?([a-zA-Z0-9_-]+)["']?/gi,
    /connect(?:s)?\s+to\s+["']?([a-zA-Z0-9_-]+)["']?/gi,
    /(?:external|third[- ]party)\s+(?:api|service|system)(?:s)?\s*[:=]?\s*["']?([a-zA-Z0-9_-]+)["']?/gi,
    /(?:uses?|requires?)\s+["']?([a-zA-Z0-9_-]+)["']?\s+(?:api|service)/gi,
  ];

  for (const req of requirements) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(req.text)) !== null) {
        const system = match[1];
        if (system !== undefined && system.length > 2) {
          systems.add(system.toLowerCase());
        }
      }
    }
  }

  return Array.from(systems);
}

/**
 * Extracts trust boundaries from requirements.
 */
function extractTrustBoundaries(requirements: readonly ExtractedRequirement[]): string[] {
  const boundaries = new Set<string>();

  for (const req of requirements) {
    const lowerText = req.text.toLowerCase();

    if (lowerText.includes('user input') || lowerText.includes('user-provided')) {
      boundaries.add('user-input');
    }
    if (lowerText.includes('external api') || lowerText.includes('third-party')) {
      boundaries.add('external-api-responses');
    }
    if (lowerText.includes('untrusted') || lowerText.includes('validate')) {
      boundaries.add('external-data');
    }
    if (lowerText.includes('file upload')) {
      boundaries.add('file-uploads');
    }
    if (lowerText.includes('webhook')) {
      boundaries.add('webhook-payloads');
    }
  }

  return Array.from(boundaries);
}

/**
 * Normalizes a project ID to a valid system name.
 *
 * The normalized name will:
 * - Be lowercase
 * - Use hyphens instead of non-alphanumeric characters
 * - Not have leading or trailing hyphens
 * - Start with a letter (prefixed with 'project-' if needed)
 * - Fall back to 'project-spec' if normalization results in empty string
 *
 * @param projectId - The project ID to normalize.
 * @returns A normalized system name that passes validation.
 *
 * @example
 * ```typescript
 * normalizeSystemName('123-test') // returns 'project-123-test'
 * normalizeSystemName('My App') // returns 'my-app'
 * normalizeSystemName('---') // returns 'project-spec'
 * ```
 */
function normalizeSystemName(projectId: string): string {
  let normalized = projectId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length === 0) {
    return 'project-spec';
  }

  if (!/^[a-z]/.test(normalized)) {
    normalized = `project-${normalized}`;
  }

  return normalized;
}

/**
 * Converts interview features to spec features.
 *
 * @param features - Features from the interview state.
 * @returns Record of spec features keyed by generated ID.
 */
function convertFeaturesToSpec(features: readonly Feature[]): Record<string, SpecFeature> {
  const specFeatures: Record<string, SpecFeature> = {};

  features.forEach((feature, index) => {
    // Generate a kebab-case ID from the feature name
    const featureId = feature.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const uniqueId = `${featureId || 'feature'}_${String(index + 1).padStart(3, '0')}`;

    const specFeature: SpecFeature = {
      name: feature.name,
      description: feature.description,
      classification: feature.classification,
    };

    // Only add rationale if present
    if (feature.classificationRationale !== undefined) {
      specFeature.rationale = feature.classificationRationale;
    }

    specFeatures[uniqueId] = specFeature;
  });

  return specFeatures;
}

/**
 * Generates a spec from interview state.
 *
 * @param state - The completed interview state.
 * @param options - Generation options.
 * @returns The generated spec.
 * @throws SpecGeneratorError if generation fails.
 */
export function generateSpec(state: InterviewState, options?: SpecGeneratorOptions): Spec {
  const now = new Date().toISOString();
  const requirements = state.extractedRequirements;

  // Build meta section
  const meta: Spec['meta'] = {
    version: options?.version ?? '1.0.0',
    created: now,
  };
  if (options?.domain !== undefined) {
    meta.domain = options.domain;
  }
  if (options?.authors !== undefined && options.authors.length > 0) {
    meta.authors = options.authors;
  }

  // Build system section - derive name from projectId if not provided
  const systemName = options?.systemName ?? normalizeSystemName(state.projectId);
  const system: Spec['system'] = {
    name: systemName,
  };
  if (options?.systemDescription !== undefined) {
    system.description = options.systemDescription;
  }

  // Build the spec
  const spec: Spec = {
    meta,
    system,
  };

  // Extract boundaries
  const externalSystems = extractExternalSystems(requirements);
  const trustBoundaries = extractTrustBoundaries(requirements);
  if (externalSystems.length > 0 || trustBoundaries.length > 0) {
    const boundaries: SpecBoundaries = {};
    if (externalSystems.length > 0) {
      boundaries.external_systems = externalSystems;
    }
    if (trustBoundaries.length > 0) {
      boundaries.trust_boundaries = trustBoundaries;
    }
    spec.boundaries = boundaries;
  }

  // Convert features to spec format
  if (state.features.length > 0) {
    spec.features = convertFeaturesToSpec(state.features);
  }

  // Extract constraints
  const constraints = extractConstraints(requirements);
  if (
    constraints.functional !== undefined ||
    constraints.non_functional !== undefined ||
    constraints.security !== undefined
  ) {
    spec.constraints = constraints;
  }

  // Extract claims
  const claims: Record<string, SpecClaim> = {};
  requirements.forEach((req, index) => {
    const { id, claim } = extractClaimFromRequirement(req, index);
    claims[id] = claim;
  });
  if (Object.keys(claims).length > 0) {
    spec.claims = claims;
  }

  return spec;
}

/**
 * Validates a spec before writing.
 *
 * @param spec - The spec to validate.
 * @returns Validation result.
 */
export function validateSpec(spec: Spec): SpecValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required meta fields
  if (!spec.meta.version) {
    errors.push("Missing required field: 'meta.version'");
  }
  if (!spec.meta.created) {
    errors.push("Missing required field: 'meta.created'");
  }

  // Check required system fields
  if (!spec.system.name) {
    errors.push("Missing required field: 'system.name'");
  } else if (!/^[a-z][a-z0-9-]*$/.test(spec.system.name)) {
    errors.push(
      `Invalid system name: '${spec.system.name}' must be kebab-case starting with lowercase letter`
    );
  }

  // Validate features
  if (spec.features !== undefined) {
    for (const [featureId, feature] of Object.entries(spec.features)) {
      if (!feature.name) {
        errors.push(`Feature '${featureId}' missing required field: 'name'`);
      }
      if (!feature.description) {
        errors.push(`Feature '${featureId}' missing required field: 'description'`);
      }
      if (!isValidFeatureClassification(feature.classification)) {
        errors.push(
          `Feature '${featureId}' has invalid classification: '${String(feature.classification)}'. ` +
            `Must be one of: ${FEATURE_CLASSIFICATIONS.join(', ')}`
        );
      }
    }
  }

  // Validate claims
  if (spec.claims !== undefined) {
    for (const [claimId, claim] of Object.entries(spec.claims)) {
      if (!claim.text) {
        errors.push(`Claim '${claimId}' missing required field: 'text'`);
      }
      // Note: claim.type is guaranteed by TypeScript to be present and valid (ClaimType)
      if (claim.testable === false) {
        warnings.push(`Claim '${claimId}' marked as not testable - may need refinement`);
      }
    }
  }

  // Warn if no claims
  if (spec.claims === undefined || Object.keys(spec.claims).length === 0) {
    warnings.push('Spec has no claims - property testing will have nothing to verify');
  }

  // Warn if no constraints
  if (spec.constraints === undefined) {
    warnings.push('Spec has no constraints section');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Serializes a Spec object to TOML string.
 *
 * @param spec - The spec to serialize.
 * @returns TOML string representation.
 */
export function serializeSpec(spec: Spec): string {
  // Convert to TOML-compatible structure
  // TOML requires specific handling for nested objects
  const tomlObj: Record<string, unknown> = {};

  // Meta section
  tomlObj.meta = { ...spec.meta };

  // System section
  tomlObj.system = { ...spec.system };

  // Boundaries section (optional)
  if (spec.boundaries !== undefined) {
    tomlObj.boundaries = { ...spec.boundaries };
  }

  // Features section (optional)
  if (spec.features !== undefined) {
    tomlObj.features = { ...spec.features };
  }

  // Enums section (optional)
  if (spec.enums !== undefined) {
    tomlObj.enums = { ...spec.enums };
  }

  // Data models section (optional)
  if (spec.data_models !== undefined) {
    tomlObj.data_models = { ...spec.data_models };
  }

  // Interfaces section (optional)
  if (spec.interfaces !== undefined) {
    tomlObj.interfaces = { ...spec.interfaces };
  }

  // Constraints section (optional)
  if (spec.constraints !== undefined) {
    tomlObj.constraints = { ...spec.constraints };
  }

  // Claims section (optional)
  if (spec.claims !== undefined) {
    tomlObj.claims = { ...spec.claims };
  }

  // Witnesses section (optional)
  if (spec.witnesses !== undefined) {
    tomlObj.witnesses = { ...spec.witnesses };
  }

  return TOML.stringify(tomlObj as TOML.JsonMap);
}

/**
 * Gets the proposals directory for a project.
 *
 * @param projectId - The project identifier.
 * @returns Path to the proposals directory.
 */
export function getProposalsDir(projectId: string): string {
  return join(getInterviewDir(projectId), 'proposals');
}

/**
 * Gets the next proposal version number.
 *
 * @param projectId - The project identifier.
 * @returns The next version number (1-based).
 */
export async function getNextProposalVersion(projectId: string): Promise<number> {
  const proposalsDir = getProposalsDir(projectId);

  try {
    const files = await readdir(proposalsDir);
    const versions = files
      .filter((f) => /^v\d+\.toml$/.test(f))
      .map((f) => {
        const match = /^v(\d+)\.toml$/.exec(f);
        const versionStr = match?.[1];
        return versionStr !== undefined ? parseInt(versionStr, 10) : 0;
      })
      .filter((v) => v > 0);

    if (versions.length === 0) {
      return 1;
    }
    return Math.max(...versions) + 1;
  } catch {
    // Directory doesn't exist yet
    return 1;
  }
}

/**
 * Saves a spec proposal version.
 *
 * Proposals are saved as interview/proposals/v1.toml, v2.toml, etc.
 *
 * Uses exclusive file creation (flag 'wx') to prevent race conditions.
 * On EEXIST error, retries with a new version number (max 5 attempts).
 *
 * @param spec - The spec to save.
 * @param projectId - The project identifier.
 * @returns Result with version number and path.
 * @throws SpecGeneratorError if validation fails, max retries exhausted, or file cannot be written.
 */
export async function saveProposal(spec: Spec, projectId: string): Promise<SaveProposalResult> {
  // Validate before saving
  const validation = validateSpec(spec);
  if (!validation.valid) {
    throw new SpecGeneratorError(
      `Invalid spec: ${validation.errors.join('; ')}`,
      'VALIDATION_ERROR',
      validation.errors.join('\n')
    );
  }

  const proposalsDir = getProposalsDir(projectId);

  // Ensure directory exists
  await mkdir(proposalsDir, { recursive: true });

  // Serialize the spec once (content is the same across retries)
  const tomlContent = serializeSpec(spec);

  // Retry loop for race condition handling
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Get next version number (re-computed each attempt to account for concurrent writes)
    const version = await getNextProposalVersion(projectId);
    const proposalPath = join(proposalsDir, `v${String(version)}.toml`);

    try {
      // Use exclusive creation flag 'wx' to prevent race conditions
      await writeFile(proposalPath, tomlContent, { encoding: 'utf-8', flag: 'wx' });

      // Success - return the result
      return {
        version,
        path: proposalPath,
        spec,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if error is EEXIST (file already exists due to race)
      if (
        (err as NodeJS.ErrnoException).code === 'EEXIST' ||
        err.message.includes('EEXIST') ||
        err.message.includes('already exists')
      ) {
        // Race condition detected - retry with new version
        if (attempt === maxAttempts - 1) {
          // Last attempt failed - give up
          throw new SpecGeneratorError(
            `Failed to save proposal after ${String(maxAttempts)} attempts: could not allocate version`,
            'FILE_ERROR',
            `${String(maxAttempts)} attempts exhausted, last attempted path: ${proposalPath}`
          );
        }
        // Continue to next attempt to retry with new version
        continue;
      }

      // Non-EEXIST errors throw immediately (e.g., permission denied)
      throw new SpecGeneratorError(
        `Failed to write proposal: ${err.message}`,
        'FILE_ERROR',
        proposalPath
      );
    }
  }

  // This should never be reached, but TypeScript requires a return
  throw new SpecGeneratorError(`Failed to save proposal: unexpected control flow`, 'FILE_ERROR');
}

/**
 * Loads a specific proposal version.
 *
 * @param projectId - The project identifier.
 * @param version - The version number to load.
 * @returns The proposal TOML content.
 * @throws SpecGeneratorError if the proposal doesn't exist.
 */
export async function loadProposal(projectId: string, version: number): Promise<string> {
  const proposalPath = join(getProposalsDir(projectId), `v${String(version)}.toml`);

  try {
    return await readFile(proposalPath, 'utf-8');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new SpecGeneratorError(
      `Failed to load proposal v${String(version)}: ${err.message}`,
      'FILE_ERROR',
      proposalPath
    );
  }
}

/**
 * Lists all proposal versions for a project.
 *
 * @param projectId - The project identifier.
 * @returns Array of version numbers in ascending order.
 */
export async function listProposals(projectId: string): Promise<readonly number[]> {
  const proposalsDir = getProposalsDir(projectId);

  try {
    const files = await readdir(proposalsDir);
    return files
      .filter((f) => /^v\d+\.toml$/.test(f))
      .map((f) => {
        const match = /^v(\d+)\.toml$/.exec(f);
        const versionStr = match?.[1];
        return versionStr !== undefined ? parseInt(versionStr, 10) : 0;
      })
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * Finalizes a spec by writing it to the project root.
 *
 * This is called after interview approval to write the final spec.toml.
 *
 * @param spec - The spec to finalize.
 * @param projectRoot - The project root directory.
 * @returns Result with the path and spec.
 * @throws SpecGeneratorError if validation fails or file cannot be written.
 */
export async function finalizeSpec(spec: Spec, projectRoot: string): Promise<FinalizeSpecResult> {
  // Validate before finalizing
  const validation = validateSpec(spec);
  if (!validation.valid) {
    throw new SpecGeneratorError(
      `Cannot finalize invalid spec: ${validation.errors.join('; ')}`,
      'VALIDATION_ERROR',
      validation.errors.join('\n')
    );
  }

  const specPath = join(projectRoot, 'spec.toml');

  // Ensure directory exists
  await mkdir(dirname(specPath), { recursive: true });

  // Serialize and write
  try {
    const tomlContent = serializeSpec(spec);
    await writeFile(specPath, tomlContent, 'utf-8');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new SpecGeneratorError(
      `Failed to write spec.toml: ${err.message}`,
      'FILE_ERROR',
      specPath
    );
  }

  return {
    path: specPath,
    spec,
  };
}

/**
 * Generates and saves a spec proposal from interview state.
 *
 * This is the main entry point for spec generation during the interview.
 *
 * @param state - The interview state.
 * @param options - Generation options.
 * @returns The save result.
 *
 * @example
 * ```typescript
 * const result = await generateAndSaveProposal(interviewState, {
 *   systemName: 'payment-processor',
 *   domain: 'fintech'
 * });
 * console.log(`Saved proposal v${result.version} to ${result.path}`);
 * ```
 */
export async function generateAndSaveProposal(
  state: InterviewState,
  options?: SpecGeneratorOptions
): Promise<SaveProposalResult> {
  const spec = generateSpec(state, options);
  return saveProposal(spec, state.projectId);
}
