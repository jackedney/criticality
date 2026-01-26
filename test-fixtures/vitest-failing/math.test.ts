/**
 * Test fixture: Contains intentionally failing tests.
 */
import { describe, it, expect } from 'vitest';

function add(a: number, b: number): number {
  // Intentionally buggy implementation
  return a + b + 1;
}

function divide(a: number, b: number): number {
  // Missing zero check
  return a / b;
}

describe('buggy math operations', () => {
  describe('add', () => {
    it('should add two numbers correctly', () => {
      // This will fail because add() has a bug
      expect(add(2, 3)).toBe(5);
    });

    it('should handle zero', () => {
      // This will also fail
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      // This passes
      expect(divide(10, 2)).toBe(5);
    });

    it('should handle division by zero', () => {
      // This will fail with Infinity !== 0 check
      expect(divide(5, 0)).toBe(Infinity);
    });
  });
});
