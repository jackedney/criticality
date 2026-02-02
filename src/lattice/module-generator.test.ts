/**
 * Tests for the Lattice phase module structure generator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeReadFile, safeWriteFile, safeMkdir, safeStat } from '../utils/safe-fs.js';
import {
  generateModuleStructure,
  generateAndWriteModuleStructure,
  writeModuleStructure,
  detectProjectConventions,
  inferDomainBoundaries,
} from './module-generator.js';
import { parseSpec } from '../spec/parser.js';
import type { Spec } from '../spec/types.js';
import { ModuleGeneratorError } from './types.js';

describe('inferDomainBoundaries', () => {
  it('should extract domains from data models', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [{ name = "id", type = "string" }]

[data_models.AccountBalance]
fields = [{ name = "amount", type = "number" }]

[data_models.Transaction]
fields = [{ name = "id", type = "string" }]
    `);

    const boundaries = inferDomainBoundaries(spec);

    expect(boundaries).toHaveLength(2);

    const accountDomain = boundaries.find((b) => b.name === 'account');
    expect(accountDomain).toBeDefined();
    expect(accountDomain?.dataModels).toContain('Account');
    expect(accountDomain?.dataModels).toContain('AccountBalance');

    const transactionDomain = boundaries.find((b) => b.name === 'transaction');
    expect(transactionDomain).toBeDefined();
    expect(transactionDomain?.dataModels).toContain('Transaction');
  });

  it('should extract domains from interfaces', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[interfaces.AccountService]
methods = [{ name = "get", returns = "Account" }]

[interfaces.PaymentHandler]
methods = [{ name = "process", returns = "void" }]
    `);

    const boundaries = inferDomainBoundaries(spec);

    expect(boundaries).toHaveLength(2);

    const accountDomain = boundaries.find((b) => b.name === 'account');
    expect(accountDomain).toBeDefined();
    expect(accountDomain?.interfaces).toContain('AccountService');

    const paymentDomain = boundaries.find((b) => b.name === 'payment');
    expect(paymentDomain).toBeDefined();
    expect(paymentDomain?.interfaces).toContain('PaymentHandler');
  });

  it('should extract domains from features with classifications when spec has features', () => {
    // Note: Features must be manually added to spec since parser doesn't extract them yet.
    // This tests the inferDomainBoundaries function when features are present.
    const spec: Spec = {
      meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
      system: { name: 'test-system' },
      features: {
        authentication_001: {
          name: 'User Authentication',
          description: 'Secure user login',
          classification: 'core',
        },
        multitenancy_001: {
          name: 'Multi-tenancy Support',
          description: 'Tenant isolation',
          classification: 'foundational',
        },
      },
    };

    const boundaries = inferDomainBoundaries(spec);

    // Domain name is extracted from feature name - "User Authentication" -> "user"
    const userDomain = boundaries.find((b) => b.name === 'user');
    expect(userDomain).toBeDefined();
    expect(userDomain?.classification).toBe('core');

    // "Multi-tenancy Support" -> "multi" (first word before split)
    const multiDomain = boundaries.find((b) => b.name === 'multi');
    expect(multiDomain).toBeDefined();
    expect(multiDomain?.classification).toBe('foundational');
  });

  it('should create default domain from system name when no models/interfaces', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "my-awesome-system"
description = "A test system"
    `);

    const boundaries = inferDomainBoundaries(spec);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]?.name).toBe('my-awesome-system');
    expect(boundaries[0]?.description).toBe('A test system');
  });

  it('should group related models and interfaces into same domain', () => {
    const spec = parseSpec(`
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
fields = [{ name = "id", type = "string" }]

[data_models.UserProfile]
fields = [{ name = "userId", type = "string" }]

[interfaces.UserService]
methods = [{ name = "get", returns = "User" }]

[interfaces.UserRepository]
methods = [{ name = "find", returns = "User" }]
    `);

    const boundaries = inferDomainBoundaries(spec);

    expect(boundaries).toHaveLength(1);

    const userDomain = boundaries[0];
    expect(userDomain?.name).toBe('user');
    expect(userDomain?.dataModels).toHaveLength(2);
    expect(userDomain?.interfaces).toHaveLength(2);
  });
});

describe('generateModuleStructure', () => {
  it('should generate module structure with data models', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "payment-system"

[data_models.Account]
description = "A user account"
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "number", constraints = ["non_negative"] }
]
invariants = ["balance must be non-negative"]

[data_models.Transaction]
fields = [{ name = "id", type = "string" }]
    `;

    const result = await generateModuleStructure(specContent);

    expect(result.hasPlaceholders).toBe(false);
    expect(result.boundaries).toHaveLength(2);
    expect(result.modules).toHaveLength(2);

    // Check account domain module
    const accountModule = result.modules.find((m) => m.domain.name === 'account');
    expect(accountModule).toBeDefined();
    expect(accountModule?.files.length).toBeGreaterThan(0);

    // Check for types file
    const typesFile = accountModule?.files.find(
      (f) => f.relativePath.includes('types.ts') && !f.isBarrel
    );
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain('export interface Account');
    expect(typesFile?.content).toContain('readonly id: string');
    expect(typesFile?.content).toContain('readonly balance: number');
    expect(typesFile?.content).toContain('non_negative');

    // Check for barrel file
    const barrelFile = accountModule?.files.find((f) => f.isBarrel);
    expect(barrelFile).toBeDefined();
    expect(barrelFile?.content).toContain("export * from './types.js'");
  });

  it('should generate module structure with interfaces', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "payment-system"

[interfaces.AccountService]
description = "Service for managing accounts"
methods = [
  { name = "getAccount", params = ["id: string"], returns = "Account", description = "Gets an account by ID" },
  { name = "createAccount", params = ["name: string", "email: string"], returns = "Account", contracts = ["REQUIRES name.length > 0", "ENSURES result.id is set"] }
]
    `;

    const result = await generateModuleStructure(specContent);

    expect(result.hasPlaceholders).toBe(false);

    // Check account domain module
    const accountModule = result.modules.find((m) => m.domain.name === 'account');
    expect(accountModule).toBeDefined();

    // Check for interfaces file
    const interfacesFile = accountModule?.files.find(
      (f) => f.relativePath.includes('interfaces.ts') && !f.isBarrel
    );
    expect(interfacesFile).toBeDefined();
    expect(interfacesFile?.content).toContain('export interface AccountService');
    expect(interfacesFile?.content).toContain('getAccount(id: string): Account');
    expect(interfacesFile?.content).toContain(
      'createAccount(name: string, email: string): Account'
    );
    expect(interfacesFile?.content).toContain('REQUIRES name.length > 0');
    expect(interfacesFile?.content).toContain('ENSURES result.id is set');
  });

  it('should generate placeholder module for empty spec', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "empty-system"
description = "A system with no models or interfaces"
    `;

    const result = await generateModuleStructure(specContent);

    expect(result.hasPlaceholders).toBe(true);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]?.domain.name).toBe('empty-system');

    // Check for placeholder file
    const placeholderFile = result.files.find(
      (f) => f.relativePath.includes('placeholder.ts') && !f.isBarrel
    );
    expect(placeholderFile).toBeDefined();
    expect(placeholderFile?.content).toContain('export interface Placeholder');
    expect(placeholderFile?.content).toContain('export function createPlaceholder');

    // Check for barrel file
    const barrelFile = result.files.find((f) => f.isBarrel);
    expect(barrelFile).toBeDefined();
    expect(barrelFile?.content).toContain("export * from './placeholder.js'");
  });

  it('should respect custom options', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "custom-system"

[data_models.User]
fields = [{ name = "id", type = "string" }]
    `;

    const result = await generateModuleStructure(specContent, {
      baseDir: 'lib',
      domainDir: 'modules',
    });

    expect(result.baseDir).toBe('lib');
    expect(result.domainDir).toBe('modules');

    // Check file paths use custom directories
    const hasCorrectPath = result.files.every((f) => f.relativePath.startsWith('lib/modules/'));
    expect(hasCorrectPath).toBe(true);
  });

  it('should generate root barrel file', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [{ name = "id", type = "string" }]

[data_models.Transaction]
fields = [{ name = "id", type = "string" }]
    `;

    const result = await generateModuleStructure(specContent);

    // Find root barrel file
    const rootBarrel = result.files.find(
      (f) => f.isBarrel && f.relativePath === 'src/domain/index.ts'
    );
    expect(rootBarrel).toBeDefined();
    expect(rootBarrel?.content).toContain("export * from './account/index.js'");
    expect(rootBarrel?.content).toContain("export * from './transaction/index.js'");
  });

  it('should throw error for invalid spec', async () => {
    const invalidSpec = 'this is not valid toml {{{';

    await expect(generateModuleStructure(invalidSpec)).rejects.toThrow(ModuleGeneratorError);
    await expect(generateModuleStructure(invalidSpec)).rejects.toMatchObject({
      code: 'SPEC_PARSE_ERROR',
    });
  });

  it('should handle spec with both data models and interfaces in same domain', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "test-system"

[data_models.User]
description = "A user entity"
fields = [{ name = "id", type = "string" }]

[interfaces.UserService]
description = "User service operations"
methods = [{ name = "get", returns = "User" }]
    `;

    const result = await generateModuleStructure(specContent);

    expect(result.modules).toHaveLength(1);

    const userModule = result.modules[0];
    expect(userModule?.domain.name).toBe('user');
    expect(userModule?.domain.dataModels).toContain('User');
    expect(userModule?.domain.interfaces).toContain('UserService');

    // Should have both types.ts and interfaces.ts
    const typesFile = userModule?.files.find(
      (f) => f.relativePath.includes('types.ts') && !f.isBarrel
    );
    const interfacesFile = userModule?.files.find(
      (f) => f.relativePath.includes('interfaces.ts') && !f.isBarrel
    );
    const barrelFile = userModule?.files.find((f) => f.isBarrel);

    expect(typesFile).toBeDefined();
    expect(interfacesFile).toBeDefined();
    expect(barrelFile).toBeDefined();
    expect(barrelFile?.content).toContain("export * from './types.js'");
    expect(barrelFile?.content).toContain("export * from './interfaces.js'");
  });
});

describe('writeModuleStructure', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lattice-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write generated files to disk', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "write-test"

[data_models.Account]
fields = [{ name = "id", type = "string" }]
    `;

    const result = await generateModuleStructure(specContent);
    await writeModuleStructure(result, tempDir);

    // Verify files were written
    const typesPath = path.join(tempDir, 'src', 'domain', 'account', 'types.ts');
    const barrelPath = path.join(tempDir, 'src', 'domain', 'account', 'index.ts');
    const rootBarrelPath = path.join(tempDir, 'src', 'domain', 'index.ts');

    const typesExists = await safeStat(typesPath)
      .then(() => true)
      .catch(() => false);
    const barrelExists = await safeStat(barrelPath)
      .then(() => true)
      .catch(() => false);
    const rootBarrelExists = await safeStat(rootBarrelPath)
      .then(() => true)
      .catch(() => false);

    expect(typesExists).toBe(true);
    expect(barrelExists).toBe(true);
    expect(rootBarrelExists).toBe(true);

    // Verify content
    const typesContent = await safeReadFile(typesPath, 'utf-8');
    expect(typesContent).toContain('export interface Account');
  });
});

describe('generateAndWriteModuleStructure', () => {
  let tempDir: string;
  let specPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lattice-full-test-'));
    specPath = path.join(tempDir, 'spec.toml');

    // Write a test spec file
    await safeWriteFile(
      specPath,
      `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "full-test"

[data_models.Account]
description = "Account model"
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "number" }
]

[interfaces.AccountService]
description = "Account operations"
methods = [
  { name = "get", params = ["id: string"], returns = "Account" }
]
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should generate and write module structure from spec file', async () => {
    const result = await generateAndWriteModuleStructure(specPath, tempDir);

    expect(result.hasPlaceholders).toBe(false);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]?.domain.name).toBe('account');

    // Verify files were written
    const typesPath = path.join(tempDir, 'src', 'domain', 'account', 'types.ts');
    const interfacesPath = path.join(tempDir, 'src', 'domain', 'account', 'interfaces.ts');
    const barrelPath = path.join(tempDir, 'src', 'domain', 'account', 'index.ts');

    const typesContent = await safeReadFile(typesPath, 'utf-8');
    const interfacesContent = await safeReadFile(interfacesPath, 'utf-8');
    const barrelContent = await safeReadFile(barrelPath, 'utf-8');

    expect(typesContent).toContain('export interface Account');
    expect(interfacesContent).toContain('export interface AccountService');
    expect(barrelContent).toContain("export * from './types.js'");
    expect(barrelContent).toContain("export * from './interfaces.js'");
  });

  it('should throw error for non-existent spec file', async () => {
    const nonExistentPath = path.join(tempDir, 'non-existent.toml');

    await expect(generateAndWriteModuleStructure(nonExistentPath, tempDir)).rejects.toThrow(
      ModuleGeneratorError
    );
    await expect(generateAndWriteModuleStructure(nonExistentPath, tempDir)).rejects.toMatchObject({
      code: 'SPEC_PARSE_ERROR',
    });
  });
});

describe('detectProjectConventions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conventions-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should detect src directory', async () => {
    await safeMkdir(path.join(tempDir, 'src'));

    const conventions = await detectProjectConventions(tempDir);

    expect(conventions.sourceDir).toBe('src');
  });

  it('should detect lib directory as alternative', async () => {
    await safeMkdir(path.join(tempDir, 'lib'));

    const conventions = await detectProjectConventions(tempDir);

    expect(conventions.sourceDir).toBe('lib');
  });

  it('should detect domain directory patterns', async () => {
    await safeMkdir(path.join(tempDir, 'src', 'domain'), { recursive: true });

    const conventions = await detectProjectConventions(tempDir);

    expect(conventions.domainDir).toBe('domain');
  });

  it('should detect modules directory pattern', async () => {
    await safeMkdir(path.join(tempDir, 'src', 'modules'), { recursive: true });

    const conventions = await detectProjectConventions(tempDir);

    expect(conventions.domainDir).toBe('modules');
  });

  it('should return defaults for empty directory', async () => {
    const conventions = await detectProjectConventions(tempDir);

    expect(conventions.sourceDir).toBe('src');
    expect(conventions.usesBarrelFiles).toBe(true);
    expect(conventions.usesJsExtension).toBe(true);
  });
});

describe('Property-based tests for inferDomainBoundaries', () => {
  /**
   * Helper to create a valid Spec with given model and interface names.
   */
  function createSpecWithNames(modelNames: string[], interfaceNames: string[]): Spec {
    const spec: Spec = {
      meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
      system: { name: 'test-system' },
    };

    if (modelNames.length > 0) {
      spec.data_models = {};
      for (const name of modelNames) {
        // eslint-disable-next-line security/detect-object-injection -- safe: name comes from controlled test data array
        spec.data_models[name] = {
          fields: [{ name: 'id', type: 'string' }],
        };
      }
    }

    if (interfaceNames.length > 0) {
      spec.interfaces = {};
      for (const name of interfaceNames) {
        // eslint-disable-next-line security/detect-object-injection -- safe: name comes from controlled test data array
        spec.interfaces[name] = {
          methods: [{ name: 'get', returns: 'void' }],
        };
      }
    }

    return spec;
  }

  /**
   * Arbitrary for valid PascalCase identifiers (model/interface names).
   * Uses stringMatching to generate valid identifier-like strings.
   */
  const pascalCaseIdentifier = fc
    .stringMatching(/^[A-Z][a-zA-Z]{0,19}$/)
    .filter((s) => s.length >= 1);

  /**
   * Arbitrary for arrays of unique PascalCase identifiers.
   */
  const uniqueIdentifiers = fc
    .array(pascalCaseIdentifier, { minLength: 0, maxLength: 10 })
    .map((arr) => [...new Set(arr)]);

  it('should always return sorted boundary names', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, uniqueIdentifiers, (modelNames, interfaceNames) => {
        const spec = createSpecWithNames(modelNames, interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // Boundaries should be sorted by name
        const names = boundaries.map((b) => b.name);
        const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
        expect(names).toEqual(sortedNames);
      })
    );
  });

  it('should group models with same domain prefix together', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('User', 'Account', 'Payment', 'Order'),
        fc.array(fc.constantFrom('Profile', 'Settings', 'History', 'Details'), {
          minLength: 1,
          maxLength: 4,
        }),
        (prefix, suffixes) => {
          // Deduplicate suffixes to ensure unique model names
          const uniqueSuffixes = [...new Set(suffixes)];
          const modelNames = uniqueSuffixes.map((suffix) => `${prefix}${suffix}`);
          const spec = createSpecWithNames(modelNames, []);
          const boundaries = inferDomainBoundaries(spec);

          // All models with the same prefix should be in the same domain
          const expectedDomainName = prefix.toLowerCase();
          const domain = boundaries.find((b) => b.name === expectedDomainName);
          expect(domain).toBeDefined();
          expect(domain?.dataModels).toHaveLength(modelNames.length);
          for (const modelName of modelNames) {
            expect(domain?.dataModels).toContain(modelName);
          }
        }
      )
    );
  });

  it('should group interfaces with same domain prefix together', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('User', 'Account', 'Payment', 'Order'),
        fc.array(fc.constantFrom('Service', 'Repository', 'Handler', 'Controller'), {
          minLength: 1,
          maxLength: 4,
        }),
        (prefix, suffixes) => {
          // Remove duplicates from suffixes
          const uniqueSuffixes = [...new Set(suffixes)];
          const interfaceNames = uniqueSuffixes.map((suffix) => `${prefix}${suffix}`);
          const spec = createSpecWithNames([], interfaceNames);
          const boundaries = inferDomainBoundaries(spec);

          // All interfaces with the same prefix should be in the same domain
          const expectedDomainName = prefix.toLowerCase();
          const domain = boundaries.find((b) => b.name === expectedDomainName);
          expect(domain).toBeDefined();
          expect(domain?.interfaces).toHaveLength(interfaceNames.length);
          for (const interfaceName of interfaceNames) {
            expect(domain?.interfaces).toContain(interfaceName);
          }
        }
      )
    );
  });

  it('should produce non-empty domain names for any valid input', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, uniqueIdentifiers, (modelNames, interfaceNames) => {
        const spec = createSpecWithNames(modelNames, interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // All domain names should be non-empty strings
        for (const boundary of boundaries) {
          expect(boundary.name).toBeTruthy();
          expect(typeof boundary.name).toBe('string');
          expect(boundary.name.length).toBeGreaterThan(0);
        }
      })
    );
  });

  it('should produce lowercase domain names without special characters', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, uniqueIdentifiers, (modelNames, interfaceNames) => {
        const spec = createSpecWithNames(modelNames, interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // All domain names should be lowercase and contain only alphanumeric chars and hyphens
        // Use a pattern that doesn't have nested quantifiers
        const validNamePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
        for (const boundary of boundaries) {
          // Skip the default system name which may not follow this pattern
          if (boundary.name === 'test-system') {
            continue;
          }
          expect(boundary.name).toMatch(validNamePattern);
        }
      })
    );
  });

  it('should return at least one domain for any spec', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, uniqueIdentifiers, (modelNames, interfaceNames) => {
        const spec = createSpecWithNames(modelNames, interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // Should always have at least one domain (either from content or default)
        expect(boundaries.length).toBeGreaterThanOrEqual(1);
      })
    );
  });

  it('should include all model names in exactly one domain', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, (modelNames) => {
        if (modelNames.length === 0) {
          return;
        }

        const spec = createSpecWithNames(modelNames, []);
        const boundaries = inferDomainBoundaries(spec);

        // Each model should appear in exactly one domain
        const allModelsInBoundaries = boundaries.flatMap((b) => b.dataModels);
        for (const modelName of modelNames) {
          const occurrences = allModelsInBoundaries.filter((m) => m === modelName).length;
          expect(occurrences).toBe(1);
        }
      })
    );
  });

  it('should include all interface names in exactly one domain', () => {
    fc.assert(
      fc.property(uniqueIdentifiers, (interfaceNames) => {
        if (interfaceNames.length === 0) {
          return;
        }

        const spec = createSpecWithNames([], interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // Each interface should appear in exactly one domain
        const allInterfacesInBoundaries = boundaries.flatMap((b) => b.interfaces);
        for (const interfaceName of interfaceNames) {
          const occurrences = allInterfacesInBoundaries.filter((i) => i === interfaceName).length;
          expect(occurrences).toBe(1);
        }
      })
    );
  });

  it('should handle mixed models and interfaces with same prefix', () => {
    fc.assert(
      fc.property(fc.constantFrom('User', 'Account', 'Payment'), (prefix) => {
        const modelNames = [`${prefix}Entity`, `${prefix}Details`];
        const interfaceNames = [`${prefix}Service`, `${prefix}Repository`];
        const spec = createSpecWithNames(modelNames, interfaceNames);
        const boundaries = inferDomainBoundaries(spec);

        // Models and interfaces with same prefix should be in the same domain
        const expectedDomainName = prefix.toLowerCase();
        const domain = boundaries.find((b) => b.name === expectedDomainName);
        expect(domain).toBeDefined();
        expect(domain?.dataModels).toHaveLength(2);
        expect(domain?.interfaces).toHaveLength(2);
      })
    );
  });
});

describe('Property-based tests for extractDomainName via inferDomainBoundaries', () => {
  /**
   * Helper to extract domain name by creating a spec with a single model.
   */
  function getDomainNameForModel(modelName: string): string {
    const spec: Spec = {
      meta: { version: '1.0.0', created: '2024-01-24T12:00:00Z' },
      system: { name: 'test-system' },
      data_models: {
        [modelName]: {
          fields: [{ name: 'id', type: 'string' }],
        },
      },
    };
    const boundaries = inferDomainBoundaries(spec);
    // There should be exactly one domain for a single model
    return boundaries[0]?.name ?? '';
  }

  it('should strip common suffixes from names', () => {
    const suffixes = [
      'Service',
      'Repository',
      'Handler',
      'Controller',
      'Manager',
      'Factory',
      'Builder',
      'Model',
      'Entity',
      'DTO',
      'Request',
      'Response',
      'Event',
      'Command',
      'Query',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...suffixes),
        fc.constantFrom('User', 'Account', 'Payment', 'Order'),
        (suffix, prefix) => {
          const modelName = `${prefix}${suffix}`;
          const domainName = getDomainNameForModel(modelName);

          // Domain name should be the prefix in lowercase
          expect(domainName).toBe(prefix.toLowerCase());
        }
      )
    );
  });

  it('should extract first word from CamelCase names', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('User', 'Account', 'Payment', 'Order', 'Customer'),
        fc.constantFrom('Profile', 'Balance', 'Transaction', 'Details', 'Record'),
        (firstWord, secondWord) => {
          const modelName = `${firstWord}${secondWord}`;
          const domainName = getDomainNameForModel(modelName);

          // Domain name should be the first word in lowercase
          expect(domainName).toBe(firstWord.toLowerCase());
        }
      )
    );
  });

  it('should handle single word names', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('User', 'Account', 'Payment', 'Order', 'Item', 'Product'),
        (word) => {
          const domainName = getDomainNameForModel(word);

          // Domain name should be the word in lowercase
          expect(domainName).toBe(word.toLowerCase());
        }
      )
    );
  });

  it('should produce consistent results for the same input', () => {
    const pascalCaseIdentifier = fc
      .stringMatching(/^[A-Z][a-zA-Z]{0,19}$/)
      .filter((s) => s.length >= 1);

    fc.assert(
      fc.property(pascalCaseIdentifier, (modelName) => {
        const result1 = getDomainNameForModel(modelName);
        const result2 = getDomainNameForModel(modelName);

        // Same input should produce same output
        expect(result1).toBe(result2);
      })
    );
  });

  it('should never produce empty domain names', () => {
    const pascalCaseIdentifier = fc
      .stringMatching(/^[A-Z][a-zA-Z]{0,19}$/)
      .filter((s) => s.length >= 1);

    fc.assert(
      fc.property(pascalCaseIdentifier, (modelName) => {
        const domainName = getDomainNameForModel(modelName);

        expect(domainName).toBeTruthy();
        expect(domainName.length).toBeGreaterThan(0);
      })
    );
  });
});

describe('Example: account and transaction domains', () => {
  it('should generate src/domain/account/ and src/domain/transaction/', async () => {
    const specContent = `
[meta]
version = "1.0.0"
created = "2024-01-24T12:00:00Z"

[system]
name = "banking-system"

[data_models.Account]
description = "A bank account"
fields = [
  { name = "id", type = "string" },
  { name = "balance", type = "Decimal", constraints = ["non_negative"] }
]
invariants = ["balance >= 0"]

[data_models.AccountHolder]
description = "Account holder information"
fields = [
  { name = "accountId", type = "string" },
  { name = "name", type = "string" }
]

[data_models.Transaction]
description = "A financial transaction"
fields = [
  { name = "id", type = "string" },
  { name = "fromAccount", type = "string" },
  { name = "toAccount", type = "string" },
  { name = "amount", type = "Decimal" }
]

[data_models.TransactionLog]
description = "Audit log for transactions"
fields = [
  { name = "transactionId", type = "string" },
  { name = "timestamp", type = "Date" }
]

[interfaces.AccountService]
description = "Account management operations"
methods = [
  { name = "getAccount", params = ["id: string"], returns = "Account" },
  { name = "createAccount", params = ["holder: AccountHolder"], returns = "Account" }
]

[interfaces.TransactionService]
description = "Transaction processing"
methods = [
  { name = "transfer", params = ["from: string", "to: string", "amount: Decimal"], returns = "Transaction", contracts = ["REQUIRES amount > 0", "ENSURES fromAccount.balance decreases by amount"] }
]
    `;

    const result = await generateModuleStructure(specContent);

    // Verify domain structure
    expect(result.boundaries).toHaveLength(2);
    expect(result.modules).toHaveLength(2);

    // Check account domain
    const accountModule = result.modules.find((m) => m.domain.name === 'account');
    expect(accountModule).toBeDefined();
    expect(accountModule?.path).toBe('src/domain/account');
    expect(accountModule?.domain.dataModels).toEqual(['Account', 'AccountHolder']);
    expect(accountModule?.domain.interfaces).toEqual(['AccountService']);

    // Check transaction domain
    const transactionModule = result.modules.find((m) => m.domain.name === 'transaction');
    expect(transactionModule).toBeDefined();
    expect(transactionModule?.path).toBe('src/domain/transaction');
    expect(transactionModule?.domain.dataModels).toEqual(['Transaction', 'TransactionLog']);
    expect(transactionModule?.domain.interfaces).toEqual(['TransactionService']);

    // Verify file structure for account domain
    const accountFiles = accountModule?.files.map((f) => f.relativePath) ?? [];
    expect(accountFiles).toContain('src/domain/account/types.ts');
    expect(accountFiles).toContain('src/domain/account/interfaces.ts');
    expect(accountFiles).toContain('src/domain/account/index.ts');

    // Verify file structure for transaction domain
    const transactionFiles = transactionModule?.files.map((f) => f.relativePath) ?? [];
    expect(transactionFiles).toContain('src/domain/transaction/types.ts');
    expect(transactionFiles).toContain('src/domain/transaction/interfaces.ts');
    expect(transactionFiles).toContain('src/domain/transaction/index.ts');

    // Verify root barrel file exists
    const rootBarrel = result.files.find((f) => f.relativePath === 'src/domain/index.ts');
    expect(rootBarrel).toBeDefined();
    expect(rootBarrel?.content).toContain("export * from './account/index.js'");
    expect(rootBarrel?.content).toContain("export * from './transaction/index.js'");
  });
});
