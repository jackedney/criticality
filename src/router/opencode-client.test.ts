/**
 * Tests for OpenCodeClient.
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
  OpenCodeClient,
  OpenCodeNotInstalledError,
  checkOpenCodeInstalled,
  createOpenCodeClient,
} from './opencode-client.js';

const mockExeca = vi.mocked(execa);

/**
 * Creates a mock Config for testing with Kimi K2 and MiniMax models.
 */
function createTestConfig(): Config {
  return {
    models: {
      architect_model: 'claude-opus-4.5',
      auditor_model: 'kimi-k2',
      structurer_model: 'minimax-m2.1',
      worker_model: 'kimi-k2-instruct',
      fallback_model: 'minimax-m2',
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
  };
}

/**
 * Creates mock JSON output from OpenCode.
 */
function createMockOpenCodeOutput(
  content: string,
  options: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    provider?: string;
    durationMs?: number;
    isError?: boolean;
  } = {}
): string {
  const {
    inputTokens = 10,
    outputTokens = 5,
    model = 'kimi-k2',
    provider = 'moonshot',
    durationMs = 1000,
    isError = false,
  } = options;

  return JSON.stringify({
    content,
    model,
    provider,
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
    duration_ms: durationMs,
    is_error: isError,
  });
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
    command: options.command ?? 'opencode',
    escapedCommand: options.command ?? 'opencode',
    all: options.stdout + options.stderr,
    stdio: [null, options.stdout, options.stderr],
    ipcOutput: [],
    pipedFrom: [],
  } as unknown as Awaited<ReturnType<typeof execa>>;
}

describe('checkOpenCodeInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when OpenCode is installed', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'opencode 0.5.0',
        stderr: '',
      })
    );

    const result = await checkOpenCodeInstalled();
    expect(result).toBe(true);
  });

  it('should throw OpenCodeNotInstalledError when command not found', async () => {
    const error = new Error('spawn opencode ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(error);

    const promise = checkOpenCodeInstalled();
    await expect(promise).rejects.toThrow(OpenCodeNotInstalledError);
    await expect(promise).rejects.toThrow(/not found/i);
  });

  it('should throw OpenCodeNotInstalledError when exit code is non-zero', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: some error',
        failed: true,
      })
    );

    const promise = checkOpenCodeInstalled();
    await expect(promise).rejects.toThrow(OpenCodeNotInstalledError);
    await expect(promise).rejects.toThrow(/non-zero exit code/i);
  });

  it('should use custom executable path', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'opencode 0.5.0',
        stderr: '',
        command: '/custom/path/opencode --version',
      })
    );

    await checkOpenCodeInstalled('/custom/path/opencode');

    expect(mockExeca).toHaveBeenCalledWith(
      '/custom/path/opencode',
      ['--version'],
      expect.any(Object)
    );
  });
});

describe('OpenCodeClient', () => {
  let client: OpenCodeClient;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestConfig();
    client = new OpenCodeClient({ config });
  });

  describe('prompt', () => {
    it('should send a simple prompt and receive a response', async () => {
      const mockOutput = createMockOpenCodeOutput('The answer is 4', {
        inputTokens: 10,
        outputTokens: 5,
      });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('auditor', 'What is 2+2?');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.content).toBe('The answer is 4');
        expect(result.response.metadata.provider).toBe('opencode');
        expect(result.response.usage.promptTokens).toBeGreaterThan(0);
      }
    });

    it('should route to Kimi K2 model correctly', async () => {
      const mockOutput = createMockOpenCodeOutput('Response', { model: 'kimi-k2' });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'moonshot/kimi-k2']),
        expect.any(Object)
      );
    });

    it('should route to MiniMax model correctly', async () => {
      const mockOutput = createMockOpenCodeOutput('Response', { model: 'minimax-m2.1' });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.prompt('structurer', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'minimax/minimax-m2.1']),
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

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.message).toContain('exit code');
      }
    });

    it('should return error when OpenCode is not installed', async () => {
      const error = new Error('spawn opencode ENOENT');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      mockExeca.mockRejectedValueOnce(error);

      const result = await client.prompt('auditor', 'Hello');

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

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.kind).toBe('ModelError');
        expect(result.error.message).toContain('timed out');
      }
    });
  });

  describe('complete', () => {
    it('should send a complete request with parameters', async () => {
      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const request: ModelRouterRequest = {
        modelAlias: 'auditor',
        prompt: 'Hello',
        requestId: 'test-123',
      };

      const result = await client.complete(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.requestId).toBe('test-123');
      }
    });

    it('should use run command for non-interactive mode', async () => {
      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.complete({ modelAlias: 'auditor', prompt: 'Hello' });

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run']),
        expect.any(Object)
      );
    });

    it('should include --format json flag', async () => {
      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await client.complete({ modelAlias: 'auditor', prompt: 'Hello' });

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--format', 'json']),
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
            content: 'Hello',
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }) + '\n';
          yield JSON.stringify({
            content: ' World',
            usage: { prompt_tokens: 10, completion_tokens: 4 },
          }) + '\n';
          yield JSON.stringify({
            duration_ms: 1500,
            usage: { prompt_tokens: 10, completion_tokens: 4 },
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
        modelAlias: 'auditor',
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

    it('should use json format for streaming', async () => {
      const mockStdout = {
        *[Symbol.asyncIterator](): Generator<string, void, unknown> {
          yield JSON.stringify({ content: 'done', usage: {} }) + '\n';
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

      const generator = client.stream({ modelAlias: 'auditor', prompt: 'Hi' });

      // Consume the generator
      for await (const chunk of generator) {
        if ((chunk as { done: boolean }).done) {
          break;
        }
      }

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--format', 'json']),
        expect.any(Object)
      );
    });
  });

  describe('model alias resolution', () => {
    it.each(MODEL_ALIASES)('should resolve model alias %s correctly', async (alias) => {
      const mockOutput = createMockOpenCodeOutput('Response');
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

      // Get the expected model from config
      // eslint-disable-next-line security/detect-object-injection -- safe: alias is typed as ModelAlias with known literal keys
      const configModel = config.models[aliasToConfig[alias]];
      // Check that --model was called with some value (the model gets transformed)
      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model']),
        expect.any(Object)
      );
      // Verify the model was in the call
      const callArgs = mockExeca.mock.calls[0]?.[1] as string[] | undefined;
      if (callArgs !== undefined) {
        const modelIndex = callArgs.indexOf('--model');
        if (modelIndex >= 0) {
          const actualModel = callArgs[modelIndex + 1];
          // The model should either be the original or include the config model name
          expect(actualModel).toContain(configModel.replace('claude-', ''));
        }
      }
    });
  });

  describe('model formatting', () => {
    it('should format kimi-k2 as moonshot/kimi-k2', async () => {
      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      // auditor_model is 'kimi-k2'
      await client.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'moonshot/kimi-k2']),
        expect.any(Object)
      );
    });

    it('should format minimax models correctly', async () => {
      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      // structurer_model is 'minimax-m2.1'
      await client.prompt('structurer', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'minimax/minimax-m2.1']),
        expect.any(Object)
      );
    });

    it('should pass through already formatted provider/model strings', async () => {
      const customConfig = createTestConfig();
      customConfig.models.auditor_model = 'custom-provider/custom-model';
      const customClient = new OpenCodeClient({ config: customConfig });

      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'custom-provider/custom-model']),
        expect.any(Object)
      );
    });
  });

  describe('custom options', () => {
    it('should use custom executable path', async () => {
      const customClient = new OpenCodeClient({
        config,
        executablePath: '/custom/bin/opencode',
      });

      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
          command: '/custom/bin/opencode',
        })
      );

      await customClient.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        '/custom/bin/opencode',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should include additional flags', async () => {
      const customClient = new OpenCodeClient({
        config,
        additionalFlags: ['--verbose', '--debug'],
      });

      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--verbose', '--debug']),
        expect.any(Object)
      );
    });

    it('should pass custom working directory', async () => {
      const customClient = new OpenCodeClient({
        config,
        cwd: '/custom/workdir',
      });

      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.any(Array),
        expect.objectContaining({ cwd: '/custom/workdir' })
      );
    });

    it('should use custom timeout', async () => {
      const customClient = new OpenCodeClient({
        config,
        timeoutMs: 60000,
      });

      const mockOutput = createMockOpenCodeOutput('Response');
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      await customClient.prompt('auditor', 'Hello');

      expect(mockExeca).toHaveBeenCalledWith(
        'opencode',
        expect.any(Array),
        expect.objectContaining({ timeout: 60000 })
      );
    });
  });

  describe('usage information', () => {
    it('should capture token usage from response', async () => {
      const mockOutput = createMockOpenCodeOutput('Response', {
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

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.usage.promptTokens).toBe(100);
        expect(result.response.usage.completionTokens).toBe(50);
        expect(result.response.usage.totalTokens).toBe(150);
      }
    });

    it('should capture latency from response', async () => {
      const mockOutput = createMockOpenCodeOutput('Response', {
        durationMs: 2500,
      });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.metadata.latencyMs).toBe(2500);
      }
    });

    it('should handle alternative usage field names', async () => {
      // OpenCode may use input_tokens/output_tokens instead of prompt_tokens/completion_tokens
      const mockOutput = JSON.stringify({
        content: 'Response',
        model: 'kimi-k2',
        usage: {
          input_tokens: 75,
          output_tokens: 25,
        },
        duration_ms: 1000,
      });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.usage.promptTokens).toBe(75);
        expect(result.response.usage.completionTokens).toBe(25);
        expect(result.response.usage.totalTokens).toBe(100);
      }
    });
  });

  describe('output parsing', () => {
    it('should handle various content field names', async () => {
      // Test with 'result' field
      const mockOutput1 = JSON.stringify({ result: 'From result', usage: {} });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput1,
          stderr: '',
        })
      );

      const result1 = await client.prompt('auditor', 'Hello');
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.response.content).toBe('From result');
      }

      // Test with 'text' field
      const mockOutput2 = JSON.stringify({ text: 'From text', usage: {} });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput2,
          stderr: '',
        })
      );

      const result2 = await client.prompt('auditor', 'Hello');
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.response.content).toBe('From text');
      }

      // Test with 'response' field
      const mockOutput3 = JSON.stringify({ response: 'From response', usage: {} });
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: mockOutput3,
          stderr: '',
        })
      );

      const result3 = await client.prompt('auditor', 'Hello');
      expect(result3.success).toBe(true);
      if (result3.success) {
        expect(result3.response.content).toBe('From response');
      }
    });

    it('should handle plain text output when JSON parsing fails', async () => {
      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: 'Plain text response',
          stderr: '',
        })
      );

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.content).toBe('Plain text response');
      }
    });

    it('should handle multi-line JSON output', async () => {
      const multiLineOutput =
        JSON.stringify({ content: 'Line 1', usage: {} }) +
        '\n' +
        JSON.stringify({ content: ' Line 2', usage: { prompt_tokens: 10, completion_tokens: 5 } });

      mockExeca.mockResolvedValueOnce(
        createMockExecaResult({
          exitCode: 0,
          stdout: multiLineOutput,
          stderr: '',
        })
      );

      const result = await client.prompt('auditor', 'Hello');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.content).toBe('Line 1 Line 2');
      }
    });
  });
});

describe('createOpenCodeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create client when OpenCode is installed', async () => {
    mockExeca.mockResolvedValueOnce(
      createMockExecaResult({
        exitCode: 0,
        stdout: 'opencode 0.5.0',
        stderr: '',
        command: 'opencode --version',
      })
    );

    const client = await createOpenCodeClient({ config: createTestConfig() });

    expect(client).toBeInstanceOf(OpenCodeClient);
  });

  it('should throw when OpenCode is not installed', async () => {
    const error = new Error('spawn opencode ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(error);

    await expect(createOpenCodeClient({ config: createTestConfig() })).rejects.toThrow(
      OpenCodeNotInstalledError
    );
  });
});

describe('OpenCodeClient property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle arbitrary prompts without crashing', async () => {
    const config = createTestConfig();
    const client = new OpenCodeClient({ config });

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 1000 }), async (prompt) => {
        const mockOutput = createMockOpenCodeOutput('Response');
        mockExeca.mockResolvedValueOnce(
          createMockExecaResult({
            exitCode: 0,
            stdout: mockOutput,
            stderr: '',
          })
        );

        const result = await client.prompt('auditor', prompt);

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
    const client = new OpenCodeClient({ config });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        async (requestId) => {
          const mockOutput = createMockOpenCodeOutput('Response');
          mockExeca.mockResolvedValueOnce(
            createMockExecaResult({
              exitCode: 0,
              stdout: mockOutput,
              stderr: '',
            })
          );

          const result = await client.complete({
            modelAlias: 'auditor',
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

describe('OpenCodeNotInstalledError', () => {
  it('should have correct error code', () => {
    const error = new OpenCodeNotInstalledError('Test message');
    expect(error.code).toBe('OPENCODE_NOT_INSTALLED');
    expect(error.name).toBe('OpenCodeNotInstalledError');
    expect(error.message).toBe('Test message');
  });

  it('should preserve cause when provided', () => {
    const cause = new Error('Original error');
    const error = new OpenCodeNotInstalledError('Wrapper message', cause);
    expect(error.cause).toBe(cause);
  });
});
