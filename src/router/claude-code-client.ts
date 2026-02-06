/**
 * Claude Code CLI client for the Criticality Protocol.
 *
 * Implements the ModelRouter interface using Claude Code CLI as the backend.
 * Spawns subprocesses to execute Claude Code commands and parses the JSON output.
 *
 * @packageDocumentation
 */

import { TypedMap } from '../utils/typed-map.js';
import { execa, type ExecaError } from 'execa';
import type { Config } from '../config/types.js';
import type {
  ModelAlias,
  ModelRouter,
  ModelRouterRequest,
  ModelRouterResult,
  ModelRouterResponse,
  ModelUsage,
  ModelMetadata,
  StreamChunk,
} from './types.js';
import {
  createModelError,
  createNetworkError,
  createSuccessResult,
  createFailureResult,
} from './types.js';

/**
 * Options for creating a ClaudeCodeClient.
 */
export interface ClaudeCodeClientOptions {
  /** Configuration for model aliases. */
  config: Config;
  /** Path to the claude executable (default: 'claude'). */
  executablePath?: string;
  /** Additional CLI flags to pass to every invocation. */
  additionalFlags?: readonly string[];
  /** Timeout in milliseconds for requests (default: 300000 = 5 minutes). */
  timeoutMs?: number;
  /** Working directory for subprocess execution. */
  cwd?: string;
}

/**
 * Represents the structure of Claude Code JSON output.
 */
interface ClaudeCodeJsonMessage {
  type: 'system' | 'assistant' | 'result';
  subtype?: string;
  message?: {
    content: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    model?: string;
  };
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  is_error?: boolean;
  session_id?: string;
}

/**
 * Error thrown when Claude Code CLI is not installed or not accessible.
 */
export class ClaudeCodeNotInstalledError extends Error {
  readonly code = 'CLAUDE_CODE_NOT_INSTALLED';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ClaudeCodeNotInstalledError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Checks if Claude Code CLI is installed and accessible.
 *
 * @param executablePath - Path to the claude executable.
 * @returns True if Claude Code is available.
 * @throws ClaudeCodeNotInstalledError if not installed.
 */
export async function checkClaudeCodeInstalled(executablePath = 'claude'): Promise<boolean> {
  try {
    const result = await execa(executablePath, ['--version'], {
      timeout: 10000,
      reject: false,
    });

    if (result.exitCode !== 0) {
      throw new ClaudeCodeNotInstalledError(
        `Claude Code CLI returned non-zero exit code: ${String(result.exitCode)}. ` +
          `Stderr: ${result.stderr || '(empty)'}`
      );
    }

    return true;
  } catch (error) {
    if (error instanceof ClaudeCodeNotInstalledError) {
      throw error;
    }

    const execaError = error as ExecaError;
    if (execaError.code === 'ENOENT') {
      throw new ClaudeCodeNotInstalledError(
        `Claude Code CLI not found at '${executablePath}'. ` +
          `Please install Claude Code: https://claude.ai/download`,
        execaError
      );
    }

    throw new ClaudeCodeNotInstalledError(
      `Failed to check Claude Code installation: ${execaError.message || String(error)}`,
      execaError
    );
  }
}

const MODEL_ALIAS_MAP = TypedMap.fromObject({
  architect: 'architect_model',
  auditor: 'auditor_model',
  structurer: 'structurer_model',
  worker: 'worker_model',
  fallback: 'fallback_model',
});

/**
 * Resolves a model alias to the actual model identifier.
 *
 * @param alias - The model alias to resolve.
 * @param config - Configuration containing model assignments.
 * @returns The resolved model identifier.
 */
function resolveModelAlias(alias: ModelAlias, config: Config): string {
  const configKey = MODEL_ALIAS_MAP.get(alias) ?? 'architect_model';
  return config.models[configKey as keyof Config['models']];
}

/**
 * Parses Claude Code JSON output to extract the response.
 *
 * @param output - The raw JSON output from Claude Code.
 * @returns Parsed response content, usage, and metadata.
 */
function parseClaudeCodeOutput(output: string): {
  content: string;
  usage: ModelUsage;
  metadata: Partial<ModelMetadata>;
} {
  const lines = output.trim().split('\n');
  let content = '';
  let usage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let latencyMs = 0;
  let modelId = '';

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as ClaudeCodeJsonMessage;

      // Extract content from assistant messages
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const contentBlock of parsed.message.content) {
          if (contentBlock.type === 'text' && contentBlock.text !== undefined) {
            content += contentBlock.text;
          }
        }
        // Extract model from message
        if (parsed.message.model !== undefined && parsed.message.model !== '') {
          modelId = parsed.message.model;
        }
        // Extract usage from message
        if (parsed.message.usage) {
          const msgUsage = parsed.message.usage;
          usage = {
            promptTokens:
              (msgUsage.input_tokens ?? 0) +
              (msgUsage.cache_read_input_tokens ?? 0) +
              (msgUsage.cache_creation_input_tokens ?? 0),
            completionTokens: msgUsage.output_tokens ?? 0,
            totalTokens:
              (msgUsage.input_tokens ?? 0) +
              (msgUsage.cache_read_input_tokens ?? 0) +
              (msgUsage.cache_creation_input_tokens ?? 0) +
              (msgUsage.output_tokens ?? 0),
          };
        }
      }

      // Extract result summary (may override content if present)
      if (parsed.type === 'result') {
        if (parsed.result !== undefined && !content) {
          content = parsed.result;
        }
        if (parsed.duration_ms !== undefined) {
          latencyMs = parsed.duration_ms;
        }
        // Override with result-level usage if available
        if (parsed.usage) {
          const resultUsage = parsed.usage;
          usage = {
            promptTokens:
              (resultUsage.input_tokens ?? 0) +
              (resultUsage.cache_read_input_tokens ?? 0) +
              (resultUsage.cache_creation_input_tokens ?? 0),
            completionTokens: resultUsage.output_tokens ?? 0,
            totalTokens:
              (resultUsage.input_tokens ?? 0) +
              (resultUsage.cache_read_input_tokens ?? 0) +
              (resultUsage.cache_creation_input_tokens ?? 0) +
              (resultUsage.output_tokens ?? 0),
          };
        }
      }
    } catch {
      // Skip lines that aren't valid JSON
      continue;
    }
  }

  return {
    content,
    usage,
    metadata: {
      modelId: modelId || 'unknown',
      latencyMs,
    },
  };
}

/**
 * Claude Code CLI client implementing the ModelRouter interface.
 *
 * @example
 * ```typescript
 * const client = new ClaudeCodeClient({ config });
 * const result = await client.prompt('worker', 'What is 2+2?');
 * if (result.success) {
 *   console.log(result.response.content);
 * }
 * ```
 */
export class ClaudeCodeClient implements ModelRouter {
  private readonly config: Config;
  private readonly executablePath: string;
  private readonly additionalFlags: readonly string[];
  private readonly timeoutMs: number;
  private readonly cwd: string | undefined;

  /**
   * Creates a new ClaudeCodeClient.
   *
   * @param options - Client configuration options.
   */
  constructor(options: ClaudeCodeClientOptions) {
    this.config = options.config;
    this.executablePath = options.executablePath ?? 'claude';
    this.additionalFlags = options.additionalFlags ?? [];
    this.timeoutMs = options.timeoutMs ?? 300000; // 5 minutes
    this.cwd = options.cwd;
  }

  /**
   * Builds CLI arguments for a request.
   *
   * @param request - The model router request.
   * @returns Array of CLI arguments.
   */
  private buildArgs(request: ModelRouterRequest): string[] {
    const modelId = resolveModelAlias(request.modelAlias, this.config);

    const args: string[] = [
      '-p', // Print mode (non-interactive)
      '--output-format',
      'json',
      '--model',
      modelId,
      '--no-session-persistence', // Don't persist sessions
      ...this.additionalFlags,
    ];

    // Add system prompt if provided
    if (request.parameters?.systemPrompt !== undefined && request.parameters.systemPrompt !== '') {
      args.push('--system-prompt', request.parameters.systemPrompt);
    }

    // Add max tokens if provided
    // Note: Claude Code CLI uses --max-budget-usd for cost limits, not token limits
    // The model handles max tokens internally based on model capabilities

    // Add the prompt as the final positional argument
    args.push(request.prompt);

    return args;
  }

  /**
   * Executes a Claude Code subprocess and returns result.
   *
   * @param args - CLI arguments.
   * @param request - The original request (for error context).
   * @param requestTimeoutMs - Optional timeout in milliseconds for this request.
   * @returns The parsed model router result.
   */
  private async executeSubprocess(
    args: string[],
    request: ModelRouterRequest,
    requestTimeoutMs?: number
  ): Promise<ModelRouterResult> {
    const startTime = Date.now();

    try {
      const result =
        this.cwd !== undefined
          ? await execa(this.executablePath, args, {
              timeout: requestTimeoutMs ?? this.timeoutMs,
              reject: false,
              cwd: this.cwd,
            })
          : await execa(this.executablePath, args, {
              timeout: requestTimeoutMs ?? this.timeoutMs,
              reject: false,
            });

      if (result.exitCode !== 0) {
        // Check if it's a command not found error
        const stderrStr = result.stderr;
        if (stderrStr.includes('command not found') || stderrStr.includes('ENOENT')) {
          return createFailureResult(
            createModelError(
              `Claude Code CLI not found: ${stderrStr || 'command not found'}`,
              false,
              { errorCode: 'CLAUDE_CODE_NOT_FOUND', request }
            )
          );
        }

        return createFailureResult(
          createModelError(
            `Claude Code execution failed with exit code ${String(result.exitCode)}`,
            true,
            {
              errorCode: `EXIT_${String(result.exitCode)}`,
              request,
            }
          )
        );
      }

      const parsed = parseClaudeCodeOutput(result.stdout);
      const endTime = Date.now();

      const response: ModelRouterResponse = {
        content: parsed.content,
        usage: parsed.usage,
        metadata: {
          modelId: parsed.metadata.modelId ?? 'unknown',
          provider: 'claude-code',
          latencyMs: parsed.metadata.latencyMs ?? endTime - startTime,
        },
      };

      if (request.requestId !== undefined) {
        return createSuccessResult({ ...response, requestId: request.requestId });
      }

      return createSuccessResult(response);
    } catch (error) {
      const execaError = error as ExecaError;

      // Handle timeout
      if (execaError.timedOut) {
        return createFailureResult(
          createModelError(`Request timed out after ${String(this.timeoutMs)}ms`, true, {
            errorCode: 'TIMEOUT',
            request,
          })
        );
      }

      // Handle network/process errors
      if (execaError.code === 'ENOENT') {
        return createFailureResult(
          createNetworkError(
            `Claude Code CLI not found at '${this.executablePath}'. Please install Claude Code.`,
            { endpoint: this.executablePath, request }
          )
        );
      }

      return createFailureResult(
        createModelError(
          `Subprocess execution failed: ${execaError.message || String(error)}`,
          true,
          {
            request,
          }
        )
      );
    }
  }

  /**
   * Send a simple prompt to a model.
   *
   * @param modelAlias - The model alias to route to.
   * @param prompt - The prompt text.
   * @param timeoutMs - Optional timeout in milliseconds for this request.
   * @returns A result containing the response or an error.
   */
  async prompt(
    modelAlias: ModelAlias,
    prompt: string,
    timeoutMs?: number
  ): Promise<ModelRouterResult> {
    const request: ModelRouterRequest = { modelAlias, prompt };
    const args = this.buildArgs(request);
    return this.executeSubprocess(args, request, timeoutMs);
  }

  /**
   * Send a complete request with parameters.
   *
   * @param request - The full request with model alias, prompt, and parameters.
   * @returns A result containing the response or an error.
   */
  async complete(request: ModelRouterRequest): Promise<ModelRouterResult> {
    const args = this.buildArgs(request);
    return this.executeSubprocess(args, request);
  }

  /**
   * Stream a response from the model.
   *
   * @param request - The full request with model alias, prompt, and parameters.
   * @yields StreamChunk objects as they arrive.
   * @returns The final ModelRouterResult when streaming completes.
   */
  async *stream(
    request: ModelRouterRequest
  ): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
    const modelId = resolveModelAlias(request.modelAlias, this.config);
    const startTime = Date.now();

    const args: string[] = [
      '-p',
      '--output-format',
      'stream-json',
      '--model',
      modelId,
      '--no-session-persistence',
      ...this.additionalFlags,
    ];

    if (request.parameters?.systemPrompt !== undefined && request.parameters.systemPrompt !== '') {
      args.push('--system-prompt', request.parameters.systemPrompt);
    }

    args.push(request.prompt);

    const subprocess =
      this.cwd !== undefined
        ? execa(this.executablePath, args, {
            timeout: this.timeoutMs,
            reject: false,
            cwd: this.cwd,
          })
        : execa(this.executablePath, args, {
            timeout: this.timeoutMs,
            reject: false,
          });

    let fullContent = '';
    let finalUsage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let detectedModelId = modelId;
    let latencyMs = 0;

    // Buffer for incomplete lines
    let buffer = '';

    // Process stdout as it arrives
    for await (const chunk of subprocess.stdout) {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line) as ClaudeCodeJsonMessage;

          if (parsed.type === 'assistant' && parsed.message?.content) {
            for (const contentBlock of parsed.message.content) {
              if (contentBlock.type === 'text' && contentBlock.text !== undefined) {
                fullContent += contentBlock.text;
                yield {
                  content: contentBlock.text,
                  done: false,
                };
              }
            }

            if (parsed.message.model !== undefined && parsed.message.model !== '') {
              detectedModelId = parsed.message.model;
            }

            if (parsed.message.usage) {
              const msgUsage = parsed.message.usage;
              finalUsage = {
                promptTokens:
                  (msgUsage.input_tokens ?? 0) +
                  (msgUsage.cache_read_input_tokens ?? 0) +
                  (msgUsage.cache_creation_input_tokens ?? 0),
                completionTokens: msgUsage.output_tokens ?? 0,
                totalTokens:
                  (msgUsage.input_tokens ?? 0) +
                  (msgUsage.cache_read_input_tokens ?? 0) +
                  (msgUsage.cache_creation_input_tokens ?? 0) +
                  (msgUsage.output_tokens ?? 0),
              };
            }
          }

          if (parsed.type === 'result') {
            if (parsed.duration_ms !== undefined) {
              latencyMs = parsed.duration_ms;
            }
            if (parsed.usage) {
              const resultUsage = parsed.usage;
              finalUsage = {
                promptTokens:
                  (resultUsage.input_tokens ?? 0) +
                  (resultUsage.cache_read_input_tokens ?? 0) +
                  (resultUsage.cache_creation_input_tokens ?? 0),
                completionTokens: resultUsage.output_tokens ?? 0,
                totalTokens:
                  (resultUsage.input_tokens ?? 0) +
                  (resultUsage.cache_read_input_tokens ?? 0) +
                  (resultUsage.cache_creation_input_tokens ?? 0) +
                  (resultUsage.output_tokens ?? 0),
              };
            }
          }
        } catch {
          // Skip non-JSON lines
          continue;
        }
      }
    }

    // Wait for the process to complete
    const result = await subprocess;
    const endTime = Date.now();

    // Yield the final done chunk
    yield {
      content: '',
      done: true,
      usage: finalUsage,
    };

    if (result.exitCode !== 0) {
      return createFailureResult(
        createModelError(
          `Claude Code execution failed with exit code ${String(result.exitCode)}`,
          true,
          {
            errorCode: `EXIT_${String(result.exitCode)}`,
            request,
          }
        )
      );
    }

    const response: ModelRouterResponse = {
      content: fullContent,
      usage: finalUsage,
      metadata: {
        modelId: detectedModelId,
        provider: 'claude-code',
        latencyMs: latencyMs || endTime - startTime,
      },
    };

    if (request.requestId !== undefined) {
      return createSuccessResult({ ...response, requestId: request.requestId });
    }

    return createSuccessResult(response);
  }
}

/**
 * Creates a Claude Code client with installation check.
 *
 * @param options - Client configuration options.
 * @returns A configured ClaudeCodeClient.
 * @throws ClaudeCodeNotInstalledError if Claude Code is not installed.
 *
 * @example
 * ```typescript
 * try {
 *   const client = await createClaudeCodeClient({ config });
 *   const result = await client.prompt('worker', 'Hello!');
 * } catch (error) {
 *   if (error instanceof ClaudeCodeNotInstalledError) {
 *     console.error('Please install Claude Code first.');
 *   }
 * }
 * ```
 */
export async function createClaudeCodeClient(
  options: ClaudeCodeClientOptions
): Promise<ClaudeCodeClient> {
  await checkClaudeCodeInstalled(options.executablePath);
  return new ClaudeCodeClient(options);
}
