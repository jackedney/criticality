/**
 * Tests for the LLM-based claim parser.
 *
 * @module adapters/typescript/claim-parser.test
 */

import { describe, expect, it, vi } from 'vitest';
import { ClaimParser } from './claim-parser.js';
import type { SpecClaim } from '../../spec/types.js';
import type { ModelRouter, ModelRouterResult, ModelRouterRequest } from '../../router/index.js';
import { createSuccessResult, createFailureResult, createModelError } from '../../router/types.js';

/**
 * Mock ModelRouter for testing.
 */
class MockRouter implements ModelRouter {
  public complete = vi.fn();
  public prompt = vi.fn();
  public async *stream(): AsyncGenerator<unknown, ModelRouterResult, unknown> {
    await Promise.resolve(); // satisfying require-await
    yield { content: '', done: true };
    return createSuccessResult({
      content: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata: { modelId: 'mock', provider: 'mock', latencyMs: 0 },
    });
  }
}

describe('ClaimParser', () => {
  it('parses an invariant claim successfully', async () => {
    const mockRouter = new MockRouter();
    const parser = new ClaimParser(mockRouter);

    const rawClaim: SpecClaim = {
      text: 'Account balance is never negative',
      type: 'invariant',
    };

    const mockResponse: ModelRouterResult = createSuccessResult({
      content: JSON.stringify({
        type: 'invariant',
        testable: true,
        subject: 'Account balance',
        predicate: '>= 0',
      }),
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      metadata: { modelId: 'mock', provider: 'mock', latencyMs: 10 },
    });

    mockRouter.complete.mockResolvedValue(mockResponse);

    const result = await parser.parseClaim('inv_001', rawClaim);

    expect(result.success).toBe(true);
    expect(result.structuredClaim.subject).toBe('Account balance');
    expect(result.structuredClaim.predicate).toBe('>= 0');
    expect(result.structuredClaim.testable).toBe(true);
    expect(mockRouter.complete).toHaveBeenCalled();
  });

  it('parses a behavioral claim successfully', async () => {
    const mockRouter = new MockRouter();
    const parser = new ClaimParser(mockRouter);

    const rawClaim: SpecClaim = {
      text: 'Transferring funds updates both account balances correctly',
      type: 'behavioral',
    };

    const mockResponse: ModelRouterResult = createSuccessResult({
      content: JSON.stringify({
        type: 'behavioral',
        testable: true,
        trigger: 'Transferring funds',
        outcome: 'updates both account balances correctly',
      }),
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      metadata: { modelId: 'mock', provider: 'mock', latencyMs: 10 },
    });

    mockRouter.complete.mockResolvedValue(mockResponse);

    const result = await parser.parseClaim('beh_001', rawClaim);

    expect(result.success).toBe(true);
    expect(result.structuredClaim.trigger).toBe('Transferring funds');
    expect(result.structuredClaim.outcome).toBe('updates both account balances correctly');
  });

  it('handles markdown blocks in LLM response', async () => {
    const mockRouter = new MockRouter();
    const parser = new ClaimParser(mockRouter);

    const rawClaim: SpecClaim = {
      text: 'Lookup is O(1)',
      type: 'performance',
    };

    const mockResponse: ModelRouterResult = createSuccessResult({
      content:
        '```json\n{\n  "type": "performance",\n  "testable": true,\n  "operation": "Lookup",\n  "complexity": "O(1)"\n}\n```',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      metadata: { modelId: 'mock', provider: 'mock', latencyMs: 10 },
    });

    mockRouter.complete.mockResolvedValue(mockResponse);

    const result = await parser.parseClaim('perf_001', rawClaim);

    expect(result.success).toBe(true);
    expect(result.structuredClaim.complexity).toBe('O(1)');
  });

  it('handles router failure gracefully', async () => {
    const mockRouter = new MockRouter();
    const parser = new ClaimParser(mockRouter);

    const rawClaim: SpecClaim = {
      text: 'Some claim',
      type: 'invariant',
    };

    const mockResponse: ModelRouterResult = createFailureResult(
      createModelError('Router failed', true)
    );

    mockRouter.complete.mockResolvedValue(mockResponse);

    const result = await parser.parseClaim('inv_001', rawClaim);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Router failed');
    expect(result.structuredClaim).toEqual(rawClaim);
  });

  it('parses multiple claims in parallel', async () => {
    const mockRouter = new MockRouter();
    const parser = new ClaimParser(mockRouter);

    const claims: Record<string, SpecClaim> = {
      inv_001: { text: 'Balance >= 0', type: 'invariant' },
      beh_001: { text: 'Transfer updates', type: 'behavioral' },
    };

    mockRouter.complete.mockImplementation(async (request: ModelRouterRequest) => {
      // satisfy require-await
      await Promise.resolve();

      if (request.prompt.includes('inv_001')) {
        return createSuccessResult({
          content: JSON.stringify({ type: 'invariant', subject: 'Balance' }),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          metadata: { modelId: 'mock', provider: 'mock', latencyMs: 0 },
        });
      }
      return createSuccessResult({
        content: JSON.stringify({ type: 'behavioral', outcome: 'Updated' }),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: { modelId: 'mock', provider: 'mock', latencyMs: 0 },
      });
    });

    const results = await parser.parseClaims(claims);

    expect(results.size).toBe(2);
    expect(results.get('inv_001')?.structuredClaim.subject).toBe('Balance');
    expect(results.get('beh_001')?.structuredClaim.outcome).toBe('Updated');
  });
});
