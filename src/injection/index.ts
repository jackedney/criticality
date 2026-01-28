/**
 * Injection module - Ralph Loop for atomic function implementation.
 *
 * @packageDocumentation
 */

export {
  RalphLoop,
  createRalphLoop,
  generateImplementationPrompt,
  parseImplementationResponse,
  extractRequiredTypes,
  extractWitnessTypes,
  buildFunctionContext,
  formatRalphLoopReport,
  type FunctionContext,
  type ImplementationAttempt,
  type RalphLoopResult,
  type RalphLoopOptions,
} from './ralph-loop.js';
