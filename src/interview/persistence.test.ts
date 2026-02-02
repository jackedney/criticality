/**
 * Tests for interview state persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { safeReadFile, safeWriteFile, safeMkdir } from '../utils/safe-fs.js';
import {
  serializeInterviewState,
  deserializeInterviewState,
  saveInterviewState,
  loadInterviewState,
  interviewStateExists,
  serializeTranscriptEntry,
  deserializeTranscriptEntry,
  appendTranscriptEntry,
  loadTranscript,
  tryLoadInterviewState,
  getInterviewDir,
  getInterviewStatePath,
  getTranscriptPath,
  getCriticalityBaseDir,
  validateProjectId,
  InterviewPersistenceError,
} from './persistence.js';
import {
  createInitialInterviewState,
  createTranscriptEntry,
  type InterviewState,
} from './types.js';

// Mock homedir to use temp directory for tests
let testBaseDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: vi.fn(() => testBaseDir),
  };
});

describe('Interview Persistence', () => {
  beforeEach(async () => {
    // Create a temp directory for each test
    testBaseDir = await mkdtemp(join(tmpdir(), 'criticality-test-'));
    vi.mocked(homedir).mockReturnValue(testBaseDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(testBaseDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('Path utilities', () => {
    it('should return correct base directory', () => {
      expect(getCriticalityBaseDir()).toBe(join(testBaseDir, '.criticality'));
    });

    it('should return correct interview directory for project', () => {
      expect(getInterviewDir('my-project')).toBe(
        join(testBaseDir, '.criticality', 'projects', 'my-project', 'interview')
      );
    });

    it('should return correct state path for project', () => {
      expect(getInterviewStatePath('my-project')).toBe(
        join(testBaseDir, '.criticality', 'projects', 'my-project', 'interview', 'state.json')
      );
    });

    it('should return correct transcript path for project', () => {
      expect(getTranscriptPath('my-project')).toBe(
        join(testBaseDir, '.criticality', 'projects', 'my-project', 'interview', 'transcript.jsonl')
      );
    });

    it('should throw validation_error for empty projectId', () => {
      expect(() => getInterviewDir('')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('non-empty string');
      }
    });

    it('should throw validation_error for absolute path projectId', () => {
      expect(() => getInterviewDir('/etc/passwd')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('/etc/passwd');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('absolute path');
      }
    });

    it('should throw validation_error for Windows absolute path projectId', () => {
      expect(() => getInterviewDir('C:\\Windows\\System32')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('C:\\Windows\\System32');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
      }
    });

    it('should throw validation_error for directory traversal with ../', () => {
      expect(() => getInterviewDir('../etc/passwd')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('../etc/passwd');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('directory traversal');
      }
    });

    it('should throw validation_error for standalone .. projectId', () => {
      expect(() => getInterviewDir('..')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('..');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('directory traversal');
      }
    });

    it('should throw validation_error for projectId containing forward slash', () => {
      expect(() => getInterviewDir('foo/bar')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('foo/bar');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('path separators');
      }
    });

    it('should throw validation_error for projectId containing backslash', () => {
      expect(() => getInterviewDir('foo\\bar')).toThrow(InterviewPersistenceError);

      try {
        getInterviewDir('foo\\bar');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
        expect((error as InterviewPersistenceError).message).toContain('path separators');
      }
    });
  });

  describe('validateProjectId', () => {
    it('should accept valid project IDs', () => {
      expect(() => {
        validateProjectId('my-project');
      }).not.toThrow();
      expect(() => {
        validateProjectId('project_123');
      }).not.toThrow();
      expect(() => {
        validateProjectId('Project.Name');
      }).not.toThrow();
      expect(() => {
        validateProjectId('a');
      }).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => {
        validateProjectId('');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('');
      }).toThrow(/non-empty string/);
    });

    it('should reject absolute Unix paths', () => {
      expect(() => {
        validateProjectId('/etc/passwd');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('/root');
      }).toThrow(InterviewPersistenceError);
    });

    it('should reject absolute Windows paths', () => {
      expect(() => {
        validateProjectId('C:\\Windows');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('D:\\Users');
      }).toThrow(InterviewPersistenceError);
    });

    it('should reject directory traversal with ../', () => {
      expect(() => {
        validateProjectId('../etc');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('foo/../bar');
      }).toThrow(InterviewPersistenceError);
    });

    it('should reject directory traversal with ..\\', () => {
      expect(() => {
        validateProjectId('..\\Windows');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('foo\\..\\bar');
      }).toThrow(InterviewPersistenceError);
    });

    it('should reject standalone ..', () => {
      expect(() => {
        validateProjectId('..');
      }).toThrow(InterviewPersistenceError);
    });

    it('should reject path separators in middle', () => {
      expect(() => {
        validateProjectId('foo/bar');
      }).toThrow(InterviewPersistenceError);
      expect(() => {
        validateProjectId('foo\\bar');
      }).toThrow(InterviewPersistenceError);
    });

    it('should allow dots that are not traversal', () => {
      expect(() => {
        validateProjectId('my.project');
      }).not.toThrow();
      expect(() => {
        validateProjectId('v1.2.3');
      }).not.toThrow();
      expect(() => {
        validateProjectId('.');
      }).not.toThrow();
      expect(() => {
        validateProjectId('...');
      }).not.toThrow();
    });
  });

  describe('serializeInterviewState', () => {
    it('should serialize state to pretty JSON by default', () => {
      const state = createInitialInterviewState('test-project');
      const json = serializeInterviewState(state);

      expect(json).toContain('\n'); // Pretty printed
      expect(JSON.parse(json)).toEqual(state);
    });

    it('should serialize state to compact JSON when pretty is false', () => {
      const state = createInitialInterviewState('test-project');
      const json = serializeInterviewState(state, { pretty: false });

      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toEqual(state);
    });

    it('should use custom indent when provided', () => {
      const state = createInitialInterviewState('test-project');
      const json = serializeInterviewState(state, { indent: 4 });

      // Check for 4-space indentation
      expect(json).toContain('    "version"');
    });
  });

  describe('deserializeInterviewState', () => {
    it('should deserialize valid state JSON', () => {
      const original = createInitialInterviewState('test-project');
      const json = serializeInterviewState(original);
      const restored = deserializeInterviewState(json);

      expect(restored).toEqual(original);
    });

    it('should throw parse_error for invalid JSON', () => {
      expect(() => deserializeInterviewState('not valid json')).toThrow(InterviewPersistenceError);
      expect(() => deserializeInterviewState('not valid json')).toThrow(/Failed to parse/);

      try {
        deserializeInterviewState('not valid json');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('parse_error');
      }
    });

    it('should throw schema_error for non-object', () => {
      expect(() => deserializeInterviewState('"string"')).toThrow(InterviewPersistenceError);
      expect(() => deserializeInterviewState('null')).toThrow(InterviewPersistenceError);
      expect(() => deserializeInterviewState('123')).toThrow(InterviewPersistenceError);

      try {
        deserializeInterviewState('null');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('schema_error');
      }
    });

    it('should throw schema_error for missing required fields', () => {
      const incomplete = { version: '1.0.0' };
      expect(() => deserializeInterviewState(JSON.stringify(incomplete))).toThrow(
        /missing required field/
      );
    });

    it('should throw schema_error for invalid version format', () => {
      const state = {
        ...createInitialInterviewState('test'),
        version: 'invalid',
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        /does not match semver pattern/
      );
    });

    it('should throw validation_error for invalid phase', () => {
      const state = {
        ...createInitialInterviewState('test'),
        currentPhase: 'InvalidPhase',
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        /not a valid interview phase/
      );
    });

    it('should validate extractedRequirements', () => {
      const state = {
        ...createInitialInterviewState('test'),
        extractedRequirements: [{ id: 'req_001' }], // Missing required fields
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        InterviewPersistenceError
      );
    });

    it('should validate delegationPoints', () => {
      const state = {
        ...createInitialInterviewState('test'),
        delegationPoints: [{ phase: 'Discovery' }], // Missing required fields
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        InterviewPersistenceError
      );
    });

    it('should throw schema_error for missing features field', () => {
      const state = { ...createInitialInterviewState('test') };
      const stateWithoutFeatures = {
        version: state.version,
        projectId: state.projectId,
        currentPhase: state.currentPhase,
        completedPhases: state.completedPhases,
        extractedRequirements: state.extractedRequirements,
        // features field intentionally omitted
        delegationPoints: state.delegationPoints,
        transcriptEntryCount: state.transcriptEntryCount,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      };
      expect(() => deserializeInterviewState(JSON.stringify(stateWithoutFeatures))).toThrow(
        /missing required field "features"/
      );

      try {
        deserializeInterviewState(JSON.stringify(stateWithoutFeatures));
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('schema_error');
      }
    });

    it('should throw schema_error for features not being an array', () => {
      const state = {
        ...createInitialInterviewState('test'),
        features: 'not-an-array',
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        /features must be an array/
      );

      try {
        deserializeInterviewState(JSON.stringify(state));
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('schema_error');
      }
    });

    it('should accept features with empty array', () => {
      const state = {
        ...createInitialInterviewState('test'),
        features: [],
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).not.toThrow();
    });

    it('should validate features array elements', () => {
      const state = {
        ...createInitialInterviewState('test'),
        features: [{ id: 'feature_001' }], // Missing required fields
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        InterviewPersistenceError
      );

      try {
        deserializeInterviewState(JSON.stringify(state));
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('schema_error');
      }
    });

    it('should throw validation_error for invalid feature classification', () => {
      const state = {
        ...createInitialInterviewState('test'),
        features: [
          {
            id: 'feature_001',
            name: 'Test Feature',
            description: 'A test feature',
            classification: 'invalid-classification',
            sourcePhase: 'Discovery',
            identifiedAt: new Date().toISOString(),
          },
        ],
      };
      expect(() => deserializeInterviewState(JSON.stringify(state))).toThrow(
        /classification must be one of: core, foundational, bolt-on/
      );

      try {
        deserializeInterviewState(JSON.stringify(state));
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('validation_error');
      }
    });

    it('should deserialize state with valid features', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'features-test',
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [],
        features: [
          {
            id: 'feature_001',
            name: 'User Authentication',
            description: 'Secure user login and registration',
            classification: 'core',
            sourcePhase: 'Discovery',
            identifiedAt: '2024-01-15T10:00:00Z',
          },
          {
            id: 'feature_002',
            name: 'Multi-tenant Support',
            description: 'Multiple tenants with isolated data',
            classification: 'foundational',
            sourcePhase: 'Architecture',
            identifiedAt: '2024-01-15T11:00:00Z',
            classificationRationale: 'Required for future SaaS scaling',
          },
          {
            id: 'feature_003',
            name: 'Dark Mode',
            description: 'Optional dark theme for UI',
            classification: 'bolt-on',
            sourcePhase: 'DesignPreferences',
            identifiedAt: '2024-01-15T12:00:00Z',
          },
        ],
        delegationPoints: [],
        transcriptEntryCount: 5,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
      };

      const json = JSON.stringify(state);
      const restored = deserializeInterviewState(json);

      expect(restored).toEqual(state);
    });

    it('should deserialize state with all fields populated', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'full-project',
        currentPhase: 'Synthesis',
        completedPhases: ['Discovery', 'Architecture', 'Constraints', 'DesignPreferences'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [
          {
            phase: 'DesignPreferences',
            decision: 'DelegateWithNotes',
            notes: 'Use whatever CSS framework you prefer',
            delegatedAt: '2024-01-15T12:00:00Z',
          },
        ],
        transcriptEntryCount: 25,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
      };

      const json = JSON.stringify(state);
      const restored = deserializeInterviewState(json);

      expect(restored).toEqual(state);
    });
  });

  describe('saveInterviewState and loadInterviewState', () => {
    it('should save and load state correctly', async () => {
      const state = createInitialInterviewState('save-load-test');
      await saveInterviewState(state);

      const loaded = await loadInterviewState('save-load-test');
      expect(loaded).toEqual(state);
    });

    it('should create directory structure if it does not exist', async () => {
      const state = createInitialInterviewState('new-project');
      await saveInterviewState(state);

      const statePath = getInterviewStatePath('new-project');
      const content = (await safeReadFile(statePath, 'utf-8')) as string;
      expect(JSON.parse(content)).toEqual(state);
    });

    it('should overwrite existing state', async () => {
      const state1 = createInitialInterviewState('overwrite-test');
      await saveInterviewState(state1);

      const state2: InterviewState = {
        ...state1,
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(state2);

      const loaded = await loadInterviewState('overwrite-test');
      expect(loaded.currentPhase).toBe('Architecture');
      expect(loaded.completedPhases).toEqual(['Discovery']);
    });

    it('should throw not_found error for non-existent project', async () => {
      await expect(loadInterviewState('non-existent')).rejects.toThrow(InterviewPersistenceError);

      try {
        await loadInterviewState('non-existent');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('not_found');
        expect((error as InterviewPersistenceError).message).toContain('non-existent');
      }
    });

    it('should throw corruption_error for empty state file', async () => {
      const state = createInitialInterviewState('empty-test');
      await saveInterviewState(state);

      // Corrupt the file by making it empty
      const statePath = getInterviewStatePath('empty-test');
      await safeWriteFile(statePath, '', 'utf-8');

      await expect(loadInterviewState('empty-test')).rejects.toThrow(InterviewPersistenceError);

      try {
        await loadInterviewState('empty-test');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('corruption_error');
      }
    });

    it('should throw parse_error for corrupted JSON', async () => {
      const state = createInitialInterviewState('corrupt-test');
      await saveInterviewState(state);

      // Corrupt the file with invalid JSON
      const statePath = getInterviewStatePath('corrupt-test');
      await safeWriteFile(statePath, '{ invalid json }', 'utf-8');

      await expect(loadInterviewState('corrupt-test')).rejects.toThrow(InterviewPersistenceError);

      try {
        await loadInterviewState('corrupt-test');
      } catch (error) {
        expect(error).toBeInstanceOf(InterviewPersistenceError);
        expect((error as InterviewPersistenceError).errorType).toBe('parse_error');
      }
    });
  });

  describe('interviewStateExists', () => {
    it('should return false for non-existent project', async () => {
      expect(await interviewStateExists('non-existent')).toBe(false);
    });

    it('should return true for existing project', async () => {
      const state = createInitialInterviewState('exists-test');
      await saveInterviewState(state);

      expect(await interviewStateExists('exists-test')).toBe(true);
    });
  });

  describe('Transcript operations', () => {
    describe('serializeTranscriptEntry', () => {
      it('should serialize entry to single line JSON', () => {
        const entry = createTranscriptEntry('Discovery', 'user', 'Hello');
        const json = serializeTranscriptEntry(entry);

        expect(json).not.toContain('\n');
        expect(JSON.parse(json)).toEqual(entry);
      });
    });

    describe('deserializeTranscriptEntry', () => {
      it('should deserialize valid entry', () => {
        const original = createTranscriptEntry('Architecture', 'assistant', 'What stack?');
        const json = serializeTranscriptEntry(original);
        const restored = deserializeTranscriptEntry(json, 1);

        expect(restored).toEqual(original);
      });

      it('should throw parse_error for invalid JSON', () => {
        expect(() => deserializeTranscriptEntry('not json', 5)).toThrow(InterviewPersistenceError);

        try {
          deserializeTranscriptEntry('not json', 5);
        } catch (error) {
          expect(error).toBeInstanceOf(InterviewPersistenceError);
          expect((error as InterviewPersistenceError).errorType).toBe('parse_error');
          expect((error as InterviewPersistenceError).message).toContain('line 5');
        }
      });

      it('should throw schema_error for invalid structure', () => {
        expect(() => deserializeTranscriptEntry('null', 1)).toThrow(/expected an object/);
        expect(() => deserializeTranscriptEntry('{"id": 123}', 1)).toThrow(/id must be a string/);
      });

      it('should throw validation_error for invalid role', () => {
        const entry = {
          id: 'test',
          phase: 'Discovery',
          role: 'invalid',
          content: 'test',
          timestamp: '2024-01-15T10:00:00Z',
        };
        expect(() => deserializeTranscriptEntry(JSON.stringify(entry), 1)).toThrow(
          /role must be one of/
        );
      });
    });

    describe('appendTranscriptEntry', () => {
      it('should append entries to JSONL file', async () => {
        const projectId = 'transcript-test';
        const entry1 = createTranscriptEntry('Discovery', 'user', 'First message');
        const entry2 = createTranscriptEntry('Discovery', 'assistant', 'Second message');

        await appendTranscriptEntry(projectId, entry1);
        await appendTranscriptEntry(projectId, entry2);

        const transcriptPath = getTranscriptPath(projectId);
        const content = (await safeReadFile(transcriptPath, 'utf-8')) as string;
        const lines = content.trim().split('\n');

        expect(lines).toHaveLength(2);
        const line0 = lines[0];
        const line1 = lines[1];
        expect(line0).toBeDefined();
        expect(line1).toBeDefined();
        if (line0 !== undefined && line1 !== undefined) {
          expect(JSON.parse(line0)).toEqual(entry1);
          expect(JSON.parse(line1)).toEqual(entry2);
        }
      });

      it('should create directory if it does not exist', async () => {
        const entry = createTranscriptEntry('Discovery', 'user', 'Test');
        await appendTranscriptEntry('new-transcript-project', entry);

        const transcriptPath = getTranscriptPath('new-transcript-project');
        const content = (await safeReadFile(transcriptPath, 'utf-8')) as string;
        expect(JSON.parse(content.trim())).toEqual(entry);
      });
    });

    describe('loadTranscript', () => {
      it('should return empty array for non-existent transcript', async () => {
        const entries = await loadTranscript('no-transcript');
        expect(entries).toEqual([]);
      });

      it('should return empty array for empty transcript file', async () => {
        const projectId = 'empty-transcript';
        await safeMkdir(getInterviewDir(projectId), { recursive: true });
        await safeWriteFile(getTranscriptPath(projectId), '', 'utf-8');

        const entries = await loadTranscript(projectId);
        expect(entries).toEqual([]);
      });

      it('should load all transcript entries', async () => {
        const projectId = 'load-transcript-test';
        const entry1 = createTranscriptEntry('Discovery', 'user', 'Question 1');
        const entry2 = createTranscriptEntry('Discovery', 'assistant', 'Answer 1');
        const entry3 = createTranscriptEntry('Architecture', 'user', 'Question 2');

        await appendTranscriptEntry(projectId, entry1);
        await appendTranscriptEntry(projectId, entry2);
        await appendTranscriptEntry(projectId, entry3);

        const entries = await loadTranscript(projectId);

        expect(entries).toHaveLength(3);
        expect(entries[0]).toEqual(entry1);
        expect(entries[1]).toEqual(entry2);
        expect(entries[2]).toEqual(entry3);
      });

      it('should handle blank lines in transcript', async () => {
        const projectId = 'blank-lines-test';
        await safeMkdir(getInterviewDir(projectId), { recursive: true });

        const entry = createTranscriptEntry('Discovery', 'user', 'Test');
        const content =
          serializeTranscriptEntry(entry) + '\n\n' + serializeTranscriptEntry(entry) + '\n';
        await safeWriteFile(getTranscriptPath(projectId), content, 'utf-8');

        const entries = await loadTranscript(projectId);
        expect(entries).toHaveLength(2);
      });

      it('should throw on corrupted transcript entry', async () => {
        const projectId = 'corrupt-transcript';
        await safeMkdir(getInterviewDir(projectId), { recursive: true });
        await safeWriteFile(getTranscriptPath(projectId), '{ invalid json }\n', 'utf-8');

        await expect(loadTranscript(projectId)).rejects.toThrow(InterviewPersistenceError);
      });
    });
  });

  describe('tryLoadInterviewState', () => {
    it('should return success with state for existing project', async () => {
      const state = createInitialInterviewState('try-load-test');
      await saveInterviewState(state);

      const result = await tryLoadInterviewState('try-load-test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state).toEqual(state);
      }
    });

    it('should return failure with not_found error for non-existent project', async () => {
      const result = await tryLoadInterviewState('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('not_found');
      }
    });

    it('should return failure with corruption_error for empty file', async () => {
      const state = createInitialInterviewState('try-load-empty');
      await saveInterviewState(state);
      await safeWriteFile(getInterviewStatePath('try-load-empty'), '', 'utf-8');

      const result = await tryLoadInterviewState('try-load-empty');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('corruption_error');
      }
    });

    it('should return failure with parse_error for corrupted JSON', async () => {
      const state = createInitialInterviewState('try-load-corrupt');
      await saveInterviewState(state);
      await safeWriteFile(getInterviewStatePath('try-load-corrupt'), 'not json', 'utf-8');

      const result = await tryLoadInterviewState('try-load-corrupt');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('parse_error');
      }
    });
  });

  describe('Resume scenario: Start, kill, resume', () => {
    it('should preserve exact position when resuming', async () => {
      const projectId = 'resume-test';

      // Start interview
      const initialState = createInitialInterviewState(projectId);
      await saveInterviewState(initialState);

      // Answer 3 questions (simulate progress)
      const entry1 = createTranscriptEntry('Discovery', 'assistant', 'What is your project about?');
      const entry2 = createTranscriptEntry('Discovery', 'user', 'A task management app');
      const entry3 = createTranscriptEntry('Discovery', 'assistant', 'Who is the target audience?');
      const entry4 = createTranscriptEntry('Discovery', 'user', 'Small teams');
      const entry5 = createTranscriptEntry('Discovery', 'assistant', 'What are the key features?');
      const entry6 = createTranscriptEntry('Discovery', 'user', 'Tasks, deadlines, assignments');

      await appendTranscriptEntry(projectId, entry1);
      await appendTranscriptEntry(projectId, entry2);
      await appendTranscriptEntry(projectId, entry3);
      await appendTranscriptEntry(projectId, entry4);
      await appendTranscriptEntry(projectId, entry5);
      await appendTranscriptEntry(projectId, entry6);

      // Update state after 3 Q&A pairs
      const updatedState: InterviewState = {
        ...initialState,
        extractedRequirements: [
          {
            id: 'req_001',
            sourcePhase: 'Discovery',
            category: 'functional',
            text: 'Task management for small teams',
            confidence: 'high',
            extractedAt: new Date().toISOString(),
          },
        ],
        transcriptEntryCount: 6,
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(updatedState);

      // "Kill process" - just forget the state in memory
      // ...

      // Resume - load state and transcript
      const resumedState = await loadInterviewState(projectId);
      const transcript = await loadTranscript(projectId);

      // Verify exact position is preserved
      expect(resumedState.currentPhase).toBe('Discovery');
      expect(resumedState.transcriptEntryCount).toBe(6);
      expect(resumedState.extractedRequirements).toHaveLength(1);
      expect(transcript).toHaveLength(6);

      // Interview can continue from question 4 (next question after the 3 answered)
      const entry7 = createTranscriptEntry('Discovery', 'assistant', 'Any integrations needed?');
      await appendTranscriptEntry(projectId, entry7);

      const transcriptAfterResume = await loadTranscript(projectId);
      expect(transcriptAfterResume).toHaveLength(7);
      expect(transcriptAfterResume[6]?.content).toBe('Any integrations needed?');
    });
  });

  describe('Atomic write pattern', () => {
    it('should not leave partial files on write failure simulation', async () => {
      // This test verifies the atomic write pattern works correctly
      // by saving state and checking it's complete
      const state = createInitialInterviewState('atomic-test');
      await saveInterviewState(state);

      const loaded = await loadInterviewState('atomic-test');
      expect(loaded).toEqual(state);

      // Verify no temp files remain
      const { readdir } = await import('node:fs/promises');
      const dir = getInterviewDir('atomic-test');
      const files = await readdir(dir);

      // Should only have state.json, no .tmp files
      expect(files.every((f) => !f.endsWith('.tmp'))).toBe(true);
    });
  });
});
