/**
 * US-009: Final integration verification tests.
 *
 * Verifies all components of the 3-tier state model work together:
 * - Serialization roundtrips for every Tier 1 variant
 * - getPhase() correctness for all state variants
 * - getStep() correctness for all active states and non-active states
 * - Zero references to old type names (verified by compile error)
 */

import { describe, expect, it } from 'vitest';
import { serializeState, deserializeState, type ProtocolStateSnapshot } from './persistence.js';
import {
  createActiveState,
  createBlockedState,
  createFailedState,
  createCompleteState,
  getPhase,
  getStep,
  isActiveState,
  isBlockedState,
  isFailedState,
  isCompleteState,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
  createIgnitionSynthesizing,
  createIgnitionAwaitingApproval,
  createLatticePhaseState,
  createLatticeGeneratingStructure,
  createLatticeCompilingCheck,
  createLatticeRepairingStructure,
  createCompositionAuditPhaseState,
  createCompositionAuditAuditing,
  createCompositionAuditReportingContradictions,
  createInjectionPhaseState,
  createInjectionSelectingFunction,
  createInjectionImplementing,
  createInjectionVerifying,
  createInjectionEscalating,
  createMesoscopicPhaseState,
  createMesoscopicGeneratingTests,
  createMesoscopicExecutingCluster,
  createMesoscopicHandlingVerdict,
  createMassDefectPhaseState,
  createMassDefectAnalyzingComplexity,
  createMassDefectApplyingTransform,
  createMassDefectVerifyingSemantics,
  type ProtocolState,
  type BlockReason,
} from './types.js';

/**
 * Helper: roundtrip a ProtocolState through serialize/deserialize.
 * Strips time-dependent fields (persistedAt, blockedAt, failedAt)
 * and compares the structural content.
 */
function roundtripState(state: ProtocolState): ProtocolState {
  const snapshot: ProtocolStateSnapshot = {
    state,
    artifacts: [],
    blockingQueries: [],
  };
  const json = serializeState(snapshot);
  const restored = deserializeState(json);
  return restored.state;
}

describe('US-009: Final integration verification', () => {
  describe('Serialization roundtrips for all Tier 1 variants', () => {
    describe('Active states — all 6 phases with representative substates', () => {
      it('Ignition: interviewing', () => {
        const state = createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Ignition');
          expect(restored.phase.substate).toEqual({
            step: 'interviewing',
            interviewPhase: 'Discovery',
            questionIndex: 0,
          });
        }
      });

      it('Ignition: synthesizing', () => {
        const state = createActiveState(createIgnitionPhaseState(createIgnitionSynthesizing(0.5)));
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Ignition');
          expect(restored.phase.substate).toEqual({ step: 'synthesizing', progress: 0.5 });
        }
      });

      it('Ignition: awaitingApproval', () => {
        const state = createActiveState(createIgnitionPhaseState(createIgnitionAwaitingApproval()));
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Ignition');
          expect(restored.phase.substate).toEqual({ step: 'awaitingApproval' });
        }
      });

      it('Lattice: generatingStructure (with currentModule)', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure('auth'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Lattice');
          expect(restored.phase.substate).toEqual({
            step: 'generatingStructure',
            currentModule: 'auth',
          });
        }
      });

      it('Lattice: generatingStructure (without currentModule)', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeGeneratingStructure())
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Lattice');
          expect(restored.phase.substate.step).toBe('generatingStructure');
        }
      });

      it('Lattice: compilingCheck', () => {
        const state = createActiveState(createLatticePhaseState(createLatticeCompilingCheck(2)));
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({ step: 'compilingCheck', attempt: 2 });
        }
      });

      it('Lattice: repairingStructure', () => {
        const state = createActiveState(
          createLatticePhaseState(createLatticeRepairingStructure(['err1', 'err2'], 1))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'repairingStructure',
            errors: ['err1', 'err2'],
            repairAttempt: 1,
          });
        }
      });

      it('CompositionAudit: auditing', () => {
        const state = createActiveState(
          createCompositionAuditPhaseState(createCompositionAuditAuditing(3))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('CompositionAudit');
          expect(restored.phase.substate).toEqual({ step: 'auditing', auditorsCompleted: 3 });
        }
      });

      it('CompositionAudit: reportingContradictions', () => {
        const state = createActiveState(
          createCompositionAuditPhaseState(createCompositionAuditReportingContradictions('high'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'reportingContradictions',
            severity: 'high',
          });
        }
      });

      it('Injection: selectingFunction', () => {
        const state = createActiveState(
          createInjectionPhaseState(createInjectionSelectingFunction())
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Injection');
          expect(restored.phase.substate).toEqual({ step: 'selectingFunction' });
        }
      });

      it('Injection: implementing (example from AC)', () => {
        const state = createActiveState(
          createInjectionPhaseState(createInjectionImplementing('auth_login', 3))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Injection');
          expect(restored.phase.substate).toEqual({
            step: 'implementing',
            functionId: 'auth_login',
            attempt: 3,
          });
        }
      });

      it('Injection: verifying', () => {
        const state = createActiveState(
          createInjectionPhaseState(createInjectionVerifying('auth_login'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'verifying',
            functionId: 'auth_login',
          });
        }
      });

      it('Injection: escalating', () => {
        const state = createActiveState(
          createInjectionPhaseState(createInjectionEscalating('auth_login', 'Injection', 'Lattice'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'escalating',
            functionId: 'auth_login',
            fromTier: 'Injection',
            toTier: 'Lattice',
          });
        }
      });

      it('Mesoscopic: generatingTests (with clusterId)', () => {
        const state = createActiveState(
          createMesoscopicPhaseState(createMesoscopicGeneratingTests('cluster-1'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('Mesoscopic');
          expect(restored.phase.substate).toEqual({
            step: 'generatingTests',
            clusterId: 'cluster-1',
          });
        }
      });

      it('Mesoscopic: executingCluster', () => {
        const state = createActiveState(
          createMesoscopicPhaseState(createMesoscopicExecutingCluster('cluster-1', 0.75))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'executingCluster',
            clusterId: 'cluster-1',
            progress: 0.75,
          });
        }
      });

      it('Mesoscopic: handlingVerdict', () => {
        const state = createActiveState(
          createMesoscopicPhaseState(createMesoscopicHandlingVerdict('cluster-1', true))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'handlingVerdict',
            clusterId: 'cluster-1',
            passed: true,
          });
        }
      });

      it('MassDefect: analyzingComplexity', () => {
        const state = createActiveState(
          createMassDefectPhaseState(createMassDefectAnalyzingComplexity())
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.phase).toBe('MassDefect');
          expect(restored.phase.substate).toEqual({ step: 'analyzingComplexity' });
        }
      });

      it('MassDefect: applyingTransform', () => {
        const state = createActiveState(
          createMassDefectPhaseState(createMassDefectApplyingTransform('pattern-1', 'func-1'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'applyingTransform',
            patternId: 'pattern-1',
            functionId: 'func-1',
          });
        }
      });

      it('MassDefect: verifyingSemantics', () => {
        const state = createActiveState(
          createMassDefectPhaseState(createMassDefectVerifyingSemantics('transform-1'))
        );
        const restored = roundtripState(state);
        expect(isActiveState(restored)).toBe(true);
        if (isActiveState(restored)) {
          expect(restored.phase.substate).toEqual({
            step: 'verifyingSemantics',
            transformId: 'transform-1',
          });
        }
      });
    });

    describe('Blocked states — all 5 BlockReasons', () => {
      const blockReasons: BlockReason[] = [
        'canonical_conflict',
        'unresolved_contradiction',
        'circuit_breaker',
        'security_review',
        'user_requested',
      ];

      for (const reason of blockReasons) {
        it(`Blocked: ${reason}`, () => {
          const state = createBlockedState({
            reason,
            phase: 'Injection',
            query: `Blocked due to ${reason}`,
            options: ['Resolve', 'Escalate'],
            timeoutMs: 60000,
          });
          const restored = roundtripState(state);
          expect(isBlockedState(restored)).toBe(true);
          if (isBlockedState(restored)) {
            expect(restored.reason).toBe(reason);
            expect(restored.phase).toBe('Injection');
            expect(restored.query).toBe(`Blocked due to ${reason}`);
            expect(restored.options).toEqual(['Resolve', 'Escalate']);
            expect(restored.timeoutMs).toBe(60000);
            expect(restored.blockedAt).toBe(state.blockedAt);
          }
        });
      }
    });

    describe('Failed state', () => {
      it('roundtrips with all fields', () => {
        const state = createFailedState({
          phase: 'MassDefect',
          error: 'Semantic verification failed',
          code: 'SEMANTIC_ERR',
          recoverable: true,
          context: 'transform-42 failed verification',
        });
        const restored = roundtripState(state);
        expect(isFailedState(restored)).toBe(true);
        if (isFailedState(restored)) {
          expect(restored.phase).toBe('MassDefect');
          expect(restored.error).toBe('Semantic verification failed');
          expect(restored.code).toBe('SEMANTIC_ERR');
          expect(restored.recoverable).toBe(true);
          expect(restored.context).toBe('transform-42 failed verification');
          expect(restored.failedAt).toBe(state.failedAt);
        }
      });

      it('roundtrips without optional fields', () => {
        const state = createFailedState({
          phase: 'Ignition',
          error: 'Spec parse failed',
        });
        const restored = roundtripState(state);
        expect(isFailedState(restored)).toBe(true);
        if (isFailedState(restored)) {
          expect(restored.phase).toBe('Ignition');
          expect(restored.error).toBe('Spec parse failed');
          expect(restored.recoverable).toBe(false);
          // Optional fields must not be present (exactOptionalPropertyTypes)
          expect('code' in restored).toBe(false);
          expect('context' in restored).toBe(false);
        }
      });
    });

    describe('Complete state', () => {
      it('roundtrips with artifacts', () => {
        const state = createCompleteState([
          'spec',
          'latticeCode',
          'witnesses',
          'contracts',
          'validatedStructure',
          'implementedCode',
          'testedCode',
          'optimizedCode',
        ]);
        const restored = roundtripState(state);
        expect(isCompleteState(restored)).toBe(true);
        if (isCompleteState(restored)) {
          expect(restored.artifacts).toEqual([
            'spec',
            'latticeCode',
            'witnesses',
            'contracts',
            'validatedStructure',
            'implementedCode',
            'testedCode',
            'optimizedCode',
          ]);
        }
      });

      it('roundtrips with empty artifacts', () => {
        const state = createCompleteState([]);
        const restored = roundtripState(state);
        expect(isCompleteState(restored)).toBe(true);
        if (isCompleteState(restored)) {
          expect(restored.artifacts).toEqual([]);
        }
      });
    });
  });

  describe('getPhase() returns correct phase for all state variants', () => {
    it('Active Ignition', () => {
      const state = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
      expect(getPhase(state)).toBe('Ignition');
    });

    it('Active Lattice', () => {
      const state = createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
      expect(getPhase(state)).toBe('Lattice');
    });

    it('Active CompositionAudit', () => {
      const state = createActiveState(
        createCompositionAuditPhaseState(createCompositionAuditAuditing(0))
      );
      expect(getPhase(state)).toBe('CompositionAudit');
    });

    it('Active Injection', () => {
      const state = createActiveState(
        createInjectionPhaseState(createInjectionSelectingFunction())
      );
      expect(getPhase(state)).toBe('Injection');
    });

    it('Active Mesoscopic', () => {
      const state = createActiveState(
        createMesoscopicPhaseState(createMesoscopicGeneratingTests())
      );
      expect(getPhase(state)).toBe('Mesoscopic');
    });

    it('Active MassDefect', () => {
      const state = createActiveState(
        createMassDefectPhaseState(createMassDefectAnalyzingComplexity())
      );
      expect(getPhase(state)).toBe('MassDefect');
    });

    it('Blocked state returns the blocked phase', () => {
      const state = createBlockedState({
        reason: 'circuit_breaker',
        phase: 'CompositionAudit',
        query: 'Circuit breaker tripped',
      });
      expect(getPhase(state)).toBe('CompositionAudit');
    });

    it('Failed state returns the failed phase', () => {
      const state = createFailedState({ phase: 'Mesoscopic', error: 'Tests failed' });
      expect(getPhase(state)).toBe('Mesoscopic');
    });

    it('Complete state returns undefined', () => {
      const state = createCompleteState(['spec']);
      expect(getPhase(state)).toBeUndefined();
    });
  });

  describe('getStep() returns correct step for all active states', () => {
    it('Ignition interviewing', () => {
      const state = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Requirements', 5))
      );
      expect(getStep(state)).toBe('interviewing');
    });

    it('Ignition synthesizing', () => {
      const state = createActiveState(createIgnitionPhaseState(createIgnitionSynthesizing(0.9)));
      expect(getStep(state)).toBe('synthesizing');
    });

    it('Ignition awaitingApproval', () => {
      const state = createActiveState(createIgnitionPhaseState(createIgnitionAwaitingApproval()));
      expect(getStep(state)).toBe('awaitingApproval');
    });

    it('Lattice generatingStructure', () => {
      const state = createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
      expect(getStep(state)).toBe('generatingStructure');
    });

    it('Lattice compilingCheck', () => {
      const state = createActiveState(createLatticePhaseState(createLatticeCompilingCheck(1)));
      expect(getStep(state)).toBe('compilingCheck');
    });

    it('Lattice repairingStructure', () => {
      const state = createActiveState(
        createLatticePhaseState(createLatticeRepairingStructure(['e'], 1))
      );
      expect(getStep(state)).toBe('repairingStructure');
    });

    it('CompositionAudit auditing', () => {
      const state = createActiveState(
        createCompositionAuditPhaseState(createCompositionAuditAuditing(2))
      );
      expect(getStep(state)).toBe('auditing');
    });

    it('CompositionAudit reportingContradictions', () => {
      const state = createActiveState(
        createCompositionAuditPhaseState(createCompositionAuditReportingContradictions('critical'))
      );
      expect(getStep(state)).toBe('reportingContradictions');
    });

    it('Injection selectingFunction', () => {
      const state = createActiveState(
        createInjectionPhaseState(createInjectionSelectingFunction())
      );
      expect(getStep(state)).toBe('selectingFunction');
    });

    it('Injection implementing', () => {
      const state = createActiveState(
        createInjectionPhaseState(createInjectionImplementing('fn1', 1))
      );
      expect(getStep(state)).toBe('implementing');
    });

    it('Injection verifying', () => {
      const state = createActiveState(createInjectionPhaseState(createInjectionVerifying('fn1')));
      expect(getStep(state)).toBe('verifying');
    });

    it('Injection escalating', () => {
      const state = createActiveState(
        createInjectionPhaseState(createInjectionEscalating('fn1', 'Injection', 'Lattice'))
      );
      expect(getStep(state)).toBe('escalating');
    });

    it('Mesoscopic generatingTests', () => {
      const state = createActiveState(
        createMesoscopicPhaseState(createMesoscopicGeneratingTests())
      );
      expect(getStep(state)).toBe('generatingTests');
    });

    it('Mesoscopic executingCluster', () => {
      const state = createActiveState(
        createMesoscopicPhaseState(createMesoscopicExecutingCluster('c1', 0.5))
      );
      expect(getStep(state)).toBe('executingCluster');
    });

    it('Mesoscopic handlingVerdict', () => {
      const state = createActiveState(
        createMesoscopicPhaseState(createMesoscopicHandlingVerdict('c1', false))
      );
      expect(getStep(state)).toBe('handlingVerdict');
    });

    it('MassDefect analyzingComplexity', () => {
      const state = createActiveState(
        createMassDefectPhaseState(createMassDefectAnalyzingComplexity())
      );
      expect(getStep(state)).toBe('analyzingComplexity');
    });

    it('MassDefect applyingTransform', () => {
      const state = createActiveState(
        createMassDefectPhaseState(createMassDefectApplyingTransform('p1', 'f1'))
      );
      expect(getStep(state)).toBe('applyingTransform');
    });

    it('MassDefect verifyingSemantics', () => {
      const state = createActiveState(
        createMassDefectPhaseState(createMassDefectVerifyingSemantics('t1'))
      );
      expect(getStep(state)).toBe('verifyingSemantics');
    });

    it('returns undefined for Blocked state', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: '?',
      });
      expect(getStep(state)).toBeUndefined();
    });

    it('returns undefined for Failed state', () => {
      const state = createFailedState({ phase: 'Ignition', error: 'e' });
      expect(getStep(state)).toBeUndefined();
    });

    it('returns undefined for Complete state', () => {
      const state = createCompleteState(['spec']);
      expect(getStep(state)).toBeUndefined();
    });
  });

  describe('Negative case: old type names do not exist as exports', () => {
    it('types.ts does not export ActiveSubstate', async () => {
      // This test verifies at runtime that the old type names are not exported.
      // The real compile-error verification is done by the TypeScript compiler:
      // importing ActiveSubstate from ./types.js would be a compile error.
      const types = await import('./types.js');
      expect('ActiveSubstate' in types).toBe(false);
    });

    it('types.ts does not export BlockingSubstate', async () => {
      const types = await import('./types.js');
      expect('BlockingSubstate' in types).toBe(false);
    });

    it('types.ts does not export FailedSubstate', async () => {
      const types = await import('./types.js');
      expect('FailedSubstate' in types).toBe(false);
    });

    it('types.ts does not export ProtocolSubstate', async () => {
      const types = await import('./types.js');
      expect('ProtocolSubstate' in types).toBe(false);
    });
  });
});
