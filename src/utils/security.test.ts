import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sanitizePath,
  validateSandboxPath,
  SandboxPathError,
} from './security';
import path from 'path';
import os from 'os';

describe('Security Utils', () => {
  let userSandbox: string;

  beforeEach(() => {
    // Set up test environment
    process.env.ZIPLINE_TOKEN = 'test-token-for-security';
    process.env.ZIPLINE_DISABLE_SANDBOXING = 'false';

    // Set up a mock user sandbox path for testing
    userSandbox = path.join(os.homedir(), '.zipline_tmp', 'users', 'test-hash');
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ZIPLINE_TOKEN;
    delete process.env.ZIPLINE_DISABLE_SANDBOXING;
  });

  describe('sanitizePath', () => {
    it('should normalize and validate valid simple paths', () => {
      const result = sanitizePath('file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(result.startsWith(userSandbox)).toBe(true);
      expect(result.endsWith('file.txt')).toBe(true);
    });

    it('should normalize paths within a directory', () => {
      const result = sanitizePath('folder/file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(result.startsWith(userSandbox)).toBe(true);
      expect(result.endsWith('file.txt')).toBe(true);
    });

    it('should throw SandboxPathError for directory traversal attempts with ../', () => {
      expect(() => sanitizePath('../escape.txt', userSandbox)).toThrow(
        SandboxPathError
      );
      expect(() => sanitizePath('../../escape.txt', userSandbox)).toThrow(
        SandboxPathError
      );
      expect(() => sanitizePath('../../../etc/passwd', userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should throw SandboxPathError for directory traversal attempts with ./', () => {
      expect(() => sanitizePath('./file.txt', userSandbox)).not.toThrow();
      expect(() => sanitizePath('./../escape.txt', userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should normalize mixed path separators (Unix style)', () => {
      const result = sanitizePath('folder\\file.txt', userSandbox);
      expect(result).toBeDefined();
      // Should normalize to OS-appropriate separator
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should normalize mixed path separators with both / and \\', () => {
      const result = sanitizePath('folder/subfolder\\file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should throw SandboxPathError for absolute Unix paths', () => {
      expect(() => sanitizePath('/etc/passwd', userSandbox)).toThrow(
        SandboxPathError
      );
      expect(() => sanitizePath('/tmp/file.txt', userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should throw SandboxPathError for absolute Windows paths', () => {
      expect(() => sanitizePath('C:\\Windows\\System32', userSandbox)).toThrow(
        SandboxPathError
      );
      expect(() => sanitizePath('D:\\Data\\file.txt', userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should throw SandboxPathError for empty paths', () => {
      expect(() => sanitizePath('', userSandbox)).toThrow(SandboxPathError);
    });

    it('should throw SandboxPathError for null paths', () => {
      expect(() =>
        sanitizePath(null as unknown as string, userSandbox)
      ).toThrow(SandboxPathError);
    });

    it('should throw SandboxPathError for undefined paths', () => {
      expect(() =>
        sanitizePath(undefined as unknown as string, userSandbox)
      ).toThrow(SandboxPathError);
    });

    it('should handle whitespace-only paths', () => {
      expect(() => sanitizePath('   ', userSandbox)).toThrow(SandboxPathError);
    });

    it('should normalize paths with trailing separators', () => {
      const result = sanitizePath('folder/file.txt/', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should handle complex directory structures', () => {
      const result = sanitizePath('a/b/c/d/e/file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(result.startsWith(userSandbox)).toBe(true);
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should throw SandboxPathError for paths that attempt sandbox escape', () => {
      expect(() =>
        sanitizePath('folder/../../escape.txt', userSandbox)
      ).toThrow(SandboxPathError);
    });

    it('should handle paths with consecutive separators', () => {
      const result = sanitizePath('folder//file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should return normalized absolute path', () => {
      const result = sanitizePath('file.txt', userSandbox);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('validateSandboxPath', () => {
    it('should return true for valid sandbox paths', () => {
      const validPath = path.join(userSandbox, 'file.txt');
      expect(validateSandboxPath(validPath, userSandbox)).toBe(true);
    });

    it('should return true for valid nested paths', () => {
      const validPath = path.join(
        userSandbox,
        'folder',
        'subfolder',
        'file.txt'
      );
      expect(validateSandboxPath(validPath, userSandbox)).toBe(true);
    });

    it('should return false for paths outside sandbox', () => {
      const outsidePath = '/etc/passwd';
      expect(validateSandboxPath(outsidePath, userSandbox)).toBe(false);
    });

    it('should return false for parent directory escapes', () => {
      const escapedPath = path.join(userSandbox, '..', 'escape.txt');
      const normalizedEscaped = path.normalize(escapedPath);
      expect(validateSandboxPath(normalizedEscaped, userSandbox)).toBe(false);
    });

    it('should return false for null paths', () => {
      expect(validateSandboxPath(null as unknown as string, userSandbox)).toBe(
        false
      );
    });

    it('should return false for undefined paths', () => {
      expect(
        validateSandboxPath(undefined as unknown as string, userSandbox)
      ).toBe(false);
    });

    it('should handle case-sensitive path comparisons on Unix', () => {
      const validPath = path.join(userSandbox, 'file.txt');
      const caseVariation = path.join(userSandbox, 'FILE.TXT');

      // On Unix, these should be different paths
      if (os.platform() !== 'win32') {
        const result = validateSandboxPath(caseVariation, userSandbox);
        expect(result).toBe(
          caseVariation.toLowerCase() === validPath.toLowerCase() ||
            caseVariation.startsWith(userSandbox)
        );
      }
    });
  });

  describe('Cross-platform behavior', () => {
    it('should work correctly on Unix-like systems', () => {
      const result = sanitizePath('folder/file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(result.startsWith(userSandbox)).toBe(true);
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should handle backslash separators appropriately', () => {
      const result = sanitizePath('folder\\file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('file.txt');
    });

    it('should normalize paths correctly regardless of platform', () => {
      const testCases = [
        'folder/file.txt',
        'folder\\file.txt',
        'folder/subfolder/file.txt',
        'folder\\subfolder\\file.txt',
        'folder/subfolder\\file.txt',
      ];

      testCases.forEach((testCase) => {
        const result = sanitizePath(testCase, userSandbox);
        expect(result).toBeDefined();
        expect(result.startsWith(userSandbox)).toBe(true);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with special characters', () => {
      const result = sanitizePath('file with spaces.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('file with spaces.txt');
    });

    it('should handle paths with dots in filename', () => {
      const result = sanitizePath('my.file.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('my.file.txt');
    });

    it('should handle paths with underscores and hyphens', () => {
      const result = sanitizePath('my_file-123.txt', userSandbox);
      expect(result).toBeDefined();
      expect(path.basename(result)).toBe('my_file-123.txt');
    });

    it('should handle deeply nested paths', () => {
      const deepPath =
        'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/file.txt';
      const result = sanitizePath(deepPath, userSandbox);
      expect(result).toBeDefined();
      expect(result.startsWith(userSandbox)).toBe(true);
    });

    it('should throw SandboxPathError for paths with null bytes', () => {
      expect(() => sanitizePath('file\x00.txt', userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should handle symbolic link path syntax (防御测试)', () => {
      // Note: This tests the PATH string syntax, not actual filesystem symlinks
      // Actual symlink resolution requires filesystem access and is handled by Node.js path.resolve()
      const symlinkStylePath = 'folder/../../../etc/passwd';
      expect(() => sanitizePath(symlinkStylePath, userSandbox)).toThrow(
        SandboxPathError
      );
    });

    it('should reject paths that could be symlink targets outside sandbox', () => {
      // Test path patterns commonly used in symlink attacks
      expect(() => sanitizePath('/etc/passwd', userSandbox)).toThrow(
        SandboxPathError
      );
      expect(() => sanitizePath('/tmp/../etc/passwd', userSandbox)).toThrow(
        SandboxPathError
      );
    });
  });
});
