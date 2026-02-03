/**
 * Tests for the swarm configuration loader.
 *
 * Verifies:
 * - File loading with mergeWithDefaults flag
 * - Configuration merging behavior
 * - Source attribution (file, merged, defaults)
 * - Environment variable overrides
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSwarmConfig, mergeConfigurations } from './loader.js';
import { DEFAULT_SWARM_CONFIG, WORKER_AGENT, ARCHITECT_AGENT } from './definitions.js';
import { safeReadFile } from '../../utils/safe-fs.js';

vi.mock('../../utils/safe-fs.js', () => ({
  safeReadFile: vi.fn(),
}));

describe('loadSwarmConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mergeWithDefaults flag', () => {
    it('should include default agents when mergeWithDefaults=true', async () => {
      const partialConfigToml = `
version = "1.0.0"

[[agents]]
role = "Worker"
description = "Test Worker"
mcpServers = [{ server = "filesystem", mode = "full" }]
assignedSkills = ["implement_atomic"]
permissions = { canRead = true, canWrite = true, canNet = false }
`;

      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValue(partialConfigToml);

      const result = await loadSwarmConfig({
        configPath: './swarm.toml',
        mergeWithDefaults: true,
        applyEnvOverrides: false,
      });

      expect(result.source).toBe('merged');
      expect(result.config.agents).toContainEqual(ARCHITECT_AGENT);
      expect(result.config.agents.length).toBeGreaterThan(1);
      expect(result.config.agents.some((a) => a.role === 'Worker')).toBe(true);
      expect(result.config.agents.some((a) => a.role === 'Architect')).toBe(true);
      expect(result.config.agents.some((a) => a.role === 'Auditor')).toBe(true);
    });

    it('should only include file agents when mergeWithDefaults=false', async () => {
      const partialConfigToml = `
version = "1.0.0"

[[agents]]
role = "Worker"
description = "Test Worker"
mcpServers = [{ server = "filesystem", mode = "full" }]
assignedSkills = ["implement_atomic"]
permissions = { canRead = true, canWrite = true, canNet = false }
`;

      (safeReadFile as ReturnType<typeof vi.fn>).mockResolvedValue(partialConfigToml);

      const result = await loadSwarmConfig({
        configPath: './swarm.toml',
        mergeWithDefaults: false,
        applyEnvOverrides: false,
      });

      expect(result.source).toBe('file');
      expect(result.config.agents).toHaveLength(1);
      expect(result.config.agents[0]).toBeDefined();
      expect(result.config.agents[0]?.role).toBe('Worker');
      expect(result.config.agents).not.toContainEqual(ARCHITECT_AGENT);
    });

    it('should use default values when no configPath provided', async () => {
      const result = await loadSwarmConfig({
        mergeWithDefaults: true,
        applyEnvOverrides: false,
      });

      expect(result.source).toBe('defaults');
      expect(result.config).toEqual(DEFAULT_SWARM_CONFIG);
      expect(result.config.agents).toHaveLength(6);
    });
  });

  describe('mergeConfigurations', () => {
    it('should merge agents with override taking precedence', () => {
      const customAgent: typeof WORKER_AGENT = {
        ...WORKER_AGENT,
        description: 'Custom Worker',
      };

      const customConfig = {
        version: '1.0.0',
        agents: [customAgent],
      };

      const merged = mergeConfigurations(DEFAULT_SWARM_CONFIG, customConfig);

      expect(merged.agents.length).toBe(6);
      expect(merged.agents.some((a) => a.role === 'Worker')).toBe(true);
      const worker = merged.agents.find((a) => a.role === 'Worker');
      expect(worker).toBeDefined();
      expect(worker?.description).toBe('Custom Worker');
    });

    it('should merge defaultTimeout with override taking precedence', () => {
      const customConfig = {
        version: '1.0.0',
        agents: [],
        defaultTimeout: 600000,
      };

      const merged = mergeConfigurations(DEFAULT_SWARM_CONFIG, customConfig);

      expect(merged.defaultTimeout).toBe(600000);
    });

    it('should keep base defaultTimeout when override is undefined', () => {
      const customConfig = {
        version: '1.0.0',
        agents: [],
      };

      const merged = mergeConfigurations(DEFAULT_SWARM_CONFIG, customConfig);

      expect(merged.defaultTimeout).toBe(300000);
    });

    it('should merge maxConcurrentAgents with override taking precedence', () => {
      const customConfig = {
        version: '1.0.0',
        agents: [],
        maxConcurrentAgents: 8,
      };

      const merged = mergeConfigurations(DEFAULT_SWARM_CONFIG, customConfig);

      expect(merged.maxConcurrentAgents).toBe(8);
    });

    it('should keep base maxConcurrentAgents when override is undefined', () => {
      const customConfig = {
        version: '1.0.0',
        agents: [],
      };

      const merged = mergeConfigurations(DEFAULT_SWARM_CONFIG, customConfig);

      expect(merged.maxConcurrentAgents).toBe(4);
    });
  });
});
