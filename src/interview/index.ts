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
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './persistence.js';
export * from './structure.js';
