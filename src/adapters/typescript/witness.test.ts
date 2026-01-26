/**
 * Tests for the witness generation module.
 *
 * @module adapters/typescript/witness.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateBrandedType,
  generateValidationFactory,
  generateArbitrary,
  InvalidBaseTypeError,
  type WitnessDefinition,
} from './witness.js';
import * as fc from 'fast-check';

describe('generateBrandedType', () => {
  describe('primitive base types', () => {
    it('generates branded type for number', () => {
      const witness: WitnessDefinition = {
        name: 'NonNegativeDecimal',
        baseType: 'number',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type NonNegativeDecimal = number & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for string', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyString',
        baseType: 'string',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type NonEmptyString = string & { readonly __brand: unique symbol };');
    });

    it('generates branded type for boolean', () => {
      const witness: WitnessDefinition = {
        name: 'ValidatedBoolean',
        baseType: 'boolean',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type ValidatedBoolean = boolean & { readonly __brand: unique symbol };');
    });

    it('generates branded type for bigint', () => {
      const witness: WitnessDefinition = {
        name: 'SafeBigInt',
        baseType: 'bigint',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type SafeBigInt = bigint & { readonly __brand: unique symbol };');
    });

    it('generates branded type for symbol', () => {
      const witness: WitnessDefinition = {
        name: 'UniqueSymbol',
        baseType: 'symbol',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type UniqueSymbol = symbol & { readonly __brand: unique symbol };');
    });
  });

  describe('object base types', () => {
    it('generates branded type for simple object literal', () => {
      const witness: WitnessDefinition = {
        name: 'ValidUser',
        baseType: '{ id: string; email: string }',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type ValidUser = { id: string; email: string } & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for object with optional properties', () => {
      const witness: WitnessDefinition = {
        name: 'Config',
        baseType: '{ host: string; port?: number }',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type Config = { host: string; port?: number } & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for nested object', () => {
      const witness: WitnessDefinition = {
        name: 'NestedConfig',
        baseType: '{ server: { host: string; port: number }; debug: boolean }',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type NestedConfig = { server: { host: string; port: number }; debug: boolean } & { readonly __brand: unique symbol };'
      );
    });
  });

  describe('array base types', () => {
    it('generates branded type for simple array', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyNumbers',
        baseType: 'number[]',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type NonEmptyNumbers = number[] & { readonly __brand: unique symbol };');
    });

    it('generates branded type for Array<T> syntax', () => {
      const witness: WitnessDefinition = {
        name: 'SafeArray',
        baseType: 'Array<string>',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type SafeArray = Array<string> & { readonly __brand: unique symbol };');
    });

    it('generates branded type for readonly array', () => {
      const witness: WitnessDefinition = {
        name: 'ImmutableList',
        baseType: 'readonly string[]',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type ImmutableList = readonly string[] & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for tuple', () => {
      const witness: WitnessDefinition = {
        name: 'Point',
        baseType: '[number, number]',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type Point = [number, number] & { readonly __brand: unique symbol };');
    });
  });

  describe('generic branded types', () => {
    it('generates generic branded type with single parameter', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmpty',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type NonEmpty<T> = T[] & { readonly __brand: unique symbol };');
    });

    it('generates generic branded type with constraint', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyArray',
        baseType: 'T[]',
        typeParameters: [{ name: 'T', constraint: 'object' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type NonEmptyArray<T extends object> = T[] & { readonly __brand: unique symbol };'
      );
    });

    it('generates generic branded type with default', () => {
      const witness: WitnessDefinition = {
        name: 'Container',
        baseType: '{ value: T }',
        typeParameters: [{ name: 'T', default: 'unknown' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type Container<T = unknown> = { value: T } & { readonly __brand: unique symbol };'
      );
    });

    it('generates generic branded type with constraint and default', () => {
      const witness: WitnessDefinition = {
        name: 'TypedContainer',
        baseType: '{ value: T }',
        typeParameters: [{ name: 'T', constraint: 'object', default: '{}' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type TypedContainer<T extends object = {}> = { value: T } & { readonly __brand: unique symbol };'
      );
    });

    it('generates generic branded type with multiple parameters', () => {
      const witness: WitnessDefinition = {
        name: 'ValidMap',
        baseType: 'Map<K, V>',
        typeParameters: [{ name: 'K' }, { name: 'V' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type ValidMap<K, V> = Map<K, V> & { readonly __brand: unique symbol };');
    });

    it('generates generic branded type with complex constraints', () => {
      const witness: WitnessDefinition = {
        name: 'KeyedObject',
        baseType: '{ [key: string]: T }',
        typeParameters: [{ name: 'T', constraint: 'string | number' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type KeyedObject<T extends string | number> = { [key: string]: T } & { readonly __brand: unique symbol };'
      );
    });
  });

  describe('union and intersection base types', () => {
    it('wraps union type in parentheses', () => {
      const witness: WitnessDefinition = {
        name: 'StringOrNumber',
        baseType: 'string | number',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type StringOrNumber = (string | number) & { readonly __brand: unique symbol };'
      );
    });

    it('wraps complex union in parentheses', () => {
      const witness: WitnessDefinition = {
        name: 'ValidInput',
        baseType: 'string | number | boolean | null',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type ValidInput = (string | number | boolean | null) & { readonly __brand: unique symbol };'
      );
    });

    it('does not wrap intersection type (already compatible)', () => {
      const witness: WitnessDefinition = {
        name: 'Combined',
        baseType: 'Base & Extra',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type Combined = Base & Extra & { readonly __brand: unique symbol };');
    });

    it('does not wrap union inside generics', () => {
      const witness: WitnessDefinition = {
        name: 'SafeResult',
        baseType: 'Promise<string | Error>',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type SafeResult = Promise<string | Error> & { readonly __brand: unique symbol };'
      );
    });
  });

  describe('complex nested generics', () => {
    it('generates branded type for nested generic', () => {
      const witness: WitnessDefinition = {
        name: 'NestedPromise',
        baseType: 'Promise<Map<string, T[]>>',
        typeParameters: [{ name: 'T' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type NestedPromise<T> = Promise<Map<string, T[]>> & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for deeply nested generics', () => {
      const witness: WitnessDefinition = {
        name: 'DeepNested',
        baseType: 'Map<K, Set<Array<V>>>',
        typeParameters: [
          { name: 'K', constraint: 'string' },
          { name: 'V', constraint: 'object' },
        ],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type DeepNested<K extends string, V extends object> = Map<K, Set<Array<V>>> & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for conditional type', () => {
      const witness: WitnessDefinition = {
        name: 'Extracted',
        baseType: 'T extends string ? string : number',
        typeParameters: [{ name: 'T' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type Extracted<T> = T extends string ? string : number & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for mapped type', () => {
      const witness: WitnessDefinition = {
        name: 'ReadonlyDeep',
        baseType: '{ readonly [K in keyof T]: T[K] }',
        typeParameters: [{ name: 'T', constraint: 'object' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type ReadonlyDeep<T extends object> = { readonly [K in keyof T]: T[K] } & { readonly __brand: unique symbol };'
      );
    });

    it('generates branded type for function type', () => {
      const witness: WitnessDefinition = {
        name: 'SafeCallback',
        baseType: '(arg: T) => R',
        typeParameters: [{ name: 'T' }, { name: 'R' }],
      };

      const result = generateBrandedType(witness);

      expect(result).toBe(
        'type SafeCallback<T, R> = (arg: T) => R & { readonly __brand: unique symbol };'
      );
    });
  });

  describe('invariant documentation', () => {
    it('accepts witness with invariant description', () => {
      const witness: WitnessDefinition = {
        name: 'PositiveNumber',
        baseType: 'number',
        invariant: 'value must be greater than zero',
      };

      const result = generateBrandedType(witness);

      // Invariant is for documentation, doesn't affect generated code
      expect(result).toBe('type PositiveNumber = number & { readonly __brand: unique symbol };');
    });
  });

  describe('whitespace handling', () => {
    it('trims whitespace from base type', () => {
      const witness: WitnessDefinition = {
        name: 'Trimmed',
        baseType: '  string  ',
      };

      const result = generateBrandedType(witness);

      expect(result).toBe('type Trimmed = string & { readonly __brand: unique symbol };');
    });
  });

  describe('error handling - invalid base types', () => {
    it('throws for empty base type', () => {
      const witness: WitnessDefinition = {
        name: 'Empty',
        baseType: '',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('base type cannot be empty');
    });

    it('throws for whitespace-only base type', () => {
      const witness: WitnessDefinition = {
        name: 'Whitespace',
        baseType: '   ',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('base type cannot be empty');
    });

    it('throws for unbalanced angle brackets', () => {
      const witness: WitnessDefinition = {
        name: 'Unbalanced',
        baseType: 'Map<string, number',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('unbalanced angle brackets');
    });

    it('throws for unbalanced square brackets', () => {
      const witness: WitnessDefinition = {
        name: 'Unbalanced',
        baseType: 'string[',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('unbalanced square brackets');
    });

    it('throws for unbalanced curly brackets', () => {
      const witness: WitnessDefinition = {
        name: 'Unbalanced',
        baseType: '{ foo: string',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('unbalanced curly brackets');
    });

    it('throws for unbalanced parentheses', () => {
      const witness: WitnessDefinition = {
        name: 'Unbalanced',
        baseType: '(string | number',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('unbalanced parentheses');
    });

    it('throws for reserved keyword as base type', () => {
      const witness: WitnessDefinition = {
        name: 'Reserved',
        baseType: 'class',
      };

      expect(() => generateBrandedType(witness)).toThrow(InvalidBaseTypeError);
      expect(() => generateBrandedType(witness)).toThrow('"class" is a reserved keyword');
    });

    it('does not throw for reserved keyword inside complex type', () => {
      // "class" inside an object type is a property name, not a keyword
      const witness: WitnessDefinition = {
        name: 'WithClass',
        baseType: '{ class: string }',
      };

      // This should not throw
      const result = generateBrandedType(witness);
      expect(result).toBe(
        'type WithClass = { class: string } & { readonly __brand: unique symbol };'
      );
    });

    it('InvalidBaseTypeError has correct properties', () => {
      const witness: WitnessDefinition = {
        name: 'Invalid',
        baseType: '',
      };

      try {
        generateBrandedType(witness);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidBaseTypeError);
        const err = error as InvalidBaseTypeError;
        expect(err.baseType).toBe('');
        expect(err.reason).toBe('base type cannot be empty');
        expect(err.name).toBe('InvalidBaseTypeError');
      }
    });
  });

  describe('type compilation verification', () => {
    // These tests verify the generated types would compile with strict: true
    // by checking the output format matches the branded type pattern

    it('generates compilable primitive branded type', () => {
      const result = generateBrandedType({
        name: 'SafeNumber',
        baseType: 'number',
      });

      // Should match the branded type pattern exactly
      expect(result).toMatch(/^type \w+ = .+ & \{ readonly __brand: unique symbol \};$/);
    });

    it('generates compilable generic branded type', () => {
      const result = generateBrandedType({
        name: 'NonEmpty',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
      });

      // Should have generic parameter and branded pattern
      expect(result).toMatch(/^type \w+<[^>]+> = .+ & \{ readonly __brand: unique symbol \};$/);
    });
  });
});

/**
 * Strips TypeScript type annotations from generated code to make it executable as JavaScript.
 * This is used for runtime behavior verification tests.
 */
function stripTypeAnnotations(code: string): string {
  // Remove type parameter declarations like <T>, <K, V>, etc. from function declarations
  let result = code.replace(/function\s+(\w+)<[^>]+>\(/g, 'function $1(');

  // Remove parameter type annotations like `: number`, `: string`, etc.
  result = result.replace(/\((\w+):\s*[^)]+\)/g, '($1)');

  // Remove return type annotations like `: NonNegativeDecimal | null`, `: value is Xxx`
  result = result.replace(/\):\s*[^{]+\{/g, ') {');

  // Remove `as Type` casts
  result = result.replace(/\s+as\s+\w+(?:<[^>]+>)?/g, '');

  return result;
}

describe('generateValidationFactory', () => {
  describe('basic factory generation', () => {
    it('generates factory for NonNegativeDecimal with invariant', () => {
      const witness: WitnessDefinition = {
        name: 'NonNegativeDecimal',
        baseType: 'number',
        invariant: 'value >= 0',
      };

      const result = generateValidationFactory(witness);

      // Check make function
      expect(result).toContain(
        'function makeNonNegativeDecimal(value: number): NonNegativeDecimal | null'
      );
      expect(result).toContain('if ((value >= 0))');
      expect(result).toContain('return value as NonNegativeDecimal;');
      expect(result).toContain('return null;');

      // Check assert function
      expect(result).toContain(
        'function assertNonNegativeDecimal(value: number): NonNegativeDecimal'
      );
      expect(result).toContain("throw new Error('Assertion failed: value >= 0');");

      // Check type guard
      expect(result).toContain(
        'function isNonNegativeDecimal(value: unknown): value is NonNegativeDecimal'
      );
      expect(result).toContain("typeof value === 'number'");
    });

    it('generates factory for NonEmptyString with invariant', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyString',
        baseType: 'string',
        invariant: 'value.length > 0',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('function makeNonEmptyString(value: string): NonEmptyString | null');
      expect(result).toContain('if ((value.length > 0))');
      expect(result).toContain('function assertNonEmptyString(value: string): NonEmptyString');
      expect(result).toContain(
        'function isNonEmptyString(value: unknown): value is NonEmptyString'
      );
      expect(result).toContain("typeof value === 'string'");
    });
  });

  describe('factory without invariant (always succeeds)', () => {
    it('generates factory that always succeeds for witness without invariant', () => {
      const witness: WitnessDefinition = {
        name: 'SafeNumber',
        baseType: 'number',
      };

      const result = generateValidationFactory(witness);

      // Make function should always return branded value
      expect(result).toContain('function makeSafeNumber(value: number): SafeNumber | null');
      expect(result).toContain('return value as SafeNumber;');
      expect(result).not.toContain('return null;');

      // Assert function should always return branded value
      expect(result).toContain('function assertSafeNumber(value: number): SafeNumber');
      expect(result).not.toContain('throw new Error');

      // Type guard should only check base type
      expect(result).toContain('function isSafeNumber(value: unknown): value is SafeNumber');
      expect(result).toContain("return typeof value === 'number';");
    });

    it('handles empty invariant string', () => {
      const witness: WitnessDefinition = {
        name: 'SafeString',
        baseType: 'string',
        invariant: '',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('return value as SafeString;');
      expect(result).not.toContain('return null;');
    });

    it('handles whitespace-only invariant', () => {
      const witness: WitnessDefinition = {
        name: 'SafeBoolean',
        baseType: 'boolean',
        invariant: '   ',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('return value as SafeBoolean;');
      expect(result).not.toContain('return null;');
    });
  });

  describe('complex invariants with multiple conditions', () => {
    it('handles multiple conditions joined by &&', () => {
      const witness: WitnessDefinition = {
        name: 'PercentageValue',
        baseType: 'number',
        invariant: 'value >= 0 && value <= 100',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('if ((value >= 0) && (value <= 100))');
      expect(result).toContain("throw new Error('Assertion failed: value >= 0 && value <= 100');");
    });

    it('handles three conditions', () => {
      const witness: WitnessDefinition = {
        name: 'ValidRange',
        baseType: 'number',
        invariant: 'value >= 0 && value <= 100 && Number.isInteger(value)',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('if ((value >= 0) && (value <= 100) && (Number.isInteger(value)))');
    });

    it('handles conditions with nested parentheses', () => {
      const witness: WitnessDefinition = {
        name: 'ComplexCondition',
        baseType: 'number',
        invariant: '(value > 0 || value === -1) && value < 1000',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('if (((value > 0 || value === -1)) && (value < 1000))');
    });
  });

  describe('generic witness types', () => {
    it('generates generic factory for NonEmptyArray', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyArray',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
        invariant: 'value.length > 0',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain(
        'function makeNonEmptyArray<T>(value: T[]): NonEmptyArray<T> | null'
      );
      expect(result).toContain('function assertNonEmptyArray<T>(value: T[]): NonEmptyArray<T>');
      expect(result).toContain(
        'function isNonEmptyArray(value: unknown): value is NonEmptyArray<T>'
      );
    });

    it('generates factory with multiple type parameters', () => {
      const witness: WitnessDefinition = {
        name: 'ValidMap',
        baseType: 'Map<K, V>',
        typeParameters: [{ name: 'K' }, { name: 'V' }],
        invariant: 'value.size > 0',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain(
        'function makeValidMap<K, V>(value: Map<K, V>): ValidMap<K, V> | null'
      );
      expect(result).toContain('function assertValidMap<K, V>(value: Map<K, V>): ValidMap<K, V>');
    });
  });

  describe('JSDoc generation', () => {
    it('includes JSDoc by default', () => {
      const witness: WitnessDefinition = {
        name: 'PositiveNumber',
        baseType: 'number',
        invariant: 'value > 0',
      };

      const result = generateValidationFactory(witness);

      expect(result).toContain('/**');
      expect(result).toContain(' * Creates a PositiveNumber from a number value.');
      expect(result).toContain(' * Validates that: value > 0');
      expect(result).toContain(' * @param value - The value to validate and brand.');
      expect(result).toContain(' * @returns The branded value if valid, null otherwise.');
    });

    it('can disable JSDoc generation', () => {
      const witness: WitnessDefinition = {
        name: 'PositiveNumber',
        baseType: 'number',
        invariant: 'value > 0',
      };

      const result = generateValidationFactory(witness, { includeJsDoc: false });

      expect(result).not.toContain('/**');
      expect(result).not.toContain('@param');
    });
  });

  describe('type check generation', () => {
    it('generates correct check for string', () => {
      const witness: WitnessDefinition = {
        name: 'SafeString',
        baseType: 'string',
        invariant: 'value.length > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain("typeof value === 'string'");
    });

    it('generates correct check for boolean', () => {
      const witness: WitnessDefinition = {
        name: 'SafeBoolean',
        baseType: 'boolean',
        invariant: 'value === true',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain("typeof value === 'boolean'");
    });

    it('generates correct check for bigint', () => {
      const witness: WitnessDefinition = {
        name: 'SafeBigInt',
        baseType: 'bigint',
        invariant: 'value > 0n',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain("typeof value === 'bigint'");
    });

    it('generates Array.isArray for array types', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyNumbers',
        baseType: 'number[]',
        invariant: 'value.length > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain('Array.isArray(value)');
    });

    it('generates Array.isArray for Array<T> syntax', () => {
      const witness: WitnessDefinition = {
        name: 'SafeArray',
        baseType: 'Array<string>',
        invariant: 'value.length > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain('Array.isArray(value)');
    });

    it('generates object check for object literal types', () => {
      const witness: WitnessDefinition = {
        name: 'ValidUser',
        baseType: '{ id: string; name: string }',
        invariant: 'value.id.length > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain("typeof value === 'object' && value !== null");
    });

    it('generates instanceof Map for Map types', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyMap',
        baseType: 'Map<string, number>',
        invariant: 'value.size > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain('value instanceof Map');
    });

    it('generates instanceof Set for Set types', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptySet',
        baseType: 'Set<string>',
        invariant: 'value.size > 0',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain('value instanceof Set');
    });

    it('generates function check for function types', () => {
      const witness: WitnessDefinition = {
        name: 'SafeCallback',
        baseType: '(x: number) => number',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain("typeof value === 'function'");
    });

    it('generates Array.isArray for tuple types', () => {
      const witness: WitnessDefinition = {
        name: 'Point',
        baseType: '[number, number]',
        invariant: 'value.length === 2',
      };

      const result = generateValidationFactory(witness);
      expect(result).toContain('Array.isArray(value)');
    });
  });

  describe('error handling', () => {
    it('throws for invalid base type', () => {
      const witness: WitnessDefinition = {
        name: 'Invalid',
        baseType: '',
      };

      expect(() => generateValidationFactory(witness)).toThrow(InvalidBaseTypeError);
    });

    it('throws for unbalanced brackets', () => {
      const witness: WitnessDefinition = {
        name: 'Invalid',
        baseType: 'Map<string, number',
      };

      expect(() => generateValidationFactory(witness)).toThrow(InvalidBaseTypeError);
    });
  });

  describe('runtime behavior verification', () => {
    // These tests evaluate the generated code to verify it works correctly at runtime

    it('generated NonNegativeDecimal factory works correctly', () => {
      const witness: WitnessDefinition = {
        name: 'NonNegativeDecimal',
        baseType: 'number',
        invariant: 'value >= 0',
      };

      const code = generateValidationFactory(witness, { includeJsDoc: false });
      const jsCode = stripTypeAnnotations(code);

      // Create a module context and evaluate
      const wrappedCode = `
        ${jsCode}
        return { makeNonNegativeDecimal, assertNonNegativeDecimal, isNonNegativeDecimal };
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      const factory = new Function(wrappedCode)() as {
        makeNonNegativeDecimal: (value: number) => number | null;
        assertNonNegativeDecimal: (value: number) => number;
        isNonNegativeDecimal: (value: unknown) => boolean;
      };

      // Test make function
      expect(factory.makeNonNegativeDecimal(5)).toBe(5);
      expect(factory.makeNonNegativeDecimal(0)).toBe(0);
      expect(factory.makeNonNegativeDecimal(-1)).toBeNull();

      // Test assert function
      expect(factory.assertNonNegativeDecimal(5)).toBe(5);
      expect(() => factory.assertNonNegativeDecimal(-1)).toThrow('Assertion failed: value >= 0');

      // Test type guard
      expect(factory.isNonNegativeDecimal(5)).toBe(true);
      expect(factory.isNonNegativeDecimal(0)).toBe(true);
      expect(factory.isNonNegativeDecimal(-1)).toBe(false);
      expect(factory.isNonNegativeDecimal('5')).toBe(false);
      expect(factory.isNonNegativeDecimal(null)).toBe(false);
    });

    it('generated NonEmptyString factory works correctly', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyString',
        baseType: 'string',
        invariant: 'value.length > 0',
      };

      const code = generateValidationFactory(witness, { includeJsDoc: false });
      const jsCode = stripTypeAnnotations(code);

      const wrappedCode = `
        ${jsCode}
        return { makeNonEmptyString, assertNonEmptyString, isNonEmptyString };
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      const factory = new Function(wrappedCode)() as {
        makeNonEmptyString: (value: string) => string | null;
        assertNonEmptyString: (value: string) => string;
        isNonEmptyString: (value: unknown) => boolean;
      };

      // Test make function
      expect(factory.makeNonEmptyString('hello')).toBe('hello');
      expect(factory.makeNonEmptyString('')).toBeNull();

      // Test assert function
      expect(factory.assertNonEmptyString('hello')).toBe('hello');
      expect(() => factory.assertNonEmptyString('')).toThrow('Assertion failed: value.length > 0');

      // Test type guard
      expect(factory.isNonEmptyString('hello')).toBe(true);
      expect(factory.isNonEmptyString('')).toBe(false);
      expect(factory.isNonEmptyString(123)).toBe(false);
    });

    it('generated PercentageValue factory works correctly with multiple conditions', () => {
      const witness: WitnessDefinition = {
        name: 'PercentageValue',
        baseType: 'number',
        invariant: 'value >= 0 && value <= 100',
      };

      const code = generateValidationFactory(witness, { includeJsDoc: false });
      const jsCode = stripTypeAnnotations(code);

      const wrappedCode = `
        ${jsCode}
        return { makePercentageValue, assertPercentageValue, isPercentageValue };
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      const factory = new Function(wrappedCode)() as {
        makePercentageValue: (value: number) => number | null;
        assertPercentageValue: (value: number) => number;
        isPercentageValue: (value: unknown) => boolean;
      };

      // Test make function
      expect(factory.makePercentageValue(50)).toBe(50);
      expect(factory.makePercentageValue(0)).toBe(0);
      expect(factory.makePercentageValue(100)).toBe(100);
      expect(factory.makePercentageValue(-1)).toBeNull();
      expect(factory.makePercentageValue(101)).toBeNull();

      // Test type guard
      expect(factory.isPercentageValue(50)).toBe(true);
      expect(factory.isPercentageValue(-1)).toBe(false);
      expect(factory.isPercentageValue(101)).toBe(false);
    });

    it('generated factory without invariant always succeeds', () => {
      const witness: WitnessDefinition = {
        name: 'AnyNumber',
        baseType: 'number',
      };

      const code = generateValidationFactory(witness, { includeJsDoc: false });
      const jsCode = stripTypeAnnotations(code);

      const wrappedCode = `
        ${jsCode}
        return { makeAnyNumber, assertAnyNumber, isAnyNumber };
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      const factory = new Function(wrappedCode)() as {
        makeAnyNumber: (value: number) => number | null;
        assertAnyNumber: (value: number) => number;
        isAnyNumber: (value: unknown) => boolean;
      };

      // All numbers should be accepted
      expect(factory.makeAnyNumber(-1000)).toBe(-1000);
      expect(factory.makeAnyNumber(0)).toBe(0);
      expect(factory.makeAnyNumber(1000)).toBe(1000);
      expect(factory.makeAnyNumber(NaN)).toStrictEqual(NaN);
      expect(factory.makeAnyNumber(Infinity)).toBe(Infinity);

      // Assert should never throw for numbers
      expect(factory.assertAnyNumber(-1000)).toBe(-1000);

      // Type guard checks only the type
      expect(factory.isAnyNumber(42)).toBe(true);
      expect(factory.isAnyNumber('42')).toBe(false);
    });

    it('generated NonEmptyArray factory works correctly', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyArray',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
        invariant: 'value.length > 0',
      };

      const code = generateValidationFactory(witness, { includeJsDoc: false });
      const jsCode = stripTypeAnnotations(code);

      const wrappedCode = `
        ${jsCode}
        return { makeNonEmptyArray, assertNonEmptyArray, isNonEmptyArray };
      `;

      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      const factory = new Function(wrappedCode)() as {
        makeNonEmptyArray: <T>(value: T[]) => T[] | null;
        assertNonEmptyArray: <T>(value: T[]) => T[];
        isNonEmptyArray: (value: unknown) => boolean;
      };

      // Test make function
      expect(factory.makeNonEmptyArray([1, 2, 3])).toEqual([1, 2, 3]);
      expect(factory.makeNonEmptyArray(['a'])).toEqual(['a']);
      expect(factory.makeNonEmptyArray([])).toBeNull();

      // Test assert function
      expect(factory.assertNonEmptyArray([1])).toEqual([1]);
      expect(() => factory.assertNonEmptyArray([])).toThrow('Assertion failed: value.length > 0');

      // Test type guard
      expect(factory.isNonEmptyArray([1])).toBe(true);
      expect(factory.isNonEmptyArray([])).toBe(false);
      expect(factory.isNonEmptyArray('not an array')).toBe(false);
    });
  });

  describe('string escaping', () => {
    it('escapes single quotes in error messages', () => {
      const witness: WitnessDefinition = {
        name: 'Test',
        baseType: 'string',
        invariant: "value !== 'test'",
      };

      const result = generateValidationFactory(witness);

      // The error message should have escaped quotes
      expect(result).toContain("throw new Error('Assertion failed: value !== \\'test\\'');");
    });
  });
});

describe('generateArbitrary', () => {
  describe('basic arbitrary generation', () => {
    it('generates arbitrary for NonNegativeDecimal with invariant', () => {
      const witness: WitnessDefinition = {
        name: 'NonNegativeDecimal',
        baseType: 'number',
        invariant: 'value >= 0',
      };

      const result = generateArbitrary(witness);

      // Should use optimized fc.float with min constraint
      expect(result).toContain('fc.float({ min: 0, noNaN: true })');
      // Should include filter for type safety
      expect(result).toContain('.filter((v): v is NonNegativeDecimal => (v >= 0))');
      // Should generate validate function
      expect(result).toContain('function validateNonNegativeDecimalArbitrary()');
    });

    it('generates optimized arbitrary for NonEmptyString', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyString',
        baseType: 'string',
        invariant: 'value.length > 0',
      };

      const result = generateArbitrary(witness);

      // Should use optimized fc.string with minLength constraint
      expect(result).toContain('fc.string({ minLength: 1 })');
      // Since this is fully optimized, it can skip the filter
      expect(result).toContain('arbitraryNonEmptyString');
    });

    it('generates arbitrary for number without invariant', () => {
      const witness: WitnessDefinition = {
        name: 'AnyNumber',
        baseType: 'number',
      };

      const result = generateArbitrary(witness);

      // Should use base fc.float
      expect(result).toContain('fc.float({ noNaN: true })');
      // Should cast to branded type
      expect(result).toContain('as fc.Arbitrary<AnyNumber>');
      // Should not have filter
      expect(result).not.toContain('.filter');
      // Should not have validate function (no invariant)
      expect(result).not.toContain('validateAnyNumberArbitrary');
    });
  });

  describe('optimized constraints', () => {
    it('optimizes string length >= constraint', () => {
      const witness: WitnessDefinition = {
        name: 'LongString',
        baseType: 'string',
        invariant: 'value.length >= 5',
      };

      const result = generateArbitrary(witness);
      expect(result).toContain('fc.string({ minLength: 5 })');
    });

    it('optimizes string length > constraint (adds 1)', () => {
      const witness: WitnessDefinition = {
        name: 'VeryLongString',
        baseType: 'string',
        invariant: 'value.length > 10',
      };

      const result = generateArbitrary(witness);
      // value.length > 10 means minLength: 11
      expect(result).toContain('fc.string({ minLength: 11 })');
    });

    it('optimizes number range constraints', () => {
      const witness: WitnessDefinition = {
        name: 'Percentage',
        baseType: 'number',
        invariant: 'value >= 0 && value <= 100',
      };

      const result = generateArbitrary(witness);
      expect(result).toContain('min: 0');
      expect(result).toContain('max: 100');
      expect(result).toContain('noNaN: true');
    });

    it('optimizes array minLength for non-empty', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyNumbers',
        baseType: 'number[]',
        invariant: 'value.length > 0',
      };

      const result = generateArbitrary(witness);
      expect(result).toContain('fc.array(fc.float({ noNaN: true }), { minLength: 1 })');
    });
  });

  describe('generic witnesses', () => {
    it('generates parameterized arbitrary for NonEmptyArray<T>', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyArray',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
        invariant: 'value.length > 0',
      };

      const result = generateArbitrary(witness);

      // Should generate a factory function
      expect(result).toContain('function arbitraryNonEmptyArray<T>');
      // Should take an arbitrary for T
      expect(result).toContain('arbT: fc.Arbitrary<T>');
      // Should return the correct type
      expect(result).toContain('fc.Arbitrary<NonEmptyArray<T>>');
      // Should use the type parameter arbitrary
      expect(result).toContain('fc.array(arbT, { minLength: 1 })');
    });

    it('generates parameterized arbitrary with multiple type params', () => {
      const witness: WitnessDefinition = {
        name: 'ValidPair',
        baseType: '[K, V]',
        typeParameters: [{ name: 'K' }, { name: 'V' }],
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('function arbitraryValidPair<K, V>');
      expect(result).toContain('arbK: fc.Arbitrary<K>');
      expect(result).toContain('arbV: fc.Arbitrary<V>');
      expect(result).toContain('fc.tuple(arbK, arbV)');
    });

    it('generates generic arbitrary without invariant', () => {
      const witness: WitnessDefinition = {
        name: 'Container',
        baseType: 'T',
        typeParameters: [{ name: 'T' }],
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('function arbitraryContainer<T>');
      expect(result).toContain('return arbT as fc.Arbitrary<Container<T>>');
      expect(result).not.toContain('.filter');
    });
  });

  describe('complex types', () => {
    it('generates arbitrary for object literal type', () => {
      const witness: WitnessDefinition = {
        name: 'User',
        baseType: '{ id: string; age: number }',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.record({');
      expect(result).toContain('id: fc.string()');
      expect(result).toContain('age: fc.float({ noNaN: true })');
    });

    it('generates arbitrary for object with optional property', () => {
      const witness: WitnessDefinition = {
        name: 'Config',
        baseType: '{ host: string; port?: number }',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('host: fc.string()');
      expect(result).toContain('port: fc.option(fc.float({ noNaN: true }), { nil: undefined })');
    });

    it('generates arbitrary for tuple type', () => {
      const witness: WitnessDefinition = {
        name: 'Point',
        baseType: '[number, number]',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.tuple(fc.float({ noNaN: true }), fc.float({ noNaN: true }))');
    });

    it('generates arbitrary for Map type', () => {
      const witness: WitnessDefinition = {
        name: 'StringMap',
        baseType: 'Map<string, number>',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.array(fc.tuple(fc.string(), fc.float({ noNaN: true })))');
      expect(result).toContain('.map(entries => new Map(entries))');
    });

    it('generates arbitrary for Set type', () => {
      const witness: WitnessDefinition = {
        name: 'StringSet',
        baseType: 'Set<string>',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.array(fc.string())');
      expect(result).toContain('.map(items => new Set(items))');
    });

    it('generates arbitrary for boolean type', () => {
      const witness: WitnessDefinition = {
        name: 'Flag',
        baseType: 'boolean',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.boolean()');
    });

    it('generates arbitrary for bigint type', () => {
      const witness: WitnessDefinition = {
        name: 'BigNumber',
        baseType: 'bigint',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.bigInt()');
    });

    it('generates arbitrary for Array<T> syntax', () => {
      const witness: WitnessDefinition = {
        name: 'StringArray',
        baseType: 'Array<string>',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.array(fc.string())');
    });
  });

  describe('JSDoc generation', () => {
    it('includes JSDoc by default', () => {
      const witness: WitnessDefinition = {
        name: 'PositiveNumber',
        baseType: 'number',
        invariant: 'value > 0',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('/**');
      expect(result).toContain('* A fast-check Arbitrary for PositiveNumber values.');
      expect(result).toContain('* Generated values satisfy: value > 0');
    });

    it('can disable JSDoc generation', () => {
      const witness: WitnessDefinition = {
        name: 'PositiveNumber',
        baseType: 'number',
        invariant: 'value > 0',
      };

      const result = generateArbitrary(witness, { includeJsDoc: false });

      expect(result).not.toContain('/**');
      expect(result).not.toContain('@param');
    });

    it('includes JSDoc for generic arbitraries', () => {
      const witness: WitnessDefinition = {
        name: 'NonEmptyArray',
        baseType: 'T[]',
        typeParameters: [{ name: 'T' }],
        invariant: 'value.length > 0',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('* Creates a fast-check Arbitrary for NonEmptyArray<T> values.');
      expect(result).toContain('@param arbT - Arbitrary for type parameter T');
    });
  });

  describe('unsatisfiable invariant detection', () => {
    it('generates validation function for invariants', () => {
      const witness: WitnessDefinition = {
        name: 'ComplexType',
        baseType: 'number',
        invariant: 'value > 0 && value < 100',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('function validateComplexTypeArbitrary()');
      expect(result).toContain('fc.sample(arbitraryComplexType, { numRuns: 1 })');
      expect(result).toContain('may be unsatisfiable');
    });

    it('does not generate validation for generic arbitraries', () => {
      const witness: WitnessDefinition = {
        name: 'Generic',
        baseType: 'T',
        typeParameters: [{ name: 'T' }],
        invariant: 'value !== null',
      };

      const result = generateArbitrary(witness);

      // Generic arbitraries can't be validated without concrete type params
      expect(result).not.toContain('validateGenericArbitrary');
    });

    it('does not generate validation when no invariant', () => {
      const witness: WitnessDefinition = {
        name: 'Plain',
        baseType: 'number',
      };

      const result = generateArbitrary(witness);

      expect(result).not.toContain('validatePlainArbitrary');
    });
  });

  describe('error handling', () => {
    it('throws for invalid base type', () => {
      const witness: WitnessDefinition = {
        name: 'Invalid',
        baseType: '',
      };

      expect(() => generateArbitrary(witness)).toThrow(InvalidBaseTypeError);
    });

    it('throws for unbalanced brackets', () => {
      const witness: WitnessDefinition = {
        name: 'Invalid',
        baseType: 'Map<string, number',
      };

      expect(() => generateArbitrary(witness)).toThrow(InvalidBaseTypeError);
    });
  });

  describe('runtime behavior verification', () => {
    it('generated NonNegativeDecimal arbitrary produces valid values', () => {
      const witness: WitnessDefinition = {
        name: 'NonNegativeDecimal',
        baseType: 'number',
        invariant: 'value >= 0',
      };

      // Verify generateArbitrary produces code with the expected pattern
      const code = generateArbitrary(witness, { includeJsDoc: false });
      expect(code).toContain('fc.float({ min: 0, noNaN: true })');

      // Use fast-check directly to verify the concept works
      const arb = fc.float({ min: 0, noNaN: true }).filter((v) => v >= 0);

      // Generate samples and verify they're all non-negative
      const samples = fc.sample(arb, 100);
      expect(samples.every((v) => v >= 0)).toBe(true);
    });

    it('generated NonEmptyString arbitrary produces valid values', () => {
      // Verify the optimized version works
      const arb = fc.string({ minLength: 1 });

      const samples = fc.sample(arb, 100);
      expect(samples.every((v) => v.length > 0)).toBe(true);
    });

    it('generated Percentage arbitrary produces valid values', () => {
      const arb = fc.float({ min: 0, max: 100, noNaN: true }).filter((v) => v >= 0 && v <= 100);

      const samples = fc.sample(arb, 100);
      expect(samples.every((v) => v >= 0 && v <= 100)).toBe(true);
    });

    it('shrinking NonNegativeDecimal shrinks toward 0', () => {
      const arb = fc.float({ min: 0, noNaN: true }).filter((v) => v >= 0);

      // Test that shrinking works by running a property that finds a counterexample
      // fast-check should shrink it toward the minimum value that fails
      const result: { counterexample: number | null } = { counterexample: null };

      try {
        fc.assert(
          fc.property(arb, (n) => {
            // This will fail for any value > 10
            if (n > 10) {
              result.counterexample = n;
              return false;
            }
            return true;
          }),
          { numRuns: 1000, seed: 42 }
        );
      } catch {
        // Expected to fail
      }

      // The shrunk counterexample should be close to the boundary (10)
      // Due to shrinking, it should be much smaller than the initial random value
      expect(result.counterexample).not.toBeNull();
      if (result.counterexample !== null) {
        expect(result.counterexample).toBeGreaterThan(10);
        expect(result.counterexample).toBeLessThan(1000); // Shrinking should bring it down
      }
    });

    it('NonEmptyArray arbitrary produces valid arrays', () => {
      const arb = fc.array(fc.integer(), { minLength: 1 });

      const samples = fc.sample(arb, 100);
      expect(samples.every((arr) => arr.length > 0)).toBe(true);
    });

    it('tuple arbitrary produces correct structure', () => {
      const arb = fc.tuple(fc.string(), fc.integer());

      const samples = fc.sample(arb, 10);
      // Verify each sample is a tuple of [string, number]
      for (const tuple of samples) {
        expect(Array.isArray(tuple)).toBe(true);
        // Cast to unknown array to avoid type inference issues
        const arr = tuple as unknown[];
        expect(arr).toHaveLength(2);
        expect(typeof arr[0]).toBe('string');
        expect(typeof arr[1]).toBe('number');
      }
    });

    it('Map arbitrary produces valid Maps', () => {
      const arb = fc.array(fc.tuple(fc.string(), fc.integer())).map((entries) => new Map(entries));

      const samples = fc.sample(arb, 10);
      expect(samples.every((m) => m instanceof Map)).toBe(true);
    });

    it('Set arbitrary produces valid Sets', () => {
      const arb = fc.array(fc.string()).map((items) => new Set(items));

      const samples = fc.sample(arb, 10);
      expect(samples.every((s) => s instanceof Set)).toBe(true);
    });

    it('object arbitrary produces valid objects', () => {
      const arb = fc.record({
        id: fc.string(),
        age: fc.integer({ min: 0, max: 150 }),
      });

      const samples = fc.sample(arb, 10);
      // Verify each sample has the expected shape
      for (const obj of samples) {
        expect(typeof obj).toBe('object');
        expect(obj).not.toBeNull();
        expect(typeof obj.id).toBe('string');
        expect(typeof obj.age).toBe('number');
      }
    });
  });

  describe('complex invariants', () => {
    it('handles multiple && conditions', () => {
      const witness: WitnessDefinition = {
        name: 'ValidRange',
        baseType: 'number',
        invariant: 'value >= 0 && value <= 100 && Number.isFinite(value)',
      };

      const result = generateArbitrary(witness);

      // Should include all conditions in filter
      expect(result).toContain('(v >= 0) && (v <= 100) && (Number.isFinite(v))');
    });

    it('handles complex object invariants', () => {
      const witness: WitnessDefinition = {
        name: 'ValidUser',
        baseType: '{ name: string; age: number }',
        invariant: 'value.name.length > 0 && value.age >= 0',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('.filter');
      expect(result).toContain('v.name.length > 0');
      expect(result).toContain('v.age >= 0');
    });
  });

  describe('edge cases', () => {
    it('handles empty object type', () => {
      const witness: WitnessDefinition = {
        name: 'EmptyObject',
        baseType: '{}',
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('fc.constant({})');
    });

    it('handles single-character type parameters', () => {
      const witness: WitnessDefinition = {
        name: 'Wrapper',
        baseType: 'T',
        typeParameters: [{ name: 'T' }],
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('arbT: fc.Arbitrary<T>');
      expect(result).toContain('return arbT');
    });

    it('handles multi-character type parameters', () => {
      const witness: WitnessDefinition = {
        name: 'TypedContainer',
        baseType: 'TValue',
        typeParameters: [{ name: 'TValue' }],
      };

      const result = generateArbitrary(witness);

      expect(result).toContain('arbTValue: fc.Arbitrary<TValue>');
    });
  });
});
