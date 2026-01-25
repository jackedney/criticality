/**
 * Types for the criticality-artifact-server MCP.
 *
 * @packageDocumentation
 */

import type { DecisionInput, Decision } from '../../ledger/types.js';

/**
 * Allowed artifact file types that the server can access.
 * This ensures strict scoping - the server only serves protocol artifacts.
 */
export const ALLOWED_ARTIFACT_FILES = ['DECISIONS.toml', 'spec.toml'] as const;

/**
 * Allowed artifact directories that the server can access.
 */
export const ALLOWED_ARTIFACT_DIRS = ['examples/', 'schemas/'] as const;

/**
 * Result of reading a spec section.
 */
export interface ReadSpecSectionResult {
  /** The section name that was requested. */
  section: string;
  /** The content of the section. */
  content: unknown;
  /** The file path the section was read from. */
  file: string;
}

/**
 * Result of appending a decision.
 */
export interface AppendDecisionResult {
  /** The newly created decision with generated ID and timestamp. */
  decision: Decision;
  /** The file path the decision was appended to. */
  file: string;
}

/**
 * Result of getting a type witness.
 */
export interface GetTypeWitnessResult {
  /** The witness name that was requested. */
  name: string;
  /** The witness definition. */
  witness: unknown;
  /** The file path the witness was read from. */
  file: string;
}

/**
 * Result of schema validation.
 */
export interface ValidateSchemaResult {
  /** Whether the artifact is valid. */
  valid: boolean;
  /** Validation errors if invalid. */
  errors?: string[];
  /** The schema that was used for validation. */
  schema: string;
}

/**
 * Input for the append_decision tool.
 */
export interface AppendDecisionInput extends DecisionInput {
  /** Optional: the target file (defaults to DECISIONS.toml). */
  file?: string;
}

/**
 * Server configuration options.
 */
export interface ArtifactServerConfig {
  /** Root directory for protocol artifacts. */
  projectRoot: string;
  /** Enable debug logging. */
  debug?: boolean;
}

/**
 * Error thrown when attempting to access a non-artifact file.
 */
export class ArtifactScopingError extends Error {
  /** The path that was rejected. */
  public readonly path: string;

  constructor(path: string) {
    super(
      `Access denied: '${path}' is not a protocol artifact. ` +
        `Only these files are accessible: ${ALLOWED_ARTIFACT_FILES.join(', ')}`
    );
    this.name = 'ArtifactScopingError';
    this.path = path;
  }
}

/**
 * Error thrown when an artifact file is not found.
 */
export class ArtifactNotFoundError extends Error {
  /** The path that was not found. */
  public readonly path: string;

  constructor(path: string) {
    super(`Artifact not found: '${path}'`);
    this.name = 'ArtifactNotFoundError';
    this.path = path;
  }
}

/**
 * Error thrown when a spec section is not found.
 */
export class SpecSectionNotFoundError extends Error {
  /** The section that was not found. */
  public readonly section: string;

  constructor(section: string) {
    super(`Spec section not found: '${section}'`);
    this.name = 'SpecSectionNotFoundError';
    this.section = section;
  }
}

/**
 * Error thrown when a witness is not found.
 */
export class WitnessNotFoundError extends Error {
  /** The witness name that was not found. */
  public readonly witnessName: string;

  constructor(name: string) {
    super(`Type witness not found: '${name}'`);
    this.name = 'WitnessNotFoundError';
    this.witnessName = name;
  }
}
