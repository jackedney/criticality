/**
 * Subagent Swarm definitions for the Criticality Protocol.
 *
 * Defines all agents with their access policies following Specification 8.3:
 * - Architect: High Reasoning, Low Execution. Can read/write Specs. Can Search.
 * - Auditor: Read-Only. "Devil's Advocate". No write access to code.
 * - Structurer: Structure Only. Writes files/types. No logic implementation.
 * - Worker: Stateless Coder. Sees ONE function at a time. No Spec access. No Internet.
 * - Refiner: Refactoring. Runs static analysis and applies patterns.
 * - Guardian: Security Scan. Runs alongside Worker.
 *
 * @packageDocumentation
 */

import type { AgentDefinition, SwarmConfiguration } from './types.js';

/**
 * Architect agent definition.
 *
 * @remarks
 * Role: Ignition / Synthesis
 * Access Policy: High Reasoning, Low Execution. Can read/write Specs. Can Search.
 * Primary MCPs: artifact-server, brave-search
 */
export const ARCHITECT_AGENT: AgentDefinition = {
  role: 'Architect',
  description:
    'High Reasoning, Low Execution. Orchestrates specification gathering and synthesis. ' +
    'Can read/write protocol artifacts (spec, decisions). Has search capabilities for research.',
  mcpServers: [
    {
      server: 'artifact-server',
      mode: 'full',
      // Full access to read_spec_section, append_decision, get_type_witness, validate_schema
    },
    {
      server: 'brave-search',
      mode: 'full',
      // Full search capabilities for research during Ignition
    },
  ],
  assignedSkills: ['conduct_interview', 'synthesize_spec'],
  permissions: {
    canRead: true,
    canWrite: true,
    canNet: true, // Can search the web
  },
  contextLimit: 100000, // 100k tokens as per Specification 7.0
};

/**
 * Auditor agent definition.
 *
 * @remarks
 * Role: Verification
 * Access Policy: Read-Only. "Devil's Advocate". No write access to code.
 * Primary MCPs: artifact-server (read-only), toolchain-server (read-only)
 */
export const AUDITOR_AGENT: AgentDefinition = {
  role: 'Auditor',
  description:
    'Read-Only "Devil\'s Advocate". Cross-references spec against decisions, ' +
    'verifies invariants, finds contradictions. Cannot modify code or artifacts.',
  mcpServers: [
    {
      server: 'artifact-server',
      mode: 'read-only',
      // Can only read: read_spec_section, get_type_witness, validate_schema
      blockedTools: ['append_decision'],
    },
    {
      server: 'toolchain-server',
      mode: 'read-only',
      // Can run verification but not modify anything
      allowedTools: ['verify_structure', 'check_complexity'],
      blockedTools: ['run_function_test'], // Tests could have side effects
    },
  ],
  assignedSkills: ['audit_proposal'],
  permissions: {
    canRead: true,
    canWrite: false, // Cannot write anything
    canNet: false, // No network access
  },
  contextLimit: 50000, // 50k tokens as per Specification 7.0
};

/**
 * Structurer agent definition.
 *
 * @remarks
 * Role: Lattice / Scaffold
 * Access Policy: Structure Only. Writes files/types. No logic implementation.
 * Primary MCPs: filesystem, artifact-server (read-only)
 */
export const STRUCTURER_AGENT: AgentDefinition = {
  role: 'Structurer',
  description:
    'Structure Only. Creates file structures, type definitions, and scaffold code. ' +
    'Writes files and types but does not implement logic (uses todo!() placeholders).',
  mcpServers: [
    {
      server: 'filesystem',
      mode: 'full',
      // Full filesystem access to create structure
    },
    {
      server: 'artifact-server',
      mode: 'read-only',
      // Read-only access to spec for generating types and structure
      blockedTools: ['append_decision'],
    },
  ],
  assignedSkills: ['generate_witness', 'scaffold_module'],
  permissions: {
    canRead: true,
    canWrite: true, // Can write files/types
    canNet: false, // No network access
  },
  contextLimit: 100000, // 100k tokens as per Specification 7.0
};

/**
 * Worker agent definition.
 *
 * @remarks
 * Role: Injection
 * Access Policy: Stateless Coder. Sees ONE function at a time. No Spec access. No Internet.
 * Primary MCPs: filesystem (scoped), toolchain-server
 *
 * This is the most restricted agent following Principle of Least Privilege:
 * - No access to specification (cannot see the "big picture")
 * - No internet access (cannot search for solutions)
 * - Scoped filesystem access (only the current function context)
 */
export const WORKER_AGENT: AgentDefinition = {
  role: 'Worker',
  description:
    'Stateless Coder. Implements ONE function at a time following the atomic loop: ' +
    'Read signature -> Write code -> Test -> Commit. No Spec access. No Internet.',
  mcpServers: [
    {
      server: 'filesystem',
      mode: 'scoped',
      // Scoped to current implementation context
      // The orchestrator will set scopedPaths dynamically
    },
    {
      server: 'toolchain-server',
      mode: 'full',
      // Full access to run tests and verify structure
    },
    // NOTE: No artifact-server access - Worker cannot see spec
    // NOTE: No brave-search access - Worker has no internet
  ],
  assignedSkills: ['implement_atomic'],
  permissions: {
    canRead: true,
    canWrite: true, // Can write implementation code
    canNet: false, // CRITICAL: No internet access
  },
  contextLimit: 16000, // 16k tokens - smallest context as per Specification 7.0
};

/**
 * Refiner agent definition.
 *
 * @remarks
 * Role: Mass Defect / Refactoring
 * Access Policy: Runs static analysis and applies refactoring patterns.
 * Primary MCPs: filesystem, toolchain-server
 */
export const REFINER_AGENT: AgentDefinition = {
  role: 'Refiner',
  description:
    'Refactoring agent. Runs static analysis to detect code smells and applies ' +
    'refactoring patterns. Works during Mass Defect phase to reduce complexity.',
  mcpServers: [
    {
      server: 'filesystem',
      mode: 'full',
      // Full filesystem for refactoring
    },
    {
      server: 'toolchain-server',
      mode: 'full',
      // Full access for complexity analysis and verification
    },
  ],
  assignedSkills: ['detect_smells', 'apply_pattern'],
  permissions: {
    canRead: true,
    canWrite: true, // Can refactor code
    canNet: false, // No network access
  },
  contextLimit: 100000, // 100k tokens as per Specification 7.0
};

/**
 * Guardian agent definition.
 *
 * @remarks
 * Role: Security
 * Access Policy: Security Scan. Runs alongside Worker.
 * Primary MCPs: toolchain-server (security scanners)
 */
export const GUARDIAN_AGENT: AgentDefinition = {
  role: 'Guardian',
  description:
    'Security Scan agent. Runs alongside Worker to verify security properties. ' +
    'Uses security scanners to detect vulnerabilities in real-time.',
  mcpServers: [
    {
      server: 'toolchain-server',
      mode: 'read-only',
      // Read-only access to security scanning tools
      allowedTools: ['verify_structure', 'check_complexity'],
    },
    {
      server: 'security-scanner',
      mode: 'full',
      // Full access to security-specific scanning
    },
  ],
  assignedSkills: [], // Guardian does not execute skills from the registry
  permissions: {
    canRead: true,
    canWrite: false, // Cannot modify code, only scan
    canNet: false, // No network access
  },
  contextLimit: 50000, // 50k tokens - similar to Auditor
};

/**
 * All agent definitions as a readonly array.
 */
export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  ARCHITECT_AGENT,
  AUDITOR_AGENT,
  STRUCTURER_AGENT,
  WORKER_AGENT,
  REFINER_AGENT,
  GUARDIAN_AGENT,
] as const;

/**
 * Default swarm configuration with all agents.
 */
export const DEFAULT_SWARM_CONFIG: SwarmConfiguration = {
  version: '1.0.0',
  agents: AGENT_DEFINITIONS,
  defaultTimeout: 300000, // 5 minutes
  maxConcurrentAgents: 4,
};
