import { describe, it, expect, beforeEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

describe('File Ingest Tests', () => {
  const testDir = path.join(os.tmpdir(), 'zipline-file-ingest-test');
  const testFiles = {
    png: path.join(testDir, 'test-image.png'),
    jpg: path.join(testDir, 'test-image.jpg'),
    txt: path.join(testDir, 'test-text.txt'),
    json: path.join(testDir, 'test-data.json'),
  };

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  it('should read PNG binary file correctly', async () => {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await writeFile(testFiles.png, pngHeader);

    const content = await readFile(testFiles.png);
    expect(content).toBeInstanceOf(Buffer);
    expect(content.length).toBe(8);
    expect(content[0]).toBe(0x89);
    expect(content[1]).toBe(0x50);
  });

  it('should read JPG binary file correctly', async () => {
    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff]);
    await writeFile(testFiles.jpg, jpgHeader);

    const content = await readFile(testFiles.jpg);
    expect(content).toBeInstanceOf(Buffer);
    expect(content.length).toBe(3);
    expect(content[0]).toBe(0xff);
    expect(content[1]).toBe(0xd8);
  });

  it('should read TXT file correctly', async () => {
    const textContent = 'Hello, World!';
    await writeFile(testFiles.txt, textContent, 'utf8');

    const content = await readFile(testFiles.txt, 'utf8');
    expect(typeof content).toBe('string');
    expect(content).toBe(textContent);
  });

  it('should read JSON file correctly', async () => {
    const jsonData = { message: 'test', value: 42 };
    await writeFile(testFiles.json, JSON.stringify(jsonData), 'utf8');

    const content = await readFile(testFiles.json, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed).toEqual(jsonData);
  });

  it('should handle binary vs text file processing', async () => {
    const binaryContent = crypto.randomBytes(1024);
    const binaryFile = path.join(testDir, 'binary.dat');
    await writeFile(binaryFile, binaryContent);

    const content = await readFile(binaryFile);
    expect(content).toBeInstanceOf(Buffer);
    expect(content.length).toBe(1024);
  });
});
