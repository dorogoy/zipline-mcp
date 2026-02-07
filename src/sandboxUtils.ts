import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import {
  sanitizePath as sanitizePathUtil,
  SandboxPathError,
} from './utils/security';

// Re-export SandboxPathError for backward compatibility
export { SandboxPathError };

// Constants
export const TMP_DIR = path.join(os.homedir(), '.zipline_tmp');
export const TMP_MAX_READ_SIZE = 1024 * 1024; // 1 MB
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const LOCK_FILE = '.lock';

// Helper function to get environment variables dynamically
function getZiplineToken(): string {
  return process.env.ZIPLINE_TOKEN || '';
}

function isSandboxingDisabled(): boolean {
  return process.env.ZIPLINE_DISABLE_SANDBOXING === 'true';
}

// Interface for lock data
interface LockData {
  timestamp: number;
  token: string;
}

// Security logging function for sandbox operations
export function logSandboxOperation(
  operation: string,
  filename?: string,
  details?: string
): void {
  const timestamp = new Date().toISOString();
  const userSandboxPath = getUserSandbox();
  const sanitizedPath = userSandboxPath.replace(
    /\/users\/[^/]+$/,
    '/users/[HASH]'
  );

  const logMessage = `[${timestamp}] SANDBOX_OPERATION: ${operation}${filename ? ` - ${filename}` : ''} - Path: ${sanitizedPath}${details ? ` - ${details}` : ''}`;

  // Use console.error for security logs to separate from regular output
  console.error(logMessage);
}

// Get user sandbox directory based on ZIPLINE_TOKEN hash
export function getUserSandbox(): string {
  const token = getZiplineToken();
  if (!token) {
    throw new Error('ZIPLINE_TOKEN is required for sandbox functionality');
  }

  // If sandboxing is disabled, use the shared TMP_DIR
  if (isSandboxingDisabled()) {
    return TMP_DIR;
  }

  // Create SHA-256 hash of the token for user identification
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return path.join(TMP_DIR, 'users', tokenHash);
}

/**
 * Validate filename for sandbox operations
 * @deprecated Use sanitizePath() from './utils/security.ts' for enhanced security validation.
 * This function remains for backward compatibility with existing code that validates bare filenames.
 * For path validation with directory support, use sanitizePath() instead.
 */
export function validateFilename(filename: string): string | null {
  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    filename.startsWith('.') ||
    path.isAbsolute(filename)
  ) {
    return 'Filenames must not include path separators, dot segments, or be empty. Only bare filenames in ~/.zipline_tmp are allowed.';
  }
  return null;
}

// Ensure user sandbox directory exists
export async function ensureUserSandbox(): Promise<string> {
  const userSandbox = getUserSandbox();
  try {
    await fs.mkdir(userSandbox, { recursive: true, mode: 0o700 });
  } catch {
    // Ignore if already exists
  }
  return userSandbox;
}

/**
 * Resolve filename within user sandbox (without validation)
 * @deprecated For security-sensitive operations, use resolveSandboxPath() instead,
 * which includes comprehensive path sanitization and validation.
 * This function performs a simple path.join() without security checks.
 */
export function resolveInUserSandbox(filename: string): string {
  const userSandbox = getUserSandbox();
  return path.join(userSandbox, filename);
}

// Resolve sandbox path with security checks
export function resolveSandboxPath(filename: string): string {
  const userSandbox = getUserSandbox();

  // Use new sanitization utility for enhanced security
  return sanitizePathUtil(filename, userSandbox);
}

// Clean up sandboxes older than 24 hours
export async function cleanupOldSandboxes(): Promise<number> {
  // Skip cleanup if sandboxing is disabled
  if (isSandboxingDisabled()) {
    return 0;
  }

  const usersDir = path.join(TMP_DIR, 'users');
  let cleanedCount = 0;

  try {
    // Check if users directory exists
    const userDirs = await fs.readdir(usersDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    for (const userDir of userDirs) {
      const userDirPath = path.join(usersDir, userDir);

      try {
        const stats = await fs.stat(userDirPath);

        // Check if it's a directory and older than 24 hours
        if (stats.isDirectory() && now - stats.mtime.getTime() > maxAge) {
          try {
            await fs.rm(userDirPath, { recursive: true, force: true });
            cleanedCount++;
            logSandboxOperation(
              'SANDBOX_CLEANED',
              undefined,
              `Age: ${Math.round((now - stats.mtime.getTime()) / (60 * 60 * 1000))} hours`
            );
          } catch (cleanupError) {
            logSandboxOperation(
              'SANDBOX_CLEANUP_FAILED',
              undefined,
              `Error: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`
            );
            // Continue with other directories even if one fails
          }
        }
      } catch (statError) {
        logSandboxOperation(
          'SANDBOX_STAT_FAILED',
          undefined,
          `Error: ${statError instanceof Error ? statError.message : 'Unknown error'}`
        );
        // Continue with other directories
      }
    }
  } catch (readdirError) {
    // If users directory doesn't exist, that's fine - nothing to clean
    if (
      readdirError instanceof Error &&
      'code' in readdirError &&
      readdirError.code !== 'ENOENT'
    ) {
      logSandboxOperation(
        'SANDBOX_CLEANUP_ERROR',
        undefined,
        `Error: ${readdirError instanceof Error ? readdirError.message : 'Unknown error'}`
      );
    }
  }

  return cleanedCount;
}

// Check if a sandbox is locked
export async function isSandboxLocked(): Promise<boolean> {
  // Skip locking if sandboxing is disabled
  if (isSandboxingDisabled()) {
    return false;
  }

  const userSandbox = getUserSandbox();
  const lockFilePath = path.join(userSandbox, LOCK_FILE);

  try {
    await fs.stat(lockFilePath);

    // Check if lock has expired
    try {
      const lockDataStr = await fs.readFile(lockFilePath, { encoding: 'utf8' });
      const lockData: LockData = JSON.parse(lockDataStr) as LockData;

      // If lock is older than timeout, consider it expired
      if (Date.now() - lockData.timestamp > LOCK_TIMEOUT) {
        await fs.rm(lockFilePath, { force: true });
        return false;
      }

      return true;
    } catch {
      // If we can't read or parse the lock file, assume it's invalid and remove it
      await fs.rm(lockFilePath, { force: true });
      return false;
    }
  } catch {
    // If lock file doesn't exist, sandbox is not locked
    return false;
  }
}

// Acquire a lock for a user sandbox
export async function acquireSandboxLock(): Promise<boolean> {
  // Skip locking if sandboxing is disabled
  if (isSandboxingDisabled()) {
    return true;
  }

  const userSandbox = getUserSandbox();
  const lockFilePath = path.join(userSandbox, LOCK_FILE);

  // First check if sandbox is already locked
  if (await isSandboxLocked()) {
    logSandboxOperation(
      'LOCK_ACQUIRE_FAILED',
      undefined,
      'Reason: Already locked'
    );
    return false;
  }

  try {
    // Create lock file with timestamp and token
    const lockData: LockData = {
      timestamp: Date.now(),
      token: getZiplineToken() || 'unknown',
    };

    await fs.writeFile(lockFilePath, JSON.stringify(lockData), {
      encoding: 'utf8',
    });
    logSandboxOperation(
      'LOCK_ACQUIRED',
      undefined,
      `Timeout: ${LOCK_TIMEOUT / 1000 / 60} minutes`
    );

    // Set up automatic lock release after timeout
    setTimeout(() => {
      void (async () => {
        try {
          const stillLocked = await isSandboxLocked();
          if (stillLocked) {
            // Read the lock file to check if it's our lock
            try {
              const lockDataStr = await fs.readFile(lockFilePath, {
                encoding: 'utf8',
              });
              const currentLockData: LockData = JSON.parse(
                lockDataStr
              ) as LockData;

              // Only release if it's our lock (same token)
              if (currentLockData.token === lockData.token) {
                await fs.rm(lockFilePath, { force: true });
                logSandboxOperation(
                  'LOCK_AUTO_RELEASED',
                  undefined,
                  'Reason: Timeout expired'
                );
              }
            } catch {
              // If we can't read the lock file, just remove it
              await fs.rm(lockFilePath, { force: true });
              logSandboxOperation(
                'LOCK_AUTO_RELEASED',
                undefined,
                'Reason: Lock file corrupted'
              );
            }
          }
        } catch (error) {
          logSandboxOperation(
            'LOCK_RELEASE_ERROR',
            undefined,
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      })();
    }, LOCK_TIMEOUT);

    return true;
  } catch {
    // If we can't write the lock file, assume someone else acquired it first
    logSandboxOperation(
      'LOCK_ACQUIRE_FAILED',
      undefined,
      'Reason: Could not write lock file'
    );
    return false;
  }
}

// Release a lock for a user sandbox
export async function releaseSandboxLock(): Promise<boolean> {
  // Skip locking if sandboxing is disabled
  if (isSandboxingDisabled()) {
    return true;
  }

  const userSandbox = getUserSandbox();
  const lockFilePath = path.join(userSandbox, LOCK_FILE);

  try {
    // Check if lock exists and belongs to us
    try {
      const lockDataStr = await fs.readFile(lockFilePath, { encoding: 'utf8' });
      const lockData: LockData = JSON.parse(lockDataStr) as LockData;

      // Only release if it's our lock (same token)
      if (lockData.token === getZiplineToken()) {
        await fs.rm(lockFilePath, { force: true });
        logSandboxOperation(
          'LOCK_RELEASED',
          undefined,
          'Reason: Manual release'
        );
      } else {
        logSandboxOperation(
          'LOCK_RELEASE_FAILED',
          undefined,
          'Reason: Token mismatch'
        );
      }
    } catch {
      // If we can't read the lock file, just remove it
      await fs.rm(lockFilePath, { force: true });
      logSandboxOperation(
        'LOCK_RELEASED',
        undefined,
        'Reason: Lock file corrupted'
      );
    }

    return true;
  } catch {
    // If lock file doesn't exist, that's fine - it's not locked
    logSandboxOperation(
      'LOCK_RELEASE_NOT_NEEDED',
      undefined,
      'Reason: No lock file exists'
    );
    return true;
  }
}
