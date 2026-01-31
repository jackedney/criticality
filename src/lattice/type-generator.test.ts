/**
 * Tests for the Lattice phase type definition generator.
 */

import { describe, it, expect } from 'vitest';
import { generateTypeDefinitions, generateDomainTypeDefinitions } from './type-generator.js';
import { parseSpec } from '../spec/parser.js';
import type { Spec } from '../spec/types.js';

describe('generateTypeDefinitions', () => {
  describe('data model interface generation', () => {
    it('should generate TypeScript interfaces for all spec data_models', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
description = "User account in the system"
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "number" },
  { name = "active", type = "boolean" }
]

[data_models.Transaction]
fields = [
  { name = "id", type = "string" },
  { name = "amount", type = "number" },
  { name = "timestamp", type = "datetime" }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.interfaces).toHaveLength(2);
      expect(result.code).toContain('export interface Account');
      expect(result.code).toContain('export interface Transaction');
      expect(result.code).toContain('readonly id: string;');
      expect(result.code).toContain('readonly balance: number;');
      expect(result.code).toContain('readonly active: boolean;');
      expect(result.code).toContain('readonly timestamp: Date;');
    });

    it('should include JSDoc comments for data models with descriptions', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
description = "A registered user in the system"
fields = [
  { name = "name", type = "string", description = "The user's display name" }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('* A registered user in the system');
      expect(result.code).toContain("* The user's display name");
    });

    it('should document model invariants in JSDoc', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
description = "Account with balance"
invariants = ["balance >= 0", "id is unique"]
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "number" }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('@invariants');
      expect(result.code).toContain('balance >= 0');
      expect(result.code).toContain('id is unique');
    });
  });

  describe('enum generation', () => {
    it('should generate TypeScript enums for all spec enums', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.AccountStatus]
description = "Status of an account"
variants = ["Active", "Suspended", "Closed"]

[enums.TransactionType]
variants = ["Credit", "Debit", "Transfer"]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.enums).toHaveLength(2);
      expect(result.code).toContain('export enum AccountStatus');
      expect(result.code).toContain('export enum TransactionType');
      expect(result.code).toContain("Active = 'Active'");
      expect(result.code).toContain("Suspended = 'Suspended'");
      expect(result.code).toContain("Credit = 'Credit'");
    });

    it('should include JSDoc for enum descriptions', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.Status]
description = "Lifecycle status of an entity"
variants = ["Pending", "Active"]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('Lifecycle status of an entity');
    });
  });

  describe('branded type generation for constraints', () => {
    it('should generate NonNegativeDecimal branded type for non_negative constraint', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = ["non_negative"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes).toHaveLength(1);
      expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeDecimal');
      expect(result.code).toContain(
        'type NonNegativeDecimal = number & { readonly __brand: unique symbol };'
      );
      expect(result.code).toContain('readonly balance: NonNegativeDecimal;');
    });

    it('should generate PositiveDecimal branded type for positive constraint', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Order]
fields = [
  { name = "quantity", type = "number", constraints = ["positive"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('PositiveDecimal');
      expect(result.code).toContain('readonly quantity: PositiveDecimal;');
    });

    it('should generate NonEmptyString branded type for non_empty string constraint', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "name", type = "string", constraints = ["non_empty"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('NonEmptyString');
      expect(result.code).toContain('readonly name: NonEmptyString;');
    });

    it('should generate validation factory functions for branded types', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = ["non_negative"] }
]
      `);

      const result = generateTypeDefinitions(spec, { generateValidationFactories: true });

      expect(result.code).toContain('function makeNonNegativeDecimal');
      expect(result.code).toContain('function assertNonNegativeDecimal');
      expect(result.code).toContain('function isNonNegativeDecimal');
    });

    it('should include @constraint JSDoc for branded types', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = ["non_negative"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('@constraint non_negative: value >= 0');
    });

    it('should deduplicate branded types when same constraint appears multiple times', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = ["non_negative"] },
  { name = "credit", type = "number", constraints = ["non_negative"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      // Should only generate one NonNegativeDecimal type
      expect(result.brandedTypes).toHaveLength(1);
      expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeDecimal');

      // Both fields should use the same branded type
      expect(result.code).toContain('readonly balance: NonNegativeDecimal;');
      expect(result.code).toContain('readonly credit: NonNegativeDecimal;');
    });
  });

  describe('unsupported constraint handling', () => {
    it('should emit warning for unsupported constraint types', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "email", type = "string", constraints = ["valid_email_format"] }
]
      `);

      const result = generateTypeDefinitions(spec, { emitWarnings: true });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.location).toBe('User.email');
      expect(result.warnings[0]?.constraint).toBe('valid_email_format');
      expect(result.warnings[0]?.reason).toContain('not supported');
    });

    it('should fall back to base type for unsupported constraints', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "email", type = "string", constraints = ["custom_validation"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      // Should use base type string, not a branded type
      expect(result.code).toContain('readonly email: string;');
      expect(result.brandedTypes).toHaveLength(0);
    });

    it('should still document unsupported constraints in JSDoc', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "email", type = "string", constraints = ["valid_email"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('@constraints');
      expect(result.code).toContain('valid_email');
    });
  });

  describe('witness-based branded types', () => {
    it('should generate branded types from spec witnesses', () => {
      const spec: Spec = {
        meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
        system: { name: 'test-system' },
        witnesses: {
          non_negative_amount: {
            name: 'NonNegativeAmount',
            description: 'A non-negative monetary amount',
            base_type: 'number',
            invariants: [
              {
                id: 'non_negative',
                description: 'Amount must be non-negative',
                formal: 'value >= 0',
                testable: true,
              },
            ],
          },
        },
      };

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes).toHaveLength(1);
      expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeAmount');
      expect(result.code).toContain(
        'type NonNegativeAmount = number & { readonly __brand: unique symbol };'
      );
    });

    it('should handle witnesses with type parameters', () => {
      const spec: Spec = {
        meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
        system: { name: 'test-system' },
        witnesses: {
          non_empty: {
            name: 'NonEmpty',
            description: 'A non-empty collection',
            base_type: 'T[]',
            type_params: [{ name: 'T' }],
            invariants: [
              {
                id: 'non_empty',
                description: 'Collection must have at least one element',
                formal: 'value.length > 0',
              },
            ],
          },
        },
      };

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain(
        'type NonEmpty<T> = T[] & { readonly __brand: unique symbol };'
      );
    });
  });

  describe('type mapping', () => {
    it('should map spec types to TypeScript types correctly', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.AllTypes]
fields = [
  { name = "str", type = "string" },
  { name = "num", type = "number" },
  { name = "int", type = "integer" },
  { name = "dec", type = "decimal" },
  { name = "bool", type = "boolean" },
  { name = "date", type = "date" },
  { name = "datetime", type = "datetime" },
  { name = "uuid", type = "uuid" },
  { name = "email", type = "email" },
  { name = "arr", type = "string[]" },
  { name = "optional", type = "string?" }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('readonly str: string;');
      expect(result.code).toContain('readonly num: number;');
      expect(result.code).toContain('readonly int: number;');
      expect(result.code).toContain('readonly dec: number;');
      expect(result.code).toContain('readonly bool: boolean;');
      expect(result.code).toContain('readonly date: Date;');
      expect(result.code).toContain('readonly datetime: Date;');
      expect(result.code).toContain('readonly uuid: string;');
      expect(result.code).toContain('readonly email: string;');
      expect(result.code).toContain('readonly arr: string[];');
      expect(result.code).toContain('readonly optional: string | null;');
    });

    it('should preserve custom type references', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Order]
fields = [
  { name = "user", type = "User" },
  { name = "items", type = "OrderItem[]" }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.code).toContain('readonly user: User;');
      expect(result.code).toContain('readonly items: OrderItem[];');
    });
  });

  describe('options handling', () => {
    it('should skip JSDoc when includeJsDoc is false', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
description = "A user entity"
fields = [
  { name = "name", type = "string", description = "User name" }
]
      `);

      const result = generateTypeDefinitions(spec, { includeJsDoc: false });

      // Should not include the description JSDoc
      expect(result.code).not.toContain('* A user entity');
      expect(result.code).not.toContain('* User name');
    });

    it('should skip validation factories when generateValidationFactories is false', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = ["non_negative"] }
]
      `);

      const result = generateTypeDefinitions(spec, { generateValidationFactories: false });

      expect(result.code).not.toContain('function makeNonNegativeDecimal');
      expect(result.code).not.toContain('function assertNonNegativeDecimal');
    });

    it('should not emit warnings when emitWarnings is false', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "email", type = "string", constraints = ["unknown_constraint"] }
]
      `);

      const result = generateTypeDefinitions(spec, { emitWarnings: false });

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('constraint parsing', () => {
    it('should parse >= 0 as non_negative', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
  { name = "balance", type = "number", constraints = [">= 0"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeDecimal');
    });

    it('should parse > 0 as positive', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Order]
fields = [
  { name = "quantity", type = "number", constraints = ["> 0"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('PositiveDecimal');
    });

    it('should parse max_length constraints', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "name", type = "string", constraints = ["max_length(100)"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('MaxLength100String');
    });

    it('should parse min_length constraints', () => {
      const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Password]
fields = [
  { name = "value", type = "string", constraints = ["min_length(8)"] }
]
      `);

      const result = generateTypeDefinitions(spec);

      expect(result.brandedTypes[0]?.typeName).toBe('MinLength8String');
    });
  });
});

describe('generateDomainTypeDefinitions', () => {
  it('should generate types only for specified domain models', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [{ name = "id", type = "string" }]

[data_models.User]
fields = [{ name = "id", type = "string" }]

[data_models.Transaction]
fields = [{ name = "id", type = "string" }]
    `);

    const result = generateDomainTypeDefinitions(spec, ['Account', 'Transaction']);

    expect(result.interfaces).toHaveLength(2);
    expect(result.code).toContain('export interface Account');
    expect(result.code).toContain('export interface Transaction');
    expect(result.code).not.toContain('export interface User');
  });

  it('should preserve enums and witnesses for domain generation', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.AccountStatus]
variants = ["Active", "Closed"]

[data_models.Account]
fields = [{ name = "status", type = "AccountStatus" }]

[data_models.User]
fields = [{ name = "id", type = "string" }]
    `);

    const result = generateDomainTypeDefinitions(spec, ['Account']);

    expect(result.enums).toHaveLength(1);
    expect(result.code).toContain('export enum AccountStatus');
  });

  it('should filter enums to only those referenced by domain models', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.AccountStatus]
variants = ["Active", "Closed"]

[enums.UserStatus]
variants = ["Pending", "Active"]

[data_models.Account]
fields = [{ name = "status", type = "AccountStatus" }]

[data_models.User]
fields = [{ name = "status", type = "UserStatus" }]
    `);

    const result = generateDomainTypeDefinitions(spec, ['Account']);

    expect(result.enums).toHaveLength(1);
    expect(result.code).toContain('export enum AccountStatus');
    expect(result.code).not.toContain('export enum UserStatus');
  });

  it('should detect enums referenced inside composite types (arrays and maps)', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.AccountStatus]
variants = ["Active", "Closed"]

[enums.UserStatus]
variants = ["Pending", "Active"]

[enums.UnrelatedEnum]
variants = ["Foo", "Bar"]

[data_models.Account]
fields = [
  { name = "statuses", type = "AccountStatus[]" },
  { name = "userStatusMap", type = "Map<string, UserStatus>" }
]
    `);

    const result = generateDomainTypeDefinitions(spec, ['Account']);

    // Should include enums referenced inside array and Map types
    expect(result.enums).toHaveLength(2);
    expect(result.code).toContain('export enum AccountStatus');
    expect(result.code).toContain('export enum UserStatus');
    // Should exclude unrelated enums not referenced by the domain
    expect(result.code).not.toContain('export enum UnrelatedEnum');
  });

  it('should filter witnesses to only those referenced by domain models', () => {
    const spec: Spec = {
      meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
      system: { name: 'test-system' },
      data_models: {
        Account: {
          fields: [{ name: 'balance', type: 'NonNegativeDecimal' }],
        },
        User: {
          fields: [{ name: 'age', type: 'PositiveDecimal' }],
        },
      },
      witnesses: {
        non_negative: {
          name: 'NonNegativeDecimal',
          description: 'A non-negative decimal number',
          base_type: 'number',
          invariants: [
            {
              id: 'non_negative',
              description: 'Value must be >= 0',
              formal: 'value >= 0',
              testable: true,
            },
          ],
        },
        positive: {
          name: 'PositiveDecimal',
          description: 'A positive decimal number',
          base_type: 'number',
          invariants: [
            {
              id: 'positive',
              description: 'Value must be > 0',
              formal: 'value > 0',
              testable: true,
            },
          ],
        },
      },
    };

    const result = generateDomainTypeDefinitions(spec, ['Account']);

    expect(result.brandedTypes).toHaveLength(1);
    expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeDecimal');
    expect(result.code).toContain('type NonNegativeDecimal');
    expect(result.code).not.toContain('type PositiveDecimal');
  });
});

describe('example from acceptance criteria', () => {
  it('should generate NonNegativeDecimal branded type for Account with balance constraint', () => {
    // Example: Account with balance constraint 'non_negative' -> generates NonNegativeDecimal branded type
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "banking-system"

[data_models.Account]
description = "Bank account with balance"
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "decimal", constraints = ["non_negative"], description = "Account balance must be non-negative" }
]
    `);

    const result = generateTypeDefinitions(spec);

    // Should generate NonNegativeDecimal branded type
    expect(result.brandedTypes).toHaveLength(1);
    expect(result.brandedTypes[0]?.typeName).toBe('NonNegativeDecimal');
    expect(result.brandedTypes[0]?.baseType).toBe('number');
    expect(result.brandedTypes[0]?.invariant).toBe('value >= 0');

    // Should use the branded type in the interface
    expect(result.code).toContain('readonly balance: NonNegativeDecimal;');

    // Should include constraint documentation
    expect(result.code).toContain('@constraints');
    expect(result.code).toContain('non_negative');
  });

  it('should handle negative case: unsupported constraint type falls back to doc-only with warning', () => {
    // Negative case: Unsupported constraint type -> falls back to doc-only with warning
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [
  { name = "email", type = "string", constraints = ["rfc_5322_email"], description = "Email address conforming to RFC 5322" }
]
    `);

    const result = generateTypeDefinitions(spec, { emitWarnings: true });

    // Should emit warning for unsupported constraint
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.location).toBe('User.email');
    expect(result.warnings[0]?.constraint).toBe('rfc_5322_email');

    // Should fall back to base type
    expect(result.code).toContain('readonly email: string;');

    // Should still document the constraint in JSDoc
    expect(result.code).toContain('@constraints');
    expect(result.code).toContain('rfc_5322_email');
  });
});

describe('Range type name sanitization', () => {
  it('should sanitize negative numbers in Range type names', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Temperature]
fields = [{ name = "celsius", type = "number", constraints = ["range(-10, 50)"] }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.brandedTypes[0]?.typeName).toBe('RangeNeg10To50Decimal');
    expect(result.code).toContain('type RangeNeg10To50Decimal');
    expect(result.code).toContain('readonly celsius: RangeNeg10To50Decimal;');
  });

  it('should sanitize decimal numbers in Range type names', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Price]
fields = [{ name = "value", type = "number", constraints = ["range(0.99, 100.50)"] }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.brandedTypes[0]?.typeName).toBe('Range0P99To100P50Decimal');
    expect(result.code).toContain('type Range0P99To100P50Decimal');
    expect(result.code).toContain('readonly value: Range0P99To100P50Decimal;');
  });

  it('should sanitize both negative and decimal numbers in Range type names', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Coordinate]
fields = [{ name = "x", type = "number", constraints = ["range(-5.5, 10.5)"] }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.brandedTypes[0]?.typeName).toBe('RangeNeg5P5To10P5Decimal');
    expect(result.code).toContain('type RangeNeg5P5To10P5Decimal');
    expect(result.code).toContain('readonly x: RangeNeg5P5To10P5Decimal;');
  });
});

describe('Map and Set generics parsing', () => {
  it('should parse Map with inner generic types', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.UserCache]
fields = [{ name = "cache", type = "Map<string, User>" }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.code).toContain('readonly cache: Map<string, User>;');
  });

  it('should parse Set with inner generic types', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.UniqueIds]
fields = [{ name = "ids", type = "Set<number>" }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.code).toContain('readonly ids: Set<number>;');
  });

  it('should parse Map with nested generic types', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.ComplexMap]
fields = [{ name = "data", type = "Map<string, Map<number, User>>" }]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.code).toContain('readonly data: Map<string, Map<number, User>>;');
  });

  it('should map inner types in Map and Set', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.TypedCollections]
fields = [
  { name = "stringMap", type = "Map<string, decimal>" },
  { name = "numberSet", type = "Set<integer>" }
]
    `);

    const result = generateTypeDefinitions(spec);

    expect(result.code).toContain('readonly stringMap: Map<string, number>;');
    expect(result.code).toContain('readonly numberSet: Set<number>;');
  });
});
