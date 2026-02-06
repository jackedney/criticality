/**
 * Cluster definition generator for Mesoscopic phase.
 *
 * Groups modules into testable clusters based on spec relationships
 * and shared claims. Generates cluster definitions for integration testing.
 *
 * @packageDocumentation
 */

import type { Spec } from '../spec/types.js';
import type {
  Module,
  ClusterDefinition,
  ClusterDefinitionResult,
  ClusterDefinitionOptions,
} from './types.js';
import { ClusterDefinitionError } from './types.js';

/**
 * Default options for cluster definition generation.
 */
const DEFAULT_OPTIONS: Required<ClusterDefinitionOptions> = {
  minClaimsPerModule: 1,
  createOrphanClusters: true,
  createCrossModuleClusters: true,
};

/**
 * Extracts module information from spec data models and interfaces.
 *
 * Each data model and interface in the spec becomes a potential module.
 * Modules are identified by naming patterns (e.g., Account -> account module).
 *
 * @param spec - The parsed specification.
 * @returns Array of module definitions.
 */
function extractModulesFromSpec(spec: Spec): Module[] {
  const modules = new Map<string, Module>();

  const dataModelNames = Object.keys(spec.data_models ?? {});
  const interfaceNames = Object.keys(spec.interfaces ?? {});

  for (const modelName of dataModelNames) {
    const moduleId = modelName.toLowerCase();

    modules.set(moduleId, {
      id: moduleId,
      name: modelName,
      dataModels: [modelName],
      interfaces: [],
      claimIds: [],
    });
  }

  for (const ifaceName of interfaceNames) {
    const interfaces = spec.interfaces ?? {};
    // eslint-disable-next-line security/detect-object-injection -- ifaceName is from spec keys, not user input
    const iface = interfaces[ifaceName];

    if (!iface) {
      continue;
    }

    const relatedDataModels: string[] = iface.methods
      .flatMap((method) => {
        const params = method.params ?? [];
        const returnType = method.returns;

        const allTypeNames = [...params, returnType].flatMap((paramOrReturn) => {
          // Match type names with optional generic parameters (e.g., "Result<T>")
          // eslint-disable-next-line security/detect-unsafe-regex -- Input from spec files, not user input
          const match = /^(\w+)(?:<[^<>]+>)?$/.exec(paramOrReturn);
          if (match) {
            const typeName = match[1];
            return typeName !== undefined ? [typeName] : [];
          }
          return [];
        });

        return allTypeNames;
      })
      .filter(
        (typeName): typeName is string =>
          typeof typeName === 'string' && dataModelNames.includes(typeName)
      );

    if (relatedDataModels.length > 0) {
      const primaryModelName = relatedDataModels[0];
      if (primaryModelName === undefined) {
        continue;
      }

      const primaryModuleId = primaryModelName.toLowerCase();

      if (modules.has(primaryModuleId)) {
        const existingModule = modules.get(primaryModuleId);
        if (existingModule) {
          modules.set(primaryModuleId, {
            ...existingModule,
            interfaces: [...existingModule.interfaces, ifaceName],
          });
        }
      } else {
        modules.set(primaryModuleId, {
          id: primaryModuleId,
          name: primaryModelName,
          dataModels: relatedDataModels as readonly string[],
          interfaces: [ifaceName],
          claimIds: [],
        });
      }
    } else {
      const interfaceModuleId = ifaceName.toLowerCase();

      if (!modules.has(interfaceModuleId)) {
        modules.set(interfaceModuleId, {
          id: interfaceModuleId,
          name: ifaceName,
          dataModels: [],
          interfaces: [ifaceName],
          claimIds: [],
        });
      }
    }
  }

  return Array.from(modules.values());
}

/**
 * Extracts claim-to-module mappings from spec claims.
 *
 * Analyzes claim text and metadata to determine which modules
 * the claim relates to based on type references and subject.
 *
 * @param spec - The parsed specification.
 * @param modules - Array of module definitions.
 * @returns Map of module ID to array of claim IDs.
 */
function mapClaimsToModules(spec: Spec, modules: readonly Module[]): Map<string, string[]> {
  const claimMap = new Map<string, string[]>();

  const claims = spec.claims ?? {};

  for (const [claimId, claim] of Object.entries(claims)) {
    const referencedModules = new Set<string>();

    const claimText = claim.text.toLowerCase();

    const moduleNames = modules.map((m) => m.name.toLowerCase());

    for (const moduleName of moduleNames) {
      const subjectMatch = claim.subject?.toLowerCase().includes(moduleName) ?? false;
      const triggerMatch = claim.trigger?.toLowerCase().includes(moduleName) ?? false;
      const outcomeMatch = claim.outcome?.toLowerCase().includes(moduleName) ?? false;
      const operationMatch = claim.operation?.toLowerCase().includes(moduleName) ?? false;

      if (
        claimText.includes(moduleName) ||
        subjectMatch ||
        triggerMatch ||
        outcomeMatch ||
        operationMatch
      ) {
        referencedModules.add(moduleName);
      }
    }

    if (referencedModules.size === 0) {
      const dataModelNames = Object.keys(spec.data_models ?? {});
      for (const modelName of dataModelNames) {
        if (claimText.includes(modelName.toLowerCase()) || claimText.includes(modelName)) {
          referencedModules.add(modelName.toLowerCase());
        }
      }
    }

    if (referencedModules.size === 0) {
      const interfaceNames = Object.keys(spec.interfaces ?? {});
      for (const ifaceName of interfaceNames) {
        if (claimText.includes(ifaceName.toLowerCase()) || claimText.includes(ifaceName)) {
          referencedModules.add(ifaceName.toLowerCase());
        }
      }
    }

    for (const moduleName of referencedModules) {
      const existingClaims = claimMap.get(moduleName) ?? [];
      claimMap.set(moduleName, [...existingClaims, claimId]);
    }
  }

  return claimMap;
}

/**
 * Groups modules into clusters based on shared claims.
 *
 * Modules that share claims are grouped together.
 * Cross-module clusters are created for integration scenarios.
 *
 * @param modules - Array of module definitions.
 * @param claimMap - Map of module ID to claim IDs.
 * @param options - Cluster definition options.
 * @returns Array of cluster definitions.
 */
function groupModulesIntoClusters(
  modules: readonly Module[],
  claimMap: Map<string, string[]>,
  options: Required<ClusterDefinitionOptions>
): ClusterDefinition[] {
  const clusters: ClusterDefinition[] = [];
  const assignedModules = new Set<string>();
  const assignedClaims = new Set<string>();

  for (const module of modules) {
    if (assignedModules.has(module.id)) {
      continue;
    }

    const moduleClaims = claimMap.get(module.id);

    if (moduleClaims?.length === 0) {
      if (options.createOrphanClusters) {
        clusters.push({
          id: module.id,
          name: `${module.name} (orphan)`,
          modules: [module.id],
          claimIds: [],
          isCrossModule: false,
        });
      }
      assignedModules.add(module.id);
      continue;
    }

    if (moduleClaims && moduleClaims.length >= options.minClaimsPerModule) {
      const unassignedModuleClaims = moduleClaims.filter((c) => !assignedClaims.has(c));

      if (unassignedModuleClaims.length > 0) {
        if (options.createCrossModuleClusters) {
          const relatedModules = findModulesSharingClaims(
            module,
            modules,
            claimMap,
            assignedModules
          );

          if (relatedModules.length > 0) {
            const allModules = [module.id, ...relatedModules];
            const allClaims = [
              ...new Set([
                ...unassignedModuleClaims,
                ...relatedModules.flatMap((m) => claimMap.get(m) ?? []),
              ]),
            ].filter((c) => !assignedClaims.has(c));

            if (allClaims.length > 0) {
              clusters.push({
                id: allModules.join('_'),
                name: allModules
                  .map((mId) => modules.find((m) => m.id === mId)?.name ?? mId)
                  .join('-'),
                modules: allModules,
                claimIds: allClaims,
                isCrossModule: true,
              });

              allClaims.forEach((c) => {
                assignedClaims.add(c);
              });
              allModules.forEach((m) => {
                assignedModules.add(m);
              });
              continue;
            }
          }
        }

        clusters.push({
          id: module.id,
          name: module.name,
          modules: [module.id],
          claimIds: unassignedModuleClaims,
          isCrossModule: false,
        });

        unassignedModuleClaims.forEach((c) => {
          assignedClaims.add(c);
        });
        assignedModules.add(module.id);
      }
    }
  }

  return clusters;
}

/**
 * Finds modules that share claims with the given module.
 *
 * @param module - The module to find related modules for.
 * @param modules - Array of all module definitions.
 * @param claimMap - Map of module ID to claim IDs.
 * @param assignedModules - Set of already assigned module IDs.
 * @returns Array of related module IDs.
 */
function findModulesSharingClaims(
  module: Module,
  modules: readonly Module[],
  claimMap: Map<string, string[]>,
  assignedModules: Set<string>
): string[] {
  const moduleClaims = new Set(claimMap.get(module.id) ?? []);
  const relatedModules: string[] = [];

  for (const otherModule of modules) {
    if (otherModule.id === module.id || assignedModules.has(otherModule.id)) {
      continue;
    }

    const otherClaims = new Set(claimMap.get(otherModule.id) ?? []);

    const hasSharedClaim = [...moduleClaims].some((c) => otherClaims.has(c));

    if (hasSharedClaim) {
      relatedModules.push(otherModule.id);
    }
  }

  return relatedModules;
}

/**
 * Generates cluster definitions from a specification.
 *
 * Main entry point for cluster definition generation.
 *
 * @param spec - The parsed specification.
 * @param options - Optional cluster definition options.
 * @returns Cluster definition result with clusters and metadata.
 * @throws ClusterDefinitionError if spec is invalid or processing fails.
 *
 * @example
 * ```typescript
 * import { parseSpec } from '../spec/parser.js';
 * import { defineClusters } from './cluster-definer.js';
 *
 * const spec = parseSpec(tomlContent);
 * const result = defineClusters(spec);
 *
 * console.log(`Generated ${result.clusters.length} clusters`);
 * console.log(`Orphan modules: ${result.orphanCount}`);
 * ```
 */
export function defineClusters(
  spec: Spec,
  options?: ClusterDefinitionOptions
): ClusterDefinitionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const modules = extractModulesFromSpec(spec);
    const claimMapFromModules = mapClaimsToModules(spec, modules);
    const clusters = groupModulesIntoClusters(modules, claimMapFromModules, opts);

    const assignedClaimIds = clusters.flatMap((c) => c.claimIds);
    const allClaimIds = Object.keys(spec.claims ?? {});
    const unassignedClaimIds = allClaimIds.filter((c) => !assignedClaimIds.includes(c));

    const modulesWithClaims = modules.map((m) => ({
      ...m,
      claimIds: claimMapFromModules.get(m.id) ?? [],
    }));

    const orphanModules = modulesWithClaims.filter((m) => {
      return m.claimIds.length === 0;
    });

    for (const orphan of orphanModules) {
      if (opts.createOrphanClusters) {
        const clusterExists = clusters.some((c) => c.modules.includes(orphan.id));

        if (!clusterExists) {
          clusters.push({
            id: orphan.id,
            name: `${orphan.name} (orphan)`,
            modules: [orphan.id],
            claimIds: [],
            isCrossModule: false,
          });
        }
      }
    }

    return {
      clusters,
      modules: modulesWithClaims,
      assignedClaimIds,
      unassignedClaimIds,
      orphanCount: orphanModules.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ClusterDefinitionError(
      `Failed to define clusters: ${errorMessage}`,
      'MODULE_EXTRACTION_ERROR',
      errorMessage
    );
  }
}

/**
 * Validates a cluster definition result.
 *
 * @param result - The cluster definition result to validate.
 * @returns True if the result is valid.
 */
export function validateClusterResult(result: ClusterDefinitionResult): boolean {
  const allClaimIds = new Set([...result.assignedClaimIds, ...result.unassignedClaimIds]);

  const validModuleIds = new Set(result.modules.map((m) => m.id));

  for (const cluster of result.clusters) {
    if (cluster.modules.length === 0) {
      return false;
    }

    for (const claimId of cluster.claimIds) {
      if (!allClaimIds.has(claimId)) {
        return false;
      }
    }

    for (const moduleId of cluster.modules) {
      if (!validModuleIds.has(moduleId)) {
        return false;
      }
    }
  }

  return true;
}
