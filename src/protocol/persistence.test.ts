import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { safeMkdir, safeReadFile, safeReaddir, safeWriteFile } from '../utils/safe-fs.js';
import {
  serializeState,
  deserializeState,
  saveState,
  loadState,
  stateFileExists,
  createInitialStateSnapshot,
  StatePersistenceError,
  PERSISTED_STATE_VERSION,
  type ProtocolStateSnapshot,
  type PersistedStateData,
} from './persistence.js';
import {
  createActiveState,
  createBlockedState,
  createFailedState,
  isActiveState,
  isBlockedState,
  isFailedState,
  getPhase,
  createIgnitionPhaseState,
  createIgnitionInterviewing,
  createLatticePhaseState,
  createLatticeGeneratingStructure,
  createCompositionAuditPhaseState,
  createCompositionAuditAuditing,
  createMesoscopicPhaseState,
  createMesoscopicGeneratingTests,
} from './types.js';
import type { BlockingRecord } from './blocking.js';
import type { ArtifactType } from './transitions.js';

describe('Protocol State Persistence', () => {
  const createTestSnapshot = (
    overrides: Partial<ProtocolStateSnapshot> = {}
  ): ProtocolStateSnapshot => ({
    state: createActiveState(createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))),
    artifacts: [],
    blockingQueries: [],
    ...overrides,
  });

  describe('serializeState', () => {
    it('should serialize state snapshot to JSON string', () => {
      const snapshot = createTestSnapshot();

      const json = serializeState(snapshot);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json) as PersistedStateData;
      expect(parsed.state.kind).toBe('Active');
      if (parsed.state.kind === 'Active') {
        expect(parsed.state.phase.phase).toBe('Ignition');
      }
      expect(parsed.artifacts).toEqual([]);
      expect(parsed.blockingQueries).toEqual([]);
    });

    it('should include version and timestamp', () => {
      const snapshot = createTestSnapshot();

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.version).toBe(PERSISTED_STATE_VERSION);
      expect(parsed.persistedAt).toBeDefined();
      expect(new Date(parsed.persistedAt).getTime()).not.toBeNaN();
    });

    it('should output pretty-printed JSON by default', () => {
      const snapshot = createTestSnapshot();

      const json = serializeState(snapshot);

      expect(json).toContain('\n');
      expect(json).toMatch(/^ {2}"version":/m);
    });

    it('should output compact JSON when pretty is false', () => {
      const snapshot = createTestSnapshot();

      const json = serializeState(snapshot, { pretty: false });

      expect(json).not.toContain('\n');
    });

    it('should respect custom indentation', () => {
      const snapshot = createTestSnapshot();

      const json = serializeState(snapshot, { indent: 4 });

      expect(json).toMatch(/^ {4}"version":/m);
    });

    it('should serialize state with artifacts', () => {
      const artifacts: ArtifactType[] = ['spec', 'latticeCode', 'witnesses'];
      const snapshot = createTestSnapshot({
        state: createActiveState(
          createCompositionAuditPhaseState(createCompositionAuditAuditing(0))
        ),
        artifacts,
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.artifacts).toEqual(artifacts);
      expect(parsed.state.kind).toBe('Active');
      if (parsed.state.kind === 'Active') {
        expect(parsed.state.phase.phase).toBe('CompositionAudit');
      }
    });

    it('should serialize blocked state', () => {
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });
      const snapshot = createTestSnapshot({ state: blockedState });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.state.kind).toBe('Blocked');
      if (parsed.state.kind === 'Blocked') {
        expect(parsed.state.query).toBe('Approve architecture?');
        expect(parsed.state.options).toEqual(['Yes', 'No', 'Revise']);
        expect(parsed.state.timeoutMs).toBe(300000);
        expect(parsed.state.blockedAt).toBeDefined();
      }
    });

    it('should serialize failed state', () => {
      const failedState = createFailedState({
        phase: 'Injection',
        error: 'Type checking failed',
        code: 'TYPE_ERROR',
        recoverable: true,
        context: 'Additional context',
      });
      const snapshot = createTestSnapshot({ state: failedState });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.state.kind).toBe('Failed');
      if (parsed.state.kind === 'Failed') {
        expect(parsed.state.error).toBe('Type checking failed');
        expect(parsed.state.code).toBe('TYPE_ERROR');
        expect(parsed.state.recoverable).toBe(true);
        expect(parsed.state.context).toBe('Additional context');
        expect(parsed.state.failedAt).toBeDefined();
      }
    });

    it('should serialize blocking queries', () => {
      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_123',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No'],
        blockedAt: '2024-01-20T12:00:00.000Z',
        timeoutMs: 300000,
        resolved: false,
      };
      const snapshot = createTestSnapshot({
        blockingQueries: [blockingRecord],
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.blockingQueries).toHaveLength(1);
      expect(parsed.blockingQueries[0]?.id).toBe('blocking_lattice_123');
    });

    it('should handle blocked state without optional fields', () => {
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Simple query',
      });
      const snapshot = createTestSnapshot({ state: blockedState });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.state.kind).toBe('Blocked');
      if (parsed.state.kind === 'Blocked') {
        expect(parsed.state.query).toBe('Simple query');
        expect(parsed.state.options).toBeUndefined();
        expect(parsed.state.timeoutMs).toBeUndefined();
      }
    });

    it('should handle failed state without optional fields', () => {
      const failedState = createFailedState({
        phase: 'Injection',
        error: 'Simple error',
        recoverable: false,
      });
      const snapshot = createTestSnapshot({ state: failedState });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.state.kind).toBe('Failed');
      if (parsed.state.kind === 'Failed') {
        expect(parsed.state.error).toBe('Simple error');
        expect(parsed.state.code).toBeUndefined();
        expect(parsed.state.context).toBeUndefined();
      }
    });
  });

  describe('deserializeState', () => {
    it('should deserialize valid JSON to state snapshot', () => {
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Active',
          phase: {
            phase: 'Lattice',
            substate: { step: 'generatingStructure' },
          },
        },
        artifacts: ['spec'],
        blockingQueries: [],
      });

      const snapshot = deserializeState(json);

      expect(getPhase(snapshot.state)).toBe('Lattice');
      expect(snapshot.state.kind).toBe('Active');
      expect(snapshot.artifacts).toEqual(['spec']);
      expect(snapshot.blockingQueries).toEqual([]);
    });

    it('should throw StatePersistenceError for invalid JSON syntax', () => {
      const invalidJson = '{ invalid json }';

      expect(() => deserializeState(invalidJson)).toThrow(StatePersistenceError);

      try {
        deserializeState(invalidJson);
      } catch (error) {
        expect(error).toBeInstanceOf(StatePersistenceError);
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('parse_error');
        expect(persistError.message).toContain('Failed to parse state JSON');
      }
    });

    it('should throw StatePersistenceError for null input', () => {
      expect(() => deserializeState('null')).toThrow(StatePersistenceError);

      try {
        deserializeState('null');
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('expected an object');
      }
    });

    it('should throw StatePersistenceError for missing required fields', () => {
      const json = JSON.stringify({ version: '2.0.0' });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('missing required field');
      }
    });

    it('should throw StatePersistenceError for invalid version format', () => {
      const json = JSON.stringify({
        version: 'invalid',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Active',
          phase: {
            phase: 'Ignition',
            substate: { step: 'interviewing', interviewPhase: 'Discovery', questionIndex: 0 },
          },
        },
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('does not match semver pattern');
      }
    });

    it('should throw StatePersistenceError for invalid state kind', () => {
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: { kind: 'InvalidKind' },
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('validation_error');
        expect(persistError.message).toContain('not valid');
      }
    });

    it('should deserialize blocked state', () => {
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Blocked',
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve?',
          options: ['Yes', 'No'],
          blockedAt: '2024-01-20T12:00:00.000Z',
          timeoutMs: 60000,
        },
        artifacts: [],
        blockingQueries: [],
      });

      const snapshot = deserializeState(json);

      expect(isBlockedState(snapshot.state)).toBe(true);
      if (isBlockedState(snapshot.state)) {
        expect(snapshot.state.query).toBe('Approve?');
        expect(snapshot.state.options).toEqual(['Yes', 'No']);
        expect(snapshot.state.timeoutMs).toBe(60000);
      }
    });

    it('should deserialize failed state', () => {
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Failed',
          phase: 'Injection',
          error: 'Something went wrong',
          code: 'ERR_001',
          failedAt: '2024-01-20T12:00:00.000Z',
          recoverable: true,
          context: 'Extra info',
        },
        artifacts: [],
        blockingQueries: [],
      });

      const snapshot = deserializeState(json);

      expect(isFailedState(snapshot.state)).toBe(true);
      if (isFailedState(snapshot.state)) {
        expect(snapshot.state.error).toBe('Something went wrong');
        expect(snapshot.state.code).toBe('ERR_001');
        expect(snapshot.state.recoverable).toBe(true);
        expect(snapshot.state.context).toBe('Extra info');
      }
    });

    it('should deserialize blocking queries', () => {
      const blockingRecord: BlockingRecord = {
        id: 'blocking_123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-01-20T12:00:00.000Z',
        resolved: false,
      };
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Active',
          phase: {
            phase: 'Lattice',
            substate: { step: 'generatingStructure' },
          },
        },
        artifacts: [],
        blockingQueries: [blockingRecord],
      });

      const snapshot = deserializeState(json);

      expect(snapshot.blockingQueries).toHaveLength(1);
      expect(snapshot.blockingQueries[0]?.id).toBe('blocking_123');
    });

    it('should throw StatePersistenceError for invalid blocking query', () => {
      const json = JSON.stringify({
        version: '2.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        state: {
          kind: 'Active',
          phase: {
            phase: 'Lattice',
            substate: { step: 'generatingStructure' },
          },
        },
        artifacts: [],
        blockingQueries: [{ invalid: 'query' }],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('blocking query must have');
      }
    });

    it('should throw StatePersistenceError for v1 format state (negative case)', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Ignition',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('missing required field');
      }
    });
  });

  describe('serialize/deserialize roundtrip', () => {
    it('should preserve active state through roundtrip', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState(createMesoscopicPhaseState(createMesoscopicGeneratingTests())),
        artifacts: [
          'spec',
          'latticeCode',
          'witnesses',
          'contracts',
          'validatedStructure',
          'implementedCode',
        ],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(getPhase(restored.state)).toBe('Mesoscopic');
      expect(isActiveState(restored.state)).toBe(true);
      expect(restored.artifacts).toEqual(snapshot.artifacts);
    });

    it('should preserve blocking state through roundtrip', () => {
      const blockedState = createBlockedState({
        reason: 'user_requested',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });
      const snapshot = createTestSnapshot({
        state: blockedState,
        artifacts: ['spec'],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(getPhase(restored.state)).toBe('Lattice');
      expect(isBlockedState(restored.state)).toBe(true);
      if (isBlockedState(restored.state)) {
        expect(restored.state.query).toBe('Approve architecture?');
        expect(restored.state.options).toEqual(['Yes', 'No', 'Revise']);
        expect(restored.state.timeoutMs).toBe(300000);
      }
    });

    it('should preserve failed state through roundtrip', () => {
      const failedState = createFailedState({
        phase: 'Injection',
        error: 'Type checking failed',
        code: 'TYPE_ERROR',
        recoverable: true,
        context: 'Line 42: type mismatch',
      });
      const snapshot = createTestSnapshot({
        state: failedState,
        artifacts: ['spec', 'latticeCode'],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(getPhase(restored.state)).toBe('Injection');
      expect(isFailedState(restored.state)).toBe(true);
      if (isFailedState(restored.state)) {
        expect(restored.state.error).toBe('Type checking failed');
        expect(restored.state.code).toBe('TYPE_ERROR');
        expect(restored.state.recoverable).toBe(true);
        expect(restored.state.context).toBe('Line 42: type mismatch');
      }
    });

    it('should preserve blocking queries through roundtrip', () => {
      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_123',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No'],
        blockedAt: '2024-01-20T12:00:00.000Z',
        timeoutMs: 300000,
        resolved: false,
      };
      const snapshot = createTestSnapshot({
        blockingQueries: [blockingRecord],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(restored.blockingQueries).toHaveLength(1);
      expect(restored.blockingQueries[0]).toEqual(blockingRecord);
    });
  });

  describe('saveState and loadState', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `state-test-${randomUUID()}`);
      await safeMkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('saveState', () => {
      it('should save state to file', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
          artifacts: ['spec'],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const content = await safeReadFile(filePath, 'utf-8');
        const parsed = JSON.parse(content) as PersistedStateData;
        expect(parsed.state.kind).toBe('Active');
        if (parsed.state.kind === 'Active') {
          expect(parsed.state.phase.phase).toBe('Lattice');
        }
        expect(parsed.artifacts).toEqual(['spec']);
      });

      it('should save pretty-printed JSON by default', async () => {
        const snapshot = createTestSnapshot();

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const content = await safeReadFile(filePath, 'utf-8');
        expect(content).toContain('\n');
      });

      it('should save compact JSON when pretty is false', async () => {
        const snapshot = createTestSnapshot();

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath, { pretty: false });

        const content = await safeReadFile(filePath, 'utf-8');
        expect(content).not.toContain('\n');
      });

      it('should perform atomic write (temp file then rename)', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        // File should exist with correct content
        const content = await safeReadFile(filePath, 'utf-8');
        expect(content).toContain('Lattice');

        // No temp files should remain
        const files = await safeReaddir(testDir);
        expect(files.filter((f: string) => f.includes('.tmp'))).toHaveLength(0);
      });

      it('should overwrite existing file', async () => {
        const snapshot1 = createTestSnapshot({
          state: createActiveState(
            createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
          ),
        });
        const snapshot2 = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot1, filePath);
        await saveState(snapshot2, filePath);

        const content = await safeReadFile(filePath, 'utf-8');
        expect(content).toContain('Lattice');
        expect(content).not.toContain('"phase": "Ignition"');
      });

      it('should throw StatePersistenceError for invalid directory', async () => {
        const snapshot = createTestSnapshot();

        const filePath = join(testDir, 'nonexistent', 'state.json');

        await expect(saveState(snapshot, filePath)).rejects.toThrow(StatePersistenceError);

        try {
          await saveState(snapshot, filePath);
        } catch (error) {
          const persistError = error as StatePersistenceError;
          expect(persistError.errorType).toBe('file_error');
          expect(persistError.message).toContain('Failed to save state');
        }
      });
    });

    describe('loadState', () => {
      it('should load state from file', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
          artifacts: ['spec'],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const loaded = await loadState(filePath);

        expect(getPhase(loaded.state)).toBe('Lattice');
        expect(loaded.artifacts).toEqual(['spec']);
      });

      it('should throw StatePersistenceError for non-existent file', async () => {
        const filePath = join(testDir, 'nonexistent.json');

        await expect(loadState(filePath)).rejects.toThrow(StatePersistenceError);

        try {
          await loadState(filePath);
        } catch (error) {
          const persistError = error as StatePersistenceError;
          expect(persistError.errorType).toBe('file_error');
          expect(persistError.message).toContain('not found');
        }
      });

      it('should throw StatePersistenceError for empty file', async () => {
        const filePath = join(testDir, 'empty.json');
        await safeWriteFile(filePath, '', 'utf-8');

        await expect(loadState(filePath)).rejects.toThrow(StatePersistenceError);

        try {
          await loadState(filePath);
        } catch (error) {
          const persistError = error as StatePersistenceError;
          expect(persistError.errorType).toBe('corruption_error');
          expect(persistError.message).toContain('empty');
        }
      });

      it('should throw StatePersistenceError for corrupted JSON', async () => {
        const filePath = join(testDir, 'corrupted.json');
        await safeWriteFile(filePath, '{ corrupted json data }}}', 'utf-8');

        await expect(loadState(filePath)).rejects.toThrow(StatePersistenceError);

        try {
          await loadState(filePath);
        } catch (error) {
          const persistError = error as StatePersistenceError;
          expect(persistError.errorType).toBe('parse_error');
        }
      });

      it('should throw StatePersistenceError for truncated file', async () => {
        const filePath = join(testDir, 'truncated.json');
        await safeWriteFile(filePath, '{"version": "2.0.0", "persistedAt": "2024', 'utf-8');

        await expect(loadState(filePath)).rejects.toThrow(StatePersistenceError);
      });
    });

    describe('save/load roundtrip', () => {
      it('should preserve state after transition to Lattice phase', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
          artifacts: ['spec'],
          blockingQueries: [],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);
        const loaded = await loadState(filePath);

        expect(getPhase(loaded.state)).toBe('Lattice');
        expect(isActiveState(loaded.state)).toBe(true);
        expect(loaded.artifacts).toEqual(['spec']);
      });

      it('should preserve full state through multiple phases', async () => {
        const filePath = join(testDir, 'state.json');

        // Save after Ignition
        const snapshot1 = createTestSnapshot({
          state: createActiveState(
            createIgnitionPhaseState(createIgnitionInterviewing('Discovery', 0))
          ),
          artifacts: [],
        });
        await saveState(snapshot1, filePath);

        // Transition to Lattice and save
        const snapshot2 = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
          artifacts: ['spec'],
        });
        await saveState(snapshot2, filePath);

        // Transition to CompositionAudit and save
        const snapshot3 = createTestSnapshot({
          state: createActiveState(
            createCompositionAuditPhaseState(createCompositionAuditAuditing(0))
          ),
          artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts'],
        });
        await saveState(snapshot3, filePath);

        const loaded = await loadState(filePath);

        expect(getPhase(loaded.state)).toBe('CompositionAudit');
        expect(loaded.artifacts).toEqual(['spec', 'latticeCode', 'witnesses', 'contracts']);
      });

      it('should preserve blocking state with all fields', async () => {
        const blockedState = createBlockedState({
          reason: 'user_requested',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          timeoutMs: 300000,
        });
        const blockingRecord: BlockingRecord = {
          id: 'blocking_lattice_123',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          blockedAt: blockedState.blockedAt,
          timeoutMs: 300000,
          resolved: false,
        };
        const snapshot = createTestSnapshot({
          state: blockedState,
          artifacts: ['spec'],
          blockingQueries: [blockingRecord],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);
        const loaded = await loadState(filePath);

        expect(isBlockedState(loaded.state)).toBe(true);
        expect(loaded.blockingQueries).toHaveLength(1);
        expect(loaded.blockingQueries[0]?.query).toBe('Approve architecture?');
      });
    });

    describe('partial write does not corrupt state file (negative case)', () => {
      it('should not corrupt file on save failure', async () => {
        // First, save valid state
        const validSnapshot = createTestSnapshot({
          state: createActiveState(createLatticePhaseState(createLatticeGeneratingStructure())),
          artifacts: ['spec'],
        });
        const filePath = join(testDir, 'state.json');
        await saveState(validSnapshot, filePath);

        // Verify valid state is saved
        const beforeContent = await safeReadFile(filePath, 'utf-8');
        expect(beforeContent).toContain('Lattice');

        // Try to save to a non-existent directory (will fail)
        const invalidSnapshot = createTestSnapshot({
          state: createActiveState(
            createCompositionAuditPhaseState(createCompositionAuditAuditing(0))
          ),
        });
        const invalidPath = join(testDir, 'nonexistent', 'state.json');

        try {
          await saveState(invalidSnapshot, invalidPath);
        } catch {
          // Expected to fail
        }

        // Original file should be unchanged
        const afterContent = await safeReadFile(filePath, 'utf-8');
        expect(afterContent).toBe(beforeContent);
      });
    });
  });

  describe('stateFileExists', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `state-exists-test-${randomUUID()}`);
      await safeMkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should return true for existing file', async () => {
      const snapshot = createTestSnapshot();
      const filePath = join(testDir, 'state.json');
      await saveState(snapshot, filePath);

      const exists = await stateFileExists(filePath);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const filePath = join(testDir, 'nonexistent.json');

      const exists = await stateFileExists(filePath);

      expect(exists).toBe(false);
    });
  });

  describe('createInitialStateSnapshot', () => {
    it('should create initial snapshot at Ignition phase', () => {
      const snapshot = createInitialStateSnapshot();

      expect(getPhase(snapshot.state)).toBe('Ignition');
      expect(isActiveState(snapshot.state)).toBe(true);
      expect(snapshot.artifacts).toEqual([]);
      expect(snapshot.blockingQueries).toEqual([]);
    });
  });

  describe('StatePersistenceError', () => {
    it('should preserve error name', () => {
      const error = new StatePersistenceError('test', 'parse_error');
      expect(error.name).toBe('StatePersistenceError');
    });

    it('should preserve error type', () => {
      const error = new StatePersistenceError('test', 'schema_error');
      expect(error.errorType).toBe('schema_error');
    });

    it('should preserve details', () => {
      const error = new StatePersistenceError('test', 'file_error', { details: 'Extra info' });
      expect(error.details).toBe('Extra info');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new StatePersistenceError('test', 'parse_error', { cause });
      expect(error.cause).toBe(cause);
    });

    it('should have all error types available', () => {
      const errorTypes = [
        'parse_error',
        'schema_error',
        'file_error',
        'validation_error',
        'corruption_error',
      ] as const;

      for (const errorType of errorTypes) {
        const error = new StatePersistenceError('test', errorType);
        expect(error.errorType).toBe(errorType);
      }
    });
  });
});
