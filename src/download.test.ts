/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal fs mock for write/remove operations
const fsMock = {
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
};
vi.mock('fs/promises', () => ({ ...fsMock, default: fsMock }));

// Mock sandbox utilities used by the downloader so tests don't depend on real FS layout
vi.mock('./sandboxUtils', () => ({
  ensureUserSandbox: vi.fn(async () => '/home/user/.zipline_tmp/users/hash'),
  resolveSandboxPath: vi.fn(
    (filename: string) => `/home/user/.zipline_tmp/users/hash/${filename}`
  ),
  validateFilename: vi.fn(() => null),
  logSandboxOperation: vi.fn(() => {}),
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
        const res = {
          ok: true,
          status: 200,
          arrayBuffer: async () => fakeContent.buffer,
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
    // writeFile is called with path and binary data
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      expect.any(Uint8Array)
    );
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

  it('rejects files larger than 100MB', async () => {
    const bigSize = 101 * 1024 * 1024;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(1),
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

  it('removes partial file on failure', async () => {
    // Simulate fetch that throws mid-download
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('Network failure');
    });

    const { downloadExternalUrl } = await import('./httpClient');
    await expect(downloadExternalUrl(url)).rejects.toThrow(/Network failure/i);

    // Ensure cleanup attempted
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      { force: true }
    );
  });
});
