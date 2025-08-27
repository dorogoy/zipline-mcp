#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import path from 'path';
import fs from 'fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { uploadFile, UploadOptions, DownloadOptions } from './httpClient.js';
import {
  listUserFiles,
  ListUserFilesOptions,
  getUserFile,
  GetUserFileOptions,
  updateUserFile,
  UpdateUserFileOptions,
  deleteUserFile,
  DeleteUserFileOptions,
  normalizeUrl,
} from './userFiles.js';
import { listFolders, createFolder } from './remoteFolders.js';
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

export const RELEASE_VERSION = '1.7.0';
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

const DEFAULT_ALLOWED_EXTENSIONS = [
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
  '.pdf',
  '.zip',
  // Microsoft Office formats
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // LibreOffice/OpenDocument formats
  '.odt',
  '.ods',
  '.odp',
  '.odg',
  // Common video files
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  '.flv',
  '.mov',
  // Common web image types
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

// Allow override of allowed extensions via environment variable (comma-separated, e.g. ".txt,.md,.pdf")
const ALLOWED_EXTENSIONS = process.env.ALLOWED_EXTENSIONS
  ? process.env.ALLOWED_EXTENSIONS.split(',').map((ext) =>
      ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
    )
  : DEFAULT_ALLOWED_EXTENSIONS;

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
  originalName: z
    .string()
    .optional()
    .describe('Original filename to preserve during download'),
};

server.registerTool(
  'upload_file_to_zipline',
  {
    title: 'Upload File to Zipline',
    description:
      'Upload a file to the Zipline server with advanced options and retrieve the download URL. ' +
      'Prerequisites: Depends on validate_file (recommended for pre-validation). Can use files from tmp_file_manager or download_external_url. Can use folder IDs from remote_folder_manager. Requires Zipline authentication. ' +
      'Usage: upload_file_to_zipline { "filePath": "/path/to/file.txt", "format": "random", "deletesAt": "1d", "password": "secret", "maxViews": 10, "folder": "folder123", "originalName": "original.txt" } ' +
      'Data Contracts: Input: { filePath: string, format?: string, deletesAt?: string, password?: string, maxViews?: number, folder?: string, originalName?: string }, Output: Text content with URLs and file information. ' +
      'Format types: random, uuid, date, name, random-words. Supported file types: Various including text, images, documents, videos. ' +
      'Error Handling: Common failures: File validation errors, upload failures, authentication issues, invalid parameters. Recovery: Validate file first, check Zipline server accessibility, verify parameters.',
    inputSchema: uploadFileInputSchema, // Schema already defined separately
  },
  async ({
    filePath,
    format = 'random',
    deletesAt = undefined,
    password = undefined,
    maxViews = undefined,
    folder = undefined,
    originalName = undefined,
  }: {
    filePath: string;
    format?: FormatType | undefined;
    deletesAt?: string | undefined;
    password?: string | undefined;
    maxViews?: number | undefined;
    folder?: string | undefined;
    originalName?: string | undefined;
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
        originalName,
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
    description:
      'Validate if a file exists and is suitable for upload to Zipline by checking file existence, readability, and supported file types. ' +
      'Prerequisites: No dependencies on other tools. Must be run before upload_file_to_zipline to ensure file compatibility. ' +
      'Usage: validate_file { "filePath": "/absolute/path/to/file.txt" } ' +
      'Data Contracts: Input: { filePath: string }, Output: Text content with validation report. ' +
      'Supported file extensions: .txt, .md, .gpx, .html, .htm, .json, .xml, .csv, .js, .ts, .css, .py, .sh, .yaml, .yml, .toml, .pdf, .zip, Microsoft Office formats, LibreOffice formats, common video files, and web image types. ' +
      'Error Handling: Common failures include file not found, permission denied, path errors. Recovery: Check file path, verify permissions, ensure file exists.',
    inputSchema: {
      filePath: z.string().describe('Absolute path to the file to validate.'),
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
      'Perform basic file management operations in a secure, per-user sandbox environment for temporary files. ' +
      'Prerequisites: No dependencies on other tools. Creates files that can be used with upload_file_to_zipline. ' +
      'Usage: tmp_file_manager { "command": "LIST" } or with CREATE: { "command": "CREATE filename.txt", "content": "file content here" } ' +
      'Supported commands: LIST, CREATE <filename>, READ <filename>, PATH <filename>, DELETE <filename>. ' +
      'Data Contracts: Input: { command: string, content?: string }, Output: Text content with operation results. ' +
      'File size limits: 1MB max for READ operations. Filename validation: No path separators, no dot segments, bare filenames only. ' +
      'Error Handling: Common failures: Invalid command, filename validation errors, file too large, file not found. Recovery: Use valid commands, check filename rules, use smaller files.',
    inputSchema: {
      command: z
        .string()
        .describe(
          'Command to execute. Supported commands: PATH <filename>, LIST, CREATE <filename>, OPEN <filename>, READ <filename>, DELETE <filename>. Only bare filenames are allowed.'
        ),
      content: z
        .string()
        .optional()
        .describe('Optional content for the CREATE command.'),
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
                  ? `Files in your sandbox:\n${fileList.map((f) => `${resolveSandboxPath(f)}`).join('\n')}`
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
              text: `✅ Created/Overwritten: ${filename}\nPath: ${filePath}\nSize: ${formatFileSize(stat.size)}`,
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

    // DELETE
    if (upperCmd === 'DELETE') {
      if (argsArr.length !== 1) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ DELETE refused: Filename is required.',
            },
          ],
          isError: true,
        };
      }
      const filename = argsArr[0];
      if (!filename) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ DELETE refused: Filename is required.',
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
              text: `❌ DELETE refused: ${err}`,
            },
          ],
          isError: true,
        };
      }
      const filePath = resolveSandboxPath(filename);
      try {
        await fs.unlink(filePath);
        logSandboxOperation('FILE_DELETED', filename);
        return {
          content: [
            {
              type: 'text',
              text: `✅ DELETE: ${filename}\nPath: ${filePath}\nFile deleted successfully`,
            },
          ],
        };
      } catch (e) {
        logSandboxOperation(
          'FILE_DELETE_FAILED',
          filename,
          `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `❌ DELETE failed: ${filename}\nError: ${(e as Error).message}`,
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
            '  PATH <filename>\n' +
            '  DELETE <filename>\n\n' +
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
      "Download a file from an external HTTP(S) URL into the user's sandbox and return the local path. " +
      'Prerequisites: No dependencies on other tools. Output file can be used with validate_file and upload_file_to_zipline. Requires internet access. ' +
      'Usage: download_external_url { "url": "https://example.com/file.pdf", "timeoutMs": 30000, "maxFileSizeBytes": 104857600 } ' +
      'Data Contracts: Input: { url: string, timeoutMs?: number, maxFileSizeBytes?: number }, Output: Text content with local file path. ' +
      'File size limit: 100MB default maximum. URL validation: Must be valid HTTP/HTTPS URL. ' +
      'Error Handling: Common failures: Invalid URL, network timeout, file too large, download failure. Recovery: Check URL validity, adjust timeout/size limits, verify network connectivity.',
    inputSchema: {
      url: z
        .string()
        .describe('The HTTP or HTTPS URL of the file to download.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Optional timeout in milliseconds for the download operation.'
        ),
      maxFileSizeBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional maximum allowed file size in bytes.'),
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

// Register list_user_files tool: list and search user files
server.registerTool(
  'list_user_files',
  {
    title: 'List User Files',
    description:
      'Retrieve and search files stored on the Zipline server with pagination, filtering, and sorting. ' +
      'Prerequisites: No dependencies on other tools. Provides file IDs for get_user_file, update_user_file, delete_user_file. Requires Zipline authentication. ' +
      'Usage: list_user_files { "page": 1, "perpage": 15, "filter": "dashboard", "favorite": true, "sortBy": "createdAt", "order": "desc", "searchField": "name", "searchQuery": "report" } ' +
      'Data Contracts: Input: { page: number, perpage?: number, filter?: string, favorite?: boolean, sortBy?: string, order?: string, searchField?: string, searchQuery?: string }, Output: Text content with formatted file list. ' +
      'URL normalization: Consistent URL formatting. File metadata includes: id, name, createdAt, size, type, views, maxViews, favorite, password, deletesAt, originalName, tags, folderId. ' +
      'Error Handling: Common failures: API errors, authentication issues, invalid parameters. Recovery: Check authentication, verify parameter values, ensure server accessibility.',
    inputSchema: {
      page: z
        .number()
        .int()
        .positive()
        .describe('The page number to retrieve (1-based).'),
      perpage: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('The number of files to display per page (default: 15).'),
      filter: z
        .enum(['dashboard', 'all', 'none'])
        .optional()
        .describe(
          'Filter files by type: dashboard (media/text), all, or none.'
        ),
      favorite: z
        .boolean()
        .optional()
        .describe('If true, only return files marked as favorite.'),
      sortBy: z
        .enum([
          'id',
          'createdAt',
          'updatedAt',
          'deletesAt',
          'name',
          'originalName',
          'size',
          'type',
          'views',
          'favorite',
        ])
        .optional()
        .describe('The field to sort files by (default: createdAt).'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .describe('The sort order: ascending (asc) or descending (desc).'),
      searchField: z
        .enum(['name', 'originalName', 'type', 'tags', 'id'])
        .optional()
        .describe('The field to search within (default: name).'),
      searchQuery: z
        .string()
        .optional()
        .describe('The search string to query files.'),
    },
  },
  async (args: unknown) => {
    const a = args as Record<string, unknown>;
    const page = typeof a.page === 'number' ? a.page : 1;
    const perpage = typeof a.perpage === 'number' ? a.perpage : undefined;
    const filter =
      typeof a.filter === 'string'
        ? (a.filter as 'dashboard' | 'all' | 'none')
        : undefined;
    const favorite = typeof a.favorite === 'boolean' ? a.favorite : undefined;
    const sortBy =
      typeof a.sortBy === 'string'
        ? (a.sortBy as
            | 'id'
            | 'createdAt'
            | 'updatedAt'
            | 'deletesAt'
            | 'name'
            | 'originalName'
            | 'size'
            | 'type'
            | 'views'
            | 'favorite')
        : undefined;
    const order =
      typeof a.order === 'string' ? (a.order as 'asc' | 'desc') : undefined;
    const searchField =
      typeof a.searchField === 'string'
        ? (a.searchField as 'name' | 'originalName' | 'type' | 'tags' | 'id')
        : undefined;
    const searchQuery =
      typeof a.searchQuery === 'string' ? a.searchQuery : undefined;

    try {
      const options: ListUserFilesOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        page,
        perpage,
        filter,
        favorite,
        sortBy,
        order,
        searchField,
        searchQuery,
      };

      const result = await listUserFiles(options);

      const fileList = result.page
        .map((file, index) => {
          const isFavorite = file.favorite ? '⭐' : '';
          const hasPassword = file.password ? '🔒' : '';
          const expires = file.deletesAt
            ? `⏰ ${new Date(file.deletesAt).toLocaleDateString()}`
            : '';

          return `${index + 1}. ${isFavorite}${hasPassword} ${file.name}
   🆔 ID: ${file.id}
   📅 Created: ${new Date(file.createdAt).toLocaleDateString()}
   📊 Size: ${formatFileSize(file.size)}
   🏷️ Type: ${file.type}
   👁️ Views: ${file.views}${file.maxViews ? `/${file.maxViews}` : ''}
   🔗 URL: ${normalizeUrl(ZIPLINE_ENDPOINT, file.url)} ${expires}`.trim();
        })
        .join('\n\n');

      const header = `📁 USER FILES (Page ${page}${result.total ? ` of ${result.pages}` : ''})\n\n`;
      const footer = result.total
        ? `\n\nTotal files: ${result.total} | Showing: ${result.page.length}`
        : '';

      let searchInfo = '';
      if (result.search) {
        searchInfo = `\n🔍 Search: ${result.search.field} = "${result.search.query}"\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: header + searchInfo + fileList + footer,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`List user files failed: ${message}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ LIST USER FILES FAILED\n\nError: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register get_user_file tool: get information about a specific file
server.registerTool(
  'get_user_file',
  {
    title: 'Get User File',
    description:
      'Retrieve detailed information about a specific file stored on the Zipline server. ' +
      'Prerequisites: Depends on list_user_files (to obtain file IDs) or user-provided file names. Requires file ID or name for lookup. Requires Zipline authentication. ' +
      'Usage: get_user_file { "id": "file123" } ' +
      'Data Contracts: Input: { id: string }, Output: Text content with comprehensive file details. URL normalization: Consistent URL formatting. ' +
      'Includes all metadata: id, name, createdAt, size, type, views, maxViews, favorite, password, deletesAt, originalName, tags, folderId. ' +
      'Error Handling: Common failures: File not found, invalid ID, API errors. Recovery: Verify file ID exists, use list_user_files to find correct ID, check authentication.',
    inputSchema: {
      id: z
        .string()
        .describe(
          'Obtain the name of the file from either the user or the list_user_files tool.'
        ),
    },
  },
  async (args: unknown) => {
    // Validate and coerce incoming args safely
    const a = args as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id : undefined;

    try {
      if (!id) {
        throw new Error('File ID is required');
      }

      const options: GetUserFileOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      };

      const file = await getUserFile(options);

      // Format the response for better readability
      const isFavorite = file.favorite ? '⭐' : '';
      const hasPassword = file.password ? '🔒' : '';
      const expires = file.deletesAt
        ? `⏰ ${new Date(file.deletesAt).toLocaleDateString()}`
        : '';

      let response =
        `📁 FILE INFORMATION\n\n` +
        `${isFavorite}${hasPassword} ${file.name}\n` +
        `🆔 ID: ${file.id}\n` +
        `📅 Created: ${new Date(file.createdAt).toLocaleDateString()}\n` +
        `📊 Size: ${formatFileSize(file.size)}\n` +
        `🏷️ Type: ${file.type}\n` +
        `👁️ Views: ${file.views}${file.maxViews ? `/${file.maxViews}` : ''}\n` +
        `🔗 URL: ${normalizeUrl(file.url + '/u', file.name)} ${expires}`.trim();

      if (file.originalName) {
        response += `\n📄 Original Name: ${file.originalName}`;
      }

      if (file.tags.length > 0) {
        response += `\n🏷️ Tags: ${file.tags.join(', ')}`;
      }

      if (file.folderId) {
        response += `\n📁 Folder ID: ${file.folderId}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Get user file failed: ${message}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ GET USER FILE FAILED\n\nError: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register update_user_file tool: update file properties
server.registerTool(
  'update_user_file',
  {
    title: 'Update User File',
    description:
      'Modify properties of a specific file stored on the Zipline server. ' +
      'Prerequisites: Depends on list_user_files or get_user_file (to obtain file ID). Requires exact file ID (not filename). Requires Zipline authentication. ' +
      'Usage: update_user_file { "id": "file123", "favorite": true, "maxViews": 5, "password": null, "originalName": "new_name.txt", "type": "text/plain", "tags": ["important", "report"], "name": "updated_name" } ' +
      'Data Contracts: Input: { id: string, favorite?: boolean, maxViews?: number, password?: string | null, originalName?: string, type?: string, tags?: string[], name?: string }, Output: Text content with updated file details (no URL fields). ' +
      'At least one update field must be provided. ' +
      'Error Handling: Common failures: Invalid ID, no update fields provided, API errors. Recovery: Ensure valid file ID, provide at least one update field, verify authentication.',
    inputSchema: {
      id: z
        .string()
        .describe(
          'The unique ID of the file to update. Only use the ID, the filename does not work.'
        ),
      favorite: z
        .boolean()
        .optional()
        .describe('Mark or unmark the file as a favorite.'),
      maxViews: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          'Set the maximum number of views allowed for the file (>= 0).'
        ),
      password: z
        .string()
        .nullable()
        .optional()
        .describe(
          'Set a password for the file or remove it by setting to null.'
        ),
      originalName: z
        .string()
        .optional()
        .describe('Update the original filename of the file.'),
      type: z.string().optional().describe('Update the MIME type of the file.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Set or update tags associated with the file.'),
      name: z.string().optional().describe('Rename the file.'),
    },
  },
  async (args: unknown) => {
    // Validate and coerce incoming args safely
    const a = args as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id : undefined;
    const favorite = typeof a.favorite === 'boolean' ? a.favorite : undefined;
    const maxViews = typeof a.maxViews === 'number' ? a.maxViews : undefined;
    const password =
      typeof a.password === 'string' || a.password === null
        ? a.password
        : undefined;
    const originalName =
      typeof a.originalName === 'string' ? a.originalName : undefined;
    const type = typeof a.type === 'string' ? a.type : undefined;
    const tags = Array.isArray(a.tags)
      ? a.tags
          .map((tag) => (typeof tag === 'string' ? tag : ''))
          .filter(Boolean)
      : undefined;
    const name = typeof a.name === 'string' ? a.name : undefined;

    try {
      if (!id) {
        throw new Error('File ID is required');
      }

      // Check that at least one field to update is provided
      const hasUpdateFields = [
        favorite,
        maxViews,
        password,
        originalName,
        type,
        tags,
        name,
      ].some((field) => field !== undefined);

      if (!hasUpdateFields) {
        throw new Error('At least one field to update is required');
      }

      // Only include properties that are not undefined
      const options: UpdateUserFileOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
        ...(favorite !== undefined && { favorite }),
        ...(maxViews !== undefined && { maxViews }),
        ...(password !== undefined && { password }),
        ...(originalName !== undefined && { originalName }),
        ...(type !== undefined && { type }),
        ...(tags !== undefined && { tags }),
        ...(name !== undefined && { name }),
      };

      const file = await updateUserFile(options);

      // Format the response for better readability
      const isFavorite = file.favorite ? '⭐' : '';
      const hasPassword = file.password ? '🔒' : '';
      const expires = file.deletesAt
        ? `⏰ ${new Date(file.deletesAt).toLocaleDateString()}`
        : '';

      let response =
        `✅ FILE UPDATED SUCCESSFULLY!\n\n` +
        `${isFavorite}${hasPassword} ${file.name}\n` +
        `🆔 ID: ${file.id}\n` +
        `📅 Created: ${new Date(file.createdAt).toLocaleDateString()}\n` +
        `📊 Size: ${formatFileSize(file.size)}\n` +
        `🏷️ Type: ${file.type}\n` +
        `👁️ Views: ${file.views}${file.maxViews ? `/${file.maxViews}` : ''} ${expires}`.trim();

      if (file.originalName) {
        response += `\n📄 Original Name: ${file.originalName}`;
      }

      if (file.tags.length > 0) {
        response += `\n🏷️ Tags: ${file.tags.join(', ')}`;
      }

      if (file.folderId) {
        response += `\n📁 Folder ID: ${file.folderId}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Update user file failed: ${message}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ UPDATE USER FILE FAILED\n\nError: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register delete_user_file tool: delete a file
server.registerTool(
  'delete_user_file',
  {
    title: 'Delete User File',
    description:
      'Remove a specific file from the Zipline server. ' +
      'Prerequisites: Depends on list_user_files or get_user_file (to obtain file ID). Requires exact file ID (not filename). Requires Zipline authentication. ' +
      'Usage: delete_user_file { "id": "file123" } ' +
      'Data Contracts: Input: { id: string }, Output: Text content with deleted file details (no URL fields). Permanent operation: Files cannot be recovered after deletion. ' +
      'Error Handling: Common failures: Invalid ID, file not found, API errors. Recovery: Verify file ID exists, confirm deletion intent, check authentication.',
    inputSchema: {
      id: z
        .string()
        .describe(
          'The unique ID of the file to delete. Only use the ID, the filename does not work.'
        ),
    },
  },
  async (args: unknown) => {
    // Validate and coerce incoming args safely
    const a = args as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id : undefined;

    try {
      if (!id) {
        throw new Error('File ID is required');
      }

      const options: DeleteUserFileOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      };

      const file = await deleteUserFile(options);

      // Format the response for better readability
      const isFavorite = file.favorite ? '⭐' : '';
      const hasPassword = file.password ? '🔒' : '';
      const expires = file.deletesAt
        ? `⏰ ${new Date(file.deletesAt).toLocaleDateString()}`
        : '';

      let response =
        `✅ FILE DELETED SUCCESSFULLY!\n\n` +
        `${isFavorite}${hasPassword} ${file.name}\n` +
        `🆔 ID: ${file.id}\n` +
        `📅 Created: ${new Date(file.createdAt).toLocaleDateString()}\n` +
        `📊 Size: ${formatFileSize(file.size)}\n` +
        `🏷️ Type: ${file.type}\n` +
        `👁️ Views: ${file.views}${file.maxViews ? `/${file.maxViews}` : ''} ${expires}`.trim();

      if (file.originalName) {
        response += `\n📄 Original Name: ${file.originalName}`;
      }

      if (file.tags.length > 0) {
        response += `\n🏷️ Tags: ${file.tags.join(', ')}`;
      }

      if (file.folderId) {
        response += `\n📁 Folder ID: ${file.folderId}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Delete user file failed: ${message}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ DELETE USER FILE FAILED\n\nError: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register remote_folder_manager tool: manage remote folders on Zipline
server.registerTool(
  'remote_folder_manager',
  {
    title: 'Remote Folder Manager',
    description:
      'Manage folders on the Zipline server (supports listing and creating folders). ' +
      'Prerequisites: No dependencies on other tools. Provides folder IDs for use with upload_file_to_zipline. Requires Zipline authentication. ' +
      'Usage: remote_folder_manager { "command": "LIST" } or remote_folder_manager { "command": "ADD", "name": "Folder Name", "isPublic": false, "files": [] } ' +
      'Data Contracts: Input: { command: string, name?: string, isPublic?: boolean, files?: string[] }, Output: Text content with folder list or creation result. Folder objects: { id?: string, name: string } (IDs may be missing). ' +
      'Error Handling: Common failures: Invalid command, API communication errors, validation errors. Recovery: Use valid commands, check authentication, verify server accessibility.',
    inputSchema: {
      command: z
        .string()
        .describe('Command to execute. Supported: LIST, ADD <name>'),
      name: z
        .string()
        .optional()
        .describe('Folder name (required for ADD command)'),
      isPublic: z
        .boolean()
        .optional()
        .describe(
          'Whether the folder is public (default: false, for ADD command)'
        ),
      files: z
        .array(z.string())
        .optional()
        .describe(
          'Array of file IDs to include in the folder (for ADD command)'
        ),
    },
  },
  async (args: {
    command: string;
    name?: string | undefined;
    isPublic?: boolean | undefined;
    files?: string[] | undefined;
  }) => {
    const { command, name, isPublic = false, files = [] } = args;

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
    const upperCmd = cmd?.toUpperCase() || '';

    // LIST
    if (upperCmd === 'LIST') {
      try {
        const folders = await listFolders({
          endpoint: ZIPLINE_ENDPOINT,
          token: ZIPLINE_TOKEN,
        });

        if (folders.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📂 No folders found on the Zipline server.',
              },
            ],
          };
        }

        const folderList = folders
          .map((folder, index) => {
            const id = folder.id ? `🆔 ${folder.id}` : '🆔 (no ID)';
            return `${index + 1}. 📁 ${folder.name}\n   ${id}`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `📂 REMOTE FOLDERS\n\n${folderList}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`List folders failed: ${errorMessage}`);
        return {
          content: [
            {
              type: 'text',
              text: `❌ LIST FOLDERS FAILED\n\nError: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    // ADD
    if (upperCmd === 'ADD') {
      try {
        // For ADD command, name can come from the "name" parameter or from the command arguments
        let folderName = name;

        // If name is not provided as a parameter, try to get it from command arguments
        if (!folderName && argsArr.length > 0) {
          folderName = argsArr.join(' ');
        }

        if (!folderName) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ ADD refused: Folder name is required.',
              },
            ],
            isError: true,
          };
        }

        const folder = await createFolder({
          endpoint: ZIPLINE_ENDPOINT,
          token: ZIPLINE_TOKEN,
          name: folderName,
          isPublic,
          files,
        });

        const id = folder.id ? `🆔 ${folder.id}` : '🆔 (no ID)';
        // Note: The basic Folder type doesn't include isPublic and files properties
        // These would need to be added to the Folder interface if the API returns them
        const publicStatus = '🔒 Private'; // Default since Folder type doesn't have isPublic
        const filesCount = 0; // Default since Folder type doesn't have files

        return {
          content: [
            {
              type: 'text',
              text:
                `✅ FOLDER CREATED SUCCESSFULLY!\n\n` +
                `📁 ${folder.name}\n` +
                `   ${id}\n` +
                `   ${publicStatus}\n` +
                `   📄 Files: ${filesCount}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`Create folder failed: ${errorMessage}`);
        return {
          content: [
            {
              type: 'text',
              text: `❌ CREATE FOLDER FAILED\n\nError: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Invalid command
    return {
      content: [
        {
          type: 'text',
          text:
            '❌ Invalid command.\n\nCurrently supported commands:\n' +
            '  LIST - List all user folders with their names and IDs\n' +
            '  ADD <name> - Create a new folder with the specified name',
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
