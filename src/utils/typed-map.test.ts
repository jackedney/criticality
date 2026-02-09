import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TypedMap } from './typed-map.js';

describe('TypedMap', () => {
  describe('constructor', () => {
    it('should create an empty TypedMap', () => {
      const map = new TypedMap<string, number>();
      expect(map.size).toBe(0);
    });
  });

  describe('fromEntries', () => {
    it('should create a TypedMap from an iterable of entries', () => {
      const entries: [string, number][] = [
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ];
      const map = TypedMap.fromEntries(entries);
      expect(map.size).toBe(3);
      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
      expect(map.get('c')).toBe(3);
    });

    it('should create a TypedMap from an empty iterable', () => {
      const map = TypedMap.fromEntries<string, number>([]);
      expect(map.size).toBe(0);
    });
  });

  describe('fromObject', () => {
    it('should create a TypedMap from a plain object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const map = TypedMap.fromObject(obj);
      expect(map.size).toBe(3);
      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
      expect(map.get('c')).toBe(3);
    });

    it('should create a TypedMap from an empty object', () => {
      const map = TypedMap.fromObject({});
      expect(map.size).toBe(0);
    });

    it('should preserve value types', () => {
      const obj = { a: 'hello', b: true, c: 42 };
      const map = TypedMap.fromObject(obj);
      expect(map.get('a')).toBe('hello');
      expect(map.get('b')).toBe(true);
      expect(map.get('c')).toBe(42);
    });
  });

  describe('get', () => {
    it('should return the value for an existing key', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
    });

    it('should return undefined for a non-existent key', () => {
      const map = TypedMap.fromObject({ a: 1 });
      expect(map.get('z')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should add a new key-value pair', () => {
      const map = new TypedMap<string, number>();
      map.set('a', 1);
      expect(map.get('a')).toBe(1);
      expect(map.size).toBe(1);
    });

    it('should update an existing key-value pair', () => {
      const map = TypedMap.fromObject({ a: 1 });
      map.set('a', 2);
      expect(map.get('a')).toBe(2);
      expect(map.size).toBe(1);
    });

    it('should support method chaining', () => {
      const map = new TypedMap<string, number>();
      const result = map.set('a', 1).set('b', 2).set('c', 3);
      expect(result).toBe(map);
      expect(map.size).toBe(3);
    });
  });

  describe('has', () => {
    it('should return true for an existing key', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      expect(map.has('a')).toBe(true);
      expect(map.has('b')).toBe(true);
    });

    it('should return false for a non-existent key', () => {
      const map = TypedMap.fromObject({ a: 1 });
      expect(map.has('z')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove an existing key', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      const result = map.delete('a');
      expect(result).toBe(true);
      expect(map.has('a')).toBe(false);
      expect(map.size).toBe(1);
    });

    it('should return false for a non-existent key', () => {
      const map = TypedMap.fromObject({ a: 1 });
      const result = map.delete('z');
      expect(result).toBe(false);
      expect(map.size).toBe(1);
    });
  });

  describe('entries', () => {
    it('should return an iterable of all entries', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const entries = Array.from(map.entries());
      expect(entries.length).toBe(3);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      expect(entries).toContainEqual(['c', 3]);
    });

    it('should return an empty iterable for an empty map', () => {
      const map = new TypedMap<string, number>();
      const entries = Array.from(map.entries());
      expect(entries.length).toBe(0);
    });
  });

  describe('keys', () => {
    it('should return an iterable of all keys', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const keys = Array.from(map.keys());
      expect(keys.length).toBe(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should return an empty iterable for an empty map', () => {
      const map = new TypedMap<string, number>();
      const keys = Array.from(map.keys());
      expect(keys.length).toBe(0);
    });
  });

  describe('values', () => {
    it('should return an iterable of all values', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const values = Array.from(map.values());
      expect(values.length).toBe(3);
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);
    });

    it('should return an empty iterable for an empty map', () => {
      const map = new TypedMap<string, number>();
      const values = Array.from(map.values());
      expect(values.length).toBe(0);
    });
  });

  describe('forEach', () => {
    it('should call the callback for each entry', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const entries: [string, number][] = [];
      map.forEach((value: number, key: string) => {
        entries.push([key, value]);
      });
      expect(entries.length).toBe(3);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      expect(entries).toContainEqual(['c', 3]);
    });

    it('should not call the callback for an empty map', () => {
      const map = new TypedMap<string, number>();
      let callCount = 0;
      map.forEach(() => {
        callCount++;
      });
      expect(callCount).toBe(0);
    });

    it('should respect thisArg parameter', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      const accumulator: Record<string, number> = {};
      const thisArg = { multiplier: 10 };
      map.forEach(function (this: typeof thisArg, value: number, key: string) {
        accumulator[key] = value * this.multiplier;
      }, thisArg);
      expect(accumulator).toEqual({ a: 10, b: 20 });
    });

    it('should match native Map forEach behavior with thisArg', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      const nativeMap = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const thisArg = { value: 'test' };

      const typedMapThisValues: string[] = [];
      const nativeMapThisValues: string[] = [];

      map.forEach(function (this: typeof thisArg) {
        typedMapThisValues.push(this.value);
      }, thisArg);

      nativeMap.forEach(function (this: typeof thisArg) {
        nativeMapThisValues.push(this.value);
      }, thisArg);

      expect(typedMapThisValues).toEqual(nativeMapThisValues);
      expect(typedMapThisValues).toEqual(['test', 'test']);
    });
  });

  describe('size', () => {
    it('should return the correct size', () => {
      const map = new TypedMap<string, number>();
      expect(map.size).toBe(0);
      map.set('a', 1);
      expect(map.size).toBe(1);
      map.set('b', 2);
      expect(map.size).toBe(2);
      map.delete('a');
      expect(map.size).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      expect(map.size).toBe(3);
      map.clear();
      expect(map.size).toBe(0);
      expect(map.get('a')).toBeUndefined();
      expect(map.get('b')).toBeUndefined();
      expect(map.get('c')).toBeUndefined();
    });
  });

  describe('toObject', () => {
    it('should convert TypedMap to a plain object', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const obj = map.toObject();
      expect(obj).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should convert empty TypedMap to empty object', () => {
      const map = new TypedMap<string, number>();
      const obj = map.toObject();
      expect(obj).toEqual({});
    });

    it('should stringify non-string keys', () => {
      const map = TypedMap.fromEntries<number, string>([
        [1, 'one'],
        [2, 'two'],
      ]);
      const obj = map.toObject();
      expect(obj).toEqual({ '1': 'one', '2': 'two' });
    });
  });

  describe('Symbol.iterator', () => {
    it('should support for...of iteration', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2, c: 3 });
      const entries: [string, number][] = [];
      for (const entry of map) {
        entries.push(entry);
      }
      expect(entries.length).toBe(3);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      expect(entries).toContainEqual(['c', 3]);
    });

    it('should support destructuring', () => {
      const map = TypedMap.fromObject({ a: 1, b: 2 });
      const [entry1, entry2] = Array.from(map);
      if (entry1 && entry2) {
        const [key1, val1] = entry1;
        const [key2, val2] = entry2;
        expect(key1).toBe('a');
        expect(val1).toBe(1);
        expect(key2).toBe('b');
        expect(val2).toBe(2);
      }
    });
  });

  describe('type safety', () => {
    it('should enforce key type at compile time', () => {
      const map = new TypedMap<string, number>();
      const key: unknown = 123;
      // @ts-expect-error - Testing type error: key must be string
      map.set(key, 1);
    });

    it('should enforce value type at compile time', () => {
      const map = new TypedMap<string, number>();
      const value: unknown = 'value';
      // @ts-expect-error - Testing type error: value must be number
      map.set('key', value);
    });
  });

  describe('Property-based tests', () => {
    describe('fromObject/toObject round-trip', () => {
      // Keys that would cause prototype pollution and are rejected by toObject()
      const FORBIDDEN_KEYS = ['__proto__', 'constructor'];

      it('TypedMap.fromObject(obj).toObject() equals original for random objects', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.tuple(
                fc.string().filter((s) => !FORBIDDEN_KEYS.includes(s)),
                fc.integer()
              )
            ),
            (entries) => {
              const obj: Record<string, number> = {};
              for (const [key, value] of entries) {
                // eslint-disable-next-line security/detect-object-injection -- safe: keys from fast-check generated values
                obj[key] = value;
              }
              const map = TypedMap.fromObject(obj);
              const result = map.toObject();
              expect(result).toEqual(obj);
            }
          )
        );
      });

      it('toObject() throws for __proto__ key', () => {
        const map = new TypedMap<string, number>();
        map.set('__proto__', 42);
        expect(() => map.toObject()).toThrow('prototype pollution');
      });

      it('toObject() throws for constructor key', () => {
        const map = new TypedMap<string, number>();
        map.set('constructor', 42);
        expect(() => map.toObject()).toThrow('prototype pollution');
      });
    });

    describe('fromEntries', () => {
      it('TypedMap.fromEntries size equals unique key count', () => {
        fc.assert(
          fc.property(fc.array(fc.tuple(fc.string(), fc.integer())), (entries) => {
            const uniqueKeys = new Set(entries.map(([key]) => key));
            const map = TypedMap.fromEntries(entries);
            expect(map.size).toBe(uniqueKeys.size);
          })
        );
      });

      it('handles duplicate keys by using last value', () => {
        fc.assert(
          fc.property(
            fc.string(),
            fc.array(fc.tuple(fc.string(), fc.integer())),
            (duplicateKey, otherEntries) => {
              const filteredEntries = otherEntries.filter(([key]) => key !== duplicateKey);
              const entries: [string, number][] = [
                [duplicateKey, 1],
                [duplicateKey, 2],
                ...filteredEntries,
              ];
              const map = TypedMap.fromEntries(entries);
              expect(map.get(duplicateKey)).toBe(2);
            }
          )
        );
      });
    });

    describe('has/get consistency', () => {
      it('has(key) consistent with get(key) !== undefined', () => {
        fc.assert(
          fc.property(
            fc.array(fc.tuple(fc.string(), fc.integer())),
            fc.string(),
            (entries, lookupKey) => {
              const obj: Record<string, number> = {};
              for (const [key, value] of entries) {
                // eslint-disable-next-line security/detect-object-injection -- safe: keys from fast-check generated values
                obj[key] = value;
              }
              const map = TypedMap.fromObject(obj);
              expect(map.has(lookupKey)).toBe(map.get(lookupKey) !== undefined);
            }
          )
        );
      });
    });
  });
});
