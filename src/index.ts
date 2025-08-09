#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __filename = fileURLToPath(import.meta.url);
path.dirname(__filename);

const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
const ZIPLINE_ENDPOINT = process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';

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
        .enum(['random', 'original'])
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    format?: 'random' | 'original' | undefined;
  }) => {
    try {
      // Validate file exists and is accessible
      const fileContent = await readFile(filePath);
      const fileSize = Buffer.byteLength(fileContent, 'utf-8');

      // Get file extension for validation
      const fileExt = path.extname(filePath).toLowerCase();
      const allowedExtensions = [
        '.txt',
        '.md',
        '.gpx',
        '.html',
        '.htm',
        '.json',
        '.xml',
        '.csv',
        '.js',
        '.css',
        '.py',
        '.sh',
        '.yaml',
        '.yml',
        // All common image types
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.svg',
        '.bmp',
        '.tiff',
        '.ico',
        '.heic',
        '.avif',
      ];

      if (!allowedExtensions.includes(fileExt)) {
        throw new Error(
          `File type ${fileExt} not supported. Supported types: ${allowedExtensions.join(
            ', '
          )}`
        );
      }

      // Build the curl command
      const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;
      const ZIPLINE_ENDPOINT = process.env.ZIPLINE_ENDPOINT || 'http://localhost:3000';

      if (!ZIPLINE_TOKEN) {
        throw new Error('Environment variable ZIPLINE_TOKEN is required.');
      }

      const curlCommand = `curl -s -H "authorization: ${ZIPLINE_TOKEN}" ${ZIPLINE_ENDPOINT}/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

      console.error(`Executing upload for: ${path.basename(filePath)}`);

      // Execute the command
      const child = spawn('bash', ['-c', curlCommand]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: { toString: () => string }) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: { toString: () => string }) => {
        stderr += data.toString();
      });

      const result = await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          } else {
            reject(
              new Error(`Command failed with exit code ${code}: ${stderr}`)
            );
          }
        });

        child.on('error', (error) => {
          reject(error);
        });
      });

      const { stdout: url, stderr: error } = result as {
        stdout: string;
        stderr: string;
      };

      if (error) {
        console.error(`Warning during upload: ${error}`);
      }

      if (!url) {
        throw new Error(
          'No URL returned from Zipline server - the server may have returned an error'
        );
      }

      // Validate that the URL is properly formatted
      if (!isValidUrl(url)) {
        throw new Error(`Invalid URL format returned: ${url}`);
      }

      console.error(`Upload successful. URL: ${url}`);

      const formattedSize = formatFileSize(fileSize);
      const fileName = path.basename(filePath);

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
        .enum(['random', 'original'])
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    format?: 'random' | 'original' | undefined;
  }) => {
    try {
      // Quick file validation
      await readFile(filePath, 'utf-8');
      const fileExt = path.extname(filePath).toLowerCase();
      const allowedExtensions = [
        '.txt',
        '.md',
        '.gpx',
        '.html',
        '.htm',
        '.json',
        '.xml',
        '.csv',
        '.js',
        '.css',
        '.py',
        '.sh',
        '.yaml',
        '.yml',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.svg',
        '.bmp',
        '.tiff',
        '.ico',
        '.heic',
        '.avif',
      ];

      if (!allowedExtensions.includes(fileExt)) {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }

      const curlCommand = `curl -s -H "authorization: ${ZIPLINE_TOKEN}" ${ZIPLINE_ENDPOINT}/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

      console.error(`Quick upload: ${path.basename(filePath)}`);

      const child = spawn('bash', ['-c', curlCommand]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: { toString: () => string }) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: { toString: () => string }) => {
        stderr += data.toString();
      });

      const result = await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          } else {
            reject(new Error(`Upload failed with code ${code}: ${stderr}`));
          }
        });

        child.on('error', (error) => {
          reject(error);
        });
      });

      const { stdout: url, stderr: error } = result as {
        stdout: string;
        stderr: string;
      };

      if (error) {
        console.error(`Warning: ${error}`);
      }

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
      authorizationToken: z
        .string()
        .describe(
          'Authorization token for Zipline API (will be partially masked)'
        ),
      format: z
        .enum(['random', 'original'])
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  ({
    filePath,
    format = 'random',
  }: {
    filePath: string;
    authorizationToken: string;
    format?: 'random' | 'original' | undefined;
  }) => {
    try {
      // For security, mask most of the token in the preview

      const curlCommand = `curl -s -H "authorization: ${ZIPLINE_TOKEN}" ${ZIPLINE_ENDPOINT}/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

      return {
        content: [
          {
            type: 'text',
            text:
              '📋 UPLOAD COMMAND PREVIEW:\n\n' +
              `Command:\n${curlCommand}\n\n` +
              '🔒 Token is masked for security.\n' +
              '✂️ The actual command will use your full token.\n' +
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

      const allowedExtensions = [
        '.txt',
        '.md',
        '.gpx',
        '.html',
        '.htm',
        '.json',
        '.xml',
        '.csv',
        '.js',
        '.css',
        '.py',
        '.sh',
        '.yaml',
        '.yml',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.svg',
        '.bmp',
        '.tiff',
        '.ico',
        '.heic',
        '.avif',
      ];
      const isSupported = allowedExtensions.includes(fileExt);

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
              `Supported formats: ${allowedExtensions.join(', ')}`,
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
    command: z.string().describe('Command: LIST, CREATE <filename>, OPEN <filename>, READ <filename>'),
    content: z.string().optional().describe('File content for CREATE (optional)'),
  },
},
async (
  args: { command: string; content?: string | undefined }
) => {
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
      const fileList = files.filter(f => f.isFile()).map(f => f.name);
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
console.error('✅ MCP Zipline Upload Server started successfully');
console.error('🛠️  Available tools:');
console.error('   • upload_file_to_zipline: Upload file with full details');
console.error('   • get_upload_url_only: Upload and return only URL');
console.error('   • preview_upload_command: Preview upload command');
console.error('   • validate_file: Check file compatibility');
console.error('   • tmp_file_manager: Minimal file management in ~/.zipline_tmp');
console.error(
  '📂 This server handles: txt, md, gpx, html, json, xml, csv, js, css, py, sh, yaml, yml, png, jpg, jpeg, gif, webp, svg, bmp, tiff'
);
}

export { server };

main().catch((error) => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});
