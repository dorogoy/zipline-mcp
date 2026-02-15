import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizePath,
  validateSandboxPath,
  SandboxPathError,
  maskToken,
  maskSensitiveData,
  secureLog,
  detectSecretPatterns,
  SecretDetectionError,
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

  describe('maskToken', () => {
    it('should mask single token occurrence', () => {
      const result = maskToken('Token: secret123', 'secret123');
      expect(result).toBe('Token: [REDACTED]');
    });

    it('should mask multiple token occurrences in same string', () => {
      const result = maskToken(
        'Token1: secret123, Token2: secret123, Token3: secret123',
        'secret123'
      );
      expect(result).toBe(
        'Token1: [REDACTED], Token2: [REDACTED], Token3: [REDACTED]'
      );
    });

    it('should mask token at start of string', () => {
      const result = maskToken('secret123 is my token', 'secret123');
      expect(result).toBe('[REDACTED] is my token');
    });

    it('should mask token at end of string', () => {
      const result = maskToken('My token is secret123', 'secret123');
      expect(result).toBe('My token is [REDACTED]');
    });

    it('should mask token in middle of string', () => {
      const result = maskToken('Prefix secret123 suffix', 'secret123');
      expect(result).toBe('Prefix [REDACTED] suffix');
    });

    it('should return original string unchanged if no token present', () => {
      const result = maskToken('This string has no token', 'secret123');
      expect(result).toBe('This string has no token');
    });

    it('should handle empty string', () => {
      const result = maskToken('', 'secret123');
      expect(result).toBe('');
    });

    it('should handle null input', () => {
      const result = maskToken(null as unknown as string, 'secret123');
      expect(result).toBe('');
    });

    it('should handle undefined input', () => {
      const result = maskToken(undefined as unknown as string, 'secret123');
      expect(result).toBe('');
    });

    it('should handle empty token', () => {
      const result = maskToken('Some text with nothing to mask', '');
      expect(result).toBe('Some text with nothing to mask');
    });

    it('should handle null token', () => {
      const result = maskToken('Some text', null as unknown as string);
      expect(result).toBe('Some text');
    });

    it('should handle undefined token', () => {
      const result = maskToken('Some text', undefined as unknown as string);
      expect(result).toBe('Some text');
    });

    it('should handle non-string input', () => {
      const result = maskToken(12345 as unknown as string, '12345');
      expect(result).toBe('');
    });

    it('should be case sensitive', () => {
      const result = maskToken('Token: Secret123', 'secret123');
      expect(result).toBe('Token: Secret123');
    });

    it('should handle partial token matches', () => {
      const result = maskToken('Tokens: secret1234 secret12345', 'secret123');
      expect(result).toBe('Tokens: [REDACTED]4 [REDACTED]45');
    });

    it('should handle token that is a substring', () => {
      const result = maskToken('My secret123value is here', 'secret123');
      expect(result).toBe('My [REDACTED]value is here');
    });

    it('should handle multiple different tokens with same value', () => {
      const result = maskToken('abc abc abc', 'abc');
      expect(result).toBe('[REDACTED] [REDACTED] [REDACTED]');
    });

    it('should handle token with special characters', () => {
      const result = maskToken('Token: abc@123!', 'abc@123!');
      expect(result).toBe('Token: [REDACTED]');
    });

    it('should handle whitespace in token', () => {
      const result = maskToken('Token with space: abc 123', 'abc 123');
      expect(result).toBe('Token with space: [REDACTED]');
    });

    it('should handle consecutive token occurrences', () => {
      const result = maskToken('abcabcabc', 'abc');
      expect(result).toBe('[REDACTED][REDACTED][REDACTED]');
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask ZIPLINE_TOKEN from environment', () => {
      const result = maskSensitiveData('Token: test-token-for-security');
      expect(result).toBe('Token: [REDACTED]');
    });

    it('should handle multiple occurrences of ZIPLINE_TOKEN', () => {
      const result = maskSensitiveData(
        'First: test-token-for-security, Second: test-token-for-security'
      );
      expect(result).toBe('First: [REDACTED], Second: [REDACTED]');
    });

    it('should return original string if ZIPLINE_TOKEN not set', () => {
      delete process.env.ZIPLINE_TOKEN;
      const result = maskSensitiveData('Token: some-value');
      expect(result).toBe('Token: some-value');
      process.env.ZIPLINE_TOKEN = 'test-token-for-security';
    });

    it('should handle empty ZIPLINE_TOKEN', () => {
      const originalToken = process.env.ZIPLINE_TOKEN;
      process.env.ZIPLINE_TOKEN = '';
      const result = maskSensitiveData('Token: some-value');
      expect(result).toBe('Token: some-value');
      process.env.ZIPLINE_TOKEN = originalToken;
    });

    it('should handle empty string input', () => {
      const result = maskSensitiveData('');
      expect(result).toBe('');
    });

    it('should handle null input', () => {
      const result = maskSensitiveData(null as unknown as string);
      expect(result).toBe('');
    });

    it('should handle undefined input', () => {
      const result = maskSensitiveData(undefined as unknown as string);
      expect(result).toBe('');
    });
  });

  describe('secureLog', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should mask ZIPLINE_TOKEN before logging', () => {
      secureLog('Token: test-token-for-security');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Token: [REDACTED]');
    });

    it('should log multiple arguments', () => {
      secureLog(
        'First:',
        'test-token-for-security',
        'Second:',
        'test-token-for-security'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'First:',
        '[REDACTED]',
        'Second:',
        '[REDACTED]'
      );
    });

    it('should handle empty message', () => {
      secureLog('');
      expect(consoleErrorSpy).toHaveBeenCalledWith('');
    });

    it('should handle no additional arguments', () => {
      secureLog('Token: test-token-for-security');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle arguments that are not strings', () => {
      secureLog('Number:', 123, 'Object:', { key: 'value' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Number:', 123, 'Object:', {
        key: 'value',
      });
    });

    it('should mask token in object string representation', () => {
      const obj = { token: 'test-token-for-security' };
      secureLog('Object:', JSON.stringify(obj));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Object:',
        '{"token":"[REDACTED]"}'
      );
    });

    it('should mask token in nested objects', () => {
      const obj = {
        token: 'test-token-for-security',
        nested: { value: 'test-token-for-security' },
      };
      secureLog('Nested:', obj);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Nested:', {
        token: '[REDACTED]',
        nested: { value: '[REDACTED]' },
      });
    });

    it('should handle objects with circular references gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { name: 'test' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      circular.self = circular;
      secureLog('Circular:', circular);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Circular:',
        '[OBJECT_MASKING_ERROR]'
      );
    });
  });

  describe('detectSecretPatterns', () => {
    describe('.env file detection', () => {
      it('should reject .env files by extension', () => {
        const result = detectSecretPatterns('API_KEY=secret', '.env');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
        expect(result.message).toContain('.env');
      });

      it('should reject .env.local files by extension', () => {
        const result = detectSecretPatterns('API_KEY=secret', '.env.local');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
      });

      it('should reject .env.production files by extension', () => {
        const result = detectSecretPatterns(
          'API_KEY=secret',
          '.env.production'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
      });

      it('should reject .env.development files by extension', () => {
        const result = detectSecretPatterns(
          'API_KEY=secret',
          '.env.development'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
      });

      it('should detect .env files with paths', () => {
        const result = detectSecretPatterns('API_KEY=secret', 'path/to/.env');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
      });
    });

    describe('API key detection', () => {
      it('should detect API_KEY= pattern', () => {
        const result = detectSecretPatterns(
          'API_KEY=sk_test_123',
          'config.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect APIKEY= pattern', () => {
        const result = detectSecretPatterns('APIKEY=abc123', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect AWS_ACCESS_KEY_ID= pattern', () => {
        const result = detectSecretPatterns(
          'AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP',
          'config.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect AWS key pattern AKIA[0-9A-Z]{16}', () => {
        const result = detectSecretPatterns(
          'Access key: AKIAABCDEFGHIJKLMNOP',
          'readme.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });
    });

    describe('Password detection', () => {
      it('should detect PASSWORD= pattern', () => {
        const result = detectSecretPatterns('PASSWORD=secret123', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });

      it('should detect DB_PASSWORD= pattern', () => {
        const result = detectSecretPatterns(
          'DB_PASSWORD=pass123',
          'config.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });

      it('should detect PASS= pattern', () => {
        const result = detectSecretPatterns('PASS=test', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });
    });

    describe('Secret detection', () => {
      it('should detect SECRET= pattern', () => {
        const result = detectSecretPatterns('SECRET=value', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('secret');
      });

      it('should detect SECRET_KEY= pattern', () => {
        const result = detectSecretPatterns('SECRET_KEY=xyz', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('secret');
      });

      it('should detect CLIENT_SECRET= pattern', () => {
        const result = detectSecretPatterns('CLIENT_SECRET=abc', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('secret');
      });
    });

    describe('Token detection', () => {
      it('should detect TOKEN= pattern', () => {
        const result = detectSecretPatterns('TOKEN=bearer_xyz', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('token');
      });

      it('should detect AUTH_TOKEN= pattern', () => {
        const result = detectSecretPatterns('AUTH_TOKEN=jwt_abc', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('token');
      });

      it('should detect REFRESH_TOKEN= pattern', () => {
        const result = detectSecretPatterns(
          'REFRESH_TOKEN=refresh123',
          'config.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('token');
      });
    });

    describe('Private key detection', () => {
      it('should detect -----BEGIN PRIVATE KEY-----', () => {
        const result = detectSecretPatterns(
          '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=',
          'key.pem'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('private_key');
      });

      it('should detect PRIVATE_KEY= pattern', () => {
        const result = detectSecretPatterns(
          'PRIVATE_KEY=some_key_value',
          'config.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('private_key');
      });
    });

    describe('Clean file detection', () => {
      it('should allow text files without secrets', () => {
        const result = detectSecretPatterns('This is clean text', 'file.txt');
        expect(result.detected).toBe(false);
      });

      it('should allow JSON config without secrets', () => {
        const result = detectSecretPatterns(
          '{"name":"test","version":"1.0"}',
          'config.json'
        );
        expect(result.detected).toBe(false);
      });

      it('should allow documentation text', () => {
        const result = detectSecretPatterns(
          'The password field is required for authentication',
          'readme.md'
        );
        expect(result.detected).toBe(false);
      });

      it('should allow image files (binary)', () => {
        const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        const result = detectSecretPatterns(binaryBuffer, 'image.png');
        expect(result.detected).toBe(false);
      });
    });

    describe('Case insensitivity', () => {
      it('should detect lowercase api_key=', () => {
        const result = detectSecretPatterns('api_key=secret', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect uppercase API_KEY=', () => {
        const result = detectSecretPatterns('API_KEY=secret', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect mixed case Api_Key=', () => {
        const result = detectSecretPatterns('Api_Key=secret', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should detect lowercase password=', () => {
        const result = detectSecretPatterns('password=secret', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });

      it('should detect uppercase PASSWORD=', () => {
        const result = detectSecretPatterns('PASSWORD=secret', 'config.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty files', () => {
        const result = detectSecretPatterns('', 'file.txt');
        expect(result.detected).toBe(false);
      });

      it('should handle null content gracefully', () => {
        const result = detectSecretPatterns(
          null as unknown as string,
          'file.txt'
        );
        expect(result.detected).toBe(false);
      });

      it('should handle undefined content gracefully', () => {
        const result = detectSecretPatterns(
          undefined as unknown as string,
          'file.txt'
        );
        expect(result.detected).toBe(false);
      });

      it('should handle binary files with null bytes', () => {
        const binaryContent = 'Some text\x00with null bytes';
        const result = detectSecretPatterns(binaryContent, 'file.bin');
        expect(result.detected).toBe(false);
      });

      it('should handle large files', () => {
        const largeContent = 'clean text '.repeat(100000);
        const result = detectSecretPatterns(largeContent, 'large.txt');
        expect(result.detected).toBe(false);
      });

      it('should stop at first secret found', () => {
        const result = detectSecretPatterns(
          'API_KEY=first\nPASSWORD=second',
          'file.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });
    });

    describe('Multiple secret types', () => {
      it('should detect one of multiple secrets', () => {
        const result = detectSecretPatterns(
          'clean\nclean\nPASSWORD=secret\nclean',
          'file.txt'
        );
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('password');
      });

      it('should prioritize .env detection over content scanning', () => {
        const result = detectSecretPatterns('clean text', '.env');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('env_file');
      });
    });

    describe('Buffer input support', () => {
      it('should handle Buffer content', () => {
        const bufferContent = Buffer.from('API_KEY=secret');
        const result = detectSecretPatterns(bufferContent, 'file.txt');
        expect(result.detected).toBe(true);
        expect(result.secretType).toBe('api_key');
      });

      it('should skip binary Buffer content', () => {
        const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        const result = detectSecretPatterns(binaryBuffer, 'file.bin');
        expect(result.detected).toBe(false);
      });
    });
  });

  describe('SecretDetectionError', () => {
    it('should create error with message, secretType, and pattern', () => {
      const error = new SecretDetectionError(
        'File rejected: API key pattern detected',
        'api_key',
        'API_KEY='
      );
      expect(error.message).toBe('File rejected: API key pattern detected');
      expect(error.secretType).toBe('api_key');
      expect(error.pattern).toBe('API_KEY=');
      expect(error.name).toBe('SecretDetectionError');
    });
  });
});
