/**
 * Tests for Protocol CLI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeMkdir } from '../utils/safe-fs.js';
import {
  parseArgs,
  executeStatus,
  executeResume,
  executeResolve,
  executeHelp,
  executeCommand,
  DEFAULT_STATE_PATH,
} from './cli.js';
import type { ProtocolStateSnapshot } from './persistence.js';
import { saveState } from './persistence.js';
import {
  createActiveState,
  createBlockedState,
  createFailedState,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
  createLatticePhaseState,
  createLatticeGeneratingStructure,
  createCompleteState,
} from './types.js';

describe('Protocol CLI', () => {
  describe('parseArgs', () => {
    it('defaults to help command with no args', () => {
      const options = parseArgs([]);
      expect(options.command).toBe('help');
      expect(options.statePath).toBe(DEFAULT_STATE_PATH);
      expect(options.verbose).toBe(false);
    });

    it('parses status command', () => {
      const options = parseArgs(['status']);
      expect(options.command).toBe('status');
    });

    it('parses resume command', () => {
      const options = parseArgs(['resume']);
      expect(options.command).toBe('resume');
    });

    it('parses resolve command with response', () => {
      const options = parseArgs(['resolve', 'Use JWT auth']);
      expect(options.command).toBe('resolve');
      expect(options.resolution).toBe('Use JWT auth');
    });

    it('parses help command', () => {
      const options = parseArgs(['help']);
      expect(options.command).toBe('help');
    });

    it('parses --help flag', () => {
      const options = parseArgs(['--help']);
      expect(options.command).toBe('help');
    });

    it('parses -h flag', () => {
      const options = parseArgs(['-h']);
      expect(options.command).toBe('help');
    });

    it('parses --state-path option', () => {
      const options = parseArgs(['status', '--state-path', '/custom/path.json']);
      expect(options.statePath).toBe('/custom/path.json');
    });

    it('parses -s shorthand for state path', () => {
      const options = parseArgs(['status', '-s', '/custom/path.json']);
      expect(options.statePath).toBe('/custom/path.json');
    });

    it('parses --verbose flag', () => {
      const options = parseArgs(['status', '--verbose']);
      expect(options.verbose).toBe(true);
    });

    it('parses -v shorthand for verbose', () => {
      const options = parseArgs(['status', '-v']);
      expect(options.verbose).toBe(true);
    });

    it('handles mixed options and commands', () => {
      const options = parseArgs(['-v', 'status', '--state-path', './state.json']);
      expect(options.command).toBe('status');
      expect(options.statePath).toBe('./state.json');
      expect(options.verbose).toBe(true);
    });
  });

  describe('executeHelp', () => {
    it('returns success with help text', () => {
      const result = executeHelp();

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('criticality');
      expect(result.message).toContain('status');
      expect(result.message).toContain('resume');
      expect(result.message).toContain('resolve');
    });
  });

  describe('executeStatus', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `cli-status-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('returns message when no state file exists', async () => {
      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No state file found');
    });

    it('displays active state correctly', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
        artifacts: ['spec'],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Phase: Lattice');
      expect(result.message).toContain('State: Active');
      expect(result.message).toContain('spec');
    });

    it('displays blocking state with query', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createBlockedState({
          reason: 'user_requested',
          phase: 'Ignition',
          query: 'What auth method?',
        }),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('BLOCKED');
      expect(result.message).toContain('What auth method?');
      expect(result.message).toContain('criticality resolve');
    });

    it('displays failed state with error', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createFailedState({
          phase: 'Injection',
          error: 'Compilation failed',
          recoverable: true,
        }),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('FAILED');
      expect(result.message).toContain('Compilation failed');
      expect(result.message).toContain('Recoverable: yes');
    });

    it('shows verbose details when requested', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
        artifacts: ['spec'],
        blockingQueries: [
          {
            id: 'q1',
            phase: 'Ignition',
            query: 'Previous question?',
            blockedAt: new Date().toISOString(),
            resolved: true,
          },
        ],
      };
      await saveState(snapshot, statePath);

      const result = await executeStatus({
        command: 'status',
        statePath,
        verbose: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Verbose Details');
      expect(result.message).toContain('Blocking queries: 1');
    });
  });

  describe('executeResolve', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `cli-resolve-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('requires resolution text', async () => {
      const result = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: undefined,
        verbose: false,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('requires a response');
    });

    it('fails when no state file exists', async () => {
      const result = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: 'Yes',
        verbose: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No state file found');
    });

    it('fails when not in blocking state', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createActiveState(
          createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
        ),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: 'Yes',
        verbose: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not blocked');
    });

    it('records resolution and transitions to active', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createBlockedState({
          reason: 'user_requested',
          phase: 'Ignition',
          query: 'Question?',
        }),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeResolve({
        command: 'resolve',
        statePath,
        resolution: 'Use JWT',
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Resolution recorded');
      expect(result.message).toContain('Use JWT');
      expect(result.message).toContain('criticality resume');
    });
  });

  describe('executeResume', () => {
    let testDir: string;
    let statePath: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `cli-resume-test-${String(Date.now())}`);
      await safeMkdir(testDir, { recursive: true });
      statePath = join(testDir, 'state.json');
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('starts fresh when no state file exists', async () => {
      const result = await executeResume({
        command: 'resume',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Ignition');
    });

    it('reports blocked status when blocked', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createBlockedState({
          reason: 'user_requested',
          phase: 'Ignition',
          query: 'What to do?',
        }),
        artifacts: [],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeResume({
        command: 'resume',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('blocked');
      expect(result.message).toContain('What to do?');
    });

    it('reports complete when in complete phase', async () => {
      const snapshot: ProtocolStateSnapshot = {
        state: createCompleteState([
          'spec',
          'latticeCode',
          'witnesses',
          'contracts',
          'validatedStructure',
          'implementedCode',
          'verifiedCode',
          'finalArtifact',
        ]),
        artifacts: [
          'spec',
          'latticeCode',
          'witnesses',
          'contracts',
          'validatedStructure',
          'implementedCode',
          'verifiedCode',
          'finalArtifact',
        ],
        blockingQueries: [],
      };
      await saveState(snapshot, statePath);

      const result = await executeResume({
        command: 'resume',
        statePath,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('complete');
    });
  });

  describe('executeCommand', () => {
    it('dispatches to correct handler', async () => {
      const helpResult = await executeCommand({
        command: 'help',
        statePath: DEFAULT_STATE_PATH,
        verbose: false,
      });

      expect(helpResult.success).toBe(true);
      expect(helpResult.message).toContain('criticality');
    });
  });
});
