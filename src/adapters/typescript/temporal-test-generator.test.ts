/**
 * Tests for temporal claims.
 *
 * @module adapters/typescript/temporal-test-generator.test
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { generateTemporalTest, generateTemporalTests } from './temporal-test-generator.js';
import type { Claim } from './claims.js';
import type { ClaimType } from '../../spec/types.js';
import { escapeString } from './utils.js';

describe('temporal-test-generator', () => {
  describe('generateTemporalTest', () => {
    it('should generate a temporal test', () => {
      const claim = {
        id: 'temp_001',
        type: 'temporal' as const,
        description: 'session is valid for 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain(
        "describe('Temporal: [temp_001] session is valid for 30 minutes', () => {"
      );
      expect(testCode).toContain('Act: Check session validity during valid period');
      expect(testCode).toContain('Assert: Session should be valid');
      expect(testCode).toContain('const sessionCreationTime = Date.now();');
      expect(testCode).toContain('const sessionDurationMs = 30 * 60 * 1000;');
      expect(testCode).toContain(
        'const midSessionTime = sessionCreationTime + sessionDurationMs / 2;'
      );
      expect(testCode).toContain('const midIsValid = false;');
      expect(testCode).toContain("console.log('Session valid at midpoint:', midIsValid);");
      expect(testCode).toContain('Time constraints detected: minute;');
      expect(testCode).toContain("it('[temp_001] session is valid for 30 minutes', () => {");
      expect(testCode).toContain('}, { timeout: 30000 });');
    });

    it('should generate test with session expiration', () => {
      const claim = {
        id: 'temp_002',
        type: 'temporal' as const,
        description: 'session expires after 30 minutes',
        functions: ['validateSession'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('Act: Check session invalidity after expiration');
      expect(testCode).toContain(
        'const afterExpirationTime = sessionCreationTime + sessionDurationMs + 1000;'
      );
      expect(testCode).toContain('const afterIsValid = false;');
      expect(testCode).toContain("console.log('Session invalid after expiration:', afterIsValid);");
    });

    it('should generate test with timeout constraint', () => {
      const claim = {
        id: 'temp_003',
        type: 'temporal' as const,
        description: 'operation completes within 5 seconds',
        functions: ['performOperation'],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain(
        "describe('Temporal: [temp_003] operation completes within 5 seconds', () => {"
      );
      expect(testCode).toContain('const initialState = {}; // TODO: Set up based on claim');
      expect(testCode).toContain('const triggerEvent = {}; // TODO: Define trigger event');
      expect(testCode).toContain('Act: Trigger temporal scenario');
      expect(testCode).toContain('Assert: Verify temporal property holds');
      expect(testCode).toContain('Verify state changes according to temporal rules');
      expect(testCode).toContain('Time constraints detected: second;');
      expect(testCode).toContain("it('[temp_003] operation completes within 5 seconds', () => {");
      expect(testCode).toContain('}, { timeout: 30000 });');
    });

    it('should generate test without linked functions', () => {
      const claim = {
        id: 'temp_004',
        type: 'temporal' as const,
        description: 'some temporal constraint',
        functions: [],
      };

      const testCode = generateTemporalTest(claim, { includeJsDoc: false });
      expect(testCode).toContain('it.skip');
      expect(testCode).toContain('no linked functions');
    });
  });

  describe('generateTemporalTests', () => {
    it('should generate multiple temporal tests', () => {
      const claims = [
        {
          id: 'temp_001',
          type: 'temporal' as const,
          description: 'session is valid for 30 minutes',
          functions: ['validateSession'],
        },
        {
          id: 'temp_002',
          type: 'temporal' as const,
          description: 'session expires after 30 minutes',
          functions: ['validateSession'],
        },
      ];

      const tests = generateTemporalTests(claims, { includeJsDoc: false });
      expect(tests.size).toBe(2);
      expect(tests.get('temp_001')).toContain('session is valid for 30 minutes');
      expect(tests.get('temp_002')).toContain('session expires after 30 minutes');
    });

    it('should filter claims by temporal type', () => {
      const claims = [
        {
          id: 'temp_001',
          type: 'temporal' as const,
          description: 'session is valid for 30 minutes',
          functions: ['validateSession'],
        },
        {
          id: 'inv_001',
          type: 'invariant' as const,
          description: 'balance is never negative',
          functions: ['getBalance'],
        },
        {
          id: 'neg_001',
          type: 'negative' as const,
          description: 'cannot withdraw more than balance',
          functions: ['withdraw'],
        },
      ];

      const tests = generateTemporalTests(claims, { includeJsDoc: false });
      expect(tests.size).toBe(1);
      expect(tests.has('temp_001')).toBe(true);
      expect(tests.has('inv_001')).toBe(false);
      expect(tests.has('neg_001')).toBe(false);
    });
  });

  describe('property-based tests', () => {
    // Arbitrary for ClaimType
    const claimTypeArb: fc.Arbitrary<ClaimType> = fc.constantFrom(
      'invariant' as const,
      'behavioral' as const,
      'negative' as const,
      'temporal' as const,
      'concurrent' as const,
      'performance' as const
    );

    // Arbitrary for special characters in descriptions
    const specialCharArb: fc.Arbitrary<string> = fc.constantFrom(
      "'",
      '"',
      '\\',
      '`',
      '$',
      '\n',
      '\r',
      '<',
      '>',
      '&'
    );

    // Arbitrary for claim descriptions including special characters
    const descriptionArb: fc.Arbitrary<string> = fc.oneof(
      fc.string(),
      fc.array(specialCharArb, { minLength: 1, maxLength: 5 }).map((chars) => chars.join('')),
      fc
        .tuple(
          fc.string(),
          fc.array(specialCharArb).map((c) => c.join('')),
          fc.string()
        )
        .map((tuple): string => tuple[0] + tuple[1] + tuple[2])
    );

    // Arbitrary for function names
    const functionNameArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

    // Arbitrary for a temporal claim
    const temporalClaimArb: fc.Arbitrary<Claim> = fc.record({
      id: fc.stringMatching(/^[a-z]+_[0-9]+$/),
      type: fc.constant('temporal' as const),
      description: descriptionArb,
      functions: fc.array(functionNameArb, { minLength: 0, maxLength: 5 }),
    });

    // Arbitrary for any claim (any type)
    const anyClaimArb: fc.Arbitrary<Claim> = fc.record({
      id: fc.stringMatching(/^[a-z]+_[0-9]+$/),
      type: claimTypeArb,
      description: descriptionArb,
      functions: fc.array(functionNameArb, { minLength: 0, maxLength: 5 }),
    });

    describe('generateTemporalTest properties', () => {
      it('should always include claim.id in output', () => {
        fc.assert(
          fc.property(temporalClaimArb, (claim) => {
            const output = generateTemporalTest(claim, { includeJsDoc: false });
            expect(output).toContain(claim.id);
          })
        );
      });

      it('should always include Temporal: header in describe block', () => {
        fc.assert(
          fc.property(temporalClaimArb, (claim) => {
            const output = generateTemporalTest(claim, { includeJsDoc: false });
            expect(output).toContain("describe('Temporal:");
          })
        );
      });

      it('should include timeout block when claim has functions', () => {
        // When claim has functions, the test should have a timeout block
        const claimWithFunctionsArb: fc.Arbitrary<Claim> = fc.record({
          id: fc.stringMatching(/^[a-z]+_[0-9]+$/),
          type: fc.constant('temporal' as const),
          description: descriptionArb,
          functions: fc.array(functionNameArb, { minLength: 1, maxLength: 5 }),
        });

        fc.assert(
          fc.property(claimWithFunctionsArb, (claim) => {
            const output = generateTemporalTest(claim, { includeJsDoc: false });
            expect(output).toContain('timeout:');
          })
        );
      });

      it('should use it.skip when claim has no functions', () => {
        // When claim has no functions, the test should be skipped
        const claimWithoutFunctionsArb: fc.Arbitrary<Claim> = fc.record({
          id: fc.stringMatching(/^[a-z]+_[0-9]+$/),
          type: fc.constant('temporal' as const),
          description: descriptionArb,
          functions: fc.constant([]),
        });

        fc.assert(
          fc.property(claimWithoutFunctionsArb, (claim) => {
            const output = generateTemporalTest(claim, { includeJsDoc: false });
            expect(output).toContain('it.skip');
          })
        );
      });

      it('should properly escape descriptions with quotes and backslashes', () => {
        fc.assert(
          fc.property(temporalClaimArb, (claim) => {
            const output = generateTemporalTest(claim, { includeJsDoc: false });
            // The output should be valid JavaScript (no unescaped quotes breaking strings)
            // We check by verifying the escaped description appears in expected format
            const escapedDesc = escapeString(`[${claim.id}] ${claim.description}`);
            expect(output).toContain(escapedDesc);
          })
        );
      });

      it('should safely escape description containing only special characters', () => {
        const specialClaim: Claim = {
          id: 'temp_001',
          type: 'temporal',
          description: 'test\'s "quoted" with\\backslash and `backticks` and $dollars',
          functions: ['testFunc'],
        };
        const output = generateTemporalTest(specialClaim, { includeJsDoc: false });
        // Verify the output contains safely escaped versions
        expect(output).toContain("\\'"); // escaped single quote
        expect(output).toContain('\\\\'); // escaped backslash
        expect(output).toContain('\\`'); // escaped backtick
        expect(output).toContain('\\$'); // escaped dollar sign
      });
    });

    describe('generateTemporalTests properties', () => {
      it('should only include claims with type === temporal', () => {
        fc.assert(
          fc.property(fc.array(anyClaimArb, { minLength: 0, maxLength: 10 }), (claims) => {
            const tests = generateTemporalTests(claims, { includeJsDoc: false });
            const temporalClaimIds = claims.filter((c) => c.type === 'temporal').map((c) => c.id);
            const nonTemporalClaimIds = claims
              .filter((c) => c.type !== 'temporal')
              .map((c) => c.id);

            // All temporal claim IDs should be in the map
            for (const id of temporalClaimIds) {
              expect(tests.has(id)).toBe(true);
            }

            // No non-temporal claim IDs should be in the map
            for (const id of nonTemporalClaimIds) {
              expect(tests.has(id)).toBe(false);
            }
          })
        );
      });

      it('should preserve claim IDs in generated output', () => {
        fc.assert(
          fc.property(fc.array(temporalClaimArb, { minLength: 1, maxLength: 5 }), (claims) => {
            const tests = generateTemporalTests(claims, { includeJsDoc: false });

            for (const claim of claims) {
              const testCode = tests.get(claim.id);
              expect(testCode).toBeDefined();
              expect(testCode).toContain(claim.id);
            }
          })
        );
      });

      it('should return empty map when no temporal claims exist', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.record({
                id: fc.stringMatching(/^[a-z]+_[0-9]+$/),
                type: fc.constantFrom<ClaimType>(
                  'invariant',
                  'behavioral',
                  'negative',
                  'concurrent',
                  'performance'
                ),
                description: fc.string(),
                functions: fc.array(functionNameArb),
              }),
              { minLength: 0, maxLength: 5 }
            ),
            (nonTemporalClaims) => {
              const tests = generateTemporalTests(nonTemporalClaims, { includeJsDoc: false });
              expect(tests.size).toBe(0);
            }
          )
        );
      });

      it('should return map with size equal to number of temporal claims', () => {
        fc.assert(
          fc.property(fc.array(anyClaimArb, { minLength: 0, maxLength: 10 }), (claims) => {
            const tests = generateTemporalTests(claims, { includeJsDoc: false });
            const temporalCount = claims.filter((c) => c.type === 'temporal').length;
            expect(tests.size).toBe(temporalCount);
          })
        );
      });
    });
  });
});
