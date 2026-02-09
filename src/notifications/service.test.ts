import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from './service.js';
import type { BlockingRecord } from '../protocol/blocking.js';
import type { ProtocolState } from '../protocol/types.js';
import type { NotificationConfig } from '../config/types.js';

describe('NotificationService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const defaultWebhookUrl1 = 'https://example.com/webhook1';
  const defaultWebhookUrl2 = 'https://example.com/webhook2';
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockRestore();
  });

  describe('constructor', () => {
    it('should create service with no channels when notifications disabled', () => {
      const config: NotificationConfig = {
        enabled: false,
        channels: undefined,
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      const hasBlockSubscribers = service.hasSubscribers('block');
      expect(hasBlockSubscribers).toBe(false);
    });

    it('should create service with webhook channels from config', () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block', 'complete'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['error'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      expect(service.hasSubscribers('block')).toBe(true);
      expect(service.hasSubscribers('complete')).toBe(true);
      expect(service.hasSubscribers('error')).toBe(true);
    });

    it('should ignore disabled channels', () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: false,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      expect(service.hasSubscribers('block')).toBe(false);
    });

    it('should filter channels by event type', () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['complete'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      expect(service.hasSubscribers('block')).toBe(true);
      expect(service.hasSubscribers('complete')).toBe(true);
      expect(service.hasSubscribers('error')).toBe(false);
    });

    it('should filter out invalid event types', () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block', 'on_block', 'complete', 'invalid_event'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      expect(service.hasSubscribers('block')).toBe(true);
      expect(service.hasSubscribers('complete')).toBe(true);
      expect(service.hasSubscribers('error')).toBe(false);
    });

    it('should ignore channel with all invalid events', () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['on_block', 'on_complete', 'on_error'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      expect(service.hasSubscribers('block')).toBe(true);
      expect(service.hasSubscribers('error')).toBe(false);
    });
  });

  describe('notify with BlockingRecord', () => {
    it('should send to all matching channels', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        blockedAt: '2024-02-07T12:00:00Z',
        timeoutMs: 300000,
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.allSucceeded).toBe(true);
      expect(result.anySucceeded).toBe(true);
      expect(result.results.length).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        defaultWebhookUrl1,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        defaultWebhookUrl2,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should build rich payload with BlockingRecord', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve architecture?',
        options: ['Yes', 'No', 'Revise'],
        blockedAt: '2024-02-07T12:00:00Z',
        timeoutMs: 300000,
        resolved: false,
      };

      await service.notify('block', blockingRecord);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        readonly event: string;
        readonly blocking_record: BlockingRecord;
        readonly protocol_state: ProtocolState;
        readonly timestamp: string;
      };

      expect(body.event).toBe('block');
      expect(body.blocking_record).toEqual(blockingRecord);
      expect(body.protocol_state.phase).toBe('Lattice');
      expect(body.protocol_state.substate.kind).toBe('Blocking');
      if (body.protocol_state.substate.kind === 'Blocking') {
        expect(body.protocol_state.substate.query).toBe('Approve architecture?');
      }
      expect(typeof body.timestamp).toBe('string');
    });

    it('should handle BlockingRecord without options', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Free-form response?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.allSucceeded).toBe(true);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        readonly protocol_state: ProtocolState;
      };

      expect(body.protocol_state.substate.kind).toBe('Blocking');
      if (body.protocol_state.substate.kind === 'Blocking') {
        expect(body.protocol_state.substate.options).toBeUndefined();
        expect(body.protocol_state.substate.timeoutMs).toBeUndefined();
      }
    });

    it('should return aggregate result with channel details', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.results).toHaveLength(2);
      expect(result.allSucceeded).toBe(true);
      expect(result.anySucceeded).toBe(true);

      for (const r of result.results) {
        if (r.success) {
          expect(r.channel.endpoint).toMatch(/^https:\/\/example\.com\/webhook/);
        }
      }
    });
  });

  describe('notify with ProtocolState', () => {
    it('should send notifications with ProtocolState payload', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['complete'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const protocolState: ProtocolState = {
        phase: 'Complete',
        substate: { kind: 'Active' },
      };

      const result = await service.notify('complete', protocolState);

      expect(result.allSucceeded).toBe(true);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        readonly event: string;
        readonly protocol_state: ProtocolState;
        readonly blocking_record?: BlockingRecord;
      };

      expect(body.event).toBe('complete');
      expect(body.protocol_state).toEqual(protocolState);
      expect(body.blocking_record).toBeUndefined();
    });

    it('should handle error events with failed state', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['error'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const protocolState: ProtocolState = {
        phase: 'Injection',
        substate: {
          kind: 'Failed',
          error: 'Test error',
          failedAt: '2024-02-07T12:00:00Z',
          recoverable: true,
        },
      };

      const result = await service.notify('error', protocolState);

      expect(result.allSucceeded).toBe(true);
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        readonly event: string;
        readonly protocol_state: ProtocolState;
      };

      expect(body.event).toBe('error');
      expect(body.protocol_state).toEqual(protocolState);
    });
  });

  describe('error handling', () => {
    it('should not throw when channel fails', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.allSucceeded).toBe(false);
      expect(result.anySucceeded).toBe(false);
      expect(result.results.length).toBe(1);
      const firstResult = result.results[0];
      expect(firstResult).toBeDefined();
      if (firstResult !== undefined) {
        expect(firstResult.success).toBe(false);
        if (!firstResult.success) {
          const failedResult = firstResult as {
            readonly success: false;
            readonly channel: {
              readonly type: 'webhook';
              readonly endpoint: string;
              readonly enabled: boolean;
              readonly events: readonly string[];
            };
            readonly error: string;
          };
          expect(failedResult.error).toBe('Network error');
        }
      }
    });

    it('should return aggregate result when all channels fail', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.allSucceeded).toBe(false);
      expect(result.anySucceeded).toBe(false);
      expect(result.results.length).toBe(2);
      for (const r of result.results) {
        expect(r.success).toBe(false);
      }
    });

    it('should handle partial success', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl2,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockRejectedValueOnce(new Error('Network error'));

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.allSucceeded).toBe(false);
      expect(result.anySucceeded).toBe(true);
      expect(result.results.length).toBe(2);
      const firstResult = result.results[0];
      const secondResult = result.results[1];
      expect(firstResult).toBeDefined();
      expect(secondResult).toBeDefined();
      if (firstResult !== undefined) {
        expect(firstResult.success).toBe(true);
      }
      if (secondResult !== undefined) {
        expect(secondResult.success).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should return empty result when no matching channels', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['complete'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.results).toHaveLength(0);
      expect(result.allSucceeded).toBe(true);
      expect(result.anySucceeded).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty result when notifications disabled', async () => {
      const config: NotificationConfig = {
        enabled: false,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: true,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty result when all channels disabled', async () => {
      const config: NotificationConfig = {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            endpoint: defaultWebhookUrl1,
            enabled: false,
            events: ['block'],
          },
        ],
        reminder_schedule: undefined,
      };

      const service = new NotificationService(config);

      const blockingRecord: BlockingRecord = {
        id: 'blocking_lattice_1234567890_abc123',
        phase: 'Lattice',
        query: 'Approve?',
        blockedAt: '2024-02-07T12:00:00Z',
        resolved: false,
      };

      const result = await service.notify('block', blockingRecord);

      expect(result.results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
