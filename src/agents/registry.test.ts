/**
 * Tests for Agent Skills Registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SKILL_DEFINITIONS,
  SkillRegistry,
  skillRegistry,
  getMissingPermissions,
  createFullPermissions,
  createReadOnlyPermissions,
  createReadWritePermissions,
  createNoPermissions,
} from './registry.js';
import {
  SKILL_NAMES,
  AGENT_ROLES,
  SkillPermissionError,
  SkillPhaseError,
  SkillNotFoundError,
} from './types.js';
import type { SkillPermissions, SkillName } from './types.js';

describe('Agent Skills Registry', () => {
  describe('SKILL_DEFINITIONS', () => {
    it('contains all skills from Specification 8.2', () => {
      const skillNames = SKILL_DEFINITIONS.map((s) => s.name);
      expect(skillNames).toEqual(SKILL_NAMES);
    });

    it('has exactly 8 skills', () => {
      expect(SKILL_DEFINITIONS).toHaveLength(8);
    });

    it('all skills have valid agent roles', () => {
      for (const skill of SKILL_DEFINITIONS) {
        expect(AGENT_ROLES).toContain(skill.assignedRole);
      }
    });

    it('all skills have at least one phase', () => {
      for (const skill of SKILL_DEFINITIONS) {
        expect(skill.phases.length).toBeGreaterThan(0);
      }
    });

    it('all skills have required permission fields', () => {
      for (const skill of SKILL_DEFINITIONS) {
        expect(typeof skill.requiredPermissions.canRead).toBe('boolean');
        expect(typeof skill.requiredPermissions.canWrite).toBe('boolean');
        expect(typeof skill.requiredPermissions.canNet).toBe('boolean');
      }
    });
  });

  describe('Ignition Phase Skills', () => {
    it('conduct_interview is assigned to Architect with full permissions', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'conduct_interview');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Architect');
      expect(skill?.phases).toContain('Ignition');
      expect(skill?.requiredPermissions.canRead).toBe(true);
      expect(skill?.requiredPermissions.canWrite).toBe(true);
      expect(skill?.requiredPermissions.canNet).toBe(true);
    });

    it('synthesize_spec is assigned to Architect without network', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'synthesize_spec');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Architect');
      expect(skill?.phases).toContain('Ignition');
      expect(skill?.requiredPermissions.canNet).toBe(false);
    });

    it('audit_proposal is assigned to Auditor (read-only)', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'audit_proposal');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Auditor');
      expect(skill?.phases).toContain('Ignition');
      expect(skill?.requiredPermissions.canRead).toBe(true);
      expect(skill?.requiredPermissions.canWrite).toBe(false);
      expect(skill?.requiredPermissions.canNet).toBe(false);
    });
  });

  describe('Lattice Phase Skills', () => {
    it('generate_witness is assigned to Structurer', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'generate_witness');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Structurer');
      expect(skill?.phases).toContain('Lattice');
    });

    it('scaffold_module is assigned to Structurer', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'scaffold_module');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Structurer');
      expect(skill?.phases).toContain('Lattice');
    });
  });

  describe('Injection Phase Skills', () => {
    it('implement_atomic is assigned to Worker with canWrite permission', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'implement_atomic');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Worker');
      expect(skill?.phases).toContain('Injection');
      expect(skill?.requiredPermissions.canWrite).toBe(true);
      expect(skill?.requiredPermissions.canNet).toBe(false);
    });
  });

  describe('MassDefect Phase Skills', () => {
    it('detect_smells is assigned to Refiner (read-only)', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'detect_smells');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Refiner');
      expect(skill?.phases).toContain('MassDefect');
      expect(skill?.requiredPermissions.canRead).toBe(true);
      expect(skill?.requiredPermissions.canWrite).toBe(false);
    });

    it('apply_pattern is assigned to Refiner with write permission', () => {
      const skill = SKILL_DEFINITIONS.find((s) => s.name === 'apply_pattern');
      expect(skill).toBeDefined();
      expect(skill?.assignedRole).toBe('Refiner');
      expect(skill?.phases).toContain('MassDefect');
      expect(skill?.requiredPermissions.canWrite).toBe(true);
    });
  });

  describe('SkillRegistry', () => {
    let registry: SkillRegistry;

    beforeEach(() => {
      registry = new SkillRegistry();
    });

    describe('getSkill', () => {
      it('returns skill definition for valid skill name', () => {
        const skill = registry.getSkill('implement_atomic');
        expect(skill.name).toBe('implement_atomic');
        expect(skill.assignedRole).toBe('Worker');
      });

      it('throws SkillNotFoundError for invalid skill name', () => {
        expect(() => registry.getSkill('nonexistent' as SkillName)).toThrow(SkillNotFoundError);
      });
    });

    describe('tryGetSkill', () => {
      it('returns skill definition for valid skill name', () => {
        const skill = registry.tryGetSkill('conduct_interview');
        expect(skill).toBeDefined();
        expect(skill?.name).toBe('conduct_interview');
      });

      it('returns undefined for invalid skill name', () => {
        const skill = registry.tryGetSkill('nonexistent');
        expect(skill).toBeUndefined();
      });
    });

    describe('isValidSkillName', () => {
      it('returns true for valid skill names', () => {
        for (const name of SKILL_NAMES) {
          expect(registry.isValidSkillName(name)).toBe(true);
        }
      });

      it('returns false for invalid skill names', () => {
        expect(registry.isValidSkillName('invalid')).toBe(false);
        expect(registry.isValidSkillName('')).toBe(false);
        expect(registry.isValidSkillName('CONDUCT_INTERVIEW')).toBe(false);
      });
    });

    describe('getAllSkills', () => {
      it('returns all skill definitions', () => {
        const skills = registry.getAllSkills();
        expect(skills).toHaveLength(8);
        expect(skills).toEqual(SKILL_DEFINITIONS);
      });
    });

    describe('getSkillsByPhase', () => {
      it('returns Ignition phase skills', () => {
        const skills = registry.getSkillsByPhase('Ignition');
        expect(skills).toHaveLength(3);
        const names = skills.map((s) => s.name);
        expect(names).toContain('conduct_interview');
        expect(names).toContain('synthesize_spec');
        expect(names).toContain('audit_proposal');
      });

      it('returns Lattice phase skills', () => {
        const skills = registry.getSkillsByPhase('Lattice');
        expect(skills).toHaveLength(2);
        const names = skills.map((s) => s.name);
        expect(names).toContain('generate_witness');
        expect(names).toContain('scaffold_module');
      });

      it('returns Injection phase skills', () => {
        const skills = registry.getSkillsByPhase('Injection');
        expect(skills).toHaveLength(1);
        expect(skills[0]?.name).toBe('implement_atomic');
      });

      it('returns MassDefect phase skills', () => {
        const skills = registry.getSkillsByPhase('MassDefect');
        expect(skills).toHaveLength(2);
        const names = skills.map((s) => s.name);
        expect(names).toContain('detect_smells');
        expect(names).toContain('apply_pattern');
      });

      it('returns empty array for phases without skills', () => {
        const skills = registry.getSkillsByPhase('CompositionAudit');
        expect(skills).toHaveLength(0);
      });
    });

    describe('checkSkillAvailability', () => {
      it('returns available for skill in correct phase', () => {
        const result = registry.checkSkillAvailability('implement_atomic', 'Injection');
        expect(result.available).toBe(true);
        expect(result.skill).toBe('implement_atomic');
      });

      it('returns unavailable for skill in wrong phase', () => {
        const result = registry.checkSkillAvailability('implement_atomic', 'Ignition');
        expect(result.available).toBe(false);
        expect(result.skill).toBe('implement_atomic');
        expect(result.currentPhase).toBe('Ignition');
        expect(result.allowedPhases).toContain('Injection');
        expect(result.error).toBeDefined();
      });
    });

    describe('checkPermissions', () => {
      it('returns allowed when all required permissions are present', () => {
        const permissions: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: false,
        };
        const result = registry.checkPermissions('implement_atomic', permissions);
        expect(result.allowed).toBe(true);
        expect(result.skill).toBe('implement_atomic');
      });

      it('returns not allowed when canWrite is missing for implement_atomic', () => {
        const permissions: SkillPermissions = {
          canRead: true,
          canWrite: false,
          canNet: false,
        };
        const result = registry.checkPermissions('implement_atomic', permissions);
        expect(result.allowed).toBe(false);
        expect(result.missingPermissions).toContain('canWrite');
      });

      it('returns not allowed when canNet is missing for conduct_interview', () => {
        const permissions: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: false,
        };
        const result = registry.checkPermissions('conduct_interview', permissions);
        expect(result.allowed).toBe(false);
        expect(result.missingPermissions).toContain('canNet');
      });

      it('returns allowed for read-only skill with read-only permissions', () => {
        const permissions: SkillPermissions = {
          canRead: true,
          canWrite: false,
          canNet: false,
        };
        const result = registry.checkPermissions('audit_proposal', permissions);
        expect(result.allowed).toBe(true);
      });
    });

    describe('validateSkillExecution', () => {
      it('succeeds for valid skill, phase, and permissions', () => {
        const permissions: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: false,
        };
        expect(() => {
          registry.validateSkillExecution('implement_atomic', 'Injection', permissions);
        }).not.toThrow();
      });

      it('throws SkillPhaseError for skill in wrong phase', () => {
        const permissions = createFullPermissions();
        expect(() => {
          registry.validateSkillExecution('implement_atomic', 'Ignition', permissions);
        }).toThrow(SkillPhaseError);
      });

      it('throws SkillPermissionError for missing permissions', () => {
        const permissions = createReadOnlyPermissions();
        expect(() => {
          registry.validateSkillExecution('implement_atomic', 'Injection', permissions);
        }).toThrow(SkillPermissionError);
      });

      it('SkillPermissionError contains missing permissions', () => {
        const permissions = createNoPermissions();
        try {
          registry.validateSkillExecution('implement_atomic', 'Injection', permissions);
          expect.fail('Should have thrown SkillPermissionError');
        } catch (error) {
          expect(error).toBeInstanceOf(SkillPermissionError);
          const permError = error as SkillPermissionError;
          expect(permError.skill).toBe('implement_atomic');
          expect(permError.missingPermissions).toContain('canRead');
          expect(permError.missingPermissions).toContain('canWrite');
        }
      });
    });
  });

  describe('Permission Helper Functions', () => {
    describe('getMissingPermissions', () => {
      it('returns empty array when all permissions are met', () => {
        const required: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: false,
        };
        const available: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: true,
        };
        expect(getMissingPermissions(required, available)).toHaveLength(0);
      });

      it('returns missing canWrite when not available', () => {
        const required: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: false,
        };
        const available: SkillPermissions = {
          canRead: true,
          canWrite: false,
          canNet: false,
        };
        const missing = getMissingPermissions(required, available);
        expect(missing).toContain('canWrite');
        expect(missing).not.toContain('canRead');
        expect(missing).not.toContain('canNet');
      });

      it('returns multiple missing permissions', () => {
        const required: SkillPermissions = {
          canRead: true,
          canWrite: true,
          canNet: true,
        };
        const available: SkillPermissions = {
          canRead: false,
          canWrite: false,
          canNet: false,
        };
        const missing = getMissingPermissions(required, available);
        expect(missing).toHaveLength(3);
        expect(missing).toContain('canRead');
        expect(missing).toContain('canWrite');
        expect(missing).toContain('canNet');
      });

      it('does not report permissions that are not required', () => {
        const required: SkillPermissions = {
          canRead: true,
          canWrite: false,
          canNet: false,
        };
        const available: SkillPermissions = {
          canRead: true,
          canWrite: false,
          canNet: false,
        };
        expect(getMissingPermissions(required, available)).toHaveLength(0);
      });
    });

    describe('createFullPermissions', () => {
      it('creates permissions with all flags true', () => {
        const perms = createFullPermissions();
        expect(perms.canRead).toBe(true);
        expect(perms.canWrite).toBe(true);
        expect(perms.canNet).toBe(true);
      });
    });

    describe('createReadOnlyPermissions', () => {
      it('creates permissions with only canRead true', () => {
        const perms = createReadOnlyPermissions();
        expect(perms.canRead).toBe(true);
        expect(perms.canWrite).toBe(false);
        expect(perms.canNet).toBe(false);
      });
    });

    describe('createReadWritePermissions', () => {
      it('creates permissions with canRead and canWrite true', () => {
        const perms = createReadWritePermissions();
        expect(perms.canRead).toBe(true);
        expect(perms.canWrite).toBe(true);
        expect(perms.canNet).toBe(false);
      });
    });

    describe('createNoPermissions', () => {
      it('creates permissions with all flags false', () => {
        const perms = createNoPermissions();
        expect(perms.canRead).toBe(false);
        expect(perms.canWrite).toBe(false);
        expect(perms.canNet).toBe(false);
      });
    });
  });

  describe('Global skillRegistry instance', () => {
    it('is a SkillRegistry instance', () => {
      expect(skillRegistry).toBeInstanceOf(SkillRegistry);
    });

    it('can retrieve skills', () => {
      const skill = skillRegistry.getSkill('implement_atomic');
      expect(skill.name).toBe('implement_atomic');
    });
  });

  describe('Acceptance Criteria Tests', () => {
    it('implement_atomic skill requires canWrite permission (positive)', () => {
      const skill = skillRegistry.getSkill('implement_atomic');
      expect(skill.requiredPermissions.canWrite).toBe(true);
    });

    it('implement_atomic with canWrite succeeds (positive)', () => {
      const permissions: SkillPermissions = {
        canRead: true,
        canWrite: true,
        canNet: false,
      };
      expect(() => {
        skillRegistry.validateSkillExecution('implement_atomic', 'Injection', permissions);
      }).not.toThrow();
    });

    it('requesting skill without required permissions fails (negative)', () => {
      const permissions: SkillPermissions = {
        canRead: true,
        canWrite: false, // implement_atomic requires canWrite
        canNet: false,
      };
      expect(() => {
        skillRegistry.validateSkillExecution('implement_atomic', 'Injection', permissions);
      }).toThrow(SkillPermissionError);
    });

    it('requesting skill in wrong phase fails (negative)', () => {
      const permissions = createFullPermissions();
      expect(() => {
        skillRegistry.validateSkillExecution('implement_atomic', 'Lattice', permissions);
      }).toThrow(SkillPhaseError);
    });

    it('SkillDefinition interface captures all skill properties', () => {
      const skill = skillRegistry.getSkill('conduct_interview');
      // Verify all interface properties exist
      expect(skill.name).toBe('conduct_interview');
      expect(skill.description).toBe('Orchestrates Q&A, delegates to artifact-server');
      expect(skill.phases).toContain('Ignition');
      expect(skill.assignedRole).toBe('Architect');
      expect(skill.requiredPermissions.canRead).toBe(true);
      expect(skill.requiredPermissions.canWrite).toBe(true);
      expect(skill.requiredPermissions.canNet).toBe(true);
    });
  });
});
