/**
 * Mass Defect phase (Phase IV) module exports.
 *
 * This module provides type-safe interfaces for Mass Defect phase,
 * which reduces code mass while preserving semantics through smell-indexed
 * pattern transformations.
 *
 * @packageDocumentation
 */

export * from './types.js';
export { loadCatalog } from './catalog-parser.js';
export type { CatalogParseError, ParseResult } from './catalog-parser.js';
export { TransformationCatalog } from './catalog.js';
export {
  analyzeComplexity,
  detectSmells,
  createSourceFileFromString,
} from './complexity-analyzer.js';
export { applyTransformation } from './transformation-applier.js';
export { verifyTransformation } from './semantic-verifier.js';
