/**
 * Agent skills registry for the Criticality Protocol.
 *
 * Defines all skills from Specification 8.2 with their phase assignments,
 * roles, and required permissions.
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from '../protocol/types.js';
import type {
  SkillDefinition,
  SkillName,
  SkillPermissions,
  PermissionCheckResult,
  SkillAvailabilityResult,
} from './types.js';
import { SkillPermissionError, SkillPhaseError, SkillNotFoundError, SKILL_NAMES } from './types.js';

/**
 * All skill definitions from Specification 8.2.
 *
 * Skills are organized by phase:
 * - Ignition: conduct_interview, synthesize_spec, audit_proposal
 * - Lattice: generate_witness, scaffold_module
 * - Injection: implement_atomic
 * - Mass Defect: detect_smells, apply_pattern
 */
export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // Ignition Phase Skills
  {
    name: 'conduct_interview',
    description: 'Orchestrates Q&A, delegates to artifact-server',
    phases: ['Ignition'],
    assignedRole: 'Architect',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: true,
    },
  },
  {
    name: 'synthesize_spec',
    description: 'Transforms transcripts to spec.toml',
    phases: ['Ignition'],
    assignedRole: 'Architect',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: false,
    },
  },
  {
    name: 'audit_proposal',
    description: 'Cross-references spec vs. decisions',
    phases: ['Ignition'],
    assignedRole: 'Auditor',
    requiredPermissions: {
      canRead: true,
      canWrite: false,
      canNet: false,
    },
  },
  // Lattice Phase Skills
  {
    name: 'generate_witness',
    description: 'Creates type-witness definitions',
    phases: ['Lattice'],
    assignedRole: 'Structurer',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: false,
    },
  },
  {
    name: 'scaffold_module',
    description: 'Creates file structures & todo!() sigs',
    phases: ['Lattice'],
    assignedRole: 'Structurer',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: false,
    },
  },
  // Injection Phase Skills
  {
    name: 'implement_atomic',
    description: 'Core loop: Read sig -> Write code -> Test -> Commit',
    phases: ['Injection'],
    assignedRole: 'Worker',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: false,
    },
  },
  // Mass Defect Phase Skills
  {
    name: 'detect_smells',
    description: 'Runs static analysis',
    phases: ['MassDefect'],
    assignedRole: 'Refiner',
    requiredPermissions: {
      canRead: true,
      canWrite: false,
      canNet: false,
    },
  },
  {
    name: 'apply_pattern',
    description: 'Applies refactoring patterns',
    phases: ['MassDefect'],
    assignedRole: 'Refiner',
    requiredPermissions: {
      canRead: true,
      canWrite: true,
      canNet: false,
    },
  },
] as const;

/**
 * Skill registry providing lookup and validation operations.
 */
export class SkillRegistry {
  private readonly skills: ReadonlyMap<SkillName, SkillDefinition>;

  /**
   * Creates a new skill registry with the default skill definitions.
   */
  constructor() {
    const skillMap = new Map<SkillName, SkillDefinition>();
    for (const skill of SKILL_DEFINITIONS) {
      skillMap.set(skill.name, skill);
    }
    this.skills = skillMap;
  }

  /**
   * Gets a skill definition by name.
   *
   * @param name - The skill name to look up.
   * @returns The skill definition.
   * @throws {SkillNotFoundError} If the skill is not found.
   */
  getSkill(name: SkillName): SkillDefinition {
    const skill = this.skills.get(name);
    if (skill === undefined) {
      throw new SkillNotFoundError(name);
    }
    return skill;
  }

  /**
   * Gets a skill definition by name, returning undefined if not found.
   *
   * @param name - The skill name to look up.
   * @returns The skill definition or undefined.
   */
  tryGetSkill(name: string): SkillDefinition | undefined {
    if (!this.isValidSkillName(name)) {
      return undefined;
    }
    return this.skills.get(name);
  }

  /**
   * Checks if a string is a valid skill name.
   *
   * @param name - The name to check.
   * @returns True if the name is a valid skill name.
   */
  isValidSkillName(name: string): name is SkillName {
    return SKILL_NAMES.includes(name as SkillName);
  }

  /**
   * Gets all skill definitions.
   *
   * @returns An array of all skill definitions.
   */
  getAllSkills(): readonly SkillDefinition[] {
    return SKILL_DEFINITIONS;
  }

  /**
   * Gets skills available in a specific phase.
   *
   * @param phase - The protocol phase.
   * @returns Skills available in that phase.
   */
  getSkillsByPhase(phase: ProtocolPhase): readonly SkillDefinition[] {
    return SKILL_DEFINITIONS.filter((skill) => skill.phases.includes(phase));
  }

  /**
   * Checks if a skill is available in a given phase.
   *
   * @param skillName - The skill to check.
   * @param currentPhase - The current protocol phase.
   * @returns Result indicating availability and any issues.
   */
  checkSkillAvailability(
    skillName: SkillName,
    currentPhase: ProtocolPhase
  ): SkillAvailabilityResult {
    const skill = this.skills.get(skillName);
    if (skill === undefined) {
      return {
        available: false,
        skill: skillName,
        error: `Skill '${skillName}' not found in registry`,
      };
    }

    if (!skill.phases.includes(currentPhase)) {
      return {
        available: false,
        skill: skillName,
        currentPhase,
        allowedPhases: skill.phases,
        error: `Skill '${skillName}' is not available in phase '${currentPhase}'`,
      };
    }

    return {
      available: true,
      skill: skillName,
    };
  }

  /**
   * Checks if the given permissions satisfy a skill's requirements.
   *
   * @param skillName - The skill to check.
   * @param availablePermissions - The permissions available to the agent.
   * @returns Result indicating whether permissions are sufficient.
   */
  checkPermissions(
    skillName: SkillName,
    availablePermissions: SkillPermissions
  ): PermissionCheckResult {
    const skill = this.skills.get(skillName);
    if (skill === undefined) {
      return {
        allowed: false,
        skill: skillName,
        error: `Skill '${skillName}' not found in registry`,
      };
    }

    const missing = getMissingPermissions(skill.requiredPermissions, availablePermissions);

    if (missing.length > 0) {
      return {
        allowed: false,
        skill: skillName,
        missingPermissions: missing,
        error: `Missing permissions: ${missing.join(', ')}`,
      };
    }

    return {
      allowed: true,
      skill: skillName,
    };
  }

  /**
   * Validates that a skill can be executed with given phase and permissions.
   *
   * @param skillName - The skill to validate.
   * @param currentPhase - The current protocol phase.
   * @param availablePermissions - The permissions available to the agent.
   * @throws {SkillNotFoundError} If the skill is not found.
   * @throws {SkillPhaseError} If the skill is not available in the current phase.
   * @throws {SkillPermissionError} If the agent lacks required permissions.
   */
  validateSkillExecution(
    skillName: SkillName,
    currentPhase: ProtocolPhase,
    availablePermissions: SkillPermissions
  ): void {
    const skill = this.skills.get(skillName);
    if (skill === undefined) {
      throw new SkillNotFoundError(skillName);
    }

    if (!skill.phases.includes(currentPhase)) {
      throw new SkillPhaseError(skillName, currentPhase, skill.phases);
    }

    const missing = getMissingPermissions(skill.requiredPermissions, availablePermissions);
    if (missing.length > 0) {
      throw new SkillPermissionError(skillName, missing);
    }
  }
}

/**
 * Gets the list of permissions that are required but not available.
 *
 * @param required - The required permissions.
 * @param available - The available permissions.
 * @returns Array of missing permission names.
 */
export function getMissingPermissions(
  required: SkillPermissions,
  available: SkillPermissions
): (keyof SkillPermissions)[] {
  const missing: (keyof SkillPermissions)[] = [];

  if (required.canRead && !available.canRead) {
    missing.push('canRead');
  }
  if (required.canWrite && !available.canWrite) {
    missing.push('canWrite');
  }
  if (required.canNet && !available.canNet) {
    missing.push('canNet');
  }

  return missing;
}

/**
 * Creates a permissions object with all permissions enabled.
 *
 * @returns Permissions with canRead, canWrite, and canNet all true.
 */
export function createFullPermissions(): SkillPermissions {
  return {
    canRead: true,
    canWrite: true,
    canNet: true,
  };
}

/**
 * Creates a permissions object with only read permission.
 *
 * @returns Permissions with only canRead enabled.
 */
export function createReadOnlyPermissions(): SkillPermissions {
  return {
    canRead: true,
    canWrite: false,
    canNet: false,
  };
}

/**
 * Creates a permissions object with read and write permissions.
 *
 * @returns Permissions with canRead and canWrite enabled.
 */
export function createReadWritePermissions(): SkillPermissions {
  return {
    canRead: true,
    canWrite: true,
    canNet: false,
  };
}

/**
 * Creates a permissions object with no permissions.
 *
 * @returns Permissions with all flags false.
 */
export function createNoPermissions(): SkillPermissions {
  return {
    canRead: false,
    canWrite: false,
    canNet: false,
  };
}

/**
 * Default global skill registry instance.
 */
export const skillRegistry = new SkillRegistry();
