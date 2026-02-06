/**
 * Decision Ledger implementation with append operations.
 *
 * Provides an append-only ledger for recording protocol decisions.
 * Supports auto-generation of unique IDs and timestamps.
 *
 * @packageDocumentation
 */

import type {
  Decision,
  DecisionCategory,
  DecisionInput,
  DecisionPhase,
  DecisionSource,
  ConfidenceLevel,
  LedgerData,
  LedgerMeta,
  DecisionFilter,
  DecisionFilterKey,
  HistoryQueryOptions,
  DependencyGraphQueryOptions,
  DependencyGraphResult,
} from './types.js';

/**
 * Error class for ledger validation errors.
 */
export class LedgerValidationError extends Error {
  /** Array of validation failure details. */
  public readonly errors: LedgerError[];

  /**
   * Creates a new LedgerValidationError.
   *
   * @param message - Summary error message.
   * @param errors - Array of specific validation errors.
   */
  constructor(message: string, errors: LedgerError[]) {
    super(message);
    this.name = 'LedgerValidationError';
    this.errors = errors;
  }
}

/**
 * Error class for duplicate ID errors.
 */
export class DuplicateDecisionIdError extends Error {
  /** The duplicate ID. */
  public readonly duplicateId: string;

  /**
   * Creates a new DuplicateDecisionIdError.
   *
   * @param id - The duplicate ID.
   */
  constructor(id: string) {
    super(`Decision with ID '${id}' already exists in the ledger`);
    this.name = 'DuplicateDecisionIdError';
    this.duplicateId = id;
  }
}

/**
 * Error class for canonical override errors.
 */
export class CanonicalOverrideError extends Error {
  /** The decision ID that cannot be overridden. */
  public readonly decisionId: string;

  /**
   * Creates a new CanonicalOverrideError.
   *
   * @param id - The canonical decision ID.
   */
  constructor(id: string) {
    super(
      `Cannot supersede canonical decision '${id}' without explicit override flag. ` +
        'Use { forceOverrideCanonical: true } to explicitly override.'
    );
    this.name = 'CanonicalOverrideError';
    this.decisionId = id;
  }
}

/**
 * Error class for decision not found errors.
 */
export class DecisionNotFoundError extends Error {
  /** The decision ID that was not found. */
  public readonly decisionId: string;

  /**
   * Creates a new DecisionNotFoundError.
   *
   * @param id - The decision ID that was not found.
   */
  constructor(id: string) {
    super(`Decision with ID '${id}' not found in the ledger`);
    this.name = 'DecisionNotFoundError';
    this.decisionId = id;
  }
}

/**
 * Error class for invalid supersede operation errors.
 */
export class InvalidSupersedeError extends Error {
  /** The decision ID involved in the invalid operation. */
  public readonly decisionId: string;
  /** The reason the supersede is invalid. */
  public readonly reason: string;

  /**
   * Creates a new InvalidSupersedeError.
   *
   * @param id - The decision ID.
   * @param reason - The reason the supersede is invalid.
   */
  constructor(id: string, reason: string) {
    super(`Cannot supersede decision '${id}': ${reason}`);
    this.name = 'InvalidSupersedeError';
    this.decisionId = id;
    this.reason = reason;
  }
}

/**
 * Error class for circular dependency errors.
 */
export class CircularDependencyError extends Error {
  /** The cycle path that was detected. */
  public readonly cycle: string[];

  /**
   * Creates a new CircularDependencyError.
   *
   * @param cycle - The IDs forming the circular dependency (e.g., ['A', 'B', 'A']).
   */
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Error class for dependency not found errors.
 */
export class DependencyNotFoundError extends Error {
  /** The dependency ID that was not found. */
  public readonly dependencyId: string;
  /** The decision ID that has the missing dependency. */
  public readonly decisionId: string;

  /**
   * Creates a new DependencyNotFoundError.
   *
   * @param dependencyId - The dependency ID that was not found.
   * @param decisionId - The decision ID that references the missing dependency.
   */
  constructor(dependencyId: string, decisionId: string) {
    super(
      `Dependency '${dependencyId}' not found in ledger (referenced by decision '${decisionId}')`
    );
    this.name = 'DependencyNotFoundError';
    this.dependencyId = dependencyId;
    this.decisionId = decisionId;
  }
}

/**
 * Error class for invalid filter key errors.
 */
export class InvalidFilterKeyError extends Error {
  /** The invalid filter key that was provided. */
  public readonly invalidKey: string;
  /** Valid filter keys. */
  public readonly validKeys: readonly DecisionFilterKey[];

  /**
   * Creates a new InvalidFilterKeyError.
   *
   * @param invalidKey - The invalid key that was provided.
   * @param validKeys - Array of valid filter keys.
   */
  constructor(invalidKey: string, validKeys: readonly DecisionFilterKey[]) {
    super(`Invalid filter key '${invalidKey}'. Valid filter keys are: ${validKeys.join(', ')}`);
    this.name = 'InvalidFilterKeyError';
    this.invalidKey = invalidKey;
    this.validKeys = validKeys;
  }
}

/**
 * Report of a cascade invalidation operation.
 */
export interface CascadeReport {
  /** The original decision that was invalidated. */
  sourceDecisionId: string;
  /** All decisions affected by the cascade (including source). */
  affectedDecisions: CascadeAffectedDecision[];
  /** Total number of decisions invalidated. */
  totalInvalidated: number;
  /** Timestamp of the cascade operation. */
  timestamp: string;
}

/**
 * Information about a decision affected by cascade invalidation.
 */
export interface CascadeAffectedDecision {
  /** The decision ID. */
  id: string;
  /** The constraint text of the decision. */
  constraint: string;
  /** The dependency chain from source to this decision. */
  dependencyPath: string[];
  /** Depth in the dependency tree (0 = source). */
  depth: number;
}

/**
 * Options for superseding a decision.
 */
export interface SupersedeOptions {
  /**
   * Force override of canonical decisions.
   * Required when superseding a decision with confidence 'canonical'.
   */
  forceOverrideCanonical?: boolean;
}

/**
 * Options for invalidating a decision.
 */
export interface InvalidateOptions {
  /**
   * Cascade invalidation to all dependent decisions.
   * Default is true - dependents will be invalidated.
   */
  cascade?: boolean;
  /**
   * Force invalidation of canonical decisions.
   * Required when invalidating a decision with confidence 'canonical'.
   */
  forceInvalidateCanonical?: boolean;
}

/**
 * Options for appending a decision.
 */
export interface AppendOptions {
  /**
   * Skip validation of dependency IDs.
   * If false (default), all dependency IDs must exist in the ledger.
   * If true, dependency IDs are not validated.
   */
  skipDependencyValidation?: boolean;
}

/**
 * Individual ledger error details.
 */
export interface LedgerError {
  /** The field path that failed validation. */
  field: string;
  /** The invalid value that was provided. */
  value: unknown;
  /** Human-readable description of the validation failure. */
  message: string;
}

/**
 * Valid decision categories as defined in the schema.
 */
const VALID_CATEGORIES: ReadonlySet<DecisionCategory> = new Set([
  'architectural',
  'phase_structure',
  'injection',
  'ledger',
  'type_witnesses',
  'contracts',
  'models',
  'blocking',
  'testing',
  'orchestrator',
  'language_support',
  'data_model',
  'interface',
  'constraint',
  'security',
]);

/**
 * Valid decision sources as defined in the schema.
 */
const VALID_SOURCES: ReadonlySet<DecisionSource> = new Set([
  'user_explicit',
  'design_principle',
  'original_design',
  'discussion',
  'design_choice',
  'design_review',
  'injection_failure',
  'auditor_contradiction',
  'composition_audit',
  'mesoscopic_failure',
  'human_resolution',
]);

/**
 * Valid confidence levels as defined in the schema.
 */
const VALID_CONFIDENCE_LEVELS: ReadonlySet<ConfidenceLevel> = new Set([
  'canonical',
  'delegated',
  'inferred',
  'provisional',
  'suspended',
  'blocking',
]);

/**
 * Valid decision phases as defined in the schema.
 */
const VALID_PHASES: ReadonlySet<DecisionPhase> = new Set([
  'design',
  'ignition',
  'lattice',
  'composition_audit',
  'injection',
  'mesoscopic',
  'mass_defect',
]);

/**
 * Valid filter keys for querying decisions.
 */
const VALID_FILTER_KEYS: readonly DecisionFilterKey[] = [
  'category',
  'phase',
  'status',
  'confidence',
] as const;

/**
 * Pattern for valid decision IDs: category_NNN (e.g., "architectural_001").
 */
const DECISION_ID_PATTERN = /^[a-z_]+_\d{3}$/;

/**
 * Options for creating a new Ledger.
 */
export interface LedgerOptions {
  /** Project identifier. */
  project: string;
  /** Optional function to get current time (for testing). */
  now?: (() => Date) | undefined;
  /** Optional metadata to restore from existing ledger (internal use). */
  _meta?: LedgerMeta | undefined;
}

/**
 * Decision Ledger for recording protocol decisions.
 *
 * Provides an append-only data structure for recording decisions
 * with auto-generated IDs and timestamps.
 *
 * @example
 * ```typescript
 * import { Ledger } from './ledger.js';
 *
 * const ledger = new Ledger({ project: 'my-project' });
 *
 * const decision = ledger.append({
 *   category: 'architectural',
 *   constraint: 'Use PostgreSQL for persistence',
 *   source: 'design_choice',
 *   confidence: 'canonical',
 *   phase: 'design',
 * });
 *
 * console.log(decision.id); // "architectural_001"
 * console.log(decision.timestamp); // "2024-01-20T12:00:00.000Z"
 * ```
 */
export class Ledger {
  private readonly meta: LedgerMeta;
  private readonly decisions: Decision[] = [];
  private readonly idCounters = new Map<DecisionCategory, number>();
  private readonly existingIds = new Set<string>();
  private readonly now: () => Date;

  /**
   * Creates a new Ledger instance.
   *
   * @param options - Ledger creation options.
   */
  constructor(options: LedgerOptions) {
    const nowFn = options.now ?? ((): Date => new Date());
    this.now = nowFn;

    if (options._meta !== undefined) {
      // Restore from existing metadata
      this.meta = { ...options._meta };
    } else {
      // Create new ledger
      const createdAt = nowFn().toISOString();
      this.meta = {
        version: '1.0.0',
        created: createdAt,
        project: options.project,
      };
    }
  }

  /**
   * Appends a new decision to the ledger.
   *
   * Auto-generates a unique ID and sets the timestamp.
   * Validates the decision against the schema.
   * Validates dependencies exist and do not create circular references.
   *
   * @param input - Decision input without ID, timestamp, or status.
   * @param options - Optional settings for the append operation.
   * @returns The complete decision with generated ID and timestamp.
   * @throws LedgerValidationError if the input fails schema validation.
   * @throws DependencyNotFoundError if a dependency ID does not exist.
   * @throws CircularDependencyError if dependencies would create a cycle.
   *
   * @example
   * ```typescript
   * const decision = ledger.append({
   *   category: 'architectural',
   *   constraint: 'Use PostgreSQL for persistence',
   *   source: 'design_choice',
   *   confidence: 'canonical',
   *   phase: 'design',
   * });
   * ```
   */
  append(input: DecisionInput, options?: AppendOptions): Decision {
    // Validate input
    const errors = this.validateDecisionInput(input);
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n');
      throw new LedgerValidationError(
        `Decision validation failed with ${String(errors.length)} error(s):\n${errorMessages}`,
        errors
      );
    }

    // Generate ID (needed for circular dependency check)
    const id = this.generateId(input.category);

    // Check for duplicate (should not happen with auto-generation, but guard anyway)
    if (this.existingIds.has(id)) {
      throw new DuplicateDecisionIdError(id);
    }

    // Validate dependencies if provided and not skipped
    if (
      input.dependencies !== undefined &&
      input.dependencies.length > 0 &&
      options?.skipDependencyValidation !== true
    ) {
      // Check all dependencies exist
      for (const depId of input.dependencies) {
        if (!this.existingIds.has(depId)) {
          throw new DependencyNotFoundError(depId, id);
        }
      }

      // Check for circular dependencies
      this.checkCircularDependency(id, input.dependencies);
    }

    // Create the decision
    const decision: Decision = {
      id,
      timestamp: this.now().toISOString(),
      category: input.category,
      constraint: input.constraint,
      source: input.source,
      confidence: input.confidence,
      status: 'active',
      phase: input.phase,
    };

    // Add optional fields if provided
    if (input.rationale !== undefined) {
      decision.rationale = input.rationale;
    }
    if (input.dependencies !== undefined && input.dependencies.length > 0) {
      decision.dependencies = input.dependencies;
    }
    if (input.supersedes !== undefined && input.supersedes.length > 0) {
      decision.supersedes = input.supersedes;
    }
    if (input.failure_context !== undefined) {
      decision.failure_context = input.failure_context;
    }
    if (input.contradiction_resolved !== undefined) {
      decision.contradiction_resolved = input.contradiction_resolved;
    }
    if (input.human_query_id !== undefined) {
      decision.human_query_id = input.human_query_id;
    }

    // Record the decision
    this.decisions.push(decision);
    this.existingIds.add(id);

    // Update last_modified
    this.meta.last_modified = decision.timestamp;

    return decision;
  }

  /**
   * Appends a decision with a specific ID.
   *
   * Used for loading existing decisions or testing.
   * Validates the decision and rejects duplicate IDs.
   *
   * @param decision - Complete decision with ID.
   * @returns The appended decision.
   * @throws LedgerValidationError if the decision fails schema validation.
   * @throws DuplicateDecisionIdError if the ID already exists.
   */
  appendWithId(decision: Decision): Decision {
    // Validate the complete decision
    const errors = this.validateDecision(decision);
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n');
      throw new LedgerValidationError(
        `Decision validation failed with ${String(errors.length)} error(s):\n${errorMessages}`,
        errors
      );
    }

    // Check for duplicate ID
    if (this.existingIds.has(decision.id)) {
      throw new DuplicateDecisionIdError(decision.id);
    }

    // Record the decision
    this.decisions.push(decision);
    this.existingIds.add(decision.id);

    // Update counter to avoid future collisions
    this.updateCounterFromId(decision.id, decision.category);

    // Update last_modified
    this.meta.last_modified = decision.timestamp;

    return decision;
  }

  /**
   * Gets all decisions in the ledger.
   *
   * @returns A copy of the decisions array.
   */
  getDecisions(): Decision[] {
    return [...this.decisions];
  }

  /**
   * Gets the number of decisions in the ledger.
   *
   * @returns The decision count.
   */
  get size(): number {
    return this.decisions.length;
  }

  /**
   * Checks if a decision ID exists in the ledger.
   *
   * @param id - The decision ID to check.
   * @returns True if the ID exists.
   */
  hasId(id: string): boolean {
    return this.existingIds.has(id);
  }

  /**
   * Gets a decision by ID.
   *
   * @param id - The decision ID.
   * @returns The decision or undefined if not found.
   */
  getById(id: string): Decision | undefined {
    return this.decisions.find((d) => d.id === id);
  }

  /**
   * Exports the ledger data.
   *
   * @returns The complete ledger data structure.
   */
  toData(): LedgerData {
    return {
      meta: { ...this.meta },
      decisions: [...this.decisions],
    };
  }

  /**
   * Supersedes an existing decision with a new one.
   *
   * This method:
   * - Marks the old decision as superseded (status = 'superseded')
   * - Sets superseded_by on the old decision to point to the new decision
   * - Sets supersedes on the new decision to include the old decision ID
   * - Preserves the original entry (append-only invariant)
   *
   * Canonical decisions (confidence = 'canonical') require explicit override
   * via the forceOverrideCanonical option.
   *
   * @param oldDecisionId - ID of the decision to supersede.
   * @param newDecisionInput - Input for the new decision.
   * @param options - Supersede options including forceOverrideCanonical.
   * @returns Object containing both the old (updated) and new decisions.
   * @throws DecisionNotFoundError if the old decision doesn't exist.
   * @throws InvalidSupersedeError if the old decision is already superseded.
   * @throws CanonicalOverrideError if trying to supersede a canonical decision without explicit flag.
   * @throws LedgerValidationError if the new decision input fails validation.
   *
   * @example
   * ```typescript
   * // Supersede a provisional decision
   * const result = ledger.supersede('architectural_001', {
   *   category: 'architectural',
   *   constraint: 'Use MongoDB instead of PostgreSQL',
   *   source: 'design_review',
   *   confidence: 'canonical',
   *   phase: 'design',
   * });
   *
   * // Supersede a canonical decision (requires explicit flag)
   * const result = ledger.supersede('architectural_002', newInput, {
   *   forceOverrideCanonical: true,
   * });
   * ```
   */
  supersede(
    oldDecisionId: string,
    newDecisionInput: DecisionInput,
    options?: SupersedeOptions
  ): { oldDecision: Decision; newDecision: Decision } {
    // Find the old decision
    const oldDecisionIndex = this.decisions.findIndex((d) => d.id === oldDecisionId);
    if (oldDecisionIndex === -1) {
      throw new DecisionNotFoundError(oldDecisionId);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: oldDecisionIndex is numeric from .findIndex()
    const oldDecision = this.decisions[oldDecisionIndex];
    if (oldDecision === undefined) {
      throw new DecisionNotFoundError(oldDecisionId);
    }

    // Check if already superseded or invalidated
    if (oldDecision.status === 'superseded') {
      throw new InvalidSupersedeError(oldDecisionId, 'decision is already superseded');
    }
    if (oldDecision.status === 'invalidated') {
      throw new InvalidSupersedeError(oldDecisionId, 'decision is already invalidated');
    }

    // Check confidence level - canonical requires explicit override
    if (oldDecision.confidence === 'canonical' && options?.forceOverrideCanonical !== true) {
      throw new CanonicalOverrideError(oldDecisionId);
    }

    // Add the old decision ID to supersedes list in the input
    const supersedes = newDecisionInput.supersedes ?? [];
    if (!supersedes.includes(oldDecisionId)) {
      supersedes.push(oldDecisionId);
    }

    // Create the new decision with supersedes link
    const inputWithSupersedes: DecisionInput = {
      ...newDecisionInput,
      supersedes,
    };
    const newDecision = this.append(inputWithSupersedes);

    // Update the old decision in place (append-only: we update status, not delete)
    // Create a new object to maintain immutability semantics
    const updatedOldDecision: Decision = {
      ...oldDecision,
      status: 'superseded',
      superseded_by: newDecision.id,
    };

    // Replace in the array
    // eslint-disable-next-line security/detect-object-injection -- safe: oldDecisionIndex is numeric from .findIndex()
    this.decisions[oldDecisionIndex] = updatedOldDecision;

    return {
      oldDecision: updatedOldDecision,
      newDecision,
    };
  }

  /**
   * Queries decisions based on filter criteria.
   *
   * Filters can be combined (AND logic). Invalid filter keys will throw an error.
   *
   * @param filter - Filter criteria for the query.
   * @returns Array of decisions matching all filter criteria.
   * @throws InvalidFilterKeyError if an invalid filter key is provided.
   *
   * @example
   * ```typescript
   * // Get all architectural decisions
   * const archDecisions = ledger.query({ category: 'architectural' });
   *
   * // Get all active decisions in design phase
   * const activeDesign = ledger.query({ status: 'active', phase: 'design' });
   *
   * // Get all canonical decisions
   * const canonical = ledger.query({ confidence: 'canonical' });
   * ```
   */
  query(filter: DecisionFilter): Decision[] {
    // Validate filter keys
    this.validateFilterKeys(filter);

    return this.decisions.filter((decision) => {
      if (filter.category !== undefined && decision.category !== filter.category) {
        return false;
      }
      if (filter.phase !== undefined && decision.phase !== filter.phase) {
        return false;
      }
      if (filter.status !== undefined && decision.status !== filter.status) {
        return false;
      }
      if (filter.confidence !== undefined && decision.confidence !== filter.confidence) {
        return false;
      }
      return true;
    });
  }

  /**
   * Gets all active decisions (excluding superseded and invalidated).
   *
   * @returns Array of decisions with status 'active'.
   *
   * @example
   * ```typescript
   * const activeDecisions = ledger.getActiveDecisions();
   * ```
   */
  getActiveDecisions(): Decision[] {
    return this.decisions.filter((d) => d.status === 'active');
  }

  /**
   * Gets the full decision history including all superseded and invalidated entries.
   *
   * This method retrieves all decisions regardless of their status.
   *
   * @param options - Options to filter which historical entries to include.
   * @returns Array of decisions including historical (superseded/invalidated) entries.
   *
   * @example
   * ```typescript
   * // Get all decisions including superseded and invalidated
   * const allHistory = ledger.getHistory();
   *
   * // Get only active and superseded (exclude invalidated)
   * const withoutInvalidated = ledger.getHistory({ includeInvalidated: false });
   *
   * // Get only active and invalidated (exclude superseded)
   * const withoutSuperseded = ledger.getHistory({ includeSuperseded: false });
   * ```
   */
  getHistory(options?: HistoryQueryOptions): Decision[] {
    const includeSuperseded = options?.includeSuperseded !== false;
    const includeInvalidated = options?.includeInvalidated !== false;

    return this.decisions.filter((decision) => {
      if (decision.status === 'superseded' && !includeSuperseded) {
        return false;
      }
      if (decision.status === 'invalidated' && !includeInvalidated) {
        return false;
      }
      return true;
    });
  }

  /**
   * Gets decisions organized by their dependency graph.
   *
   * Returns the decision along with its direct and optionally transitive
   * dependencies and dependents.
   *
   * @param decisionId - The decision ID to query.
   * @param options - Options for including transitive relationships.
   * @returns Object containing the decision and its dependency relationships.
   * @throws DecisionNotFoundError if the decision doesn't exist.
   *
   * @example
   * ```typescript
   * // Get direct dependencies and dependents only
   * const graph = ledger.getDecisionsByDependencyGraph('architectural_001');
   *
   * // Include all transitive relationships
   * const fullGraph = ledger.getDecisionsByDependencyGraph('architectural_001', {
   *   includeTransitiveDependencies: true,
   *   includeTransitiveDependents: true,
   * });
   * ```
   */
  getDecisionsByDependencyGraph(
    decisionId: string,
    options?: DependencyGraphQueryOptions
  ): DependencyGraphResult {
    const decision = this.getById(decisionId);
    if (decision === undefined) {
      throw new DecisionNotFoundError(decisionId);
    }

    const directDependencies = this.getDependencies(decisionId);
    const directDependents = this.getDependents(decisionId);

    const result: DependencyGraphResult = {
      decision,
      directDependencies,
      directDependents,
    };

    if (options?.includeTransitiveDependencies === true) {
      result.transitiveDependencies = this.getTransitiveDependenciesPublic(decisionId);
    }

    if (options?.includeTransitiveDependents === true) {
      result.transitiveDependents = this.getTransitiveDependents(decisionId).map((d) => d.decision);
    }

    return result;
  }

  /**
   * Validates that filter keys are valid.
   *
   * @param filter - The filter object to validate.
   * @throws InvalidFilterKeyError if an invalid key is found.
   */
  private validateFilterKeys(filter: DecisionFilter): void {
    const validKeySet = new Set<string>(VALID_FILTER_KEYS);
    for (const key of Object.keys(filter)) {
      if (!validKeySet.has(key)) {
        throw new InvalidFilterKeyError(key, VALID_FILTER_KEYS);
      }
    }
  }

  /**
   * Gets all decisions that the given decision transitively depends on.
   * Uses BFS to traverse the dependency tree upwards.
   *
   * @param decisionId - The decision ID to find transitive dependencies for.
   * @returns Array of all decisions this decision transitively depends on.
   */
  private getTransitiveDependenciesPublic(decisionId: string): Decision[] {
    const result: Decision[] = [];
    const visited = new Set<string>();
    const queue = [...this.getDependencies(decisionId)];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }

      if (!visited.has(current.id)) {
        visited.add(current.id);
        result.push(current);

        const deps = this.getDependencies(current.id);
        for (const dep of deps) {
          if (!visited.has(dep.id)) {
            queue.push(dep);
          }
        }
      }
    }

    return result;
  }

  /**
   * Generates a unique ID for a decision.
   *
   * @param category - The decision category.
   * @returns A unique ID in the format "category_NNN".
   */
  private generateId(category: DecisionCategory): string {
    const currentCount = this.idCounters.get(category) ?? 0;
    const newCount = currentCount + 1;
    this.idCounters.set(category, newCount);

    const paddedNumber = String(newCount).padStart(3, '0');
    return `${category}_${paddedNumber}`;
  }

  /**
   * Updates the ID counter from an existing ID to prevent collisions.
   *
   * @param id - The existing ID.
   * @param category - The decision category.
   */
  private updateCounterFromId(id: string, category: DecisionCategory): void {
    const match = /_(\d+)$/.exec(id);
    if (match?.[1] !== undefined) {
      const idNumber = parseInt(match[1], 10);
      const currentCount = this.idCounters.get(category) ?? 0;
      if (idNumber > currentCount) {
        this.idCounters.set(category, idNumber);
      }
    }
  }

  /**
   * Validates a decision input.
   *
   * @param input - The decision input to validate.
   * @returns Array of validation errors.
   */
  private validateDecisionInput(input: DecisionInput): LedgerError[] {
    const errors: LedgerError[] = [];

    // Validate category
    if (!VALID_CATEGORIES.has(input.category)) {
      errors.push({
        field: 'category',
        value: input.category,
        message: `Invalid category '${input.category}'. Valid categories: ${[...VALID_CATEGORIES].join(', ')}`,
      });
    }

    // Validate constraint is non-empty
    if (typeof input.constraint !== 'string' || input.constraint.trim() === '') {
      errors.push({
        field: 'constraint',
        value: input.constraint,
        message: 'Constraint must be a non-empty string',
      });
    }

    // Validate source
    if (!VALID_SOURCES.has(input.source)) {
      errors.push({
        field: 'source',
        value: input.source,
        message: `Invalid source '${input.source}'. Valid sources: ${[...VALID_SOURCES].join(', ')}`,
      });
    }

    // Validate confidence
    if (!VALID_CONFIDENCE_LEVELS.has(input.confidence)) {
      errors.push({
        field: 'confidence',
        value: input.confidence,
        message: `Invalid confidence '${input.confidence}'. Valid levels: ${[...VALID_CONFIDENCE_LEVELS].join(', ')}`,
      });
    }

    // Validate phase
    if (!VALID_PHASES.has(input.phase)) {
      errors.push({
        field: 'phase',
        value: input.phase,
        message: `Invalid phase '${input.phase}'. Valid phases: ${[...VALID_PHASES].join(', ')}`,
      });
    }

    // Validate dependencies if provided (must be non-empty strings)
    if (input.dependencies !== undefined) {
      for (let i = 0; i < input.dependencies.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
        const dep = input.dependencies[i];
        if (typeof dep !== 'string' || dep.trim() === '') {
          errors.push({
            field: `dependencies[${String(i)}]`,
            value: dep,
            message: 'Dependency must be a non-empty string',
          });
        }
      }
    }

    // Validate supersedes if provided (must be non-empty strings)
    if (input.supersedes !== undefined) {
      for (let i = 0; i < input.supersedes.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
        const sup = input.supersedes[i];
        if (typeof sup !== 'string' || sup.trim() === '') {
          errors.push({
            field: `supersedes[${String(i)}]`,
            value: sup,
            message: 'Supersedes entry must be a non-empty string',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validates a complete decision.
   *
   * @param decision - The decision to validate.
   * @returns Array of validation errors.
   */
  private validateDecision(decision: Decision): LedgerError[] {
    const errors: LedgerError[] = [];

    // Validate ID format
    if (!DECISION_ID_PATTERN.test(decision.id)) {
      errors.push({
        field: 'id',
        value: decision.id,
        message: `Invalid ID format '${decision.id}'. Must match pattern: category_NNN (e.g., 'architectural_001')`,
      });
    }

    // Validate timestamp is ISO 8601
    if (typeof decision.timestamp !== 'string' || isNaN(Date.parse(decision.timestamp))) {
      errors.push({
        field: 'timestamp',
        value: decision.timestamp,
        message: 'Timestamp must be a valid ISO 8601 date string',
      });
    }

    // Validate status
    const validStatuses = ['active', 'superseded', 'invalidated'] as const;
    if (!validStatuses.includes(decision.status as (typeof validStatuses)[number])) {
      errors.push({
        field: 'status',
        value: decision.status,
        message: `Invalid status '${decision.status}'. Valid statuses: ${validStatuses.join(', ')}`,
      });
    }

    // Validate other fields using input validation
    // Build input object, omitting undefined fields for exactOptionalPropertyTypes
    const inputForValidation: DecisionInput = {
      category: decision.category,
      constraint: decision.constraint,
      source: decision.source,
      confidence: decision.confidence,
      phase: decision.phase,
    };
    if (decision.rationale !== undefined) {
      inputForValidation.rationale = decision.rationale;
    }
    if (decision.dependencies !== undefined) {
      inputForValidation.dependencies = decision.dependencies;
    }
    if (decision.supersedes !== undefined) {
      inputForValidation.supersedes = decision.supersedes;
    }
    if (decision.failure_context !== undefined) {
      inputForValidation.failure_context = decision.failure_context;
    }
    if (decision.contradiction_resolved !== undefined) {
      inputForValidation.contradiction_resolved = decision.contradiction_resolved;
    }
    if (decision.human_query_id !== undefined) {
      inputForValidation.human_query_id = decision.human_query_id;
    }
    const inputErrors = this.validateDecisionInput(inputForValidation);

    errors.push(...inputErrors);

    return errors;
  }

  /**
   * Checks for circular dependencies in the dependency graph.
   *
   * @param newId - The ID of the new decision being added.
   * @param dependencies - The dependencies of the new decision.
   * @throws CircularDependencyError if adding these dependencies would create a cycle.
   */
  private checkCircularDependency(newId: string, dependencies: string[]): void {
    // Build a dependency graph including the new decision
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    // DFS to detect cycles starting from each dependency
    const hasCycle = (nodeId: string): string[] | null => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle - build the cycle path
        const cycleStart = path.indexOf(nodeId);
        return [...path.slice(cycleStart), nodeId];
      }

      if (visited.has(nodeId)) {
        return null;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = this.decisions.find((d) => d.id === nodeId);
      if (node?.dependencies !== undefined) {
        for (const depId of node.dependencies) {
          const cycle = hasCycle(depId);
          if (cycle !== null) {
            return cycle;
          }
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return null;
    };

    // Check if adding newId with these dependencies creates a cycle
    // Start by checking if any dependency transitively depends on newId (which would create a cycle)
    // Since newId doesn't exist yet, we simulate it by checking if any dependency can reach newId
    // through the existing graph. But since newId doesn't exist, we check if any dependency
    // could eventually be pointed to by newId's dependencies.

    // Actually, for a new node: A cycle exists if newId depends on X and X (transitively) depends on newId
    // Since newId doesn't exist in the graph yet, X cannot depend on newId.
    // So for a brand new node, there's no cycle possible with existing nodes.

    // However, if the same ID is being re-added (which our code prevents), or if
    // the dependencies include the newId itself, that would be a cycle.
    if (dependencies.includes(newId)) {
      throw new CircularDependencyError([newId, newId]);
    }

    // For loading existing data, check if any dependency path leads back to a node
    // that depends on something in our path. This is a general cycle detection.
    for (const depId of dependencies) {
      visited.clear();
      recursionStack.clear();
      path.length = 0;
      path.push(newId);
      recursionStack.add(newId);

      const cycle = hasCycle(depId);
      if (cycle !== null) {
        throw new CircularDependencyError([newId, ...cycle]);
      }
    }
  }

  /**
   * Gets all decisions that depend on the given decision ID.
   *
   * @param decisionId - The decision ID to find dependents for.
   * @returns Array of decisions that have this ID in their dependencies.
   */
  getDependents(decisionId: string): Decision[] {
    return this.decisions.filter((d) => d.dependencies?.includes(decisionId) === true);
  }

  /**
   * Gets all decisions that the given decision depends on (direct dependencies).
   *
   * @param decisionId - The decision ID to find dependencies for.
   * @returns Array of decisions that this decision depends on.
   */
  getDependencies(decisionId: string): Decision[] {
    const decision = this.getById(decisionId);
    if (decision?.dependencies === undefined) {
      return [];
    }
    return decision.dependencies
      .map((depId) => this.getById(depId))
      .filter((d): d is Decision => d !== undefined);
  }

  /**
   * Gets all decisions that transitively depend on the given decision ID.
   * Uses breadth-first search to traverse the dependency tree.
   *
   * @param decisionId - The decision ID to find transitive dependents for.
   * @returns Array of objects containing the decision and its depth from the source.
   */
  private getTransitiveDependents(
    decisionId: string
  ): { decision: Decision; depth: number; path: string[] }[] {
    const result: { decision: Decision; depth: number; path: string[] }[] = [];
    const visited = new Set<string>();
    const queue: { id: string; depth: number; path: string[] }[] = [
      { id: decisionId, depth: 0, path: [decisionId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }

      const dependents = this.getDependents(current.id);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          visited.add(dep.id);
          const newPath = [...current.path, dep.id];
          result.push({ decision: dep, depth: current.depth + 1, path: newPath });
          queue.push({ id: dep.id, depth: current.depth + 1, path: newPath });
        }
      }
    }

    return result;
  }

  /**
   * Invalidates a decision and optionally cascades to all dependent decisions.
   *
   * This method:
   * - Marks the decision as invalidated (status = 'invalidated')
   * - If cascade is enabled (default), also invalidates all decisions that depend on it
   * - Generates a cascade report showing all affected decisions
   * - Preserves the original entries (append-only invariant)
   *
   * Canonical decisions (confidence = 'canonical') require explicit override
   * via the forceInvalidateCanonical option.
   *
   * @param decisionId - ID of the decision to invalidate.
   * @param options - Invalidate options including cascade and forceInvalidateCanonical.
   * @returns CascadeReport showing all affected decisions.
   * @throws DecisionNotFoundError if the decision doesn't exist.
   * @throws InvalidSupersedeError if the decision is already invalidated or superseded.
   * @throws CanonicalOverrideError if trying to invalidate a canonical decision without explicit flag.
   *
   * @example
   * ```typescript
   * // Invalidate decision A and cascade to dependents B and C
   * const report = ledger.invalidate('architectural_001');
   * console.log(report.totalInvalidated); // 3 (A, B, C)
   *
   * // Invalidate without cascade
   * const report = ledger.invalidate('architectural_001', { cascade: false });
   *
   * // Invalidate a canonical decision (requires explicit flag)
   * const report = ledger.invalidate('architectural_001', {
   *   forceInvalidateCanonical: true,
   * });
   * ```
   */
  invalidate(decisionId: string, options?: InvalidateOptions): CascadeReport {
    // Find the decision
    const decisionIndex = this.decisions.findIndex((d) => d.id === decisionId);
    if (decisionIndex === -1) {
      throw new DecisionNotFoundError(decisionId);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
    const decision = this.decisions[decisionIndex];
    if (decision === undefined) {
      throw new DecisionNotFoundError(decisionId);
    }

    // Check if already invalidated or superseded
    if (decision.status === 'invalidated') {
      throw new InvalidSupersedeError(decisionId, 'decision is already invalidated');
    }
    if (decision.status === 'superseded') {
      throw new InvalidSupersedeError(decisionId, 'decision is already superseded');
    }

    // Check confidence level - canonical requires explicit override
    if (decision.confidence === 'canonical' && options?.forceInvalidateCanonical !== true) {
      throw new CanonicalOverrideError(decisionId);
    }

    const timestamp = this.now().toISOString();
    const cascade = options?.cascade !== false; // Default to true
    const affectedDecisions: CascadeAffectedDecision[] = [];

    // Add the source decision to the affected list
    affectedDecisions.push({
      id: decision.id,
      constraint: decision.constraint,
      dependencyPath: [decision.id],
      depth: 0,
    });

    // Invalidate the source decision
    const updatedDecision: Decision = {
      ...decision,
      status: 'invalidated',
    };
    // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
    this.decisions[decisionIndex] = updatedDecision;

    // If cascade is enabled, invalidate all dependents
    if (cascade) {
      const transitiveDependents = this.getTransitiveDependents(decisionId);

      for (const { decision: dependent, depth, path } of transitiveDependents) {
        // Find the index of this dependent
        const depIndex = this.decisions.findIndex((d) => d.id === dependent.id);
        if (depIndex !== -1) {
          // eslint-disable-next-line security/detect-object-injection -- safe: depIndex is numeric from .findIndex()
          const depDecision = this.decisions[depIndex];
          // Only invalidate if still active
          if (depDecision?.status === 'active') {
            const updatedDep: Decision = {
              ...depDecision,
              status: 'invalidated',
            };
            // eslint-disable-next-line security/detect-object-injection -- safe: depIndex is numeric from .findIndex()
            this.decisions[depIndex] = updatedDep;

            affectedDecisions.push({
              id: dependent.id,
              constraint: dependent.constraint,
              dependencyPath: path,
              depth,
            });
          }
        }
      }
    }

    // Update last_modified
    this.meta.last_modified = timestamp;

    return {
      sourceDecisionId: decisionId,
      affectedDecisions,
      totalInvalidated: affectedDecisions.length,
      timestamp,
    };
  }

  /**
   * Downgrades a delegated decision to inferred confidence level.
   *
   * Per ledger_007: Delegated decisions downgrade to 'inferred' only when
   * Composition Audit finds contradictions involving the decision.
   *
   * This method:
   * - Only affects decisions with confidence 'delegated'
   * - Changes confidence from 'delegated' to 'inferred'
   * - Preserves the decision's active status (no status change)
   * - Records the contradiction that triggered the downgrade
   *
   * @param decisionId - ID of the delegated decision to downgrade.
   * @param contradictionReason - Explanation of the contradiction from Composition Audit.
   * @returns The updated decision with 'inferred' confidence.
   * @throws DecisionNotFoundError if the decision doesn't exist.
   * @throws InvalidSupersedeError if the decision is not 'delegated' confidence.
   *
   * @example
   * ```typescript
   * // Downgrade a delegated decision when Composition Audit finds contradiction
   * const updated = ledger.downgradeDelegated(
   *   'architectural_001',
   *   'Contradicts constraint in architectural_003: mutually exclusive options'
   * );
   * console.log(updated.confidence); // 'inferred'
   * console.log(updated.failure_context); // Contains the contradiction reason
   * ```
   */
  downgradeDelegated(decisionId: string, contradictionReason: string): Decision {
    // Find the decision
    const decisionIndex = this.decisions.findIndex((d) => d.id === decisionId);
    if (decisionIndex === -1) {
      throw new DecisionNotFoundError(decisionId);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
    const decision = this.decisions[decisionIndex];
    if (decision === undefined) {
      throw new DecisionNotFoundError(decisionId);
    }

    // Only downgrade delegated decisions
    if (decision.confidence !== 'delegated') {
      throw new InvalidSupersedeError(
        decisionId,
        `cannot downgrade decision with confidence '${decision.confidence}'; only 'delegated' decisions can be downgraded per ledger_007`
      );
    }

    // Check if already superseded or invalidated
    if (decision.status !== 'active') {
      throw new InvalidSupersedeError(
        decisionId,
        `cannot downgrade decision with status '${decision.status}'; only active decisions can be downgraded`
      );
    }

    // Create the downgraded decision with inferred confidence
    const updatedDecision: Decision = {
      ...decision,
      confidence: 'inferred',
      failure_context:
        decision.failure_context !== undefined
          ? `${decision.failure_context}; Composition Audit contradiction: ${contradictionReason}`
          : `Composition Audit contradiction: ${contradictionReason}`,
    };

    // Replace in the array
    // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
    this.decisions[decisionIndex] = updatedDecision;

    // Update last_modified
    this.meta.last_modified = this.now().toISOString();

    return updatedDecision;
  }
}

/**
 * Creates a new Ledger instance from existing data.
 *
 * Validates all decisions and reconstructs the ID counters.
 *
 * @param data - The ledger data to load.
 * @param options - Optional settings (now function for testing).
 * @returns A new Ledger instance with the loaded data.
 * @throws LedgerValidationError if any decision fails validation.
 * @throws DuplicateDecisionIdError if duplicate IDs are found.
 *
 * @example
 * ```typescript
 * const data = JSON.parse(fs.readFileSync('ledger.json', 'utf-8'));
 * const ledger = fromData(data);
 * ```
 */
export function fromData(data: LedgerData, options?: { now?: (() => Date) | undefined }): Ledger {
  const nowFn = options?.now;
  const ledgerOptions: LedgerOptions = {
    project: data.meta.project,
    _meta: data.meta,
  };
  if (nowFn !== undefined) {
    ledgerOptions.now = nowFn;
  }
  const ledger = new Ledger(ledgerOptions);

  // Load all decisions
  for (const decision of data.decisions) {
    ledger.appendWithId(decision);
  }

  return ledger;
}
