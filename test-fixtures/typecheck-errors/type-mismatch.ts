/**
 * A TypeScript file with intentional type errors for testing.
 */

export function add(a: number, b: number): number {
  // TS2322: Type 'string' is not assignable to type 'number'
  return 'not a number';
}

export function greet(name: string): string {
  // TS2345: Argument of type 'number' is not assignable to parameter of type 'string'
  return name.toUpperCase();
}

export interface User {
  id: number;
  name: string;
}

export function createUser(id: number, name: string): User {
  // TS2322: Property 'extra' does not exist on type 'User'
  return { id, name, extra: true };
}

// TS2554: Expected 2 arguments, but got 1
const user = createUser(1);
