/**
 * Tests for TransformationCatalog class.
 */

import { describe, it, expect } from 'vitest';
import { TransformationCatalog } from './catalog.js';
import type {
  SmellDefinition,
  PatternDefinition,
  DetectedSmell,
  FunctionContext,
  SmellCategory,
} from './types.js';

describe('TransformationCatalog', () => {
  describe('getSmell', () => {
    it('returns smell definition by ID', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [{ name: 'eslint', rule: 'max-depth' }],
          heuristics: ['nested if statements'],
        },
        applicablePatterns: [
          { patternId: 'early-return', risk: 2, rationale: 'Flattens structure' },
        ],
      };

      smells.set('deep-nesting', smell);

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getSmell('deep-nesting');

      expect(result).toEqual(smell);
    });

    it('returns null for non-existent smell ID', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getSmell('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getPattern', () => {
    it('returns pattern definition by ID', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const pattern: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions',
        risk: 2,
        riskRationale: 'Local transformation',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: ['Cleanup logic required'],
        enables: ['extract-helper'],
        prompt: { template: 'Apply early return' },
      };

      patterns.set('early-return', pattern);

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getPattern('early-return');

      expect(result).toEqual(pattern);
    });

    it('returns null for non-existent pattern ID', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getPattern('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getSmellsByCategory', () => {
    it('returns all smells in a category', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell1: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [{ name: 'eslint', rule: 'max-depth' }],
          heuristics: [],
        },
        applicablePatterns: [],
      };

      const smell2: SmellDefinition = {
        id: 'high-cyclomatic-complexity',
        name: 'High Cyclomatic Complexity',
        category: 'control-flow',
        description: 'Too many branches',
        detection: {
          tools: [{ name: 'eslint', rule: 'complexity' }],
          heuristics: [],
        },
        applicablePatterns: [],
      };

      const smell3: SmellDefinition = {
        id: 'unused-binding',
        name: 'Unused Binding',
        category: 'dead-weight',
        description: 'Unused variables',
        detection: {
          tools: [{ name: 'eslint', rule: 'no-unused-vars' }],
          heuristics: [],
        },
        applicablePatterns: [],
      };

      smells.set('deep-nesting', smell1);
      smells.set('high-cyclomatic-complexity', smell2);
      smells.set('unused-binding', smell3);

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getSmellsByCategory('control-flow');

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(smell1);
      expect(result).toContainEqual(smell2);
      expect(result).not.toContainEqual(smell3);
    });

    it('returns empty array for category with no smells', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [{ name: 'eslint', rule: 'max-depth' }],
          heuristics: [],
        },
        applicablePatterns: [],
      };

      smells.set('deep-nesting', smell);

      const catalog = new TransformationCatalog(smells, patterns);

      const result = catalog.getSmellsByCategory('duplication' as SmellCategory);

      expect(result).toHaveLength(0);
    });
  });

  describe('selectPatterns', () => {
    it('returns empty array for empty detected smells', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const catalog = new TransformationCatalog(smells, patterns);
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns([], context);

      expect(result).toHaveLength(0);
    });

    it('returns patterns ordered by risk (ascending)', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [
          { patternId: 'extract-helper', risk: 3, rationale: 'Extract to helper' },
          { patternId: 'early-return', risk: 2, rationale: 'Early returns' },
          { patternId: 'remove-unused-binding', risk: 1, rationale: 'Remove unused' },
        ],
      };

      const pattern1: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions',
        risk: 2,
        riskRationale: 'Local',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: [],
        enables: ['extract-helper'],
        prompt: { template: 'Apply early return' },
      };

      const pattern2: PatternDefinition = {
        id: 'extract-helper',
        name: 'Extract Helper',
        description: 'Extract to function',
        risk: 3,
        riskRationale: 'Moderate',
        verification: { type: 'integration_tests', scope: 'module' },
        guards: [],
        enables: [],
        prompt: { template: 'Extract helper' },
      };

      const pattern3: PatternDefinition = {
        id: 'remove-unused-binding',
        name: 'Remove Unused Binding',
        description: 'Remove unused',
        risk: 1,
        riskRationale: 'Trivial',
        verification: { type: 'compile_only' },
        guards: [],
        enables: [],
        prompt: { template: 'Remove unused' },
      };

      smells.set('deep-nesting', smell);
      patterns.set('early-return', pattern1);
      patterns.set('extract-helper', pattern2);
      patterns.set('remove-unused-binding', pattern3);

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'deep-nesting',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(3);
      expect(result[0]?.patternId).toBe('remove-unused-binding');
      expect(result[0]?.risk).toBe(1);
      expect(result[1]?.patternId).toBe('early-return');
      expect(result[1]?.risk).toBe(2);
      expect(result[2]?.patternId).toBe('extract-helper');
      expect(result[2]?.risk).toBe(3);
    });

    it('sorts by enables count descending when risk is equal', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [
          { patternId: 'early-return', risk: 2, rationale: 'Early returns' },
          { patternId: 'guard-clause', risk: 2, rationale: 'Guard clauses' },
        ],
      };

      const pattern1: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions',
        risk: 2,
        riskRationale: 'Local',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: [],
        enables: ['extract-helper', 'loop-to-functional'],
        prompt: { template: 'Apply early return' },
      };

      const pattern2: PatternDefinition = {
        id: 'guard-clause',
        name: 'Guard Clause',
        description: 'Guard clauses',
        risk: 2,
        riskRationale: 'Local',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: [],
        enables: [],
        prompt: { template: 'Guard clause' },
      };

      smells.set('deep-nesting', smell);
      patterns.set('early-return', pattern1);
      patterns.set('guard-clause', pattern2);

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'deep-nesting',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(2);
      expect(result[0]?.patternId).toBe('early-return');
      expect(result[1]?.patternId).toBe('guard-clause');
    });

    it('deduplicates patterns by ID, keeping highest severity', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell1: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [{ patternId: 'early-return', risk: 2, rationale: 'Early returns' }],
      };

      const smell2: SmellDefinition = {
        id: 'high-cyclomatic-complexity',
        name: 'High Cyclomatic Complexity',
        category: 'control-flow',
        description: 'Too many branches',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [{ patternId: 'early-return', risk: 2, rationale: 'Early returns' }],
      };

      const pattern: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions',
        risk: 2,
        riskRationale: 'Local',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: [],
        enables: [],
        prompt: { template: 'Apply early return' },
      };

      smells.set('deep-nesting', smell1);
      smells.set('high-cyclomatic-complexity', smell2);
      patterns.set('early-return', pattern);

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'deep-nesting',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
        {
          smellId: 'high-cyclomatic-complexity',
          severity: 5,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(1);
      expect(result[0]?.patternId).toBe('early-return');
      expect(result[0]?.smell).toBe('high-cyclomatic-complexity');
    });

    it('skips patterns in previouslyAttempted', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [
          { patternId: 'early-return', risk: 2, rationale: 'Early returns' },
          { patternId: 'extract-helper', risk: 3, rationale: 'Extract to helper' },
        ],
      };

      const pattern1: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions',
        risk: 2,
        riskRationale: 'Local',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: [],
        enables: [],
        prompt: { template: 'Apply early return' },
      };

      const pattern2: PatternDefinition = {
        id: 'extract-helper',
        name: 'Extract Helper',
        description: 'Extract to function',
        risk: 3,
        riskRationale: 'Moderate',
        verification: { type: 'integration_tests', scope: 'module' },
        guards: [],
        enables: [],
        prompt: { template: 'Extract helper' },
      };

      smells.set('deep-nesting', smell);
      patterns.set('early-return', pattern1);
      patterns.set('extract-helper', pattern2);

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'deep-nesting',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: ['early-return'],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(1);
      expect(result[0]?.patternId).toBe('extract-helper');
    });

    it('skips patterns for smells not in catalog', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'non-existent',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(0);
    });

    it('skips patterns not in catalog', () => {
      const smells = new Map<string, SmellDefinition>();
      const patterns = new Map<string, PatternDefinition>();

      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Excessive nesting',
        detection: {
          tools: [],
          heuristics: [],
        },
        applicablePatterns: [{ patternId: 'non-existent', risk: 2, rationale: 'Does not exist' }],
      };

      smells.set('deep-nesting', smell);

      const catalog = new TransformationCatalog(smells, patterns);
      const detectedSmells: DetectedSmell[] = [
        {
          smellId: 'deep-nesting',
          severity: 2,
          location: { filePath: 'test.ts', line: 1, column: 1 },
        },
      ];
      const context: FunctionContext = {
        functionId: 'test',
        currentMetrics: {
          cyclomaticComplexity: 1,
          functionLength: 1,
          nestingDepth: 1,
          testCoverage: 0,
        },
        previouslyAttempted: [],
      };

      const result = catalog.selectPatterns(detectedSmells, context);

      expect(result).toHaveLength(0);
    });
  });
});
