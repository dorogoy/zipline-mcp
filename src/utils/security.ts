import path from 'path';

export interface SecretDetectionResult {
  detected: boolean;
  secretType?:
    | 'env_file'
    | 'api_key'
    | 'password'
    | 'secret'
    | 'token'
    | 'private_key';
  pattern?: string;
  message?: string;
}

export class SecretDetectionError extends Error {
  constructor(
    message: string,
    public secretType: string,
    public pattern: string
  ) {
    super(message);
    this.name = 'SecretDetectionError';
  }
}

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

const SECRET_PATTERNS = {
  apiKey:
    /(?:api[_-]?key|apikey|aws_access_key_id)\s*[:=]\s*['"]?(?:[a-z0-9_-]{3,}|AKIA[0-9A-Z]{16})['"]?|AKIA[0-9A-Z]{16}/i,
  password: /(?:password|passwd|pass|pwd)\s*[:=]\s*['"]?[^\s'"]{3,}['"]?/i,
  secret:
    /(?:secret[_-]?key|client_secret|secret)\s*[:=]\s*['"]?[^\s'"]{3,}['"]?/i,
  token:
    /(?:token|auth[_-]?token|refresh_token|access_token)\s*[:=]\s*['"]?[a-z0-9_-]{3,}['"]?/i,
  privateKey:
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|private[_-]?key\s*[:=]/i,
} as const;

function isEnvFile(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename).toLowerCase();
  return (
    ext === '.env' || basename.startsWith('.env') || basename.endsWith('.env')
  );
}

function isBinaryContent(content: string | Buffer): boolean {
  if (Buffer.isBuffer(content)) {
    for (let i = 0; i < Math.min(content.length, 1024); i++) {
      const byte = content[i];
      if (byte === 0) {
        return true;
      }
    }
    return false;
  }
  if (typeof content !== 'string') {
    return true;
  }
  if (content.includes('\0')) {
    return true;
  }
  return false;
}

function scanForSecretPatterns(content: string): SecretDetectionResult {
  const patternEntries = Object.entries(SECRET_PATTERNS) as [
    keyof typeof SECRET_PATTERNS,
    RegExp,
  ][];

  for (const [secretType, pattern] of patternEntries) {
    const match = content.match(pattern);
    if (match) {
      // Map secretType to snake_case and derive pattern name
      const mappedSecretType =
        secretType === 'apiKey'
          ? 'api_key'
          : secretType === 'password'
            ? 'password'
            : secretType === 'privateKey'
              ? 'private_key'
              : secretType;

      // Use pattern type name instead of actual matched content to avoid leaking secrets
      const patternName =
        mappedSecretType === 'api_key'
          ? 'API_KEY='
          : mappedSecretType === 'password'
            ? 'PASSWORD='
            : mappedSecretType === 'secret'
              ? 'SECRET='
              : mappedSecretType === 'token'
                ? 'TOKEN='
                : mappedSecretType === 'private_key'
                  ? 'PRIVATE_KEY='
                  : 'SECRET_PATTERN';

      return {
        detected: true,
        secretType: mappedSecretType,
        pattern: patternName,
        message: `File rejected: ${secretType
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase()} pattern detected. Remove sensitive credentials before upload.`,
      };
    }
  }

  return { detected: false };
}

export function detectSecretPatterns(
  content: string | Buffer,
  filename: string
): SecretDetectionResult {
  if (!content || !filename) {
    return { detected: false };
  }

  if (typeof filename !== 'string') {
    return { detected: false };
  }

  if (isEnvFile(filename)) {
    return {
      detected: true,
      secretType: 'env_file',
      pattern: '.env',
      message:
        'File rejected: .env file detected. Environment files may contain secrets.',
    };
  }

  if (isBinaryContent(content)) {
    return { detected: false };
  }

  const textContent =
    typeof content === 'string' ? content : content.toString();

  return scanForSecretPatterns(textContent);
}
