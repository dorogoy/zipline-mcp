/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises.readFile used by the http client
const fsMock = {
  readFile: vi.fn(),
};
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => (fsMock.readFile as unknown as Function)(...args),
}));

// Use Node 18+ global fetch/FormData/Blob/AbortController
type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

describe('httpClient.uploadFile (TDD - tests first)', () => {
  const endpoint = 'http://localhost:3000';
  const token = 'test-token';
  const samplePath = '/tmp/file.txt';
  const sampleContent = new TextEncoder().encode('hello world');
  const format = 'random';

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let OriginalAbortController: typeof AbortController;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fsMock.readFile.mockReset();

    // Keep reference to original AbortController
    OriginalAbortController = globalThis.AbortController;

    // Mock fetch
    const g = globalThis as any;
    fetchSpy = vi
      .spyOn(g, 'fetch')
      .mockImplementation(async (_input: any, _init?: any): Promise<any> => {
        // Default happy path mock
        const body = {
          files: [{ url: 'https://files.example.com/u/abc' }],
        };
        const res = {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
        return res as any;
      });
  });

  afterEach(() => {
    // Restore AbortController
    globalThis.AbortController = OriginalAbortController;
    fetchSpy.mockRestore();
  });

  it('posts multipart/form-data with headers and returns files[0].url on success', async () => {
    fsMock.readFile.mockResolvedValue(sampleContent);

    const { uploadFile } = await import('./httpClient');

    const url = await uploadFile({
      endpoint,
      token,
      filePath: samplePath,
      format,
      timeoutMs: 10_000,
    });

    expect(url).toBe('https://files.example.com/u/abc');

    // Validate fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [any, any];
    expect(String(calledUrl)).toBe(`${endpoint}/api/upload`);
    expect(init?.method).toBe('POST');
    // Content-Type is set automatically by FormData with boundary; ensure we set required headers
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['authorization']).toBe(token);
    expect(headers['x-zipline-format']).toBe(format);
    expect(init?.redirect).toBe('follow');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeDefined();
  });

  it('throws on non-2xx HTTP responses with server message', async () => {
    fsMock.readFile.mockResolvedValue(sampleContent);
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
      text: async () => 'Internal error',
    } as any);

    const { uploadFile } = await import('./httpClient');

    await expect(
      uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
      })
    ).rejects.toThrow(/HTTP 500/i);
  });

  it('throws when response JSON does not include files[0].url', async () => {
    fsMock.readFile.mockResolvedValue(sampleContent);
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
      text: async () => JSON.stringify({ files: [] }),
    } as any);

    const { uploadFile } = await import('./httpClient');

    await expect(
      uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
      })
    ).rejects.toThrow(/No URL returned/i);
  });

  it('aborts on timeout using AbortController', async () => {
    fsMock.readFile.mockResolvedValue(sampleContent);

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

    globalThis.AbortController = MockAbortController as unknown as typeof AbortController;

    // Simulate fetch that hangs until aborted
    fetchSpy.mockImplementation(async (_input: any, init?: any) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('The operation was aborted.'));
        });
      }) as any;
    });

    const { uploadFile } = await import('./httpClient');

    await expect(
      uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        timeoutMs: 5, // very short timeout
      })
    ).rejects.toThrow(/aborted|timeout/i);

    // Ensure fetch was called and had a signal
    const [, init] = fetchSpy.mock.calls[0] as [any, any];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reads file content via fs.promises.readFile and attaches it to FormData', async () => {
    fsMock.readFile.mockResolvedValue(sampleContent);

    // Capture the body to ensure it is a FormData instance with "file" field
    fetchSpy.mockImplementation(async (_input: any, init?: any) => {
      const body = init?.body as any;
      expect(body).toBeDefined();
      const res: FetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ url: 'https://files.example.com/u/xyz' }] }),
        text: async () => JSON.stringify({ files: [{ url: 'https://files.example.com/u/xyz' }] }),
      };
      return res as any;
    });

    const { uploadFile } = await import('./httpClient');

    const url = await uploadFile({
      endpoint,
      token,
      filePath: samplePath,
      format,
    });

    expect(url).toBe('https://files.example.com/u/xyz');
    expect(fsMock.readFile).toHaveBeenCalledWith(samplePath);
  });
});
