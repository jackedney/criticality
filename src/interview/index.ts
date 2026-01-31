/**
 * Interview state management for the Ignition phase.
 *
 * Provides types and persistence utilities for managing interview state,
 * including atomic writes, transcript append, and resume functionality.
 *
 * Also provides the interview structure implementation with:
 * - 6-phase interview process (Discovery, Architecture, Constraints, DesignPreferences, Synthesis, Approval)
 * - Delegation support for Constraints and DesignPreferences phases
 * - Conditional approval with targeted revision
 * - Contradiction detection for requirements
 * - Feature classification (core/foundational/bolt-on) for architecture decisions
 *
 * And the CLI interface for:
 * - Interactive interview prompts with clear formatting
 * - Resuming with summary display and confirmation
 * - Empty input handling with re-prompts
 *
 * And the programmatic API for:
 * - Automated and testable interview processes
 * - Structured responses matching interview question format
 * - Feature classification responses for categorizing features
 * - Typed errors with validation details
 *
 * And the adversarial auditor for:
 * - Challenging Architect proposals for logical consistency
 * - Detecting temporal contradictions, resource conflicts, invariant violations, precondition gaps
 * - Presenting findings to user with Architect responses
 * - Uses auditor_model via ModelRouter
 *
 * And the spec artifact generator for:
 * - Transforming interview requirements into spec.toml
 * - Managing proposal versions (v1.toml, v2.toml, etc.)
 * - Validating specs before writing
 * - Finalizing approved specs to project root
 * - Including feature classifications in spec output
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './persistence.js';
export * from './structure.js';
export * from './cli.js';
export * from './engine.js';
export * from './auditor.js';
export * from './spec-generator.js';
