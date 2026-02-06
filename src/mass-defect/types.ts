/**
 * Type definitions for the Mass Defect phase (Phase IV).
 *
 * @packageDocumentation
 */

/**
 * Smell categories for code smell classification.
 */
export type SmellCategory =
  | 'control-flow'
  | 'duplication'
  | 'idiom-violation'
  | 'dead-weight'
  | 'clarity-debt';

/**
 * Risk levels for transformation patterns.
 * Lower values indicate safer transformations requiring less verification.
 */
export type RiskLevel = 1 | 2 | 3 | 4;

/**
 * Definition of a risk level with operational meaning.
 */
export interface RiskDefinition {
  /** The risk level (1-4). */
  level: RiskLevel;
  /** Human-readable name for this risk level. */
  name: 'trivial' | 'safe' | 'moderate' | 'structural';
  /** Verification scope required for this risk level. */
  verification: VerificationScope;
}

/**
 * Discriminated union for verification scope based on risk level.
 */
export type VerificationScope =
  | { type: 'compile_only' }
  | { type: 'unit_tests'; scope: 'target_function' }
  | { type: 'integration_tests'; scope: 'module' }
  | { type: 'full_test_suite' };

/**
 * Tool rule for code smell detection.
 */
export interface ToolRule {
  /** Name of the tool (e.g., 'eslint', 'pylint'). */
  name: string;
  /** Rule identifier in the tool. */
  rule: string;
}

/**
 * Detection criteria for identifying a code smell.
 */
export interface DetectionCriteria {
  /** Optional threshold values for detection. */
  thresholds?: Record<string, number>;
  /** Tools and rules for detection. */
  tools: ToolRule[];
  /** Heuristic patterns for detection. */
  heuristics: string[];
}

/**
 * Reference to a pattern that can address a code smell.
 */
export interface PatternReference {
  /** ID of the applicable pattern. */
  patternId: string;
  /** Risk level of this pattern when applied to this smell. */
  risk: RiskLevel;
  /** Rationale for why this pattern addresses this smell. */
  rationale: string;
}

/**
 * Definition of a code smell.
 */
export interface SmellDefinition {
  /** Unique identifier for this smell. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Category this smell belongs to. */
  category: SmellCategory;
  /** Description of the smell. */
  description: string;
  /** Criteria for detecting this smell. */
  detection: DetectionCriteria;
  /** Patterns that can address this smell. */
  applicablePatterns: PatternReference[];
}

/**
 * Template for transformation prompts.
 */
export interface PromptTemplate {
  /** The full prompt text with examples. */
  template: string;
}

/**
 * Definition of a transformation pattern.
 */
export interface PatternDefinition {
  /** Unique identifier for this pattern. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of the pattern. */
  description: string;
  /** Risk level of this pattern. */
  risk: RiskLevel;
  /** Rationale for the assigned risk level. */
  riskRationale: string;
  /** Verification scope required for this pattern. */
  verification: VerificationScope;
  /** Guard conditions where this pattern should NOT be applied. */
  guards: string[];
  /** Pattern IDs that this transformation enables. */
  enables: string[];
  /** Prompt template for LLM transformation. */
  prompt: PromptTemplate;
}

/**
 * Code location for a detected smell.
 */
export interface CodeLocation {
  /** File path. */
  filePath: string;
  /** Line number. */
  line: number;
  /** Column number. */
  column: number;
}

/**
 * A detected code smell in the codebase.
 */
export interface DetectedSmell {
  /** ID of the detected smell. */
  smellId: string;
  /** Severity - how badly threshold is exceeded. */
  severity: number;
  /** Location in the code. */
  location: CodeLocation;
}

/**
 * Complexity metrics for a function or module.
 */
export interface ComplexityMetrics {
  /** Cyclomatic complexity. */
  cyclomaticComplexity: number;
  /** Function length in lines of code. */
  functionLength: number;
  /** Maximum nesting depth. */
  nestingDepth: number;
  /** Test coverage ratio (0-1). */
  testCoverage: number;
}

/**
 * Unique identifier for a function.
 */
export type FunctionId = string;

/**
 * Context for a function being transformed.
 */
export interface FunctionContext {
  /** ID of the function. */
  functionId: FunctionId;
  /** Current complexity metrics. */
  currentMetrics: ComplexityMetrics;
  /** Pattern IDs already attempted on this function. */
  previouslyAttempted: string[];
}

/**
 * A transformation to apply to address a code smell.
 */
export interface TransformationType {
  /** ID of the pattern to apply. */
  patternId: string;
  /** Smell ID being addressed. */
  smell: string;
  /** Risk level of this transformation. */
  risk: RiskLevel;
  /** Rendered prompt template for the transformation. */
  prompt: string;
}

/**
 * Catalog interface for accessing smells and patterns.
 */
export interface TransformationCatalog {
  /**
   * Get a smell definition by ID.
   * @param id - The smell ID.
   * @returns The smell definition or null if not found.
   */
  getSmell(id: string): SmellDefinition | null;

  /**
   * Get a pattern definition by ID.
   * @param id - The pattern ID.
   * @returns The pattern definition or null if not found.
   */
  getPattern(id: string): PatternDefinition | null;

  /**
   * Get all smells in a category.
   * @param category - The smell category.
   * @returns Array of smell definitions in the category.
   */
  getSmellsByCategory(category: SmellCategory): SmellDefinition[];

  /**
   * Select applicable patterns for detected smells.
   * @param detectedSmells - Array of detected smells.
   * @param functionContext - Context about the function being transformed.
   * @returns Ordered array of transformations to attempt.
   */
  selectPatterns(
    detectedSmells: DetectedSmell[],
    functionContext: FunctionContext
  ): TransformationType[];
}

/**
 * Configuration for Mass Defect complexity targets.
 */
export interface MassDefectConfig {
  /** Maximum allowed cyclomatic complexity. */
  maxCyclomaticComplexity: number;
  /** Maximum allowed function length in lines. */
  maxFunctionLength: number;
  /** Maximum allowed nesting depth. */
  maxNestingDepth: number;
  /** Minimum required test coverage (0-1). */
  minTestCoverage: number;
  /** Path to the transformation catalog directory. */
  catalogPath: string;
}

/**
 * Result of applying a transformation.
 */
export interface TransformationResult {
  /** Whether the transformation succeeded. */
  success: boolean;
  /** Pattern ID that was applied. */
  patternId: string;
  /** Original function code. */
  originalCode: string;
  /** Transformed function code (if successful). */
  transformedCode?: string;
  /** Error message (if failed). */
  error?: string;
}

/**
 * Context for verification of a transformation.
 */
export interface VerificationContext {
  /** File path where the function is located. */
  filePath: string;
  /** Name of the function being transformed. */
  functionName: string;
  /** Module name for filtering tests (used for risk levels 2-3). */
  moduleName?: string;
  /** Working directory for running tests. */
  workingDir: string;
}

/**
 * Result of verifying a transformation.
 */
export interface VerificationResult {
  /** Whether the verification passed. */
  passed: boolean;
  /** Errors encountered during verification. */
  errors: string[];
  /** Number of tests run. */
  testsRun: number;
}
