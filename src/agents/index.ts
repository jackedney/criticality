/**
 * Agent skills and permissions module for the Criticality Protocol.
 *
 * @packageDocumentation
 */

// Types
export type {
  SkillPermissions,
  AgentRole,
  SkillName,
  SkillDefinition,
  PermissionCheckResult,
  SkillAvailabilityResult,
} from './types.js';

export { AGENT_ROLES, SKILL_NAMES } from './types.js';

export { SkillPermissionError, SkillPhaseError, SkillNotFoundError } from './types.js';

// Registry
export {
  SKILL_DEFINITIONS,
  SkillRegistry,
  skillRegistry,
  getMissingPermissions,
  createFullPermissions,
  createReadOnlyPermissions,
  createReadWritePermissions,
  createNoPermissions,
} from './registry.js';
