import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  detectExistingState,
  validateStateIntegrity,
  validatePersistedStructure,
  resumeFromCheckpoint,
  getStartupState,
  isStateCorrupted,
  DEFAULT_MAX_STATE_AGE_MS,
} from './checkpoint.js';
import {
  saveState,
  PERSISTED_STATE_VERSION,
  type ProtocolStateSnapshot,
  type PersistedStateData,
} from './persistence.js';
import { createActiveState, createBlockingSubstate, createFailedSubstate } from './types.js';
import type { ArtifactType } from './transitions.js';
import type { BlockingRecord } from './blocking.js';

describe('Protocol Checkpoint/Resume', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `checkpoint-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createTestSnapshot = (
    overrides: Partial<ProtocolStateSnapshot> = {}
  ): ProtocolStateSnapshot => ({
    state: createActiveState('Ignition'),
    artifacts: [],
    blockingQueries: [],
    ...overrides,
  });

  describe('detectExistingState', () => {
    it('should return found: true when state file exists', async () => {
      const snapshot = createTestSnapshot();
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await detectExistingState({ filePath });

      expect(result.found).toBe(true);
      expect(result.filePath).toBe(filePath);
      if (result.found) {
        expect(result.modifiedAt).toBeInstanceOf(Date);
      }
    });

    it('should return found: false when state file does not exist', async () => {
      const filePath = join(testDir, 'nonexistent.json');

      const result = await detectExistingState({ filePath });

      expect(result.found).toBe(false);
      expect(result.filePath).toBe(filePath);
    });

    it('should use default file path when not specified', async () => {
      const result = await detectExistingState();

      expect(result.filePath).toBe('.criticality-state.json');
    });

    it('should return modification time from file stats', async () => {
      const snapshot = createTestSnapshot();
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await detectExistingState({ filePath });

      expect(result.found).toBe(true);
      if (result.found) {
        const now = new Date();
        expect(result.modifiedAt.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(result.modifiedAt.getTime()).toBeGreaterThan(now.getTime() - 60000);
      }
    });
  });

  describe('validateStateIntegrity', () => {
    it('should return valid for well-formed state at Ignition phase', () => {
      const snapshot = createTestSnapshot();
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for state at Lattice with required artifacts', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Lattice'),
        artifacts: ['spec'],
      });
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(true);
    });

    it('should return error for invalid phase', () => {
      const snapshot = {
        state: { phase: 'InvalidPhase' as const, substate: { kind: 'Active' as const } },
        artifacts: [],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      // @ts-expect-error - Testing invalid phase
      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PHASE')).toBe(true);
    });

    it('should return error for invalid substate kind', () => {
      const snapshot = {
        state: {
          phase: 'Ignition' as const,
          substate: { kind: 'Invalid' as const },
        },
        artifacts: [],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      // @ts-expect-error - Testing invalid substate kind
      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_SUBSTATE')).toBe(true);
    });

    it('should return error for Blocking substate missing query', () => {
      const snapshot = {
        state: {
          phase: 'Lattice' as const,
          substate: { kind: 'Blocking' as const, blockedAt: new Date().toISOString() },
        },
        artifacts: ['spec'],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      // @ts-expect-error - Testing missing query
      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('missing query'))).toBe(true);
    });

    it('should return error for Failed substate missing error', () => {
      const snapshot = {
        state: {
          phase: 'Injection' as const,
          substate: {
            kind: 'Failed' as const,
            failedAt: new Date().toISOString(),
            recoverable: true,
          },
        },
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'validatedStructure'],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      // @ts-expect-error - Testing missing error field
      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('error message'))).toBe(true);
    });

    it('should return error for missing required artifacts at Lattice phase', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Lattice'),
        artifacts: [], // Missing 'spec'
      });
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_ARTIFACTS')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('spec'))).toBe(true);
    });

    it('should return error for missing required artifacts at CompositionAudit phase', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('CompositionAudit'),
        artifacts: ['spec'], // Missing latticeCode, witnesses, contracts
      });
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_ARTIFACTS')).toBe(true);
    });

    it('should warn for unknown artifact types', () => {
      const snapshot = {
        state: createActiveState('Ignition'),
        artifacts: ['unknownArtifact' as ArtifactType],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(true); // Warning, not error
      expect(result.warnings.some((w) => w.code === 'UNKNOWN_ARTIFACTS')).toBe(true);
    });

    it('should warn for stale state when allowStaleState is true', () => {
      const snapshot = createTestSnapshot();
      const persistedAt = new Date(Date.now() - DEFAULT_MAX_STATE_AGE_MS - 1000);

      const result = validateStateIntegrity(snapshot, persistedAt, { allowStaleState: true });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'STALE_STATE')).toBe(true);
    });

    it('should respect custom maxAgeMs', () => {
      const snapshot = createTestSnapshot();
      const persistedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      const result = validateStateIntegrity(snapshot, persistedAt, { maxAgeMs: 1 * 60 * 1000 });

      expect(result.warnings.some((w) => w.code === 'STALE_STATE')).toBe(true);
    });

    it('should warn for blocking state with expired timeout', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Test query?',
        timeoutMs: 1000, // 1 second timeout
      });
      // Manually set blockedAt to past
      const snapshot = {
        state: {
          phase: 'Lattice' as const,
          substate: {
            ...blockingSubstate,
            blockedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
          },
        },
        artifacts: ['spec' as ArtifactType],
        blockingQueries: [],
      };
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.warnings.some((w) => w.code === 'BLOCKING_TIMEOUT_EXPIRED')).toBe(true);
    });

    it('should validate complete protocol state at Complete phase', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Complete'),
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
      });
      const persistedAt = new Date();

      const result = validateStateIntegrity(snapshot, persistedAt);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validatePersistedStructure', () => {
    it('should return valid for well-formed persisted data', () => {
      const data = {
        version: '1.0.0',
        persistedAt: new Date().toISOString(),
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };

      const result = validatePersistedStructure(data);

      expect(result.valid).toBe(true);
    });

    it('should return error for null input', () => {
      const result = validatePersistedStructure(null);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CORRUPTED_STRUCTURE')).toBe(true);
    });

    it('should return error for missing version', () => {
      const data = {
        persistedAt: new Date().toISOString(),
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };

      const result = validatePersistedStructure(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CORRUPTED_STRUCTURE')).toBe(true);
    });

    it('should return error for invalid version format', () => {
      const data = {
        version: 'invalid',
        persistedAt: new Date().toISOString(),
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };

      const result = validatePersistedStructure(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_VERSION')).toBe(true);
    });

    it('should return error for future major version', () => {
      const data = {
        version: '99.0.0', // Future version
        persistedAt: new Date().toISOString(),
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };

      const result = validatePersistedStructure(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'FUTURE_VERSION')).toBe(true);
    });

    it('should warn for older minor version', () => {
      // Only test if current version is > 1.0.0
      const currentParsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(PERSISTED_STATE_VERSION);
      if (!currentParsed) {
        return;
      }

      const major = parseInt(currentParsed[1] ?? '1', 10);
      const minor = parseInt(currentParsed[2] ?? '0', 10);
      const patch = parseInt(currentParsed[3] ?? '0', 10);

      if (minor === 0 && patch === 0) {
        return;
      } // Can't test with 1.0.0

      const olderVersion =
        patch > 0
          ? `${String(major)}.${String(minor)}.${String(patch - 1)}`
          : `${String(major)}.${String(minor > 0 ? minor - 1 : 0)}.0`;

      const data = {
        version: olderVersion,
        persistedAt: new Date().toISOString(),
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };

      const result = validatePersistedStructure(data);

      // Should be valid but with warning
      expect(result.warnings.some((w) => w.code === 'OLD_VERSION')).toBe(true);
    });

    it('should return error for missing required fields', () => {
      const data = {
        version: '1.0.0',
        // Missing other fields
      };

      const result = validatePersistedStructure(data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('resumeFromCheckpoint', () => {
    it('should successfully resume from valid state file', async () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Lattice'),
        artifacts: ['spec'],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.state.phase).toBe('Lattice');
        expect(result.snapshot.artifacts).toEqual(['spec']);
        expect(result.validation.valid).toBe(true);
      }
    });

    it('should return NO_STATE_FILE when file does not exist', async () => {
      const filePath = join(testDir, 'nonexistent.json');

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('NO_STATE_FILE');
        expect(result.recoveryAction).toBe('CLEAN_START');
      }
    });

    it('should return CORRUPTED_STATE for invalid JSON', async () => {
      const filePath = join(testDir, 'corrupted.json');
      await writeFile(filePath, '{ invalid json }}}', 'utf-8');

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('CORRUPTED_STATE');
        expect(result.recoveryAction).toBe('CLEAN_START');
        expect(result.error).toBeDefined();
      }
    });

    it('should return CORRUPTED_STATE for empty file', async () => {
      const filePath = join(testDir, 'empty.json');
      await writeFile(filePath, '', 'utf-8');

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('CORRUPTED_STATE');
        expect(result.recoveryAction).toBe('CLEAN_START');
      }
    });

    it('should return INVALID_STATE for state with missing artifacts', async () => {
      // Manually write a state file with missing artifacts
      const data: PersistedStateData = {
        version: '1.0.0',
        persistedAt: new Date().toISOString(),
        phase: 'Lattice',
        substate: { kind: 'Active' },
        artifacts: [], // Missing 'spec'
        blockingQueries: [],
      };
      const filePath = join(testDir, 'invalid.json');
      await writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('INVALID_STATE');
        expect(result.recoveryAction).toBe('CLEAN_START');
      }
    });

    it('should resume from blocking state', async () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve architecture?',
        options: ['Yes', 'No'],
        timeoutMs: 300000,
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.state.substate.kind).toBe('Blocking');
      }
    });

    it('should resume from failed state', async () => {
      const failedSubstate = createFailedSubstate({
        error: 'Type checking failed',
        code: 'TYPE_ERROR',
        recoverable: true,
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Injection', substate: failedSubstate },
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'validatedStructure'],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.state.substate.kind).toBe('Failed');
        if (result.snapshot.state.substate.kind === 'Failed') {
          expect(result.snapshot.state.substate.error).toBe('Type checking failed');
        }
      }
    });

    it('should include validation warnings in result', async () => {
      const snapshot = {
        state: createActiveState('Ignition'),
        artifacts: ['unknownArtifact' as ArtifactType],
        blockingQueries: [],
      };
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.validation.warnings.some((w) => w.code === 'UNKNOWN_ARTIFACTS')).toBe(true);
      }
    });

    it('should preserve blocking queries through resume', async () => {
      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_123',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No'],
        blockedAt: '2024-01-20T12:00:00.000Z',
        resolved: false,
      };
      const snapshot = createTestSnapshot({
        state: createActiveState('Lattice'),
        artifacts: ['spec'],
        blockingQueries: [blockingRecord],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await resumeFromCheckpoint(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.blockingQueries).toHaveLength(1);
        expect(result.snapshot.blockingQueries[0]?.id).toBe('blocking_lattice_123');
      }
    });
  });

  describe('getStartupState', () => {
    it('should return fresh state when no state file exists', async () => {
      const filePath = join(testDir, 'nonexistent.json');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(false);
      expect(result.snapshot.state.phase).toBe('Ignition');
      expect(result.snapshot.artifacts).toEqual([]);
      expect(result.validation).toBeNull();
    });

    it('should resume from valid state file', async () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('CompositionAudit'),
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts'],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(true);
      expect(result.recoveryPerformed).toBe(false);
      expect(result.snapshot.state.phase).toBe('CompositionAudit');
      expect(result.validation).not.toBeNull();
    });

    it('should recover and return fresh state for corrupted file', async () => {
      const filePath = join(testDir, 'corrupted.json');
      await writeFile(filePath, '{ corrupted }}}', 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
      expect(result.snapshot.state.phase).toBe('Ignition');
    });

    it('should recover and return fresh state for invalid state', async () => {
      // State at Lattice but missing required artifacts
      const data: PersistedStateData = {
        version: '1.0.0',
        persistedAt: new Date().toISOString(),
        phase: 'Lattice',
        substate: { kind: 'Active' },
        artifacts: [], // Invalid - missing 'spec'
        blockingQueries: [],
      };
      const filePath = join(testDir, 'invalid.json');
      await writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
      expect(result.snapshot.state.phase).toBe('Ignition');
    });

    it('should include validation result when resuming', async () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Lattice'),
        artifacts: ['spec'],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(true);
      expect(result.validation).not.toBeNull();
      expect(result.validation?.valid).toBe(true);
    });
  });

  describe('isStateCorrupted', () => {
    it('should return false for valid state file', async () => {
      const snapshot = createTestSnapshot();
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const corrupted = await isStateCorrupted(filePath);

      expect(corrupted).toBe(false);
    });

    it('should return true for corrupted JSON', async () => {
      const filePath = join(testDir, 'corrupted.json');
      await writeFile(filePath, '{ invalid }}}', 'utf-8');

      const corrupted = await isStateCorrupted(filePath);

      expect(corrupted).toBe(true);
    });

    it('should return true for empty file', async () => {
      const filePath = join(testDir, 'empty.json');
      await writeFile(filePath, '', 'utf-8');

      const corrupted = await isStateCorrupted(filePath);

      expect(corrupted).toBe(true);
    });

    it('should return true for truncated file', async () => {
      const filePath = join(testDir, 'truncated.json');
      await writeFile(filePath, '{"version": "1.0.0", "persistedAt":', 'utf-8');

      const corrupted = await isStateCorrupted(filePath);

      expect(corrupted).toBe(true);
    });

    it('should return false for non-existent file (not corrupted, just missing)', async () => {
      const filePath = join(testDir, 'nonexistent.json');

      const corrupted = await isStateCorrupted(filePath);

      // A non-existent file is not corrupted - it simply doesn't exist
      expect(corrupted).toBe(false);
    });

    it('should return true for file with invalid schema', async () => {
      const filePath = join(testDir, 'invalid-schema.json');
      await writeFile(filePath, JSON.stringify({ notAValidState: true }), 'utf-8');

      const corrupted = await isStateCorrupted(filePath);

      expect(corrupted).toBe(true);
    });
  });

  describe('restart after crash resumes from last checkpoint (example)', () => {
    it('should resume from exact position after simulated crash', async () => {
      // 1. Save state at a specific position
      const snapshot = createTestSnapshot({
        state: createActiveState('Injection'),
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'validatedStructure'],
        blockingQueries: [],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      // 2. Simulate crash by just not doing anything with the state

      // 3. On "restart", detect and resume
      const detectionResult = await detectExistingState({ filePath });
      expect(detectionResult.found).toBe(true);

      const resumeResult = await resumeFromCheckpoint(filePath);
      expect(resumeResult.success).toBe(true);

      if (resumeResult.success) {
        // Verify we resume from exact position
        expect(resumeResult.snapshot.state.phase).toBe('Injection');
        expect(resumeResult.snapshot.artifacts).toEqual([
          'spec',
          'latticeCode',
          'witnesses',
          'contracts',
          'validatedStructure',
        ]);
      }
    });

    it('should resume blocking state after crash', async () => {
      // 1. Save state while blocked for human intervention
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve implementation?',
        options: ['Yes', 'No', 'Request changes'],
        timeoutMs: 86400000, // 24 hours
      });
      const blockingRecord: BlockingRecord = {
        id: 'blocking_injection_001',
        phase: 'Injection',
        query: 'Approve implementation?',
        options: ['Yes', 'No', 'Request changes'],
        blockedAt: blockingSubstate.blockedAt,
        timeoutMs: 86400000,
        resolved: false,
      };
      const snapshot = createTestSnapshot({
        state: { phase: 'Injection', substate: blockingSubstate },
        artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts', 'validatedStructure'],
        blockingQueries: [blockingRecord],
      });
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      // 2. Simulate crash and restart
      const startupResult = await getStartupState(filePath);

      // 3. Verify blocking state is restored
      expect(startupResult.resumed).toBe(true);
      expect(startupResult.snapshot.state.substate.kind).toBe('Blocking');
      expect(startupResult.snapshot.blockingQueries).toHaveLength(1);

      if (startupResult.snapshot.state.substate.kind === 'Blocking') {
        expect(startupResult.snapshot.state.substate.query).toBe('Approve implementation?');
      }
    });
  });

  describe('corrupted state file triggers recovery or clean start (negative case)', () => {
    it('should trigger clean start for corrupted JSON syntax', async () => {
      const filePath = join(testDir, 'corrupted.json');
      await writeFile(filePath, '{"version": corrupted syntax }}}', 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
      expect(result.snapshot.state.phase).toBe('Ignition');
    });

    it('should trigger clean start for truncated state file', async () => {
      const filePath = join(testDir, 'truncated.json');
      await writeFile(filePath, '{"version": "1.0.0", "persisted', 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
      expect(result.snapshot.state.phase).toBe('Ignition');
    });

    it('should trigger clean start for state with invalid phase', async () => {
      const data = {
        version: '1.0.0',
        persistedAt: new Date().toISOString(),
        phase: 'NonExistentPhase',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      };
      const filePath = join(testDir, 'invalid-phase.json');
      await writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
    });

    it('should trigger clean start for state with missing required fields', async () => {
      const data = {
        version: '1.0.0',
        // Missing persistedAt, phase, substate, etc.
      };
      const filePath = join(testDir, 'incomplete.json');
      await writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
    });

    it('should trigger clean start for empty file', async () => {
      const filePath = join(testDir, 'empty.json');
      await writeFile(filePath, '', 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
    });

    it('should trigger clean start for file with only whitespace', async () => {
      const filePath = join(testDir, 'whitespace.json');
      await writeFile(filePath, '   \n\t  ', 'utf-8');

      const result = await getStartupState(filePath);

      expect(result.resumed).toBe(false);
      expect(result.recoveryPerformed).toBe(true);
    });
  });

  describe('DEFAULT_MAX_STATE_AGE_MS', () => {
    it('should be 24 hours in milliseconds', () => {
      expect(DEFAULT_MAX_STATE_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });
  });
});
