/**
 * Tests for ClaudeCodeClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Config } from '../config/types.js';
import type { ModelAlias, ModelRouterRequest } from './types.js';
import { MODEL_ALIASES } from './types.js';

// Mock execa before importing the module under test
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Import after mocking
import { execa } from 'execa';
import {
  ClaudeCodeClient,
  ClaudeCodeNotInstalledError,
  checkClaudeCodeInstalled,
  createClaudeCodeClient,
} from './claude-code-client.js';

const mockExeca = vi.mocked(execa);

/**
 * Creates a mock Config for testing.
 */
function createTestConfig(): Config {
  return {
    models: {
      architect_model: 'claude-opus-4.5',
      auditor_model: 'claude-sonnet-4',
      structurer_model: 'claude-sonnet-4',
      worker_model: 'claude-haiku-3.5',
      fallback_model: 'claude-sonnet-4',
    },
    paths: {
      specs: './specs',
      archive: './archive',
      state: './state.json',
      logs: './logs',
      ledger: './ledger',
    },
    thresholds: {
      context_token_upgrade: 12000,
      signature_complexity_upgrade: 5,
      max_retry_attempts: 3,
      retry_base_delay_ms: 1000,
      performance_variance_threshold: 0.2,
    },
    notifications: {
      enabled: false,
    },
    mass_defect: {
      targets: {
        max_cyclomatic_complexity: 10,
        max_function_length_lines: 50,
        max_nesting_depth: 4,
        min_test_coverage: 0.8,
      },
      catalog_path: './mass-defect-catalog',
    },
    cli: {
      colors: true,
      watch_interval: 2000,
      unicode: true,
    },
  };
}

/**
 * Creates mock JSON output from Claude Code.
 */
function createMockClaudeOutput(
  content: string,
  options: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    durationMs?: number;
    isError?: boolean;
  } = {}
): string {
  const {
    inputTokens = 10,
    outputTokens = 5,
    model = 'claude-haiku-3.5',
    durationMs = 1000,
    isError = false,
  } = options;

  const initMsg = JSON.stringify({
    type: 'system',
    subtype: 'init',
    cwd: '/test',
    session_id: 'test-session',
  });

  const assistantMsg = JSON.stringify({
    type: 'assistant',
    message: {
      model,
      content: [{ type: 'text', text: content }],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    },
    session_id: 'test-session',
  });

  const resultMsg = JSON.stringify({
    type: 'result',
    subtype: isError ? 'error' : 'success',
    is_error: isError,
    duration_ms: durationMs,
    result: content,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    session_id: 'test-session',
  });

  return `${initMsg}\n${assistantMsg}\n${resultMsg}`;
}

/**
 * Creates a mock execa result object
 */
function createMockExecaResult(options: {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed?: boolean;
  timedOut?: boolean;
  killed?: boolean;
  command?: string;
}): Awaited<ReturnType<typeof execa>> {
  return {
    exitCode: options.exitCode,
    stdout: options.stdout,
    stderr: options.stderr,
    failed: options.failed ?? false,
    timedOut: options.timedOut ?? false,
    killed: options.killed ?? false,
    command: options.command ?? 'claude',
    escapedCommand: options.command ?? 'claude',
    all: options.stdout + options.stderr,
    stdio: [null, options.stdout, options.stderr],
    ipcOutput: [],
    pipedFrom: [],
  } as unknown as Awaited<ReturnType<typeof execa>>;
}

describe('checkClaudeCodeInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when Claude Code is installed', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'claude 2.0.0',
        stderr: '',
      })
    );

    const result = await checkClaudeCodeInstalled();
    expect(result).toBe(true);
  });

  it('should throw ClaudeCodeNotInstalledError when command not found', async () => {
    const error = new Error('spawn claude ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(error);

    const promise = checkClaudeCodeInstalled();
    await expect(promise).rejects.toThrow(ClaudeCodeNotInstalledError);
    await expect(promise).rejects.toThrow(/not found/i);
  });

  it('should throw ClaudeCodeNotInstalledError when exit code is non-zero', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: some error',
        failed: true,
      })
    );

    const promise = checkClaudeCodeInstalled();
    await expect(promise).rejects.toThrow(ClaudeCodeNotInstalledError);
    await expect(promise).rejects.toThrow(/non-zero exit code/i);
  });

  it('should use custom executable path', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'claude 2.0.0',
        stderr: '',
        command: '/custom/path/claude --version',
      })
    );

    await checkClaudeCodeInstalled('/custom/path/claude');

    expect(mockExeca).toHaveBeenCalledWith(
      '/custom/path/claude',
      ['--version'],
      expect.any(Object)
    );
  });
});

describe('ClaudeCodeClient', () => {
  let client: ClaudeCodeClient;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestConfig();
    client = new ClaudeCodeClient({ config });
  });

  describe('prompt', () => {
    it('should send a simple prompt and receive a response', async () => {
      const mockOutput = createMockClaudeOutput('4', { inputTokens: 10, outputTokens: 1 });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('worker', 'What is 2+2?');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.content).toBe('4');
        expect(result.response.metadata.provider).toBe('claude-code');
        expect(result.response.usage.promptTokens).toBeGreaterThan(0);
      }
    });

    it('should use correct model based on alias', async () => {
      const mockOutput = createMockClaudeOutput('Hello', { model: 'claude-opus-4.5' });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.prompt('architect', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', 'claude-opus-4.5']),
        expect.any(Object)
      );
    });

    it('should return error when subprocess fails', async () => {
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 1,
          stdout: '',
          stderr: 'Error: authentication failed',
          failed: true,
        })
      );

      const result = await client.prompt('worker', 'Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.message).toContain('exit code');
      }
    });

    it('should return error when Claude Code is not installed', async () => {
      const error = new Error('spawn claude ENOENT');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      mockExeca.mockRejectedValueOnce(error);

      const result = await client.prompt('worker', 'Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('NetworkError');
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle timeout', async () => {
      const error = {
        message: 'Process timed out',
        timedOut: true,
        killed: false,
      };
      mockExeca.mockRejectedValueOnce(error);

      const result = await client.prompt('worker', 'Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.message).toContain('timed out');
      }
    });
  });

  describe('complete', () => {
    it('should send a complete request with parameters', async () => {
      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Hello',
        parameters: {
          systemPrompt: 'You are a helpful assistant.',
        },
        requestId: 'test-123',
      };

      const result = await client.complete(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.requestId).toBe('test-123');
      }

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--system-prompt', 'You are a helpful assistant.']),
        expect.any(Object)
      );
    });

    it('should include --no-session-persistence flag', async () => {
      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.complete({ modelAlias: 'worker', prompt: 'Hello' });

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--no-session-persistence']),
        expect.any(Object)
      );
    });
  });

  describe('stream', () => {
    it('should stream response chunks', async () => {
      // Create a mock readable stream
      const mockStdout = {
        *[Symbol.asyncIterator](): Generator<string, void, unknown> {
          yield JSON.stringify({
            type: 'system',
            subtype: 'init',
          }) + '\n';
          yield JSON.stringify({
            type: 'assistant',
            message: {
              model: 'claude-haiku-3.5',
              content: [{ type: 'text', text: 'Hello' }],
              usage: { input_tokens: 10, output_tokens: 2 },
            },
          }) + '\n';
          yield JSON.stringify({
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: ' World' }],
              usage: { input_tokens: 10, output_tokens: 4 },
            },
          }) + '\n';
          yield JSON.stringify({
            type: 'result',
            duration_ms: 1500,
            usage: { input_tokens: 10, output_tokens: 4 },
          }) + '\n';
        },
      };

      const mockProcess = {
        stdout: mockStdout,
        then: (resolve: (value: unknown) => void): void => {
          resolve({
            exitCode: 0,
            stdout: '',
            stderr: '',
          });
        },
      };

      mockExeca.mockReturnValueOnce(mockProcess as unknown as ReturnType<typeof execa>);

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Say hello world',
      };

      const chunks: unknown[] = [];
      const generator = client.stream(request);

      for await (const chunk of generator) {
        chunks.push(chunk);
        if ((chunk as { done: boolean }).done) {
          break;
        }
      }

      // Should have received streaming chunks plus done chunk
      expect(chunks.length).toBeGreaterThan(0);
      const doneChunk = chunks.find((c) => (c as { done: boolean }).done);
      expect(doneChunk).toBeDefined();
    });

    it('should use stream-json output format', async () => {
      const mockStdout = {
        *[Symbol.asyncIterator](): Generator<string, void, unknown> {
          yield JSON.stringify({ type: 'result', usage: {} }) + '\n';
        },
      };

      const mockProcess = {
        stdout: mockStdout,
        then: (resolve: (value: unknown) => void): void => {
          resolve({
            exitCode: 0,
            stdout: '',
            stderr: '',
          });
        },
      };

      mockExeca.mockReturnValueOnce(mockProcess as unknown as ReturnType<typeof execa>);

      const generator = client.stream({ modelAlias: 'worker', prompt: 'Hi' });

      // Consume the generator
      for await (const chunk of generator) {
        if ((chunk as { done: boolean }).done) {
          break;
        }
      }

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--output-format', 'stream-json']),
        expect.any(Object)
      );
    });
  });

  describe('model alias resolution', () => {
    it.each(MODEL_ALIASES)('should resolve model alias %s correctly', async (alias) => {
      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const aliasToConfig: Record<ModelAlias, keyof Config['models']> = {
        architect: 'architect_model',
        auditor: 'auditor_model',
        structurer: 'structurer_model',
        worker: 'worker_model',
        fallback: 'fallback_model',
      };

      await client.prompt(alias, 'Hello');

      // eslint-disable-next-line security/detect-object-injection -- safe: alias comes from each loop over controlled test data
      const expectedModel = config.models[aliasToConfig[alias]];
      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', expectedModel]),
        expect.any(Object)
      );
    });
  });

  describe('custom options', () => {
    it('should use custom executable path', async () => {
      const customClient = new ClaudeCodeClient({
        config,
        executablePath: '/custom/bin/claude',
      });

      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
          command: '/custom/bin/claude',
        })
      );

      await customClient.prompt('worker', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        '/custom/bin/claude',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should include additional flags', async () => {
      const customClient = new ClaudeCodeClient({
        config,
        additionalFlags: ['--verbose', '--debug'],
      });

      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('worker', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--verbose', '--debug']),
        expect.any(Object)
      );
    });

    it('should pass custom working directory', async () => {
      const customClient = new ClaudeCodeClient({
        config,
        cwd: '/custom/workdir',
      });

      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('worker', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ cwd: '/custom/workdir' })
      );
    });

    it('should use custom timeout', async () => {
      const customClient = new ClaudeCodeClient({
        config,
        timeoutMs: 60000,
      });

      const mockOutput = createMockClaudeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('worker', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ timeout: 60000 })
      );
    });
  });

  describe('usage information', () => {
    it('should capture token usage from response', async () => {
      const mockOutput = createMockClaudeOutput('Response', {
        inputTokens: 100,
        outputTokens: 50,
      });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('worker', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.usage.promptTokens).toBe(100);
        expect(result.response.usage.completionTokens).toBe(50);
        expect(result.response.usage.totalTokens).toBe(150);
      }
    });

    it('should capture latency from response', async () => {
      const mockOutput = createMockClaudeOutput('Response', {
        durationMs: 2500,
      });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('worker', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.metadata.latencyMs).toBe(2500);
      }
    });
  });
});

describe('createClaudeCodeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create client when Claude Code is installed', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'claude 2.0.0',
        stderr: '',
        command: 'claude --version',
      })
    );

    const client = await createClaudeCodeClient({ config: createTestConfig() });

    expect(client).toBeInstanceOf(ClaudeCodeClient);
  });

  it('should throw when Claude Code is not installed', async () => {
    const error = new Error('spawn claude ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(error);

    await expect(createClaudeCodeClient({ config: createTestConfig() })).rejects.toThrow(
      ClaudeCodeNotInstalledError
    );
  });
});

describe('ClaudeCodeClient property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle arbitrary prompts without crashing', async () => {
    const config = createTestConfig();
    const client = new ClaudeCodeClient({ config });

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 1000 }), async (prompt) => {
        const mockOutput = createMockClaudeOutput('Response');
        mockExeca.mockResolvedValueOnce(
          createMockExecaResult({
            exitCode: 0,
            stdout: mockOutput,
            stderr: '',
          })
        );

        const result = await client.prompt('worker', prompt);

        // Should always return a valid result (success or failure)
        expect(result).toHaveProperty('success');
        if (result.success) {
          expect(result.response).toHaveProperty('content');
          expect(result.response).toHaveProperty('usage');
          expect(result.response).toHaveProperty('metadata');
        } else {
          expect(result.error).toHaveProperty('kind');
          expect(result.error).toHaveProperty('message');
        }
      }),
      { numRuns: 20 }
    );
  });

  it('should preserve requestId when provided', async () => {
    const config = createTestConfig();
    const client = new ClaudeCodeClient({ config });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        async (requestId) => {
          const mockOutput = createMockClaudeOutput('Response');
          mockExeca.mockResolvedValueOnce(
            createMockExecaResult({
              exitCode: 0,
              stdout: mockOutput,
              stderr: '',
            })
          );

          const result = await client.complete({
            modelAlias: 'worker',
            prompt: 'Hello',
            requestId,
          });

          if (result.success) {
            expect(result.response.requestId).toBe(requestId);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

describe('ClaudeCodeNotInstalledError', () => {
  it('should have correct error code', () => {
    const error = new ClaudeCodeNotInstalledError('Test message');
    expect(error.code).toBe('CLAUDE_CODE_NOT_INSTALLED');
    expect(error.name).toBe('ClaudeCodeNotInstalledError');
    expect(error.message).toBe('Test message');
  });

  it('should preserve cause when provided', () => {
    const cause = new Error('Original error');
    const error = new ClaudeCodeNotInstalledError('Wrapper message', cause);
    expect(error.cause).toBe(cause);
  });
});
