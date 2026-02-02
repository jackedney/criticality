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
import { createActiveState, createBlockingSubstate, createFailedSubstate } from './types.js';
import type { BlockingRecord } from './blocking.js';
import type { ArtifactType } from './transitions.js';

describe('Protocol State Persistence', () => {
  const createTestSnapshot = (
    overrides: Partial<ProtocolStateSnapshot> = {}
  ): ProtocolStateSnapshot => ({
    state: createActiveState('Ignition'),
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
      expect(parsed.phase).toBe('Ignition');
      expect(parsed.substate.kind).toBe('Active');
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
        state: createActiveState('CompositionAudit'),
        artifacts,
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.artifacts).toEqual(artifacts);
      expect(parsed.phase).toBe('CompositionAudit');
    });

    it('should serialize blocking substate', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Lattice', substate: blockingSubstate },
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.substate.kind).toBe('Blocking');
      if (parsed.substate.kind === 'Blocking') {
        expect(parsed.substate.query).toBe('Approve architecture?');
        expect(parsed.substate.options).toEqual(['Yes', 'No', 'Revise']);
        expect(parsed.substate.timeoutMs).toBe(300000);
        expect(parsed.substate.blockedAt).toBeDefined();
      }
    });

    it('should serialize failed substate', () => {
      const failedSubstate = createFailedSubstate({
        error: 'Type checking failed',
        code: 'TYPE_ERROR',
        recoverable: true,
        context: 'Additional context',
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Injection', substate: failedSubstate },
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.substate.kind).toBe('Failed');
      if (parsed.substate.kind === 'Failed') {
        expect(parsed.substate.error).toBe('Type checking failed');
        expect(parsed.substate.code).toBe('TYPE_ERROR');
        expect(parsed.substate.recoverable).toBe(true);
        expect(parsed.substate.context).toBe('Additional context');
        expect(parsed.substate.failedAt).toBeDefined();
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

    it('should handle blocking substate without optional fields', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Simple query',
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Lattice', substate: blockingSubstate },
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.substate.kind).toBe('Blocking');
      if (parsed.substate.kind === 'Blocking') {
        expect(parsed.substate.query).toBe('Simple query');
        expect(parsed.substate.options).toBeUndefined();
        expect(parsed.substate.timeoutMs).toBeUndefined();
      }
    });

    it('should handle failed substate without optional fields', () => {
      const failedSubstate = createFailedSubstate({
        error: 'Simple error',
        recoverable: false,
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Injection', substate: failedSubstate },
      });

      const json = serializeState(snapshot);
      const parsed = JSON.parse(json) as PersistedStateData;

      expect(parsed.substate.kind).toBe('Failed');
      if (parsed.substate.kind === 'Failed') {
        expect(parsed.substate.error).toBe('Simple error');
        expect(parsed.substate.code).toBeUndefined();
        expect(parsed.substate.context).toBeUndefined();
      }
    });
  });

  describe('deserializeState', () => {
    it('should deserialize valid JSON to state snapshot', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Lattice',
        substate: { kind: 'Active' },
        artifacts: ['spec'],
        blockingQueries: [],
      });

      const snapshot = deserializeState(json);

      expect(snapshot.state.phase).toBe('Lattice');
      expect(snapshot.state.substate.kind).toBe('Active');
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
      const json = JSON.stringify({ version: '1.0.0' });

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
        expect(persistError.message).toContain('does not match semver pattern');
      }
    });

    it('should throw StatePersistenceError for invalid phase', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'InvalidPhase',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('validation_error');
        expect(persistError.message).toContain('not a valid protocol phase');
      }
    });

    it('should throw StatePersistenceError for invalid substate kind', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Ignition',
        substate: { kind: 'Invalid' },
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('validation_error');
        expect(persistError.message).toContain('substate kind');
      }
    });

    it('should deserialize blocking substate', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Lattice',
        substate: {
          kind: 'Blocking',
          query: 'Approve?',
          options: ['Yes', 'No'],
          blockedAt: '2024-01-20T12:00:00.000Z',
          timeoutMs: 60000,
        },
        artifacts: [],
        blockingQueries: [],
      });

      const snapshot = deserializeState(json);

      expect(snapshot.state.substate.kind).toBe('Blocking');
      if (snapshot.state.substate.kind === 'Blocking') {
        expect(snapshot.state.substate.query).toBe('Approve?');
        expect(snapshot.state.substate.options).toEqual(['Yes', 'No']);
        expect(snapshot.state.substate.timeoutMs).toBe(60000);
      }
    });

    it('should deserialize failed substate', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Injection',
        substate: {
          kind: 'Failed',
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

      expect(snapshot.state.substate.kind).toBe('Failed');
      if (snapshot.state.substate.kind === 'Failed') {
        expect(snapshot.state.substate.error).toBe('Something went wrong');
        expect(snapshot.state.substate.code).toBe('ERR_001');
        expect(snapshot.state.substate.recoverable).toBe(true);
        expect(snapshot.state.substate.context).toBe('Extra info');
      }
    });

    it('should throw StatePersistenceError for Blocking substate missing required fields', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Lattice',
        substate: { kind: 'Blocking' }, // Missing query and blockedAt
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('Blocking substate must have');
      }
    });

    it('should throw StatePersistenceError for Failed substate missing required fields', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Injection',
        substate: { kind: 'Failed' }, // Missing required fields
        artifacts: [],
        blockingQueries: [],
      });

      expect(() => deserializeState(json)).toThrow(StatePersistenceError);

      try {
        deserializeState(json);
      } catch (error) {
        const persistError = error as StatePersistenceError;
        expect(persistError.errorType).toBe('schema_error');
        expect(persistError.message).toContain('Failed substate must have');
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
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Lattice',
        substate: { kind: 'Active' },
        artifacts: [],
        blockingQueries: [blockingRecord],
      });

      const snapshot = deserializeState(json);

      expect(snapshot.blockingQueries).toHaveLength(1);
      expect(snapshot.blockingQueries[0]?.id).toBe('blocking_123');
    });

    it('should throw StatePersistenceError for invalid blocking query', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        persistedAt: '2024-01-20T12:00:00.000Z',
        phase: 'Lattice',
        substate: { kind: 'Active' },
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
  });

  describe('serialize/deserialize roundtrip', () => {
    it('should preserve active state through roundtrip', () => {
      const snapshot = createTestSnapshot({
        state: createActiveState('Mesoscopic'),
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

      expect(restored.state.phase).toBe('Mesoscopic');
      expect(restored.state.substate.kind).toBe('Active');
      expect(restored.artifacts).toEqual(snapshot.artifacts);
    });

    it('should preserve blocking state through roundtrip', () => {
      const blockingSubstate = createBlockingSubstate({
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        timeoutMs: 300000,
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Lattice', substate: blockingSubstate },
        artifacts: ['spec'],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(restored.state.phase).toBe('Lattice');
      expect(restored.state.substate.kind).toBe('Blocking');
      if (restored.state.substate.kind === 'Blocking') {
        expect(restored.state.substate.query).toBe('Approve architecture?');
        expect(restored.state.substate.options).toEqual(['Yes', 'No', 'Revise']);
        expect(restored.state.substate.timeoutMs).toBe(300000);
      }
    });

    it('should preserve failed state through roundtrip', () => {
      const failedSubstate = createFailedSubstate({
        error: 'Type checking failed',
        code: 'TYPE_ERROR',
        recoverable: true,
        context: 'Line 42: type mismatch',
      });
      const snapshot = createTestSnapshot({
        state: { phase: 'Injection', substate: failedSubstate },
        artifacts: ['spec', 'latticeCode'],
      });

      const json = serializeState(snapshot);
      const restored = deserializeState(json);

      expect(restored.state.phase).toBe('Injection');
      expect(restored.state.substate.kind).toBe('Failed');
      if (restored.state.substate.kind === 'Failed') {
        expect(restored.state.substate.error).toBe('Type checking failed');
        expect(restored.state.substate.code).toBe('TYPE_ERROR');
        expect(restored.state.substate.recoverable).toBe(true);
        expect(restored.state.substate.context).toBe('Line 42: type mismatch');
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
          state: createActiveState('Lattice'),
          artifacts: ['spec'],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        const parsed = JSON.parse(content) as PersistedStateData;
        expect(parsed.phase).toBe('Lattice');
        expect(parsed.artifacts).toEqual(['spec']);
      });

      it('should save pretty-printed JSON by default', async () => {
        const snapshot = createTestSnapshot();

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).toContain('\n');
      });

      it('should save compact JSON when pretty is false', async () => {
        const snapshot = createTestSnapshot();

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath, { pretty: false });

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).not.toContain('\n');
      });

      it('should perform atomic write (temp file then rename)', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState('Lattice'),
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        // File should exist with correct content
        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).toContain('Lattice');

        // No temp files should remain
        const files = await safeReaddir(testDir);
        expect(files.filter((f: string) => f.includes('.tmp'))).toHaveLength(0);
      });

      it('should overwrite existing file', async () => {
        const snapshot1 = createTestSnapshot({
          state: createActiveState('Ignition'),
        });
        const snapshot2 = createTestSnapshot({
          state: createActiveState('Lattice'),
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot1, filePath);
        await saveState(snapshot2, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
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
          state: createActiveState('Lattice'),
          artifacts: ['spec'],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);

        const loaded = await loadState(filePath);

        expect(loaded.state.phase).toBe('Lattice');
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
        // Simulate a partially written file
        await safeWriteFile(filePath, '{"version": "1.0.0", "persistedAt": "2024', 'utf-8');

        await expect(loadState(filePath)).rejects.toThrow(StatePersistenceError);
      });
    });

    describe('save/load roundtrip', () => {
      it('should preserve state after transition to Lattice phase', async () => {
        const snapshot = createTestSnapshot({
          state: createActiveState('Lattice'),
          artifacts: ['spec'],
          blockingQueries: [],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);
        const loaded = await loadState(filePath);

        expect(loaded.state.phase).toBe('Lattice');
        expect(loaded.state.substate.kind).toBe('Active');
        expect(loaded.artifacts).toEqual(['spec']);
      });

      it('should preserve full state through multiple phases', async () => {
        const filePath = join(testDir, 'state.json');

        // Save after Ignition
        const snapshot1 = createTestSnapshot({
          state: createActiveState('Ignition'),
          artifacts: [],
        });
        await saveState(snapshot1, filePath);

        // Transition to Lattice and save
        const snapshot2 = createTestSnapshot({
          state: createActiveState('Lattice'),
          artifacts: ['spec'],
        });
        await saveState(snapshot2, filePath);

        // Transition to CompositionAudit and save
        const snapshot3 = createTestSnapshot({
          state: createActiveState('CompositionAudit'),
          artifacts: ['spec', 'latticeCode', 'witnesses', 'contracts'],
        });
        await saveState(snapshot3, filePath);

        const loaded = await loadState(filePath);

        expect(loaded.state.phase).toBe('CompositionAudit');
        expect(loaded.artifacts).toEqual(['spec', 'latticeCode', 'witnesses', 'contracts']);
      });

      it('should preserve blocking state with all fields', async () => {
        const blockingSubstate = createBlockingSubstate({
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          timeoutMs: 300000,
        });
        const blockingRecord: BlockingRecord = {
          id: 'blocking_lattice_123',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          blockedAt: blockingSubstate.blockedAt,
          timeoutMs: 300000,
          resolved: false,
        };
        const snapshot = createTestSnapshot({
          state: { phase: 'Lattice', substate: blockingSubstate },
          artifacts: ['spec'],
          blockingQueries: [blockingRecord],
        });

        const filePath = join(testDir, 'state.json');
        await saveState(snapshot, filePath);
        const loaded = await loadState(filePath);

        expect(loaded.state.substate.kind).toBe('Blocking');
        expect(loaded.blockingQueries).toHaveLength(1);
        expect(loaded.blockingQueries[0]?.query).toBe('Approve architecture?');
      });
    });

    describe('partial write does not corrupt state file (negative case)', () => {
      it('should not corrupt file on save failure', async () => {
        // First, save valid state
        const validSnapshot = createTestSnapshot({
          state: createActiveState('Lattice'),
          artifacts: ['spec'],
        });
        const filePath = join(testDir, 'state.json');
        await saveState(validSnapshot, filePath);

        // Verify valid state is saved
        const beforeContent = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(beforeContent).toContain('Lattice');

        // Try to save to a non-existent directory (will fail)
        const invalidSnapshot = createTestSnapshot({
          state: createActiveState('CompositionAudit'),
        });
        const invalidPath = join(testDir, 'nonexistent', 'state.json');

        try {
          await saveState(invalidSnapshot, invalidPath);
        } catch {
          // Expected to fail
        }

        // Original file should be unchanged
        const afterContent = (await safeReadFile(filePath, 'utf-8')) as string;
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

      expect(snapshot.state.phase).toBe('Ignition');
      expect(snapshot.state.substate.kind).toBe('Active');
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
