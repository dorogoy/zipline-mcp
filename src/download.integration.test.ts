/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
process.env.ZIPLINE_TOKEN = 'test-token';
process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock MCP server and transport like in index.test
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const McpServer = vi.fn().mockImplementation(() => {
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

// Mock downloadExternalUrl implementation to simulate real behavior
const httpClientMock = {
  downloadExternalUrl: vi.fn(),
};
vi.mock('./httpClient', () => httpClientMock);

// Minimal fs mock to avoid real disk ops
const fsMock = {
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
};
vi.mock('fs/promises', () => ({ ...fsMock, default: fsMock }));

describe('download_external_url tool (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers the download_external_url tool and returns success content', async () => {
    // Arrange: make downloader resolve to a path
    httpClientMock.downloadExternalUrl.mockResolvedValue(
      '/home/user/.zipline_tmp/users/hash/test.txt'
    );

    // Act: import index (which registers tools)
    const imported = await import('./index');
    const server = imported.server as unknown as any;

    // Find the registered tool handler from mock.calls
    const calls = server.registerTool?.mock?.calls ?? [];
    const call = calls.find((c: unknown[]) => c[0] === 'download_external_url');
    expect(call).toBeDefined();
    type ToolHandler = (
      args: Record<string, unknown>,
      extra: Record<string, unknown>
    ) => Promise<Record<string, unknown> | void>;
    const handler = call?.[2] as unknown as ToolHandler;
    expect(typeof handler).toBe('function');

    // Call the handler
    const raw = await handler({ url: 'https://example.com/file.txt' }, {});
    const result = raw as unknown as {
      content?: Array<{ type?: string; text?: string }>;
      [k: string]: unknown;
    };

    // Assert
    expect(result).toBeDefined();
    expect(result.content?.[0]?.text).toContain(
      'Local path: /home/user/.zipline_tmp/users/hash/test.txt'
    );
    expect(httpClientMock.downloadExternalUrl).toHaveBeenCalledWith(
      'https://example.com/file.txt',
      {
        timeout: 30000,
      }
    );
  });

  it('returns error response when downloader throws', async () => {
    httpClientMock.downloadExternalUrl.mockRejectedValue(
      new Error('Network failure')
    );

    const imported = await import('./index');
    const server = imported.server as any;

    const call = vi
      .mocked(server.registerTool)
      .mock.calls.find((c: unknown[]) => c[0] === 'download_external_url');
    expect(call).toBeDefined();
    const handler = call?.[2] as Function;
    expect(handler).toBeDefined();

    const result = await handler({ url: 'https://example.com/file.txt' }, {});

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('DOWNLOAD FAILED');
    expect(result.content?.[0]?.text).toContain('Network failure');
  });
});
