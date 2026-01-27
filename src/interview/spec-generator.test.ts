/**
 * Tests for the spec artifact generator.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as TOML from '@iarna/toml';
import type { InterviewState, ExtractedRequirement } from './types.js';
import type { Spec, ClaimType } from '../spec/types.js';
import {
  generateSpec,
  validateSpec,
  serializeSpec,
  saveProposal,
  loadProposal,
  listProposals,
  finalizeSpec,
  getNextProposalVersion,
  generateAndSaveProposal,
  SpecGeneratorError,
} from './spec-generator.js';
import { getInterviewDir } from './persistence.js';

/**
 * Creates a mock requirement for testing.
 */
function createMockRequirement(
  overrides: Partial<ExtractedRequirement> = {}
): ExtractedRequirement {
  return {
    id: `req_${randomUUID().substring(0, 8)}`,
    sourcePhase: 'Discovery',
    category: 'functional',
    text: 'Test requirement',
    confidence: 'high',
    extractedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock interview state for testing.
 */
function createMockInterviewState(
  projectId: string,
  requirements: ExtractedRequirement[] = []
): InterviewState {
  return {
    version: '1.0.0',
    projectId,
    currentPhase: 'Approval',
    completedPhases: ['Discovery', 'Architecture', 'Constraints', 'DesignPreferences', 'Synthesis'],
    extractedRequirements: requirements,
    delegationPoints: [],
    transcriptEntryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Spec Generator', () => {
  describe('generateSpec', () => {
    it('should generate a minimal valid spec from empty requirements', () => {
      const state = createMockInterviewState('test-project', []);
      const spec = generateSpec(state);

      expect(spec.meta.version).toBe('1.0.0');
      expect(spec.meta.created).toBeDefined();
      expect(spec.system.name).toBe('test-project');
    });

    it('should apply custom options', () => {
      const state = createMockInterviewState('test-project', []);
      const spec = generateSpec(state, {
        systemName: 'custom-system',
        systemDescription: 'A custom system',
        domain: 'fintech',
        version: '2.0.0',
        authors: ['Author One', 'Author Two'],
      });

      expect(spec.meta.version).toBe('2.0.0');
      expect(spec.meta.domain).toBe('fintech');
      expect(spec.meta.authors).toEqual(['Author One', 'Author Two']);
      expect(spec.system.name).toBe('custom-system');
      expect(spec.system.description).toBe('A custom system');
    });

    it('should convert project ID to kebab-case system name', () => {
      const state = createMockInterviewState('My Complex Project Name', []);
      const spec = generateSpec(state);

      expect(spec.system.name).toBe('my-complex-project-name');
    });

    it('should extract claims from requirements', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Account balance must always be non-negative',
          category: 'constraint',
          confidence: 'high',
        }),
        createMockRequirement({
          text: 'User can transfer funds between accounts',
          category: 'functional',
          confidence: 'medium',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      expect(spec.claims).toBeDefined();
      const claims = spec.claims ?? {};
      expect(Object.keys(claims).length).toBe(2);

      // Check claim IDs follow the pattern
      const claimIds = Object.keys(claims);
      expect(claimIds.some((id) => id.startsWith('const_'))).toBe(true);
      expect(claimIds.some((id) => id.startsWith('func_'))).toBe(true);
    });

    it('should infer invariant claim type from requirement text', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Balance must always be greater than zero',
          category: 'constraint',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('invariant');
    });

    it('should infer negative claim type from requirement text', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Users must not access other user data',
          category: 'constraint',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('negative');
    });

    it('should infer temporal claim type from requirement text', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Session expires within 30 minutes of inactivity',
          category: 'non_functional',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('temporal');
    });

    it('should infer concurrent claim type from requirement text', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'System must handle concurrent user sessions',
          category: 'non_functional',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('concurrent');
    });

    it('should infer performance claim type from requirement text', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'API response time must be under 100ms p99',
          category: 'non_functional',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('performance');
    });

    it('should default to behavioral claim type', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'User can upload profile pictures',
          category: 'functional',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.type).toBe('behavioral');
    });

    it('should mark high confidence requirements as testable', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Balance must be non-negative',
          confidence: 'high',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.testable).toBe(true);
    });

    it('should mark vague requirements without metrics as not testable', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'The system should be user-friendly',
          confidence: 'low',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      const claims = spec.claims ?? {};
      const claim = Object.values(claims)[0];
      expect(claim?.testable).toBe(false);
    });

    it('should extract external systems from requirements', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'Integration with Stripe API for payments',
        }),
        createMockRequirement({
          text: 'System connects to Redis for caching',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      expect(spec.boundaries?.external_systems).toBeDefined();
      const externalSystems = spec.boundaries?.external_systems ?? [];
      expect(externalSystems.length).toBeGreaterThan(0);
    });

    it('should extract trust boundaries from requirements', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'All user input must be validated',
        }),
        createMockRequirement({
          text: 'File uploads must be scanned for malware',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      expect(spec.boundaries?.trust_boundaries).toBeDefined();
      const trustBoundaries = spec.boundaries?.trust_boundaries ?? [];
      expect(trustBoundaries).toContain('user-input');
      expect(trustBoundaries).toContain('file-uploads');
    });

    it('should categorize security constraints', () => {
      const requirements: ExtractedRequirement[] = [
        createMockRequirement({
          text: 'User passwords must be encrypted at rest',
          category: 'constraint',
        }),
        createMockRequirement({
          text: 'Authentication required for all API endpoints',
          category: 'non_functional',
        }),
      ];

      const state = createMockInterviewState('test-project', requirements);
      const spec = generateSpec(state);

      expect(spec.constraints?.security).toBeDefined();
      const security = spec.constraints?.security ?? [];
      expect(security.length).toBe(2);
    });
  });

  describe('validateSpec', () => {
    it('should validate a minimal valid spec', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
      };

      const result = validateSpec(spec);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail on missing meta.version', () => {
      const spec = {
        meta: {
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
      } as unknown as Spec;

      const result = validateSpec(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('meta.version'))).toBe(true);
    });

    it('should fail on missing system.name', () => {
      const spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {},
      } as unknown as Spec;

      const result = validateSpec(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('system.name'))).toBe(true);
    });

    it('should fail on invalid system name format', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'Invalid Name With Spaces',
        },
      };

      const result = validateSpec(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('kebab-case'))).toBe(true);
    });

    it('should warn on missing claims', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
      };

      const result = validateSpec(spec);

      expect(result.warnings.some((w) => w.includes('no claims'))).toBe(true);
    });

    it('should warn on non-testable claims', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
        claims: {
          test_001: {
            text: 'A test claim',
            type: 'behavioral',
            testable: false,
          },
        },
      };

      const result = validateSpec(spec);

      expect(result.warnings.some((w) => w.includes('not testable'))).toBe(true);
    });

    it('should fail on claim missing text', () => {
      const spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
        claims: {
          test_001: {
            type: 'behavioral',
          },
        },
      } as unknown as Spec;

      const result = validateSpec(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('text'))).toBe(true);
    });
  });

  describe('serializeSpec', () => {
    it('should serialize a minimal spec to valid TOML', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: '2024-01-24T12:00:00Z',
        },
        system: {
          name: 'test-system',
        },
      };

      const toml = serializeSpec(spec);

      // Parse the output to verify it's valid TOML
      const parsed = TOML.parse(toml) as Record<string, unknown>;
      expect(parsed.meta).toBeDefined();
      expect((parsed.meta as Record<string, unknown>).version).toBe('1.0.0');
      expect(parsed.system).toBeDefined();
      expect((parsed.system as Record<string, unknown>).name).toBe('test-system');
    });

    it('should serialize all spec sections', () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: '2024-01-24T12:00:00Z',
          domain: 'fintech',
          authors: ['Test Author'],
        },
        system: {
          name: 'payment-system',
          description: 'A payment processing system',
        },
        boundaries: {
          external_systems: ['stripe', 'paypal'],
          trust_boundaries: ['user-input'],
        },
        constraints: {
          functional: ['Balance never negative'],
          non_functional: ['Response time < 100ms'],
          security: ['Encrypt PII'],
        },
        claims: {
          balance_001: {
            text: 'Balance is always non-negative',
            type: 'invariant',
            testable: true,
          },
        },
      };

      const toml = serializeSpec(spec);
      const parsed = TOML.parse(toml) as Record<string, unknown>;

      expect(parsed.meta).toBeDefined();
      expect(parsed.system).toBeDefined();
      expect(parsed.boundaries).toBeDefined();
      expect(parsed.constraints).toBeDefined();
      expect(parsed.claims).toBeDefined();
    });

    it('should produce TOML that can be parsed back to equivalent spec', () => {
      const original: Spec = {
        meta: {
          version: '1.0.0',
          created: '2024-01-24T12:00:00Z',
        },
        system: {
          name: 'test-system',
          description: 'Test description',
        },
        claims: {
          test_001: {
            text: 'Test claim',
            type: 'behavioral',
            testable: true,
          },
        },
      };

      const toml = serializeSpec(original);
      const parsed = TOML.parse(toml) as unknown as Spec;

      expect(parsed.meta.version).toBe(original.meta.version);
      expect(parsed.system.name).toBe(original.system.name);
      const parsedClaim = parsed.claims?.test_001;
      const originalClaim = original.claims?.test_001;
      expect(parsedClaim?.text).toBe(originalClaim?.text);
    });
  });

  describe('Proposal Management', () => {
    let testProjectId: string;
    let testDir: string;

    beforeEach(async () => {
      testProjectId = `test-${randomUUID().substring(0, 8)}`;
      testDir = getInterviewDir(testProjectId);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('getNextProposalVersion', () => {
      it('should return 1 for empty proposals directory', async () => {
        const version = await getNextProposalVersion(testProjectId);
        expect(version).toBe(1);
      });

      it('should return 1 for non-existent proposals directory', async () => {
        const version = await getNextProposalVersion('non-existent-project');
        expect(version).toBe(1);
      });

      it('should return incremented version after saving proposals', async () => {
        const state = createMockInterviewState(testProjectId, [
          createMockRequirement({ text: 'Test requirement' }),
        ]);

        await generateAndSaveProposal(state);
        const nextVersion = await getNextProposalVersion(testProjectId);

        expect(nextVersion).toBe(2);
      });
    });

    describe('saveProposal', () => {
      it('should save a valid spec as a proposal', async () => {
        const spec: Spec = {
          meta: {
            version: '1.0.0',
            created: new Date().toISOString(),
          },
          system: {
            name: 'test-system',
          },
        };

        const result = await saveProposal(spec, testProjectId);

        expect(result.version).toBe(1);
        expect(result.path).toContain('v1.toml');
        expect(result.spec).toEqual(spec);

        // Verify file exists and is valid TOML
        const content = await readFile(result.path, 'utf-8');
        const parsed = TOML.parse(content);
        expect(parsed.meta).toBeDefined();
      });

      it('should increment version for subsequent proposals', async () => {
        const spec: Spec = {
          meta: {
            version: '1.0.0',
            created: new Date().toISOString(),
          },
          system: {
            name: 'test-system',
          },
        };

        const result1 = await saveProposal(spec, testProjectId);
        const result2 = await saveProposal(spec, testProjectId);

        expect(result1.version).toBe(1);
        expect(result2.version).toBe(2);
      });

      it('should throw on invalid spec', async () => {
        const invalidSpec = {
          meta: {},
          system: {},
        } as unknown as Spec;

        await expect(saveProposal(invalidSpec, testProjectId)).rejects.toThrow(SpecGeneratorError);
      });
    });

    describe('loadProposal', () => {
      it('should load a saved proposal', async () => {
        const spec: Spec = {
          meta: {
            version: '1.0.0',
            created: new Date().toISOString(),
          },
          system: {
            name: 'test-system',
          },
        };

        await saveProposal(spec, testProjectId);
        const content = await loadProposal(testProjectId, 1);

        expect(content).toContain('version = "1.0.0"');
        expect(content).toContain('name = "test-system"');
      });

      it('should throw on non-existent proposal', async () => {
        await expect(loadProposal(testProjectId, 999)).rejects.toThrow(SpecGeneratorError);
      });
    });

    describe('listProposals', () => {
      it('should return empty array for no proposals', async () => {
        const proposals = await listProposals(testProjectId);
        expect(proposals).toEqual([]);
      });

      it('should list all proposal versions in order', async () => {
        const spec: Spec = {
          meta: {
            version: '1.0.0',
            created: new Date().toISOString(),
          },
          system: {
            name: 'test-system',
          },
        };

        await saveProposal(spec, testProjectId);
        await saveProposal(spec, testProjectId);
        await saveProposal(spec, testProjectId);

        const proposals = await listProposals(testProjectId);

        expect(proposals).toEqual([1, 2, 3]);
      });
    });

    describe('generateAndSaveProposal', () => {
      it('should generate and save a proposal from interview state', async () => {
        const requirements: ExtractedRequirement[] = [
          createMockRequirement({
            text: 'Balance must always be non-negative',
            category: 'constraint',
          }),
        ];

        const state = createMockInterviewState(testProjectId, requirements);
        const result = await generateAndSaveProposal(state, {
          systemName: 'payment-system',
          domain: 'fintech',
        });

        expect(result.version).toBe(1);
        expect(result.spec.system.name).toBe('payment-system');
        expect(result.spec.meta.domain).toBe('fintech');
        expect(result.spec.claims).toBeDefined();
      });
    });
  });

  describe('finalizeSpec', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `criticality-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should write spec.toml to project root', async () => {
      const spec: Spec = {
        meta: {
          version: '1.0.0',
          created: new Date().toISOString(),
        },
        system: {
          name: 'test-system',
        },
      };

      const result = await finalizeSpec(spec, testDir);

      expect(result.path).toBe(join(testDir, 'spec.toml'));

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('name = "test-system"');
    });

    it('should throw on invalid spec', async () => {
      const invalidSpec = {
        meta: {},
        system: {},
      } as unknown as Spec;

      await expect(finalizeSpec(invalidSpec, testDir)).rejects.toThrow(SpecGeneratorError);
    });
  });

  describe('Claim Type Inference', () => {
    const testCases: { text: string; expectedType: ClaimType; description: string }[] = [
      {
        text: 'Balance must always be positive',
        expectedType: 'invariant',
        description: 'always keyword',
      },
      {
        text: 'Account balance never goes negative',
        expectedType: 'invariant',
        description: 'never keyword',
      },
      {
        text: 'Users must not access other accounts',
        expectedType: 'negative',
        description: 'must not keyword',
      },
      {
        text: 'Direct database access is forbidden',
        expectedType: 'negative',
        description: 'forbidden keyword',
      },
      {
        text: 'Session timeout after 30 minutes',
        expectedType: 'temporal',
        description: 'timeout keyword',
      },
      {
        text: 'Data must be synced within 5 seconds',
        expectedType: 'temporal',
        description: 'within keyword',
      },
      {
        text: 'Support concurrent user sessions',
        expectedType: 'concurrent',
        description: 'concurrent keyword',
      },
      {
        text: 'Handle parallel request processing',
        expectedType: 'concurrent',
        description: 'parallel keyword',
      },
      {
        text: 'Response latency under 100ms',
        expectedType: 'performance',
        description: 'latency keyword',
      },
      {
        text: 'System throughput of 10000 TPS',
        expectedType: 'performance',
        description: 'TPS keyword',
      },
      {
        text: 'User can create a new account',
        expectedType: 'behavioral',
        description: 'default behavioral',
      },
    ];

    for (const { text, expectedType, description } of testCases) {
      it(`should infer ${expectedType} from "${description}"`, () => {
        const requirements: ExtractedRequirement[] = [createMockRequirement({ text })];

        const state = createMockInterviewState('test-project', requirements);
        const spec = generateSpec(state);

        const claims = spec.claims ?? {};
        const claim = Object.values(claims)[0];
        expect(claim?.type).toBe(expectedType);
      });
    }
  });
});
