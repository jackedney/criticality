/**
 * Notification system exports.
 *
 * @packageDocumentation
 */

export type {
  NotificationEvent,
  ChannelType,
  NotificationChannel,
  WebhookPayload,
  PhaseChangeData,
  ReminderSchedule,
  NotificationState,
  SentNotification,
  ChannelSendResult,
  NotificationSendResult,
  NotificationService as NotificationServiceInterface,
} from './types.js';

export { NOTIFICATION_EVENTS } from './types.js';

export { parseCronExpression, isValidCronExpression, getNextOccurrence } from './cron.js';

export { WebhookSender, validateWebhookEndpoint } from './webhook.js';
export type {
  WebhookSenderOptions,
  WebhookSendResult,
  WebhookValidationResult,
} from './webhook.js';

export { NotificationService } from './service.js';

export { ReminderScheduler } from './reminder.js';
export type { ReminderSchedulerOptions, ReminderCheckResult } from './reminder.js';
