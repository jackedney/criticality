/**
 * Types for the Lattice phase module structure generation.
 *
 * Defines types for domain boundaries, module hierarchy, and generated file structures.
 *
 * @packageDocumentation
 */

import type { SpecFeatureClassification } from '../spec/types.js';

/**
 * Represents a domain boundary extracted from the spec.
 */
export interface DomainBoundary {
  /** Unique identifier for the domain (kebab-case). */
  readonly name: string;
  /** Human-readable description of the domain. */
  readonly description?: string;
  /** Data models belonging to this domain. */
  readonly dataModels: readonly string[];
  /** Interfaces belonging to this domain. */
  readonly interfaces: readonly string[];
  /** Feature classification if associated with a feature. */
  readonly classification?: SpecFeatureClassification;
}

/**
 * Represents a generated file in the module structure.
 */
export interface GeneratedFile {
  /** Relative path from the target directory. */
  readonly relativePath: string;
  /** The content to write to the file. */
  readonly content: string;
  /** Whether this is an index/barrel file. */
  readonly isBarrel: boolean;
  /** Description of what this file contains. */
  readonly description: string;
}

/**
 * Represents the generated module structure for a domain.
 */
export interface DomainModule {
  /** The domain this module represents. */
  readonly domain: DomainBoundary;
  /** Path to the domain directory relative to src. */
  readonly path: string;
  /** Files to generate in this module. */
  readonly files: readonly GeneratedFile[];
}

/**
 * Options for module structure generation.
 */
export interface ModuleGeneratorOptions {
  /** Base directory for generated code. Default: 'src'. */
  readonly baseDir?: string;
  /** Domain subdirectory name. Default: 'domain'. */
  readonly domainDir?: string;
  /** Whether to detect existing project conventions. Default: true. */
  readonly detectConventions?: boolean;
  /** Whether to generate placeholder modules for empty specs. Default: true. */
  readonly generatePlaceholders?: boolean;
}

/**
 * Result of module structure generation.
 */
export interface ModuleStructureResult {
  /** All domain modules generated. */
  readonly modules: readonly DomainModule[];
  /** All files to be written. */
  readonly files: readonly GeneratedFile[];
  /** Domain boundaries that were detected. */
  readonly boundaries: readonly DomainBoundary[];
  /** Whether placeholders were generated due to empty spec. */
  readonly hasPlaceholders: boolean;
  /** Base directory used for generation. */
  readonly baseDir: string;
  /** Domain directory used for generation. */
  readonly domainDir: string;
}

/**
 * Detected project conventions.
 */
export interface ProjectConventions {
  /** Detected source directory structure. */
  readonly sourceDir: string;
  /** Detected domain directory (if any). */
  readonly domainDir?: string;
  /** Whether the project uses barrel files. */
  readonly usesBarrelFiles: boolean;
  /** Whether the project uses .js extension in imports. */
  readonly usesJsExtension: boolean;
}

/**
 * Error codes for module generation errors.
 */
export type ModuleGeneratorErrorCode =
  | 'SPEC_PARSE_ERROR'
  | 'INVALID_SPEC'
  | 'FILE_WRITE_ERROR'
  | 'CONVENTION_DETECTION_ERROR';

/**
 * Error class for module generation errors.
 */
export class ModuleGeneratorError extends Error {
  /** The error code for programmatic handling. */
  public readonly code: ModuleGeneratorErrorCode;
  /** Additional details about the error. */
  public readonly details?: string;

  constructor(message: string, code: ModuleGeneratorErrorCode, details?: string) {
    super(message);
    this.name = 'ModuleGeneratorError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
