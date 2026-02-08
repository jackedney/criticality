/**
 * Webhook notification sender.
 *
 * Sends HTTP POST notifications to configured webhook endpoints.
 * Uses fire-and-forget semantics with configurable timeouts.
 *
 * @packageDocumentation
 */

import type { WebhookPayload } from './types.js';

/**
 * Configuration for webhook sender.
 */
export interface WebhookSenderOptions {
  /** Timeout in milliseconds (default: 5000ms). */
  readonly timeoutMs?: number;
  /** Whether to send a test ping on validation (default: false). */
  readonly pingOnValidation?: boolean;
}

/**
 * Result of webhook endpoint validation.
 */
export type WebhookValidationResult =
  | {
      readonly success: true;
      readonly endpoint: string;
      readonly message: string;
    }
  | {
      readonly success: false;
      readonly endpoint: string;
      readonly error: string;
    };

/**
 * Result of a single webhook send attempt.
 */
export type WebhookSendResult =
  | {
      readonly success: true;
      readonly statusCode?: number;
    }
  | {
      readonly success: false;
      readonly error: string;
    };

/**
 * Validates a webhook endpoint URL and optionally sends a test ping.
 *
 * Validates that the endpoint is a valid http/https URL. If pingOnValidation
 * is enabled, sends a test POST request to verify the endpoint is reachable.
 * Validation failures do not throw - they return a failure result.
 *
 * @param endpoint - The webhook endpoint URL to validate.
 * @param options - Optional validation settings.
 * @returns Validation result with success status and message or error.
 *
 * @example
 * ```typescript
 * // URL validation only (no network request)
 * const result1 = await validateWebhookEndpoint('https://example.com/webhook');
 * if (result1.success) {
 *   console.log(result1.message); // "Webhook https://example.com/webhook validated successfully"
 * }
 *
 * // With test ping
 * const result2 = await validateWebhookEndpoint('https://example.com/webhook', { ping: true });
 * if (!result2.success) {
 *   console.warn(result2.error); // "Ping failed: Connection refused"
 * }
 * ```
 */
export async function validateWebhookEndpoint(
  endpoint: string,
  options?: { readonly ping?: boolean }
): Promise<WebhookValidationResult> {
  try {
    new URL(endpoint);
  } catch {
    return {
      success: false,
      endpoint,
      error: `Invalid URL format: '${endpoint}' is not a valid URL`,
    };
  }

  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      success: false,
      endpoint,
      error: `Invalid URL protocol: '${endpoint}' must use http or https`,
    };
  }

  if (options?.ping === true) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        success: true,
        endpoint,
        message: `Webhook ${endpoint} validated successfully (ping responded with ${String(response.status)})`,
      };
    } catch (error) {
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Ping timeout';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        endpoint,
        error: `Ping failed: ${errorMessage}`,
      };
    }
  }

  return {
    success: true,
    endpoint,
    message: `Webhook ${endpoint} validated successfully`,
  };
}

/**
 * WebhookSender class for sending HTTP POST notifications.
 *
 * Sends JSON payloads to configured endpoints with fire-and-forget
 * semantics. Failed requests are logged but do not throw errors.
 */
export class WebhookSender {
  private readonly defaultTimeoutMs: number;

  /**
   * Creates a new WebhookSender.
   *
   * @param options - Configuration options.
   */
  constructor(options?: WebhookSenderOptions) {
    this.defaultTimeoutMs = options?.timeoutMs ?? 5000;
  }

  /**
   * Sends a webhook notification to the specified endpoint.
   *
   * POSTs the payload as JSON with Content-Type: application/json.
   * Uses configurable timeout and returns success/failure without throwing.
   *
   * @param endpoint - The webhook endpoint URL.
   * @param payload - The webhook payload to send.
   * @returns Result indicating success or failure with error message.
   *
   * @example
   * ```typescript
   * const sender = new WebhookSender();
   * const result = await sender.send(
   *   'https://example.com/webhook',
   *   { event: 'block', timestamp: '2024-02-07T12:00:00Z', protocol_state: {...} }
   * );
   *
   * if (result.success) {
   *   console.log('Webhook sent successfully');
   * } else {
   *   console.error('Webhook failed:', result.error);
   * }
   * ```
   */
  async send(endpoint: string, payload: WebhookPayload): Promise<WebhookSendResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.defaultTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = `HTTP ${String(response.status)}: ${response.statusText}`;
        console.error(`Webhook failed for ${endpoint}: ${error}`);
        return { success: false, error };
      }

      return { success: true, statusCode: response.status };
    } catch (error) {
      clearTimeout(timeoutId);

      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${String(this.defaultTimeoutMs)}ms`;
        } else {
          errorMessage = error.message;
        }
      }

      console.error(`Webhook failed for ${endpoint}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Sends a webhook notification and formats the result as ChannelSendResult.
   *
   * @param endpoint - The webhook endpoint URL.
   * @param payload - The webhook payload to send.
   * @returns Result formatted for the notification service.
   */
  async sendAsChannelResult(
    endpoint: string,
    payload: WebhookPayload
  ): Promise<{ readonly success: true } | { readonly success: false; readonly error: string }> {
    const result = await this.send(endpoint, payload);

    if (result.success) {
      return { success: true };
    } else {
      const failureResult = result as { readonly success: false; readonly error: string };
      return { success: false, error: failureResult.error };
    }
  }
}
