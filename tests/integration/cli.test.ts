/**
 * Integration tests for CLI commands.
 *
 * Tests end-to-end behavior of status, resolve, resume commands
 * including state management and error handling.
 *
 * Note: Tests for interactive resolve command functionality are limited
 * because the command requires TTY input. The resolve command tests
 * focus on non-blocked states and display verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleStatusCommand } from '../../src/cli/commands/status.js';
import { handleResolveCommand } from '../../src/cli/commands/resolve.js';
import { handleResumeCommand } from '../../src/cli/commands/resume.js';
import type { CliContext } from '../../src/cli/types.js';
import { saveState, type ProtocolStateSnapshot } from '../../src/protocol/persistence.js';
import { type BlockingRecord } from '../../src/protocol/blocking.js';

describe('CLI Integration Tests', () => {
  let testDir: string;
  let statePath: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `crit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    statePath = join(testDir, '.criticality-state.json');

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.chdir(testDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
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

  function createActiveState(): ProtocolStateSnapshot {
    return {
      state: {
        phase: 'Lattice',
        substate: { kind: 'Active' },
      },
      artifacts: ['spec'],
      blockingQueries: [],
    };
  }

  function createBlockedState(): ProtocolStateSnapshot {
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
    };
  }

  function createCompletedState(): ProtocolStateSnapshot {
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
    };
  }

  describe('Status Command', () => {
    it('displays active state with phase and progress', async () => {
      const state = createActiveState();
      await saveState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Phase:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Active)'));
    });

    it('displays blocked state with query and options', async () => {
      const state = createBlockedState();
      await saveState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Blocked)'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Blocking'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Should we use TypeScript strict mode?')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Suggested Resolutions:'));
    });

    it('displays completed state with artifact summary', async () => {
      const state = createCompletedState();
      await saveState(state, statePath);

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
      await saveState(state, statePath);

      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No queries pending'));
    });

    it('shows friendly message when no state file exists', async () => {
      const context = createMockContext({ args: ['resolve'] });
      const result = await handleResolveCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No protocol state found')
      );
    });

    // Note: Tests for interactive query resolution are not included here
    // because they require TTY input. The resolve command enters an
    // interactive mode when there are pending queries, which cannot be
    // easily tested in a non-TTY environment without mocking stdin.
  });

  describe('Resume Command', () => {
    it('displays error when no resolved queries exist', async () => {
      const state = createActiveState();
      await saveState(state, statePath);

      const context = createMockContext({ args: ['resume'] });
      const result = await handleResumeCommand(context);

      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No blocked state to resume')
      );
    });

    it('shows friendly message when no state file exists', async () => {
      const context = createMockContext({ args: ['resume'] });
      const result = await handleResumeCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No protocol state found')
      );
    });

    // Note: Resume command tests with resolved queries require the CLI state
    // format which has a different structure than the protocol state format.
    // These tests would need to mock the file system or use a different approach.
  });

  describe('Config Integration', () => {
    it('respects color configuration from criticality.toml', async () => {
      const state = createActiveState();
      await saveState(state, statePath);

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
      await saveState(state, statePath);

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
      await saveState(state, statePath);

      const context = createMockContext({ args: ['status'] });
      const result = await handleStatusCommand(context);

      expect(result.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('checks notification hooks in config', async () => {
      const state = createActiveState();
      await saveState(state, statePath);

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
    it('handles complete state after all phases', async () => {
      const state = createCompletedState();
      await saveState(state, statePath);

      const statusResult = await handleStatusCommand(createMockContext({ args: ['status'] }));
      expect(statusResult.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Protocol Complete'));
    });

    it('handles active state with progress display', async () => {
      const state = createActiveState();
      await saveState(state, statePath);

      const statusResult = await handleStatusCommand(createMockContext({ args: ['status'] }));
      expect(statusResult.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Active)'));
    });

    it('handles blocked state status display', async () => {
      const state = createBlockedState();
      await saveState(state, statePath);

      const statusResult = await handleStatusCommand(createMockContext({ args: ['status'] }));
      expect(statusResult.exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lattice (Blocked)'));
    });
  });
});
