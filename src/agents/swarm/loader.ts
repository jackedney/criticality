/**
 * Configuration loader for agent swarm definitions.
 *
 * Loads agent configurations from TOML files and environment variables,
 * enabling runtime customization of agent access policies.
 *
 * @packageDocumentation
 */

import TOML from '@iarna/toml';

import type {
  SwarmConfiguration,
  AgentDefinition,
  MCPServerAccess,
  MCPAccessMode,
  MCPServerName,
} from './types.js';
import { SwarmConfigurationError, MCP_SERVER_NAMES } from './types.js';
import { SwarmRegistry, validateSwarmConfiguration } from './registry.js';
import { DEFAULT_SWARM_CONFIG } from './definitions.js';
import { safeReadFile } from '../../utils/safe-fs.js';
import type { AgentRole, SkillName, SkillPermissions } from '../types.js';
import { AGENT_ROLES, SKILL_NAMES } from '../types.js';

/**
 * Options for loading swarm configuration.
 */
export interface LoadSwarmConfigOptions {
  /** Path to the configuration file. */
  configPath?: string;
  /** Whether to merge with default configuration. */
  mergeWithDefaults?: boolean;
  /** Whether to apply environment variable overrides. */
  applyEnvOverrides?: boolean;
}

/**
 * Result of loading swarm configuration.
 */
export interface LoadSwarmConfigResult {
  /** The loaded configuration. */
  config: SwarmConfiguration;
  /** The source of the configuration. */
  source: 'file' | 'defaults' | 'merged';
  /** Path to the configuration file if loaded from file. */
  filePath?: string;
  /** Any warnings encountered during loading. */
  warnings: string[];
}

/**
 * Loads swarm configuration from a TOML file.
 *
 * @param filePath - Path to the configuration file.
 * @returns The loaded swarm configuration.
 * @throws {SwarmConfigurationError} If the file is invalid or cannot be read.
 *
 * @example
 * ```typescript
 * // Load from file
 * const config = await loadSwarmConfigFromFile('./swarm.toml');
 *
 * // Create registry from loaded config
 * const registry = new SwarmRegistry(config);
 * ```
 */
export async function loadSwarmConfigFromFile(filePath: string): Promise<SwarmConfiguration> {
  let content: string;

  try {
    content = await safeReadFile(filePath, 'utf-8');
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'ENOENT') {
      throw new SwarmConfigurationError([`Configuration file not found: ${filePath}`]);
    }
    throw new SwarmConfigurationError([`Failed to read configuration file: ${error.message}`]);
  }

  let rawData: unknown;
  try {
    rawData = TOML.parse(content);
  } catch (err) {
    const error = err as Error;
    throw new SwarmConfigurationError([`Invalid TOML syntax: ${error.message}`]);
  }

  return parseSwarmConfig(rawData);
}

/**
 * Parses raw configuration data into a SwarmConfiguration.
 *
 * @param data - Raw data from TOML/JSON parsing.
 * @returns Validated swarm configuration.
 * @throws {SwarmConfigurationError} If the data is invalid.
 */
export function parseSwarmConfig(data: unknown): SwarmConfiguration {
  if (typeof data !== 'object' || data === null) {
    throw new SwarmConfigurationError(['Configuration must be an object']);
  }

  const obj = data as Record<string, unknown>;

  // Parse version
  const version = typeof obj.version === 'string' ? obj.version : '1.0.0';

  // Parse agents
  const agents: AgentDefinition[] = [];
  const rawAgents = obj.agents as unknown[] | undefined;

  if (rawAgents !== undefined && Array.isArray(rawAgents)) {
    for (const rawAgent of rawAgents) {
      const agent = parseAgentDefinition(rawAgent);
      agents.push(agent);
    }
  }

  // Build configuration object conditionally
  const config: SwarmConfiguration = {
    version,
    agents,
    ...(typeof obj.defaultTimeout === 'number' ? { defaultTimeout: obj.defaultTimeout } : {}),
    ...(typeof obj.maxConcurrentAgents === 'number'
      ? { maxConcurrentAgents: obj.maxConcurrentAgents }
      : {}),
  };

  // Validate the complete configuration
  const errors = validateSwarmConfiguration(config);
  if (errors.length > 0) {
    throw new SwarmConfigurationError(errors);
  }

  return config;
}

/**
 * Parses a single agent definition from raw data.
 *
 * @param data - Raw agent data from TOML/JSON.
 * @returns The parsed agent definition.
 * @throws {SwarmConfigurationError} If the data is invalid.
 */
function parseAgentDefinition(data: unknown): AgentDefinition {
  if (typeof data !== 'object' || data === null) {
    throw new SwarmConfigurationError(['Agent definition must be an object']);
  }

  const obj = data as Record<string, unknown>;

  // Parse role
  const role = obj.role as AgentRole;
  if (!AGENT_ROLES.includes(role)) {
    throw new SwarmConfigurationError([`Invalid agent role: ${role}`]);
  }

  // Parse description
  const description = typeof obj.description === 'string' ? obj.description : `Agent: ${role}`;

  // Parse MCP servers
  const mcpServers: MCPServerAccess[] = [];
  const rawServers = obj.mcpServers as unknown[] | undefined;

  if (rawServers !== undefined && Array.isArray(rawServers)) {
    for (const rawServer of rawServers) {
      const server = parseMCPServerAccess(rawServer);
      mcpServers.push(server);
    }
  }

  // Parse assigned skills
  const assignedSkills: SkillName[] = [];
  const rawSkills = obj.assignedSkills as unknown[] | undefined;

  if (rawSkills !== undefined && Array.isArray(rawSkills)) {
    for (const rawSkill of rawSkills) {
      if (typeof rawSkill === 'string' && SKILL_NAMES.includes(rawSkill as SkillName)) {
        assignedSkills.push(rawSkill as SkillName);
      }
    }
  }

  // Parse permissions
  const rawPerms = obj.permissions as Record<string, unknown> | undefined;
  const permissions: SkillPermissions = {
    canRead: rawPerms?.canRead === true,
    canWrite: rawPerms?.canWrite === true,
    canNet: rawPerms?.canNet === true,
  };

  // Parse optional fields
  const contextLimit = typeof obj.contextLimit === 'number' ? obj.contextLimit : undefined;

  const agent: AgentDefinition = {
    role,
    description,
    mcpServers,
    assignedSkills,
    permissions,
    ...(contextLimit !== undefined ? { contextLimit } : {}),
  };

  return agent;
}

/**
 * Parses an MCP server access configuration from raw data.
 *
 * @param data - Raw server data from TOML/JSON.
 * @returns The parsed MCP server access configuration.
 * @throws {SwarmConfigurationError} If the data is invalid.
 */
function parseMCPServerAccess(data: unknown): MCPServerAccess {
  if (typeof data !== 'object' || data === null) {
    throw new SwarmConfigurationError(['MCP server access must be an object']);
  }

  const obj = data as Record<string, unknown>;

  // Parse server name
  const server = obj.server as MCPServerName;
  if (!MCP_SERVER_NAMES.includes(server)) {
    throw new SwarmConfigurationError([`Invalid MCP server: ${server}`]);
  }

  // Parse mode - defaults to 'full' if not specified or invalid
  const mode: MCPAccessMode =
    typeof obj.mode === 'string' && ['full', 'read-only', 'scoped'].includes(obj.mode)
      ? (obj.mode as MCPAccessMode)
      : 'full';

  // Filter scopedPaths and allowedTools to string arrays (only for scoped mode)
  const scopedPaths =
    mode === 'scoped' && Array.isArray(obj.scopedPaths)
      ? obj.scopedPaths.filter((p): p is string => typeof p === 'string')
      : [];

  const allowedTools =
    mode === 'scoped' && Array.isArray(obj.allowedTools)
      ? obj.allowedTools.filter((t): t is string => typeof t === 'string')
      : [];

  // Build access object using conditional spreads (immutable)
  const access: MCPServerAccess = {
    server,
    mode,
    ...(mode === 'scoped' && scopedPaths.length > 0 ? { scopedPaths } : {}),
    ...(mode === 'scoped' && allowedTools.length > 0 ? { allowedTools } : {}),
  };

  return access;
}

/**
 * Applies environment variable overrides to a swarm configuration.
 *
 * @remarks
 * Environment variables follow the pattern:
 * - `CRITICALITY_SWARM_TIMEOUT`: Override default timeout
 * - `CRITICALITY_SWARM_MAX_CONCURRENT`: Override max concurrent agents
 * - `CRITICALITY_AGENT_{ROLE}_CONTEXT_LIMIT`: Override agent context limit
 * - `CRITICALITY_AGENT_{ROLE}_NET`: Override network access (true/false)
 *
 * @param config - Base configuration to override.
 * @returns Configuration with overrides applied.
 */
export function applyEnvironmentOverrides(config: SwarmConfiguration): SwarmConfiguration {
  const env = process.env;

  // Apply top-level overrides
  const defaultTimeout = parseEnvInt(env.CRITICALITY_SWARM_TIMEOUT, config.defaultTimeout);
  const maxConcurrentAgents = parseEnvInt(
    env.CRITICALITY_SWARM_MAX_CONCURRENT,
    config.maxConcurrentAgents
  );

  // Apply per-agent overrides
  const agents = config.agents.map((agent) => {
    const envPrefix = `CRITICALITY_AGENT_${agent.role.toUpperCase()}`;

    // Context limit override
    const contextLimit = parseEnvInt(env[`${envPrefix}_CONTEXT_LIMIT`], agent.contextLimit);

    // Network access override
    const canNetEnv = env[`${envPrefix}_NET`];
    const canNet =
      canNetEnv !== undefined ? canNetEnv.toLowerCase() === 'true' : agent.permissions.canNet;

    const permissions: SkillPermissions = {
      ...agent.permissions,
      canNet,
    };

    const result: AgentDefinition = {
      ...agent,
      permissions,
      ...(contextLimit !== undefined ? { contextLimit } : {}),
    };

    return result;
  });

  const overrideResult: SwarmConfiguration = {
    ...config,
    agents,
    ...(defaultTimeout !== undefined ? { defaultTimeout } : {}),
    ...(maxConcurrentAgents !== undefined ? { maxConcurrentAgents } : {}),
  };

  return overrideResult;
}

/**
 * Parses an integer from an environment variable.
 */
function parseEnvInt(value: string | undefined, defaultValue?: number): number | undefined {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Loads swarm configuration with full options support.
 *
 * @param options - Loading options.
 * @returns Result containing the configuration and metadata.
 *
 * @example
 * ```typescript
 * // Load from file with env overrides
 * const result = await loadSwarmConfig({
 *   configPath: './swarm.toml',
 *   applyEnvOverrides: true,
 * });
 *
 * // Load defaults with env overrides
 * const result = await loadSwarmConfig({
 *   applyEnvOverrides: true,
 * });
 * ```
 */
export async function loadSwarmConfig(
  options: LoadSwarmConfigOptions = {}
): Promise<LoadSwarmConfigResult> {
  const { configPath, mergeWithDefaults = true, applyEnvOverrides = true } = options;

  const warnings: string[] = [];
  let config: SwarmConfiguration;
  let source: 'file' | 'defaults' | 'merged';

  if (configPath !== undefined) {
    try {
      config = await loadSwarmConfigFromFile(configPath);
      if (mergeWithDefaults) {
        config = mergeConfigurations(DEFAULT_SWARM_CONFIG, config);
        source = 'merged';
      } else {
        source = 'file';
      }
    } catch (err) {
      if (err instanceof SwarmConfigurationError) {
        throw err;
      }
      warnings.push(`Failed to load config from ${configPath}, using defaults`);
      config = DEFAULT_SWARM_CONFIG;
      source = 'defaults';
    }
  } else {
    config = DEFAULT_SWARM_CONFIG;
    source = 'defaults';
  }

  if (applyEnvOverrides) {
    config = applyEnvironmentOverrides(config);
  }

  const loadResult: LoadSwarmConfigResult = {
    config,
    source,
    warnings,
    ...(configPath !== undefined ? { filePath: configPath } : {}),
  };

  return loadResult;
}

/**
 * Merges two swarm configurations, with the override taking precedence.
 *
 * @param base - Base configuration.
 * @param override - Override configuration.
 * @returns Merged configuration.
 */
export function mergeConfigurations(
  base: SwarmConfiguration,
  override: SwarmConfiguration
): SwarmConfiguration {
  // Build agent map from override
  const overrideAgents = new Map<AgentRole, AgentDefinition>();
  for (const agent of override.agents) {
    overrideAgents.set(agent.role, agent);
  }

  // Merge agents: use override if present, otherwise use base
  const mergedAgents: AgentDefinition[] = [];
  const seenRoles = new Set<AgentRole>();

  // First, add all override agents
  for (const agent of override.agents) {
    mergedAgents.push(agent);
    seenRoles.add(agent.role);
  }

  // Then, add base agents that weren't overridden
  for (const agent of base.agents) {
    if (!seenRoles.has(agent.role)) {
      mergedAgents.push(agent);
    }
  }

  const mergedDefaultTimeout = override.defaultTimeout ?? base.defaultTimeout;
  const mergedMaxConcurrent = override.maxConcurrentAgents ?? base.maxConcurrentAgents;

  const merged: SwarmConfiguration = {
    version: override.version,
    agents: mergedAgents,
    ...(mergedDefaultTimeout !== undefined ? { defaultTimeout: mergedDefaultTimeout } : {}),
    ...(mergedMaxConcurrent !== undefined ? { maxConcurrentAgents: mergedMaxConcurrent } : {}),
  };

  return merged;
}

/**
 * Creates a SwarmRegistry from configuration options.
 *
 * @param options - Loading options.
 * @returns A configured SwarmRegistry.
 *
 * @example
 * ```typescript
 * // Create from default configuration
 * const registry = await createSwarmRegistry();
 *
 * // Create from file
 * const registry = await createSwarmRegistry({
 *   configPath: './swarm.toml',
 * });
 * ```
 */
export async function createSwarmRegistry(
  options: LoadSwarmConfigOptions = {}
): Promise<SwarmRegistry> {
  const result = await loadSwarmConfig(options);
  return new SwarmRegistry(result.config);
}
