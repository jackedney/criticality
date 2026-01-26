/**
 * TypeScript compiler wrapper with structured error output.
 *
 * Provides programmatic access to tsc compilation with parsed error results.
 *
 * @module adapters/typescript/typecheck
 */

import { execa } from 'execa';
import * as path from 'node:path';

/**
 * Error thrown when the TypeScript compiler (tsc) is not found in PATH.
 */
export class ToolchainNotInstalledError extends Error {
  constructor(toolName: string) {
    super(`${toolName} not found in PATH. Please install TypeScript: npm install -g typescript`);
    this.name = 'ToolchainNotInstalledError';
  }
}

/**
 * Represents a single compiler error from TypeScript.
 */
export interface CompilerError {
  /** The file path where the error occurred */
  file: string;
  /** The line number (1-indexed) */
  line: number;
  /** The column number (1-indexed) */
  column: number;
  /** The TypeScript error code (e.g., "TS2322") */
  code: string;
  /** The error message */
  message: string;
}

/**
 * Options for running the TypeScript type checker.
 */
export interface TypeCheckOptions {
  /** Specific files to check (if not provided, checks entire project) */
  files?: string[];
  /** Whether to emit output files (default: false, uses --noEmit) */
  emit?: boolean;
  /** Path to tsconfig.json (if not provided, uses project root) */
  tsconfigPath?: string;
}

/**
 * Result of running the TypeScript type checker.
 */
export interface TypeCheckResult {
  /** Whether the type check passed with no errors */
  success: boolean;
  /** Array of compiler errors */
  errors: CompilerError[];
  /** Number of errors */
  errorCount: number;
  /** Number of warnings (TypeScript doesn't differentiate, so typically 0) */
  warningCount: number;
}

/**
 * Regular expression to parse TypeScript error output.
 * Matches format: path/to/file.ts(line,column): error TS1234: message
 */
const TSC_ERROR_PATTERN = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

/**
 * Parses TypeScript compiler output into structured CompilerError objects.
 *
 * @param output - The raw tsc output string.
 * @param projectPath - The project path to resolve relative file paths.
 * @returns Array of CompilerError objects.
 */
function parseCompilerOutput(output: string, projectPath: string): CompilerError[] {
  const errors: CompilerError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      continue;
    }

    const match = TSC_ERROR_PATTERN.exec(trimmedLine);
    if (match !== null) {
      const [, filePath, lineStr, columnStr, code, message] = match;
      if (
        filePath !== undefined &&
        filePath !== '' &&
        lineStr !== undefined &&
        lineStr !== '' &&
        columnStr !== undefined &&
        columnStr !== '' &&
        code !== undefined &&
        code !== '' &&
        message !== undefined &&
        message !== ''
      ) {
        errors.push({
          file: path.isAbsolute(filePath) ? filePath : path.resolve(projectPath, filePath),
          line: parseInt(lineStr, 10),
          column: parseInt(columnStr, 10),
          code,
          message,
        });
      }
    }
  }

  return errors;
}

/**
 * Finds the local tsc binary in node_modules or falls back to npx.
 *
 * @param projectPath - The project path to search for local tsc.
 * @returns Object with command and args for running tsc.
 */
async function findTscCommand(projectPath: string): Promise<{ command: string; args: string[] }> {
  // Try local node_modules/.bin/tsc first
  const localTsc = path.join(projectPath, 'node_modules', '.bin', 'tsc');

  try {
    await execa('test', ['-f', localTsc]);
    return { command: localTsc, args: [] };
  } catch {
    // Local tsc not found, try npx
    try {
      await execa('which', ['npx']);
      return { command: 'npx', args: ['tsc'] };
    } catch {
      // No npx, try global tsc
      try {
        await execa('which', ['tsc']);
        return { command: 'tsc', args: [] };
      } catch {
        throw new ToolchainNotInstalledError('tsc');
      }
    }
  }
}

/**
 * Runs TypeScript type checking on a project and returns structured error output.
 *
 * Uses `--noEmit` by default to perform verification only without generating output files.
 * Supports checking specific files or the entire project.
 *
 * @param projectPath - The path to the TypeScript project directory.
 * @param options - Optional configuration for the type check.
 * @returns A TypeCheckResult with success status and any compiler errors.
 * @throws {ToolchainNotInstalledError} If tsc is not found in PATH.
 *
 * @example
 * // Check entire project
 * const result = await runTypeCheck('./my-project');
 * if (!result.success) {
 *   console.log(`Found ${result.errorCount} errors`);
 *   for (const error of result.errors) {
 *     console.log(`${error.file}:${error.line}:${error.column} - ${error.code}: ${error.message}`);
 *   }
 * }
 *
 * @example
 * // Check specific files
 * const result = await runTypeCheck('./my-project', {
 *   files: ['src/index.ts', 'src/utils.ts']
 * });
 *
 * @example
 * // Use custom tsconfig
 * const result = await runTypeCheck('./my-project', {
 *   tsconfigPath: './tsconfig.build.json'
 * });
 */
export async function runTypeCheck(
  projectPath: string,
  options: TypeCheckOptions = {}
): Promise<TypeCheckResult> {
  const resolvedProjectPath = path.resolve(projectPath);
  const { files, emit = false, tsconfigPath } = options;

  // Find the tsc command
  const { command, args: baseArgs } = await findTscCommand(resolvedProjectPath);

  // Build the tsc arguments
  const args = [...baseArgs];

  // Add noEmit flag unless emit is explicitly requested
  if (!emit) {
    args.push('--noEmit');
  }

  // Add tsconfig path or use project
  if (tsconfigPath !== undefined && tsconfigPath !== '') {
    args.push('--project', path.resolve(resolvedProjectPath, tsconfigPath));
  } else if (files === undefined || files.length === 0) {
    // If no specific files, use --project to check the whole project
    args.push('--project', resolvedProjectPath);
  }

  // Add specific files if provided
  if (files && files.length > 0) {
    for (const file of files) {
      args.push(path.resolve(resolvedProjectPath, file));
    }
  }

  let exitCode: number;
  let output: string;
  try {
    const result = await execa(command, args, {
      cwd: resolvedProjectPath,
      reject: false,
      all: true,
    });
    exitCode = result.exitCode ?? 1;
    // Handle the output type - execa can return string, Uint8Array, or array
    const rawOutput = result.all;
    output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput);
  } catch (error) {
    // Handle case where the command itself fails to run (not a compilation error)
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new ToolchainNotInstalledError('tsc');
    }
    throw error;
  }

  // Parse the output
  const errors = parseCompilerOutput(output, resolvedProjectPath);

  return {
    success: exitCode === 0,
    errors,
    errorCount: errors.length,
    warningCount: 0, // TypeScript doesn't have warnings, only errors
  };
}
