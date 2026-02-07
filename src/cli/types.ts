/**
 * CLI types and interfaces for the Criticality Protocol CLI.
 */

/**
 * CLI renderer interface (placeholder for future OpenTUI integration).
 */
export interface CliRenderer {
  /**
   * The root renderable.
   */
  root?: unknown;

  /**
   * Terminal width.
   */
  width?: number;

  /**
   * Terminal height.
   */
  height?: number;

  /**
   * Start the renderer.
   */
  start?: () => void;

  /**
   * Stop the renderer.
   */
  stop?: () => void;

  /**
   * Destroy the renderer.
   */
  destroy?: () => void;
}

/**
 * Configuration options for the CLI application.
 */
export interface CliConfig {
  /**
   * Whether to use colors in output.
   */
  colors: boolean;

  /**
   * Whether to use Unicode box-drawing characters.
   */
  unicode: boolean;

  /**
   * Watch mode refresh interval in milliseconds.
   */
  watchInterval: number;
}

/**
 * CLI command context.
 */
export interface CliContext {
  /**
   * The OpenTUI renderer instance.
   */
  renderer: Partial<CliRenderer>;

  /**
   * Command-line arguments.
   */
  args: string[];

  /**
   * CLI configuration.
   */
  config: CliConfig;
}

/**
 * Result of a CLI command execution.
 */
export interface CliCommandResult {
  /**
   * Exit code (0 for success, non-zero for error).
   */
  exitCode: number;

  /**
   * Optional message to display.
   */
  message?: string;
}

/**
 * CLI command handler function.
 */
export type CliCommandHandler = (context: CliContext) => Promise<CliCommandResult>;
