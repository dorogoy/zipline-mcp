process.env.ZIPLINE_TOKEN = 'test-token';
process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

let validateFileContent: typeof import('./index.js').validateFileContent;

beforeAll(async () => {
  ({ validateFileContent } = await import('./index.js'));
});

function vint(n: number): Buffer {
  let bytes = 1;
  let max = 0x7f;
  while (n > max) {
    bytes++;
    max = (max << 7) | 0x7f;
    if (bytes > 8) throw new Error('EBML integer is too large');
  }
  const out = Buffer.alloc(bytes);
  let value = n;
  for (let i = bytes - 1; i >= 0; i--) {
    out[i] = value & 0xff;
    value >>= 8;
  }
  const first = out[0];
  if (first === undefined) throw new Error('EBML integer is empty');
  out[0] = first | (1 << (8 - bytes));
  return out;
}

function element(id: Buffer, payload: Buffer): Buffer {
  return Buffer.concat([id, vint(payload.length), payload]);
}

function makeEbml(docType: string, voidSize: number): Buffer {
  const voidElement = element(Buffer.from([0xec]), Buffer.alloc(voidSize));
  const docTypeElement = element(
    Buffer.from([0x42, 0x82]),
    Buffer.from(docType)
  );
  const body = Buffer.concat([voidElement, docTypeElement]);
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    vint(body.length),
    body,
  ]);
}

describe('content type compatibility', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs
        .splice(0)
        .map((folder) => rm(folder, { recursive: true, force: true }))
    );
  });

  async function check(name: string, bytes: Buffer) {
    const folder = await mkdtemp(path.join(tmpdir(), 'ctype-'));
    dirs.push(folder);
    const filePath = path.join(folder, name);
    await writeFile(filePath, bytes);
    return validateFileContent(filePath, path.extname(name).toLowerCase());
  }

  it('accepts CFB bytes for legacy Office extensions and rejects them for docx', async () => {
    const cfb = Buffer.alloc(16);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(cfb);

    for (const name of ['notes.doc', 'sheet.xls', 'deck.ppt']) {
      const result = await check(name, cfb);
      expect(result.detectedMimeType).toBe('application/x-cfb');
      expect(result.mimeMatch).toBe(true);
    }

    const docx = await check('notes.docx', cfb);
    expect(docx.mimeMatch).toBe(false);
  });

  it('accepts an AVI container whose detected MIME is video/vnd.avi', async () => {
    const avi = Buffer.alloc(16);
    Buffer.from('RIFF', 'ascii').copy(avi, 0);
    Buffer.from('AVI ', 'ascii').copy(avi, 8);

    const result = await check('clip.avi', avi);
    expect(result.detectedMimeType).toBe('video/vnd.avi');
    expect(result.extensionMimeType).toBe('video/x-msvideo');
    expect(result.mimeMatch).toBe(true);
  });

  it('identifies Matroska and WebM when the DocType is past the 4100-byte probe', async () => {
    const matroska = makeEbml('matroska', 5000);
    const webm = makeEbml('webm', 5000);
    expect(
      await fileTypeFromBuffer(matroska.subarray(0, 4100))
    ).toBeUndefined();
    expect(await fileTypeFromBuffer(webm.subarray(0, 4100))).toBeUndefined();

    const mkv = await check('movie.mkv', matroska);
    expect(mkv.detectedMimeType).toBe('video/matroska');
    expect(mkv.extensionMimeType).toBe('video/x-matroska');
    expect(mkv.mimeMatch).toBe(true);

    const webmFile = await check('clip.webm', webm);
    expect(webmFile.detectedMimeType).toBe('video/webm');
    expect(webmFile.mimeMatch).toBe(true);

    const swapped = await check('clip.webm', matroska);
    expect(swapped.detectedMimeType).toBe('video/matroska');
    expect(swapped.mimeMatch).toBe(false);
  });

  it('still rejects unidentified non-text bytes', async () => {
    const result = await check(
      'page.png',
      Buffer.from('<html><script>alert(1)</script></html>')
    );
    expect(result.detectedMimeType).toBe('unknown');
    expect(result.mimeMatch).toBe(false);
  });
});
