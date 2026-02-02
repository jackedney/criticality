/**
 * Tests for Interview CLI interface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { safeMkdir } from '../utils/safe-fs.js';
import {
  formatSectionHeader,
  formatSubsectionHeader,
  formatPrompt,
  formatChoices,
  formatError,
  formatSuccess,
  formatWarning,
  formatInfo,
  formatProgress,
  formatUnderstandingSummary,
  formatResumeSummary,
  formatWelcomeMessage,
  formatPhaseIntro,
  formatEmptyInputError,
  formatResumeConfirmation,
  formatDelegationOptions,
  formatApprovalOptions,
  formatConfirmationItems,
  getPhaseDisplayName,
  getPhaseDescription,
  isQuitCommand,
  isHelpCommand,
  parseDelegationCommand,
  parseResumeConfirmation,
  parseApprovalDecision,
  groupRequirementsByCategory,
  InterviewCli,
  CLI_STYLES,
  type InputReader,
  type OutputWriter,
} from './cli.js';
import type { InterviewState, ExtractedRequirement, TranscriptEntry } from './types.js';
import { saveInterviewState, getInterviewDir } from './persistence.js';

describe('Interview CLI', () => {
  describe('formatSectionHeader', () => {
    it('creates a formatted header with title', () => {
      const result = formatSectionHeader('Test Header');

      expect(result).toContain('Test Header');
      expect(result).toContain(CLI_STYLES.BOLD);
      expect(result).toContain(CLI_STYLES.RESET);
      expect(result).toContain('═');
    });

    it('uses minimum width of 40 characters', () => {
      const result = formatSectionHeader('Hi');

      expect(result).toContain('═'.repeat(40));
    });
  });

  describe('formatSubsectionHeader', () => {
    it('creates a formatted subsection header', () => {
      const result = formatSubsectionHeader('Subsection');

      expect(result).toContain('Subsection');
      expect(result).toContain(CLI_STYLES.BOLD);
      expect(result).toContain('─');
    });
  });

  describe('formatPrompt', () => {
    it('formats prompt message', () => {
      const result = formatPrompt('Enter value');

      expect(result).toContain('Enter value');
      expect(result).toContain('> ');
    });

    it('includes hint when provided', () => {
      const result = formatPrompt('Enter value', 'This is a hint');

      expect(result).toContain('Enter value');
      expect(result).toContain('This is a hint');
      expect(result).toContain(CLI_STYLES.DIM);
    });
  });

  describe('formatChoices', () => {
    it('formats multiple choices with numbers', () => {
      const result = formatChoices(['Option A', 'Option B', 'Option C']);

      expect(result).toContain('[1]');
      expect(result).toContain('Option A');
      expect(result).toContain('[2]');
      expect(result).toContain('Option B');
      expect(result).toContain('[3]');
      expect(result).toContain('Option C');
    });

    it('handles empty choices', () => {
      const result = formatChoices([]);

      expect(result).toBe('');
    });
  });

  describe('formatError', () => {
    it('formats error with red color', () => {
      const result = formatError('Something went wrong');

      expect(result).toContain('Error:');
      expect(result).toContain('Something went wrong');
      expect(result).toContain(CLI_STYLES.RED);
    });
  });

  describe('formatSuccess', () => {
    it('formats success with green color and checkmark', () => {
      const result = formatSuccess('Operation completed');

      expect(result).toContain('✓');
      expect(result).toContain('Operation completed');
      expect(result).toContain(CLI_STYLES.GREEN);
    });
  });

  describe('formatWarning', () => {
    it('formats warning with yellow color', () => {
      const result = formatWarning('Be careful');

      expect(result).toContain('⚠');
      expect(result).toContain('Be careful');
      expect(result).toContain(CLI_STYLES.YELLOW);
    });
  });

  describe('formatInfo', () => {
    it('formats info with cyan color', () => {
      const result = formatInfo('FYI');

      expect(result).toContain('ℹ');
      expect(result).toContain('FYI');
      expect(result).toContain(CLI_STYLES.CYAN);
    });
  });

  describe('getPhaseDisplayName', () => {
    it('returns correct display name for each phase', () => {
      expect(getPhaseDisplayName('Discovery')).toBe('Discovery');
      expect(getPhaseDisplayName('Architecture')).toBe('Architecture');
      expect(getPhaseDisplayName('Constraints')).toBe('Constraints');
      expect(getPhaseDisplayName('DesignPreferences')).toBe('Design Preferences');
      expect(getPhaseDisplayName('Synthesis')).toBe('Synthesis');
      expect(getPhaseDisplayName('Approval')).toBe('Approval');
    });
  });

  describe('getPhaseDescription', () => {
    it('returns description for each phase', () => {
      expect(getPhaseDescription('Discovery')).toContain('requirements');
      expect(getPhaseDescription('Architecture')).toContain('structure');
      expect(getPhaseDescription('Constraints')).toContain('constraints');
      expect(getPhaseDescription('DesignPreferences')).toContain('preferences');
      expect(getPhaseDescription('Synthesis')).toContain('synthesize');
      expect(getPhaseDescription('Approval')).toContain('approve');
    });
  });

  describe('formatProgress', () => {
    it('shows completed phases with checkmarks', () => {
      const result = formatProgress('Architecture', ['Discovery']);

      expect(result).toContain('✓');
      expect(result).toContain('Discovery');
      expect(result).toContain(CLI_STYLES.GREEN);
    });

    it('shows current phase with arrow', () => {
      const result = formatProgress('Architecture', ['Discovery']);

      expect(result).toContain('▶');
      expect(result).toContain('Architecture');
      expect(result).toContain(CLI_STYLES.CYAN);
    });

    it('shows future phases with circle', () => {
      const result = formatProgress('Discovery', []);

      expect(result).toContain('○');
    });
  });

  describe('groupRequirementsByCategory', () => {
    it('groups requirements by category', () => {
      const requirements: ExtractedRequirement[] = [
        {
          id: 'req1',
          sourcePhase: 'Discovery',
          category: 'functional',
          text: 'Functional req 1',
          confidence: 'high',
          extractedAt: new Date().toISOString(),
        },
        {
          id: 'req2',
          sourcePhase: 'Discovery',
          category: 'functional',
          text: 'Functional req 2',
          confidence: 'high',
          extractedAt: new Date().toISOString(),
        },
        {
          id: 'req3',
          sourcePhase: 'Constraints',
          category: 'constraint',
          text: 'Constraint req',
          confidence: 'medium',
          extractedAt: new Date().toISOString(),
        },
      ];

      const grouped = groupRequirementsByCategory(requirements);

      expect(grouped.get('functional')).toHaveLength(2);
      expect(grouped.get('constraint')).toHaveLength(1);
      expect(grouped.get('preference')).toBeUndefined();
    });

    it('handles empty requirements', () => {
      const grouped = groupRequirementsByCategory([]);

      expect(grouped.size).toBe(0);
    });
  });

  describe('formatUnderstandingSummary', () => {
    it('includes section header', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'test',
        currentPhase: 'Discovery',
        completedPhases: [],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = formatUnderstandingSummary(state);

      expect(result).toContain("Here's what I understand so far");
    });

    it('shows requirements grouped by category', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'test',
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [
          {
            id: 'req1',
            sourcePhase: 'Discovery',
            category: 'functional',
            text: 'Build a web app',
            confidence: 'high',
            extractedAt: new Date().toISOString(),
          },
        ],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = formatUnderstandingSummary(state);

      expect(result).toContain('Functional Requirements');
      expect(result).toContain('Build a web app');
      expect(result).toContain('[high]');
    });

    it('shows delegation points', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'test',
        currentPhase: 'Synthesis',
        completedPhases: ['Discovery', 'Architecture', 'Constraints'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [
          {
            phase: 'Constraints',
            decision: 'Delegate',
            delegatedAt: new Date().toISOString(),
          },
        ],
        transcriptEntryCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = formatUnderstandingSummary(state);

      expect(result).toContain('Delegated Decisions');
      expect(result).toContain('Constraints');
      expect(result).toContain('delegated to Architect');
    });

    it('shows message when no requirements', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'test',
        currentPhase: 'Discovery',
        completedPhases: [],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = formatUnderstandingSummary(state);

      expect(result).toContain('No requirements captured yet');
    });
  });

  describe('formatResumeSummary', () => {
    it('includes project info', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'my-project',
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
      };

      const result = formatResumeSummary(state, []);

      expect(result).toContain('Resuming Interview');
      expect(result).toContain('my-project');
    });

    it('includes recent transcript entries', () => {
      const state: InterviewState = {
        version: '1.0.0',
        projectId: 'test',
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const transcript: TranscriptEntry[] = [
        {
          id: 't1',
          phase: 'Discovery',
          role: 'assistant',
          content: 'What would you like to build?',
          timestamp: new Date().toISOString(),
        },
        {
          id: 't2',
          phase: 'Discovery',
          role: 'user',
          content: 'A web application',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = formatResumeSummary(state, transcript);

      expect(result).toContain('Recent Conversation');
      expect(result).toContain('Architect');
      expect(result).toContain('You');
    });
  });

  describe('formatWelcomeMessage', () => {
    it('includes project name', () => {
      const result = formatWelcomeMessage('my-app');

      expect(result).toContain('my-app');
      expect(result).toContain('Criticality Protocol');
    });

    it('lists all phases', () => {
      const result = formatWelcomeMessage('test');

      expect(result).toContain('Discovery');
      expect(result).toContain('Architecture');
      expect(result).toContain('Constraints');
      expect(result).toContain('Design Preferences');
      expect(result).toContain('Synthesis');
      expect(result).toContain('Approval');
    });

    it('includes quit instructions', () => {
      const result = formatWelcomeMessage('test');

      expect(result).toContain('quit');
      expect(result).toContain('save');
    });
  });

  describe('formatPhaseIntro', () => {
    it('shows phase name and description', () => {
      const result = formatPhaseIntro('Discovery', []);

      expect(result).toContain('Discovery');
      expect(result).toContain('requirements');
    });

    it('shows delegation hint for delegable phases', () => {
      const result = formatPhaseIntro('Constraints', ['Discovery', 'Architecture']);

      expect(result).toContain('delegate');
    });

    it('does not show delegation hint for required phases', () => {
      const result = formatPhaseIntro('Discovery', []);

      expect(result).not.toContain('delegated');
    });
  });

  describe('formatEmptyInputError', () => {
    it('shows error message', () => {
      const result = formatEmptyInputError();

      expect(result).toContain('Empty input');
      expect(result).toContain('Error');
    });

    it('provides help options', () => {
      const result = formatEmptyInputError();

      expect(result).toContain('quit');
      expect(result).toContain('help');
    });
  });

  describe('formatResumeConfirmation', () => {
    it('shows options', () => {
      const result = formatResumeConfirmation();

      expect(result).toContain('continue');
      expect(result).toContain('correct');
      expect(result).toContain('Quit');
    });
  });

  describe('formatDelegationOptions', () => {
    it('shows delegation choices', () => {
      const result = formatDelegationOptions();

      expect(result).toContain('Continue');
      expect(result).toContain('Delegate');
      expect(result).toContain('notes');
    });
  });

  describe('formatApprovalOptions', () => {
    it('shows approval choices', () => {
      const result = formatApprovalOptions();

      expect(result).toContain('Approve');
      expect(result).toContain('conditions');
      expect(result).toContain('feedback');
    });
  });

  describe('formatConfirmationItems', () => {
    it('shows all confirmation items', () => {
      const result = formatConfirmationItems();

      expect(result).toContain('System boundaries');
      expect(result).toContain('Data models');
      expect(result).toContain('Key constraints');
      expect(result).toContain('Testable claims');
    });
  });

  describe('isQuitCommand', () => {
    it('recognizes quit commands', () => {
      expect(isQuitCommand('quit')).toBe(true);
      expect(isQuitCommand('QUIT')).toBe(true);
      expect(isQuitCommand('q')).toBe(true);
      expect(isQuitCommand('Q')).toBe(true);
      expect(isQuitCommand('exit')).toBe(true);
      expect(isQuitCommand('EXIT')).toBe(true);
    });

    it('rejects non-quit commands', () => {
      expect(isQuitCommand('hello')).toBe(false);
      expect(isQuitCommand('continue')).toBe(false);
      expect(isQuitCommand('')).toBe(false);
    });

    it('handles whitespace', () => {
      expect(isQuitCommand('  quit  ')).toBe(true);
      expect(isQuitCommand('\tq\n')).toBe(true);
    });
  });

  describe('isHelpCommand', () => {
    it('recognizes help commands', () => {
      expect(isHelpCommand('help')).toBe(true);
      expect(isHelpCommand('HELP')).toBe(true);
      expect(isHelpCommand('h')).toBe(true);
      expect(isHelpCommand('?')).toBe(true);
    });

    it('rejects non-help commands', () => {
      expect(isHelpCommand('hello')).toBe(false);
      expect(isHelpCommand('')).toBe(false);
    });
  });

  describe('parseDelegationCommand', () => {
    it('parses delegate command', () => {
      const result = parseDelegationCommand('delegate');

      expect(result).toEqual({ decision: 'Delegate' });
    });

    it('parses delegate with notes', () => {
      const result = parseDelegationCommand('delegate with notes: Use REST API');

      expect(result).toEqual({ decision: 'DelegateWithNotes', notes: 'Use REST API' });
    });

    it('parses continue option', () => {
      expect(parseDelegationCommand('1')).toEqual({ decision: 'Continue' });
      expect(parseDelegationCommand('continue')).toEqual({ decision: 'Continue' });
    });

    it('parses delegate option by number', () => {
      expect(parseDelegationCommand('2')).toEqual({ decision: 'Delegate' });
    });

    it('parses delegate with notes option', () => {
      const result = parseDelegationCommand('3');

      expect(result?.decision).toBe('DelegateWithNotes');
    });

    it('returns undefined for unrecognized input', () => {
      expect(parseDelegationCommand('hello')).toBeUndefined();
      expect(parseDelegationCommand('')).toBeUndefined();
    });
  });

  describe('parseResumeConfirmation', () => {
    it('parses continue options', () => {
      expect(parseResumeConfirmation('1')).toBe('continue');
      expect(parseResumeConfirmation('yes')).toBe('continue');
      expect(parseResumeConfirmation('y')).toBe('continue');
      expect(parseResumeConfirmation('continue')).toBe('continue');
    });

    it('parses correct options', () => {
      expect(parseResumeConfirmation('2')).toBe('correct');
      expect(parseResumeConfirmation('no')).toBe('correct');
      expect(parseResumeConfirmation('n')).toBe('correct');
      expect(parseResumeConfirmation('correct')).toBe('correct');
    });

    it('parses quit options', () => {
      expect(parseResumeConfirmation('3')).toBe('quit');
      expect(parseResumeConfirmation('quit')).toBe('quit');
      expect(parseResumeConfirmation('q')).toBe('quit');
    });

    it('defaults to continue for unrecognized input', () => {
      expect(parseResumeConfirmation('something')).toBe('continue');
    });
  });

  describe('parseApprovalDecision', () => {
    it('parses approve options', () => {
      expect(parseApprovalDecision('1')).toBe('Approve');
      expect(parseApprovalDecision('approve')).toBe('Approve');
      expect(parseApprovalDecision('approved')).toBe('Approve');
    });

    it('parses approve with conditions', () => {
      expect(parseApprovalDecision('2')).toBe('ApproveWithConditions');
      expect(parseApprovalDecision('conditions')).toBe('ApproveWithConditions');
      expect(parseApprovalDecision('approve with conditions')).toBe('ApproveWithConditions');
    });

    it('parses reject', () => {
      expect(parseApprovalDecision('3')).toBe('RejectWithFeedback');
      expect(parseApprovalDecision('reject')).toBe('RejectWithFeedback');
      expect(parseApprovalDecision('reject with feedback')).toBe('RejectWithFeedback');
    });

    it('returns undefined for unrecognized input', () => {
      expect(parseApprovalDecision('hello')).toBeUndefined();
      expect(parseApprovalDecision('')).toBeUndefined();
    });
  });

  describe('InterviewCli', () => {
    let projectId: string;
    let mockReader: InputReader;
    let mockWriter: OutputWriter;
    let outputLines: string[];
    let inputQueue: string[];
    let tempDir: string;

    beforeEach(async () => {
      // Create temp directory and mock homedir to use it
      tempDir = await mkdtemp(join(os.tmpdir(), 'criticality-test-'));
      vi.spyOn(os, 'homedir').mockReturnValue(tempDir);

      projectId = `test-project-${String(Date.now())}`;

      // Create mock project directory inside temp homedir
      const interviewDir = getInterviewDir(projectId);
      await safeMkdir(interviewDir, { recursive: true });

      outputLines = [];
      inputQueue = [];

      mockWriter = {
        writeLine: (text: string): void => {
          outputLines.push(text);
        },
        write: (text: string): void => {
          outputLines.push(text);
        },
      };

      mockReader = {
        readLine: vi.fn().mockImplementation((_prompt: string): Promise<string> => {
          const next = inputQueue.shift();
          return Promise.resolve(next ?? 'quit');
        }),
        close: vi.fn().mockImplementation((): void => {
          // No-op for testing
        }),
      };
    });

    afterEach(async () => {
      // Restore homedir mock before cleanup
      vi.restoreAllMocks();

      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch((): void => {
        // Ignore cleanup errors
      });
    });

    it('creates instance with project ID', () => {
      const cli = new InterviewCli(projectId, mockReader, mockWriter);

      expect(cli.getState()).toBeUndefined();
    });

    it('displays welcome message for new interview', async () => {
      inputQueue = ['quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const output = outputLines.join('\n');
      expect(output).toContain('Criticality Protocol');
      expect(output).toContain(projectId);
    });

    it('shows resume summary for existing interview', async () => {
      // Create existing state
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [
          {
            id: 'req1',
            sourcePhase: 'Discovery',
            category: 'functional',
            text: 'Build a web app',
            confidence: 'high',
            extractedAt: new Date().toISOString(),
          },
        ],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      inputQueue = ['quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const output = outputLines.join('\n');
      expect(output).toContain('Resuming Interview');
      expect(output).toContain("Here's what I understand so far");
      expect(output).toContain('Build a web app');
    });

    it('handles quit command during prompts', async () => {
      inputQueue = ['quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      const result = await cli.run();

      expect(result).toBe(false);
      expect(outputLines.join('\n')).toContain('save');
    });

    it('handles empty input with re-prompt', async () => {
      // First input empty, then provide answer, then quit
      inputQueue = ['', 'My project description', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const output = outputLines.join('\n');
      // Should have shown empty input error
      expect(output).toContain('Empty input');
    });

    it('records response and advances phase', async () => {
      // Answer first question, then quit
      inputQueue = ['I want to build a task manager', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const state = cli.getState();
      expect(state).toBeDefined();
      expect(state?.extractedRequirements.length).toBeGreaterThan(0);
    });

    it('handles delegation command', async () => {
      // Create state at Constraints phase
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Constraints',
        completedPhases: ['Discovery', 'Architecture'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Resume with continue, then delegate
      inputQueue = ['1', 'delegate', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const state = cli.getState();
      expect(state?.delegationPoints.length).toBe(1);
      expect(state?.delegationPoints[0]?.phase).toBe('Constraints');
    });

    it('re-prompts when user chooses Continue in delegable phase', async () => {
      // Create state at Constraints phase (delegable)
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Constraints',
        completedPhases: ['Discovery', 'Architecture'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Resume with 'continue', then provide actual answer
      inputQueue = ['1', 'System must handle 1000 concurrent users', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const state = cli.getState();
      expect(state?.delegationPoints.length).toBe(0);

      // Verify the actual answer was recorded, not 'continue'
      const requirement = state?.extractedRequirements.find(
        (req) => req.sourcePhase === 'Constraints'
      );
      expect(requirement).toBeDefined();
      expect(requirement?.text).toBe('System must handle 1000 concurrent users');
      expect(requirement?.text).not.toBe('continue');
      expect(requirement?.text).not.toBe('1');
    });

    it('re-prompts when user types "continue" text', async () => {
      // Create state at Constraints phase (delegable)
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Constraints',
        completedPhases: ['Discovery', 'Architecture'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Type "continue", then provide actual answer
      inputQueue = ['continue', 'Max response time 200ms', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const state = cli.getState();

      // Verify the actual answer was recorded, not 'continue'
      const requirement = state?.extractedRequirements.find(
        (req) => req.sourcePhase === 'Constraints'
      );
      expect(requirement).toBeDefined();
      expect(requirement?.text).toBe('Max response time 200ms');
      expect(requirement?.text).not.toBe('continue');
    });

    it('handles quit during Continue re-prompt', async () => {
      // Create state at Constraints phase (delegable)
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Constraints',
        completedPhases: ['Discovery', 'Architecture'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Resume with 'continue', then quit
      inputQueue = ['1', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const state = cli.getState();

      // Verify phase was not completed
      expect(state?.currentPhase).toBe('Constraints');
      expect(state?.extractedRequirements.length).toBe(0);
    });

    it('handles resume confirmation - continue', async () => {
      // Create existing state
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Continue from resume, then answer, then quit
      inputQueue = ['1', 'System architecture', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const output = outputLines.join('\n');
      expect(output).toContain('Architecture');
    });

    it('handles resume confirmation - correct', async () => {
      // Create existing state
      const existingState: InterviewState = {
        version: '1.0.0',
        projectId,
        currentPhase: 'Architecture',
        completedPhases: ['Discovery'],
        extractedRequirements: [],
        features: [],
        delegationPoints: [],
        transcriptEntryCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInterviewState(existingState);

      // Correct from resume, select first phase, then quit
      inputQueue = ['2', '1', 'quit'];

      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      await cli.run();

      const output = outputLines.join('\n');
      expect(output).toContain('What would you like to correct');
    });

    it('closes reader on close', () => {
      const cli = new InterviewCli(projectId, mockReader, mockWriter);
      cli.close();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockReader.close).toHaveBeenCalled();
    });
  });
});
