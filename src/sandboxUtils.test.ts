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
  stageFile,
  clearStagedContent,
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

  describe('stageFile', () => {
    const testDir = path.join(os.tmpdir(), 'stagefile-test');

    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Memory staging (files < 5MB)', () => {
      it('should stage 1KB file in memory', async () => {
        const filePath = path.join(testDir, '1kb.txt');
        const content = Buffer.alloc(1 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
        if (staged.type === 'memory') {
          expect(staged.content).toEqual(content);
          expect(staged.path).toBe(filePath);
          expect(staged.content).toBeInstanceOf(Buffer);
          expect(staged.content.length).toBe(1024);
        }
      });

      it('should stage small file with validation errors thrown for secrets', async () => {
        const filePath = path.join(testDir, 'secret.txt');
        const content = Buffer.from('api_key = "sk-test-secret-key"');
        await fs.writeFile(filePath, content);

        await expect(stageFile(filePath)).rejects.toThrow('File rejected');
      });

      it('should stage 0 byte file in memory', async () => {
        const filePath = path.join(testDir, 'empty.txt');
        const content = Buffer.alloc(0);
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
        if (staged.type === 'memory') {
          expect(staged.content).toEqual(content);
          expect(staged.path).toBe(filePath);
          expect(staged.content).toBeInstanceOf(Buffer);
          expect(staged.content.length).toBe(0);
        }
      });

      it('should stage 1 byte file in memory (edge case)', async () => {
        const filePath = path.join(testDir, '1byte.txt');
        const content = Buffer.from('a');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
        if (staged.type === 'memory') {
          expect(staged.content).toEqual(content);
          expect(staged.content).toBeInstanceOf(Buffer);
          expect(staged.content.length).toBe(1);
          expect(staged.content.toString()).toBe('a');
        }
      });

      it('should stage 4.9MB file in memory (edge case near threshold)', async () => {
        const filePath = path.join(testDir, '4.9mb.txt');
        const size = 4.9 * 1024 * 1024;
        const content = Buffer.alloc(Math.floor(size), 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
        if (staged.type === 'memory') {
          expect(staged.content).toEqual(content);
          expect(staged.content).toBeInstanceOf(Buffer);
          expect(staged.content.length).toBe(Math.floor(size));
        }
      }, 30000);

      it('should verify Buffer contains correct file content byte-for-byte', async () => {
        const filePath = path.join(testDir, 'content-verify.txt');
        const originalContent = Buffer.from(
          'Hello, World! This is test content.'
        );
        await fs.writeFile(filePath, originalContent);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
        if (staged.type === 'memory') {
          expect(staged.content.equals(originalContent)).toBe(true);
          expect(staged.content.toString()).toBe(originalContent.toString());
        }
      });
    });

    describe('Disk fallback (files >= 5MB)', () => {
      it('should stage exactly 5MB file on disk (boundary condition)', async () => {
        const filePath = path.join(testDir, 'exactly-5mb.txt');
        const content = Buffer.alloc(5 * 1024 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('disk');
        if (staged.type === 'disk') {
          expect(staged.path).toBe(filePath);
        }
      });
    });

    describe('Error handling', () => {
      it('should throw error for non-existent file', async () => {
        const filePath = path.join(testDir, 'non-existent.txt');
        await expect(stageFile(filePath)).rejects.toThrow('ENOENT');
      });
    });

    describe('Size threshold validation', () => {
      it('should correctly identify 5MB threshold as 5,242,880 bytes', () => {
        const threshold = 5 * 1024 * 1024;
        expect(threshold).toBe(5242880);
      });

      it('should use memory staging for files just under threshold (5,242,879 bytes)', async () => {
        const filePath = path.join(testDir, 'just-under-5mb.txt');
        const content = Buffer.alloc(5 * 1024 * 1024 - 1, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');
      });

      it('should use disk staging for files exactly at threshold (5,242,880 bytes)', async () => {
        const filePath = path.join(testDir, 'exactly-5mb.txt');
        const content = Buffer.alloc(5 * 1024 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('disk');
      });
    });

    describe('clearStagedContent', () => {
      it('should clear Buffer content for memory-staged files', async () => {
        const filePath = path.join(testDir, 'test.txt');
        const content = Buffer.from('test content');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');

        if (staged.type === 'memory') {
          expect(staged.content).toEqual(content);
          clearStagedContent(staged);
          expect(staged.content as any).toBeNull();
        }
      });

      it('should handle disk-staged files without error', async () => {
        const filePath = path.join(testDir, 'large-file.txt');
        const content = Buffer.alloc(5 * 1024 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('disk');

        clearStagedContent(staged);
      });
    });

    describe('Graceful disk fallback', () => {
      it('should validate secrets for memory-staged files before returning', async () => {
        const filePath = path.join(testDir, 'secret.txt');
        const content = Buffer.from('api_key = "sk-test-secret-key"');
        await fs.writeFile(filePath, content);

        await expect(stageFile(filePath)).rejects.toThrow();
      });

      it('should use disk fallback for files exactly at 5MB threshold', async () => {
        const filePath = path.join(testDir, 'exactly-5mb.txt');
        const content = Buffer.alloc(5 * 1024 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('disk');
        expect(staged.path).toBe(filePath);
      });

      it('should use disk fallback for files larger than 5MB threshold', async () => {
        const filePath = path.join(testDir, '6mb.txt');
        const content = Buffer.alloc(6 * 1024 * 1024, 'x');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('disk');
        expect(staged.path).toBe(filePath);
      });
    });

    describe('Integration: Full cleanup workflow', () => {
      it('should stage, use, and cleanup memory-staged file end-to-end', async () => {
        const filePath = path.join(testDir, 'integration-test.txt');
        const originalContent = Buffer.from('Integration test content');
        await fs.writeFile(filePath, originalContent);

        // Stage the file
        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');

        if (staged.type === 'memory') {
          // Verify content is loaded
          expect(staged.content.equals(originalContent)).toBe(true);

          // Simulate usage (e.g., upload would happen here)
          const contentCopy = Buffer.from(staged.content);
          expect(contentCopy.equals(originalContent)).toBe(true);

          // Cleanup
          clearStagedContent(staged);

          // Verify buffer reference is cleared
          expect(staged.content as any).toBeNull();
        }
      });

      it('should handle cleanup in try/finally pattern (simulated error)', async () => {
        const filePath = path.join(testDir, 'error-test.txt');
        const content = Buffer.from('Error test content');
        await fs.writeFile(filePath, content);

        const staged = await stageFile(filePath);
        expect(staged.type).toBe('memory');

        // Wrap in a function to test error handling
        const uploadSimulation = async () => {
          try {
            if (staged.type === 'memory') {
              // Simulate an error during upload
              throw new Error('Simulated upload error');
            }
          } finally {
            // Cleanup should happen even on error
            clearStagedContent(staged);
          }
        };

        // Expect the error to be thrown
        await expect(uploadSimulation()).rejects.toThrow('Simulated upload error');

        // Verify cleanup happened despite error
        if (staged.type === 'memory') {
          expect(staged.content as any).toBeNull();
        }
      });
    });
  });
});
