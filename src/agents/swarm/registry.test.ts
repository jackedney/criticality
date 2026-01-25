/**
 * Tests for the Subagent Swarm registry.
 *
 * Verifies:
 * - Agent role definitions and access policies
 * - Principle of Least Privilege enforcement
 * - MCP server access validation
 * - Skill execution authorization
 * - Configuration validation
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmRegistry, validateSwarmConfiguration, swarmRegistry } from './registry.js';
import {
  DEFAULT_SWARM_CONFIG,
  WORKER_AGENT,
  ARCHITECT_AGENT,
  AUDITOR_AGENT,
} from './definitions.js';
import {
  UnauthorizedMCPAccessError,
  UnauthorizedSkillExecutionError,
  SwarmConfigurationError,
} from './types.js';
import type { SwarmConfiguration } from './types.js';

describe('SwarmRegistry', () => {
  let registry: SwarmRegistry;

  beforeEach(() => {
    registry = new SwarmRegistry();
  });

  describe('constructor', () => {
    it('should create registry with default configuration', () => {
      expect(registry).toBeInstanceOf(SwarmRegistry);
      expect(registry.getAllAgents()).toHaveLength(6);
    });

    it('should create registry with custom configuration', () => {
      const customConfig: SwarmConfiguration = {
        version: '1.0.0',
        agents: [WORKER_AGENT],
      };
      const customRegistry = new SwarmRegistry(customConfig);
      expect(customRegistry.getAllAgents()).toHaveLength(1);
    });

    it('should throw on invalid configuration', () => {
      const invalidConfig: SwarmConfiguration = {
        version: '1.0.0',
        agents: [
          {
            // @ts-expect-error testing invalid role
            role: 'InvalidRole',
            description: 'Invalid',
            mcpServers: [],
            assignedSkills: [],
            permissions: { canRead: true, canWrite: false, canNet: false },
          },
        ],
      };
      expect(() => new SwarmRegistry(invalidConfig)).toThrow(SwarmConfigurationError);
    });
  });

  describe('getAgent', () => {
    it('should return agent definition by role', () => {
      const worker = registry.getAgent('Worker');
      expect(worker).toBeDefined();
      expect(worker?.role).toBe('Worker');
    });

    it('should return undefined for unknown role', () => {
      // @ts-expect-error testing invalid role
      const unknown = registry.getAgent('Unknown');
      expect(unknown).toBeUndefined();
    });
  });

  describe('getAllAgents', () => {
    it('should return all agent definitions', () => {
      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(6);
      expect(agents.map((a) => a.role)).toContain('Architect');
      expect(agents.map((a) => a.role)).toContain('Auditor');
      expect(agents.map((a) => a.role)).toContain('Structurer');
      expect(agents.map((a) => a.role)).toContain('Worker');
      expect(agents.map((a) => a.role)).toContain('Refiner');
      expect(agents.map((a) => a.role)).toContain('Guardian');
    });
  });

  describe('Principle of Least Privilege - MCP Access', () => {
    describe('Worker agent restrictions', () => {
      it('should NOT allow Worker to access artifact-server (no spec access)', () => {
        const result = registry.validateMCPAccess('Worker', 'artifact-server');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not authorized');
      });

      it('should NOT allow Worker to access brave-search (no internet)', () => {
        const result = registry.validateMCPAccess('Worker', 'brave-search');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not authorized');
      });

      it('should allow Worker to access filesystem (scoped)', () => {
        const result = registry.validateMCPAccess('Worker', 'filesystem');
        expect(result.allowed).toBe(true);
      });

      it('should allow Worker to access toolchain-server', () => {
        const result = registry.validateMCPAccess('Worker', 'toolchain-server');
        expect(result.allowed).toBe(true);
      });
    });

    describe('Architect agent access', () => {
      it('should allow Architect to access artifact-server', () => {
        const result = registry.validateMCPAccess('Architect', 'artifact-server');
        expect(result.allowed).toBe(true);
      });

      it('should allow Architect to access brave-search', () => {
        const result = registry.validateMCPAccess('Architect', 'brave-search');
        expect(result.allowed).toBe(true);
      });

      it('should NOT allow Architect to access filesystem', () => {
        const result = registry.validateMCPAccess('Architect', 'filesystem');
        expect(result.allowed).toBe(false);
      });
    });

    describe('Auditor agent restrictions', () => {
      it('should allow Auditor to access artifact-server (read-only)', () => {
        const result = registry.validateMCPAccess('Auditor', 'artifact-server');
        expect(result.allowed).toBe(true);
      });

      it('should block Auditor from using append_decision tool', () => {
        const result = registry.validateMCPAccess('Auditor', 'artifact-server', 'append_decision');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('blocked');
      });

      it('should allow Auditor to read spec sections', () => {
        const result = registry.validateMCPAccess(
          'Auditor',
          'artifact-server',
          'read_spec_section'
        );
        expect(result.allowed).toBe(true);
      });

      it('should allow Auditor to access toolchain-server (read-only)', () => {
        const result = registry.validateMCPAccess('Auditor', 'toolchain-server');
        expect(result.allowed).toBe(true);
      });

      it('should block Auditor from running tests', () => {
        const result = registry.validateMCPAccess(
          'Auditor',
          'toolchain-server',
          'run_function_test'
        );
        expect(result.allowed).toBe(false);
      });
    });

    describe('Structurer agent access', () => {
      it('should allow Structurer to access filesystem', () => {
        const result = registry.validateMCPAccess('Structurer', 'filesystem');
        expect(result.allowed).toBe(true);
      });

      it('should allow Structurer to access artifact-server (read-only)', () => {
        const result = registry.validateMCPAccess('Structurer', 'artifact-server');
        expect(result.allowed).toBe(true);
      });

      it('should block Structurer from appending decisions', () => {
        const result = registry.validateMCPAccess(
          'Structurer',
          'artifact-server',
          'append_decision'
        );
        expect(result.allowed).toBe(false);
      });
    });

    describe('Guardian agent restrictions', () => {
      it('should allow Guardian to access toolchain-server (read-only)', () => {
        const result = registry.validateMCPAccess('Guardian', 'toolchain-server');
        expect(result.allowed).toBe(true);
      });

      it('should allow Guardian to access security-scanner', () => {
        const result = registry.validateMCPAccess('Guardian', 'security-scanner');
        expect(result.allowed).toBe(true);
      });

      it('should NOT allow Guardian to access filesystem', () => {
        const result = registry.validateMCPAccess('Guardian', 'filesystem');
        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('Principle of Least Privilege - Network Access', () => {
    it('Worker should NOT have network access', () => {
      expect(registry.hasNetworkAccess('Worker')).toBe(false);
    });

    it('Architect should have network access', () => {
      expect(registry.hasNetworkAccess('Architect')).toBe(true);
    });

    it('Auditor should NOT have network access', () => {
      expect(registry.hasNetworkAccess('Auditor')).toBe(false);
    });

    it('Structurer should NOT have network access', () => {
      expect(registry.hasNetworkAccess('Structurer')).toBe(false);
    });

    it('Refiner should NOT have network access', () => {
      expect(registry.hasNetworkAccess('Refiner')).toBe(false);
    });

    it('Guardian should NOT have network access', () => {
      expect(registry.hasNetworkAccess('Guardian')).toBe(false);
    });
  });

  describe('Principle of Least Privilege - Write Access', () => {
    it('Auditor should NOT have write access', () => {
      expect(registry.hasWriteAccess('Auditor')).toBe(false);
    });

    it('Guardian should NOT have write access', () => {
      expect(registry.hasWriteAccess('Guardian')).toBe(false);
    });

    it('Worker should have write access (for implementing code)', () => {
      expect(registry.hasWriteAccess('Worker')).toBe(true);
    });

    it('Structurer should have write access (for scaffolding)', () => {
      expect(registry.hasWriteAccess('Structurer')).toBe(true);
    });
  });

  describe('validateMCPAccess', () => {
    it('should return validation result with reason on denial', () => {
      const result = registry.validateMCPAccess('Worker', 'artifact-server');
      expect(result.allowed).toBe(false);
      expect(result.agent).toBe('Worker');
      expect(result.server).toBe('artifact-server');
      expect(result.reason).toContain('not authorized');
    });

    it('should validate tool-level access when tool is specified', () => {
      const result = registry.validateMCPAccess('Auditor', 'artifact-server', 'append_decision');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });
  });

  describe('assertMCPAccess', () => {
    it('should not throw when access is allowed', () => {
      expect(() => {
        registry.assertMCPAccess('Worker', 'filesystem');
      }).not.toThrow();
    });

    it('should throw UnauthorizedMCPAccessError when access is denied', () => {
      expect(() => {
        registry.assertMCPAccess('Worker', 'artifact-server');
      }).toThrow(UnauthorizedMCPAccessError);
    });
  });

  describe('validateSkillExecution', () => {
    it('should allow Worker to execute implement_atomic', () => {
      const result = registry.validateSkillExecution('Worker', 'implement_atomic');
      expect(result.allowed).toBe(true);
    });

    it('should NOT allow Worker to execute conduct_interview', () => {
      const result = registry.validateSkillExecution('Worker', 'conduct_interview');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not assigned');
    });

    it('should allow Architect to execute conduct_interview', () => {
      const result = registry.validateSkillExecution('Architect', 'conduct_interview');
      expect(result.allowed).toBe(true);
    });

    it('should allow Auditor to execute audit_proposal', () => {
      const result = registry.validateSkillExecution('Auditor', 'audit_proposal');
      expect(result.allowed).toBe(true);
    });

    it('should NOT allow Auditor to execute implement_atomic', () => {
      const result = registry.validateSkillExecution('Auditor', 'implement_atomic');
      expect(result.allowed).toBe(false);
    });

    it('should allow Structurer to execute generate_witness', () => {
      const result = registry.validateSkillExecution('Structurer', 'generate_witness');
      expect(result.allowed).toBe(true);
    });

    it('should allow Refiner to execute detect_smells', () => {
      const result = registry.validateSkillExecution('Refiner', 'detect_smells');
      expect(result.allowed).toBe(true);
    });
  });

  describe('assertSkillExecution', () => {
    it('should not throw when skill execution is allowed', () => {
      expect(() => {
        registry.assertSkillExecution('Worker', 'implement_atomic');
      }).not.toThrow();
    });

    it('should throw UnauthorizedSkillExecutionError when denied', () => {
      expect(() => {
        registry.assertSkillExecution('Worker', 'conduct_interview');
      }).toThrow(UnauthorizedSkillExecutionError);
    });
  });

  describe('getAgentMCPServers', () => {
    it('should return MCP servers for agent', () => {
      const servers = registry.getAgentMCPServers('Worker');
      expect(servers).toHaveLength(2);
      expect(servers.map((s) => s.server)).toContain('filesystem');
      expect(servers.map((s) => s.server)).toContain('toolchain-server');
    });

    it('should return empty array for unknown agent', () => {
      // @ts-expect-error testing invalid role
      const servers = registry.getAgentMCPServers('Unknown');
      expect(servers).toEqual([]);
    });
  });

  describe('getAgentSkills', () => {
    it('should return skills for agent', () => {
      const skills = registry.getAgentSkills('Worker');
      expect(skills).toEqual(['implement_atomic']);
    });

    it('should return empty array for unknown agent', () => {
      // @ts-expect-error testing invalid role
      const skills = registry.getAgentSkills('Unknown');
      expect(skills).toEqual([]);
    });
  });

  describe('getContextLimit', () => {
    it('should return context limit for Worker (16k)', () => {
      expect(registry.getContextLimit('Worker')).toBe(16000);
    });

    it('should return context limit for Architect (100k)', () => {
      expect(registry.getContextLimit('Architect')).toBe(100000);
    });

    it('should return context limit for Auditor (50k)', () => {
      expect(registry.getContextLimit('Auditor')).toBe(50000);
    });
  });
});

describe('validateSwarmConfiguration', () => {
  it('should return no errors for valid configuration', () => {
    const errors = validateSwarmConfiguration(DEFAULT_SWARM_CONFIG);
    expect(errors).toEqual([]);
  });

  it('should detect invalid agent roles', () => {
    const config: SwarmConfiguration = {
      version: '1.0.0',
      agents: [
        {
          // @ts-expect-error testing invalid role
          role: 'InvalidRole',
          description: 'Invalid',
          mcpServers: [],
          assignedSkills: [],
          permissions: { canRead: true, canWrite: false, canNet: false },
        },
      ],
    };
    const errors = validateSwarmConfiguration(config);
    expect(errors).toContain('Invalid agent role: InvalidRole');
  });

  it('should detect duplicate agent roles', () => {
    const config: SwarmConfiguration = {
      version: '1.0.0',
      agents: [WORKER_AGENT, WORKER_AGENT],
    };
    const errors = validateSwarmConfiguration(config);
    expect(errors).toContain('Duplicate agent role: Worker');
  });

  it('should detect invalid MCP server names', () => {
    const config: SwarmConfiguration = {
      version: '1.0.0',
      agents: [
        {
          role: 'Worker',
          description: 'Test',
          mcpServers: [
            // @ts-expect-error testing invalid server
            { server: 'invalid-server', mode: 'full' },
          ],
          assignedSkills: ['implement_atomic'],
          permissions: { canRead: true, canWrite: true, canNet: false },
        },
      ],
    };
    const errors = validateSwarmConfiguration(config);
    expect(errors.some((e) => e.includes('unknown MCP server'))).toBe(true);
  });

  it('should detect invalid skill names', () => {
    const config: SwarmConfiguration = {
      version: '1.0.0',
      agents: [
        {
          role: 'Worker',
          description: 'Test',
          mcpServers: [],
          // @ts-expect-error testing invalid skill
          assignedSkills: ['invalid_skill'],
          permissions: { canRead: true, canWrite: true, canNet: false },
        },
      ],
    };
    const errors = validateSwarmConfiguration(config);
    expect(errors.some((e) => e.includes('unknown skill'))).toBe(true);
  });

  it('should detect permission mismatches with assigned skills', () => {
    const config: SwarmConfiguration = {
      version: '1.0.0',
      agents: [
        {
          role: 'Worker',
          description: 'Test',
          mcpServers: [],
          assignedSkills: ['implement_atomic'],
          permissions: { canRead: true, canWrite: false, canNet: false }, // Missing canWrite
        },
      ],
    };
    const errors = validateSwarmConfiguration(config);
    expect(errors.some((e) => e.includes('lacks required permissions'))).toBe(true);
  });
});

describe('Agent Definitions', () => {
  describe('ARCHITECT_AGENT', () => {
    it('should have correct permissions', () => {
      expect(ARCHITECT_AGENT.permissions).toEqual({
        canRead: true,
        canWrite: true,
        canNet: true,
      });
    });

    it('should have artifact-server and brave-search access', () => {
      const servers = ARCHITECT_AGENT.mcpServers.map((s) => s.server);
      expect(servers).toContain('artifact-server');
      expect(servers).toContain('brave-search');
    });

    it('should be assigned Ignition phase skills', () => {
      expect(ARCHITECT_AGENT.assignedSkills).toContain('conduct_interview');
      expect(ARCHITECT_AGENT.assignedSkills).toContain('synthesize_spec');
    });
  });

  describe('WORKER_AGENT', () => {
    it('should have NO network access', () => {
      expect(WORKER_AGENT.permissions.canNet).toBe(false);
    });

    it('should NOT have artifact-server access (no spec)', () => {
      const servers = WORKER_AGENT.mcpServers.map((s) => s.server);
      expect(servers).not.toContain('artifact-server');
    });

    it('should have scoped filesystem access', () => {
      const fsServer = WORKER_AGENT.mcpServers.find((s) => s.server === 'filesystem');
      expect(fsServer?.mode).toBe('scoped');
    });

    it('should have smallest context limit (16k)', () => {
      expect(WORKER_AGENT.contextLimit).toBe(16000);
    });
  });

  describe('AUDITOR_AGENT', () => {
    it('should have NO write access', () => {
      expect(AUDITOR_AGENT.permissions.canWrite).toBe(false);
    });

    it('should have read-only artifact-server access', () => {
      const artifactServer = AUDITOR_AGENT.mcpServers.find((s) => s.server === 'artifact-server');
      expect(artifactServer?.mode).toBe('read-only');
    });

    it('should block append_decision tool', () => {
      const artifactServer = AUDITOR_AGENT.mcpServers.find((s) => s.server === 'artifact-server');
      expect(artifactServer?.blockedTools).toContain('append_decision');
    });
  });
});

describe('Global swarmRegistry instance', () => {
  it('should be a valid SwarmRegistry instance', () => {
    expect(swarmRegistry).toBeInstanceOf(SwarmRegistry);
  });

  it('should contain all default agents', () => {
    expect(swarmRegistry.getAllAgents()).toHaveLength(6);
  });

  it('should enforce Worker cannot access artifact-server', () => {
    const result = swarmRegistry.validateMCPAccess('Worker', 'artifact-server');
    expect(result.allowed).toBe(false);
  });
});
