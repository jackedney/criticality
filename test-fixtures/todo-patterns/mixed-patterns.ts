/**
 * Test fixture: Multiple functions with various patterns.
 */

// TODO function with single quotes
export function todoSingle(x: number): number {
  throw new Error('TODO');
}

// TODO function with double quotes
export function todoDouble(x: number): number {
  throw new Error('TODO');
}

// TODO function with macro-style comment
export function todoMacro(x: number): number {
  // todo!()
  return 0;
}

// Implemented function (not a TODO)
export function implemented(x: number): number {
  return x * 2;
}

// Function with non-TODO error (not detected)
export function notTodo(x: number): number {
  throw new Error('Not implemented yet');
}

// Function with TODO comment only (not detected)
export function commentOnly(x: number): number {
  // TODO: do something
  return x;
}
