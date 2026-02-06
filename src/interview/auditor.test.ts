/**
 * Tests for the adversarial auditor module.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type { ModelRouter, ModelRouterResult, ModelRouterResponse } from '../router/types.js';
import type { ExtractedRequirement } from './types.js';
import {
  auditRequirements,
  getArchitectResponses,
  combineFindings,
  performAdversarialAudit,
  formatFinding,
  formatAuditResult,
  createEmptyAuditResult,
  requiresUserDecision,
  getCriticalFindings,
  isValidAuditorIssueType,
  AUDITOR_ISSUE_TYPES,
  ISSUE_TYPE_DESCRIPTIONS,
  type AuditorIssue,
  type AuditorFinding,
  type AuditorResult,
  type ArchitectResponse,
  type AuditorOptions,
} from './auditor.js';

/**
 * Creates a mock model router for testing.
 * Returns both the router and the mock function for easy testing.
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
 * Creates a test requirement.
 */
function createTestRequirement(
  id: string,
  text: string,
  category: ExtractedRequirement['category'] = 'functional'
): ExtractedRequirement {
  return {
    id,
    sourcePhase: 'Discovery',
    category,
    text,
    confidence: 'high',
    extractedAt: new Date().toISOString(),
  };
}

describe('Auditor', () => {
  describe('isValidAuditorIssueType', () => {
    it('returns true for valid issue types', () => {
      for (const type of AUDITOR_ISSUE_TYPES) {
        expect(isValidAuditorIssueType(type)).toBe(true);
      }
    });

    it('returns false for invalid issue types', () => {
      expect(isValidAuditorIssueType('invalid')).toBe(false);
      expect(isValidAuditorIssueType('')).toBe(false);
      expect(isValidAuditorIssueType('TEMPORAL_CONTRADICTION')).toBe(false);
    });
  });

  describe('ISSUE_TYPE_DESCRIPTIONS', () => {
    it('has descriptions for all issue types', () => {
      for (const type of AUDITOR_ISSUE_TYPES) {
        // eslint-disable-next-line security/detect-object-injection -- safe: type is AuditorIssueType enum with known literal keys
        expect(ISSUE_TYPE_DESCRIPTIONS[type]).toBeDefined();
        // eslint-disable-next-line security/detect-object-injection -- safe: type is AuditorIssueType enum with known literal keys
        expect(typeof ISSUE_TYPE_DESCRIPTIONS[type]).toBe('string');
        // eslint-disable-next-line security/detect-object-injection -- safe: type is AuditorIssueType enum with known literal keys
        expect(ISSUE_TYPE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
      }
    });
  });

  describe('auditRequirements', () => {
    it('returns no issues for empty requirements', async () => {
      const { router } = createMockRouter('{}');
      const options: AuditorOptions = { modelRouter: router };

      const result = await auditRequirements([], options);

      expect(result.hasIssues).toBe(false);
      expect(result.issues).toHaveLength(0);
      expect(result.hasCriticalIssues).toBe(false);
      expect(result.summary).toBe('No requirements to audit.');
    });

    it('calls auditor model with correct prompt', async () => {
      const { router, promptMock } = createMockRouter(
        JSON.stringify({
          hasIssues: false,
          issues: [],
          summary: 'No issues found',
        })
      );
      const options: AuditorOptions = { modelRouter: router };
      const requirements = [createTestRequirement('req1', 'User must be able to login')];

      await auditRequirements(requirements, options);

      expect(promptMock).toHaveBeenCalledTimes(1);
      const [modelAlias, prompt] = promptMock.mock.calls[0] as [string, string];
      expect(modelAlias).toBe('auditor');
      expect(prompt).toContain('adversarial auditor');
      expect(prompt).toContain('req1');
      expect(prompt).toContain('User must be able to login');
    });

    it('parses temporal contradiction issues', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: true,
          issues: [
            {
              type: 'temporal_contradiction',
              severity: 'critical',
              description: 'Session timeout conflicts with operation duration',
              involvedRequirementIds: ['req1', 'req2'],
              analysis: 'Sessions expire in 30 minutes but operations take 2 hours',
              exampleScenario: 'User starts long upload, session expires before completion',
              suggestedResolutions: ['Extend session timeout', 'Add session refresh mechanism'],
            },
          ],
          summary: 'Found 1 temporal contradiction',
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [
        createTestRequirement('req1', 'Sessions expire after 30 minutes'),
        createTestRequirement('req2', 'File uploads can take up to 2 hours'),
      ];

      const result = await auditRequirements(requirements, options);

      expect(result.hasIssues).toBe(true);
      expect(result.issues).toHaveLength(1);
      expect(result.hasCriticalIssues).toBe(true);

      const issue = result.issues[0];
      expect(issue).toBeDefined();
      expect(issue?.type).toBe('temporal_contradiction');
      expect(issue?.severity).toBe('critical');
      expect(issue?.description).toBe('Session timeout conflicts with operation duration');
      expect(issue?.involvedRequirementIds).toEqual(['req1', 'req2']);
      expect(issue?.exampleScenario).toBe(
        'User starts long upload, session expires before completion'
      );
      expect(issue?.suggestedResolutions).toHaveLength(2);
    });

    it('parses resource conflict issues', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: true,
          issues: [
            {
              type: 'resource_conflict',
              severity: 'warning',
              description: 'Database connection pool insufficient',
              involvedRequirementIds: ['req1', 'req2'],
              analysis: 'Connection pool size conflicts with concurrent user count',
              suggestedResolutions: ['Increase pool size', 'Reduce connections per user'],
            },
          ],
          summary: 'Found 1 resource conflict',
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Support 1000 concurrent users')];

      const result = await auditRequirements(requirements, options);

      expect(result.hasIssues).toBe(true);
      expect(result.hasCriticalIssues).toBe(false);

      const issue = result.issues[0];
      expect(issue?.type).toBe('resource_conflict');
      expect(issue?.severity).toBe('warning');
    });

    it('parses invariant violation issues', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: true,
          issues: [
            {
              type: 'invariant_violation',
              severity: 'critical',
              description: 'Balance invariant conflicts with overdraft',
              involvedRequirementIds: ['req1', 'req2'],
              analysis: 'Non-negative balance conflicts with overdraft allowance',
              suggestedResolutions: ['Clarify overdraft rules'],
            },
          ],
          summary: 'Found 1 invariant violation',
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Balance must be non-negative')];

      const result = await auditRequirements(requirements, options);

      const issue = result.issues[0];
      expect(issue?.type).toBe('invariant_violation');
    });

    it('parses precondition gap issues', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: true,
          issues: [
            {
              type: 'precondition_gap',
              severity: 'info',
              description: 'Missing authentication requirement',
              involvedRequirementIds: ['req1'],
              analysis: 'Dashboard access assumes authentication but none specified',
              suggestedResolutions: ['Add authentication requirement'],
            },
          ],
          summary: 'Found 1 precondition gap',
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'User can view dashboard')];

      const result = await auditRequirements(requirements, options);

      const issue = result.issues[0];
      expect(issue?.type).toBe('precondition_gap');
      expect(issue?.severity).toBe('info');
    });

    it('handles model error gracefully', async () => {
      const mockRouter = createErrorRouter();
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Test requirement')];

      const result = await auditRequirements(requirements, options);

      expect(result.hasIssues).toBe(false);
      expect(result.issues).toHaveLength(0);
      expect(result.summary).toContain('failed');
    });

    it('handles malformed JSON response gracefully', async () => {
      const mockRouter = createMockRouter('This is not JSON');
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Test requirement')];

      const result = await auditRequirements(requirements, options);

      expect(result.hasIssues).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    it('extracts JSON from markdown code blocks', async () => {
      const mockRouter = createMockRouter(`
Here is the analysis:
\`\`\`json
{
  "hasIssues": true,
  "issues": [
    {
      "type": "temporal_contradiction",
      "severity": "warning",
      "description": "Test issue",
      "involvedRequirementIds": ["req1"],
      "analysis": "Test analysis",
      "suggestedResolutions": ["Fix it"]
    }
  ],
  "summary": "Found issues"
}
\`\`\`
      `);
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Test requirement')];

      const result = await auditRequirements(requirements, options);

      expect(result.hasIssues).toBe(true);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('getArchitectResponses', () => {
    it('returns empty array for no issues', async () => {
      const mockRouter = createMockRouter('{}');
      const options: AuditorOptions = { modelRouter: mockRouter.router };

      const responses = await getArchitectResponses([], [], options);

      expect(responses).toHaveLength(0);
      expect(mockRouter.promptMock).not.toHaveBeenCalled();
    });

    it('calls architect model with issues', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          responses: [
            {
              issueId: 'issue1',
              accepted: true,
              explanation: 'Good catch, this is a real issue',
              proposedResolution: 'Extend session timeout to 3 hours',
            },
          ],
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const issues: AuditorIssue[] = [
        {
          id: 'issue1',
          type: 'temporal_contradiction',
          severity: 'critical',
          description: 'Test issue',
          involvedRequirementIds: ['req1'],
          analysis: 'Test analysis',
          suggestedResolutions: ['Fix it'],
        },
      ];
      const requirements = [createTestRequirement('req1', 'Test')];

      const responses = await getArchitectResponses(issues, requirements, options);

      expect(mockRouter.promptMock).toHaveBeenCalledTimes(1);
      const [modelAlias] = mockRouter.promptMock.mock.calls[0] as [string, string];
      expect(modelAlias).toBe('architect');
      expect(responses).toHaveLength(1);
      expect(responses[0]?.issueId).toBe('issue1');
      expect(responses[0]?.accepted).toBe(true);
      expect(responses[0]?.proposedResolution).toBe('Extend session timeout to 3 hours');
    });

    it('parses disputed responses', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          responses: [
            {
              issueId: 'issue1',
              accepted: false,
              explanation: 'This is not actually a problem because...',
            },
          ],
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const issues: AuditorIssue[] = [
        {
          id: 'issue1',
          type: 'temporal_contradiction',
          severity: 'warning',
          description: 'Test issue',
          involvedRequirementIds: [],
          analysis: 'Test',
          suggestedResolutions: [],
        },
      ];

      const responses = await getArchitectResponses(issues, [], options);

      expect(responses[0]?.accepted).toBe(false);
      expect(responses[0]?.proposedResolution).toBeUndefined();
    });
  });

  describe('combineFindings', () => {
    it('combines issues with architect responses', () => {
      const issues: AuditorIssue[] = [
        {
          id: 'issue1',
          type: 'temporal_contradiction',
          severity: 'critical',
          description: 'Test',
          involvedRequirementIds: [],
          analysis: 'Test',
          suggestedResolutions: [],
        },
      ];
      const responses: ArchitectResponse[] = [
        {
          issueId: 'issue1',
          accepted: true,
          explanation: 'Accepted',
          proposedResolution: 'Fix it',
        },
      ];

      const findings = combineFindings(issues, responses);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.issue.id).toBe('issue1');
      expect(findings[0]?.architectResponse?.accepted).toBe(true);
      expect(findings[0]?.status).toBe('resolved');
    });

    it('marks disputed findings as needing user decision', () => {
      const issues: AuditorIssue[] = [
        {
          id: 'issue1',
          type: 'resource_conflict',
          severity: 'warning',
          description: 'Test',
          involvedRequirementIds: [],
          analysis: 'Test',
          suggestedResolutions: [],
        },
      ];
      const responses: ArchitectResponse[] = [
        {
          issueId: 'issue1',
          accepted: false,
          explanation: 'Not a real issue',
        },
      ];

      const findings = combineFindings(issues, responses);

      expect(findings[0]?.status).toBe('user_decision_required');
    });

    it('marks issues without responses as pending', () => {
      const issues: AuditorIssue[] = [
        {
          id: 'issue1',
          type: 'invariant_violation',
          severity: 'critical',
          description: 'Test',
          involvedRequirementIds: [],
          analysis: 'Test',
          suggestedResolutions: [],
        },
      ];

      const findings = combineFindings(issues, []);

      expect(findings[0]?.status).toBe('pending');
      expect(findings[0]?.architectResponse).toBeUndefined();
    });
  });

  describe('performAdversarialAudit', () => {
    it('returns empty findings when no issues found', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: false,
          issues: [],
          summary: 'All good',
        })
      );
      const options: AuditorOptions = { modelRouter: mockRouter.router };
      const requirements = [createTestRequirement('req1', 'Test')];

      const { result, findings } = await performAdversarialAudit(requirements, options);

      expect(result.hasIssues).toBe(false);
      expect(findings).toHaveLength(0);
      // Should not call architect if no issues
      expect(mockRouter.promptMock).toHaveBeenCalledTimes(1);
    });

    it('includes architect responses by default', async () => {
      // First call returns auditor issues
      const auditorResponse = JSON.stringify({
        hasIssues: true,
        issues: [
          {
            type: 'temporal_contradiction',
            severity: 'critical',
            description: 'Issue',
            involvedRequirementIds: ['req1'],
            analysis: 'Analysis',
            suggestedResolutions: ['Fix'],
          },
        ],
        summary: 'Found issues',
      });

      // Second call returns architect response
      const architectResponse = JSON.stringify({
        responses: [
          {
            issueId: 'TC_mock',
            accepted: true,
            explanation: 'Accepted',
            proposedResolution: 'Will fix',
          },
        ],
      });

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
          success: true,
          response: {
            content: architectResponse,
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
          },
        });

      const mockRouter: ModelRouter = {
        prompt: promptMock,
        complete: vi.fn(),
        stream: vi.fn(),
      };
      const options: AuditorOptions = { modelRouter: mockRouter };
      const requirements = [createTestRequirement('req1', 'Test')];

      const { result, findings } = await performAdversarialAudit(requirements, options);

      expect(result.hasIssues).toBe(true);
      expect(findings).toHaveLength(1);
      expect(promptMock).toHaveBeenCalledTimes(2);
    });

    it('skips architect when option is false', async () => {
      const mockRouter = createMockRouter(
        JSON.stringify({
          hasIssues: true,
          issues: [
            {
              type: 'temporal_contradiction',
              severity: 'warning',
              description: 'Issue',
              involvedRequirementIds: [],
              analysis: 'Analysis',
              suggestedResolutions: [],
            },
          ],
          summary: 'Found issues',
        })
      );
      const options: AuditorOptions = {
        modelRouter: mockRouter.router,
        includeArchitectResponse: false,
      };
      const requirements = [createTestRequirement('req1', 'Test')];

      const { findings } = await performAdversarialAudit(requirements, options);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.status).toBe('pending');
      expect(mockRouter.promptMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatFinding', () => {
    it('formats critical finding correctly', () => {
      const finding: AuditorFinding = {
        issue: {
          id: 'TC_123',
          type: 'temporal_contradiction',
          severity: 'critical',
          description: 'Session timeout issue',
          involvedRequirementIds: ['req1', 'req2'],
          analysis: 'Sessions expire before operations complete',
          exampleScenario: 'User upload expires mid-way',
          suggestedResolutions: ['Extend timeout', 'Add refresh'],
        },
        status: 'pending',
      };

      const formatted = formatFinding(finding);

      expect(formatted).toContain('🔴');
      expect(formatted).toContain('TEMPORAL CONTRADICTION');
      expect(formatted).toContain('Session timeout issue');
      expect(formatted).toContain('Sessions expire before operations complete');
      expect(formatted).toContain('User upload expires mid-way');
      expect(formatted).toContain('Extend timeout');
      expect(formatted).toContain('Pending');
    });

    it('formats warning finding correctly', () => {
      const finding: AuditorFinding = {
        issue: {
          id: 'RC_123',
          type: 'resource_conflict',
          severity: 'warning',
          description: 'Resource issue',
          involvedRequirementIds: [],
          analysis: 'Analysis',
          suggestedResolutions: [],
        },
        status: 'pending',
      };

      const formatted = formatFinding(finding);

      expect(formatted).toContain('🟡');
      expect(formatted).toContain('RESOURCE CONFLICT');
    });

    it('formats finding with architect response', () => {
      const finding: AuditorFinding = {
        issue: {
          id: 'IV_123',
          type: 'invariant_violation',
          severity: 'critical',
          description: 'Balance issue',
          involvedRequirementIds: [],
          analysis: 'Analysis',
          suggestedResolutions: [],
        },
        architectResponse: {
          issueId: 'IV_123',
          accepted: true,
          explanation: 'This is indeed a problem',
          proposedResolution: 'Add overdraft flag',
        },
        status: 'resolved',
      };

      const formatted = formatFinding(finding);

      expect(formatted).toContain('Architect response');
      expect(formatted).toContain('✓ Accepted');
      expect(formatted).toContain('This is indeed a problem');
      expect(formatted).toContain('Add overdraft flag');
      expect(formatted).toContain('✓ Resolved');
    });
  });

  describe('formatAuditResult', () => {
    it('formats result with no issues', () => {
      const result: AuditorResult = {
        hasIssues: false,
        issues: [],
        hasCriticalIssues: false,
        summary: 'No issues',
        analyzedAt: new Date().toISOString(),
      };

      const formatted = formatAuditResult(result, []);

      expect(formatted).toContain('ADVERSARIAL AUDIT RESULTS');
      expect(formatted).toContain('✅ No issues detected');
      expect(formatted).toContain('Proceeding with specification');
    });

    it('formats result with issues', () => {
      const result: AuditorResult = {
        hasIssues: true,
        issues: [
          {
            id: 'TC_1',
            type: 'temporal_contradiction',
            severity: 'critical',
            description: 'Issue 1',
            involvedRequirementIds: [],
            analysis: 'Analysis 1',
            suggestedResolutions: [],
          },
          {
            id: 'RC_1',
            type: 'resource_conflict',
            severity: 'warning',
            description: 'Issue 2',
            involvedRequirementIds: [],
            analysis: 'Analysis 2',
            suggestedResolutions: [],
          },
        ],
        hasCriticalIssues: true,
        summary: 'Found 2 issues',
        analyzedAt: new Date().toISOString(),
      };
      const findings: AuditorFinding[] = result.issues.map((issue) => ({
        issue,
        status: 'pending',
      }));

      const formatted = formatAuditResult(result, findings);

      expect(formatted).toContain('Found 2 issue(s)');
      expect(formatted).toContain('Critical: 1');
      expect(formatted).toContain('Warning: 1');
      expect(formatted).toContain('Issue 1 of 2');
      expect(formatted).toContain('Issue 2 of 2');
    });
  });

  describe('createEmptyAuditResult', () => {
    it('creates result with provided reason', () => {
      const result = createEmptyAuditResult('Testing skipped');

      expect(result.hasIssues).toBe(false);
      expect(result.issues).toHaveLength(0);
      expect(result.hasCriticalIssues).toBe(false);
      expect(result.summary).toBe('Testing skipped');
      expect(result.analyzedAt).toBeDefined();
    });
  });

  describe('requiresUserDecision', () => {
    it('returns true when any finding needs decision', () => {
      const findings: AuditorFinding[] = [
        {
          issue: {
            id: 'test',
            type: 'temporal_contradiction',
            severity: 'critical',
            description: 'Test',
            involvedRequirementIds: [],
            analysis: 'Test',
            suggestedResolutions: [],
          },
          status: 'user_decision_required',
        },
      ];

      expect(requiresUserDecision(findings)).toBe(true);
    });

    it('returns true when findings are pending', () => {
      const findings: AuditorFinding[] = [
        {
          issue: {
            id: 'test',
            type: 'resource_conflict',
            severity: 'warning',
            description: 'Test',
            involvedRequirementIds: [],
            analysis: 'Test',
            suggestedResolutions: [],
          },
          status: 'pending',
        },
      ];

      expect(requiresUserDecision(findings)).toBe(true);
    });

    it('returns false when all findings are resolved', () => {
      const findings: AuditorFinding[] = [
        {
          issue: {
            id: 'test',
            type: 'invariant_violation',
            severity: 'info',
            description: 'Test',
            involvedRequirementIds: [],
            analysis: 'Test',
            suggestedResolutions: [],
          },
          status: 'resolved',
        },
      ];

      expect(requiresUserDecision(findings)).toBe(false);
    });
  });

  describe('getCriticalFindings', () => {
    it('returns only critical severity findings', () => {
      const findings: AuditorFinding[] = [
        {
          issue: {
            id: 'crit1',
            type: 'temporal_contradiction',
            severity: 'critical',
            description: 'Critical',
            involvedRequirementIds: [],
            analysis: 'Analysis',
            suggestedResolutions: [],
          },
          status: 'pending',
        },
        {
          issue: {
            id: 'warn1',
            type: 'resource_conflict',
            severity: 'warning',
            description: 'Warning',
            involvedRequirementIds: [],
            analysis: 'Analysis',
            suggestedResolutions: [],
          },
          status: 'pending',
        },
        {
          issue: {
            id: 'crit2',
            type: 'invariant_violation',
            severity: 'critical',
            description: 'Critical 2',
            involvedRequirementIds: [],
            analysis: 'Analysis',
            suggestedResolutions: [],
          },
          status: 'pending',
        },
      ];

      const critical = getCriticalFindings(findings);

      expect(critical).toHaveLength(2);
      expect(critical.every((f) => f.issue.severity === 'critical')).toBe(true);
    });
  });

  describe('property-based tests', () => {
    it('createEmptyAuditResult always returns consistent structure', () => {
      fc.assert(
        fc.property(fc.string(), (reason: string) => {
          const result = createEmptyAuditResult(reason);
          return (
            !result.hasIssues &&
            result.issues.length === 0 &&
            !result.hasCriticalIssues &&
            result.summary === reason &&
            typeof result.analyzedAt === 'string'
          );
        })
      );
    });

    it('combineFindings preserves all issues', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1 }),
              type: fc.constantFrom(...AUDITOR_ISSUE_TYPES),
              severity: fc.constantFrom('critical', 'warning', 'info'),
              description: fc.string(),
              involvedRequirementIds: fc.array(fc.string()),
              analysis: fc.string(),
              suggestedResolutions: fc.array(fc.string()),
            })
          ),
          (issues: AuditorIssue[]) => {
            const findings = combineFindings(issues, []);
            return findings.length === issues.length;
          }
        )
      );
    });
  });
});
