/**
 * Specification types for spec.toml parsing.
 *
 * These types match the spec.schema.json schema for the Ignition phase artifact.
 *
 * @packageDocumentation
 */

/**
 * Supported implementation languages.
 */
export type Language = 'rust' | 'typescript' | 'python' | 'go' | 'java' | 'cpp';

/**
 * Claim type categories for property testing.
 */
export type ClaimType =
  | 'invariant'
  | 'behavioral'
  | 'negative'
  | 'temporal'
  | 'concurrent'
  | 'performance';

/**
 * Trust level for witness constructors.
 */
export type TrustLevel = 'safe' | 'unsafe';

/**
 * Metadata about the specification.
 */
export interface SpecMeta {
  /** Semantic version of this specification. */
  version: string;
  /** ISO 8601 timestamp of creation. */
  created: string;
  /** Domain category (e.g., fintech, healthcare, e-commerce). */
  domain?: string;
  /** List of specification authors. */
  authors?: string[];
}

/**
 * System-level metadata.
 */
export interface SpecSystem {
  /** System name (kebab-case recommended). */
  name: string;
  /** Brief description of the system's purpose. */
  description?: string;
  /** Primary implementation language. */
  language?: Language;
}

/**
 * System boundary definitions.
 */
export interface SpecBoundaries {
  /** External systems this system interacts with. */
  external_systems?: string[];
  /** Points where trust level changes. */
  trust_boundaries?: string[];
}

/**
 * An enumeration type.
 */
export interface SpecEnum {
  /** Description of the enum. */
  description?: string;
  /** Enum variant names. */
  variants: string[];
}

/**
 * A field in a data model.
 */
export interface SpecField {
  /** Field name. */
  name: string;
  /** Field type (may reference witnesses). */
  type: string;
  /** Field-level constraints. */
  constraints?: string[];
  /** Description of the field. */
  description?: string;
}

/**
 * A domain data model (struct/class).
 */
export interface SpecDataModel {
  /** Description of the data model. */
  description?: string;
  /** Fields in the data model. */
  fields: SpecField[];
  /** Invariants that must hold for valid instances. */
  invariants?: string[];
}

/**
 * A method in an interface.
 */
export interface SpecMethod {
  /** Method name. */
  name: string;
  /** Parameter list as 'name: Type' strings. */
  params?: string[];
  /** Return type. */
  returns: string;
  /** Description of the method. */
  description?: string;
  /** REQUIRES/ENSURES/etc contract clauses. */
  contracts?: string[];
}

/**
 * A service interface (trait/interface).
 */
export interface SpecInterface {
  /** Description of the interface. */
  description?: string;
  /** Methods in the interface. */
  methods: SpecMethod[];
}

/**
 * System constraints by category.
 */
export interface SpecConstraints {
  /** Functional requirements and invariants. */
  functional?: string[];
  /** Performance, scalability, and other NFRs. */
  non_functional?: string[];
  /** Security requirements. */
  security?: string[];
}

/**
 * A testable claim for property testing.
 */
export interface SpecClaim {
  /** Natural language claim. */
  text: string;
  /** Claim category. */
  type: ClaimType;
  /** Whether this claim can be automatically tested. */
  testable?: boolean;
  /** For invariants: what the invariant is about. */
  subject?: string;
  /** For invariants: the condition. */
  predicate?: string;
  /** For behavioral: what triggers the behavior. */
  trigger?: string;
  /** For behavioral: expected outcome. */
  outcome?: string;
  /** For negative: the forbidden action. */
  action?: string;
  /** For negative: what must not happen. */
  forbidden_outcome?: string;
  /** For temporal: initial setup. */
  setup?: string;
  /** For temporal: what holds during the period. */
  invariant?: string;
  /** For temporal: what ends the period. */
  termination?: string;
  /** For concurrent/performance: the operation. */
  operation?: string;
  /** For performance: expected complexity. */
  complexity?: string;
  /** External dependencies that need mocking. */
  requires_mocking?: string[];
}

/**
 * A type parameter for a witness.
 */
export interface WitnessTypeParam {
  /** Type parameter name. */
  name?: string;
  /** Type parameter bounds. */
  bounds?: string[];
}

/**
 * An invariant in a witness.
 */
export interface WitnessInvariant {
  /** Invariant identifier. */
  id?: string;
  /** Description of the invariant. */
  description?: string;
  /** Formal expression of the invariant. */
  formal?: string;
  /** Whether the invariant is testable. */
  testable?: boolean;
}

/**
 * A constructor for a witness.
 */
export interface WitnessConstructor {
  /** Constructor name. */
  name?: string;
  /** Description of the constructor. */
  description?: string;
  /** Trust level of the constructor. */
  trust_level?: TrustLevel;
  /** Precondition for the constructor. */
  precondition?: string;
}

/**
 * Type witness definition.
 */
export interface SpecWitness {
  /** Witness type name. */
  name: string;
  /** Description of the witness. */
  description?: string;
  /** Underlying type (e.g., Vec<T>). */
  base_type?: string;
  /** Generic type parameters. */
  type_params?: WitnessTypeParam[];
  /** Invariants this witness guarantees. */
  invariants: WitnessInvariant[];
  /** Available constructors. */
  constructors?: WitnessConstructor[];
}

/**
 * Complete specification object parsed from spec.toml.
 */
export interface Spec {
  /** Metadata about the specification. */
  meta: SpecMeta;
  /** System-level metadata. */
  system: SpecSystem;
  /** System boundary definitions. */
  boundaries?: SpecBoundaries;
  /** Enumeration type definitions. */
  enums?: Record<string, SpecEnum>;
  /** Domain data model definitions. */
  data_models?: Record<string, SpecDataModel>;
  /** Service interface definitions. */
  interfaces?: Record<string, SpecInterface>;
  /** System constraints by category. */
  constraints?: SpecConstraints;
  /** Testable claims extracted for property testing. */
  claims?: Record<string, SpecClaim>;
  /** Type witness definitions. */
  witnesses?: Record<string, SpecWitness>;
}
