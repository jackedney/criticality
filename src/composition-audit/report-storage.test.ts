/**
 * Tests for the contradiction report storage module.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as yamlModule from 'js-yaml';
import type { ContradictionReport } from './types.js';
import {
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
import { createContradictionReport } from './report-parser.js';

import { realpathSync } from 'node:fs';

// Mock homedir to use temp directory
vi.mock('node:os', async (): Promise<typeof import('node:os')> => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => realpathSync(join(tmpdir(), 'criticality-test-storage')),
  };
});

describe('Report Storage', () => {
  const testProjectId = 'test-project-storage';
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), 'criticality-test-storage');
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '.criticality'), { recursive: true });
    await mkdir(join(testDir, '.criticality', 'projects'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Creates a test report.
   */
  function createTestReport(projectId = testProjectId, hasCritical = false): ContradictionReport {
    const contradictions = hasCritical
      ? [
          {
            id: 'TEST_001',
            type: 'temporal' as const,
            severity: 'critical' as const,
            description: 'Test critical contradiction',
            involved: [
              { elementType: 'constraint' as const, id: 'C1', name: 'Test', text: 'Test text' },
            ],
            analysis: 'Test analysis',
            minimalScenario: 'Test scenario',
            suggestedResolutions: ['Fix it'],
          },
        ]
      : [];

    return createContradictionReport(
      projectId,
      contradictions,
      hasCritical ? 'Found 1 critical' : 'No contradictions',
      false
    );
  }

  describe('Path helpers', () => {
    it('generates correct audit directory path', () => {
      const dir = getAuditDir('my-project');
      expect(dir).toContain('my-project');
      expect(dir).toContain('audit');
    });

    it('generates correct report path for JSON', () => {
      const path = getReportPath('my-project', 'AUDIT_123', 'json');
      expect(path).toContain('AUDIT_123.json');
    });

    it('generates correct report path for YAML', () => {
      const path = getReportPath('my-project', 'AUDIT_123', 'yaml');
      expect(path).toContain('AUDIT_123.yaml');
    });

    it('generates correct latest report path', () => {
      const path = getLatestReportPath('my-project', 'json');
      expect(path).toContain('latest.json');
    });
  });

  describe('serializeReportToJson', () => {
    it('serializes report to JSON', () => {
      const report = createTestReport();
      const json = serializeReportToJson(report, true);

      const parsed = JSON.parse(json) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
      expect(parsed.version).toBeDefined();
    });

    it('produces compact JSON when pretty is false', () => {
      const report = createTestReport();
      const compact = serializeReportToJson(report, false);
      const pretty = serializeReportToJson(report, true);

      expect(compact.length).toBeLessThan(pretty.length);
      expect(compact).not.toContain('\n');
    });
  });

  describe('serializeReportToYaml', () => {
    it('serializes report to YAML', () => {
      const report = createTestReport();
      const yaml = serializeReportToYaml(report);

      expect(yaml).toContain('id:');
      expect(yaml).toContain('projectId:');
      expect(yaml).toContain('stats:');
      expect(yaml).toContain('version:');
      expect(yaml).toContain('generatedAt:');
    });

    it('serializes contradictions correctly', () => {
      const report = createTestReport(testProjectId, true);
      const yaml = serializeReportToYaml(report);

      expect(yaml).toContain('contradictions:');
      expect(yaml).toContain('TEST_001');
      expect(yaml).toContain('temporal');
      expect(yaml).toContain('critical');
    });

    it('escapes special characters', () => {
      const report = createContradictionReport(
        testProjectId,
        [
          {
            id: 'T1',
            type: 'temporal',
            severity: 'critical',
            description: 'Test with "quotes" and\nnewlines',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'Test\ttab', text: 'Text' }],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: [],
          },
        ],
        'Summary',
        false
      );

      const yaml = serializeReportToYaml(report);

      const parsed = yamlModule.load(yaml) as ContradictionReport;
      expect(parsed.contradictions[0]?.description).toBe('Test with "quotes" and\nnewlines');
      expect(parsed.contradictions[0]?.involved[0]?.name).toBe('Test\ttab');
    });
  });

  describe('saveContradictionReport', () => {
    it('saves report as JSON by default', async () => {
      const report = createTestReport();
      const path = await saveContradictionReport(report);

      expect(path).toContain('.json');
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content) as ContradictionReport;
      expect(parsed.projectId).toBe(testProjectId);
    });

    it('saves report as YAML when specified', async () => {
      const report = createTestReport();
      const path = await saveContradictionReport(report, { format: 'yaml' });

      expect(path).toContain('.yaml');
      const content = await readFile(path, 'utf-8');
      expect(content).toContain('id:');
      expect(content).toContain('projectId:');
    });

    it('also saves as latest', async () => {
      const report = createTestReport();
      await saveContradictionReport(report);

      const latestPath = getLatestReportPath(testProjectId, 'json');
      const content = await readFile(latestPath, 'utf-8');
      const parsed = JSON.parse(content) as ContradictionReport;
      expect(parsed.id).toBe(report.id);
    });

    it('creates directory if not exists', async () => {
      const newProjectId = 'new-project-' + Date.now().toString();
      const report = createContradictionReport(newProjectId, [], 'Clean', false);

      // Should not throw
      await saveContradictionReport(report);
    });
  });

  describe('loadContradictionReport', () => {
    it('loads saved JSON report', async () => {
      const original = createTestReport();
      await saveContradictionReport(original);

      const loaded = await loadContradictionReport(testProjectId, original.id);

      expect(loaded.id).toBe(original.id);
      expect(loaded.projectId).toBe(original.projectId);
      expect(loaded.summary).toBe(original.summary);
    });

    it('throws not_found for missing report', async () => {
      await expect(loadContradictionReport(testProjectId, 'NONEXISTENT')).rejects.toThrow(
        ReportStorageError
      );

      try {
        await loadContradictionReport(testProjectId, 'NONEXISTENT');
      } catch (error) {
        expect(error).toBeInstanceOf(ReportStorageError);
        expect((error as ReportStorageError).errorType).toBe('not_found');
      }
    });

    it('throws validation_error for invalid content', async () => {
      // Create invalid report file
      const auditDir = getAuditDir(testProjectId);
      await mkdir(auditDir, { recursive: true });
      const reportPath = join(auditDir, 'INVALID_REPORT.json');
      await writeFile(reportPath, '{"invalid": true}', 'utf-8');

      await expect(loadContradictionReport(testProjectId, 'INVALID_REPORT')).rejects.toThrow(
        ReportStorageError
      );
    });
  });

  describe('loadLatestContradictionReport', () => {
    it('returns null when no reports exist', async () => {
      const result = await loadLatestContradictionReport('nonexistent-project');
      expect(result).toBeNull();
    });

    it('returns latest report', async () => {
      const report = createTestReport();
      await saveContradictionReport(report);

      const latest = await loadLatestContradictionReport(testProjectId);

      expect(latest).not.toBeNull();
      expect(latest?.id).toBe(report.id);
    });

    it('returns last saved report', async () => {
      const report1 = createTestReport();
      await saveContradictionReport(report1);

      const report2 = createTestReport();
      await saveContradictionReport(report2);

      const latest = await loadLatestContradictionReport(testProjectId);

      expect(latest?.id).toBe(report2.id);
    });
  });

  describe('listContradictionReports', () => {
    it('returns empty array when no reports exist', async () => {
      const reports = await listContradictionReports('nonexistent');
      expect(reports).toEqual([]);
    });

    it('lists all reports', async () => {
      const report1 = createTestReport();
      await saveContradictionReport(report1);

      const report2 = createTestReport();
      await saveContradictionReport(report2);

      const reports = await listContradictionReports(testProjectId);

      expect(reports).toContain(report1.id);
      expect(reports).toContain(report2.id);
    });

    it('excludes latest symlink', async () => {
      const report = createTestReport();
      await saveContradictionReport(report);

      const reports = await listContradictionReports(testProjectId);

      expect(reports).not.toContain('latest');
    });

    it('returns reports sorted by modification time', async () => {
      const report1 = createTestReport();
      await saveContradictionReport(report1);

      const report2 = createTestReport();
      await saveContradictionReport(report2);

      // Set report1's mtime to be older than report2
      const report1Path = getReportPath(testProjectId, report1.id, 'json');
      const now = new Date();
      await utimes(report1Path, now, new Date(now.getTime() - 10000));

      const reports = await listContradictionReports(testProjectId);

      // Newest first
      expect(reports[0]).toBe(report2.id);
      expect(reports[1]).toBe(report1.id);
    });
  });

  describe('contradictionReportExists', () => {
    it('returns false for nonexistent report', async () => {
      const exists = await contradictionReportExists(testProjectId, 'NONEXISTENT');
      expect(exists).toBe(false);
    });

    it('returns true for existing JSON report', async () => {
      const report = createTestReport();
      await saveContradictionReport(report, { format: 'json' });

      const exists = await contradictionReportExists(testProjectId, report.id);
      expect(exists).toBe(true);
    });

    it('returns true for existing YAML report', async () => {
      const report = createTestReport();
      await saveContradictionReport(report, { format: 'yaml' });

      const exists = await contradictionReportExists(testProjectId, report.id);
      expect(exists).toBe(true);
    });
  });

  describe('tryLoadContradictionReport', () => {
    it('returns success for existing report', async () => {
      const report = createTestReport();
      await saveContradictionReport(report);

      const result = await tryLoadContradictionReport(testProjectId, report.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.report.id).toBe(report.id);
      }
    });

    it('returns error for missing report', async () => {
      const result = await tryLoadContradictionReport(testProjectId, 'NONEXISTENT');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('not_found');
      }
    });
  });

  describe('Integration: Save and load round-trip', () => {
    it('preserves all report data through save/load', async () => {
      const original = createTestReport(testProjectId, true);
      await saveContradictionReport(original);

      const loaded = await loadContradictionReport(testProjectId, original.id);

      expect(loaded.id).toBe(original.id);
      expect(loaded.projectId).toBe(original.projectId);
      expect(loaded.version).toBe(original.version);
      expect(loaded.generatedAt).toBe(original.generatedAt);
      expect(loaded.summary).toBe(original.summary);
      expect(loaded.crossVerified).toBe(original.crossVerified);
      expect(loaded.stats.total).toBe(original.stats.total);
      expect(loaded.stats.critical).toBe(original.stats.critical);
      expect(loaded.contradictions).toHaveLength(original.contradictions.length);
      expect(loaded.contradictions[0]?.id).toBe(original.contradictions[0]?.id);
    });
  });
});
