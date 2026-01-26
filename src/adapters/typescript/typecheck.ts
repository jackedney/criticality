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
 * Structured type details extracted from compiler error messages.
 * Provides specific information about type mismatches for targeted repair feedback.
 */
export interface TypeDetails {
  /** The expected type (what was declared/required) */
  expected: string;
  /** The actual type that was provided */
  actual: string;
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
  /** Extracted type details for type mismatch errors, null if unparseable */
  typeDetails: TypeDetails | null;
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

/** Type for extractor functions that parse type details from error messages. */
type TypeDetailsExtractor = (match: RegExpMatchArray) => TypeDetails | null;

/** Pattern definition for matching and extracting type details from TypeScript errors. */
interface TypeMismatchPattern {
  codes: string[];
  pattern: RegExp;
  extractor: TypeDetailsExtractor;
}

const TYPE_MISMATCH_PATTERNS: TypeMismatchPattern[] = [
  // TS2322: Type 'X' is not assignable to type 'Y'.
  {
    codes: ['TS2322', 'TS2741'],
    pattern: /Type '(.+?)' is not assignable to type '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const actual = match[1];
      const expected = match[2];
      if (actual !== undefined && expected !== undefined) {
        return { expected, actual };
      }
      return null;
    },
  },
  // TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.
  {
    codes: ['TS2345'],
    pattern: /Argument of type '(.+?)' is not assignable to parameter of type '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const actual = match[1];
      const expected = match[2];
      if (actual !== undefined && expected !== undefined) {
        return { expected, actual };
      }
      return null;
    },
  },
  // TS2304: Cannot find name 'X'.
  {
    codes: ['TS2304'],
    pattern: /Cannot find name '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const name = match[1];
      if (name !== undefined) {
        return { expected: name, actual: '<undefined>' };
      }
      return null;
    },
  },
  // TS2339: Property 'X' does not exist on type 'Y'.
  {
    codes: ['TS2339'],
    pattern: /Property '(.+?)' does not exist on type '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const prop = match[1];
      const onType = match[2];
      if (prop !== undefined && onType !== undefined) {
        return { expected: `${onType} with property '${prop}'`, actual: onType };
      }
      return null;
    },
  },
  // TS2554: Expected X arguments, but got Y.
  {
    codes: ['TS2554', 'TS2555'],
    pattern: /Expected (\d+) arguments?, but got (\d+)/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const expectedCount = match[1];
      const actualCount = match[2];
      if (expectedCount !== undefined && actualCount !== undefined) {
        return { expected: `${expectedCount} arguments`, actual: `${actualCount} arguments` };
      }
      return null;
    },
  },
  // TS2353/TS2322: Object literal may only specify known properties, and 'X' does not exist in type 'Y'.
  {
    codes: ['TS2353', 'TS2322'],
    pattern:
      /Object literal may only specify known properties, and '(.+?)' does not exist in type '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const prop = match[1];
      const onType = match[2];
      if (prop !== undefined && onType !== undefined) {
        return { expected: onType, actual: `${onType} with extra property '${prop}'` };
      }
      return null;
    },
  },
  // TS2551: Property 'X' does not exist on type 'Y'. Did you mean 'Z'?
  {
    codes: ['TS2551'],
    pattern: /Property '(.+?)' does not exist on type '(.+?)'\. Did you mean '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const prop = match[1];
      const onType = match[2];
      const suggestion = match[3];
      if (prop !== undefined && onType !== undefined && suggestion !== undefined) {
        return {
          expected: `'${suggestion}' (suggestion)`,
          actual: `property '${prop}' on ${onType}`,
        };
      }
      return null;
    },
  },
  // TS2769: No overload matches this call.
  // This is often followed by multi-line details, but we extract basic info
  {
    codes: ['TS2769'],
    pattern: /No overload matches this call/,
    extractor: (): TypeDetails | null => {
      return { expected: 'valid overload arguments', actual: 'arguments that match no overload' };
    },
  },
  // TS2740: Type 'X' is missing the following properties from type 'Y': prop1, prop2, ...
  {
    codes: ['TS2740'],
    pattern: /Type '(.+?)' is missing the following properties from type '(.+?)': (.+)/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const actualType = match[1];
      const expectedType = match[2];
      const missingProps = match[3];
      if (actualType !== undefined && expectedType !== undefined && missingProps !== undefined) {
        return { expected: `${expectedType} (missing: ${missingProps})`, actual: actualType };
      }
      return null;
    },
  },
  // TS2559: Type 'X' has no properties in common with type 'Y'.
  {
    codes: ['TS2559'],
    pattern: /Type '(.+?)' has no properties in common with type '(.+?)'/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const actualType = match[1];
      const expectedType = match[2];
      if (actualType !== undefined && expectedType !== undefined) {
        return { expected: expectedType, actual: actualType };
      }
      return null;
    },
  },
  // TS2352: Conversion of type 'X' to type 'Y' may be a mistake.
  {
    codes: ['TS2352'],
    pattern: /Conversion of type '(.+?)' to type '(.+?)' may be a mistake/,
    extractor: (match: RegExpMatchArray): TypeDetails | null => {
      const actualType = match[1];
      const expectedType = match[2];
      if (actualType !== undefined && expectedType !== undefined) {
        return { expected: expectedType, actual: actualType };
      }
      return null;
    },
  },
];

/**
 * Parses type details from a TypeScript compiler error message.
 *
 * Extracts structured information about type mismatches, including the expected
 * and actual types involved in the error.
 *
 * @param code - The TypeScript error code (e.g., "TS2322").
 * @param message - The error message text.
 * @returns TypeDetails if the message could be parsed, null otherwise.
 *
 * @example
 * // TS2322: Type 'string' is not assignable to type 'number'
 * parseTypeDetails('TS2322', "Type 'string' is not assignable to type 'number'")
 * // Returns: { expected: 'number', actual: 'string' }
 *
 * @example
 * // Unparseable error message
 * parseTypeDetails('TS9999', "Some unknown error format")
 * // Returns: null
 */
export function parseTypeDetails(code: string, message: string): TypeDetails | null {
  // Try each pattern in order
  for (const { codes, pattern, extractor } of TYPE_MISMATCH_PATTERNS) {
    // Skip if code doesn't match any of the pattern's applicable codes
    if (!codes.includes(code)) {
      continue;
    }

    const match = message.match(pattern);
    if (match) {
      return extractor(match);
    }
  }

  // Generic fallback: try to extract any "Type 'X' ... 'Y'" pattern
  const genericTypeMatch = /Type '(.+?)'.+?type '(.+?)'/.exec(message);
  if (genericTypeMatch) {
    const actual = genericTypeMatch[1];
    const expected = genericTypeMatch[2];
    if (actual !== undefined && expected !== undefined) {
      return { expected, actual };
    }
  }

  return null;
}

/**
 * Parses TypeScript compiler output into structured CompilerError objects.
 *
 * @param output - The raw tsc output string.
 * @param projectPath - The project path to resolve relative file paths.
 * @returns Array of CompilerError objects with enriched type details.
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
          typeDetails: parseTypeDetails(code, message),
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
