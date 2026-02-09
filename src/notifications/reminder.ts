/**
 * Reminder scheduler for blocking states.
 *
 * Manages cron-based reminder notifications that are sent periodically
 * while the protocol is blocked. Tracks last_sent and next_scheduled
 * timestamps and persists state to disk.
 *
 * @packageDocumentation
 */

import type { BlockingRecord } from '../protocol/blocking.js';
import type { BlockingSubstate } from '../protocol/types.js';
import type { NotificationService } from './types.js';
import { getNextOccurrence } from './cron.js';
import { writeFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Reminder state for persistence.
 */
interface ReminderState {
  /** Whether reminder is currently enabled. */
  readonly enabled: boolean;
  /** Timestamp of the last reminder sent (ISO 8601). */
  readonly last_sent?: string | undefined;
  /** Timestamp of the next scheduled reminder (ISO 8601). */
  readonly next_scheduled?: string | undefined;
}

/**
 * Result of checking and sending a reminder.
 */
export type ReminderCheckResult =
  | {
      readonly sent: true;
      readonly lastSent: string;
      readonly nextScheduled: string;
    }
  | {
      readonly sent: false;
      readonly reason: 'not_blocked' | 'not_due' | 'not_enabled' | 'no_schedule';
    };

/**
 * Options for creating a ReminderScheduler.
 */
export interface ReminderSchedulerOptions {
  /** Cron expression for reminder scheduling (e.g., '0 9 * * *'). */
  readonly cronExpression: string;
  /** Notification service for sending reminders. */
  readonly notificationService: NotificationService;
  /** Directory for storing notification state. */
  readonly stateDir: string;
  /** Whether reminders are enabled. */
  readonly enabled: boolean;
}

/**
 * Default state file name for reminder state.
 */
const DEFAULT_STATE_FILE = 'notification-state.json';

/**
 * Checks if a file exists using async stat.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reminder scheduler for blocking states.
 *
 * Sends reminder notifications at configured cron intervals while
 * the protocol remains blocked. Tracks state and persists to disk.
 */
export class ReminderScheduler {
  private readonly cronExpression: string;
  private readonly notificationService: NotificationService;
  private readonly statePath: string;
  private enabled: boolean;
  private state: ReminderState;

  /**
   * Creates a new ReminderScheduler.
   *
   * @param options - Configuration options.
   */
  constructor(options: ReminderSchedulerOptions) {
    this.cronExpression = options.cronExpression;
    this.notificationService = options.notificationService;
    this.statePath = path.join(options.stateDir, DEFAULT_STATE_FILE);
    this.enabled = options.enabled;
    this.state = { enabled: this.enabled };
  }

  /**
   * Initializes the reminder scheduler by loading existing state.
   *
   * Creates state directory if it doesn't exist and loads any existing
   * reminder state from disk.
   *
   * @throws Error if state cannot be loaded.
   */
  async initialize(): Promise<void> {
    const stateDir = path.dirname(this.statePath);

    if (!(await fileExists(stateDir))) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(stateDir, { recursive: true });
    }

    if (await fileExists(this.statePath)) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const data = await readFile(this.statePath, 'utf-8');
        const loaded = JSON.parse(data) as Partial<ReminderState>;

        this.enabled = loaded.enabled ?? this.enabled;
        this.state = {
          last_sent: loaded.last_sent,
          next_scheduled: loaded.next_scheduled,
          enabled: this.enabled,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load reminder state: ${errorMessage}`);
      }
    }
  }

  /**
   * Checks if a reminder should be sent and sends it if due.
   *
   * Only sends reminder if all conditions are met:
   * - Reminders are enabled
   * - Protocol is currently blocked (record.resolved === false)
   * - Current time >= next_scheduled
   *
   * After sending, updates next_scheduled based on cron expression.
   *
   * @param currentTime - The current time to check against.
   * @param blockingRecord - The current blocking record.
   * @returns Result indicating whether reminder was sent and reason.
   *
   * @example
   * ```typescript
   * const result = await scheduler.checkAndSendReminder(new Date(), blockingRecord);
   *
   * if (result.sent) {
   *   console.log(`Reminder sent, next at ${result.nextScheduled}`);
   * } else {
   *   console.log(`No reminder: ${result.reason}`);
   * }
   * ```
   */
  async checkAndSendReminder(
    currentTime: Date,
    blockingRecord: BlockingRecord
  ): Promise<ReminderCheckResult> {
    if (!this.enabled) {
      return { sent: false, reason: 'not_enabled' };
    }

    if (blockingRecord.resolved) {
      return { sent: false, reason: 'not_blocked' };
    }

    const currentTimeMs = currentTime.getTime();

    if (this.state.next_scheduled === undefined) {
      return { sent: false, reason: 'no_schedule' };
    }

    const nextScheduledTime = new Date(this.state.next_scheduled).getTime();

    if (currentTimeMs < nextScheduledTime) {
      return { sent: false, reason: 'not_due' };
    }

    const timestamp = currentTime.toISOString();

    let blockingSubstate: BlockingSubstate;
    if (blockingRecord.options !== undefined && blockingRecord.timeoutMs !== undefined) {
      blockingSubstate = {
        kind: 'Blocking',
        query: blockingRecord.query,
        blockedAt: blockingRecord.blockedAt,
        options: blockingRecord.options,
        timeoutMs: blockingRecord.timeoutMs,
      };
    } else if (blockingRecord.options !== undefined) {
      blockingSubstate = {
        kind: 'Blocking',
        query: blockingRecord.query,
        blockedAt: blockingRecord.blockedAt,
        options: blockingRecord.options,
      };
    } else if (blockingRecord.timeoutMs !== undefined) {
      blockingSubstate = {
        kind: 'Blocking',
        query: blockingRecord.query,
        blockedAt: blockingRecord.blockedAt,
        timeoutMs: blockingRecord.timeoutMs,
      };
    } else {
      blockingSubstate = {
        kind: 'Blocking',
        query: blockingRecord.query,
        blockedAt: blockingRecord.blockedAt,
      };
    }

    await this.notificationService.send('block', {
      event: 'block',
      timestamp,
      blocking_record: blockingRecord,
      protocol_state: {
        phase: blockingRecord.phase,
        substate: blockingSubstate,
      },
    });

    const lastSent = timestamp;
    const nextScheduled = getNextOccurrence(this.cronExpression, currentTime);

    this.state = {
      ...this.state,
      last_sent: lastSent,
      next_scheduled: nextScheduled.toISOString(),
    };

    await this.saveState();

    return {
      sent: true,
      lastSent,
      nextScheduled: nextScheduled.toISOString(),
    };
  }

  /**
   * Schedules the next reminder after a blocking event.
   *
   * Called when entering a blocking state to set up the first reminder.
   *
   * @param blockedAt - The time when blocking occurred.
   * @returns The next scheduled reminder time (ISO 8601).
   *
   * @example
   * ```typescript
   * const nextScheduled = await scheduler.scheduleReminder(new Date());
   * console.log(`Next reminder at ${nextScheduled}`);
   * ```
   */
  async scheduleReminder(blockedAt: Date): Promise<string> {
    if (!this.enabled) {
      throw new Error('Cannot schedule reminder: reminders are disabled');
    }

    const nextScheduled = getNextOccurrence(this.cronExpression, blockedAt);
    const nextScheduledIso = nextScheduled.toISOString();

    this.state = {
      ...this.state,
      next_scheduled: nextScheduledIso,
    };

    await this.saveState();

    return nextScheduledIso;
  }

  /**
   * Clears the reminder state.
   *
   * Called when blocking is resolved to reset reminder tracking.
   * Does not disable reminders; just clears last_sent and next_scheduled.
   */
  async clearReminder(): Promise<void> {
    this.state = {
      enabled: this.enabled,
      last_sent: undefined,
      next_scheduled: undefined,
    };

    await this.saveState();
  }

  /**
   * Gets the next scheduled reminder time.
   *
   * @returns The next scheduled reminder time (ISO 8601), or undefined if not scheduled.
   */
  getNextScheduled(): string | undefined {
    return this.state.next_scheduled;
  }

  /**
   * Gets the last sent reminder time.
   *
   * @returns The last sent reminder time (ISO 8601), or undefined if never sent.
   */
  getLastSent(): string | undefined {
    return this.state.last_sent;
  }

  /**
   * Checks if reminders are enabled.
   *
   * @returns True if reminders are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enables reminders.
   *
   * Persists the enabled state to disk.
   */
  async enable(): Promise<void> {
    this.enabled = true;
    this.state = { ...this.state, enabled: true };
    await this.saveState();
  }

  /**
   * Disables reminders.
   *
   * Persists the disabled state to disk.
   */
  async disable(): Promise<void> {
    this.enabled = false;
    this.state = { ...this.state, enabled: false };
    await this.saveState();
  }

  /**
   * Saves the current reminder state to disk.
   *
   * Uses atomic write pattern: writes to temp file first,
   * then renames to actual path. This prevents corruption
   * if power is lost during write.
   *
   * @throws Error if state cannot be saved.
   */
  private async saveState(): Promise<void> {
    const serialized = JSON.stringify(this.state, null, 2);
    const tmpPath = `${this.statePath}.tmp`;

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(tmpPath, serialized, 'utf-8');
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await rename(tmpPath, this.statePath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save reminder state: ${errorMessage}`);
    }
  }
}
