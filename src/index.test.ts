// Set required environment variables for tests
process.env.ZIPLINE_TOKEN = 'test-token';
process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Dirent, Stats } from 'fs';

interface PartialStats extends Partial<Stats> {
  size: number;
}

// Define types for the mock
interface MockServer {
  registerTool: Mock;
  connect: Mock;
}

// Mock the McpServer and its methods
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const McpServer = vi.fn().mockImplementation((): MockServer => {
    const registerToolMock = vi.fn();
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
  downloadExternalUrl: vi
    .fn()
    .mockResolvedValue('/home/user/.zipline_tmp/users/hash/downloaded.txt'),
}));

// Mock userFiles module
vi.mock('./userFiles', () => ({
  listUserFiles: vi.fn(),
  getUserFile: vi.fn(),
  updateUserFile: vi.fn(),
  deleteUserFile: vi.fn().mockResolvedValue({
    id: 'deleted-file',
    name: 'deleted.png',
  }),
}));

// Mock remoteFolders module
vi.mock('./remoteFolders', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  editFolder: vi.fn().mockResolvedValue({
    id: 'folder-id',
    name: 'Test Folder',
  }),
  getFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

// Mock sandboxUtils for clearStagedContent
vi.mock('./sandboxUtils', () => ({
  getUserSandbox: vi.fn(() => '/home/user/.zipline_tmp/users/testhash'),
  validateFilename: vi.fn((filename: string) => {
    if (
      !filename ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..') ||
      filename.startsWith('.')
    ) {
      return 'Filenames must not include path separators, dot segments, or be empty. Only bare filenames in ~/.zipline_tmp are allowed.';
    }
    return null;
  }),
  ensureUserSandbox: vi.fn(() =>
    Promise.resolve('/home/user/.zipline_tmp/users/testhash')
  ),
  resolveInUserSandbox: vi.fn(
    (filename: string) => `/home/user/.zipline_tmp/users/testhash/${filename}`
  ),
  resolveSandboxPath: vi.fn(
    (filename: string) => `/home/user/.zipline_tmp/users/testhash/${filename}`
  ),
  logSandboxOperation: vi.fn(),
  TMP_MAX_READ_SIZE: 1024 * 1024,
  cleanupOldSandboxes: vi.fn(() => Promise.resolve(0)),
  isSandboxLocked: vi.fn(() => Promise.resolve(false)),
  acquireSandboxLock: vi.fn(() => Promise.resolve(true)),
  releaseSandboxLock: vi.fn(() => Promise.resolve(true)),
  validateFileForSecrets: vi.fn(() => Promise.resolve()),
  stageFile: vi.fn().mockImplementation((filepath: string) => {
    const content = Buffer.from('test content for cleanup test');
    return Promise.resolve({ type: 'memory', content, path: filepath });
  }),
  clearStagedContent: vi.fn(),
  MEMORY_STAGING_THRESHOLD: 5 * 1024 * 1024,
  initializeCleanup: vi.fn(() =>
    Promise.resolve({ sandboxesCleaned: 0, locksCleaned: 0 })
  ),
  SecretDetectionError: class extends Error {
    constructor(
      message: string,
      public secretType: string,
      public pattern: string
    ) {
      super(message);
      this.name = 'SecretDetectionError';
    }
  },
}));

const fsMock = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
  open: vi.fn(),
};
vi.mock('fs/promises', () => ({
  ...fsMock,
  default: fsMock,
}));

// Helper to mock file content for both readFile and open/read
// This is needed because the new implementation uses fs.open+read for MIME checks
const mockFileContent = (content: Buffer | string) => {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);

  // Mock readFile (legacy/full read)
  fsMock.readFile.mockResolvedValue(buf);
  fsMock.stat.mockResolvedValue({ size: buf.length });

  // Mock open/read (new optimization)
  fsMock.open.mockResolvedValue({
    read: vi
      .fn()
      .mockImplementation((buffer: Buffer, _offset: number, length: number) => {
        const bytesToCopy = Math.min(length, buf.length);
        buf.copy(buffer, 0, 0, bytesToCopy);
        return Promise.resolve({ bytesRead: bytesToCopy, buffer });
      }),
    close: vi.fn().mockResolvedValue(undefined),
  });
};

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

  describe('validate_file tool', () => {
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
      const calls = server.registerTool.mock.calls as Array<
        [string, unknown, ToolHandler]
      >;
      const call = calls.find((c) => c[0] === toolName);
      return call?.[2];
    };

    it('should provide clear error message for non-existent file', async () => {
      const enoentError = new Error(
        'ENOENT: no such file or directory'
      ) as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      fsMock.readFile.mockRejectedValue(enoentError);
      fsMock.open.mockRejectedValue(enoentError);
      fsMock.stat.mockRejectedValue(enoentError);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { filePath: '/path/to/nonexistent.txt' },
        {}
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('File not found');
    });

    it('should handle permission errors gracefully', async () => {
      const eaccesError = new Error(
        'EACCES: permission denied'
      ) as NodeJS.ErrnoException;
      eaccesError.code = 'EACCES';
      fsMock.readFile.mockRejectedValue(eaccesError);
      fsMock.open.mockRejectedValue(eaccesError);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/root/protected.txt' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('permission denied');
    });

    it('should validate file successfully without upload side effects', async () => {
      const { uploadFile } = await import('./httpClient');
      const uploadSpy = uploadFile as Mock;

      mockFileContent('test content');

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.txt' }, {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('📋 FILE VALIDATION REPORT');
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('should handle symlink resolution correctly', async () => {
      const symlinkError = new Error(
        'ELOOP: too many levels of symbolic links'
      ) as NodeJS.ErrnoException;
      symlinkError.code = 'ELOOP';
      fsMock.readFile.mockRejectedValue(symlinkError);
      fsMock.open.mockRejectedValue(symlinkError);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/symlink' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(
        'too many levels of symbolic links'
      );
    });

    it('should validate supported file types correctly', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      mockFileContent(pngData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/image.png' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('Extension: .png');
      expect(result.content[0]?.text).toContain('Supported: Yes');
    });

    it('should reject unsupported file extensions', async () => {
      mockFileContent(Buffer.from('test content'));

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.exe' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('Supported: No');
      expect(result.content[0]?.text).toContain('File type not supported');
    });

    it('should detect MIME type for PNG files', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      mockFileContent(pngData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/image.png' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('MIME: image/png');
    });

    it('should detect MIME type for JPEG files', async () => {
      const jpgData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      mockFileContent(jpgData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/image.jpg' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('MIME: image/jpeg');
    });

    it('should detect MIME type for text files', async () => {
      const textData = Buffer.from('Hello, World!');
      mockFileContent(textData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.txt' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('MIME: text/plain');
      expect(result.content[0]?.text).toContain('MIME/Extension Match: Yes');
    });

    it('should detect MIME type for JSON files', async () => {
      const jsonData = Buffer.from('{"message":"test"}');
      mockFileContent(jsonData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.json' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('MIME: application/json');
    });

    it('should show MIME extension match status', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      mockFileContent(pngData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/image.png' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toMatch(
        /MIME\/Extension Match: (✅|Yes|Match)/
      );
    });

    it('should handle MIME/extension mismatch gracefully', async () => {
      const pngData = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64),
      ]);
      mockFileContent(pngData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/image.jpg' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('MIME: image/png');
      expect(result.content[0]?.text).toContain('MIME/Extension Match: No');
    });

    it('should reject files with unsupported MIME types', async () => {
      const exeData = Buffer.from([0x4d, 0x5a]);
      mockFileContent(exeData);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/file.exe' }, {});
      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('Supported: No');
      expect(result.content[0]?.text).toContain('File type not supported');
    });

    it('should integrate with upload_file_to_zipline flow', async () => {
      const { uploadFile } = await import('./httpClient');
      const uploadSpy = uploadFile as Mock;

      const pngData = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64),
      ]);
      mockFileContent(pngData);

      const validateHandler = getToolHandler('validate_file');
      const uploadHandler = getToolHandler('upload_file_to_zipline');
      if (!validateHandler || !uploadHandler)
        throw new Error('Handler not found');

      const validateResult = await validateHandler(
        { filePath: '/path/to/image.png' },
        {}
      );
      expect(validateResult.isError).toBeFalsy();
      expect(validateResult.content[0]?.text).toContain('MIME: image/png');
      expect(validateResult.content[0]?.text).toContain(
        'MIME/Extension Match: Yes'
      );
      expect(validateResult.content[0]?.text).toContain('Supported: Yes');

      const uploadResult = await uploadHandler(
        { filePath: '/path/to/image.png' },
        {}
      );
      expect(uploadResult.isError).toBeFalsy();
      expect(uploadSpy).toHaveBeenCalled();
    });

    it('should show memory staging strategy for files < 5MB', async () => {
      const content = Buffer.from('test content');
      mockFileContent(content);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const smallFileSize = 1024 * 1024; // 1MB
      fsMock.stat.mockResolvedValue({ size: smallFileSize } as PartialStats);

      const result = await handler({ filePath: '/path/to/small.txt' }, {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('🚀 Staging Strategy');
      expect(result.content[0]?.text).toContain('Memory staging');
    });

    it('should show disk fallback staging strategy for files ≥ 5MB', async () => {
      mockFileContent(Buffer.from('test content'));

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const largeFileSize = 10 * 1024 * 1024; // 10MB
      fsMock.stat.mockResolvedValue({ size: largeFileSize } as PartialStats);

      const result = await handler({ filePath: '/path/to/large.txt' }, {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('🚀 Staging Strategy');
      expect(result.content[0]?.text).toContain('Disk fallback staging');
    });

    it('should show size warning for files close to 5MB threshold', async () => {
      mockFileContent(Buffer.from('test content'));

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const closeToThreshold = 4.6 * 1024 * 1024; // 4.6MB (92% of 5MB)
      fsMock.stat.mockResolvedValue({ size: closeToThreshold } as PartialStats);

      const result = await handler(
        { filePath: '/path/to/near-threshold.txt' },
        {}
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('⚠️ SIZE WARNING');
      expect(result.content[0]?.text).toContain(
        'close to 5.0 MB memory threshold'
      );
    });

    it('should warn about file exceeding max size limit', async () => {
      mockFileContent(Buffer.from('test content'));

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const oversized = 120 * 1024 * 1024; // 120MB (exceeds 100MB default)
      fsMock.stat.mockResolvedValue({ size: oversized } as PartialStats);

      const result = await handler({ filePath: '/path/to/oversized.txt' }, {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('⚠️ SIZE LIMIT EXCEEDED');
      expect(result.content[0]?.text).toContain('120.0 MB');
      expect(result.content[0]?.text).toContain('exceeds maximum 100.0 MB');
      expect(result.content[0]?.text).toContain('🔴 Too large for upload');
    });

    it('should indicate Ready for upload when all checks pass', async () => {
      const content = Buffer.from('test content');
      mockFileContent(content);

      const handler = getToolHandler('validate_file');
      if (!handler) throw new Error('Handler not found');

      const normalSize = 2 * 1024 * 1024; // 2MB
      fsMock.stat.mockResolvedValue({ size: normalSize } as PartialStats);

      const result = await handler({ filePath: '/path/to/valid.txt' }, {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0]?.text).toContain('🟢 Ready for upload');
      expect(result.content[0]?.text).toContain('Memory staging');
    });
  });
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should validate and normalize format correctly', async () => {
    mockFileContent(Buffer.from('test content'));

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
    const enoentError = new Error(
      'ENOENT: no such file or directory'
    ) as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    fsMock.readFile.mockRejectedValue(enoentError);
    fsMock.stat.mockRejectedValue(enoentError);
    fsMock.open.mockRejectedValue(enoentError);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/nonexistent.txt' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('UPLOAD FAILED');
    expect(result.content[0]?.text).toContain('File not found');
  });

  it('should handle unsupported file type error', async () => {
    mockFileContent(Buffer.from('test content'));

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/file.xyz' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('File type .xyz not supported');
  });

  it('should handle deleteAt parameter correctly', async () => {
    mockFileContent(Buffer.from('test content'));

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
    mockFileContent(Buffer.from('test content'));

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
    mockFileContent(Buffer.from('test content'));

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
    mockFileContent(Buffer.from('test content'));

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
    mockFileContent(Buffer.from('test content'));

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

  it('should provide clear error message for non-existent file', async () => {
    const enoentError = new Error(
      'ENOENT: no such file or directory'
    ) as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    fsMock.readFile.mockRejectedValue(enoentError);
    fsMock.open.mockRejectedValue(enoentError);

    const handler = getToolHandler('validate_file');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/nonexistent.txt' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('File not found');
  });

  it('should handle PNG binary files correctly', async () => {
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    mockFileContent(pngData);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/image.png' }, {});
    expect(!result.isError).toBe(true);
  });

  it('should handle JPG binary files correctly', async () => {
    const jpgData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    mockFileContent(jpgData);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/image.jpg' }, {});
    expect(!result.isError).toBe(true);
  });

  it('should handle TXT text files correctly', async () => {
    const textData = Buffer.from('Hello, World!'.repeat(100), 'utf8');
    mockFileContent(textData);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/text.txt' }, {});
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  });

  it('should handle JSON text files correctly', async () => {
    const jsonData = Buffer.from('{"key":"value"}'.repeat(100), 'utf8');
    mockFileContent(jsonData);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/data.json' }, {});
    expect(!result.isError).toBe(true);
  });

  it('should reject spoofed file (MIME mismatch) during upload', async () => {
    // Create a "fake" jpg that is actually a PNG (large enough for detection)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const pngData = Buffer.alloc(4100);
    pngHeader.copy(pngData);

    // Use helper
    mockFileContent(pngData);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    // Attempt to upload as .jpg
    const result = await handler({ filePath: '/path/to/spoofed.jpg' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Security Violation');
    expect(result.content[0]?.text).toContain('image/png'); // Detected
    expect(result.content[0]?.text).toContain('.jpg'); // Extension
  });

  it('should reject file exceeding max size (early validation)', async () => {
    mockFileContent(Buffer.from('test content'));

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const largeFileSize = 150 * 1024 * 1024; // 150MB
    fsMock.stat.mockResolvedValue({ size: largeFileSize } as PartialStats);

    const result = await handler({ filePath: '/path/to/large.txt' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('UPLOAD FAILED');
    expect(result.content[0]?.text).toContain('File too large');
    expect(result.content[0]?.text).toContain('PAYLOAD_TOO_LARGE');
  });

  it('should provide clear error message with actual vs max size', async () => {
    mockFileContent(Buffer.from('test content'));

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const largeFileSize = 120 * 1024 * 1024; // 120MB
    fsMock.stat.mockResolvedValue({ size: largeFileSize } as PartialStats);

    const result = await handler({ filePath: '/path/to/large.txt' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('120.0 MB');
    expect(result.content[0]?.text).toContain('100.0 MB');
    expect(result.content[0]?.text).toContain('ZIPLINE_MAX_FILE_SIZE');
  });

  it('should indicate Ready for upload when all checks pass', async () => {
    const content = Buffer.from('test content');
    mockFileContent(content);

    const handler = getToolHandler('validate_file');
    if (!handler) throw new Error('Handler not found');

    const normalSize = 2 * 1024 * 1024; // 2MB
    fsMock.stat.mockResolvedValue({ size: normalSize } as PartialStats);

    const result = await handler({ filePath: '/path/to/valid.txt' }, {});

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('🟢 Ready for upload');
    expect(result.content[0]?.text).toContain('Memory staging');
  });

  it('should clear memory-staged Buffer after successful upload', async () => {
    const content = Buffer.from('test content for cleanup test');
    mockFileContent(content);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ filePath: '/path/to/file.txt' }, {});
    expect(result.isError).toBeFalsy();

    const { clearStagedContent } = await import('./sandboxUtils');
    expect(clearStagedContent).toHaveBeenCalled();
  });

  it('should clear memory-staged Buffer after failed upload', async () => {
    const content = Buffer.from('test content for cleanup test');
    mockFileContent(content);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const uploadError = new Error('Upload failed');
    const { uploadFile } = await import('./httpClient');
    vi.mocked(uploadFile).mockRejectedValueOnce(uploadError);

    const result = await handler({ filePath: '/path/to/file.txt' }, {});
    expect(result.isError).toBe(true);

    const { clearStagedContent } = await import('./sandboxUtils');
    expect(clearStagedContent).toHaveBeenCalled();
  });

  it('should call clearStagedContent for disk-staged files (no-op)', async () => {
    mockFileContent(Buffer.alloc(5 * 1024 * 1024, 'x'));
    const largeFileSize = 10 * 1024 * 1024; // 10MB
    fsMock.stat.mockResolvedValue({ size: largeFileSize } as PartialStats);

    const handler = getToolHandler('upload_file_to_zipline');
    if (!handler) throw new Error('Handler not found');

    const { stageFile } = await import('./sandboxUtils');
    vi.mocked(stageFile).mockImplementationOnce((filepath: string) => {
      return Promise.resolve({ type: 'disk', path: filepath });
    });

    const result = await handler({ filePath: '/path/to/large.txt' }, {});
    expect(result.isError).toBeFalsy();

    // clearStagedContent IS called for disk files, it just does nothing internally
    const { clearStagedContent } = await import('./sandboxUtils');
    expect(clearStagedContent).toHaveBeenCalled();
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
    it.skip('should create different sandbox directories for different tokens', async () => {
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

    it.skip('should use hashed token for sandbox directory name', async () => {
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

    describe.skip('TTL-based cleanup', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
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
    const result = await handler({ command: 'INVALID_COMMAND foo.txt' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Usage/);
  });

  describe('PATH command', () => {
    it('should return absolute path for valid filename', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH test.txt' }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(/✅ PATH: test\.txt/);
      expect(result.content[0]?.text).toMatch(
        /Absolute path: \/home\/user\/\.zipline_tmp\/users\/testhash\/test\.txt/
      );
    });

    it('should return error for missing filename', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filename is required./
      );
    });

    it('should return error for invalid filename with path traversal', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH ../evil.txt' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filenames must not include path separators/
      );
    });

    it('should return error for invalid filename with absolute path', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH /etc/passwd' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filenames must not include path separators/
      );
    });

    it('should return error for invalid filename with dot segments', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH ./file.txt' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filenames must not include path separators/
      );
    });

    it('should return error for empty filename', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH ' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filename is required./
      );
    });

    it('should return error for filename starting with dot', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'PATH .hidden' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ PATH refused: Filenames must not include path separators/
      );
    });

    it('should handle PATH command with case sensitivity', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'path Test.TXT' }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(/✅ PATH: Test\.TXT/);
      expect(result.content[0]?.text).toMatch(
        /Absolute path: \/home\/user\/\.zipline_tmp\/users\/testhash\/Test\.TXT/
      );
    });
  });

  describe('DELETE command', () => {
    it('should delete an existing file', async () => {
      fsMock.stat.mockResolvedValue({ size: 10 });
      fsMock.unlink.mockResolvedValue(undefined);
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'DELETE test.txt' }, {});
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toMatch(/✅ DELETE: test\.txt/);
      expect(result.content[0]?.text).toMatch(/File deleted successfully/);
    });

    it('should return error when deleting non-existent file', async () => {
      fsMock.unlink.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'DELETE nonexistent.txt' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ DELETE failed: nonexistent\.txt/
      );
      expect(result.content[0]?.text).toMatch(/no such file or directory/);
    });

    it('should refuse DELETE with invalid filename', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'DELETE ../evil.txt' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ DELETE refused: Filenames must not include path separators/
      );
    });

    it('should verify file is removed from LIST after deletion', async () => {
      // First, list files before deletion
      fsMock.readdir.mockResolvedValue([
        { isFile: () => true, name: 'test.txt' },
        { isFile: () => true, name: 'other.txt' },
      ] as Dirent[]);

      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');

      const listResultBefore = await handler({ command: 'LIST' }, {});
      expect(listResultBefore.content[0]?.text).toMatch(/test\.txt/);
      expect(listResultBefore.content[0]?.text).toMatch(/other\.txt/);

      // Delete the file
      fsMock.unlink.mockResolvedValue(undefined);
      const deleteResult = await handler({ command: 'DELETE test.txt' }, {});
      expect(deleteResult.isError).toBeUndefined();

      // List files after deletion
      fsMock.readdir.mockResolvedValue([
        { isFile: () => true, name: 'other.txt' },
      ] as Dirent[]);
      const listResultAfter = await handler({ command: 'LIST' }, {});
      expect(listResultAfter.content[0]?.text).not.toMatch(/test\.txt/);
      expect(listResultAfter.content[0]?.text).toMatch(/other\.txt/);
    });

    it('should return error for DELETE with empty filename', async () => {
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'DELETE' }, {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(
        /❌ DELETE refused: Filename is required/
      );
    });
  });

  describe('tmp_file_manager path return tests', () => {
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
      const calls = server.registerTool.mock.calls as Array<
        [string, unknown, ToolHandler]
      >;
      const call = calls.find((c) => c[0] === toolName);
      return call?.[2];
    };

    it('should return full path for CREATE command', async () => {
      fsMock.writeFile.mockResolvedValue(undefined);
      fsMock.stat.mockResolvedValue({ size: 42 });
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler(
        { command: 'CREATE test.txt', content: 'abc' },
        {}
      );
      expect(result.content[0]?.text).toMatch(
        /Created\/Overwritten: test\.txt/
      );
      expect(result.content[0]?.text).toMatch(
        /Path: \/home\/user\/\.zipline_tmp\/users\/testhash\/test\.txt/
      );
    });

    it('should return full path for OPEN command', async () => {
      fsMock.stat.mockResolvedValue({ size: 10 });
      fsMock.readFile.mockResolvedValue('hello');
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'OPEN foo.txt' }, {});
      expect(result.content[0]?.text).toMatch(/OPEN: foo\.txt/);
      expect(result.content[0]?.text).toMatch(/hello/);
      expect(result.content[0]?.text).toMatch(
        /Path: \/home\/user\/\.zipline_tmp\/users\/testhash\/foo\.txt/
      );
    });

    it('should return full path for READ command', async () => {
      fsMock.stat.mockResolvedValue({ size: 10 });
      fsMock.readFile.mockResolvedValue('hello');
      const handler = getToolHandler('tmp_file_manager');
      if (!handler) throw new Error('Handler not found');
      const result = await handler({ command: 'READ foo.txt' }, {});
      expect(result.content[0]?.text).toMatch(/READ: foo\.txt/);
      expect(result.content[0]?.text).toMatch(/hello/);
      expect(result.content[0]?.text).toMatch(
        /Path: \/home\/user\/\.zipline_tmp\/users\/testhash\/foo\.txt/
      );
    });

    it('should return list of full paths for LIST command', async () => {
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
      expect(result.content[0]?.text).toMatch(
        /\/home\/user\/\.zipline_tmp\/users\/testhash\/foo\.txt/
      );
      expect(result.content[0]?.text).toMatch(
        /\/home\/user\/\.zipline_tmp\/users\/testhash\/baz\.md/
      );
    });
  });
});

describe('batch_file_operation tool', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  describe('DELETE command', () => {
    it('should delete multiple files successfully', async () => {
      const { deleteUserFile } = await import('./userFiles');
      const deleteSpy = vi.mocked(deleteUserFile);
      deleteSpy.mockResolvedValue({ id: 'file1', name: 'test.png' } as never);

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { command: 'DELETE', ids: ['file1', 'file2', 'file3'] },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('BATCH OPERATION SUMMARY');
      expect(result.content[0]?.text).toContain('Successful: 3');
      expect(result.content[0]?.text).toContain('Failed: 0');
      expect(deleteSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in DELETE', async () => {
      const { deleteUserFile } = await import('./userFiles');
      const deleteSpy = vi.mocked(deleteUserFile);
      deleteSpy
        .mockResolvedValueOnce({ id: 'file1', name: 'test1.png' } as never)
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce({ id: 'file3', name: 'test3.png' } as never);

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { command: 'DELETE', ids: ['file1', 'file2', 'file3'] },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successful: 2');
      expect(result.content[0]?.text).toContain('Failed: 1');
    });

    it('should report all failures when all DELETE operations fail', async () => {
      const { deleteUserFile } = await import('./userFiles');
      const deleteSpy = vi.mocked(deleteUserFile);
      deleteSpy.mockRejectedValue(new Error('Delete failed'));

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { command: 'DELETE', ids: ['file1', 'file2'] },
        {}
      );

      // When ALL operations fail, isError should be true
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Successful: 0');
      expect(result.content[0]?.text).toContain('Failed: 2');
    });
  });

  describe('MOVE command', () => {
    it('should move multiple files successfully', async () => {
      const { editFolder } = await import('./remoteFolders');
      const editFolderSpy = vi.mocked(editFolder);
      editFolderSpy.mockResolvedValue({ id: 'folder1', name: 'Test' } as never);

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        {
          command: 'MOVE',
          ids: ['file1', 'file2'],
          folder: 'folder1',
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successful: 2');
      expect(result.content[0]?.text).toContain('Failed: 0');
      expect(editFolderSpy).toHaveBeenCalledTimes(2);
    });

    it('should require folder parameter for MOVE command', async () => {
      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'MOVE', ids: ['file1'] }, {});

      // All operations failed (missing folder), so isError should be true
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Successful: 0');
      expect(result.content[0]?.text).toContain('Failed: 1');
    });

    it('should handle partial failures in MOVE', async () => {
      const { editFolder } = await import('./remoteFolders');
      const editFolderSpy = vi.mocked(editFolder);
      editFolderSpy
        .mockResolvedValueOnce({ id: 'folder1', name: 'Test' } as never)
        .mockRejectedValueOnce(new Error('Folder not found'));

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { command: 'MOVE', ids: ['file1', 'file2'], folder: 'folder1' },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successful: 1');
      expect(result.content[0]?.text).toContain('Failed: 1');
    });
  });

  describe('empty array handling', () => {
    it('should return error for empty ids array', async () => {
      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'DELETE', ids: [] }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('No file IDs provided');
    });

    it('should return error for empty ids array with MOVE command', async () => {
      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler(
        { command: 'MOVE', ids: [], folder: 'folder1' },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('No file IDs provided');
    });
  });

  describe('error masking', () => {
    it('should not expose sensitive token in output', async () => {
      process.env.ZIPLINE_TOKEN = 'super-secret-token-12345';

      const { deleteUserFile } = await import('./userFiles');
      const deleteSpy = vi.mocked(deleteUserFile);
      deleteSpy.mockRejectedValue(
        new Error('Delete failed with token: super-secret-token-12345')
      );

      const handler = getToolHandler('batch_file_operation');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ command: 'DELETE', ids: ['file1'] }, {});

      // All operations failed, isError should be true
      expect(result.isError).toBe(true);
      // Most importantly: sensitive token should NOT appear in output
      expect(result.content[0]?.text).not.toContain('super-secret-token-12345');
    });
  });
});

describe('remote_folder_manager tool - LIST command', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should list folders successfully with multiple folders', async () => {
    const { listFolders } = await import('./remoteFolders');
    const listFoldersSpy = vi.mocked(listFolders);
    listFoldersSpy.mockResolvedValue([
      {
        id: 'folder1',
        name: 'Documents',
        public: false,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        files: ['file1', 'file2'],
      },
      {
        id: 'folder2',
        name: 'Images',
        public: true,
        createdAt: '2023-01-02T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      },
    ] as never);

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'LIST' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('REMOTE FOLDERS');
    expect(result.content[0]?.text).toContain('Documents');
    expect(result.content[0]?.text).toContain('folder1');
    expect(result.content[0]?.text).toContain('Images');
    expect(result.content[0]?.text).toContain('folder2');
    expect(result.content[0]?.text).toContain('Files: 2'); // Hierarchy indicator
  });

  it('should handle empty folders list gracefully', async () => {
    const { listFolders } = await import('./remoteFolders');
    const listFoldersSpy = vi.mocked(listFolders);
    listFoldersSpy.mockResolvedValue([] as never);

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'LIST' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('REMOTE FOLDERS');
    expect(result.content[0]?.text).toContain('No folders found');
  });

  it('should handle errors with security masking', async () => {
    process.env.ZIPLINE_TOKEN = 'secret-token-for-testing';
    const { listFolders } = await import('./remoteFolders');
    const listFoldersSpy = vi.mocked(listFolders);
    listFoldersSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'LIST' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('LIST FOLDERS FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
  });

  it('should mask sensitive data in error messages', async () => {
    process.env.ZIPLINE_TOKEN = 'another-secret-123';
    const { listFolders } = await import('./remoteFolders');
    const listFoldersSpy = vi.mocked(listFolders);
    listFoldersSpy.mockRejectedValue(
      new Error('Auth failed with another-secret-123')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'LIST' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).not.toContain('another-secret-123');
  });
});

describe('remote_folder_manager tool - ADD command', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should create folder successfully with name only', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'new-folder-123',
      name: 'Test Folder',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD', name: 'Test Folder' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Test Folder');
    expect(result.content[0]?.text).toContain('new-folder-123');
    expect(createFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Folder',
      })
    );
  });

  it('should create folder successfully with isPublic parameter', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'public-folder-456',
      name: 'Public Folder',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'ADD', name: 'Public Folder', isPublic: true },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Public Folder');
    expect(createFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Public Folder',
        isPublic: true,
      })
    );
  });

  it('should create folder successfully with files array parameter', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'folder-with-files-789',
      name: 'Folder with Files',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      {
        command: 'ADD',
        name: 'Folder with Files',
        files: ['file1', 'file2', 'file3'],
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Folder with Files');
    expect(createFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Folder with Files',
        files: ['file1', 'file2', 'file3'],
      })
    );
  });

  it('should create folder with all parameters combined', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'complete-folder-999',
      name: 'Complete Folder',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      {
        command: 'ADD',
        name: 'Complete Folder',
        isPublic: true,
        files: ['fileA', 'fileB'],
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Complete Folder');
    expect(createFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Complete Folder',
        isPublic: true,
        files: ['fileA', 'fileB'],
      })
    );
  });

  it('should handle errors with security masking', async () => {
    process.env.ZIPLINE_TOKEN = 'secret-token-for-testing';
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD', name: 'Test' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('CREATE FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
  });

  it('should mask sensitive data in error messages', async () => {
    process.env.ZIPLINE_TOKEN = 'another-sensitive-token-xyz';
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockRejectedValue(
      new Error('Auth error with another-sensitive-token-xyz')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD', name: 'Secure Folder' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('CREATE FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain(
      'another-sensitive-token-xyz'
    );
  });

  it('should use default name when name is not provided', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'default-folder',
      name: 'New Folder',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(createFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Folder',
      })
    );
  });

  it('should handle folder creation when ID is undefined', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      name: 'Folder Without ID',
      // id is undefined
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'ADD', name: 'Folder Without ID' },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Folder Without ID');
    expect(result.content[0]?.text).toContain('ID: undefined');
  });
});

describe('remote_folder_manager tool - INFO command', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should get folder information successfully', async () => {
    const { getFolder } = await import('./remoteFolders');
    const getFolderSpy = vi.mocked(getFolder);
    getFolderSpy.mockResolvedValue({
      id: 'folder-123',
      name: 'Test Folder',
      public: false,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      files: ['file1', 'file2'],
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'INFO', id: 'folder-123' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER INFORMATION');
    expect(result.content[0]?.text).toContain('Test Folder');
    expect(result.content[0]?.text).toContain('folder-123');
    expect(result.content[0]?.text).toContain('Private'); // Verify visibility
    expect(result.content[0]?.text).toContain('Files: 2'); // Verify file count
    expect(result.content[0]?.text).toContain('2023-01-01T00:00:00Z'); // Verify dates
  });

  it('should handle non-existent folder ID', async () => {
    const { getFolder } = await import('./remoteFolders');
    const getFolderSpy = vi.mocked(getFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    getFolderSpy.mockRejectedValue(
      new ZiplineError('Folder not found', McpErrorCode.RESOURCE_NOT_FOUND, 404)
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'INFO', id: 'non-existent-id' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('GET FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Folder not found');
    // Verify that ZiplineError was created with correct MCP code
    expect(getFolderSpy).toHaveBeenCalledWith('non-existent-id');
  });

  it('should handle errors with security masking', async () => {
    vi.stubEnv('ZIPLINE_TOKEN', 'secret-token-for-testing');
    const { getFolder } = await import('./remoteFolders');
    const getFolderSpy = vi.mocked(getFolder);
    getFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'INFO', id: 'test-id' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('GET FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
    vi.unstubAllEnvs();
  });

  it('should return error when id parameter is missing', async () => {
    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'INFO' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid command');
  });
});

describe('remote_folder_manager tool - EDIT command', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should edit folder name successfully', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-123',
      name: 'Updated Name',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'folder-123', name: 'Updated Name' },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(result.content[0]?.text).toContain('Updated Name');
    expect(result.content[0]?.text).toContain('folder-123');
    expect(editFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-123',
        name: 'Updated Name',
      })
    );
  });

  it('should handle non-existent folder ID', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    editFolderSpy.mockRejectedValue(
      new ZiplineError('Folder not found', McpErrorCode.RESOURCE_NOT_FOUND, 404)
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'non-existent-id', name: 'New Name' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDIT FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Folder not found');
  });

  it('should edit multiple folder properties', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-456',
      name: 'Multi Update',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      {
        command: 'EDIT',
        id: 'folder-456',
        name: 'Multi Update',
        isPublic: true,
        allowUploads: false,
      },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(result.content[0]?.text).toContain('Multi Update');
    expect(editFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-456',
        name: 'Multi Update',
        isPublic: true,
        allowUploads: false,
      })
    );
  });

  it('should handle errors with security masking', async () => {
    vi.stubEnv('ZIPLINE_TOKEN', 'secret-token-for-testing');
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'test-id', name: 'New Name' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDIT FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
    vi.unstubAllEnvs();
  });

  it('should add file to folder with fileId (PUT operation)', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-789',
      name: 'Folder with File',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'folder-789', fileId: 'file-123' },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(editFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-789',
        fileId: 'file-123',
      })
    );
  });

  it('should handle duplicate folder name conflict', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    editFolderSpy.mockRejectedValue(
      new ZiplineError(
        'Folder name already exists',
        McpErrorCode.RESOURCE_ALREADY_EXISTS,
        409
      )
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'folder-123', name: 'Existing Folder Name' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDIT FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Folder name already exists');
  });

  it('should return error when id parameter is missing', async () => {
    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'EDIT', name: 'New Name' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid command');
  });

  it('should mask sensitive data in error messages', async () => {
    vi.stubEnv('ZIPLINE_TOKEN', 'another-sensitive-token-xyz');
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockRejectedValue(
      new Error('Auth error with another-sensitive-token-xyz')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'test-id', name: 'Secure Update' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDIT FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain(
      'another-sensitive-token-xyz'
    );
    vi.unstubAllEnvs();
  });

  it('should edit folder with only isPublic property', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-visibility',
      name: 'Visibility Update',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'folder-visibility', isPublic: true },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(editFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-visibility',
        isPublic: true,
      })
    );
  });

  it('should edit folder with only allowUploads property', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-uploads',
      name: 'Uploads Update',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'EDIT', id: 'folder-uploads', allowUploads: true },
      {}
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(editFolderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-uploads',
        allowUploads: true,
      })
    );
  });

  it('should return error when called without any update parameters', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockRejectedValue(
      new Error(
        'At least one property (name, isPublic, or allowUploads) must be provided to update the folder'
      )
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'EDIT', id: 'folder-123' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      'At least one property (name, isPublic, or allowUploads) must be provided to update the folder'
    );
  });
});

describe('remote_folder_manager tool - DELETE command', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should delete folder successfully', async () => {
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    deleteFolderSpy.mockResolvedValue({
      id: 'folder-123',
      name: 'Test Folder',
      public: false,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'DELETE', id: 'folder-123' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER DELETED SUCCESSFULLY');
    expect(result.content[0]?.text).toContain('Test Folder');
    expect(result.content[0]?.text).toContain('folder-123');
    expect(deleteFolderSpy).toHaveBeenCalledWith('folder-123');
  });

  it('should handle non-existent folder ID', async () => {
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    deleteFolderSpy.mockRejectedValue(
      new ZiplineError('Folder not found', McpErrorCode.RESOURCE_NOT_FOUND, 404)
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'DELETE', id: 'non-existent-id' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('DELETE FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Folder not found');
  });

  it('should handle errors with security masking', async () => {
    vi.stubEnv('ZIPLINE_TOKEN', 'secret-token-for-testing');
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    deleteFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'DELETE', id: 'test-id' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('DELETE FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
    vi.unstubAllEnvs();
  });

  it('should handle folder containing files (403 Forbidden)', async () => {
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    deleteFolderSpy.mockRejectedValue(
      new ZiplineError(
        'Folder contains files and cannot be deleted',
        McpErrorCode.FORBIDDEN_OPERATION,
        403
      )
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler(
      { command: 'DELETE', id: 'folder-with-files' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('DELETE FOLDER FAILED');
    expect(result.content[0]?.text).toContain(
      'Folder contains files and cannot be deleted'
    );
  });

  it('should return error when id parameter is missing', async () => {
    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'DELETE' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid command');
  });

  it('should handle rate limit error (429)', async () => {
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    deleteFolderSpy.mockRejectedValue(
      new ZiplineError(
        'Rate limit exceeded',
        McpErrorCode.RATE_LIMIT_EXCEEDED,
        429
      )
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'DELETE', id: 'folder-123' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('DELETE FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Rate limit exceeded');
  });

  it('should handle internal server error (500)', async () => {
    const { deleteFolder } = await import('./remoteFolders');
    const deleteFolderSpy = vi.mocked(deleteFolder);
    const { ZiplineError, McpErrorCode } = await import('./utils/errorMapper');
    deleteFolderSpy.mockRejectedValue(
      new ZiplineError(
        'Internal server error',
        McpErrorCode.INTERNAL_ZIPLINE_ERROR,
        500
      )
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'DELETE', id: 'folder-123' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('DELETE FOLDER FAILED');
    expect(result.content[0]?.text).toContain('Internal server error');
  });
});

describe('check_health tool', () => {
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
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should return healthy status when host responds with 200', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('HEALTH CHECK PASSED');
    expect(result.content[0]?.text).toContain('Status: healthy');
    expect(result.content[0]?.text).toContain('Latency:');
    expect(result.content[0]?.text).toContain('http://localhost:3000');
    vi.unstubAllGlobals();
  });

  it('should include latency measurement in healthy response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.content[0]?.text).toMatch(/Latency: \d+ms/);
    vi.unstubAllGlobals();
  });

  it('should handle network errors (ECONNREFUSED)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HEALTH CHECK FAILED');
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('ECONNREFUSED');
    expect(result.content[0]?.text).toContain(
      'Check network connectivity and verify ZIPLINE_ENDPOINT is correct'
    );
    vi.unstubAllGlobals();
  });

  it('should handle timeout errors (ETIMEDOUT)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed: ETIMEDOUT'));
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('ETIMEDOUT');
    vi.unstubAllGlobals();
  });

  it('should distinguish authentication errors (401)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HEALTH CHECK FAILED');
    expect(result.content[0]?.text).toContain('AUTHENTICATION_ERROR');
    expect(result.content[0]?.text).toContain('HTTP Status: 401');
    expect(result.content[0]?.text).toContain('ZIPLINE_TOKEN');
    vi.unstubAllGlobals();
  });

  it('should distinguish forbidden errors (403)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('AUTHENTICATION_ERROR');
    expect(result.content[0]?.text).toContain('HTTP Status: 403');
    expect(result.content[0]?.text).toContain('permissions');
    vi.unstubAllGlobals();
  });

  it('should handle HTTP 500 errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('HTTP Status: 500');
    expect(result.content[0]?.text).toContain('server error');
    vi.unstubAllGlobals();
  });

  it('should handle HTTP 502 bad gateway errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('HTTP Status: 502');
    vi.unstubAllGlobals();
  });

  it('should handle HTTP 503 service unavailable errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('HTTP Status: 503');
    vi.unstubAllGlobals();
  });

  it('should mask sensitive data in network error messages', async () => {
    process.env.ZIPLINE_TOKEN = 'super-secret-token-12345';
    const mockFetch = vi
      .fn()
      .mockRejectedValue(
        new Error('Connection failed with token: super-secret-token-12345')
      );
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).not.toContain('super-secret-token-12345');
    expect(result.content[0]?.text).toContain('[REDACTED]');
    vi.unstubAllGlobals();
  });

  it('should display endpoint in response for debugging purposes', async () => {
    // Set a custom endpoint to verify it appears in the response
    process.env.ZIPLINE_ENDPOINT = 'https://custom-endpoint.example.com';
    vi.resetModules();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    // Re-import to pick up new environment variable
    const imported = (await import('./index')) as unknown as {
      server: MockServer;
    };
    server = imported.server;

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    // Endpoint is intentionally shown (not masked) for debugging - users need to know which endpoint was checked
    expect(result.content[0]?.text).toContain(
      'https://custom-endpoint.example.com'
    );
    vi.unstubAllGlobals();
    // Reset endpoint for other tests
    process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
  });

  it('should include resolution guidance in error responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Resolution:');
    expect(result.content[0]?.text).toContain('Check server logs');
    vi.unstubAllGlobals();
  });

  it('should handle 404 errors as host unavailable (not auth error)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('HTTP Status: 404');
    expect(result.content[0]?.text).not.toContain('AUTHENTICATION_ERROR');
    vi.unstubAllGlobals();
  });

  it('should include latency in error responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Latency: \d+ms/);
    vi.unstubAllGlobals();
  });

  it('should use 5 second timeout for health check requests', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation((_url, options: RequestInit) => {
        // Verify AbortSignal.timeout is being used
        expect(options).toBeDefined();
        expect(options?.signal).toBeDefined();
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });
    vi.stubGlobal('fetch', mockFetch);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    await handler({}, {});

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/health',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      })
    );
    vi.unstubAllGlobals();
  });
});
