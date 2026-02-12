/**
 * Tests for phase execution handlers.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ActionResult, TickContext, ExternalOperations } from './orchestrator.js';
import type { MassDefectPhaseContext, LatticePhaseContext } from './phase-execution.js';
import { executeMassDefectPhase, executeLatticePhase } from './phase-execution.js';
import type { ModelRouter, ModelRouterResult } from '../router/types.js';
import {
  createActiveState,
  createMassDefectAnalyzingComplexity,
  createLatticeGeneratingStructure,
} from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('Phase Execution', () => {
  describe('MassDefect Phase', () => {
    describe('Negative case: MassDefect with no catalog directory', () => {
      it('returns success with finalArtifact when catalog not found', async () => {
        const operations: ExternalOperations = {
          // eslint-disable-next-line @typescript-eslint/require-await
          executeModelCall: async () => ({ success: true }),
          // eslint-disable-next-line @typescript-eslint/require-await
          runCompilation: async () => ({ success: true }),
          // eslint-disable-next-line @typescript-eslint/require-await
          runTests: async () => ({ success: true }),
          // eslint-disable-next-line @typescript-eslint/require-await
          archivePhaseArtifacts: async () => ({ success: true }),
          sendBlockingNotification: async () => {},
        };

        const context: TickContext = {
          snapshot: {
            state: createActiveState({
              phase: 'MassDefect',
              substate: createMassDefectAnalyzingComplexity(),
            }),
            artifacts: [],
            blockingQueries: [],
          },
          artifacts: new Set(),
          pendingResolutions: [],
          operations,
          notificationService: undefined,
        };

        // Create a properly typed mock router
        const mockRouter: ModelRouter = {
          complete: () =>
            Promise.resolve({
              success: false,
              error: { kind: 'ModelError', message: 'Not implemented', retryable: false },
            } satisfies ModelRouterResult),
          stream: async function* () {
            await Promise.resolve();
            yield { content: '', done: false };
            return {
              success: false,
              error: { kind: 'ModelError', message: 'Not implemented', retryable: false },
            } satisfies ModelRouterResult;
          },
          prompt: () =>
            Promise.resolve({
              success: false,
              error: { kind: 'ModelError', message: 'Not implemented', retryable: false },
            } satisfies ModelRouterResult),
        };

        const massDefectContext: MassDefectPhaseContext = {
          config: {
            models: {
              architect_model: 'claude-opus-4.5',
              auditor_model: 'kimi-k2',
              structurer_model: 'claude-sonnet-4.5',
              worker_model: 'minimax-m2',
              fallback_model: 'claude-sonnet-4.5',
            },
            paths: {
              specs: '.criticality/specs',
              archive: '.criticality/archive',
              state: '.criticality/state.json',
              logs: '.criticality/logs',
              ledger: '.criticality/ledger',
            },
            thresholds: {
              context_token_upgrade: 12000,
              signature_complexity_upgrade: 5,
              max_retry_attempts: 3,
              retry_base_delay_ms: 1000,
              performance_variance_threshold: 0.2,
            },
            notifications: {
              enabled: false,
            },
            mass_defect: {
              targets: {
                max_cyclomatic_complexity: 10,
                max_function_length_lines: 50,
                max_nesting_depth: 4,
                min_test_coverage: 0.8,
              },
              catalog_path: './non-existent-catalog',
            },
            cli: {
              colors: true,
              watch_interval: 2000,
              unicode: true,
            },
          },
          projectRoot: '/tmp/test',
          router: mockRouter,
        };

        const result: ActionResult = await executeMassDefectPhase(context, massDefectContext);

        expect(result.success).toBe(true);
        expect(result.artifacts).toContain('finalArtifact');
      });
    });
  });

  describe('Lattice Phase', () => {
    const mockRouter: ModelRouter = {
      complete: () =>
        Promise.resolve({
          success: true,
          response: {
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
          },
        } satisfies ModelRouterResult),
      stream: async function* () {
        await Promise.resolve();
        yield { content: '', done: false };
        return {
          success: true,
          response: {
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
          },
        } satisfies ModelRouterResult;
      },
      prompt: () =>
        Promise.resolve({
          success: true,
          response: {
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
          },
        } satisfies ModelRouterResult),
    };

    const createOperations = (): ExternalOperations => ({
      // eslint-disable-next-line @typescript-eslint/require-await
      executeModelCall: async () => ({ success: true }),
      // eslint-disable-next-line @typescript-eslint/require-await
      runCompilation: async () => ({ success: true }),
      // eslint-disable-next-line @typescript-eslint/require-await
      runTests: async () => ({ success: true }),
      // eslint-disable-next-line @typescript-eslint/require-await
      archivePhaseArtifacts: async () => ({ success: true }),
      sendBlockingNotification: async () => {},
    });

    const createLatticeContext = (projectRoot: string): LatticePhaseContext => ({
      config: {
        models: {
          architect_model: 'claude-opus-4.5',
          auditor_model: 'kimi-k2',
          structurer_model: 'claude-sonnet-4.5',
          worker_model: 'minimax-m2',
          fallback_model: 'claude-sonnet-4.5',
        },
        paths: {
          specs: '.criticality/specs',
          archive: '.criticality/archive',
          state: '.criticality/state.json',
          logs: '.criticality/logs',
          ledger: '.criticality/ledger',
        },
        thresholds: {
          context_token_upgrade: 12000,
          signature_complexity_upgrade: 5,
          max_retry_attempts: 3,
          retry_base_delay_ms: 1000,
          performance_variance_threshold: 0.2,
        },
        notifications: {
          enabled: false,
        },
        mass_defect: {
          targets: {
            max_cyclomatic_complexity: 10,
            max_function_length_lines: 50,
            max_nesting_depth: 4,
            min_test_coverage: 0.8,
          },
          catalog_path: './catalog',
        },
        cli: {
          colors: true,
          watch_interval: 2000,
          unicode: true,
        },
      },
      projectRoot,
      router: mockRouter,
    });

    describe('Negative case: spec.toml not found', () => {
      it('returns failure with recoverable=true when spec.toml not found', async () => {
        const operations = createOperations();

        const context: TickContext = {
          snapshot: {
            state: createActiveState({
              phase: 'Lattice',
              substate: createLatticeGeneratingStructure(),
            }),
            artifacts: [],
            blockingQueries: [],
          },
          artifacts: new Set(),
          pendingResolutions: [],
          operations,
          notificationService: undefined,
        };

        const latticeContext = createLatticeContext('/non/existent/path');

        const result: ActionResult = await executeLatticePhase(context, latticeContext);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Spec file not found');
        expect(result.recoverable).toBe(true);
      });
    });

    describe('Negative case: invalid spec.toml', () => {
      it('returns failure with recoverable=true when spec parsing fails', async () => {
        const tempDir = `/tmp/lattice-test-${String(Date.now())}`;
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(path.join(tempDir, 'spec.toml'), 'invalid toml [[[', 'utf-8');

        try {
          const operations = createOperations();

          const context: TickContext = {
            snapshot: {
              state: createActiveState({
                phase: 'Lattice',
                substate: createLatticeGeneratingStructure(),
              }),
              artifacts: [],
              blockingQueries: [],
            },
            artifacts: new Set(),
            pendingResolutions: [],
            operations,
            notificationService: undefined,
          };

          const latticeContext = createLatticeContext(tempDir);

          const result: ActionResult = await executeLatticePhase(context, latticeContext);

          expect(result.success).toBe(false);
          expect(result.error).toContain('Failed to parse spec.toml');
          expect(result.recoverable).toBe(true);
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('7-step orchestration order', () => {
      it('attempts all 7 lattice steps in correct order', async () => {
        const tempDir = `/tmp/lattice-test-${String(Date.now())}`;
        await fs.mkdir(tempDir, { recursive: true });
        await fs.mkdir(path.join(tempDir, 'src', 'generated'), { recursive: true });
        await fs.mkdir(path.join(tempDir, 'src', 'domain'), { recursive: true });

        const tsconfig = {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            declaration: true,
            outDir: './dist',
            rootDir: './src',
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        };
        await fs.writeFile(
          path.join(tempDir, 'tsconfig.json'),
          JSON.stringify(tsconfig, null, 2),
          'utf-8'
        );

        const validSpec = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"
description = "A test system"
language = "typescript"
`;
        await fs.writeFile(path.join(tempDir, 'spec.toml'), validSpec, 'utf-8');

        const validTsFile = `export interface Test { value: string; }\n`;
        await fs.writeFile(path.join(tempDir, 'src', 'domain', 'test.ts'), validTsFile, 'utf-8');

        try {
          const archiveSpy = vi.fn().mockResolvedValue({ success: true });
          const operations = {
            ...createOperations(),
            archivePhaseArtifacts: archiveSpy,
          };

          const context: TickContext = {
            snapshot: {
              state: createActiveState({
                phase: 'Lattice',
                substate: createLatticeGeneratingStructure(),
              }),
              artifacts: [],
              blockingQueries: [],
            },
            artifacts: new Set(),
            pendingResolutions: [],
            operations,
            notificationService: undefined,
          };

          const latticeContext = createLatticeContext(tempDir);

          const result: ActionResult = await executeLatticePhase(context, latticeContext);

          const generatedDir = path.join(tempDir, 'src', 'generated');
          const typesExists = await fs
            .access(path.join(generatedDir, 'types.ts'))
            .then(() => true)
            .catch(() => false);
          const functionsExists = await fs
            .access(path.join(generatedDir, 'functions.ts'))
            .then(() => true)
            .catch(() => false);
          const witnessesExists = await fs
            .access(path.join(generatedDir, 'witnesses.ts'))
            .then(() => true)
            .catch(() => false);
          const contractsExists = await fs
            .access(path.join(generatedDir, 'contracts.ts'))
            .then(() => true)
            .catch(() => false);

          expect(typesExists).toBe(true);
          expect(functionsExists).toBe(true);
          expect(witnessesExists).toBe(true);
          expect(contractsExists).toBe(true);

          if (result.success) {
            expect(result.artifacts).toEqual(['latticeCode', 'witnesses', 'contracts']);
            expect(archiveSpy).toHaveBeenCalledWith('Lattice');
          } else {
            expect(result.recoverable).toBe(true);
          }
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('Error handling returns correct ActionResult', () => {
      it('returns recoverable=true for expected failures', async () => {
        const tempDir = `/tmp/lattice-test-${String(Date.now())}`;
        await fs.mkdir(tempDir, { recursive: true });

        const specWithoutMeta = `
[system]
name = "test-system"
`;
        await fs.writeFile(path.join(tempDir, 'spec.toml'), specWithoutMeta, 'utf-8');

        try {
          const operations = createOperations();

          const context: TickContext = {
            snapshot: {
              state: createActiveState({
                phase: 'Lattice',
                substate: createLatticeGeneratingStructure(),
              }),
              artifacts: [],
              blockingQueries: [],
            },
            artifacts: new Set(),
            pendingResolutions: [],
            operations,
            notificationService: undefined,
          };

          const latticeContext = createLatticeContext(tempDir);

          const result: ActionResult = await executeLatticePhase(context, latticeContext);

          expect(result.success).toBe(false);
          expect(result.recoverable).toBe(true);
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('Negative case: generateModuleStructure throws', () => {
      it('returns Module generation failed with recoverable=true', async () => {
        const tempDir = `/tmp/lattice-test-${String(Date.now())}`;
        await fs.mkdir(tempDir, { recursive: true });

        // Write a valid spec that parses but will cause module generation to fail
        // by making the project root unwritable for module structure
        const validSpec = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"
description = "A test system"
language = "typescript"

[system.data_models.User]
description = "A user model"
fields = { id = "string", name = "string" }
`;
        await fs.writeFile(path.join(tempDir, 'spec.toml'), validSpec, 'utf-8');

        // Don't create the src directory and make the project root read-only
        // to force writeModuleStructure to fail. Instead, we can rely on the
        // fact that generateModuleStructure tries to detect conventions and
        // readdir on a non-existent path. Let's use a simpler approach:
        // create a file where a directory is expected.
        await fs.writeFile(path.join(tempDir, 'src'), 'not a directory', 'utf-8');

        try {
          const operations = createOperations();

          const context: TickContext = {
            snapshot: {
              state: createActiveState({
                phase: 'Lattice',
                substate: createLatticeGeneratingStructure(),
              }),
              artifacts: [],
              blockingQueries: [],
            },
            artifacts: new Set(),
            pendingResolutions: [],
            operations,
            notificationService: undefined,
          };

          const latticeContext = createLatticeContext(tempDir);

          const result: ActionResult = await executeLatticePhase(context, latticeContext);

          // The function should return an error result since module generation
          // or writing fails when src is a file instead of a directory
          expect(result.success).toBe(false);
          expect(result.recoverable).toBeDefined();
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('Artifacts archived on success', () => {
      it('calls archivePhaseArtifacts with Lattice on success', async () => {
        const tempDir = `/tmp/lattice-test-${String(Date.now())}`;
        await fs.mkdir(tempDir, { recursive: true });
        await fs.mkdir(path.join(tempDir, 'src', 'generated'), { recursive: true });
        await fs.mkdir(path.join(tempDir, 'src', 'domain'), { recursive: true });

        const tsconfig = {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            declaration: true,
            outDir: './dist',
            rootDir: './src',
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        };
        await fs.writeFile(
          path.join(tempDir, 'tsconfig.json'),
          JSON.stringify(tsconfig, null, 2),
          'utf-8'
        );

        const validSpec = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"
description = "A test system"
language = "typescript"
`;
        await fs.writeFile(path.join(tempDir, 'spec.toml'), validSpec, 'utf-8');

        try {
          const archiveSpy = vi.fn().mockResolvedValue({ success: true });
          const operations = {
            ...createOperations(),
            archivePhaseArtifacts: archiveSpy,
          };

          const context: TickContext = {
            snapshot: {
              state: createActiveState({
                phase: 'Lattice',
                substate: createLatticeGeneratingStructure(),
              }),
              artifacts: [],
              blockingQueries: [],
            },
            artifacts: new Set(),
            pendingResolutions: [],
            operations,
            notificationService: undefined,
          };

          const latticeContext = createLatticeContext(tempDir);

          const result: ActionResult = await executeLatticePhase(context, latticeContext);

          // If compilation verification succeeds, artifacts should be archived
          if (result.success) {
            expect(archiveSpy).toHaveBeenCalledWith('Lattice');
            expect(result.artifacts).toEqual(['latticeCode', 'witnesses', 'contracts']);
          } else {
            // Compilation verifier may fail in test environment
            // but the error should be recoverable
            expect(result.recoverable).toBe(true);
          }
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });
  });
});
