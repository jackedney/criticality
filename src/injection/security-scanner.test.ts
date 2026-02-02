/**
 * Tests for security vulnerability scanner.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runSecurityScan,
  securityScanToFailure,
  formatVulnerability,
  formatSecurityScanReport,
  OWASP_TOP_10,
  CWE_MAPPINGS,
  type VulnerabilitySeverity,
} from './security-scanner.js';
import { safeSymlink, safeWriteFile } from '../utils/safe-fs.js';
import type { VulnerabilityType } from './escalation.js';

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

  describe('runSecurityScan integration tests', () => {
    let tempDir: string;
    const projectRoot = process.cwd();

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'security-scan-test-'));
      const nodeModulesPath = path.join(projectRoot, 'node_modules');
      const type = process.platform === 'win32' ? 'junction' : 'dir';
      await safeSymlink(nodeModulesPath, path.join(tempDir, 'node_modules'), type);

      // Create package.json to mark directory as ESM
      await safeWriteFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ type: 'module' }, null, 2)
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('detects eval() usage in vulnerable code', async () => {
      const vulnerableFile = path.join(tempDir, 'vulnerable.js');
      const eslintConfig = path.join(tempDir, 'eslint.config.js');

      await safeWriteFile(
        vulnerableFile,
        `export function evaluate(input) {
  return eval(input);
}`
      );

      await safeWriteFile(
        eslintConfig,
        `import securityPlugin from 'eslint-plugin-security';

export default [
  {
    plugins: {
      security: securityPlugin,
    },
    rules: {
      'security/detect-eval-with-expression': 'warn',
      'security/detect-child-process': 'warn',
    },
  },
];`
      );

      const logger = vi.fn();

      const result = await runSecurityScan({
        projectPath: tempDir,
        eslintConfigPath: eslintConfig,
        files: [vulnerableFile],
        logger,
        failFastOnCritical: false,
      });

      expect(result.hasVulnerabilities).toBe(true);
      expect(result.hasCriticalVulnerabilities).toBe(true);
      expect(result.vulnerabilities.length).toBeGreaterThan(0);

      const evalVuln = result.vulnerabilities.find(
        (v) => v.vulnerabilityType === 'injection' && v.ruleId.includes('eval')
      );
      expect(evalVuln).toBeDefined();
      expect(evalVuln?.severity).toBe('critical');
      expect(evalVuln?.filePath).toBe(vulnerableFile);
    });

    it('returns clean result for code without vulnerabilities', async () => {
      const cleanFile = path.join(tempDir, 'clean.js');
      const eslintConfig = path.join(tempDir, 'eslint.config.js');

      await safeWriteFile(
        cleanFile,
        `export function add(a, b) {
  return a + b;
}`
      );

      await safeWriteFile(
        eslintConfig,
        `import securityPlugin from 'eslint-plugin-security';

export default [
  {
    plugins: {
      security: securityPlugin,
    },
    rules: {
      'security/detect-eval-with-expression': 'warn',
      'security/detect-child-process': 'warn',
    },
  },
];`
      );

      const logger = vi.fn();

      const result = await runSecurityScan({
        projectPath: tempDir,
        eslintConfigPath: eslintConfig,
        files: [cleanFile],
        logger,
        failFastOnCritical: false,
      });

      expect(result.hasVulnerabilities).toBe(false);
      expect(result.hasCriticalVulnerabilities).toBe(false);
      expect(result.vulnerabilities.length).toBe(0);
    });

    it('detects child_process.exec() usage', async () => {
      const vulnerableFile = path.join(tempDir, 'vulnerable.js');
      const eslintConfig = path.join(tempDir, 'eslint.config.js');

      await safeWriteFile(
        vulnerableFile,
        `import { exec } from 'child_process';

export function executeCommand(command) {
  return exec(command);
}`
      );

      await safeWriteFile(
        eslintConfig,
        `import securityPlugin from 'eslint-plugin-security';

export default [
  {
    plugins: {
      security: securityPlugin,
    },
    rules: {
      'security/detect-child-process': 'warn',
    },
  },
];`
      );

      const logger = vi.fn();

      const result = await runSecurityScan({
        projectPath: tempDir,
        eslintConfigPath: eslintConfig,
        files: [vulnerableFile],
        logger,
        failFastOnCritical: false,
      });

      expect(result.hasVulnerabilities).toBe(true);
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe('Property-based tests', () => {
    const vulnerabilitySeverityArbitrary = fc.constantFrom<VulnerabilitySeverity>(
      'critical',
      'high',
      'medium',
      'low'
    );

    const vulnerabilityTypeArbitrary = fc.constantFrom<VulnerabilityType>(
      'injection',
      'broken-auth',
      'sensitive-data-exposure',
      'xxe',
      'broken-access-control',
      'security-misconfiguration',
      'xss',
      'insecure-deserialization',
      'known-vulnerable-components',
      'insufficient-logging',
      'path-traversal'
    );

    const vulnerabilityDetailsArbitrary = fc.record({
      vulnerabilityType: vulnerabilityTypeArbitrary,
      cweId: fc.oneof(
        fc.constantFrom<string | undefined>(undefined),
        fc.string({ minLength: 2, maxLength: 20 })
      ),
      cweName: fc.oneof(
        fc.constantFrom<string | undefined>(undefined),
        fc.string({ minLength: 2, maxLength: 100 })
      ),
      owaspCategory: fc.oneof(
        fc.constantFrom<string | undefined>(undefined),
        fc.string({ minLength: 2, maxLength: 100 })
      ),
      severity: vulnerabilitySeverityArbitrary,
      filePath: fc.string({ minLength: 1, maxLength: 200 }),
      line: fc.nat({ max: 10000 }),
      column: fc.nat({ max: 1000 }),
      message: fc.string({ minLength: 1, maxLength: 500 }),
      ruleId: fc.string({ minLength: 5, maxLength: 100 }),
    }) as fc.Arbitrary<{
      readonly vulnerabilityType: VulnerabilityType;
      readonly cweId: string | undefined;
      readonly cweName: string | undefined;
      readonly owaspCategory: string | undefined;
      readonly severity: VulnerabilitySeverity;
      readonly filePath: string;
      readonly line: number;
      readonly column: number;
      readonly message: string;
      readonly ruleId: string;
    }>;

    describe('formatVulnerability produces expected tokens across random severity inputs', () => {
      it('always contains severity token in uppercase', () => {
        fc.assert(
          fc.property(vulnerabilityDetailsArbitrary, (vuln) => {
            const formatted = formatVulnerability(vuln);
            const expectedSeverityToken = `[${vuln.severity.toUpperCase()}]`;
            expect(formatted).toContain(expectedSeverityToken);
          })
        );
      });

      it('always contains file path token', () => {
        fc.assert(
          fc.property(vulnerabilityDetailsArbitrary, (vuln) => {
            const formatted = formatVulnerability(vuln);
            const expectedPathToken = `${vuln.filePath}:${String(vuln.line)}:${String(vuln.column)}`;
            expect(formatted).toContain(expectedPathToken);
          })
        );
      });

      it('contains CWE token when CWE information is present', () => {
        fc.assert(
          fc.property(
            vulnerabilityDetailsArbitrary.filter(
              (v) => v.cweId !== undefined && v.cweName !== undefined
            ),
            (vuln) => {
              const formatted = formatVulnerability(vuln);
              if (vuln.cweId !== undefined) {
                expect(formatted).toContain(vuln.cweId);
              }
              if (vuln.cweName !== undefined) {
                expect(formatted).toContain(vuln.cweName);
              }
            }
          )
        );
      });

      it('contains OWASP category token when present', () => {
        fc.assert(
          fc.property(
            vulnerabilityDetailsArbitrary.filter((v) => v.owaspCategory !== undefined),
            (vuln) => {
              const formatted = formatVulnerability(vuln);
              if (vuln.owaspCategory !== undefined) {
                expect(formatted).toContain(`(${vuln.owaspCategory})`);
              }
            }
          )
        );
      });

      it('contains message and ruleId tokens', () => {
        fc.assert(
          fc.property(vulnerabilityDetailsArbitrary, (vuln) => {
            const formatted = formatVulnerability(vuln);
            expect(formatted).toContain(vuln.message);
            expect(formatted).toContain(`[${vuln.ruleId}]`);
          })
        );
      });
    });

    describe('securityScanToFailure picks highest-severity vulnerability', () => {
      it('random vulnerability arrays always select correct max severity', () => {
        fc.assert(
          fc.property(
            fc.array(vulnerabilityDetailsArbitrary, { minLength: 1, maxLength: 20 }),
            (vulnerabilities) => {
              const scanResult = {
                hasVulnerabilities: true,
                hasCriticalVulnerabilities: vulnerabilities.some((v) => v.severity === 'critical'),
                vulnerabilities,
                durationMs: 100,
              };

              const failure = securityScanToFailure(scanResult);

              if (failure !== undefined) {
                const selectedVuln =
                  vulnerabilities.find((v) => v.severity === 'critical') ??
                  vulnerabilities.find((v) => v.severity === 'high') ??
                  vulnerabilities.find((v) => v.severity === 'medium') ??
                  vulnerabilities.find((v) => v.severity === 'low');

                expect(failure.type).toBe('security');
                expect(selectedVuln).toBeDefined();
                if (selectedVuln !== undefined) {
                  expect(failure.vulnerability).toBe(selectedVuln.vulnerabilityType);
                }
              }
            }
          )
        );
      });

      it('empty vulnerability arrays return undefined', () => {
        fc.assert(
          fc.property(fc.constant<readonly []>([]), () => {
            const scanResult = {
              hasVulnerabilities: false,
              hasCriticalVulnerabilities: false,
              vulnerabilities: [],
              durationMs: 100,
            };

            const failure = securityScanToFailure(scanResult);
            expect(failure).toBeUndefined();
          })
        );
      });

      it('selects critical over high, medium, low when present', () => {
        fc.assert(
          fc.property(
            vulnerabilityDetailsArbitrary.filter((v) => v.severity === 'critical'),
            fc.array(
              vulnerabilityDetailsArbitrary.filter((v) => v.severity !== 'critical'),
              { minLength: 0, maxLength: 10 }
            ),
            (criticalVuln, otherVulns) => {
              const vulnerabilities = [criticalVuln, ...otherVulns];
              const scanResult = {
                hasVulnerabilities: true,
                hasCriticalVulnerabilities: true,
                vulnerabilities,
                durationMs: 100,
              };

              const failure = securityScanToFailure(scanResult);

              expect(failure).toBeDefined();
              expect(failure?.type).toBe('security');
              expect(failure?.vulnerability).toBe(criticalVuln.vulnerabilityType);
            }
          )
        );
      });

      it('selects high over medium and low when no critical present', () => {
        fc.assert(
          fc.property(
            vulnerabilityDetailsArbitrary.filter((v) => v.severity === 'high'),
            fc.array(
              vulnerabilityDetailsArbitrary.filter(
                (v) => v.severity === 'medium' || v.severity === 'low'
              ),
              { minLength: 1, maxLength: 10 }
            ),
            (highVuln, lowerVulns) => {
              const vulnerabilities = [highVuln, ...lowerVulns];
              const scanResult = {
                hasVulnerabilities: true,
                hasCriticalVulnerabilities: false,
                vulnerabilities,
                durationMs: 100,
              };

              const failure = securityScanToFailure(scanResult);

              expect(failure).toBeDefined();
              expect(failure?.type).toBe('security');
              expect(failure?.vulnerability).toBe(highVuln.vulnerabilityType);
            }
          )
        );
      });
    });

    describe('OWASP_TOP_10 and CWE_MAPPINGS completeness', () => {
      it('all OWASP_TOP_10 values contain OWASP Top 10 identifier', () => {
        const owaspEntries = Object.values(OWASP_TOP_10);

        fc.assert(
          fc.property(fc.constantFrom(...owaspEntries), (category) => {
            expect(category).toMatch(/^A\d{2}:2021 -/);
            expect(category.length).toBeGreaterThan(10);
          })
        );
      });

      it('all CWE_MAPPINGS have required fields', () => {
        const cweEntries = Object.values(CWE_MAPPINGS);

        fc.assert(
          fc.property(fc.constantFrom(...cweEntries), (mapping) => {
            expect(mapping.id).toBeDefined();
            expect(mapping.id).toMatch(/^CWE-\d+$/);
            expect(mapping.name).toBeDefined();
            expect(typeof mapping.name).toBe('string');
            expect(mapping.name.length).toBeGreaterThan(0);
            expect(mapping.owaspCategory).toBeDefined();
            expect(typeof mapping.owaspCategory).toBe('string');
            const owaspCategories = Object.values(OWASP_TOP_10);
            expect(owaspCategories).toContain(mapping.owaspCategory);
          })
        );
      });

      it('all CWE_MAPPINGS reference valid OWASP_TOP_10 categories', () => {
        const owaspCategories = Object.values(OWASP_TOP_10);
        const cweMappings = Object.values(CWE_MAPPINGS);

        for (const mapping of cweMappings) {
          expect(owaspCategories).toContain(mapping.owaspCategory);
        }
      });

      it('OWASP_TOP_10 has exactly 10 categories', () => {
        const owaspEntries = Object.values(OWASP_TOP_10);
        expect(owaspEntries).toHaveLength(10);
      });
    });
  });
});
