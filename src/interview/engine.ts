/**
 * Programmatic interview API for the Ignition phase.
 *
 * Provides the InterviewEngine class for automated and testable interview processes.
 * This API allows programmatic control of interviews without CLI interaction.
 *
 * @packageDocumentation
 */

import type {
  InterviewState,
  InterviewPhase,
  ExtractedRequirement,
  TranscriptEntry,
  FeatureClassification,
} from './types.js';
import {
  createInitialInterviewState,
  createTranscriptEntry,
  getNextInterviewPhase,
  isInterviewComplete,
  INTERVIEW_PHASES,
  createFeature,
  FEATURE_CLASSIFICATIONS,
  isValidFeatureClassification,
} from './types.js';
import {
  saveInterviewState,
  loadInterviewState,
  interviewStateExists,
  appendTranscriptEntryAndUpdateState,
  loadTranscript,
  InterviewPersistenceError,
} from './persistence.js';
import {
  DELEGABLE_PHASES,
  type ApprovalResponse,
  type ConfirmationItem,
  CONFIRMATION_ITEMS,
  createDelegationPoint,
  createExtractedRequirement,
  validateApprovalResponse,
  getPhasesToRevisit,
  resetToPhase,
  isDelegablePhase,
  createFeatureClassificationTranscriptEntries,
} from './structure.js';

/**
 * Error type codes for interview engine errors.
 */
export type InterviewEngineErrorCode =
  | 'INVALID_RESPONSE_SHAPE'
  | 'INVALID_PHASE'
  | 'INVALID_DELEGATION'
  | 'INVALID_APPROVAL'
  | 'ENGINE_NOT_STARTED'
  | 'INTERVIEW_COMPLETE'
  | 'PERSISTENCE_ERROR'
  | 'STATE_INCONSISTENT';

/**
 * Validation detail for a field error.
 */
export interface ValidationDetail {
  /** The field path that failed validation. */
  readonly field: string;
  /** Description of the validation error. */
  readonly message: string;
  /** The actual value received (if safe to include). */
  readonly received?: unknown;
  /** The expected type or value. */
  readonly expected?: string;
}

/**
 * Error class for interview engine operations.
 *
 * Provides typed errors with detailed validation information
 * for programmatic error handling.
 */
export class InterviewEngineError extends Error {
  /** The error code for programmatic handling. */
  public readonly code: InterviewEngineErrorCode;
  /** Detailed validation errors when applicable. */
  public readonly validationDetails: readonly ValidationDetail[];
  /** The underlying cause if available. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new InterviewEngineError.
   *
   * @param message - Human-readable error message.
   * @param code - The error code.
   * @param options - Additional error options.
   */
  constructor(
    message: string,
    code: InterviewEngineErrorCode,
    options?: {
      validationDetails?: readonly ValidationDetail[];
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'InterviewEngineError';
    this.code = code;
    this.validationDetails = options?.validationDetails ?? [];
    this.cause = options?.cause;
  }
}

/**
 * Question types for interview questions.
 */
export type QuestionType =
  | 'open'
  | 'choice'
  | 'confirmation'
  | 'delegation'
  | 'approval'
  | 'feature_classification';

/**
 * Current question presented by the interview engine.
 */
export interface CurrentQuestion {
  /** Unique identifier for the question. */
  readonly id: string;
  /** The interview phase this question belongs to. */
  readonly phase: InterviewPhase;
  /** The question type. */
  readonly type: QuestionType;
  /** The question text. */
  readonly text: string;
  /** Optional hint or guidance for the question. */
  readonly hint?: string;
  /** Available options for choice/delegation/approval questions. */
  readonly options?: readonly string[];
  /** Whether the question allows delegation. */
  readonly allowsDelegation: boolean;
  /** Category for extracted requirements. */
  readonly category: ExtractedRequirement['category'];
}

/**
 * Base response interface for all answer types.
 */
export interface BaseAnswerResponse {
  /** The phase this response is for. */
  readonly phase: InterviewPhase;
}

/**
 * Open text response.
 */
export interface OpenTextResponse extends BaseAnswerResponse {
  /** Response type identifier. */
  readonly type: 'open';
  /** The response text. */
  readonly text: string;
  /** Optional confidence level for the response. */
  readonly confidence?: ExtractedRequirement['confidence'];
}

/**
 * Delegation response.
 */
export interface DelegationAnswerResponse extends BaseAnswerResponse {
  /** Response type identifier. */
  readonly type: 'delegation';
  /** The delegation decision. */
  readonly decision: 'Continue' | 'Delegate' | 'DelegateWithNotes';
  /** Notes for DelegateWithNotes. */
  readonly notes?: string;
}

/**
 * Approval response.
 */
export interface ApprovalAnswerResponse extends BaseAnswerResponse {
  /** Response type identifier. */
  readonly type: 'approval';
  /** The approval decision. */
  readonly decision: 'Approve' | 'ApproveWithConditions' | 'RejectWithFeedback';
  /** Conditions for ApproveWithConditions. */
  readonly conditions?: readonly string[];
  /** Feedback for RejectWithFeedback. */
  readonly feedback?: string;
  /** Confirmation status for each item. */
  readonly confirmations: Readonly<Record<ConfirmationItem, boolean>>;
}

/**
 * Feature classification response for classifying features as core/foundational/bolt-on.
 */
export interface FeatureClassificationAnswerResponse extends BaseAnswerResponse {
  /** Response type identifier. */
  readonly type: 'feature_classification';
  /** The feature name being classified. */
  readonly featureName: string;
  /** Description of the feature. */
  readonly featureDescription: string;
  /** The chosen classification. */
  readonly classification: FeatureClassification;
  /** Optional rationale for the classification. */
  readonly rationale?: string;
}

/**
 * Union type for all answer responses.
 */
export type AnswerResponse =
  | OpenTextResponse
  | DelegationAnswerResponse
  | ApprovalAnswerResponse
  | FeatureClassificationAnswerResponse;

/**
 * Result of an answer operation.
 */
export interface AnswerResult {
  /** Whether the answer was accepted. */
  readonly accepted: boolean;
  /** The updated interview state. */
  readonly state: InterviewState;
  /** The next question, if any. */
  readonly nextQuestion?: CurrentQuestion;
  /** Whether the interview is complete. */
  readonly complete: boolean;
  /** Phases that need to be revisited (for conditional approval). */
  readonly phasesToRevisit?: readonly InterviewPhase[];
  /** Error message if answer was not accepted. */
  readonly error?: string;
}

/**
 * Interview engine state snapshot for external access.
 */
export interface InterviewEngineState {
  /** Whether the engine has been started. */
  readonly started: boolean;
  /** The underlying interview state, if started. */
  readonly interviewState?: InterviewState;
  /** The current question, if any. */
  readonly currentQuestion?: CurrentQuestion;
  /** Whether the interview is complete. */
  readonly complete: boolean;
  /** All extracted requirements. */
  readonly requirements: readonly ExtractedRequirement[];
}

/**
 * Phase questions for the interview.
 */
const PHASE_QUESTIONS: Record<InterviewPhase, { text: string; hint?: string }> = {
  Discovery: {
    text: 'What would you like to build? Describe your project and its core features.',
    hint: 'Include the main purpose, key functionality, and target users.',
  },
  Architecture: {
    text: 'How should the system be structured? Describe the main components and their interactions.',
    hint: 'Consider services, data stores, APIs, and external integrations.',
  },
  Constraints: {
    text: 'What constraints or limitations should the system respect?',
    hint: 'Consider performance, security, compatibility, scalability, and compliance requirements.',
  },
  DesignPreferences: {
    text: 'Do you have any preferences for implementation style, patterns, or conventions?',
    hint: 'Include coding style, testing approaches, documentation requirements.',
  },
  Synthesis: {
    text: 'Based on your inputs, the specification will now be synthesized. Any additional notes?',
    hint: 'This is your last chance to add context before synthesis.',
  },
  Approval: {
    text: 'Please review the specification and provide your approval decision.',
    hint: 'You can approve, approve with conditions, or reject with feedback.',
  },
};

/**
 * Creates a question ID for a phase.
 */
function createQuestionId(phase: InterviewPhase): string {
  return `q_${phase.toLowerCase()}_${String(Date.now())}`;
}

/**
 * Gets the category for a phase.
 */
function getCategoryForPhase(
  phase: InterviewPhase
): 'functional' | 'non_functional' | 'constraint' | 'preference' {
  const categoryMap: Record<
    InterviewPhase,
    'functional' | 'non_functional' | 'constraint' | 'preference'
  > = {
    Discovery: 'functional',
    Architecture: 'functional',
    Constraints: 'constraint',
    DesignPreferences: 'preference',
    Synthesis: 'functional',
    Approval: 'functional',
  };
  return categoryMap[phase];
}

/**
 * Creates a current question for a phase.
 */
function createQuestionForPhase(phase: InterviewPhase): CurrentQuestion {
  const questionDef = PHASE_QUESTIONS[phase];
  const allowsDelegation = isDelegablePhase(phase);

  // Build base question without optional hint
  const baseQuestion = {
    id: createQuestionId(phase),
    phase,
    text: questionDef.text,
    category: getCategoryForPhase(phase),
  };

  // Only add hint if it's defined
  const withHint =
    questionDef.hint !== undefined ? { ...baseQuestion, hint: questionDef.hint } : baseQuestion;

  if (phase === 'Approval') {
    return {
      ...withHint,
      type: 'approval' as const,
      options: ['Approve', 'Approve with conditions', 'Reject with feedback'],
      allowsDelegation: false,
    };
  }

  if (allowsDelegation) {
    return {
      ...withHint,
      type: 'delegation' as const,
      options: ['Continue', 'Delegate', 'Delegate with notes'],
      allowsDelegation: true,
    };
  }

  return {
    ...withHint,
    type: 'open' as const,
    allowsDelegation: false,
  };
}

/**
 * Validates that an object has the expected shape for an answer response.
 */
function validateAnswerResponseShape(
  response: unknown
): { valid: true; response: AnswerResponse } | { valid: false; details: ValidationDetail[] } {
  const details: ValidationDetail[] = [];

  // Check that response is an object
  if (response === null || typeof response !== 'object') {
    details.push({
      field: 'response',
      message: 'Response must be an object',
      received: typeof response,
      expected: 'object',
    });
    return { valid: false, details };
  }

  const obj = response as Record<string, unknown>;

  // Check for required phase field
  if (typeof obj.phase !== 'string') {
    details.push({
      field: 'phase',
      message: 'Phase must be a string',
      received: typeof obj.phase,
      expected: 'string (InterviewPhase)',
    });
  } else if (!INTERVIEW_PHASES.includes(obj.phase as InterviewPhase)) {
    details.push({
      field: 'phase',
      message: `Phase "${obj.phase}" is not a valid interview phase`,
      received: obj.phase,
      expected: `one of: ${INTERVIEW_PHASES.join(', ')}`,
    });
  }

  // Check for required type field
  if (typeof obj.type !== 'string') {
    details.push({
      field: 'type',
      message: 'Type must be a string',
      received: typeof obj.type,
      expected: "string ('open' | 'delegation' | 'approval' | 'feature_classification')",
    });
  } else {
    const validTypes = ['open', 'delegation', 'approval', 'feature_classification'];
    if (!validTypes.includes(obj.type)) {
      details.push({
        field: 'type',
        message: `Type "${obj.type}" is not valid`,
        received: obj.type,
        expected: validTypes.join(' | '),
      });
    } else {
      // Validate type-specific fields
      if (obj.type === 'open') {
        if (typeof obj.text !== 'string') {
          details.push({
            field: 'text',
            message: 'Text must be a string for open responses',
            received: typeof obj.text,
            expected: 'string',
          });
        } else if (obj.text.trim() === '') {
          details.push({
            field: 'text',
            message: 'Text cannot be empty',
            received: obj.text,
            expected: 'non-empty string',
          });
        }

        if (obj.confidence !== undefined) {
          const validConfidences = ['high', 'medium', 'low'];
          if (!validConfidences.includes(obj.confidence as string)) {
            details.push({
              field: 'confidence',
              message: 'Confidence must be high, medium, or low',
              received: obj.confidence,
              expected: validConfidences.join(' | '),
            });
          }
        }
      }

      if (obj.type === 'delegation') {
        const validDecisions = ['Continue', 'Delegate', 'DelegateWithNotes'];
        if (typeof obj.decision !== 'string' || !validDecisions.includes(obj.decision)) {
          details.push({
            field: 'decision',
            message: 'Decision must be a valid delegation decision',
            received: obj.decision,
            expected: validDecisions.join(' | '),
          });
        }

        if (obj.decision === 'DelegateWithNotes' && obj.notes !== undefined) {
          if (typeof obj.notes !== 'string') {
            details.push({
              field: 'notes',
              message: 'Notes must be a string',
              received: typeof obj.notes,
              expected: 'string',
            });
          }
        }
      }

      if (obj.type === 'approval') {
        const validDecisions = ['Approve', 'ApproveWithConditions', 'RejectWithFeedback'];
        if (typeof obj.decision !== 'string' || !validDecisions.includes(obj.decision)) {
          details.push({
            field: 'decision',
            message: 'Decision must be a valid approval decision',
            received: obj.decision,
            expected: validDecisions.join(' | '),
          });
        }

        if (obj.decision === 'ApproveWithConditions') {
          if (obj.conditions !== undefined && !Array.isArray(obj.conditions)) {
            details.push({
              field: 'conditions',
              message: 'Conditions must be an array of strings',
              received: typeof obj.conditions,
              expected: 'string[]',
            });
          }
        }

        if (obj.decision === 'RejectWithFeedback') {
          if (obj.feedback !== undefined && typeof obj.feedback !== 'string') {
            details.push({
              field: 'feedback',
              message: 'Feedback must be a string',
              received: typeof obj.feedback,
              expected: 'string',
            });
          }
        }

        // Validate confirmations
        if (obj.confirmations === undefined || typeof obj.confirmations !== 'object') {
          details.push({
            field: 'confirmations',
            message: 'Confirmations must be an object',
            received: typeof obj.confirmations,
            expected: 'Record<ConfirmationItem, boolean>',
          });
        } else if (obj.confirmations !== null) {
          const confirmations = obj.confirmations as Record<string, unknown>;
          for (const item of CONFIRMATION_ITEMS) {
            if (typeof confirmations[item] !== 'boolean') {
              details.push({
                field: `confirmations.${item}`,
                message: `Confirmation for ${item} must be a boolean`,
                received: typeof confirmations[item],
                expected: 'boolean',
              });
            }
          }
        }
      }

      if (obj.type === 'feature_classification') {
        // Validate featureName
        if (typeof obj.featureName !== 'string') {
          details.push({
            field: 'featureName',
            message: 'Feature name must be a string',
            received: typeof obj.featureName,
            expected: 'string',
          });
        } else if (obj.featureName.trim() === '') {
          details.push({
            field: 'featureName',
            message: 'Feature name cannot be empty',
            received: obj.featureName,
            expected: 'non-empty string',
          });
        }

        // Validate featureDescription
        if (typeof obj.featureDescription !== 'string') {
          details.push({
            field: 'featureDescription',
            message: 'Feature description must be a string',
            received: typeof obj.featureDescription,
            expected: 'string',
          });
        } else if (obj.featureDescription.trim() === '') {
          details.push({
            field: 'featureDescription',
            message: 'Feature description cannot be empty',
            received: obj.featureDescription,
            expected: 'non-empty string',
          });
        }

        // Validate classification
        if (typeof obj.classification !== 'string') {
          details.push({
            field: 'classification',
            message: 'Classification must be a string',
            received: typeof obj.classification,
            expected: `string (${FEATURE_CLASSIFICATIONS.join(' | ')})`,
          });
        } else if (!isValidFeatureClassification(obj.classification)) {
          details.push({
            field: 'classification',
            message: `Classification "${obj.classification}" is not valid`,
            received: obj.classification,
            expected: FEATURE_CLASSIFICATIONS.join(' | '),
          });
        }

        // Validate optional rationale
        if (obj.rationale !== undefined && typeof obj.rationale !== 'string') {
          details.push({
            field: 'rationale',
            message: 'Rationale must be a string if provided',
            received: typeof obj.rationale,
            expected: 'string | undefined',
          });
        }
      }
    }
  }

  if (details.length > 0) {
    return { valid: false, details };
  }

  return { valid: true, response: obj as unknown as AnswerResponse };
}

/**
 * Programmatic interview engine for the Ignition phase.
 *
 * Provides a clean API for automated and testable interview processes.
 *
 * @example
 * ```typescript
 * const engine = new InterviewEngine('my-project');
 *
 * // Start a new interview
 * const startResult = await engine.start();
 * console.log(startResult.currentQuestion);
 *
 * // Answer a question
 * const answerResult = await engine.answer({
 *   phase: 'Discovery',
 *   type: 'open',
 *   text: 'I want to build a task management app'
 * });
 *
 * // Get current state
 * const state = engine.getState();
 * console.log(state.requirements);
 *
 * // Resume an existing interview
 * const resumeResult = await engine.resume();
 * ```
 */
export class InterviewEngine {
  private readonly projectId: string;
  private state: InterviewState | undefined;
  private currentQuestion: CurrentQuestion | undefined;
  private started = false;

  /**
   * Creates a new InterviewEngine instance.
   *
   * @param projectId - The project identifier.
   */
  constructor(projectId: string) {
    if (typeof projectId !== 'string' || projectId.trim() === '') {
      throw new InterviewEngineError(
        'Project ID must be a non-empty string',
        'INVALID_RESPONSE_SHAPE',
        {
          validationDetails: [
            {
              field: 'projectId',
              message: 'Project ID must be a non-empty string',
              received: projectId,
              expected: 'non-empty string',
            },
          ],
        }
      );
    }
    this.projectId = projectId.trim();
  }

  /**
   * Gets the project ID.
   *
   * @returns The project identifier.
   */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Starts a new interview.
   *
   * Creates initial state and returns the first question.
   *
   * @returns The start result with the first question.
   * @throws InterviewEngineError if an interview already exists.
   */
  async start(): Promise<AnswerResult> {
    // Check if interview already exists
    const exists = await interviewStateExists(this.projectId);
    if (exists) {
      // Load existing state and resume instead
      return this.resume();
    }

    // Create initial state
    this.state = createInitialInterviewState(this.projectId);
    await saveInterviewState(this.state);

    // Create first question
    this.currentQuestion = createQuestionForPhase(this.state.currentPhase);
    this.started = true;

    // Record start in transcript
    const entry = createTranscriptEntry(this.state.currentPhase, 'system', 'Interview started');
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

    return {
      accepted: true,
      state: this.state,
      nextQuestion: this.currentQuestion,
      complete: false,
    };
  }

  /**
   * Answers the current question.
   *
   * @param response - The answer response.
   * @returns The answer result.
   * @throws InterviewEngineError if the response is invalid.
   */
  async answer(response: unknown): Promise<AnswerResult> {
    // Validate engine is started
    if (!this.started || this.state === undefined) {
      throw new InterviewEngineError(
        'Interview engine not started. Call start() or resume() first.',
        'ENGINE_NOT_STARTED'
      );
    }

    // Check if interview is complete
    if (isInterviewComplete(this.state)) {
      throw new InterviewEngineError('Interview is already complete.', 'INTERVIEW_COMPLETE');
    }

    // Validate response shape
    const validation = validateAnswerResponseShape(response);
    if (!validation.valid) {
      throw new InterviewEngineError('Invalid response shape', 'INVALID_RESPONSE_SHAPE', {
        validationDetails: validation.details,
      });
    }

    const validResponse = validation.response;

    // Validate response phase matches current phase
    if (validResponse.phase !== this.state.currentPhase) {
      throw new InterviewEngineError(
        `Response phase "${validResponse.phase}" does not match current phase "${this.state.currentPhase}"`,
        'INVALID_PHASE',
        {
          validationDetails: [
            {
              field: 'phase',
              message: 'Response phase must match current interview phase',
              received: validResponse.phase,
              expected: this.state.currentPhase,
            },
          ],
        }
      );
    }

    // Process based on response type
    if (validResponse.type === 'delegation') {
      return this.processDelegationResponse(validResponse);
    }

    if (validResponse.type === 'approval') {
      return this.processApprovalResponse(validResponse);
    }

    if (validResponse.type === 'feature_classification') {
      return this.processFeatureClassificationResponse(validResponse);
    }

    // Process open text response
    return this.processOpenTextResponse(validResponse);
  }

  /**
   * Gets the current interview state.
   *
   * @returns The interview engine state snapshot.
   */
  getState(): InterviewEngineState {
    const base = {
      started: this.started,
      complete: this.state !== undefined && isInterviewComplete(this.state),
      requirements: this.state?.extractedRequirements ?? [],
    };

    // Conditionally add optional properties to avoid exactOptionalPropertyTypes issues
    if (this.state !== undefined && this.currentQuestion !== undefined) {
      return { ...base, interviewState: this.state, currentQuestion: this.currentQuestion };
    }
    if (this.state !== undefined) {
      return { ...base, interviewState: this.state };
    }
    if (this.currentQuestion !== undefined) {
      return { ...base, currentQuestion: this.currentQuestion };
    }
    return base;
  }

  /**
   * Resumes an existing interview.
   *
   * Loads state from persistence and returns the current question.
   *
   * @returns The resume result with the current question.
   * @throws InterviewEngineError if no interview exists or state is corrupted.
   */
  async resume(): Promise<AnswerResult> {
    try {
      // Load existing state
      this.state = await loadInterviewState(this.projectId);
      this.started = true;

      // Check if already complete
      if (isInterviewComplete(this.state)) {
        this.currentQuestion = undefined;
        return {
          accepted: true,
          state: this.state,
          complete: true,
        };
      }

      // Create question for current phase
      this.currentQuestion = createQuestionForPhase(this.state.currentPhase);

      // Record resume in transcript
      const entry = createTranscriptEntry(
        this.state.currentPhase,
        'system',
        `Interview resumed at ${this.state.currentPhase} phase`
      );
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

      return {
        accepted: true,
        state: this.state,
        nextQuestion: this.currentQuestion,
        complete: false,
      };
    } catch (error) {
      if (error instanceof InterviewPersistenceError) {
        throw new InterviewEngineError(
          `Failed to resume interview: ${error.message}`,
          'PERSISTENCE_ERROR',
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Gets the transcript entries.
   *
   * @returns The transcript entries.
   */
  async getTranscript(): Promise<readonly TranscriptEntry[]> {
    return loadTranscript(this.projectId);
  }

  /**
   * Processes an open text response.
   */
  private async processOpenTextResponse(response: OpenTextResponse): Promise<AnswerResult> {
    if (this.state === undefined) {
      throw new InterviewEngineError('State is undefined', 'STATE_INCONSISTENT');
    }

    const phase = this.state.currentPhase;
    const confidence = response.confidence ?? 'medium';

    // Create extracted requirement
    const requirement = createExtractedRequirement(
      phase,
      getCategoryForPhase(phase),
      response.text,
      confidence
    );

    // Create transcript entries
    const userEntry = createTranscriptEntry(phase, 'user', response.text);
    const systemEntry = createTranscriptEntry(
      phase,
      'system',
      `Recorded requirement: "${response.text.substring(0, 50)}${response.text.length > 50 ? '...' : ''}"`
    );

    // Update state with requirement
    this.state = {
      ...this.state,
      extractedRequirements: [...this.state.extractedRequirements, requirement],
      updatedAt: new Date().toISOString(),
    };

    // Persist entries and update count atomically
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, userEntry, this.state);
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, systemEntry, this.state);

    // Advance to next phase
    return this.advancePhase();
  }

  /**
   * Processes a delegation response.
   */
  private async processDelegationResponse(
    response: DelegationAnswerResponse
  ): Promise<AnswerResult> {
    if (this.state === undefined) {
      throw new InterviewEngineError('State is undefined', 'STATE_INCONSISTENT');
    }

    const phase = this.state.currentPhase;

    // Validate phase allows delegation
    if (!isDelegablePhase(phase)) {
      throw new InterviewEngineError(
        `Phase "${phase}" does not allow delegation`,
        'INVALID_DELEGATION',
        {
          validationDetails: [
            {
              field: 'phase',
              message: 'This phase is required and cannot be delegated',
              received: phase,
              expected: `one of: ${DELEGABLE_PHASES.join(', ')}`,
            },
          ],
        }
      );
    }

    // Handle 'Continue' - return open-text question for the same phase
    if (response.decision === 'Continue') {
      // Create a transcript entry for the decision
      const entry = createTranscriptEntry(phase, 'user', '[Decision] Continue providing input');
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

      // Convert delegation question to open-text variant (no delegation options)
      if (this.currentQuestion !== undefined) {
        // Build open-text question from current question, omitting delegation-specific fields
        const openTextQuestion: CurrentQuestion = {
          id: this.currentQuestion.id,
          phase: this.currentQuestion.phase,
          type: 'open',
          text: this.currentQuestion.text,
          allowsDelegation: false,
          category: this.currentQuestion.category,
          // Only include hint if present
          ...(this.currentQuestion.hint !== undefined ? { hint: this.currentQuestion.hint } : {}),
        };

        // Update current question to open-text variant
        this.currentQuestion = openTextQuestion;

        return {
          accepted: true,
          state: this.state,
          nextQuestion: openTextQuestion,
          complete: false,
        };
      }
      return {
        accepted: true,
        state: this.state,
        complete: false,
      };
    }

    // Create delegation point
    const delegationPoint = createDelegationPoint(phase, response.decision, response.notes);

    // Create transcript entries
    const notes = response.notes;
    const userEntry = createTranscriptEntry(
      phase,
      'user',
      `[Delegation] ${response.decision}${notes !== undefined && notes !== '' ? `: ${notes}` : ''}`
    );
    const systemEntry = createTranscriptEntry(
      phase,
      'system',
      `Phase "${phase}" delegated to Architect`
    );

    // Update state with delegation point
    this.state = {
      ...this.state,
      delegationPoints: [...this.state.delegationPoints, { ...delegationPoint, phase }],
      updatedAt: new Date().toISOString(),
    };

    // Persist entries and update count atomically
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, userEntry, this.state);
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, systemEntry, this.state);

    // Advance to next phase
    return this.advancePhase();
  }

  /**
   * Processes an approval response.
   */
  private async processApprovalResponse(response: ApprovalAnswerResponse): Promise<AnswerResult> {
    if (this.state === undefined) {
      throw new InterviewEngineError('State is undefined', 'STATE_INCONSISTENT');
    }

    // Validate we're in the Approval phase
    if (this.state.currentPhase !== 'Approval') {
      throw new InterviewEngineError(
        `Approval response only valid in Approval phase, current phase is "${this.state.currentPhase}"`,
        'INVALID_APPROVAL'
      );
    }

    // Convert to ApprovalResponse format for validation
    // Conditionally build to handle exactOptionalPropertyTypes
    const approvalBase = {
      decision: response.decision,
      confirmations: response.confirmations,
    };
    const approvalResponse: ApprovalResponse =
      response.conditions !== undefined && response.feedback !== undefined
        ? { ...approvalBase, conditions: response.conditions, feedback: response.feedback }
        : response.conditions !== undefined
          ? { ...approvalBase, conditions: response.conditions }
          : response.feedback !== undefined
            ? { ...approvalBase, feedback: response.feedback }
            : approvalBase;

    // Validate approval response
    const validation = validateApprovalResponse(approvalResponse);
    if (!validation.valid) {
      throw new InterviewEngineError(
        `Invalid approval response: ${validation.errors.join('; ')}`,
        'INVALID_APPROVAL',
        {
          validationDetails: validation.errors.map((error) => ({
            field: 'approval',
            message: error,
          })),
        }
      );
    }

    // Create transcript entry
    let content = `[Approval] ${response.decision}`;
    if (response.conditions !== undefined && response.conditions.length > 0) {
      content += `\nConditions: ${response.conditions.join(', ')}`;
    }
    const feedback = response.feedback;
    if (feedback !== undefined && feedback !== '') {
      content += `\nFeedback: ${feedback}`;
    }
    const userEntry = createTranscriptEntry('Approval', 'user', content);
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, userEntry, this.state);

    if (response.decision === 'Approve') {
      // Complete the interview
      this.state = {
        ...this.state,
        completedPhases: [...this.state.completedPhases, 'Approval'],
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(this.state);
      this.currentQuestion = undefined;

      return {
        accepted: true,
        state: this.state,
        complete: true,
      };
    }

    if (response.decision === 'ApproveWithConditions') {
      // Determine phases to revisit
      const phasesToRevisit = getPhasesToRevisit(response.conditions ?? []);

      if (phasesToRevisit.length === 0) {
        // No phases to revisit, consider it approved
        this.state = {
          ...this.state,
          completedPhases: [...this.state.completedPhases, 'Approval'],
          updatedAt: new Date().toISOString(),
        };
        await saveInterviewState(this.state);
        this.currentQuestion = undefined;

        return {
          accepted: true,
          state: this.state,
          complete: true,
          phasesToRevisit: [],
        };
      }

      // Reset to earliest phase that needs revisiting
      const targetPhase = phasesToRevisit[0];
      if (targetPhase !== undefined) {
        this.state = resetToPhase(this.state, targetPhase);
        await saveInterviewState(this.state);
        this.currentQuestion = createQuestionForPhase(this.state.currentPhase);
      }

      // Return with conditionally added nextQuestion to satisfy exactOptionalPropertyTypes
      const nextQuestion = this.currentQuestion;
      if (nextQuestion !== undefined) {
        return {
          accepted: true,
          state: this.state,
          nextQuestion,
          complete: false,
          phasesToRevisit,
        };
      }
      return {
        accepted: true,
        state: this.state,
        complete: false,
        phasesToRevisit,
      };
    }

    // RejectWithFeedback - reset to Discovery
    this.state = resetToPhase(this.state, 'Discovery');
    await saveInterviewState(this.state);
    const discoveryQuestion = createQuestionForPhase('Discovery');
    this.currentQuestion = discoveryQuestion;

    return {
      accepted: true,
      state: this.state,
      nextQuestion: discoveryQuestion,
      complete: false,
      phasesToRevisit: INTERVIEW_PHASES.filter((p) => p !== 'Synthesis' && p !== 'Approval'),
    };
  }

  /**
   * Processes a feature classification response.
   */
  private async processFeatureClassificationResponse(
    response: FeatureClassificationAnswerResponse
  ): Promise<AnswerResult> {
    if (this.state === undefined) {
      throw new InterviewEngineError('State is undefined', 'STATE_INCONSISTENT');
    }

    const phase = this.state.currentPhase;

    // Create the feature
    const feature = createFeature(
      response.featureName,
      response.featureDescription,
      response.classification,
      phase,
      response.rationale
    );

    // Create transcript entries
    const transcriptEntries = createFeatureClassificationTranscriptEntries(
      response.featureName,
      response.classification,
      response.rationale
    );

    // Update state with new feature
    this.state = {
      ...this.state,
      features: [...this.state.features, feature],
      updatedAt: new Date().toISOString(),
    };

    // Persist entries and update count atomically
    for (const entry of transcriptEntries) {
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);
    }

    // Return with same phase question - user can add more features or answer to main phase question
    // The engine doesn't automatically advance after feature classification
    const currentQ = this.currentQuestion;
    if (currentQ !== undefined) {
      return {
        accepted: true,
        state: this.state,
        nextQuestion: currentQ,
        complete: false,
      };
    }

    return {
      accepted: true,
      state: this.state,
      complete: false,
    };
  }

  /**
   * Advances to the next phase.
   */
  private async advancePhase(): Promise<AnswerResult> {
    if (this.state === undefined) {
      throw new InterviewEngineError('State is undefined', 'STATE_INCONSISTENT');
    }

    const currentPhase = this.state.currentPhase;
    const nextPhase = getNextInterviewPhase(currentPhase);

    if (nextPhase === undefined) {
      // Interview complete (shouldn't happen in normal flow)
      this.state = {
        ...this.state,
        completedPhases: [...this.state.completedPhases, currentPhase],
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(this.state);
      this.currentQuestion = undefined;

      return {
        accepted: true,
        state: this.state,
        complete: true,
      };
    }

    // Update state to next phase
    this.state = {
      ...this.state,
      currentPhase: nextPhase,
      completedPhases: [...this.state.completedPhases, currentPhase],
      updatedAt: new Date().toISOString(),
    };
    await saveInterviewState(this.state);

    // Check if interview is now complete
    if (isInterviewComplete(this.state)) {
      this.currentQuestion = undefined;
      return {
        accepted: true,
        state: this.state,
        complete: true,
      };
    }

    // Create question for next phase
    const nextQuestion = createQuestionForPhase(nextPhase);
    this.currentQuestion = nextQuestion;

    // Record phase transition
    const entry = createTranscriptEntry(nextPhase, 'system', `Advanced to ${nextPhase} phase`);
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

    return {
      accepted: true,
      state: this.state,
      nextQuestion,
      complete: false,
    };
  }
}
