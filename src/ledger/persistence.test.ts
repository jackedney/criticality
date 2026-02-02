import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { safeReadFile, safeWriteFile, safeMkdir, safeReaddir } from '../utils/safe-fs.js';
import {
  Ledger,
  serialize,
  deserialize,
  saveLedger,
  loadLedger,
  LedgerSerializationError,
} from './index.js';
import type { DecisionInput, LedgerData } from './index.js';

describe('Ledger Persistence', () => {
  const createTestInput = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
    category: 'architectural',
    constraint: 'Test constraint',
    source: 'design_choice',
    confidence: 'canonical',
    phase: 'design',
    ...overrides,
  });

  const fixedDate = new Date('2024-01-20T12:00:00.000Z');
  const createTestLedger = (): Ledger =>
    new Ledger({
      project: 'test-project',
      now: (): Date => fixedDate,
    });

  describe('serialize', () => {
    it('should serialize ledger to JSON string', () => {
      const ledger = createTestLedger();
      ledger.append(createTestInput({ constraint: 'First decision' }));

      const json = serialize(ledger);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json) as LedgerData;
      expect(parsed.meta.project).toBe('test-project');
      expect(parsed.decisions).toHaveLength(1);
    });

    it('should output pretty-printed JSON by default', () => {
      const ledger = createTestLedger();

      const json = serialize(ledger);

      expect(json).toContain('\n');
      expect(json).toMatch(/^ {2}"meta":/m); // Check for 2-space indentation
    });

    it('should output compact JSON when pretty is false', () => {
      const ledger = createTestLedger();

      const json = serialize(ledger, { pretty: false });

      expect(json).not.toContain('\n');
    });

    it('should respect custom indentation', () => {
      const ledger = createTestLedger();

      const json = serialize(ledger, { indent: 4 });

      expect(json).toMatch(/^ {4}"meta":/m); // Check for 4-space indentation
    });

    it('should produce JSON matching ledger.schema.json structure', () => {
      const ledger = createTestLedger();
      ledger.append(
        createTestInput({
          constraint: 'Decision with all fields',
          rationale: 'Because it is good',
        })
      );

      const json = serialize(ledger);
      const parsed = JSON.parse(json) as LedgerData;

      // Verify schema structure
      expect(parsed).toHaveProperty('meta');
      expect(parsed).toHaveProperty('decisions');
      expect(parsed.meta).toHaveProperty('version');
      expect(parsed.meta).toHaveProperty('created');
      expect(parsed.meta).toHaveProperty('project');
      expect(parsed.decisions[0]).toHaveProperty('id');
      expect(parsed.decisions[0]).toHaveProperty('timestamp');
      expect(parsed.decisions[0]).toHaveProperty('category');
      expect(parsed.decisions[0]).toHaveProperty('constraint');
      expect(parsed.decisions[0]).toHaveProperty('source');
      expect(parsed.decisions[0]).toHaveProperty('confidence');
      expect(parsed.decisions[0]).toHaveProperty('status');
      expect(parsed.decisions[0]).toHaveProperty('phase');
    });

    it('should preserve all decision data through serialization', () => {
      const ledger = createTestLedger();
      const d1 = ledger.append(createTestInput({ constraint: 'Base' }));
      const d2 = ledger.append(
        createTestInput({
          constraint: 'With all optional fields',
          rationale: 'Detailed rationale',
          dependencies: [d1.id],
          failure_context: 'Test failure',
        })
      );

      const json = serialize(ledger);
      const parsed = JSON.parse(json) as LedgerData;
      const decision = parsed.decisions.find((d) => d.id === d2.id);

      expect(decision?.constraint).toBe('With all optional fields');
      expect(decision?.rationale).toBe('Detailed rationale');
      expect(decision?.dependencies).toEqual([d1.id]);
      expect(decision?.failure_context).toBe('Test failure');
    });
  });

  describe('deserialize', () => {
    it('should deserialize valid JSON to Ledger', () => {
      const json = JSON.stringify({
        meta: {
          version: '1.0.0',
          created: '2024-01-20T12:00:00.000Z',
          project: 'test-project',
        },
        decisions: [
          {
            id: 'architectural_001',
            timestamp: '2024-01-20T12:00:00.000Z',
            category: 'architectural',
            constraint: 'Test constraint',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      });

      const ledger = deserialize(json);

      expect(ledger.size).toBe(1);
      expect(ledger.hasId('architectural_001')).toBe(true);
    });

    it('should throw LedgerSerializationError for invalid JSON syntax', () => {
      const invalidJson = '{ invalid json }';

      expect(() => deserialize(invalidJson)).toThrow(LedgerSerializationError);

      try {
        deserialize(invalidJson);
      } catch (error) {
        expect(error).toBeInstanceOf(LedgerSerializationError);
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('parse_error');
        expect(serError.message).toContain('Failed to parse ledger JSON');
      }
    });

    it('should throw LedgerSerializationError for null input', () => {
      expect(() => deserialize('null')).toThrow(LedgerSerializationError);

      try {
        deserialize('null');
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('schema_error');
        expect(serError.message).toContain('expected an object');
      }
    });

    it('should throw LedgerSerializationError for non-object input', () => {
      expect(() => deserialize('"string"')).toThrow(LedgerSerializationError);
      expect(() => deserialize('123')).toThrow(LedgerSerializationError);
      expect(() => deserialize('[]')).toThrow(LedgerSerializationError);
    });

    it('should throw LedgerSerializationError for missing meta field', () => {
      const json = JSON.stringify({ decisions: [] });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('schema_error');
        expect(serError.message).toContain('missing required field "meta"');
      }
    });

    it('should throw LedgerSerializationError for missing decisions field', () => {
      const json = JSON.stringify({
        meta: { version: '1.0.0', created: '2024-01-20T12:00:00.000Z', project: 'test' },
      });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('schema_error');
        expect(serError.message).toContain('missing required field "decisions"');
      }
    });

    it('should throw LedgerSerializationError for missing required meta fields', () => {
      const json = JSON.stringify({
        meta: { version: '1.0.0' },
        decisions: [],
      });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('schema_error');
        expect(serError.message).toContain('missing required meta field');
      }
    });

    it('should throw LedgerSerializationError for invalid version format', () => {
      const json = JSON.stringify({
        meta: { version: 'invalid', created: '2024-01-20T12:00:00.000Z', project: 'test' },
        decisions: [],
      });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('schema_error');
        expect(serError.message).toContain('does not match semver pattern');
      }
    });

    it('should throw LedgerSerializationError for invalid decision data', () => {
      const json = JSON.stringify({
        meta: { version: '1.0.0', created: '2024-01-20T12:00:00.000Z', project: 'test' },
        decisions: [
          {
            id: 'invalid-id-format',
            timestamp: '2024-01-20T12:00:00.000Z',
            category: 'architectural',
            constraint: 'Test',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('validation_error');
      }
    });

    it('should throw LedgerSerializationError for duplicate decision IDs', () => {
      const json = JSON.stringify({
        meta: { version: '1.0.0', created: '2024-01-20T12:00:00.000Z', project: 'test' },
        decisions: [
          {
            id: 'architectural_001',
            timestamp: '2024-01-20T12:00:00.000Z',
            category: 'architectural',
            constraint: 'First',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
          {
            id: 'architectural_001',
            timestamp: '2024-01-20T12:00:00.000Z',
            category: 'architectural',
            constraint: 'Duplicate',
            source: 'design_choice',
            confidence: 'canonical',
            status: 'active',
            phase: 'design',
          },
        ],
      });

      expect(() => deserialize(json)).toThrow(LedgerSerializationError);

      try {
        deserialize(json);
      } catch (error) {
        const serError = error as LedgerSerializationError;
        expect(serError.errorType).toBe('validation_error');
        expect(serError.message).toContain('Duplicate decision ID');
      }
    });

    it('should accept now function option', () => {
      const json = JSON.stringify({
        meta: { version: '1.0.0', created: '2024-01-20T12:00:00.000Z', project: 'test' },
        decisions: [],
      });

      const customNow = (): Date => new Date('2025-01-01T00:00:00.000Z');
      const ledger = deserialize(json, { now: customNow });

      // The ledger should be created successfully with the custom now function
      expect(ledger.size).toBe(0);
    });
  });

  describe('serialize/deserialize roundtrip', () => {
    it('should preserve all decisions through roundtrip', () => {
      const ledger = createTestLedger();
      const d1 = ledger.append(createTestInput({ constraint: 'First' }));
      const d2 = ledger.append(createTestInput({ constraint: 'Second', dependencies: [d1.id] }));
      ledger.append(createTestInput({ constraint: 'Third', dependencies: [d1.id, d2.id] }));

      const json = serialize(ledger);
      const restored = deserialize(json);

      expect(restored.size).toBe(3);
      expect(restored.hasId(d1.id)).toBe(true);
      expect(restored.hasId(d2.id)).toBe(true);
    });

    it('should preserve decision links through roundtrip', () => {
      const ledger = createTestLedger();
      const original = ledger.append(
        createTestInput({
          constraint: 'Original',
          confidence: 'provisional',
        })
      );
      ledger.supersede(original.id, createTestInput({ constraint: 'Replacement' }));

      const json = serialize(ledger);
      const restored = deserialize(json);

      const restoredOriginal = restored.getById(original.id);
      expect(restoredOriginal?.status).toBe('superseded');
      expect(restoredOriginal?.superseded_by).toBeDefined();
    });

    it('should preserve metadata through roundtrip', () => {
      const ledger = createTestLedger();
      ledger.append(createTestInput());

      const originalData = ledger.toData();
      const json = serialize(ledger);
      const restored = deserialize(json);
      const restoredData = restored.toData();

      expect(restoredData.meta.version).toBe(originalData.meta.version);
      expect(restoredData.meta.created).toBe(originalData.meta.created);
      expect(restoredData.meta.project).toBe(originalData.meta.project);
    });

    it('should allow appending new decisions after deserialize', () => {
      const ledger = createTestLedger();
      ledger.append(createTestInput({ constraint: 'First' }));

      const json = serialize(ledger);
      const restored = deserialize(json);

      const newDecision = restored.append(createTestInput({ constraint: 'New decision' }));

      expect(newDecision.id).toBe('architectural_002'); // Should continue ID sequence
      expect(restored.size).toBe(2);
    });
  });

  describe('saveLedger and loadLedger', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `ledger-test-${randomUUID()}`);
      await safeMkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('saveLedger', () => {
      it('should save ledger to file', async () => {
        const ledger = createTestLedger();
        ledger.append(createTestInput({ constraint: 'Test decision' }));

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        const parsed = JSON.parse(content) as LedgerData;
        expect(parsed.decisions).toHaveLength(1);
        expect(parsed.decisions[0]?.constraint).toBe('Test decision');
      });

      it('should save pretty-printed JSON by default', async () => {
        const ledger = createTestLedger();

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).toContain('\n');
      });

      it('should save compact JSON when pretty is false', async () => {
        const ledger = createTestLedger();

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath, { pretty: false });

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).not.toContain('\n');
      });

      it('should perform atomic write (temp file then rename)', async () => {
        const ledger = createTestLedger();
        ledger.append(createTestInput({ constraint: 'Important data' }));

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);

        // File should exist with correct content
        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).toContain('Important data');

        // No temp files should remain
        const files = await safeReaddir(testDir);
        expect(files.filter((f: string) => f.includes('.tmp'))).toHaveLength(0);
      });

      it('should overwrite existing file', async () => {
        const ledger1 = createTestLedger();
        ledger1.append(createTestInput({ constraint: 'First version' }));

        const ledger2 = createTestLedger();
        ledger2.append(createTestInput({ constraint: 'Second version' }));

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger1, filePath);
        await saveLedger(ledger2, filePath);

        const content = (await safeReadFile(filePath, 'utf-8')) as string;
        expect(content).toContain('Second version');
        expect(content).not.toContain('First version');
      });

      it('should throw LedgerSerializationError for invalid directory', async () => {
        const ledger = createTestLedger();

        const filePath = join(testDir, 'nonexistent', 'ledger.json');

        await expect(saveLedger(ledger, filePath)).rejects.toThrow(LedgerSerializationError);

        try {
          await saveLedger(ledger, filePath);
        } catch (error) {
          const serError = error as LedgerSerializationError;
          expect(serError.errorType).toBe('file_error');
          expect(serError.message).toContain('Failed to save ledger');
        }
      });
    });

    describe('loadLedger', () => {
      it('should load ledger from file', async () => {
        const ledger = createTestLedger();
        ledger.append(createTestInput({ constraint: 'Persisted decision' }));

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);

        const loaded = await loadLedger(filePath);

        expect(loaded.size).toBe(1);
        const decision = loaded.getById('architectural_001');
        expect(decision?.constraint).toBe('Persisted decision');
      });

      it('should throw LedgerSerializationError for non-existent file', async () => {
        const filePath = join(testDir, 'nonexistent.json');

        await expect(loadLedger(filePath)).rejects.toThrow(LedgerSerializationError);

        try {
          await loadLedger(filePath);
        } catch (error) {
          const serError = error as LedgerSerializationError;
          expect(serError.errorType).toBe('file_error');
          expect(serError.message).toContain('not found');
        }
      });

      it('should throw LedgerSerializationError for empty file', async () => {
        const filePath = join(testDir, 'empty.json');
        await safeWriteFile(filePath, '', 'utf-8');

        await expect(loadLedger(filePath)).rejects.toThrow(LedgerSerializationError);

        try {
          await loadLedger(filePath);
        } catch (error) {
          const serError = error as LedgerSerializationError;
          expect(serError.errorType).toBe('corruption_error');
          expect(serError.message).toContain('empty');
        }
      });

      it('should throw LedgerSerializationError for corrupted JSON', async () => {
        const filePath = join(testDir, 'corrupted.json');
        await safeWriteFile(filePath, '{ corrupted json data }}}', 'utf-8');

        await expect(loadLedger(filePath)).rejects.toThrow(LedgerSerializationError);

        try {
          await loadLedger(filePath);
        } catch (error) {
          const serError = error as LedgerSerializationError;
          expect(serError.errorType).toBe('parse_error');
        }
      });

      it('should throw LedgerSerializationError for truncated file', async () => {
        const filePath = join(testDir, 'truncated.json');
        // Simulate a partially written file
        await safeWriteFile(filePath, '{"meta": {"version": "1.0.0", "created": "2024', 'utf-8');

        await expect(loadLedger(filePath)).rejects.toThrow(LedgerSerializationError);
      });

      it('should throw descriptive error for corrupted decision data', async () => {
        const filePath = join(testDir, 'invalid-decision.json');
        await safeWriteFile(
          filePath,
          JSON.stringify({
            meta: { version: '1.0.0', created: '2024-01-20T12:00:00.000Z', project: 'test' },
            decisions: [{ id: 'bad', timestamp: 'invalid' }],
          }),
          'utf-8'
        );

        await expect(loadLedger(filePath)).rejects.toThrow(LedgerSerializationError);

        try {
          await loadLedger(filePath);
        } catch (error) {
          const serError = error as LedgerSerializationError;
          expect(serError.errorType).toBe('validation_error');
          expect(serError.message).toContain('Error loading ledger from');
        }
      });

      it('should accept now function option', async () => {
        const ledger = createTestLedger();
        ledger.append(createTestInput());

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);

        const customNow = (): Date => new Date('2025-01-01T00:00:00.000Z');
        const loaded = await loadLedger(filePath, { now: customNow });

        expect(loaded.size).toBe(1);
      });
    });

    describe('save/load roundtrip', () => {
      it('should preserve all decisions through save and load', async () => {
        const ledger = createTestLedger();
        const d1 = ledger.append(createTestInput({ constraint: 'Decision 1' }));
        const d2 = ledger.append(
          createTestInput({
            constraint: 'Decision 2',
            rationale: 'Important rationale',
            dependencies: [d1.id],
          })
        );
        ledger.append(
          createTestInput({
            constraint: 'Decision 3',
            category: 'testing',
            dependencies: [d2.id],
          })
        );

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);
        const loaded = await loadLedger(filePath);

        expect(loaded.size).toBe(3);

        const loadedD2 = loaded.getById(d2.id);
        expect(loadedD2?.rationale).toBe('Important rationale');
        expect(loadedD2?.dependencies).toEqual([d1.id]);
      });

      it('should preserve supersede relationships through roundtrip', async () => {
        const ledger = createTestLedger();
        const original = ledger.append(
          createTestInput({
            constraint: 'Original',
            confidence: 'provisional',
          })
        );
        const result = ledger.supersede(
          original.id,
          createTestInput({ constraint: 'Replacement' })
        );

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);
        const loaded = await loadLedger(filePath);

        const loadedOriginal = loaded.getById(original.id);
        const loadedReplacement = loaded.getById(result.newDecision.id);

        expect(loadedOriginal?.status).toBe('superseded');
        expect(loadedOriginal?.superseded_by).toBe(result.newDecision.id);
        expect(loadedReplacement?.supersedes).toContain(original.id);
      });

      it('should preserve invalidated decisions through roundtrip', async () => {
        const ledger = createTestLedger();
        const decision = ledger.append(
          createTestInput({
            constraint: 'To be invalidated',
            confidence: 'provisional',
          })
        );
        ledger.invalidate(decision.id);

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);
        const loaded = await loadLedger(filePath);

        const loadedDecision = loaded.getById(decision.id);
        expect(loadedDecision?.status).toBe('invalidated');
      });

      it('should allow continued operation after load', async () => {
        const ledger = createTestLedger();
        ledger.append(createTestInput({ constraint: 'First' }));

        const filePath = join(testDir, 'ledger.json');
        await saveLedger(ledger, filePath);
        const loaded = await loadLedger(filePath);

        // Should be able to append more decisions
        const newDecision = loaded.append(createTestInput({ constraint: 'New' }));
        expect(newDecision.id).toBe('architectural_002');

        // Should be able to save again
        await saveLedger(loaded, filePath);
        const reloaded = await loadLedger(filePath);
        expect(reloaded.size).toBe(2);
      });
    });
  });

  describe('LedgerSerializationError', () => {
    it('should preserve error name', () => {
      const error = new LedgerSerializationError('test', 'parse_error');
      expect(error.name).toBe('LedgerSerializationError');
    });

    it('should preserve error type', () => {
      const error = new LedgerSerializationError('test', 'schema_error');
      expect(error.errorType).toBe('schema_error');
    });

    it('should preserve details', () => {
      const error = new LedgerSerializationError('test', 'file_error', { details: 'Extra info' });
      expect(error.details).toBe('Extra info');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new LedgerSerializationError('test', 'parse_error', { cause });
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
        const error = new LedgerSerializationError('test', errorType);
        expect(error.errorType).toBe(errorType);
      }
    });
  });
});
