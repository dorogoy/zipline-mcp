#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __filename = fileURLToPath(import.meta.url);
path.dirname(__filename);

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

server.registerTool(
  'upload_file_to_zipline',
  {
    title: 'Upload File to Zipline',
    description: 'Upload a file to Zipline server and get the download URL',
    inputSchema: {
      filePath: z
        .string()
        .describe('Path to the file to upload (txt, md, gpx, html, etc.)'),
      authorizationToken: z
        .string()
        .describe('Authorization token for Zipline API'),
      format: z
        .enum(['random', 'original'])
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    authorizationToken,
    format = 'random',
  }: {
    filePath: string;
    authorizationToken: string;
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
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.svg',
        '.bmp',
        '.tiff',
      ];

      if (!allowedExtensions.includes(fileExt)) {
        throw new Error(
          `File type ${fileExt} not supported. Supported types: ${allowedExtensions.join(
            ', '
          )}`
        );
      }

      // Build the curl command
      const curlCommand = `curl -s -H "authorization: ${authorizationToken}" https://files.etereo.cloud/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

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
      authorizationToken: z
        .string()
        .describe('Authorization token for Zipline API'),
      format: z
        .enum(['random', 'original'])
        .optional()
        .describe('Filename format (default: random)'),
    },
  },
  async ({
    filePath,
    authorizationToken,
    format = 'random',
  }: {
    filePath: string;
    authorizationToken: string;
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
      ];

      if (!allowedExtensions.includes(fileExt)) {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }

      const curlCommand = `curl -s -H "authorization: ${authorizationToken}" https://files.etereo.cloud/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

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
    authorizationToken,
    format = 'random',
  }: {
    filePath: string;
    authorizationToken: string;
    format?: 'random' | 'original' | undefined;
  }) => {
    try {
      // For security, mask most of the token in the preview
      const maskedToken =
        authorizationToken.length > 8
          ? `${authorizationToken.substring(
              0,
              4
            )}...${authorizationToken.substring(authorizationToken.length - 4)}`
          : '***masked***';

      const curlCommand = `curl -s -H "authorization: ${maskedToken}" https://files.etereo.cloud/api/upload -F file=@${filePath} -H 'content-type: multipart/form-data' -H 'x-zipline-format: ${format}' | jq -r '.files[0].url'`;

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
                isSupported ? '🟢 Ready for upload' : '🔴 File type not supported'
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
  console.error(
    '📂 This server handles: txt, md, gpx, html, json, xml, csv, js, css, py, sh, yaml, yml, png, jpg, jpeg, gif, webp, svg, bmp, tiff'
  );
}

export { server };

main().catch((error) => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});
