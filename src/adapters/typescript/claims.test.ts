/**
 * Tests for the claim parser module.
 *
 * @module adapters/typescript/claims.test
 */

import { describe, expect, it, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseClaims,
  linkClaimsToFunctions,
  ClaimParseError,
  type Claim,
  DEFAULT_CLAIM_TYPE,
} from './claims.js';

const FIXTURES_DIR = path.resolve(__dirname, '../../../test-fixtures/claims');

describe('Claim Parser', () => {
  describe('parseClaims', () => {
    describe('valid spec files', () => {
      it('should parse claims from a valid spec.toml', () => {
        const specPath = path.join(FIXTURES_DIR, 'valid-spec.toml');
        const claims = parseClaims(specPath);

        expect(claims.length).toBe(6);

        // Check invariant claim
        const invClaim = claims.find((c) => c.id === 'inv_001');
        expect(invClaim).toBeDefined();
        expect(invClaim?.type).toBe('invariant');
        expect(invClaim?.description).toBe('Account balance is never negative');
        expect(invClaim?.functions).toEqual([]);

        // Check behavioral claim
        const behClaim = claims.find((c) => c.id === 'beh_001');
        expect(behClaim).toBeDefined();
        expect(behClaim?.type).toBe('behavioral');
        expect(behClaim?.description).toBe(
          'Transferring funds between accounts updates both balances correctly'
        );

        // Check negative claim
        const negClaim = claims.find((c) => c.id === 'neg_001');
        expect(negClaim).toBeDefined();
        expect(negClaim?.type).toBe('negative');

        // Check temporal claim
        const tempClaim = claims.find((c) => c.id === 'temp_001');
        expect(tempClaim).toBeDefined();
        expect(tempClaim?.type).toBe('temporal');

        // Check performance claim
        const perfClaim = claims.find((c) => c.id === 'perf_001');
        expect(perfClaim).toBeDefined();
        expect(perfClaim?.type).toBe('performance');
        expect(perfClaim?.description).toBe('Account lookup is O(1)');

        // Check concurrent claim
        const concClaim = claims.find((c) => c.id === 'conc_001');
        expect(concClaim).toBeDefined();
        expect(concClaim?.type).toBe('concurrent');
      });

      it('should return empty array when spec has no claims section', () => {
        const specPath = path.join(FIXTURES_DIR, 'no-claims-spec.toml');
        const claims = parseClaims(specPath);

        expect(claims).toEqual([]);
      });

      it('should default claim type to behavioral when not specified', () => {
        const specPath = path.join(FIXTURES_DIR, 'no-type-spec.toml');
        const claims = parseClaims(specPath);

        expect(claims.length).toBe(2);

        // Claim without type should default to behavioral
        const noTypeClaim = claims.find((c) => c.id === 'claim_no_type');
        expect(noTypeClaim).toBeDefined();
        expect(noTypeClaim?.type).toBe('behavioral');
        expect(noTypeClaim?.description).toBe('This claim has no type specified');

        // Claim with type should use specified type
        const withTypeClaim = claims.find((c) => c.id === 'claim_with_type');
        expect(withTypeClaim).toBeDefined();
        expect(withTypeClaim?.type).toBe('invariant');
      });

      it('should provide example claim structure as documented', () => {
        const specPath = path.join(FIXTURES_DIR, 'valid-spec.toml');
        const claims = parseClaims(specPath);

        const invClaim = claims.find((c) => c.id === 'inv_001');

        // Verify the example from acceptance criteria
        expect(invClaim).toEqual({
          id: 'inv_001',
          type: 'invariant',
          description: 'Account balance is never negative',
          functions: [],
        });
      });
    });

    describe('error handling', () => {
      it('should throw ClaimParseError for non-existent file', () => {
        const specPath = '/nonexistent/path/spec.toml';

        expect(() => parseClaims(specPath)).toThrow(ClaimParseError);

        try {
          parseClaims(specPath);
        } catch (error) {
          expect(error).toBeInstanceOf(ClaimParseError);
          const parseError = error as ClaimParseError;
          expect(parseError.specPath).toBe(specPath);
          expect(parseError.message).toContain('Failed to read spec file');
          expect(parseError.message).toContain(specPath);
        }
      });

      it('should throw ClaimParseError with details for invalid TOML syntax', () => {
        const specPath = path.join(FIXTURES_DIR, 'invalid-spec.toml');

        expect(() => parseClaims(specPath)).toThrow(ClaimParseError);

        try {
          parseClaims(specPath);
        } catch (error) {
          expect(error).toBeInstanceOf(ClaimParseError);
          const parseError = error as ClaimParseError;
          expect(parseError.specPath).toBe(specPath);
          expect(parseError.message).toContain("Invalid spec.toml at '");
          expect(parseError.message).toContain('Invalid TOML syntax');
          expect(parseError.cause).toBeDefined();
        }
      });

      it('should throw ClaimParseError when claim is missing required text field', () => {
        const specPath = path.join(FIXTURES_DIR, 'missing-text-spec.toml');

        expect(() => parseClaims(specPath)).toThrow(ClaimParseError);

        try {
          parseClaims(specPath);
        } catch (error) {
          expect(error).toBeInstanceOf(ClaimParseError);
          const parseError = error as ClaimParseError;
          expect(parseError.message).toContain('text');
        }
      });
    });

    describe('edge cases', () => {
      let tempDir: string;

      beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-test-'));
      });

      it('should handle spec with empty claims section', () => {
        const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims]
`;
        const specPath = path.join(tempDir, 'empty-claims.toml');
        fs.writeFileSync(specPath, specContent);

        const claims = parseClaims(specPath);
        expect(claims).toEqual([]);
      });

      it('should preserve claim IDs from the spec', () => {
        const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.custom_id_123]
text = "Custom ID claim"
type = "behavioral"

[claims.another_custom]
text = "Another claim"
type = "invariant"
`;
        const specPath = path.join(tempDir, 'custom-ids.toml');
        fs.writeFileSync(specPath, specContent);

        const claims = parseClaims(specPath);
        const claimIds = claims.map((c) => c.id).sort();
        expect(claimIds).toEqual(['another_custom', 'custom_id_123']);
      });
    });
  });

  describe('linkClaimsToFunctions', () => {
    it('should link functions to claims based on CLAIM_REF', () => {
      const claims: Claim[] = [
        { id: 'inv_001', type: 'invariant', description: 'Test invariant', functions: [] },
        { id: 'perf_001', type: 'performance', description: 'Test performance', functions: [] },
        { id: 'beh_001', type: 'behavioral', description: 'Test behavioral', functions: [] },
      ];

      const functionClaimRefs = new Map<string, string[]>([
        ['processPayment', ['inv_001', 'perf_001']],
        ['validateCard', ['inv_001']],
        ['transferFunds', ['beh_001', 'inv_001']],
      ]);

      const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

      // inv_001 is referenced by all three functions
      const inv001 = linkedClaims.find((c) => c.id === 'inv_001');
      expect(inv001?.functions.sort()).toEqual(
        ['processPayment', 'transferFunds', 'validateCard'].sort()
      );

      // perf_001 is only referenced by processPayment
      const perf001 = linkedClaims.find((c) => c.id === 'perf_001');
      expect(perf001?.functions).toEqual(['processPayment']);

      // beh_001 is only referenced by transferFunds
      const beh001 = linkedClaims.find((c) => c.id === 'beh_001');
      expect(beh001?.functions).toEqual(['transferFunds']);
    });

    it('should not duplicate function names in claims', () => {
      const claims: Claim[] = [
        { id: 'inv_001', type: 'invariant', description: 'Test', functions: [] },
      ];

      // Same function references the same claim multiple times
      const functionClaimRefs = new Map<string, string[]>([
        ['processPayment', ['inv_001']],
        ['processPayment', ['inv_001']], // This won't actually happen with Map, but let's simulate
      ]);

      // Simulate calling linkClaimsToFunctions multiple times
      linkClaimsToFunctions(claims, functionClaimRefs);
      const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

      const inv001 = linkedClaims.find((c) => c.id === 'inv_001');
      // Should only appear once, not twice
      expect(inv001?.functions.filter((f) => f === 'processPayment').length).toBe(1);
    });

    it('should handle unknown claim IDs gracefully', () => {
      const claims: Claim[] = [
        { id: 'inv_001', type: 'invariant', description: 'Test', functions: [] },
      ];

      const functionClaimRefs = new Map<string, string[]>([
        ['processPayment', ['inv_001', 'unknown_claim']],
      ]);

      // Should not throw, just ignore unknown claims
      const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

      const inv001 = linkedClaims.find((c) => c.id === 'inv_001');
      expect(inv001?.functions).toEqual(['processPayment']);
    });

    it('should handle empty function refs', () => {
      const claims: Claim[] = [
        { id: 'inv_001', type: 'invariant', description: 'Test', functions: [] },
      ];

      const functionClaimRefs = new Map<string, string[]>();

      const linkedClaims = linkClaimsToFunctions(claims, functionClaimRefs);

      const inv001 = linkedClaims.find((c) => c.id === 'inv_001');
      expect(inv001?.functions).toEqual([]);
    });
  });

  describe('DEFAULT_CLAIM_TYPE', () => {
    it('should be behavioral', () => {
      expect(DEFAULT_CLAIM_TYPE).toBe('behavioral');
    });
  });

  describe('ClaimParseError', () => {
    it('should preserve error properties', () => {
      const cause = new Error('original error');
      const error = new ClaimParseError('test message', '/path/to/spec.toml', cause);

      expect(error.name).toBe('ClaimParseError');
      expect(error.message).toBe('test message');
      expect(error.specPath).toBe('/path/to/spec.toml');
      expect(error.cause).toBe(cause);
    });

    it('should work without cause', () => {
      const error = new ClaimParseError('test message', '/path/to/spec.toml');

      expect(error.cause).toBeUndefined();
    });
  });
});
