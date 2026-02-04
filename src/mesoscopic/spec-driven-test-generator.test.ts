/**
 * Test suite for spec-driven test generator.
 *
 * @packageDocumentation
 */

/* eslint-disable @typescript-eslint/strict-template-expressions */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ModelRouter } from '../router/types.js';
import {
  generateSpecDrivenTests,
  type SpecDrivenTestOptions,
} from './spec-driven-test-generator.js';
import * as fs from 'node:fs/promises';

const mockRouter: ModelRouter = {
  prompt: async (): Promise<{
    success: true;
    response: {
      content: 'generated test code';
      usage: { promptTokens: 100; completionTokens: 50; totalTokens: 150 };
      metadata: { modelId: 'test-model'; provider: 'test'; latencyMs: 100 };
    };
  }> => ({
    success: true,
    response: {
      content: 'generated test code',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    },
  }),
  complete: async (): Promise<{
    success: true;
    response: {
      content: 'generated test code';
      usage: { promptTokens: 100; completionTokens: 50; totalTokens: 150 };
      metadata: { modelId: 'test-model'; provider: 'test'; latencyMs: 100 };
    };
  }> => ({
    success: true,
    response: {
      content: 'generated test code',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    },
  }),
  stream: async function* (): AsyncGenerator<{
    content: 'test';
    done: true;
    usage: { promptTokens: 100; completionTokens: 50; totalTokens: 150 };
  }> {
    yield {
      content: 'test',
      done: true,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };
    return {
      success: true,
      response: {
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: { modelId: 'test', provider: 'test', latencyMs: 0 },
      },
    };
  },
};

describe('spec-driven-test-generator', () => {
  let tempDir: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    tempDir = `/tmp/criticality-test-${timestamp}`;
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should generate tests for invariant claims', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-01T00:00:00Z"

[system]
name = "test-system"
language = "typescript"

[claims]
balance_001 = { type = "invariant", text = "balance is never negative", testable = true }
balance_002 = { type = "invariant", text = "balance is always positive", testable = false }
    `;

    const specPath = `${tempDir}/spec.toml`;
    await fs.writeFile(specPath, specContent, 'utf-8');

    const functionClaimRefs = new Map<string, string[]>([['getBalance', ['balance_001']]]);

    const result = await generateSpecDrivenTests(specPath, functionClaimRefs);

    expect(result.testCount).toBe(1);
    expect(result.skippedClaims).toHaveLength(1);
    expect(result.skippedClaims[0]).toEqual({
      claimId: 'balance_002',
      reason: 'Untestable claim (testable: false)',
    });
  });

  it('should use structurer_model when enabled', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-01T00:00:00Z"

[system]
name = "test-system"
language = "typescript"

[claims]
test_001 = { type = "invariant", text = "test invariant", testable = true }
    `;

    const specPath = `${tempDir}/spec.toml`;
    await fs.writeFile(specPath, specContent, 'utf-8');

    const options: SpecDrivenTestOptions = {
      useStructurerModel: true,
      modelRouter: mockRouter,
    };

    const result = await generateSpecDrivenTests(specPath, new Map(), options);

    expect(result.testCount).toBeGreaterThan(0);
  });

  it('should handle performance claims without threshold', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-01T00:00:00Z"

[system]
name = "test-system"
language = "typescript"

[claims]
perf_001 = { type = "performance", text = "search operation completes quickly", testable = true }
    `;

    const specPath = `${tempDir}/spec.toml`;
    await fs.writeFile(specPath, specContent, 'utf-8');

    const consoleWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '));
    };

    await generateSpecDrivenTests(specPath, new Map());

    console.warn = consoleWarn;

    expect(warnings.some((w) => w.includes('perf_001'))).toBe(true);
    expect(warnings.some((w) => w.includes('no complexity threshold'))).toBe(true);
  });

  it('should generate tests for all claim types', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-01T00:00:00Z"

[system]
name = "test-system"
language = "typescript"

[claims]
inv_001 = { type = "invariant", text = "balance >= 0", testable = true }
beh_001 = { type = "behavioral", text = "transfer updates balances", testable = true }
neg_001 = { type = "negative", text = "overdraft is blocked", testable = true }
temp_001 = { type = "temporal", text = "session expires after 30min", testable = true }
conc_001 = { type = "concurrent", text = "increment is race-free", testable = true }
perf_001 = { type = "performance", text = "lookup is O(1)", testable = true }
    `;

    const specPath = `${tempDir}/spec.toml`;
    await fs.writeFile(specPath, specContent, 'utf-8');

    const result = await generateSpecDrivenTests(specPath, new Map());

    expect(result.testCount).toBe(6);
    expect(result.skippedClaims).toHaveLength(0);
  });
});
