#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { uploadFile, UploadOptions } from './httpClient.js';

const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
const ZIPLINE_ENDPOINT =
  process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';
const ZIPLINE_DISABLE_SANDBOXING =
  process.env.ZIPLINE_DISABLE_SANDBOXING === 'true';

if (!ZIPLINE_TOKEN) {
  throw new Error('Environment variable ZIPLINE_TOKEN is required.');
}

export const RELEASE_VERSION = '1.1.1';
const server = new McpServer({
  name: 'zipline-upload-server',
  version: RELEASE_VERSION,
});

// Helper function to validate URLs
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format validation and normalization
const ALLOWED_FORMATS = [
  'random',
  'uuid',
  'date',
  'name',
  'gfycat',
  'random-words',
] as const;
type FormatType = (typeof ALLOWED_FORMATS)[number];

const ALLOWED_EXTENSIONS = [
  '.txt',
  '.md',
  '.gpx',
  '.html',
  '.htm',
  '.json',
  '.xml',
  '.csv',
  '.js',
  '.ts',
  '.css',
  '.py',
  '.sh',
  '.yaml',
  '.yml',
  '.toml',
  // Common video files
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  // Common web image types
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

function normalizeFormat(format: string): FormatType | null {
  const lower = format.toLowerCase();

  // Handle alias: gfycat -> random-words
  if (lower === 'gfycat') {
    return 'random-words';
  }

  // Check if format is allowed
  if (ALLOWED_FORMATS.includes(lower as FormatType)) {
    return lower as FormatType;
  }

  return null;
}

// --- TMP FILE MANAGER SANDBOX HELPERS ---

const TMP_DIR = path.join(os.homedir(), '.zipline_tmp');
const TMP_MAX_READ_SIZE = 1024 * 1024; // 1 MB

// Import crypto for token hashing
import { createHash } from 'crypto';

// Security logging function for sandbox operations
function logSandboxOperation(
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
  if (!ZIPLINE_TOKEN) {
    throw new Error('ZIPLINE_TOKEN is required for sandbox functionality');
  }

  // If sandboxing is disabled, use the shared TMP_DIR
  if (ZIPLINE_DISABLE_SANDBOXING) {
    return TMP_DIR;
  }

  // Create SHA-256 hash of the token for user identification
  const tokenHash = createHash('sha256').update(ZIPLINE_TOKEN).digest('hex');
  return path.join(TMP_DIR, 'users', tokenHash);
}

function validateFilename(filename: string): string | null {
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
async function ensureUserSandbox(): Promise<string> {
  const userSandbox = getUserSandbox();
  try {
    await fs.mkdir(userSandbox, { recursive: true, mode: 0o700 });
  } catch {
    // Ignore if already exists
  }
  return userSandbox;
}

// Resolve filename within user sandbox
function resolveInUserSandbox(filename: string): string {
  const userSandbox = getUserSandbox();
  return path.join(userSandbox, filename);
}

// Clean up sandboxes older than 24 hours
export async function cleanupOldSandboxes(): Promise<number> {
  // Skip cleanup if sandboxing is disabled
  if (ZIPLINE_DISABLE_SANDBOXING) {
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

// Session-based locking mechanism
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const LOCK_FILE = '.lock';

interface LockData {
  timestamp: number;
  token: string;
}

// Check if a sandbox is locked
export async function isSandboxLocked(): Promise<boolean> {
  // Skip locking if sandboxing is disabled
  if (ZIPLINE_DISABLE_SANDBOXING) {
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
  if (ZIPLINE_DISABLE_SANDBOXING) {
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
      token: ZIPLINE_TOKEN || 'unknown',
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
  if (ZIPLINE_DISABLE_SANDBOXING) {
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
      if (lockData.token === ZIPLINE_TOKEN) {
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

const uploadFileInputSchema = {
  filePath: z
    .string()
    .describe('Path to the file to upload (txt, md, gpx, html, etc.)'),
  format: z
    .enum(ALLOWED_FORMATS)
    .optional()
    .describe('Filename format (default: random)'),
  deletesAt: z
    .string()
    .optional()
    .describe(
      'File expiration time (e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")'
    ),
  password: z
    .string()
    .optional()
    .describe('Password protection for the uploaded file'),
  maxViews: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Maximum number of views before file removal (≥ 0)'),
  folder: z
    .string()
    .optional()
    .describe('Target folder ID (alphanumeric, must exist)'),
};

server.registerTool(
  'upload_file_to_zipline',
  {
    title: 'Upload File to Zipline',
    description: 'Upload a file to Zipline server and get the download URL',
    inputSchema: uploadFileInputSchema,
  },
  async ({
    filePath,
    format = 'random',
    deletesAt = undefined,
    password = undefined,
    maxViews = undefined,
    folder = undefined,
  }: {
    filePath: string;
    format?: FormatType | undefined;
    deletesAt?: string | undefined;
    password?: string | undefined;
    maxViews?: number | undefined;
    folder?: string | undefined;
  }) => {
    try {
      // Validate and normalize format
      const normalizedFormat = normalizeFormat(format || 'random');
      if (!normalizedFormat) {
        throw new Error(`Invalid format: ${format}`);
      }

      // Validate file exists and is accessible
      const fileContent = await readFile(filePath);
      const fileSize = fileContent.length;

      // Get file extension for validation
      const fileExt = path.extname(filePath).toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        throw new Error(
          `File type ${fileExt} not supported. Supported types: ${ALLOWED_EXTENSIONS.join(
            ', '
          )}`
        );
      }

      console.error(`Executing upload for: ${path.basename(filePath)}`);

      const uploadOptions: UploadOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        filePath,
        format: normalizedFormat,
        password,
        maxViews,
        folder,
        deletesAt,
      };

      const url = await uploadFile(uploadOptions);

      // Validate that the URL is properly formatted
      if (!isValidUrl(url)) {
        throw new Error(`Invalid URL format returned: ${url}`);
      }

      console.error(`Upload successful. URL: ${url}`);

      const formattedSize = formatFileSize(fileSize);
      const fileName = path.basename(filePath);

      if (fileExt === '.md') {
        const viewUrl = url.replace('/u/', '/view/');
        console.error(`View URL: ${viewUrl}`);
        return {
          content: [
            {
              type: 'text',
              text:
                '✅ FILE UPLOADED SUCCESSFULLY!\n\n' +
                `📁 File: ${fileName}\n` +
                `📊 Size: ${formattedSize}\n` +
                `🏷️  Format: ${format}\n` +
                `🔗 DOWNLOAD URL: ${url}\n` +
                `🔗 VIEW URL: ${viewUrl}\n\n` +
                '─────────────────────────────\n' +
                '💡 You can now share this URL or click it to download the file.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              '✅ FILE UPLOADED SUCCESSFULLY!\n\n' +
              `📁 File: ${fileName}\n` +
              `📊 Size: ${formattedSize}\n` +
              `🏷️  Format: ${format}\n` +
              `🔗 DOWNLOAD URL: ${url}\n\n` +
              '─────────────────────────────\n' +
              '💡 You can now share this URL or click it to download the file.',
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`Upload failed: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text',
            text:
              `❌ UPLOAD FAILED!\n\nError: ${errorMessage}\n\n` +
              'Possible solutions:\n' +
              '• Check if the file exists and is accessible\n' +
              '• Verify your authorization token is correct\n' +
              '• Ensure the server https://files.etereo.cloud is reachable\n' +
              '• Confirm the file type is supported',
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'validate_file',
  {
    title: 'Validate File',
    description: 'Check if a file exists and is suitable for upload',
    inputSchema: {
      filePath: z.string().describe('Path to the file to validate'),
    },
  },
  async ({ filePath }: { filePath: string }) => {
    try {
      const fileContent = await readFile(filePath);
      const content = fileContent.toString();
      const fileSize = Buffer.byteLength(content, 'utf-8');
      const fileExt = path.extname(filePath).toLowerCase();

      const isSupported = ALLOWED_EXTENSIONS.includes(fileExt);

      const formattedSize = formatFileSize(fileSize);
      const fileName = path.basename(filePath);

      return {
        content: [
          {
            type: 'text',
            text:
              '📋 FILE VALIDATION REPORT\n\n' +
              `📁 File: ${fileName}\n` +
              `📍 Path: ${filePath}\n` +
              `📊 Size: ${formattedSize}\n` +
              `🏷️  Extension: ${fileExt || 'none'}\n` +
              `✅ Supported: ${isSupported ? 'Yes' : 'No'}\n\n` +
              `Status: ${
                isSupported
                  ? '🟢 Ready for upload'
                  : '🔴 File type not supported'
              }\n\n` +
              `Supported formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text:
              `❌ FILE VALIDATION FAILED!\n\nError: ${errorMessage}\n\n` +
              'Please check:\n' +
              '• File path is correct\n' +
              '• File exists and is readable\n' +
              '• You have proper permissions',
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'tmp_file_manager',
  {
    title: 'Minimal Temporary File Manager',
    description:
      'Perform minimal file management in ~/.zipline_tmp. Allowed commands: LIST, CREATE <filename>, OPEN <filename>, READ <filename>. Only bare filenames allowed. CREATE overwrites existing files.',
    inputSchema: {
      command: z
        .string()
        .describe(
          'Command: LIST, CREATE <filename>, OPEN <filename>, READ <filename>'
        ),
      content: z
        .string()
        .optional()
        .describe('File content for CREATE (optional)'),
    },
  },
  async (args: { command: string; content?: string | undefined }) => {
    const userSandbox = await ensureUserSandbox();
    const { command, content } = args;
    if (!command || typeof command !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Command is required.',
          },
        ],
        isError: true,
      };
    }
    const trimmed = command.trim();
    const [cmd, ...argsArr] = trimmed.split(/\s+/);
    if (!cmd) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Command is required.',
          },
        ],
        isError: true,
      };
    }
    const upperCmd = cmd.toUpperCase();

    // LIST
    if (upperCmd === 'LIST') {
      try {
        const files = await fs.readdir(userSandbox, { withFileTypes: true });
        const fileList = files.filter((f) => f.isFile()).map((f) => f.name);
        logSandboxOperation(
          'FILE_LIST',
          undefined,
          `Files: ${fileList.length}`
        );
        return {
          content: [
            {
              type: 'text',
              text:
                fileList.length > 0
                  ? `Files in your sandbox:\n${fileList.join('\n')}`
                  : 'No files found in your sandbox.',
            },
          ],
        };
      } catch (e) {
        logSandboxOperation(
          'FILE_LIST_FAILED',
          undefined,
          `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `❌ LIST failed: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    // CREATE
    if (upperCmd === 'CREATE' && argsArr.length === 1) {
      const filename = argsArr[0];
      if (!filename) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ CREATE refused: Filename is required.',
            },
          ],
          isError: true,
        };
      }
      const err = validateFilename(filename);
      if (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ CREATE refused: ${err}`,
            },
          ],
          isError: true,
        };
      }
      const filePath = resolveInUserSandbox(filename);
      try {
        await fs.writeFile(filePath, content ?? '', { encoding: 'utf8' });
        const stat = await fs.stat(filePath);
        logSandboxOperation(
          'FILE_CREATED',
          filename,
          `Size: ${formatFileSize(stat.size)}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created/Overwritten: ${filename}\nSize: ${formatFileSize(stat.size)}`,
            },
          ],
        };
      } catch (e) {
        logSandboxOperation(
          'FILE_CREATE_FAILED',
          filename,
          `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `❌ CREATE failed: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    // OPEN/READ
    if ((upperCmd === 'OPEN' || upperCmd === 'READ') && argsArr.length === 1) {
      const filename = argsArr[0];
      if (!filename) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${upperCmd} refused: Filename is required.`,
            },
          ],
          isError: true,
        };
      }
      const err = validateFilename(filename);
      if (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${upperCmd} refused: ${err}`,
            },
          ],
          isError: true,
        };
      }
      const filePath = resolveInUserSandbox(filename);
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > TMP_MAX_READ_SIZE) {
          logSandboxOperation(
            'FILE_READ_FAILED',
            filename,
            `Reason: File too large (${formatFileSize(stat.size)})`
          );
          return {
            content: [
              {
                type: 'text',
                text: `❌ ${upperCmd} refused: File too large (${formatFileSize(stat.size)}). Max allowed: ${formatFileSize(TMP_MAX_READ_SIZE)}.`,
              },
            ],
            isError: true,
          };
        }
        const data = await fs.readFile(filePath, { encoding: 'utf8' });
        logSandboxOperation(
          'FILE_READ',
          filename,
          `Size: ${formatFileSize(stat.size)}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `✅ ${upperCmd}: ${filename}\nSize: ${formatFileSize(stat.size)}\n\n${data}`,
            },
          ],
        };
      } catch (e) {
        logSandboxOperation(
          'FILE_READ_FAILED',
          filename,
          `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${upperCmd} failed: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Invalid command or usage
    return {
      content: [
        {
          type: 'text',
          text:
            '❌ Invalid command.\n\nUsage:\n' +
            '  LIST\n' +
            '  CREATE <filename> (with optional content)\n' +
            '  OPEN <filename>\n' +
            '  READ <filename>\n\n' +
            'Filenames must not include path separators, dot segments, or be empty. Only bare filenames in your sandbox are allowed.',
        },
      ],
      isError: true,
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { server };

main().catch((error) => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});
