/**
 * Test fixture: Function throwing an error that is NOT a TODO marker.
 */

export function validate(input: string): void {
  throw new Error('Something else');
}
