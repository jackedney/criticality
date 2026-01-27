/**
 * Tests for the contract attachment module.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  attachContracts,
  attachContractsForInterface,
  formatContractReport,
  serializeContract,
  attachContractsToCode,
  type ContractAttachmentResult,
  type GeneratedContract,
} from './contract-attacher.js';
import type { Spec } from '../spec/types.js';

/**
 * Helper to create a minimal valid spec.
 */
function createMinimalSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    meta: {
      version: '1.0.0',
      created: '2026-01-27T00:00:00Z',
    },
    system: {
      name: 'test-system',
    },
    ...overrides,
  };
}

describe('attachContracts', () => {
  describe('basic contract generation', () => {
    it('should generate contracts for all interface methods', () => {
      const spec = createMinimalSpec({
        interfaces: {
          AccountService: {
            methods: [
              {
                name: 'deposit',
                params: ['accountId: string', 'amount: number'],
                returns: 'void',
                description: 'Deposits funds into an account',
                contracts: ['requires: amount > 0', 'ensures: balance += amount'],
              },
              {
                name: 'withdraw',
                params: ['accountId: string', 'amount: number'],
                returns: 'Result<void, InsufficientFundsError>',
                contracts: ['requires: amount > 0', 'requires: balance >= amount'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts).toHaveLength(2);
      expect(result.summary.totalFunctions).toBe(2);
    });

    it('should parse requires and ensures from contracts', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Math: {
            methods: [
              {
                name: 'sqrt',
                params: ['x: number'],
                returns: 'number',
                contracts: ['requires: x >= 0', 'ensures: result >= 0'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const contract = result.contracts[0];

      expect(contract).toBeDefined();
      expect(contract?.requires).toContain('x >= 0');
      expect(contract?.ensures).toContain('result >= 0');
    });

    it('should handle methods without explicit contracts', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Simple: {
            methods: [
              {
                name: 'getValue',
                params: [],
                returns: 'string',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts).toHaveLength(1);
      expect(result.contracts[0]?.requires).toHaveLength(0);
      expect(result.contracts[0]?.ensures).toHaveLength(0);
    });
  });

  describe('JSDoc generation', () => {
    it('should generate JSDoc with @requires annotations', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'process',
                params: ['x: number'],
                returns: 'void',
                contracts: ['requires: x > 0'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const jsDoc = result.contracts[0]?.jsDoc ?? '';

      expect(jsDoc).toContain('@requires x > 0');
    });

    it('should generate JSDoc with @ensures annotations', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'compute',
                params: [],
                returns: 'number',
                contracts: ['ensures: result > 0'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const jsDoc = result.contracts[0]?.jsDoc ?? '';

      expect(jsDoc).toContain('@ensures result > 0');
    });

    it('should include @complexity when inferred', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Sorting: {
            methods: [
              {
                name: 'sort',
                params: ['arr: number[]'],
                returns: 'number[]',
                contracts: ['complexity: O(n log n)'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const jsDoc = result.contracts[0]?.jsDoc ?? '';

      expect(jsDoc).toContain('@complexity O(n log n)');
    });

    it('should include @purity annotation', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Service: {
            methods: [
              {
                name: 'updateRecord',
                params: ['id: string', 'data: object'],
                returns: 'void',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const jsDoc = result.contracts[0]?.jsDoc ?? '';

      expect(jsDoc).toContain('@purity writes');
    });

    it('should include method description in JSDoc', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'doSomething',
                params: [],
                returns: 'void',
                description: 'Does something important',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);
      const jsDoc = result.contracts[0]?.jsDoc ?? '';

      expect(jsDoc).toContain('Does something important');
    });
  });

  describe('CLAIM_REF linking', () => {
    it('should link claims to methods by claim ID matching method name', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Account: {
            methods: [
              {
                name: 'deposit',
                params: ['amount: number'],
                returns: 'void',
              },
            ],
          },
        },
        claims: {
          deposit_001: {
            text: 'Deposits should increase balance',
            type: 'behavioral',
            outcome: 'balance increases by amount',
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.claimRefs).toContain('deposit_001');
      expect(result.contracts[0]?.jsDoc).toContain('@claim_ref deposit_001');
    });

    it('should link claims by subject field', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Balance: {
            methods: [
              {
                name: 'getBalance',
                params: [],
                returns: 'number',
              },
            ],
          },
        },
        claims: {
          balance_inv: {
            text: 'Balance must never be negative',
            type: 'invariant',
            subject: 'Balance.getBalance',
            predicate: 'result >= 0',
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.claimRefs).toContain('balance_inv');
    });

    it('should link claims by trigger field', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Auth: {
            methods: [
              {
                name: 'login',
                params: ['user: string', 'pass: string'],
                returns: 'boolean',
              },
            ],
          },
        },
        claims: {
          auth_001: {
            text: 'Should return true on valid credentials',
            type: 'behavioral',
            trigger: 'login with valid credentials',
            outcome: 'returns true',
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.claimRefs).toContain('auth_001');
    });

    it('should extract invariants from invariant claims', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Counter: {
            methods: [
              {
                name: 'increment',
                params: [],
                returns: 'void',
              },
            ],
          },
        },
        claims: {
          counter_inv: {
            text: 'Counter must be non-negative',
            type: 'invariant',
            subject: 'Counter',
            predicate: 'this.count >= 0',
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.invariants).toContain('this.count >= 0');
    });
  });

  describe('unmatched claims warning', () => {
    it('should warn when spec claim has no matching function', () => {
      const logger = vi.fn();
      const spec = createMinimalSpec({
        interfaces: {
          Service: {
            methods: [
              {
                name: 'process',
                params: [],
                returns: 'void',
              },
            ],
          },
        },
        claims: {
          orphan_claim_001: {
            text: 'This claim has no matching function',
            type: 'behavioral',
          },
        },
      });

      const result = attachContracts(spec, { logger });

      expect(result.unmatchedClaimWarnings).toHaveLength(1);
      expect(result.unmatchedClaimWarnings[0]?.claimId).toBe('orphan_claim_001');
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('orphan_claim_001'));
    });

    it('should include reason for unmatched claims', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Service: {
            methods: [
              {
                name: 'doWork',
                params: [],
                returns: 'void',
              },
            ],
          },
        },
        claims: {
          unrelated_claim: {
            text: 'Completely unrelated claim',
            type: 'invariant',
          },
        },
      });

      const result = attachContracts(spec, { emitWarnings: false });

      expect(result.unmatchedClaimWarnings[0]?.reason).toBeDefined();
      expect(result.unmatchedClaimWarnings[0]?.reason).toContain('no');
    });

    it('should report correct summary statistics', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Service: {
            methods: [
              { name: 'methodA', params: [], returns: 'void' },
              { name: 'methodB', params: [], returns: 'void' },
            ],
          },
        },
        claims: {
          methodA_claim: { text: 'Claim for methodA', type: 'behavioral' },
          orphan_claim: { text: 'No matching method', type: 'invariant' },
        },
      });

      const result = attachContracts(spec, { emitWarnings: false });

      expect(result.summary.totalClaims).toBe(2);
      expect(result.summary.linkedClaims).toBe(1);
      expect(result.summary.unmatchedClaims).toBe(1);
    });

    it('should not warn when emitWarnings is false', () => {
      const logger = vi.fn();
      const spec = createMinimalSpec({
        interfaces: {
          Service: {
            methods: [{ name: 'method', params: [], returns: 'void' }],
          },
        },
        claims: {
          orphan: { text: 'Orphan claim', type: 'behavioral' },
        },
      });

      attachContracts(spec, { emitWarnings: false, logger });

      expect(logger).not.toHaveBeenCalled();
    });
  });

  describe('purity inference', () => {
    it('should infer pure for contracts mentioning pure', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Math: {
            methods: [
              {
                name: 'calculate',
                params: ['x: number'],
                returns: 'number',
                contracts: ['pure function'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.purity).toBe('pure');
    });

    it('should infer reads for getter methods', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Data: {
            methods: [
              { name: 'getValue', params: [], returns: 'string' },
              { name: 'isValid', params: [], returns: 'boolean' },
              { name: 'hasItems', params: [], returns: 'boolean' },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.purity).toBe('reads');
      expect(result.contracts[1]?.purity).toBe('reads');
      expect(result.contracts[2]?.purity).toBe('reads');
    });

    it('should infer writes for setter methods', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Data: {
            methods: [
              { name: 'setValue', params: ['v: string'], returns: 'void' },
              { name: 'updateItem', params: ['id: string'], returns: 'void' },
              { name: 'deleteRecord', params: ['id: string'], returns: 'void' },
              { name: 'createEntry', params: ['data: object'], returns: 'string' },
              { name: 'addItem', params: ['item: Item'], returns: 'void' },
              { name: 'removeItem', params: ['id: string'], returns: 'void' },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      for (const contract of result.contracts) {
        expect(contract.purity).toBe('writes');
      }
    });

    it('should infer io from contracts mentioning network', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Api: {
            methods: [
              {
                name: 'fetch',
                params: ['url: string'],
                returns: 'Promise<Response>',
                contracts: ['performs network IO'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.purity).toBe('io');
    });
  });

  describe('complexity inference', () => {
    it('should extract explicit O notation from contracts', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Search: {
            methods: [
              {
                name: 'binarySearch',
                params: ['arr: number[]', 'target: number'],
                returns: 'number',
                contracts: ['O(log n) time complexity'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.complexity).toBe('O(log n)');
    });

    it('should infer O(n log n) for sort methods', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Sorting: {
            methods: [
              {
                name: 'mergeSort',
                params: ['arr: number[]'],
                returns: 'number[]',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.complexity).toBe('O(n log n)');
    });

    it('should extract constant time from contracts', () => {
      const spec = createMinimalSpec({
        interfaces: {
          HashMap: {
            methods: [
              {
                name: 'get',
                params: ['key: string'],
                returns: 'Value',
                contracts: ['constant time lookup'],
              },
            ],
          },
        },
      });

      const result = attachContracts(spec);

      expect(result.contracts[0]?.complexity).toBe('O(1)');
    });
  });

  describe('options', () => {
    it('should exclude complexity when includeComplexity is false', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'sort',
                params: ['arr: number[]'],
                returns: 'number[]',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec, { includeComplexity: false });

      expect(result.contracts[0]?.jsDoc).not.toContain('@complexity');
    });

    it('should exclude purity when includePurity is false', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'getValue',
                params: [],
                returns: 'string',
              },
            ],
          },
        },
      });

      const result = attachContracts(spec, { includePurity: false });

      expect(result.contracts[0]?.jsDoc).not.toContain('@purity');
    });

    it('should exclude claim_ref when includeClaimRefs is false', () => {
      const spec = createMinimalSpec({
        interfaces: {
          Test: {
            methods: [
              {
                name: 'process',
                params: [],
                returns: 'void',
              },
            ],
          },
        },
        claims: {
          process_001: {
            text: 'Process claim',
            type: 'behavioral',
          },
        },
      });

      const result = attachContracts(spec, { includeClaimRefs: false });

      expect(result.contracts[0]?.jsDoc).not.toContain('@claim_ref');
    });
  });
});

describe('attachContractsForInterface', () => {
  it('should generate contracts for a specific interface only', () => {
    const spec = createMinimalSpec({
      interfaces: {
        ServiceA: {
          methods: [{ name: 'methodA', params: [], returns: 'void' }],
        },
        ServiceB: {
          methods: [{ name: 'methodB', params: [], returns: 'void' }],
        },
      },
    });

    const result = attachContractsForInterface(spec, 'ServiceA');

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]?.interfaceName).toBe('ServiceA');
  });

  it('should throw error for non-existent interface', () => {
    const spec = createMinimalSpec({
      interfaces: {
        Existing: {
          methods: [{ name: 'method', params: [], returns: 'void' }],
        },
      },
    });

    expect(() => attachContractsForInterface(spec, 'NonExistent')).toThrow(
      "Interface 'NonExistent' not found"
    );
  });
});

describe('formatContractReport', () => {
  it('should format a report with summary statistics', () => {
    const result: ContractAttachmentResult = {
      contracts: [],
      unmatchedClaimWarnings: [],
      contractsByFunction: new Map(),
      summary: {
        totalFunctions: 10,
        functionsWithContracts: 8,
        totalClaims: 5,
        linkedClaims: 4,
        unmatchedClaims: 1,
      },
    };

    const report = formatContractReport(result);

    expect(report).toContain('Total Functions');
    expect(report).toContain('10');
    expect(report).toContain('Functions with Contracts');
    expect(report).toContain('8');
    expect(report).toContain('Total Spec Claims');
    expect(report).toContain('5');
    expect(report).toContain('Linked to Functions');
    expect(report).toContain('4');
    expect(report).toContain('Unmatched Claims');
    expect(report).toContain('1');
  });

  it('should include unmatched claims in the report', () => {
    const result: ContractAttachmentResult = {
      contracts: [],
      unmatchedClaimWarnings: [
        {
          claimId: 'orphan_001',
          claimText: 'Orphan claim text',
          claimType: 'behavioral',
          reason: 'No matching function',
        },
      ],
      contractsByFunction: new Map(),
      summary: {
        totalFunctions: 1,
        functionsWithContracts: 1,
        totalClaims: 1,
        linkedClaims: 0,
        unmatchedClaims: 1,
      },
    };

    const report = formatContractReport(result);

    expect(report).toContain('orphan_001');
    expect(report).toContain('UNMATCHED CLAIMS');
  });
});

describe('serializeContract', () => {
  it('should return the JSDoc string', () => {
    const contract: GeneratedContract = {
      functionName: 'test',
      interfaceName: 'Test',
      requires: ['x > 0'],
      ensures: ['result >= 0'],
      invariants: [],
      claimRefs: [],
      jsDoc: '/**\n * Test function\n * @requires x > 0\n */',
    };

    const serialized = serializeContract(contract);

    expect(serialized).toBe(contract.jsDoc);
  });
});

describe('attachContractsToCode', () => {
  it('should attach JSDoc to functions without existing docs', () => {
    const code = `export function deposit(amount: number): void {
  throw new Error('TODO');
}`;

    const contracts = new Map<string, GeneratedContract>([
      [
        'Account.deposit',
        {
          functionName: 'deposit',
          interfaceName: 'Account',
          requires: ['amount > 0'],
          ensures: ['balance += amount'],
          invariants: [],
          claimRefs: ['balance_001'],
          jsDoc: `/**
 * Deposits funds.
 *
 * @requires amount > 0
 * @ensures balance += amount
 * @claim_ref balance_001
 */`,
        },
      ],
    ]);

    const result = attachContractsToCode(code, contracts);

    expect(result).toContain('@requires amount > 0');
    expect(result).toContain('@ensures balance += amount');
    expect(result).toContain('@claim_ref balance_001');
    expect(result).toContain('export function deposit');
  });

  it('should replace existing JSDoc', () => {
    const code = `/**
 * Old doc
 */
export function process(x: number): void {
  throw new Error('TODO');
}`;

    const contracts = new Map<string, GeneratedContract>([
      [
        'Service.process',
        {
          functionName: 'process',
          interfaceName: 'Service',
          requires: ['x >= 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
          jsDoc: `/**
 * New doc
 *
 * @requires x >= 0
 */`,
        },
      ],
    ]);

    const result = attachContractsToCode(code, contracts);

    expect(result).toContain('New doc');
    expect(result).toContain('@requires x >= 0');
    expect(result).not.toContain('Old doc');
  });

  it('should handle async functions', () => {
    const code = `export async function fetch(url: string): Promise<Response> {
  throw new Error('TODO');
}`;

    const contracts = new Map<string, GeneratedContract>([
      [
        'Api.fetch',
        {
          functionName: 'fetch',
          interfaceName: 'Api',
          requires: ['url.length > 0'],
          ensures: [],
          invariants: [],
          claimRefs: [],
          purity: 'io',
          jsDoc: `/**
 * Fetches data.
 *
 * @requires url.length > 0
 * @purity io
 */`,
        },
      ],
    ]);

    const result = attachContractsToCode(code, contracts);

    expect(result).toContain('@requires url.length > 0');
    expect(result).toContain('@purity io');
    expect(result).toContain('export async function fetch');
  });

  it('should handle multiple functions', () => {
    const code = `export function funcA(): void {
  throw new Error('TODO');
}

export function funcB(): void {
  throw new Error('TODO');
}`;

    const contracts = new Map<string, GeneratedContract>([
      [
        'Test.funcA',
        {
          functionName: 'funcA',
          interfaceName: 'Test',
          requires: ['a'],
          ensures: [],
          invariants: [],
          claimRefs: [],
          jsDoc: `/**
 * @requires a
 */`,
        },
      ],
      [
        'Test.funcB',
        {
          functionName: 'funcB',
          interfaceName: 'Test',
          requires: ['b'],
          ensures: [],
          invariants: [],
          claimRefs: [],
          jsDoc: `/**
 * @requires b
 */`,
        },
      ],
    ]);

    const result = attachContractsToCode(code, contracts);

    expect(result).toContain('@requires a');
    expect(result).toContain('@requires b');
  });
});

describe('example from acceptance criteria', () => {
  it('should generate the expected contract format from the story example', () => {
    // Example from acceptance criteria:
    // /// @requires amount > 0
    // /// @ensures self.balance += amount
    // /// @complexity O(1)
    // /// @purity writes
    // /// @claim_ref balance_001

    const spec = createMinimalSpec({
      interfaces: {
        Account: {
          methods: [
            {
              name: 'deposit',
              params: ['amount: number'],
              returns: 'void',
              description: 'Deposits funds into the account',
              contracts: ['requires: amount > 0', 'ensures: self.balance += amount'],
            },
          ],
        },
      },
      claims: {
        balance_001: {
          text: 'Balance increases by deposit amount',
          type: 'behavioral',
          trigger: 'deposit',
          outcome: 'balance increases',
        },
      },
    });

    const result = attachContracts(spec);
    const contract = result.contracts[0];

    expect(contract).toBeDefined();
    expect(contract?.requires).toContain('amount > 0');
    expect(contract?.ensures).toContain('self.balance += amount');
    expect(contract?.claimRefs).toContain('balance_001');

    // JSDoc should contain all expected annotations
    const jsDoc = contract?.jsDoc ?? '';
    expect(jsDoc).toContain('@requires amount > 0');
    expect(jsDoc).toContain('@ensures self.balance += amount');
    expect(jsDoc).toContain('@purity writes');
    expect(jsDoc).toContain('@claim_ref balance_001');
  });
});
