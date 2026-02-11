import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookSender, validateWebhookEndpoint } from './webhook.js';
import type { WebhookPayload } from './types.js';

describe('WebhookSender', () => {
  let sender: WebhookSender;
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    sender = new WebhookSender({ timeoutMs: 1000 });
    mockFetch = vi.fn();
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('send', () => {
    it('should send POST request with correct headers and body', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await sender.send('https://example.com/webhook', payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: expect.any(AbortSignal) as AbortSignal,
      });
    });

    it('should return success with status code on successful response', async () => {
      const payload: WebhookPayload = {
        event: 'complete',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Complete',
          state_kind: 'Complete',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await sender.send('https://example.com/webhook', payload);

      if (result.success) {
        expect(result.statusCode).toBe(200);
      } else {
        throw new Error('Expected success');
      }
    });

    it('should return success for different 2xx status codes', async () => {
      const payload: WebhookPayload = {
        event: 'error',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Injection',
          state_kind: 'Failed',
          substate: {
            kind: 'Failed',
            error: 'Test error',
            failedAt: '2024-02-07T12:00:00Z',
            recoverable: true,
          },
        },
      };

      const statusCodes = [200, 201, 202, 204];

      for (const statusCode of statusCodes) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: statusCode,
        });

        const result = await sender.send('https://example.com/webhook', payload);

        if (result.success) {
          expect(result.statusCode).toBe(statusCode);
        } else {
          throw new Error(`Expected success for status ${String(statusCode)}`);
        }
      }
    });

    it('should return failure for HTTP error responses', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await sender.send('https://example.com/webhook', payload);

      if (!result.success) {
        expect(result.error).toBe('HTTP 404: Not Found');
      } else {
        throw new Error('Expected failure');
      }
    });

    it('should return failure for 500 error', async () => {
      const payload: WebhookPayload = {
        event: 'error',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Injection',
          state_kind: 'Failed',
          substate: {
            kind: 'Failed',
            error: 'Test error',
            failedAt: '2024-02-07T12:00:00Z',
            recoverable: true,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await sender.send('https://example.com/webhook', payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('HTTP 500: Internal Server Error');
      }
    });

    it('should return failure on network timeout', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      const timeoutPromise = new Promise<never>((_, reject) => {
        const error = new Error('Request timeout');
        error.name = 'AbortError';
        setTimeout(() => {
          reject(error);
        }, 10);
      });

      mockFetch.mockReturnValueOnce(timeoutPromise);

      const result = await sender.send('https://example.com/webhook', payload);

      if (!result.success) {
        expect(result.error).toBe(`Request timeout after ${String(1000)}ms`);
      } else {
        throw new Error('Expected failure');
      }
    });

    it('should return failure on network error', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      const networkError = new Error('ECONNREFUSED');
      mockFetch.mockRejectedValueOnce(networkError);

      const result = await sender.send('https://example.com/webhook', payload);

      if (!result.success) {
        expect(result.error).toBe('ECONNREFUSED');
      } else {
        throw new Error('Expected failure');
      }
    });

    it('should use default timeout of 5 seconds when not specified', async () => {
      const defaultSender = new WebhookSender();
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await defaultSender.send('https://example.com/webhook', payload);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle custom timeout', async () => {
      const customSender = new WebhookSender({ timeoutMs: 100 });
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await customSender.send('https://example.com/webhook', payload);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send BlockingRecord in payload', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        blocking_record: {
          id: 'blocking_lattice_1234567890_abc123',
          phase: 'Lattice',
          query: 'Approve architecture?',
          options: ['Yes', 'No', 'Revise'],
          blockedAt: '2024-02-07T12:00:00Z',
          timeoutMs: 300000,
          resolved: false,
        },
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Blocked',
          substate: {
            kind: 'Blocking',
            query: 'Approve architecture?',
            options: ['Yes', 'No', 'Revise'],
            blockedAt: '2024-02-07T12:00:00Z',
            timeoutMs: 300000,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await sender.send('https://example.com/webhook', payload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: JSON.stringify(payload),
        })
      );
    });

    it('should not throw on HTTP error', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(sender.send('https://example.com/webhook', payload)).resolves.toEqual({
        success: false,
        error: 'HTTP 500: Internal Server Error',
      });
    });

    it('should not throw on network error', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(sender.send('https://example.com/webhook', payload)).resolves.toEqual({
        success: false,
        error: 'Network error',
      });
    });

    it('should not throw on timeout', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(timeoutError);

      await expect(sender.send('https://example.com/webhook', payload)).resolves.toEqual({
        success: false,
        error: 'Request timeout after 1000ms',
      });
    });
  });

  describe('sendAsChannelResult', () => {
    it('should return success result for successful webhook', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await sender.sendAsChannelResult('https://example.com/webhook', payload);

      expect(result).toEqual({
        success: true,
      });
    });

    it('should return failure result with error for failed webhook', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await sender.sendAsChannelResult('https://example.com/webhook', payload);

      expect(result).toEqual({
        success: false,
        error: 'HTTP 404: Not Found',
      });
    });

    it('should return failure result for timeout', async () => {
      const payload: WebhookPayload = {
        event: 'block',
        timestamp: '2024-02-07T12:00:00Z',
        protocol_state: {
          phase: 'Lattice',
          state_kind: 'Active',
          substate: { kind: 'Active' },
        },
      };

      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(timeoutError);

      const result = await sender.sendAsChannelResult('https://example.com/webhook', payload);

      expect(result).toEqual({
        success: false,
        error: `Request timeout after ${String(1000)}ms`,
      });
    });
  });

  describe('validateWebhookEndpoint', () => {
    it('should validate a valid http URL', async () => {
      const result = await validateWebhookEndpoint('http://example.com/webhook');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.endpoint).toBe('http://example.com/webhook');
        expect(result.message).toBe('Webhook http://example.com/webhook validated successfully');
      }
    });

    it('should validate a valid https URL', async () => {
      const result = await validateWebhookEndpoint('https://example.com/hook');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.endpoint).toBe('https://example.com/hook');
        expect(result.message).toBe('Webhook https://example.com/hook validated successfully');
      }
    });

    it('should reject invalid URL format', async () => {
      const result = await validateWebhookEndpoint('not-a-url');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.endpoint).toBe('not-a-url');
        expect(result.error).toBe("Invalid URL format: 'not-a-url' is not a valid URL");
      }
    });

    it('should reject ftp URL protocol', async () => {
      const result = await validateWebhookEndpoint('ftp://example.com/webhook');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.endpoint).toBe('ftp://example.com/webhook');
        expect(result.error).toBe(
          "Invalid URL protocol: 'ftp://example.com/webhook' must use http or https"
        );
      }
    });

    it('should reject file URL protocol', async () => {
      const result = await validateWebhookEndpoint('file:///path/to/file');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.endpoint).toBe('file:///path/to/file');
        expect(result.error).toBe(
          "Invalid URL protocol: 'file:///path/to/file' must use http or https"
        );
      }
    });

    it('should send test ping when ping option is enabled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await validateWebhookEndpoint('https://example.com/webhook', { ping: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('validated successfully');
        expect(result.message).toContain('200');
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ test: true }),
        })
      );
    });

    it('should return failure when ping fails', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockFetch.mockRejectedValueOnce(networkError);

      const result = await validateWebhookEndpoint('https://example.com/webhook', { ping: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.endpoint).toBe('https://example.com/webhook');
        expect(result.error).toBe('Ping failed: ECONNREFUSED');
      }
    });

    it('should return failure when ping times out', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(timeoutError);

      const result = await validateWebhookEndpoint('https://example.com/webhook', { ping: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.endpoint).toBe('https://example.com/webhook');
        expect(result.error).toBe('Ping failed: Ping timeout');
      }
    });
  });
});
