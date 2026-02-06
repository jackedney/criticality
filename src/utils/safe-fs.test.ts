import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  validatePath,
  safeReadFile,
  safeWriteFile,
  safeExists,
  safeMkdir,
  safeReaddir,
  safeStat,
  safeUnlink,
  safeRename,
  PathValidationError,
} from './safe-fs.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

describe('safe-fs', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'safe-fs-test-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should resolve and validate absolute paths', () => {
      const path = '/tmp/test.txt';
      const result = validatePath(path);
      expect(result).toBe(path);
    });

    it('should resolve relative paths to absolute', () => {
      const testPath = './test.txt';
      const result = validatePath(testPath);
      expect(result).toBeDefined();
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should reject empty paths', () => {
      expect(() => validatePath('')).toThrow(PathValidationError);
      expect(() => validatePath('')).toThrow('Path cannot be empty');
    });

    it('should reject paths with null bytes', () => {
      const path = '/tmp/test\0file.txt';
      expect(() => validatePath(path)).toThrow(PathValidationError);
      expect(() => validatePath(path)).toThrow('null bytes');
    });

    it('should reject non-string values', () => {
      expect(() => validatePath(null as unknown as string)).toThrow(PathValidationError);
      expect(() => validatePath(undefined as unknown as string)).toThrow(PathValidationError);
    });

    describe('Property-based tests', () => {
      it('non-empty strings without null bytes do not throw', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => !s.includes('\0')),
            (input) => {
              expect(() => validatePath(input)).not.toThrow(PathValidationError);
            }
          )
        );
      });

      it('strings with null bytes throw PathValidationError', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }),
            fc.integer({ min: 0, max: 100 }),
            (base, pos) => {
              const pathWithNull = base.substring(0, pos) + '\0' + base.substring(pos);
              expect(() => validatePath(pathWithNull)).toThrow(PathValidationError);
              expect(() => validatePath(pathWithNull)).toThrow('null bytes');
            }
          )
        );
      });
    });
  });

  describe('safeReadFile', () => {
    it('should read a file after validating the path', async () => {
      const testFile = join(tempDir, 'test-read.txt');
      await safeWriteFile(testFile, 'test content');
      const content = await safeReadFile(testFile, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeReadFile('', 'utf-8')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeWriteFile', () => {
    it('should write a file after validating the path', async () => {
      const testFile = join(tempDir, 'test-write.txt');
      await safeWriteFile(testFile, 'test content');
      const content = await safeReadFile(testFile, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeWriteFile('', 'content')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeExists', () => {
    it('should return true for existing files', async () => {
      const testFile = join(tempDir, 'test-exists.txt');
      await safeWriteFile(testFile, 'content');
      const exists = await safeExists(testFile);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      const exists = await safeExists(join(tempDir, 'does-not-exist.txt'));
      expect(exists).toBe(false);
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeExists('')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeMkdir', () => {
    it('should create a directory after validating the path', async () => {
      const testDir = join(tempDir, 'test-dir');
      await safeMkdir(testDir);
      const exists = await safeExists(testDir);
      expect(exists).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      const testDir = join(tempDir, 'nested', 'dir');
      await safeMkdir(testDir, { recursive: true });
      const exists = await safeExists(testDir);
      expect(exists).toBe(true);
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeMkdir('')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeReaddir', () => {
    it('should read directory contents after validating the path', async () => {
      const testDir = join(tempDir, 'test-readdir');
      await safeMkdir(testDir);
      await safeWriteFile(join(testDir, 'file1.txt'), 'content1');
      await safeWriteFile(join(testDir, 'file2.txt'), 'content2');
      const files = await safeReaddir(testDir);
      expect(files).toEqual(expect.arrayContaining(['file1.txt', 'file2.txt']));
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeReaddir('')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeStat', () => {
    it('should get file statistics after validating the path', async () => {
      const testFile = join(tempDir, 'test-stat.txt');
      await safeWriteFile(testFile, 'content');
      const stats = await safeStat(testFile);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBe(7);
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeStat('')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeUnlink', () => {
    it('should delete a file after validating the path', async () => {
      const testFile = join(tempDir, 'test-unlink.txt');
      await safeWriteFile(testFile, 'content');
      await safeUnlink(testFile);
      const exists = await safeExists(testFile);
      expect(exists).toBe(false);
    });

    it('should throw validation error for empty path', async () => {
      await expect(safeUnlink('')).rejects.toThrow(PathValidationError);
    });
  });

  describe('safeRename', () => {
    it('should rename a file after validating both paths', async () => {
      const oldPath = join(tempDir, 'old-name.txt');
      const newPath = join(tempDir, 'new-name.txt');
      await safeWriteFile(oldPath, 'content');
      await safeRename(oldPath, newPath);
      const oldExists = await safeExists(oldPath);
      const newExists = await safeExists(newPath);
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });

    it('should throw validation error for empty old path', async () => {
      await expect(safeRename('', '/tmp/test.txt')).rejects.toThrow(PathValidationError);
    });

    it('should throw validation error for empty new path', async () => {
      await expect(safeRename('/tmp/test.txt', '')).rejects.toThrow(PathValidationError);
    });
  });
});
