/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fsHandleMock = {
  write: vi.fn(),
  close: vi.fn(),
};

const fsMock = {
  open: vi.fn(async () => fsHandleMock),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
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
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(async () => ({ mime: 'text/plain', ext: 'txt' })),
}));

vi.mock('mime-types', () => ({
  default: {
    lookup: vi.fn((filename: string) => {
      if (filename.endsWith('.txt')) return 'text/plain';
      if (filename.endsWith('.png')) return 'image/png';
      if (filename.endsWith('.exe')) return 'application/octet-stream';
      if (filename.endsWith('.env')) return 'text/plain';
      return false;
    }),
  },
}));

describe('downloadExternalUrl (TDD)', () => {
  const url = 'https://example.com/files/test.txt';
  const filename = 'test.txt';
  const fakeContent = new TextEncoder().encode('hello world');

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let OriginalAbortController: typeof AbortController;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    OriginalAbortController = globalThis.AbortController;

    const g = globalThis as any;
    fetchSpy = vi
      .spyOn(g, 'fetch')
      .mockImplementation(async (_input: any, _init?: any) => {
        let sent = false;
        const res = {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => {
                if (!sent) {
                  sent = true;
                  return { done: false, value: fakeContent };
                }
                return { done: true, value: undefined };
              },
            }),
          },
          headers: {
            get: (k: string) =>
              k.toLowerCase() === 'content-length'
                ? String(fakeContent.length)
                : null,
          },
          url: url,
        };
        return res as any;
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    globalThis.AbortController = OriginalAbortController;
  });

  it('downloads a file and returns absolute path', async () => {
    const { downloadExternalUrl } = await import('./httpClient');

    const result = await downloadExternalUrl(url, { timeout: 10000 });

    expect(result).toBe('/home/user/.zipline_tmp/users/hash/test.txt');
    expect(fsMock.open).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      'w'
    );
    expect(fsHandleMock.write).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('rejects unsupported URL schemes', async () => {
    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl('ftp://example.com/file')).rejects.toThrow(
      /unsupported scheme|invalid url/i
    );
  });

  it('throws on HTTP errors', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found',
    } as any);

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /HTTP 404|Not Found/i
    );
  });

  it('aborts on timeout', async () => {
    let abortUnderlying: (() => void) | undefined;

    class MockAbortController {
      signal: AbortSignal;
      constructor() {
        const ac = new OriginalAbortController();
        this.signal = ac.signal;
        abortUnderlying = () => ac.abort();
      }
      abort() {
        abortUnderlying?.();
      }
    }

    globalThis.AbortController =
      MockAbortController as unknown as typeof AbortController;

    fetchSpy.mockImplementation(async (_input: any, init?: any) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('The operation was aborted.'));
        });
      }) as any;
    });

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url, { timeout: 5 })).rejects.toThrow(
      /abort|timeout/i
    );
  });

  it('rejects files larger than 100MB via Content-Length', async () => {
    const bigSize = 101 * 1024 * 1024;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-length' ? String(bigSize) : null,
      },
      url,
    } as any);

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /exceed|too large|100MB/i
    );
  });

  it('rejects files larger than 100MB via streaming (no Content-Length)', async () => {
    const chunk = new Uint8Array(10 * 1024 * 1024);
    let chunksSent = 0;

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (chunksSent < 11) {
              chunksSent++;
              return { done: false, value: chunk };
            }
            return { done: true, value: undefined };
          },
        }),
      },
      url,
    } as any);

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /exceeded|too large|100MB/i
    );

    expect(fsMock.rm).toHaveBeenCalled();
  });

  it('removes partial file on failure', async () => {
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('Network failure');
    });

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url)).rejects.toThrow(/Network failure/i);

    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      { force: true }
    );
  });
});
