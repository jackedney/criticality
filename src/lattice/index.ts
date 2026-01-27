/**
 * Lattice phase module for the Criticality Protocol.
 *
 * The Lattice phase generates module structure from spec.toml,
 * creating domain boundaries, type definitions, and barrel files.
 *
 * @packageDocumentation
 */

export {
  generateModuleStructure,
  generateAndWriteModuleStructure,
  writeModuleStructure,
  detectProjectConventions,
  inferDomainBoundaries,
} from './module-generator.js';

export { ModuleGeneratorError } from './types.js';

export { generateTypeDefinitions, generateDomainTypeDefinitions } from './type-generator.js';

export {
  generateFunctionSignatures,
  generateFunctionsForInterface,
  generateFunction,
  generateFunctionSignature,
  mapSpecTypeToTypeScript,
  parseSpecParameter,
  parseSpecReturnType,
  InvalidTypeReferenceError,
} from './function-generator.js';

export type {
  DomainBoundary,
  DomainModule,
  GeneratedFile,
  ModuleGeneratorOptions,
  ModuleStructureResult,
  ProjectConventions,
  ModuleGeneratorErrorCode,
} from './types.js';

export type {
  TypeGenerationResult,
  TypeGeneratorOptions,
  BrandedTypeResult,
  ConstraintWarning,
  SupportedConstraintType,
} from './type-generator.js';

export type {
  FunctionGenerationResult,
  FunctionGeneratorOptions,
  GeneratedFunction,
  FunctionGenerationWarning,
  ParsedParameter,
  ParsedReturnType,
} from './function-generator.js';

export {
  generateWitnessIntegration,
  generateDomainWitnessIntegration,
  formatVerificationReport,
} from './witness-generator.js';

export type {
  WitnessVerificationTier,
  InvariantAnalysis,
  WitnessCodeResult,
  WitnessWarning,
  WitnessVerificationReport,
  WitnessGenerationResult,
  WitnessGeneratorOptions,
} from './witness-generator.js';
