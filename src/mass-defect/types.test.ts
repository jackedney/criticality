/**
 * Tests for Mass Defect type definitions.
 */

import { describe, it, expect } from 'vitest';
import type {
  SmellCategory,
  RiskLevel,
  RiskDefinition,
  VerificationScope,
  SmellDefinition,
  DetectionCriteria,
  PatternDefinition,
  TransformationCatalog,
  DetectedSmell,
  FunctionContext,
  TransformationType,
  ComplexityMetrics,
  MassDefectConfig,
} from './types.js';

describe('Mass Defect Types', () => {
  describe('SmellCategory', () => {
    it('accepts valid smell categories', () => {
      const categories: SmellCategory[] = [
        'control-flow',
        'duplication',
        'idiom-violation',
        'dead-weight',
        'clarity-debt',
      ];

      expect(categories).toHaveLength(5);
    });

    it('rejects invalid smell categories', () => {
      // This should cause a TypeScript error at compile time
      // @ts-expect-error - Invalid SmellCategory value
      const invalidCategory: SmellCategory = 'invalid-category';

      expect(typeof invalidCategory).toBe('string');
    });
  });

  describe('RiskLevel', () => {
    it('accepts valid risk levels', () => {
      const levels: RiskLevel[] = [1, 2, 3, 4];

      expect(levels).toHaveLength(4);
    });

    it('rejects invalid risk levels', () => {
      // @ts-expect-error - Invalid RiskLevel value
      const invalidLevel: RiskLevel = 5;

      expect(invalidLevel).toBe(5);
    });
  });

  describe('VerificationScope discriminated union', () => {
    it('accepts compile_only scope', () => {
      const scope: VerificationScope = { type: 'compile_only' };

      expect(scope.type).toBe('compile_only');
    });

    it('accepts unit_tests scope', () => {
      const scope: VerificationScope = { type: 'unit_tests', scope: 'target_function' };

      expect(scope.type).toBe('unit_tests');
      expect(scope.scope).toBe('target_function');
    });

    it('accepts integration_tests scope', () => {
      const scope: VerificationScope = { type: 'integration_tests', scope: 'module' };

      expect(scope.type).toBe('integration_tests');
      expect(scope.scope).toBe('module');
    });

    it('accepts full_test_suite scope', () => {
      const scope: VerificationScope = { type: 'full_test_suite' };

      expect(scope.type).toBe('full_test_suite');
    });
  });

  describe('RiskDefinition interface', () => {
    it('creates valid risk definition', () => {
      const riskDef: RiskDefinition = {
        level: 1,
        name: 'trivial',
        verification: { type: 'compile_only' },
      };

      expect(riskDef.level).toBe(1);
      expect(riskDef.name).toBe('trivial');
    });
  });

  describe('DetectionCriteria interface', () => {
    it('creates valid detection criteria', () => {
      const criteria: DetectionCriteria = {
        thresholds: { max_nesting_depth: 3 },
        tools: [{ name: 'eslint', rule: 'max-depth' }],
        heuristics: ['nested if/else chains'],
      };

      expect(criteria.thresholds?.max_nesting_depth).toBe(3);
      expect(criteria.tools).toHaveLength(1);
      expect(criteria.heuristics).toHaveLength(1);
    });
  });

  describe('SmellDefinition interface', () => {
    it('creates valid smell definition', () => {
      const smell: SmellDefinition = {
        id: 'deep-nesting',
        name: 'Deep Nesting',
        category: 'control-flow',
        description: 'Code with excessive indentation levels',
        detection: {
          thresholds: { max_nesting_depth: 3 },
          tools: [{ name: 'eslint', rule: 'max-depth' }],
          heuristics: ['nested if/else chains'],
        },
        applicablePatterns: [
          { patternId: 'early-return', risk: 2, rationale: 'Inverts conditions' },
        ],
      };

      expect(smell.id).toBe('deep-nesting');
      expect(smell.category).toBe('control-flow');
      expect(smell.applicablePatterns).toHaveLength(1);
    });
  });

  describe('PatternDefinition interface', () => {
    it('creates valid pattern definition', () => {
      const pattern: PatternDefinition = {
        id: 'early-return',
        name: 'Early Return',
        description: 'Invert conditions and return early',
        risk: 2,
        riskRationale: 'Local transformation',
        verification: { type: 'unit_tests', scope: 'target_function' },
        guards: ['Function has cleanup logic'],
        enables: ['extract-helper'],
        prompt: { template: 'PATTERN: Early Return' },
      };

      expect(pattern.id).toBe('early-return');
      expect(pattern.risk).toBe(2);
      expect(pattern.enables).toHaveLength(1);
    });
  });

  describe('ComplexityMetrics interface', () => {
    it('creates valid complexity metrics', () => {
      const metrics: ComplexityMetrics = {
        cyclomaticComplexity: 15,
        functionLength: 120,
        nestingDepth: 5,
        testCoverage: 0.8,
      };

      expect(metrics.cyclomaticComplexity).toBe(15);
      expect(metrics.functionLength).toBe(120);
      expect(metrics.nestingDepth).toBe(5);
      expect(metrics.testCoverage).toBe(0.8);
    });
  });

  describe('DetectedSmell interface', () => {
    it('creates valid detected smell', () => {
      const detected: DetectedSmell = {
        smellId: 'deep-nesting',
        severity: 2,
        location: {
          filePath: '/path/to/file.ts',
          line: 10,
          column: 5,
        },
      };

      expect(detected.smellId).toBe('deep-nesting');
      expect(detected.severity).toBe(2);
    });
  });

  describe('FunctionContext interface', () => {
    it('creates valid function context', () => {
      const context: FunctionContext = {
        functionId: 'function-001',
        currentMetrics: {
          cyclomaticComplexity: 15,
          functionLength: 120,
          nestingDepth: 5,
          testCoverage: 0.8,
        },
        previouslyAttempted: ['early-return'],
      };

      expect(context.functionId).toBe('function-001');
      expect(context.previouslyAttempted).toHaveLength(1);
    });
  });

  describe('TransformationType interface', () => {
    it('creates valid transformation type', () => {
      const transformation: TransformationType = {
        patternId: 'early-return',
        smell: 'deep-nesting',
        risk: 2,
        prompt: 'PATTERN: Early Return',
      };

      expect(transformation.patternId).toBe('early-return');
      expect(transformation.risk).toBe(2);
    });
  });

  describe('MassDefectConfig interface', () => {
    it('creates valid mass defect config', () => {
      const config: MassDefectConfig = {
        maxCyclomaticComplexity: 10,
        maxFunctionLength: 50,
        maxNestingDepth: 4,
        minTestCoverage: 0.8,
        catalogPath: './mass-defect-catalog',
      };

      expect(config.maxCyclomaticComplexity).toBe(10);
      expect(config.maxFunctionLength).toBe(50);
      expect(config.maxNestingDepth).toBe(4);
      expect(config.minTestCoverage).toBe(0.8);
    });
  });

  describe('TransformationCatalog interface', () => {
    it('can be implemented', () => {
      const catalog: TransformationCatalog = {
        getSmell(_id: string) {
          return null;
        },
        getPattern(_id: string) {
          return null;
        },
        getSmellsByCategory(_category: SmellCategory) {
          return [];
        },
        selectPatterns(_detectedSmells, _functionContext) {
          return [];
        },
      };

      expect(typeof catalog.getSmell).toBe('function');
      expect(typeof catalog.getPattern).toBe('function');
      expect(typeof catalog.getSmellsByCategory).toBe('function');
      expect(typeof catalog.selectPatterns).toBe('function');
    });
  });
});
