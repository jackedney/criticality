/**
 * Telemetry collector for protocol execution.
 *
 * Tracks model calls, token usage, and execution time per phase
 * for display in status command and persistence.
 *
 * @packageDocumentation
 */

import type { ProtocolPhase } from '../protocol/types.js';

/**
 * Telemetry data for a single phase.
 */
export interface PhaseTelemetry {
  /** Number of model calls made in this phase. */
  modelCalls: number;
  /** Prompt tokens used in this phase. */
  promptTokens: number;
  /** Completion tokens used in this phase. */
  completionTokens: number;
  /** Execution time in milliseconds for this phase. */
  executionTimeMs: number;
}

/**
 * Overall telemetry summary across all phases.
 */
export interface TelemetrySummary {
  /** Total model calls across all phases. */
  modelCalls: number;
  /** Total prompt tokens across all phases. */
  promptTokens: number;
  /** Total completion tokens across all phases. */
  completionTokens: number;
  /** Total execution time in milliseconds across all phases. */
  executionTimeMs: number;
}

/**
 * Full telemetry data including per-phase breakdown.
 */
export interface TelemetryData {
  /** Summary across all phases. */
  summary: TelemetrySummary;
  /** Per-phase telemetry keyed by phase name. */
  phases: ReadonlyMap<ProtocolPhase, PhaseTelemetry>;
}

/**
 * Telemetry collector for tracking protocol execution metrics.
 */
export class TelemetryCollector {
  private phases: Map<ProtocolPhase, PhaseTelemetry>;

  /**
   * Creates a new TelemetryCollector.
   */
  constructor() {
    this.phases = new Map();
  }

  /**
   * Records a model call for a specific phase.
   *
   * @param phase - The protocol phase.
   * @param promptTokens - Prompt tokens used.
   * @param completionTokens - Completion tokens used.
   * @param executionTimeMs - Execution time in milliseconds.
   */
  recordModelCall(
    phase: ProtocolPhase,
    promptTokens: number,
    completionTokens: number,
    executionTimeMs: number
  ): void {
    const phaseData = this.getOrCreatePhaseData(phase);
    phaseData.modelCalls += 1;
    phaseData.promptTokens += promptTokens;
    phaseData.completionTokens += completionTokens;
    phaseData.executionTimeMs += executionTimeMs;
  }

  /**
   * Records execution time for a specific phase (non-model operations).
   *
   * @param phase - The protocol phase.
   * @param executionTimeMs - Execution time in milliseconds.
   */
  recordExecutionTime(phase: ProtocolPhase, executionTimeMs: number): void {
    const phaseData = this.getOrCreatePhaseData(phase);
    phaseData.executionTimeMs += executionTimeMs;
  }

  /**
   * Gets or creates phase telemetry data.
   *
   * @param phase - The protocol phase.
   * @returns The phase telemetry data.
   */
  private getOrCreatePhaseData(phase: ProtocolPhase): PhaseTelemetry {
    let phaseData = this.phases.get(phase);
    if (phaseData === undefined) {
      phaseData = {
        modelCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        executionTimeMs: 0,
      };
      this.phases.set(phase, phaseData);
    }
    return phaseData;
  }

  /**
   * Gets the full telemetry data.
   *
   * @returns The collected telemetry data.
   */
  getTelemetryData(): TelemetryData {
    let totalModelCalls = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalExecutionTimeMs = 0;

    for (const [_, phaseData] of this.phases) {
      totalModelCalls += phaseData.modelCalls;
      totalPromptTokens += phaseData.promptTokens;
      totalCompletionTokens += phaseData.completionTokens;
      totalExecutionTimeMs += phaseData.executionTimeMs;
    }

    return {
      summary: {
        modelCalls: totalModelCalls,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        executionTimeMs: totalExecutionTimeMs,
      },
      phases: this.phases,
    };
  }

  /**
   * Checks if any telemetry data has been collected.
   *
   * @returns True if at least one model call has been recorded.
   */
  hasData(): boolean {
    for (const [, phaseData] of this.phases) {
      if (phaseData.modelCalls > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resets all telemetry data.
   */
  reset(): void {
    this.phases.clear();
  }

  /**
   * Formats execution time for display.
   *
   * @param ms - Time in milliseconds.
   * @returns Formatted time string (e.g., "45s", "8.2s", "1m 30s").
   */
  static formatTime(ms: number): string {
    const totalSeconds = ms / 1000;

    if (totalSeconds < 60) {
      return `${totalSeconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = (totalSeconds % 60).toFixed(0);

    return `${String(minutes)}m ${remainingSeconds}s`;
  }

  /**
   * Formats token count with thousands separator.
   *
   * @param tokens - Token count.
   * @returns Formatted token string (e.g., "12,345").
   */
  static formatTokens(tokens: number): string {
    return tokens.toLocaleString('en-US');
  }

  /**
   * Formats telemetry summary for status display.
   *
   * @param telemetry - The telemetry data.
   * @returns Formatted telemetry string or "No data collected".
   */
  static formatSummary(telemetry: TelemetryData): string {
    if (!TelemetryCollector.hasTelemetryData(telemetry)) {
      return 'Telemetry: No data collected';
    }

    const { summary } = telemetry;
    const totalTokens = summary.promptTokens + summary.completionTokens;
    const formattedTime = TelemetryCollector.formatTime(summary.executionTimeMs);
    const formattedTokens = TelemetryCollector.formatTokens(totalTokens);

    return `Telemetry: ${String(summary.modelCalls)} model calls | ${formattedTokens} tokens | ${formattedTime} execution`;
  }

  /**
   * Formats per-phase telemetry breakdown for verbose display.
   *
   * @param telemetry - The telemetry data.
   * @returns Array of formatted per-phase strings.
   */
  static formatPerPhase(telemetry: TelemetryData): string[] {
    const lines: string[] = [];

    for (const [phase, phaseData] of telemetry.phases) {
      if (phaseData.modelCalls > 0) {
        const totalTokens = phaseData.promptTokens + phaseData.completionTokens;
        const formattedTime = TelemetryCollector.formatTime(phaseData.executionTimeMs);
        const formattedTokens = TelemetryCollector.formatTokens(totalTokens);

        lines.push(
          `${phase} phase: ${String(phaseData.modelCalls)} call${phaseData.modelCalls === 1 ? '' : 's'}, ${formattedTokens} tokens, ${formattedTime}`
        );
      }
    }

    return lines;
  }

  /**
   * Checks if telemetry data has been collected.
   *
   * @param telemetry - The telemetry data.
   * @returns True if at least one model call has been recorded.
   */
  private static hasTelemetryData(telemetry: TelemetryData): boolean {
    for (const [, phaseData] of telemetry.phases) {
      if (phaseData.modelCalls > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Serializes telemetry data to a plain object for JSON serialization.
   *
   * @param telemetry - The telemetry data to serialize.
   * @returns Plain object representation.
   */
  static serialize(telemetry: TelemetryData): Record<string, unknown> {
    const phasesObj: Record<string, unknown> = {};

    for (const [phase, phaseData] of telemetry.phases) {
      phasesObj[phase] = {
        modelCalls: phaseData.modelCalls,
        promptTokens: phaseData.promptTokens,
        completionTokens: phaseData.completionTokens,
        executionTimeMs: phaseData.executionTimeMs,
      };
    }

    return {
      summary: {
        modelCalls: telemetry.summary.modelCalls,
        promptTokens: telemetry.summary.promptTokens,
        completionTokens: telemetry.summary.completionTokens,
        executionTimeMs: telemetry.summary.executionTimeMs,
      },
      phases: phasesObj,
    };
  }

  /**
   * Deserializes telemetry data from a plain object.
   *
   * @param data - The plain object to deserialize.
   * @returns The deserialized telemetry data.
   * @throws Error if data is invalid.
   */
  static deserialize(data: unknown): TelemetryData {
    if (data === null || typeof data !== 'object') {
      throw new Error('Invalid telemetry data: expected an object');
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.summary !== 'object' || obj.summary === null) {
      throw new Error('Invalid telemetry data: missing or invalid summary');
    }

    const summary = obj.summary as Record<string, unknown>;
    const summaryModelCalls = typeof summary.modelCalls === 'number' ? summary.modelCalls : 0;
    const summaryPromptTokens = typeof summary.promptTokens === 'number' ? summary.promptTokens : 0;
    const summaryCompletionTokens =
      typeof summary.completionTokens === 'number' ? summary.completionTokens : 0;
    const summaryExecutionTimeMs =
      typeof summary.executionTimeMs === 'number' ? summary.executionTimeMs : 0;

    const summaryData: TelemetrySummary = {
      modelCalls: summaryModelCalls,
      promptTokens: summaryPromptTokens,
      completionTokens: summaryCompletionTokens,
      executionTimeMs: summaryExecutionTimeMs,
    };

    if (typeof obj.phases !== 'object' || obj.phases === null) {
      return { summary: summaryData, phases: new Map() };
    }

    const phases = new Map<ProtocolPhase, PhaseTelemetry>();
    const phasesObj = obj.phases as Record<string, unknown>;

    for (const [phaseName, phaseValue] of Object.entries(phasesObj)) {
      if (typeof phaseValue !== 'object' || phaseValue === null) {
        continue;
      }

      const phaseData = phaseValue as Record<string, unknown>;
      const modelCalls = typeof phaseData.modelCalls === 'number' ? phaseData.modelCalls : 0;
      const promptTokens = typeof phaseData.promptTokens === 'number' ? phaseData.promptTokens : 0;
      const completionTokens =
        typeof phaseData.completionTokens === 'number' ? phaseData.completionTokens : 0;
      const executionTimeMs =
        typeof phaseData.executionTimeMs === 'number' ? phaseData.executionTimeMs : 0;

      if (isValidProtocolPhase(phaseName)) {
        phases.set(phaseName, {
          modelCalls,
          promptTokens,
          completionTokens,
          executionTimeMs,
        });
      }
    }

    return { summary: summaryData, phases };
  }
}

/**
 * Checks if a string is a valid ProtocolPhase.
 *
 * @param value - The string to check.
 * @returns True if value is a valid ProtocolPhase.
 */
function isValidProtocolPhase(value: string): value is ProtocolPhase {
  const validPhases: readonly string[] = [
    'Ignition',
    'Lattice',
    'CompositionAudit',
    'Injection',
    'Mesoscopic',
    'MassDefect',
  ];
  return validPhases.includes(value);
}
