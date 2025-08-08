import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock the McpServer and its methods
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('path', async (importOriginal) => {
  const actualPath = await importOriginal<typeof import('path')>();
  return {
    ...actualPath,
    basename: vi.fn((p) => p.split('/').pop() || p),
    extname: vi.fn((p) => {
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
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Zipline MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create an McpServer instance', async () => {
    // Dynamically import the module to ensure mocks are in place
    await import('./index.ts');

    expect(McpServer).toHaveBeenCalledWith({
      name: 'zipline-upload-server',
      version: '1.0.0',
    });
  });

  it('should register the upload_file_to_zipline tool', async () => {
    const { server } = await import('./index.ts');
    expect(server.registerTool).toHaveBeenCalledWith(
      'upload_file_to_zipline',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the get_upload_url_only tool', async () => {
    const { server } = await import('./index.ts');
    expect(server.registerTool).toHaveBeenCalledWith(
      'get_upload_url_only',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the preview_upload_command tool', async () => {
    const { server } = await import('./index.ts');
    expect(server.registerTool).toHaveBeenCalledWith(
      'preview_upload_command',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register the validate_file tool', async () => {
    const { server } = await import('./index.ts');
    expect(server.registerTool).toHaveBeenCalledWith(
      'validate_file',
      expect.any(Object),
      expect.any(Function)
    );
  });

  // Add more specific tests for tool logic here
  // For example, testing the upload_file_to_zipline tool handler
  describe('upload_file_to_zipline tool', () => {
    it('should handle successful file upload', async () => {
      // This test will require more complex mocking of readFile, spawn, etc.
      // For now, it's a placeholder.
      // TODO: Implement detailed test for successful upload
      expect(true).toBe(true); // Placeholder
    });

    it('should handle file not found error', async () => {
      // TODO: Implement test for file not found
      expect(true).toBe(true); // Placeholder
    });

    it('should handle unsupported file type error', async () => {
      // TODO: Implement test for unsupported file type
      expect(true).toBe(true); // Placeholder
    });
  });
});
