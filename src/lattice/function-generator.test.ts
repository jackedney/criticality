/**
 * Tests for the Lattice phase function signature generator.
 */

import { describe, it, expect } from 'vitest';
import {
  generateFunctionSignatures,
  generateFunctionsForInterface,
  generateFunction,
  generateFunctionSignature,
  mapSpecTypeToTypeScript,
  parseSpecParameter,
  parseSpecReturnType,
} from './function-generator.js';
import { parseSpec } from '../spec/parser.js';
import type { SpecMethod } from '../spec/types.js';

describe('mapSpecTypeToTypeScript', () => {
  it('should map primitive types correctly', () => {
    expect(mapSpecTypeToTypeScript('string')).toBe('string');
    expect(mapSpecTypeToTypeScript('number')).toBe('number');
    expect(mapSpecTypeToTypeScript('boolean')).toBe('boolean');
    expect(mapSpecTypeToTypeScript('integer')).toBe('number');
    expect(mapSpecTypeToTypeScript('decimal')).toBe('number');
    expect(mapSpecTypeToTypeScript('float')).toBe('number');
    expect(mapSpecTypeToTypeScript('void')).toBe('void');
  });

  it('should map date/time types to Date', () => {
    expect(mapSpecTypeToTypeScript('date')).toBe('Date');
    expect(mapSpecTypeToTypeScript('datetime')).toBe('Date');
    expect(mapSpecTypeToTypeScript('timestamp')).toBe('Date');
  });

  it('should map uuid/email/url to string', () => {
    expect(mapSpecTypeToTypeScript('uuid')).toBe('string');
    expect(mapSpecTypeToTypeScript('email')).toBe('string');
    expect(mapSpecTypeToTypeScript('url')).toBe('string');
  });

  it('should preserve custom type names', () => {
    expect(mapSpecTypeToTypeScript('AccountId')).toBe('AccountId');
    expect(mapSpecTypeToTypeScript('PaymentError')).toBe('PaymentError');
    expect(mapSpecTypeToTypeScript('TransactionId')).toBe('TransactionId');
  });

  it('should handle array types', () => {
    expect(mapSpecTypeToTypeScript('string[]')).toBe('string[]');
    expect(mapSpecTypeToTypeScript('AccountId[]')).toBe('AccountId[]');
    expect(mapSpecTypeToTypeScript('Array<number>')).toBe('Array<number>');
  });

  it('should handle optional types', () => {
    expect(mapSpecTypeToTypeScript('string?')).toBe('string | null');
    expect(mapSpecTypeToTypeScript('AccountId?')).toBe('AccountId | null');
  });

  it('should handle Result types', () => {
    expect(mapSpecTypeToTypeScript('Result<AccountId, Error>')).toBe('Result<AccountId, Error>');
    expect(mapSpecTypeToTypeScript('Result<TransactionId, PaymentError>')).toBe(
      'Result<TransactionId, PaymentError>'
    );
  });

  it('should handle Promise types', () => {
    expect(mapSpecTypeToTypeScript('Promise<void>')).toBe('Promise<void>');
    expect(mapSpecTypeToTypeScript('Promise<AccountId>')).toBe('Promise<AccountId>');
  });

  it('should handle Map and Set types', () => {
    expect(mapSpecTypeToTypeScript('Map<string, number>')).toBe('Map<string, number>');
    expect(mapSpecTypeToTypeScript('Set<AccountId>')).toBe('Set<AccountId>');
  });

  it('should handle nested generic types', () => {
    expect(mapSpecTypeToTypeScript('Result<Array<AccountId>, Error>')).toBe(
      'Result<Array<AccountId>, Error>'
    );
    expect(mapSpecTypeToTypeScript('Promise<Result<AccountId, Error>>')).toBe(
      'Promise<Result<AccountId, Error>>'
    );
  });
});

describe('parseSpecParameter', () => {
  it('should parse standard parameter format', () => {
    const result = parseSpecParameter('from: AccountId');
    expect(result).toEqual({
      name: 'from',
      type: 'AccountId',
      isOptional: false,
    });
  });

  it('should parse parameter with optional modifier (name?:)', () => {
    const result = parseSpecParameter('description?: string');
    expect(result).toEqual({
      name: 'description',
      type: 'string',
      isOptional: true,
    });
  });

  it('should parse parameter with optional type (Type?)', () => {
    const result = parseSpecParameter('description: string?');
    expect(result).toEqual({
      name: 'description',
      type: 'string | null',
      isOptional: true,
    });
  });

  it('should map types in parameters', () => {
    const result = parseSpecParameter('amount: decimal');
    expect(result).toEqual({
      name: 'amount',
      type: 'number',
      isOptional: false,
    });
  });

  it('should handle complex types in parameters', () => {
    const result = parseSpecParameter('accounts: Array<AccountId>');
    expect(result).toEqual({
      name: 'accounts',
      type: 'Array<AccountId>',
      isOptional: false,
    });
  });
});

describe('parseSpecReturnType', () => {
  it('should parse simple return type', () => {
    const result = parseSpecReturnType('AccountId');
    expect(result).toEqual({
      type: 'AccountId',
      isResult: false,
    });
  });

  it('should parse void return type', () => {
    const result = parseSpecReturnType('void');
    expect(result).toEqual({
      type: 'void',
      isResult: false,
    });
  });

  it('should parse Result return type', () => {
    const result = parseSpecReturnType('Result<TransactionId, PaymentError>');
    expect(result).toEqual({
      type: 'Result<TransactionId, PaymentError>',
      isResult: true,
      successType: 'TransactionId',
      errorType: 'PaymentError',
    });
  });

  it('should parse Promise return type', () => {
    const result = parseSpecReturnType('Promise<AccountId>');
    expect(result).toEqual({
      type: 'Promise<AccountId>',
      isResult: false,
    });
  });
});

describe('generateFunctionSignature', () => {
  it('should generate signature from spec method', () => {
    const method: SpecMethod = {
      name: 'transfer',
      params: ['from: AccountId', 'to: AccountId', 'amount: decimal'],
      returns: 'Result<TransactionId, PaymentError>',
    };

    const signature = generateFunctionSignature(method);

    expect(signature.name).toBe('transfer');
    expect(signature.parameters).toHaveLength(3);
    expect(signature.parameters[0]).toEqual({
      name: 'from',
      type: 'AccountId',
      isOptional: false,
      isRest: false,
    });
    expect(signature.parameters[1]).toEqual({
      name: 'to',
      type: 'AccountId',
      isOptional: false,
      isRest: false,
    });
    expect(signature.parameters[2]).toEqual({
      name: 'amount',
      type: 'number',
      isOptional: false,
      isRest: false,
    });
    expect(signature.returnType).toBe('Result<TransactionId, PaymentError>');
    expect(signature.isAsync).toBe(false);
    expect(signature.isGenerator).toBe(false);
  });

  it('should generate async signature for Promise return type', () => {
    const method: SpecMethod = {
      name: 'fetchAccount',
      params: ['id: AccountId'],
      returns: 'Promise<Account>',
    };

    const signature = generateFunctionSignature(method, { asyncForPromise: true });

    expect(signature.isAsync).toBe(true);
    expect(signature.returnType).toBe('Promise<Account>');
  });

  it('should handle methods with no parameters', () => {
    const method: SpecMethod = {
      name: 'getSystemStatus',
      returns: 'SystemStatus',
    };

    const signature = generateFunctionSignature(method);

    expect(signature.parameters).toHaveLength(0);
    expect(signature.returnType).toBe('SystemStatus');
  });
});

describe('generateFunction', () => {
  it('should generate function with TODO body', () => {
    const method: SpecMethod = {
      name: 'transfer',
      params: ['from: AccountId', 'to: AccountId', 'amount: decimal'],
      returns: 'Result<TransactionId, PaymentError>',
      description: 'Transfer funds between accounts',
    };

    const func = generateFunction('PaymentService', method);

    expect(func.name).toBe('transfer');
    expect(func.interfaceName).toBe('PaymentService');
    expect(func.body).toBe("throw new Error('TODO');");
    expect(func.code).toContain("throw new Error('TODO');");
    expect(func.code).toContain('export function transfer');
    expect(func.code).toContain('from: AccountId');
    expect(func.code).toContain('to: AccountId');
    expect(func.code).toContain('amount: number');
    expect(func.code).toContain('Result<TransactionId, PaymentError>');
  });

  it('should include JSDoc with description', () => {
    const method: SpecMethod = {
      name: 'transfer',
      params: ['from: AccountId'],
      returns: 'void',
      description: 'Transfer funds between accounts',
    };

    const func = generateFunction('PaymentService', method, { includeJsDoc: true });

    expect(func.jsDoc).toContain('Transfer funds between accounts');
    expect(func.jsDoc).toContain('@param from');
    expect(func.code).toContain('/**');
    expect(func.code).toContain('*/');
  });

  it('should include contract annotations in JSDoc', () => {
    const method: SpecMethod = {
      name: 'withdraw',
      params: ['account: AccountId', 'amount: decimal'],
      returns: 'Result<TransactionId, Error>',
      contracts: [
        'REQUIRES: amount > 0',
        'REQUIRES: account.balance >= amount',
        'ENSURES: account.balance == old(account.balance) - amount',
      ],
    };

    const func = generateFunction('PaymentService', method, {
      includeJsDoc: true,
      includeContracts: true,
    });

    expect(func.jsDoc).toContain('@requires REQUIRES: amount > 0');
    expect(func.jsDoc).toContain('@requires REQUIRES: account.balance >= amount');
    expect(func.jsDoc).toContain('@ensures ENSURES: account.balance');
    expect(func.contracts).toHaveLength(3);
  });

  it('should skip JSDoc when disabled', () => {
    const method: SpecMethod = {
      name: 'getBalance',
      params: ['account: AccountId'],
      returns: 'decimal',
      description: 'Get account balance',
    };

    const func = generateFunction('AccountService', method, { includeJsDoc: false });

    expect(func.jsDoc).toBe('');
    expect(func.code).not.toContain('/**');
  });
});

describe('generateFunctionSignatures', () => {
  it('should generate functions for all spec interface methods', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "payment-system"

[interfaces.PaymentService]
description = "Handles payment operations"
methods = [
  { name = "transfer", params = ["from: AccountId", "to: AccountId", "amount: decimal"], returns = "Result<TransactionId, PaymentError>" },
  { name = "getBalance", params = ["account: AccountId"], returns = "decimal" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]?.name).toBe('transfer');
    expect(result.functions[1]?.name).toBe('getBalance');
  });

  it('should generate function bodies containing throw new Error("TODO") placeholder', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.TestService]
methods = [
  { name = "doSomething", returns = "void" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]?.body).toBe("throw new Error('TODO');");
    expect(result.code).toContain("throw new Error('TODO');");
  });

  it('should use generated type definitions in signatures', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "banking-system"

[data_models.Account]
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "decimal" }
]

[interfaces.AccountService]
methods = [
  { name = "getAccount", params = ["id: string"], returns = "Account" },
  { name = "createAccount", params = ["data: Account"], returns = "Account" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]?.signature.returnType).toBe('Account');
    expect(result.functions[1]?.signature.parameters[0]?.type).toBe('Account');
  });

  it('should generate imports for custom types', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [{ name = "id", type = "string" }]

[interfaces.TestService]
methods = [
  { name = "getAccount", params = ["id: string"], returns = "Account" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.imports.some((i) => i.includes('Account'))).toBe(true);
  });

  it('should emit warning for invalid type references', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.TestService]
methods = [
  { name = "getAccount", params = ["id: string"], returns = "UndefinedType" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain('UndefinedType');
    expect(result.warnings[0]?.message).toContain('not defined');
  });

  it('should include Result type definition when used', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.TestService]
methods = [
  { name = "doSomething", returns = "Result<string, Error>" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.code).toContain('export type Result<T, E>');
  });

  it('should handle multiple interfaces', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.ServiceA]
methods = [
  { name = "methodA", returns = "void" }
]

[interfaces.ServiceB]
methods = [
  { name = "methodB", returns = "string" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]?.interfaceName).toBe('ServiceA');
    expect(result.functions[1]?.interfaceName).toBe('ServiceB');
  });

  it('should return empty result for spec without interfaces', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [{ name = "id", type = "string" }]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('generateFunctionsForInterface', () => {
  it('should generate functions for specific interface only', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.ServiceA]
methods = [
  { name = "methodA", returns = "void" }
]

[interfaces.ServiceB]
methods = [
  { name = "methodB", returns = "string" }
]
    `);

    const result = generateFunctionsForInterface(spec, 'ServiceA');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]?.name).toBe('methodA');
    expect(result.functions[0]?.interfaceName).toBe('ServiceA');
  });

  it('should throw error for non-existent interface', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"
    `);

    expect(() => generateFunctionsForInterface(spec, 'NonExistent')).toThrow(
      "Interface 'NonExistent' not found in spec"
    );
  });
});

describe('example from acceptance criteria', () => {
  it('should generate transfer function: transfer(from: AccountId, to: AccountId, amount: Decimal) -> Result<TransactionId, PaymentError>', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "payment-system"

[data_models.AccountId]
fields = [{ name = "value", type = "string" }]

[data_models.TransactionId]
fields = [{ name = "value", type = "string" }]

[enums.PaymentError]
variants = ["InsufficientFunds", "InvalidAccount", "TransferFailed"]

[interfaces.PaymentService]
description = "Payment processing interface"
methods = [
  { name = "transfer", params = ["from: AccountId", "to: AccountId", "amount: Decimal"], returns = "Result<TransactionId, PaymentError>", description = "Transfer funds between accounts" }
]
    `);

    const result = generateFunctionSignatures(spec);

    expect(result.functions).toHaveLength(1);
    const func = result.functions[0];

    // Verify function name
    expect(func?.name).toBe('transfer');

    // Verify parameters
    expect(func?.signature.parameters).toHaveLength(3);
    expect(func?.signature.parameters[0]?.name).toBe('from');
    expect(func?.signature.parameters[0]?.type).toBe('AccountId');
    expect(func?.signature.parameters[1]?.name).toBe('to');
    expect(func?.signature.parameters[1]?.type).toBe('AccountId');
    expect(func?.signature.parameters[2]?.name).toBe('amount');
    // Decimal maps to number
    expect(func?.signature.parameters[2]?.type).toBe('number');

    // Verify return type
    expect(func?.signature.returnType).toBe('Result<TransactionId, PaymentError>');

    // Verify TODO body
    expect(func?.body).toBe("throw new Error('TODO');");
    expect(func?.code).toContain("throw new Error('TODO');");

    // Verify code structure
    expect(func?.code).toContain('export function transfer');
    expect(func?.code).toContain('from: AccountId');
    expect(func?.code).toContain('to: AccountId');
    expect(func?.code).toContain('amount: number');
    expect(func?.code).toContain('Result<TransactionId, PaymentError>');
  });

  it('should fail compilation with clear error for invalid type reference in spec', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.TestService]
methods = [
  { name = "transfer", params = ["from: NonExistentType"], returns = "AnotherMissingType" }
]
    `);

    const result = generateFunctionSignatures(spec);

    // Should emit warnings for both undefined types
    expect(result.warnings.length).toBeGreaterThan(0);

    // Warnings should identify the missing types
    const warningMessages = result.warnings.map((w) => w.message);
    expect(warningMessages.some((m) => m.includes('NonExistentType'))).toBe(true);
    expect(warningMessages.some((m) => m.includes('AnotherMissingType'))).toBe(true);

    // Warnings should point to spec issue
    expect(warningMessages.some((m) => m.includes('not defined in spec'))).toBe(true);
  });
});

describe('TypeScriptAdapter integration', () => {
  it('should generate signatures compatible with TypeScriptAdapter extraction', () => {
    // The generated signatures should match the FunctionSignature type
    // used by TypeScriptAdapter for signature extraction
    const method: SpecMethod = {
      name: 'processPayment',
      params: ['paymentId: string', 'amount: decimal', 'currency?: string'],
      returns: 'Promise<Result<TransactionId, PaymentError>>',
    };

    const signature = generateFunctionSignature(method);

    // Verify signature matches TypeScriptAdapter's FunctionSignature structure
    expect(signature).toHaveProperty('name');
    expect(signature).toHaveProperty('parameters');
    expect(signature).toHaveProperty('returnType');
    expect(signature).toHaveProperty('typeParameters');
    expect(signature).toHaveProperty('isAsync');
    expect(signature).toHaveProperty('isGenerator');

    // Verify parameter structure matches ParameterInfo
    for (const param of signature.parameters) {
      expect(param).toHaveProperty('name');
      expect(param).toHaveProperty('type');
      expect(param).toHaveProperty('isOptional');
      expect(param).toHaveProperty('isRest');
    }
  });

  it('should generate bodies that can be detected by TypeScriptAdapter findTodoFunctions', () => {
    const method: SpecMethod = {
      name: 'doSomething',
      returns: 'void',
    };

    const func = generateFunction('TestService', method);

    // The body should match the TODO detection patterns in ast.ts:
    // throw new Error('TODO') or throw new Error("TODO")
    expect(func.body).toMatch(/throw\s+new\s+Error\s*\(\s*['"]TODO['"]\s*\)/);
  });
});
