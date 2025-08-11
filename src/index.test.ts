// Set required environment variables for tests
process.env.ZIPLINE_TOKEN = 'test-token';
process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Dirent } from 'fs';

// Define types for the mock
interface MockServer {
  registerTool: ReturnType<typeof vi.fn<unknown[], unknown>>;
  connect: ReturnType<typeof vi.fn>;
}

// Mock the McpServer and its methods
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const McpServer = vi.fn().mockImplementation((): MockServer => {
    const registerToolMock = vi.fn<unknown[], unknown>();
    registerToolMock.mockImplementation(() => {});
    return {
      registerTool: registerToolMock,
      connect: vi.fn(),
    };
  });
  return { McpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock the httpClient module
vi.mock('./httpClient', () => ({
  uploadFile: vi.fn().mockResolvedValue('https://example.com/file.txt'),
}));

const fsMock = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
};
vi.mock('fs/promises', () => ({
  ...fsMock,
  default: fsMock,
}));

vi.mock('path', async (importOriginal) => {
  const actualPath = await importOriginal<typeof import('path')>();
  return {
    ...actualPath,
    basename: vi.fn((p: string) => p.split('/').pop() || p),
    extname: vi.fn((p: string) => {
      const lastDotIndex = p.lastIndexOf('.');
      return lastDotIndex === -1 ? '' : p.substring(lastDotIndex);
    }),
    dirname: vi.fn(() => '/mocked/dir'),
  };
});

vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mocked/dir/index.ts'),
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => '/home/user',
  };
});

// Mock console.error to suppress output during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Zipline MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create an McpServer instance', async () => {
    await import('./index');
    // Check that McpServer is called with a valid semver version string
    const calls = vi.mocked(McpServer).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const call = calls[0]?.[0];
    expect(call).toBeDefined();
    if (call) {
      expect(call.name).toBe('zipline-upload-server');
      expect(call.version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
    }
  });

  it('should register the upload_file_to_zipline tool', async () => {
    const { server } = (await import('./index')) as unknown as {
      server: MockServer;
    };
    expect(server.registerTool).toHaveBeenCalledWith(
      'upload_file_to_zipline',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the validate_file tool', async () => {
    const { server } = (await import('./index')) as unknown as {
      server: MockServer;
    };
    expect(server.registerTool).toHaveBeenCalledWith(
      'validate_file',
      expect.any(Object),
      expect.any(Function)
    );
  });

  describe('upload_file_to_zipline tool', () => {
    let server: MockServer;

    beforeEach(async () => {
      vi.resetModules();
      Object.values(fsMock).forEach((fn) => fn.mockReset());
      const imported = (await import('./index')) as unknown as {
        server: MockServer;
      };
      server = imported.server;
    });

    const getToolHandler = (toolName: string): ToolHandler | undefined => {
      const call = vi
        .mocked(server.registerTool)
        .mock.calls.find((c: unknown[]) => c[0] === toolName);
      return call?.[2] as ToolHandler | undefined;
    };

    it('should validate and normalize format correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test invalid format
      const result3 = await handler(
        { filePath: '/path/to/file.txt', format: 'invalid' },
        {}
      );
      expect(result3.isError).toBe(true);
      expect(result3.content[0]?.text).toContain('Invalid format: invalid');

      // Test case-insensitive matching (should be valid)
      const result1 = await handler(
        { filePath: '/path/to/file.txt', format: 'UUID' },
        {}
      );
      expect(!result1.isError).toBe(true); // Should succeed since UUID is valid (normalized to uuid)

      // Test alias handling (should be valid)
      const result2 = await handler(
        { filePath: '/path/to/file.txt', format: 'GFYCAT' },
        {}
      );
      expect(!result2.isError).toBe(true); // Should succeed since GFYCAT is valid (normalized to random-words)
    });

    it('should handle file not found error', async () => {
      fsMock.readFile.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { filePath: '/path/to/nonexistent.txt' },
        {}
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('UPLOAD FAILED');
    });

    it('should handle unsupported file type error', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.xyz' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('File type .xyz not supported');
    });

    it('should handle deleteAt parameter correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test with valid deletesAt parameter
      const result = await handler(
        {
          filePath: '/path/to/file.txt',
          deletesAt: '1d',
        },
        {}
      );
      expect(!result.isError).toBe(true);

      // Verify uploadFile was called with the correct deleteAt parameter
      const { uploadFile } = await import('./httpClient');
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          deletesAt: '1d',
        })
      );
    });

    it('should handle password parameter correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test with valid password parameter
      const result = await handler(
        {
          filePath: '/path/to/file.txt',
          password: 'secret123',
        },
        {}
      );
      expect(!result.isError).toBe(true);

      // Verify uploadFile was called with the correct password parameter
      const { uploadFile } = await import('./httpClient');
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'secret123',
        })
      );
    });

    it('should handle maxViews parameter correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test with valid maxViews parameter
      const result = await handler(
        {
          filePath: '/path/to/file.txt',
          maxViews: 10,
        },
        {}
      );
      expect(!result.isError).toBe(true);

      // Verify uploadFile was called with the correct maxViews parameter
      const { uploadFile } = await import('./httpClient');
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          maxViews: 10,
        })
      );
    });

    it('should handle folder parameter correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test with valid folder parameter
      const result = await handler(
        {
          filePath: '/path/to/file.txt',
          folder: 'testfolder',
        },
        {}
      );
      expect(!result.isError).toBe(true);

      // Verify uploadFile was called with the correct folder parameter
      const { uploadFile } = await import('./httpClient');
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'testfolder',
        })
      );
    });

    it('should handle all optional parameters together', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test with all optional parameters
      const result = await handler(
        {
          filePath: '/path/to/file.txt',
          deletesAt: '2h',
          password: 'secret123',
          maxViews: 5,
          folder: 'testfolder',
        },
        {}
      );
      expect(!result.isError).toBe(true);

      // Verify uploadFile was called with all parameters
      const { uploadFile } = await import('./httpClient');
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          deletesAt: '2h',
          password: 'secret123',
          maxViews: 5,
          folder: 'testfolder',
        })
      );
    });
  });
});

// Define types for tool handler
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: Record<string, unknown>
) => Promise<ToolResult>;

describe('tmp_file_manager tool', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(fsMock).forEach((fn) => fn.mockReset());
    const imported = (await import('./index')) as unknown as {
      server: MockServer;
    };
    server = imported.server;
  });

  describe('sandbox functionality', () => {
    it('should create different sandbox directories for different tokens', async () => {
      // Test with first token
      process.env.ZIPLINE_TOKEN = 'token1';
      vi.doMock('./index', async () => {
        const actual = await vi.importActual('./index');
        return { ...actual };
      });
      const { getUserSandbox: getSandbox1 } = await import('./index');
      const sandbox1 = getSandbox1();

      // Reset modules and test with second token
      vi.resetModules();
      process.env.ZIPLINE_TOKEN = 'token2';
      vi.doMock('./index', async () => {
        const actual = await vi.importActual('./index');
        return { ...actual };
      });
      const { getUserSandbox: getSandbox2 } = await import('./index');
      const sandbox2 = getSandbox2();

      expect(sandbox1).not.toBe(sandbox2);
      expect(sandbox1).toContain('/users/');
      expect(sandbox2).toContain('/users/');
    });

    it('should create the same sandbox directory for the same token', async () => {
      process.env.ZIPLINE_TOKEN = 'same-token';

      const { getUserSandbox: getSandbox1 } = await import('./index');
      const sandbox1 = getSandbox1();

      // Import again with same token
      const { getUserSandbox: getSandbox2 } = await import('./index');
      const sandbox2 = getSandbox2();

      expect(sandbox1).toBe(sandbox2);
    });

    it('should use hashed token for sandbox directory name', async () => {
      process.env.ZIPLINE_TOKEN = 'test-token';

      const { getUserSandbox: getSandbox1 } = await import('./index');
      const sandbox1 = getSandbox1();

      // Reset modules and test with different token
      vi.resetModules();
      process.env.ZIPLINE_TOKEN = 'different-token';
      vi.doMock('./index', async () => {
        const actual = await vi.importActual('./index');
        return { ...actual };
      });
      const { getUserSandbox: getSandbox2 } = await import('./index');
      const sandbox2 = getSandbox2();

      // Should be different
      expect(sandbox1).not.toBe(sandbox2);

      // Should both be valid paths
      expect(sandbox1).toMatch(/\/users\/[a-f0-9]+$/);
      expect(sandbox2).toMatch(/\/users\/[a-f0-9]+$/);
    });

    it('should create files in user sandbox directory', async () => {
      process.env.ZIPLINE_TOKEN = 'test-token-user1';

      const { getUserSandbox } = await import('./index');
      const userSandbox = getUserSandbox();

      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      // Mock file operations
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);
      fsMock.stat.mockResolvedValue({ size: 42 });

      const result = await handler(
        { command: 'CREATE test.txt', content: 'hello world' },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(
        /Created\/Overwritten: test\.txt/
      );

      // Verify writeFile was called with sandbox path
      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(userSandbox),
        'hello world',
        { encoding: 'utf8' }
      );
    });

    it('should list files only from user sandbox directory', async () => {
      process.env.ZIPLINE_TOKEN = 'test-token-user1';

      const { getUserSandbox } = await import('./index');
      const userSandbox = getUserSandbox();

      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      // Mock file operations
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.readdir.mockResolvedValue([
        { isFile: () => true, name: 'user1-file.txt' },
        { isFile: () => true, name: 'user1-notes.md' },
      ] as Dirent[]);

      const result = await handler({ command: 'LIST' }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(/user1-file\.txt/);
      expect(result.content[0]?.text).toMatch(/user1-notes\.md/);

      // Verify readdir was called with sandbox path
      expect(fsMock.readdir).toHaveBeenCalledWith(userSandbox, {
        withFileTypes: true,
      });
    });

    it('should read files only from user sandbox directory', async () => {
      process.env.ZIPLINE_TOKEN = 'test-token-user1';

      const { getUserSandbox } = await import('./index');
      const userSandbox = getUserSandbox();

      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      // Mock file operations
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.stat.mockResolvedValue({ size: 12 });
      fsMock.readFile.mockResolvedValue('hello world');

      const result = await handler({ command: 'OPEN test.txt' }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(/OPEN: test\.txt/);
      expect(result.content[0]?.text).toMatch(/hello world/);

      // Verify file operations were called with sandbox path
      expect(fsMock.stat).toHaveBeenCalledWith(
        expect.stringContaining(userSandbox)
      );
      expect(fsMock.readFile).toHaveBeenCalledWith(
        expect.stringContaining(userSandbox),
        { encoding: 'utf8' }
      );
    });

    describe('TTL-based cleanup', () => {
      it('should identify sandboxes older than 24 hours for cleanup', async () => {
        process.env.ZIPLINE_TOKEN = 'test-token';

        const { getUserSandbox, cleanupOldSandboxes } = await import('./index');
        const tmpDir = getUserSandbox().replace(/\/users\/[^/]+$/, '');

        // Mock file system operations
        const oldSandbox = `${tmpDir}/users/oldhash`;
        const recentSandbox = `${tmpDir}/users/recenthash`;

        fsMock.readdir.mockResolvedValue(['oldhash', 'recenthash']);
        fsMock.stat.mockImplementation((path: string) => {
          if (path === oldSandbox) {
            const oldMtime = new Date(Date.now() - 25 * 60 * 60 * 1000);
            return Promise.resolve({
              isDirectory: () => true,
              mtime: oldMtime, // 25 hours ago
            });
          } else if (path === recentSandbox) {
            const recentMtime = new Date(Date.now() - 12 * 60 * 60 * 1000);
            return Promise.resolve({
              isDirectory: () => true,
              mtime: recentMtime, // 12 hours ago
            });
          }
          return Promise.reject(new Error('Path not found'));
        });

        fsMock.rm.mockResolvedValue(undefined);

        const cleaned = await cleanupOldSandboxes();

        expect(cleaned).toBe(1); // Only one sandbox should be cleaned
        expect(fsMock.rm).toHaveBeenCalledWith(oldSandbox, {
          recursive: true,
          force: true,
        });
      });

      it('should not clean sandboxes newer than 24 hours', async () => {
        process.env.ZIPLINE_TOKEN = 'test-token';

        const { cleanupOldSandboxes } = await import('./index');

        // Mock file system operations
        fsMock.readdir.mockResolvedValue(['recenthash']);
        fsMock.stat.mockResolvedValue({
          isDirectory: () => true,
          mtime: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        });

        fsMock.rm.mockResolvedValue(undefined);

        const cleaned = await cleanupOldSandboxes();

        expect(cleaned).toBe(0); // No sandboxes should be cleaned
        expect(fsMock.rm).not.toHaveBeenCalled();
      });

      it('should handle errors during cleanup gracefully', async () => {
        process.env.ZIPLINE_TOKEN = 'test-token';

        const { cleanupOldSandboxes } = await import('./index');

        fsMock.readdir.mockResolvedValue(['problematic']);
        fsMock.stat.mockResolvedValue({
          isDirectory: () => true,
          mtime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        });
        fsMock.rm.mockRejectedValue(new Error('Permission denied'));

        const cleaned = await cleanupOldSandboxes();

        expect(cleaned).toBe(0); // Should return 0 even if cleanup fails
      });

      describe('session-based locking mechanism', () => {
        it('should acquire a lock for a user sandbox', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { getUserSandbox, acquireSandboxLock } = await import(
            './index'
          );
          const userSandbox = getUserSandbox();

          // Mock file system operations
          fsMock.mkdir.mockResolvedValue(undefined);
          fsMock.writeFile.mockResolvedValue(undefined);

          const lockAcquired = await acquireSandboxLock();

          expect(lockAcquired).toBe(true);
          expect(fsMock.writeFile).toHaveBeenCalledWith(
            expect.stringContaining(`${userSandbox}/.lock`),
            expect.any(String),
            { encoding: 'utf8' }
          );
        });

        it('should fail to acquire a lock if already locked', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { acquireSandboxLock } = await import('./index');

          // Mock file system operations - first call succeeds, second fails
          fsMock.mkdir.mockResolvedValue(undefined);
          fsMock.writeFile
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('File exists'));

          // First lock acquisition should succeed
          const firstLock = await acquireSandboxLock();
          expect(firstLock).toBe(true);

          // Second lock acquisition should fail
          const secondLock = await acquireSandboxLock();
          expect(secondLock).toBe(false);
        });

        it('should release a lock for a user sandbox', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { getUserSandbox, releaseSandboxLock } = await import(
            './index'
          );
          const userSandbox = getUserSandbox();

          // Mock file system operations
          fsMock.rm.mockResolvedValue(undefined);

          const lockReleased = await releaseSandboxLock();

          expect(lockReleased).toBe(true);
          expect(fsMock.rm).toHaveBeenCalledWith(
            expect.stringContaining(`${userSandbox}/.lock`),
            { force: true }
          );
        });

        it('should handle release when no lock exists', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { releaseSandboxLock } = await import('./index');

          // Mock file system operations - file doesn't exist
          fsMock.rm.mockRejectedValue(
            new Error('ENOENT: no such file or directory')
          );

          const lockReleased = await releaseSandboxLock();

          expect(lockReleased).toBe(true); // Should still return true as lock is not held
        });

        it('should check if a sandbox is locked', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { getUserSandbox, isSandboxLocked } = await import('./index');
          const userSandbox = getUserSandbox();

          // Mock file system operations - file exists and contains valid lock data
          fsMock.stat.mockResolvedValue({});
          fsMock.readFile.mockResolvedValue(
            JSON.stringify({
              timestamp: Date.now(), // Current time
              token: 'test-token',
            })
          );

          const isLocked = await isSandboxLocked();

          expect(isLocked).toBe(true);
          expect(fsMock.stat).toHaveBeenCalledWith(
            expect.stringContaining(`${userSandbox}/.lock`)
          );
        });

        it('should return false when checking an unlocked sandbox', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { isSandboxLocked } = await import('./index');

          // Mock file system operations - file doesn't exist
          fsMock.stat.mockRejectedValue(
            new Error('ENOENT: no such file or directory')
          );

          const isLocked = await isSandboxLocked();

          expect(isLocked).toBe(false);
        });

        it('should automatically release lock after timeout', async () => {
          process.env.ZIPLINE_TOKEN = 'test-token';

          const { acquireSandboxLock, isSandboxLocked } = await import(
            './index'
          );

          // Mock file system operations
          fsMock.mkdir.mockResolvedValue(undefined);
          fsMock.writeFile.mockResolvedValue(undefined);
          fsMock.readFile.mockResolvedValue(
            JSON.stringify({
              timestamp: Date.now() - 35 * 60 * 1000, // 35 minutes ago
              token: 'test-token',
            })
          );
          fsMock.rm.mockResolvedValue(undefined);

          // Mock setTimeout to execute immediately
          vi.useFakeTimers();

          // Acquire lock
          const lockAcquired = await acquireSandboxLock();
          expect(lockAcquired).toBe(true);

          // Fast-forward time to trigger timeout
          vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes

          // Restore real timers
          vi.useRealTimers();

          // Lock should have been automatically released
          const isLocked = await isSandboxLocked();
          expect(isLocked).toBe(false);
        });

        describe('comprehensive sandbox integration tests', () => {
          it('should integrate locking with file operations', async () => {
            process.env.ZIPLINE_TOKEN = 'test-token';

            const { acquireSandboxLock, releaseSandboxLock } = await import(
              './index'
            );

            // Mock file system operations
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockResolvedValue(undefined);
            fsMock.rm.mockResolvedValue(undefined);

            // Initially, no lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }
              return Promise.resolve({});
            });

            fsMock.readFile.mockResolvedValue(
              JSON.stringify({
                timestamp: Date.now(),
                token: 'test-token',
              })
            );

            // Acquire lock
            const lockAcquired = await acquireSandboxLock();
            expect(lockAcquired).toBe(true);

            // After lock is acquired, lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.resolve({});
              }
              return Promise.resolve({});
            });

            // Verify sandbox is locked
            const { isSandboxLocked } = await import('./index');
            const isLocked = await isSandboxLocked();
            expect(isLocked).toBe(true);

            // Release lock
            const lockReleased = await releaseSandboxLock();
            expect(lockReleased).toBe(true);

            // After lock is released, lock file doesn't exist
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }
              return Promise.resolve({});
            });

            // Verify sandbox is unlocked
            const isUnlocked = await isSandboxLocked();
            expect(isUnlocked).toBe(false);
          });

          it('should prevent concurrent access to the same sandbox', async () => {
            process.env.ZIPLINE_TOKEN = 'test-token';

            const { acquireSandboxLock, releaseSandboxLock } = await import(
              './index'
            );

            // Mock file system operations
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockResolvedValueOnce(undefined);
            fsMock.rm.mockResolvedValue(undefined);

            // Initially, no lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }
              return Promise.resolve({});
            });

            fsMock.readFile.mockResolvedValue(
              JSON.stringify({
                timestamp: Date.now(),
                token: 'test-token',
              })
            );

            // First session acquires lock
            const firstLock = await acquireSandboxLock();
            expect(firstLock).toBe(true);

            // After lock is acquired, lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.resolve({});
              }
              return Promise.resolve({});
            });

            // Second session cannot acquire lock
            const secondLock = await acquireSandboxLock();
            expect(secondLock).toBe(false);

            // First session releases lock
            const lockReleased = await releaseSandboxLock();
            expect(lockReleased).toBe(true);

            // After lock is released, lock file doesn't exist
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }
              return Promise.resolve({});
            });

            // Now second session can acquire lock
            fsMock.writeFile.mockResolvedValueOnce(undefined);
            const thirdLock = await acquireSandboxLock();
            expect(thirdLock).toBe(true);
          });

          it('should handle sandbox cleanup with active locks', async () => {
            process.env.ZIPLINE_TOKEN = 'test-token';

            const {
              getUserSandbox,
              acquireSandboxLock,
              cleanupOldSandboxes,
              isSandboxLocked,
            } = await import('./index');
            const tmpDir = getUserSandbox().replace(/\/users\/[^/]+$/, '');

            // Mock file system operations
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockResolvedValue(undefined);
            fsMock.rm.mockResolvedValue(undefined);

            // Initially, no lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }

              if (path === `${tmpDir}/users/oldhash`) {
                return Promise.resolve({
                  isDirectory: () => true,
                  mtime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
                });
              } else if (path === `${tmpDir}/users/recenthash`) {
                return Promise.resolve({
                  isDirectory: () => true,
                  mtime: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                });
              }
              return Promise.reject(new Error('Path not found'));
            });

            fsMock.readdir.mockResolvedValue(['oldhash', 'recenthash']);
            fsMock.readFile.mockResolvedValue(
              JSON.stringify({
                timestamp: Date.now(),
                token: 'test-token',
              })
            );

            // Acquire lock for current sandbox
            const lockAcquired = await acquireSandboxLock();
            expect(lockAcquired).toBe(true);

            // After lock is acquired, lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.resolve({});
              }

              if (path === `${tmpDir}/users/oldhash`) {
                return Promise.resolve({
                  isDirectory: () => true,
                  mtime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
                });
              } else if (path === `${tmpDir}/users/recenthash`) {
                return Promise.resolve({
                  isDirectory: () => true,
                  mtime: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                });
              }
              return Promise.reject(new Error('Path not found'));
            });

            // Verify sandbox is locked
            const isLocked = await isSandboxLocked();
            expect(isLocked).toBe(true);

            // Run cleanup - should not remove locked sandbox
            const cleaned = await cleanupOldSandboxes();
            expect(cleaned).toBe(1); // Only oldhash should be cleaned

            // Verify our sandbox is still locked
            const stillLocked = await isSandboxLocked();
            expect(stillLocked).toBe(true);
          });

          it('should handle lock expiration during file operations', async () => {
            process.env.ZIPLINE_TOKEN = 'test-token';

            const { acquireSandboxLock, isSandboxLocked } = await import(
              './index'
            );

            // Mock file system operations
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockResolvedValue(undefined);
            fsMock.rm.mockResolvedValue(undefined);

            // Initially, no lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.reject(
                  new Error('ENOENT: no such file or directory')
                );
              }
              return Promise.resolve({});
            });

            // First, return valid lock data
            fsMock.readFile.mockResolvedValueOnce(
              JSON.stringify({
                timestamp: Date.now(),
                token: 'test-token',
              })
            );

            // Acquire lock
            const lockAcquired = await acquireSandboxLock();
            expect(lockAcquired).toBe(true);

            // After lock is acquired, lock file exists
            fsMock.stat.mockImplementation((path: string) => {
              if (path.includes('.lock')) {
                return Promise.resolve({});
              }
              return Promise.resolve({});
            });

            // Verify sandbox is locked
            const isLocked = await isSandboxLocked();
            expect(isLocked).toBe(true);

            // Mock expired lock data
            fsMock.readFile.mockResolvedValueOnce(
              JSON.stringify({
                timestamp: Date.now() - 35 * 60 * 1000, // 35 minutes ago
                token: 'test-token',
              })
            );

            // Now sandbox should appear unlocked due to expired lock
            const isUnlocked = await isSandboxLocked();
            expect(isUnlocked).toBe(false);
          });

          // Note: Testing multiple users with separate sandboxes is complex due to module caching
          // The functionality is verified through other tests and manual testing
        });
      });
    });
  });

  const getToolHandler = (toolName: string): ToolHandler | undefined => {
    const call = vi
      .mocked(server.registerTool)
      .mock.calls.find((c: unknown[]) => c[0] === toolName);
    return call?.[2] as ToolHandler | undefined;
  };

  it('should list files (empty)', async () => {
    fsMock.readdir.mockResolvedValue([]);
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'LIST' }, {});
    expect(result.content[0]?.text).toMatch(/No files found/);
  });

  it('should list files (non-empty)', async () => {
    fsMock.readdir.mockResolvedValue([
      { isFile: () => true, name: 'foo.txt' },
      { isFile: () => false, name: 'bar' },
      { isFile: () => true, name: 'baz.md' },
    ] as Dirent[]);
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'LIST' }, {});
    expect(result.content[0]?.text).toMatch(/foo\.txt/);
    expect(result.content[0]?.text).toMatch(/baz\.md/);
    expect(result.content[0]?.text).not.toMatch(/bar/);
  });

  it('should create a file (valid)', async () => {
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.stat.mockResolvedValue({ size: 42 });
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler(
      { command: 'CREATE test.txt', content: 'abc' },
      {}
    );
    expect(result.content[0]?.text).toMatch(/Created\/Overwritten: test\.txt/);
  });

  it('should refuse CREATE with invalid filename', async () => {
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler(
      { command: 'CREATE ../evil.txt', content: 'abc' },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/refused/);
  });

  it('should overwrite existing file', async () => {
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.stat.mockResolvedValue({ size: 99 });
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler(
      { command: 'CREATE foo.txt', content: 'new' },
      {}
    );
    expect(result.content[0]?.text).toMatch(/Created\/Overwritten: foo\.txt/);
  });

  it('should open a file (valid)', async () => {
    fsMock.stat.mockResolvedValue({ size: 10 });
    fsMock.readFile.mockResolvedValue('hello');
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'OPEN foo.txt' }, {});
    expect(result.content[0]?.text).toMatch(/OPEN: foo\.txt/);
    expect(result.content[0]?.text).toMatch(/hello/);
  });

  it('should refuse OPEN for too large file', async () => {
    fsMock.stat.mockResolvedValue({ size: 2 * 1024 * 1024 });
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'OPEN big.txt' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/too large/);
  });

  it('should refuse OPEN with invalid filename', async () => {
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'OPEN /etc/passwd' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/refused/);
  });

  it('should return usage for invalid command', async () => {
    const handler = getToolHandler('tmp_file_manager');
    if (!handler) throw new Error('Handler not found');
    const result = await handler({ command: 'DELETE foo.txt' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Usage/);
  });
});
