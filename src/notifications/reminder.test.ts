/**
 * Tests for ReminderScheduler.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import type { BlockingRecord } from '../protocol/blocking.js';
import { ReminderScheduler } from './reminder.js';
import type { NotificationService, NotificationSendResult } from './types.js';
import * as path from 'node:path';

/**
 * Mock NotificationService for testing.
 */
class MockNotificationService implements NotificationService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async send(): Promise<NotificationSendResult> {
    return {
      results: [],
      allSucceeded: true,
      anySucceeded: false,
    };
  }

  hasSubscribers(): boolean {
    return true;
  }
}

describe('ReminderScheduler', () => {
  const mockNotificationService = new MockNotificationService();
  let stateDir: string;

  let scheduler: ReminderScheduler;

  beforeEach(async () => {
    stateDir = await mkdtemp(path.join(tmpdir(), 'reminder-test-'));

    scheduler = new ReminderScheduler({
      cronExpression: '0 9 * * *',
      notificationService: mockNotificationService,
      stateDir,
      enabled: true,
    });

    await scheduler.initialize();
  });

  afterEach(async () => {
    try {
      await rm(stateDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should create initial state when no state file exists', async () => {
      const newScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: true,
      });

      await newScheduler.initialize();

      expect(newScheduler.isEnabled()).toBe(true);
      expect(newScheduler.getLastSent()).toBeUndefined();
      expect(newScheduler.getNextScheduled()).toBeUndefined();
    });
  });

  describe('scheduleReminder', () => {
    it('should schedule next reminder after blocked time', async () => {
      const blockedAt = new Date('2024-01-15T08:00:00.000Z');

      const nextScheduled = await scheduler.scheduleReminder(blockedAt);

      expect(nextScheduled).toBe('2024-01-15T09:00:00.000Z');
      expect(scheduler.getNextScheduled()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should throw error when reminders are disabled', async () => {
      const disabledScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: false,
      });

      await disabledScheduler.initialize();

      await expect(
        disabledScheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'))
      ).rejects.toThrow('Cannot schedule reminder: reminders are disabled');
    });

    it('should schedule reminder at correct daily time', async () => {
      const blockedAt = new Date('2024-01-15T14:30:00.000Z');

      const nextScheduled = await scheduler.scheduleReminder(blockedAt);

      expect(nextScheduled).toBe('2024-01-16T09:00:00.000Z');
    });
  });

  describe('checkAndSendReminder', () => {
    const blockingRecord: BlockingRecord = {
      id: 'test_blocking_1',
      phase: 'Ignition',
      query: 'Test query',
      blockedAt: '2024-01-15T08:00:00.000Z',
      resolved: false,
    };

    it('should not send reminder when not blocked', async () => {
      const resolvedRecord: BlockingRecord = {
        ...blockingRecord,
        resolved: true,
        resolution: {
          queryId: blockingRecord.id,
          response: 'Yes',
          resolvedAt: '2024-01-15T08:30:00.000Z',
        },
      };

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        resolvedRecord
      );

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe('not_blocked');
      }
    });

    it('should not send reminder when disabled', async () => {
      const disabledScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: false,
      });

      await disabledScheduler.initialize();

      const result = await disabledScheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        blockingRecord
      );

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe('not_enabled');
      }
    });

    it('should not send reminder when not due', async () => {
      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T08:30:00.000Z'),
        blockingRecord
      );

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe('not_due');
      }
    });

    it('should not send reminder when no schedule exists', async () => {
      await scheduler.clearReminder();

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        blockingRecord
      );

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe('no_schedule');
      }
    });

    it('should send reminder when blocked and due', async () => {
      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        blockingRecord
      );

      expect(result.sent).toBe(true);
      if (result.sent) {
        expect(result.lastSent).toBe('2024-01-15T09:00:00.000Z');
        expect(result.nextScheduled).toBe('2024-01-16T09:00:00.000Z');
      }
      expect(scheduler.getLastSent()).toBe('2024-01-15T09:00:00.000Z');
      expect(scheduler.getNextScheduled()).toBe('2024-01-16T09:00:00.000Z');
    });

    it('should update next scheduled after sending reminder', async () => {
      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      const result1 = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        blockingRecord
      );

      expect(result1.sent).toBe(true);

      const result2 = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T10:00:00.000Z'),
        blockingRecord
      );

      expect(result2.sent).toBe(false);
      if (!result2.sent) {
        expect(result2.reason).toBe('not_due');
      }
    });
  });

  describe('clearReminder', () => {
    it('should clear reminder state', async () => {
      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      expect(scheduler.getNextScheduled()).toBeDefined();

      await scheduler.clearReminder();

      expect(scheduler.getLastSent()).toBeUndefined();
      expect(scheduler.getNextScheduled()).toBeUndefined();
      expect(scheduler.isEnabled()).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('should enable reminders', async () => {
      const disabledScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: false,
      });

      await disabledScheduler.initialize();

      expect(disabledScheduler.isEnabled()).toBe(false);

      await disabledScheduler.enable();

      expect(disabledScheduler.isEnabled()).toBe(true);
    });

    it('should disable reminders', async () => {
      expect(scheduler.isEnabled()).toBe(true);

      await scheduler.disable();

      expect(scheduler.isEnabled()).toBe(false);
    });

    it('should persist enabled state after enable', async () => {
      const customStateDir = await mkdtemp(path.join(tmpdir(), 'enable-test-'));

      try {
        const disabledScheduler = new ReminderScheduler({
          cronExpression: '0 9 * * *',
          notificationService: mockNotificationService,
          stateDir: customStateDir,
          enabled: false,
        });

        await disabledScheduler.initialize();
        await disabledScheduler.enable();

        const newScheduler = new ReminderScheduler({
          cronExpression: '0 9 * * *',
          notificationService: mockNotificationService,
          stateDir: customStateDir,
          enabled: false,
        });

        await newScheduler.initialize();

        expect(newScheduler.isEnabled()).toBe(true);
      } finally {
        await rm(customStateDir, { recursive: true, force: true });
      }
    });

    it('should persist disabled state after disable', async () => {
      const customStateDir = await mkdtemp(path.join(tmpdir(), 'disable-test-'));

      try {
        const customScheduler = new ReminderScheduler({
          cronExpression: '0 9 * * *',
          notificationService: mockNotificationService,
          stateDir: customStateDir,
          enabled: true,
        });

        await customScheduler.initialize();
        await customScheduler.disable();

        const newScheduler = new ReminderScheduler({
          cronExpression: '0 9 * * *',
          notificationService: mockNotificationService,
          stateDir: customStateDir,
          enabled: true,
        });

        await newScheduler.initialize();

        expect(newScheduler.isEnabled()).toBe(false);
      } finally {
        await rm(customStateDir, { recursive: true, force: true });
      }
    });
  });

  describe('state persistence', () => {
    it('should persist state to disk', async () => {
      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      const newScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: true,
      });

      await newScheduler.initialize();

      expect(newScheduler.getNextScheduled()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should load last sent from disk', async () => {
      const blockingRecord: BlockingRecord = {
        id: 'test_blocking_1',
        phase: 'Ignition',
        query: 'Test query',
        blockedAt: '2024-01-15T08:00:00.000Z',
        resolved: false,
      };

      await scheduler.scheduleReminder(new Date('2024-01-15T08:00:00.000Z'));

      const result = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        blockingRecord
      );

      expect(result.sent).toBe(true);

      const newScheduler = new ReminderScheduler({
        cronExpression: '0 9 * * *',
        notificationService: mockNotificationService,
        stateDir,
        enabled: true,
      });

      await newScheduler.initialize();

      expect(newScheduler.getLastSent()).toBe('2024-01-15T09:00:00.000Z');
    });
  });

  describe('example scenario: Blocked at 8am, cron 0 9 * * *', () => {
    it('should send reminder at 9am', async () => {
      const blockedAt = new Date('2024-01-15T08:00:00.000Z');
      const blockedRecord: BlockingRecord = {
        id: 'blocking_1',
        phase: 'Ignition',
        query: 'Approve design?',
        blockedAt: blockedAt.toISOString(),
        resolved: false,
      };

      await scheduler.scheduleReminder(blockedAt);

      const reminderTime = new Date('2024-01-15T09:00:00.000Z');
      const result = await scheduler.checkAndSendReminder(reminderTime, blockedRecord);

      expect(result.sent).toBe(true);
      if (result.sent) {
        expect(result.lastSent).toBe('2024-01-15T09:00:00.000Z');
        expect(result.nextScheduled).toBe('2024-01-16T09:00:00.000Z');
      }
    });
  });

  describe('negative case: Not blocked', () => {
    it('should not send reminder even if schedule matches', async () => {
      const blockedAt = new Date('2024-01-15T08:00:00.000Z');
      await scheduler.scheduleReminder(blockedAt);

      const resolvedRecord: BlockingRecord = {
        id: 'blocking_1',
        phase: 'Ignition',
        query: 'Approve design?',
        blockedAt: blockedAt.toISOString(),
        resolved: true,
        resolution: {
          queryId: 'blocking_1',
          response: 'Yes',
          resolvedAt: '2024-01-15T08:30:00.000Z',
        },
      };

      const reminderTime = new Date('2024-01-15T09:00:00.000Z');
      const result = await scheduler.checkAndSendReminder(reminderTime, resolvedRecord);

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe('not_blocked');
      }
    });
  });

  describe('multiple reminders', () => {
    it('should send multiple reminders over multiple days', async () => {
      const blockedAt = new Date('2024-01-15T08:00:00.000Z');
      await scheduler.scheduleReminder(blockedAt);

      const record: BlockingRecord = {
        id: 'blocking_1',
        phase: 'Ignition',
        query: 'Approve design?',
        blockedAt: blockedAt.toISOString(),
        resolved: false,
      };

      const result1 = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:00:00.000Z'),
        record
      );

      expect(result1.sent).toBe(true);
      if (result1.sent) {
        expect(result1.lastSent).toBe('2024-01-15T09:00:00.000Z');
      }

      const result2 = await scheduler.checkAndSendReminder(
        new Date('2024-01-15T09:30:00.000Z'),
        record
      );

      expect(result2.sent).toBe(false);
      if (!result2.sent) {
        expect(result2.reason).toBe('not_due');
      }

      const result3 = await scheduler.checkAndSendReminder(
        new Date('2024-01-16T09:00:00.000Z'),
        record
      );

      expect(result3.sent).toBe(true);
      if (result3.sent) {
        expect(result3.lastSent).toBe('2024-01-16T09:00:00.000Z');
        expect(result3.nextScheduled).toBe('2024-01-17T09:00:00.000Z');
      }
    });
  });
});
