/**
 * Criticality Protocol
 *
 * A context-shedding architecture for autonomous software synthesis.
 *
 * @packageDocumentation
 */

/**
 * Protocol version string.
 */
export const VERSION = '0.1.0';

/**
 * Placeholder export to verify TypeScript compilation.
 * This will be replaced with actual protocol exports as development progresses.
 *
 * @returns A message indicating the protocol has been initialized.
 *
 * @example
 * ```typescript
 * import { placeholder } from 'criticality';
 *
 * const message = placeholder();
 * console.log(message); // "Criticality Protocol initialized"
 * ```
 */
export function placeholder(): string {
  return 'Criticality Protocol initialized';
}

/**
 * Creates a greeting message for the specified name.
 *
 * This function demonstrates proper TSDoc documentation with parameters,
 * return values, and examples.
 *
 * @param name - The name to include in the greeting.
 * @returns A greeting message string.
 *
 * @example
 * ```typescript
 * import { greet } from 'criticality';
 *
 * const greeting = greet('World');
 * console.log(greeting); // "Hello, World!"
 * ```
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

// Interview module exports for programmatic interview API
export {
  InterviewEngine,
  InterviewEngineError,
  type InterviewEngineErrorCode,
  type ValidationDetail,
  type CurrentQuestion,
  type QuestionType,
  type BaseAnswerResponse,
  type OpenTextResponse,
  type DelegationAnswerResponse,
  type ApprovalAnswerResponse,
  type AnswerResponse,
  type AnswerResult,
  type InterviewEngineState,
} from './interview/engine.js';

// Interview types for programmatic access
export {
  type InterviewState,
  type InterviewPhase,
  type DelegationDecision,
  type DelegationPoint,
  type ExtractedRequirement,
  type TranscriptEntry,
  type TranscriptRole,
  INTERVIEW_PHASES,
  INTERVIEW_STATE_VERSION,
  isValidInterviewPhase,
  getInterviewPhaseIndex,
  getNextInterviewPhase,
  isInterviewComplete,
  createInitialInterviewState,
  createTranscriptEntry,
} from './interview/types.js';
