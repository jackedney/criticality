/**
 * Tests for the contradiction report parser.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ModelRouter, ModelRouterResult, ModelRouterResponse } from '../router/types.js';
import {
  parseContradictionOutput,
  parseContradictionOutputWithRetry,
  createClarificationPrompt,
  createContradictionReport,
  createContradictionStats,
  generateReportId,
  isValidContradictionReport,
  REPORT_VERSION,
} from './report-parser.js';
import { ContradictionReportParseError } from './types.js';

/**
 * Creates a mock model router for testing.
 */
function createMockRouter(responses: string[]): {
  router: ModelRouter;
  promptMock: ReturnType<typeof vi.fn>;
} {
  let callIndex = 0;
  const promptMock = vi.fn().mockImplementation((): Promise<ModelRouterResult> => {
    // eslint-disable-next-line security/detect-object-injection -- test code with controlled mock array
    const content = responses[callIndex] ?? '';
    callIndex++;
    const response: ModelRouterResponse = {
      content,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      metadata: { modelId: 'test-model', provider: 'test', latencyMs: 100 },
    };
    return Promise.resolve({ success: true, response });
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
 * Creates a mock router that fails.
 */
function createFailingRouter(): {
  router: ModelRouter;
  promptMock: ReturnType<typeof vi.fn>;
} {
  const promptMock = vi.fn().mockResolvedValue({
    success: false,
    error: { kind: 'ModelError', message: 'Test failure', retryable: false },
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

describe('Report Parser', () => {
  describe('parseContradictionOutput', () => {
    it('parses valid JSON output', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Session timeout conflict',
            involved: [
              { elementType: 'constraint', id: 'NF001', name: 'Timeout', text: '30 minutes' },
            ],
            analysis: 'Sessions expire during long operations',
            minimalScenario: 'User starts long process, session expires',
            suggestedResolutions: ['Extend timeout', 'Add keep-alive'],
          },
        ],
        summary: 'Found 1 critical contradiction',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(true);
        expect(result.contradictions).toHaveLength(1);
        expect(result.contradictions[0]?.type).toBe('temporal');
        expect(result.contradictions[0]?.severity).toBe('critical');
        expect(result.summary).toBe('Found 1 critical contradiction');
      }
    });

    it('parses JSON from markdown code block', async () => {
      const content = `Here is my analysis:

\`\`\`json
{
  "hasContradictions": false,
  "contradictions": [],
  "summary": "No contradictions found"
}
\`\`\`

The composition appears consistent.`;

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(false);
        expect(result.contradictions).toHaveLength(0);
      }
    });

    it('extracts JSON from mixed content', async () => {
      const content = `I've analyzed the spec and found:

{"hasContradictions": true, "contradictions": [{"type": "invariant", "severity": "warning", "description": "Test", "involved": [{"elementType": "claim", "id": "C1", "name": "Test", "text": "Test"}], "analysis": "Test", "minimalScenario": "Test", "suggestedResolutions": []}], "summary": "Found issue"}

This needs attention.`;

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(true);
        expect(result.contradictions).toHaveLength(1);
      }
    });

    it('handles snake_case field names', async () => {
      const content = JSON.stringify({
        has_contradictions: true,
        contradictions: [
          {
            type: 'resource',
            severity: 'warning',
            description: 'Resource conflict',
            involved: [
              { element_type: 'contract', id: 'F1', name: 'Function', text: 'Uses 5 connections' },
            ],
            analysis: 'Resource analysis',
            minimal_scenario: 'Scenario with snake_case',
            suggested_resolutions: ['Fix it'],
          },
        ],
        summary: 'Found warning',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(true);
        expect(result.contradictions).toHaveLength(1);
        expect(result.contradictions[0]?.minimalScenario).toBe('Scenario with snake_case');
      }
    });

    it('preserves provided contradiction IDs', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            id: 'TEMPORAL_001',
            type: 'temporal',
            severity: 'critical',
            description: 'Test',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions[0]?.id).toBe('TEMPORAL_001');
      }
    });

    it('generates ID for contradictions without ID', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'invariant',
            severity: 'warning',
            description: 'Test',
            involved: [{ elementType: 'claim', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions[0]?.id).toBeDefined();
        expect(result.contradictions[0]?.id).toMatch(/^INVARIANT_/);
      }
    });

    it('filters out invalid contradiction types', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal', // Valid
            severity: 'critical',
            description: 'Valid',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
          {
            type: 'unknown_type', // Invalid
            severity: 'warning',
            description: 'Invalid',
            involved: [{ elementType: 'constraint', id: 'C2', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions).toHaveLength(1);
        expect(result.contradictions[0]?.type).toBe('temporal');
      }
    });

    it('filters out contradictions with missing required fields', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Complete',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
          {
            type: 'resource',
            severity: 'warning',
            // Missing description
            involved: [{ elementType: 'contract', id: 'C2', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
          {
            type: 'invariant',
            severity: 'critical',
            description: 'Missing analysis',
            involved: [{ elementType: 'claim', id: 'C3', name: 'T', text: 'T' }],
            // Missing analysis
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions).toHaveLength(1);
      }
    });

    it('filters out contradictions with no involved elements', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Has involved',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
          {
            type: 'resource',
            severity: 'warning',
            description: 'No involved',
            involved: [], // Empty
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions).toHaveLength(1);
      }
    });

    it('handles optional location in involved elements', async () => {
      const content = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Test',
            involved: [
              {
                elementType: 'constraint',
                id: 'C1',
                name: 'T1',
                text: 'Text1',
                location: 'spec.toml:42',
              },
              { elementType: 'contract', id: 'C2', name: 'T2', text: 'Text2' }, // No location
            ],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Test',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions[0]?.involved[0]?.location).toBe('spec.toml:42');
        expect(result.contradictions[0]?.involved[1]?.location).toBeUndefined();
      }
    });

    it('returns error for completely invalid content', async () => {
      const content = 'This is not JSON or YAML at all, just plain text with no structure.';

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ContradictionReportParseError);
        expect(result.error.errorType).toBe('parse_error');
      }
    });

    it('returns empty contradictions for empty JSON', async () => {
      const content = '{}';

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contradictions).toHaveLength(0);
        expect(result.hasContradictions).toBe(false);
      }
    });

    it('infers hasContradictions from array length', async () => {
      const content = JSON.stringify({
        // No hasContradictions flag
        contradictions: [
          {
            type: 'temporal',
            severity: 'warning',
            description: 'T',
            involved: [{ elementType: 'claim', id: 'C1', name: 'N', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Found issue',
      });

      const result = await parseContradictionOutput(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(true);
      }
    });
  });

  describe('parseContradictionOutputWithRetry', () => {
    it('returns success on first try if valid', async () => {
      const validResponse = JSON.stringify({
        hasContradictions: false,
        contradictions: [],
        summary: 'All good',
      });

      const { router, promptMock } = createMockRouter([validResponse]);
      const result = await parseContradictionOutputWithRetry(validResponse, router, 'auditor');

      expect(result.success).toBe(true);
      // Should not have called the router since first parse succeeded
      expect(promptMock).not.toHaveBeenCalled();
    });

    it('retries with clarification prompt on failure', async () => {
      const invalidContent = 'Not valid JSON';
      const validResponse = JSON.stringify({
        hasContradictions: true,
        contradictions: [
          {
            type: 'temporal',
            severity: 'critical',
            description: 'Fixed output',
            involved: [{ elementType: 'constraint', id: 'C1', name: 'T', text: 'T' }],
            analysis: 'A',
            minimalScenario: 'S',
            suggestedResolutions: [],
          },
        ],
        summary: 'Found issue',
      });

      const { router, promptMock } = createMockRouter([validResponse]);
      const warnings: string[] = [];

      const result = await parseContradictionOutputWithRetry(invalidContent, router, 'auditor', {
        maxRetries: 2,
        logger: (msg) => warnings.push(msg),
      });

      expect(result.success).toBe(true);
      expect(promptMock).toHaveBeenCalledTimes(1);
      expect(warnings.some((w) => w.includes('Parse attempt'))).toBe(true);
    });

    it('returns retry_exhausted error after max retries', async () => {
      const { router, promptMock } = createMockRouter([
        'Still invalid 1',
        'Still invalid 2',
        'Still invalid 3',
      ]);
      const warnings: string[] = [];

      const result = await parseContradictionOutputWithRetry('Invalid', router, 'auditor', {
        maxRetries: 2,
        logger: (msg) => warnings.push(msg),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('retry_exhausted');
        expect(result.error.retryAttempts).toBe(2);
      }
      expect(promptMock).toHaveBeenCalledTimes(2);
    });

    it('continues retrying even if model call fails', async () => {
      // First call fails, second succeeds
      let callCount = 0;
      const promptMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            error: { kind: 'ModelError', message: 'Temporary failure', retryable: true },
          });
        }
        return Promise.resolve({
          success: true,
          response: {
            content: JSON.stringify({
              hasContradictions: false,
              contradictions: [],
              summary: 'Clean',
            }),
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
          },
        });
      });

      const router: ModelRouter = {
        prompt: promptMock,
        complete: vi.fn(),
        stream: vi.fn(),
      };

      const warnings: string[] = [];
      const result = await parseContradictionOutputWithRetry('Invalid', router, 'auditor', {
        maxRetries: 2,
        logger: (msg) => warnings.push(msg),
      });

      expect(result.success).toBe(true);
      expect(promptMock).toHaveBeenCalledTimes(2);
      expect(warnings.some((w) => w.includes('model error'))).toBe(true);
    });
  });

  describe('createClarificationPrompt', () => {
    it('includes original content preview', () => {
      const originalContent = 'Here is my malformed output that could not be parsed...';
      const prompt = createClarificationPrompt(originalContent, 1);

      expect(prompt).toContain('previous response');
      expect(prompt).toContain(originalContent);
      expect(prompt).toContain('retry attempt 1');
    });

    it('truncates long content', () => {
      const longContent = 'x'.repeat(1000);
      const prompt = createClarificationPrompt(longContent, 2);

      expect(prompt).toContain('...');
      expect(prompt.length).toBeLessThan(longContent.length + 1000);
    });

    it('includes expected JSON format', () => {
      const prompt = createClarificationPrompt('invalid', 1);

      expect(prompt).toContain('hasContradictions');
      expect(prompt).toContain('contradictions');
      expect(prompt).toContain('elementType');
      expect(prompt).toContain('minimalScenario');
    });
  });

  describe('createContradictionStats', () => {
    it('counts contradictions by severity and type', () => {
      const contradictions = [
        {
          id: 'T1',
          type: 'temporal' as const,
          severity: 'critical' as const,
          description: 'T1',
          involved: [{ elementType: 'constraint' as const, id: 'C1', name: 'N', text: 'T' }],
          analysis: 'A',
          minimalScenario: 'S',
          suggestedResolutions: [],
        },
        {
          id: 'T2',
          type: 'temporal' as const,
          severity: 'warning' as const,
          description: 'T2',
          involved: [{ elementType: 'contract' as const, id: 'C2', name: 'N', text: 'T' }],
          analysis: 'A',
          minimalScenario: 'S',
          suggestedResolutions: [],
        },
        {
          id: 'R1',
          type: 'resource' as const,
          severity: 'critical' as const,
          description: 'R1',
          involved: [{ elementType: 'witness' as const, id: 'W1', name: 'N', text: 'T' }],
          analysis: 'A',
          minimalScenario: 'S',
          suggestedResolutions: [],
        },
      ];

      const stats = createContradictionStats(contradictions);

      expect(stats.total).toBe(3);
      expect(stats.critical).toBe(2);
      expect(stats.warning).toBe(1);
      expect(stats.byType.temporal).toBe(2);
      expect(stats.byType.resource).toBe(1);
      expect(stats.byType.invariant).toBe(0);
    });

    it('handles empty array', () => {
      const stats = createContradictionStats([]);

      expect(stats.total).toBe(0);
      expect(stats.critical).toBe(0);
      expect(stats.warning).toBe(0);
    });
  });

  describe('generateReportId', () => {
    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateReportId());
      }
      expect(ids.size).toBe(100);
    });

    it('generates IDs with AUDIT prefix', () => {
      const id = generateReportId();
      expect(id).toMatch(/^AUDIT_/);
    });
  });

  describe('createContradictionReport', () => {
    it('creates a complete report', () => {
      const contradictions = [
        {
          id: 'T1',
          type: 'temporal' as const,
          severity: 'critical' as const,
          description: 'Test',
          involved: [{ elementType: 'constraint' as const, id: 'C1', name: 'N', text: 'T' }],
          analysis: 'A',
          minimalScenario: 'S',
          suggestedResolutions: ['R1'],
        },
      ];

      const report = createContradictionReport(
        'test-project',
        contradictions,
        'Found 1 issue',
        true
      );

      expect(report.projectId).toBe('test-project');
      expect(report.version).toBe(REPORT_VERSION);
      expect(report.summary).toBe('Found 1 issue');
      expect(report.crossVerified).toBe(true);
      expect(report.stats.total).toBe(1);
      expect(report.stats.critical).toBe(1);
      expect(report.contradictions).toHaveLength(1);
      expect(report.generatedAt).toBeDefined();
      expect(report.id).toMatch(/^AUDIT_/);
    });
  });

  describe('isValidContradictionReport', () => {
    it('returns true for valid report', () => {
      const report = createContradictionReport('test', [], 'Clean', false);
      expect(isValidContradictionReport(report)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidContradictionReport(null)).toBe(false);
    });

    it('returns false for missing fields', () => {
      expect(isValidContradictionReport({ id: 'test' })).toBe(false);
      expect(isValidContradictionReport({ id: 'test', projectId: 'p' })).toBe(false);
    });

    it('returns false for invalid stats', () => {
      const report = {
        id: 'test',
        projectId: 'p',
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        summary: 'Test',
        crossVerified: false,
        stats: null,
        contradictions: [],
      };
      expect(isValidContradictionReport(report)).toBe(false);
    });
  });

  describe('Example from acceptance criteria: YAML report parsing', () => {
    it('parses TEMPORAL_001 contradiction from YAML-like output', async () => {
      // LLMs sometimes output in YAML-like format
      const yamlContent = `hasContradictions: true
contradictions:
  - type: temporal
    severity: critical
    description: Session timeout conflicts with operation duration
    involved:
      - elementType: constraint
        id: NF001
        name: Session Timeout
        text: Sessions expire after 30 minutes
      - elementType: contract
        id: processFile
        name: File Processing
        text: Operations may take up to 2 hours
    analysis: The session will expire before long operations complete
    minimalScenario: User starts processing, session expires at 30 min mark
    suggestedResolutions:
      - Extend session timeout
      - Add session keep-alive
summary: Found 1 critical temporal contradiction`;

      const result = await parseContradictionOutput(yamlContent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.hasContradictions).toBe(true);
        expect(result.contradictions).toHaveLength(1);
        expect(result.contradictions[0]?.type).toBe('temporal');
        expect(result.contradictions[0]?.severity).toBe('critical');
        expect(result.contradictions[0]?.involved).toHaveLength(2);
      }
    });
  });

  describe('Negative case: Malformed LLM output with graceful failure', () => {
    it('fails gracefully after retries exhausted', async () => {
      const { router } = createFailingRouter();
      const warnings: string[] = [];

      const result = await parseContradictionOutputWithRetry(
        'Completely unparseable garbage @#$%^&*()',
        router,
        'auditor',
        {
          maxRetries: 2,
          logger: (msg) => warnings.push(msg),
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('retry_exhausted');
        expect(result.error.retryAttempts).toBe(2);
        // Error should contain useful information
        expect(result.error.rawContent).toBeDefined();
      }
    });
  });

  describe('js-yaml fallback', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('uses default YAML parser when PARSE_WITH_JSYAML is not set', async () => {
      vi.stubEnv('PARSE_WITH_JSYAML', undefined);
      vi.resetModules();
      const freshParser = await import('./report-parser.js');
      const yamlContent = `hasContradictions: true
contradictions:
  - type: temporal
    severity: critical
    description: Test
    involved:
      - elementType: constraint
        id: C1
        name: T
        text: T
    analysis: A
    minimalScenario: S
    suggestedResolutions: []
summary: Test`;

      const result = await freshParser.parseContradictionOutput(yamlContent);

      expect(result.success).toBe(true);
    });

    it('uses js-yaml parser when PARSE_WITH_JSYAML is set to true', async () => {
      vi.stubEnv('PARSE_WITH_JSYAML', 'true');
      vi.resetModules();
      const freshParser = await import('./report-parser.js');
      await freshParser.ensureYamlLoaded();
      const yamlContent = `hasContradictions: true
contradictions:
  - type: temporal
    severity: critical
    description: Test
    involved:
      - elementType: constraint
        id: C1
        name: T
        text: T
    analysis: A
    minimalScenario: S
    suggestedResolutions: []
summary: Test`;

      const result = await freshParser.parseContradictionOutput(yamlContent);

      expect(result.success).toBe(true);
    });

    it('parses YAML from markdown code block with js-yaml', async () => {
      vi.stubEnv('PARSE_WITH_JSYAML', 'true');
      vi.resetModules();
      const freshParser = await import('./report-parser.js');
      await freshParser.ensureYamlLoaded();
      const yamlContent = `\`\`\`yaml
hasContradictions: true
contradictions:
  - type: temporal
    severity: critical
    description: Test
    involved:
      - elementType: constraint
        id: C1
        name: T
        text: T
    analysis: A
    minimalScenario: S
    suggestedResolutions: []
summary: Test
\`\`\``;

      const result = await freshParser.parseContradictionOutput(yamlContent);

      expect(result.success).toBe(true);
    });
  });
});
