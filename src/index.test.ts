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
    expect(McpServer).toHaveBeenCalledWith({
      name: 'zipline-upload-server',
      version: '1.0.0',
    });
  });

  it('should register the upload_file_to_zipline tool', async () => {
    const { server } = (await import('./index')) as unknown as { server: MockServer };
    expect(server.registerTool).toHaveBeenCalledWith(
      'upload_file_to_zipline',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the get_upload_url_only tool', async () => {
    const { server } = (await import('./index')) as unknown as { server: MockServer };
    expect(server.registerTool).toHaveBeenCalledWith(
      'get_upload_url_only',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the preview_upload_command tool', async () => {
    const { server } = (await import('./index')) as unknown as { server: MockServer };
    expect(server.registerTool).toHaveBeenCalledWith(
      'preview_upload_command',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the validate_file tool', async () => {
    const { server } = (await import('./index')) as unknown as { server: MockServer };
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
      const imported = (await import('./index')) as unknown as { server: MockServer };
      server = imported.server;
    });

    const getToolHandler = (toolName: string): ToolHandler | undefined => {
      const call = vi.mocked(server.registerTool).mock.calls.find(
        (c: unknown[]) => c[0] === toolName
      );
      return call?.[2] as ToolHandler | undefined;
    };

    it('should validate and normalize format correctly', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      // Test invalid format
      const result3 = await handler({ filePath: '/path/to/file.txt', format: 'invalid' }, {});
      expect(result3.isError).toBe(true);
      expect(result3.content[0]?.text).toContain('Invalid format: invalid');

      // Test case-insensitive matching (should be valid)
      const result1 = await handler({ filePath: '/path/to/file.txt', format: 'UUID' }, {});
      expect(!result1.isError).toBe(true); // Should succeed since UUID is valid (normalized to uuid)

      // Test alias handling (should be valid)
      const result2 = await handler({ filePath: '/path/to/file.txt', format: 'GFYCAT' }, {});
      expect(!result2.isError).toBe(true); // Should succeed since GFYCAT is valid (normalized to random-words)
    });

    it('should handle file not found error', async () => {
      fsMock.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const handler = getToolHandler('upload_file_to_zipline');
      if (!handler) throw new Error('Handler not found');

      const result = await handler({ filePath: '/path/to/nonexistent.txt' }, {});
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
  });

  describe('get_upload_url_only tool', () => {
    let server: MockServer;

    beforeEach(async () => {
      vi.resetModules();
      Object.values(fsMock).forEach((fn) => fn.mockReset());
      const imported = (await import('./index')) as unknown as { server: MockServer };
      server = imported.server;
    });

    const getToolHandler = (toolName: string): ToolHandler | undefined => {
      const call = vi.mocked(server.registerTool).mock.calls.find(
        (c: unknown[]) => c[0] === toolName
      );
      return call?.[2] as ToolHandler | undefined;
    };

    it('should validate format for URL-only upload', async () => {
      fsMock.readFile.mockResolvedValue(Buffer.from('test content'));

      const handler = getToolHandler('get_upload_url_only');
      if (!handler) throw new Error('Handler not found');

      // Test invalid format
      const resultInvalid = await handler({ filePath: '/path/to/file.txt', format: 'invalid' }, {});
      expect(resultInvalid.isError).toBe(true);
      expect(resultInvalid.content[0]?.text).toContain('Invalid format: invalid');

      // Test valid formats
      const validFormats = ['random', 'uuid', 'date', 'name', 'random-words'];
      for (const format of validFormats) {
        const result = await handler({ filePath: '/path/to/file.txt', format }, {});
        expect(!result.isError).toBe(true); // Should succeed since spawn is now mocked properly
      }

      // Test alias
      const resultAlias = await handler({ filePath: '/path/to/file.txt', format: 'gfycat' }, {});
      expect(!resultAlias.isError).toBe(true); // Should succeed since spawn is now mocked properly
    });
  });

  describe('preview_upload_command tool', () => {
    let server: MockServer;

    beforeEach(async () => {
      vi.resetModules();
      Object.values(fsMock).forEach((fn) => fn.mockReset());
      const imported = (await import('./index')) as unknown as { server: MockServer };
      server = imported.server;
    });

    const getToolHandler = (toolName: string): ToolHandler | undefined => {
      const call = vi.mocked(server.registerTool).mock.calls.find(
        (c: unknown[]) => c[0] === toolName
      );
      return call?.[2] as ToolHandler | undefined;
    };

    it('should generate preview command with normalized format', async () => {
      const handler = getToolHandler('preview_upload_command');
      if (!handler) throw new Error('Handler not found');

      // Test with alias
      const result1 = await handler({ filePath: '/path/to/file.txt', format: 'gfycat' }, {});
      expect(!result1.isError).toBe(true);
      expect(result1.content[0]?.text).toContain('format: \'random-words\'');

      // Test with uppercase
      const result2 = await handler({ filePath: '/path/to/file.txt', format: 'UUID' }, {});
      expect(!result2.isError).toBe(true);
      expect(result2.content[0]?.text).toContain('format: \'uuid\'');

      // Test with invalid format
      const result3 = await handler({ filePath: '/path/to/file.txt', format: 'invalid' }, {});
      expect(result3.isError).toBe(true);
      expect(result3.content[0]?.text).toContain('Invalid format: invalid');
    });
  });
});

// Define types for tool handler
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<ToolResult>;

describe('tmp_file_manager tool', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(fsMock).forEach((fn) => fn.mockReset());
    const imported = (await import('./index')) as unknown as { server: MockServer };
    server = imported.server;
  });

  const getToolHandler = (toolName: string): ToolHandler | undefined => {
    const call = vi.mocked(server.registerTool).mock.calls.find(
      (c: unknown[]) => c[0] === toolName
    );
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
