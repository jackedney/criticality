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

export type {
  DomainBoundary,
  DomainModule,
  GeneratedFile,
  ModuleGeneratorOptions,
  ModuleStructureResult,
  ProjectConventions,
  ModuleGeneratorErrorCode,
} from './types.js';
