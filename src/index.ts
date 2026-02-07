#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { uploadFile, UploadOptions, DownloadOptions } from './httpClient.js';
import { secureLog, maskSensitiveData } from './utils/security.js';
import {
  listUserFiles,
  getUserFile,
  updateUserFile,
  UpdateUserFileOptions,
  deleteUserFile,
} from './userFiles.js';
import {
  listFolders,
  createFolder,
  editFolder,
  getFolder,
  deleteFolder,
  EditFolderOptions,
} from './remoteFolders.js';
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
  validateFileForSecrets,
  stageFile,
  clearStagedContent,
  MEMORY_STAGING_THRESHOLD,
  SecretDetectionError,
} from './sandboxUtils.js';
import { McpErrorCode } from './utils/errorMapper.js';
import * as mime from 'mime-types';
import { fileTypeFromBuffer } from 'file-type';

// Re-export sandbox functions for backward compatibility
export {
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
  validateFileForSecrets,
  clearStagedContent,
  SecretDetectionError,
};

const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
const ZIPLINE_ENDPOINT =
  process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';

/**
 * Maximum allowed file size for upload (in bytes).
 * Configurable via ZIPLINE_MAX_FILE_SIZE environment variable.
 * Default: 100MB
 */
const parsedMaxSize = parseInt(process.env.ZIPLINE_MAX_FILE_SIZE || '', 10);
const MAX_FILE_SIZE_BYTES =
  Number.isFinite(parsedMaxSize) && parsedMaxSize > 0
    ? parsedMaxSize
    : 100 * 1024 * 1024;

/**
 * Ratio of size to threshold to trigger a warning (0.9 = 90%)
 */
const SIZE_WARNING_THRESHOLD_RATIO = 0.9;

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
export const ALLOWED_FORMATS = [
  'random',
  'uuid',
  'date',
  'name',
  'gfycat',
  'random-words',
] as const;
export type FormatType = (typeof ALLOWED_FORMATS)[number];

export const DEFAULT_ALLOWED_EXTENSIONS = [
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
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.odg',
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  '.flv',
  '.mov',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

export const ALLOWED_EXTENSIONS = process.env.ALLOWED_EXTENSIONS
  ? process.env.ALLOWED_EXTENSIONS.split(',').map((ext) =>
      ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
    )
  : DEFAULT_ALLOWED_EXTENSIONS;

function normalizeFormat(format: string): FormatType | null {
  const lower = format.toLowerCase();
  if (lower === 'gfycat') return 'random-words';
  if (ALLOWED_FORMATS.includes(lower as FormatType)) return lower as FormatType;
  return null;
}

// --- Tool Input Schemas ---

export const uploadFileInputSchema = {
  filePath: z
    .string()
    .describe('Path to the file to upload (txt, md, gpx, html, etc.)'),
  format: z
    .enum(ALLOWED_FORMATS)
    .optional()
    .describe('Optional: Filename format (default: random)'),
  deletesAt: z
    .string()
    .optional()
    .describe(
      'Optional: File expiration time (default: no expiration, e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")'
    ),
  password: z
    .string()
    .optional()
    .describe(
      'Optional: Password protection for the uploaded file (default: no password)'
    ),
  maxViews: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Optional: Maximum number of views before file removal (default: unlimited, ≥ 0)'
    ),
  folder: z
    .string()
    .optional()
    .describe(
      'Optional: Target folder ID (alphanumeric, must exist, default: no folder)'
    ),
  originalName: z
    .string()
    .optional()
    .describe(
      'Optional: Original filename to preserve during download (default: auto-generated)'
    ),
};

export const validateFileInputSchema = {
  filePath: z.string().describe('Absolute path to the file to validate.'),
};

export const tmpFileManagerInputSchema = {
  command: z
    .string()
    .describe(
      'Command to execute. Supported commands: PATH <filename>, LIST, CREATE <filename>, OPEN <filename>, READ <filename>, DELETE <filename>. Only bare filenames are allowed.'
    ),
  content: z
    .string()
    .optional()
    .describe('Optional: Content for the CREATE command (default: empty).'),
};

export const downloadExternalUrlInputSchema = {
  url: z.string().describe('The HTTP or HTTPS URL of the file to download.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Optional: Timeout in milliseconds for the download operation (default: 30000).'
    ),
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional: Maximum allowed file size in bytes (default: 100MB).'),
};

export const listUserFilesInputSchema = {
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
    .describe(
      'Optional: The number of files to display per page (default: 15).'
    ),
  filter: z
    .enum(['dashboard', 'all', 'none'])
    .optional()
    .describe(
      'Optional: Filter files by type: dashboard (media/text), all, or none (default: all).'
    ),
  favorite: z
    .boolean()
    .optional()
    .describe(
      'Optional: If true, only return files marked as favorite (default: false, returns all files).'
    ),
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
    .describe('Optional: The field to sort files by (default: createdAt).'),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .describe(
      'Optional: Sort order: ascending (asc) or descending (desc) (default: desc).'
    ),
  searchField: z
    .enum(['name', 'originalName', 'type', 'tags', 'id'])
    .optional()
    .describe('Optional: The field to search within (default: name).'),
  searchQuery: z
    .string()
    .optional()
    .describe(
      'Optional: Search string to query files (default: no search, returns all files on page).'
    ),
};

export const getUserFileInputSchema = {
  id: z
    .string()
    .describe(
      'Obtain the unique ID of the file from either the user or the list_user_files tool.'
    ),
};

export const updateUserFileInputSchema = {
  id: z
    .string()
    .describe(
      'The unique ID of the file to update. Only use the ID, the filename does not work.'
    ),
  favorite: z
    .boolean()
    .optional()
    .describe(
      'Optional: Mark or unmark the file as a favorite (default: no change).'
    ),
  maxViews: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Optional: Set the maximum number of views allowed for the file (>= 0, default: no change).'
    ),
  password: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional: Set a password for the file or remove it by setting to null (default: no change).'
    ),
  originalName: z
    .string()
    .optional()
    .describe(
      'Optional: Update the original filename of the file (default: no change).'
    ),
  type: z
    .string()
    .optional()
    .describe(
      'Optional: Update the MIME type of the file (default: no change).'
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      'Optional: Set or update tags associated with the file (default: no change, replaces existing tags if provided).'
    ),
  name: z
    .string()
    .optional()
    .describe('Optional: Rename the file (default: no change).'),
};

export const deleteUserFileInputSchema = {
  id: z
    .string()
    .describe(
      'The unique ID of the file to delete. Only use the ID, the filename does not work.'
    ),
};

export const remoteFolderManagerInputSchema = {
  command: z
    .string()
    .describe(
      'Command to execute. Supported: LIST, ADD <name>, EDIT <id>, INFO <id>, DELETE <id>'
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Optional: Folder name (required for ADD command, optional for EDIT command) (default: empty).'
    ),
  isPublic: z
    .boolean()
    .optional()
    .describe(
      'Optional: Whether the folder is public (default: false, for ADD and EDIT commands).'
    ),
  files: z
    .array(z.string())
    .optional()
    .describe(
      'Optional: Array of file IDs to include in the folder (for ADD command, default: empty folder).'
    ),
  id: z
    .string()
    .optional()
    .describe(
      'Optional: Folder ID (required for EDIT command, not used for other commands). Retrieve the ID first (default: no file added).'
    ),
  allowUploads: z
    .boolean()
    .optional()
    .describe(
      'Optional: Whether to allow uploads to the folder (for EDIT command, default: no change).'
    ),
  fileId: z
    .string()
    .optional()
    .describe(
      'Optional: File ID to add to the folder (for EDIT command). Retrieve the file ID first (default: no file added).'
    ),
};

export const batchFileOperationInputSchema = {
  command: z.enum(['DELETE', 'MOVE']).describe('The operation to perform.'),
  ids: z
    .array(z.string())
    .describe('The unique IDs of the files to operate on.'),
  folder: z
    .string()
    .optional()
    .describe(
      'Optional: The target folder ID (required for MOVE operation, default: none).'
    ),
};

server.registerTool(
  'upload_file_to_zipline',
  {
    title: 'Upload File to Zipline',
    description:
      'Upload a file to Zipline server with advanced options and retrieve the download URL. ' +
      'Prerequisites: Depends on validate_file (recommended for pre-validation). Requires Zipline authentication. ' +
      'Size Limits: Maximum file size is ' +
      formatFileSize(MAX_FILE_SIZE_BYTES) +
      ' (configurable via ZIPLINE_MAX_FILE_SIZE). Files < ' +
      formatFileSize(MEMORY_STAGING_THRESHOLD) +
      ' use memory staging for optimal performance. ' +
      'Error Handling: Common failures: File validation errors, upload failures, authentication issues, file size exceeded.',
    inputSchema: uploadFileInputSchema,
  },
  async (args) => {
    const {
      filePath,
      format = 'random',
      deletesAt,
      password,
      maxViews,
      folder,
      originalName,
    } = args;
    try {
      const normalizedFormat = normalizeFormat(format);
      if (!normalizedFormat) throw new Error(`Invalid format: ${format}`);

      const fileExt = path.extname(filePath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        throw new Error(`File type ${fileExt} not supported.`);
      }

      // 1. Critical Security Check: Validate MIME type matches extension
      // We read only the header to prevent OOM on large files
      const { mimeMatch, detectedMimeType, extensionMimeType } =
        await validateFileContent(filePath, fileExt);
      if (!mimeMatch) {
        throw new Error(
          `Security Violation: File content (MIME: [${detectedMimeType}] len:${detectedMimeType.length}) does not match extension (${fileExt}) which expects ([${extensionMimeType}] len:${extensionMimeType.length}). Upload rejected.`
        );
      }

      // 2. Early Size Validation: Check file size before staging
      const stats = await fs.stat(filePath);
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        const formattedActualSize = formatFileSize(stats.size);
        const formattedMaxSize = formatFileSize(MAX_FILE_SIZE_BYTES);
        throw new Error(
          `File too large: ${formattedActualSize} exceeds maximum allowed size of ${formattedMaxSize}. Reduce file size or configure ZIPLINE_MAX_FILE_SIZE (value in bytes, e.g. 209715200 for 200MB).`
        );
      }

      // Memory-First Staging via sandboxUtils
      // This validates secrets and loads content into memory if < 5MB
      const stagedFile = await stageFile(filePath);

      try {
        const fileSize =
          stagedFile.type === 'memory' ? stagedFile.content.length : stats.size;

        const opts: UploadOptions = {
          endpoint: ZIPLINE_ENDPOINT,
          token: ZIPLINE_TOKEN,
          filePath,
          format: normalizedFormat,
        };

        if (stagedFile.type === 'memory') {
          opts.fileContent = stagedFile.content;
        }

        if (password !== undefined) opts.password = password;
        if (maxViews !== undefined) opts.maxViews = maxViews;
        if (folder !== undefined) opts.folder = folder;
        if (deletesAt !== undefined) opts.deletesAt = deletesAt;
        if (originalName !== undefined) opts.originalName = originalName;

        const url = await uploadFile(opts);
        if (!isValidUrl(url)) throw new Error(`Invalid URL returned: ${url}`);
        const formattedSize = formatFileSize(fileSize);
        const fileName = path.basename(filePath);
        let text = `✅ FILE UPLOADED SUCCESSFULLY!\n\n📁 File: ${fileName}\n📊 Size: ${formattedSize}\n🏷️  Format: ${format}\n🔗 DOWNLOAD URL: ${url}`;
        if (fileExt === '.md')
          text += `\n🔗 VIEW URL: ${url.replace('/u/', '/view/')}`;
        return { content: [{ type: 'text', text }] };
      } finally {
        clearStagedContent(stagedFile);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      secureLog(`Upload failed: ${errorMessage}`);

      let errorDetails = errorMessage;
      let errorCode = McpErrorCode.INTERNAL_ZIPLINE_ERROR;

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        errorCode = McpErrorCode.RESOURCE_NOT_FOUND;
        errorDetails = `File not found: ${filePath}`;
      } else if (errorMessage.includes('Security Violation')) {
        errorCode = McpErrorCode.FORBIDDEN_OPERATION;
      } else if (errorMessage.includes('File too large')) {
        errorCode = McpErrorCode.PAYLOAD_TOO_LARGE;
      }

      return {
        content: [
          {
            type: 'text',
            text: maskSensitiveData(
              `❌ UPLOAD FAILED!\n\nError Code: ${errorCode}\nError: ${errorDetails}\n\nPossible solutions:\n• Verify the file path is correct\n• Check if the file exists and is accessible\n• Ensure you have permission to read the file\n• Confirm that the file type is supported`
            ),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Validates file content by checking MIME type against extension.
 * Reads only the first 4100 bytes for efficiency.
 */
async function validateFileContent(
  filePath: string,
  fileExt: string
): Promise<{
  detectedMimeType: string;
  mimeMatch: boolean;
  isSupported: boolean;
  extensionMimeType: string;
}> {
  // Read only start of file for magic number detection
  // 4100 bytes is sufficient for file-type to detect most formats
  const handle = await fs.open(filePath, 'r');
  const buffer = Buffer.alloc(4100);
  try {
    const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
    // If file is smaller than buffer, slice it
    const params = bytesRead < 4100 ? buffer.subarray(0, bytesRead) : buffer;

    // Detect MIME
    let detectedMimeType = 'unknown';
    try {
      const fileType = await fileTypeFromBuffer(params);
      detectedMimeType = fileType?.mime || mime.lookup(filePath) || 'unknown';
    } catch {
      detectedMimeType = mime.lookup(filePath) || 'unknown';
    }

    const extensionMimeType = mime.lookup(fileExt) || 'unknown';

    // Loose matching logic:
    // 1. If detection failed (unknown), assume match (fallback to extension trust for obscure types)
    // 2. If detected matches extension mime
    // 3. Special handling for text files which might be detected as generic 'application/octet-stream' or specific text subtypes
    let mimeMatch =
      detectedMimeType === 'unknown' || detectedMimeType === extensionMimeType;

    // Additional robust checks for common mismatches
    if (!mimeMatch) {
      // Allow text/plain for code files
      if (
        detectedMimeType === 'text/plain' &&
        [
          '.ts',
          '.js',
          '.json',
          '.md',
          '.yml',
          '.yaml',
          '.csv',
          '.xml',
          '.svg',
        ].includes(fileExt)
      ) {
        mimeMatch = true;
      }
      // Allow application/xml for svg
      if (detectedMimeType === 'application/xml' && fileExt === '.svg') {
        mimeMatch = true;
      }
    }

    const isSupported = ALLOWED_EXTENSIONS.includes(fileExt);

    return { detectedMimeType, mimeMatch, isSupported, extensionMimeType };
  } finally {
    if (handle) await handle.close();
  }
}

// 2. validate_file
server.registerTool(
  'validate_file',
  {
    title: 'Validate File',
    description:
      'Validate if a file exists, detect its MIME type, and verify it is suitable for upload to Zipline. Performs content-based MIME detection, extension validation, and MIME/extension consistency checks.',
    inputSchema: validateFileInputSchema,
  },
  async ({ filePath }) => {
    try {
      const fileExt = path.extname(filePath).toLowerCase();

      // 1. Secret Validation (Full scan still required for security)
      let secretDetails = '';
      try {
        await validateFileForSecrets(filePath);
      } catch (error) {
        if (error instanceof SecretDetectionError) {
          secretDetails = `\n⚠️ Secret Type: ${error.secretType}\n⚠️ Pattern: ${error.pattern}`;
        } else throw error;
      }

      // 2. Efficient MIME Detection
      const { detectedMimeType, mimeMatch, isSupported } =
        await validateFileContent(filePath, fileExt);

      const stats = await fs.stat(filePath);
      const formattedSize = formatFileSize(stats.size);

      // 3. Staging Strategy and Size Analysis
      let stagingStrategy = '';
      let sizeWarning = '';
      let sizeLimitWarning = '';

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        sizeLimitWarning = `\n⚠️ SIZE LIMIT EXCEEDED: ${formattedSize} exceeds maximum ${formatFileSize(MAX_FILE_SIZE_BYTES)}. This file would be rejected during upload.`;
      } else if (
        stats.size >= MEMORY_STAGING_THRESHOLD * SIZE_WARNING_THRESHOLD_RATIO &&
        stats.size < MEMORY_STAGING_THRESHOLD
      ) {
        sizeWarning = `\n⚠️ SIZE WARNING: File is close to ${formatFileSize(MEMORY_STAGING_THRESHOLD)} memory threshold. Will use memory staging but consider optimizing file size.`;
      }

      if (stats.size < MEMORY_STAGING_THRESHOLD) {
        stagingStrategy = '🧠 Memory staging (fast, no disk I/O)';
      } else {
        stagingStrategy =
          '💾 Disk fallback staging (for files ≥' +
          formatFileSize(MEMORY_STAGING_THRESHOLD) +
          ')';
      }

      return {
        content: [
          {
            type: 'text',
            text: `📋 FILE VALIDATION REPORT\n\n📁 File: ${path.basename(filePath)}\n📍 Path: ${filePath}\n📊 Size: ${formattedSize}\n🏷️ Extension: ${fileExt || 'none'}\n🎯 MIME: ${detectedMimeType}\n✅ MIME/Extension Match: ${mimeMatch ? 'Yes' : 'No'}\n✅ Supported: ${isSupported ? 'Yes' : 'No'}\n🚀 Staging Strategy: ${stagingStrategy}${sizeWarning}${sizeLimitWarning}${secretDetails}\n\nStatus: ${sizeLimitWarning ? '🔴 Too large for upload' : secretDetails ? '🔴 Contains secrets (not allowed for upload)' : !isSupported ? '🔴 File type not supported' : !mimeMatch ? '🔴 MIME type matches extension violation' : '🟢 Ready for upload'}\n\nSupported formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
          },
        ],
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        errorMessage = `File not found: ${filePath}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `❌ FILE VALIDATION FAILED!\n\nError: ${errorMessage}\n\nPlease check:\n• Verify the file path is correct\n• Check if the file exists and is accessible\n• Ensure you have permission to read the file`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 3. tmp_file_manager
server.registerTool(
  'tmp_file_manager',
  {
    title: 'Minimal Temporary File Manager',
    description:
      'Perform basic file management operations in a secure, per-user sandbox environment for temporary files.',
    inputSchema: tmpFileManagerInputSchema,
  },
  async (args) => {
    const userSandbox = await ensureUserSandbox();
    const { command, content } = args;
    const [cmd, ...argsArr] = command.trim().split(/\s+/);
    if (!cmd)
      return {
        content: [{ type: 'text', text: '❌ Command is required.' }],
        isError: true,
      };
    const upperCmd = cmd.toUpperCase();

    if (upperCmd === 'LIST') {
      try {
        const files = (await fs.readdir(userSandbox, { withFileTypes: true }))
          .filter((f) => f.isFile())
          .map((f) => f.name);
        return {
          content: [
            {
              type: 'text',
              text:
                files.length > 0
                  ? `Files in your sandbox:\n${files.map((f) => `${resolveSandboxPath(f)}`).join('\n')}`
                  : 'No files found in your sandbox.',
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: 'text', text: `❌ LIST failed: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }

    const filename = argsArr[0];
    if (!filename)
      return {
        content: [
          {
            type: 'text',
            text: `❌ ${upperCmd} refused: Filename is required.`,
          },
        ],
        isError: true,
      };
    const err = validateFilename(filename);
    if (err)
      return {
        content: [{ type: 'text', text: `❌ ${upperCmd} refused: ${err}` }],
        isError: true,
      };
    const filePath = resolveSandboxPath(filename);

    if (upperCmd === 'CREATE') {
      try {
        await fs.writeFile(filePath, content ?? '', { encoding: 'utf8' });
        await validateFileForSecrets(filePath).catch(async (e) => {
          await fs.unlink(filePath);
          throw e;
        });
        const stat = await fs.stat(filePath);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created/Overwritten: ${filename}\nPath: ${filePath}\nSize: ${formatFileSize(stat.size)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: 'text', text: `❌ CREATE failed: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    }
    if (upperCmd === 'OPEN' || upperCmd === 'READ') {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > TMP_MAX_READ_SIZE)
          throw new Error(`File too large (${formatFileSize(stat.size)})`);
        const data = await fs.readFile(filePath, { encoding: 'utf8' });
        return {
          content: [
            {
              type: 'text',
              text: `✅ ${upperCmd}: ${filename}\nPath: ${filePath}\nSize: ${formatFileSize(stat.size)}\n\n${data}`,
            },
          ],
        };
      } catch (e) {
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
    if (upperCmd === 'PATH') {
      return {
        content: [
          {
            type: 'text',
            text: `✅ PATH: ${filename}\nAbsolute path: ${filePath}`,
          },
        ],
      };
    }
    if (upperCmd === 'DELETE') {
      try {
        await fs.unlink(filePath);
        return {
          content: [
            {
              type: 'text',
              text: `✅ DELETE: ${filename}\nPath: ${filePath}\nFile deleted successfully`,
            },
          ],
        };
      } catch (e) {
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
    return {
      content: [
        {
          type: 'text',
          text: '❌ Invalid command.\n\nUsage:\n  LIST\n  CREATE <filename>\n  OPEN <filename>\n  READ <filename>\n  PATH <filename>\n  DELETE <filename>',
        },
      ],
      isError: true,
    };
  }
);

// 4. download_external_url
server.registerTool(
  'download_external_url',
  {
    title: 'Download External URL',
    description:
      "Download a file from an external HTTP(S) URL into the user's sandbox and return the local path.",
    inputSchema: downloadExternalUrlInputSchema,
  },
  async (args) => {
    const { url, timeoutMs = 30000, maxFileSizeBytes } = args;
    try {
      if (!isValidUrl(url)) throw new Error('Invalid URL');
      const { downloadExternalUrl } = await import('./httpClient.js');
      const opts: DownloadOptions = { timeout: timeoutMs };
      if (maxFileSizeBytes !== undefined)
        opts.maxFileSizeBytes = maxFileSizeBytes;
      const pathResult = await downloadExternalUrl(url, opts);
      return {
        content: [
          {
            type: 'text',
            text: `✅ DOWNLOAD COMPLETE\n\nLocal path: ${pathResult}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: maskSensitiveData(
              `❌ DOWNLOAD FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`
            ),
          },
        ],
        isError: true,
      };
    }
  }
);

// 5. list_user_files
server.registerTool(
  'list_user_files',
  {
    title: 'List User Files',
    description: 'Retrieve and search files stored on the Zipline server.',
    inputSchema: listUserFilesInputSchema,
  },
  async (args) => {
    try {
      const result = await listUserFiles({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        ...args,
      });
      const list = result.page
        .map(
          (f, i) =>
            `${i + 1}. ${f.name}\n   🆔 ID: ${f.id}\n   🔗 URL: ${f.url}`
        )
        .join('\n\n');
      return {
        content: [
          {
            type: 'text',
            text: `📁 USER FILES\n\n${list}\n\nTotal files: ${result.total}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ LIST USER FILES FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 6. get_user_file
server.registerTool(
  'get_user_file',
  {
    title: 'Get User File',
    description:
      'Retrieve detailed information about a specific file stored on the Zipline server.',
    inputSchema: getUserFileInputSchema,
  },
  async ({ id }) => {
    try {
      const file = await getUserFile({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      });
      return {
        content: [
          {
            type: 'text',
            text: `📁 FILE INFORMATION\n\n📁 ${file.name}\n🆔 ID: ${file.id}\n🔗 URL: ${file.url}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ GET USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 7. update_user_file
server.registerTool(
  'update_user_file',
  {
    title: 'Update User File',
    description:
      'Modify properties of a specific file stored on the Zipline server.',
    inputSchema: updateUserFileInputSchema,
  },
  async (args) => {
    try {
      const opts: UpdateUserFileOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id: args.id,
      };
      if (args.favorite !== undefined) opts.favorite = args.favorite;
      if (args.maxViews !== undefined) opts.maxViews = args.maxViews;
      if (args.password !== undefined) opts.password = args.password;
      if (args.originalName !== undefined)
        opts.originalName = args.originalName;
      if (args.type !== undefined) opts.type = args.type;
      if (args.tags !== undefined) opts.tags = args.tags;
      if (args.name !== undefined) opts.name = args.name;

      const file = await updateUserFile(opts);
      return {
        content: [
          {
            type: 'text',
            text: `✅ FILE UPDATED SUCCESSFULLY!\n\n📁 ${file.name}\n🆔 ID: ${file.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ UPDATE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 8. delete_user_file
server.registerTool(
  'delete_user_file',
  {
    title: 'Delete User File',
    description: 'Remove a specific file from the Zipline server.',
    inputSchema: deleteUserFileInputSchema,
  },
  async ({ id }) => {
    try {
      const file = await deleteUserFile({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      });
      return {
        content: [
          {
            type: 'text',
            text: `✅ FILE DELETED SUCCESSFULLY!\n\n📁 ${file.name}\n🆔 ID: ${file.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ DELETE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 9. remote_folder_manager
server.registerTool(
  'remote_folder_manager',
  {
    title: 'Remote Folder Manager',
    description:
      'Manage folders on the Zipline server (supports listing, creating, editing, getting info, and deleting).',
    inputSchema: remoteFolderManagerInputSchema,
  },
  async (args) => {
    const {
      command,
      name,
      isPublic = false,
      files = [],
      id,
      allowUploads,
      fileId,
    } = args;
    const upperCmd = command.trim().split(/\s+/)[0]?.toUpperCase() || '';
    if (upperCmd === 'LIST') {
      const folders = await listFolders({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
      });
      return {
        content: [
          {
            type: 'text',
            text: `📂 REMOTE FOLDERS\n\n${folders.map((f, i) => `${i + 1}. 📁 ${f.name}\n   🆔 ID: ${f.id}`).join('\n\n')}`,
          },
        ],
      };
    }
    if (upperCmd === 'ADD') {
      const folder = await createFolder({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        name: name || 'New Folder',
        isPublic,
        files,
      });
      return {
        content: [
          {
            type: 'text',
            text: `✅ FOLDER CREATED SUCCESSFULLY!\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
          },
        ],
      };
    }
    if (upperCmd === 'EDIT' && id) {
      const opts: EditFolderOptions = {
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      };
      if (name !== undefined) opts.name = name;
      if (isPublic !== undefined) opts.isPublic = isPublic;
      if (allowUploads !== undefined) opts.allowUploads = allowUploads;
      if (fileId !== undefined) opts.fileId = fileId;
      const folder = await editFolder(opts);
      return {
        content: [
          {
            type: 'text',
            text: `✅ FOLDER UPDATED SUCCESSFULLY!\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
          },
        ],
      };
    }
    if (upperCmd === 'INFO' && id) {
      const folder = await getFolder(id);
      return {
        content: [
          {
            type: 'text',
            text: `📁 FOLDER INFORMATION\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
          },
        ],
      };
    }
    if (upperCmd === 'DELETE' && id) {
      const folder = await deleteFolder(id);
      return {
        content: [
          {
            type: 'text',
            text: `✅ FOLDER DELETED SUCCESSFULLY!\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
          },
        ],
      };
    }
    return {
      content: [{ type: 'text', text: '❌ Invalid command.' }],
      isError: true,
    };
  }
);

// 10. batch_file_operation
server.registerTool(
  'batch_file_operation',
  {
    title: 'Batch File Operation',
    description:
      'Perform bulk operations (delete, move) on multiple files stored on the Zipline server.',
    inputSchema: batchFileOperationInputSchema,
  },
  async ({ command, ids, folder }) => {
    const results = { success: [] as string[], failed: [] as string[] };
    for (const id of ids) {
      try {
        if (command === 'DELETE') {
          await deleteUserFile({
            endpoint: ZIPLINE_ENDPOINT,
            token: ZIPLINE_TOKEN,
            id,
          });
        } else {
          if (!folder) throw new Error('Folder ID required for MOVE');
          await editFolder({
            endpoint: ZIPLINE_ENDPOINT,
            token: ZIPLINE_TOKEN,
            id: folder,
            fileId: id,
          });
        }
        results.success.push(id);
      } catch {
        results.failed.push(id);
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: `📋 BATCH OPERATION SUMMARY: ${command}\n\n✅ Successful: ${results.success.length}\n❌ Failed: ${results.failed.length}`,
        },
      ],
    };
  }
);

// 11. get_usage_statistics
server.registerTool(
  'get_usage_statistics',
  {
    title: 'Get Usage Statistics',
    description:
      'Retrieve storage and file usage statistics from the Zipline server.',
    inputSchema: {},
  },
  async () => {
    try {
      const res = await fetch(`${ZIPLINE_ENDPOINT}/api/user/stats`, {
        headers: { authorization: ZIPLINE_TOKEN },
      });
      if (!res.ok) throw new Error(`Stats failed: HTTP ${res.status}`);
      const stats = (await res.json()) as Record<string, unknown>;
      return {
        content: [
          {
            type: 'text',
            text: `📊 ZIPLINE USAGE STATISTICS\n\n${JSON.stringify(stats, null, 2)}`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ FAILED TO GET STATISTICS\n\nError: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 12. check_health
server.registerTool(
  'check_health',
  {
    title: 'Check Health',
    description: 'Verify the availability and health of the Zipline server.',
    inputSchema: {},
  },
  async () => {
    try {
      const start = Date.now();
      const res = await fetch(`${ZIPLINE_ENDPOINT}/api/health`);
      const latency = Date.now() - start;
      if (res.ok)
        return {
          content: [
            {
              type: 'text',
              text: `🟢 SERVER HEALTHY\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nLatency: ${latency}ms\nStatus: UP`,
            },
          ],
        };
      return {
        content: [
          {
            type: 'text',
            text: `🔴 SERVER UNHEALTHY\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nStatus: HTTP ${res.status}`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `🔴 SERVER UNREACHABLE\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nError: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Main ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { server };

// Safer check for direct execution in ESM
import { fileURLToPath } from 'url';
const scriptPath = process.argv[1];
const isMain =
  scriptPath && fileURLToPath(import.meta.url) === path.resolve(scriptPath);

if (isMain) {
  main().catch((error) => {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  });
}
