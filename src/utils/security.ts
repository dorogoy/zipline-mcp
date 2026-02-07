import path from 'path';

export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxPathError';
  }
}

function validatePathInput(inputPath: string | null | undefined): void {
  if (inputPath === null || inputPath === undefined) {
    throw new SandboxPathError('Path cannot be null or undefined');
  }

  if (typeof inputPath !== 'string') {
    throw new SandboxPathError('Path must be a string');
  }

  const trimmedPath = inputPath.trim();
  if (trimmedPath === '') {
    throw new SandboxPathError('Path cannot be empty or whitespace-only');
  }
}

function checkNullBytes(inputPath: string): void {
  if (inputPath.includes('\0')) {
    throw new SandboxPathError('Path contains null bytes');
  }
}

function isAbsoluteWindowsPath(inputPath: string): boolean {
  return /^[A-Za-z]:\\/.test(inputPath) || /^[A-Za-z]:\//.test(inputPath);
}

function normalizePathSeparators(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

export function sanitizePath(inputPath: string, sandboxRoot: string): string {
  validatePathInput(inputPath);
  checkNullBytes(inputPath);

  const trimmedPath = inputPath.trim();

  if (isAbsoluteWindowsPath(trimmedPath)) {
    throw new SandboxPathError(
      `Absolute Windows paths are not allowed: ${inputPath}`
    );
  }

  const normalizedSeparators = normalizePathSeparators(trimmedPath);

  const absolutePath = path.resolve(sandboxRoot, normalizedSeparators);
  const normalizedPath = path.normalize(absolutePath);

  const normalizedSandboxRoot = path.normalize(sandboxRoot);
  if (!normalizedPath.startsWith(normalizedSandboxRoot)) {
    throw new SandboxPathError(`Path traversal attempt detected: ${inputPath}`);
  }

  return normalizedPath;
}

export function validateSandboxPath(
  testPath: string | null | undefined,
  sandboxRoot: string
): boolean {
  if (testPath === null || testPath === undefined) {
    return false;
  }

  if (typeof testPath !== 'string') {
    return false;
  }

  const trimmedPath = testPath.trim();
  if (trimmedPath === '') {
    return false;
  }

  if (trimmedPath.includes('\0')) {
    return false;
  }

  const normalizedPath = path.normalize(trimmedPath);
  const normalizedRoot = path.normalize(sandboxRoot);

  return normalizedPath.startsWith(normalizedRoot);
}
