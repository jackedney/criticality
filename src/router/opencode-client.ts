/**
 * OpenCode CLI client for the Criticality Protocol.
 *
 * Implements the ModelRouter interface using OpenCode CLI as the backend.
 * Spawns subprocesses to execute OpenCode commands and parses the JSON output.
 * Supports routing to Kimi K2 and MiniMax models.
 *
 * @packageDocumentation
 */

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
 * Options for creating an OpenCodeClient.
 */
export interface OpenCodeClientOptions {
  /** Configuration for model aliases. */
  config: Config;
  /** Path to the opencode executable (default: 'opencode'). */
  executablePath?: string;
  /** Additional CLI flags to pass to every invocation. */
  additionalFlags?: readonly string[];
  /** Timeout in milliseconds for requests (default: 300000 = 5 minutes). */
  timeoutMs?: number;
  /** Working directory for subprocess execution. */
  cwd?: string;
}

/**
 * Provider prefixes for OpenCode model routing.
 * Maps model identifiers to their provider/model format.
 */
const MODEL_PROVIDER_MAP: ReadonlyMap<string, string> = new Map([
  // Kimi K2 models
  ['kimi-k2', 'moonshot/kimi-k2'],
  ['kimi-k2-instruct', 'moonshot/kimi-k2-instruct'],
  ['kimi-k2-0711', 'moonshot/kimi-k2-0711'],
  // MiniMax models
  ['minimax-m2', 'minimax/minimax-m2'],
  ['minimax-m2.1', 'minimax/minimax-m2.1'],
  ['minimax-text-01', 'minimax/minimax-text-01'],
  // Generic pass-through for already qualified names
]);

/**
 * Represents the structure of OpenCode JSON output.
 */
interface OpenCodeJsonOutput {
  content?: string;
  result?: string;
  response?: string;
  text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  provider?: string;
  duration_ms?: number;
  latency_ms?: number;
  error?: string;
  is_error?: boolean;
}

/**
 * Error thrown when OpenCode CLI is not installed or not accessible.
 */
export class OpenCodeNotInstalledError extends Error {
  readonly code = 'OPENCODE_NOT_INSTALLED';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'OpenCodeNotInstalledError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Checks if OpenCode CLI is installed and accessible.
 *
 * @param executablePath - Path to the opencode executable.
 * @returns True if OpenCode is available.
 * @throws OpenCodeNotInstalledError if not installed.
 */
export async function checkOpenCodeInstalled(executablePath = 'opencode'): Promise<boolean> {
  try {
    const result = await execa(executablePath, ['--version'], {
      timeout: 10000,
      reject: false,
    });

    if (result.exitCode !== 0) {
      throw new OpenCodeNotInstalledError(
        `OpenCode CLI returned non-zero exit code: ${String(result.exitCode)}. ` +
          `Stderr: ${result.stderr || '(empty)'}`
      );
    }

    return true;
  } catch (error) {
    if (error instanceof OpenCodeNotInstalledError) {
      throw error;
    }

    const execaError = error as ExecaError;
    if (execaError.code === 'ENOENT') {
      throw new OpenCodeNotInstalledError(
        `OpenCode CLI not found at '${executablePath}'. ` +
          `Please install OpenCode: https://opencode.ai`,
        execaError
      );
    }

    throw new OpenCodeNotInstalledError(
      `Failed to check OpenCode installation: ${execaError.message || String(error)}`,
      execaError
    );
  }
}

/**
 * Resolves a model alias to the actual model identifier.
 *
 * @param alias - The model alias to resolve.
 * @param config - Configuration containing model assignments.
 * @returns The resolved model identifier.
 */
function resolveModelAlias(alias: ModelAlias, config: Config): string {
  const modelMap: Record<ModelAlias, keyof Config['models']> = {
    architect: 'architect_model',
    auditor: 'auditor_model',
    structurer: 'structurer_model',
    worker: 'worker_model',
    fallback: 'fallback_model',
  };

  const configKey = modelMap[alias];
  return config.models[configKey];
}

/**
 * Formats a model identifier for OpenCode CLI.
 * Converts short names to provider/model format if needed.
 *
 * @param modelId - The model identifier from configuration.
 * @returns The formatted model string for OpenCode CLI.
 */
function formatModelForOpenCode(modelId: string): string {
  // Check if already in provider/model format
  if (modelId.includes('/')) {
    return modelId;
  }

  // Check if we have a known mapping
  const mapped = MODEL_PROVIDER_MAP.get(modelId);
  if (mapped !== undefined) {
    return mapped;
  }

  // Try to infer provider from model name prefix
  if (modelId.startsWith('kimi-')) {
    return `moonshot/${modelId}`;
  }
  if (modelId.startsWith('minimax-')) {
    return `minimax/${modelId}`;
  }

  // Return as-is for unknown models
  return modelId;
}

/**
 * Parses OpenCode JSON output to extract the response.
 *
 * @param output - The raw JSON output from OpenCode.
 * @returns Parsed response content, usage, and metadata.
 */
function parseOpenCodeOutput(output: string): {
  content: string;
  usage: ModelUsage;
  metadata: Partial<ModelMetadata>;
} {
  let content = '';
  let usage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let latencyMs = 0;
  let modelId = '';
  let provider = '';

  // Try to parse the entire output as JSON first
  try {
    const parsed = JSON.parse(output.trim()) as OpenCodeJsonOutput;

    // Extract content from various possible fields
    content = parsed.content ?? parsed.result ?? parsed.response ?? parsed.text ?? '';

    // Extract usage information
    if (parsed.usage) {
      const u = parsed.usage;
      const promptToks = u.prompt_tokens ?? u.input_tokens ?? 0;
      const completionToks = u.completion_tokens ?? u.output_tokens ?? 0;
      const totalToks = u.total_tokens ?? promptToks + completionToks;
      usage = {
        promptTokens: promptToks,
        completionTokens: completionToks,
        totalTokens: totalToks,
      };
    }

    // Extract metadata
    if (parsed.model !== undefined && parsed.model !== '') {
      modelId = parsed.model;
    }
    if (parsed.provider !== undefined && parsed.provider !== '') {
      provider = parsed.provider;
    }
    if (parsed.duration_ms !== undefined) {
      latencyMs = parsed.duration_ms;
    } else if (parsed.latency_ms !== undefined) {
      latencyMs = parsed.latency_ms;
    }
  } catch {
    // If JSON parsing fails, try line-by-line parsing (streaming format)
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as OpenCodeJsonOutput;

        // Accumulate content
        if (parsed.content !== undefined) {
          content += parsed.content;
        } else if (parsed.text !== undefined) {
          content += parsed.text;
        }

        // Update usage (use latest)
        if (parsed.usage) {
          const u = parsed.usage;
          const promptToks = u.prompt_tokens ?? u.input_tokens ?? 0;
          const completionToks = u.completion_tokens ?? u.output_tokens ?? 0;
          const totalToks = u.total_tokens ?? promptToks + completionToks;
          usage = {
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
          };
        }

        // Update metadata
        if (parsed.model !== undefined && parsed.model !== '') {
          modelId = parsed.model;
        }
        if (parsed.provider !== undefined && parsed.provider !== '') {
          provider = parsed.provider;
        }
        if (parsed.duration_ms !== undefined) {
          latencyMs = parsed.duration_ms;
        } else if (parsed.latency_ms !== undefined) {
          latencyMs = parsed.latency_ms;
        }
      } catch {
        // If it's plain text, treat as content
        if (!content) {
          content = line;
        }
      }
    }
  }

  // If still no content, use raw output
  if (!content && output.trim()) {
    content = output.trim();
  }

  return {
    content,
    usage,
    metadata: {
      modelId: modelId || 'unknown',
      latencyMs,
      provider: provider || 'opencode',
    },
  };
}

/**
 * OpenCode CLI client implementing the ModelRouter interface.
 *
 * Routes requests to Kimi K2 and MiniMax models via the OpenCode CLI.
 *
 * @example
 * ```typescript
 * const client = new OpenCodeClient({ config });
 * const result = await client.prompt('auditor', 'Review this code');
 * if (result.success) {
 *   console.log(result.response.content);
 * }
 * ```
 */
export class OpenCodeClient implements ModelRouter {
  private readonly config: Config;
  private readonly executablePath: string;
  private readonly additionalFlags: readonly string[];
  private readonly timeoutMs: number;
  private readonly cwd: string | undefined;

  /**
   * Creates a new OpenCodeClient.
   *
   * @param options - Client configuration options.
   */
  constructor(options: OpenCodeClientOptions) {
    this.config = options.config;
    this.executablePath = options.executablePath ?? 'opencode';
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
    const formattedModel = formatModelForOpenCode(modelId);

    const args: string[] = [
      'run', // Non-interactive mode
      '--model',
      formattedModel,
      '--format',
      'json',
      ...this.additionalFlags,
    ];

    // Add the prompt as the final positional argument
    args.push(request.prompt);

    return args;
  }

  /**
   * Executes an OpenCode subprocess and returns the result.
   *
   * @param args - CLI arguments.
   * @param request - The original request (for error context).
   * @returns The parsed model router result.
   */
  private async executeSubprocess(
    args: string[],
    request: ModelRouterRequest
  ): Promise<ModelRouterResult> {
    const startTime = Date.now();

    try {
      const result =
        this.cwd !== undefined
          ? await execa(this.executablePath, args, {
              timeout: this.timeoutMs,
              reject: false,
              cwd: this.cwd,
            })
          : await execa(this.executablePath, args, {
              timeout: this.timeoutMs,
              reject: false,
            });

      if (result.exitCode !== 0) {
        // Check if it's a command not found error
        const stderrStr = result.stderr;
        if (stderrStr.includes('command not found') || stderrStr.includes('ENOENT')) {
          return createFailureResult(
            createModelError(`OpenCode CLI not found: ${stderrStr || 'command not found'}`, false, {
              errorCode: 'OPENCODE_NOT_FOUND',
              request,
            })
          );
        }

        return createFailureResult(
          createModelError(
            `OpenCode execution failed with exit code ${String(result.exitCode)}`,
            true,
            {
              errorCode: `EXIT_${String(result.exitCode)}`,
              request,
            }
          )
        );
      }

      const parsed = parseOpenCodeOutput(result.stdout);
      const endTime = Date.now();

      const response: ModelRouterResponse = {
        content: parsed.content,
        usage: parsed.usage,
        metadata: {
          modelId: parsed.metadata.modelId ?? 'unknown',
          provider: 'opencode',
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
            `OpenCode CLI not found at '${this.executablePath}'. Please install OpenCode.`,
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
   * @returns A result containing the response or an error.
   */
  async prompt(modelAlias: ModelAlias, prompt: string): Promise<ModelRouterResult> {
    const request: ModelRouterRequest = { modelAlias, prompt };
    const args = this.buildArgs(request);
    return this.executeSubprocess(args, request);
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
   * Note: OpenCode's streaming support varies by provider. This implementation
   * processes line-by-line JSON output when available.
   *
   * @param request - The full request with model alias, prompt, and parameters.
   * @yields StreamChunk objects as they arrive.
   * @returns The final ModelRouterResult when streaming completes.
   */
  async *stream(
    request: ModelRouterRequest
  ): AsyncGenerator<StreamChunk, ModelRouterResult, unknown> {
    const modelId = resolveModelAlias(request.modelAlias, this.config);
    const formattedModel = formatModelForOpenCode(modelId);
    const startTime = Date.now();

    const args: string[] = [
      'run',
      '--model',
      formattedModel,
      '--format',
      'json',
      ...this.additionalFlags,
      request.prompt,
    ];

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
          const parsed = JSON.parse(line) as OpenCodeJsonOutput;

          // Extract content
          const chunkContent = parsed.content ?? parsed.text ?? '';
          if (chunkContent) {
            fullContent += chunkContent;
            yield {
              content: chunkContent,
              done: false,
            };
          }

          // Update model ID
          if (parsed.model !== undefined && parsed.model !== '') {
            detectedModelId = parsed.model;
          }

          // Update usage
          if (parsed.usage) {
            const u = parsed.usage;
            const promptToks = u.prompt_tokens ?? u.input_tokens ?? 0;
            const completionToks = u.completion_tokens ?? u.output_tokens ?? 0;
            const totalToks = u.total_tokens ?? promptToks + completionToks;
            finalUsage = {
              promptTokens: promptToks,
              completionTokens: completionToks,
              totalTokens: totalToks,
            };
          }

          // Update latency
          if (parsed.duration_ms !== undefined) {
            latencyMs = parsed.duration_ms;
          } else if (parsed.latency_ms !== undefined) {
            latencyMs = parsed.latency_ms;
          }
        } catch {
          // If not JSON, treat as plain text content
          if (line.trim()) {
            fullContent += line;
            yield {
              content: line,
              done: false,
            };
          }
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
          `OpenCode execution failed with exit code ${String(result.exitCode)}`,
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
        provider: 'opencode',
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
 * Creates an OpenCode client with installation check.
 *
 * @param options - Client configuration options.
 * @returns A configured OpenCodeClient.
 * @throws OpenCodeNotInstalledError if OpenCode is not installed.
 *
 * @example
 * ```typescript
 * try {
 *   const client = await createOpenCodeClient({ config });
 *   const result = await client.prompt('auditor', 'Review this code');
 * } catch (error) {
 *   if (error instanceof OpenCodeNotInstalledError) {
 *     console.error('Please install OpenCode first.');
 *   }
 * }
 * ```
 */
export async function createOpenCodeClient(
  options: OpenCodeClientOptions
): Promise<OpenCodeClient> {
  await checkOpenCodeInstalled(options.executablePath);
  return new OpenCodeClient(options);
}
