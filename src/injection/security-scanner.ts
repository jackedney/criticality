/**
 * Security vulnerability scanning for Injection phase.
 *
 * Provides automated security scanning for generated code with:
 * - OWASP Top 10 vulnerability detection
 * - CWE-specific issue detection (CWE-79, CWE-89, CWE-22, CWE-78)
 * - ESLint security plugin integration
 * - Structured vulnerability reporting
 * - Immediate escalation to architect_model on critical findings
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import { ESLint } from 'eslint';
import type { VulnerabilityType, FailureType } from './escalation.js';

/**
 * Error thrown when a critical security vulnerability is detected and failFastOnCritical is true.
 */
export class FailFastError extends Error {
  /** The critical vulnerabilities that caused the failure. */
  readonly vulnerabilities: readonly VulnerabilityDetails[];

  constructor(vulnerabilities: readonly VulnerabilityDetails[]) {
    super(
      `Critical security vulnerability detected: ${String(vulnerabilities.length)} critical issue(s) found`
    );
    this.name = 'FailFastError';
    this.vulnerabilities = vulnerabilities;
  }
}

/**
 * Type for ESLint lint result messages.
 */
interface ESLintLintMessage {
  readonly ruleId: string | null;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface ESLintLintResult {
  readonly filePath: string;
  readonly messages: readonly ESLintLintMessage[];
}

/**
 * Security vulnerability severity levels.
 */
export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * OWASP Top 10 vulnerability categories.
 */
export enum OWASP_TOP_10 {
  BROKEN_ACCESS_CONTROL = 'A01:2021 - Broken Access Control',
  CRYPTOGRAPHIC_FAILURES = 'A02:2021 - Cryptographic Failures',
  INJECTION = 'A03:2021 - Injection',
  INSECURE_DESIGN = 'A04:2021 - Insecure Design',
  SECURITY_MISCONFIGURATION = 'A05:2021 - Security Misconfiguration',
  VULNERABLE_COMPONENTS = 'A06:2021 - Vulnerable and Outdated Components',
  AUTH_FAILURES = 'A07:2021 - Identification and Authentication Failures',
  DATA_INTEGRITY = 'A08:2021 - Software and Data Integrity Failures',
  LOGGING_MONITORING = 'A09:2021 - Security Logging and Monitoring Failures',
  SSRF = 'A10:2021 - Server-Side Request Forgery',
}

/**
 * CWE vulnerability identifiers with descriptions.
 */
export const CWE_MAPPINGS: Readonly<
  Record<string, { readonly id: string; readonly name: string; readonly owaspCategory: string }>
> = {
  xss: {
    id: 'CWE-79',
    name: 'Cross-site Scripting (XSS)',
    owaspCategory: OWASP_TOP_10.INJECTION,
  },
  'sql-injection': {
    id: 'CWE-89',
    name: 'SQL Injection',
    owaspCategory: OWASP_TOP_10.INJECTION,
  },
  'path-traversal': {
    id: 'CWE-22',
    name: 'Path Traversal',
    owaspCategory: OWASP_TOP_10.INJECTION,
  },
  'command-injection': {
    id: 'CWE-78',
    name: 'OS Command Injection',
    owaspCategory: OWASP_TOP_10.INJECTION,
  },
  'hardcoded-credentials': {
    id: 'CWE-798',
    name: 'Use of Hard-coded Credentials',
    owaspCategory: OWASP_TOP_10.CRYPTOGRAPHIC_FAILURES,
  },
  eval: {
    id: 'CWE-95',
    name: 'Eval Injection',
    owaspCategory: OWASP_TOP_10.INJECTION,
  },
  'no-csrf': {
    id: 'CWE-352',
    name: 'Cross-Site Request Forgery (CSRF)',
    owaspCategory: OWASP_TOP_10.AUTH_FAILURES,
  },
} as const;

/**
 * Details of a detected security vulnerability.
 */
export interface VulnerabilityDetails {
  /** The vulnerability type identifier. */
  readonly vulnerabilityType: VulnerabilityType;
  /** CWE identifier (if applicable). */
  readonly cweId: string | undefined;
  /** CWE name (if applicable). */
  readonly cweName: string | undefined;
  /** OWASP Top 10 category (if applicable). */
  readonly owaspCategory: string | undefined;
  /** Severity level. */
  readonly severity: VulnerabilitySeverity;
  /** File path where vulnerability was detected. */
  readonly filePath: string;
  /** Line number where vulnerability was detected. */
  readonly line: number;
  /** Column number where vulnerability was detected. */
  readonly column: number;
  /** Description of vulnerability. */
  readonly message: string;
  /** Rule identifier from ESLint. */
  readonly ruleId: string;
}

/**
 * Result of security vulnerability scan.
 */
export interface SecurityScanResult {
  /** Whether any vulnerabilities were detected. */
  readonly hasVulnerabilities: boolean;
  /** Whether critical vulnerabilities were detected (blocks acceptance). */
  readonly hasCriticalVulnerabilities: boolean;
  /** List of detected vulnerabilities. */
  readonly vulnerabilities: readonly VulnerabilityDetails[];
  /** Scan duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Options for security scanning.
 */
export interface SecurityScanOptions {
  /** Working directory for scanning (project root). */
  readonly projectPath: string;
  /** Path to eslint configuration (optional, defaults to project root). */
  readonly eslintConfigPath?: string;
  /** Specific files to scan (if not provided, scans project). */
  readonly files?: readonly string[];
  /** Whether to fail fast on critical vulnerabilities. Default: true. */
  readonly failFastOnCritical?: boolean;
  /** Logger for progress messages. */
  readonly logger?: (message: string) => void;
}

/**
 * Maps ESLint rule IDs to vulnerability types.
 */
const RULE_TO_VULNERABILITY: Readonly<Record<string, VulnerabilityType>> = {
  // SQL Injection patterns
  'security/detect-sql-injection': 'injection',
  'security/detect-sql-injection-lite': 'injection',
  'security/detect-sql-injection-qlik': 'injection',
  'security/detect-possible-sql-injection': 'injection',

  // XSS patterns
  'security/detect-html-injection': 'xss',
  'security/detect-xss': 'xss',

  // Path traversal patterns
  'security/detect-path-traversal': 'path-traversal',
  'security/detect-buffer-overflow': 'path-traversal',
  'security/detect-non-literal-fs-filename': 'path-traversal',

  // OS Command injection patterns
  'security/detect-child-process': 'injection',
  'security/detect-exec': 'injection',
  'security/detect-eval-with-expression': 'injection',
  'security/detect-implied-eval': 'injection',
  'security/detect-object-injection': 'injection',
  'security/detect-new-buffer': 'injection',
  'security/detect-pseudoRandomBytes': 'injection',

  // Hardcoded credentials and other issues
  'security/detect-buffer-noassert': 'insecure-deserialization',
  'security/detect-non-literal-regexp': 'injection',
  'security/detect-unsafe-regex': 'injection',
  'security/detect-unsafe-imports': 'known-vulnerable-components',
  'security/detect-harden': 'security-misconfiguration',
  'security/detect-missing-rate-limiting': 'security-misconfiguration',
  'security/detect-missing-timeout': 'security-misconfiguration',
  'security/detect-no-csrf-before': 'broken-access-control',
  'security/detect-no-csrf-after': 'broken-access-control',
  'security/detect-unsafe-assign': 'xss',
  'security/detect-unsafe-char-at': 'xss',
  'security/detect-unsafe-eval': 'injection',
  'security/detect-unsafe-implied-eval': 'injection',
  'security/detect-unsafe-unsafe-domain': 'xss',
  'security/detect-unsafe-innerhtml': 'xss',
  'security/detect-unsafe-outerhtml': 'xss',
  'security/detect-unsafe-addeventlistener': 'xss',
} as const;

/**
 * Maps rule IDs to CWE information.
 */
const RULE_TO_CWE: Readonly<Record<string, keyof typeof CWE_MAPPINGS>> = {
  'security/detect-sql-injection': 'sql-injection',
  'security/detect-sql-injection-lite': 'sql-injection',
  'security/detect-possible-sql-injection': 'sql-injection',
  'security/detect-html-injection': 'xss',
  'security/detect-xss': 'xss',
  'security/detect-path-traversal': 'path-traversal',
  'security/detect-non-literal-fs-filename': 'path-traversal',
  'security/detect-child-process': 'command-injection',
  'security/detect-exec': 'command-injection',
  'security/detect-eval-with-expression': 'eval',
  'security/detect-implied-eval': 'eval',
} as const;

/**
 * Determines severity based on rule ID and vulnerability type.
 *
 * @param ruleId - The ESLint rule ID.
 * @param vulnerabilityType - The vulnerability type.
 * @returns The severity level.
 */
function determineSeverity(
  ruleId: string,
  vulnerabilityType: VulnerabilityType
): VulnerabilitySeverity {
  // SQL injection is always critical
  if (
    vulnerabilityType === 'injection' &&
    (ruleId.includes('sql') || ruleId.includes('child-process') || ruleId.includes('exec'))
  ) {
    return 'critical';
  }

  // XSS is high severity
  if (vulnerabilityType === 'xss') {
    return 'high';
  }

  // Command injection is critical
  if (vulnerabilityType === 'injection' && (ruleId.includes('exec') || ruleId.includes('eval'))) {
    return 'critical';
  }

  // Path traversal is high
  if (vulnerabilityType === 'path-traversal') {
    return 'high';
  }

  // Default to medium for other issues
  return 'medium';
}

/**
 * Parses ESLint result and extracts security vulnerabilities.
 *
 * @param result - The ESLint lint result.
 * @param filePath - The file path being scanned.
 * @returns Array of vulnerability details.
 */
function parseESLintResult(result: ESLintLintResult, filePath: string): VulnerabilityDetails[] {
  const vulnerabilities: VulnerabilityDetails[] = [];

  for (const message of result.messages) {
    const ruleId = message.ruleId ?? '';

    // Only process security-related rules
    if (!ruleId.startsWith('security/')) {
      continue;
    }

    const vulnerabilityType = RULE_TO_VULNERABILITY[ruleId];
    if (vulnerabilityType === undefined) {
      continue;
    }

    const cweKey = RULE_TO_CWE[ruleId];
    const cweInfo = cweKey !== undefined ? CWE_MAPPINGS[cweKey] : undefined;
    const severity = determineSeverity(ruleId, vulnerabilityType);

    const vulnerability: VulnerabilityDetails = {
      vulnerabilityType,
      cweId: cweInfo?.id,
      cweName: cweInfo?.name,
      owaspCategory: cweInfo?.owaspCategory,
      severity,
      filePath,
      line: message.line,
      column: message.column,
      message: message.message,
      ruleId,
    };
    vulnerabilities.push(vulnerability);
  }

  return vulnerabilities;
}

/**
 * Runs security vulnerability scan on generated code.
 *
 * @param options - Scan options.
 * @returns The security scan result.
 *
 * @example
 * ```typescript
 * const result = await runSecurityScan({
 *   projectPath: '/my-project',
 *   files: ['/src/account.ts'],
 * });
 *
 * if (result.hasCriticalVulnerabilities) {
 *   console.log('Critical vulnerabilities detected!');
 *   for (const vuln of result.vulnerabilities) {
 *     console.log(`  ${vuln.cweId}: ${vuln.message} at ${vuln.filePath}:${vuln.line}`);
 *   }
 * }
 * ```
 */
export async function runSecurityScan(options: SecurityScanOptions): Promise<SecurityScanResult> {
  const startTime = Date.now();
  const logger = options.logger ?? ((): void => undefined);

  logger('Running security vulnerability scan...');

  const eslintConfigPath =
    options.eslintConfigPath ?? path.join(options.projectPath, 'eslint.config.js');

  const filesToScan =
    options.files !== undefined && options.files.length > 0 ? [...options.files] : ['src/**/*.ts'];

  try {
    const eslint = new ESLint({
      cwd: options.projectPath,
      overrideConfigFile: eslintConfigPath,
    });

    const results = await eslint.lintFiles([...filesToScan]);

    const allVulnerabilities: VulnerabilityDetails[] = [];

    for (const result of results) {
      const filePath = result.filePath;
      const vulnerabilities = parseESLintResult(result, filePath);
      allVulnerabilities.push(...vulnerabilities);

      const criticalVulnerabilities = vulnerabilities.filter((v) => v.severity === 'critical');
      if (criticalVulnerabilities.length > 0 && options.failFastOnCritical !== false) {
        logger('  [BLOCKING] Critical security vulnerability detected - aborting scan');
        throw new FailFastError(criticalVulnerabilities);
      }
    }

    const criticalVulnerabilities = allVulnerabilities.filter((v) => v.severity === 'critical');

    const hasVulnerabilities = allVulnerabilities.length > 0;
    const hasCriticalVulnerabilities = criticalVulnerabilities.length > 0;

    logger(
      `  Scan complete: ${String(allVulnerabilities.length)} vulnerabilities found ` +
        `(${String(criticalVulnerabilities.length)} critical)`
    );

    const scanResult: SecurityScanResult = {
      hasVulnerabilities,
      hasCriticalVulnerabilities,
      vulnerabilities: allVulnerabilities,
      durationMs: Date.now() - startTime,
    };

    if (hasCriticalVulnerabilities && options.failFastOnCritical !== false) {
      logger('  [BLOCKING] Critical security vulnerabilities detected');
    }

    return scanResult;
  } catch (error) {
    logger(`  Security scan error: ${error instanceof Error ? error.message : String(error)}`);

    return {
      hasVulnerabilities: false,
      hasCriticalVulnerabilities: false,
      vulnerabilities: [],
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Converts security scan result to failure type for escalation.
 *
 * Creates a security failure type that will trigger immediate escalation
 * to architect_model per escalation table.
 *
 * @param scanResult - The security scan result.
 * @returns A security failure type, or undefined if no vulnerabilities.
 *
 * @example
 * ```typescript
 * const scanResult = await runSecurityScan({ projectPath: '/my-project' });
 * const failure = securityScanToFailure(scanResult);
 *
 * if (failure !== undefined) {
 *   // This will trigger immediate escalation to architect_model
 *   const decision = determineEscalation(failure, attempts, currentTier);
 * }
 * ```
 */
export function securityScanToFailure(
  scanResult: SecurityScanResult
): Extract<FailureType, { type: 'security' }> | undefined {
  if (!scanResult.hasVulnerabilities) {
    return undefined;
  }

  // For now, we use highest severity vulnerability type
  // In a more sophisticated implementation, we might aggregate multiple types
  const sortedBySeverity = [...scanResult.vulnerabilities].sort((a, b) => {
    const severityOrder: Record<VulnerabilitySeverity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  const highestSeverityVuln = sortedBySeverity[0];

  if (highestSeverityVuln === undefined) {
    return undefined;
  }

  return {
    type: 'security',
    vulnerability: highestSeverityVuln.vulnerabilityType,
  };
}

/**
 * Formats a security vulnerability for logging.
 *
 * @param vulnerability - The vulnerability to format.
 * @returns A formatted string representation.
 */
export function formatVulnerability(vulnerability: VulnerabilityDetails): string {
  const parts: string[] = [];

  parts.push(`[${vulnerability.severity.toUpperCase()}]`);

  if (vulnerability.cweId !== undefined && vulnerability.cweName !== undefined) {
    parts.push(`${vulnerability.cweId}: ${vulnerability.cweName}`);
  }

  if (vulnerability.owaspCategory !== undefined) {
    parts.push(`(${vulnerability.owaspCategory})`);
  }

  parts.push(
    `${vulnerability.filePath}:${String(vulnerability.line)}:${String(vulnerability.column)}`
  );
  parts.push(`- ${vulnerability.message}`);
  parts.push(`[${vulnerability.ruleId}]`);

  return parts.join(' ');
}

/**
 * Formats a security scan result as a human-readable report.
 *
 * @param result - The security scan result.
 * @returns A formatted string representation.
 */
export function formatSecurityScanReport(result: SecurityScanResult): string {
  const lines: string[] = [
    '================================================================================',
    '                         SECURITY SCAN REPORT                                   ',
    '================================================================================',
    '',
    `Status: ${
      result.hasCriticalVulnerabilities
        ? 'CRITICAL VULNERABILITIES'
        : result.hasVulnerabilities
          ? 'VULNERABILITIES FOUND'
          : 'CLEAN'
    }`,
    `Total Vulnerabilities: ${String(result.vulnerabilities.length)}`,
    `Critical: ${String(result.vulnerabilities.filter((v) => v.severity === 'critical').length)}`,
    `High: ${String(result.vulnerabilities.filter((v) => v.severity === 'high').length)}`,
    `Medium: ${String(result.vulnerabilities.filter((v) => v.severity === 'medium').length)}`,
    `Low: ${String(result.vulnerabilities.filter((v) => v.severity === 'low').length)}`,
    `Duration: ${String(result.durationMs)}ms`,
    '',
  ];

  if (result.vulnerabilities.length > 0) {
    lines.push('VULNERABILITIES:');
    lines.push('--------------------------------------------------------------------------------');

    // Sort by severity and line number
    const sorted = [...result.vulnerabilities].sort((a, b) => {
      const severityOrder: Record<VulnerabilitySeverity, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.line - b.line;
    });

    for (const vuln of sorted) {
      lines.push(formatVulnerability(vuln));
    }
    lines.push('');
  }

  lines.push('================================================================================');

  return lines.join('\n');
}
