/**
 * Specification module for spec.toml parsing.
 *
 * Provides typed specification parsing with validation against spec.schema.json.
 *
 * @packageDocumentation
 */

export { parseSpec, SpecParseError } from './parser.js';
export type {
  ClaimType,
  Language,
  Spec,
  SpecBoundaries,
  SpecClaim,
  SpecConstraints,
  SpecDataModel,
  SpecEnum,
  SpecField,
  SpecInterface,
  SpecMeta,
  SpecMethod,
  SpecSystem,
  SpecWitness,
  TrustLevel,
  WitnessConstructor,
  WitnessInvariant,
  WitnessTypeParam,
} from './types.js';
