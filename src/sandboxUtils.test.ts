import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import {
  getUserSandbox,
  validateFilename,
  ensureUserSandbox,
  resolveInUserSandbox,
  resolveSandboxPath,
  cleanupOldSandboxes,
  isSandboxLocked,
  acquireSandboxLock,
  releaseSandboxLock,
  logSandboxOperation,
  SandboxPathError,
} from './sandboxUtils';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock console.error for testing logSandboxOperation
let consoleErrorSpy: MockInstance | undefined;

describe('Sandbox Utils', () => {
  beforeEach(() => {
    // Store original environment variables
    process.env.ZIPLINE_TOKEN = 'test-token';
    process.env.ZIPLINE_DISABLE_SANDBOXING = 'false';

    // Mock console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment variables
    delete process.env.ZIPLINE_TOKEN;
    delete process.env.ZIPLINE_DISABLE_SANDBOXING;

    // Restore console.error
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  describe('getUserSandbox', () => {
    it('should return sandbox path when sandboxing is enabled', () => {
      const sandboxPath = getUserSandbox();
      const expectedBase = path.join(os.homedir(), '.zipline_tmp', 'users');
      expect(sandboxPath).toContain(expectedBase);
    });

    it('should return shared TMP_DIR when sandboxing is disabled', () => {
      process.env.ZIPLINE_DISABLE_SANDBOXING = 'true';
      const sandboxPath = getUserSandbox();
      const expectedPath = path.join(os.homedir(), '.zipline_tmp');
      expect(sandboxPath).toBe(expectedPath);
    });

    it('should throw error when ZIPLINE_TOKEN is missing', () => {
      delete process.env.ZIPLINE_TOKEN;
      expect(() => getUserSandbox()).toThrow(
        'ZIPLINE_TOKEN is required for sandbox functionality'
      );
    });
  });

  describe('validateFilename', () => {
    it('should return null for valid filenames', () => {
      expect(validateFilename('test.txt')).toBeNull();
      expect(validateFilename('document')).toBeNull();
      expect(validateFilename('file_with_underscores')).toBeNull();
    });

    it('should return error message for filenames with path separators', () => {
      expect(validateFilename('../test.txt')).toContain('path separators');
      expect(validateFilename('subdir/test.txt')).toContain('path separators');
      expect(validateFilename('subdir\\test.txt')).toContain('path separators');
    });

    it('should return error message for filenames with dot segments', () => {
      expect(validateFilename('..')).toContain('dot segments');
      expect(validateFilename('./test.txt')).toContain('dot segments');
    });

    it('should return error message for filenames starting with dot', () => {
      expect(validateFilename('.hidden')).toContain('Only bare filenames');
    });

    it('should return error message for absolute paths', () => {
      expect(validateFilename('/absolute/path')).toContain(
        'Only bare filenames'
      );
    });

    it('should return error message for empty filenames', () => {
      expect(validateFilename('')).toContain('empty');
    });
  });

  describe('resolveInUserSandbox', () => {
    it('should resolve filename within user sandbox', () => {
      const filename = 'test.txt';
      const resolvedPath = resolveInUserSandbox(filename);
      const expectedPath = path.join(getUserSandbox(), filename);
      expect(resolvedPath).toBe(expectedPath);
    });
  });

  describe('resolveSandboxPath', () => {
    it('should resolve valid sandbox paths', () => {
      const filename = 'test.txt';
      const resolvedPath = resolveSandboxPath(filename);
      const expectedPath = path.resolve(getUserSandbox(), filename);
      expect(resolvedPath).toBe(expectedPath);
    });

    it('should throw SandboxPathError for invalid filenames', () => {
      expect(() => resolveSandboxPath('../test.txt')).toThrow(SandboxPathError);
      expect(() => resolveSandboxPath('')).toThrow(SandboxPathError);
    });

    it('should allow directory paths within sandbox', () => {
      const resolvedPath = resolveSandboxPath('subdir/test.txt');
      const userSandbox = getUserSandbox();
      expect(resolvedPath).toBeDefined();
      expect(resolvedPath.startsWith(userSandbox)).toBe(true);
    });

    it('should throw SandboxPathError for path traversal attempts', () => {
      expect(() => resolveSandboxPath('../../etc/passwd')).toThrow(
        SandboxPathError
      );
    });

    it('should normalize backslash path separators', () => {
      const resolvedPath = resolveSandboxPath('subdir\\test.txt');
      const userSandbox = getUserSandbox();
      expect(resolvedPath).toBeDefined();
      expect(resolvedPath.startsWith(userSandbox)).toBe(true);
      expect(path.basename(resolvedPath)).toBe('test.txt');
    });

    it('should allow dot files within sandbox', () => {
      const resolvedPath = resolveSandboxPath('.hidden');
      const userSandbox = getUserSandbox();
      expect(resolvedPath).toBeDefined();
      expect(resolvedPath.startsWith(userSandbox)).toBe(true);
      expect(path.basename(resolvedPath)).toBe('.hidden');
    });

    it('should throw SandboxPathError for absolute paths', () => {
      expect(() => resolveSandboxPath('/absolute/path')).toThrow(
        SandboxPathError
      );
    });

    it('should throw SandboxPathError for null/undefined filenames', () => {
      expect(() => resolveSandboxPath(null as unknown as string)).toThrow(
        SandboxPathError
      );
      expect(() => resolveSandboxPath(undefined as unknown as string)).toThrow(
        SandboxPathError
      );
    });

    it('should return normalized path within sandbox', () => {
      const filename = 'test.txt';
      const resolvedPath = resolveSandboxPath(filename);
      const userSandbox = getUserSandbox();

      expect(resolvedPath).toBe(path.resolve(userSandbox, filename));
      expect(resolvedPath.startsWith(userSandbox)).toBe(true);
    });

    it('should throw SandboxPathError for absolute Windows paths', () => {
      expect(() => resolveSandboxPath('C:\\Windows\\System32')).toThrow(
        SandboxPathError
      );
    });
  });

  describe('logSandboxOperation', () => {
    it('should log sandbox operations to console.error', () => {
      logSandboxOperation('TEST_OPERATION', 'test.txt', 'test details');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SANDBOX_OPERATION: TEST_OPERATION - test.txt')
      );
    });

    it('should sanitize user hash in log messages', () => {
      logSandboxOperation('TEST_OPERATION');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('/users/[HASH]')
      );
    });
  });

  describe('ensureUserSandbox', () => {
    it('should create user sandbox directory', async () => {
      const sandboxPath = await ensureUserSandbox();
      const expectedPath = getUserSandbox();
      expect(sandboxPath).toBe(expectedPath);

      // Verify directory exists
      const stats = await fs.stat(sandboxPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('cleanupOldSandboxes', () => {
    it('should return 0 when sandboxing is disabled', async () => {
      process.env.ZIPLINE_DISABLE_SANDBOXING = 'true';
      const cleanedCount = await cleanupOldSandboxes();
      expect(cleanedCount).toBe(0);
    });
  });

  describe('isSandboxLocked', () => {
    it('should return false when sandboxing is disabled', async () => {
      process.env.ZIPLINE_DISABLE_SANDBOXING = 'true';
      const isLocked = await isSandboxLocked();
      expect(isLocked).toBe(false);
    });
  });

  describe('acquireSandboxLock', () => {
    it('should return true when sandboxing is disabled', async () => {
      process.env.ZIPLINE_DISABLE_SANDBOXING = 'true';
      const acquired = await acquireSandboxLock();
      expect(acquired).toBe(true);
    });
  });

  describe('releaseSandboxLock', () => {
    it('should return true when sandboxing is disabled', async () => {
      process.env.ZIPLINE_DISABLE_SANDBOXING = 'true';
      const released = await releaseSandboxLock();
      expect(released).toBe(true);
    });
  });
});
