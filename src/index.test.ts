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
