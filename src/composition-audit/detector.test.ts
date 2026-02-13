/**
 * Tests for the contradiction detector.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import type { ModelRouter, ModelRouterResult, ModelRouterResponse } from '../router/types.js';
import type { CompositionAuditInput, Contradiction } from './types.js';
import {
  detectContradictions,
  createEmptyAuditResult,
  formatContradiction,
  formatAuditResult,
  getCriticalContradictions,
  canProceedToInjection,
} from './detector.js';

/**
 * Creates a mock model router for testing.
 */
function createMockRouter(responseContent: string): {
  router: ModelRouter;
  promptMock: ReturnType<typeof vi.fn>;
} {
  const response: ModelRouterResponse = {
    content: responseContent,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
  };
  const result: ModelRouterResult = { success: true, response };
  const promptMock = vi.fn().mockResolvedValue(result);

  return {
    router: {
      prompt: promptMock,
      complete: vi.fn().mockResolvedValue(result),
      stream: vi.fn(),
    },
    promptMock,
  };
}

/**
 * Creates a mock router that returns an error.
 */
function createErrorRouter(): {
  router: ModelRouter;
  promptMock: ReturnType<typeof vi.fn>;
} {
  const result: ModelRouterResult = {
    success: false,
    error: { kind: 'ModelError', message: 'Test error', retryable: false },
  };
  const promptMock = vi.fn().mockResolvedValue(result);

  return {
    router: {
      prompt: promptMock,
      complete: vi.fn().mockResolvedValue(result),
      stream: vi.fn(),
    },
    promptMock,
  };
}

/**
 * Creates a mock router with different responses for auditor and architect.
 */
function createDualMockRouter(
  auditorResponse: string,
  architectResponse: string
): {
  router: ModelRouter;
  promptMock: ReturnType<typeof vi.fn>;
} {
  const promptMock = vi.fn().mockImplementation((modelAlias: string) => {
    const content = modelAlias === 'auditor' ? auditorResponse : architectResponse;
    const response: ModelRouterResponse = {
      content,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };
    return Promise.resolve({ success: true, response } as ModelRouterResult);
  });

  return {
    router: {
      prompt: promptMock,
      complete: vi.fn(),
      stream: vi.fn(),
    },
    promptMock,
  };
}

/**
 * Creates a minimal composition audit input.
 */
function createMinimalInput(): CompositionAuditInput {
  return {
    constraints: {},
    contracts: [],
    witnesses: [],
    claims: {},
  };
}

/**
 * Creates a test input with content.
 */
function createTestInput(): CompositionAuditInput {
  return {
    constraints: {
      functional: ['Balance must be non-negative', 'Users must be authenticated'],
      non_functional: ['Response time under 100ms'],
    },
    contracts: [
      {
        functionName: 'withdraw',
        interfaceName: 'AccountService',
        requires: ['amount > 0', 'balance >= amount'],
        ensures: ['balance == old(balance) - amount'],
        invariants: ['balance >= 0'],
        complexity: 'O(1)',
        purity: 'writes',
        claimRefs: ['balance_001'],
        jsDoc: '/** Withdraw funds */',
      },
    ],
    witnesses: [],
    claims: {
      balance_001: {
        text: 'Account balance must never be negative',
        type: 'invariant',
        testable: true,
      },
    },
  };
}

describe('Contradiction Detector', () => {
  describe('detectContradictions', () => {
    it('returns no contradictions for empty input', async () => {
      const { router } = createMockRouter('{}');
      const input = createMinimalInput();

      const result = await detectContradictions(input, router);

      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions).toHaveLength(0);
      expect(result.hasCriticalContradictions).toBe(false);
      expect(result.summary).toContain('No constraints');
    });

    it('calls auditor model for non-empty input', async () => {
      const { router, promptMock } = createMockRouter(
        JSON.stringify({
          hasContradictions: false,
          contradictions: [],
          summary: 'No contradictions found',
        })
      );
      const input = createTestInput();

      await detectContradictions(input, router);

      expect(promptMock).toHaveBeenCalledTimes(1);
      const [modelAlias, prompt] = promptMock.mock.calls[0] as [string, string];
      expect(modelAlias).toBe('auditor');
      expect(prompt).toContain('Balance must be non-negative');
    });

    it('returns no contradictions when auditor finds none', async () => {
      const { router } = createMockRouter(
        JSON.stringify({
          hasContradictions: false,
          contradictions: [],
          summary: 'Composition appears consistent',
        })
      );
      const input = createTestInput();

      const result = await detectContradictions(input, router);

      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions).toHaveLength(0);
      expect(result.summary).toBe('Composition appears consistent');
      expect(result.crossVerified).toBe(false);
    });

    it('parses contradictions from auditor response', async () => {
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Session timeout conflicts with operation duration',
            involved: [
              {
                elementType: 'constraint',
                id: 'NF001',
                name: 'Session timeout',
                text: 'Sessions expire after 30 minutes',
              },
              {
                elementType: 'contract',
                id: 'processFile',
                name: 'Process file operation',
                text: 'Operation may take up to 2 hours',
              },
            ],
            analysis: 'The session will expire before long operations complete',
            minimalScenario: 'User starts processing, session expires after 30 min',
            suggestedResolutions: ['Extend session timeout', 'Add session keep-alive'],
          },
        ],
        summary: 'Found 1 critical temporal contradiction',
      });

      const { router } = createMockRouter(auditorResponse);
      const input = createTestInput();

      const result = await detectContradictions(input, router, {
        enableCrossVerification: false,
      });

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions).toHaveLength(1);
      expect(result.hasCriticalContradictions).toBe(true);

      const contradiction = result.contradictions[0];
      expect(contradiction).toBeDefined();
      expect(contradiction?.type).toBe('temporal');
      expect(contradiction?.severity).toBe('critical');
      expect(contradiction?.involved).toHaveLength(2);
      expect(contradiction?.suggestedResolutions).toHaveLength(2);
    });

    it('handles model error gracefully', async () => {
      const { router } = createErrorRouter();
      const input = createTestInput();
      const warnings: string[] = [];

      const result = await detectContradictions(input, router, {
        logger: (msg) => warnings.push(msg),
      });

      expect(result.hasContradictions).toBe(false);
      expect(result.summary).toContain('failed');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('handles malformed JSON gracefully', async () => {
      const { router } = createMockRouter('not json at all');
      const input = createTestInput();

      const result = await detectContradictions(input, router);

      expect(result.hasContradictions).toBe(false);
      expect(result.summary).toContain('Failed to parse');
    });

    it('extracts JSON from tricky content with braces in strings', async () => {
      // This test targets the robust scanner logic (extractJSON)
      // Input contains braces inside strings which would confuse simple brace counters
      // Also contains garbage before and after
      const trickyContent = `
        Here is some reasoning...
        {
          "hasContradictions": true,
          "summary": "Found issue with { braces } inside string",
          "contradictions": [
            {
              "type": "invariant",
              "severity": "warning",
              "description": "Nested { brace } issue",
              "involved": [{ "elementType": "constraint", "id": "C1", "name": "N", "text": "T" }],
              "analysis": "Analysis with { nested { braces } } inside text",
              "minimalScenario": "Scenario",
              "suggestedResolutions": []
            }
          ]
        }
        And some trailing text with { unbalanced braces
      `;

      const { router } = createMockRouter(trickyContent);
      const input = createTestInput();

      const result = await detectContradictions(input, router, { enableCrossVerification: false });

      expect(result.hasContradictions).toBe(true);
      expect(result.summary).toContain('Found issue with { braces } inside string');
      expect(result.contradictions[0]?.analysis).toContain('Analysis with { nested { braces } } inside text');
    });

    it('extracts the largest JSON object when nested', async () => {
      // Input contains nested JSON-like structure. The scanner should return the outermost valid object.
      // But wait, the scanner returns the *largest* valid object.
      // If we have { outer: { inner: 1 } }, the outer is largest.
      // If we have { invalid { inner: 1 } }, outer fails parse, inner succeeds.

      const nestedContent = `
        {
          "hasContradictions": true,
          "summary": "Outer object",
          "contradictions": [
             {
              "type": "temporal",
              "severity": "warning",
              "description": "Inner issue",
              "involved": [{ "elementType": "constraint", "id": "C1", "name": "N", "text": "T" }],
              "analysis": "Analysis",
              "minimalScenario": "Scenario",
              "suggestedResolutions": []
            }
          ],
          "extra": { "nested": "object" }
        }
      `;

      const { router } = createMockRouter(nestedContent);
      const input = createTestInput();

      const result = await detectContradictions(input, router);

      expect(result.hasContradictions).toBe(true);
      expect(result.summary).toBe('Outer object');
    });

    it('filters out invalid contradiction types', async () => {
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal', // Valid
            severity: 'critical',
            description: 'Valid contradiction',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'Test', text: 'Test' }],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: [],
          },
          {
            type: 'invalid_type', // Invalid - should be filtered
            severity: 'warning',
            description: 'Invalid contradiction',
            involved: [{ elementType: 'constraint', id: 'C2', name: 'Test', text: 'Test' }],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test summary',
      });

      const { router } = createMockRouter(auditorResponse);
      const input = createTestInput();

      const result = await detectContradictions(input, router, {
        enableCrossVerification: false,
      });

      expect(result.contradictions).toHaveLength(1);
      expect(result.contradictions[0]?.type).toBe('temporal');
    });

    it('performs cross-verification for complex cases', async () => {
      // Multiple contradictions of different types = complex
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Temporal issue',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T1', text: 'T1' }],
            analysis: 'Analysis 1',
            minimalScenario: 'Scenario 1',
            suggestedResolutions: [],
          },
          {
            type: 'resource',
            severity: 'warning',
            description: 'Resource issue',
            involved: [{ elementType: 'constraint', id: 'C2', name: 'T2', text: 'T2' }],
            analysis: 'Analysis 2',
            minimalScenario: 'Scenario 2',
            suggestedResolutions: [],
          },
        ],
        summary: 'Found multiple issues',
      });

      const architectResponse = JSON.stringify({
        verifications: [
          {
            contradictionId: 'will-be-generated',
            confirmed: true,
            analysis: 'Confirmed by architect',
          },
          {
            contradictionId: 'will-be-generated-2',
            confirmed: false,
            analysis: 'False positive',
          },
        ],
        summary: 'Verified contradictions',
      });

      const { router, promptMock } = createDualMockRouter(auditorResponse, architectResponse);
      const input = createTestInput();

      const result = await detectContradictions(input, router, {
        enableCrossVerification: true,
      });

      // Should have called both auditor and architect
      expect(promptMock).toHaveBeenCalledTimes(2);
      const calls = promptMock.mock.calls as [string, string][];
      expect(calls[0]?.[0]).toBe('auditor');
      expect(calls[1]?.[0]).toBe('architect');

      expect(result.crossVerified).toBe(true);
    });

    it('keeps contradictions when cross-verification fails', async () => {
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Issue',
            involved: [
              { elementType: 'constraint', id: 'C1', name: 'T1', text: 'T1' },
              { elementType: 'contract', id: 'C2', name: 'T2', text: 'T2' },
              { elementType: 'witness', id: 'C3', name: 'T3', text: 'T3' },
            ],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: [],
          },
        ],
        summary: 'Found issue',
      });

      // Auditor succeeds, but architect fails
      const promptMock = vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          response: {
            content: auditorResponse,
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
          },
        })
        .mockResolvedValueOnce({
          success: false,
          error: { kind: 'ModelError', message: 'Failed', retryable: false },
        });

      const router: ModelRouter = {
        prompt: promptMock,
        complete: vi.fn(),
        stream: vi.fn(),
      };

      const input = createTestInput();
      const warnings: string[] = [];

      const result = await detectContradictions(input, router, {
        enableCrossVerification: true,
        complexityThreshold: 2, // Lower threshold to trigger cross-verification
        logger: (msg) => warnings.push(msg),
      });

      // Should still have the contradiction from auditor
      expect(result.contradictions).toHaveLength(1);
      expect(result.crossVerified).toBe(false);
      expect(warnings.some((w) => w.includes('Cross-verification failed'))).toBe(true);
    });

    it('skips cross-verification for simple cases', async () => {
      // Single contradiction with 2 elements = not complex
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'warning',
            description: 'Simple issue',
            involved: [
              { elementType: 'constraint', id: 'C1', name: 'T1', text: 'T1' },
              { elementType: 'contract', id: 'C2', name: 'T2', text: 'T2' },
            ],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: [],
          },
        ],
        summary: 'Simple issue found',
      });

      const { router, promptMock } = createMockRouter(auditorResponse);
      const input = createTestInput();

      await detectContradictions(input, router, {
        enableCrossVerification: true,
        complexityThreshold: 5, // High threshold - won't trigger cross-verification
      });

      // Should only call auditor, not architect
      expect(promptMock).toHaveBeenCalledTimes(1);
      const [modelAlias] = promptMock.mock.calls[0] as [string, string];
      expect(modelAlias).toBe('auditor');
    });

    it('disables cross-verification when option is false', async () => {
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Issue 1',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T1', text: 'T1' }],
            analysis: 'A1',
            minimalScenario: 'S1',
            suggestedResolutions: [],
          },
          {
            type: 'resource',
            severity: 'warning',
            description: 'Issue 2',
            involved: [{ elementType: 'contract', id: 'C2', name: 'T2', text: 'T2' }],
            analysis: 'A2',
            minimalScenario: 'S2',
            suggestedResolutions: [],
          },
        ],
        summary: 'Multiple issues',
      });

      const { router, promptMock } = createMockRouter(auditorResponse);
      const input = createTestInput();

      await detectContradictions(input, router, {
        enableCrossVerification: false,
      });

      // Should only call auditor
      expect(promptMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('createEmptyAuditResult', () => {
    it('creates an empty result with the given reason', () => {
      const result = createEmptyAuditResult('Audit skipped for testing');

      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions).toHaveLength(0);
      expect(result.hasCriticalContradictions).toBe(false);
      expect(result.summary).toBe('Audit skipped for testing');
      expect(result.crossVerified).toBe(false);
      expect(result.auditedAt).toBeDefined();
    });
  });

  describe('formatContradiction', () => {
    it('formats a contradiction for display', () => {
      const contradiction: Contradiction = {
        id: 'TEMPORAL_123',
        type: 'temporal',
        severity: 'critical',
        description: 'Session timeout conflicts with operation',
        involved: [
          {
            elementType: 'constraint',
            id: 'NF001',
            name: 'Timeout',
            text: 'Sessions expire after 30 minutes',
          },
        ],
        analysis: 'Sessions will expire during long operations',
        minimalScenario: 'User starts processing, session expires',
        suggestedResolutions: ['Extend timeout', 'Add keep-alive'],
      };

      const formatted = formatContradiction(contradiction);

      expect(formatted).toContain('TEMPORAL');
      expect(formatted).toContain('Session timeout conflicts');
      expect(formatted).toContain('NF001');
      expect(formatted).toContain('Sessions expire after 30 minutes');
      expect(formatted).toContain('Sessions will expire during long operations');
      expect(formatted).toContain('Extend timeout');
    });

    it('shows critical emoji for critical severity', () => {
      const contradiction: Contradiction = {
        id: 'TEST',
        type: 'invariant',
        severity: 'critical',
        description: 'Test',
        involved: [{ elementType: 'claim', id: 'C1', name: 'T', text: 'T' }],
        analysis: 'A',
        minimalScenario: 'S',
        suggestedResolutions: [],
      };

      const formatted = formatContradiction(contradiction);
      expect(formatted).toContain('🔴');
    });

    it('shows warning emoji for warning severity', () => {
      const contradiction: Contradiction = {
        id: 'TEST',
        type: 'resource',
        severity: 'warning',
        description: 'Test',
        involved: [{ elementType: 'claim', id: 'C1', name: 'T', text: 'T' }],
        analysis: 'A',
        minimalScenario: 'S',
        suggestedResolutions: [],
      };

      const formatted = formatContradiction(contradiction);
      expect(formatted).toContain('🟡');
    });
  });

  describe('formatAuditResult', () => {
    it('formats result with no contradictions', () => {
      const result = createEmptyAuditResult('No contradictions found');
      const formatted = formatAuditResult(result);

      expect(formatted).toContain('COMPOSITION AUDIT RESULTS');
      expect(formatted).toContain('No contradictions detected');
      expect(formatted).toContain('Proceeding to Injection');
    });

    it('formats result with contradictions', () => {
      const result = {
        hasContradictions: true,
        contradictions: [
          {
            id: 'TEST',
            type: 'temporal' as const,
            severity: 'critical' as const,
            description: 'Test issue',
            involved: [{ elementType: 'constraint' as const, id: 'C1', name: 'T', text: 'T' }],
            analysis: 'Analysis',
            minimalScenario: 'Scenario',
            suggestedResolutions: ['Fix it'],
          },
        ],
        hasCriticalContradictions: true,
        summary: 'Found issues',
        auditedAt: new Date().toISOString(),
        crossVerified: true,
      };

      const formatted = formatAuditResult(result);

      expect(formatted).toContain('COMPOSITION AUDIT RESULTS');
      expect(formatted).toContain('Found 1 contradiction');
      expect(formatted).toContain('Critical: 1');
      expect(formatted).toContain('cross-verified');
      expect(formatted).toContain('Cannot proceed to Injection');
    });
  });

  describe('getCriticalContradictions', () => {
    it('filters to only critical contradictions', () => {
      const result = {
        hasContradictions: true,
        contradictions: [
          {
            id: 'C1',
            type: 'temporal' as const,
            severity: 'critical' as const,
            description: 'Critical',
            involved: [{ elementType: 'constraint' as const, id: 'X', name: 'X', text: 'X' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
          {
            id: 'C2',
            type: 'resource' as const,
            severity: 'warning' as const,
            description: 'Warning',
            involved: [{ elementType: 'contract' as const, id: 'Y', name: 'Y', text: 'Y' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        hasCriticalContradictions: true,
        summary: 'Mixed',
        auditedAt: new Date().toISOString(),
        crossVerified: false,
      };

      const critical = getCriticalContradictions(result);

      expect(critical).toHaveLength(1);
      expect(critical[0]?.severity).toBe('critical');
    });
  });

  describe('canProceedToInjection', () => {
    it('returns true when no contradictions', () => {
      const result = createEmptyAuditResult('Clean');
      expect(canProceedToInjection(result)).toBe(true);
    });

    it('returns true when only warnings', () => {
      const result = {
        hasContradictions: true,
        contradictions: [
          {
            id: 'W1',
            type: 'resource' as const,
            severity: 'warning' as const,
            description: 'Warning only',
            involved: [{ elementType: 'claim' as const, id: 'X', name: 'X', text: 'X' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        hasCriticalContradictions: false,
        summary: 'Warnings',
        auditedAt: new Date().toISOString(),
        crossVerified: false,
      };

      expect(canProceedToInjection(result)).toBe(true);
    });

    it('returns false when critical contradictions exist', () => {
      const result = {
        hasContradictions: true,
        contradictions: [
          {
            id: 'C1',
            type: 'invariant' as const,
            severity: 'critical' as const,
            description: 'Critical',
            involved: [{ elementType: 'witness' as const, id: 'X', name: 'X', text: 'X' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        hasCriticalContradictions: true,
        summary: 'Critical',
        auditedAt: new Date().toISOString(),
        crossVerified: false,
      };

      expect(canProceedToInjection(result)).toBe(false);
    });
  });

  describe('Example from acceptance criteria', () => {
    it('detects session timeout + long operation + requires active session conflict', async () => {
      // This is the example from the acceptance criteria:
      // Detect 'session expires 30min' + 'operations take 2hrs' + 'requires active session' conflict
      const auditorResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description:
              'Session expires after 30 minutes but operations require 2 hours with active session',
            involved: [
              {
                elementType: 'constraint',
                id: 'NF001',
                name: 'Session timeout',
                text: 'Session expires after 30 minutes of inactivity',
              },
              {
                elementType: 'constraint',
                id: 'NF002',
                name: 'Operation duration',
                text: 'File processing operations may take up to 2 hours',
              },
              {
                elementType: 'contract',
                id: 'processFile.requires',
                name: 'Process file precondition',
                text: 'Requires: session.isActive()',
              },
            ],
            analysis:
              'The processFile operation requires an active session, but sessions expire after 30 minutes. Since file processing can take up to 2 hours, the session will expire during processing, causing the operation to fail.',
            minimalScenario:
              '1. User authenticates and starts a session\n2. User initiates file processing that will take 90 minutes\n3. After 30 minutes, session expires\n4. At minute 31, processing fails because session.isActive() returns false',
            suggestedResolutions: [
              'Increase session timeout to match maximum operation duration (2+ hours)',
              'Implement session keep-alive during long operations',
              'Use a separate long-running task token that does not depend on session',
              'Split long operations into smaller chunks that complete within session timeout',
            ],
          },
        ],
        summary:
          'Critical temporal contradiction: session timeout (30min) is incompatible with operation duration (2hrs) when operations require active session',
      });

      const { router } = createMockRouter(auditorResponse);
      const input: CompositionAuditInput = {
        constraints: {
          non_functional: [
            'Session expires after 30 minutes of inactivity',
            'File processing operations may take up to 2 hours',
          ],
        },
        contracts: [
          {
            functionName: 'processFile',
            interfaceName: 'FileService',
            requires: ['session.isActive()'],
            ensures: ['file.isProcessed()'],
            invariants: [],
            claimRefs: [],
            jsDoc: '',
          },
        ],
        witnesses: [],
        claims: {},
      };

      const result = await detectContradictions(input, router, {
        enableCrossVerification: false,
      });

      // Should detect the contradiction
      expect(result.hasContradictions).toBe(true);
      expect(result.hasCriticalContradictions).toBe(true);
      expect(result.contradictions).toHaveLength(1);

      const contradiction = result.contradictions[0];
      expect(contradiction?.type).toBe('temporal');
      expect(contradiction?.severity).toBe('critical');
      expect(contradiction?.involved).toHaveLength(3);
      expect(contradiction?.suggestedResolutions.length).toBeGreaterThan(0);

      // Should not proceed to Injection
      expect(canProceedToInjection(result)).toBe(false);
    });
  });

  describe('Negative case: No contradictions found', () => {
    it('proceeds to Injection immediately when no contradictions', async () => {
      const auditorResponse = JSON.stringify({
        hasContradictions: false,
        contradictions: [],
        summary:
          'The composition appears consistent. No temporal, resource, invariant, precondition gap, or postcondition conflict contradictions were detected.',
      });

      const { router } = createMockRouter(auditorResponse);
      const input = createTestInput();

      const result = await detectContradictions(input, router);

      // No contradictions = proceed immediately
      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions).toHaveLength(0);
      expect(canProceedToInjection(result)).toBe(true);

      // The formatted output should indicate proceeding
      const formatted = formatAuditResult(result);
      expect(formatted).toContain('Proceeding to Injection');
    });
  });
});
