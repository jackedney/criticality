/**
 * Subagent Swarm module for the Criticality Protocol.
 *
 * Provides agent definitions, access policies, and configuration loading
 * following the Principle of Least Privilege from Specification 8.3.
 *
 * @packageDocumentation
 */

// Types
export type {
  MCPServerName,
  MCPAccessMode,
  MCPServerAccess,
  AgentDefinition,
  SwarmConfiguration,
  AccessValidationResult,
  SkillExecutionValidationResult,
} from './types.js';

export {
  MCP_SERVER_NAMES,
  UnauthorizedMCPAccessError,
  UnauthorizedSkillExecutionError,
  SwarmConfigurationError,
} from './types.js';

// Definitions
export {
  ARCHITECT_AGENT,
  AUDITOR_AGENT,
  STRUCTURER_AGENT,
  WORKER_AGENT,
  REFINER_AGENT,
  GUARDIAN_AGENT,
  AGENT_DEFINITIONS,
  DEFAULT_SWARM_CONFIG,
} from './definitions.js';

// Registry
export {
  SwarmRegistry,
  validateSwarmConfiguration,
  createSwarmRegistryFromData,
  swarmRegistry,
} from './registry.js';

// Loader
export type { LoadSwarmConfigOptions, LoadSwarmConfigResult } from './loader.js';

export {
  loadSwarmConfigFromFile,
  parseSwarmConfig,
  applyEnvironmentOverrides,
  loadSwarmConfig,
  mergeConfigurations,
  createSwarmRegistry,
} from './loader.js';
