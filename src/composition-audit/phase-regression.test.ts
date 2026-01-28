/**
 * Tests for the phase regression handler.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Ledger } from '../ledger/index.js';
import type { Contradiction } from './types.js';
import {
  analyzeContradictions,
  handlePhaseRegression,
  handleAllResolutionsRejected,
  formatContradictionForUser,
  getPreservedConstraintIds,
  isSimpleContradiction,
  CONTRADICTION_TYPE_TO_PHASE,
  ELEMENT_TYPE_TO_PHASE,
} from './phase-regression.js';

/**
 * Creates a test ledger.
 */
function createTestLedger(): Ledger {
  return new Ledger({ project: 'test-project' });
}

/**
 * Creates a simple contradiction for testing.
 */
function createSimpleContradiction(overrides?: Partial<Contradiction>): Contradiction {
  return {
    id: 'TEMPORAL_001',
    type: 'temporal',
    severity: 'critical',
    description: 'Session timeout conflicts with operation duration',
    involved: [
      {
        elementType: 'constraint',
        id: 'NF001',
        name: 'Session timeout',
        text: 'Sessions expire after 30 minutes',
      },
      {
        elementType: 'constraint',
        id: 'NF002',
        name: 'Operation duration',
        text: 'Operations may take up to 2 hours',
      },
    ],
    analysis: 'The session will expire before long operations complete',
    minimalScenario: 'User starts processing, session expires after 30 min',
    suggestedResolutions: ['Extend session timeout', 'Add session keep-alive'],
    ...overrides,
  };
}

/**
 * Creates a complex contradiction with architecture involvement.
 */
function createArchitectureContradiction(): Contradiction {
  return {
    id: 'INVARIANT_001',
    type: 'invariant',
    severity: 'critical',
    description: 'Balance invariant conflicts with withdrawal logic',
    involved: [
      {
        elementType: 'contract',
        id: 'withdraw',
        name: 'Withdraw function',
        text: 'balance = balance - amount',
      },
      {
        elementType: 'witness',
        id: 'balance_witness',
        name: 'Balance type witness',
        text: 'Balance >= 0',
      },
    ],
    analysis: 'The withdrawal contract can violate the balance invariant',
    minimalScenario: 'Withdraw more than balance',
    suggestedResolutions: ['Add precondition check', 'Modify witness'],
  };
}

describe('Phase Regression Handler', () => {
  describe('CONTRADICTION_TYPE_TO_PHASE mapping', () => {
    it('maps temporal contradictions to Constraints phase', () => {
      expect(CONTRADICTION_TYPE_TO_PHASE.temporal).toBe('Constraints');
    });

    it('maps resource contradictions to Constraints phase', () => {
      expect(CONTRADICTION_TYPE_TO_PHASE.resource).toBe('Constraints');
    });

    it('maps invariant contradictions to Architecture phase', () => {
      expect(CONTRADICTION_TYPE_TO_PHASE.invariant).toBe('Architecture');
    });

    it('maps precondition_gap to Architecture phase', () => {
      expect(CONTRADICTION_TYPE_TO_PHASE.precondition_gap).toBe('Architecture');
    });

    it('maps postcondition_conflict to Constraints phase', () => {
      expect(CONTRADICTION_TYPE_TO_PHASE.postcondition_conflict).toBe('Constraints');
    });
  });

  describe('ELEMENT_TYPE_TO_PHASE mapping', () => {
    it('maps constraint to Constraints phase', () => {
      expect(ELEMENT_TYPE_TO_PHASE.constraint).toBe('Constraints');
    });

    it('maps contract to Architecture phase', () => {
      expect(ELEMENT_TYPE_TO_PHASE.contract).toBe('Architecture');
    });

    it('maps witness to Architecture phase', () => {
      expect(ELEMENT_TYPE_TO_PHASE.witness).toBe('Architecture');
    });

    it('maps claim to Discovery phase', () => {
      expect(ELEMENT_TYPE_TO_PHASE.claim).toBe('Discovery');
    });
  });

  describe('analyzeContradictions', () => {
    it('returns simple complexity for empty contradictions', () => {
      const analysis = analyzeContradictions([], {
        allConstraintIds: ['C1', 'C2', 'C3'],
      });

      expect(analysis.complexity).toBe('simple');
      expect(analysis.targetPhase).toBeUndefined();
      expect(analysis.preservedConstraintIds).toEqual(['C1', 'C2', 'C3']);
    });

    it('classifies single contradiction as simple', () => {
      const contradiction = createSimpleContradiction();
      const analysis = analyzeContradictions([contradiction], {
        allConstraintIds: ['NF001', 'NF002', 'NF003', 'F001'],
      });

      expect(analysis.complexity).toBe('simple');
      expect(analysis.targetPhase).toBe('Constraints'); // Both elements are constraints
      expect(analysis.regressionQuestion).toBeDefined();
      expect(analysis.affectedConstraintIds).toContain('NF001');
      expect(analysis.affectedConstraintIds).toContain('NF002');
      expect(analysis.preservedConstraintIds).toContain('NF003');
      expect(analysis.preservedConstraintIds).toContain('F001');
    });

    it('classifies multiple contradictions with different types as complex', () => {
      const temporal = createSimpleContradiction();
      const invariant = createArchitectureContradiction();

      const analysis = analyzeContradictions([temporal, invariant], {
        allConstraintIds: ['NF001', 'NF002'],
      });

      expect(analysis.complexity).toBe('complex');
      expect(analysis.targetPhase).toBeUndefined();
      expect(analysis.affectedPhases).toContain('Constraints');
      expect(analysis.affectedPhases).toContain('Architecture');
    });

    it('classifies contradictions with shared elements as complex', () => {
      const first: Contradiction = {
        id: 'C1',
        type: 'temporal',
        severity: 'critical',
        description: 'First',
        involved: [
          { elementType: 'constraint', id: 'SHARED', name: 'Shared', text: 'Shared element' },
        ],
        analysis: 'A1',
        minimalScenario: 'S1',
        suggestedResolutions: ['R1'],
      };

      const second: Contradiction = {
        id: 'C2',
        type: 'temporal',
        severity: 'warning',
        description: 'Second',
        involved: [
          { elementType: 'constraint', id: 'SHARED', name: 'Shared', text: 'Shared element' },
        ],
        analysis: 'A2',
        minimalScenario: 'S2',
        suggestedResolutions: ['R2'],
      };

      const analysis = analyzeContradictions([first, second], {
        allConstraintIds: ['SHARED', 'OTHER'],
      });

      expect(analysis.complexity).toBe('complex');
    });

    it('identifies delegated decisions that need downgrading', () => {
      const contradiction = createSimpleContradiction();

      const analysis = analyzeContradictions([contradiction], {
        allConstraintIds: ['NF001', 'NF002', 'NF003'],
        delegatedDecisionIds: ['NF001', 'NF003'], // NF001 is involved, NF003 is not
      });

      expect(analysis.delegatedDecisionIds).toContain('NF001');
      expect(analysis.delegatedDecisionIds).not.toContain('NF003');
    });

    it('builds suggested resolutions with affected phases', () => {
      const contradiction = createSimpleContradiction();
      const analysis = analyzeContradictions([contradiction], {
        allConstraintIds: ['NF001', 'NF002'],
      });

      expect(analysis.suggestedResolutions.length).toBeGreaterThan(0);
      const resolution = analysis.suggestedResolutions[0];
      expect(resolution).toBeDefined();
      expect(resolution?.affectedPhase).toBe('Constraints');
      expect(resolution?.requiresSpecChange).toBe(true);
    });
  });

  describe('handlePhaseRegression', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
    });

    it('returns error for empty contradictions', () => {
      const result = handlePhaseRegression([], ledger, {
        allConstraintIds: ['C1'],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CONTRADICTIONS');
      }
    });

    it('returns regression result for simple contradiction', () => {
      const contradiction = createSimpleContradiction();

      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: ['NF001', 'NF002', 'NF003'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.kind).toBe('regression');
        if (result.kind === 'regression') {
          expect(result.targetPhase).toBe('Constraints');
          expect(result.question).toContain('constraint conflict');
          expect(result.resolutions.length).toBeGreaterThan(0);
          expect(result.preservedConstraintIds).toContain('NF003');
          expect(result.contradiction).toBe(contradiction);
          expect(result.ledgerDecision).toBeDefined();
          expect(result.ledgerDecision.category).toBe('constraint');
        }
      }
    });

    it('records contradiction in ledger', () => {
      const contradiction = createSimpleContradiction();

      handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: ['NF001', 'NF002'],
      });

      const decisions = ledger.getDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.source).toBe('composition_audit');
      expect(decisions[0]?.confidence).toBe('blocking');
      expect(decisions[0]?.constraint).toContain('Contradiction detected');
    });

    it('returns blocked state for complex contradictions', () => {
      const temporal = createSimpleContradiction();
      const invariant = createArchitectureContradiction();

      const result = handlePhaseRegression([temporal, invariant], ledger, {
        allConstraintIds: ['NF001', 'NF002'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.kind).toBe('blocked');
        if (result.kind === 'blocked') {
          expect(result.state.phase).toBe('CompositionAudit');
          expect(result.state.substate.kind).toBe('Blocking');
          expect(result.query).toContain('INTERACTING CONTRADICTIONS');
          expect(result.options.length).toBeGreaterThan(0);
          expect(result.contradictions).toHaveLength(2);
        }
      }
    });

    it('downgrades delegated decisions to inferred', () => {
      // First, add a delegated decision to the ledger
      const delegatedDecision = ledger.append({
        category: 'constraint',
        constraint: 'Session timeout is 30 minutes',
        source: 'design_choice',
        confidence: 'delegated',
        phase: 'ignition',
      });

      const contradiction = createSimpleContradiction({
        involved: [
          {
            elementType: 'constraint',
            id: delegatedDecision.id, // Use the actual decision ID
            name: 'Session timeout',
            text: 'Sessions expire after 30 minutes',
          },
        ],
      });

      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: [delegatedDecision.id],
        delegatedDecisionIds: [delegatedDecision.id],
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'regression') {
        expect(result.downgradedDecisionIds).toContain(delegatedDecision.id);
      }

      // Check that the decision was actually downgraded
      const updated = ledger.getById(delegatedDecision.id);
      expect(updated?.confidence).toBe('inferred');
    });

    it('logs warning when decision downgrade fails', () => {
      const warnings: string[] = [];
      // Create contradiction with an involved element ID that matches the delegatedDecisionIds
      const contradiction = createSimpleContradiction({
        involved: [
          {
            elementType: 'constraint',
            id: 'nonexistent_decision', // This ID will match delegatedDecisionIds but won't exist in ledger
            name: 'Missing decision',
            text: 'A decision that does not exist',
          },
          {
            elementType: 'constraint',
            id: 'NF002',
            name: 'Other constraint',
            text: 'Some constraint',
          },
        ],
      });

      handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: ['nonexistent_decision', 'NF002'],
        delegatedDecisionIds: ['nonexistent_decision'], // This is "involved" but doesn't exist in ledger
        logger: (msg) => warnings.push(msg),
      });

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('Could not downgrade'))).toBe(true);
    });

    it('generates specific regression question for Architecture phase', () => {
      const contradiction = createArchitectureContradiction();

      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: [],
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'regression') {
        expect(result.targetPhase).toBe('Architecture');
        expect(result.question).toContain('system architecture');
      }
    });

    it('includes resolution options in blocked state', () => {
      const temporal = createSimpleContradiction();
      const invariant = createArchitectureContradiction();

      const result = handlePhaseRegression([temporal, invariant], ledger, {
        allConstraintIds: [],
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'blocked') {
        // Should have options from suggested resolutions plus "custom" option
        expect(result.options.some((o) => o.includes('custom'))).toBe(true);
      }
    });
  });

  describe('handleAllResolutionsRejected', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = createTestLedger();
    });

    it('enters BLOCKED state when all resolutions rejected', () => {
      const contradiction = createSimpleContradiction();

      const result = handleAllResolutionsRejected(contradiction, ledger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.kind).toBe('blocked');
        if (result.kind === 'blocked') {
          expect(result.state.substate.kind).toBe('Blocking');
          expect(result.query).toContain('rejected');
          expect(result.contradictions).toContain(contradiction);
        }
      }
    });

    it('records rejection in ledger', () => {
      const contradiction = createSimpleContradiction();

      handleAllResolutionsRejected(contradiction, ledger);

      const decisions = ledger.getDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.constraint).toContain('rejected all suggested resolutions');
      expect(decisions[0]?.source).toBe('human_resolution');
    });
  });

  describe('formatContradictionForUser', () => {
    it('formats contradiction with all sections', () => {
      const contradiction = createSimpleContradiction();
      const analysis = analyzeContradictions([contradiction], {
        allConstraintIds: ['NF001', 'NF002'],
      });

      const formatted = formatContradictionForUser(contradiction, analysis.suggestedResolutions);

      expect(formatted).toContain('TEMPORAL CONTRADICTION');
      expect(formatted).toContain('Session timeout conflicts');
      expect(formatted).toContain('Involved elements:');
      expect(formatted).toContain('[constraint] Session timeout');
      expect(formatted).toContain('Analysis:');
      expect(formatted).toContain('Minimal failing scenario:');
      expect(formatted).toContain('Suggested resolutions:');
      expect(formatted).toContain('Extend session timeout');
    });

    it('shows critical indicator for critical severity', () => {
      const contradiction = createSimpleContradiction({ severity: 'critical' });
      const formatted = formatContradictionForUser(contradiction, []);

      expect(formatted).toContain('[!]');
    });

    it('shows warning indicator for warning severity', () => {
      const contradiction = createSimpleContradiction({ severity: 'warning' });
      const formatted = formatContradictionForUser(contradiction, []);

      expect(formatted).toContain('[?]');
    });
  });

  describe('getPreservedConstraintIds', () => {
    it('returns all constraint IDs not in contradiction', () => {
      const contradiction = createSimpleContradiction();
      const allIds = ['NF001', 'NF002', 'NF003', 'F001', 'F002'];

      const preserved = getPreservedConstraintIds(contradiction, allIds);

      expect(preserved).toContain('NF003');
      expect(preserved).toContain('F001');
      expect(preserved).toContain('F002');
      expect(preserved).not.toContain('NF001');
      expect(preserved).not.toContain('NF002');
    });

    it('returns all IDs when contradiction has no constraints', () => {
      const contradiction: Contradiction = {
        id: 'TEST',
        type: 'invariant',
        severity: 'warning',
        description: 'Test',
        involved: [{ elementType: 'contract', id: 'C1', name: 'Contract', text: 'Contract text' }],
        analysis: 'A',
        minimalScenario: 'S',
        suggestedResolutions: [],
      };

      const allIds = ['NF001', 'NF002'];
      const preserved = getPreservedConstraintIds(contradiction, allIds);

      expect(preserved).toEqual(['NF001', 'NF002']);
    });
  });

  describe('isSimpleContradiction', () => {
    it('returns true for contradiction with 2 or fewer phases', () => {
      const contradiction = createSimpleContradiction();
      expect(isSimpleContradiction(contradiction)).toBe(true);
    });

    it('returns false for contradiction spanning many phases', () => {
      const contradiction: Contradiction = {
        id: 'COMPLEX',
        type: 'invariant',
        severity: 'critical',
        description: 'Complex',
        involved: [
          { elementType: 'constraint', id: 'C1', name: 'Constraint', text: 'C' },
          { elementType: 'contract', id: 'C2', name: 'Contract', text: 'C' },
          { elementType: 'claim', id: 'C3', name: 'Claim', text: 'C' },
        ],
        analysis: 'A',
        minimalScenario: 'S',
        suggestedResolutions: ['R1'],
      };

      expect(isSimpleContradiction(contradiction)).toBe(false);
    });

    it('returns false for contradiction without suggested resolutions', () => {
      const contradiction = createSimpleContradiction({
        suggestedResolutions: [],
      });

      expect(isSimpleContradiction(contradiction)).toBe(false);
    });
  });

  describe('Example: Balance invariant conflict', () => {
    it('returns to Architecture phase with specific question', () => {
      const ledger = createTestLedger();

      // This is the example from acceptance criteria:
      // Balance invariant conflict -> return to Architecture phase with specific question
      const contradiction: Contradiction = {
        id: 'INVARIANT_BALANCE',
        type: 'invariant',
        severity: 'critical',
        description: 'Balance invariant cannot be maintained during concurrent withdrawals',
        involved: [
          {
            elementType: 'contract',
            id: 'withdraw',
            name: 'Withdraw function',
            text: 'requires: balance >= amount, ensures: balance = balance - amount',
          },
          {
            elementType: 'witness',
            id: 'balance_witness',
            name: 'Balance type',
            text: 'Balance: NonNegativeNumber',
          },
          {
            elementType: 'constraint',
            id: 'CONCURRENT',
            name: 'Concurrency requirement',
            text: 'Multiple withdrawals may occur simultaneously',
          },
        ],
        analysis:
          'Without transaction isolation, concurrent withdrawals can result in negative balance',
        minimalScenario:
          '1. Balance = 100\n2. User A and User B both request withdrawal of 60\n3. Both see balance >= 60\n4. Both proceed, resulting in balance = -20',
        suggestedResolutions: [
          'Add optimistic locking to withdrawal',
          'Use serializable transactions',
          'Add balance reservation before withdrawal',
        ],
      };

      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: ['CONCURRENT', 'OTHER_CONSTRAINT'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'regression') {
        expect(result.targetPhase).toBe('Architecture');
        expect(result.question).toContain('architecture');
        expect(result.question).toContain('Withdraw function');
        expect(result.preservedConstraintIds).toContain('OTHER_CONSTRAINT');
      }
    });
  });

  describe('Negative case: User rejects all resolutions', () => {
    it('transitions to BLOCKED state', () => {
      const ledger = createTestLedger();
      const contradiction = createSimpleContradiction();

      // First, handle the phase regression (user sees resolutions)
      const regressionResult = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: ['NF001', 'NF002'],
      });

      expect(regressionResult.success).toBe(true);
      if (regressionResult.success && regressionResult.kind === 'regression') {
        expect(regressionResult.resolutions.length).toBeGreaterThan(0);
      }

      // User rejects all resolutions
      const blockedResult = handleAllResolutionsRejected(contradiction, ledger);

      expect(blockedResult.success).toBe(true);
      if (blockedResult.success && blockedResult.kind === 'blocked') {
        expect(blockedResult.state.phase).toBe('CompositionAudit');
        expect(blockedResult.state.substate.kind).toBe('Blocking');
        expect(blockedResult.query).toContain('rejected');
      }
    });
  });

  describe('Delegated decision downgrade', () => {
    it('downgrades delegated decision involved in contradiction', () => {
      const ledger = createTestLedger();

      // Create a delegated decision
      const delegated = ledger.append({
        category: 'constraint',
        constraint: 'Use 30 minute session timeout',
        source: 'design_choice',
        confidence: 'delegated',
        phase: 'ignition',
        rationale: 'Delegated decision for session handling',
      });

      expect(delegated.confidence).toBe('delegated');

      // Contradiction involving this decision
      const contradiction = createSimpleContradiction({
        involved: [
          {
            elementType: 'constraint',
            id: delegated.id,
            name: 'Session timeout',
            text: 'Sessions expire after 30 minutes',
          },
          {
            elementType: 'constraint',
            id: 'OTHER',
            name: 'Long operation',
            text: 'Operations take 2 hours',
          },
        ],
      });

      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: [delegated.id, 'OTHER'],
        delegatedDecisionIds: [delegated.id],
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'regression') {
        expect(result.downgradedDecisionIds).toContain(delegated.id);
      }

      // Verify the decision was downgraded
      const updated = ledger.getById(delegated.id);
      expect(updated?.confidence).toBe('inferred');
      expect(updated?.failure_context).toContain('Composition Audit contradiction');
    });

    it('does not downgrade non-delegated decisions', () => {
      const ledger = createTestLedger();

      // Create a canonical decision
      const canonical = ledger.append({
        category: 'constraint',
        constraint: 'Use 30 minute session timeout',
        source: 'user_explicit',
        confidence: 'canonical',
        phase: 'ignition',
      });

      const contradiction = createSimpleContradiction({
        involved: [
          {
            elementType: 'constraint',
            id: canonical.id,
            name: 'Session timeout',
            text: 'Sessions expire after 30 minutes',
          },
        ],
      });

      const warnings: string[] = [];
      const result = handlePhaseRegression([contradiction], ledger, {
        allConstraintIds: [canonical.id],
        delegatedDecisionIds: [canonical.id], // Try to downgrade it
        logger: (msg) => warnings.push(msg),
      });

      expect(result.success).toBe(true);
      if (result.success && result.kind === 'regression') {
        // Should not be in downgraded list
        expect(result.downgradedDecisionIds).not.toContain(canonical.id);
      }

      // Canonical decision should remain unchanged
      const updated = ledger.getById(canonical.id);
      expect(updated?.confidence).toBe('canonical');

      // Should have logged a warning
      expect(warnings.some((w) => w.includes('Could not downgrade'))).toBe(true);
    });
  });
});
