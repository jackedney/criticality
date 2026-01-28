/**
 * Composition Audit phase for the Criticality Protocol.
 *
 * Detects contradictions between spec constraints, function contracts, and type witnesses
 * before the Injection phase begins. This prevents impossible compositions from being
 * passed to the implementation phase.
 *
 * Key features:
 * - Temporal contradiction detection (timeouts vs operation durations)
 * - Resource contradiction detection (capacity limits vs usage)
 * - Invariant contradiction detection (conflicting state requirements)
 * - Precondition gap detection (missing prerequisites)
 * - Postcondition conflict detection (conflicting guarantees)
 * - Structured ContradictionReport for programmatic handling
 * - Report persistence to project directory for audit trails
 * - Retry logic for malformed LLM output with clarification prompts
 *
 * Uses auditor_model for initial detection and architect_model for cross-verification
 * of complex cases.
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './prompts.js';
export * from './detector.js';
export * from './report-parser.js';
export * from './report-storage.js';
