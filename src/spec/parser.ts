/**
 * TOML specification parser for spec.toml.
 *
 * @packageDocumentation
 */

import * as TOML from '@iarna/toml';
import type {
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

/**
 * Error class for specification parsing errors.
 */
export class SpecParseError extends Error {
  /** The original error that caused the parse failure, if any. */
  public readonly cause: Error | undefined;

  /**
   * Creates a new SpecParseError.
   *
   * @param message - Descriptive error message.
   * @param cause - The underlying error, if any.
   */
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'SpecParseError';
    this.cause = cause;
  }
}

/** Valid languages as defined in schema. */
const VALID_LANGUAGES: Language[] = ['rust', 'typescript', 'python', 'go', 'java', 'cpp'];

/** Valid claim types as defined in schema. */
const VALID_CLAIM_TYPES: ClaimType[] = [
  'invariant',
  'behavioral',
  'negative',
  'temporal',
  'concurrent',
  'performance',
];

/** Valid trust levels for witness constructors. */
const VALID_TRUST_LEVELS: TrustLevel[] = ['safe', 'unsafe'];

/** Regex pattern for semantic version. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Regex pattern for system name (kebab-case). */
const SYSTEM_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Keys that are prohibited due to prototype pollution concerns. */
const PROHIBITED_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Validates that a key is safe for use as an object property.
 *
 * This prevents prototype pollution attacks by rejecting keys that could
 * compromise the object prototype chain.
 *
 * @param key - The key to validate.
 * @param keyPath - Path to the key for error messages.
 * @throws SpecParseError if key is prohibited.
 */
function validateKey(key: string, keyPath: string): void {
  if (PROHIBITED_KEYS.includes(key)) {
    throw new SpecParseError(
      `Prohibited key '${key}' found at '${keyPath}': keys ${PROHIBITED_KEYS.map((k) => `'${k}'`).join(', ')} are not allowed for security reasons`
    );
  }
}

/**
 * Validates that a value is a string.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated string.
 * @throws SpecParseError if value is not a string.
 */
function validateString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new SpecParseError(
      `Invalid type for '${fieldPath}': expected string, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated boolean.
 * @throws SpecParseError if value is not a boolean.
 */
function validateBoolean(value: unknown, fieldPath: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SpecParseError(
      `Invalid type for '${fieldPath}': expected boolean, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validates that a value is an array of strings.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated string array.
 * @throws SpecParseError if value is not an array of strings.
 */
function validateStringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value)) {
    throw new SpecParseError(
      `Invalid type for '${fieldPath}': expected array, got ${typeof value}`
    );
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new SpecParseError(
        `Invalid type for '${fieldPath}[${String(index)}]': expected string, got ${typeof item}`
      );
    }
    return item;
  });
}

/**
 * Validates a semantic version string.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated version string.
 * @throws SpecParseError if value is not a valid semver.
 */
function validateSemver(value: unknown, fieldPath: string): string {
  const str = validateString(value, fieldPath);
  if (!SEMVER_PATTERN.test(str)) {
    throw new SpecParseError(
      `Invalid format for '${fieldPath}': expected semantic version (e.g., '1.0.0'), got '${str}'`
    );
  }
  return str;
}

/**
 * Validates a system name (kebab-case).
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated system name.
 * @throws SpecParseError if value is not valid kebab-case.
 */
function validateSystemName(value: unknown, fieldPath: string): string {
  const str = validateString(value, fieldPath);
  if (!SYSTEM_NAME_PATTERN.test(str)) {
    throw new SpecParseError(
      `Invalid format for '${fieldPath}': expected kebab-case starting with lowercase letter, got '${str}'`
    );
  }
  return str;
}

/**
 * Validates a language enum value.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated language.
 * @throws SpecParseError if value is not a valid language.
 */
function validateLanguage(value: unknown, fieldPath: string): Language {
  const str = validateString(value, fieldPath);
  if (!VALID_LANGUAGES.includes(str as Language)) {
    throw new SpecParseError(
      `Invalid value for '${fieldPath}': expected one of [${VALID_LANGUAGES.join(', ')}], got '${str}'`
    );
  }
  return str as Language;
}

/**
 * Validates a claim type enum value.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated claim type.
 * @throws SpecParseError if value is not a valid claim type.
 */
function validateClaimType(value: unknown, fieldPath: string): ClaimType {
  const str = validateString(value, fieldPath);
  if (!VALID_CLAIM_TYPES.includes(str as ClaimType)) {
    throw new SpecParseError(
      `Invalid value for '${fieldPath}': expected one of [${VALID_CLAIM_TYPES.join(', ')}], got '${str}'`
    );
  }
  return str as ClaimType;
}

/**
 * Validates a trust level enum value.
 *
 * @param value - Value to validate.
 * @param fieldPath - Path to the field for error messages.
 * @returns The validated trust level.
 * @throws SpecParseError if value is not a valid trust level.
 */
function validateTrustLevel(value: unknown, fieldPath: string): TrustLevel {
  const str = validateString(value, fieldPath);
  if (!VALID_TRUST_LEVELS.includes(str as TrustLevel)) {
    throw new SpecParseError(
      `Invalid value for '${fieldPath}': expected one of [${VALID_TRUST_LEVELS.join(', ')}], got '${str}'`
    );
  }
  return str as TrustLevel;
}

/**
 * Parses the meta section from raw TOML data.
 *
 * @param raw - Raw TOML object for meta section.
 * @returns Validated SpecMeta object.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseMeta(raw: Record<string, unknown> | undefined): SpecMeta {
  if (raw === undefined) {
    throw new SpecParseError("Missing required section: 'meta'");
  }

  if (!('version' in raw)) {
    throw new SpecParseError("Missing required field: 'meta.version'");
  }
  if (!('created' in raw)) {
    throw new SpecParseError("Missing required field: 'meta.created'");
  }

  const meta: SpecMeta = {
    version: validateSemver(raw.version, 'meta.version'),
    created: validateString(raw.created, 'meta.created'),
  };

  if ('domain' in raw) {
    meta.domain = validateString(raw.domain, 'meta.domain');
  }
  if ('authors' in raw) {
    meta.authors = validateStringArray(raw.authors, 'meta.authors');
  }

  return meta;
}

/**
 * Parses the system section from raw TOML data.
 *
 * @param raw - Raw TOML object for system section.
 * @returns Validated SpecSystem object.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseSystem(raw: Record<string, unknown> | undefined): SpecSystem {
  if (raw === undefined) {
    throw new SpecParseError("Missing required section: 'system'");
  }

  if (!('name' in raw)) {
    throw new SpecParseError("Missing required field: 'system.name'");
  }

  const system: SpecSystem = {
    name: validateSystemName(raw.name, 'system.name'),
  };

  if ('description' in raw) {
    system.description = validateString(raw.description, 'system.description');
  }
  if ('language' in raw) {
    system.language = validateLanguage(raw.language, 'system.language');
  }

  return system;
}

/**
 * Parses the boundaries section from raw TOML data.
 *
 * @param raw - Raw TOML object for boundaries section.
 * @returns Validated SpecBoundaries object or undefined.
 */
function parseBoundaries(raw: Record<string, unknown> | undefined): SpecBoundaries | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const boundaries: SpecBoundaries = {};

  if ('external_systems' in raw) {
    boundaries.external_systems = validateStringArray(
      raw.external_systems,
      'boundaries.external_systems'
    );
  }
  if ('trust_boundaries' in raw) {
    boundaries.trust_boundaries = validateStringArray(
      raw.trust_boundaries,
      'boundaries.trust_boundaries'
    );
  }

  return boundaries;
}

/**
 * Parses enum definitions from raw TOML data.
 *
 * @param raw - Raw TOML object for enums section.
 * @returns Record of enum name to SpecEnum.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseEnums(
  raw: Record<string, unknown> | undefined
): Record<string, SpecEnum> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const enums = Object.create(null) as Record<string, SpecEnum>;

  for (const [enumName, enumDef] of Object.entries(raw)) {
    validateKey(enumName, 'enums');
    const def = enumDef as Record<string, unknown>;
    if (!('variants' in def)) {
      throw new SpecParseError(`Missing required field: 'enums.${enumName}.variants'`);
    }

    const specEnum: SpecEnum = {
      variants: validateStringArray(def.variants, `enums.${enumName}.variants`),
    };

    if ('description' in def) {
      specEnum.description = validateString(def.description, `enums.${enumName}.description`);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: key validated by validateKey()
    enums[enumName] = specEnum;
  }

  return enums;
}

/**
 * Parses a field definition from raw TOML data.
 *
 * @param raw - Raw TOML object for a field.
 * @param fieldPath - Base path for error messages.
 * @returns Validated SpecField object.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseField(raw: Record<string, unknown>, fieldPath: string): SpecField {
  if (!('name' in raw)) {
    throw new SpecParseError(`Missing required field: '${fieldPath}.name'`);
  }
  if (!('type' in raw)) {
    throw new SpecParseError(`Missing required field: '${fieldPath}.type'`);
  }

  const field: SpecField = {
    name: validateString(raw.name, `${fieldPath}.name`),
    type: validateString(raw.type, `${fieldPath}.type`),
  };

  if ('constraints' in raw) {
    field.constraints = validateStringArray(raw.constraints, `${fieldPath}.constraints`);
  }
  if ('description' in raw) {
    field.description = validateString(raw.description, `${fieldPath}.description`);
  }

  return field;
}

/**
 * Parses data model definitions from raw TOML data.
 *
 * @param raw - Raw TOML object for data_models section.
 * @returns Record of model name to SpecDataModel.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseDataModels(
  raw: Record<string, unknown> | undefined
): Record<string, SpecDataModel> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const dataModels = Object.create(null) as Record<string, SpecDataModel>;

  for (const [modelName, modelDef] of Object.entries(raw)) {
    validateKey(modelName, 'data_models');
    const def = modelDef as Record<string, unknown>;
    if (!('fields' in def)) {
      throw new SpecParseError(`Missing required field: 'data_models.${modelName}.fields'`);
    }

    const fieldsRaw = def.fields;
    if (!Array.isArray(fieldsRaw)) {
      throw new SpecParseError(
        `Invalid type for 'data_models.${modelName}.fields': expected array, got ${typeof fieldsRaw}`
      );
    }

    const dataModel: SpecDataModel = {
      fields: fieldsRaw.map((fieldRaw, index) =>
        parseField(
          fieldRaw as Record<string, unknown>,
          `data_models.${modelName}.fields[${String(index)}]`
        )
      ),
    };

    if ('description' in def) {
      dataModel.description = validateString(
        def.description,
        `data_models.${modelName}.description`
      );
    }
    if ('invariants' in def) {
      dataModel.invariants = validateStringArray(
        def.invariants,
        `data_models.${modelName}.invariants`
      );
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: key validated by validateKey()
    dataModels[modelName] = dataModel;
  }

  return dataModels;
}

/**
 * Parses a method definition from raw TOML data.
 *
 * @param raw - Raw TOML object for a method.
 * @param methodPath - Base path for error messages.
 * @returns Validated SpecMethod object.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseMethod(raw: Record<string, unknown>, methodPath: string): SpecMethod {
  if (!('name' in raw)) {
    throw new SpecParseError(`Missing required field: '${methodPath}.name'`);
  }
  if (!('returns' in raw)) {
    throw new SpecParseError(`Missing required field: '${methodPath}.returns'`);
  }

  const method: SpecMethod = {
    name: validateString(raw.name, `${methodPath}.name`),
    returns: validateString(raw.returns, `${methodPath}.returns`),
  };

  if ('params' in raw) {
    method.params = validateStringArray(raw.params, `${methodPath}.params`);
  }
  if ('description' in raw) {
    method.description = validateString(raw.description, `${methodPath}.description`);
  }
  if ('contracts' in raw) {
    method.contracts = validateStringArray(raw.contracts, `${methodPath}.contracts`);
  }

  return method;
}

/**
 * Parses interface definitions from raw TOML data.
 *
 * @param raw - Raw TOML object for interfaces section.
 * @returns Record of interface name to SpecInterface.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseInterfaces(
  raw: Record<string, unknown> | undefined
): Record<string, SpecInterface> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const interfaces = Object.create(null) as Record<string, SpecInterface>;

  for (const [ifaceName, ifaceDef] of Object.entries(raw)) {
    validateKey(ifaceName, 'interfaces');
    const def = ifaceDef as Record<string, unknown>;
    if (!('methods' in def)) {
      throw new SpecParseError(`Missing required field: 'interfaces.${ifaceName}.methods'`);
    }

    const methodsRaw = def.methods;
    if (!Array.isArray(methodsRaw)) {
      throw new SpecParseError(
        `Invalid type for 'interfaces.${ifaceName}.methods': expected array, got ${typeof methodsRaw}`
      );
    }

    const iface: SpecInterface = {
      methods: methodsRaw.map((methodRaw, index) =>
        parseMethod(
          methodRaw as Record<string, unknown>,
          `interfaces.${ifaceName}.methods[${String(index)}]`
        )
      ),
    };

    if ('description' in def) {
      iface.description = validateString(def.description, `interfaces.${ifaceName}.description`);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: key validated by validateKey()
    interfaces[ifaceName] = iface;
  }

  return interfaces;
}

/**
 * Parses the constraints section from raw TOML data.
 *
 * @param raw - Raw TOML object for constraints section.
 * @returns Validated SpecConstraints object or undefined.
 */
function parseConstraints(raw: Record<string, unknown> | undefined): SpecConstraints | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const constraints: SpecConstraints = {};

  if ('functional' in raw) {
    constraints.functional = validateStringArray(raw.functional, 'constraints.functional');
  }
  if ('non_functional' in raw) {
    constraints.non_functional = validateStringArray(
      raw.non_functional,
      'constraints.non_functional'
    );
  }
  if ('security' in raw) {
    constraints.security = validateStringArray(raw.security, 'constraints.security');
  }

  return constraints;
}

/** Default claim type when not specified. */
const DEFAULT_CLAIM_TYPE: ClaimType = 'behavioral';

/**
 * Parses a claim definition from raw TOML data.
 *
 * If the type field is missing, it defaults to 'behavioral' as per the protocol.
 *
 * @param raw - Raw TOML object for a claim.
 * @param claimPath - Base path for error messages.
 * @returns Validated SpecClaim object.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseClaim(raw: Record<string, unknown>, claimPath: string): SpecClaim {
  if (!('text' in raw)) {
    throw new SpecParseError(`Missing required field: '${claimPath}.text'`);
  }

  // Type defaults to 'behavioral' if not specified
  const claimType: ClaimType =
    'type' in raw ? validateClaimType(raw.type, `${claimPath}.type`) : DEFAULT_CLAIM_TYPE;

  const claim: SpecClaim = {
    text: validateString(raw.text, `${claimPath}.text`),
    type: claimType,
  };

  if ('testable' in raw) {
    claim.testable = validateBoolean(raw.testable, `${claimPath}.testable`);
  }
  if ('subject' in raw) {
    claim.subject = validateString(raw.subject, `${claimPath}.subject`);
  }
  if ('predicate' in raw) {
    claim.predicate = validateString(raw.predicate, `${claimPath}.predicate`);
  }
  if ('trigger' in raw) {
    claim.trigger = validateString(raw.trigger, `${claimPath}.trigger`);
  }
  if ('outcome' in raw) {
    claim.outcome = validateString(raw.outcome, `${claimPath}.outcome`);
  }
  if ('action' in raw) {
    claim.action = validateString(raw.action, `${claimPath}.action`);
  }
  if ('forbidden_outcome' in raw) {
    claim.forbidden_outcome = validateString(
      raw.forbidden_outcome,
      `${claimPath}.forbidden_outcome`
    );
  }
  if ('setup' in raw) {
    claim.setup = validateString(raw.setup, `${claimPath}.setup`);
  }
  if ('invariant' in raw) {
    claim.invariant = validateString(raw.invariant, `${claimPath}.invariant`);
  }
  if ('termination' in raw) {
    claim.termination = validateString(raw.termination, `${claimPath}.termination`);
  }
  if ('operation' in raw) {
    claim.operation = validateString(raw.operation, `${claimPath}.operation`);
  }
  if ('complexity' in raw) {
    claim.complexity = validateString(raw.complexity, `${claimPath}.complexity`);
  }
  if ('requires_mocking' in raw) {
    claim.requires_mocking = validateStringArray(
      raw.requires_mocking,
      `${claimPath}.requires_mocking`
    );
  }

  return claim;
}

/**
 * Parses claims from raw TOML data.
 *
 * @param raw - Raw TOML object for claims section.
 * @returns Record of claim name to SpecClaim.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseClaims(
  raw: Record<string, unknown> | undefined
): Record<string, SpecClaim> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const claims = Object.create(null) as Record<string, SpecClaim>;

  for (const [claimName, claimDef] of Object.entries(raw)) {
    validateKey(claimName, 'claims');
    // eslint-disable-next-line security/detect-object-injection -- safe: key validated by validateKey()
    claims[claimName] = parseClaim(claimDef as Record<string, unknown>, `claims.${claimName}`);
  }

  return claims;
}

/**
 * Parses a witness type param from raw TOML data.
 *
 * @param raw - Raw TOML object for a type param.
 * @param paramPath - Base path for error messages.
 * @returns Validated WitnessTypeParam object.
 */
function parseWitnessTypeParam(raw: Record<string, unknown>, paramPath: string): WitnessTypeParam {
  const param: WitnessTypeParam = {};

  if ('name' in raw) {
    param.name = validateString(raw.name, `${paramPath}.name`);
  }
  if ('bounds' in raw) {
    param.bounds = validateStringArray(raw.bounds, `${paramPath}.bounds`);
  }

  return param;
}

/**
 * Parses a witness invariant from raw TOML data.
 *
 * @param raw - Raw TOML object for an invariant.
 * @param invPath - Base path for error messages.
 * @returns Validated WitnessInvariant object.
 */
function parseWitnessInvariant(raw: Record<string, unknown>, invPath: string): WitnessInvariant {
  const inv: WitnessInvariant = {};

  if ('id' in raw) {
    inv.id = validateString(raw.id, `${invPath}.id`);
  }
  if ('description' in raw) {
    inv.description = validateString(raw.description, `${invPath}.description`);
  }
  if ('formal' in raw) {
    inv.formal = validateString(raw.formal, `${invPath}.formal`);
  }
  if ('testable' in raw) {
    inv.testable = validateBoolean(raw.testable, `${invPath}.testable`);
  }

  return inv;
}

/**
 * Parses a witness constructor from raw TOML data.
 *
 * @param raw - Raw TOML object for a constructor.
 * @param ctorPath - Base path for error messages.
 * @returns Validated WitnessConstructor object.
 */
function parseWitnessConstructor(
  raw: Record<string, unknown>,
  ctorPath: string
): WitnessConstructor {
  const ctor: WitnessConstructor = {};

  if ('name' in raw) {
    ctor.name = validateString(raw.name, `${ctorPath}.name`);
  }
  if ('description' in raw) {
    ctor.description = validateString(raw.description, `${ctorPath}.description`);
  }
  if ('trust_level' in raw) {
    ctor.trust_level = validateTrustLevel(raw.trust_level, `${ctorPath}.trust_level`);
  }
  if ('precondition' in raw) {
    ctor.precondition = validateString(raw.precondition, `${ctorPath}.precondition`);
  }

  return ctor;
}

/**
 * Parses witnesses from raw TOML data.
 *
 * @param raw - Raw TOML object for witnesses section.
 * @returns Record of witness name to SpecWitness.
 * @throws SpecParseError if required fields are missing or invalid.
 */
function parseWitnesses(
  raw: Record<string, unknown> | undefined
): Record<string, SpecWitness> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const witnesses = Object.create(null) as Record<string, SpecWitness>;

  for (const [witnessName, witnessDef] of Object.entries(raw)) {
    validateKey(witnessName, 'witnesses');
    const def = witnessDef as Record<string, unknown>;
    if (!('name' in def)) {
      throw new SpecParseError(`Missing required field: 'witnesses.${witnessName}.name'`);
    }
    if (!('invariants' in def)) {
      throw new SpecParseError(`Missing required field: 'witnesses.${witnessName}.invariants'`);
    }

    const invariantsRaw = def.invariants;
    if (!Array.isArray(invariantsRaw)) {
      throw new SpecParseError(
        `Invalid type for 'witnesses.${witnessName}.invariants': expected array, got ${typeof invariantsRaw}`
      );
    }

    const witness: SpecWitness = {
      name: validateString(def.name, `witnesses.${witnessName}.name`),
      invariants: invariantsRaw.map((invRaw, index) =>
        parseWitnessInvariant(
          invRaw as Record<string, unknown>,
          `witnesses.${witnessName}.invariants[${String(index)}]`
        )
      ),
    };

    if ('description' in def) {
      witness.description = validateString(def.description, `witnesses.${witnessName}.description`);
    }
    if ('base_type' in def) {
      witness.base_type = validateString(def.base_type, `witnesses.${witnessName}.base_type`);
    }
    if ('type_params' in def) {
      const typeParamsRaw = def.type_params;
      if (!Array.isArray(typeParamsRaw)) {
        throw new SpecParseError(
          `Invalid type for 'witnesses.${witnessName}.type_params': expected array, got ${typeof typeParamsRaw}`
        );
      }
      witness.type_params = typeParamsRaw.map((paramRaw, index) =>
        parseWitnessTypeParam(
          paramRaw as Record<string, unknown>,
          `witnesses.${witnessName}.type_params[${String(index)}]`
        )
      );
    }
    if ('constructors' in def) {
      const ctorsRaw = def.constructors;
      if (!Array.isArray(ctorsRaw)) {
        throw new SpecParseError(
          `Invalid type for 'witnesses.${witnessName}.constructors': expected array, got ${typeof ctorsRaw}`
        );
      }
      witness.constructors = ctorsRaw.map((ctorRaw, index) =>
        parseWitnessConstructor(
          ctorRaw as Record<string, unknown>,
          `witnesses.${witnessName}.constructors[${String(index)}]`
        )
      );
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: key validated by validateKey()
    witnesses[witnessName] = witness;
  }

  return witnesses;
}

/**
 * Parses a TOML string into a validated Spec object.
 *
 * @param tomlContent - Raw TOML content as a string.
 * @returns Validated specification object.
 * @throws SpecParseError for invalid TOML syntax or invalid field values.
 *
 * @example
 * ```typescript
 * import { parseSpec } from './spec/parser.js';
 *
 * const toml = `
 * [meta]
 * version = "1.0.0"
 * created = "2024-01-24T12:00:00Z"
 *
 * [system]
 * name = "my-system"
 * language = "typescript"
 * `;
 *
 * const spec = parseSpec(toml);
 * console.log(spec.system.name); // "my-system"
 * ```
 */
export function parseSpec(tomlContent: string): Spec {
  let parsed: Record<string, unknown>;

  try {
    parsed = TOML.parse(tomlContent) as Record<string, unknown>;
  } catch (error) {
    const tomlError = error as Error;
    throw new SpecParseError(`Invalid TOML syntax: ${tomlError.message}`, tomlError);
  }

  const meta = parseMeta(parsed.meta as Record<string, unknown> | undefined);
  const system = parseSystem(parsed.system as Record<string, unknown> | undefined);

  const spec: Spec = {
    meta,
    system,
  };

  const boundaries = parseBoundaries(parsed.boundaries as Record<string, unknown> | undefined);
  if (boundaries !== undefined) {
    spec.boundaries = boundaries;
  }

  const enums = parseEnums(parsed.enums as Record<string, unknown> | undefined);
  if (enums !== undefined) {
    spec.enums = enums;
  }

  const dataModels = parseDataModels(parsed.data_models as Record<string, unknown> | undefined);
  if (dataModels !== undefined) {
    spec.data_models = dataModels;
  }

  const interfaces = parseInterfaces(parsed.interfaces as Record<string, unknown> | undefined);
  if (interfaces !== undefined) {
    spec.interfaces = interfaces;
  }

  const constraints = parseConstraints(parsed.constraints as Record<string, unknown> | undefined);
  if (constraints !== undefined) {
    spec.constraints = constraints;
  }

  const claims = parseClaims(parsed.claims as Record<string, unknown> | undefined);
  if (claims !== undefined) {
    spec.claims = claims;
  }

  const witnesses = parseWitnesses(parsed.witnesses as Record<string, unknown> | undefined);
  if (witnesses !== undefined) {
    spec.witnesses = witnesses;
  }

  return spec;
}

export type { Spec };
