#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import path from 'path';
import fs from 'fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { uploadFile, UploadOptions, DownloadOptions } from './httpClient.js';
import {
  getUserSandbox,
  validateFilename,
  ensureUserSandbox,
  resolveInUserSandbox,
  resolveSandboxPath,
  logSandboxOperation,
  TMP_MAX_READ_SIZE,
  cleanupOldSandboxes,
  isSandboxLocked,
  acquireSandboxLock,
  releaseSandboxLock,
} from './sandboxUtils.js';

// Re-export sandbox functions for backward compatibility
export {
  getUserSandbox,
  validateFilename,
  ensureUserSandbox,
  resolveInUserSandbox,
  resolveSandboxPath,
  logSandboxOperation,
  cleanupOldSandboxes,
  isSandboxLocked,
  acquireSandboxLock,
  releaseSandboxLock,
};

const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
const ZIPLINE_ENDPOINT =
  process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';

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

// Sandbox utilities are now in sandboxUtils.ts

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
              '• Verify the file path\n' +
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
      'Perform minimal file management in ~/.zipline_tmp or the sandbox. Allowed commands: PATH <filename>, LIST, CREATE <filename>, OPEN <filename>, READ <filename>. Only bare filenames allowed. CREATE overwrites existing files. PATH resolves to the absolute path and must be always used before uploads.',
    inputSchema: {
      command: z
        .string()
        .describe(
          'Command: PATH <filename>, LIST, CREATE <filename>, OPEN <filename>, READ <filename>'
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
                  ? `Files in your sandbox, you can retrieve their full path with PATH <filename>:\n${fileList.join('\n')}`
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
      const filePath = resolveSandboxPath(filename);
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
      const filePath = resolveSandboxPath(filename);
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
              text: `✅ ${upperCmd}: ${filename}\nPath: ${resolveSandboxPath(filename)}\nSize: ${formatFileSize(stat.size)}\n\n${data}`,
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

    // PATH
    if (upperCmd === 'PATH') {
      if (argsArr.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ PATH refused: Filename is required.',
            },
          ],
          isError: true,
        };
      }
      const filename = argsArr[0]!;
      const err = validateFilename(filename);
      if (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ PATH refused: ${err}`,
            },
          ],
          isError: true,
        };
      }
      try {
        const filePath = resolveSandboxPath(filename);
        logSandboxOperation('FILE_PATH', filename);
        return {
          content: [
            {
              type: 'text',
              text: `✅ PATH: ${filename}\nAbsolute path: ${filePath}`,
            },
          ],
        };
      } catch (e) {
        logSandboxOperation(
          'FILE_PATH_FAILED',
          filename,
          `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `❌ PATH failed: ${(e as Error).message}`,
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
            '  READ <filename>\n' +
            '  PATH <filename>\n\n' +
            'Filenames must not include path separators, dot segments, or be empty. Only bare filenames in your sandbox are allowed.',
        },
      ],
      isError: true,
    };
  }
);

// Register download_external_url tool: download a remote file into the user sandbox and return absolute path
server.registerTool(
  'download_external_url',
  {
    title: 'Download External URL',
    description:
      'Download an external HTTP(S) URL into the user sandbox and return the absolute filesystem path',
    inputSchema: {
      url: z.string().describe('HTTP or HTTPS URL to download'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Timeout in milliseconds (optional)'),
      maxFileSizeBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max allowed file size in bytes (optional)'),
    },
  },
  async (args: unknown) => {
    // Validate and coerce incoming args safely (avoid using `any`)
    const a = args as Record<string, unknown>;
    const urlVal = typeof a.url === 'string' ? a.url : undefined;
    const timeoutMs = typeof a.timeoutMs === 'number' ? a.timeoutMs : 30_000;
    const maxFileSizeBytes =
      typeof a.maxFileSizeBytes === 'number' ? a.maxFileSizeBytes : undefined;
    try {
      if (!urlVal || !isValidUrl(urlVal)) {
        throw new Error('Invalid URL');
      }

      // Import downloader
      const { downloadExternalUrl } = await import('./httpClient.js');

      const opts: DownloadOptions = { timeout: timeoutMs };
      if (typeof maxFileSizeBytes === 'number')
        opts.maxFileSizeBytes = maxFileSizeBytes;
      const pathResult = await downloadExternalUrl(urlVal, opts);

      return {
        content: [
          {
            type: 'text',
            text: `✅ DOWNLOAD COMPLETE\n\nLocal path: ${pathResult}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Download failed: ${message}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ DOWNLOAD FAILED\n\nError: ${message}`,
          },
        ],
        isError: true,
      };
    }
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
