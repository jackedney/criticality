/**
 * Tests for Protocol State Types - 3-tier type system.
 */

import { describe, it, expect } from 'vitest';
import type {
  ProtocolState,
  ActiveState,
  IgnitionSubState,
  LatticeSubState,
  CompositionAuditSubState,
  InjectionSubState,
  MesoscopicSubState,
  MassDefectSubState,
  BlockReason,
} from './types.js';
import {
  createActiveState,
  createBlockedState,
  createFailedState,
  createCompleteState,
  createIgnitionInterviewing,
  createIgnitionSynthesizing,
  createIgnitionAwaitingApproval,
  createLatticeGeneratingStructure,
  createLatticeCompilingCheck,
  createLatticeRepairingStructure,
  createCompositionAuditAuditing,
  createCompositionAuditReportingContradictions,
  createInjectionSelectingFunction,
  createInjectionImplementing,
  createInjectionVerifying,
  createInjectionEscalating,
  createMesoscopicGeneratingTests,
  createMesoscopicExecutingCluster,
  createMesoscopicHandlingVerdict,
  createMassDefectAnalyzingComplexity,
  createMassDefectApplyingTransform,
  createMassDefectVerifyingSemantics,
  createIgnitionPhaseState,
  createLatticePhaseState,
  createCompositionAuditPhaseState,
  createInjectionPhaseState,
  createMesoscopicPhaseState,
  createMassDefectPhaseState,
  isActiveState,
  isBlockedState,
  isFailedState,
  isCompleteState,
  isIgnitionPhaseState,
  isLatticePhaseState,
  isCompositionAuditPhaseState,
  isInjectionPhaseState,
  isMesoscopicPhaseState,
  isMassDefectPhaseState,
  isIgnitionInterviewing,
  isIgnitionSynthesizing,
  isIgnitionAwaitingApproval,
  isLatticeGeneratingStructure,
  isLatticeCompilingCheck,
  isLatticeRepairingStructure,
  isCompositionAuditAuditing,
  isCompositionAuditReportingContradictions,
  isInjectionSelectingFunction,
  isInjectionImplementing,
  isInjectionVerifying,
  isInjectionEscalating,
  isMesoscopicGeneratingTests,
  isMesoscopicExecutingCluster,
  isMesoscopicHandlingVerdict,
  isMassDefectAnalyzingComplexity,
  isMassDefectApplyingTransform,
  isMassDefectVerifyingSemantics,
  getPhase,
  getStep,
  isTerminalState,
  canTransition,
  PROTOCOL_PHASES,
  isValidPhase,
  getPhaseIndex,
} from './types.js';

describe('Protocol State Types', () => {
  describe('PROTOCOL_PHASES', () => {
    it('contains all required phases in execution order', () => {
      expect(PROTOCOL_PHASES).toEqual([
        'Ignition',
        'Lattice',
        'CompositionAudit',
        'Injection',
        'Mesoscopic',
        'MassDefect',
        'Complete',
      ]);
    });

    it('has exactly 7 phases', () => {
      expect(PROTOCOL_PHASES).toHaveLength(7);
    });
  });

  describe('isValidPhase', () => {
    it('returns true for valid phases', () => {
      for (const phase of PROTOCOL_PHASES) {
        expect(isValidPhase(phase)).toBe(true);
      }
    });

    it('returns false for invalid phases', () => {
      expect(isValidPhase('InvalidPhase')).toBe(false);
      expect(isValidPhase('')).toBe(false);
      expect(isValidPhase('ignition')).toBe(false); // case sensitive
    });
  });

  describe('getPhaseIndex', () => {
    it('returns correct index for each phase', () => {
      expect(getPhaseIndex('Ignition')).toBe(0);
      expect(getPhaseIndex('Lattice')).toBe(1);
      expect(getPhaseIndex('CompositionAudit')).toBe(2);
      expect(getPhaseIndex('Injection')).toBe(3);
      expect(getPhaseIndex('Mesoscopic')).toBe(4);
      expect(getPhaseIndex('MassDefect')).toBe(5);
      expect(getPhaseIndex('Complete')).toBe(6);
    });
  });

  describe('Tier 3: IgnitionSubState', () => {
    it('creates interviewing substate with interviewPhase and questionIndex', () => {
      const substate = createIgnitionInterviewing('Discovery', 5);
      expect(substate.step).toBe('interviewing');
      expect(substate.interviewPhase).toBe('Discovery');
      expect(substate.questionIndex).toBe(5);
    });

    it('creates synthesizing substate with progress', () => {
      const substate = createIgnitionSynthesizing(0.75);
      expect(substate.step).toBe('synthesizing');
      expect(substate.progress).toBe(0.75);
    });

    it('creates awaitingApproval substate', () => {
      const substate = createIgnitionAwaitingApproval();
      expect(substate.step).toBe('awaitingApproval');
    });

    it('type guards correctly identify IgnitionSubState steps', () => {
      const interviewing = createIgnitionInterviewing('Requirements', 3);
      const synthesizing = createIgnitionSynthesizing(0.5);
      const awaiting = createIgnitionAwaitingApproval();

      expect(isIgnitionInterviewing(interviewing)).toBe(true);
      expect(isIgnitionSynthesizing(interviewing)).toBe(false);
      expect(isIgnitionAwaitingApproval(interviewing)).toBe(false);

      expect(isIgnitionInterviewing(synthesizing)).toBe(false);
      expect(isIgnitionSynthesizing(synthesizing)).toBe(true);
      expect(isIgnitionAwaitingApproval(synthesizing)).toBe(false);

      expect(isIgnitionInterviewing(awaiting)).toBe(false);
      expect(isIgnitionSynthesizing(awaiting)).toBe(false);
      expect(isIgnitionAwaitingApproval(awaiting)).toBe(true);
    });
  });

  describe('Tier 3: LatticeSubState', () => {
    it('creates generatingStructure substate without currentModule', () => {
      const substate = createLatticeGeneratingStructure();
      expect(substate.step).toBe('generatingStructure');
      expect(substate.currentModule).toBeUndefined();
    });

    it('creates generatingStructure substate with currentModule', () => {
      const substate = createLatticeGeneratingStructure('module-1');
      expect(substate.step).toBe('generatingStructure');
      expect(substate.currentModule).toBe('module-1');
    });

    it('creates compilingCheck substate with attempt', () => {
      const substate = createLatticeCompilingCheck(3);
      expect(substate.step).toBe('compilingCheck');
      expect(substate.attempt).toBe(3);
    });

    it('creates repairingStructure substate with errors and repairAttempt', () => {
      const substate = createLatticeRepairingStructure(['error1', 'error2'], 2);
      expect(substate.step).toBe('repairingStructure');
      expect(substate.errors).toEqual(['error1', 'error2']);
      expect(substate.repairAttempt).toBe(2);
    });

    it('type guards correctly identify LatticeSubState steps', () => {
      const generating = createLatticeGeneratingStructure('module-1');
      const compiling = createLatticeCompilingCheck(2);
      const repairing = createLatticeRepairingStructure(['error'], 1);

      expect(isLatticeGeneratingStructure(generating)).toBe(true);
      expect(isLatticeCompilingCheck(generating)).toBe(false);
      expect(isLatticeRepairingStructure(generating)).toBe(false);

      expect(isLatticeGeneratingStructure(compiling)).toBe(false);
      expect(isLatticeCompilingCheck(compiling)).toBe(true);
      expect(isLatticeRepairingStructure(compiling)).toBe(false);

      expect(isLatticeGeneratingStructure(repairing)).toBe(false);
      expect(isLatticeCompilingCheck(repairing)).toBe(false);
      expect(isLatticeRepairingStructure(repairing)).toBe(true);
    });
  });

  describe('Tier 3: CompositionAuditSubState', () => {
    it('creates auditing substate with auditorsCompleted', () => {
      const substate = createCompositionAuditAuditing(5);
      expect(substate.step).toBe('auditing');
      expect(substate.auditorsCompleted).toBe(5);
    });

    it('creates reportingContradictions substate with severity', () => {
      const substate = createCompositionAuditReportingContradictions('high');
      expect(substate.step).toBe('reportingContradictions');
      expect(substate.severity).toBe('high');
    });

    it('type guards correctly identify CompositionAuditSubState steps', () => {
      const auditing = createCompositionAuditAuditing(3);
      const reporting = createCompositionAuditReportingContradictions('medium');

      expect(isCompositionAuditAuditing(auditing)).toBe(true);
      expect(isCompositionAuditReportingContradictions(auditing)).toBe(false);

      expect(isCompositionAuditAuditing(reporting)).toBe(false);
      expect(isCompositionAuditReportingContradictions(reporting)).toBe(true);
    });
  });

  describe('Tier 3: InjectionSubState', () => {
    it('creates selectingFunction substate', () => {
      const substate = createInjectionSelectingFunction();
      expect(substate.step).toBe('selectingFunction');
    });

    it('creates implementing substate with functionId and attempt', () => {
      const substate = createInjectionImplementing('auth_login', 2);
      expect(substate.step).toBe('implementing');
      expect(substate.functionId).toBe('auth_login');
      expect(substate.attempt).toBe(2);
    });

    it('creates verifying substate with functionId', () => {
      const substate = createInjectionVerifying('auth_login');
      expect(substate.step).toBe('verifying');
      expect(substate.functionId).toBe('auth_login');
    });

    it('creates escalating substate with functionId, fromTier, toTier', () => {
      const substate = createInjectionEscalating('auth_login', 'Injection', 'Lattice');
      expect(substate.step).toBe('escalating');
      expect(substate.functionId).toBe('auth_login');
      expect(substate.fromTier).toBe('Injection');
      expect(substate.toTier).toBe('Lattice');
    });

    it('type guards correctly identify InjectionSubState steps', () => {
      const selecting = createInjectionSelectingFunction();
      const implementing = createInjectionImplementing('func1', 1);
      const verifying = createInjectionVerifying('func2');
      const escalating = createInjectionEscalating('func3', 'Injection', 'MassDefect');

      expect(isInjectionSelectingFunction(selecting)).toBe(true);
      expect(isInjectionImplementing(selecting)).toBe(false);
      expect(isInjectionVerifying(selecting)).toBe(false);
      expect(isInjectionEscalating(selecting)).toBe(false);

      expect(isInjectionSelectingFunction(implementing)).toBe(false);
      expect(isInjectionImplementing(implementing)).toBe(true);
      expect(isInjectionVerifying(implementing)).toBe(false);
      expect(isInjectionEscalating(implementing)).toBe(false);

      expect(isInjectionSelectingFunction(verifying)).toBe(false);
      expect(isInjectionImplementing(verifying)).toBe(false);
      expect(isInjectionVerifying(verifying)).toBe(true);
      expect(isInjectionEscalating(verifying)).toBe(false);

      expect(isInjectionSelectingFunction(escalating)).toBe(false);
      expect(isInjectionImplementing(escalating)).toBe(false);
      expect(isInjectionVerifying(escalating)).toBe(false);
      expect(isInjectionEscalating(escalating)).toBe(true);
    });
  });

  describe('Tier 3: MesoscopicSubState', () => {
    it('creates generatingTests substate without clusterId', () => {
      const substate = createMesoscopicGeneratingTests();
      expect(substate.step).toBe('generatingTests');
      expect(substate.clusterId).toBeUndefined();
    });

    it('creates generatingTests substate with clusterId', () => {
      const substate = createMesoscopicGeneratingTests('cluster-1');
      expect(substate.step).toBe('generatingTests');
      expect(substate.clusterId).toBe('cluster-1');
    });

    it('creates executingCluster substate with clusterId and progress', () => {
      const substate = createMesoscopicExecutingCluster('cluster-1', 0.6);
      expect(substate.step).toBe('executingCluster');
      expect(substate.clusterId).toBe('cluster-1');
      expect(substate.progress).toBe(0.6);
    });

    it('creates handlingVerdict substate with clusterId and passed', () => {
      const substate = createMesoscopicHandlingVerdict('cluster-1', true);
      expect(substate.step).toBe('handlingVerdict');
      expect(substate.clusterId).toBe('cluster-1');
      expect(substate.passed).toBe(true);
    });

    it('type guards correctly identify MesoscopicSubState steps', () => {
      const generating = createMesoscopicGeneratingTests('cluster-1');
      const executing = createMesoscopicExecutingCluster('cluster-2', 0.5);
      const handling = createMesoscopicHandlingVerdict('cluster-3', false);

      expect(isMesoscopicGeneratingTests(generating)).toBe(true);
      expect(isMesoscopicExecutingCluster(generating)).toBe(false);
      expect(isMesoscopicHandlingVerdict(generating)).toBe(false);

      expect(isMesoscopicGeneratingTests(executing)).toBe(false);
      expect(isMesoscopicExecutingCluster(executing)).toBe(true);
      expect(isMesoscopicHandlingVerdict(executing)).toBe(false);

      expect(isMesoscopicGeneratingTests(handling)).toBe(false);
      expect(isMesoscopicExecutingCluster(handling)).toBe(false);
      expect(isMesoscopicHandlingVerdict(handling)).toBe(true);
    });
  });

  describe('Tier 3: MassDefectSubState', () => {
    it('creates analyzingComplexity substate', () => {
      const substate = createMassDefectAnalyzingComplexity();
      expect(substate.step).toBe('analyzingComplexity');
    });

    it('creates applyingTransform substate with patternId and functionId', () => {
      const substate = createMassDefectApplyingTransform('pattern-1', 'func-1');
      expect(substate.step).toBe('applyingTransform');
      expect(substate.patternId).toBe('pattern-1');
      expect(substate.functionId).toBe('func-1');
    });

    it('creates verifyingSemantics substate with transformId', () => {
      const substate = createMassDefectVerifyingSemantics('transform-1');
      expect(substate.step).toBe('verifyingSemantics');
      expect(substate.transformId).toBe('transform-1');
    });

    it('type guards correctly identify MassDefectSubState steps', () => {
      const analyzing = createMassDefectAnalyzingComplexity();
      const applying = createMassDefectApplyingTransform('p1', 'f1');
      const verifying = createMassDefectVerifyingSemantics('t1');

      expect(isMassDefectAnalyzingComplexity(analyzing)).toBe(true);
      expect(isMassDefectApplyingTransform(analyzing)).toBe(false);
      expect(isMassDefectVerifyingSemantics(analyzing)).toBe(false);

      expect(isMassDefectAnalyzingComplexity(applying)).toBe(false);
      expect(isMassDefectApplyingTransform(applying)).toBe(true);
      expect(isMassDefectVerifyingSemantics(applying)).toBe(false);

      expect(isMassDefectAnalyzingComplexity(verifying)).toBe(false);
      expect(isMassDefectApplyingTransform(verifying)).toBe(false);
      expect(isMassDefectVerifyingSemantics(verifying)).toBe(true);
    });
  });

  describe('Tier 2: PhaseState factory functions', () => {
    it('creates Ignition PhaseState', () => {
      const substate = createIgnitionInterviewing('Discovery', 0);
      const phaseState = createIgnitionPhaseState(substate);
      expect(phaseState.phase).toBe('Ignition');
      expect(phaseState.substate).toBe(substate);
    });

    it('creates Lattice PhaseState', () => {
      const substate = createLatticeCompilingCheck(1);
      const phaseState = createLatticePhaseState(substate);
      expect(phaseState.phase).toBe('Lattice');
      expect(phaseState.substate).toBe(substate);
    });

    it('creates CompositionAudit PhaseState', () => {
      const substate = createCompositionAuditAuditing(3);
      const phaseState = createCompositionAuditPhaseState(substate);
      expect(phaseState.phase).toBe('CompositionAudit');
      expect(phaseState.substate).toBe(substate);
    });

    it('creates Injection PhaseState', () => {
      const substate = createInjectionImplementing('func1', 1);
      const phaseState = createInjectionPhaseState(substate);
      expect(phaseState.phase).toBe('Injection');
      expect(phaseState.substate).toBe(substate);
    });

    it('creates Mesoscopic PhaseState', () => {
      const substate = createMesoscopicExecutingCluster('c1', 0.5);
      const phaseState = createMesoscopicPhaseState(substate);
      expect(phaseState.phase).toBe('Mesoscopic');
      expect(phaseState.substate).toBe(substate);
    });

    it('creates MassDefect PhaseState', () => {
      const substate = createMassDefectApplyingTransform('p1', 'f1');
      const phaseState = createMassDefectPhaseState(substate);
      expect(phaseState.phase).toBe('MassDefect');
      expect(phaseState.substate).toBe(substate);
    });

    it('type guards correctly identify PhaseState variants', () => {
      const ignition = createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0));
      const lattice = createLatticePhaseState(createLatticeCompilingCheck(1));
      const composition = createCompositionAuditPhaseState(createCompositionAuditAuditing(3));
      const injection = createInjectionPhaseState(createInjectionImplementing('f1', 1));
      const mesoscopic = createMesoscopicPhaseState(createMesoscopicExecutingCluster('c1', 0.5));
      const massDefect = createMassDefectPhaseState(createMassDefectApplyingTransform('p1', 'f1'));

      expect(isIgnitionPhaseState(ignition)).toBe(true);
      expect(isLatticePhaseState(ignition)).toBe(false);

      expect(isLatticePhaseState(lattice)).toBe(true);
      expect(isIgnitionPhaseState(lattice)).toBe(false);

      expect(isCompositionAuditPhaseState(composition)).toBe(true);
      expect(isIgnitionPhaseState(composition)).toBe(false);

      expect(isInjectionPhaseState(injection)).toBe(true);
      expect(isIgnitionPhaseState(injection)).toBe(false);

      expect(isMesoscopicPhaseState(mesoscopic)).toBe(true);
      expect(isIgnitionPhaseState(mesoscopic)).toBe(false);

      expect(isMassDefectPhaseState(massDefect)).toBe(true);
      expect(isIgnitionPhaseState(massDefect)).toBe(false);
    });
  });

  describe('Tier 1: ActiveState', () => {
    it('creates ActiveState with PhaseState', () => {
      const phaseState = createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0));
      const activeState = createActiveState(phaseState);
      expect(activeState.kind).toBe('Active');
      expect(activeState.phase).toBe(phaseState);
    });

    it('type guard correctly identifies ActiveState', () => {
      const activeState = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: 'Approve?',
      });
      const failedState = createFailedState({ phase: 'Ignition', error: 'Error' });
      const completeState = createCompleteState(['spec']);

      expect(isActiveState(activeState)).toBe(true);
      expect(isActiveState(blockedState)).toBe(false);
      expect(isActiveState(failedState)).toBe(false);
      expect(isActiveState(completeState)).toBe(false);
    });
  });

  describe('Tier 1: BlockedState', () => {
    it('creates BlockedState with required fields', () => {
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: 'Approve?',
      });

      expect(blockedState.kind).toBe('Blocked');
      expect(blockedState.reason).toBe('user_requested');
      expect(blockedState.phase).toBe('Ignition');
      expect(blockedState.query).toBe('Approve?');
      expect(blockedState.blockedAt).toBeDefined();
      expect(blockedState.options).toBeUndefined();
      expect(blockedState.timeoutMs).toBeUndefined();
    });

    it('creates BlockedState with options and timeoutMs', () => {
      const blockedState = createBlockedState({
        reason: 'security_review',
        phase: 'Mesoscopic',
        query: 'Approve?',
        options: ['Yes', 'No'],
        timeoutMs: 600000,
      });

      expect(blockedState.options).toEqual(['Yes', 'No']);
      expect(blockedState.timeoutMs).toBe(600000);
    });

    it('accepts all BlockReason variants', () => {
      const reasons: BlockReason[] = [
        'canonical_conflict',
        'unresolved_contradiction',
        'circuit_breaker',
        'security_review',
        'user_requested',
      ];

      for (const reason of reasons) {
        const blockedState = createBlockedState({
          reason,
          phase: 'Ignition',
          query: 'Test?',
        });
        expect(blockedState.reason).toBe(reason);
      }
    });

    it('type guard correctly identifies BlockedState', () => {
      const activeState = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: 'Approve?',
      });

      expect(isBlockedState(activeState)).toBe(false);
      expect(isBlockedState(blockedState)).toBe(true);
    });
  });

  describe('Tier 1: FailedState', () => {
    it('creates FailedState with required fields', () => {
      const failedState = createFailedState({ phase: 'Ignition', error: 'Test error' });

      expect(failedState.kind).toBe('Failed');
      expect(failedState.phase).toBe('Ignition');
      expect(failedState.error).toBe('Test error');
      expect(failedState.failedAt).toBeDefined();
      expect(failedState.recoverable).toBe(false);
      expect(failedState.code).toBeUndefined();
      expect(failedState.context).toBeUndefined();
    });

    it('creates FailedState with all optional fields', () => {
      const failedState = createFailedState({
        phase: 'MassDefect',
        error: 'Fatal error',
        code: 'FATAL_ERROR',
        recoverable: true,
        context: 'Additional context',
      });

      expect(failedState.code).toBe('FATAL_ERROR');
      expect(failedState.recoverable).toBe(true);
      expect(failedState.context).toBe('Additional context');
    });

    it('type guard correctly identifies FailedState', () => {
      const activeState = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
      const failedState = createFailedState({ phase: 'Ignition', error: 'Error' });

      expect(isFailedState(activeState)).toBe(false);
      expect(isFailedState(failedState)).toBe(true);
    });
  });

  describe('Tier 1: CompleteState', () => {
    it('creates CompleteState with artifacts', () => {
      const completeState = createCompleteState(['spec', 'code', 'tests']);

      expect(completeState.kind).toBe('Complete');
      expect(completeState.artifacts).toEqual(['spec', 'code', 'tests']);
    });

    it('type guard correctly identifies CompleteState', () => {
      const activeState = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
      const completeState = createCompleteState(['spec']);

      expect(isCompleteState(activeState)).toBe(false);
      expect(isCompleteState(completeState)).toBe(true);
    });
  });

  describe('ProtocolState union', () => {
    it('discriminant field correctly narrows type', () => {
      const states: ProtocolState[] = [
        createActiveState(createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))),
        createBlockedState({ reason: 'user_requested', phase: 'Ignition', query: 'Approve?' }),
        createFailedState({ phase: 'Ignition', error: 'Error' }),
        createCompleteState(['spec']),
      ];

      for (const state of states) {
        switch (state.kind) {
          case 'Active':
            expect(state.phase).toBeDefined();
            break;
          case 'Blocked':
            expect(state.reason).toBeDefined();
            expect(state.query).toBeDefined();
            break;
          case 'Failed':
            expect(state.error).toBeDefined();
            break;
          case 'Complete':
            expect(state.artifacts).toBeDefined();
            break;
        }
      }
    });
  });

  describe('Helper functions', () => {
    describe('getPhase', () => {
      it('extracts phase from ActiveState', () => {
        const state = createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
        expect(getPhase(state)).toBe('Ignition');
      });

      it('extracts phase from BlockedState', () => {
        const state = createBlockedState({
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve?',
        });
        expect(getPhase(state)).toBe('Lattice');
      });

      it('extracts phase from FailedState', () => {
        const state = createFailedState({ phase: 'Injection', error: 'Error' });
        expect(getPhase(state)).toBe('Injection');
      });

      it('returns undefined for CompleteState', () => {
        const state = createCompleteState(['spec']);
        expect(getPhase(state)).toBeUndefined();
      });
    });

    describe('getStep', () => {
      it('extracts step from ActiveState', () => {
        const state = createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
        expect(getStep(state)).toBe('interviewing');
      });

      it('returns undefined for non-active states', () => {
        expect(
          getStep(createBlockedState({ reason: 'user_requested', phase: 'Ignition', query: '?' }))
        ).toBeUndefined();
        expect(getStep(createFailedState({ phase: 'Ignition', error: 'e' }))).toBeUndefined();
        expect(getStep(createCompleteState(['spec']))).toBeUndefined();
      });
    });

    describe('isTerminalState', () => {
      it('returns true for CompleteState and FailedState', () => {
        expect(isTerminalState(createCompleteState(['spec']))).toBe(true);
        expect(isTerminalState(createFailedState({ phase: 'Ignition', error: 'e' }))).toBe(true);
      });

      it('returns false for ActiveState and BlockedState', () => {
        expect(
          isTerminalState(
            createActiveState(createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0)))
          )
        ).toBe(false);
        expect(
          isTerminalState(
            createBlockedState({ reason: 'user_requested', phase: 'Ignition', query: '?' })
          )
        ).toBe(false);
      });
    });

    describe('canTransition', () => {
      it('returns true for ActiveState', () => {
        const state = createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        );
        expect(canTransition(state)).toBe(true);
      });

      it('returns false for non-active states', () => {
        expect(
          canTransition(
            createBlockedState({ reason: 'user_requested', phase: 'Ignition', query: '?' })
          )
        ).toBe(false);
        expect(canTransition(createFailedState({ phase: 'Ignition', error: 'e' }))).toBe(false);
        expect(canTransition(createCompleteState(['spec']))).toBe(false);
      });
    });
  });

  describe('Readonly enforcement (compile-time)', () => {
    it('ActiveState properties are readonly at compile time', () => {
      const state = createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );

      // @ts-expect-error - Cannot assign to 'kind' because it is a read-only property
      state.kind = 'Blocked';

      // @ts-expect-error - Cannot assign to 'phase' because it is a read-only property
      state.phase = createLatticePhaseState(createLatticeCompilingCheck(1));

      expect(true).toBe(true);
    });

    it('BlockedState properties are readonly at compile time', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: 'Approve?',
      });

      // @ts-expect-error - Cannot assign to 'query' because it is a read-only property
      state.query = 'New query?';

      expect(true).toBe(true);
    });

    it('FailedState properties are readonly at compile time', () => {
      const state = createFailedState({ phase: 'Ignition', error: 'Error' });

      // @ts-expect-error - Cannot assign to 'error' because it is a read-only property
      state.error = 'New error';

      expect(true).toBe(true);
    });

    it('CompleteState properties are readonly at compile time', () => {
      const state = createCompleteState(['spec']);

      // @ts-expect-error - Cannot assign to 'artifacts' because it is a read-only property
      state.artifacts = ['code'];

      expect(true).toBe(true);
    });

    it('PhaseState properties are readonly at compile time', () => {
      const phaseState = createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0));

      // @ts-expect-error - Cannot assign to 'phase' because it is a read-only property
      phaseState.phase = 'Lattice';

      expect(true).toBe(true);
    });

    it('SubState properties are readonly at compile time', () => {
      const substate = createIgnitionInterviewing('Discovery', 0);

      // @ts-expect-error - Cannot assign to 'questionIndex' because it is a read-only property
      substate.questionIndex = 5;

      expect(true).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('creates ActiveState for all phase variants', () => {
      const states: ActiveState[] = [
        createActiveState(createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))),
        createActiveState(createLatticePhaseState(createLatticeCompilingCheck(1))),
        createActiveState(createCompositionAuditPhaseState(createCompositionAuditAuditing(3))),
        createActiveState(createInjectionPhaseState(createInjectionImplementing('f1', 1))),
        createActiveState(createMesoscopicPhaseState(createMesoscopicExecutingCluster('c1', 0.5))),
        createActiveState(
          createMassDefectPhaseState(createMassDefectApplyingTransform('p1', 'f1'))
        ),
      ];

      expect(states).toHaveLength(6);
      expect(states.every(isActiveState)).toBe(true);
    });

    it('creates all substate steps for each phase', () => {
      const ignitionSubStates: IgnitionSubState[] = [
        createIgnitionInterviewing('Discovery', 0),
        createIgnitionSynthesizing(0.5),
        createIgnitionAwaitingApproval(),
      ];

      const latticeSubStates: LatticeSubState[] = [
        createLatticeGeneratingStructure(),
        createLatticeGeneratingStructure('module-1'),
        createLatticeCompilingCheck(1),
        createLatticeRepairingStructure(['error'], 1),
      ];

      const compositionSubStates: CompositionAuditSubState[] = [
        createCompositionAuditAuditing(3),
        createCompositionAuditReportingContradictions('high'),
      ];

      const injectionSubStates: InjectionSubState[] = [
        createInjectionSelectingFunction(),
        createInjectionImplementing('f1', 1),
        createInjectionVerifying('f2'),
        createInjectionEscalating('f3', 'Injection', 'Lattice'),
      ];

      const mesoscopicSubStates: MesoscopicSubState[] = [
        createMesoscopicGeneratingTests(),
        createMesoscopicGeneratingTests('c1'),
        createMesoscopicExecutingCluster('c2', 0.5),
        createMesoscopicHandlingVerdict('c3', true),
      ];

      const massDefectSubStates: MassDefectSubState[] = [
        createMassDefectAnalyzingComplexity(),
        createMassDefectApplyingTransform('p1', 'f1'),
        createMassDefectVerifyingSemantics('t1'),
      ];

      expect(ignitionSubStates).toHaveLength(3);
      expect(latticeSubStates).toHaveLength(4);
      expect(compositionSubStates).toHaveLength(2);
      expect(injectionSubStates).toHaveLength(4);
      expect(mesoscopicSubStates).toHaveLength(4);
      expect(massDefectSubStates).toHaveLength(3);
    });

    it('handles zero and negative values correctly', () => {
      expect(createIgnitionSynthesizing(0).progress).toBe(0);
      expect(createIgnitionInterviewing('Discovery', 0).questionIndex).toBe(0);
      expect(createLatticeCompilingCheck(0).attempt).toBe(0);
      expect(createIgnitionInterviewing('Discovery', -1).questionIndex).toBe(-1);
    });

    it('handles empty and single-element arrays', () => {
      expect(createLatticeRepairingStructure([], 1).errors).toEqual([]);
      expect(createLatticeRepairingStructure(['error1'], 1).errors).toEqual(['error1']);
      expect(createCompleteState([]).artifacts).toEqual([]);
      expect(createCompleteState(['spec']).artifacts).toEqual(['spec']);
    });

    it('creates BlockedState with empty options array', () => {
      const state = createBlockedState({
        reason: 'user_requested',
        phase: 'Ignition',
        query: 'Approve?',
        options: [],
      });
      expect(state.options).toEqual([]);
    });
  });

  describe('Example: createActiveState with PhaseState (acceptance criteria)', () => {
    it('creates valid ActiveState with Ignition interviewing substate', () => {
      const phaseState = {
        phase: 'Ignition' as const,
        substate: {
          step: 'interviewing' as const,
          interviewPhase: 'Discovery' as const,
          questionIndex: 0,
        },
      };
      const activeState = createActiveState(phaseState);

      expect(isActiveState(activeState)).toBe(true);
      expect(activeState.kind).toBe('Active');
      expect(activeState.phase.phase).toBe('Ignition');
      expect(activeState.phase.substate.step).toBe('interviewing');
    });
  });

  describe('Example: createActiveState with Injection implementing substate', () => {
    it('creates valid ActiveState with Injection implementing substate', () => {
      const phaseState = {
        phase: 'Injection' as const,
        substate: {
          step: 'implementing' as const,
          functionId: 'auth_login',
          attempt: 3,
        },
      };
      const activeState = createActiveState(phaseState);

      expect(isActiveState(activeState)).toBe(true);
      expect(activeState.phase.phase).toBe('Injection');
      const implementing = activeState.phase.substate as Extract<
        InjectionSubState,
        { step: 'implementing' }
      >;
      expect(implementing.functionId).toBe('auth_login');
      expect(implementing.attempt).toBe(3);
    });
  });
});
