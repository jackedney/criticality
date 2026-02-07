/**
 * Integration tests for CLI commands.
 *
 * Tests end-to-end behavior of status, resolve, resume commands
 * including state management, user interaction, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleStatusCommand } from '../../src/cli/commands/status.js';
import { handleResolveCommand } from '../../src/cli/commands/resolve.js';
import { handleResumeCommand } from '../../src/cli/commands/resume.js';
import type { CliContext } from '../../src/cli/types.js';
import { saveCliState, type CliStateSnapshot } from '../../src/cli/state.js';
import { type BlockingRecord } from '../../src/protocol/blocking.js';

describe('CLI Integration Tests', () => {
  let testDir: string;
  let statePath: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `crit-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    statePath = join(testDir, '.criticality-state.json');

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.chdir(testDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    process.chdir('/Users/jackedney/criticality');
  });

  function createMockContext(overrides: Partial<CliContext> = {}): CliContext {
    return {
      renderer: {},
      args: [],
      config: {
        colors: false,
        unicode: false,
        watchInterval: 2000,
      },
      ...overrides,
    };
  }

  function createActiveState(): CliStateSnapshot {
    return {
      state: {
        phase: 'Lattice',
        substate: { kind: 'Active' },
      },
      artifacts: ['spec'],
      blockingQueries: [],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      resolvedQueries: [],
    };
  }

  function createBlockedState(): CliStateSnapshot {
    const blockedQuery: BlockingRecord = {
      id: 'query_001',
      phase: 'Lattice',
      query: 'Should we use TypeScript strict mode?',
      options: ['Yes, use strict mode', 'No, allow loose typing', 'Ask for more details'],
      blockedAt: new Date().toISOString(),
      resolved: false,
    };

    return {
      state: {
        phase: 'Lattice',
        substate: {
          kind: 'Blocking',
          query: blockedQuery.query,
          options: blockedQuery.options,
          blockedAt: blockedQuery.blockedAt,
        },
      },
      artifacts: ['spec'],
      blockingQueries: [blockedQuery],
      createdAt: new Date(Date.now() - 60000).toISOString(),
      lastActivity: new Date().toISOString(),
      resolvedQueries: [],
    };
  }

  function createCompletedState(): CliStateSnapshot {
    return {
      state: {
        phase: 'Complete',
        substate: { kind: 'Active' },
      },
      artifacts: [
        'spec',
        'latticeCode',
        'validatedStructure',
        'implementedCode',
        'verifiedCode',
        'finalArtifact',
      ],
      blockingQueries: [],
      createdAt: new Date(Date.now() - 300000).toISOString(),
      lastActivity: new Date(Date.now() - 60000).toISOString(),
      resolvedQueries: [],
    };
  }

  describe('Status Command', () => {
    it('displays active state with phase and progress', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Phase:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Active)'));
    });

    it('displays blocked state with query and options', async () => {
      const state = createBlockedState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Blocked)'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Blocking Query:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Should we use TypeScript strict mode?')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Suggested Resolutions:'));
    });

    it('displays completed state with artifact summary', async () => {
      const state = createCompletedState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Protocol Complete'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Artifacts:'));
    });

    it('shows friendly message when no state file exists', async () => {
      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No protocol state found')
      );
    });
  });

  describe('Resolve Command', () => {
    it('displays no pending queries when not blocked', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No queries pending'));
    });

    it('displays available queries and options when blocked', async () => {
      const state = createBlockedState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1 Pending Query'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('query_001'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Should we use TypeScript strict mode?')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Options:'));
    });

    it('displays multiple pending queries', async () => {
      const query1: BlockingRecord = {
        id: 'query_001',
        phase: 'Lattice',
        query: 'Use TypeScript strict mode?',
        options: ['Yes', 'No'],
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const query2: BlockingRecord = {
        id: 'query_002',
        phase: 'Injection',
        query: 'Enable test coverage?',
        options: ['Yes', 'No'],
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const state: CliStateSnapshot = {
        ...createActiveState(),
        blockingQueries: [query1, query2],
      };

      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 Pending Queries'));
    });
  });

  describe('Resume Command', () => {
    it('displays error when no resolved queries exist', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resume'] });
      const result = await handleResumeCommand(context);

      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No blocked state to resume')
      );
    });

    it('displays summary when resolved queries exist', async () => {
      const baseState = createBlockedState();
      const resolvedQuery: BlockingRecord = {
        id: 'query_001',
        phase: 'Lattice',
        query: 'Use TypeScript strict mode?',
        options: ['Yes', 'No'],
        blockedAt: new Date().toISOString(),
        resolved: true,
        resolution: {
          response: 'Yes',
          resolvedAt: new Date().toISOString(),
        },
      };

      const state: CliStateSnapshot = {
        ...baseState,
        blockingQueries: [resolvedQuery],
        resolvedQueries: [
          {
            record: resolvedQuery,
            resolvedAt: new Date().toISOString(),
          },
        ],
      };

      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resume'] });
      const result = await handleResumeCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('decision made since block')
      );
    });

    it('displays resuming from correct phase', async () => {
      const baseState = createBlockedState();
      const resolvedQuery: BlockingRecord = {
        id: 'query_001',
        phase: 'Injection',
        query: 'Enable test coverage?',
        options: ['Yes', 'No'],
        blockedAt: new Date().toISOString(),
        resolved: true,
        resolution: {
          response: 'Yes',
          resolvedAt: new Date().toISOString(),
        },
      };

      const state: CliStateSnapshot = {
        ...baseState,
        state: {
          phase: 'Injection',
          substate: { kind: 'Active' },
        },
        blockingQueries: [resolvedQuery],
        resolvedQueries: [
          {
            record: resolvedQuery,
            resolvedAt: new Date().toISOString(),
          },
        ],
      };

      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resume'] });
      const result = await handleResumeCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resuming protocol from Injection')
      );
    });
  });

  describe('Config Integration', () => {
    it('respects color configuration from criticality.toml', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const configContent = `
[cli]
colors = false
unicode = false
watch_interval = 2000
`;
      await writeFile(join(testDir, 'criticality.toml'), configContent, 'utf-8');

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('respects unicode configuration from criticality.toml', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const configContent = `
[cli]
colors = true
unicode = false
watch_interval = 2000
`;
      await writeFile(join(testDir, 'criticality.toml'), configContent, 'utf-8');

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
    });

    it('handles missing config file with defaults', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('checks notification hooks in config', async () => {
      const state = createActiveState();
      await saveCliState(state, statePath);

      const configContent = `
[cli]
colors = false
unicode = false
watch_interval = 2000

[notifications]
on_block = { command = "notify-send 'Protocol blocked'", enabled = true }
on_complete = { command = "notify-send 'Protocol complete'", enabled = true }
`;
      await writeFile(join(testDir, 'criticality.toml'), configContent, 'utf-8');

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('End-to-End Workflows', () => {
    it('handles blocked -> resolved -> resume workflow', async () => {
      const blockedState = createBlockedState();
      await saveCliState(blockedState, statePath);

      const statusResult = await handleStatusCommand(createMockContext({ args: ['status'] }));
      expect(statusResult.exitCode).toBe(0);

      const resolvedQuery: BlockingRecord = {
        ...blockedState.blockingQueries[0]!,
        resolved: true,
        resolution: {
          response: 'Yes, use strict mode',
          resolvedAt: new Date().toISOString(),
        },
      };

      const resumedState: CliStateSnapshot = {
        ...blockedState,
        blockingQueries: [resolvedQuery],
        resolvedQueries: [
          {
            record: resolvedQuery,
            resolvedAt: new Date().toISOString(),
          },
        ],
      };

      await saveCliState(resumedState, statePath);

      const resumeResult = await handleResumeCommand(createMockContext({ args: ['resume'] }));
      expect(resumeResult.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resuming protocol from Lattice')
      );
    });

    it('handles multiple blocking queries sequentially', async () => {
      const query1: BlockingRecord = {
        id: 'query_001',
        phase: 'Lattice',
        query: 'Question 1?',
        options: ['A', 'B'],
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const query2: BlockingRecord = {
        id: 'query_002',
        phase: 'Injection',
        query: 'Question 2?',
        options: ['X', 'Y'],
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      const state: CliStateSnapshot = {
        ...createActiveState(),
        blockingQueries: [query1, query2],
      };

      await saveCliState(state, statePath);

      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 Pending Queries'));
    });
  });
});
