/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises.readFile used by the http client
const fsMock = {
  readFile: vi.fn(),
};
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) =>
    (fsMock.readFile as unknown as Function)(...args),
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

    globalThis.AbortController =
      MockAbortController as unknown as typeof AbortController;

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
        json: async () => ({
          files: [{ url: 'https://files.example.com/u/xyz' }],
        }),
        text: async () =>
          JSON.stringify({
            files: [{ url: 'https://files.example.com/u/xyz' }],
          }),
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

// Unit tests for header validation
describe('Header Validation', () => {
  describe('validateDeleteAt', () => {
    it('accepts valid relative duration strings', async () => {
      const { validateDeleteAt } = await import('./httpClient');

      expect(() => validateDeleteAt('1d')).not.toThrow();
      expect(() => validateDeleteAt('2h')).not.toThrow();
      expect(() => validateDeleteAt('30m')).not.toThrow();
      expect(() => validateDeleteAt('7d')).not.toThrow();
    });

    it('accepts valid absolute date format with date= prefix', async () => {
      const { validateDeleteAt } = await import('./httpClient');

      // Use dates that are definitely in the future
      const futureDate1 = new Date();
      futureDate1.setFullYear(futureDate1.getFullYear() + 1);

      const futureDate2 = new Date();
      futureDate2.setFullYear(futureDate2.getFullYear() + 2);

      expect(() =>
        validateDeleteAt(`date=${futureDate1.toISOString()}`)
      ).not.toThrow();
      expect(() =>
        validateDeleteAt(`date=${futureDate2.toISOString()}`)
      ).not.toThrow();
    });

    it('rejects invalid relative duration strings', async () => {
      const { validateDeleteAt } = await import('./httpClient');

      expect(() => validateDeleteAt('')).toThrow();
      expect(() => validateDeleteAt('1')).toThrow();
      expect(() => validateDeleteAt('x')).toThrow();
      expect(() => validateDeleteAt('1x')).toThrow();
      expect(() => validateDeleteAt('-1d')).toThrow();
    });

    it('rejects invalid absolute date format', async () => {
      const { validateDeleteAt } = await import('./httpClient');

      expect(() => validateDeleteAt('date=')).toThrow();
      expect(() => validateDeleteAt('date=invalid')).toThrow();
      expect(() => validateDeleteAt('date=2025-13-01T00:00:00Z')).toThrow();
      expect(() => validateDeleteAt('2025-01-01T00:00:00Z')).toThrow(); // missing date= prefix
    });

    it('rejects past dates', async () => {
      const { validateDeleteAt } = await import('./httpClient');

      // Use a date in the past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      expect(() =>
        validateDeleteAt(`date=${pastDate.toISOString()}`)
      ).toThrow();
    });
  });

  describe('validatePassword', () => {
    it('accepts non-empty strings', async () => {
      const { validatePassword } = await import('./httpClient');

      expect(() => validatePassword('password123')).not.toThrow();
      expect(() => validatePassword('a')).not.toThrow();
      expect(() => validatePassword('complex-password!@#$%')).not.toThrow();
    });

    it('rejects empty strings', async () => {
      const { validatePassword } = await import('./httpClient');

      expect(() => validatePassword('')).toThrow();
      expect(() => validatePassword('   ')).toThrow();
    });
  });

  describe('validateMaxViews', () => {
    it('accepts valid non-negative integers', async () => {
      const { validateMaxViews } = await import('./httpClient');

      expect(() => validateMaxViews(0)).not.toThrow();
      expect(() => validateMaxViews(1)).not.toThrow();
      expect(() => validateMaxViews(100)).not.toThrow();
    });

    it('rejects negative integers', async () => {
      const { validateMaxViews } = await import('./httpClient');

      expect(() => validateMaxViews(-1)).toThrow();
      expect(() => validateMaxViews(-100)).toThrow();
    });

    it('rejects non-integer values', async () => {
      const { validateMaxViews } = await import('./httpClient');

      expect(() => validateMaxViews(1.5)).toThrow();
      expect(() => validateMaxViews('1' as unknown as number)).toThrow();
      expect(() => validateMaxViews(null as unknown as number)).toThrow();
      expect(() => validateMaxViews(undefined as unknown as number)).toThrow();
    });
  });

  describe('validateFolder', () => {
    it('accepts valid folder IDs', async () => {
      const { validateFolder } = await import('./httpClient');

      expect(() => validateFolder('folder123')).not.toThrow();
      expect(() => validateFolder('abc')).not.toThrow();
      expect(() => validateFolder('123')).not.toThrow();
      expect(() => validateFolder('a1b2c3')).not.toThrow();
    });

    it('rejects empty or whitespace-only strings', async () => {
      const { validateFolder } = await import('./httpClient');

      expect(() => validateFolder('')).toThrow();
      expect(() => validateFolder('   ')).toThrow();
    });

    it('rejects strings with special characters', async () => {
      const { validateFolder } = await import('./httpClient');

      expect(() => validateFolder('folder/123')).toThrow();
      expect(() => validateFolder('folder\\123')).toThrow();
      expect(() => validateFolder('folder@123')).toThrow();
      expect(() => validateFolder('folder#123')).toThrow();
    });
  });

  // Integration tests for full upload flow with new headers
  describe('uploadFile with new headers (Integration)', () => {
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

    it('includes x-zipline-deletes-at header when provided', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        deletesAt: '1d',
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes the new header
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-deletes-at']).toBe('1d');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('includes x-zipline-password header when provided', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        password: 'secret123',
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes the new header
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-password']).toBe('secret123');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('includes x-zipline-max-views header when provided', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        maxViews: 10,
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes the new header
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-max-views']).toBe('10');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('includes x-zipline-folder header when provided', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        folder: 'folder123',
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes the new header
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-folder']).toBe('folder123');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('includes multiple new headers when provided together', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        deletesAt: '2h',
        password: 'secret123',
        maxViews: 5,
        folder: 'myfolder',
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes all new headers
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-deletes-at']).toBe('2h');
      expect(headers['x-zipline-password']).toBe('secret123');
      expect(headers['x-zipline-max-views']).toBe('5');
      expect(headers['x-zipline-folder']).toBe('myfolder');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('rejects upload with invalid delete-at header before making request', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      await expect(
        uploadFile({
          endpoint,
          token,
          filePath: samplePath,
          format,
          deletesAt: 'invalid',
        })
      ).rejects.toThrow('delete-at header must be in format like');

      // Ensure fetch was not called due to validation failure
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects upload with invalid password header before making request', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      await expect(
        uploadFile({
          endpoint,
          token,
          filePath: samplePath,
          format,
          password: '',
        })
      ).rejects.toThrow('password header must be a non-empty string');

      // Ensure fetch was not called due to validation failure
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects upload with invalid max-views header before making request', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      await expect(
        uploadFile({
          endpoint,
          token,
          filePath: samplePath,
          format,
          maxViews: -1,
        })
      ).rejects.toThrow('max-views header must be a non-negative integer');

      // Ensure fetch was not called due to validation failure
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects upload with invalid folder header before making request', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      await expect(
        uploadFile({
          endpoint,
          token,
          filePath: samplePath,
          format,
          folder: 'invalid@folder',
        })
      ).rejects.toThrow(
        'folder header must contain only alphanumeric characters'
      );

      // Ensure fetch was not called due to validation failure
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('works correctly without any new headers (backward compatibility)', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes only original headers
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
      expect(headers['x-zipline-deletes-at']).toBeUndefined();
      expect(headers['x-zipline-password']).toBeUndefined();
      expect(headers['x-zipline-max-views']).toBeUndefined();
      expect(headers['x-zipline-folder']).toBeUndefined();
      expect(headers['x-zipline-original-name']).toBeUndefined();
    });

    it('includes x-zipline-original-name header when provided', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      const url = await uploadFile({
        endpoint,
        token,
        filePath: samplePath,
        format,
        originalName: 'original-file.txt',
      });

      expect(url).toBe('https://files.example.com/u/abc');

      // Validate fetch call includes the new header
      const [, init] = fetchSpy.mock.calls[0] as [any, any];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-zipline-original-name']).toBe('original-file.txt');
      expect(headers['authorization']).toBe(token);
      expect(headers['x-zipline-format']).toBe(format);
    });

    it('rejects upload with invalid originalName header before making request', async () => {
      fsMock.readFile.mockResolvedValue(sampleContent);

      const { uploadFile } = await import('./httpClient');

      await expect(
        uploadFile({
          endpoint,
          token,
          filePath: samplePath,
          format,
          originalName: 'invalid/name.txt',
        })
      ).rejects.toThrow('originalName cannot contain path separators');

      // Ensure fetch was not called due to validation failure
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
