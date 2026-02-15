/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type, @typescript-eslint/require-await */
process.env.ZIPLINE_TOKEN = 'test-token';
process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const httpClientMock = {
  downloadExternalUrl: vi.fn(),
};
vi.mock('./httpClient', () => httpClientMock);

const fsHandleMock = {
  read: vi.fn(async () => ({ bytesRead: 11, buffer: Buffer.alloc(11) })),
  close: vi.fn(),
};

const fsMock = {
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
  open: vi.fn(async () => fsHandleMock),
};
vi.mock('fs/promises', () => ({ ...fsMock, default: fsMock }));

vi.mock('./sandboxUtils', () => ({
  ensureUserSandbox: vi.fn(async () => '/home/user/.zipline_tmp/users/hash'),
  resolveSandboxPath: vi.fn(
    (filename: string) => `/home/user/.zipline_tmp/users/hash/${filename}`
  ),
  validateFilename: vi.fn(() => null),
  logSandboxOperation: vi.fn(() => {}),
  validateFileForSecrets: vi.fn(async () => {}),
  SecretDetectionError: class SecretDetectionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SecretDetectionError';
    }
  },
  MEMORY_STAGING_THRESHOLD: 5 * 1024 * 1024,
  TMP_MAX_READ_SIZE: 100 * 1024,
  stageFile: vi.fn(),
  clearStagedContent: vi.fn(),
  getUserSandbox: vi.fn(() => '/home/user/.zipline_tmp/users/hash'),
  resolveInUserSandbox: vi.fn(
    (filename: string) => `/home/user/.zipline_tmp/users/hash/${filename}`
  ),
  cleanupOldSandboxes: vi.fn(),
  initializeCleanup: vi.fn(),
  cleanupStaleLocks: vi.fn(),
  isSandboxLocked: vi.fn(() => false),
  acquireSandboxLock: vi.fn(),
  releaseSandboxLock: vi.fn(),
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(async () => ({ mime: 'text/plain', ext: 'txt' })),
}));

vi.mock('mime-types', () => {
  const lookup = vi.fn((filename: string) => {
    if (typeof filename === 'string' && filename.endsWith('.txt'))
      return 'text/plain';
    return false;
  });
  const charset = vi.fn(() => 'UTF-8');

  return {
    default: {
      lookup,
      charset,
    },
    lookup,
    charset,
  };
});

import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime-types';
import { validateFileForSecrets, SecretDetectionError } from './sandboxUtils';

describe('download_external_url tool (integration)', () => {
  const mockFileType = vi.mocked(fileTypeFromBuffer);
  const mockMimeLookup = vi.mocked(mime.lookup);
  const mockValidateSecrets = vi.mocked(validateFileForSecrets);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fsHandleMock.read.mockResolvedValue({
      bytesRead: 11,
      buffer: Buffer.from('hello world'),
    });

    // Reset default mock behaviors
    mockFileType.mockResolvedValue({ mime: 'text/plain', ext: 'txt' });
    mockMimeLookup.mockImplementation((filename: string) => {
      if (typeof filename === 'string' && filename.endsWith('.txt'))
        return 'text/plain';
      if (typeof filename === 'string' && filename.endsWith('.png'))
        return 'image/png';
      if (typeof filename === 'string' && filename.endsWith('.exe'))
        return 'application/octet-stream'; // Standard executable MIME
      return false;
    });
    mockValidateSecrets.mockResolvedValue();
  });

  it('registers the download_external_url tool and returns success content', async () => {
    httpClientMock.downloadExternalUrl.mockResolvedValue(
      '/home/user/.zipline_tmp/users/hash/test.txt'
    );

    const imported = await import('./index');
    const server = imported.server as unknown as any;

    const calls = server.registerTool?.mock?.calls ?? [];
    const call = calls.find((c: unknown[]) => c[0] === 'download_external_url');
    expect(call).toBeDefined();
    type ToolHandler = (
      args: Record<string, unknown>,
      extra: Record<string, unknown>
    ) => Promise<Record<string, unknown> | void>;
    const handler = call?.[2] as unknown as ToolHandler;
    expect(typeof handler).toBe('function');

    const raw = await handler({ url: 'https://example.com/file.txt' }, {});
    const result = raw as unknown as {
      content?: Array<{ type?: string; text?: string }>;
      [k: string]: unknown;
    };

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

  it('rejects and cleans up file with MIME mismatch', async () => {
    httpClientMock.downloadExternalUrl.mockResolvedValue(
      '/home/user/.zipline_tmp/users/hash/test.png'
    );

    // Mock as executable but named .png
    mockFileType.mockResolvedValueOnce({ mime: 'application/x-msdownload', ext: 'exe' });
    mockMimeLookup.mockReturnValueOnce('image/png'); // Extension expects png

    const imported = await import('./index');
    const server = imported.server as any;
    const call = vi
      .mocked(server.registerTool)
      .mock.calls.find((c: unknown[]) => c[0] === 'download_external_url');
    const handler = call?.[2] as Function;

    const result = await handler({ url: 'https://example.com/malicious.png' }, {});

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('MIME type mismatch');
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.png',
      { force: true }
    );
  });

  it('rejects and cleans up unsupported file type', async () => {
    httpClientMock.downloadExternalUrl.mockResolvedValue(
        '/home/user/.zipline_tmp/users/hash/test.exe'
    );

    // Mock as exe
    mockFileType.mockResolvedValueOnce({ mime: 'application/x-msdownload', ext: 'exe' });
    mockMimeLookup.mockReturnValueOnce('application/x-msdownload');

    const imported = await import('./index');
    const server = imported.server as any;
    const call = vi
      .mocked(server.registerTool)
      .mock.calls.find((c: unknown[]) => c[0] === 'download_external_url');
    const handler = call?.[2] as Function;

    const result = await handler({ url: 'https://example.com/test.exe' }, {});

    expect(result.isError).toBe(true);
    // Note: The error message might vary based on ALLOWED_EXTENSIONS in index.ts
    // Assuming .exe is not in ALLOWED_EXTENSIONS
    expect(result.content?.[0]?.text).toMatch(/Unsupported file type|not supported/);
    expect(fsMock.rm).toHaveBeenCalledWith(
        '/home/user/.zipline_tmp/users/hash/test.exe',
        { force: true }
    );
  });

  it('rejects and cleans up file containing secrets', async () => {
    httpClientMock.downloadExternalUrl.mockResolvedValue(
      '/home/user/.zipline_tmp/users/hash/secret.txt'
    );

    mockFileType.mockResolvedValueOnce({ mime: 'text/plain', ext: 'txt' });

    // Mock secret detection failure
    mockValidateSecrets.mockRejectedValueOnce(
      new SecretDetectionError('Secret found: API Key', 'api_key', 'API_KEY=')
    );

    const imported = await import('./index');
    const server = imported.server as any;
    const call = vi
      .mocked(server.registerTool)
      .mock.calls.find((c: unknown[]) => c[0] === 'download_external_url');
    const handler = call?.[2] as Function;

    const result = await handler({ url: 'https://example.com/secret.txt' }, {});

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('Secret found');
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/secret.txt',
      { force: true }
    );
  });
});
