/**
 * Tests for contradiction report storage module.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { mkdir, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ContradictionReport,
  Contradiction,
  ContradictionType,
  ContradictionSeverity,
  InvolvedElement,
} from './types.js';
import type {
  saveContradictionReport,
  loadContradictionReport,
  loadLatestContradictionReport,
  listContradictionReports,
  contradictionReportExists,
  tryLoadContradictionReport,
  serializeReportToJson,
  serializeReportToYaml,
  getAuditDir,
  getReportPath,
  getLatestReportPath,
  ReportStorageError,
} from './report-storage.js';

// Mock homedir to use temp directory
vi.mock('node:os', async (): Promise<typeof import('node:os')> => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => realpathSync(join(tmpdir(), 'criticality-test-storage')),
  };
});

const testProjectId = 'test-project-storage';
let testDir: string;

describe('Report Storage', () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), 'criticality-test-storage');
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Path helpers', () => {
    it('generates correct audit directory path', () => {
      const dir = getAuditDir(testProjectId);
      expect(dir).toContain('test-project-storage');
      expect(dir).toContain('audit');
    });

    it('generates correct report path', () => {
      const path = getReportPath(testProjectId, 'AUDIT_123', 'json');
      expect(path).toContain('test-project-storage');
      expect(path).toContain('AUDIT_123.json');
    });

    it('generates correct latest report path', () => {
      const path = getLatestReportPath(testProjectId, 'json');
      expect(path).toContain('test-project-storage');
      expect(path).toContain('latest.json');
    });

    it('throws validation error for invalid projectId', () => {
      expect(() => getAuditDir('invalid!@#', 'audit')).toThrow();
    });

    it('throws validation error for path traversal', () => {
      expect(() => getAuditDir('../../../etc/passwd', 'audit')).toThrow();
    });

    it('validates that path starts with resolved base', () => {
      const baseDir = join(tmpdir(), 'criticality');
      const dir = getAuditDir(testProjectId);
      expect(dir).toMatch(new RegExp(`^${join(baseDir)}`));
    });
  });

  describe('Serialization', () => {
    it('serializes report to JSON', () => {
      const report: ContradictionReport = createTestReport();
      const json = serializeReportToJson(report, true);
      const parsed = JSON.parse(json) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
      expect(parsed.version).toBeDefined();
      expect(parsed.generatedAt).toBeDefined();
      expect(parsed.summary).toBe('Property test summary');
      expect(parsed.contradictions).toHaveLength(1);
      expect(parsed.contradictions[0]).toEqual(report.contradictions[0]);
    });

    it('produces compact JSON when pretty is false', () => {
      const report: ContradictionReport = createTestReport();
      const compact = serializeReportToJson(report, false);
      const pretty = serializeReportToJson(report, true);
      expect(compact.length).toBeLessThan(pretty.length);
      expect(compact).not.toContain('\n');
      expect(compact).not.toMatch(/\s{2,}/);
    });

    it('preserves structure through serialization/deserialization', () => {
      const original = createTestReport();
      const json = serializeReportToJson(original, true);
      const parsed = JSON.parse(json) as ContradictionReport;
      const restored = parsed.contradictions.at(0);
      expect(restored?.id).toBeDefined();
      if (restored) {
        expect(restored.id).toBe(original.contradictions[0]?.id);
        expect(restored.type).toBe(original.contradictions[0]?.type);
        expect(restored.severity).toBe(original.contradictions[0]?.severity);
        expect(restored.description).toBe(original.contradictions[0]?.description);
        expect(restored.involved).toHaveLength(original.contradictions[0]?.involved.length);
        expect(restored.analysis).toBe(original.contradictions[0]?.analysis);
        expect(restored.minimalScenario).toBe(original.contradictions[0]?.minimalScenario);
        expect(restored.suggestedResolutions).toEqual(original.contradictions[0]?.suggestedResolutions);
        expect(restored.crossVerified).toBe(original.crossVerified);
      }
    });

    it('serializes report to YAML', () => {
      const report: ContradictionReport = createTestReport();
      const yaml = serializeReportToYaml(report);
      const parsed = yamlModule.load(yaml) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
      expect(parsed.id).toBe(report.id);
      expect(parsed.version).toBeDefined();
      expect(parsed.generatedAt).toBeDefined();
      expect(parsed.summary).toBe('Property test summary');
      expect(parsed.contradictions).toHaveLength(1);
      expect(parsed.contradictions[0]).toEqual(report.contradictions[0]);
    });

    it('escapes special characters', () => {
      const report: ContradictionReport = createTestReport();
      report.description = 'Test with "quotes" and\nnewlines';
      report.involved = [
        {
          elementType: 'constraint' as const,
          id: 'C1',
          name: 'Test\ttab',
          text: 'Text',
        },
      ];
      const yaml = serializeReportToYaml(report);
      expect(yaml).toContain('description: |Test with "quotes" and \\nnewlines');
    });

    it('escapes colons in values', () => {
      const report: ContradictionReport = createTestReport();
      report.involved = [
        {
          elementType: 'constraint' as const,
          id: 'C1',
          name: 'Test:value:123',
          text: 'Text',
        },
      ];
      const yaml = serializeReportToYaml(report);
      expect(yaml).toContain('id: C1\\nname: Test\\nvalue:123\\ntext: Text');
    });
  });

  describe('saveContradictionReport', () => {
    it('saves report as JSON by default', async () => {
      const report: ContradictionReport = createTestReport();
      const path = await saveContradictionReport(report);

      expect(path).toContain('.json');
      const content = await safeReadFile(path, 'utf-8');
      const parsed = JSON.parse(content) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
      expect(parsed.id).toBe(report.id);
    });

    it('saves report as YAML when specified', async () => {
      const report: ContradictionReport = createTestReport();
      const path = await saveContradictionReport(report, { format: 'yaml' });

      expect(path).toContain('.yaml');
      const content = await safeReadFile(path, 'utf-8');
      const parsed = yamlModule.load(content) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
      expect(parsed.id).toBe(report.id);
    });

    it('saves report as latest', async () => {
      const report1: createTestReport();
      const report2 = createTestReport();
      await saveContradictionReport(report1);
      await saveContradictionReport(report2);

      const latestPath = getLatestReportPath(testProjectId, 'json');
      const content = await safeReadFile(latestPath, 'utf-8');
      const parsed = JSON.parse(content) as ContradictionReport;
      expect(parsed.id).toBe(report2.id);
      expect(parsed.summary).toContain('Property test summary');
    });

    it('also saves as latest when saving a report', async () => {
      const report1 = createTestReport();
      const report2 = createTestReport();
      await saveContradictionReport(report1);
      await saveContradictionReport(report2);

      const latestPath = getLatestReportPath(testProjectId, 'json');
      const content = await safeReadFile(latestPath, 'utf-8');
      const parsed = JSON.parse(content) as ContradictionReport;
      expect(parsed.id).toBe(report1.id);
      expect(parsed.summary).toContain('Property test summary');
    });
  });

  describe('loadContradictionReport', () => {
    it('loads saved JSON report', async () => {
      const report = createTestReport();
      const path = await saveContradictionReport(report);

      const loaded = await loadContradictionReport(testProjectId, report.id);
      expect(loaded.success).toBe(true);
      expect(loaded.report.id).toBe(report.id);
      expect(loaded.report.projectId).toBe(testProjectId);
    });

    it('loads saved YAML report', async () => {
      const report = createTestReport();
      const path = await saveContradictionReport(report, { format: 'yaml' });

      const loaded = await loadContradictionReport(testProjectId, report.id);
      expect(loaded.success).toBe(true);
      expect(loaded.report.id).toBe(report.id);
      expect(loaded.report.projectId).toBe(testProjectId);
    });

    it('loads latest report', async () => {
      const result = await loadLatestContradictionReport(testProjectId);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.report.id).toBe(report.id);
        expect(result.report.projectId).toBe(testProjectId);
      }
    });

    it('returns null when no reports exist', async () => {
      const result = await tryLoadContradictionReport('nonexistent', 'NONEXISTENT');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect((result.error as ReportStorageError).errorType).toBe('not_found');
    });

    it('throws error when loading fails', async () => {
      const report = createTestReport();
      await saveContradictionReport(report);

      const result = await tryLoadContradictionReport(testProjectId, report.id);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listContradictionReports', () => {
    it('returns empty array when no reports exist', async () => {
      const reports = await listContradictionReports('nonexistent');
      expect(reports).toEqual([]);
    });

    it('returns all report IDs sorted by date', async () => {
      const report1 = createTestReport();
      const report2 = createTestReport();
      const report3 = createTestReport();
      await saveContradictionReport(report1);
      await saveContradictionReport(report2);
      await saveContradictionReport(report3);

      const reports = await listContradictionReports(testProjectId);
      expect(reports).toHaveLength(3);
      expect(reports[0].id).toBe(report1.id);
      expect(reports[1].id).toBe(report2.id);
      expect(reports[2].id).toBe(report3.id);
      expect(reports[0].mtime).toBeGreaterThan(reports[1].mtime);
      expect(reports[1].mtime).toBeGreaterThan(reports[0].mtime);
    });

    it('removes duplicates (same ID in both json and yaml)', async () => {
      const report1 = createTestReport();
      const report2 = createTestReport();
      const report3 = createTestReport();
      await saveContradictionReport(report1);
      await saveContradictionReport(report2);
      await saveContradictionReport(report3);

      const reports = await listContradictionReports(testProjectId);
      expect(reports).toHaveLength(3);
      expect(reports[0].id).toBe(report1.id);
      expect(reports[1].id).toBe(report2.id);
      expect(reports[2].id).toBe(report3.id);
      expect(reports[0].mtime).toBeGreaterThan(reports[1].mtime);
      expect(reports[1].mtime).toBeGreaterThan(reports[0].mtime);
    });

    it('includes latest symlink in list', async () => {
      const report1 = createTestReport();
      const report2 = createTestReport();
      const report3 = createTestReport();
      await saveContradictionReport(report1);
      await saveContradictionReport(report2);
      await saveContradictionReport(report3);

      const reports = await listContradictionReports(testProjectId);
      expect(reports.some((r) => r.id === 'latest'));
    });

    it('checks if a report exists', async () => {
      const exists = await contradictionReportExists(testProjectId, 'AUDIT_123');
      expect(exists).toBe(true);

      const notExists = await contradictionReportExists(testProjectId, 'NONEXISTENT');
      expect(notExists).toBe(false);
    });

  describe('Integration: Save and load round-trip', () => {
    it('preserves all report data through save/load', async () => {
      const original = createTestReport();
      await saveContradictionReport(original);

      const loaded = await loadContradictionReport(testProjectId, original.id);
      expect(loaded.success).toBe(true);
      expect(loaded.report.id).toBe(original.id);
      expect(loaded.report.projectId).toBe(original.projectId);
      expect(loaded.summary).toBe(original.summary);
      expect(loaded.contradictions).toHaveLength(original.contradictions.length);
      expect(loaded.contradictions[0]?.id).toBe(original.contradictions[0]?.id);
      expect(loaded.contradictions[0]?.type).toBe(original.contradictions[0]?.type);
      expect(loaded.contradictions[0]?.severity).toBe(original.contradictions[0]?.severity);
      expect(loaded.contradictions[0]?.description).toBe(original.contradictions[0]?.description);
      expect(loaded.contradictions[0]?.involved).toHaveLength(original.contradictions[0]?.involved.length);
      expect(loaded.contradictions[0]?.analysis).toBe(original.contradictions[0]?.analysis);
      expect(loaded.contradictions[0]?.minimalScenario).toBe(original.contradictions[0]?.minimalScenario);
      expect(loaded.contradictions[0]?.suggestedResolutions).toEqual(original.contradictions[0]?.suggestedResolutions);
      expect(loaded.crossVerified).toBe(original.crossVerified);
    });
  });
