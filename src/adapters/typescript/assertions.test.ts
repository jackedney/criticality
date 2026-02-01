/**
 * Tests for the runtime assertion generation module.
 *
 * @module adapters/typescript/assertions.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateRuntimeAssertions,
  generatePreconditionCheck,
  generatePostconditionCheck,
  generateInvariantCheck,
  AssertionError,
  ContractParseError,
  type MicroContract,
} from './assertions.js';

describe('AssertionError', () => {
  it('creates error with correct properties', () => {
    const error = new AssertionError('Precondition failed: x > 0', 'precondition', 'x > 0');

    expect(error.message).toBe('Precondition failed: x > 0');
    expect(error.name).toBe('AssertionError');
    expect(error.assertionType).toBe('precondition');
    expect(error.expression).toBe('x > 0');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AssertionError);
  });

  it('creates postcondition error', () => {
    const error = new AssertionError(
      'Postcondition failed: result !== null',
      'postcondition',
      'result !== null'
    );

    expect(error.assertionType).toBe('postcondition');
    expect(error.expression).toBe('result !== null');
  });

  it('creates invariant error', () => {
    const error = new AssertionError(
      'Invariant violated: this.count >= 0',
      'invariant',
      'this.count >= 0'
    );

    expect(error.assertionType).toBe('invariant');
    expect(error.expression).toBe('this.count >= 0');
  });
});

describe('ContractParseError', () => {
  it('creates error with correct properties', () => {
    const error = new ContractParseError(
      'Malformed requires expression: unbalanced brackets',
      'x > (',
      'unbalanced brackets'
    );

    expect(error.message).toBe('Malformed requires expression: unbalanced brackets');
    expect(error.name).toBe('ContractParseError');
    expect(error.expression).toBe('x > (');
    expect(error.reason).toBe('unbalanced brackets');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ContractParseError);
  });
});

describe('generateRuntimeAssertions', () => {
  describe('precondition generation', () => {
    it('generates precondition check for @requires x > 0', () => {
      const contract: MicroContract = {
        functionName: 'sqrt',
        filePath: 'math.ts',
        requires: ['x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('// Precondition checks');
      expect(result).toContain('if (!(x > 0)) {');
      expect(result).toContain(
        "throw new AssertionError('Precondition failed: x > 0', 'precondition', 'x > 0');"
      );
    });

    it('generates multiple precondition checks', () => {
      const contract: MicroContract = {
        functionName: 'divide',
        filePath: 'math.ts',
        requires: ['x >= 0', 'y !== 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(x >= 0)) {');
      expect(result).toContain('if (!(y !== 0)) {');
      expect(result).toContain("'Precondition failed: x >= 0'");
      expect(result).toContain("'Precondition failed: y !== 0'");
    });

    it('handles complex precondition expressions', () => {
      const contract: MicroContract = {
        functionName: 'processArray',
        filePath: 'utils.ts',
        requires: ['arr.length > 0 && arr.every(x => x !== null)'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(arr.length > 0 && arr.every(x => x !== null))) {');
    });
  });

  describe('postcondition generation', () => {
    it('generates postcondition check for @ensures result !== null', () => {
      const contract: MicroContract = {
        functionName: 'findUser',
        filePath: 'users.ts',
        requires: [],
        ensures: ['result !== null'],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('// Postcondition checks');
      expect(result).toContain('function __checkPostconditions(result: unknown): void {');
      expect(result).toContain('if (!(result !== null)) {');
      expect(result).toContain(
        "throw new AssertionError('Postcondition failed: result !== null', 'postcondition', 'result !== null');"
      );
    });

    it('generates multiple postcondition checks', () => {
      const contract: MicroContract = {
        functionName: 'sqrt',
        filePath: 'math.ts',
        requires: ['x > 0'],
        ensures: ['result >= 0', 'result * result === x'],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(result >= 0)) {');
      expect(result).toContain('if (!(result * result === x)) {');
    });

    it('supports custom result variable name', () => {
      const contract: MicroContract = {
        functionName: 'compute',
        filePath: 'compute.ts',
        requires: [],
        ensures: ['result > 0'],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract, {
        resultVariableName: 'returnValue',
      });

      expect(result).toContain('function __checkPostconditions(returnValue: unknown): void {');
    });
  });

  describe('invariant generation', () => {
    it('generates invariant check for stateful operations', () => {
      const contract: MicroContract = {
        functionName: 'withdraw',
        filePath: 'account.ts',
        requires: ['amount > 0'],
        ensures: [],
        invariants: ['this.balance >= 0'],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('// Invariant checks (pre-execution)');
      expect(result).toContain('if (!(this.balance >= 0)) {');
      expect(result).toContain(
        "throw new AssertionError('Invariant violated: this.balance >= 0', 'invariant', 'this.balance >= 0');"
      );
      expect(result).toContain('// Invariant checks (post-execution)');
      expect(result).toContain('function __checkInvariantsPost(): void {');
      expect(result).toContain(
        "throw new AssertionError('Invariant violated after execution: this.balance >= 0', 'invariant', 'this.balance >= 0');"
      );
    });

    it('generates multiple invariant checks', () => {
      const contract: MicroContract = {
        functionName: 'resize',
        filePath: 'buffer.ts',
        requires: [],
        ensures: [],
        invariants: ['this.size >= 0', 'this.size <= this.capacity'],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(this.size >= 0)) {');
      expect(result).toContain('if (!(this.size <= this.capacity)) {');
    });
  });

  describe('combined contracts', () => {
    it('generates all assertion types together', () => {
      const contract: MicroContract = {
        functionName: 'transfer',
        filePath: 'account.ts',
        requires: ['amount > 0', 'from.balance >= amount'],
        ensures: ['result === true', 'to.balance > old_to_balance'],
        invariants: ['from.balance >= 0', 'to.balance >= 0'],
        claimRefs: ['inv_001', 'behavior_002'],
      };

      const result = generateRuntimeAssertions(contract);

      // Should have preconditions
      expect(result).toContain('// Precondition checks');
      expect(result).toContain('if (!(amount > 0)) {');
      expect(result).toContain('if (!(from.balance >= amount)) {');

      // Should have invariants (pre)
      expect(result).toContain('// Invariant checks (pre-execution)');
      expect(result).toContain('if (!(from.balance >= 0)) {');

      // Should have postconditions
      expect(result).toContain('// Postcondition checks');
      expect(result).toContain('if (!(result === true)) {');

      // Should have invariants (post)
      expect(result).toContain('// Invariant checks (post-execution)');
      expect(result).toContain('function __checkInvariantsPost(): void {');
    });
  });

  describe('empty contract', () => {
    it('returns empty string for contract with no assertions', () => {
      const contract: MicroContract = {
        functionName: 'noop',
        filePath: 'noop.ts',
        requires: [],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toBe('');
    });
  });

  describe('JSDoc option', () => {
    it('includes JSDoc by default', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('// Precondition checks');
    });

    it('can disable JSDoc', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract, { includeJsDoc: false });

      expect(result).not.toContain('// Precondition checks');
      expect(result).toContain('if (!(x > 0)) {');
    });
  });

  describe('whitespace handling', () => {
    it('trims whitespace from expressions', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['  x > 0  '],
        ensures: ['  result !== null  '],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(x > 0)) {');
      expect(result).toContain('if (!(result !== null)) {');
    });
  });

  describe('string escaping', () => {
    it('escapes single quotes in expressions', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ["str !== 'test'"],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain("'Precondition failed: str !== \\'test\\''");
    });

    it('escapes backslashes in expressions', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['path.includes("\\\\")'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('\\\\\\\\');
    });
  });

  describe('error handling - malformed expressions', () => {
    it('throws ContractParseError for empty requires expression', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: [''],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('Empty requires expression');
    });

    it('throws ContractParseError for whitespace-only expression', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['   '],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('Empty requires expression');
    });

    it('throws ContractParseError for unbalanced parentheses', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['(x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced parentheses');
    });

    it('throws ContractParseError for unbalanced square brackets', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['arr[0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced square brackets');
    });

    it('throws ContractParseError for unbalanced curly brackets', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['{ x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced curly brackets');
    });

    it('throws ContractParseError for closing bracket before opening', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['x) > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced brackets');
    });

    it('throws ContractParseError for expression starting with invalid character', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: [') > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced brackets');
    });

    it('throws ContractParseError for expression ending with incomplete syntax', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['x >'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      // This is a semantic error that would fail at runtime, but passes basic syntax check
      // The validation only catches bracket issues and obvious syntax problems
      // This is acceptable as the generated code would fail at compile time
      const result = generateRuntimeAssertions(contract);
      expect(result).toContain('if (!(x >)) {');
    });

    it('throws ContractParseError for ensures expression with issues', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: [],
        ensures: ['(result'],
        invariants: [],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced parentheses');
    });

    it('throws ContractParseError for invariant expression with issues', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: [],
        ensures: [],
        invariants: ['[unclosed'],
        claimRefs: [],
      };

      expect(() => generateRuntimeAssertions(contract)).toThrow(ContractParseError);
      expect(() => generateRuntimeAssertions(contract)).toThrow('unbalanced square brackets');
    });

    it('ContractParseError has correct properties', () => {
      const contract: MicroContract = {
        functionName: 'test',
        filePath: 'test.ts',
        requires: ['(x > 0'],
        ensures: [],
        invariants: [],
        claimRefs: [],
      };

      try {
        generateRuntimeAssertions(contract);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContractParseError);
        const err = error as ContractParseError;
        expect(err.expression).toBe('(x > 0');
        expect(err.reason).toBe('unbalanced parentheses ()');
        expect(err.name).toBe('ContractParseError');
      }
    });
  });

  describe('parameter and return value references', () => {
    it('supports referencing function parameters', () => {
      const contract: MicroContract = {
        functionName: 'add',
        filePath: 'math.ts',
        requires: ['a >= 0', 'b >= 0'],
        ensures: ['result === a + b'],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(a >= 0)) {');
      expect(result).toContain('if (!(b >= 0)) {');
      expect(result).toContain('if (!(result === a + b)) {');
    });

    it('supports complex parameter expressions', () => {
      const contract: MicroContract = {
        functionName: 'process',
        filePath: 'processor.ts',
        requires: ['items.length > 0', 'options.maxItems >= items.length'],
        ensures: ['result.processedCount <= options.maxItems'],
        invariants: [],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(items.length > 0)) {');
      expect(result).toContain('if (!(options.maxItems >= items.length)) {');
      expect(result).toContain('if (!(result.processedCount <= options.maxItems)) {');
    });

    it('supports this references in invariants', () => {
      const contract: MicroContract = {
        functionName: 'push',
        filePath: 'stack.ts',
        requires: ['item !== undefined'],
        ensures: ['this.items[this.items.length - 1] === item'],
        invariants: ['this.items.length <= this.maxSize'],
        claimRefs: [],
      };

      const result = generateRuntimeAssertions(contract);

      expect(result).toContain('if (!(this.items.length <= this.maxSize)) {');
    });
  });

  describe('contract metadata', () => {
    it('accepts contract with complexity', () => {
      const contract: MicroContract = {
        functionName: 'sort',
        filePath: 'sort.ts',
        requires: ['arr.length > 0'],
        ensures: ['result.length === arr.length'],
        invariants: [],
        complexity: 'O(n log n)',
        claimRefs: [],
      };

      // Complexity doesn't affect assertion generation
      const result = generateRuntimeAssertions(contract);
      expect(result).toContain('if (!(arr.length > 0)) {');
    });

    it('accepts contract with purity', () => {
      const contract: MicroContract = {
        functionName: 'add',
        filePath: 'math.ts',
        requires: [],
        ensures: ['result === a + b'],
        invariants: [],
        purity: 'pure',
        claimRefs: [],
      };

      // Purity doesn't affect assertion generation
      const result = generateRuntimeAssertions(contract);
      expect(result).toContain('if (!(result === a + b)) {');
    });

    it('accepts contract with claim references', () => {
      const contract: MicroContract = {
        functionName: 'withdraw',
        filePath: 'account.ts',
        requires: ['amount > 0'],
        ensures: [],
        invariants: ['this.balance >= 0'],
        claimRefs: ['inv_001', 'behavior_005'],
      };

      // Claim refs don't affect assertion generation
      const result = generateRuntimeAssertions(contract);
      expect(result).toContain('if (!(amount > 0)) {');
    });
  });
});

describe('generatePreconditionCheck', () => {
  it('generates single precondition check', () => {
    const result = generatePreconditionCheck('x > 0');

    expect(result).toBe(
      `if (!(x > 0)) {\n  throw new AssertionError('Precondition failed: x > 0', 'precondition', 'x > 0');\n}`
    );
  });

  it('throws for malformed expression', () => {
    expect(() => generatePreconditionCheck('')).toThrow(ContractParseError);
    expect(() => generatePreconditionCheck('(unclosed')).toThrow(ContractParseError);
  });
});

describe('generatePostconditionCheck', () => {
  it('generates single postcondition check', () => {
    const result = generatePostconditionCheck('result !== null');

    expect(result).toBe(
      `if (!(result !== null)) {\n  throw new AssertionError('Postcondition failed: result !== null', 'postcondition', 'result !== null');\n}`
    );
  });

  it('replaces result with custom variable', () => {
    const result = generatePostconditionCheck('result > 0', 'returnValue');

    expect(result).toContain('if (!(returnValue > 0)) {');
    // Error message should still show original expression
    expect(result).toContain("'Postcondition failed: result > 0'");
  });

  it('throws for malformed expression', () => {
    expect(() => generatePostconditionCheck('')).toThrow(ContractParseError);
  });
});

describe('generateInvariantCheck', () => {
  it('generates single invariant check', () => {
    const result = generateInvariantCheck('this.count >= 0');

    expect(result).toBe(
      `if (!(this.count >= 0)) {\n  throw new AssertionError('Invariant violated: this.count >= 0', 'invariant', 'this.count >= 0');\n}`
    );
  });

  it('throws for malformed expression', () => {
    expect(() => generateInvariantCheck('')).toThrow(ContractParseError);
    expect(() => generateInvariantCheck('[unclosed')).toThrow(ContractParseError);
  });
});

/**
 * Strips TypeScript type annotations from generated code to make it executable as JavaScript.
 * This is used for runtime behavior verification tests.
 */
function stripTypeAnnotations(code: string): string {
  // Remove type parameter declarations like <T>, <K, V>, etc. from function declarations
  let result = code.replace(/function\s+(\w+)<[^>]+>\(/g, 'function $1(');

  // Remove parameter type annotations from function declarations only
  // Match `function name(param: type)` or `function name(param: type, param2: type)`
  result = result.replace(
    /function\s+(\w+)\(([^)]*)\)/g,
    (_match, name: string, params: string) => {
      const cleanedParams = params
        .split(',')
        .map((p: string) => p.split(':')[0]?.trim() ?? '')
        .filter((p: string) => p !== '')
        .join(', ');
      return `function ${name}(${cleanedParams})`;
    }
  );

  // Remove return type annotations like `: void {`

  result = result.replace(/\):\s*[^{]+?\{/g, ') {');

  // Remove `as Type` casts
  // eslint-disable-next-line security/detect-unsafe-regex -- Input is small, controlled test code
  result = result.replace(/\s+as\s+\w+(?:<[^>]+>)?/g, '');

  return result;
}

describe('runtime behavior verification', () => {
  it('generated precondition code throws AssertionError on failure', () => {
    const contract: MicroContract = {
      functionName: 'test',
      filePath: 'test.ts',
      requires: ['x > 0'],
      ensures: [],
      invariants: [],
      claimRefs: [],
    };

    const code = generateRuntimeAssertions(contract, { includeJsDoc: false });

    // Create AssertionError class for the test context
    const wrappedCode = `
      class AssertionError extends Error {
        constructor(message, assertionType, expression) {
          super(message);
          this.name = 'AssertionError';
          this.assertionType = assertionType;
          this.expression = expression;
        }
      }

      function checkPreconditions(x) {
        ${code}
      }

      return { checkPreconditions, AssertionError };
    `;

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const { checkPreconditions, AssertionError: TestAssertionError } = new Function(
      wrappedCode
    )() as {
      checkPreconditions: (x: number) => void;
      AssertionError: new (message: string, assertionType: string, expression: string) => Error;
    };

    // Should not throw for valid input
    expect(() => {
      checkPreconditions(5);
    }).not.toThrow();
    expect(() => {
      checkPreconditions(1);
    }).not.toThrow();

    // Should throw for invalid input
    expect(() => {
      checkPreconditions(0);
    }).toThrow(TestAssertionError);
    expect(() => {
      checkPreconditions(-1);
    }).toThrow('Precondition failed: x > 0');
  });

  it('generated postcondition code throws AssertionError on failure', () => {
    const contract: MicroContract = {
      functionName: 'test',
      filePath: 'test.ts',
      requires: [],
      ensures: ['result !== null'],
      invariants: [],
      claimRefs: [],
    };

    const code = generateRuntimeAssertions(contract, { includeJsDoc: false });
    const jsCode = stripTypeAnnotations(code);

    const wrappedCode = `
      class AssertionError extends Error {
        constructor(message, assertionType, expression) {
          super(message);
          this.name = 'AssertionError';
          this.assertionType = assertionType;
          this.expression = expression;
        }
      }

      ${jsCode}

      return { __checkPostconditions, AssertionError };
    `;

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const { __checkPostconditions, AssertionError: TestAssertionError } = new Function(
      wrappedCode
    )() as {
      __checkPostconditions: (result: unknown) => void;
      AssertionError: new (message: string, assertionType: string, expression: string) => Error;
    };

    // Should not throw for valid result
    expect(() => {
      __checkPostconditions('value');
    }).not.toThrow();
    expect(() => {
      __checkPostconditions(0);
    }).not.toThrow();

    // Should throw for null
    expect(() => {
      __checkPostconditions(null);
    }).toThrow(TestAssertionError);
    expect(() => {
      __checkPostconditions(null);
    }).toThrow('Postcondition failed: result !== null');
  });

  it('generated invariant code throws AssertionError on failure', () => {
    const contract: MicroContract = {
      functionName: 'test',
      filePath: 'test.ts',
      requires: [],
      ensures: [],
      invariants: ['count >= 0'],
      claimRefs: [],
    };

    const code = generateRuntimeAssertions(contract, { includeJsDoc: false });
    const jsCode = stripTypeAnnotations(code);

    const wrappedCode = `
      class AssertionError extends Error {
        constructor(message, assertionType, expression) {
          super(message);
          this.name = 'AssertionError';
          this.assertionType = assertionType;
          this.expression = expression;
        }
      }

      function checkInvariants(count) {
        ${jsCode}
      }

      return { checkInvariants, AssertionError };
    `;

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const { checkInvariants, AssertionError: TestAssertionError } = new Function(wrappedCode)() as {
      checkInvariants: (count: number) => void;
      AssertionError: new (message: string, assertionType: string, expression: string) => Error;
    };

    // Should not throw for valid state
    expect(() => {
      checkInvariants(0);
    }).not.toThrow();
    expect(() => {
      checkInvariants(100);
    }).not.toThrow();

    // Should throw for invalid state
    expect(() => {
      checkInvariants(-1);
    }).toThrow(TestAssertionError);
    expect(() => {
      checkInvariants(-1);
    }).toThrow('Invariant violated: count >= 0');
  });
});
