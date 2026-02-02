/**
 * Tests for composition audit types.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  CONTRADICTION_TYPES,
  isValidContradictionType,
  CONTRADICTION_TYPE_DESCRIPTIONS,
  type InvolvedElement,
  type Contradiction,
  type CompositionAuditResult,
} from './types.js';

describe('Composition Audit Types', () => {
  describe('CONTRADICTION_TYPES', () => {
    it('contains all expected contradiction types', () => {
      expect(CONTRADICTION_TYPES).toContain('temporal');
      expect(CONTRADICTION_TYPES).toContain('resource');
      expect(CONTRADICTION_TYPES).toContain('invariant');
      expect(CONTRADICTION_TYPES).toContain('precondition_gap');
      expect(CONTRADICTION_TYPES).toContain('postcondition_conflict');
      expect(CONTRADICTION_TYPES).toHaveLength(5);
    });

    it('is readonly', () => {
      // TypeScript compilation should fail if we try to modify it
      // This test just verifies the array is defined correctly
      expect(Object.isFrozen(CONTRADICTION_TYPES)).toBe(true);
    });
  });

  describe('isValidContradictionType', () => {
    it('returns true for valid contradiction types', () => {
      for (const type of CONTRADICTION_TYPES) {
        expect(isValidContradictionType(type)).toBe(true);
      }
    });

    it('returns false for invalid contradiction types', () => {
      expect(isValidContradictionType('invalid')).toBe(false);
      expect(isValidContradictionType('')).toBe(false);
      expect(isValidContradictionType('TEMPORAL')).toBe(false);
      expect(isValidContradictionType('Temporal')).toBe(false);
      expect(isValidContradictionType('preconditiongap')).toBe(false);
    });
  });

  describe('CONTRADICTION_TYPE_DESCRIPTIONS', () => {
    it('has descriptions for all contradiction types', () => {
      for (const type of CONTRADICTION_TYPES) {
        // eslint-disable-next-line security/detect-object-injection -- safe: type is ContradictionType enum with known literal keys
        expect(CONTRADICTION_TYPE_DESCRIPTIONS[type]).toBeDefined();
        // eslint-disable-next-line security/detect-object-injection -- safe: type is ContradictionType enum with known literal keys
        expect(typeof CONTRADICTION_TYPE_DESCRIPTIONS[type]).toBe('string');
        // eslint-disable-next-line security/detect-object-injection -- safe: type is ContradictionType enum with known literal keys
        expect(CONTRADICTION_TYPE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Type interfaces', () => {
    it('InvolvedElement interface has correct shape', () => {
      const element: InvolvedElement = {
        elementType: 'constraint',
        id: 'FC001',
        name: 'Balance constraint',
        text: 'Balance must be non-negative',
      };

      expect(element.elementType).toBe('constraint');
      expect(element.id).toBe('FC001');
      expect(element.name).toBe('Balance constraint');
      expect(element.text).toBe('Balance must be non-negative');
    });

    it('InvolvedElement supports optional location', () => {
      const elementWithLocation: InvolvedElement = {
        elementType: 'contract',
        id: 'withdraw',
        name: 'Withdraw function',
        text: 'Ensures: balance >= 0',
        location: 'AccountService.ts:45',
      };

      expect(elementWithLocation.location).toBe('AccountService.ts:45');

      const elementWithoutLocation: InvolvedElement = {
        elementType: 'witness',
        id: 'NonNegative',
        name: 'NonNegative witness',
        text: 'value >= 0',
      };

      expect(elementWithoutLocation.location).toBeUndefined();
    });

    it('Contradiction interface has correct shape', () => {
      const contradiction: Contradiction = {
        id: 'TEMPORAL_123_abc',
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
            id: 'processLargeFile',
            name: 'Process large file',
            text: 'Operation may take up to 2 hours',
          },
        ],
        analysis: 'The session will expire before the operation completes',
        minimalScenario: 'User starts processing a large file, session expires at 30 min',
        suggestedResolutions: ['Extend session timeout', 'Add session keep-alive'],
      };

      expect(contradiction.id).toBe('TEMPORAL_123_abc');
      expect(contradiction.type).toBe('temporal');
      expect(contradiction.severity).toBe('critical');
      expect(contradiction.involved).toHaveLength(2);
      expect(contradiction.suggestedResolutions).toHaveLength(2);
    });

    it('CompositionAuditResult supports both states', () => {
      const noContradictions: CompositionAuditResult = {
        hasContradictions: false,
        contradictions: [],
        hasCriticalContradictions: false,
        summary: 'No contradictions found',
        auditedAt: new Date().toISOString(),
        crossVerified: false,
      };

      expect(noContradictions.hasContradictions).toBe(false);
      expect(noContradictions.contradictions).toHaveLength(0);

      const withContradictions: CompositionAuditResult = {
        hasContradictions: true,
        contradictions: [
          {
            id: 'INV_123',
            type: 'invariant',
            severity: 'warning',
            description: 'Test contradiction',
            involved: [
              {
                elementType: 'claim',
                id: 'claim1',
                name: 'Test claim',
                text: 'Test text',
              },
            ],
            analysis: 'Test analysis',
            minimalScenario: 'Test scenario',
            suggestedResolutions: ['Resolution'],
          },
        ],
        hasCriticalContradictions: false,
        summary: 'Found 1 warning-level contradiction',
        auditedAt: new Date().toISOString(),
        crossVerified: true,
      };

      expect(withContradictions.hasContradictions).toBe(true);
      expect(withContradictions.contradictions).toHaveLength(1);
      expect(withContradictions.crossVerified).toBe(true);
    });
  });
});
