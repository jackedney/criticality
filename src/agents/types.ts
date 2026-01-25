/**
 * Agent skills and permissions types for the Criticality Protocol.
 *
 * Defines the formal registry of agent skills and their required permissions,
 * enabling explicit capability constraints by protocol phase.
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from '../protocol/types.js';

/**
 * Permission flags that constrain agent capabilities.
 *
 * @remarks
 * These permissions follow the Principle of Least Privilege:
 * - `canRead`: Ability to read files and artifacts
 * - `canWrite`: Ability to write/modify files and artifacts
 * - `canNet`: Ability to make network requests (search, APIs)
 */
export interface SkillPermissions {
  /** Permission to read files and artifacts. */
  readonly canRead: boolean;
  /** Permission to write/modify files and artifacts. */
  readonly canWrite: boolean;
  /** Permission to make network requests. */
  readonly canNet: boolean;
}

/**
 * Agent roles as defined in the Subagent Swarm specification.
 *
 * @remarks
 * Each role has specific access policies:
 * - Architect: High Reasoning, Low Execution. Can read/write Specs, can Search.
 * - Auditor: Read-Only. "Devil's Advocate". No write access to code.
 * - Structurer: Structure Only. Writes files/types. No logic implementation.
 * - Worker: Stateless Coder. Sees ONE function at a time. No Spec access. No Internet.
 * - Refiner: Refactoring. Runs static analysis and applies patterns.
 * - Guardian: Security Scan. Runs alongside Worker.
 */
export type AgentRole = 'Architect' | 'Auditor' | 'Structurer' | 'Worker' | 'Refiner' | 'Guardian';

/**
 * All agent roles in the system.
 */
export const AGENT_ROLES: readonly AgentRole[] = [
  'Architect',
  'Auditor',
  'Structurer',
  'Worker',
  'Refiner',
  'Guardian',
] as const;

/**
 * Skill names as defined in Specification 8.2.
 */
export type SkillName =
  | 'conduct_interview'
  | 'synthesize_spec'
  | 'audit_proposal'
  | 'generate_witness'
  | 'scaffold_module'
  | 'implement_atomic'
  | 'detect_smells'
  | 'apply_pattern';

/**
 * All skill names in the system.
 */
export const SKILL_NAMES: readonly SkillName[] = [
  'conduct_interview',
  'synthesize_spec',
  'audit_proposal',
  'generate_witness',
  'scaffold_module',
  'implement_atomic',
  'detect_smells',
  'apply_pattern',
] as const;

/**
 * Definition of a skill in the agent skills registry.
 *
 * @remarks
 * Skills are grouped by phase and assigned strict permissions.
 * Each skill specifies:
 * - The phase(s) in which it can be used
 * - The role that executes the skill
 * - The permissions required to execute the skill
 *
 * @example
 * ```typescript
 * const implementAtomic: SkillDefinition = {
 *   name: 'implement_atomic',
 *   description: 'Core loop: Read sig -> Write code -> Test -> Commit',
 *   phases: ['Injection'],
 *   assignedRole: 'Worker',
 *   requiredPermissions: {
 *     canRead: true,
 *     canWrite: true,
 *     canNet: false,
 *   },
 * };
 * ```
 */
export interface SkillDefinition {
  /** Unique skill identifier. */
  readonly name: SkillName;
  /** Human-readable description of what the skill does. */
  readonly description: string;
  /** Protocol phases in which this skill can be used. */
  readonly phases: readonly ProtocolPhase[];
  /** Agent role assigned to execute this skill. */
  readonly assignedRole: AgentRole;
  /** Permissions required to execute this skill. */
  readonly requiredPermissions: SkillPermissions;
}

/**
 * Result of a permission check operation.
 */
export interface PermissionCheckResult {
  /** Whether the permission check passed. */
  readonly allowed: boolean;
  /** The skill that was checked. */
  readonly skill: SkillName;
  /** Missing permissions if check failed. */
  readonly missingPermissions?: readonly (keyof SkillPermissions)[];
  /** Error message if check failed. */
  readonly error?: string;
}

/**
 * Result of a skill availability check.
 */
export interface SkillAvailabilityResult {
  /** Whether the skill is available. */
  readonly available: boolean;
  /** The skill that was checked. */
  readonly skill: SkillName;
  /** Current phase when unavailable due to phase mismatch. */
  readonly currentPhase?: ProtocolPhase;
  /** Allowed phases for the skill. */
  readonly allowedPhases?: readonly ProtocolPhase[];
  /** Error message if not available. */
  readonly error?: string;
}

/**
 * Error thrown when a skill is requested without required permissions.
 */
export class SkillPermissionError extends Error {
  /** The skill that was requested. */
  public readonly skill: SkillName;
  /** The missing permissions. */
  public readonly missingPermissions: readonly (keyof SkillPermissions)[];

  constructor(skill: SkillName, missingPermissions: readonly (keyof SkillPermissions)[]) {
    const permList = missingPermissions.join(', ');
    super(`Skill '${skill}' requires permissions: ${permList}`);
    this.name = 'SkillPermissionError';
    this.skill = skill;
    this.missingPermissions = missingPermissions;
  }
}

/**
 * Error thrown when a skill is requested in the wrong phase.
 */
export class SkillPhaseError extends Error {
  /** The skill that was requested. */
  public readonly skill: SkillName;
  /** The current phase. */
  public readonly currentPhase: ProtocolPhase;
  /** The allowed phases for the skill. */
  public readonly allowedPhases: readonly ProtocolPhase[];

  constructor(
    skill: SkillName,
    currentPhase: ProtocolPhase,
    allowedPhases: readonly ProtocolPhase[]
  ) {
    const phaseList = allowedPhases.join(', ');
    super(
      `Skill '${skill}' is not available in phase '${currentPhase}'. Allowed phases: ${phaseList}`
    );
    this.name = 'SkillPhaseError';
    this.skill = skill;
    this.currentPhase = currentPhase;
    this.allowedPhases = allowedPhases;
  }
}

/**
 * Error thrown when a skill is not found in the registry.
 */
export class SkillNotFoundError extends Error {
  /** The skill name that was not found. */
  public readonly skillName: string;

  constructor(skillName: string) {
    super(`Skill '${skillName}' not found in registry`);
    this.name = 'SkillNotFoundError';
    this.skillName = skillName;
  }
}
