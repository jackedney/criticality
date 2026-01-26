/**
 * Tests for the witness generation module.
 *
 * @module adapters/typescript/witness.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateBrandedType,
  generateValidationFactory,
  InvalidBaseTypeError,
  type WitnessDefinition,
} from './witness.js';

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
