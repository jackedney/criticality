/**
 * Cluster verdict handler for Mesoscopic phase.
 *
 * Handles cluster test verdicts and triggers appropriate re-injection
 * based on violated claims via CLAIM_REF linkage.
 *
 * Key features:
 * - Identifies violated claims from cluster execution results
 * - Maps claims to functions via CLAIM_REF comments
 * - Records violated claims in DecisionLedger
 * - Returns functions for targeted re-injection
 * - Fallback to full cluster re-injection if no CLAIM_REF links
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Project } from 'ts-morph';
import { parseContracts } from '../adapters/typescript/contracts.js';
import type { ClaimResult } from './cluster-executor.js';
import type { ClusterDefinition } from './types.js';
import type { Ledger } from '../ledger/ledger.js';

export interface ClusterVerdict {
  /** Whether the cluster passed all tests. */
  readonly pass: boolean;
  /** Claims that were violated in testing. */
  readonly violatedClaims: readonly string[];
  /** Functions that need to be re-injected (via CLAIM_REF linkage). */
  readonly functionsToReinject: readonly FunctionToReinject[];
  /** Whether fallback to full cluster re-injection was triggered. */
  readonly fallbackTriggered: boolean;
}

export interface FunctionToReinject {
  /** The function name. */
  readonly functionName: string;
  /** The file path where the function is defined. */
  readonly filePath: string;
  /** Violated claims that triggered re-injection for this function. */
  readonly violatedClaims: readonly string[];
  /** All claims referenced by this function via CLAIM_REF. */
  readonly allClaimRefs: readonly string[];
}

export interface VerdictOptions {
  readonly projectPath: string;
  readonly cluster: ClusterDefinition;
  readonly claimResults: readonly ClaimResult[];
  readonly logger?: (message: string) => void;
}

export interface VerdictResult {
  /** The verdict for the cluster. */
  readonly verdict: ClusterVerdict;
  /** Violated claims recorded in ledger. */
  readonly recordedClaims: readonly string[];
}

export interface FunctionClaimData {
  readonly filePath: string;
  readonly claimRefs: readonly string[];
}

export type FunctionClaimMapping = Record<string, FunctionClaimData>;

/**
 * Extracts violated claim IDs from cluster execution results.
 *
 * @param claimResults - Array of claim results from cluster execution.
 * @returns Array of violated claim IDs.
 */
function extractViolatedClaims(claimResults: readonly ClaimResult[]): string[] {
  const violatedClaims = new Set<string>();

  for (const result of claimResults) {
    if (result.status === 'failed') {
      violatedClaims.add(result.claimId);
    }
  }

  return Array.from(violatedClaims);
}

/**
 * Builds a mapping of function names to their CLAIM_REFs.
 *
 * Scans all source files in the project and extracts
 * CLAIM_REF comments from function JSDocs.
 *
 * @param project - The ts-morph Project.
 * @param projectPath - The project root path.
 * @returns Map of function name to array of claim reference IDs.
 */
function buildFunctionClaimMapping(project: Project, projectPath: string): FunctionClaimMapping {
  const mapping: FunctionClaimMapping = {};

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    if (!filePath.startsWith(projectPath)) {
      continue;
    }

    const contracts = parseContracts(project, filePath);

    for (const contract of contracts) {
      if (contract.claimRefs.length > 0) {
        const functionName = contract.functionName;

        const existingData = mapping[functionName];

        if (existingData === undefined) {
          mapping[functionName] = { filePath, claimRefs: contract.claimRefs };
        } else {
          const existingRefsSet = new Set(existingData.claimRefs);

          for (const claimRef of contract.claimRefs) {
            if (!existingRefsSet.has(claimRef)) {
              existingRefsSet.add(claimRef);
            }
          }

          mapping[functionName] = {
            filePath: existingData.filePath,
            claimRefs: Array.from(existingRefsSet),
          };
        }
      }
    }
  }

  return mapping;
}

/**
 * Identifies functions to re-inject based on violated claims.
 *
 * @param violatedClaims - Array of violated claim IDs.
 * @param functionClaimMapping - Map of function name to claim references.
 * @param cluster - The cluster definition with module list.
 * @returns Array of functions to re-inject with metadata.
 */
function identifyFunctionsToReinject(
  violatedClaims: readonly string[],
  functionClaimMapping: FunctionClaimMapping
): FunctionToReinject[] {
  const functionsToReinject: FunctionToReinject[] = [];
  const violatedClaimsSet = new Set(violatedClaims);

  for (const [functionName, claimData] of Object.entries(functionClaimMapping)) {
    const claimRefs = claimData.claimRefs;
    const filePath = claimData.filePath;
    const violatedRefs = claimRefs.filter((claimId) => violatedClaimsSet.has(claimId));

    if (violatedRefs.length > 0) {
      functionsToReinject.push({
        functionName,
        filePath,
        violatedClaims: violatedRefs,
        allClaimRefs: claimRefs,
      });
    }
  }

  return functionsToReinject;
}

/**
 * Handles cluster verdict and determines re-injection strategy.
 *
 * Main entry point for cluster verdict handling. This function:
 * 1. Extracts violated claims from cluster execution results
 * 2. Builds function -> claim mapping from CLAIM_REF comments
 * 3. Identifies functions that need re-injection
 * 4. Returns verdict with functions to re-inject
 * 5. Handles fallback case when no CLAIM_REF links exist
 *
 * @param options - Verdict options including project path, cluster, and claim results.
 * @returns Verdict result with functions to re-inject.
 *
 * @example
 * ```typescript
 * const result = handleClusterVerdict({
 *   projectPath: '/path/to/project',
 *   cluster: { id: 'cluster_001', name: 'accounting', modules: [...], claimIds: [...] },
 *   claimResults: [
 *     { claimId: 'balance_001', status: 'passed', ... },
 *     { claimId: 'balance_002', status: 'failed', ... }
 *   ]
 * });
 *
 * // Returns:
 * // {
 * //   verdict: {
 * //     pass: false,
 * //     violatedClaims: ['balance_002'],
 * //     functionsToReinject: [
 * //       { functionName: 'withdraw', filePath: '...', violatedClaims: ['balance_002'], ... }
 * //     ],
 * //     fallbackTriggered: false
 * //   },
 * //   recordedClaims: ['balance_002']
 * // }
 * ```
 */
export function handleClusterVerdict(options: VerdictOptions): VerdictResult {
  // eslint-disable-next-line no-console
  const logger = options.logger ?? console.log;

  logger('[ClusterVerdict] Processing cluster verdict...');

  const violatedClaims = extractViolatedClaims(options.claimResults);

  if (violatedClaims.length === 0) {
    logger('[ClusterVerdict] No violated claims - cluster passed');

    const verdict: ClusterVerdict = {
      pass: true,
      violatedClaims: [],
      functionsToReinject: [],
      fallbackTriggered: false,
    };

    return { verdict, recordedClaims: [] };
  }

  logger(
    `[ClusterVerdict] Found ${String(violatedClaims.length)} violated claim(s): ${violatedClaims.join(', ')}`
  );

  const tsConfigFilePath = path.join(options.projectPath, 'tsconfig.json');
  if (!fs.existsSync(tsConfigFilePath)) {
    throw new Error(`tsconfig.json not found at ${tsConfigFilePath}`);
  }

  const project = new Project({
    tsConfigFilePath,
  });

  const functionClaimMapping = buildFunctionClaimMapping(project, options.projectPath);

  const functionsToReinject = identifyFunctionsToReinject(violatedClaims, functionClaimMapping);

  const fallbackTriggered = functionsToReinject.length === 0;

  if (fallbackTriggered) {
    logger(
      '[ClusterVerdict] No CLAIM_REF links found - triggering fallback to full cluster re-injection'
    );
  } else {
    logger(
      `[ClusterVerdict] Identified ${String(functionsToReinject.length)} function(s) to re-inject: ${functionsToReinject.map((f) => f.functionName).join(', ')}`
    );
  }

  const verdict: ClusterVerdict = {
    pass: false,
    violatedClaims,
    functionsToReinject,
    fallbackTriggered,
  };

  const recordedClaims = violatedClaims;

  logger('[ClusterVerdict] Verdict processing complete');

  return { verdict, recordedClaims };
}

/**
 * Records violated claims in DecisionLedger.
 *
 * @param violatedClaims - Array of violated claim IDs.
 * @param ledger - Decision ledger instance for recording violations.
 * @returns Array of recorded claim IDs.
 *
 * @example
 * ```typescript
 * import { Ledger } from '../ledger/ledger.js';
 *
 * const ledger = new Ledger({ project: 'my-project' });
 * const recorded = recordViolatedClaimsInLedger(['balance_002', 'inv_003'], ledger);
 * // Returns: ['balance_002', 'inv_003']
 * ```
 */
export function recordViolatedClaimsInLedger(
  violatedClaims: readonly string[],
  ledger: Ledger
): string[] {
  const recorded: string[] = [];

  for (const claimId of violatedClaims) {
    try {
      ledger.append({
        category: 'testing',
        constraint: `Claim ${claimId} violated during Mesoscopic phase`,
        rationale: `Cluster test failed for claim ${claimId}, triggering re-injection of linked functions`,
        source: 'mesoscopic_failure',
        confidence: 'inferred',
        phase: 'mesoscopic',
      });

      recorded.push(claimId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`[ClusterVerdict] Failed to record violated claim ${claimId}: ${errorMessage}`);
    }
  }

  return recorded;
}

/**
 * Processes cluster verdict and triggers re-injection.
 *
 * Orchestrates the full verdict handling workflow:
 * 1. Determine verdict from cluster execution
 * 2. Identify functions to re-inject via CLAIM_REF linkage
 * 3. Record violated claims in ledger
 * 4. Return verdict for re-injection phase
 *
 * @param options - Verdict options.
 * @param ledger - Decision ledger instance for recording violations.
 * @returns Complete verdict result.
 *
 * @example
 * ```typescript
 * import { Ledger } from '../ledger/ledger.js';
 *
 * const ledger = new Ledger({ project: 'my-project' });
 * const result = processClusterVerdict({
 *   projectPath: '/path/to/project',
 *   cluster: { id: 'cluster_001', ... },
 *   claimResults: [...],
 * }, ledger);
 *
 * if (result.verdict.fallbackTriggered) {
 *   // Re-inject all functions in cluster
 * } else {
 *   // Re-inject only result.verdict.functionsToReinject
 * }
 * ```
 */
export function processClusterVerdict(options: VerdictOptions, ledger: Ledger): VerdictResult {
  // eslint-disable-next-line no-console
  const logger = options.logger ?? console.log;

  logger('[ClusterVerdict] Starting cluster verdict processing...');

  const { verdict, recordedClaims } = handleClusterVerdict(options);

  if (recordedClaims.length > 0) {
    const recordedInLedger = recordViolatedClaimsInLedger(recordedClaims, ledger);

    logger(
      `[ClusterVerdict] Recorded ${String(recordedInLedger.length)} violated claim(s) in ledger: ${recordedInLedger.join(', ')}`
    );
  }

  logger(`[ClusterVerdict] Cluster verdict: ${verdict.pass ? 'PASS' : 'FAIL'}`);
  logger(`[ClusterVerdict] Violated claims: ${verdict.violatedClaims.join(', ')}`);
  logger(`[ClusterVerdict] Functions to re-inject: ${String(verdict.functionsToReinject.length)}`);
  logger(`[ClusterVerdict] Fallback triggered: ${String(verdict.fallbackTriggered)}`);

  return { verdict, recordedClaims };
}
