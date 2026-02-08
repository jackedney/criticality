"use strict";
/**
 * Decision Ledger implementation with append operations.
 *
 * Provides an append-only ledger for recording protocol decisions.
 * Supports auto-generation of unique IDs and timestamps.
 *
 * @packageDocumentation
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ledger = exports.InvalidFilterKeyError = exports.DependencyNotFoundError = exports.CircularDependencyError = exports.InvalidSupersedeError = exports.DecisionNotFoundError = exports.CanonicalOverrideError = exports.DuplicateDecisionIdError = exports.LedgerValidationError = void 0;
exports.fromData = fromData;
/**
 * Error class for ledger validation errors.
 */
var LedgerValidationError = /** @class */ (function (_super) {
    __extends(LedgerValidationError, _super);
    /**
     * Creates a new LedgerValidationError.
     *
     * @param message - Summary error message.
     * @param errors - Array of specific validation errors.
     */
    function LedgerValidationError(message, errors) {
        var _this = _super.call(this, message) || this;
        _this.name = 'LedgerValidationError';
        _this.errors = errors;
        return _this;
    }
    return LedgerValidationError;
}(Error));
exports.LedgerValidationError = LedgerValidationError;
/**
 * Error class for duplicate ID errors.
 */
var DuplicateDecisionIdError = /** @class */ (function (_super) {
    __extends(DuplicateDecisionIdError, _super);
    /**
     * Creates a new DuplicateDecisionIdError.
     *
     * @param id - The duplicate ID.
     */
    function DuplicateDecisionIdError(id) {
        var _this = _super.call(this, "Decision with ID '".concat(id, "' already exists in the ledger")) || this;
        _this.name = 'DuplicateDecisionIdError';
        _this.duplicateId = id;
        return _this;
    }
    return DuplicateDecisionIdError;
}(Error));
exports.DuplicateDecisionIdError = DuplicateDecisionIdError;
/**
 * Error class for canonical override errors.
 */
var CanonicalOverrideError = /** @class */ (function (_super) {
    __extends(CanonicalOverrideError, _super);
    /**
     * Creates a new CanonicalOverrideError.
     *
     * @param id - The canonical decision ID.
     */
    function CanonicalOverrideError(id) {
        var _this = _super.call(this, "Cannot supersede canonical decision '".concat(id, "' without explicit override flag. ") +
            'Use { forceOverrideCanonical: true } to explicitly override.') || this;
        _this.name = 'CanonicalOverrideError';
        _this.decisionId = id;
        return _this;
    }
    return CanonicalOverrideError;
}(Error));
exports.CanonicalOverrideError = CanonicalOverrideError;
/**
 * Error class for decision not found errors.
 */
var DecisionNotFoundError = /** @class */ (function (_super) {
    __extends(DecisionNotFoundError, _super);
    /**
     * Creates a new DecisionNotFoundError.
     *
     * @param id - The decision ID that was not found.
     */
    function DecisionNotFoundError(id) {
        var _this = _super.call(this, "Decision with ID '".concat(id, "' not found in the ledger")) || this;
        _this.name = 'DecisionNotFoundError';
        _this.decisionId = id;
        return _this;
    }
    return DecisionNotFoundError;
}(Error));
exports.DecisionNotFoundError = DecisionNotFoundError;
/**
 * Error class for invalid supersede operation errors.
 */
var InvalidSupersedeError = /** @class */ (function (_super) {
    __extends(InvalidSupersedeError, _super);
    /**
     * Creates a new InvalidSupersedeError.
     *
     * @param id - The decision ID.
     * @param reason - The reason the supersede is invalid.
     */
    function InvalidSupersedeError(id, reason) {
        var _this = _super.call(this, "Cannot supersede decision '".concat(id, "': ").concat(reason)) || this;
        _this.name = 'InvalidSupersedeError';
        _this.decisionId = id;
        _this.reason = reason;
        return _this;
    }
    return InvalidSupersedeError;
}(Error));
exports.InvalidSupersedeError = InvalidSupersedeError;
/**
 * Error class for circular dependency errors.
 */
var CircularDependencyError = /** @class */ (function (_super) {
    __extends(CircularDependencyError, _super);
    /**
     * Creates a new CircularDependencyError.
     *
     * @param cycle - The IDs forming the circular dependency (e.g., ['A', 'B', 'A']).
     */
    function CircularDependencyError(cycle) {
        var _this = _super.call(this, "Circular dependency detected: ".concat(cycle.join(' -> '))) || this;
        _this.name = 'CircularDependencyError';
        _this.cycle = cycle;
        return _this;
    }
    return CircularDependencyError;
}(Error));
exports.CircularDependencyError = CircularDependencyError;
/**
 * Error class for dependency not found errors.
 */
var DependencyNotFoundError = /** @class */ (function (_super) {
    __extends(DependencyNotFoundError, _super);
    /**
     * Creates a new DependencyNotFoundError.
     *
     * @param dependencyId - The dependency ID that was not found.
     * @param decisionId - The decision ID that references the missing dependency.
     */
    function DependencyNotFoundError(dependencyId, decisionId) {
        var _this = _super.call(this, "Dependency '".concat(dependencyId, "' not found in ledger (referenced by decision '").concat(decisionId, "')")) || this;
        _this.name = 'DependencyNotFoundError';
        _this.dependencyId = dependencyId;
        _this.decisionId = decisionId;
        return _this;
    }
    return DependencyNotFoundError;
}(Error));
exports.DependencyNotFoundError = DependencyNotFoundError;
/**
 * Error class for invalid filter key errors.
 */
var InvalidFilterKeyError = /** @class */ (function (_super) {
    __extends(InvalidFilterKeyError, _super);
    /**
     * Creates a new InvalidFilterKeyError.
     *
     * @param invalidKey - The invalid key that was provided.
     * @param validKeys - Array of valid filter keys.
     */
    function InvalidFilterKeyError(invalidKey, validKeys) {
        var _this = _super.call(this, "Invalid filter key '".concat(invalidKey, "'. Valid filter keys are: ").concat(validKeys.join(', '))) || this;
        _this.name = 'InvalidFilterKeyError';
        _this.invalidKey = invalidKey;
        _this.validKeys = validKeys;
        return _this;
    }
    return InvalidFilterKeyError;
}(Error));
exports.InvalidFilterKeyError = InvalidFilterKeyError;
/**
 * Valid decision categories as defined in the schema.
 */
var VALID_CATEGORIES = new Set([
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
var VALID_SOURCES = new Set([
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
var VALID_CONFIDENCE_LEVELS = new Set([
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
var VALID_PHASES = new Set([
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
var VALID_FILTER_KEYS = [
    'category',
    'phase',
    'status',
    'confidence',
];
/**
 * Pattern for valid decision IDs: category_NNN (e.g., "architectural_001").
 */
var DECISION_ID_PATTERN = /^[a-z_]+_\d{3}$/;
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
var Ledger = /** @class */ (function () {
    /**
     * Creates a new Ledger instance.
     *
     * @param options - Ledger creation options.
     */
    function Ledger(options) {
        var _a;
        this.decisions = [];
        this.idCounters = new Map();
        this.existingIds = new Set();
        var nowFn = (_a = options.now) !== null && _a !== void 0 ? _a : (function () { return new Date(); });
        this.now = nowFn;
        if (options._meta !== undefined) {
            // Restore from existing metadata
            this.meta = __assign({}, options._meta);
        }
        else {
            // Create new ledger
            var createdAt = nowFn().toISOString();
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
    Ledger.prototype.append = function (input, options) {
        // Validate input
        var errors = this.validateDecisionInput(input);
        if (errors.length > 0) {
            var errorMessages = errors.map(function (e) { return "  - ".concat(e.field, ": ").concat(e.message); }).join('\n');
            throw new LedgerValidationError("Decision validation failed with ".concat(String(errors.length), " error(s):\n").concat(errorMessages), errors);
        }
        // Generate ID (needed for circular dependency check)
        var id = this.generateId(input.category);
        // Check for duplicate (should not happen with auto-generation, but guard anyway)
        if (this.existingIds.has(id)) {
            throw new DuplicateDecisionIdError(id);
        }
        // Validate dependencies if provided and not skipped
        if (input.dependencies !== undefined &&
            input.dependencies.length > 0 &&
            (options === null || options === void 0 ? void 0 : options.skipDependencyValidation) !== true) {
            // Check all dependencies exist
            for (var _i = 0, _a = input.dependencies; _i < _a.length; _i++) {
                var depId = _a[_i];
                if (!this.existingIds.has(depId)) {
                    throw new DependencyNotFoundError(depId, id);
                }
            }
            // Check for circular dependencies
            this.checkCircularDependency(id, input.dependencies);
        }
        // Create the decision
        var decision = {
            id: id,
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
    };
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
    Ledger.prototype.appendWithId = function (decision) {
        // Validate the complete decision
        var errors = this.validateDecision(decision);
        if (errors.length > 0) {
            var errorMessages = errors.map(function (e) { return "  - ".concat(e.field, ": ").concat(e.message); }).join('\n');
            throw new LedgerValidationError("Decision validation failed with ".concat(String(errors.length), " error(s):\n").concat(errorMessages), errors);
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
    };
    /**
     * Gets all decisions in the ledger.
     *
     * @returns A copy of the decisions array.
     */
    Ledger.prototype.getDecisions = function () {
        return __spreadArray([], this.decisions, true);
    };
    Object.defineProperty(Ledger.prototype, "size", {
        /**
         * Gets the number of decisions in the ledger.
         *
         * @returns The decision count.
         */
        get: function () {
            return this.decisions.length;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Checks if a decision ID exists in the ledger.
     *
     * @param id - The decision ID to check.
     * @returns True if the ID exists.
     */
    Ledger.prototype.hasId = function (id) {
        return this.existingIds.has(id);
    };
    /**
     * Gets a decision by ID.
     *
     * @param id - The decision ID.
     * @returns The decision or undefined if not found.
     */
    Ledger.prototype.getById = function (id) {
        return this.decisions.find(function (d) { return d.id === id; });
    };
    /**
     * Exports the ledger data.
     *
     * @returns The complete ledger data structure.
     */
    Ledger.prototype.toData = function () {
        return {
            meta: __assign({}, this.meta),
            decisions: __spreadArray([], this.decisions, true),
        };
    };
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
    Ledger.prototype.supersede = function (oldDecisionId, newDecisionInput, options) {
        var _a;
        // Find the old decision
        var oldDecisionIndex = this.decisions.findIndex(function (d) { return d.id === oldDecisionId; });
        if (oldDecisionIndex === -1) {
            throw new DecisionNotFoundError(oldDecisionId);
        }
        // eslint-disable-next-line security/detect-object-injection -- safe: oldDecisionIndex is numeric from .findIndex()
        var oldDecision = this.decisions[oldDecisionIndex];
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
        if (oldDecision.confidence === 'canonical' && (options === null || options === void 0 ? void 0 : options.forceOverrideCanonical) !== true) {
            throw new CanonicalOverrideError(oldDecisionId);
        }
        // Add the old decision ID to supersedes list in the input
        var supersedes = (_a = newDecisionInput.supersedes) !== null && _a !== void 0 ? _a : [];
        if (!supersedes.includes(oldDecisionId)) {
            supersedes.push(oldDecisionId);
        }
        // Create the new decision with supersedes link
        var inputWithSupersedes = __assign(__assign({}, newDecisionInput), { supersedes: supersedes });
        var newDecision = this.append(inputWithSupersedes);
        // Update the old decision in place (append-only: we update status, not delete)
        // Create a new object to maintain immutability semantics
        var updatedOldDecision = __assign(__assign({}, oldDecision), { status: 'superseded', superseded_by: newDecision.id });
        // Replace in the array
        // eslint-disable-next-line security/detect-object-injection -- safe: oldDecisionIndex is numeric from .findIndex()
        this.decisions[oldDecisionIndex] = updatedOldDecision;
        return {
            oldDecision: updatedOldDecision,
            newDecision: newDecision,
        };
    };
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
    Ledger.prototype.query = function (filter) {
        // Validate filter keys
        this.validateFilterKeys(filter);
        return this.decisions.filter(function (decision) {
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
    };
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
    Ledger.prototype.getActiveDecisions = function () {
        return this.decisions.filter(function (d) { return d.status === 'active'; });
    };
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
    Ledger.prototype.getHistory = function (options) {
        var includeSuperseded = (options === null || options === void 0 ? void 0 : options.includeSuperseded) !== false;
        var includeInvalidated = (options === null || options === void 0 ? void 0 : options.includeInvalidated) !== false;
        return this.decisions.filter(function (decision) {
            if (decision.status === 'superseded' && !includeSuperseded) {
                return false;
            }
            if (decision.status === 'invalidated' && !includeInvalidated) {
                return false;
            }
            return true;
        });
    };
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
    Ledger.prototype.getDecisionsByDependencyGraph = function (decisionId, options) {
        var decision = this.getById(decisionId);
        if (decision === undefined) {
            throw new DecisionNotFoundError(decisionId);
        }
        var directDependencies = this.getDependencies(decisionId);
        var directDependents = this.getDependents(decisionId);
        var result = {
            decision: decision,
            directDependencies: directDependencies,
            directDependents: directDependents,
        };
        if ((options === null || options === void 0 ? void 0 : options.includeTransitiveDependencies) === true) {
            result.transitiveDependencies = this.getTransitiveDependenciesPublic(decisionId);
        }
        if ((options === null || options === void 0 ? void 0 : options.includeTransitiveDependents) === true) {
            result.transitiveDependents = this.getTransitiveDependents(decisionId).map(function (d) { return d.decision; });
        }
        return result;
    };
    /**
     * Validates that filter keys are valid.
     *
     * @param filter - The filter object to validate.
     * @throws InvalidFilterKeyError if an invalid key is found.
     */
    Ledger.prototype.validateFilterKeys = function (filter) {
        var validKeySet = new Set(VALID_FILTER_KEYS);
        for (var _i = 0, _a = Object.keys(filter); _i < _a.length; _i++) {
            var key = _a[_i];
            if (!validKeySet.has(key)) {
                throw new InvalidFilterKeyError(key, VALID_FILTER_KEYS);
            }
        }
    };
    /**
     * Gets all decisions that the given decision transitively depends on.
     * Uses BFS to traverse the dependency tree upwards.
     *
     * @param decisionId - The decision ID to find transitive dependencies for.
     * @returns Array of all decisions this decision transitively depends on.
     */
    Ledger.prototype.getTransitiveDependenciesPublic = function (decisionId) {
        var result = [];
        var visited = new Set();
        var queue = __spreadArray([], this.getDependencies(decisionId), true);
        while (queue.length > 0) {
            var current = queue.shift();
            if (current === undefined) {
                break;
            }
            if (!visited.has(current.id)) {
                visited.add(current.id);
                result.push(current);
                var deps = this.getDependencies(current.id);
                for (var _i = 0, deps_1 = deps; _i < deps_1.length; _i++) {
                    var dep = deps_1[_i];
                    if (!visited.has(dep.id)) {
                        queue.push(dep);
                    }
                }
            }
        }
        return result;
    };
    /**
     * Generates a unique ID for a decision.
     *
     * @param category - The decision category.
     * @returns A unique ID in the format "category_NNN".
     */
    Ledger.prototype.generateId = function (category) {
        var _a;
        var currentCount = (_a = this.idCounters.get(category)) !== null && _a !== void 0 ? _a : 0;
        var newCount = currentCount + 1;
        this.idCounters.set(category, newCount);
        var paddedNumber = String(newCount).padStart(3, '0');
        return "".concat(category, "_").concat(paddedNumber);
    };
    /**
     * Updates the ID counter from an existing ID to prevent collisions.
     *
     * @param id - The existing ID.
     * @param category - The decision category.
     */
    Ledger.prototype.updateCounterFromId = function (id, category) {
        var _a;
        var match = /_(\d+)$/.exec(id);
        if ((match === null || match === void 0 ? void 0 : match[1]) !== undefined) {
            var idNumber = parseInt(match[1], 10);
            var currentCount = (_a = this.idCounters.get(category)) !== null && _a !== void 0 ? _a : 0;
            if (idNumber > currentCount) {
                this.idCounters.set(category, idNumber);
            }
        }
    };
    /**
     * Validates a decision input.
     *
     * @param input - The decision input to validate.
     * @returns Array of validation errors.
     */
    Ledger.prototype.validateDecisionInput = function (input) {
        var errors = [];
        // Validate category
        if (!VALID_CATEGORIES.has(input.category)) {
            errors.push({
                field: 'category',
                value: input.category,
                message: "Invalid category '".concat(input.category, "'. Valid categories: ").concat(__spreadArray([], VALID_CATEGORIES, true).join(', ')),
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
                message: "Invalid source '".concat(input.source, "'. Valid sources: ").concat(__spreadArray([], VALID_SOURCES, true).join(', ')),
            });
        }
        // Validate confidence
        if (!VALID_CONFIDENCE_LEVELS.has(input.confidence)) {
            errors.push({
                field: 'confidence',
                value: input.confidence,
                message: "Invalid confidence '".concat(input.confidence, "'. Valid levels: ").concat(__spreadArray([], VALID_CONFIDENCE_LEVELS, true).join(', ')),
            });
        }
        // Validate phase
        if (!VALID_PHASES.has(input.phase)) {
            errors.push({
                field: 'phase',
                value: input.phase,
                message: "Invalid phase '".concat(input.phase, "'. Valid phases: ").concat(__spreadArray([], VALID_PHASES, true).join(', ')),
            });
        }
        // Validate dependencies if provided (must be non-empty strings)
        if (input.dependencies !== undefined) {
            for (var i = 0; i < input.dependencies.length; i++) {
                // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
                var dep = input.dependencies[i];
                if (typeof dep !== 'string' || dep.trim() === '') {
                    errors.push({
                        field: "dependencies[".concat(String(i), "]"),
                        value: dep,
                        message: 'Dependency must be a non-empty string',
                    });
                }
            }
        }
        // Validate supersedes if provided (must be non-empty strings)
        if (input.supersedes !== undefined) {
            for (var i = 0; i < input.supersedes.length; i++) {
                // eslint-disable-next-line security/detect-object-injection -- safe: i is bounded numeric loop counter
                var sup = input.supersedes[i];
                if (typeof sup !== 'string' || sup.trim() === '') {
                    errors.push({
                        field: "supersedes[".concat(String(i), "]"),
                        value: sup,
                        message: 'Supersedes entry must be a non-empty string',
                    });
                }
            }
        }
        return errors;
    };
    /**
     * Validates a complete decision.
     *
     * @param decision - The decision to validate.
     * @returns Array of validation errors.
     */
    Ledger.prototype.validateDecision = function (decision) {
        var errors = [];
        // Validate ID format
        if (!DECISION_ID_PATTERN.test(decision.id)) {
            errors.push({
                field: 'id',
                value: decision.id,
                message: "Invalid ID format '".concat(decision.id, "'. Must match pattern: category_NNN (e.g., 'architectural_001')"),
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
        var validStatuses = ['active', 'superseded', 'invalidated'];
        if (!validStatuses.includes(decision.status)) {
            errors.push({
                field: 'status',
                value: decision.status,
                message: "Invalid status '".concat(decision.status, "'. Valid statuses: ").concat(validStatuses.join(', ')),
            });
        }
        // Validate other fields using input validation
        // Build input object, omitting undefined fields for exactOptionalPropertyTypes
        var inputForValidation = {
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
        var inputErrors = this.validateDecisionInput(inputForValidation);
        errors.push.apply(errors, inputErrors);
        return errors;
    };
    /**
     * Checks for circular dependencies in the dependency graph.
     *
     * @param newId - The ID of the new decision being added.
     * @param dependencies - The dependencies of the new decision.
     * @throws CircularDependencyError if adding these dependencies would create a cycle.
     */
    Ledger.prototype.checkCircularDependency = function (newId, dependencies) {
        var _this = this;
        // Build a dependency graph including the new decision
        var visited = new Set();
        var recursionStack = new Set();
        var path = [];
        // DFS to detect cycles starting from each dependency
        var hasCycle = function (nodeId) {
            if (recursionStack.has(nodeId)) {
                // Found a cycle - build the cycle path
                var cycleStart = path.indexOf(nodeId);
                return __spreadArray(__spreadArray([], path.slice(cycleStart), true), [nodeId], false);
            }
            if (visited.has(nodeId)) {
                return null;
            }
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);
            var node = _this.decisions.find(function (d) { return d.id === nodeId; });
            if ((node === null || node === void 0 ? void 0 : node.dependencies) !== undefined) {
                for (var _i = 0, _a = node.dependencies; _i < _a.length; _i++) {
                    var depId = _a[_i];
                    var cycle = hasCycle(depId);
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
        for (var _i = 0, dependencies_1 = dependencies; _i < dependencies_1.length; _i++) {
            var depId = dependencies_1[_i];
            visited.clear();
            recursionStack.clear();
            path.length = 0;
            path.push(newId);
            recursionStack.add(newId);
            var cycle = hasCycle(depId);
            if (cycle !== null) {
                throw new CircularDependencyError(__spreadArray([newId], cycle, true));
            }
        }
    };
    /**
     * Gets all decisions that depend on the given decision ID.
     *
     * @param decisionId - The decision ID to find dependents for.
     * @returns Array of decisions that have this ID in their dependencies.
     */
    Ledger.prototype.getDependents = function (decisionId) {
        return this.decisions.filter(function (d) { var _a; return ((_a = d.dependencies) === null || _a === void 0 ? void 0 : _a.includes(decisionId)) === true; });
    };
    /**
     * Gets all decisions that the given decision depends on (direct dependencies).
     *
     * @param decisionId - The decision ID to find dependencies for.
     * @returns Array of decisions that this decision depends on.
     */
    Ledger.prototype.getDependencies = function (decisionId) {
        var _this = this;
        var decision = this.getById(decisionId);
        if ((decision === null || decision === void 0 ? void 0 : decision.dependencies) === undefined) {
            return [];
        }
        return decision.dependencies
            .map(function (depId) { return _this.getById(depId); })
            .filter(function (d) { return d !== undefined; });
    };
    /**
     * Gets all decisions that transitively depend on the given decision ID.
     * Uses breadth-first search to traverse the dependency tree.
     *
     * @param decisionId - The decision ID to find transitive dependents for.
     * @returns Array of objects containing the decision and its depth from the source.
     */
    Ledger.prototype.getTransitiveDependents = function (decisionId) {
        var result = [];
        var visited = new Set();
        var queue = [
            { id: decisionId, depth: 0, path: [decisionId] },
        ];
        while (queue.length > 0) {
            var current = queue.shift();
            if (current === undefined) {
                break;
            }
            var dependents = this.getDependents(current.id);
            for (var _i = 0, dependents_1 = dependents; _i < dependents_1.length; _i++) {
                var dep = dependents_1[_i];
                if (!visited.has(dep.id)) {
                    visited.add(dep.id);
                    var newPath = __spreadArray(__spreadArray([], current.path, true), [dep.id], false);
                    result.push({ decision: dep, depth: current.depth + 1, path: newPath });
                    queue.push({ id: dep.id, depth: current.depth + 1, path: newPath });
                }
            }
        }
        return result;
    };
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
    Ledger.prototype.invalidate = function (decisionId, options) {
        // Find the decision
        var decisionIndex = this.decisions.findIndex(function (d) { return d.id === decisionId; });
        if (decisionIndex === -1) {
            throw new DecisionNotFoundError(decisionId);
        }
        // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
        var decision = this.decisions[decisionIndex];
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
        if (decision.confidence === 'canonical' && (options === null || options === void 0 ? void 0 : options.forceInvalidateCanonical) !== true) {
            throw new CanonicalOverrideError(decisionId);
        }
        var timestamp = this.now().toISOString();
        var cascade = (options === null || options === void 0 ? void 0 : options.cascade) !== false; // Default to true
        var affectedDecisions = [];
        // Add the source decision to the affected list
        affectedDecisions.push({
            id: decision.id,
            constraint: decision.constraint,
            dependencyPath: [decision.id],
            depth: 0,
        });
        // Invalidate the source decision
        var updatedDecision = __assign(__assign({}, decision), { status: 'invalidated' });
        // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
        this.decisions[decisionIndex] = updatedDecision;
        // If cascade is enabled, invalidate all dependents
        if (cascade) {
            var transitiveDependents = this.getTransitiveDependents(decisionId);
            var _loop_1 = function (dependent, depth, path) {
                // Find the index of this dependent
                var depIndex = this_1.decisions.findIndex(function (d) { return d.id === dependent.id; });
                if (depIndex !== -1) {
                    // eslint-disable-next-line security/detect-object-injection -- safe: depIndex is numeric from .findIndex()
                    var depDecision = this_1.decisions[depIndex];
                    // Only invalidate if still active
                    if ((depDecision === null || depDecision === void 0 ? void 0 : depDecision.status) === 'active') {
                        var updatedDep = __assign(__assign({}, depDecision), { status: 'invalidated' });
                        // eslint-disable-next-line security/detect-object-injection -- safe: depIndex is numeric from .findIndex()
                        this_1.decisions[depIndex] = updatedDep;
                        affectedDecisions.push({
                            id: dependent.id,
                            constraint: dependent.constraint,
                            dependencyPath: path,
                            depth: depth,
                        });
                    }
                }
            };
            var this_1 = this;
            for (var _i = 0, transitiveDependents_1 = transitiveDependents; _i < transitiveDependents_1.length; _i++) {
                var _a = transitiveDependents_1[_i], dependent = _a.decision, depth = _a.depth, path = _a.path;
                _loop_1(dependent, depth, path);
            }
        }
        // Update last_modified
        this.meta.last_modified = timestamp;
        return {
            sourceDecisionId: decisionId,
            affectedDecisions: affectedDecisions,
            totalInvalidated: affectedDecisions.length,
            timestamp: timestamp,
        };
    };
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
    Ledger.prototype.downgradeDelegated = function (decisionId, contradictionReason) {
        // Find the decision
        var decisionIndex = this.decisions.findIndex(function (d) { return d.id === decisionId; });
        if (decisionIndex === -1) {
            throw new DecisionNotFoundError(decisionId);
        }
        // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
        var decision = this.decisions[decisionIndex];
        if (decision === undefined) {
            throw new DecisionNotFoundError(decisionId);
        }
        // Only downgrade delegated decisions
        if (decision.confidence !== 'delegated') {
            throw new InvalidSupersedeError(decisionId, "cannot downgrade decision with confidence '".concat(decision.confidence, "'; only 'delegated' decisions can be downgraded per ledger_007"));
        }
        // Check if already superseded or invalidated
        if (decision.status !== 'active') {
            throw new InvalidSupersedeError(decisionId, "cannot downgrade decision with status '".concat(decision.status, "'; only active decisions can be downgraded"));
        }
        // Create the downgraded decision with inferred confidence
        var updatedDecision = __assign(__assign({}, decision), { confidence: 'inferred', failure_context: decision.failure_context !== undefined
                ? "".concat(decision.failure_context, "; Composition Audit contradiction: ").concat(contradictionReason)
                : "Composition Audit contradiction: ".concat(contradictionReason) });
        // Replace in the array
        // eslint-disable-next-line security/detect-object-injection -- safe: decisionIndex is numeric from .findIndex()
        this.decisions[decisionIndex] = updatedDecision;
        // Update last_modified
        this.meta.last_modified = this.now().toISOString();
        return updatedDecision;
    };
    return Ledger;
}());
exports.Ledger = Ledger;
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
function fromData(data, options) {
    var nowFn = options === null || options === void 0 ? void 0 : options.now;
    var ledgerOptions = {
        project: data.meta.project,
        _meta: data.meta,
    };
    if (nowFn !== undefined) {
        ledgerOptions.now = nowFn;
    }
    var ledger = new Ledger(ledgerOptions);
    // Load all decisions
    for (var _i = 0, _a = data.decisions; _i < _a.length; _i++) {
        var decision = _a[_i];
        ledger.appendWithId(decision);
    }
    return ledger;
}
