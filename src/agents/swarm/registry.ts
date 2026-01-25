/**
 * Subagent Swarm registry for the Criticality Protocol.
 *
 * Provides lookup, validation, and access control operations for the
 * agent swarm following the Principle of Least Privilege.
 *
 * @packageDocumentation
 */

import type { AgentRole, SkillName, SkillPermissions } from '../types.js';
import { skillRegistry, getMissingPermissions } from '../registry.js';
import type {
  AgentDefinition,
  SwarmConfiguration,
  MCPServerName,
  MCPServerAccess,
  AccessValidationResult,
  SkillExecutionValidationResult,
} from './types.js';
import {
  UnauthorizedMCPAccessError,
  UnauthorizedSkillExecutionError,
  SwarmConfigurationError,
  MCP_SERVER_NAMES,
} from './types.js';
import { DEFAULT_SWARM_CONFIG } from './definitions.js';
import { AGENT_ROLES, SKILL_NAMES } from '../types.js';

/**
 * Registry for managing and validating agent access policies.
 *
 * @remarks
 * The SwarmRegistry enforces the Principle of Least Privilege by:
 * - Validating agent configurations at load time
 * - Checking MCP server access before allowing connections
 * - Verifying skill permissions before allowing execution
 *
 * @example
 * ```typescript
 * const registry = new SwarmRegistry();
 *
 * // Check if Worker can access artifact-server
 * const result = registry.validateMCPAccess('Worker', 'artifact-server');
 * console.log(result.allowed); // false - Worker has no spec access
 *
 * // Check if Architect can execute conduct_interview
 * const skillResult = registry.validateSkillExecution('Architect', 'conduct_interview');
 * console.log(skillResult.allowed); // true
 * ```
 */
export class SwarmRegistry {
  private readonly agents: ReadonlyMap<AgentRole, AgentDefinition>;
  private readonly config: SwarmConfiguration;

  /**
   * Creates a new swarm registry with the given configuration.
   *
   * @param config - The swarm configuration to use. Defaults to DEFAULT_SWARM_CONFIG.
   * @throws {SwarmConfigurationError} If the configuration is invalid.
   */
  constructor(config: SwarmConfiguration = DEFAULT_SWARM_CONFIG) {
    // Validate configuration before accepting
    const errors = validateSwarmConfiguration(config);
    if (errors.length > 0) {
      throw new SwarmConfigurationError(errors);
    }

    this.config = config;

    // Build agent lookup map
    const agentMap = new Map<AgentRole, AgentDefinition>();
    for (const agent of config.agents) {
      agentMap.set(agent.role, agent);
    }
    this.agents = agentMap;
  }

  /**
   * Gets an agent definition by role.
   *
   * @param role - The agent role to look up.
   * @returns The agent definition or undefined if not found.
   */
  getAgent(role: AgentRole): AgentDefinition | undefined {
    return this.agents.get(role);
  }

  /**
   * Gets all agent definitions.
   *
   * @returns An array of all agent definitions.
   */
  getAllAgents(): readonly AgentDefinition[] {
    return this.config.agents;
  }

  /**
   * Gets the swarm configuration.
   *
   * @returns The current swarm configuration.
   */
  getConfiguration(): SwarmConfiguration {
    return this.config;
  }

  /**
   * Validates whether an agent can access a specific MCP server.
   *
   * @param role - The agent role requesting access.
   * @param server - The MCP server being accessed.
   * @param tool - Optional: specific tool being invoked.
   * @returns Validation result with allowed status and reason.
   */
  validateMCPAccess(role: AgentRole, server: MCPServerName, tool?: string): AccessValidationResult {
    const agent = this.agents.get(role);
    if (agent === undefined) {
      return {
        allowed: false,
        agent: role,
        server,
        reason: `Unknown agent role: ${role}`,
      };
    }

    // Find if this agent has access to the server
    const serverAccess = agent.mcpServers.find((s) => s.server === server);
    if (serverAccess === undefined) {
      return {
        allowed: false,
        agent: role,
        server,
        reason: `Agent '${role}' is not authorized to access MCP server '${server}'`,
      };
    }

    // If a specific tool is requested, check tool-level access
    if (tool !== undefined) {
      // Check if tool is blocked
      if (serverAccess.blockedTools?.includes(tool) === true) {
        return {
          allowed: false,
          agent: role,
          server,
          reason: `Tool '${tool}' is blocked for agent '${role}' on server '${server}'`,
        };
      }

      // Check if tool is in allowedTools whitelist (if defined)
      if (serverAccess.allowedTools !== undefined && !serverAccess.allowedTools.includes(tool)) {
        return {
          allowed: false,
          agent: role,
          server,
          reason: `Tool '${tool}' is not in the allowed tools list for agent '${role}' on server '${server}'`,
        };
      }
    }

    return {
      allowed: true,
      agent: role,
      server,
    };
  }

  /**
   * Asserts that an agent can access a specific MCP server.
   *
   * @param role - The agent role requesting access.
   * @param server - The MCP server being accessed.
   * @param tool - Optional: specific tool being invoked.
   * @throws {UnauthorizedMCPAccessError} If access is denied.
   */
  assertMCPAccess(role: AgentRole, server: MCPServerName, tool?: string): void {
    const result = this.validateMCPAccess(role, server, tool);
    if (!result.allowed) {
      throw new UnauthorizedMCPAccessError(role, server);
    }
  }

  /**
   * Validates whether an agent can execute a specific skill.
   *
   * @param role - The agent role attempting execution.
   * @param skill - The skill being executed.
   * @returns Validation result with allowed status and details.
   */
  validateSkillExecution(role: AgentRole, skill: SkillName): SkillExecutionValidationResult {
    const agent = this.agents.get(role);
    if (agent === undefined) {
      return {
        allowed: false,
        agent: role,
        skill,
        reason: `Unknown agent role: ${role}`,
      };
    }

    // Check if the skill is assigned to this agent
    if (!agent.assignedSkills.includes(skill)) {
      return {
        allowed: false,
        agent: role,
        skill,
        reason: `Skill '${skill}' is not assigned to agent '${role}'`,
      };
    }

    // Check if the agent has the required permissions for the skill
    const skillDef = skillRegistry.tryGetSkill(skill);
    if (skillDef === undefined) {
      return {
        allowed: false,
        agent: role,
        skill,
        reason: `Skill '${skill}' not found in skill registry`,
      };
    }

    const missing = getMissingPermissions(skillDef.requiredPermissions, agent.permissions);
    if (missing.length > 0) {
      return {
        allowed: false,
        agent: role,
        skill,
        missingPermissions: missing,
        reason: `Agent '${role}' lacks permissions: ${missing.join(', ')}`,
      };
    }

    return {
      allowed: true,
      agent: role,
      skill,
    };
  }

  /**
   * Asserts that an agent can execute a specific skill.
   *
   * @param role - The agent role attempting execution.
   * @param skill - The skill being executed.
   * @throws {UnauthorizedSkillExecutionError} If execution is denied.
   */
  assertSkillExecution(role: AgentRole, skill: SkillName): void {
    const result = this.validateSkillExecution(role, skill);
    if (!result.allowed) {
      throw new UnauthorizedSkillExecutionError(role, skill);
    }
  }

  /**
   * Gets all MCP servers accessible by an agent.
   *
   * @param role - The agent role.
   * @returns Array of MCP server access configurations.
   */
  getAgentMCPServers(role: AgentRole): readonly MCPServerAccess[] {
    const agent = this.agents.get(role);
    return agent?.mcpServers ?? [];
  }

  /**
   * Gets all skills assigned to an agent.
   *
   * @param role - The agent role.
   * @returns Array of skill names assigned to the agent.
   */
  getAgentSkills(role: AgentRole): readonly SkillName[] {
    const agent = this.agents.get(role);
    return agent?.assignedSkills ?? [];
  }

  /**
   * Gets the permissions for an agent.
   *
   * @param role - The agent role.
   * @returns The agent's permissions or undefined if agent not found.
   */
  getAgentPermissions(role: AgentRole): SkillPermissions | undefined {
    const agent = this.agents.get(role);
    return agent?.permissions;
  }

  /**
   * Checks if an agent has network access (canNet permission).
   *
   * @param role - The agent role.
   * @returns True if the agent has network access.
   */
  hasNetworkAccess(role: AgentRole): boolean {
    const agent = this.agents.get(role);
    return agent?.permissions.canNet ?? false;
  }

  /**
   * Checks if an agent has write access (canWrite permission).
   *
   * @param role - The agent role.
   * @returns True if the agent has write access.
   */
  hasWriteAccess(role: AgentRole): boolean {
    const agent = this.agents.get(role);
    return agent?.permissions.canWrite ?? false;
  }

  /**
   * Gets the context limit for an agent.
   *
   * @param role - The agent role.
   * @returns The context limit in tokens, or undefined if not set.
   */
  getContextLimit(role: AgentRole): number | undefined {
    const agent = this.agents.get(role);
    return agent?.contextLimit;
  }
}

/**
 * Type guard to check if a value is a record/object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a swarm configuration and returns any errors.
 *
 * This function accepts `unknown` input to properly validate external data
 * (e.g., from TOML/JSON files) with appropriate type narrowing.
 *
 * @param config - The configuration to validate (can be any value).
 * @returns Array of error messages, empty if valid.
 */
export function validateSwarmConfiguration(config: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(config)) {
    errors.push('Configuration must be an object');
    return errors;
  }

  // Check version
  if (typeof config.version !== 'string' || config.version === '') {
    errors.push('Missing or invalid version');
  }

  // Check agents
  if (!Array.isArray(config.agents)) {
    errors.push('Missing or invalid agents array');
    return errors;
  }

  const seenRoles = new Set<string>();

  for (const agent of config.agents as unknown[]) {
    if (!isRecord(agent)) {
      errors.push('Agent entry must be an object');
      continue;
    }

    const role = typeof agent.role === 'string' ? agent.role : String(agent.role);

    // Check role
    if (typeof agent.role !== 'string' || !AGENT_ROLES.includes(agent.role as AgentRole)) {
      errors.push(`Invalid agent role: ${role}`);
    }

    // Check for duplicate roles
    if (seenRoles.has(role)) {
      errors.push(`Duplicate agent role: ${role}`);
    }
    seenRoles.add(role);

    // Check description
    if (typeof agent.description !== 'string' || agent.description === '') {
      errors.push(`Agent '${role}' has missing or invalid description`);
    }

    // Check MCP servers
    if (!Array.isArray(agent.mcpServers)) {
      errors.push(`Agent '${role}' has missing or invalid mcpServers`);
    } else {
      for (const server of agent.mcpServers as unknown[]) {
        if (!isRecord(server)) {
          errors.push(`Agent '${role}' has invalid MCP server entry`);
          continue;
        }
        if (
          typeof server.server !== 'string' ||
          !MCP_SERVER_NAMES.includes(server.server as MCPServerName)
        ) {
          errors.push(`Agent '${role}' has unknown MCP server: ${String(server.server)}`);
        }
        if (
          typeof server.mode !== 'string' ||
          !['full', 'read-only', 'scoped'].includes(server.mode)
        ) {
          errors.push(
            `Agent '${role}' has invalid access mode for server '${String(server.server)}': ${String(server.mode)}`
          );
        }
      }
    }

    // Check assigned skills
    if (!Array.isArray(agent.assignedSkills)) {
      errors.push(`Agent '${role}' has missing or invalid assignedSkills`);
    } else {
      for (const skill of agent.assignedSkills as unknown[]) {
        if (typeof skill !== 'string' || !SKILL_NAMES.includes(skill as SkillName)) {
          errors.push(`Agent '${role}' has unknown skill: ${String(skill)}`);
        }
      }
    }

    // Check permissions
    if (!isRecord(agent.permissions)) {
      errors.push(`Agent '${role}' has missing permissions`);
    } else {
      const perms = agent.permissions;
      if (typeof perms.canRead !== 'boolean') {
        errors.push(`Agent '${role}' has invalid canRead permission`);
      }
      if (typeof perms.canWrite !== 'boolean') {
        errors.push(`Agent '${role}' has invalid canWrite permission`);
      }
      if (typeof perms.canNet !== 'boolean') {
        errors.push(`Agent '${role}' has invalid canNet permission`);
      }
    }

    // Validate permission consistency with skills (only if types are valid)
    if (
      Array.isArray(agent.assignedSkills) &&
      isRecord(agent.permissions) &&
      typeof agent.permissions.canRead === 'boolean' &&
      typeof agent.permissions.canWrite === 'boolean' &&
      typeof agent.permissions.canNet === 'boolean'
    ) {
      const permissions: SkillPermissions = {
        canRead: agent.permissions.canRead,
        canWrite: agent.permissions.canWrite,
        canNet: agent.permissions.canNet,
      };
      for (const skillName of agent.assignedSkills as unknown[]) {
        if (typeof skillName === 'string' && SKILL_NAMES.includes(skillName as SkillName)) {
          const skillDef = skillRegistry.tryGetSkill(skillName as SkillName);
          if (skillDef !== undefined) {
            const missing = getMissingPermissions(skillDef.requiredPermissions, permissions);
            if (missing.length > 0) {
              errors.push(
                `Agent '${role}' is assigned skill '${skillName}' but lacks required permissions: ${missing.join(', ')}`
              );
            }
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Creates a SwarmRegistry from raw configuration data.
 *
 * @param data - Raw configuration data (e.g., from JSON/TOML).
 * @returns A configured SwarmRegistry.
 * @throws {SwarmConfigurationError} If the configuration is invalid.
 */
export function createSwarmRegistryFromData(data: unknown): SwarmRegistry {
  // Type assertion with runtime validation via constructor
  return new SwarmRegistry(data as SwarmConfiguration);
}

/**
 * Default global swarm registry instance.
 */
export const swarmRegistry = new SwarmRegistry();
