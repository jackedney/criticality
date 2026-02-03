# PR #9 CodeRabbit Review Comments Summary

## Type Safety Issues (6)

1. **`src/interview/persistence.test.ts`** - `safeReaddir` result needs type assertion to `string[]`

2. **`src/interview/spec-generator.ts` (691-693)** - Missing type assertion for `safeReaddir` result

3. **`src/interview/spec-generator.ts` (828-830)** - Same `safeReaddir` type assertion issue

4. **`src/lattice/module-generator.ts`** - `safeReaddir` returns `Promise<unknown>`, needs casting before `.some()`

5. **`src/ledger/persistence.test.ts`** - `safeReaddir` needs type assertion before `.filter()`

6. **`src/composition-audit/report-storage.ts`** - Redundant `as number` cast on `stats.mtimeMs`

## Test Issues (3)

1. **`src/composition-audit/report-parser.test.ts`** - Test checks generic JS behavior instead of verifying parsed YAML objects have null prototypes

2. **`src/ledger/persistence.test.ts` (327-386)** - Consider property-based testing (fast-check) for roundtrip serialisation

3. **`src/interview/persistence.test.ts` (257-281)** - Consider property-based tests for serialisation round-trips

## Code Quality/Consistency (3)

1. **`src/adapters/typescript/index.test.ts`** - Consider named import (`mkdtempSync`) instead of namespace `* as fs`

2. **`src/servers/artifact/server.test.ts`** - Inconsistent safe-fs migration; still uses `fs.mkdtemp`, `fs.copyFile`, `fs.rm`

3. **`src/composition-audit/phase-regression.ts` (259-278)** - Manual index counter; use `entries()` for consistency with other refactored loops

## Other (1)

1. **`src/spec/parser.test.ts`** - Tests for `constructor` key expect "Invalid TOML syntax" but parser now throws `SpecParseError` with "Prohibited key 'constructor'" message
