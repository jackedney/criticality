/**
 * Tests for interview structure implementation.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRequiredPhase,
  isDelegablePhase,
  isValidApprovalDecision,
  REQUIRED_PHASES,
  DELEGABLE_PHASES,
  APPROVAL_DECISIONS,
  CONFIRMATION_ITEMS,
  createDelegationPoint,
  createExtractedRequirement,
  recordDelegationInLedger,
  recordConditionalApprovalInLedger,
  applyStateUpdate,
  hasAllRequiredConfirmations,
  getMissingConfirmations,
  validateApprovalResponse,
  detectContradictions,
  getPhasesToRevisit,
  createDelegationTranscriptEntries,
  createApprovalTranscriptEntries,
  processPhaseCompletion,
  processApprovalResponse,
  advanceToNextPhase,
  resetToPhase,
  type ApprovalResponse,
  type InterviewStateUpdate,
} from './structure.js';
import { createInitialInterviewState, INTERVIEW_PHASES } from './types.js';
import type { InterviewState, ExtractedRequirement } from './types.js';
import { Ledger } from '../ledger/ledger.js';

describe('Interview Structure', () => {
  describe('Phase Classification', () => {
    it('should identify required phases', () => {
      expect(isRequiredPhase('Discovery')).toBe(true);
      expect(isRequiredPhase('Architecture')).toBe(true);
      expect(isRequiredPhase('Constraints')).toBe(false);
      expect(isRequiredPhase('DesignPreferences')).toBe(false);
      expect(isRequiredPhase('Synthesis')).toBe(false);
      expect(isRequiredPhase('Approval')).toBe(false);
    });

    it('should identify delegable phases', () => {
      expect(isDelegablePhase('Discovery')).toBe(false);
      expect(isDelegablePhase('Architecture')).toBe(false);
      expect(isDelegablePhase('Constraints')).toBe(true);
      expect(isDelegablePhase('DesignPreferences')).toBe(true);
      expect(isDelegablePhase('Synthesis')).toBe(false);
      expect(isDelegablePhase('Approval')).toBe(false);
    });

    it('should have correct required phases', () => {
      expect(REQUIRED_PHASES).toEqual(['Discovery', 'Architecture']);
    });

    it('should have correct delegable phases', () => {
      expect(DELEGABLE_PHASES).toEqual(['Constraints', 'DesignPreferences']);
    });
  });

  describe('Approval Decisions', () => {
    it('should validate approval decisions', () => {
      expect(isValidApprovalDecision('Approve')).toBe(true);
      expect(isValidApprovalDecision('ApproveWithConditions')).toBe(true);
      expect(isValidApprovalDecision('RejectWithFeedback')).toBe(true);
      expect(isValidApprovalDecision('Invalid')).toBe(false);
      expect(isValidApprovalDecision('')).toBe(false);
    });

    it('should have all approval decision types', () => {
      expect(APPROVAL_DECISIONS).toEqual([
        'Approve',
        'ApproveWithConditions',
        'RejectWithFeedback',
      ]);
    });

    it('should have all confirmation items', () => {
      expect(CONFIRMATION_ITEMS).toEqual([
        'system_boundaries',
        'data_models',
        'key_constraints',
        'testable_claims',
      ]);
    });
  });

  describe('Delegation Point Creation', () => {
    it('should create a delegation point without notes', () => {
      const point = createDelegationPoint('Constraints', 'Delegate');
      expect(point.phase).toBe('Constraints');
      expect(point.decision).toBe('Delegate');
      expect(point.notes).toBeUndefined();
      expect(point.delegatedAt).toBeDefined();
    });

    it('should create a delegation point with notes', () => {
      const point = createDelegationPoint('DesignPreferences', 'DelegateWithNotes', 'Use REST API');
      expect(point.phase).toBe('DesignPreferences');
      expect(point.decision).toBe('DelegateWithNotes');
      expect(point.notes).toBe('Use REST API');
    });

    it('should create a continue decision', () => {
      const point = createDelegationPoint('Constraints', 'Continue');
      expect(point.decision).toBe('Continue');
    });
  });

  describe('Extracted Requirement Creation', () => {
    it('should create an extracted requirement', () => {
      const req = createExtractedRequirement(
        'Discovery',
        'functional',
        'User authentication required',
        'high'
      );
      expect(req.sourcePhase).toBe('Discovery');
      expect(req.category).toBe('functional');
      expect(req.text).toBe('User authentication required');
      expect(req.confidence).toBe('high');
      expect(req.id).toMatch(/^req_/);
      expect(req.extractedAt).toBeDefined();
    });

    it('should create requirements with different categories', () => {
      const categories = ['functional', 'non_functional', 'constraint', 'preference'] as const;
      for (const category of categories) {
        const req = createExtractedRequirement('Architecture', category, 'Test', 'medium');
        expect(req.category).toBe(category);
      }
    });
  });

  describe('DecisionLedger Integration', () => {
    let ledger: Ledger;

    beforeEach(() => {
      ledger = new Ledger({ project: 'test-project' });
    });

    it('should record delegation decision in ledger', () => {
      recordDelegationInLedger(ledger, 'Constraints', 'Delegate');
      const decisions = ledger.getDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.confidence).toBe('delegated');
      expect(decisions[0]?.constraint).toContain('Constraints');
      expect(decisions[0]?.phase).toBe('ignition');
    });

    it('should record delegation with notes', () => {
      recordDelegationInLedger(
        ledger,
        'DesignPreferences',
        'DelegateWithNotes',
        'Prefer TypeScript'
      );
      const decisions = ledger.getDecisions();
      expect(decisions[0]?.constraint).toContain('Prefer TypeScript');
      expect(decisions[0]?.rationale).toBe('Prefer TypeScript');
    });

    it('should record conditional approval conditions', () => {
      recordConditionalApprovalInLedger(ledger, ['Add rate limiting', 'Include logging']);
      const decisions = ledger.getDecisions();
      expect(decisions.length).toBe(2);
      expect(decisions[0]?.constraint).toContain('rate limiting');
      expect(decisions[1]?.constraint).toContain('logging');
      expect(decisions[0]?.confidence).toBe('canonical');
    });
  });

  describe('State Update Application', () => {
    let initialState: InterviewState;

    beforeEach(() => {
      initialState = createInitialInterviewState('test-project');
    });

    it('should apply empty update', () => {
      const update: InterviewStateUpdate = {
        newRequirements: [],
        transcriptEntries: [],
        completedPhases: [],
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.extractedRequirements.length).toBe(0);
      expect(newState.completedPhases.length).toBe(0);
    });

    it('should add new requirements', () => {
      const req = createExtractedRequirement('Discovery', 'functional', 'Test', 'high');
      const update: InterviewStateUpdate = {
        newRequirements: [req],
        transcriptEntries: [],
        completedPhases: [],
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.extractedRequirements.length).toBe(1);
      expect(newState.extractedRequirements[0]?.text).toBe('Test');
    });

    it('should update transcript entry count', () => {
      const update: InterviewStateUpdate = {
        newRequirements: [],
        transcriptEntries: [
          { id: '1', phase: 'Discovery', role: 'user', content: 'test', timestamp: '' },
        ],
        completedPhases: [],
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.transcriptEntryCount).toBe(1);
    });

    it('should add completed phases', () => {
      const update: InterviewStateUpdate = {
        newRequirements: [],
        transcriptEntries: [],
        completedPhases: ['Discovery'],
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.completedPhases).toContain('Discovery');
    });

    it('should update current phase', () => {
      const update: InterviewStateUpdate = {
        newRequirements: [],
        transcriptEntries: [],
        completedPhases: [],
        nextPhase: 'Architecture',
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.currentPhase).toBe('Architecture');
    });

    it('should add delegation point', () => {
      const point = createDelegationPoint('Constraints', 'Delegate');
      const update: InterviewStateUpdate = {
        newRequirements: [],
        transcriptEntries: [],
        completedPhases: [],
        delegationPoint: point,
      };
      const newState = applyStateUpdate(initialState, update);
      expect(newState.delegationPoints.length).toBe(1);
      expect(newState.delegationPoints[0]?.phase).toBe('Constraints');
    });
  });

  describe('Approval Confirmations', () => {
    it('should detect all confirmations present', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      expect(hasAllRequiredConfirmations(response)).toBe(true);
    });

    it('should detect missing confirmations', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: false,
          key_constraints: true,
          testable_claims: false,
        },
      };
      expect(hasAllRequiredConfirmations(response)).toBe(false);
      const missing = getMissingConfirmations(response);
      expect(missing).toContain('data_models');
      expect(missing).toContain('testable_claims');
      expect(missing).not.toContain('system_boundaries');
    });
  });

  describe('Approval Response Validation', () => {
    it('should validate Approve with all confirmations', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject Approve with missing confirmations', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: false,
          key_constraints: true,
          testable_claims: false,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing required confirmations'))).toBe(true);
    });

    it('should validate ApproveWithConditions with conditions', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        conditions: ['Add rate limiting'],
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(true);
    });

    it('should reject ApproveWithConditions without conditions', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('requires at least one condition'))).toBe(true);
    });

    it('should validate RejectWithFeedback with feedback', () => {
      const response: ApprovalResponse = {
        decision: 'RejectWithFeedback',
        feedback: 'Need more details on authentication',
        confirmations: {
          system_boundaries: false,
          data_models: false,
          key_constraints: false,
          testable_claims: false,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(true);
    });

    it('should reject RejectWithFeedback without feedback', () => {
      const response: ApprovalResponse = {
        decision: 'RejectWithFeedback',
        confirmations: {
          system_boundaries: false,
          data_models: false,
          key_constraints: false,
          testable_claims: false,
        },
      };
      const result = validateApprovalResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('requires feedback'))).toBe(true);
    });
  });

  describe('Contradiction Detection', () => {
    it('should detect no contradictions in consistent requirements', () => {
      const requirements: ExtractedRequirement[] = [
        createExtractedRequirement(
          'Discovery',
          'functional',
          'System must have authentication',
          'high'
        ),
        createExtractedRequirement(
          'Discovery',
          'functional',
          'System must support logging',
          'high'
        ),
      ];
      const result = detectContradictions(requirements);
      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions.length).toBe(0);
    });

    it('should detect must vs must not contradictions', () => {
      const requirements: ExtractedRequirement[] = [
        createExtractedRequirement('Discovery', 'functional', 'System must have caching', 'high'),
        createExtractedRequirement(
          'Architecture',
          'constraint',
          'System must not have caching',
          'high'
        ),
      ];
      const result = detectContradictions(requirements);
      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions.length).toBe(1);
      expect(result.contradictions[0]?.severity).toBe('critical');
    });

    it('should detect time constraint conflicts', () => {
      const requirements: ExtractedRequirement[] = [
        createExtractedRequirement(
          'Architecture',
          'constraint',
          'Session timeout of 30 minutes',
          'high'
        ),
        createExtractedRequirement(
          'Discovery',
          'functional',
          'Operations take 2 hours minimum',
          'high'
        ),
      ];
      const result = detectContradictions(requirements);
      expect(result.hasContradictions).toBe(true);
    });

    it('should provide suggested resolutions', () => {
      const requirements: ExtractedRequirement[] = [
        createExtractedRequirement(
          'Discovery',
          'functional',
          'System must support encryption',
          'high'
        ),
        createExtractedRequirement(
          'Architecture',
          'constraint',
          'System must not support encryption',
          'high'
        ),
      ];
      const result = detectContradictions(requirements);
      expect(result.contradictions[0]?.suggestedResolutions.length).toBeGreaterThan(0);
    });
  });

  describe('Phases to Revisit', () => {
    it('should identify Architecture phase for architecture-related conditions', () => {
      const phases = getPhasesToRevisit(['Add rate limiting to API']);
      expect(phases).toContain('Architecture');
    });

    it('should identify Constraints phase for constraint-related conditions', () => {
      const phases = getPhasesToRevisit(['Add timeout constraints']);
      expect(phases).toContain('Constraints');
    });

    it('should identify DesignPreferences for preference conditions', () => {
      const phases = getPhasesToRevisit(['Update coding style preferences']);
      expect(phases).toContain('DesignPreferences');
    });

    it('should identify Discovery for requirement conditions', () => {
      const phases = getPhasesToRevisit(['Add new user story for admin']);
      expect(phases).toContain('Discovery');
    });

    it('should identify multiple phases', () => {
      const phases = getPhasesToRevisit([
        'Add rate limiting to API',
        'Add timeout constraints',
        'Add user authentication feature',
      ]);
      expect(phases.length).toBeGreaterThan(1);
    });

    it('should return empty for generic conditions', () => {
      const phases = getPhasesToRevisit(['Something generic']);
      expect(phases.length).toBe(0);
    });
  });

  describe('Transcript Entry Creation', () => {
    it('should create delegation transcript entries', () => {
      const entries = createDelegationTranscriptEntries('Constraints', 'Delegate');
      expect(entries.length).toBe(2);
      expect(entries[0]?.role).toBe('user');
      expect(entries[1]?.role).toBe('system');
      expect(entries[0]?.content).toContain('Delegate');
    });

    it('should include notes in delegation entries', () => {
      const entries = createDelegationTranscriptEntries(
        'DesignPreferences',
        'DelegateWithNotes',
        'Use REST'
      );
      expect(entries[0]?.content).toContain('Use REST');
      expect(entries[1]?.content).toContain('Use REST');
    });

    it('should create approval transcript entries', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const entries = createApprovalTranscriptEntries(response);
      expect(entries.length).toBe(2);
      expect(entries[0]?.content).toContain('Approve');
      expect(entries[1]?.content).toContain('confirmed');
    });

    it('should include conditions in approval entries', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        conditions: ['Add rate limiting', 'Add logging'],
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const entries = createApprovalTranscriptEntries(response);
      expect(entries[0]?.content).toContain('rate limiting');
      expect(entries[0]?.content).toContain('logging');
    });
  });

  describe('Phase Completion Processing', () => {
    let state: InterviewState;

    beforeEach(() => {
      state = createInitialInterviewState('test-project');
    });

    it('should complete phase without delegation', () => {
      const req = createExtractedRequirement('Discovery', 'functional', 'Test', 'high');
      const result = processPhaseCompletion(state, 'Discovery', [req]);
      expect(result.completed).toBe(true);
      expect(result.delegated).toBe(false);
      expect(result.requirements.length).toBe(1);
    });

    it('should allow delegation for delegable phases', () => {
      const result = processPhaseCompletion(state, 'Constraints', [], { decision: 'Delegate' });
      expect(result.completed).toBe(true);
      expect(result.delegated).toBe(true);
      expect(result.delegationPoint).toBeDefined();
    });

    it('should reject delegation for required phases', () => {
      const result = processPhaseCompletion(state, 'Discovery', [], { decision: 'Delegate' });
      expect(result.completed).toBe(false);
      expect(result.error).toContain('cannot be delegated');
    });

    it('should allow Continue for any phase', () => {
      const result = processPhaseCompletion(state, 'Discovery', [], { decision: 'Continue' });
      expect(result.completed).toBe(true);
      expect(result.delegated).toBe(false);
    });

    it('should record delegation in ledger when provided', () => {
      const ledger = new Ledger({ project: 'test-project' });
      processPhaseCompletion(state, 'Constraints', [], { decision: 'Delegate' }, ledger);
      expect(ledger.size).toBe(1);
    });
  });

  describe('Approval Response Processing', () => {
    let state: InterviewState;

    beforeEach(() => {
      state = {
        ...createInitialInterviewState('test-project'),
        currentPhase: 'Approval',
        completedPhases: [
          'Discovery',
          'Architecture',
          'Constraints',
          'DesignPreferences',
          'Synthesis',
        ],
      };
    });

    it('should process full approval', () => {
      const response: ApprovalResponse = {
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = processApprovalResponse(response, state);
      expect(result.approved).toBe(true);
      expect(result.phasesToRevisit.length).toBe(0);
    });

    it('should process conditional approval with no revisit needed', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        conditions: ['something generic that maps to no phase'],
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = processApprovalResponse(response, state);
      expect(result.approved).toBe(true);
    });

    it('should process conditional approval with revisit needed', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        conditions: ['Add rate limiting to API'],
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      const result = processApprovalResponse(response, state);
      expect(result.approved).toBe(false);
      expect(result.phasesToRevisit.length).toBeGreaterThan(0);
    });

    it('should process rejection with feedback', () => {
      const response: ApprovalResponse = {
        decision: 'RejectWithFeedback',
        feedback: 'Need more details',
        confirmations: {
          system_boundaries: false,
          data_models: false,
          key_constraints: false,
          testable_claims: false,
        },
      };
      const result = processApprovalResponse(response, state);
      expect(result.approved).toBe(false);
      expect(result.phasesToRevisit.length).toBe(4); // All phases except Synthesis and Approval
    });

    it('should return error for invalid response', () => {
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
        // Missing conditions
      };
      const result = processApprovalResponse(response, state);
      expect(result.approved).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should record conditions in ledger when provided', () => {
      const ledger = new Ledger({ project: 'test-project' });
      const response: ApprovalResponse = {
        decision: 'ApproveWithConditions',
        conditions: ['Add rate limiting'],
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      };
      processApprovalResponse(response, state, ledger);
      expect(ledger.size).toBe(1);
    });
  });

  describe('Phase Navigation', () => {
    it('should advance through all phases in order', () => {
      let state: InterviewState | undefined = createInitialInterviewState('test-project');
      const visitedPhases: string[] = [state.currentPhase];

      let nextState = advanceToNextPhase(state);
      while (nextState !== undefined) {
        state = nextState;
        visitedPhases.push(state.currentPhase);
        nextState = advanceToNextPhase(state);
      }

      expect(visitedPhases).toEqual(INTERVIEW_PHASES);
    });

    it('should return undefined at end of interview', () => {
      const state: InterviewState = {
        ...createInitialInterviewState('test-project'),
        currentPhase: 'Approval',
      };
      const result = advanceToNextPhase(state);
      expect(result).toBeUndefined();
    });

    it('should reset to a specific phase', () => {
      const state: InterviewState = {
        ...createInitialInterviewState('test-project'),
        currentPhase: 'Approval',
        completedPhases: [
          'Discovery',
          'Architecture',
          'Constraints',
          'DesignPreferences',
          'Synthesis',
        ],
      };
      const resetState = resetToPhase(state, 'Architecture');
      expect(resetState.currentPhase).toBe('Architecture');
      expect(resetState.completedPhases).toEqual(['Discovery']);
    });

    it('should reset to Discovery clearing all completed phases', () => {
      const state: InterviewState = {
        ...createInitialInterviewState('test-project'),
        currentPhase: 'Synthesis',
        completedPhases: ['Discovery', 'Architecture', 'Constraints', 'DesignPreferences'],
      };
      const resetState = resetToPhase(state, 'Discovery');
      expect(resetState.currentPhase).toBe('Discovery');
      expect(resetState.completedPhases).toEqual([]);
    });
  });
});
