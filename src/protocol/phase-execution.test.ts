/**
 * Tests for phase execution handlers.
 */

import { describe, it, expect } from 'vitest';
import type { ActionResult, TickContext, ExternalOperations } from './orchestrator.js';
import type { MassDefectPhaseContext } from './phase-execution.js';
import { executeMassDefectPhase } from './phase-execution.js';
import type { ModelRouter, ModelRouterResult } from '../router/types.js';

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
            state: { phase: 'MassDefect', substate: { kind: 'Active' } },
            artifacts: [],
            blockingQueries: [],
          },
          artifacts: new Set(),
          pendingResolutions: [],
          operations,
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
});
