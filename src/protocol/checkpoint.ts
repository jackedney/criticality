/**
 * Protocol checkpoint and resume module.
 *
 * Provides functionality to detect existing state on startup, validate state
 * integrity, resume protocol execution from last checkpoint, and handle
 * stale or corrupted state gracefully.
 *
 * @packageDocumentation
 */

import { safeStat } from '../utils/safe-fs.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import {
  loadState,
  stateFileExists,
  createInitialStateSnapshot,
  StatePersistenceError,
  PERSISTED_STATE_VERSION,
} from './persistence.js';
import {
  isValidPhase,
  PROTOCOL_PHASES,
  type ProtocolPhase,
  getPhase,
  isFailedState,
  isBlockedState,
  type BlockedState,
  type FailedState,
} from './types.js';
import type { ArtifactType } from './transitions.js';

/**
 * Result of state detection on startup.
 */
export type StateDetectionResult =
  | { readonly found: true; readonly filePath: string; readonly modifiedAt: Date }
  | { readonly found: false; readonly filePath: string };

/**
 * Result of state integrity validation.
 */
export interface StateValidationResult {
  /** Whether state is valid and safe to resume. */
  readonly valid: boolean;
  /** Validation errors if state is invalid. */
  readonly errors: readonly StateValidationError[];
  /** Validation warnings that don't prevent resume. */
  readonly warnings: readonly StateValidationWarning[];
}

/**
 * A validation error that prevents resumption.
 */
export interface StateValidationError {
  /** Error code for programmatic handling. */
  readonly code: StateValidationErrorCode;
  /** Human-readable error message. */
  readonly message: string;
  /** Additional context. */
  readonly details?: string;
}

/**
 * A validation warning that doesn't prevent resumption.
 */
export interface StateValidationWarning {
  /** Warning code for programmatic handling. */
  readonly code: StateValidationWarningCode;
  /** Human-readable warning message. */
  readonly message: string;
  /** Additional context. */
  readonly details?: string;
}

/**
 * Error codes for state validation failures.
 */
export type StateValidationErrorCode =
  | 'INVALID_VERSION'
  | 'INVALID_PHASE'
  | 'INVALID_STATE'
  | 'MISSING_ARTIFACTS'
  | 'CORRUPTED_STRUCTURE'
  | 'FUTURE_VERSION';

/**
 * Warning codes for state validation issues.
 */
export type StateValidationWarningCode =
  | 'STALE_STATE'
  | 'UNKNOWN_ARTIFACTS'
  | 'OLD_VERSION'
  | 'BLOCKING_TIMEOUT_EXPIRED';

/**
 * Options for detecting existing state.
 */
export interface DetectStateOptions {
  /** Custom file path to check. If not provided, uses default location. */
  filePath?: string;
}

/**
 * Options for validating state integrity.
 */
export interface ValidateStateOptions {
  /** Maximum age in milliseconds before state is considered stale. Default: 24 hours. */
  maxAgeMs?: number;
  /** Whether to allow resuming from stale state. Default: true (warn only). */
  allowStaleState?: boolean;
}

/**
 * Result of attempting to resume from checkpoint.
 */
export type ResumeResult =
  | {
      readonly success: true;
      readonly snapshot: ProtocolStateSnapshot;
      readonly validation: StateValidationResult;
    }
  | {
      readonly success: false;
      readonly reason: ResumeFailureReason;
      readonly error?: Error;
      readonly recoveryAction: RecoveryAction;
    };

/**
 * Reasons for resume failure.
 */
export type ResumeFailureReason =
  | 'NO_STATE_FILE'
  | 'CORRUPTED_STATE'
  | 'INVALID_STATE'
  | 'READ_ERROR'
  | 'STALE_STATE_REJECTED';

/**
 * Recommended recovery actions for resume failures.
 */
export type RecoveryAction = 'CLEAN_START' | 'RETRY_WITH_BACKUP' | 'MANUAL_INTERVENTION';

/**
 * Default maximum age for state before it's considered stale (24 hours).
 */
export const DEFAULT_MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Known artifact types for validation.
 */
const KNOWN_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'spec',
  'latticeCode',
  'witnesses',
  'contracts',
  'validatedStructure',
  'implementedCode',
  'verifiedCode',
  'finalArtifact',
  'contradictionReport',
  'structuralDefectReport',
  'clusterFailureReport',
]);

/**
 * Detects whether an existing state file is present on startup.
 *
 * @param options - Detection options.
 * @returns Detection result indicating whether state was found.
 *
 * @example
 * ```typescript
 * const result = await detectExistingState({ filePath: './state.json' });
 * if (result.found) {
 *   console.log(`Found state file modified at ${result.modifiedAt}`);
 * }
 * ```
 */
export async function detectExistingState(
  options: DetectStateOptions = {}
): Promise<StateDetectionResult> {
  const filePath = options.filePath ?? '.criticality-state.json';

  const exists = await stateFileExists(filePath);
  if (!exists) {
    return { found: false, filePath };
  }

  try {
    const stats = await safeStat(filePath);
    return {
      found: true,
      filePath,
      modifiedAt: stats.mtime,
    };
  } catch {
    // If we can't stat but file exists, report as found with current time
    return { found: true, filePath, modifiedAt: new Date() };
  }
}

/**
 * Parses a semver version string to its components.
 *
 * @param version - The version string (e.g., "1.2.3").
 * @returns The parsed version or null if invalid.
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return null;
  }

  const [, majorStr, minorStr, patchStr] = match;
  if (majorStr === undefined || minorStr === undefined || patchStr === undefined) {
    return null;
  }

  return {
    major: parseInt(majorStr, 10),
    minor: parseInt(minorStr, 10),
    patch: parseInt(patchStr, 10),
  };
}

/**
 * Compares two semver versions.
 *
 * @param a - First version.
 * @param b - Second version.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  return 0;
}

/**
 * Gets required artifacts for a given phase based on forward transitions.
 *
 * @param phase - The protocol phase to check.
 * @returns Set of artifact types required to have reached this phase.
 */
function getRequiredArtifactsForPhase(phase: ProtocolPhase): ReadonlySet<ArtifactType> {
  const required = new Set<ArtifactType>();

  // Build up required artifacts from previous transitions
  const phaseIndex = PROTOCOL_PHASES.indexOf(phase);

  if (phaseIndex > 0) {
    // Ignition -> Lattice requires spec
    required.add('spec');
  }
  if (phaseIndex > 1) {
    // Lattice -> CompositionAudit requires latticeCode, witnesses, contracts
    required.add('latticeCode');
    required.add('witnesses');
    required.add('contracts');
  }
  if (phaseIndex > 2) {
    // CompositionAudit -> Injection requires validatedStructure
    required.add('validatedStructure');
  }
  if (phaseIndex > 3) {
    // Injection -> Mesoscopic requires implementedCode
    required.add('implementedCode');
  }
  if (phaseIndex > 4) {
    // Mesoscopic -> MassDefect requires verifiedCode
    required.add('verifiedCode');
  }
  if (phaseIndex > 5) {
    // MassDefect -> Complete requires finalArtifact
    required.add('finalArtifact');
  }

  return required;
}

/**
 * Validates integrity of a state snapshot before resuming.
 *
 * Performs comprehensive validation including:
 * - Version compatibility check
 * - Phase validity check
 * - State kind validation
 * - Required artifacts validation
 * - Staleness check
 *
 * @param snapshot - The state snapshot to validate.
 * @param persistedAt - When state was persisted (from the file).
 * @param options - Validation options.
 * @returns Validation result with errors and warnings.
 *
 * @example
 * ```typescript
 * const result = validateStateIntegrity(snapshot, new Date());
 * if (!result.valid) {
 *   console.error('State validation failed:', result.errors);
 * }
 * ```
 */
export function validateStateIntegrity(
  snapshot: ProtocolStateSnapshot,
  persistedAt: Date,
  options: ValidateStateOptions = {}
): StateValidationResult {
  const errors: StateValidationError[] = [];
  const warnings: StateValidationWarning[] = [];

  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_STATE_AGE_MS;
  const allowStaleState = options.allowStaleState !== false;

  const state = snapshot.state;
  const phase = getPhase(state);

  // 1. Validate phase
  if (phase !== undefined && !isValidPhase(phase)) {
    errors.push({
      code: 'INVALID_PHASE',
      message: `Invalid protocol phase: "${String(phase)}"`,
      details: `Valid phases are: ${PROTOCOL_PHASES.join(', ')}`,
    });
  }

  // 2. Validate state kind
  if (!['Active', 'Blocked', 'Failed', 'Complete'].includes(state.kind)) {
    errors.push({
      code: 'INVALID_STATE',
      message: `Invalid state kind: "${state.kind}"`,
      details: 'Valid kinds are: Active, Blocked, Failed, Complete',
    });
  }

  // 3. Validate blocked state has required fields
  if (isBlockedState(state)) {
    const blockedState = state as BlockedState;
    if (typeof blockedState.query !== 'string' || blockedState.query.length === 0) {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: 'Blocked state missing query',
      });
    }
    if (typeof blockedState.blockedAt !== 'string') {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: 'Blocked state missing blockedAt timestamp',
      });
    }

    // Check if blocking timeout has expired
    if (blockedState.timeoutMs !== undefined && typeof blockedState.blockedAt === 'string') {
      const blockedAt = new Date(blockedState.blockedAt).getTime();
      const elapsed = Date.now() - blockedAt;
      if (elapsed > blockedState.timeoutMs) {
        warnings.push({
          code: 'BLOCKING_TIMEOUT_EXPIRED',
          message: 'Blocking state timeout has expired',
          details: `Blocked at ${blockedState.blockedAt}, timeout was ${String(blockedState.timeoutMs)}ms, elapsed: ${String(elapsed)}ms`,
        });
      }
    }
  }

  // 4. Validate failed state has required fields
  if (isFailedState(state)) {
    const failedState = state as FailedState;
    if (typeof failedState.error !== 'string') {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: 'Failed state missing error message',
      });
    }
    if (typeof failedState.recoverable !== 'boolean') {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: 'Failed state missing recoverable flag',
      });
    }
  }

  // 5. Validate artifacts array
  if (!Array.isArray(snapshot.artifacts)) {
    errors.push({
      code: 'CORRUPTED_STRUCTURE',
      message: 'Missing or invalid artifacts array',
    });
  } else {
    // Check for unknown artifact types
    const unknownArtifacts = snapshot.artifacts.filter((a: string) => !KNOWN_ARTIFACT_TYPES.has(a));
    if (unknownArtifacts.length > 0) {
      warnings.push({
        code: 'UNKNOWN_ARTIFACTS',
        message: `Unknown artifact types: ${unknownArtifacts.join(', ')}`,
        details: 'These may be from a newer version of protocol',
      });
    }

    // Check for missing required artifacts based on current phase
    if (phase !== undefined && isValidPhase(phase)) {
      const required = getRequiredArtifactsForPhase(phase);
      const artifactSet = new Set(snapshot.artifacts);
      const missing: string[] = [];

      for (const artifact of required) {
        if (!artifactSet.has(artifact)) {
          missing.push(artifact);
        }
      }

      if (missing.length > 0) {
        errors.push({
          code: 'MISSING_ARTIFACTS',
          message: `Missing required artifacts for phase ${phase}: ${missing.join(', ')}`,
          details: `Phase ${phase} requires: ${[...required].join(', ')}`,
        });
      }
    }
  }

  // 6. Validate blocking queries array
  if (!Array.isArray(snapshot.blockingQueries)) {
    errors.push({
      code: 'CORRUPTED_STRUCTURE',
      message: 'Missing or invalid blockingQueries array',
    });
  }

  // 7. Check staleness
  const age = Date.now() - persistedAt.getTime();
  if (age > maxAgeMs) {
    const ageMinutes = String(Math.round(age / 1000 / 60));
    const thresholdMinutes = String(Math.round(maxAgeMs / 1000 / 60));
    if (allowStaleState) {
      warnings.push({
        code: 'STALE_STATE',
        message: `State file is ${ageMinutes} minutes old`,
        details: `Threshold is ${thresholdMinutes} minutes`,
      });
    } else {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: `State file is too old: ${ageMinutes} minutes`,
        details: `Maximum allowed age is ${thresholdMinutes} minutes. Set allowStaleState: true to resume anyway.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a persisted state structure without loading the full snapshot.
 *
 * This performs structural validation on the raw persisted data.
 *
 * @param data - The raw persisted state data.
 * @returns Validation result.
 */
export function validatePersistedStructure(data: unknown): StateValidationResult {
  const errors: StateValidationError[] = [];
  const warnings: StateValidationWarning[] = [];

  if (data === null || typeof data !== 'object') {
    errors.push({
      code: 'CORRUPTED_STRUCTURE',
      message: 'State data is not an object',
    });
    return { valid: false, errors, warnings };
  }

  const obj = data as Record<string, unknown>;

  // Check version
  if (typeof obj.version !== 'string') {
    errors.push({
      code: 'INVALID_VERSION',
      message: 'Missing or invalid version field',
    });
  } else {
    const versionMatch = /^\d+\.\d+\.\d+$/.exec(obj.version);
    if (!versionMatch) {
      errors.push({
        code: 'INVALID_VERSION',
        message: `Invalid version format: "${obj.version}"`,
        details: 'Version must be in semver format (e.g., "1.0.0")',
      });
    } else {
      // Check version compatibility
      const comparison = compareVersions(obj.version, PERSISTED_STATE_VERSION);
      if (comparison > 0) {
        errors.push({
          code: 'FUTURE_VERSION',
          message: `State was saved with newer version: ${obj.version} (current: ${PERSISTED_STATE_VERSION})`,
          details: 'Upgrade your installation or use a compatible state file',
        });
      } else if (comparison < 0) {
        const parsed = parseVersion(obj.version);
        const current = parseVersion(PERSISTED_STATE_VERSION);
        if (parsed && current && parsed.major < current.major) {
          errors.push({
            code: 'INVALID_VERSION',
            message: `Major version mismatch: ${obj.version} vs ${PERSISTED_STATE_VERSION}`,
            details: 'State file is from an incompatible major version',
          });
        } else {
          warnings.push({
            code: 'OLD_VERSION',
            message: `State was saved with older version: ${obj.version}`,
            details: `Current version is ${PERSISTED_STATE_VERSION}`,
          });
        }
      }
    }
  }

  // Check required fields exist
  const requiredFields = ['version', 'persistedAt', 'state', 'artifacts', 'blockingQueries'];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      errors.push({
        code: 'CORRUPTED_STRUCTURE',
        message: `Missing required field: "${field}"`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Attempts to resume protocol execution from a persisted state checkpoint.
 *
 * This function:
 * 1. Detects if a state file exists
 * 2. Loads and validates the state
 * 3. Returns the snapshot for resumption or a failure with recovery recommendation
 *
 * @param filePath - Path to the state file.
 * @param options - Validation options.
 * @returns Resume result indicating success or failure with details.
 *
 * @example
 * ```typescript
 * const result = await resumeFromCheckpoint('./state.json');
 * if (result.success) {
 *   console.log(`Resuming from phase: ${result.snapshot.state.phase}`);
 * } else {
 *   console.error(`Resume failed: ${result.reason}`);
 *   console.log(`Recommended action: ${result.recoveryAction}`);
 * }
 * ```
 */
export async function resumeFromCheckpoint(
  filePath: string,
  options: ValidateStateOptions = {}
): Promise<ResumeResult> {
  // 1. Check if state file exists
  const exists = await stateFileExists(filePath);
  if (!exists) {
    return {
      success: false,
      reason: 'NO_STATE_FILE',
      recoveryAction: 'CLEAN_START',
    };
  }

  // 2. Try to load the state
  let snapshot: ProtocolStateSnapshot;
  let fileStats: { mtime: Date };

  try {
    fileStats = await safeStat(filePath);
  } catch (error) {
    return {
      success: false,
      reason: 'READ_ERROR',
      error: error instanceof Error ? error : new Error(String(error)),
      recoveryAction: 'MANUAL_INTERVENTION',
    };
  }

  try {
    snapshot = await loadState(filePath);
  } catch (error) {
    if (error instanceof StatePersistenceError) {
      const errorType = error.errorType;
      if (errorType === 'parse_error' || errorType === 'corruption_error') {
        return {
          success: false,
          reason: 'CORRUPTED_STATE',
          error,
          recoveryAction: 'CLEAN_START',
        };
      }
      if (errorType === 'schema_error' || errorType === 'validation_error') {
        return {
          success: false,
          reason: 'INVALID_STATE',
          error,
          recoveryAction: 'CLEAN_START',
        };
      }
    }

    return {
      success: false,
      reason: 'READ_ERROR',
      error: error instanceof Error ? error : new Error(String(error)),
      recoveryAction: 'MANUAL_INTERVENTION',
    };
  }

  // 3. Validate state integrity
  const validation = validateStateIntegrity(snapshot, fileStats.mtime, options);

  // Check if stale state should be rejected
  if (!validation.valid) {
    return {
      success: false,
      reason: 'INVALID_STATE',
      recoveryAction: 'CLEAN_START',
    };
  }

  // Check for staleness with rejection
  if (options.allowStaleState === false) {
    const hasStaleError = validation.errors.some((e) => e.message.includes('too old'));
    if (hasStaleError) {
      return {
        success: false,
        reason: 'STALE_STATE_REJECTED',
        recoveryAction: 'CLEAN_START',
      };
    }
  }

  return {
    success: true,
    snapshot,
    validation,
  };
}

/**
 * Determines the appropriate startup action based on existing state.
 *
 * This is a high-level function that encapsulates the startup decision logic:
 * - If no state exists, returns a fresh initial snapshot
 * - If valid state exists, validates and returns it for resumption
 * - If corrupted/invalid state exists, handles recovery
 *
 * @param filePath - Path to the state file.
 * @param options - Validation options.
 * @returns The state snapshot to use (either resumed or fresh).
 *
 * @example
 * ```typescript
 * const { snapshot, resumed, warnings } = await getStartupState('./state.json');
 * if (resumed) {
 *   console.log(`Resumed from ${snapshot.state.kind}`);
 * } else {
 *   console.log('Starting fresh from Ignition');
 * }
 * ```
 */
export async function getStartupState(
  filePath: string,
  options: ValidateStateOptions = {}
): Promise<{
  snapshot: ProtocolStateSnapshot;
  resumed: boolean;
  validation: StateValidationResult | null;
  recoveryPerformed: boolean;
}> {
  const resumeResult = await resumeFromCheckpoint(filePath, options);

  if (resumeResult.success) {
    return {
      snapshot: resumeResult.snapshot,
      resumed: true,
      validation: resumeResult.validation,
      recoveryPerformed: false,
    };
  }

  // Handle failure cases
  if (resumeResult.reason === 'NO_STATE_FILE') {
    // Clean start - no recovery needed
    return {
      snapshot: createInitialStateSnapshot(),
      resumed: false,
      validation: null,
      recoveryPerformed: false,
    };
  }

  // For corrupted/invalid/stale state, perform recovery by starting fresh
  if (
    resumeResult.recoveryAction === 'CLEAN_START' ||
    resumeResult.reason === 'CORRUPTED_STATE' ||
    resumeResult.reason === 'INVALID_STATE' ||
    resumeResult.reason === 'STALE_STATE_REJECTED'
  ) {
    return {
      snapshot: createInitialStateSnapshot(),
      resumed: false,
      validation: null,
      recoveryPerformed: true,
    };
  }

  // For manual intervention cases, also start fresh but indicate the issue
  return {
    snapshot: createInitialStateSnapshot(),
    resumed: false,
    validation: null,
    recoveryPerformed: true,
  };
}

/**
 * Checks if a state file is likely corrupted based on quick structural checks.
 *
 * This is a fast check that doesn't fully parse the state.
 *
 * @param filePath - Path to the state file.
 * @returns True if the file appears corrupted.
 */
export async function isStateCorrupted(filePath: string): Promise<boolean> {
  try {
    await loadState(filePath);
    return false;
  } catch (error) {
    if (error instanceof StatePersistenceError) {
      return (
        error.errorType === 'parse_error' ||
        error.errorType === 'corruption_error' ||
        error.errorType === 'schema_error'
      );
    }
    return true;
  }
}
