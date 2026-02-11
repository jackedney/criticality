/**
 * Phase execution handlers for protocol phases.
 *
 * Implements phase-specific execution logic for each protocol phase,
 * including Mass Defect which runs complexity reduction transformations.
 *
 * @packageDocumentation
 */

import type { ActionResult, TickContext } from './orchestrator.js';
import type { Config } from '../config/types.js';
import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Logger } from '../utils/logger.js';
import {
  type MassDefectConfig,
  type MassDefectResult,
  type TransformationCatalog,
  loadCatalog,
  runMassDefect,
  formatMassDefectReport,
} from '../mass-defect/index.js';
import type { ModelRouter } from '../router/types.js';
import { getPhase } from './types.js';

const logger = new Logger({ component: 'MassDefectPhase', debugMode: false });

/**
 * Context for MassDefect phase execution.
 */
export interface MassDefectPhaseContext {
  readonly config: Config;
  readonly projectRoot: string;
  readonly router: ModelRouter;
}

/**
 * Executes the MassDefect phase.
 *
 * @param context - The tick context containing phase and artifacts.
 * @param massDefectContext - MassDefect-specific context.
 * @returns Promise resolving to action result.
 *
 * @remarks
 * The MassDefect phase:
 * - Loads the transformation catalog from the configured path
 * - Analyzes all source files for complexity issues
 * - Runs the Mass Defect iteration loop to apply transformations
 * - Generates a report of all transformations applied
 * - On convergence (all targets met): produces 'finalArtifact' for Complete transition
 * - On manual_review_required: transitions to BLOCKED with report
 * - With empty source files: immediately produces 'finalArtifact' for Complete transition
 */
export async function executeMassDefectPhase(
  context: TickContext,
  massDefectContext: MassDefectPhaseContext
): Promise<ActionResult> {
  const { snapshot } = context;
  const { config, projectRoot, router } = massDefectContext;

  logger.info('mass_defect_started', {
    phase: getPhase(snapshot.state),
  });

  try {
    const massDefectConfig = config.mass_defect;

    logger.debug('loading_catalog', {
      catalogPath: massDefectConfig.catalog_path,
    });

    const catalogPath = path.resolve(projectRoot, massDefectConfig.catalog_path);

    const catalogExists = await fs
      .access(catalogPath)
      .then(() => true)
      .catch(() => false);

    if (!catalogExists) {
      logger.warn('catalog_not_found', {
        catalogPath,
        message: 'Catalog directory not found, skipping Mass Defect',
      });

      const report = formatMassDefectReport({
        converged: true,
        totalFunctions: 0,
        transformedFunctions: 0,
        optimalFunctions: 0,
        manualReviewFunctions: 0,
        functionResults: new Map(),
        config: convertConfig(massDefectConfig),
      });

      logger.info('mass_defect_skipped_no_catalog', { report });

      await context.operations.archivePhaseArtifacts('MassDefect');

      return {
        success: true,
        artifacts: ['finalArtifact'],
      };
    }

    let catalog: TransformationCatalog;
    try {
      catalog = await loadCatalog(catalogPath);
    } catch (error) {
      logger.error('catalog_load_failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: `Failed to load transformation catalog: ${error instanceof Error ? error.message : String(error)}`,
        recoverable: true,
      };
    }

    logger.info('catalog_loaded');

    const sourceFilePaths = await findTypeScriptFiles(projectRoot);

    if (sourceFilePaths.length === 0) {
      logger.info('no_source_files', {
        message: 'No TypeScript source files found, skipping Mass Defect',
      });

      const report = formatMassDefectReport({
        converged: true,
        totalFunctions: 0,
        transformedFunctions: 0,
        optimalFunctions: 0,
        manualReviewFunctions: 0,
        functionResults: new Map(),
        config: convertConfig(massDefectConfig),
      });

      logger.info('mass_defect_skipped_no_files', { report });

      await context.operations.archivePhaseArtifacts('MassDefect');

      return {
        success: true,
        artifacts: ['finalArtifact'],
      };
    }

    logger.info('analyzing_source_files', {
      fileCount: sourceFilePaths.length,
    });

    const project = new Project({
      tsConfigFilePath: path.resolve(projectRoot, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
    });

    const sourceFiles: SourceFile[] = [];
    for (const filePath of sourceFilePaths) {
      try {
        const sourceFile = project.addSourceFileAtPath(filePath);
        sourceFiles.push(sourceFile);
      } catch (error) {
        logger.warn('failed_to_load_source_file', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('running_mass_defect_loop', {
      fileCount: sourceFiles.length,
      maxCyclomaticComplexity: massDefectConfig.targets.max_cyclomatic_complexity,
      maxFunctionLength: massDefectConfig.targets.max_function_length_lines,
      maxNestingDepth: massDefectConfig.targets.max_nesting_depth,
      minTestCoverage: massDefectConfig.targets.min_test_coverage,
    });

    const result: MassDefectResult = await runMassDefect(
      sourceFiles,
      catalog,
      convertConfig(massDefectConfig),
      router
    );

    logger.info('mass_defect_completed', {
      converged: result.converged,
      totalFunctions: result.totalFunctions,
      transformedFunctions: result.transformedFunctions,
      optimalFunctions: result.optimalFunctions,
      manualReviewFunctions: result.manualReviewFunctions,
    });

    for (const [functionId, functionResult] of result.functionResults) {
      for (const attempt of functionResult.attempts) {
        logger.info('transformation_attempt', {
          functionId,
          patternId: attempt.patternId,
          success: attempt.success,
          risk: attempt.risk,
          beforeMetrics: attempt.beforeMetrics,
          afterMetrics: attempt.afterMetrics,
          error: attempt.error,
        });
      }
    }

    const report = formatMassDefectReport(result);

    logger.info('mass_defect_report_generated');

    if (!result.converged) {
      logger.warn('manual_review_required', {
        manualReviewFunctions: result.manualReviewFunctions,
        message: 'Some functions require manual review',
      });

      return {
        success: false,
        error: report,
        recoverable: true,
      };
    }

    logger.info('mass_defect_converged', {
      message: 'All functions meet complexity targets',
    });

    await context.operations.archivePhaseArtifacts('MassDefect');

    return {
      success: true,
      artifacts: ['finalArtifact'],
    };
  } catch (error) {
    logger.error('mass_defect_execution_failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: `Mass Defect execution failed: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
    };
  }
}

/**
 * Converts MassDefectConfig from config types to mass-defect types.
 */
function convertConfig(config: {
  readonly targets: {
    readonly max_cyclomatic_complexity: number;
    readonly max_function_length_lines: number;
    readonly max_nesting_depth: number;
    readonly min_test_coverage: number;
  };
  readonly catalog_path: string;
}): MassDefectConfig {
  return {
    maxCyclomaticComplexity: config.targets.max_cyclomatic_complexity,
    maxFunctionLength: config.targets.max_function_length_lines,
    maxNestingDepth: config.targets.max_nesting_depth,
    minTestCoverage: config.targets.min_test_coverage,
    catalogPath: config.catalog_path,
  };
}

/**
 * Finds all TypeScript source files in a directory.
 *
 * Excludes:
 * - Hidden directories (starting with .)
 * - node_modules
 * - Build output directories (dist, build, coverage)
 * - Declaration files (.d.ts)
 */
async function findTypeScriptFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const ignoreDirs = new Set(['dist', 'build', 'coverage', 'node_modules']);

  async function scanDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden directories and ignored directories
      if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile()) {
        // Include .ts and .tsx files but exclude declaration files (.d.ts)
        const isTypeScript = entry.name.endsWith('.ts') || entry.name.endsWith('.tsx');
        const isDeclaration = entry.name.endsWith('.d.ts');
        if (isTypeScript && !isDeclaration) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDir(rootDir);
  return files;
}
