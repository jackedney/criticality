import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseSpec, SpecParseError } from './index.js';

describe('Spec Parser', () => {
  describe('parseSpec', () => {
    describe('valid TOML parsing', () => {
      it('should parse minimal valid specification', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"
`;
        const spec = parseSpec(toml);

        expect(spec.meta.version).toBe('1.0.0');
        expect(spec.meta.created).toBe('2024-01-24T12:00:00Z');
        expect(spec.system.name).toBe('my-system');
      });

      it('should parse complete specification with all sections', () => {
        const toml = `
[meta]
version = "2.1.0"
created = "2024-01-24T15:30:00Z"
domain = "fintech"
authors = ["Alice", "Bob"]

[system]
name = "payment-processor"
description = "Handles payment processing"
language = "typescript"

[boundaries]
external_systems = ["stripe-api", "bank-gateway"]
trust_boundaries = ["user-input", "external-api"]

[enums.OrderStatus]
description = "Status of an order"
variants = ["pending", "processing", "completed", "failed"]

[data_models.User]
description = "A user account"
fields = [
  { name = "id", type = "UserId", description = "Unique identifier" },
  { name = "email", type = "Email", constraints = ["must be valid email format"] }
]
invariants = ["email must be unique"]

[interfaces.PaymentService]
description = "Handles payment operations"
methods = [
  { name = "processPayment", params = ["amount: Money", "card: Card"], returns = "Result<PaymentId, PaymentError>", contracts = ["REQUIRES: amount > 0", "ENSURES: result is valid"] }
]

[constraints]
functional = ["All payments must be atomic"]
non_functional = ["P99 latency < 100ms"]
security = ["PCI-DSS compliance required"]

[claims.payment_atomicity]
text = "Payment operations are atomic"
type = "invariant"
testable = true
subject = "payment operation"
predicate = "is atomic"

[witnesses.NonEmptyList]
name = "NonEmptyList"
description = "A list with at least one element"
base_type = "Vec<T>"
type_params = [{ name = "T", bounds = ["Clone"] }]
invariants = [{ id = "non-empty", description = "List has at least one element", formal = "len > 0", testable = true }]
constructors = [{ name = "new", description = "Create from non-empty vec", trust_level = "safe", precondition = "vec.len() > 0" }]
`;
        const spec = parseSpec(toml);

        // Meta
        expect(spec.meta.version).toBe('2.1.0');
        expect(spec.meta.domain).toBe('fintech');
        expect(spec.meta.authors).toEqual(['Alice', 'Bob']);

        // System
        expect(spec.system.name).toBe('payment-processor');
        expect(spec.system.description).toBe('Handles payment processing');
        expect(spec.system.language).toBe('typescript');

        // Boundaries
        expect(spec.boundaries?.external_systems).toEqual(['stripe-api', 'bank-gateway']);
        expect(spec.boundaries?.trust_boundaries).toEqual(['user-input', 'external-api']);

        // Enums
        expect(spec.enums?.OrderStatus?.description).toBe('Status of an order');
        expect(spec.enums?.OrderStatus?.variants).toEqual([
          'pending',
          'processing',
          'completed',
          'failed',
        ]);

        // Data models
        expect(spec.data_models?.User?.description).toBe('A user account');
        expect(spec.data_models?.User?.fields).toHaveLength(2);
        expect(spec.data_models?.User?.fields[0]?.name).toBe('id');
        expect(spec.data_models?.User?.fields[0]?.type).toBe('UserId');
        expect(spec.data_models?.User?.fields[1]?.constraints).toEqual([
          'must be valid email format',
        ]);
        expect(spec.data_models?.User?.invariants).toEqual(['email must be unique']);

        // Interfaces
        expect(spec.interfaces?.PaymentService?.description).toBe('Handles payment operations');
        expect(spec.interfaces?.PaymentService?.methods).toHaveLength(1);
        expect(spec.interfaces?.PaymentService?.methods[0]?.name).toBe('processPayment');
        expect(spec.interfaces?.PaymentService?.methods[0]?.params).toEqual([
          'amount: Money',
          'card: Card',
        ]);
        expect(spec.interfaces?.PaymentService?.methods[0]?.returns).toBe(
          'Result<PaymentId, PaymentError>'
        );

        // Constraints
        expect(spec.constraints?.functional).toEqual(['All payments must be atomic']);
        expect(spec.constraints?.non_functional).toEqual(['P99 latency < 100ms']);
        expect(spec.constraints?.security).toEqual(['PCI-DSS compliance required']);

        // Claims
        expect(spec.claims?.payment_atomicity?.text).toBe('Payment operations are atomic');
        expect(spec.claims?.payment_atomicity?.type).toBe('invariant');
        expect(spec.claims?.payment_atomicity?.testable).toBe(true);
        expect(spec.claims?.payment_atomicity?.subject).toBe('payment operation');
        expect(spec.claims?.payment_atomicity?.predicate).toBe('is atomic');

        // Witnesses
        expect(spec.witnesses?.NonEmptyList?.name).toBe('NonEmptyList');
        expect(spec.witnesses?.NonEmptyList?.description).toBe('A list with at least one element');
        expect(spec.witnesses?.NonEmptyList?.base_type).toBe('Vec<T>');
        expect(spec.witnesses?.NonEmptyList?.type_params?.[0]?.name).toBe('T');
        expect(spec.witnesses?.NonEmptyList?.type_params?.[0]?.bounds).toEqual(['Clone']);
        expect(spec.witnesses?.NonEmptyList?.invariants[0]?.id).toBe('non-empty');
        expect(spec.witnesses?.NonEmptyList?.constructors?.[0]?.trust_level).toBe('safe');
      });

      it('should parse all valid languages', () => {
        const languages = ['rust', 'typescript', 'python', 'go', 'java', 'cpp'] as const;

        for (const language of languages) {
          const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"
language = "${language}"
`;
          const spec = parseSpec(toml);
          expect(spec.system.language).toBe(language);
        }
      });

      it('should parse all valid claim types', () => {
        const claimTypes = [
          'invariant',
          'behavioral',
          'negative',
          'temporal',
          'concurrent',
          'performance',
        ] as const;

        for (const claimType of claimTypes) {
          const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.test_claim]
text = "Test claim"
type = "${claimType}"
`;
          const spec = parseSpec(toml);
          expect(spec.claims?.test_claim?.type).toBe(claimType);
        }
      });

      it('should parse behavioral claim with trigger and outcome', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.user_login]
text = "User login triggers session creation"
type = "behavioral"
trigger = "User submits valid credentials"
outcome = "Session is created"
`;
        const spec = parseSpec(toml);
        expect(spec.claims?.user_login?.trigger).toBe('User submits valid credentials');
        expect(spec.claims?.user_login?.outcome).toBe('Session is created');
      });

      it('should parse negative claim with action and forbidden_outcome', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.no_double_spend]
text = "Double spending is prevented"
type = "negative"
action = "Attempt to spend same funds twice"
forbidden_outcome = "Both transactions succeed"
`;
        const spec = parseSpec(toml);
        expect(spec.claims?.no_double_spend?.action).toBe('Attempt to spend same funds twice');
        expect(spec.claims?.no_double_spend?.forbidden_outcome).toBe('Both transactions succeed');
      });

      it('should parse temporal claim with setup, invariant, termination', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.lock_held]
text = "Lock is held during critical section"
type = "temporal"
setup = "Thread acquires lock"
invariant = "Lock remains held"
termination = "Thread releases lock"
`;
        const spec = parseSpec(toml);
        expect(spec.claims?.lock_held?.setup).toBe('Thread acquires lock');
        expect(spec.claims?.lock_held?.invariant).toBe('Lock remains held');
        expect(spec.claims?.lock_held?.termination).toBe('Thread releases lock');
      });

      it('should parse performance claim with operation and complexity', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.lookup_perf]
text = "Lookup is O(1)"
type = "performance"
operation = "HashMap lookup"
complexity = "O(1)"
`;
        const spec = parseSpec(toml);
        expect(spec.claims?.lookup_perf?.operation).toBe('HashMap lookup');
        expect(spec.claims?.lookup_perf?.complexity).toBe('O(1)');
      });

      it('should parse claim with requires_mocking', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[claims.external_api_call]
text = "External API is called correctly"
type = "behavioral"
trigger = "Request is made"
outcome = "API responds"
requires_mocking = ["external-api", "database"]
`;
        const spec = parseSpec(toml);
        expect(spec.claims?.external_api_call?.requires_mocking).toEqual([
          'external-api',
          'database',
        ]);
      });

      it('should parse witness with unsafe constructor', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[witnesses.PositiveInt]
name = "PositiveInt"
invariants = [{ id = "positive", formal = "value > 0" }]
constructors = [
  { name = "new_unchecked", trust_level = "unsafe", precondition = "caller must ensure value > 0" }
]
`;
        const spec = parseSpec(toml);
        expect(spec.witnesses?.PositiveInt?.constructors?.[0]?.trust_level).toBe('unsafe');
      });
    });

    describe('missing required fields', () => {
      it('should error when meta section is missing', () => {
        const toml = `
[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain("Missing required section: 'meta'");
        }
      });

      it('should error when system section is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain("Missing required section: 'system'");
        }
      });

      it('should error when meta.version is missing', () => {
        const toml = `
[meta]
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'meta.version'"
          );
        }
      });

      it('should error when meta.created is missing', () => {
        const toml = `
[meta]
version = "1.0.0"

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'meta.created'"
          );
        }
      });

      it('should error when system.name is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
description = "A system without a name"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'system.name'"
          );
        }
      });

      it('should error when enum variants is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[enums.Status]
description = "Status without variants"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'enums.Status.variants'"
          );
        }
      });

      it('should error when data_model fields is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[data_models.User]
description = "User without fields"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'data_models.User.fields'"
          );
        }
      });

      it('should error when field name is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[data_models.User]
fields = [{ type = "string" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'data_models.User.fields[0].name'"
          );
        }
      });

      it('should error when field type is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[data_models.User]
fields = [{ name = "id" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'data_models.User.fields[0].type'"
          );
        }
      });

      it('should error when interface methods is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[interfaces.Service]
description = "Service without methods"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'interfaces.Service.methods'"
          );
        }
      });

      it('should error when method name is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[interfaces.Service]
methods = [{ returns = "void" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'interfaces.Service.methods[0].name'"
          );
        }
      });

      it('should error when method returns is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[interfaces.Service]
methods = [{ name = "doSomething" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'interfaces.Service.methods[0].returns'"
          );
        }
      });

      it('should error when claim text is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[claims.test]
type = "invariant"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'claims.test.text'"
          );
        }
      });

      it('should error when claim type is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[claims.test]
text = "Test claim"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'claims.test.type'"
          );
        }
      });

      it('should error when witness name is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[witnesses.Test]
invariants = [{ id = "test" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'witnesses.Test.name'"
          );
        }
      });

      it('should error when witness invariants is missing', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[witnesses.Test]
name = "Test"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Missing required field: 'witnesses.Test.invariants'"
          );
        }
      });
    });

    describe('format validation errors', () => {
      it('should error for invalid TOML syntax', () => {
        const invalidToml = `
[meta
version = "1.0.0"
`;
        expect(() => parseSpec(invalidToml)).toThrow(SpecParseError);

        try {
          parseSpec(invalidToml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain('Invalid TOML syntax');
        }
      });

      it('should error for invalid semantic version', () => {
        const toml = `
[meta]
version = "1.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain('expected semantic version');
        }
      });

      it('should error for invalid system name format', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "MySystem"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain('expected kebab-case');
        }
      });

      it('should error for system name starting with number', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "123-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            'expected kebab-case starting with lowercase letter'
          );
        }
      });

      it('should error for invalid language', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"
language = "ruby"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Invalid value for 'system.language'"
          );
          expect((error as SpecParseError).message).toContain('ruby');
        }
      });

      it('should error for invalid claim type', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[claims.test]
text = "Test"
type = "unknown"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Invalid value for 'claims.test.type'"
          );
          expect((error as SpecParseError).message).toContain('unknown');
        }
      });

      it('should error for invalid trust level', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[witnesses.Test]
name = "Test"
invariants = []
constructors = [{ name = "new", trust_level = "trusted" }]
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain('Invalid value for');
          expect((error as SpecParseError).message).toContain('trust_level');
        }
      });
    });

    describe('type validation errors', () => {
      it('should error when string field receives number', () => {
        const toml = `
[meta]
version = 100
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain("Invalid type for 'meta.version'");
          expect((error as SpecParseError).message).toContain('expected string');
        }
      });

      it('should error when boolean field receives string', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-system"

[claims.test]
text = "Test"
type = "invariant"
testable = "yes"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain(
            "Invalid type for 'claims.test.testable'"
          );
          expect((error as SpecParseError).message).toContain('expected boolean');
        }
      });

      it('should error when array field receives string', () => {
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"
authors = "single author"

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain("Invalid type for 'meta.authors'");
          expect((error as SpecParseError).message).toContain('expected array');
        }
      });

      it('should error when string array contains non-strings', () => {
        // Note: TOML library catches mixed-type arrays at parse time
        const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"
authors = ["Alice", 123]

[system]
name = "my-system"
`;
        expect(() => parseSpec(toml)).toThrow(SpecParseError);

        try {
          parseSpec(toml);
        } catch (error) {
          expect((error as SpecParseError).message).toContain('Invalid TOML syntax');
        }
      });
    });
  });

  describe('SpecParseError', () => {
    it('should preserve error name', () => {
      const error = new SpecParseError('test error');
      expect(error.name).toBe('SpecParseError');
    });

    it('should preserve error message', () => {
      const error = new SpecParseError('test message');
      expect(error.message).toBe('test message');
    });

    it('should preserve original cause', () => {
      const cause = new Error('original error');
      const error = new SpecParseError('wrapper error', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('property-based tests', () => {
    it('should always return spec with required fields for minimal valid input', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: 0, max: 100 })
          ),
          fc.date(),
          fc.stringMatching(/^[a-z][a-z0-9-]*$/),
          ([major, minor, patch], created, systemName) => {
            const toml = `
[meta]
version = "${String(major)}.${String(minor)}.${String(patch)}"
created = "${created.toISOString()}"

[system]
name = "${systemName}"
`;
            const spec = parseSpec(toml);
            return (
              spec.meta.version === `${String(major)}.${String(minor)}.${String(patch)}` &&
              spec.meta.created === created.toISOString() &&
              spec.system.name === systemName
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should preserve all enum variants', () => {
      const isValidVariant = (s: string): boolean =>
        s.length > 0 &&
        !s.includes('"') &&
        !s.includes('\\') &&
        !s.includes('\n') &&
        !s.includes('\r');

      fc.assert(
        fc.property(
          fc.array(fc.string().filter(isValidVariant), { minLength: 1, maxLength: 10 }),
          (variants) => {
            const toml = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[enums.Status]
variants = [${variants.map((v) => `"${v}"`).join(', ')}]
`;
            const spec = parseSpec(toml);
            const specVariants = spec.enums?.Status?.variants ?? [];
            return (
              specVariants.length === variants.length &&
              variants.every((v, i) => specVariants[i] === v)
            );
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
