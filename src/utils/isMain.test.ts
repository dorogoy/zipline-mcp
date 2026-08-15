import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { isMainModule } from './isMain.js';

describe('isMainModule', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ismain-test-'));

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when scriptPath is the module file itself', () => {
    const realFile = join(tmpDir, 'index.js');
    writeFileSync(realFile, '');
    expect(isMainModule(realFile, pathToFileURL(realFile).href)).toBe(true);
  });

  it('returns true when scriptPath is a symlink to the module (npm bin wrapper / npx)', () => {
    const realFile = join(tmpDir, 'dist-index.js');
    writeFileSync(realFile, '');
    const binLink = join(tmpDir, 'bin-zipline-mcp');
    symlinkSync(realFile, binLink);
    expect(isMainModule(binLink, pathToFileURL(realFile).href)).toBe(true);
  });

  it('returns true when both scriptPath and module url contain symlinks', () => {
    const realFile = join(tmpDir, 'chained-entry.js');
    writeFileSync(realFile, '');
    const moduleLink = join(tmpDir, 'module-link.js');
    const scriptLink = join(tmpDir, 'script-link');
    symlinkSync(realFile, moduleLink);
    symlinkSync(realFile, scriptLink);
    expect(isMainModule(scriptLink, pathToFileURL(moduleLink).href)).toBe(true);
  });

  it('returns false when scriptPath points to a different file', () => {
    const realFile = join(tmpDir, 'main.js');
    const otherFile = join(tmpDir, 'other.js');
    writeFileSync(realFile, '');
    writeFileSync(otherFile, '');
    expect(isMainModule(otherFile, pathToFileURL(realFile).href)).toBe(false);
  });

  it('returns false when scriptPath is undefined', () => {
    const realFile = join(tmpDir, 'entry.js');
    writeFileSync(realFile, '');
    expect(isMainModule(undefined, pathToFileURL(realFile).href)).toBe(false);
  });

  it('returns false when scriptPath does not exist', () => {
    const realFile = join(tmpDir, 'exists.js');
    writeFileSync(realFile, '');
    expect(
      isMainModule(
        join(tmpDir, 'does-not-exist.js'),
        pathToFileURL(realFile).href
      )
    ).toBe(false);
  });
});
