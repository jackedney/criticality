/**
 * Tests for composition audit prompts.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  createContradictionAuditorSystemPrompt,
  createContradictionAuditorUserPrompt,
  createCrossVerificationSystemPrompt,
  createCrossVerificationUserPrompt,
  generateContradictionId,
} from './prompts.js';
import type { CompositionAuditInput, Contradiction } from './types.js';
import type { GeneratedContract } from '../lattice/contract-attacher.js';
import type { WitnessCodeResult } from '../lattice/witness-generator.js';
import type { SpecClaim } from '../spec/types.js';

describe('Composition Audit Prompts', () => {
  describe('createContradictionAuditorSystemPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = createContradictionAuditorSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('mentions all contradiction types', () => {
      const prompt = createContradictionAuditorSystemPrompt();
      expect(prompt).toContain('TEMPORAL');
      expect(prompt).toContain('RESOURCE');
      expect(prompt).toContain('INVARIANT');
      expect(prompt).toContain('PRECONDITION GAP');
      expect(prompt).toContain('POSTCONDITION CONFLICT');
    });

    it('includes JSON output format specification', () => {
      const prompt = createContradictionAuditorSystemPrompt();
      expect(prompt).toContain('JSON format');
      expect(prompt).toContain('hasContradictions');
      expect(prompt).toContain('contradictions');
      expect(prompt).toContain('severity');
      expect(prompt).toContain('minimalScenario');
    });

    it('includes example for temporal contradiction', () => {
      const prompt = createContradictionAuditorSystemPrompt();
      // The spec example: session expires 30min + operations take 2hrs + requires active session
      expect(prompt.toLowerCase()).toContain('session');
      expect(prompt.toLowerCase()).toContain('minute');
    });

    it('emphasizes detecting genuine contradictions only', () => {
      const prompt = createContradictionAuditorSystemPrompt();
      expect(prompt).toContain('GENUINE');
      expect(prompt).toContain('logical impossibilities');
    });
  });

  describe('createContradictionAuditorUserPrompt', () => {
    it('handles empty input gracefully', () => {
      const input: CompositionAuditInput = {
        constraints: {},
        contracts: [],
        witnesses: [],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('No constraints defined');
      expect(prompt).toContain('No contracts defined');
      expect(prompt).toContain('No witnesses defined');
      expect(prompt).toContain('No claims defined');
    });

    it('formats functional constraints correctly', () => {
      const input: CompositionAuditInput = {
        constraints: {
          functional: ['Balance must be non-negative', 'User must be authenticated'],
        },
        contracts: [],
        witnesses: [],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('FUNCTIONAL CONSTRAINTS');
      expect(prompt).toContain('FC001');
      expect(prompt).toContain('Balance must be non-negative');
      expect(prompt).toContain('FC002');
      expect(prompt).toContain('User must be authenticated');
    });

    it('formats non-functional constraints correctly', () => {
      const input: CompositionAuditInput = {
        constraints: {
          non_functional: ['Response time under 100ms', 'Support 1000 concurrent users'],
        },
        contracts: [],
        witnesses: [],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('NON-FUNCTIONAL CONSTRAINTS');
      expect(prompt).toContain('NF001');
      expect(prompt).toContain('Response time under 100ms');
    });

    it('formats security constraints correctly', () => {
      const input: CompositionAuditInput = {
        constraints: {
          security: ['Passwords must be hashed'],
        },
        contracts: [],
        witnesses: [],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('SECURITY CONSTRAINTS');
      expect(prompt).toContain('SC001');
      expect(prompt).toContain('Passwords must be hashed');
    });

    it('formats contracts with all fields', () => {
      const contract: GeneratedContract = {
        functionName: 'withdraw',
        interfaceName: 'AccountService',
        requires: ['amount > 0', 'balance >= amount'],
        ensures: ['balance == old(balance) - amount'],
        invariants: ['balance >= 0'],
        complexity: 'O(1)',
        purity: 'writes',
        claimRefs: ['balance_001', 'withdraw_001'],
        jsDoc: '/** JSDoc */',
      };

      const input: CompositionAuditInput = {
        constraints: {},
        contracts: [contract],
        witnesses: [],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('FUNCTION CONTRACTS');
      expect(prompt).toContain('AccountService.withdraw');
      expect(prompt).toContain('REQUIRES:');
      expect(prompt).toContain('amount > 0');
      expect(prompt).toContain('ENSURES:');
      expect(prompt).toContain('INVARIANTS:');
      expect(prompt).toContain('COMPLEXITY: O(1)');
      expect(prompt).toContain('PURITY: writes');
      expect(prompt).toContain('CLAIM_REFS: balance_001, withdraw_001');
    });

    it('formats witnesses correctly', () => {
      const witness: WitnessCodeResult = {
        name: 'NonNegativeDecimal',
        brandedType: 'type NonNegativeDecimal = ...',
        validationFactory: 'function makeNonNegativeDecimal...',
        arbitrary: 'const arbNonNegativeDecimal = ...',
        invariantAnalysis: [
          {
            invariant: {
              description: 'Value must be >= 0',
              formal: 'value >= 0',
              testable: true,
            },
            tier: 'distinction',
            isTypeEncodable: true,
            reason: 'Can be enforced via branded type',
          },
        ],
        highestTier: 'distinction',
        jsDoc: '/** JSDoc */',
        success: true,
        warnings: [],
      };

      const input: CompositionAuditInput = {
        constraints: {},
        contracts: [],
        witnesses: [witness],
        claims: {},
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('TYPE WITNESSES');
      expect(prompt).toContain('NonNegativeDecimal');
      expect(prompt).toContain('Verification Tier: distinction');
      expect(prompt).toContain('Value must be >= 0');
      expect(prompt).toContain('Formal: value >= 0');
    });

    it('formats claims with different types', () => {
      const claims: Record<string, SpecClaim> = {
        balance_001: {
          text: 'Account balance must never be negative',
          type: 'invariant',
          testable: true,
          subject: 'Account.balance',
          predicate: '>= 0',
        },
        transfer_001: {
          text: 'Transferring money debits source and credits destination',
          type: 'behavioral',
          testable: true,
          trigger: 'transfer(from, to, amount)',
          outcome: 'from.balance decreases, to.balance increases',
        },
        overdraft_001: {
          text: 'Cannot withdraw more than balance',
          type: 'negative',
          testable: true,
          action: 'withdraw(amount > balance)',
          forbidden_outcome: 'balance becomes negative',
        },
      };

      const input: CompositionAuditInput = {
        constraints: {},
        contracts: [],
        witnesses: [],
        claims,
      };

      const prompt = createContradictionAuditorUserPrompt(input);

      expect(prompt).toContain('SPEC CLAIMS');
      expect(prompt).toContain('balance_001');
      expect(prompt).toContain('invariant');
      expect(prompt).toContain('Subject: Account.balance');
      expect(prompt).toContain('Predicate: >= 0');
      expect(prompt).toContain('transfer_001');
      expect(prompt).toContain('behavioral');
      expect(prompt).toContain('Trigger:');
      expect(prompt).toContain('Outcome:');
      expect(prompt).toContain('overdraft_001');
      expect(prompt).toContain('negative');
      expect(prompt).toContain('Action:');
      expect(prompt).toContain('Forbidden:');
    });
  });

  describe('createCrossVerificationSystemPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = createCrossVerificationSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('mentions architect role', () => {
      const prompt = createCrossVerificationSystemPrompt();
      expect(prompt.toLowerCase()).toContain('architect');
    });

    it('mentions verification responsibilities', () => {
      const prompt = createCrossVerificationSystemPrompt();
      expect(prompt).toContain('VERIFY');
      expect(prompt).toContain('REFINE');
      expect(prompt).toContain('ADJUST');
      expect(prompt).toContain('false positives');
    });

    it('includes JSON output format specification', () => {
      const prompt = createCrossVerificationSystemPrompt();
      expect(prompt).toContain('JSON format');
      expect(prompt).toContain('verifications');
      expect(prompt).toContain('contradictionId');
      expect(prompt).toContain('confirmed');
      expect(prompt).toContain('adjustedSeverity');
    });
  });

  describe('createCrossVerificationUserPrompt', () => {
    it('formats contradictions for verification', () => {
      const contradictions: Contradiction[] = [
        {
          id: 'TEMPORAL_123',
          type: 'temporal',
          severity: 'critical',
          description: 'Session timeout conflicts with operation',
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
              name: 'Process file',
              text: 'May take up to 2 hours',
            },
          ],
          analysis: 'Session will expire during operation',
          minimalScenario: 'User starts processing, session expires',
          suggestedResolutions: ['Extend timeout', 'Add keep-alive'],
        },
      ];

      const input: CompositionAuditInput = {
        constraints: {
          functional: ['Test constraint'],
        },
        contracts: [],
        witnesses: [],
        claims: {},
      };

      const prompt = createCrossVerificationUserPrompt(contradictions, input);

      expect(prompt).toContain('TEMPORAL_123');
      expect(prompt).toContain('TEMPORAL');
      expect(prompt).toContain('critical');
      expect(prompt).toContain('Session timeout conflicts with operation');
      expect(prompt).toContain('NF001');
      expect(prompt).toContain('Sessions expire after 30 minutes');
      expect(prompt).toContain('Session will expire during operation');
      expect(prompt).toContain('Extend timeout');
    });

    it('includes context summary', () => {
      const contradictions: Contradiction[] = [];
      const input: CompositionAuditInput = {
        constraints: {
          functional: ['C1', 'C2', 'C3'],
          security: ['S1'],
        },
        contracts: [
          {
            functionName: 'test',
            interfaceName: 'Test',
            requires: [],
            ensures: [],
            invariants: [],
            claimRefs: [],
            jsDoc: '',
          },
        ],
        witnesses: [],
        claims: { claim1: { text: 'Test', type: 'invariant' } },
      };

      const prompt = createCrossVerificationUserPrompt(contradictions, input);

      expect(prompt).toContain('4 constraints defined');
      expect(prompt).toContain('1 function contracts defined');
      expect(prompt).toContain('0 type witnesses defined');
      expect(prompt).toContain('1 spec claims defined');
    });
  });

  describe('generateContradictionId', () => {
    it('generates unique IDs for each type', () => {
      const temporalId = generateContradictionId('temporal');
      const resourceId = generateContradictionId('resource');
      const invariantId = generateContradictionId('invariant');
      const preconditionId = generateContradictionId('precondition_gap');
      const postconditionId = generateContradictionId('postcondition_conflict');

      expect(temporalId).toMatch(/^TEMPORAL_/);
      expect(resourceId).toMatch(/^RESOURCE_/);
      expect(invariantId).toMatch(/^INVARIANT_/);
      expect(preconditionId).toMatch(/^PRECONDITIONGAP_/);
      expect(postconditionId).toMatch(/^POSTCONDITIONCONFLICT_/);

      // All should be unique
      const ids = [temporalId, resourceId, invariantId, preconditionId, postconditionId];
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it('generates unique IDs for same type called multiple times', () => {
      const id1 = generateContradictionId('temporal');
      const id2 = generateContradictionId('temporal');
      const id3 = generateContradictionId('temporal');

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('generates IDs with expected format', () => {
      const id = generateContradictionId('invariant');

      // Format: PREFIX_timestamp_random
      const parts = id.split('_');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('INVARIANT');
      // Timestamp part should be alphanumeric (base36)
      expect(parts[1]).toMatch(/^[0-9a-z]+$/);
      // Random part should be alphanumeric
      expect(parts[2]).toMatch(/^[0-9a-z]+$/);
    });
  });
});
