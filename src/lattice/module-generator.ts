/**
 * Module structure generator for the Lattice phase.
 *
 * Transforms spec.toml into a module hierarchy with proper domain boundaries
 * and barrel files for clean exports.
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import type { Spec, SpecDataModel, SpecInterface } from '../spec/types.js';
import { parseSpec } from '../spec/parser.js';
import { safeReadFile, safeReaddir, safeWriteFile, safeMkdir, safeStat } from '../utils/safe-fs.js';
import type {
  DomainBoundary,
  DomainModule,
  GeneratedFile,
  ModuleGeneratorOptions,
  ModuleStructureResult,
  ProjectConventions,
} from './types.js';
import { ModuleGeneratorError } from './types.js';
import {
  mapSpecTypeToTypeScript,
  parseSpecParameter,
  parseSpecReturnType,
} from './function-generator.js';

/**
 * Default options for module generation.
 */
const DEFAULT_OPTIONS: Required<ModuleGeneratorOptions> = {
  baseDir: 'src',
  domainDir: 'domain',
  detectConventions: true,
  generatePlaceholders: true,
};

/**
 * Detects project conventions from an existing codebase.
 *
 * @param projectRoot - The root directory of the project.
 * @returns Detected project conventions.
 */
export async function detectProjectConventions(projectRoot: string): Promise<ProjectConventions> {
  const conventions: ProjectConventions = {
    sourceDir: 'src',
    usesBarrelFiles: true,
    usesJsExtension: true,
  };

  try {
    // Check if src directory exists
    const srcPath = path.join(projectRoot, 'src');
    let srcExists = false;
    try {
      const srcStat = await safeStat(srcPath);
      srcExists = srcStat.isDirectory();
    } catch {
      srcExists = false;
    }

    if (!srcExists) {
      // Check for lib directory as alternative
      const libPath = path.join(projectRoot, 'lib');
      let libExists = false;
      try {
        const libStat = await safeStat(libPath);
        libExists = libStat.isDirectory();
      } catch {
        libExists = false;
      }

      if (libExists) {
        return { ...conventions, sourceDir: 'lib' };
      }

      // No source directory found, return defaults
      return conventions;
    }

    // Check for domain directory patterns
    const domainPatterns = ['domain', 'domains', 'modules', 'features'];
    for (const pattern of domainPatterns) {
      const domainPath = path.join(srcPath, pattern);
      let domainExists = false;
      try {
        const domainStat = await safeStat(domainPath);
        domainExists = domainStat.isDirectory();
      } catch {
        domainExists = false;
      }

      if (domainExists) {
        return { ...conventions, domainDir: pattern };
      }
    }

    // Check for barrel file convention by looking for index.ts files
    const files = (await safeReaddir(srcPath).catch(() => [])) as string[];
    const hasBarrelFiles = files.some((f) => f === 'index.ts' || f === 'index.js');

    // Check for .js extension in imports by reading a sample TypeScript file
    let usesJsExtension = true;
    for (const file of files) {
      if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        const content = (await safeReadFile(path.join(srcPath, file), 'utf-8').catch(
          () => ''
        )) as string;
        if (content.includes("from './") || content.includes('from "./')) {
          // Check if imports use .js extension
          usesJsExtension = content.includes(".js'") || content.includes('.js"');
          break;
        }
      }
    }

    return {
      ...conventions,
      usesBarrelFiles: hasBarrelFiles,
      usesJsExtension,
    };
  } catch {
    return conventions;
  }
}

/**
 * Infers domain boundaries from spec data models and interfaces.
 *
 * Domain boundaries are inferred by:
 * 1. Extracting features with their classifications
 * 2. Grouping data models and interfaces by name prefix patterns
 * 3. Creating a domain for each distinct logical grouping
 *
 * @param spec - The parsed specification.
 * @returns Array of detected domain boundaries.
 */
export function inferDomainBoundaries(spec: Spec): DomainBoundary[] {
  const domains = new Map<string, DomainBoundary>();

  // Extract domains from features first (highest priority)
  if (spec.features !== undefined) {
    for (const feature of Object.values(spec.features)) {
      const domainName = extractDomainName(feature.name);
      const existing = domains.get(domainName);

      if (existing !== undefined) {
        // Update existing domain with feature info - use existing description if available
        const description = existing.description ?? feature.description;
        domains.set(domainName, {
          ...existing,
          classification: feature.classification,
          description,
        });
      } else {
        // Create new domain with feature info
        domains.set(domainName, {
          name: domainName,
          description: feature.description,
          dataModels: [],
          interfaces: [],
          classification: feature.classification,
        });
      }
    }
  }

  // Extract domains from data models
  if (spec.data_models !== undefined) {
    for (const modelName of Object.keys(spec.data_models)) {
      const domainName = extractDomainName(modelName);
      const existing = domains.get(domainName);

      if (existing !== undefined) {
        domains.set(domainName, {
          ...existing,
          dataModels: [...existing.dataModels, modelName],
        });
      } else {
        domains.set(domainName, {
          name: domainName,
          dataModels: [modelName],
          interfaces: [],
        });
      }
    }
  }

  // Extract domains from interfaces
  if (spec.interfaces !== undefined) {
    for (const interfaceName of Object.keys(spec.interfaces)) {
      const domainName = extractDomainName(interfaceName);
      const existing = domains.get(domainName);

      if (existing !== undefined) {
        domains.set(domainName, {
          ...existing,
          interfaces: [...existing.interfaces, interfaceName],
        });
      } else {
        domains.set(domainName, {
          name: domainName,
          dataModels: [],
          interfaces: [interfaceName],
        });
      }
    }
  }

  // If no domains were found, create a default domain from system name
  if (domains.size === 0) {
    const systemDomain = spec.system.name;
    const baseDomain = {
      name: systemDomain,
      dataModels: [] as readonly string[],
      interfaces: [] as readonly string[],
    };
    if (spec.system.description !== undefined) {
      domains.set(systemDomain, { ...baseDomain, description: spec.system.description });
    } else {
      domains.set(systemDomain, baseDomain);
    }
  }

  return Array.from(domains.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extracts a domain name from a model or interface name.
 *
 * Uses common naming conventions:
 * - CamelCase: AccountService -> account
 * - PascalCase with prefixes: UserAccount -> user
 * - Compound words: PaymentTransaction -> payment
 *
 * @param name - The model or interface name.
 * @returns The inferred domain name in kebab-case.
 */
function extractDomainName(name: string): string {
  // Remove common suffixes
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

  let baseName = name;
  for (const suffix of suffixes) {
    if (baseName.endsWith(suffix) && baseName.length > suffix.length) {
      baseName = baseName.slice(0, -suffix.length);
      break;
    }
  }

  // Check if the name contains word separators (spaces, hyphens, underscores)
  // In that case, take the first word
  if (/[\s\-_]/.test(baseName)) {
    const firstWord = baseName.split(/[\s\-_]+/)[0] ?? baseName;
    return firstWord
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Split on camelCase boundaries and take the first word
  const words = baseName.split(/(?=[A-Z])/).filter((w) => w.length > 0);

  // Use first word as domain, or full name if single word
  const domainWord = words.length > 1 ? (words[0] ?? baseName) : baseName;

  // Convert to kebab-case and remove leading/trailing hyphens
  return domainWord
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a placeholder module for an empty spec.
 *
 * @param spec - The spec with empty interfaces.
 * @param options - Generation options.
 * @returns Generated files for the placeholder module.
 */
function generatePlaceholderModule(
  spec: Spec,
  options: Required<ModuleGeneratorOptions>
): GeneratedFile[] {
  const systemName = spec.system.name;
  const domainPath = path.join(options.baseDir, options.domainDir, systemName);

  const placeholderContent = `/**
 * Placeholder module for ${systemName}.
 *
 * This module was generated from an empty specification.
 * Add data models and interfaces to spec.toml to generate actual types.
 *
 * @packageDocumentation
 */

/**
 * Placeholder type for ${systemName} domain.
 *
 * Replace this with actual domain types from spec.toml.
 */
export interface Placeholder {
  /** Placeholder identifier. */
  readonly id: string;
}

/**
 * Creates a placeholder instance.
 *
 * @param id - The placeholder identifier.
 * @returns A new Placeholder instance.
 */
export function createPlaceholder(id: string): Placeholder {
  return { id };
}
`;

  const barrelContent = `/**
 * ${systemName} domain module.
 *
 * @packageDocumentation
 */

export * from './placeholder.js';
`;

  return [
    {
      relativePath: path.join(domainPath, 'placeholder.ts'),
      content: placeholderContent,
      isBarrel: false,
      description: `Placeholder module for ${systemName} domain`,
    },
    {
      relativePath: path.join(domainPath, 'index.ts'),
      content: barrelContent,
      isBarrel: true,
      description: `Barrel file for ${systemName} domain`,
    },
  ];
}

/**
 * Generates a barrel file for a domain module.
 *
 * @param domain - The domain boundary.
 * @param files - Files in the domain module.
 * @param usesJsExtension - Whether to use .js extension in imports.
 * @returns The generated barrel file content.
 */
function generateBarrelFile(
  domain: DomainBoundary,
  files: readonly GeneratedFile[],
  usesJsExtension: boolean
): string {
  const extension = usesJsExtension ? '.js' : '';
  const exports: string[] = [];

  // Export from each non-barrel file
  for (const file of files) {
    if (!file.isBarrel) {
      const basename = path.basename(file.relativePath, '.ts');
      exports.push(`export * from './${basename}${extension}';`);
    }
  }

  if (exports.length === 0) {
    // Empty barrel
    return `/**
 * ${domain.name} domain module.
 *
 * @packageDocumentation
 */

// No exports yet - add types and interfaces to spec.toml
`;
  }

  return `/**
 * ${domain.name} domain module.
 *${domain.description !== undefined ? `\n * ${domain.description}\n *` : ''}
 * @packageDocumentation
 */

${exports.join('\n')}
`;
}

/**
 * Generates a types file for domain data models.
 *
 * @param domain - The domain boundary.
 * @param dataModels - Data models for this domain.
 * @returns The generated types file content.
 */
function generateTypesFile(
  domain: DomainBoundary,
  dataModels: Record<string, SpecDataModel>
): string {
  const lines: string[] = [
    `/**`,
    ` * Types for the ${domain.name} domain.`,
    ` *`,
    ` * @packageDocumentation`,
    ` */`,
    ``,
  ];

  for (const [modelName, model] of Object.entries(dataModels)) {
    // Add JSDoc for the type
    lines.push(`/**`);
    if (model.description !== undefined) {
      lines.push(` * ${model.description}`);
    } else {
      lines.push(` * ${modelName} data model.`);
    }

    // Document invariants if present
    if (model.invariants !== undefined && model.invariants.length > 0) {
      lines.push(` *`);
      lines.push(` * Invariants:`);
      for (const invariant of model.invariants) {
        lines.push(` * - ${invariant}`);
      }
    }
    lines.push(` */`);

    // Generate interface
    lines.push(`export interface ${modelName} {`);

    for (const field of model.fields) {
      // Add field JSDoc if there are constraints or description
      if (
        (field.constraints !== undefined && field.constraints.length > 0) ||
        field.description !== undefined
      ) {
        lines.push(`  /**`);
        if (field.description !== undefined) {
          lines.push(`   * ${field.description}`);
        }
        if (field.constraints !== undefined && field.constraints.length > 0) {
          if (field.description !== undefined) {
            lines.push(`   *`);
          }
          lines.push(`   * @constraints`);
          for (const constraint of field.constraints) {
            lines.push(`   * - ${constraint}`);
          }
        }
        lines.push(`   */`);
      }
      lines.push(`  readonly ${field.name}: ${mapSpecTypeToTypeScript(field.type)};`);
    }

    lines.push(`}`);
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Generates an interfaces file for domain service interfaces.
 *
 * @param domain - The domain boundary.
 * @param interfaces - Interfaces for this domain.
 * @returns The generated interfaces file content.
 */
function generateInterfacesFile(
  domain: DomainBoundary,
  interfaces: Record<string, SpecInterface>
): string {
  const lines: string[] = [
    `/**`,
    ` * Service interfaces for the ${domain.name} domain.`,
    ` *`,
    ` * @packageDocumentation`,
    ` */`,
    ``,
  ];

  for (const [interfaceName, iface] of Object.entries(interfaces)) {
    // Add JSDoc for the interface
    lines.push(`/**`);
    if (iface.description !== undefined) {
      lines.push(` * ${iface.description}`);
    } else {
      lines.push(` * ${interfaceName} service interface.`);
    }
    lines.push(` */`);

    // Generate interface
    lines.push(`export interface ${interfaceName} {`);

    for (const method of iface.methods) {
      // Parse parameters
      const parsedParams = method.params?.map((p) => parseSpecParameter(p)) ?? [];

      // Parse return type
      const parsedReturnType = parseSpecReturnType(method.returns);

      // Generate method signature with JSDoc
      lines.push(`  /**`);
      if (method.description !== undefined) {
        lines.push(`   * ${method.description}`);
        lines.push(`   *`);
      }

      // Document parameters
      for (const param of parsedParams) {
        lines.push(`   * @param ${param.name} - TODO: Add description`);
      }

      // Document return type
      lines.push(`   * @returns TODO: Add description`);

      // Document contracts if present
      if (method.contracts !== undefined && method.contracts.length > 0) {
        lines.push(`   *`);
        for (const contract of method.contracts) {
          // Determine contract type from content
          const lowerContract = contract.toLowerCase();
          if (lowerContract.startsWith('requires')) {
            lines.push(`   * @requires ${contract}`);
          } else if (lowerContract.startsWith('ensures')) {
            lines.push(`   * @ensures ${contract}`);
          } else if (lowerContract.startsWith('invariant')) {
            lines.push(`   * @invariant ${contract}`);
          } else if (lowerContract.startsWith('complexity')) {
            lines.push(`   * @complexity ${contract}`);
          } else if (lowerContract.startsWith('purity')) {
            lines.push(`   * @purity ${contract}`);
          } else {
            lines.push(`   * @contract ${contract}`);
          }
        }
      }
      lines.push(`   */`);

      // Generate method signature
      const params = parsedParams
        .map((p) => `${p.name}${p.isOptional ? '?' : ''}: ${p.type}`)
        .join(', ');
      lines.push(`  ${method.name}(${params}): ${parsedReturnType.type};`);
      lines.push(``);
    }

    lines.push(`}`);
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Generates the module structure for a domain.
 *
 * @param domain - The domain boundary.
 * @param spec - The full specification.
 * @param options - Generation options.
 * @param conventions - Detected project conventions.
 * @returns The generated domain module.
 */
function generateDomainModule(
  domain: DomainBoundary,
  spec: Spec,
  options: Required<ModuleGeneratorOptions>,
  conventions: ProjectConventions
): DomainModule {
  const domainPath = path.join(options.baseDir, options.domainDir, domain.name);
  const files: GeneratedFile[] = [];

  // Filter data models for this domain
  const domainDataModels: Record<string, SpecDataModel> = {};
  if (spec.data_models !== undefined) {
    for (const modelName of domain.dataModels) {
      const model = spec.data_models[modelName];
      if (model !== undefined) {
        domainDataModels[modelName] = model;
      }
    }
  }

  // Generate types file if there are data models
  if (Object.keys(domainDataModels).length > 0) {
    files.push({
      relativePath: path.join(domainPath, 'types.ts'),
      content: generateTypesFile(domain, domainDataModels),
      isBarrel: false,
      description: `Type definitions for ${domain.name} domain`,
    });
  }

  // Filter interfaces for this domain
  const domainInterfaces: Record<string, SpecInterface> = {};
  if (spec.interfaces !== undefined) {
    for (const interfaceName of domain.interfaces) {
      const iface = spec.interfaces[interfaceName];
      if (iface !== undefined) {
        domainInterfaces[interfaceName] = iface;
      }
    }
  }

  // Generate interfaces file if there are interfaces
  if (Object.keys(domainInterfaces).length > 0) {
    files.push({
      relativePath: path.join(domainPath, 'interfaces.ts'),
      content: generateInterfacesFile(domain, domainInterfaces),
      isBarrel: false,
      description: `Service interfaces for ${domain.name} domain`,
    });
  }

  // Generate barrel file
  if (files.length > 0) {
    files.push({
      relativePath: path.join(domainPath, 'index.ts'),
      content: generateBarrelFile(domain, files, conventions.usesJsExtension),
      isBarrel: true,
      description: `Barrel file for ${domain.name} domain`,
    });
  }

  return {
    domain,
    path: domainPath,
    files,
  };
}

/**
 * Generates the root domain barrel file.
 *
 * @param modules - All domain modules.
 * @param options - Generation options.
 * @param usesJsExtension - Whether to use .js extension in imports.
 * @returns The generated root barrel file.
 */
function generateRootBarrelFile(
  modules: readonly DomainModule[],
  options: Required<ModuleGeneratorOptions>,
  usesJsExtension: boolean
): GeneratedFile {
  const extension = usesJsExtension ? '.js' : '';
  const domainPath = path.join(options.baseDir, options.domainDir);

  const exports = modules
    .filter((m) => m.files.length > 0)
    .map((m) => `export * from './${m.domain.name}/index${extension}';`)
    .sort();

  const content =
    exports.length > 0
      ? `/**
 * Domain modules.
 *
 * @packageDocumentation
 */

${exports.join('\n')}
`
      : `/**
 * Domain modules.
 *
 * @packageDocumentation
 */

// No domain modules yet - add data models and interfaces to spec.toml
`;

  return {
    relativePath: path.join(domainPath, 'index.ts'),
    content,
    isBarrel: true,
    description: 'Root barrel file for all domain modules',
  };
}

/**
 * Generates module structure from a specification.
 *
 * This is the main entry point for module generation. It:
 * 1. Parses the spec.toml content
 * 2. Detects domain boundaries from data models and interfaces
 * 3. Generates module hierarchy with proper file organization
 * 4. Creates barrel files for clean exports
 *
 * @param specContent - The spec.toml content as a string.
 * @param options - Generation options.
 * @param projectRoot - Optional project root for convention detection.
 * @returns The generated module structure.
 * @throws ModuleGeneratorError if spec parsing fails.
 *
 * @example
 * ```typescript
 * const specContent = await fs.readFile('spec.toml', 'utf-8');
 * const result = await generateModuleStructure(specContent, {
 *   baseDir: 'src',
 *   domainDir: 'domain'
 * });
 *
 * for (const file of result.files) {
 *   await fs.writeFile(file.relativePath, file.content);
 * }
 * ```
 */
export async function generateModuleStructure(
  specContent: string,
  options?: ModuleGeneratorOptions,
  projectRoot?: string
): Promise<ModuleStructureResult> {
  // Merge options with defaults (use mutable copy for convention detection)
  const opts: {
    -readonly [K in keyof Required<ModuleGeneratorOptions>]: Required<ModuleGeneratorOptions>[K];
  } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Parse the spec
  let spec: Spec;
  try {
    spec = parseSpec(specContent);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ModuleGeneratorError(
      `Failed to parse spec.toml: ${err.message}`,
      'SPEC_PARSE_ERROR',
      err.message
    );
  }

  // Detect project conventions if enabled
  let conventions: ProjectConventions = {
    sourceDir: opts.baseDir,
    usesBarrelFiles: true,
    usesJsExtension: true,
  };

  if (opts.detectConventions && projectRoot !== undefined) {
    try {
      conventions = await detectProjectConventions(projectRoot);
      // Update opts with detected conventions only if caller didn't provide them
      if (options?.baseDir === undefined) {
        opts.baseDir = conventions.sourceDir;
      }
      if (options?.domainDir === undefined && conventions.domainDir !== undefined) {
        opts.domainDir = conventions.domainDir;
      }
    } catch {
      // Use defaults if detection fails
    }
  }

  // Check if spec has meaningful content
  const hasDataModels = spec.data_models !== undefined && Object.keys(spec.data_models).length > 0;
  const hasInterfaces = spec.interfaces !== undefined && Object.keys(spec.interfaces).length > 0;

  // Generate placeholder if spec is empty and placeholders are enabled
  if (!hasDataModels && !hasInterfaces && opts.generatePlaceholders) {
    const placeholderFiles = generatePlaceholderModule(spec, opts);
    const baseDomain = {
      name: spec.system.name,
      dataModels: [] as readonly string[],
      interfaces: [] as readonly string[],
    };
    const placeholderDomain: DomainBoundary =
      spec.system.description !== undefined
        ? { ...baseDomain, description: spec.system.description }
        : baseDomain;

    return {
      modules: [
        {
          domain: placeholderDomain,
          path: path.join(opts.baseDir, opts.domainDir, spec.system.name),
          files: placeholderFiles,
        },
      ],
      files: placeholderFiles,
      boundaries: [placeholderDomain],
      hasPlaceholders: true,
      baseDir: opts.baseDir,
      domainDir: opts.domainDir,
    };
  }

  // Infer domain boundaries
  const boundaries = inferDomainBoundaries(spec);

  // Generate modules for each domain
  const modules = boundaries.map((domain) => generateDomainModule(domain, spec, opts, conventions));

  // Collect all files
  const allFiles: GeneratedFile[] = [];
  for (const module of modules) {
    allFiles.push(...module.files);
  }

  // Add root barrel file
  const rootBarrel = generateRootBarrelFile(modules, opts, conventions.usesJsExtension);
  allFiles.push(rootBarrel);

  return {
    modules,
    files: allFiles,
    boundaries,
    hasPlaceholders: false,
    baseDir: opts.baseDir,
    domainDir: opts.domainDir,
  };
}

/**
 * Writes generated files to disk using the TypeScriptAdapter pattern.
 *
 * @param result - The module structure result.
 * @param targetDir - The target directory (project root).
 * @throws ModuleGeneratorError if file writing fails.
 */
export async function writeModuleStructure(
  result: ModuleStructureResult,
  targetDir: string
): Promise<void> {
  for (const file of result.files) {
    const fullPath = path.join(targetDir, file.relativePath);

    // Ensure directory exists
    await safeMkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    try {
      await safeWriteFile(fullPath, file.content, 'utf-8');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new ModuleGeneratorError(
        `Failed to write file: ${fullPath}`,
        'FILE_WRITE_ERROR',
        err.message
      );
    }
  }
}

/**
 * Generates and writes module structure from a spec file.
 *
 * This is a convenience function that combines parsing, generation, and writing.
 *
 * @param specPath - Path to the spec.toml file.
 * @param targetDir - The target directory (project root).
 * @param options - Generation options.
 * @returns The generated module structure.
 * @throws ModuleGeneratorError if any step fails.
 *
 * @example
 * ```typescript
 * const result = await generateAndWriteModuleStructure(
 *   './spec.toml',
 *   './my-project',
 *   { domainDir: 'modules' }
 * );
 * console.log(`Generated ${result.files.length} files`);
 * ```
 */
export async function generateAndWriteModuleStructure(
  specPath: string,
  targetDir: string,
  options?: ModuleGeneratorOptions
): Promise<ModuleStructureResult> {
  // Read spec file
  let specContent: string;
  try {
    specContent = (await safeReadFile(specPath, 'utf-8')) as string;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ModuleGeneratorError(
      `Failed to read spec file: ${specPath}`,
      'SPEC_PARSE_ERROR',
      err.message
    );
  }

  // Generate module structure
  const result = await generateModuleStructure(specContent, options, targetDir);

  // Write files
  await writeModuleStructure(result, targetDir);

  return result;
}
