# Agent Instructions

## Build & Test Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Type check without emitting
npm run typecheck

# Verify strict mode catches implicit any
npm run typecheck:strict-test

# Run linter
npm run lint

# Run linter with auto-fix
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without writing
npm run format:check

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Generate API documentation
npm run docs
```

## Testing

The project uses Vitest for unit and integration testing with fast-check for property-based testing:
- Test files go in `src/` with `.test.ts` or `.spec.ts` extension
- Coverage reporting via `@vitest/coverage-v8`
- Coverage threshold: 80% for lines, functions, branches, and statements
- Property-based testing available via fast-check

## Linting & Formatting

The project uses ESLint with TypeScript support and Prettier for formatting:
- ESLint configured with strict TypeScript rules
- Prettier configured for consistent code style
- Pre-commit hook via Husky runs lint-staged on staged files
- Staged `.ts` files are automatically linted and formatted

## Project Structure

- `src/` - TypeScript source files
- `dist/` - Compiled JavaScript output
- `schemas/` - JSON schemas for protocol data structures
- `test-fixtures/` - Test files for verifying TypeScript configuration

## Documentation

The project uses TypeDoc for API documentation generation:
- Documentation is generated from TSDoc comments in source files
- Run `npm run docs` to generate docs in the `docs/` directory
- Validation is enabled to warn about undocumented exports
- Test files (`*.test.ts`, `*.spec.ts`) are excluded from documentation

## TypeScript Configuration

The project uses strict TypeScript settings:
- `strict: true` - Enables all strict type checking options
- `noUncheckedIndexedAccess: true` - Adds undefined to index access results
- `exactOptionalPropertyTypes: true` - Enforces exact types for optional properties
