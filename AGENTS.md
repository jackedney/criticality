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

# Run linter (not yet configured - US-003)
npm run lint

# Run tests (not yet configured - US-004)
npm run test
```

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
