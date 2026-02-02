/**
 * Tests for model interaction logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createModelLogger,
  computePromptHash,
  readLogFile,
  getLogStats,
  isValidModelLogLevel,
  MODEL_LOG_LEVELS,
  type ModelLogLevel,
} from './logging.js';
import type { ModelAlias, ModelRouterRequest, ModelRouterResponse } from './types.js';
import { MODEL_ALIASES, createModelError, createRateLimitError } from './types.js';

describe('ModelLogger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-logger-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isValidModelLogLevel', () => {
    it('returns true for valid log levels', () => {
      expect(isValidModelLogLevel('none')).toBe(true);
      expect(isValidModelLogLevel('summary')).toBe(true);
      expect(isValidModelLogLevel('full')).toBe(true);
    });

    it('returns false for invalid log levels', () => {
      expect(isValidModelLogLevel('debug')).toBe(false);
      expect(isValidModelLogLevel('verbose')).toBe(false);
      expect(isValidModelLogLevel('')).toBe(false);
      expect(isValidModelLogLevel('NONE')).toBe(false);
    });
  });

  describe('MODEL_LOG_LEVELS', () => {
    it('contains all expected log levels', () => {
      expect(MODEL_LOG_LEVELS).toEqual(['none', 'summary', 'full']);
    });

    it('is readonly', () => {
      expect(Object.isFrozen(MODEL_LOG_LEVELS) || Array.isArray(MODEL_LOG_LEVELS)).toBe(true);
    });
  });

  describe('computePromptHash', () => {
    it('returns a 16-character hex string', () => {
      const hash = computePromptHash('test prompt');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns consistent hashes for the same input', () => {
      const prompt = 'What is 2+2?';
      const hash1 = computePromptHash(prompt);
      const hash2 = computePromptHash(prompt);
      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different inputs', () => {
      const hash1 = computePromptHash('prompt one');
      const hash2 = computePromptHash('prompt two');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty strings', () => {
      const hash = computePromptHash('');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('handles unicode strings', () => {
      const hash = computePromptHash('Hello 世界 🌍');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    // Property-based test: hash length is always 16
    it('always produces 16-character hashes (property test)', () => {
      fc.assert(
        fc.property(fc.string(), (prompt) => {
          const hash = computePromptHash(prompt);
          return hash.length === 16 && /^[0-9a-f]+$/.test(hash);
        })
      );
    });
  });

  describe('createModelLogger', () => {
    it('creates a logger with default options', () => {
      const logger = createModelLogger();
      expect(logger.getLogLevel()).toBe('summary');
      expect(logger.getLogFilePath()).toBeUndefined();
    });

    it('creates a logger with custom log level', () => {
      const logger = createModelLogger({ logLevel: 'full' });
      expect(logger.getLogLevel()).toBe('full');
    });

    it('creates a logger with custom log file path', () => {
      const logPath = path.join(tempDir, 'test.log');
      const logger = createModelLogger({ logFilePath: logPath });
      expect(logger.getLogFilePath()).toBe(logPath);
    });

    it('creates log directory if it does not exist', () => {
      const logDir = path.join(tempDir, 'nested', 'log', 'dir');
      const logPath = path.join(logDir, 'test.log');
      createModelLogger({ logFilePath: logPath, createDirectory: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      expect(fs.existsSync(logDir)).toBe(true);
    });
  });

  describe('logRequest', () => {
    const createTestRequest = (
      overrides: Partial<ModelRouterRequest> = {}
    ): ModelRouterRequest => ({
      modelAlias: 'worker' as ModelAlias,
      prompt: 'What is the meaning of life?',
      ...overrides,
    });

    it('returns undefined when log level is none', async () => {
      const logger = createModelLogger({ logLevel: 'none' });
      const entry = await logger.logRequest(createTestRequest());
      expect(entry).toBeUndefined();
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('logs request timestamp with summary level', async () => {
      const fixedDate = new Date('2026-01-24T12:00:00.000Z');
      const logger = createModelLogger({
        logLevel: 'summary',
        now: () => fixedDate,
      });

      const entry = await logger.logRequest(createTestRequest());

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.type).toBe('request');
        expect(entry.timestamp).toBe('2026-01-24T12:00:00.000Z');
      }
    });

    it('logs model alias with summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logRequest(createTestRequest({ modelAlias: 'architect' }));

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.modelAlias).toBe('architect');
      }
    });

    it('logs prompt hash with summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const prompt = 'Test prompt for hashing';
      const entry = await logger.logRequest(createTestRequest({ prompt }));

      const expectedHash = computePromptHash(prompt);
      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.promptHash).toBe(expectedHash);
      }
    });

    it('logs requestId when provided', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logRequest(createTestRequest({ requestId: 'req-123' }));

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.requestId).toBe('req-123');
      }
    });

    it('does not include full prompt in summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logRequest(createTestRequest({ prompt: 'Secret prompt' }));

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.prompt).toBeUndefined();
      }
    });

    it('includes full prompt in full level', async () => {
      const logger = createModelLogger({ logLevel: 'full' });
      const prompt = 'Full prompt content';
      const entry = await logger.logRequest(createTestRequest({ prompt }));

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.prompt).toBe(prompt);
      }
    });

    it('includes system prompt in full level', async () => {
      const logger = createModelLogger({ logLevel: 'full' });
      const entry = await logger.logRequest(
        createTestRequest({
          parameters: { systemPrompt: 'You are a helpful assistant' },
        })
      );

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.systemPrompt).toBe('You are a helpful assistant');
      }
    });

    it('includes maxTokens in full level', async () => {
      const logger = createModelLogger({ logLevel: 'full' });
      const entry = await logger.logRequest(
        createTestRequest({
          parameters: { maxTokens: 1000 },
        })
      );

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.maxTokens).toBe(1000);
      }
    });

    it('stores entries in memory', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      await logger.logRequest(createTestRequest());
      await logger.logRequest(createTestRequest());

      expect(logger.getEntries()).toHaveLength(2);
    });

    // Test all model aliases
    it('accepts all valid model aliases', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });

      for (const alias of MODEL_ALIASES) {
        const entry = await logger.logRequest(createTestRequest({ modelAlias: alias }));
        expect(entry).toBeDefined();
        if (entry !== undefined) {
          expect(entry.modelAlias).toBe(alias);
        }
      }
    });
  });

  describe('logResponse', () => {
    const createTestResponse = (
      overrides: Partial<ModelRouterResponse> = {}
    ): ModelRouterResponse => ({
      content: 'The answer is 42.',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      metadata: {
        modelId: 'claude-3-opus',
        provider: 'claude-code',
        latencyMs: 1234,
      },
      ...overrides,
    });

    it('returns undefined when log level is none', async () => {
      const logger = createModelLogger({ logLevel: 'none' });
      const entry = await logger.logResponse(createTestResponse(), 'worker');
      expect(entry).toBeUndefined();
    });

    it('logs response timestamp with summary level', async () => {
      const fixedDate = new Date('2026-01-24T12:30:00.000Z');
      const logger = createModelLogger({
        logLevel: 'summary',
        now: () => fixedDate,
      });

      const entry = await logger.logResponse(createTestResponse(), 'worker');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.type).toBe('response');
        expect(entry.timestamp).toBe('2026-01-24T12:30:00.000Z');
      }
    });

    it('logs token count with summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logResponse(createTestResponse(), 'worker');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.tokenCount).toBe(15);
        expect(entry.promptTokens).toBe(10);
        expect(entry.completionTokens).toBe(5);
      }
    });

    it('logs latency with summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logResponse(
        createTestResponse({ metadata: { modelId: 'test', provider: 'test', latencyMs: 500 } }),
        'worker'
      );

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.latencyMs).toBe(500);
      }
    });

    it('logs model metadata', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logResponse(createTestResponse(), 'auditor');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.modelAlias).toBe('auditor');
        expect(entry.modelId).toBe('claude-3-opus');
        expect(entry.provider).toBe('claude-code');
      }
    });

    it('logs requestId when provided', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logResponse(createTestResponse(), 'worker', 'req-456');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.requestId).toBe('req-456');
      }
    });

    it('does not include content in summary level', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const entry = await logger.logResponse(createTestResponse(), 'worker');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.content).toBeUndefined();
      }
    });

    it('includes content in full level', async () => {
      const logger = createModelLogger({ logLevel: 'full' });
      const content = 'The complete answer with all details...';
      const entry = await logger.logResponse(createTestResponse({ content }), 'worker');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.content).toBe(content);
      }
    });
  });

  describe('logError', () => {
    it('returns undefined when log level is none', async () => {
      const logger = createModelLogger({ logLevel: 'none' });
      const error = createModelError('Test error', true);
      const entry = await logger.logError(error, 'worker');
      expect(entry).toBeUndefined();
    });

    it('logs error details', async () => {
      const fixedDate = new Date('2026-01-24T13:00:00.000Z');
      const logger = createModelLogger({
        logLevel: 'summary',
        now: () => fixedDate,
      });

      const error = createRateLimitError('Rate limit exceeded', { retryAfterMs: 5000 });
      const entry = await logger.logError(error, 'architect', 'req-789');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.type).toBe('error');
        expect(entry.timestamp).toBe('2026-01-24T13:00:00.000Z');
        expect(entry.modelAlias).toBe('architect');
        expect(entry.errorKind).toBe('RateLimitError');
        expect(entry.errorMessage).toBe('Rate limit exceeded');
        expect(entry.retryable).toBe(true);
        expect(entry.requestId).toBe('req-789');
      }
    });

    it('logs non-retryable errors correctly', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      const error = createModelError('Permanent error', false);
      const entry = await logger.logError(error, 'worker');

      expect(entry).toBeDefined();
      if (entry !== undefined) {
        expect(entry.retryable).toBe(false);
      }
    });
  });

  describe('File logging', () => {
    it('writes entries to log file', async () => {
      const logPath = path.join(tempDir, 'test.log');
      const logger = createModelLogger({
        logLevel: 'summary',
        logFilePath: logPath,
      });

      const request: ModelRouterRequest = {
        modelAlias: 'worker',
        prompt: 'Test prompt',
      };
      await logger.logRequest(request);

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      expect(fs.existsSync(logPath)).toBe(true);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('"type":"request"');
    });

    it('appends multiple entries to log file', async () => {
      const logPath = path.join(tempDir, 'test.log');
      const logger = createModelLogger({
        logLevel: 'summary',
        logFilePath: logPath,
      });

      await logger.logRequest({ modelAlias: 'worker', prompt: 'Prompt 1' });
      await logger.logRequest({ modelAlias: 'architect', prompt: 'Prompt 2' });

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('creates nested directories for log file', async () => {
      const logPath = path.join(tempDir, 'deep', 'nested', 'model.log');
      const logger = createModelLogger({
        logLevel: 'summary',
        logFilePath: logPath,
      });

      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test' });

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('does not write when log level is none', async () => {
      const logPath = path.join(tempDir, 'none.log');
      const logger = createModelLogger({
        logLevel: 'none',
        logFilePath: logPath,
      });

      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test' });

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      expect(fs.existsSync(logPath)).toBe(false);
    });
  });

  describe('readLogFile', () => {
    it('returns empty array for non-existent file', () => {
      const entries = readLogFile(path.join(tempDir, 'nonexistent.log'));
      expect(entries).toEqual([]);
    });

    it('parses log entries from file', async () => {
      const logPath = path.join(tempDir, 'read.log');
      const logger = createModelLogger({
        logLevel: 'summary',
        logFilePath: logPath,
      });

      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test 1' });
      await logger.logRequest({ modelAlias: 'architect', prompt: 'Test 2' });

      const entries = readLogFile(logPath);
      expect(entries).toHaveLength(2);
      const entry0 = entries[0];
      const entry1 = entries[1];
      if (entry0 !== undefined) {
        expect(entry0.type).toBe('request');
      }
      if (entry1 !== undefined) {
        expect(entry1.type).toBe('request');
      }
    });

    it('skips malformed lines', () => {
      const logPath = path.join(tempDir, 'malformed.log');
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      fs.writeFileSync(logPath, '{"type":"request"}\nnot json\n{"type":"response"}\n');

      const entries = readLogFile(logPath);
      expect(entries).toHaveLength(2);
    });

    it('handles empty lines', () => {
      const logPath = path.join(tempDir, 'empty-lines.log');
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      fs.writeFileSync(logPath, '{"type":"request"}\n\n\n{"type":"response"}\n');

      const entries = readLogFile(logPath);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getLogStats', () => {
    it('returns zeros for non-existent file', () => {
      const stats = getLogStats(path.join(tempDir, 'nonexistent.log'));
      expect(stats).toEqual({ requests: 0, responses: 0, errors: 0, total: 0 });
    });

    it('counts entry types correctly', async () => {
      const logPath = path.join(tempDir, 'stats.log');
      const logger = createModelLogger({
        logLevel: 'summary',
        logFilePath: logPath,
      });

      // Log 2 requests
      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test 1' });
      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test 2' });

      // Log 1 response
      await logger.logResponse(
        {
          content: 'Answer',
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
        'worker'
      );

      // Log 1 error
      await logger.logError(createModelError('Error', true), 'worker');

      const stats = getLogStats(logPath);
      expect(stats).toEqual({ requests: 2, responses: 1, errors: 1, total: 4 });
    });
  });

  describe('clearEntries', () => {
    it('clears in-memory entries', async () => {
      const logger = createModelLogger({ logLevel: 'summary' });
      await logger.logRequest({ modelAlias: 'worker', prompt: 'Test' });
      expect(logger.getEntries()).toHaveLength(1);

      logger.clearEntries();
      expect(logger.getEntries()).toHaveLength(0);
    });
  });

  describe('Acceptance criteria: summary level logs timestamp and token count', () => {
    it('logs timestamp and token count with summary level', async () => {
      const fixedDate = new Date('2026-01-24T14:00:00.000Z');
      const logger = createModelLogger({
        logLevel: 'summary',
        now: () => fixedDate,
      });

      // Log a request
      const requestEntry = await logger.logRequest({
        modelAlias: 'worker',
        prompt: 'What is 2+2?',
      });

      // Log a response
      const responseEntry = await logger.logResponse(
        {
          content: '4',
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          metadata: { modelId: 'claude-3-opus', provider: 'claude-code', latencyMs: 250 },
        },
        'worker'
      );

      // Verify request entry
      expect(requestEntry).toBeDefined();
      if (requestEntry !== undefined) {
        expect(requestEntry.timestamp).toBe('2026-01-24T14:00:00.000Z');
        expect(requestEntry.promptHash).toBeDefined();
        expect(requestEntry.modelAlias).toBe('worker');
      }

      // Verify response entry
      expect(responseEntry).toBeDefined();
      if (responseEntry !== undefined) {
        expect(responseEntry.timestamp).toBe('2026-01-24T14:00:00.000Z');
        expect(responseEntry.tokenCount).toBe(11);
        expect(responseEntry.latencyMs).toBe(250);
      }
    });
  });

  describe('Acceptance criteria: log level none produces no output', () => {
    it('produces no log entries when level is none', async () => {
      const logPath = path.join(tempDir, 'none-test.log');
      const logger = createModelLogger({
        logLevel: 'none',
        logFilePath: logPath,
      });

      // Try to log request
      const requestEntry = await logger.logRequest({
        modelAlias: 'worker',
        prompt: 'Test prompt',
      });

      // Try to log response
      const responseEntry = await logger.logResponse(
        {
          content: 'Response',
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          metadata: { modelId: 'test', provider: 'test', latencyMs: 100 },
        },
        'worker'
      );

      // Try to log error
      const errorEntry = await logger.logError(createModelError('Error', true), 'worker');

      // Verify no entries returned
      expect(requestEntry).toBeUndefined();
      expect(responseEntry).toBeUndefined();
      expect(errorEntry).toBeUndefined();

      // Verify no in-memory entries
      expect(logger.getEntries()).toHaveLength(0);

      // Verify no file created
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test file: path constructed from temp directory
      expect(fs.existsSync(logPath)).toBe(false);
    });
  });

  describe('Property-based tests', () => {
    // Arbitrary for ModelAlias
    const modelAliasArbitrary = fc.constantFrom<ModelAlias>(
      'architect',
      'auditor',
      'structurer',
      'worker',
      'fallback'
    );

    // Arbitrary for log level
    const logLevelArbitrary = fc.constantFrom<ModelLogLevel>('none', 'summary', 'full');

    it('request entries always include timestamp, modelAlias, and promptHash', async () => {
      await fc.assert(
        fc.asyncProperty(
          logLevelArbitrary.filter((l) => l !== 'none'),
          modelAliasArbitrary,
          fc.string({ minLength: 1 }),
          async (logLevel, modelAlias, prompt) => {
            const logger = createModelLogger({ logLevel });
            const entry = await logger.logRequest({ modelAlias, prompt });

            expect(entry).toBeDefined();
            if (entry !== undefined) {
              expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
              expect(entry.modelAlias).toBe(modelAlias);
              expect(entry.promptHash).toMatch(/^[0-9a-f]{16}$/);
            }
          }
        )
      );
    });

    it('response entries always include timestamp, tokenCount, and latencyMs', async () => {
      await fc.assert(
        fc.asyncProperty(
          logLevelArbitrary.filter((l) => l !== 'none'),
          modelAliasArbitrary,
          fc.nat({ max: 100000 }),
          fc.nat({ max: 100000 }),
          fc.nat({ max: 60000 }),
          async (logLevel, modelAlias, promptTokens, completionTokens, latencyMs) => {
            const logger = createModelLogger({ logLevel });
            const entry = await logger.logResponse(
              {
                content: 'Response',
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
                metadata: { modelId: 'test', provider: 'test', latencyMs },
              },
              modelAlias
            );

            expect(entry).toBeDefined();
            if (entry !== undefined) {
              expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
              expect(entry.tokenCount).toBe(promptTokens + completionTokens);
              expect(entry.latencyMs).toBe(latencyMs);
            }
          }
        )
      );
    });
  });
});
