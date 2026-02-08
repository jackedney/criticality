/**
 * Notification system types and interfaces.
 *
 * Defines the core types for the notification system, including the
 * NotificationService interface, notification events, channels, and payloads.
 *
 * @packageDocumentation
 */

import type { BlockingRecord } from '../protocol/blocking.js';
import type { ProtocolPhase, ProtocolState } from '../protocol/types.js';

/**
 * Notification events that can trigger notifications.
 */
export type NotificationEvent = 'block' | 'complete' | 'error' | 'phase_change';

/**
 * Array of all notification events.
 */
export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  'block',
  'complete',
  'error',
  'phase_change',
] as const;

/**
 * Notification channel types.
 */
export type ChannelType = 'webhook';

/**
 * Interface for a notification channel configuration.
 */
export interface NotificationChannel {
  /** Type of notification channel. */
  readonly type: ChannelType;
  /** Endpoint URL for sending notifications. */
  readonly endpoint: string;
  /** Whether this channel is enabled. */
  readonly enabled: boolean;
  /** Events that this channel subscribes to. */
  readonly events: readonly NotificationEvent[];
}

/**
 * Webhook payload structure for notification events.
 *
 * Contains the full BlockingRecord for programmatic consumption,
 * along with event metadata.
 */
export interface WebhookPayload {
  /** The notification event type. */
  readonly event: NotificationEvent;
  /** Timestamp when the notification was sent (ISO 8601). */
  readonly timestamp: string;
  /** The blocking record (for block/error events). */
  readonly blocking_record?: BlockingRecord;
  /** Current protocol state (for all events). */
  readonly protocol_state: ProtocolState;
}

/**
 * Phase change data for phase_change events.
 */
export interface PhaseChangeData {
  /** The phase being transitioned from. */
  readonly from: ProtocolPhase;
  /** The phase being transitioned to. */
  readonly to: ProtocolPhase;
}

/**
 * Reminder schedule configuration.
 */
export interface ReminderSchedule {
  /** Cron expression for reminder scheduling. */
  readonly cron_expression: string;
  /** Whether reminders are enabled. */
  readonly enabled: boolean;
  /** Timestamp of the last reminder sent (ISO 8601). */
  readonly last_sent?: string;
  /** Timestamp of the next scheduled reminder (ISO 8601). */
  readonly next_scheduled?: string;
}

/**
 * Notification state for persistence.
 */
export interface NotificationState {
  /** Configured notification channels. */
  readonly channels: readonly NotificationChannel[];
  /** Reminder schedule configuration. */
  readonly reminder_schedule: ReminderSchedule;
  /** History of sent notifications. */
  readonly sent_notifications: readonly SentNotification[];
}

/**
 * Record of a sent notification.
 */
export interface SentNotification {
  /** The notification event. */
  readonly event: NotificationEvent;
  /** Timestamp when sent (ISO 8601). */
  readonly sent_at: string;
  /** Channel endpoint. */
  readonly endpoint: string;
  /** Whether sending was successful. */
  readonly success: boolean;
  /** Error message if sending failed. */
  readonly error?: string;
}

/**
 * Result of sending a notification to a single channel.
 */
export type ChannelSendResult =
  | {
      readonly success: true;
      readonly channel: NotificationChannel;
    }
  | {
      readonly success: false;
      readonly channel: NotificationChannel;
      readonly error: string;
    };

/**
 * Aggregate result of sending notifications to multiple channels.
 */
export interface NotificationSendResult {
  /** Results from each channel. */
  readonly results: readonly ChannelSendResult[];
  /** Whether all channels succeeded. */
  readonly allSucceeded: boolean;
  /** Whether any channels succeeded. */
  readonly anySucceeded: boolean;
}

/**
 * NotificationService interface for sending notifications.
 *
 * Defines the contract for notification implementations.
 * Concrete implementations (e.g., webhook, email, Slack) implement
 * this interface to provide notification functionality.
 */
export interface NotificationService {
  /**
   * Sends a notification to configured channels.
   *
   * Filters channels by the event type and sends notifications
   * to all enabled channels that subscribe to the event.
   *
   * @param event - The notification event type.
   * @param payload - The notification payload.
   * @returns Aggregate result of sending to all channels.
   */
  send(event: NotificationEvent, payload: WebhookPayload): Promise<NotificationSendResult>;

  /**
   * Checks if a notification event has subscribers.
   *
   * @param event - The notification event type.
   * @returns True if there are enabled channels subscribed to this event.
   */
  hasSubscribers(event: NotificationEvent): boolean;
}
