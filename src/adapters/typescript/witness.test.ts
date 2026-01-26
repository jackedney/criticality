/**
 * Tests for the witness generation module.
 *
 * @module adapters/typescript/witness.test
 */

import { describe, it, expect } from 'vitest';
import { generateBrandedType, InvalidBaseTypeError, type WitnessDefinition } from './witness.js';

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
