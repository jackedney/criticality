/**
 * TypeScript AST manipulation module using ts-morph.
 *
 * @module adapters/typescript/ast
 */

import { Project, type ProjectOptions } from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Error thrown when a tsconfig.json file cannot be found.
 */
export class TsConfigNotFoundError extends Error {
  constructor(tsConfigPath: string) {
    super(`tsconfig.json not found at path: ${tsConfigPath}`);
    this.name = 'TsConfigNotFoundError';
  }
}

/**
 * Creates a ts-morph Project for AST manipulation.
 *
 * @param tsConfigPath - Optional path to a tsconfig.json file. If provided,
 *   the project will use the TypeScript configuration from that file.
 *   If not provided, sensible defaults with strict mode enabled are used.
 * @returns A ts-morph Project instance configured for the target codebase.
 * @throws {TsConfigNotFoundError} If tsConfigPath is provided but the file does not exist.
 *
 * @example
 * // Using a specific tsconfig.json
 * const project = createProject('./tsconfig.json');
 *
 * @example
 * // Using default compiler options with strict: true
 * const project = createProject();
 */
export function createProject(tsConfigPath?: string): Project {
  if (tsConfigPath !== undefined) {
    const resolvedPath = path.resolve(tsConfigPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new TsConfigNotFoundError(resolvedPath);
    }

    return new Project({
      tsConfigFilePath: resolvedPath,
    });
  }

  const defaultOptions: ProjectOptions = {
    compilerOptions: {
      strict: true,
      target: 99, // ScriptTarget.ESNext
      module: 199, // ModuleKind.NodeNext
      moduleResolution: 99, // ModuleResolutionKind.NodeNext
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
    },
  };

  return new Project(defaultOptions);
}
