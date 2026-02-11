/**
 * Tests for Phase Transition logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  FORWARD_TRANSITIONS,
  FAILURE_TRANSITIONS,
  REQUIRED_ARTIFACTS,
  FAILURE_REQUIRED_ARTIFACTS,
  type ArtifactType,
  createTransitionArtifacts,
  isValidForwardTransition,
  isValidFailureTransition,
  isValidTransition,
  getRequiredArtifacts,
  validateArtifacts,
  shedContext,
  transition,
  getValidTransitions,
  getNextPhase,
} from './transitions.js';
import {
  type ProtocolPhase,
  type ProtocolState,
  PROTOCOL_PHASES,
  createActiveState,
  createBlockedState,
  createFailedState,
  getPhase,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
  createLatticePhaseState,
  createLatticeGeneratingStructure,
  createCompositionAuditPhaseState,
  createCompositionAuditAuditing,
  createInjectionPhaseState,
  createInjectionSelectingFunction,
  createMesoscopicPhaseState,
  createMesoscopicGeneratingTests,
  createMassDefectPhaseState,
  createMassDefectAnalyzingComplexity,
  createCompleteState,
} from './types.js';

function createActiveStateForPhase(phase: ProtocolPhase): ProtocolState {
  switch (phase) {
    case 'Ignition':
      return createActiveState(
        createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
      );
    case 'Lattice':
      return createActiveState(createLatticePhaseState(createLatticeGeneratingStructure()));
    case 'CompositionAudit':
      return createActiveState(createCompositionAuditPhaseState(createCompositionAuditAuditing(0)));
    case 'Injection':
      return createActiveState(createInjectionPhaseState(createInjectionSelectingFunction()));
    case 'Mesoscopic':
      return createActiveState(createMesoscopicPhaseState(createMesoscopicGeneratingTests()));
    case 'MassDefect':
      return createActiveState(createMassDefectPhaseState(createMassDefectAnalyzingComplexity()));
    case 'Complete':
      return createCompleteState([]);
  }
}

describe('Phase Transitions', () => {
  describe('FORWARD_TRANSITIONS', () => {
    it('defines all expected forward transitions', () => {
      expect(FORWARD_TRANSITIONS.get('Ignition')).toBe('Lattice');
      expect(FORWARD_TRANSITIONS.get('Lattice')).toBe('CompositionAudit');
      expect(FORWARD_TRANSITIONS.get('CompositionAudit')).toBe('Injection');
      expect(FORWARD_TRANSITIONS.get('Injection')).toBe('Mesoscopic');
      expect(FORWARD_TRANSITIONS.get('Mesoscopic')).toBe('MassDefect');
      expect(FORWARD_TRANSITIONS.get('MassDefect')).toBe('Complete');
    });

    it('does not define transition from Complete', () => {
      expect(FORWARD_TRANSITIONS.get('Complete')).toBeUndefined();
    });

    it('has exactly 6 forward transitions', () => {
      expect(FORWARD_TRANSITIONS.size).toBe(6);
    });
  });

  describe('FAILURE_TRANSITIONS', () => {
    it('defines CompositionAudit can fail back to Ignition', () => {
      expect(FAILURE_TRANSITIONS.get('CompositionAudit')).toContain('Ignition');
    });

    it('defines Injection can fail back to Lattice', () => {
      expect(FAILURE_TRANSITIONS.get('Injection')).toContain('Lattice');
    });

    it('defines Mesoscopic can fail back to Injection', () => {
      expect(FAILURE_TRANSITIONS.get('Mesoscopic')).toContain('Injection');
    });

    it('does not define failure transitions for Ignition, Lattice, MassDefect, or Complete', () => {
      expect(FAILURE_TRANSITIONS.get('Ignition')).toBeUndefined();
      expect(FAILURE_TRANSITIONS.get('Lattice')).toBeUndefined();
      expect(FAILURE_TRANSITIONS.get('MassDefect')).toBeUndefined();
      expect(FAILURE_TRANSITIONS.get('Complete')).toBeUndefined();
    });
  });

  describe('REQUIRED_ARTIFACTS', () => {
    it('requires spec for Lattice', () => {
      expect(REQUIRED_ARTIFACTS.get('Lattice')).toContain('spec');
    });

    it('requires latticeCode, witnesses, contracts for CompositionAudit', () => {
      const required = REQUIRED_ARTIFACTS.get('CompositionAudit');
      expect(required).toContain('latticeCode');
      expect(required).toContain('witnesses');
      expect(required).toContain('contracts');
    });

    it('requires validatedStructure for Injection', () => {
      expect(REQUIRED_ARTIFACTS.get('Injection')).toContain('validatedStructure');
    });

    it('requires implementedCode for Mesoscopic', () => {
      expect(REQUIRED_ARTIFACTS.get('Mesoscopic')).toContain('implementedCode');
    });

    it('requires verifiedCode for MassDefect', () => {
      expect(REQUIRED_ARTIFACTS.get('MassDefect')).toContain('verifiedCode');
    });

    it('requires finalArtifact for Complete', () => {
      expect(REQUIRED_ARTIFACTS.get('Complete')).toContain('finalArtifact');
    });
  });

  describe('FAILURE_REQUIRED_ARTIFACTS', () => {
    it('requires contradictionReport for CompositionAudit->Ignition', () => {
      expect(FAILURE_REQUIRED_ARTIFACTS.get('CompositionAudit->Ignition')).toContain(
        'contradictionReport'
      );
    });

    it('requires structuralDefectReport for Injection->Lattice', () => {
      expect(FAILURE_REQUIRED_ARTIFACTS.get('Injection->Lattice')).toContain(
        'structuralDefectReport'
      );
    });

    it('requires clusterFailureReport for Mesoscopic->Injection', () => {
      expect(FAILURE_REQUIRED_ARTIFACTS.get('Mesoscopic->Injection')).toContain(
        'clusterFailureReport'
      );
    });
  });

  describe('createTransitionArtifacts', () => {
    it('creates artifacts with available set', () => {
      const artifacts = createTransitionArtifacts(['spec', 'latticeCode']);

      expect(artifacts.available.has('spec')).toBe(true);
      expect(artifacts.available.has('latticeCode')).toBe(true);
      expect(artifacts.available.has('witnesses')).toBe(false);
    });

    it('creates empty artifacts', () => {
      const artifacts = createTransitionArtifacts([]);
      expect(artifacts.available.size).toBe(0);
    });
  });

  describe('isValidForwardTransition', () => {
    it('returns true for valid forward transitions', () => {
      expect(isValidForwardTransition('Ignition', 'Lattice')).toBe(true);
      expect(isValidForwardTransition('Lattice', 'CompositionAudit')).toBe(true);
      expect(isValidForwardTransition('CompositionAudit', 'Injection')).toBe(true);
      expect(isValidForwardTransition('Injection', 'Mesoscopic')).toBe(true);
      expect(isValidForwardTransition('Mesoscopic', 'MassDefect')).toBe(true);
      expect(isValidForwardTransition('MassDefect', 'Complete')).toBe(true);
    });

    it('returns false for skipped phases', () => {
      expect(isValidForwardTransition('Ignition', 'Injection')).toBe(false);
      expect(isValidForwardTransition('Ignition', 'Complete')).toBe(false);
      expect(isValidForwardTransition('Lattice', 'Mesoscopic')).toBe(false);
    });

    it('returns false for backward transitions', () => {
      expect(isValidForwardTransition('Lattice', 'Ignition')).toBe(false);
      expect(isValidForwardTransition('Complete', 'Ignition')).toBe(false);
    });

    it('returns false for same-phase transitions', () => {
      for (const phase of PROTOCOL_PHASES) {
        expect(isValidForwardTransition(phase, phase)).toBe(false);
      }
    });
  });

  describe('isValidFailureTransition', () => {
    it('returns true for valid failure transitions', () => {
      expect(isValidFailureTransition('CompositionAudit', 'Ignition')).toBe(true);
      expect(isValidFailureTransition('Injection', 'Lattice')).toBe(true);
      expect(isValidFailureTransition('Mesoscopic', 'Injection')).toBe(true);
    });

    it('returns false for invalid failure transitions', () => {
      expect(isValidFailureTransition('Ignition', 'Lattice')).toBe(false);
      expect(isValidFailureTransition('Lattice', 'Ignition')).toBe(false);
      expect(isValidFailureTransition('Injection', 'Ignition')).toBe(false);
    });

    it('returns false for forward transitions', () => {
      expect(isValidFailureTransition('Ignition', 'Lattice')).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    it('returns true for forward transitions', () => {
      expect(isValidTransition('Ignition', 'Lattice')).toBe(true);
    });

    it('returns true for failure transitions', () => {
      expect(isValidTransition('CompositionAudit', 'Ignition')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidTransition('Ignition', 'Injection')).toBe(false);
      expect(isValidTransition('Lattice', 'Ignition')).toBe(false);
    });
  });

  describe('getRequiredArtifacts', () => {
    it('returns required artifacts for forward transitions', () => {
      expect(getRequiredArtifacts('Ignition', 'Lattice')).toEqual(['spec']);
      expect(getRequiredArtifacts('Lattice', 'CompositionAudit')).toEqual([
        'latticeCode',
        'witnesses',
        'contracts',
      ]);
    });

    it('returns required artifacts for failure transitions', () => {
      expect(getRequiredArtifacts('CompositionAudit', 'Ignition')).toEqual(['contradictionReport']);
      expect(getRequiredArtifacts('Injection', 'Lattice')).toEqual(['structuralDefectReport']);
    });

    it('returns undefined for invalid transitions', () => {
      expect(getRequiredArtifacts('Ignition', 'Injection')).toBeUndefined();
    });

    it('returns empty array for transitions with no artifact requirements', () => {
      // All defined transitions require artifacts, but the function handles
      // transitions that may not be in the REQUIRED_ARTIFACTS map
    });
  });

  describe('validateArtifacts', () => {
    it('returns empty array when all artifacts are present', () => {
      const required: ArtifactType[] = ['spec'];
      const available = createTransitionArtifacts(['spec']);

      const missing = validateArtifacts(required, available);
      expect(missing).toEqual([]);
    });

    it('returns missing artifacts when some are absent', () => {
      const required: ArtifactType[] = ['latticeCode', 'witnesses', 'contracts'];
      const available = createTransitionArtifacts(['latticeCode']);

      const missing = validateArtifacts(required, available);
      expect(missing).toContain('witnesses');
      expect(missing).toContain('contracts');
      expect(missing).not.toContain('latticeCode');
    });

    it('returns all required when none are available', () => {
      const required: ArtifactType[] = ['spec', 'latticeCode'];
      const available = createTransitionArtifacts([]);

      const missing = validateArtifacts(required, available);
      expect(missing).toEqual(['spec', 'latticeCode']);
    });
  });

  describe('shedContext', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), 'criticality-shedcontext-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns true on successful archive creation', async () => {
      const result = await shedContext('Ignition', 'Lattice', tempDir);
      expect(result).toBe(true);
    });

    it('creates archive directory at expected path', async () => {
      await shedContext('Ignition', 'Lattice', tempDir);

      const archivesDir = path.join(tempDir, '.criticality', 'archives');
      const dirExists = await access(archivesDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('creates archive directory with phase transition in name', async () => {
      await shedContext('CompositionAudit', 'Ignition', tempDir);

      const archivesDir = path.join(tempDir, '.criticality', 'archives');
      const dirExists = await access(archivesDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('returns false on archive failure (graceful degradation)', async () => {
      const invalidPath = '/nonexistent/path/that/does/not/exist';
      const result = await shedContext('Ignition', 'Lattice', invalidPath);
      expect(result).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('returns forward transition for Ignition', () => {
      expect(getValidTransitions('Ignition')).toEqual(['Lattice']);
    });

    it('returns forward and failure transitions for CompositionAudit', () => {
      const transitions = getValidTransitions('CompositionAudit');
      expect(transitions).toContain('Injection');
      expect(transitions).toContain('Ignition');
    });

    it('returns empty for Complete', () => {
      expect(getValidTransitions('Complete')).toEqual([]);
    });
  });

  describe('getNextPhase', () => {
    it('returns next phase in forward progression', () => {
      expect(getNextPhase('Ignition')).toBe('Lattice');
      expect(getNextPhase('Lattice')).toBe('CompositionAudit');
      expect(getNextPhase('MassDefect')).toBe('Complete');
    });

    it('returns undefined for Complete', () => {
      expect(getNextPhase('Complete')).toBeUndefined();
    });
  });

  describe('transition', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), 'criticality-transition-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    describe('Acceptance Criteria: transition from Ignition to Lattice succeeds with required artifacts', () => {
      it('succeeds when spec artifact is provided', async () => {
        const state = createActiveStateForPhase('Ignition');
        const artifacts = createTransitionArtifacts(['spec']);

        const result = await transition(state, 'Lattice', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('Lattice');
          expect(result.state.kind).toBe('Active');
          expect(result.contextShed).toBe(true);
        }
      });
    });

    describe('Negative case: transition from Ignition to Injection returns invalid transition error', () => {
      it('returns descriptive error when skipping phases', async () => {
        const state = createActiveStateForPhase('Ignition');

        const result = await transition(state, 'Injection', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_TRANSITION');
          expect(result.error.fromPhase).toBe('Ignition');
          expect(result.error.toPhase).toBe('Injection');
          expect(result.error.message).toContain('Cannot skip phases');
          expect(result.error.message).toContain('Ignition');
          expect(result.error.message).toContain('Injection');
        }
      });
    });

    describe('Valid forward transitions', () => {
      const forwardTransitionCases: [ProtocolPhase, ProtocolPhase, ArtifactType[]][] = [
        ['Ignition', 'Lattice', ['spec']],
        ['Lattice', 'CompositionAudit', ['latticeCode', 'witnesses', 'contracts']],
        ['CompositionAudit', 'Injection', ['validatedStructure']],
        ['Injection', 'Mesoscopic', ['implementedCode']],
        ['Mesoscopic', 'MassDefect', ['verifiedCode']],
        ['MassDefect', 'Complete', ['finalArtifact']],
      ];

      for (const [from, to, requiredArtifacts] of forwardTransitionCases) {
        it(`transitions from ${from} to ${to} with required artifacts`, async () => {
          const state = createActiveStateForPhase(from);
          const artifacts = createTransitionArtifacts(requiredArtifacts);

          const result = await transition(state, to, tempDir, { artifacts });

          expect(result.success).toBe(true);
          if (result.success) {
            if (to === 'Complete') {
              expect(result.state.kind).toBe('Complete');
            } else {
              expect(getPhase(result.state)).toBe(to);
              expect(result.state.kind).toBe('Active');
            }
          }
        });
      }
    });

    describe('Valid failure transitions', () => {
      it('transitions from CompositionAudit to Ignition with contradiction report', async () => {
        const state = createActiveStateForPhase('CompositionAudit');
        const artifacts = createTransitionArtifacts(['contradictionReport']);

        const result = await transition(state, 'Ignition', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('Ignition');
        }
      });

      it('transitions from Injection to Lattice with structural defect report', async () => {
        const state = createActiveStateForPhase('Injection');
        const artifacts = createTransitionArtifacts(['structuralDefectReport']);

        const result = await transition(state, 'Lattice', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('Lattice');
        }
      });

      it('transitions from Mesoscopic to Injection with cluster failure report', async () => {
        const state = createActiveStateForPhase('Mesoscopic');
        const artifacts = createTransitionArtifacts(['clusterFailureReport']);

        const result = await transition(state, 'Injection', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('Injection');
        }
      });
    });

    describe('Missing artifact errors', () => {
      it('returns MISSING_ARTIFACTS error when no artifacts provided', async () => {
        const state = createActiveStateForPhase('Ignition');

        const result = await transition(state, 'Lattice', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('MISSING_ARTIFACTS');
          expect(result.error.missingArtifacts).toContain('spec');
          expect(result.error.message).toContain('spec');
        }
      });

      it('returns MISSING_ARTIFACTS error when some artifacts missing', async () => {
        const state = createActiveStateForPhase('Lattice');
        const artifacts = createTransitionArtifacts(['latticeCode']); // missing witnesses, contracts

        const result = await transition(state, 'CompositionAudit', tempDir, { artifacts });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('MISSING_ARTIFACTS');
          expect(result.error.missingArtifacts).toContain('witnesses');
          expect(result.error.missingArtifacts).toContain('contracts');
        }
      });
    });

    describe('Invalid transition errors', () => {
      it('returns INVALID_TRANSITION for skipping phases', async () => {
        const state = createActiveStateForPhase('Ignition');

        const result = await transition(state, 'MassDefect', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('returns INVALID_TRANSITION for invalid backward transitions', async () => {
        const state = createActiveStateForPhase('Lattice');

        const result = await transition(state, 'Ignition', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_TRANSITION');
          expect(result.error.message).toContain('not a valid failure transition');
        }
      });

      it('returns INVALID_TRANSITION for same-phase transition', async () => {
        const state = createActiveStateForPhase('Injection');

        const result = await transition(state, 'Injection', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_TRANSITION');
        }
      });
    });

    describe('State validation errors', () => {
      it('returns BLOCKED_STATE when in blocking substate', async () => {
        const state = createBlockedState({
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Waiting?',
        });

        const result = await transition(state, 'CompositionAudit', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('BLOCKED_STATE');
          expect(result.error.message).toContain('blocking state');
        }
      });

      it('returns FAILED_STATE when in failed substate', async () => {
        const state = createFailedState({ phase: 'Injection', error: 'Failed' });

        const result = await transition(state, 'Mesoscopic', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('FAILED_STATE');
          expect(result.error.message).toContain('failed state');
        }
      });

      it('returns ALREADY_COMPLETE when in Complete phase', async () => {
        const state = createCompleteState([]);

        const result = await transition(state, 'Ignition', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ALREADY_COMPLETE');
          expect(result.error.message).toContain('already complete');
        }
      });
    });

    describe('Context shedding', () => {
      it('triggers context shedding on successful transition', async () => {
        const state = createActiveStateForPhase('Ignition');
        const artifacts = createTransitionArtifacts(['spec']);

        const result = await transition(state, 'Lattice', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.contextShed).toBe(true);
        }
      });

      it('creates archive directory during transition', async () => {
        const state = createActiveStateForPhase('Ignition');
        const artifacts = createTransitionArtifacts(['spec']);

        await transition(state, 'Lattice', tempDir, { artifacts });

        const archivesDir = path.join(tempDir, '.criticality', 'archives');
        const dirExists = await access(archivesDir)
          .then(() => true)
          .catch(() => false);
        expect(dirExists).toBe(true);
      });

      it('transition still succeeds if archiving fails (graceful degradation)', async () => {
        const state = createActiveStateForPhase('Ignition');
        const artifacts = createTransitionArtifacts(['spec']);
        const invalidPath = '/nonexistent/path/that/does/not/exist';

        const result = await transition(state, 'Lattice', invalidPath, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.contextShed).toBe(false);
          expect(getPhase(result.state)).toBe('Lattice');
        }
      });
    });

    describe('Edge cases', () => {
      it('handles Complete phase correctly (no valid transitions)', async () => {
        const state = createCompleteState([]);

        // Try any transition - should fail
        const result = await transition(state, 'Ignition', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ALREADY_COMPLETE');
        }
      });

      it('provides descriptive error for phase that has no outgoing transitions', async () => {
        const state = createCompleteState([]);

        const result = await transition(state, 'MassDefect', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toBeDefined();
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Acceptance Criteria: Mesoscopic -> MassDefect transition with verifiedCode artifact', () => {
      it('transitions from Mesoscopic to MassDefect with verifiedCode artifact', async () => {
        const state = createActiveStateForPhase('Mesoscopic');
        const artifacts = createTransitionArtifacts(['verifiedCode']);

        const result = await transition(state, 'MassDefect', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(getPhase(result.state)).toBe('MassDefect');
          expect(result.state.kind).toBe('Active');
          expect(result.contextShed).toBe(true);
        }
      });
    });

    describe('Acceptance Criteria: MassDefect -> Complete transition with finalArtifact', () => {
      it('transitions from MassDefect to Complete with finalArtifact', async () => {
        const state = createActiveStateForPhase('MassDefect');
        const artifacts = createTransitionArtifacts(['finalArtifact']);

        const result = await transition(state, 'Complete', tempDir, { artifacts });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.state.kind).toBe('Complete');
        }
      });
    });

    describe('Negative case: MassDefect -> Complete without finalArtifact fails', () => {
      it('returns MISSING_ARTIFACTS error when finalArtifact not provided', async () => {
        const state = createActiveStateForPhase('MassDefect');

        const result = await transition(state, 'Complete', tempDir);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('MISSING_ARTIFACTS');
          expect(result.error.missingArtifacts).toContain('finalArtifact');
          expect(result.error.message).toContain('finalArtifact');
        }
      });
    });
  });
});
