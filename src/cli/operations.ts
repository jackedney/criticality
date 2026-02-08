/**
 * ExternalOperations implementation for CLI context.
 *
 * Provides real implementations for model calls, compilation, tests,
 * archiving, and notifications used by the orchestrator.
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from '../protocol/types.js';
import type { ExternalOperations, ActionResult } from '../protocol/orchestrator.js';
import type { Config } from '../config/types.js';
import { createClaudeCodeClient, type ClaudeCodeClient } from '../router/claude-code-client.js';
import type { ModelAlias } from '../router/types.js';
import { NotificationService } from '../notifications/service.js';
import { execa } from 'execa';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { TelemetryCollector } from './telemetry.js';

/**
 * Telemetry data collected from operations.
 */
export interface OperationTelemetry {
  /** Total model calls made. */
  modelCalls: number;
  /** Total prompt tokens used. */
  promptTokens: number;
  /** Total completion tokens used. */
  completionTokens: number;
  /** Total execution time in milliseconds. */
  executionTimeMs: number;
}

/**
 * Mapping from protocol phases to model aliases.
 */
const PHASE_TO_MODEL_ALIAS: ReadonlyMap<ProtocolPhase, ModelAlias> = new Map([
  ['Ignition', 'architect'],
  ['Lattice', 'structurer'],
  ['CompositionAudit', 'auditor'],
  ['Injection', 'worker'],
  ['Mesoscopic', 'auditor'],
  ['MassDefect', 'worker'],
]);

/**
 * Gets the model alias for a given phase.
 *
 * @param phase - The protocol phase.
 * @returns The model alias to use.
 */
function getModelAliasForPhase(phase: ProtocolPhase): ModelAlias {
  const alias = PHASE_TO_MODEL_ALIAS.get(phase);
  if (alias === undefined) {
    return 'architect';
  }
  return alias;
}

/**
 * Options for creating CLI operations.
 */
export interface CliOperationsOptions {
  /** Configuration for model routing. */
  config: Config;
  /** Path to the state file. */
  statePath: string;
  /** Working directory for command execution. Default: process.cwd(). */
  cwd?: string;
  /** Whether to collect detailed telemetry. Default: true. */
  collectTelemetry?: boolean;
  /** Callback for telemetry updates. */
  onTelemetryUpdate: (telemetry: OperationTelemetry) => void;
  /** Optional TelemetryCollector for per-phase tracking. */
  telemetryCollector?: TelemetryCollector;
}

/**
 * CLI-specific implementation of ExternalOperations.
 *
 * Uses Claude Code CLI for model calls, runs subprocesses for
 * compilation and tests, creates backups for archiving, and
 * sends notifications via NotificationService.
 */
export class CliOperations implements ExternalOperations {
  private readonly config: Config;
  private readonly statePath: string;
  private readonly cwd: string;
  private readonly collectTelemetry: boolean;
  private readonly onTelemetryUpdate: (telemetry: OperationTelemetry) => void;
  private readonly telemetryCollector: TelemetryCollector;
  private readonly notificationService: NotificationService;
  private modelClient: ClaudeCodeClient | null = null;
  private telemetry: OperationTelemetry;
  private currentPhase: ProtocolPhase;

  /**
   * Creates a new CliOperations instance.
   *
   * @param options - Configuration options.
   */
  constructor(options: CliOperationsOptions) {
    this.config = options.config;
    this.statePath = options.statePath;
    this.cwd = options.cwd ?? process.cwd();
    this.collectTelemetry = options.collectTelemetry ?? true;
    this.onTelemetryUpdate = options.onTelemetryUpdate;
    this.telemetryCollector = options.telemetryCollector ?? new TelemetryCollector();
    this.notificationService = new NotificationService(this.config.notifications);
    this.telemetry = {
      modelCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      executionTimeMs: 0,
    };
    this.currentPhase = 'Ignition';
  }

  /**
   * Sets the current protocol phase for telemetry tracking.
   *
   * @param phase - The protocol phase.
   */
  setCurrentPhase(phase: ProtocolPhase): void {
    this.currentPhase = phase;
  }

  /**
   * Initializes the model client.
   *
   * @throws Error if Claude Code CLI is not installed.
   */
  public async ensureModelClient(): Promise<ClaudeCodeClient> {
    if (this.modelClient !== null) {
      return this.modelClient;
    }

    try {
      this.modelClient = await createClaudeCodeClient({
        config: this.config,
        cwd: this.cwd,
      });
      return this.modelClient;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        throw new Error(
          `Failed to initialize model client: ${error.message}\n\n` +
            'Please install Claude Code: https://claude.ai/download'
        );
      }
      throw error;
    }
  }

  /**
   * Updates telemetry and triggers callback if configured.
   */
  private updateTelemetry(delta: Partial<OperationTelemetry>, phase: ProtocolPhase): void {
    if (!this.collectTelemetry) {
      return;
    }

    if (delta.modelCalls !== undefined) {
      this.telemetry.modelCalls += delta.modelCalls;
    }
    if (delta.promptTokens !== undefined) {
      this.telemetry.promptTokens += delta.promptTokens;
    }
    if (delta.completionTokens !== undefined) {
      this.telemetry.completionTokens += delta.completionTokens;
    }
    if (delta.executionTimeMs !== undefined) {
      this.telemetry.executionTimeMs += delta.executionTimeMs;
    }

    if (delta.modelCalls !== undefined && delta.modelCalls > 0) {
      this.telemetryCollector.recordModelCall(
        phase,
        delta.promptTokens ?? 0,
        delta.completionTokens ?? 0,
        delta.executionTimeMs ?? 0
      );
    } else if (delta.executionTimeMs !== undefined) {
      this.telemetryCollector.recordExecutionTime(phase, delta.executionTimeMs);
    }

    this.onTelemetryUpdate(this.telemetry);
  }

  /**
   * Execute a model call and return artifacts on success.
   *
   * @param phase - The protocol phase.
   * @returns Action result with success status.
   */
  async executeModelCall(phase: ProtocolPhase): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const client = await this.ensureModelClient();
      const modelAlias = getModelAliasForPhase(phase);

      const result = await client.prompt(modelAlias, `Execute ${phase} phase`);

      if (!result.success) {
        const error = result.error;

        let errorMessage = `Model call failed: ${error.message}`;
        let recoverable = true;

        switch (error.kind) {
          case 'AuthenticationError':
            errorMessage =
              `Authentication failed: ${error.message}\n\n` +
              'Please check your API key or Claude Code authentication.';
            recoverable = false;
            break;
          case 'RateLimitError':
            errorMessage = `Rate limit exceeded: ${error.message}`;
            if (error.retryAfterMs !== undefined) {
              errorMessage += `\nWait ${Math.ceil(error.retryAfterMs / 1000).toString()}s before retrying.`;
            }
            break;
          case 'TimeoutError':
            errorMessage = `Model call timed out after ${String(error.timeoutMs)}ms`;
            break;
          case 'NetworkError':
            errorMessage = `Network error: ${error.message}`;
            break;
          default:
            errorMessage = `Model error: ${error.message}`;
        }

        return {
          success: false,
          error: errorMessage,
          recoverable,
        };
      }

      const elapsed = Date.now() - startTime;

      this.updateTelemetry(
        {
          modelCalls: 1,
          promptTokens: result.response.usage.promptTokens,
          completionTokens: result.response.usage.completionTokens,
          executionTimeMs: elapsed,
        },
        phase
      );

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Model call failed: ${errorMessage}`,
        recoverable: true,
      };
    }
  }

  /**
   * Run compilation and return result.
   *
   * @returns Action result with success status.
   */
  async runCompilation(): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const result = await execa('npm', ['run', 'build'], {
        cwd: this.cwd,
        reject: false,
      });

      const elapsed = Date.now() - startTime;

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `Compilation failed with exit code ${String(result.exitCode)}\n${result.stderr}`,
          recoverable: true,
        };
      }

      this.updateTelemetry(
        {
          executionTimeMs: elapsed,
        },
        this.currentPhase
      );

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Compilation failed: ${errorMessage}`,
        recoverable: true,
      };
    }
  }

  /**
   * Run tests and return result.
   *
   * @returns Action result with success status.
   */
  async runTests(): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const result = await execa('npm', ['test', '--', '--run'], {
        cwd: this.cwd,
        reject: false,
      });

      const elapsed = Date.now() - startTime;

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `Tests failed with exit code ${String(result.exitCode)}\n${result.stderr}`,
          recoverable: true,
        };
      }

      this.updateTelemetry(
        {
          executionTimeMs: elapsed,
        },
        this.currentPhase
      );

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Tests failed: ${errorMessage}`,
        recoverable: true,
      };
    }
  }

  /**
   * Archive artifacts for the completed phase.
   *
   * Creates a timestamped backup of the current state file.
   *
   * @param phase - The protocol phase being archived.
   * @returns Action result with success status.
   */
  async archivePhaseArtifacts(phase: ProtocolPhase): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const stateDir = path.dirname(this.statePath);
      const stateBasename = path.basename(this.statePath);
      const archiveDir = path.join(stateDir, '.criticality', 'archives');

      await mkdir(archiveDir, { recursive: true });

      const archivePath = path.join(archiveDir, `${stateBasename}.${phase}.${timestamp}`);

      await copyFile(this.statePath, archivePath);

      const elapsed = Date.now() - startTime;

      this.updateTelemetry(
        {
          executionTimeMs: elapsed,
        },
        phase
      );

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Archive failed: ${errorMessage}`,
        recoverable: true,
      };
    }
  }

  /**
   * Send blocking notification.
   *
   * Delegates to NotificationService to send notifications to configured channels.
   *
   * @param query - The blocking query.
   */
  async sendBlockingNotification(query: string): Promise<void> {
    try {
      const blockingRecord = {
        id: `blocking-${this.currentPhase}`,
        phase: this.currentPhase,
        query,
        blockedAt: new Date().toISOString(),
        resolved: false,
      };

      await this.notificationService.notify('block', blockingRecord);
    } catch {
      // Ignore notification errors to avoid blocking protocol execution
    }
  }

  /**
   * Gets the current telemetry data.
   *
   * @returns The collected telemetry.
   */
  getTelemetry(): OperationTelemetry {
    return { ...this.telemetry };
  }

  /**
   * Gets per-phase telemetry data.
   *
   * @returns The collected telemetry data with per-phase breakdown.
   */
  getPerPhaseTelemetry(): ReturnType<typeof this.telemetryCollector.getTelemetryData> {
    return this.telemetryCollector.getTelemetryData();
  }

  /**
   * Resets telemetry counters.
   */
  resetTelemetry(): void {
    this.telemetry = {
      modelCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      executionTimeMs: 0,
    };
    this.telemetryCollector.reset();
    this.onTelemetryUpdate(this.telemetry);
  }
}

/**
 * Creates CLI operations with the given configuration.
 *
 * @param options - Configuration options.
 * @returns A configured CliOperations instance.
 */
export async function createCliOperations(options: CliOperationsOptions): Promise<CliOperations> {
  const telemetryCollector = options.telemetryCollector ?? new TelemetryCollector();
  const operations = new CliOperations({ ...options, telemetryCollector });
  await operations.ensureModelClient();
  return operations;
}
