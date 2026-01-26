/**
 * Integration tests for the TypeScript type checker wrapper.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runTypeCheck, ToolchainNotInstalledError, parseTypeDetails } from './typecheck.js';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../../../test-fixtures');

describe('runTypeCheck', () => {
  describe('clean project', () => {
    it('should return success for a project with no type errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });

  describe('project with type errors', () => {
    it('should return structured errors for type mismatches', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      expect(result.success).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors.length).toBe(result.errorCount);
    });

    it('should include file, line, column, code, and message in errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      expect(result.errors.length).toBeGreaterThan(0);

      for (const error of result.errors) {
        expect(error.file).toBeTruthy();
        expect(error.file).toContain('type-mismatch.ts');
        expect(typeof error.line).toBe('number');
        expect(error.line).toBeGreaterThan(0);
        expect(typeof error.column).toBe('number');
        expect(error.column).toBeGreaterThan(0);
        expect(error.code).toMatch(/^TS\d+$/);
        expect(error.message).toBeTruthy();
      }
    });

    it('should detect TS2322 type assignment error', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      const ts2322Errors = result.errors.filter((e) => e.code === 'TS2322');
      expect(ts2322Errors.length).toBeGreaterThan(0);
    });
  });

  describe('specific file checking', () => {
    it('should check only specified files', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath, {
        files: ['valid.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.errorCount).toBe(0);
    }, 15000); // Extended timeout for file-specific tsc invocation
  });

  describe('custom tsconfig', () => {
    it('should use custom tsconfig.json path', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-clean');
      const result = await runTypeCheck(projectPath, {
        tsconfigPath: 'tsconfig.json',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('ToolchainNotInstalledError', () => {
    it('should have correct error name', () => {
      const error = new ToolchainNotInstalledError('tsc');
      expect(error.name).toBe('ToolchainNotInstalledError');
      expect(error.message).toContain('tsc');
      expect(error.message).toContain('not found in PATH');
    });
  });

  describe('type details extraction', () => {
    it('should extract type details from TS2322 type assignment errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      const ts2322Errors = result.errors.filter((e) => e.code === 'TS2322');
      expect(ts2322Errors.length).toBeGreaterThan(0);

      // Find the 'string' is not assignable to 'number' error
      const stringToNumberError = ts2322Errors.find(
        (e) => e.message.includes('string') && e.message.includes('number')
      );
      expect(stringToNumberError).toBeDefined();
      expect(stringToNumberError?.typeDetails).not.toBeNull();
      expect(stringToNumberError?.typeDetails?.expected).toBe('number');
      expect(stringToNumberError?.typeDetails?.actual).toBe('string');
    });

    it('should extract type details from TS2554 argument count errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      const ts2554Errors = result.errors.filter((e) => e.code === 'TS2554');
      expect(ts2554Errors.length).toBeGreaterThan(0);

      const argError = ts2554Errors[0];
      expect(argError?.typeDetails).not.toBeNull();
      expect(argError?.typeDetails?.expected).toBe('2 arguments');
      expect(argError?.typeDetails?.actual).toBe('1 arguments');
    });

    it('should include typeDetails field in all errors', async () => {
      const projectPath = path.join(FIXTURES_DIR, 'typecheck-errors');
      const result = await runTypeCheck(projectPath);

      for (const error of result.errors) {
        // typeDetails should exist as a property (can be null for unparseable)
        expect(error).toHaveProperty('typeDetails');
      }
    });
  });
});

describe('parseTypeDetails', () => {
  describe('TS2322 - Type not assignable', () => {
    it('should extract types from simple type mismatch', () => {
      const result = parseTypeDetails(
        'TS2322',
        "Type 'string' is not assignable to type 'number'."
      );
      expect(result).toEqual({ expected: 'number', actual: 'string' });
    });

    it('should extract types with complex type names', () => {
      const result = parseTypeDetails(
        'TS2322',
        "Type 'Promise<string>' is not assignable to type 'Observable<number>'."
      );
      expect(result).toEqual({
        expected: 'Observable<number>',
        actual: 'Promise<string>',
      });
    });

    it('should handle union types', () => {
      const result = parseTypeDetails(
        'TS2322',
        "Type 'string | null' is not assignable to type 'string'."
      );
      expect(result).toEqual({
        expected: 'string',
        actual: 'string | null',
      });
    });
  });

  describe('TS2345 - Argument not assignable', () => {
    it('should extract types from argument mismatch', () => {
      const result = parseTypeDetails(
        'TS2345',
        "Argument of type 'number' is not assignable to parameter of type 'string'."
      );
      expect(result).toEqual({ expected: 'string', actual: 'number' });
    });
  });

  describe('TS2304 - Cannot find name', () => {
    it('should extract the undefined name', () => {
      const result = parseTypeDetails('TS2304', "Cannot find name 'unknownVar'.");
      expect(result).toEqual({ expected: 'unknownVar', actual: '<undefined>' });
    });
  });

  describe('TS2339 - Property does not exist', () => {
    it('should extract property and type', () => {
      const result = parseTypeDetails('TS2339', "Property 'foo' does not exist on type 'Bar'.");
      expect(result).toEqual({
        expected: "Bar with property 'foo'",
        actual: 'Bar',
      });
    });
  });

  describe('TS2554 - Expected arguments', () => {
    it('should extract expected and actual argument counts', () => {
      const result = parseTypeDetails('TS2554', 'Expected 2 arguments, but got 1.');
      expect(result).toEqual({ expected: '2 arguments', actual: '1 arguments' });
    });

    it('should handle single argument expected', () => {
      const result = parseTypeDetails('TS2554', 'Expected 1 argument, but got 0.');
      expect(result).toEqual({ expected: '1 arguments', actual: '0 arguments' });
    });
  });

  describe('TS2353/TS2322 - Object literal extra properties', () => {
    it('should extract extra property info for TS2353', () => {
      const result = parseTypeDetails(
        'TS2353',
        "Object literal may only specify known properties, and 'extra' does not exist in type 'User'."
      );
      expect(result).toEqual({
        expected: 'User',
        actual: "User with extra property 'extra'",
      });
    });

    it('should extract extra property info for TS2322 with object literal error', () => {
      const result = parseTypeDetails(
        'TS2322',
        "Object literal may only specify known properties, and 'extra' does not exist in type 'User'."
      );
      expect(result).toEqual({
        expected: 'User',
        actual: "User with extra property 'extra'",
      });
    });
  });

  describe('TS2551 - Property with suggestion', () => {
    it('should extract property, type, and suggestion', () => {
      const result = parseTypeDetails(
        'TS2551',
        "Property 'naem' does not exist on type 'User'. Did you mean 'name'?"
      );
      expect(result).toEqual({
        expected: "'name' (suggestion)",
        actual: "property 'naem' on User",
      });
    });
  });

  describe('TS2769 - No overload matches', () => {
    it('should return generic overload info', () => {
      const result = parseTypeDetails('TS2769', 'No overload matches this call.');
      expect(result).toEqual({
        expected: 'valid overload arguments',
        actual: 'arguments that match no overload',
      });
    });
  });

  describe('TS2740 - Missing properties', () => {
    it('should extract missing properties info', () => {
      const result = parseTypeDetails(
        'TS2740',
        "Type '{ id: number; }' is missing the following properties from type 'User': name, email"
      );
      expect(result).toEqual({
        expected: 'User (missing: name, email)',
        actual: '{ id: number; }',
      });
    });
  });

  describe('TS2559 - No properties in common', () => {
    it('should extract both types', () => {
      const result = parseTypeDetails(
        'TS2559',
        "Type 'Foo' has no properties in common with type 'Bar'."
      );
      expect(result).toEqual({ expected: 'Bar', actual: 'Foo' });
    });
  });

  describe('TS2352 - Conversion may be a mistake', () => {
    it('should extract conversion types', () => {
      const result = parseTypeDetails(
        'TS2352',
        "Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other."
      );
      expect(result).toEqual({ expected: 'number', actual: 'string' });
    });
  });

  describe('Generic fallback', () => {
    it('should use generic pattern for unrecognized codes', () => {
      const result = parseTypeDetails(
        'TS9999',
        "Some error with Type 'Foo' cannot be converted to type 'Bar'."
      );
      expect(result).toEqual({ expected: 'Bar', actual: 'Foo' });
    });
  });

  describe('Unparseable messages', () => {
    it('should return null for completely unparseable messages', () => {
      const result = parseTypeDetails('TS9999', 'Some unknown error format without type info.');
      expect(result).toBeNull();
    });

    it('should return null for errors without type information', () => {
      const result = parseTypeDetails('TS1005', "';' expected.");
      expect(result).toBeNull();
    });

    it('should return null for syntax errors', () => {
      const result = parseTypeDetails('TS1003', 'Identifier expected.');
      expect(result).toBeNull();
    });
  });
});
