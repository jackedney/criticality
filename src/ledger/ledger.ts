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
   *
   * @param input - Decision input without ID, timestamp, or status.
   * @returns The complete decision with generated ID and timestamp.
   * @throws LedgerValidationError if the input fails schema validation.
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
  append(input: DecisionInput): Decision {
    // Validate input
    const errors = this.validateDecisionInput(input);
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n');
      throw new LedgerValidationError(
        `Decision validation failed with ${String(errors.length)} error(s):\n${errorMessages}`,
        errors
      );
    }

    // Generate ID
    const id = this.generateId(input.category);

    // Check for duplicate (should not happen with auto-generation, but guard anyway)
    if (this.existingIds.has(id)) {
      throw new DuplicateDecisionIdError(id);
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
    this.decisions[oldDecisionIndex] = updatedOldDecision;

    return {
      oldDecision: updatedOldDecision,
      newDecision,
    };
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
