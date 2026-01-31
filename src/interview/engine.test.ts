/**
 * Tests for the InterviewEngine programmatic API.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InterviewEngine,
  InterviewEngineError,
  type OpenTextResponse,
  type DelegationAnswerResponse,
  type ApprovalAnswerResponse,
} from './engine.js';
import { getCriticalityBaseDir } from './persistence.js';

// Test helper to create a unique project ID for isolation
function createTestProjectId(): string {
  return `test-project-${String(Date.now())}-${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to clean up test project directory
async function cleanupProject(projectId: string): Promise<void> {
  const baseDir = getCriticalityBaseDir();
  const projectDir = join(baseDir, 'projects', projectId);
  try {
    await rm(projectDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('InterviewEngine', () => {
  let projectId: string;

  beforeEach(() => {
    projectId = createTestProjectId();
  });

  afterEach(async () => {
    await cleanupProject(projectId);
  });

  describe('constructor', () => {
    it('creates engine with valid project ID', () => {
      const engine = new InterviewEngine(projectId);
      expect(engine.getProjectId()).toBe(projectId);
    });

    it('throws for empty project ID', () => {
      expect(() => new InterviewEngine('')).toThrow(InterviewEngineError);
      expect(() => new InterviewEngine('')).toThrow('Project ID must be a non-empty string');
    });

    it('throws for whitespace-only project ID', () => {
      expect(() => new InterviewEngine('   ')).toThrow(InterviewEngineError);
    });

    it('trims project ID', () => {
      const engine = new InterviewEngine('  my-project  ');
      expect(engine.getProjectId()).toBe('my-project');
    });
  });

  describe('start()', () => {
    it('starts a new interview', async () => {
      const engine = new InterviewEngine(projectId);
      const result = await engine.start();

      expect(result.accepted).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.state).toBeDefined();
      expect(result.state.currentPhase).toBe('Discovery');
      expect(result.nextQuestion).toBeDefined();
      expect(result.nextQuestion?.phase).toBe('Discovery');
    });

    it('returns first question with expected structure', async () => {
      const engine = new InterviewEngine(projectId);
      const result = await engine.start();

      const question = result.nextQuestion;
      expect(question).toBeDefined();
      expect(question?.id).toMatch(/^q_discovery_/);
      expect(question?.phase).toBe('Discovery');
      expect(question?.type).toBe('open');
      expect(question?.text).toContain('build');
      expect(question?.allowsDelegation).toBe(false);
    });

    it('resumes existing interview instead of creating new', async () => {
      const engine1 = new InterviewEngine(projectId);
      await engine1.start();

      // Answer first question to advance
      await engine1.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'A task management app',
      });

      // Create new engine and start - should resume
      const engine2 = new InterviewEngine(projectId);
      const result = await engine2.start();

      expect(result.state.currentPhase).toBe('Architecture');
      expect(result.state.completedPhases).toContain('Discovery');
    });
  });

  describe('answer()', () => {
    it('throws if engine not started', async () => {
      const engine = new InterviewEngine(projectId);

      await expect(
        engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'A test app',
        })
      ).rejects.toThrow(InterviewEngineError);

      await expect(
        engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'A test app',
        })
      ).rejects.toThrow('not started');
    });

    describe('response validation', () => {
      it('throws for null response', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await expect(engine.answer(null)).rejects.toThrow(InterviewEngineError);
      });

      it('throws for non-object response', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await expect(engine.answer('invalid')).rejects.toThrow('Invalid response shape');
      });

      it('throws for missing phase', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ type: 'open', text: 'test' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error).toBeInstanceOf(InterviewEngineError);
        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
        expect(error?.validationDetails.length).toBeGreaterThan(0);
        expect(error?.validationDetails.some((d) => d.field === 'phase')).toBe(true);
      });

      it('throws for invalid phase', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'InvalidPhase', type: 'open', text: 'test' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
        expect(error?.validationDetails.some((d) => d.field === 'phase')).toBe(true);
      });

      it('throws for missing type', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', text: 'test' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
        expect(error?.validationDetails.some((d) => d.field === 'type')).toBe(true);
      });

      it('throws for invalid type', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', type: 'invalid', text: 'test' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
      });

      it('throws for empty text in open response', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', type: 'open', text: '' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
        expect(error?.validationDetails.some((d) => d.field === 'text')).toBe(true);
      });

      it('throws for whitespace-only text', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', type: 'open', text: '   ' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
      });

      it('throws when response phase does not match current phase', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        // Try to answer Architecture when in Discovery
        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Architecture', type: 'open', text: 'test' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_PHASE');
        expect(error?.message).toContain('does not match');
      });

      it('includes validation details in error', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', type: 'open', confidence: 'invalid' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.validationDetails).toBeDefined();
        expect((error?.validationDetails.length ?? 0) > 0).toBe(true);

        const detail = error?.validationDetails[0];
        expect(detail?.field).toBeDefined();
        expect(detail?.message).toBeDefined();
      });
    });

    describe('open text responses', () => {
      it('accepts valid open text response', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        const response: OpenTextResponse = {
          phase: 'Discovery',
          type: 'open',
          text: 'I want to build a task management application',
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.complete).toBe(false);
        expect(result.state.completedPhases).toContain('Discovery');
        expect(result.state.currentPhase).toBe('Architecture');
        expect(result.nextQuestion?.phase).toBe('Architecture');
      });

      it('extracts requirement from response', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'Build a task management app with user authentication',
        });

        const state = engine.getState();
        expect(state.requirements.length).toBe(1);
        expect(state.requirements[0]?.text).toContain('task management');
        expect(state.requirements[0]?.sourcePhase).toBe('Discovery');
      });

      it('respects confidence level', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'Build something',
          confidence: 'low',
        });

        const state = engine.getState();
        expect(state.requirements[0]?.confidence).toBe('low');
      });

      it('defaults confidence to medium', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'Build something',
        });

        const state = engine.getState();
        expect(state.requirements[0]?.confidence).toBe('medium');
      });
    });

    describe('delegation responses', () => {
      it('accepts delegation for delegable phases', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        // Answer Discovery and Architecture first
        await engine.answer({
          phase: 'Discovery',
          type: 'open',
          text: 'A task app',
        });

        await engine.answer({
          phase: 'Architecture',
          type: 'open',
          text: 'Microservices architecture',
        });

        // Now we're in Constraints (delegable)
        const response: DelegationAnswerResponse = {
          phase: 'Constraints',
          type: 'delegation',
          decision: 'Delegate',
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.state.delegationPoints.length).toBe(1);
        expect(result.state.completedPhases).toContain('Constraints');
      });

      it('accepts delegation with notes', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await engine.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
        await engine.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });

        const response: DelegationAnswerResponse = {
          phase: 'Constraints',
          type: 'delegation',
          decision: 'DelegateWithNotes',
          notes: 'Focus on security constraints',
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.state.delegationPoints[0]?.notes).toBe('Focus on security constraints');
      });

      it('handles Continue decision', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        await engine.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
        await engine.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });

        const response: DelegationAnswerResponse = {
          phase: 'Constraints',
          type: 'delegation',
          decision: 'Continue',
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        // Should stay in same phase
        expect(result.state.currentPhase).toBe('Constraints');
        expect(result.nextQuestion?.phase).toBe('Constraints');
      });

      it('throws for delegation on required phase', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        const response: DelegationAnswerResponse = {
          phase: 'Discovery',
          type: 'delegation',
          decision: 'Delegate',
        };

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer(response);
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_DELEGATION');
        expect(error?.message).toContain('does not allow delegation');
      });
    });

    describe('approval responses', () => {
      async function advanceToApproval(engine: InterviewEngine): Promise<void> {
        await engine.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
        await engine.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });
        await engine.answer({
          phase: 'Constraints',
          type: 'delegation',
          decision: 'Delegate',
        });
        await engine.answer({
          phase: 'DesignPreferences',
          type: 'delegation',
          decision: 'Delegate',
        });
        await engine.answer({ phase: 'Synthesis', type: 'open', text: 'No additional notes' });
      }

      it('accepts approval and completes interview', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();
        await advanceToApproval(engine);

        const response: ApprovalAnswerResponse = {
          phase: 'Approval',
          type: 'approval',
          decision: 'Approve',
          confirmations: {
            system_boundaries: true,
            data_models: true,
            key_constraints: true,
            testable_claims: true,
          },
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.complete).toBe(true);
        expect(result.state.completedPhases).toContain('Approval');
      });

      it('handles ApproveWithConditions', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();
        await advanceToApproval(engine);

        const response: ApprovalAnswerResponse = {
          phase: 'Approval',
          type: 'approval',
          decision: 'ApproveWithConditions',
          conditions: ['Add rate limiting to the API'],
          confirmations: {
            system_boundaries: true,
            data_models: true,
            key_constraints: true,
            testable_claims: true,
          },
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.phasesToRevisit).toBeDefined();
        // Rate limiting is constraint-related
        expect(result.phasesToRevisit).toContain('Constraints');
      });

      it('handles RejectWithFeedback', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();
        await advanceToApproval(engine);

        const response: ApprovalAnswerResponse = {
          phase: 'Approval',
          type: 'approval',
          decision: 'RejectWithFeedback',
          feedback: 'Need to reconsider the architecture',
          confirmations: {
            system_boundaries: false,
            data_models: false,
            key_constraints: false,
            testable_claims: false,
          },
        };

        const result = await engine.answer(response);

        expect(result.accepted).toBe(true);
        expect(result.complete).toBe(false);
        expect(result.state.currentPhase).toBe('Discovery');
        expect(result.phasesToRevisit?.length).toBeGreaterThan(0);
      });

      it('throws for invalid approval response - missing confirmations', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();
        await advanceToApproval(engine);

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({
            phase: 'Approval',
            type: 'approval',
            decision: 'Approve',
            confirmations: {
              system_boundaries: true,
              // Missing other confirmations
            },
          });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INVALID_RESPONSE_SHAPE');
      });

      it('throws when approval response given for non-approval phase', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({
            phase: 'Discovery',
            type: 'approval',
            decision: 'Approve',
            confirmations: {
              system_boundaries: true,
              data_models: true,
              key_constraints: true,
              testable_claims: true,
            },
          });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        // Should fail phase match
        expect(error).toBeInstanceOf(InterviewEngineError);
      });
    });

    describe('interview completion', () => {
      it('throws when answering completed interview', async () => {
        const engine = new InterviewEngine(projectId);
        await engine.start();

        // Complete the interview
        await engine.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
        await engine.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });
        await engine.answer({
          phase: 'Constraints',
          type: 'delegation',
          decision: 'Delegate',
        });
        await engine.answer({
          phase: 'DesignPreferences',
          type: 'delegation',
          decision: 'Delegate',
        });
        await engine.answer({ phase: 'Synthesis', type: 'open', text: 'Done' });
        await engine.answer({
          phase: 'Approval',
          type: 'approval',
          decision: 'Approve',
          confirmations: {
            system_boundaries: true,
            data_models: true,
            key_constraints: true,
            testable_claims: true,
          },
        });

        // Try to answer again
        let error: InterviewEngineError | undefined;
        try {
          await engine.answer({ phase: 'Discovery', type: 'open', text: 'More' });
        } catch (e) {
          error = e as InterviewEngineError;
        }

        expect(error?.code).toBe('INTERVIEW_COMPLETE');
      });
    });
  });

  describe('getState()', () => {
    it('returns not started state initially', () => {
      const engine = new InterviewEngine(projectId);
      const state = engine.getState();

      expect(state.started).toBe(false);
      expect(state.interviewState).toBeUndefined();
      expect(state.currentQuestion).toBeUndefined();
      expect(state.complete).toBe(false);
      expect(state.requirements).toEqual([]);
    });

    it('returns started state after start()', async () => {
      const engine = new InterviewEngine(projectId);
      await engine.start();

      const state = engine.getState();

      expect(state.started).toBe(true);
      expect(state.interviewState).toBeDefined();
      expect(state.currentQuestion).toBeDefined();
      expect(state.complete).toBe(false);
    });

    it('returns requirements as they are added', async () => {
      const engine = new InterviewEngine(projectId);
      await engine.start();

      let state = engine.getState();
      expect(state.requirements.length).toBe(0);

      await engine.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'Build a task app',
      });

      state = engine.getState();
      expect(state.requirements.length).toBe(1);

      await engine.answer({
        phase: 'Architecture',
        type: 'open',
        text: 'Use microservices',
      });

      state = engine.getState();
      expect(state.requirements.length).toBe(2);
    });

    it('reflects complete status after approval', async () => {
      const engine = new InterviewEngine(projectId);
      await engine.start();

      await engine.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
      await engine.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });
      await engine.answer({
        phase: 'Constraints',
        type: 'delegation',
        decision: 'Delegate',
      });
      await engine.answer({
        phase: 'DesignPreferences',
        type: 'delegation',
        decision: 'Delegate',
      });
      await engine.answer({ phase: 'Synthesis', type: 'open', text: 'Done' });
      await engine.answer({
        phase: 'Approval',
        type: 'approval',
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      });

      const state = engine.getState();
      expect(state.complete).toBe(true);
      expect(state.currentQuestion).toBeUndefined();
    });
  });

  describe('resume()', () => {
    it('resumes existing interview', async () => {
      const engine1 = new InterviewEngine(projectId);
      await engine1.start();

      await engine1.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'A task management app',
      });

      await engine1.answer({
        phase: 'Architecture',
        type: 'open',
        text: 'Microservices',
      });

      // Create new engine and resume
      const engine2 = new InterviewEngine(projectId);
      const result = await engine2.resume();

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe('Constraints');
      expect(result.state.completedPhases).toContain('Discovery');
      expect(result.state.completedPhases).toContain('Architecture');
      expect(result.nextQuestion?.phase).toBe('Constraints');
    });

    it('resumes completed interview', async () => {
      const engine1 = new InterviewEngine(projectId);
      await engine1.start();

      // Complete the interview
      await engine1.answer({ phase: 'Discovery', type: 'open', text: 'A task app' });
      await engine1.answer({ phase: 'Architecture', type: 'open', text: 'Monolith' });
      await engine1.answer({
        phase: 'Constraints',
        type: 'delegation',
        decision: 'Delegate',
      });
      await engine1.answer({
        phase: 'DesignPreferences',
        type: 'delegation',
        decision: 'Delegate',
      });
      await engine1.answer({ phase: 'Synthesis', type: 'open', text: 'Done' });
      await engine1.answer({
        phase: 'Approval',
        type: 'approval',
        decision: 'Approve',
        confirmations: {
          system_boundaries: true,
          data_models: true,
          key_constraints: true,
          testable_claims: true,
        },
      });

      // Resume
      const engine2 = new InterviewEngine(projectId);
      const result = await engine2.resume();

      expect(result.accepted).toBe(true);
      expect(result.complete).toBe(true);
      expect(result.nextQuestion).toBeUndefined();
    });

    it('throws for non-existent interview', async () => {
      const engine = new InterviewEngine('non-existent-project-xyz');

      let error: InterviewEngineError | undefined;
      try {
        await engine.resume();
      } catch (e) {
        error = e as InterviewEngineError;
      }

      expect(error).toBeInstanceOf(InterviewEngineError);
      expect(error?.code).toBe('PERSISTENCE_ERROR');
    });

    it('preserves requirements on resume', async () => {
      const engine1 = new InterviewEngine(projectId);
      await engine1.start();

      await engine1.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'Build a comprehensive task management system',
        confidence: 'high',
      });

      const engine2 = new InterviewEngine(projectId);
      await engine2.resume();

      const state = engine2.getState();
      expect(state.requirements.length).toBe(1);
      expect(state.requirements[0]?.text).toContain('task management');
    });
  });

  describe('getTranscript()', () => {
    it('returns empty transcript initially', async () => {
      const engine = new InterviewEngine(projectId);
      await engine.start();

      const transcript = await engine.getTranscript();
      // Should have at least the "Interview started" entry
      expect(transcript.length).toBeGreaterThanOrEqual(1);
    });

    it('records transcript entries', async () => {
      const engine = new InterviewEngine(projectId);
      await engine.start();

      await engine.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'Build a task app',
      });

      const transcript = await engine.getTranscript();
      // Should have start entry + user entry + system ack + phase transition
      expect(transcript.length).toBeGreaterThanOrEqual(3);

      const userEntries = transcript.filter((e) => e.role === 'user');
      expect(userEntries.length).toBeGreaterThanOrEqual(1);
      expect(userEntries.some((e) => e.content.includes('task app'))).toBe(true);
    });
  });

  describe('example from acceptance criteria', () => {
    it('matches the example usage pattern', async () => {
      const engine = new InterviewEngine(projectId);

      // Start
      await engine.start();

      // Answer with structured response
      const result = await engine.answer({
        phase: 'Discovery',
        type: 'open',
        text: 'A REST API for managing tasks',
      });

      expect(result.accepted).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.nextQuestion).toBeDefined();

      // Get state shows current question, available options, extracted requirements
      const state = engine.getState();
      expect(state.currentQuestion).toBeDefined();
      expect(state.currentQuestion?.text).toBeDefined();
      expect(state.requirements.length).toBe(1);
    });
  });

  describe('InterviewEngineError', () => {
    it('includes code for programmatic handling', () => {
      const error = new InterviewEngineError('Test error', 'INVALID_RESPONSE_SHAPE');

      expect(error.code).toBe('INVALID_RESPONSE_SHAPE');
      expect(error.name).toBe('InterviewEngineError');
      expect(error.message).toBe('Test error');
    });

    it('includes validation details', () => {
      const error = new InterviewEngineError('Test error', 'INVALID_RESPONSE_SHAPE', {
        validationDetails: [
          {
            field: 'phase',
            message: 'Invalid phase',
            received: 'Bad',
            expected: 'Discovery',
          },
        ],
      });

      expect(error.validationDetails.length).toBe(1);
      expect(error.validationDetails[0]?.field).toBe('phase');
      expect(error.validationDetails[0]?.received).toBe('Bad');
    });

    it('includes cause error', () => {
      const cause = new Error('Underlying error');
      const error = new InterviewEngineError('Test error', 'PERSISTENCE_ERROR', { cause });

      expect(error.cause).toBe(cause);
    });
  });
});
