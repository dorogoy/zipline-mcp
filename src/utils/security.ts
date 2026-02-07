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

  // Explicitly reject Unix absolute paths (e.g., /etc/passwd)
  if (path.isAbsolute(trimmedPath)) {
    throw new SandboxPathError(`Absolute paths are not allowed: ${inputPath}`);
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

  // Resolve to absolute path before validation (security: catches relative traversals)
  const absolutePath = path.resolve(trimmedPath);
  const normalizedPath = path.normalize(absolutePath);
  const normalizedRoot = path.normalize(sandboxRoot);

  return normalizedPath.startsWith(normalizedRoot);
}

export function maskToken(input: string, token: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  if (!token || typeof token !== 'string' || token.length === 0) {
    return input;
  }

  return input.replaceAll(token, '[REDACTED]');
}

export function maskSensitiveData(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let masked = input;

  // Mask ZIPLINE_TOKEN from environment
  const token = process.env.ZIPLINE_TOKEN ?? '';
  if (token) {
    masked = maskToken(masked, token);
  }

  // Future: Add additional sensitive patterns here
  // Example patterns that could be added:
  // - API keys (generic pattern: /[A-Za-z0-9]{32,}/)
  // - JWT tokens (pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
  // - Private keys (pattern: /-----BEGIN.*PRIVATE KEY-----/)
  // - Email addresses in certain contexts
  // - Credit card numbers
  //
  // Implementation approach for future patterns:
  // const sensitivePatterns = [
  //   { pattern: /pattern1/g, replacement: '[REDACTED_TYPE]' },
  //   { pattern: /pattern2/g, replacement: '[REDACTED_TYPE]' }
  // ];
  // sensitivePatterns.forEach(({ pattern, replacement }) => {
  //   masked = masked.replace(pattern, replacement);
  // });

  return masked;
}

export function secureLog(message: string, ...args: unknown[]): void {
  const maskedMessage = maskSensitiveData(message);
  const maskedArgs = args.map((arg) => {
    if (typeof arg === 'string') {
      return maskSensitiveData(arg);
    }
    // For objects, convert to JSON, mask, then parse back
    // This prevents token exposure in object properties
    if (typeof arg === 'object' && arg !== null) {
      try {
        const jsonString = JSON.stringify(arg);
        const maskedJson = maskSensitiveData(jsonString);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(maskedJson);
      } catch {
        // If JSON processing fails, return a safe placeholder
        return '[OBJECT_MASKING_ERROR]';
      }
    }
    return arg;
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  console.error(maskedMessage, ...maskedArgs);
}
