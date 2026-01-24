import { describe, expect, it, beforeEach } from 'vitest';
import fc from 'fast-check';
import { Ledger, LedgerValidationError, DuplicateDecisionIdError, fromData } from './index.js';
import type { DecisionInput, Decision, DecisionCategory, LedgerData } from './index.js';

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
        const decision = ledger.append(createTestInput({ dependencies: ['arch_001', 'arch_002'] }));

        expect(decision.dependencies).toEqual(['arch_001', 'arch_002']);
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
});
