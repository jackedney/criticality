/**
 * Tests for TOML catalog parser.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSmellDefinition,
  parsePatternDefinition,
  loadCatalog,
  isCatalogError,
  type CatalogParseError,
} from './catalog-parser.js';
import type { SmellDefinition, PatternDefinition } from './types.js';

describe('parseSmellDefinition', () => {
  it('parses a valid smell definition', () => {
    const toml = `
[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels"

[detection]
max_nesting_depth = 3
tools = [
    { name = "eslint", rule = "max-depth" },
    { name = "pylint", rule = "too-many-nested-blocks" }
]

[detection.heuristics]
patterns = [
    "nested if/else chains",
    "callback pyramids"
]

[[applicable_patterns]]
pattern = "early-return"
risk = 2
rationale = "Inverts conditions to exit early"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(false);

    const smell = result as SmellDefinition;
    expect(smell.id).toBe('deep-nesting');
    expect(smell.name).toBe('Deep Nesting');
    expect(smell.category).toBe('control-flow');
    expect(smell.description).toBe('Code with excessive indentation levels');
    expect(smell.detection.thresholds?.max_nesting_depth).toBe(3);
    expect(smell.detection.tools).toHaveLength(2);
    expect(smell.detection.tools[0]?.name).toBe('eslint');
    expect(smell.detection.tools[0]?.rule).toBe('max-depth');
    expect(smell.detection.heuristics).toContain('nested if/else chains');
    expect(smell.applicablePatterns).toHaveLength(1);
    expect(smell.applicablePatterns[0]?.patternId).toBe('early-return');
    expect(smell.applicablePatterns[0]?.risk).toBe(2);
  });

  it('parses smell without thresholds', () => {
    const toml = `
[smell]
id = "unused-binding"
name = "Unused Binding"
category = "dead-weight"
description = "Variable declared but never used"

[detection]
tools = [{ name = "eslint", rule = "no-unused-vars" }]

[detection.heuristics]
patterns = []

[[applicable_patterns]]
pattern = "remove-unused-binding"
risk = 1
rationale = "Simple removal"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(false);
    const smell = result as SmellDefinition;
    expect(smell.id).toBe('unused-binding');
    expect(smell.detection.thresholds).toBeUndefined();
  });

  it('parses smell without applicable patterns', () => {
    const toml = `
[smell]
id = "over-documentation"
name = "Over Documentation"
category = "clarity-debt"
description = "Too many comments"

[detection]
tools = []

[detection.heuristics]
patterns = []
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(false);
    const smell = result as SmellDefinition;
    expect(smell.id).toBe('over-documentation');
    expect(smell.applicablePatterns).toHaveLength(0);
  });

  it('returns error for missing id field', () => {
    const toml = `
[smell]
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels"

[detection]
tools = []
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('validation_error');
    expect(error.field).toBe('smell.id');
  });

  it('returns error for invalid category', () => {
    const toml = `
[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "invalid-category"
description = "Code with excessive indentation levels"

[detection]
tools = []
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('validation_error');
    expect(error.field).toBe('smell.category');
    expect(error.message).toContain('Must be one of');
  });

  it('returns error for invalid risk level', () => {
    const toml = `
[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels"

[detection]
tools = []

[[applicable_patterns]]
pattern = "early-return"
risk = 5
rationale = "Inverts conditions"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('validation_error');
    expect(error.field).toBe('applicable_patterns[0].risk');
    expect(error.message).toContain('Must be 1, 2, 3, or 4');
  });

  it('returns error for missing detection section', () => {
    const toml = `
[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('validation_error');
    expect(error.message).toBe('Missing [detection] section');
  });

  it('returns error for malformed TOML', () => {
    const toml = `
[smell
id = "deep-nesting"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('parse_error');
    expect(error.message).toContain('Failed to parse TOML');
  });

  it('returns error for missing pattern in applicable_patterns', () => {
    const toml = `
[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels"

[detection]
tools = []

[[applicable_patterns]]
risk = 2
rationale = "Inverts conditions"
`;

    const result = parseSmellDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.field).toBe('applicable_patterns[0].pattern');
  });
});

describe('parsePatternDefinition', () => {
  it('parses a valid pattern definition', () => {
    const toml = `
[pattern]
id = "early-return"
name = "Early Return"
description = "Invert conditions and return early"
risk = 2
risk_rationale = "Local transformation, only affects control flow within function"

[verification]
required = ["compile", "unit_tests_target_function"]

[guards]
conditions = [
    "Function has cleanup logic that must run before all exits",
    "Return value requires computation from both branches"
]

[enables]
patterns = ["extract-helper", "loop-to-functional"]
rationale = "Flattening often reveals extractable blocks"

[prompt]
template = """
PATTERN: Early Return
OUTPUT FORMAT:
Return only the transformed function.
"""
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(false);

    const pattern = result as PatternDefinition;
    expect(pattern.id).toBe('early-return');
    expect(pattern.name).toBe('Early Return');
    expect(pattern.description).toBe('Invert conditions and return early');
    expect(pattern.risk).toBe(2);
    expect(pattern.riskRationale).toBe(
      'Local transformation, only affects control flow within function'
    );
    expect(pattern.verification).toEqual({ type: 'unit_tests', scope: 'target_function' });
    expect(pattern.guards).toHaveLength(2);
    expect(pattern.guards[0]).toContain('cleanup logic');
    expect(pattern.enables).toHaveLength(2);
    expect(pattern.enables[0]).toBe('extract-helper');
    expect(pattern.prompt.template).toContain('PATTERN: Early Return');
  });

  it('parses pattern with compile_only verification', () => {
    const toml = `
[pattern]
id = "remove-unused-binding"
name = "Remove Unused Binding"
description = "Remove variables that are never used"
risk = 1
risk_rationale = "Pure removal, no logic change"

[verification]
required = ["compile"]

[guards]
conditions = []

[prompt]
template = "Remove unused variables"
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(false);
    const pattern = result as PatternDefinition;
    expect(pattern.id).toBe('remove-unused-binding');
    expect(pattern.risk).toBe(1);
    expect(pattern.verification).toEqual({ type: 'compile_only' });
  });

  it('parses pattern with full_test_suite verification', () => {
    const toml = `
[pattern]
id = "extract-helper"
name = "Extract Helper"
description = "Extract code to a helper function"
risk = 3
risk_rationale = "May affect callers or require interface changes"

[verification]
required = ["compile", "full_test_suite"]

[prompt]
template = "Extract helper function"
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(false);
    const pattern = result as PatternDefinition;
    expect(pattern.verification).toEqual({ type: 'full_test_suite' });
  });

  it('returns error for invalid risk level', () => {
    const toml = `
[pattern]
id = "early-return"
name = "Early Return"
description = "Invert conditions and return early"
risk = 5
risk_rationale = "Local transformation"

[verification]
required = ["compile"]
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('validation_error');
    expect(error.field).toBe('pattern.risk');
    expect(error.message).toContain('Must be 1, 2, 3, or 4');
  });

  it('returns error for missing id field', () => {
    const toml = `
[pattern]
name = "Early Return"
description = "Invert conditions and return early"
risk = 2
risk_rationale = "Local transformation"

[verification]
required = ["compile"]
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.field).toBe('pattern.id');
  });

  it('returns error for missing verification section', () => {
    const toml = `
[pattern]
id = "early-return"
name = "Early Return"
description = "Invert conditions and return early"
risk = 2
risk_rationale = "Local transformation"
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.message).toBe('Missing [verification] section');
  });

  it('returns error for invalid verification scope', () => {
    const toml = `
[pattern]
id = "early-return"
name = "Early Return"
description = "Invert conditions and return early"
risk = 2
risk_rationale = "Local transformation"

[verification]
required = ["compile", "invalid_scope"]
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.field).toBe('verification.required');
  });

  it('returns error for malformed TOML', () => {
    const toml = `
[pattern
id = "early-return"
`;

    const result = parsePatternDefinition(toml);

    expect(isCatalogError(result)).toBe(true);
    const error = result as CatalogParseError;
    expect(error.type).toBe('parse_error');
  });
});

describe('loadCatalog', () => {
  it('returns empty catalog for nonexistent directory', async () => {
    const catalog = await loadCatalog('/nonexistent-directory-12345');
    expect(catalog).not.toBeNull();
    expect(catalog.getSmell('deep-nesting')).toBeNull();
    expect(catalog.getPattern('early-return')).toBeNull();
    expect(catalog.getSmellsByCategory('control-flow')).toHaveLength(0);
    expect(
      catalog.selectPatterns([], {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      })
    ).toHaveLength(0);
  });
});
