/**
 * Unified notification service.
 *
 * Manages all configured notification channels and sends notifications
 * to each. Centralizes notification logic and provides aggregate results.
 *
 * @packageDocumentation
 */

import type { BlockingRecord } from '../protocol/blocking.js';
import type { ProtocolState } from '../protocol/types.js';
import type { NotificationConfig } from '../config/types.js';
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationSendResult,
  WebhookPayload,
} from './types.js';
import { NOTIFICATION_EVENTS } from './types.js';
import { WebhookSender } from './webhook.js';

/**
 * Unified notification service for managing multiple notification channels.
 *
 * Sends notifications to all enabled channels that subscribe to a given event.
 * Currently supports webhook channels, with extensibility for future channel types.
 */
export class NotificationService {
  private readonly channels: readonly NotificationChannel[];
  private readonly webhookSender: WebhookSender;

  /**
   * Creates a new NotificationService.
   *
   * @param config - Notification configuration from parsed criticality.toml.
   */
  constructor(config: NotificationConfig) {
    const channelsArr: NotificationChannel[] = [];

    if (config.enabled && config.channels !== undefined && config.channels.length > 0) {
      for (const channelConfig of config.channels) {
        if (channelConfig.type === 'webhook') {
          const validEvents = channelConfig.events.filter((e): e is NotificationEvent =>
            (NOTIFICATION_EVENTS as readonly string[]).includes(e)
          );

          if (validEvents.length > 0) {
            const channel: NotificationChannel = {
              type: 'webhook',
              endpoint: channelConfig.endpoint,
              enabled: channelConfig.enabled,
              events: validEvents,
            };
            channelsArr.push(channel);
          }
        }
      }
    }

    this.channels = channelsArr;
    this.webhookSender = new WebhookSender({ timeoutMs: 5000 });
  }

  /**
   * Checks if there are subscribers for a given event.
   *
   * @param event - The notification event type.
   * @returns True if there are enabled channels subscribed to this event.
   */
  hasSubscribers(event: NotificationEvent): boolean {
    return this.channels.some((channel) => channel.enabled && channel.events.includes(event));
  }

  /**
   * Sends a notification to all enabled channels that subscribe to the event.
   *
   * Filters channels by event type and sends notifications in parallel.
   * Returns aggregate results showing which channels succeeded/failed.
   *
   * @param event - The notification event type.
   * @param payload - The webhook payload containing event data and protocol state.
   * @returns Aggregate result of sending to all channels.
   */
  async send(event: NotificationEvent, payload: WebhookPayload): Promise<NotificationSendResult> {
    const matchingChannels = this.channels.filter(
      (channel) => channel.enabled && channel.events.includes(event)
    );

    if (matchingChannels.length === 0) {
      return {
        results: [],
        allSucceeded: true,
        anySucceeded: false,
      };
    }

    const channelPromises = matchingChannels.map(async (channel) => {
      const webhookResult = await this.webhookSender.sendAsChannelResult(channel.endpoint, payload);

      if (webhookResult.success) {
        return {
          success: true as const,
          channel,
        };
      } else {
        const failureResult = webhookResult as {
          readonly success: false;
          readonly error: string;
        };
        return {
          success: false as const,
          channel,
          error: failureResult.error,
        };
      }
    });

    const results = await Promise.all(channelPromises);

    const allSucceeded = results.every((r) => r.success);
    const anySucceeded = results.some((r) => r.success);

    return {
      results,
      allSucceeded,
      anySucceeded,
    };
  }

  /**
   * Sends a notification with data.
   *
   * Helper method that constructs the WebhookPayload from event and data.
   * Supports BlockingRecord for block/error events, or ProtocolState for all events.
   *
   * @param event - The notification event type.
   * @param data - The blocking record or protocol state.
   * @returns Aggregate result of sending to all channels.
   */
  async notify(
    event: NotificationEvent,
    data: BlockingRecord | ProtocolState
  ): Promise<NotificationSendResult> {
    const timestamp = new Date().toISOString();

    let payload: WebhookPayload;

    if ('query' in data) {
      const record = data;
      const blockingBase = {
        kind: 'Blocking' as const,
        query: record.query,
        blockedAt: record.blockedAt,
      };

      let blockingSubstate;
      if (record.options !== undefined && record.timeoutMs !== undefined) {
        blockingSubstate = {
          ...blockingBase,
          options: record.options,
          timeoutMs: record.timeoutMs,
        };
      } else if (record.options !== undefined) {
        blockingSubstate = { ...blockingBase, options: record.options };
      } else if (record.timeoutMs !== undefined) {
        blockingSubstate = { ...blockingBase, timeoutMs: record.timeoutMs };
      } else {
        blockingSubstate = blockingBase;
      }

      payload = {
        event,
        timestamp,
        blocking_record: record,
        protocol_state: {
          phase: record.phase,
          substate: blockingSubstate,
        },
      };
    } else {
      payload = {
        event,
        timestamp,
        protocol_state: data,
      };
    }

    return this.send(event, payload);
  }
}
