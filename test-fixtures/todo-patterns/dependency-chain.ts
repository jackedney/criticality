/**
 * Test fixture: Functions with dependencies for topological ordering.
 * Expected order: C first (leaf), then B, then A (root).
 */

export function functionA(): number {
  throw new Error('TODO');
  // functionA calls functionB
  return functionB() + 1;
}

export function functionB(): number {
  throw new Error('TODO');
  // functionB calls functionC
  return functionC() * 2;
}

export function functionC(): number {
  throw new Error('TODO');
  // functionC is a leaf (calls no other TODO functions)
  return 42;
}
