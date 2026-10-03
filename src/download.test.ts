/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { lookup } from 'dns/promises';

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

vi.mock('dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const transport = {
  request: (..._args: unknown[]): unknown => {
    throw new Error('request handler not installed');
  },
};

vi.mock('https', () => ({
  default: {
    request: (...args: unknown[]) => transport.request(...args),
  },
  request: (...args: unknown[]) => transport.request(...args),
}));

vi.mock('http', () => ({
  default: {
    request: (...args: unknown[]) => transport.request(...args),
  },
  request: (...args: unknown[]) => transport.request(...args),
}));

type FakeResponse = Readable & {
  statusCode: number;
  headers: Record<string, string>;
};

type RequestOptions = {
  hostname?: string;
  servername?: string;
  headers?: { host?: string };
  signal?: AbortSignal;
  lookup?: (
    hostname: string,
    options: { all?: boolean },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number
    ) => void
  ) => void;
};

function fakeResponse(
  statusCode: number,
  headers: Record<string, string>,
  chunks: Buffer[]
): FakeResponse {
  const stream = Readable.from(chunks) as FakeResponse;
  stream.statusCode = statusCode;
  stream.headers = headers;
  return stream;
}

function installRequest(
  onEnd: (
    options: RequestOptions,
    callback: (res: FakeResponse) => void
  ) => void
) {
  transport.request = (options: unknown, callback: unknown) => {
    const req = new EventEmitter();
    const end = () => {
      onEnd(options as RequestOptions, callback as (res: FakeResponse) => void);
    };
    return Object.assign(req, { end });
  };
}

describe('downloadExternalUrl (TDD)', () => {
  const url = 'https://example.com/files/test.txt';
  const filename = 'test.txt';
  const fakeContent = new TextEncoder().encode('hello world');

  let OriginalAbortController: typeof AbortController;
  const content = Buffer.from(fakeContent);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    OriginalAbortController = globalThis.AbortController;

    installRequest((_options, callback) => {
      callback(
        fakeResponse(200, { 'content-length': String(content.length) }, [
          content,
        ])
      );
    });
  });

  afterEach(() => {
    globalThis.AbortController = OriginalAbortController;
  });

  it('downloads a file and returns absolute path', async () => {
    const { downloadExternalUrl } = await import('./httpClient.js');

    const result = await downloadExternalUrl(url, { timeout: 10000 });

    expect(result).toBe('/home/user/.zipline_tmp/users/hash/test.txt');
    expect(fsMock.open).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      'w'
    );
    expect(fsHandleMock.write).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('rejects unsupported URL schemes', async () => {
    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl('ftp://example.com/file')).rejects.toThrow(
      /unsupported scheme|invalid url/i
    );
  });

  it('rejects private and loopback URLs (SSRF protection)', async () => {
    const { downloadExternalUrl, isPrivateHost } =
      await import('./httpClient.js');

    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('localhost.')).toBe(true);
    expect(isPrivateHost('foo.localhost')).toBe(true);
    expect(isPrivateHost('localhost.localdomain')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('172.16.0.1')).toBe(true);
    expect(isPrivateHost('192.168.1.1')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true);
    expect(isPrivateHost('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateHost('example.com')).toBe(false);

    const privateUrls = [
      'http://localhost/secret',
      'http://localhost./secret',
      'http://foo.localhost/secret',
      'http://localhost.localdomain/secret',
      'http://127.0.0.1:8080/data',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/admin',
      'http://192.168.1.1/router',
      'http://[::ffff:127.0.0.1]/secret',
      'http://[::ffff:7f00:1]/secret',
      'http://[::ffff:a9fe:a9fe]/latest/meta-data/',
      'http://[::1%25eth0]/file',
    ];

    for (const privateUrl of privateUrls) {
      await expect(downloadExternalUrl(privateUrl)).rejects.toThrow();
    }
  });

  it('blocks redirects to private URLs (SSRF redirect protection)', async () => {
    installRequest((_options, callback) => {
      callback(
        fakeResponse(
          302,
          { location: 'http://169.254.169.254/latest/meta-data/' },
          []
        )
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl('https://example.com/redirect')
    ).rejects.toThrow(/forbidden|private/i);
  });

  it('rejects redirect loop exceeding max redirects', async () => {
    installRequest((_options, callback) => {
      callback(fakeResponse(302, { location: 'https://example.com/loop' }, []));
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl('https://example.com/loop')
    ).rejects.toThrow(/too many redirects/i);
  });

  it('throws on HTTP errors', async () => {
    installRequest((_options, callback) => {
      callback(fakeResponse(404, {}, [Buffer.from('Not Found')]));
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
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

    globalThis.AbortController = MockAbortController;

    transport.request = (options: unknown) => {
      const req = new EventEmitter();
      const end = () => {
        (options as RequestOptions).signal?.addEventListener('abort', () => {
          req.emit('error', new Error('The operation was aborted.'));
        });
      };
      return Object.assign(req, { end });
    };

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url, { timeout: 5 })).rejects.toThrow(
      /abort|timeout/i
    );
  });

  it('rejects files larger than 100MB via Content-Length', async () => {
    const bigSize = 101 * 1024 * 1024;
    installRequest((_options, callback) => {
      callback(fakeResponse(200, { 'content-length': String(bigSize) }, []));
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /exceed|too large|100MB/i
    );
  });

  it('rejects files larger than 100MB via streaming (no Content-Length)', async () => {
    const chunk = Buffer.alloc(10 * 1024 * 1024);
    installRequest((_options, callback) => {
      callback(
        fakeResponse(
          200,
          {},
          Array.from({ length: 11 }, () => chunk)
        )
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /exceeded|too large|100MB/i
    );

    expect(fsMock.rm).toHaveBeenCalled();
  });

  it('removes partial file on failure', async () => {
    transport.request = () => {
      const req = new EventEmitter();
      const end = () => {
        req.emit('error', new Error('Network failure'));
      };
      return Object.assign(req, { end });
    };

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url)).rejects.toThrow(/Network failure/i);

    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      { force: true }
    );
  });

  it('accepts file exactly at 100MB boundary via Content-Length', async () => {
    const exactSize = 100 * 1024 * 1024;
    installRequest((_options, callback) => {
      callback(
        fakeResponse(200, { 'content-length': String(exactSize) }, [
          Buffer.from([1, 2, 3, 4, 5]),
        ])
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    const result = await downloadExternalUrl(url);

    expect(result).toBe('/home/user/.zipline_tmp/users/hash/test.txt');
    expect(fsMock.open).toHaveBeenCalled();
  });

  it('accepts file exactly at 100MB boundary via streaming', async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    installRequest((_options, callback) => {
      callback(
        fakeResponse(
          200,
          {},
          Array.from({ length: 100 }, () => chunk)
        )
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    const result = await downloadExternalUrl(url);

    expect(result).toBe('/home/user/.zipline_tmp/users/hash/test.txt');
  });

  it('rejects file just over 100MB boundary via streaming', async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    const chunks = Array.from({ length: 100 }, () => chunk);
    chunks.push(Buffer.from([1]));
    installRequest((_options, callback) => {
      callback(fakeResponse(200, {}, chunks));
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url)).rejects.toThrow(
      /exceeded|too large|100MB/i
    );

    expect(fsMock.rm).toHaveBeenCalled();
  });

  it('cleans up file on streaming abort mid-download', async () => {
    const chunk = Buffer.alloc(50 * 1024 * 1024);
    installRequest((_options, callback) => {
      async function* failAfterOne() {
        yield chunk;
        throw new Error('Connection lost mid-download');
      }
      const stream = Readable.from(failAfterOne()) as FakeResponse;
      stream.statusCode = 200;
      stream.headers = {};
      callback(stream);
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(downloadExternalUrl(url)).rejects.toThrow(/Connection lost/i);

    expect(fsMock.rm).toHaveBeenCalledWith(
      '/home/user/.zipline_tmp/users/hash/test.txt',
      { force: true }
    );
  });

  it('respects custom maxFileSizeBytes parameter', async () => {
    const customLimit = 1024;
    installRequest((_options, callback) => {
      callback(fakeResponse(200, {}, [Buffer.alloc(2048)]));
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl(url, { maxFileSizeBytes: customLimit })
    ).rejects.toThrow(/exceed/i);

    expect(fsMock.rm).toHaveBeenCalled();
  });

  it('refuses a public name that resolves to a private or metadata address', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ] as never);
    let requested = false;
    transport.request = () => {
      requested = true;
      throw new Error('should not connect');
    };

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl('https://files.example/secret.txt')
    ).rejects.toThrow(/forbidden|private/i);
    expect(requested).toBe(false);
  });

  it('refuses when any DNS answer is private', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.1.2.3', family: 4 },
    ] as never);
    let requested = false;
    transport.request = () => {
      requested = true;
      throw new Error('should not connect');
    };

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl('https://files.example/secret.txt')
    ).rejects.toThrow(/forbidden|private/i);
    expect(requested).toBe(false);
  });

  it('connects to the resolved address and keeps that pin if DNS changes', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
    ] as never);
    let seen: RequestOptions | undefined;
    installRequest((options, callback) => {
      seen = options;
      callback(
        fakeResponse(200, { 'content-length': String(content.length) }, [
          content,
        ])
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await downloadExternalUrl(url);

    expect(seen?.hostname).toBe('203.0.113.10');
    expect(seen?.servername).toBe('example.com');
    expect(seen?.headers?.host).toBe('example.com');

    vi.mocked(lookup).mockResolvedValue([
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await new Promise<void>((resolve, reject) => {
      seen?.lookup?.('example.com', { all: true }, (err, address) => {
        try {
          expect(err).toBeNull();
          expect(address).toEqual([{ address: '203.0.113.10', family: 4 }]);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  });

  it('re-resolves a redirect and refuses a private answer', async () => {
    vi.mocked(lookup).mockImplementation((async (hostname: string) => {
      if (hostname === 'rebind.example') {
        return [{ address: '127.0.0.1', family: 4 }];
      }
      return [{ address: '203.0.113.10', family: 4 }];
    }) as never);
    let requests = 0;
    installRequest((_options, callback) => {
      requests++;
      callback(
        fakeResponse(302, { location: 'http://rebind.example/secret.txt' }, [])
      );
    });

    const { downloadExternalUrl } = await import('./httpClient.js');
    await expect(
      downloadExternalUrl('https://example.com/out.txt')
    ).rejects.toThrow(/forbidden|private/i);
    expect(requests).toBe(1);
  });
});
