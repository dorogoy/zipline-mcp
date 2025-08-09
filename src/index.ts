#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { uploadFile } from './httpClient.js';

const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
const ZIPLINE_ENDPOINT =
  process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';

if (!ZIPLINE_TOKEN) {
  throw new Error('Environment variable ZIPLINE_TOKEN is required.');
}

const server = new McpServer({
  name: 'zipline-upload-server',
  version: '1.0.0',
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

function resolveInTmp(filename: string): string {
  return path.join(TMP_DIR, filename);
}

async function ensureTmpDir(): Promise<void> {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Ignore if already exists
  }
}

server.registerTool(
  'upload_file_to_zipline',
  {
    title: 'Upload File to Zipline',
    description: 'Upload a file to Zipline server and get the download URL',
    inputSchema: {
      filePath: z
        .string()
        .describe('Path to the file to upload (txt, md, gpx, html, etc.)'),
      format: z
        .enum(ALLOWED_FORMATS)
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    format?: FormatType | undefined;
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

      // Use the HTTP client instead of curl
      const url = await uploadFile({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        filePath,
        format: normalizedFormat,
      });

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
  'get_upload_url_only',
  {
    title: 'Get Upload URL Only',
    description:
      'Upload a file and return ONLY the download URL (minimal output)',
    inputSchema: {
      filePath: z.string().describe('Path to the file to upload'),
      format: z
        .enum(ALLOWED_FORMATS)
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    format?: FormatType | undefined;
  }) => {
    try {
      // Validate and normalize format
      const normalizedFormat = normalizeFormat(format || 'random');
      if (!normalizedFormat) {
        throw new Error(`Invalid format: ${format}`);
      }

      // Quick file validation
      await readFile(filePath);
      const fileExt = path.extname(filePath).toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }

      console.error(`Quick upload: ${path.basename(filePath)}`);

      // Use the HTTP client instead of curl
      const url = await uploadFile({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        filePath,
        format: normalizedFormat,
      });

      if (!url || !isValidUrl(url)) {
        throw new Error('Invalid or empty URL received from server');
      }

      return {
        content: [
          {
            type: 'text',
            text: url,
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
            text: `ERROR: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'preview_upload_command',
  {
    title: 'Preview Upload Command',
    description:
      'Generate and preview the curl command that will be used for uploading',
    inputSchema: {
      filePath: z.string().describe('Path to the file to upload'),
      format: z
        .enum(ALLOWED_FORMATS)
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    format?: FormatType | undefined;
  }) => {
    try {
      // Validate and normalize format
      const normalizedFormat = normalizeFormat(format || 'random');
      if (!normalizedFormat) {
        throw new Error(`Invalid format: ${format}`);
      }

      // For security, show the Node.js implementation instead of curl
      const nodeJsImplementation = `// Node.js implementation (no external dependencies)
import { uploadFile } from './httpClient.js';

const url = await uploadFile({
  endpoint: '${ZIPLINE_ENDPOINT}',
  token: 'YOUR_TOKEN_HERE',
  filePath: '${filePath}',
  format: '${normalizedFormat}',
});`;

      return {
        content: [
          {
            type: 'text',
            text:
              '📋 NODE.JS IMPLEMENTATION PREVIEW:\n\n' +
              `Code:\n\`\`\`javascript\n${nodeJsImplementation}\n\`\`\`\n\n` +
              '🔒 Token is masked for security.\n' +
              '✂️ The actual code will use your full token.\n' +
              `📤 This will upload: ${path.basename(filePath)}\n` +
              '🎯 Expected output: The download URL for your file',
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
            text: `Error generating preview: ${errorMessage}`,
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
    await ensureTmpDir();
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
        const files = await fs.readdir(TMP_DIR, { withFileTypes: true });
        const fileList = files.filter((f) => f.isFile()).map((f) => f.name);
        return {
          content: [
            {
              type: 'text',
              text:
                fileList.length > 0
                  ? `Files in ~/.zipline_tmp:\n${fileList.join('\n')}`
                  : 'No files found in ~/.zipline_tmp.',
            },
          ],
        };
      } catch (e) {
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
      const filePath = resolveInTmp(filename);
      try {
        await fs.writeFile(filePath, content ?? '', { encoding: 'utf8' });
        const stat = await fs.stat(filePath);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created/Overwritten: ${filename}\nSize: ${formatFileSize(stat.size)}`,
            },
          ],
        };
      } catch (e) {
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
      const filePath = resolveInTmp(filename);
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > TMP_MAX_READ_SIZE) {
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
        return {
          content: [
            {
              type: 'text',
              text: `✅ ${upperCmd}: ${filename}\nSize: ${formatFileSize(stat.size)}\n\n${data}`,
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
            'Filenames must not include path separators, dot segments, or be empty. Only bare filenames in ~/.zipline_tmp are allowed.',
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
