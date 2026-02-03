/**
 * CLI interface for the Ignition interview phase.
 *
 * Provides interactive CLI prompts for conducting the interview,
 * with support for resuming, summary display, and input validation.
 *
 * @packageDocumentation
 */

import type {
  InterviewState,
  InterviewPhase,
  ExtractedRequirement,
  TranscriptEntry,
} from './types.js';
import {
  INTERVIEW_PHASES,
  isInterviewComplete,
  getNextInterviewPhase,
  createInitialInterviewState,
} from './types.js';
import {
  loadInterviewState,
  saveInterviewState,
  loadTranscript,
  appendTranscriptEntry,
  appendTranscriptEntryAndUpdateState,
  interviewStateExists,
  InterviewPersistenceError,
} from './persistence.js';
import {
  REQUIRED_PHASES,
  DELEGABLE_PHASES,
  CONFIRMATION_ITEMS,
  type ApprovalResponse,
  type ConfirmationItem,
  type DelegationResponse,
} from './structure.js';
import { createTranscriptEntry } from './types.js';

/**
 * Formatted text styles for CLI output.
 */
export const CLI_STYLES = {
  /** Bold text marker. */
  BOLD: '\x1b[1m',
  /** Reset formatting. */
  RESET: '\x1b[0m',
  /** Dim/gray text. */
  DIM: '\x1b[2m',
  /** Green text for success. */
  GREEN: '\x1b[32m',
  /** Yellow text for warnings. */
  YELLOW: '\x1b[33m',
  /** Cyan text for info. */
  CYAN: '\x1b[36m',
  /** Red text for errors. */
  RED: '\x1b[31m',
} as const;

/**
 * Result of a CLI prompt operation.
 */
export interface PromptResult {
  /** The user's input. */
  readonly input: string;
  /** Whether the input was empty. */
  readonly isEmpty: boolean;
  /** Whether the user requested to quit. */
  readonly quit: boolean;
}

/**
 * Options for displaying prompts.
 */
export interface PromptOptions {
  /** The prompt message to display. */
  readonly message: string;
  /** Optional hint text. */
  readonly hint?: string | undefined;
  /** Whether to allow empty input. */
  readonly allowEmpty?: boolean | undefined;
  /** Default value if empty. */
  readonly defaultValue?: string | undefined;
  /** Available choices for selection. */
  readonly choices?: readonly string[] | undefined;
}

/**
 * Resume confirmation result.
 */
export type ResumeConfirmation = 'continue' | 'correct' | 'quit';

/**
 * Interface for reading user input.
 * Abstracted for testability.
 */
export interface InputReader {
  /** Read a line of input. */
  readLine(prompt: string): Promise<string>;
  /** Close the reader. */
  close(): void;
}

/**
 * Interface for writing output.
 * Abstracted for testability.
 */
export interface OutputWriter {
  /** Write a line of text. */
  writeLine(text: string): void;
  /** Write text without newline. */
  write(text: string): void;
}

/**
 * Default output writer using process.stdout.
 */
export const defaultOutputWriter: OutputWriter = {
  writeLine(text: string): void {
    process.stdout.write(text + '\n');
  },
  write(text: string): void {
    process.stdout.write(text);
  },
};

/**
 * Formats a section header for CLI display.
 *
 * @param title - The section title.
 * @returns Formatted header string.
 */
export function formatSectionHeader(title: string): string {
  const line = '═'.repeat(Math.max(title.length, 40));
  return `\n${CLI_STYLES.BOLD}${CLI_STYLES.CYAN}${line}${CLI_STYLES.RESET}\n${CLI_STYLES.BOLD}${title}${CLI_STYLES.RESET}\n${CLI_STYLES.CYAN}${line}${CLI_STYLES.RESET}\n`;
}

/**
 * Formats a subsection header.
 *
 * @param title - The subsection title.
 * @returns Formatted header string.
 */
export function formatSubsectionHeader(title: string): string {
  return `\n${CLI_STYLES.BOLD}${title}${CLI_STYLES.RESET}\n${CLI_STYLES.DIM}${'─'.repeat(title.length)}${CLI_STYLES.RESET}\n`;
}

/**
 * Formats a prompt message with optional hint.
 *
 * @param message - The prompt message.
 * @param hint - Optional hint text.
 * @returns Formatted prompt string.
 */
export function formatPrompt(message: string, hint?: string): string {
  let result = `\n${CLI_STYLES.BOLD}${message}${CLI_STYLES.RESET}`;
  if (hint !== undefined) {
    result += `\n${CLI_STYLES.DIM}${hint}${CLI_STYLES.RESET}`;
  }
  result += '\n> ';
  return result;
}

/**
 * Formats choices for selection.
 *
 * @param choices - The available choices.
 * @returns Formatted choices string.
 */
export function formatChoices(choices: readonly string[]): string {
  const lines = choices.map((choice, index) => {
    const num = String(index + 1);
    return `  ${CLI_STYLES.CYAN}[${num}]${CLI_STYLES.RESET} ${choice}`;
  });
  return lines.join('\n');
}

/**
 * Formats an error message.
 *
 * @param message - The error message.
 * @returns Formatted error string.
 */
export function formatError(message: string): string {
  return `${CLI_STYLES.RED}Error: ${message}${CLI_STYLES.RESET}`;
}

/**
 * Formats a success message.
 *
 * @param message - The success message.
 * @returns Formatted success string.
 */
export function formatSuccess(message: string): string {
  return `${CLI_STYLES.GREEN}✓ ${message}${CLI_STYLES.RESET}`;
}

/**
 * Formats a warning message.
 *
 * @param message - The warning message.
 * @returns Formatted warning string.
 */
export function formatWarning(message: string): string {
  return `${CLI_STYLES.YELLOW}⚠ ${message}${CLI_STYLES.RESET}`;
}

/**
 * Formats an info message.
 *
 * @param message - The info message.
 * @returns Formatted info string.
 */
export function formatInfo(message: string): string {
  return `${CLI_STYLES.CYAN}ℹ ${message}${CLI_STYLES.RESET}`;
}

/**
 * Gets the phase display name.
 *
 * @param phase - The interview phase.
 * @returns Human-readable phase name.
 */
export function getPhaseDisplayName(phase: InterviewPhase): string {
  const names: Record<InterviewPhase, string> = {
    Discovery: 'Discovery',
    Architecture: 'Architecture',
    Constraints: 'Constraints',
    DesignPreferences: 'Design Preferences',
    Synthesis: 'Synthesis',
    Approval: 'Approval',
  };
  // eslint-disable-next-line security/detect-object-injection -- safe: phase is InterviewPhase enum with known literal keys
  return names[phase];
}

/**
 * Gets the phase description.
 *
 * @param phase - The interview phase.
 * @returns Phase description.
 */
export function getPhaseDescription(phase: InterviewPhase): string {
  const descriptions: Record<InterviewPhase, string> = {
    Discovery: 'We will gather your core requirements and understand what you want to build.',
    Architecture: 'We will discuss the system structure, components, and technical decisions.',
    Constraints: 'We will identify constraints, limitations, and non-functional requirements.',
    DesignPreferences: 'We will capture your preferences for implementation style and patterns.',
    Synthesis: 'The architect will synthesize your inputs into a coherent specification.',
    Approval: 'You will review and approve the generated specification before proceeding.',
  };
  // eslint-disable-next-line security/detect-object-injection -- safe: phase is InterviewPhase enum with known literal keys
  return descriptions[phase];
}

/**
 * Formats a progress indicator showing completed and remaining phases.
 *
 * @param currentPhase - The current phase.
 * @param completedPhases - List of completed phases.
 * @returns Formatted progress string.
 */
export function formatProgress(
  currentPhase: InterviewPhase,
  completedPhases: readonly InterviewPhase[]
): string {
  const phases = INTERVIEW_PHASES.map((phase) => {
    const completed = completedPhases.includes(phase);
    const current = phase === currentPhase;
    const marker = completed ? '✓' : current ? '▶' : '○';
    const style = completed ? CLI_STYLES.GREEN : current ? CLI_STYLES.CYAN : CLI_STYLES.DIM;
    return `${style}${marker} ${getPhaseDisplayName(phase)}${CLI_STYLES.RESET}`;
  });

  return `\n${CLI_STYLES.BOLD}Progress:${CLI_STYLES.RESET}\n${phases.join(' → ')}\n`;
}

/**
 * Groups requirements by category for display.
 *
 * @param requirements - The requirements to group.
 * @returns Grouped requirements.
 */
export function groupRequirementsByCategory(
  requirements: readonly ExtractedRequirement[]
): Map<string, ExtractedRequirement[]> {
  const grouped = new Map<string, ExtractedRequirement[]>();

  for (const req of requirements) {
    const existing = grouped.get(req.category);
    if (existing !== undefined) {
      existing.push(req);
    } else {
      grouped.set(req.category, [req]);
    }
  }

  return grouped;
}

/**
 * Formats the "Here's what I understand so far" summary.
 *
 * @param state - The interview state.
 * @returns Formatted summary string.
 */
export function formatUnderstandingSummary(state: InterviewState): string {
  const lines: string[] = [];

  lines.push(formatSectionHeader("Here's what I understand so far"));

  // Group requirements by category
  const grouped = groupRequirementsByCategory(state.extractedRequirements);

  const categoryNames: Record<string, string> = {
    functional: 'Functional Requirements',
    non_functional: 'Non-Functional Requirements',
    constraint: 'Constraints',
    preference: 'Design Preferences',
  };

  const categoryOrder = ['functional', 'non_functional', 'constraint', 'preference'];

  for (const category of categoryOrder) {
    const reqs = grouped.get(category);
    if (reqs !== undefined && reqs.length > 0) {
      // eslint-disable-next-line security/detect-object-injection -- safe: category comes from known const categoryOrder array
      const name = categoryNames[category] ?? category;
      lines.push(formatSubsectionHeader(name));

      for (const req of reqs) {
        const confidence =
          req.confidence === 'high'
            ? CLI_STYLES.GREEN
            : req.confidence === 'medium'
              ? CLI_STYLES.YELLOW
              : CLI_STYLES.DIM;
        lines.push(
          `  ${CLI_STYLES.CYAN}•${CLI_STYLES.RESET} ${req.text} ${confidence}[${req.confidence}]${CLI_STYLES.RESET}`
        );
      }
    }
  }

  // Show delegation points if any
  if (state.delegationPoints.length > 0) {
    lines.push(formatSubsectionHeader('Delegated Decisions'));
    for (const dp of state.delegationPoints) {
      lines.push(
        `  ${CLI_STYLES.YELLOW}→${CLI_STYLES.RESET} ${getPhaseDisplayName(dp.phase)} phase delegated to Architect`
      );
      if (dp.notes !== undefined) {
        lines.push(`    ${CLI_STYLES.DIM}Notes: ${dp.notes}${CLI_STYLES.RESET}`);
      }
    }
  }

  // If no requirements extracted yet
  if (state.extractedRequirements.length === 0) {
    lines.push(
      `${CLI_STYLES.DIM}No requirements captured yet. Let's begin the interview.${CLI_STYLES.RESET}`
    );
  }

  return lines.join('\n');
}

/**
 * Formats the interview state for resuming.
 *
 * @param state - The interview state.
 * @param transcript - The transcript entries.
 * @returns Formatted resume summary string.
 */
export function formatResumeSummary(
  state: InterviewState,
  transcript: readonly TranscriptEntry[]
): string {
  const lines: string[] = [];

  lines.push(formatSectionHeader('Resuming Interview'));
  lines.push(`${CLI_STYLES.BOLD}Project:${CLI_STYLES.RESET} ${state.projectId}`);
  lines.push(
    `${CLI_STYLES.BOLD}Started:${CLI_STYLES.RESET} ${new Date(state.createdAt).toLocaleString()}`
  );
  lines.push(
    `${CLI_STYLES.BOLD}Last updated:${CLI_STYLES.RESET} ${new Date(state.updatedAt).toLocaleString()}`
  );

  // Progress indicator
  lines.push(formatProgress(state.currentPhase, state.completedPhases));

  // Understanding summary
  lines.push(formatUnderstandingSummary(state));

  // Show recent transcript entries
  if (transcript.length > 0) {
    lines.push(formatSubsectionHeader('Recent Conversation'));
    const recentEntries = transcript.slice(-5);
    for (const entry of recentEntries) {
      const roleStyle =
        entry.role === 'assistant'
          ? CLI_STYLES.CYAN
          : entry.role === 'user'
            ? CLI_STYLES.GREEN
            : CLI_STYLES.DIM;
      const roleName =
        entry.role === 'assistant' ? 'Architect' : entry.role === 'user' ? 'You' : 'System';
      // Truncate long content
      const content =
        entry.content.length > 100 ? entry.content.substring(0, 97) + '...' : entry.content;
      lines.push(`  ${roleStyle}${roleName}:${CLI_STYLES.RESET} ${content}`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats the welcome message for a new interview.
 *
 * @param projectId - The project identifier.
 * @returns Formatted welcome message.
 */
export function formatWelcomeMessage(projectId: string): string {
  const lines: string[] = [];

  lines.push(formatSectionHeader('Criticality Protocol - Ignition Phase'));
  lines.push(
    `Welcome! Let's define the specification for ${CLI_STYLES.BOLD}${projectId}${CLI_STYLES.RESET}.`
  );
  lines.push('');
  lines.push('The interview consists of six phases:');

  for (const phase of INTERVIEW_PHASES) {
    const required = (REQUIRED_PHASES as readonly string[]).includes(phase);
    const delegable = (DELEGABLE_PHASES as readonly string[]).includes(phase);
    const marker = required
      ? `${CLI_STYLES.RED}*${CLI_STYLES.RESET}`
      : delegable
        ? `${CLI_STYLES.YELLOW}○${CLI_STYLES.RESET}`
        : `${CLI_STYLES.DIM}○${CLI_STYLES.RESET}`;
    lines.push(`  ${marker} ${CLI_STYLES.BOLD}${getPhaseDisplayName(phase)}${CLI_STYLES.RESET}`);
    lines.push(`    ${CLI_STYLES.DIM}${getPhaseDescription(phase)}${CLI_STYLES.RESET}`);
  }

  lines.push('');
  lines.push(`${CLI_STYLES.RED}*${CLI_STYLES.RESET} = Required phase`);
  lines.push(`${CLI_STYLES.YELLOW}○${CLI_STYLES.RESET} = Can be delegated to Architect`);
  lines.push('');
  lines.push(
    `${CLI_STYLES.DIM}Type 'quit' or 'q' at any time to save and exit.${CLI_STYLES.RESET}`
  );
  lines.push(
    `${CLI_STYLES.DIM}Your progress is saved automatically after each response.${CLI_STYLES.RESET}`
  );

  return lines.join('\n');
}

/**
 * Formats the phase introduction.
 *
 * @param phase - The interview phase.
 * @param completedPhases - List of completed phases.
 * @returns Formatted phase intro.
 */
export function formatPhaseIntro(
  phase: InterviewPhase,
  completedPhases: readonly InterviewPhase[]
): string {
  const lines: string[] = [];

  lines.push(formatSectionHeader(`Phase: ${getPhaseDisplayName(phase)}`));
  lines.push(getPhaseDescription(phase));
  lines.push(formatProgress(phase, completedPhases));

  const delegable = (DELEGABLE_PHASES as readonly string[]).includes(phase);
  if (delegable) {
    lines.push(
      `${CLI_STYLES.YELLOW}This phase can be delegated to the Architect if you prefer.${CLI_STYLES.RESET}`
    );
    lines.push(
      `${CLI_STYLES.DIM}Type 'delegate' to delegate, or 'delegate with notes: <notes>' to delegate with guidance.${CLI_STYLES.RESET}`
    );
  }

  return lines.join('\n');
}

/**
 * Formats the empty input error message.
 *
 * @returns Formatted error message with help.
 */
export function formatEmptyInputError(): string {
  const lines: string[] = [];

  lines.push(formatError('Empty input received.'));
  lines.push('');
  lines.push('Please provide a response. You can:');
  lines.push(`  ${CLI_STYLES.CYAN}•${CLI_STYLES.RESET} Type your answer and press Enter`);
  lines.push(
    `  ${CLI_STYLES.CYAN}•${CLI_STYLES.RESET} Type ${CLI_STYLES.BOLD}'quit'${CLI_STYLES.RESET} or ${CLI_STYLES.BOLD}'q'${CLI_STYLES.RESET} to save and exit`
  );
  lines.push(
    `  ${CLI_STYLES.CYAN}•${CLI_STYLES.RESET} Type ${CLI_STYLES.BOLD}'help'${CLI_STYLES.RESET} for more options`
  );

  return lines.join('\n');
}

/**
 * Formats the resume confirmation prompt.
 *
 * @returns Formatted confirmation prompt.
 */
export function formatResumeConfirmation(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    `${CLI_STYLES.BOLD}Would you like to continue from where you left off?${CLI_STYLES.RESET}`
  );
  lines.push('');
  lines.push(formatChoices(['Yes, continue', 'No, let me correct something', 'Quit']));
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the delegation options.
 *
 * @returns Formatted delegation options.
 */
export function formatDelegationOptions(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${CLI_STYLES.BOLD}Delegation Options:${CLI_STYLES.RESET}`);
  lines.push(formatChoices(['Continue (provide input)', 'Delegate', 'Delegate with notes']));
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the approval options.
 *
 * @returns Formatted approval options.
 */
export function formatApprovalOptions(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${CLI_STYLES.BOLD}Approval Decision:${CLI_STYLES.RESET}`);
  lines.push(formatChoices(['Approve', 'Approve with conditions', 'Reject with feedback']));
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the confirmation items for approval.
 *
 * @returns Formatted confirmation items.
 */
export function formatConfirmationItems(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${CLI_STYLES.BOLD}Please confirm the following items:${CLI_STYLES.RESET}`);
  lines.push('');

  const itemNames: Record<ConfirmationItem, string> = {
    system_boundaries: 'System boundaries are correctly defined',
    data_models: 'Data models accurately represent the domain',
    key_constraints: 'Key constraints are properly captured',
    testable_claims: 'Testable claims are specific and verifiable',
  };

  for (const item of CONFIRMATION_ITEMS) {
    // eslint-disable-next-line security/detect-object-injection -- safe: item comes from CONFIRMATION_ITEMS const array with known literal values
    lines.push(`  ${CLI_STYLES.CYAN}□${CLI_STYLES.RESET} ${itemNames[item]}`);
  }

  lines.push('');
  lines.push(
    `${CLI_STYLES.DIM}Type 'confirm all' to confirm all items, or address specific concerns.${CLI_STYLES.RESET}`
  );

  return lines.join('\n');
}

/**
 * Parses a user input for quit command.
 *
 * @param input - The user input.
 * @returns True if the input is a quit command.
 */
export function isQuitCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === 'quit' || normalized === 'q' || normalized === 'exit';
}

/**
 * Parses a user input for help command.
 *
 * @param input - The user input.
 * @returns True if the input is a help command.
 */
export function isHelpCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === 'help' || normalized === 'h' || normalized === '?';
}

/**
 * Parses a delegation command from input.
 *
 * @param input - The user input.
 * @returns The delegation response or undefined if not a delegation command.
 */
export function parseDelegationCommand(input: string): DelegationResponse | undefined {
  const normalized = input.trim().toLowerCase();

  if (normalized === 'delegate') {
    return { decision: 'Delegate' };
  }

  const withNotesMatch = /^delegate\s+with\s+notes?:\s*(.+)$/i.exec(input.trim());
  if (withNotesMatch?.[1] !== undefined) {
    return { decision: 'DelegateWithNotes', notes: withNotesMatch[1].trim() };
  }

  if (normalized === '1' || normalized === 'continue') {
    return { decision: 'Continue' };
  }

  if (normalized === '2') {
    return { decision: 'Delegate' };
  }

  if (normalized === '3') {
    // Need to prompt for notes
    return { decision: 'DelegateWithNotes' };
  }

  return undefined;
}

/**
 * Parses a resume confirmation from input.
 *
 * @param input - The user input.
 * @returns The resume confirmation.
 */
export function parseResumeConfirmation(input: string): ResumeConfirmation {
  const normalized = input.trim().toLowerCase();

  if (
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === 'continue'
  ) {
    return 'continue';
  }

  if (normalized === '2' || normalized === 'no' || normalized === 'n' || normalized === 'correct') {
    return 'correct';
  }

  if (normalized === '3' || isQuitCommand(normalized)) {
    return 'quit';
  }

  // Default to continue for unrecognized input
  return 'continue';
}

/**
 * Parses an approval decision from input.
 *
 * @param input - The user input.
 * @returns The approval decision or undefined if not recognized.
 */
export function parseApprovalDecision(input: string): ApprovalResponse['decision'] | undefined {
  const normalized = input.trim().toLowerCase();

  if (normalized === '1' || normalized === 'approve' || normalized === 'approved') {
    return 'Approve';
  }

  if (
    normalized === '2' ||
    normalized === 'conditions' ||
    normalized === 'approve with conditions'
  ) {
    return 'ApproveWithConditions';
  }

  if (normalized === '3' || normalized === 'reject' || normalized === 'reject with feedback') {
    return 'RejectWithFeedback';
  }

  return undefined;
}

/**
 * CLI Interview runner.
 *
 * Manages the interactive CLI session for the interview.
 */
export class InterviewCli {
  private readonly projectId: string;
  private readonly reader: InputReader;
  private readonly writer: OutputWriter;
  private state: InterviewState | undefined;

  /**
   * Creates a new InterviewCli instance.
   *
   * @param projectId - The project identifier.
   * @param reader - Input reader.
   * @param writer - Output writer.
   */
  constructor(projectId: string, reader: InputReader, writer: OutputWriter) {
    this.projectId = projectId;
    this.reader = reader;
    this.writer = writer;
  }

  /**
   * Gets the current interview state.
   *
   * @returns The current state or undefined if not started.
   */
  getState(): InterviewState | undefined {
    return this.state;
  }

  /**
   * Writes a line to output.
   *
   * @param text - The text to write.
   */
  private writeLine(text: string): void {
    this.writer.writeLine(text);
  }

  /**
   * Prompts for input with optional validation.
   *
   * @param options - Prompt options.
   * @returns The prompt result.
   */
  async prompt(options: PromptOptions): Promise<PromptResult> {
    // Display choices if provided
    if (options.choices !== undefined && options.choices.length > 0) {
      this.writeLine(formatChoices(options.choices));
    }

    // Display the prompt
    const promptText = formatPrompt(options.message, options.hint);
    const input = await this.reader.readLine(promptText);
    const trimmed = input.trim();

    // Check for quit
    if (isQuitCommand(trimmed)) {
      return { input: trimmed, isEmpty: false, quit: true };
    }

    // Check for empty input
    if (trimmed === '') {
      if (options.allowEmpty !== true) {
        this.writeLine(formatEmptyInputError());
        // Re-prompt
        return this.prompt(options);
      }

      if (options.defaultValue !== undefined) {
        return { input: options.defaultValue, isEmpty: true, quit: false };
      }
    }

    return { input: trimmed, isEmpty: trimmed === '', quit: false };
  }

  /**
   * Starts or resumes the interview.
   *
   * @returns True if interview completed, false if quit early.
   */
  async run(): Promise<boolean> {
    // Check if there's existing state
    const exists = await interviewStateExists(this.projectId);

    if (exists) {
      return this.handleResume();
    }

    return this.startNew();
  }

  /**
   * Handles resuming an existing interview.
   *
   * @returns True if interview completed, false if quit early.
   */
  private async handleResume(): Promise<boolean> {
    try {
      this.state = await loadInterviewState(this.projectId);
      const transcript = await loadTranscript(this.projectId);

      // Display resume summary
      this.writeLine(formatResumeSummary(this.state, transcript));

      // Show confirmation prompt
      this.writeLine(formatResumeConfirmation());

      const result = await this.prompt({
        message: 'Your choice',
        allowEmpty: false,
      });

      if (result.quit) {
        this.writeLine(formatInfo('Interview saved. Run again to resume.'));
        return false;
      }

      const confirmation = parseResumeConfirmation(result.input);

      if (confirmation === 'quit') {
        this.writeLine(formatInfo('Interview saved. Run again to resume.'));
        return false;
      }

      if (confirmation === 'correct') {
        return await this.handleCorrection();
      }

      // Continue from current phase
      return await this.continueInterview();
    } catch (error) {
      if (error instanceof InterviewPersistenceError && error.errorType === 'corruption_error') {
        this.writeLine(formatError(error.message));
        this.writeLine(formatWarning('Starting fresh interview due to corrupted state.'));
        return this.startNew();
      }
      throw error;
    }
  }

  /**
   * Handles the user wanting to correct something.
   *
   * @returns True if interview completed, false if quit early.
   */
  private async handleCorrection(): Promise<boolean> {
    if (this.state === undefined) {
      return this.startNew();
    }

    this.writeLine(formatSubsectionHeader('What would you like to correct?'));

    // Show completed phases as options
    const completedWithCurrent = [...this.state.completedPhases, this.state.currentPhase];
    const uniquePhases = [...new Set(completedWithCurrent)];

    if (uniquePhases.length === 0) {
      this.writeLine(formatInfo('No phases completed yet. Starting from the beginning.'));
      return this.continueInterview();
    }

    const choices = uniquePhases.map((phase) => getPhaseDisplayName(phase));
    choices.push('Start over');

    this.writeLine(formatChoices(choices));

    const result = await this.prompt({
      message: 'Select a phase to revisit',
      allowEmpty: false,
    });

    if (result.quit) {
      return false;
    }

    const choiceIndex = parseInt(result.input, 10) - 1;
    if (choiceIndex >= 0 && choiceIndex < uniquePhases.length) {
      // eslint-disable-next-line security/detect-object-injection -- safe: choiceIndex is bounded numeric index validated against array length
      const selectedPhase = uniquePhases[choiceIndex];
      if (selectedPhase !== undefined) {
        // Reset to selected phase
        this.state = {
          ...this.state,
          currentPhase: selectedPhase,
          completedPhases: this.state.completedPhases.filter(
            (p) => INTERVIEW_PHASES.indexOf(p) < INTERVIEW_PHASES.indexOf(selectedPhase)
          ),
          updatedAt: new Date().toISOString(),
        };
        await saveInterviewState(this.state);
        this.writeLine(formatSuccess(`Returning to ${getPhaseDisplayName(selectedPhase)} phase.`));
      }
    } else if (result.input.toLowerCase() === 'start over' || choiceIndex === uniquePhases.length) {
      return this.startNew();
    }

    return this.continueInterview();
  }

  /**
   * Starts a new interview.
   *
   * @returns True if interview completed, false if quit early.
   */
  private async startNew(): Promise<boolean> {
    this.state = createInitialInterviewState(this.projectId);

    await saveInterviewState(this.state);

    // Display welcome
    this.writeLine(formatWelcomeMessage(this.projectId));

    return this.continueInterview();
  }

  /**
   * Continues the interview from the current phase.
   *
   * @returns True if interview completed, false if quit early.
   */
  private async continueInterview(): Promise<boolean> {
    if (this.state === undefined) {
      return false;
    }

    while (!isInterviewComplete(this.state)) {
      const phase: InterviewPhase = this.state.currentPhase;

      // Show phase intro
      this.writeLine(formatPhaseIntro(phase, this.state.completedPhases));

      // Run the phase
      const completed = await this.runPhase(phase);

      if (!completed) {
        // User quit
        return false;
      }

      // Advance to next phase
      const nextPhase = getNextInterviewPhase(phase);
      if (nextPhase === undefined) {
        break;
      }

      this.state = {
        ...this.state,
        currentPhase: nextPhase,
        completedPhases: [...this.state.completedPhases, phase],
        updatedAt: new Date().toISOString(),
      };

      await saveInterviewState(this.state);
    }

    // Interview complete
    this.writeLine(formatSectionHeader('Interview Complete'));
    this.writeLine(
      formatSuccess('All phases completed. Your specification is ready for the next stage.')
    );

    return true;
  }

  /**
   * Runs a single interview phase.
   *
   * @param phase - The phase to run.
   * @returns True if phase completed, false if quit.
   */
  private async runPhase(phase: InterviewPhase): Promise<boolean> {
    // For now, a simple implementation that asks a general question per phase
    // This will be enhanced when the full interview engine is implemented

    const phaseQuestions: Record<InterviewPhase, string> = {
      Discovery: 'What would you like to build? Describe your project and its core features.',
      Architecture:
        'How should the system be structured? Describe the main components and their interactions.',
      Constraints:
        'What constraints or limitations should the system respect? (performance, security, compatibility, etc.)',
      DesignPreferences:
        'Do you have any preferences for implementation style, patterns, or conventions?',
      Synthesis:
        'Based on your inputs, I will now synthesize the specification. Any additional notes?',
      Approval: 'Please review the specification. Do you approve it?',
    };

    // eslint-disable-next-line security/detect-object-injection -- safe: phase is InterviewPhase enum with known literal keys
    const question = phaseQuestions[phase];
    const isDelegable = (DELEGABLE_PHASES as readonly string[]).includes(phase);

    let actualAnswer: string | undefined;

    // For delegable phases, show options
    if (isDelegable) {
      this.writeLine(formatDelegationOptions());
    }

    const result = await this.prompt({
      message: question,
      hint: isDelegable
        ? "Type 'delegate' to delegate this phase, or provide your answer."
        : undefined,
      allowEmpty: false,
    });

    if (result.quit) {
      this.writeLine(formatInfo('Progress saved. Run again to resume.'));
      return false;
    }

    // Check for delegation
    if (isDelegable) {
      const delegation = parseDelegationCommand(result.input);
      if (delegation !== undefined && delegation.decision !== 'Continue') {
        // Handle delegation
        let notes: string | undefined;
        if (delegation.decision === 'DelegateWithNotes' && delegation.notes === undefined) {
          const notesResult = await this.prompt({
            message: 'Please provide notes for the Architect:',
            allowEmpty: true,
          });

          if (notesResult.quit) {
            return false;
          }

          notes = notesResult.isEmpty ? undefined : notesResult.input;
        } else {
          notes = delegation.notes;
        }

        // Record delegation
        const delegationPoint = {
          phase,
          decision: delegation.decision,
          delegatedAt: new Date().toISOString(),
          ...(notes !== undefined && { notes }),
        };

        if (this.state !== undefined) {
          this.state = {
            ...this.state,
            delegationPoints: [...this.state.delegationPoints, delegationPoint],
            updatedAt: new Date().toISOString(),
          };
          await saveInterviewState(this.state);
        }

        // Record in transcript
        const entry = createTranscriptEntry(
          phase,
          'user',
          `[Delegation] ${delegation.decision}${notes !== undefined ? `: ${notes}` : ''}`
        );
        await appendTranscriptEntry(this.projectId, entry);

        this.writeLine(
          formatSuccess(`${getPhaseDisplayName(phase)} phase delegated to Architect.`)
        );
        return true;
      }

      // If user chose 'Continue', re-prompt for actual answer
      if (delegation?.decision === 'Continue') {
        const actualAnswerResult = await this.prompt({
          message: question,
          hint: "Type 'quit' or 'q' to save and exit",
          allowEmpty: false,
        });

        if (actualAnswerResult.quit) {
          this.writeLine(formatInfo('Progress saved. Run again to resume.'));
          return false;
        }

        actualAnswer = actualAnswerResult.input;
      }
    }

    // Handle Approval phase specially
    if (phase === 'Approval') {
      return this.handleApproval();
    }

    // Record the response (use actualAnswer if provided from Continue re-prompt)
    const userEntry = createTranscriptEntry(phase, 'user', actualAnswer ?? result.input);

    // For now, extract a simple requirement
    // This will be enhanced with the full interview engine
    if (this.state !== undefined) {
      const requirement = {
        id: `req_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`,
        sourcePhase: phase,
        category: this.getCategoryForPhase(phase),
        text: actualAnswer ?? result.input,
        confidence: 'medium' as const,
        extractedAt: new Date().toISOString(),
      };

      // Update state with requirement and append user entry (increments count)
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, userEntry, {
        ...this.state,
        extractedRequirements: [...this.state.extractedRequirements, requirement],
      });
    } else {
      await appendTranscriptEntry(this.projectId, userEntry);
    }

    // Acknowledge
    const ackEntry = createTranscriptEntry(
      phase,
      'assistant',
      `Got it! I've recorded your input for ${getPhaseDisplayName(phase)}.`
    );
    if (this.state !== undefined) {
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, ackEntry, this.state);
    } else {
      await appendTranscriptEntry(this.projectId, ackEntry);
    }

    this.writeLine(formatSuccess(`Response recorded for ${getPhaseDisplayName(phase)} phase.`));

    return true;
  }

  /**
   * Gets the requirement category for a phase.
   *
   * @param phase - The interview phase.
   * @returns The requirement category.
   */
  private getCategoryForPhase(
    phase: InterviewPhase
  ): 'functional' | 'non_functional' | 'constraint' | 'preference' {
    const categoryMap: Record<
      InterviewPhase,
      'functional' | 'non_functional' | 'constraint' | 'preference'
    > = {
      Discovery: 'functional',
      Architecture: 'functional',
      Constraints: 'constraint',
      DesignPreferences: 'preference',
      Synthesis: 'functional',
      Approval: 'functional',
    };
    // eslint-disable-next-line security/detect-object-injection -- safe: phase is InterviewPhase enum with known literal keys
    return categoryMap[phase];
  }

  /**
   * Handles the approval phase.
   *
   * @returns True if approved, false if quit.
   */
  private async handleApproval(): Promise<boolean> {
    if (this.state === undefined) {
      return false;
    }

    // Show understanding summary
    this.writeLine(formatUnderstandingSummary(this.state));

    // Show confirmation items
    this.writeLine(formatConfirmationItems());

    // Show approval options
    this.writeLine(formatApprovalOptions());

    const result = await this.prompt({
      message: 'Your approval decision',
      allowEmpty: false,
    });

    if (result.quit) {
      return false;
    }

    const decision = parseApprovalDecision(result.input);

    if (decision === undefined) {
      this.writeLine(formatWarning('Please select a valid option (1, 2, or 3).'));
      return this.handleApproval();
    }

    if (decision === 'Approve') {
      // Confirm all items
      const confirmResult = await this.prompt({
        message: "Type 'confirm all' to confirm all items, or list any concerns:",
        allowEmpty: false,
      });

      if (confirmResult.quit) {
        return false;
      }

      if (confirmResult.input.toLowerCase() !== 'confirm all') {
        this.writeLine(formatInfo('Please address your concerns and try again.'));
        return this.handleApproval();
      }

      // Record approval
      const entry = createTranscriptEntry(
        'Approval',
        'user',
        '[Approval] Approved - all items confirmed'
      );
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

      this.writeLine(formatSuccess('Specification approved!'));
      return true;
    }

    if (decision === 'ApproveWithConditions') {
      this.writeLine('Please specify your conditions (one per line, empty line to finish):');

      const conditions: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const lineResult = await this.prompt({
          message: '>',
          allowEmpty: true,
        });

        if (lineResult.quit) {
          return false;
        }

        if (lineResult.input.trim() === '') {
          break;
        }

        conditions.push(lineResult.input.trim());
      }

      if (conditions.length === 0) {
        this.writeLine(formatWarning('No conditions provided. Please try again.'));
        return await this.handleApproval();
      }

      // Record conditional approval
      const entry = createTranscriptEntry(
        'Approval',
        'user',
        `[Approval] Approved with conditions:\n${conditions.map((c) => `- ${c}`).join('\n')}`
      );
      this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

      this.writeLine(formatSuccess('Specification conditionally approved.'));
      this.writeLine(formatInfo('Conditions will be addressed in targeted revision.'));
      return true;
    }

    // Reject with feedback
    const feedbackResult = await this.prompt({
      message: 'Please provide feedback for revision:',
      allowEmpty: false,
    });

    if (feedbackResult.quit) {
      return false;
    }

    // Record rejection
    const entry = createTranscriptEntry(
      'Approval',
      'user',
      `[Approval] Rejected with feedback: ${feedbackResult.input}`
    );
    this.state = await appendTranscriptEntryAndUpdateState(this.projectId, entry, this.state);

    this.writeLine(formatWarning('Specification rejected. Returning to earlier phases.'));

    // Reset to Discovery for full revision
    this.state = {
      ...this.state,
      currentPhase: 'Discovery',
      completedPhases: [],
      updatedAt: new Date().toISOString(),
    };
    await saveInterviewState(this.state);

    return this.continueInterview();
  }

  /**
   * Closes the CLI and cleans up resources.
   */
  close(): void {
    this.reader.close();
  }
}

/**
 * Creates a readline-based input reader.
 *
 * @returns A Promise resolving to an InputReader using Node's readline.
 */
export async function createReadlineReader(): Promise<InputReader> {
  // Use dynamic import to avoid issues in test environments
  const readline = await import('node:readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    readLine(prompt: string): Promise<string> {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer);
        });
      });
    },
    close(): void {
      rl.close();
    },
  };
}
