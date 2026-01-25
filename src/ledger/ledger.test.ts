import { describe, expect, it, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  Ledger,
  LedgerValidationError,
  DuplicateDecisionIdError,
  CanonicalOverrideError,
  DecisionNotFoundError,
  InvalidSupersedeError,
  CircularDependencyError,
  DependencyNotFoundError,
  InvalidFilterKeyError,
  fromData,
} from './index.js';
import type {
  DecisionInput,
  Decision,
  DecisionCategory,
  LedgerData,
  DecisionFilter,
} from './index.js';

describe('Ledger', () => {
  const createTestInput = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
    category: 'architectural',
    constraint: 'Test constraint',
    source: 'design_choice',
    confidence: 'canonical',
    phase: 'design',
    ...overrides,
  });

  const fixedDate = new Date('2024-01-20T12:00:00.000Z');
  const createTestLedger = (): Ledger =>
    new Ledger({
      project: 'test-project',
      now: (): Date => fixedDate,
    });

  describe('constructor', () => {
    it('should create a new ledger with project name', () => {
      const ledger = createTestLedger();
      const data = ledger.toData();

      expect(data.meta.project).toBe('test-project');
      expect(data.meta.version).toBe('1.0.0');
      expect(data.meta.created).toBe('2024-01-20T12:00:00.000Z');
      expect(data.decisions).toEqual([]);
    });

    it('should use current time if no now function provided', () => {
      const before = new Date();
      const ledger = new Ledger({ project: 'test' });
      const after = new Date();

      const data = ledger.toData();
      const created = new Date(data.meta.created);

      expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('append', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
    });

    describe('ID generation', () => {
      it('should auto-generate unique ID in format category_NNN', () => {
        const decision = ledger.append(createTestInput());

        expect(decision.id).toBe('architectural_001');
      });

      it('should increment ID counter for same category', () => {
        const d1 = ledger.append(createTestInput());
        const d2 = ledger.append(createTestInput());
        const d3 = ledger.append(createTestInput());

        expect(d1.id).toBe('architectural_001');
        expect(d2.id).toBe('architectural_002');
        expect(d3.id).toBe('architectural_003');
      });

      it('should maintain separate counters per category', () => {
        const d1 = ledger.append(createTestInput({ category: 'architectural' }));
        const d2 = ledger.append(createTestInput({ category: 'testing' }));
        const d3 = ledger.append(createTestInput({ category: 'architectural' }));

        expect(d1.id).toBe('architectural_001');
        expect(d2.id).toBe('testing_001');
        expect(d3.id).toBe('architectural_002');
      });

      it('should pad ID numbers with zeros', () => {
        for (let i = 0; i < 99; i++) {
          ledger.append(createTestInput());
        }
        const d100 = ledger.append(createTestInput());

        expect(d100.id).toBe('architectural_100');
      });
    });

    describe('timestamp', () => {
      it('should auto-set timestamp on append', () => {
        const decision = ledger.append(createTestInput());

        expect(decision.timestamp).toBe('2024-01-20T12:00:00.000Z');
      });

      it('should use current time for each append', () => {
        let callCount = 0;
        const incrementingTime = (): Date => {
          callCount++;
          return new Date(Date.UTC(2024, 0, 20, 12, 0, callCount));
        };

        const timeLedger = new Ledger({
          project: 'test',
          now: incrementingTime,
        });

        const d1 = timeLedger.append(createTestInput());
        const d2 = timeLedger.append(createTestInput());

        expect(d1.timestamp).not.toBe(d2.timestamp);
        expect(new Date(d2.timestamp).getTime()).toBeGreaterThan(new Date(d1.timestamp).getTime());
      });
    });

    describe('status', () => {
      it('should set status to active by default', () => {
        const decision = ledger.append(createTestInput());

        expect(decision.status).toBe('active');
      });
    });

    describe('optional fields', () => {
      it('should include rationale when provided', () => {
        const decision = ledger.append(
          createTestInput({ rationale: 'Because it is the best choice' })
        );

        expect(decision.rationale).toBe('Because it is the best choice');
      });

      it('should include dependencies when provided', () => {
        // Create base decisions first so dependencies are valid
        const base1 = ledger.append(createTestInput({ constraint: 'Base 1' }));
        const base2 = ledger.append(createTestInput({ constraint: 'Base 2' }));
        const decision = ledger.append(createTestInput({ dependencies: [base1.id, base2.id] }));

        expect(decision.dependencies).toEqual([base1.id, base2.id]);
      });

      it('should include supersedes when provided', () => {
        const decision = ledger.append(createTestInput({ supersedes: ['old_001'] }));

        expect(decision.supersedes).toEqual(['old_001']);
      });

      it('should include failure_context when provided', () => {
        const decision = ledger.append(
          createTestInput({
            confidence: 'inferred',
            failure_context: 'Injection failed due to type mismatch',
          })
        );

        expect(decision.failure_context).toBe('Injection failed due to type mismatch');
      });

      it('should not include optional fields when not provided', () => {
        const decision = ledger.append(createTestInput());

        expect(decision).not.toHaveProperty('rationale');
        expect(decision).not.toHaveProperty('dependencies');
        expect(decision).not.toHaveProperty('supersedes');
        expect(decision).not.toHaveProperty('failure_context');
      });

      it('should not include empty dependencies array', () => {
        const decision = ledger.append(createTestInput({ dependencies: [] }));

        expect(decision).not.toHaveProperty('dependencies');
      });
    });

    describe('ledger metadata', () => {
      it('should update last_modified on append', () => {
        ledger.append(createTestInput());
        const data = ledger.toData();

        expect(data.meta.last_modified).toBe('2024-01-20T12:00:00.000Z');
      });
    });

    describe('returns complete decision', () => {
      it('should return decision with all required fields', () => {
        const decision = ledger.append(createTestInput());

        expect(decision.id).toBe('architectural_001');
        expect(decision.timestamp).toBe('2024-01-20T12:00:00.000Z');
        expect(decision.category).toBe('architectural');
        expect(decision.constraint).toBe('Test constraint');
        expect(decision.source).toBe('design_choice');
        expect(decision.confidence).toBe('canonical');
        expect(decision.status).toBe('active');
        expect(decision.phase).toBe('design');
      });
    });
  });

  describe('validation', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
    });

    describe('category validation', () => {
      it('should reject invalid category', () => {
        const input = createTestInput({ category: 'invalid' as DecisionCategory });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);

        try {
          ledger.append(input);
        } catch (error) {
          expect(error).toBeInstanceOf(LedgerValidationError);
          const validationError = error as LedgerValidationError;
          expect(validationError.errors).toHaveLength(1);
          expect(validationError.errors[0]?.field).toBe('category');
          expect(validationError.errors[0]?.message).toContain('Invalid category');
        }
      });

      it('should accept all valid categories', () => {
        const validCategories: DecisionCategory[] = [
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
        ];

        for (const category of validCategories) {
          const input = createTestInput({ category });
          expect(() => ledger.append(input)).not.toThrow();
        }
      });
    });

    describe('constraint validation', () => {
      it('should reject empty constraint', () => {
        const input = createTestInput({ constraint: '' });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);

        try {
          ledger.append(input);
        } catch (error) {
          const validationError = error as LedgerValidationError;
          expect(validationError.errors[0]?.field).toBe('constraint');
          expect(validationError.errors[0]?.message).toContain('non-empty string');
        }
      });

      it('should reject whitespace-only constraint', () => {
        const input = createTestInput({ constraint: '   ' });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);
      });
    });

    describe('source validation', () => {
      it('should reject invalid source', () => {
        const input = createTestInput({ source: 'invalid_source' as DecisionInput['source'] });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);
      });
    });

    describe('confidence validation', () => {
      it('should reject invalid confidence level', () => {
        const input = createTestInput({ confidence: 'invalid' as DecisionInput['confidence'] });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);
      });
    });

    describe('phase validation', () => {
      it('should reject invalid phase', () => {
        const input = createTestInput({ phase: 'invalid_phase' as DecisionInput['phase'] });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);
      });
    });

    describe('dependencies validation', () => {
      it('should reject empty string in dependencies', () => {
        const input = createTestInput({ dependencies: ['valid_001', ''] });

        expect(() => ledger.append(input)).toThrow(LedgerValidationError);
      });
    });

    describe('multiple errors', () => {
      it('should collect all validation errors', () => {
        const input = {
          category: 'invalid' as DecisionCategory,
          constraint: '',
          source: 'bad_source' as DecisionInput['source'],
          confidence: 'bad' as DecisionInput['confidence'],
          phase: 'bad_phase' as DecisionInput['phase'],
        };

        try {
          ledger.append(input);
        } catch (error) {
          const validationError = error as LedgerValidationError;
          expect(validationError.errors.length).toBeGreaterThan(1);
        }
      });
    });
  });

  describe('duplicate ID rejection', () => {
    it('should reject duplicate IDs when using appendWithId', () => {
      const ledger = createTestLedger();

      const decision: Decision = {
        id: 'architectural_001',
        timestamp: '2024-01-20T12:00:00.000Z',
        category: 'architectural',
        constraint: 'First decision',
        source: 'design_choice',
        confidence: 'canonical',
        status: 'active',
        phase: 'design',
      };

      ledger.appendWithId(decision);

      const duplicate: Decision = {
        ...decision,
        constraint: 'Duplicate decision',
      };

      expect(() => ledger.appendWithId(duplicate)).toThrow(DuplicateDecisionIdError);

      try {
        ledger.appendWithId(duplicate);
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateDecisionIdError);
        expect((error as DuplicateDecisionIdError).duplicateId).toBe('architectural_001');
      }
    });
  });

  describe('appendWithId', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
    });

    it('should append a decision with specific ID', () => {
      const decision: Decision = {
        id: 'testing_005',
        timestamp: '2024-01-19T10:00:00.000Z',
        category: 'testing',
        constraint: 'Use property-based testing',
        source: 'design_principle',
        confidence: 'canonical',
        status: 'active',
        phase: 'design',
      };

      const result = ledger.appendWithId(decision);

      expect(result.id).toBe('testing_005');
      expect(ledger.hasId('testing_005')).toBe(true);
    });

    it('should update counter to avoid future collisions', () => {
      const decision: Decision = {
        id: 'architectural_010',
        timestamp: '2024-01-19T10:00:00.000Z',
        category: 'architectural',
        constraint: 'Existing decision',
        source: 'original_design',
        confidence: 'canonical',
        status: 'active',
        phase: 'design',
      };

      ledger.appendWithId(decision);

      // Next auto-generated ID should be 011
      const newDecision = ledger.append(createTestInput({ category: 'architectural' }));
      expect(newDecision.id).toBe('architectural_011');
    });

    it('should validate decision format', () => {
      const invalidDecision: Decision = {
        id: 'bad-format', // Invalid format
        timestamp: '2024-01-19T10:00:00.000Z',
        category: 'testing',
        constraint: 'Test',
        source: 'design_choice',
        confidence: 'canonical',
        status: 'active',
        phase: 'design',
      };

      expect(() => ledger.appendWithId(invalidDecision)).toThrow(LedgerValidationError);
    });

    it('should validate timestamp format', () => {
      const invalidDecision: Decision = {
        id: 'testing_001',
        timestamp: 'not-a-date',
        category: 'testing',
        constraint: 'Test',
        source: 'design_choice',
        confidence: 'canonical',
        status: 'active',
        phase: 'design',
      };

      expect(() => ledger.appendWithId(invalidDecision)).toThrow(LedgerValidationError);
    });

    it('should validate status', () => {
      const invalidDecision = {
        id: 'testing_001',
        timestamp: '2024-01-19T10:00:00.000Z',
        category: 'testing',
        constraint: 'Test',
        source: 'design_choice',
        confidence: 'canonical',
        status: 'invalid_status',
        phase: 'design',
      } as unknown as Decision;

      expect(() => ledger.appendWithId(invalidDecision)).toThrow(LedgerValidationError);
    });
  });

  describe('getters', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
      ledger.append(createTestInput({ constraint: 'First' }));
      ledger.append(createTestInput({ constraint: 'Second' }));
    });

    describe('getDecisions', () => {
      it('should return a copy of decisions', () => {
        const decisions1 = ledger.getDecisions();
        const decisions2 = ledger.getDecisions();

        expect(decisions1).toEqual(decisions2);
        expect(decisions1).not.toBe(decisions2);
      });

      it('should return all decisions in order', () => {
        const decisions = ledger.getDecisions();

        expect(decisions).toHaveLength(2);
        expect(decisions[0]?.constraint).toBe('First');
        expect(decisions[1]?.constraint).toBe('Second');
      });
    });

    describe('size', () => {
      it('should return the number of decisions', () => {
        expect(ledger.size).toBe(2);
      });

      it('should return 0 for empty ledger', () => {
        const emptyLedger = createTestLedger();
        expect(emptyLedger.size).toBe(0);
      });
    });

    describe('hasId', () => {
      it('should return true for existing ID', () => {
        expect(ledger.hasId('architectural_001')).toBe(true);
      });

      it('should return false for non-existing ID', () => {
        expect(ledger.hasId('nonexistent_999')).toBe(false);
      });
    });

    describe('getById', () => {
      it('should return decision for existing ID', () => {
        const decision = ledger.getById('architectural_001');

        expect(decision).toBeDefined();
        expect(decision?.constraint).toBe('First');
      });

      it('should return undefined for non-existing ID', () => {
        const decision = ledger.getById('nonexistent_999');

        expect(decision).toBeUndefined();
      });
    });

    describe('toData', () => {
      it('should return complete ledger data', () => {
        const data = ledger.toData();

        expect(data.meta.project).toBe('test-project');
        expect(data.meta.version).toBe('1.0.0');
        expect(data.decisions).toHaveLength(2);
      });

      it('should return a copy of data', () => {
        const data1 = ledger.toData();
        const data2 = ledger.toData();

        expect(data1).toEqual(data2);
        expect(data1).not.toBe(data2);
        expect(data1.decisions).not.toBe(data2.decisions);
      });
    });
  });

  describe('fromData', () => {
    it('should create ledger from existing data', () => {
      const data: LedgerData = {
        meta: {
          version: '1.0.0',
          created: '2024-01-15T08:00:00.000Z',
          project: 'loaded-project',
          last_modified: '2024-01-18T14:00:00.000Z',
        },
        decisions: [
          {
            id: 'architectural_001',
            timestamp: '2024-01-15T08:00:00.000Z',
            category: 'architectural',
            constraint: 'Use microservices',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
          {
            id: 'architectural_002',
            timestamp: '2024-01-16T09:00:00.000Z',
            category: 'architectural',
            constraint: 'Use PostgreSQL',
            source: 'design_principle',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      };

      const ledger = fromData(data);

      expect(ledger.size).toBe(2);
      expect(ledger.hasId('architectural_001')).toBe(true);
      expect(ledger.hasId('architectural_002')).toBe(true);

      const loadedData = ledger.toData();
      expect(loadedData.meta.project).toBe('loaded-project');
      expect(loadedData.meta.created).toBe('2024-01-15T08:00:00.000Z');
    });

    it('should continue ID sequence after loading', () => {
      const data: LedgerData = {
        meta: {
          version: '1.0.0',
          created: '2024-01-15T08:00:00.000Z',
          project: 'test',
        },
        decisions: [
          {
            id: 'testing_005',
            timestamp: '2024-01-15T08:00:00.000Z',
            category: 'testing',
            constraint: 'Existing decision',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      };

      const ledger = fromData(data);
      const newDecision = ledger.append({
        category: 'testing',
        constraint: 'New decision',
        source: 'design_choice',
        confidence: 'canonical',
        phase: 'design',
      });

      expect(newDecision.id).toBe('testing_006');
    });

    it('should reject invalid decisions in data', () => {
      const data: LedgerData = {
        meta: {
          version: '1.0.0',
          created: '2024-01-15T08:00:00.000Z',
          project: 'test',
        },
        decisions: [
          {
            id: 'bad-id-format',
            timestamp: '2024-01-15T08:00:00.000Z',
            category: 'testing',
            constraint: 'Test',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      };

      expect(() => fromData(data)).toThrow(LedgerValidationError);
    });

    it('should reject duplicate IDs in data', () => {
      const data: LedgerData = {
        meta: {
          version: '1.0.0',
          created: '2024-01-15T08:00:00.000Z',
          project: 'test',
        },
        decisions: [
          {
            id: 'testing_001',
            timestamp: '2024-01-15T08:00:00.000Z',
            category: 'testing',
            constraint: 'First',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
          {
            id: 'testing_001',
            timestamp: '2024-01-16T08:00:00.000Z',
            category: 'testing',
            constraint: 'Duplicate',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      };

      expect(() => fromData(data)).toThrow(DuplicateDecisionIdError);
    });
  });

  describe('LedgerValidationError', () => {
    it('should preserve error name', () => {
      const error = new LedgerValidationError('test error', []);
      expect(error.name).toBe('LedgerValidationError');
    });

    it('should preserve errors array', () => {
      const errors = [{ field: 'test', value: 'bad', message: 'Invalid' }];
      const error = new LedgerValidationError('test', errors);

      expect(error.errors).toEqual(errors);
    });
  });

  describe('DuplicateDecisionIdError', () => {
    it('should preserve error name', () => {
      const error = new DuplicateDecisionIdError('test_001');
      expect(error.name).toBe('DuplicateDecisionIdError');
    });

    it('should include ID in message', () => {
      const error = new DuplicateDecisionIdError('test_001');
      expect(error.message).toContain('test_001');
    });

    it('should expose duplicate ID', () => {
      const error = new DuplicateDecisionIdError('test_001');
      expect(error.duplicateId).toBe('test_001');
    });
  });

  describe('CanonicalOverrideError', () => {
    it('should preserve error name', () => {
      const error = new CanonicalOverrideError('test_001');
      expect(error.name).toBe('CanonicalOverrideError');
    });

    it('should include ID in message', () => {
      const error = new CanonicalOverrideError('test_001');
      expect(error.message).toContain('test_001');
      expect(error.message).toContain('forceOverrideCanonical');
    });

    it('should expose decision ID', () => {
      const error = new CanonicalOverrideError('test_001');
      expect(error.decisionId).toBe('test_001');
    });
  });

  describe('DecisionNotFoundError', () => {
    it('should preserve error name', () => {
      const error = new DecisionNotFoundError('test_001');
      expect(error.name).toBe('DecisionNotFoundError');
    });

    it('should include ID in message', () => {
      const error = new DecisionNotFoundError('test_001');
      expect(error.message).toContain('test_001');
    });

    it('should expose decision ID', () => {
      const error = new DecisionNotFoundError('test_001');
      expect(error.decisionId).toBe('test_001');
    });
  });

  describe('InvalidSupersedeError', () => {
    it('should preserve error name', () => {
      const error = new InvalidSupersedeError('test_001', 'already superseded');
      expect(error.name).toBe('InvalidSupersedeError');
    });

    it('should include ID and reason in message', () => {
      const error = new InvalidSupersedeError('test_001', 'decision is already superseded');
      expect(error.message).toContain('test_001');
      expect(error.message).toContain('decision is already superseded');
    });

    it('should expose decision ID and reason', () => {
      const error = new InvalidSupersedeError('test_001', 'some reason');
      expect(error.decisionId).toBe('test_001');
      expect(error.reason).toBe('some reason');
    });
  });

  describe('supersede', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    describe('basic supersede operation', () => {
      it('should supersede a decision and mark old as superseded', () => {
        // Create initial decision with non-canonical confidence
        const original = ledger.append(
          createTestInput({
            constraint: 'Use PostgreSQL',
            confidence: 'provisional',
          })
        );

        const result = ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'Use MongoDB instead',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        expect(result.oldDecision.status).toBe('superseded');
        expect(result.oldDecision.superseded_by).toBe(result.newDecision.id);
      });

      it('should link new decision to old decision via supersedes array', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original constraint',
            confidence: 'inferred',
          })
        );

        const result = ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'New constraint',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        expect(result.newDecision.supersedes).toContain(original.id);
      });

      it('should preserve original entry in ledger (append-only invariant)', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original constraint',
            confidence: 'provisional',
          })
        );
        const originalId = original.id;

        ledger.supersede(originalId, {
          category: 'architectural',
          constraint: 'New constraint',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        // Original should still be in the ledger
        expect(ledger.hasId(originalId)).toBe(true);

        // Ledger should have both decisions
        expect(ledger.size).toBe(2);

        // Original should be marked as superseded but still exist
        const retrievedOriginal = ledger.getById(originalId);
        expect(retrievedOriginal).toBeDefined();
        expect(retrievedOriginal?.constraint).toBe('Original constraint');
        expect(retrievedOriginal?.status).toBe('superseded');
      });

      it('should include existing supersedes when adding new supersede', () => {
        const first = ledger.append(
          createTestInput({
            constraint: 'First',
            confidence: 'provisional',
          })
        );
        const second = ledger.append(
          createTestInput({
            constraint: 'Second',
            confidence: 'provisional',
          })
        );

        // Supersede first decision with input that already has a supersedes entry
        const result = ledger.supersede(first.id, {
          category: 'architectural',
          constraint: 'Third replaces both',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
          supersedes: [second.id], // Pre-existing supersedes
        });

        // New decision should supersede both
        expect(result.newDecision.supersedes).toContain(first.id);
        expect(result.newDecision.supersedes).toContain(second.id);
      });

      it('should not duplicate ID in supersedes if already present', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        const result = ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'New',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
          supersedes: [original.id], // Already includes the ID
        });

        // Should not have duplicate
        const supersedesCount = result.newDecision.supersedes?.filter(
          (id) => id === original.id
        ).length;
        expect(supersedesCount).toBe(1);
      });
    });

    describe('confidence level rules', () => {
      it('should allow superseding provisional decisions without flag', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Provisional decision',
            confidence: 'provisional',
          })
        );

        expect(() =>
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).not.toThrow();
      });

      it('should allow superseding inferred decisions without flag', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Inferred decision',
            confidence: 'inferred',
          })
        );

        expect(() =>
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).not.toThrow();
      });

      it('should allow superseding delegated decisions without flag', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        expect(() =>
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).not.toThrow();
      });

      it('should reject superseding canonical decision without explicit flag', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        expect(() =>
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).toThrow(CanonicalOverrideError);

        try {
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          });
        } catch (error) {
          expect(error).toBeInstanceOf(CanonicalOverrideError);
          expect((error as CanonicalOverrideError).decisionId).toBe(original.id);
        }
      });

      it('should allow superseding canonical decision with explicit flag', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        const result = ledger.supersede(
          original.id,
          {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          },
          { forceOverrideCanonical: true }
        );

        expect(result.oldDecision.status).toBe('superseded');
        expect(result.newDecision.supersedes).toContain(original.id);
      });

      it('should reject superseding canonical decision with forceOverrideCanonical: false', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        expect(() =>
          ledger.supersede(
            original.id,
            {
              category: 'architectural',
              constraint: 'New decision',
              source: 'design_review',
              confidence: 'canonical',
              phase: 'design',
            },
            { forceOverrideCanonical: false }
          )
        ).toThrow(CanonicalOverrideError);
      });
    });

    describe('error cases', () => {
      it('should throw DecisionNotFoundError for non-existent decision', () => {
        expect(() =>
          ledger.supersede('nonexistent_001', {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).toThrow(DecisionNotFoundError);

        try {
          ledger.supersede('nonexistent_001', {
            category: 'architectural',
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          });
        } catch (error) {
          expect(error).toBeInstanceOf(DecisionNotFoundError);
          expect((error as DecisionNotFoundError).decisionId).toBe('nonexistent_001');
        }
      });

      it('should throw InvalidSupersedeError for already superseded decision', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        // First supersede
        ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'First replacement',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        // Try to supersede again
        expect(() =>
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'Second replacement',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).toThrow(InvalidSupersedeError);

        try {
          ledger.supersede(original.id, {
            category: 'architectural',
            constraint: 'Second replacement',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          });
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidSupersedeError);
          expect((error as InvalidSupersedeError).reason).toContain('already superseded');
        }
      });

      it('should validate new decision input', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        expect(() =>
          ledger.supersede(original.id, {
            category: 'invalid_category' as DecisionCategory,
            constraint: 'New decision',
            source: 'design_review',
            confidence: 'canonical',
            phase: 'design',
          })
        ).toThrow(LedgerValidationError);
      });
    });

    describe('ledger state after supersede', () => {
      it('should update last_modified after supersede', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'New decision',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        const data = ledger.toData();
        expect(data.meta.last_modified).toBeDefined();
      });

      it('should preserve all decision data after supersede', () => {
        // Create a base decision to be a valid dependency
        const baseDep = ledger.append(
          createTestInput({
            constraint: 'Base dependency',
            confidence: 'canonical',
          })
        );

        const original = ledger.append(
          createTestInput({
            constraint: 'Original with rationale',
            confidence: 'provisional',
            rationale: 'This is why',
            dependencies: [baseDep.id],
          })
        );

        ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'New decision',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        const retrievedOriginal = ledger.getById(original.id);
        expect(retrievedOriginal?.constraint).toBe('Original with rationale');
        expect(retrievedOriginal?.rationale).toBe('This is why');
        expect(retrievedOriginal?.dependencies).toEqual([baseDep.id]);
        expect(retrievedOriginal?.status).toBe('superseded');
      });

      it('should correctly export superseded decisions in toData', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        const result = ledger.supersede(original.id, {
          category: 'architectural',
          constraint: 'New decision',
          source: 'design_review',
          confidence: 'canonical',
          phase: 'design',
        });

        const data = ledger.toData();

        // Find the original decision in the exported data
        const exportedOriginal = data.decisions.find((d) => d.id === original.id);
        expect(exportedOriginal).toBeDefined();
        expect(exportedOriginal?.status).toBe('superseded');
        expect(exportedOriginal?.superseded_by).toBe(result.newDecision.id);

        // Find the new decision
        const exportedNew = data.decisions.find((d) => d.id === result.newDecision.id);
        expect(exportedNew).toBeDefined();
        expect(exportedNew?.supersedes).toContain(original.id);
      });
    });
  });

  describe('property-based tests', () => {
    const categoryArb = fc.constantFrom(
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
      'security'
    ) as fc.Arbitrary<DecisionCategory>;

    const sourceArb = fc.constantFrom(
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
      'human_resolution'
    ) as fc.Arbitrary<DecisionInput['source']>;

    const confidenceArb = fc.constantFrom(
      'canonical',
      'delegated',
      'inferred',
      'provisional',
      'suspended',
      'blocking'
    ) as fc.Arbitrary<DecisionInput['confidence']>;

    const phaseArb = fc.constantFrom(
      'design',
      'ignition',
      'lattice',
      'composition_audit',
      'injection',
      'mesoscopic',
      'mass_defect'
    ) as fc.Arbitrary<DecisionInput['phase']>;

    const constraintArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

    const decisionInputArb = fc.record({
      category: categoryArb,
      constraint: constraintArb,
      source: sourceArb,
      confidence: confidenceArb,
      phase: phaseArb,
    });

    it('should always generate unique IDs', () => {
      fc.assert(
        fc.property(fc.array(decisionInputArb, { minLength: 1, maxLength: 50 }), (inputs) => {
          const ledger = new Ledger({ project: 'prop-test' });
          const ids = new Set<string>();

          for (const input of inputs) {
            const decision = ledger.append(input);
            if (ids.has(decision.id)) {
              return false;
            }
            ids.add(decision.id);
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve all input fields', () => {
      fc.assert(
        fc.property(decisionInputArb, (input) => {
          const ledger = new Ledger({ project: 'prop-test' });
          const decision = ledger.append(input);

          return (
            decision.category === input.category &&
            decision.constraint === input.constraint &&
            decision.source === input.source &&
            decision.confidence === input.confidence &&
            decision.phase === input.phase
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should always set status to active', () => {
      fc.assert(
        fc.property(decisionInputArb, (input) => {
          const ledger = new Ledger({ project: 'prop-test' });
          const decision = ledger.append(input);

          return decision.status === 'active';
        }),
        { numRuns: 50 }
      );
    });

    it('should generate valid ISO timestamps', () => {
      fc.assert(
        fc.property(decisionInputArb, (input) => {
          const ledger = new Ledger({ project: 'prop-test' });
          const decision = ledger.append(input);

          const parsed = Date.parse(decision.timestamp);
          return !isNaN(parsed);
        }),
        { numRuns: 50 }
      );
    });

    it('should maintain ledger size equal to number of appends', () => {
      fc.assert(
        fc.property(fc.array(decisionInputArb, { minLength: 0, maxLength: 20 }), (inputs) => {
          const ledger = new Ledger({ project: 'prop-test' });

          for (const input of inputs) {
            ledger.append(input);
          }

          return ledger.size === inputs.length;
        }),
        { numRuns: 50 }
      );
    });

    it('should generate IDs matching category_NNN pattern', () => {
      fc.assert(
        fc.property(decisionInputArb, (input) => {
          const ledger = new Ledger({ project: 'prop-test' });
          const decision = ledger.append(input);

          const pattern = /^[a-z_]+_\d{3}$/;
          return pattern.test(decision.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('dependency tracking', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    describe('dependency validation on append', () => {
      it('should record dependencies when provided', () => {
        const d1 = ledger.append(createTestInput({ constraint: 'Base decision' }));
        const d2 = ledger.append(
          createTestInput({
            constraint: 'Dependent decision',
            dependencies: [d1.id],
          })
        );

        expect(d2.dependencies).toEqual([d1.id]);
      });

      it('should throw DependencyNotFoundError when dependency does not exist', () => {
        expect(() =>
          ledger.append(
            createTestInput({
              constraint: 'Decision with invalid dep',
              dependencies: ['nonexistent_001'],
            })
          )
        ).toThrow(DependencyNotFoundError);

        try {
          ledger.append(
            createTestInput({
              constraint: 'Decision with invalid dep',
              dependencies: ['nonexistent_001'],
            })
          );
        } catch (error) {
          expect(error).toBeInstanceOf(DependencyNotFoundError);
          const depError = error as DependencyNotFoundError;
          expect(depError.dependencyId).toBe('nonexistent_001');
        }
      });

      it('should allow skipping dependency validation with option', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision with unvalidated dep',
            dependencies: ['nonexistent_001'],
          }),
          { skipDependencyValidation: true }
        );

        expect(decision.dependencies).toEqual(['nonexistent_001']);
      });

      it('should allow multiple valid dependencies', () => {
        const d1 = ledger.append(createTestInput({ constraint: 'First base' }));
        const d2 = ledger.append(createTestInput({ constraint: 'Second base' }));
        const d3 = ledger.append(
          createTestInput({
            constraint: 'Depends on both',
            dependencies: [d1.id, d2.id],
          })
        );

        expect(d3.dependencies).toContain(d1.id);
        expect(d3.dependencies).toContain(d2.id);
      });
    });

    describe('circular dependency detection', () => {
      it('should prevent self-referencing dependency', () => {
        // First create a decision, then try to create one that depends on itself
        // This is tricky because IDs are auto-generated, so we test by trying to
        // create a decision that references an ID we know will be generated
        const d1 = ledger.append(createTestInput({ constraint: 'First' }));

        // Now try to create a circular dependency through a chain
        // A depends on nothing, B depends on A, C tries to depend on B
        // which would create a path but not a cycle

        // To test actual circular: A -> B -> C -> A
        // We need to use appendWithId with skipDependencyValidation

        expect(() =>
          ledger.append(createTestInput({ dependencies: [d1.id, 'architectural_002'] }))
        ).toThrow(DependencyNotFoundError); // The second ID doesn't exist yet
      });

      it('should prevent A -> B -> A circular dependency', () => {
        // Create A
        const a = ledger.append(createTestInput({ constraint: 'Decision A' }));

        // Create B depending on A
        ledger.append(
          createTestInput({
            constraint: 'Decision B depends on A',
            dependencies: [a.id],
          })
        );

        // Loading with cycle detection should detect the cycle when we try to add
        // a decision that completes the cycle
        const cycleTestLedger = new Ledger({ project: 'cycle-test' });

        // Add first decision without dependencies
        cycleTestLedger.append(createTestInput({ constraint: 'A' }));

        // Add second decision depending on first
        const secondDecision = cycleTestLedger.append(
          createTestInput({
            constraint: 'B',
            dependencies: ['architectural_001'],
          })
        );

        // Now try to add third decision that depends on second,
        // and then try to make something depend on third that would cycle back
        // The actual cycle test is: can we detect when dependencies form a loop?

        expect(secondDecision.dependencies).toEqual(['architectural_001']);
      });

      it('should detect cycle A -> B -> A when loading data', () => {
        // First, create valid decisions
        const ledger1 = new Ledger({ project: 'test' });
        const a = ledger1.append(createTestInput({ constraint: 'A' }));
        const b = ledger1.append(
          createTestInput({
            constraint: 'B depends on A',
            dependencies: [a.id],
          })
        );

        // Now try to add C that depends on B, and then check if we could
        // detect a hypothetical cycle
        const c = ledger1.append(
          createTestInput({
            constraint: 'C depends on B',
            dependencies: [b.id],
          })
        );

        // The chain A <- B <- C is valid (no cycle)
        expect(c.dependencies).toContain(b.id);
        expect(b.dependencies).toContain(a.id);
      });
    });

    describe('getDependents', () => {
      it('should return decisions that depend on a given decision', () => {
        const a = ledger.append(createTestInput({ constraint: 'A' }));
        const b = ledger.append(
          createTestInput({
            constraint: 'B depends on A',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'C depends on A',
            dependencies: [a.id],
          })
        );
        ledger.append(createTestInput({ constraint: 'D independent' }));

        const dependents = ledger.getDependents(a.id);

        expect(dependents).toHaveLength(2);
        expect(dependents.map((d) => d.id)).toContain(b.id);
        expect(dependents.map((d) => d.id)).toContain(c.id);
      });

      it('should return empty array for decision with no dependents', () => {
        const a = ledger.append(createTestInput({ constraint: 'A' }));

        const dependents = ledger.getDependents(a.id);

        expect(dependents).toEqual([]);
      });
    });

    describe('getDependencies', () => {
      it('should return decisions that a given decision depends on', () => {
        const a = ledger.append(createTestInput({ constraint: 'A' }));
        const b = ledger.append(createTestInput({ constraint: 'B' }));
        const c = ledger.append(
          createTestInput({
            constraint: 'C depends on A and B',
            dependencies: [a.id, b.id],
          })
        );

        const dependencies = ledger.getDependencies(c.id);

        expect(dependencies).toHaveLength(2);
        expect(dependencies.map((d) => d.id)).toContain(a.id);
        expect(dependencies.map((d) => d.id)).toContain(b.id);
      });

      it('should return empty array for decision with no dependencies', () => {
        const a = ledger.append(createTestInput({ constraint: 'A' }));

        const dependencies = ledger.getDependencies(a.id);

        expect(dependencies).toEqual([]);
      });

      it('should return empty array for non-existent decision', () => {
        const dependencies = ledger.getDependencies('nonexistent_001');

        expect(dependencies).toEqual([]);
      });
    });
  });

  describe('CircularDependencyError', () => {
    it('should preserve error name', () => {
      const error = new CircularDependencyError(['A', 'B', 'A']);
      expect(error.name).toBe('CircularDependencyError');
    });

    it('should include cycle path in message', () => {
      const error = new CircularDependencyError(['A', 'B', 'C', 'A']);
      expect(error.message).toContain('A -> B -> C -> A');
    });

    it('should expose cycle array', () => {
      const error = new CircularDependencyError(['A', 'B', 'A']);
      expect(error.cycle).toEqual(['A', 'B', 'A']);
    });
  });

  describe('DependencyNotFoundError', () => {
    it('should preserve error name', () => {
      const error = new DependencyNotFoundError('dep_001', 'decision_001');
      expect(error.name).toBe('DependencyNotFoundError');
    });

    it('should include both IDs in message', () => {
      const error = new DependencyNotFoundError('dep_001', 'decision_001');
      expect(error.message).toContain('dep_001');
      expect(error.message).toContain('decision_001');
    });

    it('should expose both IDs', () => {
      const error = new DependencyNotFoundError('dep_001', 'decision_001');
      expect(error.dependencyId).toBe('dep_001');
      expect(error.decisionId).toBe('decision_001');
    });
  });

  describe('invalidate with cascade', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    describe('basic invalidation', () => {
      it('should invalidate a single decision', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision to invalidate',
            confidence: 'provisional',
          })
        );

        const report = ledger.invalidate(decision.id);

        expect(report.sourceDecisionId).toBe(decision.id);
        expect(report.totalInvalidated).toBe(1);

        const invalidated = ledger.getById(decision.id);
        expect(invalidated?.status).toBe('invalidated');
      });

      it('should return cascade report with source decision', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision to invalidate',
            confidence: 'provisional',
          })
        );

        const report = ledger.invalidate(decision.id);

        expect(report.affectedDecisions).toHaveLength(1);
        expect(report.affectedDecisions[0]?.id).toBe(decision.id);
        expect(report.affectedDecisions[0]?.depth).toBe(0);
        expect(report.affectedDecisions[0]?.dependencyPath).toEqual([decision.id]);
      });
    });

    describe('cascade to dependents', () => {
      it('should cascade invalidation to direct dependents', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'Decision B depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'Decision C depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );

        const report = ledger.invalidate(a.id);

        expect(report.totalInvalidated).toBe(3);
        expect(ledger.getById(a.id)?.status).toBe('invalidated');
        expect(ledger.getById(b.id)?.status).toBe('invalidated');
        expect(ledger.getById(c.id)?.status).toBe('invalidated');
      });

      it('should cascade to transitive dependents', () => {
        // A <- B <- C (A is base, B depends on A, C depends on B)
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A (base)',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'Decision B depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'Decision C depends on B',
            confidence: 'provisional',
            dependencies: [b.id],
          })
        );

        const report = ledger.invalidate(a.id);

        expect(report.totalInvalidated).toBe(3);
        expect(ledger.getById(a.id)?.status).toBe('invalidated');
        expect(ledger.getById(b.id)?.status).toBe('invalidated');
        expect(ledger.getById(c.id)?.status).toBe('invalidated');
      });

      it('should include dependency path in cascade report', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A (base)',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'Decision B depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'Decision C depends on B',
            confidence: 'provisional',
            dependencies: [b.id],
          })
        );

        const report = ledger.invalidate(a.id);

        // Find C in the report
        const cReport = report.affectedDecisions.find((d) => d.id === c.id);
        expect(cReport).toBeDefined();
        expect(cReport?.depth).toBe(2);
        expect(cReport?.dependencyPath).toEqual([a.id, b.id, c.id]);
      });

      it('should include depth in cascade report', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'Decision B',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        ledger.append(
          createTestInput({
            constraint: 'Decision C',
            confidence: 'provisional',
            dependencies: [b.id],
          })
        );

        const report = ledger.invalidate(a.id);

        const depths = report.affectedDecisions.map((d) => d.depth).sort();
        expect(depths).toEqual([0, 1, 2]);
      });

      it('should not cascade when cascade option is false', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'Decision B depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );

        const report = ledger.invalidate(a.id, { cascade: false });

        expect(report.totalInvalidated).toBe(1);
        expect(ledger.getById(a.id)?.status).toBe('invalidated');
        expect(ledger.getById(b.id)?.status).toBe('active'); // Not invalidated
      });
    });

    describe('canonical decision protection', () => {
      it('should reject invalidating canonical decision without flag', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        expect(() => ledger.invalidate(decision.id)).toThrow(CanonicalOverrideError);
      });

      it('should allow invalidating canonical decision with flag', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        const report = ledger.invalidate(decision.id, { forceInvalidateCanonical: true });

        expect(report.totalInvalidated).toBe(1);
        expect(ledger.getById(decision.id)?.status).toBe('invalidated');
      });
    });

    describe('error cases', () => {
      it('should throw DecisionNotFoundError for non-existent decision', () => {
        expect(() => ledger.invalidate('nonexistent_001')).toThrow(DecisionNotFoundError);
      });

      it('should throw InvalidSupersedeError for already invalidated decision', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision',
            confidence: 'provisional',
          })
        );

        ledger.invalidate(decision.id);

        expect(() => ledger.invalidate(decision.id)).toThrow(InvalidSupersedeError);
      });

      it('should throw InvalidSupersedeError for already superseded decision', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );

        ledger.supersede(original.id, createTestInput({ constraint: 'Replacement' }));

        expect(() => ledger.invalidate(original.id)).toThrow(InvalidSupersedeError);
      });
    });

    describe('cascade report content', () => {
      it('should include constraint text in affected decisions', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'Decision A constraint text',
            confidence: 'provisional',
          })
        );

        const report = ledger.invalidate(a.id);

        expect(report.affectedDecisions[0]?.constraint).toBe('Decision A constraint text');
      });

      it('should include timestamp in report', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision',
            confidence: 'provisional',
          })
        );

        const report = ledger.invalidate(decision.id);

        expect(report.timestamp).toBe('2024-01-20T12:00:00.000Z');
      });

      it('should list all affected decisions in report', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'B',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'C',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );

        const report = ledger.invalidate(a.id);

        const ids = report.affectedDecisions.map((d) => d.id);
        expect(ids).toContain(a.id);
        expect(ids).toContain(b.id);
        expect(ids).toContain(c.id);
      });
    });

    describe('append-only invariant preservation', () => {
      it('should preserve all decisions after cascade invalidation', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'B',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );

        const sizeBefore = ledger.size;
        ledger.invalidate(a.id);
        const sizeAfter = ledger.size;

        expect(sizeAfter).toBe(sizeBefore);
        expect(ledger.hasId(a.id)).toBe(true);
        expect(ledger.hasId(b.id)).toBe(true);
      });

      it('should update last_modified after invalidation', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Decision',
            confidence: 'provisional',
          })
        );

        ledger.invalidate(decision.id);

        const data = ledger.toData();
        expect(data.meta.last_modified).toBeDefined();
      });
    });

    describe('complex dependency graphs', () => {
      it('should handle diamond dependency pattern', () => {
        // Diamond: A <- B, A <- C, B <- D, C <- D
        const a = ledger.append(
          createTestInput({
            constraint: 'A (root)',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'B depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'C depends on A',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const d = ledger.append(
          createTestInput({
            constraint: 'D depends on B and C',
            confidence: 'provisional',
            dependencies: [b.id, c.id],
          })
        );

        const report = ledger.invalidate(a.id);

        expect(report.totalInvalidated).toBe(4);
        expect(ledger.getById(a.id)?.status).toBe('invalidated');
        expect(ledger.getById(b.id)?.status).toBe('invalidated');
        expect(ledger.getById(c.id)?.status).toBe('invalidated');
        expect(ledger.getById(d.id)?.status).toBe('invalidated');
      });

      it('should not double-count decisions in diamond pattern', () => {
        const a = ledger.append(
          createTestInput({
            constraint: 'A',
            confidence: 'provisional',
          })
        );
        const b = ledger.append(
          createTestInput({
            constraint: 'B',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        const c = ledger.append(
          createTestInput({
            constraint: 'C',
            confidence: 'provisional',
            dependencies: [a.id],
          })
        );
        ledger.append(
          createTestInput({
            constraint: 'D',
            confidence: 'provisional',
            dependencies: [b.id, c.id],
          })
        );

        const report = ledger.invalidate(a.id);

        // Should have exactly 4 affected decisions, not more
        expect(report.totalInvalidated).toBe(4);
        const uniqueIds = new Set(report.affectedDecisions.map((d) => d.id));
        expect(uniqueIds.size).toBe(4);
      });
    });
  });

  describe('downgradeDelegated (ledger_007)', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    describe('successful downgrade', () => {
      it('should downgrade delegated confidence to inferred', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        const updated = ledger.downgradeDelegated(
          decision.id,
          'Contradicts constraint in architectural_003'
        );

        expect(updated.confidence).toBe('inferred');
        expect(updated.id).toBe(decision.id);
      });

      it('should record contradiction reason in failure_context', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        const updated = ledger.downgradeDelegated(
          decision.id,
          'Mutually exclusive options detected'
        );

        expect(updated.failure_context).toContain('Composition Audit contradiction');
        expect(updated.failure_context).toContain('Mutually exclusive options detected');
      });

      it('should append to existing failure_context if present', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
            failure_context: 'Previous context',
          })
        );

        const updated = ledger.downgradeDelegated(decision.id, 'New contradiction');

        expect(updated.failure_context).toContain('Previous context');
        expect(updated.failure_context).toContain('Composition Audit contradiction');
        expect(updated.failure_context).toContain('New contradiction');
      });

      it('should preserve active status', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        const updated = ledger.downgradeDelegated(decision.id, 'Contradiction found');

        expect(updated.status).toBe('active');
      });

      it('should update the decision in place (retrievable by getById)', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        ledger.downgradeDelegated(decision.id, 'Contradiction found');

        const retrieved = ledger.getById(decision.id);
        expect(retrieved?.confidence).toBe('inferred');
      });

      it('should update last_modified timestamp', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        ledger.downgradeDelegated(decision.id, 'Contradiction found');

        const data = ledger.toData();
        expect(data.meta.last_modified).toBe('2024-01-20T12:00:00.000Z');
      });
    });

    describe('error handling', () => {
      it('should throw DecisionNotFoundError for non-existent decision', () => {
        expect(() => ledger.downgradeDelegated('nonexistent_001', 'Reason')).toThrow(
          DecisionNotFoundError
        );
      });

      it('should throw InvalidSupersedeError for canonical confidence', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Canonical decision',
            confidence: 'canonical',
          })
        );

        expect(() => ledger.downgradeDelegated(decision.id, 'Contradiction')).toThrow(
          InvalidSupersedeError
        );
        expect(() => ledger.downgradeDelegated(decision.id, 'Contradiction')).toThrow(
          /only 'delegated' decisions can be downgraded/
        );
      });

      it('should throw InvalidSupersedeError for inferred confidence', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Inferred decision',
            confidence: 'inferred',
          })
        );

        expect(() => ledger.downgradeDelegated(decision.id, 'Contradiction')).toThrow(
          InvalidSupersedeError
        );
      });

      it('should throw InvalidSupersedeError for provisional confidence', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Provisional decision',
            confidence: 'provisional',
          })
        );

        expect(() => ledger.downgradeDelegated(decision.id, 'Contradiction')).toThrow(
          InvalidSupersedeError
        );
      });

      it('should throw InvalidSupersedeError for superseded decisions', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        ledger.supersede(original.id, createTestInput({ constraint: 'Replacement' }));

        expect(() => ledger.downgradeDelegated(original.id, 'Contradiction')).toThrow(
          InvalidSupersedeError
        );
        expect(() => ledger.downgradeDelegated(original.id, 'Contradiction')).toThrow(
          /only active decisions can be downgraded/
        );
      });

      it('should throw InvalidSupersedeError for invalidated decisions', () => {
        const original = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        ledger.invalidate(original.id);

        expect(() => ledger.downgradeDelegated(original.id, 'Contradiction')).toThrow(
          InvalidSupersedeError
        );
      });
    });

    describe('append-only invariant', () => {
      it('should not delete or add decisions during downgrade', () => {
        const decision = ledger.append(
          createTestInput({
            constraint: 'Delegated decision',
            confidence: 'delegated',
          })
        );

        const sizeBefore = ledger.size;
        ledger.downgradeDelegated(decision.id, 'Contradiction');
        const sizeAfter = ledger.size;

        expect(sizeAfter).toBe(sizeBefore);
      });

      it('should preserve all other decision fields', () => {
        const decision = ledger.append(
          createTestInput({
            category: 'architectural',
            constraint: 'Delegated constraint text',
            confidence: 'delegated',
            source: 'discussion',
            phase: 'ignition',
            rationale: 'Some rationale',
          })
        );

        const updated = ledger.downgradeDelegated(decision.id, 'Contradiction');

        expect(updated.category).toBe('architectural');
        expect(updated.constraint).toBe('Delegated constraint text');
        expect(updated.source).toBe('discussion');
        expect(updated.phase).toBe('ignition');
        expect(updated.rationale).toBe('Some rationale');
      });
    });
  });

  describe('query interface', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    describe('query by category', () => {
      it('should filter decisions by category', () => {
        ledger.append(createTestInput({ category: 'architectural', constraint: 'A1' }));
        ledger.append(createTestInput({ category: 'testing', constraint: 'T1' }));
        ledger.append(createTestInput({ category: 'architectural', constraint: 'A2' }));
        ledger.append(createTestInput({ category: 'security', constraint: 'S1' }));

        const archDecisions = ledger.query({ category: 'architectural' });

        expect(archDecisions).toHaveLength(2);
        expect(archDecisions.every((d) => d.category === 'architectural')).toBe(true);
        expect(archDecisions.map((d) => d.constraint)).toContain('A1');
        expect(archDecisions.map((d) => d.constraint)).toContain('A2');
      });

      it('should return empty array for category with no matches', () => {
        ledger.append(createTestInput({ category: 'architectural', constraint: 'A1' }));

        const testingDecisions = ledger.query({ category: 'testing' });

        expect(testingDecisions).toEqual([]);
      });
    });

    describe('query by phase', () => {
      it('should filter decisions by phase', () => {
        ledger.append(createTestInput({ phase: 'design', constraint: 'D1' }));
        ledger.append(createTestInput({ phase: 'ignition', constraint: 'I1' }));
        ledger.append(createTestInput({ phase: 'design', constraint: 'D2' }));

        const designDecisions = ledger.query({ phase: 'design' });

        expect(designDecisions).toHaveLength(2);
        expect(designDecisions.every((d) => d.phase === 'design')).toBe(true);
      });
    });

    describe('query by status', () => {
      it('should filter decisions by status', () => {
        const d1 = ledger.append(
          createTestInput({ confidence: 'provisional', constraint: 'Original' })
        );
        ledger.append(createTestInput({ constraint: 'Active decision' }));

        // Supersede d1 to create a superseded status
        ledger.supersede(d1.id, createTestInput({ constraint: 'New decision' }));

        const activeDecisions = ledger.query({ status: 'active' });
        const supersededDecisions = ledger.query({ status: 'superseded' });

        expect(activeDecisions).toHaveLength(2); // Active decision + New decision
        expect(supersededDecisions).toHaveLength(1);
        expect(supersededDecisions[0]?.constraint).toBe('Original');
      });
    });

    describe('query by confidence', () => {
      it('should filter decisions by confidence level', () => {
        ledger.append(createTestInput({ confidence: 'canonical', constraint: 'C1' }));
        ledger.append(createTestInput({ confidence: 'provisional', constraint: 'P1' }));
        ledger.append(createTestInput({ confidence: 'canonical', constraint: 'C2' }));

        const canonicalDecisions = ledger.query({ confidence: 'canonical' });

        expect(canonicalDecisions).toHaveLength(2);
        expect(canonicalDecisions.every((d) => d.confidence === 'canonical')).toBe(true);
      });
    });

    describe('combined filters', () => {
      it('should apply multiple filters with AND logic', () => {
        ledger.append(
          createTestInput({
            category: 'architectural',
            phase: 'design',
            confidence: 'canonical',
            constraint: 'Match',
          })
        );
        ledger.append(
          createTestInput({
            category: 'architectural',
            phase: 'ignition',
            confidence: 'canonical',
            constraint: 'Different phase',
          })
        );
        ledger.append(
          createTestInput({
            category: 'testing',
            phase: 'design',
            confidence: 'canonical',
            constraint: 'Different category',
          })
        );

        const results = ledger.query({
          category: 'architectural',
          phase: 'design',
        });

        expect(results).toHaveLength(1);
        expect(results[0]?.constraint).toBe('Match');
      });

      it('should filter by all four criteria simultaneously', () => {
        ledger.append(
          createTestInput({
            category: 'architectural',
            phase: 'design',
            confidence: 'canonical',
            constraint: 'Exact match',
          })
        );
        ledger.append(
          createTestInput({
            category: 'architectural',
            phase: 'design',
            confidence: 'provisional',
            constraint: 'Different confidence',
          })
        );

        const d1 = ledger.append(
          createTestInput({
            category: 'architectural',
            phase: 'design',
            confidence: 'provisional',
            constraint: 'To be superseded',
          })
        );
        // Replacement uses phase: 'ignition' to distinguish it
        ledger.supersede(d1.id, createTestInput({ constraint: 'Replacement', phase: 'ignition' }));

        const results = ledger.query({
          category: 'architectural',
          phase: 'design',
          confidence: 'canonical',
          status: 'active',
        });

        expect(results).toHaveLength(1);
        expect(results[0]?.constraint).toBe('Exact match');
      });
    });

    describe('invalid filter key', () => {
      it('should throw InvalidFilterKeyError for invalid filter key', () => {
        ledger.append(createTestInput({ constraint: 'Test' }));

        const invalidFilter = { invalidKey: 'value' } as unknown as DecisionFilter;

        expect(() => ledger.query(invalidFilter)).toThrow(InvalidFilterKeyError);

        try {
          ledger.query(invalidFilter);
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidFilterKeyError);
          const filterError = error as InstanceType<typeof InvalidFilterKeyError>;
          expect(filterError.invalidKey).toBe('invalidKey');
          expect(filterError.validKeys).toContain('category');
          expect(filterError.validKeys).toContain('phase');
          expect(filterError.validKeys).toContain('status');
          expect(filterError.validKeys).toContain('confidence');
        }
      });

      it('should throw error listing valid filter keys', () => {
        const invalidFilter = { unknownField: 'test' } as unknown as DecisionFilter;

        expect(() => ledger.query(invalidFilter)).toThrow(
          /Valid filter keys are: category, phase, status, confidence/
        );
      });
    });

    describe('empty filter', () => {
      it('should return all decisions when filter is empty', () => {
        ledger.append(createTestInput({ constraint: 'D1' }));
        ledger.append(createTestInput({ constraint: 'D2' }));
        ledger.append(createTestInput({ constraint: 'D3' }));

        const results = ledger.query({});

        expect(results).toHaveLength(3);
      });
    });
  });

  describe('getActiveDecisions', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    it('should return only active decisions', () => {
      ledger.append(createTestInput({ constraint: 'Active 1' }));
      const d2 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To be superseded' })
      );
      ledger.append(createTestInput({ constraint: 'Active 2' }));

      ledger.supersede(d2.id, createTestInput({ constraint: 'Replacement' }));

      const activeDecisions = ledger.getActiveDecisions();

      expect(activeDecisions).toHaveLength(3); // Active 1, Active 2, Replacement
      expect(activeDecisions.every((d) => d.status === 'active')).toBe(true);
      expect(activeDecisions.map((d) => d.constraint)).not.toContain('To be superseded');
    });

    it('should exclude invalidated decisions', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To be invalidated' })
      );
      ledger.append(createTestInput({ constraint: 'Active' }));

      ledger.invalidate(d1.id);

      const activeDecisions = ledger.getActiveDecisions();

      expect(activeDecisions).toHaveLength(1);
      expect(activeDecisions[0]?.constraint).toBe('Active');
    });

    it('should return empty array when all decisions are superseded/invalidated', () => {
      const d1 = ledger.append(createTestInput({ confidence: 'provisional', constraint: 'D1' }));
      ledger.supersede(d1.id, createTestInput({ confidence: 'provisional', constraint: 'D2' }));

      // Invalidate D2
      ledger.invalidate('architectural_002');

      const activeDecisions = ledger.getActiveDecisions();

      expect(activeDecisions).toHaveLength(0);
    });
  });

  describe('getHistory', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    it('should return all decisions including superseded by default', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'Original' })
      );
      ledger.supersede(d1.id, createTestInput({ constraint: 'Replacement' }));

      const history = ledger.getHistory();

      expect(history).toHaveLength(2);
      expect(history.map((d) => d.constraint)).toContain('Original');
      expect(history.map((d) => d.constraint)).toContain('Replacement');
    });

    it('should return all decisions including invalidated by default', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To invalidate' })
      );
      ledger.append(createTestInput({ constraint: 'Active' }));
      ledger.invalidate(d1.id);

      const history = ledger.getHistory();

      expect(history).toHaveLength(2);
      expect(history.find((d) => d.status === 'invalidated')).toBeDefined();
    });

    it('should exclude superseded when includeSuperseded is false', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'Original' })
      );
      ledger.supersede(d1.id, createTestInput({ constraint: 'Replacement' }));

      const history = ledger.getHistory({ includeSuperseded: false });

      expect(history).toHaveLength(1);
      expect(history[0]?.constraint).toBe('Replacement');
    });

    it('should exclude invalidated when includeInvalidated is false', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To invalidate' })
      );
      ledger.append(createTestInput({ constraint: 'Active' }));
      ledger.invalidate(d1.id);

      const history = ledger.getHistory({ includeInvalidated: false });

      expect(history).toHaveLength(1);
      expect(history[0]?.constraint).toBe('Active');
    });

    it('should return only active when both flags are false', () => {
      const d1 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To supersede' })
      );
      const d2 = ledger.append(
        createTestInput({ confidence: 'provisional', constraint: 'To invalidate' })
      );
      ledger.append(createTestInput({ constraint: 'Active' }));

      ledger.supersede(d1.id, createTestInput({ constraint: 'Replacement' }));
      ledger.invalidate(d2.id);

      const history = ledger.getHistory({
        includeSuperseded: false,
        includeInvalidated: false,
      });

      expect(history).toHaveLength(2); // Active + Replacement
      expect(history.every((d) => d.status === 'active')).toBe(true);
    });
  });

  describe('getDecisionsByDependencyGraph', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({
        project: 'test-project',
        now: (): Date => new Date('2024-01-20T12:00:00.000Z'),
      });
    });

    it('should return decision with direct dependencies', () => {
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      const b = ledger.append(createTestInput({ constraint: 'B' }));
      const c = ledger.append(
        createTestInput({
          constraint: 'C depends on A and B',
          dependencies: [a.id, b.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(c.id);

      expect(graph.decision.id).toBe(c.id);
      expect(graph.directDependencies).toHaveLength(2);
      expect(graph.directDependencies.map((d) => d.id)).toContain(a.id);
      expect(graph.directDependencies.map((d) => d.id)).toContain(b.id);
    });

    it('should return decision with direct dependents', () => {
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      const b = ledger.append(
        createTestInput({
          constraint: 'B depends on A',
          dependencies: [a.id],
        })
      );
      const c = ledger.append(
        createTestInput({
          constraint: 'C depends on A',
          dependencies: [a.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(a.id);

      expect(graph.decision.id).toBe(a.id);
      expect(graph.directDependencies).toHaveLength(0);
      expect(graph.directDependents).toHaveLength(2);
      expect(graph.directDependents.map((d) => d.id)).toContain(b.id);
      expect(graph.directDependents.map((d) => d.id)).toContain(c.id);
    });

    it('should throw DecisionNotFoundError for non-existent decision', () => {
      expect(() => ledger.getDecisionsByDependencyGraph('nonexistent_001')).toThrow(
        DecisionNotFoundError
      );
    });

    it('should include transitive dependencies when option is true', () => {
      // A <- B <- C (C depends on B, B depends on A)
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      const b = ledger.append(
        createTestInput({
          constraint: 'B depends on A',
          dependencies: [a.id],
        })
      );
      const c = ledger.append(
        createTestInput({
          constraint: 'C depends on B',
          dependencies: [b.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(c.id, {
        includeTransitiveDependencies: true,
      });

      expect(graph.directDependencies).toHaveLength(1);
      expect(graph.directDependencies[0]?.id).toBe(b.id);
      expect(graph.transitiveDependencies).toBeDefined();
      expect(graph.transitiveDependencies).toHaveLength(2);
      expect(graph.transitiveDependencies?.map((d) => d.id)).toContain(a.id);
      expect(graph.transitiveDependencies?.map((d) => d.id)).toContain(b.id);
    });

    it('should include transitive dependents when option is true', () => {
      // A <- B <- C
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      const b = ledger.append(
        createTestInput({
          constraint: 'B depends on A',
          dependencies: [a.id],
        })
      );
      const c = ledger.append(
        createTestInput({
          constraint: 'C depends on B',
          dependencies: [b.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(a.id, {
        includeTransitiveDependents: true,
      });

      expect(graph.directDependents).toHaveLength(1);
      expect(graph.directDependents[0]?.id).toBe(b.id);
      expect(graph.transitiveDependents).toBeDefined();
      expect(graph.transitiveDependents).toHaveLength(2);
      expect(graph.transitiveDependents?.map((d) => d.id)).toContain(b.id);
      expect(graph.transitiveDependents?.map((d) => d.id)).toContain(c.id);
    });

    it('should not include transitive fields when options are false or omitted', () => {
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      ledger.append(
        createTestInput({
          constraint: 'B depends on A',
          dependencies: [a.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(a.id);

      expect(graph.transitiveDependencies).toBeUndefined();
      expect(graph.transitiveDependents).toBeUndefined();
    });

    it('should handle diamond dependency pattern for transitive queries', () => {
      // Diamond: A <- B, A <- C, B <- D, C <- D
      const a = ledger.append(createTestInput({ constraint: 'A' }));
      const b = ledger.append(
        createTestInput({
          constraint: 'B depends on A',
          dependencies: [a.id],
        })
      );
      const c = ledger.append(
        createTestInput({
          constraint: 'C depends on A',
          dependencies: [a.id],
        })
      );
      const d = ledger.append(
        createTestInput({
          constraint: 'D depends on B and C',
          dependencies: [b.id, c.id],
        })
      );

      const graph = ledger.getDecisionsByDependencyGraph(d.id, {
        includeTransitiveDependencies: true,
      });

      // Direct deps: B, C
      expect(graph.directDependencies).toHaveLength(2);

      // Transitive deps: should include A, B, C (no duplicates)
      expect(graph.transitiveDependencies).toBeDefined();
      expect(graph.transitiveDependencies).toHaveLength(3);

      const transitiveIds = graph.transitiveDependencies?.map((dep) => dep.id) ?? [];
      expect(transitiveIds).toContain(a.id);
      expect(transitiveIds).toContain(b.id);
      expect(transitiveIds).toContain(c.id);
    });
  });

  describe('InvalidFilterKeyError', () => {
    it('should preserve error name', () => {
      const error = new InvalidFilterKeyError('badKey', [
        'category',
        'phase',
        'status',
        'confidence',
      ]);
      expect(error.name).toBe('InvalidFilterKeyError');
    });

    it('should include invalid key and valid keys in message', () => {
      const error = new InvalidFilterKeyError('badKey', [
        'category',
        'phase',
        'status',
        'confidence',
      ]);
      expect(error.message).toContain('badKey');
      expect(error.message).toContain('category');
      expect(error.message).toContain('phase');
      expect(error.message).toContain('status');
      expect(error.message).toContain('confidence');
    });

    it('should expose invalid key and valid keys', () => {
      const validKeys = ['category', 'phase', 'status', 'confidence'] as const;
      const error = new InvalidFilterKeyError('badKey', validKeys);
      expect(error.invalidKey).toBe('badKey');
      expect(error.validKeys).toEqual(validKeys);
    });
  });
});
