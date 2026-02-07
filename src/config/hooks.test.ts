/**
 * Tests for notification hooks.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { parseConfig } from './parser.js';

describe('Notification Hooks', () => {
  describe('parseNotificationHook', () => {
    it('should parse a complete hook configuration', async () => {
      const toml = `
[notifications.hooks.on_block]
command = "notify-send"
enabled = true
`;
      const config = await parseConfig(toml);

      expect(config.notifications.hooks?.on_block?.command).toBe('notify-send');
      expect(config.notifications.hooks?.on_block?.enabled).toBe(true);
    });

    it('should return undefined for incomplete hook', async () => {
      const toml = `
[notifications.hooks.on_block]
command = "notify-send"
`;
      const config = await parseConfig(toml);

      expect(config.notifications.hooks?.on_block).toBeUndefined();
    });

    it('should return undefined for non-object hook', async () => {
      const toml = `
[notifications.hooks.on_block]
enabled = true
`;
      const config = await parseConfig(toml);

      expect(config.notifications.hooks?.on_block).toBeUndefined();
    });
  });

  describe('parseNotificationHooks', () => {
    it('should parse all four hook types', async () => {
      const toml = `
[notifications.hooks]
on_block = { command = "block-cmd", enabled = true }
on_complete = { command = "complete-cmd", enabled = false }
on_error = { command = "error-cmd", enabled = true }
on_phase_change = { command = "phase-cmd", enabled = false }
`;
      const config = await parseConfig(toml);

      expect(config.notifications.hooks?.on_block?.command).toBe('block-cmd');
      expect(config.notifications.hooks?.on_block?.enabled).toBe(true);
      expect(config.notifications.hooks?.on_complete?.command).toBe('complete-cmd');
      expect(config.notifications.hooks?.on_complete?.enabled).toBe(false);
      expect(config.notifications.hooks?.on_error?.command).toBe('error-cmd');
      expect(config.notifications.hooks?.on_error?.enabled).toBe(true);
      expect(config.notifications.hooks?.on_phase_change?.command).toBe('phase-cmd');
      expect(config.notifications.hooks?.on_phase_change?.enabled).toBe(false);
    });

    it('should handle missing hooks section gracefully', async () => {
      const toml = `
[notifications]
enabled = true
`;
      const config = await parseConfig(toml);

      expect(config.notifications.enabled).toBe(true);
      expect(config.notifications.hooks).toEqual({});
    });
  });
});
