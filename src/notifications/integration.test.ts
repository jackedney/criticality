/**
 * Integration tests for notification system.
 *
 * Tests end-to-end notification behavior including:
 * - NotificationService with mocked webhook endpoints
 * - ReminderScheduler state persistence and loading
 * - Orchestrator integration triggers correct notifications
 * - CLI commands check reminders correctly
 * - Multiple channels receive notifications
 * - Blocking state triggers webhook POST with correct payload
 * - Failed webhook doesn't affect protocol execution
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { NotificationService as NotificationServiceImpl } from './service.js';
import { ReminderScheduler } from './reminder.js';
import { createOrchestrator, type ExternalOperations } from '../protocol/orchestrator.js';
import { createActiveSubstate, type ProtocolPhase } from '../protocol/types.js';
import type { BlockingRecord } from '../protocol/blocking.js';
import type { NotificationConfig } from '../config/types.js';
import type {
  NotificationService as INotificationService,
  NotificationSendResult,
} from './types.js';
import type { ArtifactType } from '../protocol/transitions.js';
import * as path from 'node:path';

// Type for reminder state file
interface ReminderState {
  enabled: boolean;
  last_sent?: string;
  next_scheduled?: string;
}

// Type for webhook payload
interface WebhookPayload {
  event: string;
  timestamp: string;
  blocking_record: {
    id: string;
    phase: string;
    query: string;
    options?: string[];
    blockedAt: string;
    timeoutMs?: number;
    resolved: boolean;
  };
  protocol_state: {
    phase: string;
    substate: {
      kind: string;
    };
  };
}

describe('Notification Integration Tests', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;
  let testStateDir: string;
  let testStatePath: string;
  let reminderStatePath: string;

  beforeEach(async () => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    testStateDir = await mkdtemp(path.join(tmpdir(), 'integration-test-'));
    testStatePath = path.join(testStateDir, 'test-state.json');
    reminderStatePath = path.join(testStateDir, 'notification-state.json');
  });

  afterEach(async () => {
    try {
      await rm(testStateDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    global.fetch = originalFetch;
    mockFetch.mockReset();
  });

  describe('NotificationService with mocked webhook endpoints', () => {
    it('should send notification to multiple webhook endpoints', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://webhook1.example.com/hook',
            enabled: true,
            events: ['block', 'complete', 'error', 'phase_change'],
          },
          {
            type: 'webhook',
            endpoint: 'https://webhook2.example.com/hook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const service = new NotificationServiceImpl(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-1',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.allSucceeded).toBe(true);
      expect(result.anySucceeded).toBe(true);
      expect(result.results).toHaveLength(2);

      const firstCall = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(firstCall[0]).toBe('https://webhook1.example.com/hook');
      expect(firstCall[1].method).toBe('POST');
      expect(firstCall[1].headers).toHaveProperty('Content-Type', 'application/json');

      const secondCall = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(secondCall[0]).toBe('https://webhook2.example.com/hook');
      expect(secondCall[1].method).toBe('POST');
    });

    it('should filter channels by event type', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://webhook1.example.com/hook',
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: 'https://webhook2.example.com/hook',
            enabled: true,
            events: ['complete'],
          },
        ],
        reminder_schedule: undefined,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const service = new NotificationServiceImpl(config);

      const protocolState = {
        phase: 'Complete' as ProtocolPhase,
        substate: createActiveSubstate(),
      };

      const result = await service.notify('complete', protocolState);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.channel.endpoint).toBe('https://webhook2.example.com/hook');
    });
  });

  describe('ReminderScheduler state persistence and loading', () => {
    it('should persist and load reminder state', async () => {
      const mockNotificationService: INotificationService = {
        send(): Promise<NotificationSendResult> {
          return Promise.resolve({
            results: [],
            allSucceeded: true,
            anySucceeded: false,
          });
        },
        hasSubscribers() {
          return true;
        },
      };

      const scheduler1 = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir: testStateDir,
        enabled: true,
      });

      await scheduler1.initialize();

      const blockedAt = new Date('2024-01-15T08:00:00.000Z');
      const nextScheduled = await scheduler1.scheduleReminder(blockedAt);

      expect(nextScheduled).toBe('2024-01-15T09:00:00.000Z');

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-3',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: blockedAt.toISOString(),
        resolved: false,
      };

      await scheduler1.checkAndSendReminder(new Date('2024-01-15T09:00:00.000Z'), blockingRecord);

      const stateData = JSON.parse(readFileSync(reminderStatePath, 'utf-8')) as ReminderState;

      expect(stateData.enabled).toBe(true);
      expect(stateData.last_sent).toBeDefined();
      expect(stateData.next_scheduled).toBeDefined();

      const scheduler2 = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir: testStateDir,
        enabled: true,
      });

      await scheduler2.initialize();

      expect(scheduler2.getNextScheduled()).toBe(stateData.next_scheduled);
      expect(scheduler2.getLastSent()).toBe(stateData.last_sent);
    });

    it('should handle missing state file gracefully', async () => {
      const mockNotificationService: INotificationService = {
        send(): Promise<NotificationSendResult> {
          return Promise.resolve({
            results: [],
            allSucceeded: true,
            anySucceeded: false,
          });
        },
        hasSubscribers() {
          return true;
        },
      };

      const scheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir: testStateDir,
        enabled: true,
      });

      await scheduler.initialize();

      expect(scheduler.getNextScheduled()).toBeUndefined();
      expect(scheduler.getLastSent()).toBeUndefined();
      expect(scheduler.isEnabled()).toBe(true);
    });
  });

  describe('Orchestrator integration triggers correct notifications', () => {
    it('should send block notification when entering blocking state', async () => {
      const notificationCalls: Array<{ event: string }> = [];

      const mockNotificationService: INotificationService = {
        send(_event: string, _payload: { event: string }): Promise<NotificationSendResult> {
          notificationCalls.push({ event: _event });
          return Promise.resolve({
            results: [],
            allSucceeded: true,
            anySucceeded: false,
          });
        },
        hasSubscribers() {
          return true;
        },
      };

      const mockOperations: ExternalOperations = {
        executeModelCall() {
          return Promise.resolve({ success: true });
        },
        runCompilation() {
          return Promise.resolve({ success: true });
        },
        runTests() {
          return Promise.resolve({ success: true });
        },
        archivePhaseArtifacts() {
          return Promise.resolve({ success: true });
        },
        sendBlockingNotification() {
          return Promise.resolve();
        },
      };

      const orchestrator = await createOrchestrator({
        statePath: testStatePath,
        operations: mockOperations,
        notificationService: mockNotificationService as unknown as NotificationServiceImpl,
      });

      orchestrator.addArtifact('latticeCode' as ArtifactType);

      const result = await orchestrator.tick();

      expect(result.snapshot.state.substate.kind).toBe('Blocking');

      const blockNotification = notificationCalls.find((c) => c.event === 'block');
      expect(blockNotification).toBeDefined();
    });

    it('should send phase_change notification on phase transition', async () => {
      const notificationCalls: Array<{ event: string }> = [];

      const mockNotificationService: INotificationService = {
        send(_event: string, _payload: { event: string }): Promise<NotificationSendResult> {
          notificationCalls.push({ event: _event });
          return Promise.resolve({
            results: [],
            allSucceeded: true,
            anySucceeded: false,
          });
        },
        hasSubscribers() {
          return true;
        },
      };

      const mockOperations: ExternalOperations = {
        executeModelCall() {
          return Promise.resolve({ success: true, artifacts: ['spec'] });
        },
        runCompilation() {
          return Promise.resolve({ success: true });
        },
        runTests() {
          return Promise.resolve({ success: true });
        },
        archivePhaseArtifacts() {
          return Promise.resolve({ success: true });
        },
        sendBlockingNotification() {
          return Promise.resolve();
        },
      };

      const orchestrator = await createOrchestrator({
        statePath: testStatePath,
        operations: mockOperations,
        notificationService: mockNotificationService as unknown as NotificationServiceImpl,
      });

      await orchestrator.tick();

      const phaseChangeNotification = notificationCalls.find((c) => c.event === 'phase_change');
      expect(phaseChangeNotification).toBeDefined();
    });
  });

  describe('CLI commands check reminders correctly', () => {
    it('should send reminder when due and blocked', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://example.com/webhook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: '0 9 * * *',
      };

      const notificationService = new NotificationServiceImpl(config);

      const scheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService,
        stateDir: testStateDir,
        enabled: true,
      });

      await scheduler.initialize();

      const blockedAt = new Date('2024-01-15T08:00:00.000Z');
      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-4',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: blockedAt.toISOString(),
        resolved: false,
      };

      await scheduler.scheduleReminder(blockedAt);

      const checkTime = new Date('2024-01-15T09:00:00.000Z');
      const result = await scheduler.checkAndSendReminder(checkTime, blockingRecord);

      expect(result.sent).toBe(true);
      if (result.sent) {
        expect(result.lastSent).toBe('2024-01-15T09:00:00.000Z');
        expect(result.nextScheduled).toBeDefined();
      }
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not send reminder when not blocked', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://example.com/webhook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: '0 9 * * *',
      };

      const notificationService = new NotificationServiceImpl(config);

      const scheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService,
        stateDir: testStateDir,
        enabled: true,
      });

      await scheduler.initialize();

      const resolvedBlockingRecord: BlockingRecord = {
        id: 'blocking-test-5',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: new Date('2024-01-15T08:00:00.000Z').toISOString(),
        resolved: true,
        resolution: {
          queryId: 'blocking-test-5',
          response: 'Response',
          resolvedAt: new Date('2024-01-15T08:30:00.000Z').toISOString(),
        },
      };

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        resolvedBlockingRecord
      );

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect((result as { sent: false; reason: string }).reason).toBe('not_blocked');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Multiple channels receive notifications', () => {
    it('should send to all enabled channels for event', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://webhook1.example.com/hook',
            enabled: true,
            events: ['block', 'complete'],
          },
          {
            type: 'webhook',
            endpoint: 'https://webhook2.example.com/hook',
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: 'https://webhook3.example.com/hook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const service = new NotificationServiceImpl(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-6',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.results).toHaveLength(3);
      expect(result.allSucceeded).toBe(true);
      expect(result.anySucceeded).toBe(true);

      const endpoints = mockFetch.mock.calls.map((call) => call[0] as string);
      expect(endpoints).toContain('https://webhook1.example.com/hook');
      expect(endpoints).toContain('https://webhook2.example.com/hook');
      expect(endpoints).toContain('https://webhook3.example.com/hook');
    });
  });

  describe('Blocking state triggers webhook POST with correct payload', () => {
    it('should send webhook with correct BlockingRecord structure', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://example.com/webhook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      let receivedPayload: string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        if (options.body) {
          receivedPayload = options.body as string;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response);
      });

      const service = new NotificationServiceImpl(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-7',
        phase: 'Ignition',
        query: 'Should I proceed with this approach?',
        options: ['Yes', 'No', 'Maybe'],
        blockedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
        timeoutMs: 300000,
        resolved: false,
      };

      await service.notify('block', blockingRecord);

      expect(receivedPayload).toBeDefined();

      const payload = JSON.parse(receivedPayload ?? '{}') as WebhookPayload;

      expect(payload).toHaveProperty('event', 'block');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('blocking_record');
      expect(payload).toHaveProperty('protocol_state');

      expect(payload.blocking_record).toHaveProperty('id', 'blocking-test-7');
      expect(payload.blocking_record).toHaveProperty('phase', 'Ignition');
      expect(payload.blocking_record).toHaveProperty(
        'query',
        'Should I proceed with this approach?'
      );
      expect(payload.blocking_record).toHaveProperty('options');
      expect(payload.blocking_record.options).toEqual(['Yes', 'No', 'Maybe']);
      expect(payload.blocking_record).toHaveProperty('blockedAt', '2024-01-15T10:00:00.000Z');
      expect(payload.blocking_record).toHaveProperty('timeoutMs', 300000);
      expect(payload.blocking_record).toHaveProperty('resolved', false);

      expect(payload.protocol_state).toHaveProperty('phase', 'Ignition');
      expect(payload.protocol_state).toHaveProperty('substate');
      expect(payload.protocol_state.substate).toHaveProperty('kind', 'Blocking');
    });
  });

  describe('Failed webhook does not affect protocol execution', () => {
    it('should continue execution even when webhook fails', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://example.com/failing-webhook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      mockFetch.mockRejectedValue(new Error('Network error'));

      const service = new NotificationServiceImpl(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-8',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.allSucceeded).toBe(false);
      expect(result.anySucceeded).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.success).toBe(false);
      if (result.results[0] && !result.results[0].success) {
        expect((result.results[0] as { success: false; error: string }).error).toBeDefined();
      }

      const mockOperations: ExternalOperations = {
        executeModelCall() {
          return Promise.resolve({ success: true });
        },
        runCompilation() {
          return Promise.resolve({ success: true });
        },
        runTests() {
          return Promise.resolve({ success: true });
        },
        archivePhaseArtifacts() {
          return Promise.resolve({ success: true });
        },
        sendBlockingNotification() {
          return Promise.resolve();
        },
      };

      const orchestrator = await createOrchestrator({
        statePath: testStatePath,
        operations: mockOperations,
        notificationService: service as unknown as NotificationServiceImpl,
      });

      orchestrator.addArtifact('latticeCode' as ArtifactType);

      const tickResult = await orchestrator.tick();

      expect(tickResult.transitioned).toBe(true);
      expect(tickResult.snapshot.state.substate.kind).toBe('Blocking');
      expect(tickResult.shouldContinue).toBe(false);
    });

    it('should aggregate results when some webhooks succeed and others fail', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: 'https://example.com/working-webhook',
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: 'https://example.com/failing-webhook',
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const service = new NotificationServiceImpl(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking-test-9',
        phase: 'Ignition',
        query: 'Test blocking query',
        blockedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.allSucceeded).toBe(false);
      expect(result.anySucceeded).toBe(true);
      expect(result.results).toHaveLength(2);

      const successResult = result.results.find((r) => r.success);
      const failureResult = result.results.find((r) => !r.success);

      expect(successResult).toBeDefined();
      expect(failureResult).toBeDefined();
      if (failureResult !== undefined) {
        expect((failureResult as { success: false; error: string }).error).toBeDefined();
      }
    });
  });
});
