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

# Run tests (not yet configured - US-004)
npm run test
```

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

## TypeScript Configuration

The project uses strict TypeScript settings:
- `strict: true` - Enables all strict type checking options
- `noUncheckedIndexedAccess: true` - Adds undefined to index access results
- `exactOptionalPropertyTypes: true` - Enforces exact types for optional properties
