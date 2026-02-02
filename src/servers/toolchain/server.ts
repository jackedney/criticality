/**
 * Criticality Toolchain Server - MCP Server wrapping build tools.
 *
 * Provides structured JSON output from build tools (tsc, cargo check, vitest)
 * instead of raw stdout, enabling agents to programmatically process results.
 *
 * @packageDocumentation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { execa, type ResultPromise, type Options as ExecaOptions } from 'execa';
import path from 'node:path';

import {
  type ToolchainServerConfig,
  type ToolchainLanguage,
  type VerifyStructureInput,
  type VerifyStructureResult,
  type StructuralError,
  type RunFunctionTestInput,
  type RunFunctionTestResult,
  type TestResult,
  type CoverageInfo,
  type CheckComplexityInput,
  type CheckComplexityResult,
  type FunctionComplexity,
  type ComplexitySummary,
  ToolchainNotInstalledError,
  OutputParseError,
} from './types.js';
import { createServerLogger } from '../logging.js';
import { safeStat, safeReadFile, safeReaddir } from '../../utils/safe-fs.js';

const DEFAULT_TIMEOUT = 60000;

/**
 * Creates and configures the criticality-toolchain-server.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export function createToolchainServer(config: ToolchainServerConfig): Server {
  const { projectRoot, debug = false, timeout = DEFAULT_TIMEOUT } = config;

  const logger = createServerLogger({ serverName: 'toolchain-server', debug });

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const server = new Server(
    { name: 'criticality-toolchain-server', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } }
  );

  /**
   * Detects the project language from configuration files.
   */
  async function detectLanguage(): Promise<ToolchainLanguage> {
    const checks: { file: string; lang: ToolchainLanguage }[] = [
      { file: 'tsconfig.json', lang: 'typescript' },
      { file: 'package.json', lang: 'typescript' },
      { file: 'Cargo.toml', lang: 'rust' },
      { file: 'pyproject.toml', lang: 'python' },
      { file: 'setup.py', lang: 'python' },
      { file: 'go.mod', lang: 'go' },
    ];

    for (const { file, lang } of checks) {
      try {
        await safeStat(path.join(projectRoot, file));
        return lang;
      } catch {
        // File doesn't exist, continue
      }
    }

    // Default to TypeScript
    return 'typescript';
  }

  /**
   * Runs a command and returns structured output.
   */
  async function runCommand(
    command: string,
    args: string[],
    execOptions?: ExecaOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
    const startTime = Date.now();

    try {
      const result = await (execa(command, args, {
        cwd: projectRoot,
        timeout,
        reject: false,
        ...execOptions,
      }) as ResultPromise);

      return {
        stdout: typeof result.stdout === 'string' ? result.stdout : '',
        stderr: typeof result.stderr === 'string' ? result.stderr : '',
        exitCode: result.exitCode ?? 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'ENOENT') {
        throw new ToolchainNotInstalledError(command, `${command} ${args.join(' ')}`);
      }
      throw err;
    }
  }

  /**
   * Checks if a command is available.
   */
  async function isCommandAvailable(command: string): Promise<boolean> {
    try {
      await execa('which', [command], { cwd: projectRoot, reject: true });
      return true;
    } catch {
      return false;
    }
  }

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return Promise.resolve({
      tools: [
        {
          name: 'verify_structure',
          description:
            'Runs structural verification (type checking) for the project. ' +
            'Returns structured JSON with errors instead of raw compiler output. ' +
            'Supports TypeScript (tsc) and Rust (cargo check).',
          inputSchema: {
            type: 'object',
            properties: {
              language: {
                type: 'string',
                enum: ['typescript', 'rust', 'python', 'go'],
                description: 'Language/toolchain to verify. Auto-detected if not specified.',
              },
              path: {
                type: 'string',
                description: 'Optional: specific file or directory to check.',
              },
              emit: {
                type: 'boolean',
                description: 'Whether to emit output files (default: false for verification only).',
              },
            },
          },
        },
        {
          name: 'run_function_test',
          description:
            'Runs isolated tests matching a pattern. ' +
            'Returns structured JSON with test results and optional coverage. ' +
            'Uses vitest for TypeScript, cargo test for Rust.',
          inputSchema: {
            type: 'object',
            properties: {
              testPattern: {
                type: 'string',
                description:
                  'Test file or pattern to run (e.g., "src/ledger/*.test.ts", "test_account").',
              },
              testName: {
                type: 'string',
                description: 'Optional: specific test name or describe block to run.',
              },
              coverage: {
                type: 'boolean',
                description: 'Whether to collect coverage information (default: false).',
              },
              timeout: {
                type: 'number',
                description: 'Timeout for the test run in milliseconds.',
              },
            },
            required: ['testPattern'],
          },
        },
        {
          name: 'check_complexity',
          description:
            'Analyzes code complexity and returns metrics. ' +
            'Returns structured JSON with cyclomatic complexity, lines of code, and violations.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File or directory to analyze.',
              },
              maxComplexity: {
                type: 'number',
                description:
                  'Maximum cyclomatic complexity threshold (default: 10). ' +
                  'Functions exceeding this are flagged as violations.',
              },
              detailed: {
                type: 'boolean',
                description: 'Include detailed per-function metrics (default: false).',
              },
            },
            required: ['path'],
          },
        },
      ],
    });
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    logger.logDebug('tool_call', { name, args });

    try {
      switch (name) {
        case 'verify_structure': {
          const input = args as unknown as VerifyStructureInput;
          const result = await handleVerifyStructure(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'run_function_test': {
          const input = args as unknown as RunFunctionTestInput;
          const result = await handleRunFunctionTest(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'check_complexity': {
          const input = args as unknown as CheckComplexityInput;
          const result = await handleCheckComplexity(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  /**
   * Handles the verify_structure tool.
   */
  async function handleVerifyStructure(
    input: VerifyStructureInput
  ): Promise<VerifyStructureResult> {
    const language = input.language ?? (await detectLanguage());
    let command: string;
    let args: string[];

    switch (language) {
      case 'typescript': {
        command = 'npx';
        args = ['tsc', '--noEmit'];
        if (input.emit === true) {
          args = ['tsc'];
        }
        if (input.path !== undefined) {
          args.push(input.path);
        }
        // Force pretty output off for parsing
        args.push('--pretty', 'false');
        break;
      }

      case 'rust': {
        command = 'cargo';
        args = ['check', '--message-format=json'];
        if (input.path !== undefined) {
          args.push('--manifest-path', input.path);
        }
        break;
      }

      case 'python': {
        // Use mypy for Python type checking
        const hasPyright = await isCommandAvailable('pyright');
        if (hasPyright) {
          command = 'pyright';
          args = ['--outputjson'];
        } else {
          command = 'mypy';
          args = ['--no-error-summary', '--show-column-numbers'];
        }
        if (input.path !== undefined) {
          args.push(input.path);
        } else {
          args.push('.');
        }
        break;
      }

      case 'go': {
        command = 'go';
        args = ['build', '-o', '/dev/null'];
        if (input.path !== undefined) {
          args.push(input.path);
        } else {
          args.push('./...');
        }
        break;
      }
    }

    const { stdout, stderr, exitCode, durationMs } = await runCommand(command, args);
    const errors = parseStructuralErrors(language, stdout, stderr);

    const errorCount = errors.filter((e) => e.severity === 'error').length;
    const warningCount = errors.filter((e) => e.severity === 'warning').length;

    return {
      success: exitCode === 0 && errorCount === 0,
      language,
      errors,
      errorCount,
      warningCount,
      durationMs,
      command: `${command} ${args.join(' ')}`,
      exitCode,
    };
  }

  /**
   * Parses structural errors from compiler output.
   */
  function parseStructuralErrors(
    language: ToolchainLanguage,
    stdout: string,
    stderr: string
  ): StructuralError[] {
    const errors: StructuralError[] = [];
    const output = stdout + '\n' + stderr;

    switch (language) {
      case 'typescript': {
        // TypeScript format: file(line,col): error TS1234: message
        const tsRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
        let match;
        while ((match = tsRegex.exec(output)) !== null) {
          errors.push({
            file: match[1] ?? '',
            line: parseInt(match[2] ?? '0', 10),
            column: parseInt(match[3] ?? '0', 10),
            severity: (match[4] ?? 'error') as 'error' | 'warning',
            code: match[5] ?? '',
            message: match[6] ?? '',
          });
        }
        break;
      }

      case 'rust': {
        // Cargo JSON format
        for (const line of output.split('\n')) {
          if (line.trim().length === 0) {
            continue;
          }
          try {
            const msg = JSON.parse(line) as {
              reason?: string;
              message?: {
                level?: string;
                code?: { code?: string };
                message?: string;
                spans?: {
                  file_name?: string;
                  line_start?: number;
                  column_start?: number;
                }[];
              };
            };
            if (msg.reason === 'compiler-message' && msg.message !== undefined) {
              const m = msg.message;
              const span = m.spans?.[0];
              if (span !== undefined) {
                errors.push({
                  file: span.file_name ?? '',
                  line: span.line_start ?? 0,
                  column: span.column_start ?? 0,
                  severity: m.level === 'warning' ? 'warning' : 'error',
                  code: m.code?.code ?? '',
                  message: m.message ?? '',
                });
              }
            }
          } catch {
            // Not JSON, skip
          }
        }
        break;
      }

      case 'python': {
        // mypy format: file:line:col: error: message [error-code]
        /* eslint-disable security/detect-unsafe-regex --
           pyRegex is safe: anchored with ^ and $, uses only bounded character classes
           ([^:]+, [^\]]+, [^[]+?) with no nested quantifiers or catastrophic-backtracking
           constructs, and [ \t] instead of \s reduces ambiguity. */
        const pyRegex =
          /^([^:]+):(\d+):(\d+):[ \t]+(error|warning):[ \t]+([^[]+?)(?:[ \t]+\[([^\]]+)\])?$/gm;
        /* eslint-enable security/detect-unsafe-regex */
        let match;
        while ((match = pyRegex.exec(output)) !== null) {
          errors.push({
            file: match[1] ?? '',
            line: parseInt(match[2] ?? '0', 10),
            column: parseInt(match[3] ?? '0', 10),
            severity: (match[4] ?? 'error') as 'error' | 'warning',
            code: match[6] ?? 'python-error',
            message: match[5] ?? '',
          });
        }
        break;
      }

      case 'go': {
        // Go format: file:line:col: message
        const goRegex = /^(.+?):(\d+):(\d+):\s+(.+)$/gm;
        let match;
        while ((match = goRegex.exec(output)) !== null) {
          errors.push({
            file: match[1] ?? '',
            line: parseInt(match[2] ?? '0', 10),
            column: parseInt(match[3] ?? '0', 10),
            severity: 'error',
            code: 'go-error',
            message: match[4] ?? '',
          });
        }
        break;
      }
    }

    return errors;
  }

  /**
   * Handles the run_function_test tool.
   */
  async function handleRunFunctionTest(
    input: RunFunctionTestInput
  ): Promise<RunFunctionTestResult> {
    const language = await detectLanguage();
    let command: string;
    let args: string[];

    switch (language) {
      case 'typescript': {
        command = 'npx';
        args = ['vitest', 'run', '--reporter=json'];
        args.push(input.testPattern);
        if (input.testName !== undefined) {
          args.push('-t', input.testName);
        }
        if (input.coverage === true) {
          args.push('--coverage', '--coverage.reporter=json');
        }
        break;
      }

      case 'rust': {
        command = 'cargo';
        args = ['test', '--', '--format=json', '-Z', 'unstable-options'];
        args.push(input.testPattern);
        if (input.testName !== undefined) {
          args.push('--exact', input.testName);
        }
        break;
      }

      case 'python': {
        command = 'python';
        args = ['-m', 'pytest', '--json-report', '--json-report-file=-'];
        args.push(input.testPattern);
        if (input.testName !== undefined) {
          args.push('-k', input.testName);
        }
        if (input.coverage === true) {
          args.push('--cov', '--cov-report=json');
        }
        break;
      }

      case 'go': {
        command = 'go';
        args = ['test', '-json'];
        args.push(input.testPattern);
        if (input.testName !== undefined) {
          args.push('-run', input.testName);
        }
        if (input.coverage === true) {
          args.push('-cover');
        }
        break;
      }
    }

    const testTimeout = input.timeout ?? timeout;
    const { stdout, stderr, exitCode, durationMs } = await runCommand(command, args, {
      timeout: testTimeout,
    });

    const parsed = parseTestOutput(language, stdout, stderr);

    const result: RunFunctionTestResult = {
      success: exitCode === 0 && parsed.failedTests === 0,
      totalTests: parsed.totalTests,
      passedTests: parsed.passedTests,
      failedTests: parsed.failedTests,
      skippedTests: parsed.skippedTests,
      tests: parsed.tests,
      durationMs,
      command: `${command} ${args.join(' ')}`,
      exitCode,
    };

    if (parsed.coverage !== undefined) {
      result.coverage = parsed.coverage;
    }

    return result;
  }

  /**
   * Parses test output from test runners.
   */
  function parseTestOutput(
    language: ToolchainLanguage,
    stdout: string,
    stderr: string
  ): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    tests: TestResult[];
    coverage?: CoverageInfo;
  } {
    const tests: TestResult[] = [];
    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = 0;
    let coverage: CoverageInfo | undefined;

    switch (language) {
      case 'typescript': {
        // Vitest JSON output
        try {
          const jsonMatch = /\{[\s\S]*"numTotalTests"[\s\S]*\}/.exec(stdout);
          if (jsonMatch !== null) {
            const report = JSON.parse(jsonMatch[0]) as {
              numTotalTests?: number;
              numPassedTests?: number;
              numFailedTests?: number;
              numPendingTests?: number;
              testResults?: {
                name?: string;
                status?: string;
                duration?: number;
                assertionResults?: {
                  title?: string;
                  status?: string;
                  duration?: number;
                  failureMessages?: string[];
                }[];
              }[];
            };

            passedTests = report.numPassedTests ?? 0;
            failedTests = report.numFailedTests ?? 0;
            skippedTests = report.numPendingTests ?? 0;

            if (report.testResults !== undefined) {
              for (const suite of report.testResults) {
                const file = suite.name ?? '';
                if (suite.assertionResults !== undefined) {
                  for (const test of suite.assertionResults) {
                    const status = mapVitestStatus(test.status ?? 'pending');
                    const testResult: TestResult = {
                      name: test.title ?? '',
                      file,
                      status,
                      durationMs: test.duration ?? 0,
                    };
                    if (status === 'failed' && test.failureMessages !== undefined) {
                      testResult.error = test.failureMessages.join('\n');
                    }
                    tests.push(testResult);
                  }
                }
              }
            }
          }
        } catch {
          // Fall back to basic parsing
          passedTests = (stdout.match(/✓|passed/g) ?? []).length;
          failedTests = (stdout.match(/✗|failed/g) ?? []).length;
        }
        break;
      }

      case 'rust': {
        // Cargo test JSON output
        for (const line of stdout.split('\n')) {
          try {
            const msg = JSON.parse(line) as {
              type?: string;
              event?: string;
              name?: string;
              exec_time?: number;
              stdout?: string;
              passed?: number;
              failed?: number;
              ignored?: number;
            };

            if (msg.type === 'test' && msg.event !== undefined) {
              if (msg.event === 'ok') {
                passedTests++;
                tests.push({
                  name: msg.name ?? '',
                  file: '',
                  status: 'passed',
                  durationMs: (msg.exec_time ?? 0) * 1000,
                });
              } else if (msg.event === 'failed') {
                failedTests++;
                const failedTest: TestResult = {
                  name: msg.name ?? '',
                  file: '',
                  status: 'failed',
                  durationMs: (msg.exec_time ?? 0) * 1000,
                };
                if (msg.stdout !== undefined) {
                  failedTest.error = msg.stdout;
                }
                tests.push(failedTest);
              } else if (msg.event === 'ignored') {
                skippedTests++;
                tests.push({
                  name: msg.name ?? '',
                  file: '',
                  status: 'skipped',
                  durationMs: 0,
                });
              }
            }
          } catch {
            // Not JSON, skip
          }
        }
        break;
      }

      case 'python': {
        // pytest JSON report
        try {
          const report = JSON.parse(stdout) as {
            summary?: {
              passed?: number;
              failed?: number;
              skipped?: number;
            };
            tests?: {
              nodeid?: string;
              outcome?: string;
              duration?: number;
              call?: { longrepr?: string };
            }[];
          };

          passedTests = report.summary?.passed ?? 0;
          failedTests = report.summary?.failed ?? 0;
          skippedTests = report.summary?.skipped ?? 0;

          if (report.tests !== undefined) {
            for (const test of report.tests) {
              const testResult: TestResult = {
                name: test.nodeid ?? '',
                file: test.nodeid?.split('::')[0] ?? '',
                status: mapPytestStatus(test.outcome ?? 'skipped'),
                durationMs: (test.duration ?? 0) * 1000,
              };
              if (test.call?.longrepr !== undefined) {
                testResult.error = test.call.longrepr;
              }
              tests.push(testResult);
            }
          }
        } catch {
          // Fall back to basic parsing from stderr
          passedTests = (stderr.match(/passed/g) ?? []).length;
          failedTests = (stderr.match(/failed/g) ?? []).length;
        }
        break;
      }

      case 'go': {
        // Go test JSON output
        for (const line of stdout.split('\n')) {
          try {
            const msg = JSON.parse(line) as {
              Action?: string;
              Test?: string;
              Package?: string;
              Elapsed?: number;
              Output?: string;
            };

            if (msg.Action === 'pass' && msg.Test !== undefined) {
              passedTests++;
              tests.push({
                name: msg.Test,
                file: msg.Package ?? '',
                status: 'passed',
                durationMs: (msg.Elapsed ?? 0) * 1000,
              });
            } else if (msg.Action === 'fail' && msg.Test !== undefined) {
              failedTests++;
              const goFailedTest: TestResult = {
                name: msg.Test,
                file: msg.Package ?? '',
                status: 'failed',
                durationMs: (msg.Elapsed ?? 0) * 1000,
              };
              if (msg.Output !== undefined) {
                goFailedTest.error = msg.Output;
              }
              tests.push(goFailedTest);
            } else if (msg.Action === 'skip' && msg.Test !== undefined) {
              skippedTests++;
              tests.push({
                name: msg.Test,
                file: msg.Package ?? '',
                status: 'skipped',
                durationMs: 0,
              });
            }
          } catch {
            // Not JSON, skip
          }
        }
        break;
      }
    }

    const result: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
      skippedTests: number;
      tests: TestResult[];
      coverage?: CoverageInfo;
    } = {
      totalTests: passedTests + failedTests + skippedTests,
      passedTests,
      failedTests,
      skippedTests,
      tests,
    };

    if (coverage !== undefined) {
      result.coverage = coverage;
    }

    return result;
  }

  /**
   * Maps Vitest status to our status type.
   */
  function mapVitestStatus(status: string): TestResult['status'] {
    switch (status) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
      case 'pending':
        return 'skipped';
      case 'todo':
        return 'todo';
      default:
        return 'skipped';
    }
  }

  /**
   * Maps pytest outcome to our status type.
   */
  function mapPytestStatus(outcome: string): TestResult['status'] {
    switch (outcome) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
        return 'skipped';
      default:
        return 'skipped';
    }
  }

  /**
   * Handles the check_complexity tool.
   */
  async function handleCheckComplexity(
    input: CheckComplexityInput
  ): Promise<CheckComplexityResult> {
    const startTime = Date.now();
    const threshold = input.maxComplexity ?? 10;
    const targetPath = input.path;

    // Read and analyze files
    const functions = await analyzeComplexity(targetPath, input.detailed === true);

    const violations = functions.filter((f) => f.cyclomaticComplexity > threshold);
    const totalComplexity = functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0);
    const totalLoc = functions.reduce((sum, f) => sum + f.linesOfCode, 0);
    const maxFound = functions.reduce((max, f) => Math.max(max, f.cyclomaticComplexity), 0);

    const summary: ComplexitySummary = {
      totalFunctions: functions.length,
      averageComplexity: functions.length > 0 ? totalComplexity / functions.length : 0,
      maxComplexity: maxFound,
      functionsOverThreshold: violations.length,
      totalLinesOfCode: totalLoc,
    };

    const result: CheckComplexityResult = {
      success: violations.length === 0,
      summary,
      violations,
      threshold,
      durationMs: Date.now() - startTime,
    };

    if (input.detailed === true) {
      result.functions = functions;
    }

    return result;
  }

  /**
   * Analyzes code complexity for TypeScript files.
   * Uses a simplified heuristic-based approach for cyclomatic complexity.
   */
  async function analyzeComplexity(
    targetPath: string,
    _detailed: boolean
  ): Promise<FunctionComplexity[]> {
    const functions: FunctionComplexity[] = [];
    const fullPath = path.join(projectRoot, targetPath);

    // Check if it's a file or directory
    let files: string[];
    try {
      const stat = await safeStat(fullPath);
      if (stat.isDirectory()) {
        files = await collectFiles(fullPath, ['.ts', '.js']);
      } else {
        files = [fullPath];
      }
    } catch {
      throw new OutputParseError(`Path not found: ${targetPath}`, targetPath);
    }

    for (const file of files) {
      const content = (await safeReadFile(file, 'utf-8')) as string;
      const fileFunctions = extractFunctionComplexity(content, path.relative(projectRoot, file));
      functions.push(...fileFunctions);
    }

    return functions;
  }

  /**
   * Collects files with given extensions from a directory.
   */
  async function collectFiles(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    const entries = (await safeReaddir(dirPath, {
      withFileTypes: true,
    })) as import('node:fs').Dirent[];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and other common excludes
        if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
          files.push(...(await collectFiles(fullPath, extensions)));
        }
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        // Skip test files for complexity analysis
        if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Extracts function complexity metrics from source code.
   * Uses heuristic analysis for cyclomatic complexity.
   */
  function extractFunctionComplexity(content: string, filePath: string): FunctionComplexity[] {
    const functions: FunctionComplexity[] = [];

    // Pattern to find function declarations and arrow functions
    /* eslint-disable security/detect-unsafe-regex --
       These patterns are safe: no nested quantifiers or catastrophic-backtracking constructs,
       applied line-by-line with bounded lookahead, and [ \t] instead of \s reduces ambiguity
       by matching only horizontal whitespace. */
    const funcPatterns = [
      // Function declarations: function name(...)
      /function[ \t]+(\w+)[ \t]*\([^)]*\)/g,
      // Method definitions: name(...)
      /(\w+)[ \t]*\([^)]*\)[ \t]*(?::[ \t]*\w+[ \t]*)?\{/g,
      // Arrow functions with name: const name = (...) =>
      /(?:const|let|var)[ \t]+(\w+)[ \t]*=[ \t]*(?:async[ \t]*)?\([^)]*\)[ \t]*=>/g,
    ];
    /* eslint-enable security/detect-unsafe-regex */

    for (const pattern of funcPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1] ?? 'anonymous';
        const startIndex = match.index;
        const lineNumber = content.slice(0, startIndex).split('\n').length;

        // Find the function body
        const bodyStart = content.indexOf('{', startIndex);
        if (bodyStart === -1) {
          continue;
        }

        const bodyEnd = findMatchingBrace(content, bodyStart);
        if (bodyEnd === -1) {
          continue;
        }

        const body = content.slice(bodyStart, bodyEnd + 1);
        const bodyLines = body.split('\n').length;

        // Calculate cyclomatic complexity using heuristics
        const complexity = calculateCyclomaticComplexity(body);

        // Count parameters
        const paramMatch = /\(([^)]*)\)/.exec(content.slice(startIndex));
        const paramCount =
          paramMatch !== null && paramMatch[1]?.trim() !== ''
            ? (paramMatch[1]?.split(',').length ?? 0)
            : 0;

        functions.push({
          name: funcName,
          file: filePath,
          line: lineNumber,
          cyclomaticComplexity: complexity,
          linesOfCode: bodyLines,
          parameterCount: paramCount,
        });
      }
    }

    // Deduplicate by name and line
    const seen = new Set<string>();
    return functions.filter((f) => {
      const key = `${f.file}:${String(f.line)}:${f.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Calculates cyclomatic complexity using control flow heuristics.
   * CC = 1 + number of decision points
   */
  function calculateCyclomaticComplexity(body: string): number {
    let complexity = 1; // Base complexity

    // Decision points that add to complexity
    const patterns = [
      /\bif\s*\(/g, // if statements
      /\belse\s+if\s*\(/g, // else if (already counted by if, subtract 1)
      /\bfor\s*\(/g, // for loops
      /\bwhile\s*\(/g, // while loops
      /\bcase\s+/g, // switch cases
      /\bcatch\s*\(/g, // catch blocks
      /\?\s*[^:]+:/g, // ternary operators
      /&&/g, // logical AND
      /\|\|/g, // logical OR
      /\?\?/g, // nullish coalescing
    ];

    for (const pattern of patterns) {
      const matches = body.match(pattern);
      if (matches !== null) {
        complexity += matches.length;
      }
    }

    // Subtract else if double counting
    const elseIfMatches = body.match(/\belse\s+if\s*\(/g);
    if (elseIfMatches !== null) {
      complexity -= elseIfMatches.length;
    }

    return complexity;
  }

  /**
   * Finds the matching closing brace for an opening brace.
   */
  function findMatchingBrace(content: string, start: number): number {
    let depth = 0;
    for (let i = start; i < content.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- content[i] is safe: bounded string index access
      const char = content[i];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  return server;
}

/**
 * Starts the toolchain server with stdio transport.
 * This is the main entry point when running as a standalone MCP server.
 */
export async function startToolchainServer(config: ToolchainServerConfig): Promise<void> {
  const server = createToolchainServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
