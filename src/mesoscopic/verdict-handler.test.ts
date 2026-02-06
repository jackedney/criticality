/**
 * Verdict handler tests for Mesoscopic phase.
 *
 * Tests to cluster verdict handling functionality including:
 * - Verdict type construction
 * - Violated claim extraction
 * - Function to claim mapping via CLAIM_REF
 * - Re-injection target identification
 * - Fallback to full cluster re-injection
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import type { ClusterDefinition } from './types.js';
import type { ClaimResult } from './cluster-executor.js';
import type { ClusterVerdict, FunctionToReinject } from './verdict-handler.js';
import {
  handleClusterVerdict,
  recordViolatedClaimsInLedger,
  processClusterVerdict,
} from './verdict-handler.js';
import { Ledger } from '../ledger/ledger.js';

describe('ClusterVerdict', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const timestamp = Date.now();
    tempDir = `/tmp/verdict-handler-test-${String(timestamp)}`;
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(
      `${tempDir}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: { target: 'ES2020' },
        include: ['src/**/*.ts'],
      })
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('type', () => {
    it('should create a pass verdict with no violated claims', () => {
      const verdict: ClusterVerdict = {
        pass: true,
        violatedClaims: [],
        functionsToReinject: [],
        fallbackTriggered: false,
      };

      expect(verdict.pass).toBe(true);
      expect(verdict.violatedClaims).toEqual([]);
      expect(verdict.functionsToReinject).toEqual([]);
      expect(verdict.fallbackTriggered).toBe(false);
    });

    it('should create a fail verdict with violated claims', () => {
      const functionToReinject: FunctionToReinject = {
        functionName: 'withdraw',
        filePath: '/src/accounting/withdraw.ts',
        violatedClaims: ['balance_002'],
        allClaimRefs: ['balance_001', 'balance_002'],
      };

      const verdict: ClusterVerdict = {
        pass: false,
        violatedClaims: ['balance_002'],
        functionsToReinject: [functionToReinject],
        fallbackTriggered: false,
      };

      expect(verdict.pass).toBe(false);
      expect(verdict.violatedClaims).toEqual(['balance_002']);
      expect(verdict.functionsToReinject).toEqual([functionToReinject]);
      expect(verdict.fallbackTriggered).toBe(false);
    });

    it('should create a fail verdict with fallback triggered', () => {
      const verdict: ClusterVerdict = {
        pass: false,
        violatedClaims: ['balance_002'],
        functionsToReinject: [],
        fallbackTriggered: true,
      };

      expect(verdict.pass).toBe(false);
      expect(verdict.violatedClaims).toEqual(['balance_002']);
      expect(verdict.functionsToReinject).toEqual([]);
      expect(verdict.fallbackTriggered).toBe(true);
    });
  });

  describe('handleClusterVerdict', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return pass verdict when all claims passed', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'passed',
          testCount: 10,
          passedCount: 10,
          failedCount: 0,
          failedTests: [],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(true);
      expect(result.verdict.violatedClaims).toEqual([]);
      expect(result.verdict.functionsToReinject).toEqual([]);
      expect(result.verdict.fallbackTriggered).toBe(false);
      expect(result.recordedClaims).toEqual([]);
    });

    it('should identify functions linked to violated claims via CLAIM_REF', async () => {
      // Create a source file with CLAIM_REF comments
      const srcDir = `${tempDir}/src/accounting`;
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        `${srcDir}/withdraw.ts`,
        `/**
 * Withdraw function.
 * CLAIM_REF: balance_001
 * CLAIM_REF: balance_002
 */
export function withdraw(amount: number): number {
  return amount;
}
`
      );

      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(false);
      expect(result.verdict.violatedClaims).toEqual(['balance_002']);
      expect(result.verdict.fallbackTriggered).toBe(false);
      expect(result.recordedClaims).toEqual(['balance_002']);

      const withdrawFunc = result.verdict.functionsToReinject.find(
        (f) => f.functionName === 'withdraw'
      );
      expect(withdrawFunc).toBeDefined();
      expect(withdrawFunc?.violatedClaims).toEqual(['balance_002']);
      expect(withdrawFunc?.allClaimRefs).toContain('balance_002');
    });

    it('should trigger fallback when no CLAIM_REF links exist', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_003',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(false);
      expect(result.verdict.violatedClaims).toEqual(['balance_003']);
      expect(result.verdict.functionsToReinject).toEqual([]);
      expect(result.verdict.fallbackTriggered).toBe(true);
      // recordedClaims only contains violated claims, not all cluster claims
      expect(result.recordedClaims).toEqual(['balance_003']);
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('No CLAIM_REF links found - triggering fallback')
      );
    });

    it('should return pass verdict when all claims passed', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'passed',
          testCount: 10,
          passedCount: 10,
          failedCount: 0,
          failedTests: [],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(true);
      expect(result.verdict.violatedClaims).toEqual([]);
      expect(result.verdict.functionsToReinject).toEqual([]);
      expect(result.verdict.fallbackTriggered).toBe(false);
      expect(result.recordedClaims).toEqual([]);
    });

    it('should return fail verdict with violated claims', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1', 'test2'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(false);
      expect(result.verdict.violatedClaims).toEqual(['balance_002']);
      // Without source files with CLAIM_REF, fallback is triggered
      expect(result.verdict.fallbackTriggered).toBe(true);
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 violated claim(s): balance_002')
      );
    });

    it('should identify functions linked to violated claims when CLAIM_REF exists', async () => {
      // Create a source file with CLAIM_REF comments
      const srcDir = `${tempDir}/src/accounting`;
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        `${srcDir}/withdraw.ts`,
        `/**
 * Withdraw function.
 * CLAIM_REF: balance_001
 * CLAIM_REF: balance_002
 */
export function withdraw(amount: number): number {
  return amount;
}
`
      );

      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(false);
      expect(result.verdict.violatedClaims).toEqual(['balance_002']);
      expect(result.verdict.fallbackTriggered).toBe(false);
      expect(result.recordedClaims).toEqual(['balance_002']);
    });

    it('should trigger fallback when no CLAIM_REF links exist for violated claim', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_002',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const logger = vi.fn();

      const result = handleClusterVerdict({
        projectPath: tempDir,
        cluster,
        claimResults,
        logger,
      });

      expect(result.verdict.pass).toBe(false);
      expect(result.verdict.violatedClaims).toEqual(['balance_002']);
      expect(result.verdict.functionsToReinject).toEqual([]);
      expect(result.verdict.fallbackTriggered).toBe(true);
      // recordedClaims only contains violated claims
      expect(result.recordedClaims).toEqual(['balance_002']);
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('No CLAIM_REF links found - triggering fallback')
      );
    });
  });

  describe('recordViolatedClaimsInLedger', () => {
    it('should record violated claims in ledger', () => {
      const ledger = new Ledger({ project: 'test-project' });
      const violatedClaims = ['balance_002', 'inv_003'];

      const recorded = recordViolatedClaimsInLedger(violatedClaims, ledger);

      expect(recorded).toEqual(['balance_002', 'inv_003']);

      const decisions = ledger.query({ category: 'testing' });
      expect(decisions.length).toBe(2);

      if (decisions[0] !== undefined && decisions[1] !== undefined) {
        expect(decisions[0].constraint).toContain('balance_002');
        expect(decisions[0].source).toBe('mesoscopic_failure');
        expect(decisions[0].confidence).toBe('inferred');
        expect(decisions[0].phase).toBe('mesoscopic');
        expect(decisions[1].constraint).toContain('inv_003');
      }
    });

    it('should handle duplicate claim IDs gracefully', () => {
      const ledger = new Ledger({ project: 'test-project' });
      const violatedClaims = ['balance_002', 'balance_002'];

      const recorded = recordViolatedClaimsInLedger(violatedClaims, ledger);

      expect(recorded).toEqual(['balance_002', 'balance_002']);

      const decisions = ledger.query({ category: 'testing' });
      expect(decisions.length).toBe(2);
    });
  });

  describe('processClusterVerdict', () => {
    it('should process pass verdict and return no recorded claims', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'passed',
          testCount: 10,
          passedCount: 10,
          failedCount: 0,
          failedTests: [],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const ledger = new Ledger({ project: 'test-project' });
      const logger = vi.fn();

      const result = processClusterVerdict(
        {
          projectPath: tempDir,
          cluster,
          claimResults,
          logger,
        },
        ledger
      );

      expect(result.verdict.pass).toBe(true);
      expect(result.recordedClaims).toEqual([]);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Cluster verdict: PASS'));
    });

    it('should process fail verdict and record violated claims', () => {
      const claimResults: ClaimResult[] = [
        {
          claimId: 'balance_001',
          status: 'passed',
          testCount: 5,
          passedCount: 5,
          failedCount: 0,
          failedTests: [],
          durationMs: 100,
        },
        {
          claimId: 'balance_002',
          status: 'failed',
          testCount: 10,
          passedCount: 7,
          failedCount: 3,
          failedTests: ['test1'],
          durationMs: 200,
        },
      ];

      const cluster: ClusterDefinition = {
        id: 'cluster_001',
        name: 'accounting',
        modules: ['src/accounting'],
        claimIds: ['balance_001', 'balance_002'],
        isCrossModule: false,
      };

      const ledger = new Ledger({ project: 'test-project' });
      const logger = vi.fn();

      const result = processClusterVerdict(
        {
          projectPath: tempDir,
          cluster,
          claimResults,
          logger,
        },
        ledger
      );

      expect(result.verdict.pass).toBe(false);
      expect(result.recordedClaims).toEqual(['balance_002']);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Cluster verdict: FAIL'));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Violated claims: balance_002'));

      const decisions = ledger.query({ category: 'testing' });
      const mesoscopicDecisions = decisions.filter((d) => d.source === 'mesoscopic_failure');
      expect(mesoscopicDecisions.length).toBe(1);
      if (mesoscopicDecisions[0] !== undefined) {
        expect(mesoscopicDecisions[0].constraint).toContain('balance_002');
      }
    });
  });
});
