/**
 * Test fixture: This file intentionally contains code with implicit any.
 * It should FAIL typecheck when strict mode is enabled.
 *
 * Run: npx tsc --noEmit test-fixtures/implicit-any-example.ts
 * Expected: Error TS7006: Parameter 'x' implicitly has an 'any' type.
 */

// This function has an implicit 'any' parameter - should fail with strict: true
function processValue(x) {
  return x;
}

export { processValue };
