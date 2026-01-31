/**
 * Tests for security vulnerability scanner.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runSecurityScan,
  securityScanToFailure,
  formatVulnerability,
  formatSecurityScanReport,
  OWASP_TOP_10,
  CWE_MAPPINGS,
  type VulnerabilitySeverity,
} from './security-scanner.js';

describe('security-scanner', () => {
  describe('OWASP_TOP_10', () => {
    it('defines all OWASP Top 10 categories', () => {
      expect(OWASP_TOP_10.BROKEN_ACCESS_CONTROL).toBeDefined();
      expect(OWASP_TOP_10.CRYPTOGRAPHIC_FAILURES).toBeDefined();
      expect(OWASP_TOP_10.INJECTION).toBeDefined();
      expect(OWASP_TOP_10.INSECURE_DESIGN).toBeDefined();
      expect(OWASP_TOP_10.SECURITY_MISCONFIGURATION).toBeDefined();
      expect(OWASP_TOP_10.VULNERABLE_COMPONENTS).toBeDefined();
      expect(OWASP_TOP_10.AUTH_FAILURES).toBeDefined();
      expect(OWASP_TOP_10.DATA_INTEGRITY).toBeDefined();
      expect(OWASP_TOP_10.LOGGING_MONITORING).toBeDefined();
      expect(OWASP_TOP_10.SSRF).toBeDefined();
    });
  });

  describe('CWE_MAPPINGS', () => {
    it('defines CWE mappings for required vulnerabilities', () => {
      expect(CWE_MAPPINGS.xss).toEqual({
        id: 'CWE-79',
        name: 'Cross-site Scripting (XSS)',
        owaspCategory: OWASP_TOP_10.INJECTION,
      });

      expect(CWE_MAPPINGS['sql-injection']).toEqual({
        id: 'CWE-89',
        name: 'SQL Injection',
        owaspCategory: OWASP_TOP_10.INJECTION,
      });

      expect(CWE_MAPPINGS['path-traversal']).toEqual({
        id: 'CWE-22',
        name: 'Path Traversal',
        owaspCategory: OWASP_TOP_10.INJECTION,
      });

      expect(CWE_MAPPINGS['command-injection']).toEqual({
        id: 'CWE-78',
        name: 'OS Command Injection',
        owaspCategory: OWASP_TOP_10.INJECTION,
      });
    });
  });

  describe('formatVulnerability', () => {
    it('formats vulnerability details as a readable string', () => {
      const vuln = {
        vulnerabilityType: 'xss' as const,
        cweId: 'CWE-79',
        cweName: 'Cross-site Scripting (XSS)',
        owaspCategory: OWASP_TOP_10.INJECTION,
        severity: 'high' as VulnerabilitySeverity,
        filePath: '/src/account.ts',
        line: 42,
        column: 10,
        message: 'Unsanitized user input used in innerHTML',
        ruleId: 'security/detect-unsafe-innerhtml',
      };

      const formatted = formatVulnerability(vuln);

      expect(formatted).toContain('[HIGH]');
      expect(formatted).toContain('CWE-79: Cross-site Scripting (XSS)');
      expect(formatted).toContain('/src/account.ts:42:10');
      expect(formatted).toContain('Unsanitized user input used in innerHTML');
    });

    it('handles vulnerabilities without CWE information', () => {
      const vuln = {
        vulnerabilityType: 'security-misconfiguration' as const,
        cweId: undefined,
        cweName: undefined,
        owaspCategory: undefined,
        severity: 'medium' as VulnerabilitySeverity,
        filePath: '/src/server.ts',
        line: 100,
        column: 5,
        message: 'Missing rate limiting',
        ruleId: 'security/detect-missing-rate-limiting',
      };

      const formatted = formatVulnerability(vuln);

      expect(formatted).toContain('[MEDIUM]');
      expect(formatted).toContain('/src/server.ts:100:5');
      expect(formatted).toContain('Missing rate limiting');
    });
  });

  describe('formatSecurityScanReport', () => {
    it('formats clean scan result', () => {
      const result = {
        hasVulnerabilities: false,
        hasCriticalVulnerabilities: false,
        vulnerabilities: [],
        durationMs: 1234,
      };

      const report = formatSecurityScanReport(result);

      expect(report).toContain('CLEAN');
      expect(report).toContain('Total Vulnerabilities: 0');
      expect(report).toContain('Critical: 0');
      expect(report).toContain('Duration: 1234ms');
    });

    it('formats scan with vulnerabilities', () => {
      const result = {
        hasVulnerabilities: true,
        hasCriticalVulnerabilities: true,
        vulnerabilities: [
          {
            vulnerabilityType: 'injection' as const,
            cweId: 'CWE-89',
            cweName: 'SQL Injection',
            owaspCategory: OWASP_TOP_10.INJECTION,
            severity: 'critical' as VulnerabilitySeverity,
            filePath: '/src/account.ts',
            line: 42,
            column: 10,
            message: 'SQL string concatenation detected',
            ruleId: 'security/detect-sql-injection',
          },
        ],
        durationMs: 2345,
      };

      const report = formatSecurityScanReport(result);

      expect(report).toContain('CRITICAL VULNERABILITIES');
      expect(report).toContain('Total Vulnerabilities: 1');
      expect(report).toContain('Critical: 1');
      expect(report).toContain('CWE-89: SQL Injection');
    });
  });

  describe('securityScanToFailure', () => {
    it('returns undefined when no vulnerabilities found', () => {
      const result = {
        hasVulnerabilities: false,
        hasCriticalVulnerabilities: false,
        vulnerabilities: [],
        durationMs: 100,
      };

      const failure = securityScanToFailure(result);

      expect(failure).toBeUndefined();
    });

    it('creates security failure for vulnerabilities', () => {
      const result = {
        hasVulnerabilities: true,
        hasCriticalVulnerabilities: false,
        vulnerabilities: [
          {
            vulnerabilityType: 'xss' as const,
            cweId: 'CWE-79',
            cweName: 'Cross-site Scripting (XSS)',
            owaspCategory: OWASP_TOP_10.INJECTION,
            severity: 'high' as VulnerabilitySeverity,
            filePath: '/src/ui.ts',
            line: 15,
            column: 3,
            message: 'XSS vulnerability detected',
            ruleId: 'security/detect-xss',
          },
        ],
        durationMs: 100,
      };

      const failure = securityScanToFailure(result);

      expect(failure).toBeDefined();
      expect(failure?.type).toBe('security');
      expect(failure?.vulnerability).toBe('xss');
    });

    it('prioritizes critical vulnerabilities', () => {
      const result = {
        hasVulnerabilities: true,
        hasCriticalVulnerabilities: true,
        vulnerabilities: [
          {
            vulnerabilityType: 'xss' as const,
            cweId: 'CWE-79',
            cweName: 'Cross-site Scripting (XSS)',
            owaspCategory: OWASP_TOP_10.INJECTION,
            severity: 'high' as VulnerabilitySeverity,
            filePath: '/src/ui.ts',
            line: 15,
            column: 3,
            message: 'XSS vulnerability',
            ruleId: 'security/detect-xss',
          },
          {
            vulnerabilityType: 'injection' as const,
            cweId: 'CWE-89',
            cweName: 'SQL Injection',
            owaspCategory: OWASP_TOP_10.INJECTION,
            severity: 'critical' as VulnerabilitySeverity,
            filePath: '/src/account.ts',
            line: 42,
            column: 10,
            message: 'SQL injection',
            ruleId: 'security/detect-sql-injection',
          },
        ],
        durationMs: 100,
      };

      const failure = securityScanToFailure(result);

      expect(failure?.vulnerability).toBe('injection');
    });
  });

  describe('runSecurityScan', () => {
    it('handles empty files list', async () => {
      const logger = vi.fn();

      await expect(
        runSecurityScan({
          projectPath: '/test/project',
          files: [],
          logger,
        })
      ).rejects.toThrow();

      expect(logger).toHaveBeenCalledWith('Running security vulnerability scan...');
    });

    it('throws error on scan failure', async () => {
      const logger = vi.fn();

      await expect(
        runSecurityScan({
          projectPath: '/nonexistent/path',
          files: ['/nonexistent/file.ts'],
          logger,
        })
      ).rejects.toThrow();

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Security scan error:'));
    });

    it('continues scanning when failFastOnCritical is false', async () => {
      const logger = vi.fn();

      await expect(
        runSecurityScan({
          projectPath: '/test/project',
          failFastOnCritical: false,
          logger,
        })
      ).rejects.toThrow();

      expect(logger).toHaveBeenCalledWith('Running security vulnerability scan...');
    });
  });
});
