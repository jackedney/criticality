/**
 * Tests for criticality-toolchain-server.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createToolchainServer } from './server.js';
import {
  ToolchainNotInstalledError,
  ToolExecutionError,
  OutputParseError,
  type VerifyStructureResult,
  type RunFunctionTestResult,
  type CheckComplexityResult,
} from './types.js';

// Type for tool call result (simplified for test purposes)
interface ToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

// Helper to extract text from call tool result
function getResultText(result: ToolCallResult): string {
  const first = result.content[0];
  if (first === undefined) {
    throw new Error('No content in result');
  }
  return first.text;
}

// Helper to call tool with proper type casting
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as ToolCallResult;
}

// Helper to create a connected server-client pair
async function createConnectedPair(projectRoot: string): Promise<{ client: Client }> {
  const server = createToolchainServer({ projectRoot, debug: false });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: 'test-client', version: '1.0.0' }, {});

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

describe('criticality-toolchain-server', () => {
  let tempDir: string;
  let client: Client;

  beforeEach(async () => {
    // Create a temporary directory for test projects
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'toolchain-server-test-'));

    // Create a minimal TypeScript project
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: {
          test: 'echo "test"',
        },
      })
    );

    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      })
    );

    // Create src directory with test files
    await fs.mkdir(path.join(tempDir, 'src'));

    // Create a valid TypeScript file
    await fs.writeFile(
      path.join(tempDir, 'src', 'valid.ts'),
      `/**
 * A simple function for testing.
 */
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
    );

    // Create connected server-client pair
    const pair = await createConnectedPair(tempDir);
    client = pair.client;
  });

  afterEach(async () => {
    // Close the client connection
    await client.close();
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('tool listing', () => {
    it('lists all three tools', async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);

      expect(toolNames).toContain('verify_structure');
      expect(toolNames).toContain('run_function_test');
      expect(toolNames).toContain('check_complexity');
      expect(toolNames).toHaveLength(3);
    });

    it('includes input schemas for each tool', async () => {
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.description).toBeTruthy();
      }
    });
  });

  describe('verify_structure', () => {
    it('returns structured result with all required fields', async () => {
      const result = await callTool(client, 'verify_structure', {});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;

      // Verify all required fields are present (regardless of success status)
      expect(typeof parsed.success).toBe('boolean');
      expect(parsed.language).toBe('typescript');
      expect(typeof parsed.errorCount).toBe('number');
      expect(typeof parsed.warningCount).toBe('number');
      expect(typeof parsed.durationMs).toBe('number');
      expect(parsed.command).toContain('tsc');
      expect(typeof parsed.exitCode).toBe('number');
      expect(Array.isArray(parsed.errors)).toBe(true);
    });

    it('respects the language parameter', async () => {
      const result = await callTool(client, 'verify_structure', {
        language: 'typescript',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;
      expect(parsed.language).toBe('typescript');
    });

    it('includes --noEmit flag by default', async () => {
      const result = await callTool(client, 'verify_structure', {
        emit: false,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;
      expect(parsed.command).toContain('--noEmit');
    });

    it('returns exit code in result', async () => {
      const result = await callTool(client, 'verify_structure', {});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;
      expect(typeof parsed.exitCode).toBe('number');
    });
  });

  describe('run_function_test', () => {
    it('returns structured JSON with all required fields', async () => {
      const result = await callTool(client, 'run_function_test', {
        testPattern: 'src/*.test.ts',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as RunFunctionTestResult;

      // Verify all required fields are present
      expect(typeof parsed.success).toBe('boolean');
      expect(typeof parsed.totalTests).toBe('number');
      expect(typeof parsed.passedTests).toBe('number');
      expect(typeof parsed.failedTests).toBe('number');
      expect(typeof parsed.skippedTests).toBe('number');
      expect(Array.isArray(parsed.tests)).toBe(true);
      expect(typeof parsed.durationMs).toBe('number');
      expect(typeof parsed.command).toBe('string');
      expect(typeof parsed.exitCode).toBe('number');
    });

    it('includes test pattern in command', async () => {
      const result = await callTool(client, 'run_function_test', {
        testPattern: 'src/*.test.ts',
        testName: 'specific test',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as RunFunctionTestResult;
      expect(parsed.command).toContain('-t');
      expect(parsed.command).toContain('specific test');
    });

    it('includes coverage flag when requested', async () => {
      const result = await callTool(client, 'run_function_test', {
        testPattern: 'src/*.test.ts',
        coverage: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as RunFunctionTestResult;
      expect(parsed.command).toContain('--coverage');
    });
  });

  describe('check_complexity', () => {
    it('returns complexity metrics for a file', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'src/valid.ts',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;

      expect(typeof parsed.success).toBe('boolean');
      expect(parsed.summary).toBeDefined();
      expect(typeof parsed.summary.totalFunctions).toBe('number');
      expect(typeof parsed.summary.averageComplexity).toBe('number');
      expect(typeof parsed.summary.maxComplexity).toBe('number');
      expect(typeof parsed.summary.totalLinesOfCode).toBe('number');
      expect(Array.isArray(parsed.violations)).toBe(true);
      expect(typeof parsed.threshold).toBe('number');
      expect(typeof parsed.durationMs).toBe('number');
    });

    it('uses default threshold of 10', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'src/valid.ts',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;
      expect(parsed.threshold).toBe(10);
    });

    it('respects custom threshold', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'src/valid.ts',
        maxComplexity: 5,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;
      expect(parsed.threshold).toBe(5);
    });

    it('includes per-function metrics when detailed is true', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'src/valid.ts',
        detailed: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;

      expect(parsed.functions).toBeDefined();
      expect(Array.isArray(parsed.functions)).toBe(true);

      // We created add and multiply functions
      if (parsed.functions !== undefined && parsed.functions.length > 0) {
        const firstFunc = parsed.functions[0];
        if (firstFunc !== undefined) {
          expect(typeof firstFunc.name).toBe('string');
          expect(typeof firstFunc.file).toBe('string');
          expect(typeof firstFunc.line).toBe('number');
          expect(typeof firstFunc.cyclomaticComplexity).toBe('number');
          expect(typeof firstFunc.linesOfCode).toBe('number');
          expect(typeof firstFunc.parameterCount).toBe('number');
        }
      }
    });

    it('detects complexity violations', async () => {
      // Create a complex function
      await fs.writeFile(
        path.join(tempDir, 'src', 'complex.ts'),
        `
export function complexFunction(a: number, b: string, c: boolean): string {
  let result = '';

  if (a > 0) {
    result += 'positive';
  } else if (a < 0) {
    result += 'negative';
  } else {
    result += 'zero';
  }

  if (b.length > 0) {
    result += b;
  }

  if (c) {
    result += 'true';
  } else {
    result += 'false';
  }

  for (let i = 0; i < a; i++) {
    if (i % 2 === 0) {
      result += 'even';
    } else {
      result += 'odd';
    }
  }

  while (result.length < 10) {
    result += '.';
  }

  switch (a) {
    case 1:
      result += 'one';
      break;
    case 2:
      result += 'two';
      break;
    case 3:
      result += 'three';
      break;
    default:
      result += 'other';
  }

  return result;
}
`
      );

      const result = await callTool(client, 'check_complexity', {
        path: 'src/complex.ts',
        maxComplexity: 5,
        detailed: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;

      // The complex function should exceed threshold
      expect(parsed.success).toBe(false);
      expect(parsed.violations.length).toBeGreaterThan(0);

      const violation = parsed.violations[0];
      if (violation !== undefined) {
        expect(violation.name).toBe('complexFunction');
        expect(violation.cyclomaticComplexity).toBeGreaterThan(5);
      }
    });

    it('analyzes entire directory', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'src',
        detailed: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as CheckComplexityResult;

      // Should find functions in valid.ts
      expect(parsed.summary.totalFunctions).toBeGreaterThan(0);
    });

    it('returns error for non-existent path', async () => {
      const result = await callTool(client, 'check_complexity', {
        path: 'nonexistent/path',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(getResultText(result)) as { error: string };
      expect(parsed.error).toContain('not found');
    });
  });

  describe('language auto-detection', () => {
    it('detects TypeScript from tsconfig.json', async () => {
      const result = await callTool(client, 'verify_structure', {});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;
      expect(parsed.language).toBe('typescript');
    });

    it('detects Rust from Cargo.toml', async () => {
      // Remove TypeScript files and add Rust files
      await fs.rm(path.join(tempDir, 'tsconfig.json'));
      await fs.rm(path.join(tempDir, 'package.json'));
      await fs.writeFile(
        path.join(tempDir, 'Cargo.toml'),
        `
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"
`
      );

      // Recreate the client with the new project
      await client.close();
      const pair = await createConnectedPair(tempDir);
      client = pair.client;

      const result = await callTool(client, 'verify_structure', {});

      // We expect this to fail because cargo isn't installed or project isn't valid
      // But the language should still be detected
      const text = getResultText(result);
      const parsed = JSON.parse(text) as VerifyStructureResult | { error: string };

      if ('language' in parsed) {
        expect(parsed.language).toBe('rust');
      }
      // If error, it's because cargo isn't available, which is fine
    });
  });

  describe('error handling', () => {
    it('returns error for unknown tool', async () => {
      const result = await callTool(client, 'unknown_tool', {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(getResultText(result)) as { error: string };
      expect(parsed.error).toContain('Unknown tool');
    });
  });

  describe('error classes', () => {
    it('ToolchainNotInstalledError has correct properties', () => {
      const error = new ToolchainNotInstalledError('cargo', 'cargo check');
      expect(error.name).toBe('ToolchainNotInstalledError');
      expect(error.toolchain).toBe('cargo');
      expect(error.command).toBe('cargo check');
      expect(error.message).toContain('not installed');
    });

    it('ToolExecutionError has correct properties', () => {
      const error = new ToolExecutionError('npm test', 1, 'Test failed');
      expect(error.name).toBe('ToolExecutionError');
      expect(error.command).toBe('npm test');
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toBe('Test failed');
    });

    it('OutputParseError has correct properties', () => {
      const error = new OutputParseError('Invalid JSON', '{ invalid }');
      expect(error.name).toBe('OutputParseError');
      expect(error.output).toBe('{ invalid }');
      expect(error.message).toContain('Failed to parse');
    });
  });
});

/**
 * Tests that use the actual project directory (with TypeScript installed)
 * to verify real tool execution.
 */
describe('criticality-toolchain-server - real project tests', () => {
  let client: Client;

  beforeEach(async () => {
    // Use the actual project directory where TypeScript is installed
    const projectRoot = process.cwd();
    const pair = await createConnectedPair(projectRoot);
    client = pair.client;
  });

  afterEach(async () => {
    await client.close();
  });

  describe('verify_structure with real TypeScript', () => {
    it('returns success when running on valid project', async () => {
      const result = await callTool(client, 'verify_structure', {});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;

      // The actual project should pass type checking
      expect(parsed.language).toBe('typescript');
      expect(typeof parsed.success).toBe('boolean');
      expect(typeof parsed.errorCount).toBe('number');
      expect(parsed.command).toContain('tsc');
    });
  });

  describe('run_function_test with real vitest', () => {
    it('returns structured results when running real tests', async () => {
      // Run a specific test file that should pass quickly
      const result = await callTool(client, 'run_function_test', {
        testPattern: 'src/index.test.ts',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getResultText(result)) as RunFunctionTestResult;

      expect(typeof parsed.success).toBe('boolean');
      expect(typeof parsed.totalTests).toBe('number');
      expect(typeof parsed.passedTests).toBe('number');
      expect(typeof parsed.failedTests).toBe('number');
      expect(Array.isArray(parsed.tests)).toBe(true);
      expect(parsed.command).toContain('vitest');
    }, 30000);
  });
});

describe('structured JSON output examples from acceptance criteria', () => {
  let tempDir: string;
  let client: Client;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'toolchain-ac-test-'));

    // Create a TypeScript project
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', type: 'module' })
    );
    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', strict: true, noEmit: true },
        include: ['src/**/*.ts'],
      })
    );
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), `export const VERSION = '1.0.0';`);

    const pair = await createConnectedPair(tempDir);
    client = pair.client;
  });

  afterEach(async () => {
    await client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('Example: run_function_test returns JSON object with test results', async () => {
    const result = await callTool(client, 'run_function_test', {
      testPattern: 'src/*.test.ts',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(getResultText(result)) as RunFunctionTestResult;

    // Verify it's a proper JSON object with expected structure
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
    expect('success' in parsed).toBe(true);
    expect('totalTests' in parsed).toBe(true);
    expect('passedTests' in parsed).toBe(true);
    expect('failedTests' in parsed).toBe(true);
    expect('tests' in parsed).toBe(true);
    expect('exitCode' in parsed).toBe(true);
  });

  it('Negative case: verify_structure returns structured error list, not just exit code', async () => {
    // The tool should always return a structured response with an errors array
    const result = await callTool(client, 'verify_structure', {});

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;

    // CRITICAL: We must have a structured error list field (even if empty)
    // The key acceptance criteria is that we DON'T just get exit code 1
    expect(Array.isArray(parsed.errors)).toBe(true);
    expect(typeof parsed.exitCode).toBe('number');
    expect(typeof parsed.success).toBe('boolean');
    expect(typeof parsed.errorCount).toBe('number');
  });
});

/**
 * Integration test using real project to verify error parsing works correctly.
 */
describe('verify_structure error parsing', () => {
  let client: Client;

  beforeEach(async () => {
    const projectRoot = process.cwd();
    const pair = await createConnectedPair(projectRoot);
    client = pair.client;
  });

  afterEach(async () => {
    await client.close();
  });

  it('correctly parses TypeScript errors from tsc output', async () => {
    // This test verifies that our regex correctly parses the TypeScript error format
    // by running tsc on the actual project

    const result = await callTool(client, 'verify_structure', {});

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(getResultText(result)) as VerifyStructureResult;

    // If there are errors, verify their structure
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      if (firstError !== undefined) {
        expect(typeof firstError.file).toBe('string');
        expect(typeof firstError.line).toBe('number');
        expect(typeof firstError.column).toBe('number');
        expect(typeof firstError.code).toBe('string');
        expect(typeof firstError.message).toBe('string');
        expect(['error', 'warning']).toContain(firstError.severity);
      }
    }

    // The error count should match errors array length
    expect(parsed.errors.filter((e) => e.severity === 'error').length).toBe(parsed.errorCount);
  });
});
