/**
 * Subagent Swarm types for the Criticality Protocol.
 *
 * Defines agent configurations and access policies following the
 * Principle of Least Privilege as specified in Specification 8.3.
 *
 * @packageDocumentation
 */

import type { AgentRole, SkillName, SkillPermissions } from '../types.js';

/**
 * Known MCP server identifiers that can be assigned to agents.
 *
 * @remarks
 * - `artifact-server`: Protocol artifacts (spec.toml, DECISIONS.toml)
 * - `toolchain-server`: Build tools (tsc, vitest, complexity analysis)
 * - `filesystem`: File system access (scoped or full)
 * - `brave-search`: Web search capabilities
 * - `security-scanner`: Security scanning tools (subset of toolchain)
 */
export type MCPServerName =
  | 'artifact-server'
  | 'toolchain-server'
  | 'filesystem'
  | 'brave-search'
  | 'security-scanner';

/**
 * All known MCP server names.
 */
export const MCP_SERVER_NAMES: readonly MCPServerName[] = [
  'artifact-server',
  'toolchain-server',
  'filesystem',
  'brave-search',
  'security-scanner',
] as const;

/**
 * Access mode for an MCP server.
 *
 * @remarks
 * - `full`: Complete read and write access
 * - `read-only`: Read access only, no modifications
 * - `scoped`: Access limited to specific paths or operations
 */
export type MCPAccessMode = 'full' | 'read-only' | 'scoped';

/**
 * Configuration for an MCP server assignment to an agent.
 */
export interface MCPServerAccess {
  /** The MCP server identifier. */
  readonly server: MCPServerName;
  /** Access mode for this server. */
  readonly mode: MCPAccessMode;
  /** Optional: scoped paths when mode is 'scoped'. */
  readonly scopedPaths?: readonly string[];
  /** Optional: specific tools that are accessible (whitelist). */
  readonly allowedTools?: readonly string[];
  /** Optional: specific tools that are blocked (blacklist). */
  readonly blockedTools?: readonly string[];
}

/**
 * Agent definition with its complete access policy.
 *
 * @remarks
 * Each agent is defined with:
 * - A role determining its primary function
 * - MCP server assignments with specific access modes
 * - Skill assignments for the skills it can execute
 * - Permission flags (canRead, canWrite, canNet)
 *
 * @example
 * ```typescript
 * const workerAgent: AgentDefinition = {
 *   role: 'Worker',
 *   description: 'Stateless Coder. Sees ONE function at a time.',
 *   mcpServers: [
 *     { server: 'filesystem', mode: 'scoped', scopedPaths: ['src/'] },
 *     { server: 'toolchain-server', mode: 'full' },
 *   ],
 *   assignedSkills: ['implement_atomic'],
 *   permissions: {
 *     canRead: true,
 *     canWrite: true,
 *     canNet: false, // No internet access
 *   },
 * };
 * ```
 */
export interface AgentDefinition {
  /** The agent's role in the swarm. */
  readonly role: AgentRole;
  /** Human-readable description of the agent's purpose and constraints. */
  readonly description: string;
  /** MCP servers this agent can access with their modes. */
  readonly mcpServers: readonly MCPServerAccess[];
  /** Skills this agent is authorized to execute. */
  readonly assignedSkills: readonly SkillName[];
  /** Base permission flags for this agent. */
  readonly permissions: SkillPermissions;
  /** Optional: context window limit for this agent (in tokens). */
  readonly contextLimit?: number;
}

/**
 * Configuration for the complete subagent swarm.
 */
export interface SwarmConfiguration {
  /** Version of the swarm configuration schema. */
  readonly version: string;
  /** All agent definitions in the swarm. */
  readonly agents: readonly AgentDefinition[];
  /** Default timeout for agent operations in milliseconds. */
  readonly defaultTimeout?: number;
  /** Maximum concurrent agents that can be running. */
  readonly maxConcurrentAgents?: number;
}

/**
 * Result of validating an agent's access request.
 */
export interface AccessValidationResult {
  /** Whether the access is allowed. */
  readonly allowed: boolean;
  /** The agent that requested access. */
  readonly agent: AgentRole;
  /** The MCP server being accessed. */
  readonly server: MCPServerName;
  /** Reason for denial if not allowed. */
  readonly reason?: string;
}

/**
 * Result of validating an agent's skill execution request.
 */
export interface SkillExecutionValidationResult {
  /** Whether the skill execution is allowed. */
  readonly allowed: boolean;
  /** The agent attempting to execute. */
  readonly agent: AgentRole;
  /** The skill being executed. */
  readonly skill: SkillName;
  /** Missing permissions if not allowed. */
  readonly missingPermissions?: readonly (keyof SkillPermissions)[];
  /** Reason for denial if not allowed. */
  readonly reason?: string;
}

/**
 * Error thrown when an agent attempts unauthorized MCP server access.
 */
export class UnauthorizedMCPAccessError extends Error {
  /** The agent that attempted access. */
  public readonly agent: AgentRole;
  /** The MCP server that was accessed. */
  public readonly server: MCPServerName;

  constructor(agent: AgentRole, server: MCPServerName) {
    super(`Agent '${agent}' is not authorized to access MCP server '${server}'`);
    this.name = 'UnauthorizedMCPAccessError';
    this.agent = agent;
    this.server = server;
  }
}

/**
 * Error thrown when an agent attempts unauthorized skill execution.
 */
export class UnauthorizedSkillExecutionError extends Error {
  /** The agent that attempted execution. */
  public readonly agent: AgentRole;
  /** The skill that was attempted. */
  public readonly skill: SkillName;

  constructor(agent: AgentRole, skill: SkillName) {
    super(`Agent '${agent}' is not authorized to execute skill '${skill}'`);
    this.name = 'UnauthorizedSkillExecutionError';
    this.agent = agent;
    this.skill = skill;
  }
}

/**
 * Error thrown when swarm configuration is invalid.
 */
export class SwarmConfigurationError extends Error {
  /** Validation errors found in the configuration. */
  public readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid swarm configuration: ${errors.join('; ')}`);
    this.name = 'SwarmConfigurationError';
    this.errors = errors;
  }
}
