# TypeScript Adapter

The TypeScript adapter provides Criticality Protocol support for TypeScript projects. It handles TODO detection, context extraction, code injection, type checking, and test execution through a unified `TargetAdapter` interface.

## Architecture Overview

The TypeScript adapter is organized as a facade that coordinates multiple specialized modules:

```text
┌──────────────────────────────────────────────────────────────┐
│                    TypeScriptAdapter                         │
│                    (Facade - index.ts)                       │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   AST   │  │ Signature│  │  Types   │  │  Contracts   │  │
│  │ (ast.ts)│  │(signature│  │(types.ts)│  │(contracts.ts)│  │
│  │         │  │   .ts)   │  │          │  │              │  │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │Typecheck│  │Testrunner│  │ Witness  │  │  Assertions  │  │
│  │(typeche-│  │(testrun- │  │(witness. │  │(assertions.  │  │
│  │ck.ts)   │  │ner.ts)   │  │  ts)     │  │    ts)       │  │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Test Generators                             │   │
│  │  (invariant, behavioral, concurrent, benchmark)       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `index.ts` | Facade implementing `TargetAdapter` interface |
| `ast.ts` | AST operations via ts-morph: TODO detection, injection, dependency ordering |
| `signature.ts` | Function signature extraction with full type information |
| `types.ts` | Referenced type extraction (interfaces, type aliases, enums) |
| `contracts.ts` | Micro-contract parsing from JSDoc comments |
| `assertions.ts` | Runtime assertion generation from contracts |
| `witness.ts` | Branded type witness generation |
| `typecheck.ts` | TypeScript compiler wrapper with structured errors |
| `testrunner.ts` | Vitest wrapper with structured results |
| `claims.ts` | Spec claim parsing for test generation |
| `claim-parser.ts` | LLM-based claim parsing |
| `validation.ts` | Contract validation with semantic error checking |
| `*-test-generator.ts` | Test generators for different claim types |

## The TargetAdapter Interface

The `TargetAdapter` interface defines the contract that all language adapters must implement. This enables the orchestrator to work with any supported language through a uniform API.

```typescript
interface TargetAdapter {
  // Initialization
  initialize(projectPath: string): Promise<void>;

  // TODO Detection (Lattice phase)
  findTodoFunctions(): TodoFunction[];

  // Context Extraction (Injection phase input)
  extractContext(functionName: string, filePath?: string): FunctionContext;

  // Code Injection (Injection phase output)
  inject(functionName: string, body: string, filePath?: string): InjectionResult;

  // Verification (Injection phase validation)
  verify(): Promise<VerificationResult>;

  // Test Execution (Mesoscopic phase)
  runTests(pattern: string): Promise<TestRunResult>;
}
```

### Design Principles

The adapter follows key Criticality Protocol principles:

1. **AST-Based Operations** (per [DECISIONS.toml `orch_002`](../../DECISIONS.toml)): Code injection uses AST manipulation via ts-morph rather than string manipulation, ensuring structural correctness.

2. **Topological Ordering** (per [DECISIONS.toml `inject_006`](../../DECISIONS.toml)): Functions are injected in dependency order - leaf functions first, then dependents - enabling incremental verification.

3. **Minimal Context** (per [DECISIONS.toml `inject_001`](../../DECISIONS.toml)): Context extraction provides only what's needed: signature, contracts, and referenced types.

## Protocol Phase Integration

### Lattice Phase

During Lattice, the adapter detects TODO stubs that need implementation:

```typescript
const adapter = new TypeScriptAdapter();
await adapter.initialize('./project');

// Find all functions with TODO bodies
const todos = adapter.findTodoFunctions();
// Returns: [{ name, filePath, line, signature, hasTodoBody }, ...]

// Functions are already sorted topologically (leaves first)
```

TODO functions are identified by their body content:
- `throw new Error('TODO')` or `throw new Error("TODO")`
- `// todo!()` comment pattern (macro-style)

### Injection Phase

For each TODO function, the orchestrator:

1. **Extracts context** for the LLM prompt:

```typescript
const context = adapter.extractContext(todo.name, todo.filePath);
// Returns:
// {
//   signature: { name, parameters, returnType, typeParameters, ... },
//   referencedTypes: [{ name, kind, definition, members, ... }, ...],
//   contract: { requires, ensures, invariants, complexity, purity, ... },
//   serializedContract: '// REQUIRES: x > 0\n// ENSURES: result >= 0',
//   filePath: '/path/to/file.ts',
//   line: 42
// }
```

2. **Injects the generated body**:

```typescript
const result = adapter.inject(todo.name, generatedBody, todo.filePath);
if (!result.success) {
  console.error('Injection failed:', result.error);
}
```

3. **Verifies type correctness**:

```typescript
const verification = await adapter.verify();
if (!verification.success) {
  // Type errors detected - re-inject this function
  for (const error of verification.typeCheck.errors) {
    console.log(`${error.file}:${error.line} - ${error.code}: ${error.message}`);
    if (error.typeDetails) {
      console.log(`  Expected: ${error.typeDetails.expected}`);
      console.log(`  Actual: ${error.typeDetails.actual}`);
    }
  }
}
```

### Mesoscopic Verification Phase

After all functions are injected, the adapter runs generated tests:

```typescript
const testResult = await adapter.runTests('**/*.test.ts');
if (!testResult.success) {
  console.log(`${testResult.failedTests} of ${testResult.totalTests} tests failed`);
  for (const test of testResult.tests.filter(t => t.status === 'failed')) {
    console.log(`  ${test.fullName}: ${test.error?.message}`);
  }
}
```

## Witness Generation

The witness module generates TypeScript branded types from invariant definitions:

```typescript
import { generateBrandedType, generateValidationFactory } from './witness.js';

// Define a witness
const witness = {
  name: 'NonNegativeDecimal',
  baseType: 'number',
  invariant: 'value >= 0'
};

// Generate branded type
const typeCode = generateBrandedType(witness);
// type NonNegativeDecimal = number & { readonly __brand: unique symbol };

// Generate validation factory
const factoryCode = generateValidationFactory(witness);
// function makeNonNegativeDecimal(value: number): NonNegativeDecimal | null { ... }
// function assertNonNegativeDecimal(value: number): NonNegativeDecimal { ... }
// function isNonNegativeDecimal(value: unknown): value is NonNegativeDecimal { ... }
```

Witnesses provide compile-time type safety through TypeScript's structural type system.

## Contract Extraction

Micro-contracts are extracted from JSDoc annotations:

```typescript
/**
 * Computes the square root of a number.
 * @requires x >= 0
 * @ensures result * result === x (within floating-point tolerance)
 * @complexity O(log n)
 * @purity pure
 * @claim_ref inv_001
 */
function sqrt(x: number): number {
  throw new Error('TODO');
}
```

The adapter parses these into structured contract objects:

```typescript
const contracts = parseContracts(project, filePath);
// Returns:
// [{
//   functionName: 'sqrt',
//   filePath: '/path/to/file.ts',
//   requires: ['x >= 0'],
//   ensures: ['result * result === x (within floating-point tolerance)'],
//   invariants: [],
//   complexity: 'O(log n)',
//   purity: 'pure',
//   claimRefs: ['inv_001']
// }]
```

## Test Generation

The adapter includes test generators for different claim types:

### Invariant Tests

Property-based tests using fast-check:

```typescript
import { generateInvariantTest } from './invariant-test-generator.js';

const claim = {
  id: 'inv_001',
  type: 'invariant',
  description: 'Account balance is never negative',
  functions: ['withdraw', 'transfer']
};

const testCode = generateInvariantTest(claim, witnesses);
// Generates vitest + fast-check property test
```

### Behavioral Tests

Integration tests with Arrange-Act-Assert structure:

```typescript
import { generateBehavioralTest } from './behavioral-test-generator.js';

const claim = {
  id: 'beh_001',
  type: 'behavioral',
  description: 'transfer moves funds between accounts',
  functions: ['transfer']
};

const testCode = generateBehavioralTest(claim);
// Generates vitest integration test with mocking support
```

### Concurrent Tests

Race condition and atomicity tests:

```typescript
import { generateConcurrentTest } from './concurrent-test-generator.js';

const claim = {
  id: 'conc_001',
  type: 'concurrent',
  description: 'balance updates are atomic',
  functions: ['updateBalance']
};

const testCode = generateConcurrentTest(claim, { strategy: 'promise' });
// Generates concurrent test using Promise.all for race simulation
```

### Performance Tests

Complexity verification benchmarks (per [DECISIONS.toml `test_005`](../../DECISIONS.toml)):

```typescript
import { generateBenchmarkTest } from './benchmark-test-generator.js';

const claim = {
  id: 'perf_001',
  type: 'performance',
  description: 'lookup is O(1)',
  functions: ['lookup']
};

const testCode = generateBenchmarkTest(claim);
// Generates scaling test at n=10, 100, 1000, 10000
// Fails if time variance exceeds 20% from expected complexity
```

## Complete Flow Example

Here's a complete example showing the full flow from TODO detection through verification:

```typescript
import { TypeScriptAdapter } from '@criticality/adapters/typescript';

async function injectWithRetry(adapter: TypeScriptAdapter, llm: LLMClient) {
  // 1. Initialize adapter
  await adapter.initialize('./my-project');

  // 2. Find TODO functions (already in topological order)
  const todos = adapter.findTodoFunctions();
  console.log(`Found ${todos.length} TODO functions`);

  // 3. Process each function
  for (const todo of todos) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      // Extract context for LLM
      const context = adapter.extractContext(todo.name, todo.filePath);

      // Build prompt with minimal context
      const prompt = buildPrompt(context);

      // Generate implementation
      const implementation = await llm.complete(prompt);

      // Inject the generated code
      const injectionResult = adapter.inject(
        todo.name,
        implementation,
        todo.filePath
      );

      if (!injectionResult.success) {
        console.log(`Injection failed: ${injectionResult.error}`);
        continue;
      }

      // Verify type correctness
      const verification = await adapter.verify();

      if (verification.success) {
        console.log(`${todo.name} implemented successfully`);
        break;
      }

      // Type errors - log and retry
      console.log(`Type errors for ${todo.name}, attempt ${attempts}:`);
      for (const error of verification.typeCheck.errors) {
        if (error.typeDetails) {
          console.log(`  Expected: ${error.typeDetails.expected}`);
          console.log(`  Actual: ${error.typeDetails.actual}`);
        }
      }

      // Reset for retry (discard failed attempt per inject_002)
      adapter.inject(todo.name, 'throw new Error("TODO")', todo.filePath);
    }
  }

  // 4. Run tests after all injections
  const testResult = await adapter.runTests('**/*.test.ts');
  console.log(`Tests: ${testResult.passedTests}/${testResult.totalTests} passed`);

  return testResult.success;
}
```

## Relevant DECISIONS.toml Entries

The TypeScript adapter implementation is guided by several architectural decisions:

- **`orch_002`**: AST operations used for code injection rather than string manipulation
- **`inject_001`**: Each function receives only signature, contracts, and required types
- **`inject_002`**: Failed implementations are discarded, not debugged
- **`inject_006`**: Functions injected in topological order (leaves first)
- **`routing_005`**: Signature complexity formula for model pre-emption
- **`test_005`**: Performance claims verified via empirical scaling tests

## Extending for Other Languages

To implement an adapter for another language:

1. Create a new module under `src/adapters/<language>/`
2. Implement the `TargetAdapter` interface
3. Provide equivalent functionality for:
   - AST manipulation (TODO detection, injection)
   - Signature/type extraction
   - Contract parsing
   - Compiler/type-checker integration
   - Test runner integration
   - Witness generation (adapted to language capabilities)

The adapter pattern allows the orchestrator to remain language-agnostic while each adapter handles language-specific details.
