/**
 * Type-safe Map wrapper utilities.
 *
 * This module provides a TypedMap class that wraps JavaScript's built-in Map
 * with enforced key and value types. This prevents ESLint security warnings
 * about dynamic object property access and provides compile-time type safety.
 *
 * Security Rationale:
 * - Object indexing with dynamic keys (e.g., obj[userInput] = value) can lead to
 *   prototype pollution or unintended property access
 * - The TypedMap enforces key/value types at compile time and provides safe
 *   methods for dynamic key access without the security risks of plain objects
 * - This prevents accidental or malicious manipulation of object prototypes
 *
 * @packageDocumentation
 */

/**
 * Type-safe Map wrapper with enforced key and value types.
 *
 * TypedMap provides a thin wrapper around JavaScript's Map that ensures
 * type safety for keys and values while preventing ESLint security warnings
 * about dynamic object indexing.
 *
 * @example
 * ```ts
 * // Create a TypedMap from an object
 * const map = TypedMap.fromObject({ a: 1, b: 2 });
 * // map is TypedMap<string, number>
 *
 * // Type-safe operations
 * map.set('c', 3);  // OK
 * map.get('a');     // Returns number | undefined
 * map.has('b');     // Returns boolean
 *
 * // Type errors caught at compile time
 * map.set(123, 'value');  // TypeScript error: key must be string
 * ```
 *
 * @template K - The type of keys in the map.
 * @template V - The type of values in the map.
 */
export class TypedMap<K, V> {
  private readonly map: Map<K, V>;

  /**
   * Creates an empty TypedMap.
   *
   * @example
   * ```ts
   * const map = new TypedMap<string, number>();
   * ```
   */
  constructor() {
    this.map = new Map<K, V>();
  }

  /**
   * Creates a TypedMap from an iterable of entries.
   *
   * @param entries - An iterable of [key, value] tuples.
   * @example
   * ```ts
   * const map = TypedMap.fromEntries([
   *   ['a', 1],
   *   ['b', 2]
   * ]);
   * ```
   */
  static fromEntries<K, V>(entries: Iterable<[K, V]>): TypedMap<K, V> {
    const typedMap = new TypedMap<K, V>();
    for (const [key, value] of entries) {
      typedMap.map.set(key, value);
    }
    return typedMap;
  }

  /**
   * Creates a TypedMap from a plain object.
   *
   * This is useful for migrating code from plain objects to type-safe maps.
   * Only string keys are supported since JavaScript object keys are always strings.
   *
   * @param obj - The plain object to convert.
   * @returns A new TypedMap with the object's entries.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.get('a');  // Returns 1
   * ```
   */
  static fromObject<V>(obj: Record<string, V>): TypedMap<string, V> {
    const typedMap = new TypedMap<string, V>();
    for (const [key, value] of Object.entries(obj)) {
      typedMap.map.set(key, value);
    }
    return typedMap;
  }

  /**
   * Returns the value associated with the specified key, or undefined if not found.
   *
   * @param key - The key to look up.
   * @returns The value associated with the key, or undefined if not found.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.get('a');  // Returns 1
   * map.get('c');  // Returns undefined
   * ```
   */
  get(key: K): V | undefined {
    return this.map.get(key);
  }

  /**
   * Sets a value for the specified key in the map.
   *
   * @param key - The key to set.
   * @param value - The value to associate with the key.
   * @returns The TypedMap instance for method chaining.
   * @example
   * ```ts
   * const map = new TypedMap<string, number>();
   * map.set('a', 1).set('b', 2);
   * ```
   */
  set(key: K, value: V): this {
    this.map.set(key, value);
    return this;
  }

  /**
   * Checks if the map contains a value for the specified key.
   *
   * @param key - The key to check.
   * @returns True if the key exists in the map, false otherwise.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.has('a');  // Returns true
   * map.has('c');  // Returns false
   * ```
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Removes the entry with the specified key from the map.
   *
   * @param key - The key to remove.
   * @returns True if the key existed and was removed, false otherwise.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.delete('a');  // Returns true
   * map.delete('c');  // Returns false
   * ```
   */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * Returns an iterable of [key, value] pairs for every entry in the map.
   *
   * @returns An iterable of entries.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * for (const [key, value] of map.entries()) {
   *   console.log(key, value);  // 'a', 1 then 'b', 2
   * }
   * ```
   */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  /**
   * Returns an iterable of keys in the map.
   *
   * @returns An iterable of keys.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * for (const key of map.keys()) {
   *   console.log(key);  // 'a' then 'b'
   * }
   * ```
   */
  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  /**
   * Returns an iterable of values in the map.
   *
   * @returns An iterable of values.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * for (const value of map.values()) {
   *   console.log(value);  // 1 then 2
   * }
   * ```
   */
  values(): IterableIterator<V> {
    return this.map.values();
  }

  /**
   * Executes a provided function once for each key-value pair in the map.
   *
   * @param callbackfn - The function to execute for each entry.
   * @param thisArg - Value to use as `this` when executing the callback.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.forEach((value, key) => {
   *   console.log(key, value);
   * });
   * ```
   */
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.map.forEach(callbackfn, thisArg);
  }

  /**
   * Returns the number of entries in the map.
   *
   * @returns The number of entries.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.size;  // Returns 2
   * ```
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Removes all entries from the map.
   *
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * map.clear();
   * map.size;  // Returns 0
   * ```
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Converts the TypedMap to a plain JavaScript object.
   *
   * This is useful when you need to pass the data to APIs that expect plain objects
   * rather than Map instances.
   *
   * Note: Only works when keys are strings. If K is not string, the returned object
   * will have stringified keys.
   *
   * @returns A plain object with the same entries as the TypedMap.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * const obj = map.toObject();  // { a: 1, b: 2 }
   * ```
   */
  toObject(): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [key, value] of this.map.entries()) {
      obj[String(key)] = value;
    }
    return obj;
  }

  /**
   * Returns an iterable of [key, value] pairs, making TypedMap work with
   * for...of loops and destructuring.
   *
   * @returns An iterable of entries.
   * @example
   * ```ts
   * const map = TypedMap.fromObject({ a: 1, b: 2 });
   * for (const [key, value] of map) {
   *   console.log(key, value);
   * }
   * ```
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }
}
