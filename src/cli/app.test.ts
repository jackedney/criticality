/**
 * Tests for CLI config loading functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createCliApp } from './app.js';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();

  return {
    ...original,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('createCliApp', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  it('uses default values when no config file exists', async () => {
    mockExistsSync.mockReturnValue(false);

    const context = await createCliApp();

    expect(context.config.colors).toBe(true);
    expect(context.config.unicode).toBe(true);
    expect(context.config.watchInterval).toBe(2000);
  });

  it('loads CLI settings from criticality.toml when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
[cli]
colors = false
watch_interval = 5000
unicode = false
`);

    const context = await createCliApp();

    expect(context.config.colors).toBe(false);
    expect(context.config.unicode).toBe(false);
    expect(context.config.watchInterval).toBe(5000);
  });

  it('uses defaults when config file has parse error', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('invalid [ toml');

    const context = await createCliApp();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Failed to load config from criticality.toml')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith('Using default CLI settings.');
    expect(context.config.colors).toBe(true);
    expect(context.config.unicode).toBe(true);
    expect(context.config.watchInterval).toBe(2000);

    consoleWarnSpy.mockRestore();
  });

  it('allows override via function parameter', async () => {
    mockExistsSync.mockReturnValue(false);

    const context = await createCliApp({
      colors: false,
      watchInterval: 3000,
      unicode: true,
    });

    expect(context.config.colors).toBe(false);
    expect(context.config.unicode).toBe(true);
    expect(context.config.watchInterval).toBe(3000);
  });

  it('merges config file with parameter overrides', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
[cli]
colors = false
watch_interval = 5000
unicode = false
`);

    const context = await createCliApp({ watchInterval: 10000, colors: false, unicode: false });

    expect(context.config.colors).toBe(false);
    expect(context.config.unicode).toBe(false);
    expect(context.config.watchInterval).toBe(10000);
  });
});
