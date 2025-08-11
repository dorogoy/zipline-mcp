import { readFile, writeFile, rm } from 'fs/promises';
import {
  ensureUserSandbox,
  resolveSandboxPath,
  validateFilename,
  logSandboxOperation,
} from './sandboxUtils.js';
import path from 'path';

export interface UploadOptions {
  endpoint: string;
  token: string;
  filePath: string;
  format: string;
  timeoutMs?: number;
  filenameOverride?: string;
  metadata?: {
    originalFileName: string;
    mimeType: string;
    size: number;
  };
  deletesAt?: string | undefined;
  password?: string | undefined;
  maxViews?: number | undefined;
  folder?: string | undefined;
}

export interface ZiplineUploadResponse {
  files: Array<{ url: string }>;
}

/**
 * Perform a multipart/form-data POST to Zipline /api/upload using Node 18+ built-ins (fetch, FormData, Blob).
 * - Adds minimal required headers: authorization, x-zipline-format
 * - Automatically detects file MIME type based on extension (prioritizing video formats)
 * - Includes metadata (originalFileName, mimeType, size) for Zipline identification
 * - Supports optional enhanced headers for file expiration, password protection, view limits, and folder placement
 * - Validates all headers locally before making HTTP request
 * - Follows redirects
 * - Supports timeout via AbortController
 * - Robust error handling for HTTP and network errors
 *
 * Enhanced Headers (all optional):
 * - deletesAt: File expiration time. Supports:
 *   - Relative durations: "1d" (1 day), "2h" (2 hours), "30m" (30 minutes)
 *   - Absolute dates: "date=YYYY-MM-DDTHH:mm:ssZ" (e.g., "date=2025-12-31T23:59:59Z")
 *   - Validation ensures the value is either a valid duration or ISO-8601 date.
 * - password: Protects the uploaded file with a password.
 *   - Must be a non-empty string.
 *   - Whitespace-only passwords are rejected.
 *   - Passwords are never logged or exposed in error messages for security.
 * - maxViews: Limits the number of times a file can be viewed before it becomes unavailable.
 *   - Must be a non-negative integer (≥ 0).
 *   - When the counter reaches 0, the file becomes inaccessible.
 * - folder: Specifies the ID of the folder where the upload should be placed.
 *   - Must be a non-empty alphanumeric string.
 *   - Special characters and whitespace are rejected.
 *   - If the specified folder doesn't exist, the upload will fail.
 */
export async function uploadFile(opts: UploadOptions): Promise<string> {
  const {
    endpoint,
    token,
    filePath,
    format,
    timeoutMs = 30000,
    filenameOverride,
    deletesAt,
    password,
    maxViews,
    folder,
  } = opts;

  if (!endpoint) throw new Error('endpoint is required');
  if (!token) throw new Error('token is required');
  if (!filePath) throw new Error('filePath is required');
  if (!format) throw new Error('format is required');

  // Validate optional headers if provided
  if (deletesAt !== undefined) validateDeleteAt(deletesAt);
  if (password !== undefined) validatePassword(password);
  if (maxViews !== undefined) validateMaxViews(maxViews);
  if (folder !== undefined) validateFolder(folder);

  // Read file content
  const data = await readFile(filePath);

  // Detect MIME type based on file extension
  const mimeType = detectMimeType(filePath);

  // Build FormData with file as Blob
  // Note: global Blob and FormData are available in Node >= 18
  const blob = new Blob([data as unknown as ArrayBuffer], { type: mimeType });
  const form = new FormData();
  // Provide a filename for the form field; server may rely on it
  const filename = filenameOverride ?? inferFilename(filePath);
  form.append('file', blob, filename);

  // Add metadata fields for Zipline to identify the file
  // Use provided metadata if available, otherwise auto-detect
  const metadata = opts.metadata || {
    originalFileName: filename,
    mimeType: mimeType,
    size: data.length,
  };
  form.append('originalFileName', metadata.originalFileName);
  form.append('mimeType', metadata.mimeType);
  form.append('size', metadata.size.toString());

  // Setup timeout/abort
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // Build headers object with optional headers
    const headers: Record<string, string> = {
      authorization: token,
      'x-zipline-format': format,
      // Do NOT set Content-Type; fetch will add correct boundary for FormData
    };

    // Add optional headers if provided
    if (deletesAt !== undefined) headers['x-zipline-deletes-at'] = deletesAt;
    if (password !== undefined) headers['x-zipline-password'] = password;
    if (maxViews !== undefined)
      headers['x-zipline-max-views'] = maxViews.toString();
    if (folder !== undefined) headers['x-zipline-folder'] = folder;

    const res = await fetch(`${endpoint}/api/upload`, {
      method: 'POST',
      headers,
      body: form,
      redirect: 'follow',
      signal: ac.signal,
    });

    if (!res.ok) {
      // Try to include response text in error
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      const msg = bodyText ? `: ${bodyText}` : '';
      throw new Error(`HTTP ${res.status}${msg}`);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to parse JSON response${txt ? `: ${txt}` : ''}`);
    }

    const url = extractFirstFileUrl(json);
    if (!url) {
      throw new Error('No URL returned from Zipline server');
    }
    return url;
  } catch (err) {
    // Normalize abort/timeout error message
    const msg = (
      err instanceof Error ? err.message : String(err)
    ).toLowerCase();
    if (msg.includes('abort') || msg.includes('timeout')) {
      throw new Error('Request aborted or timeout exceeded');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function detectMimeType(filePath: string): string {
  // Extract file extension and map to MIME type
  // Prioritize video formats as requested
  const ext = filePath.split('.').pop()?.toLowerCase();

  // If no extension found, return fallback
  if (!ext) return 'application/octet-stream';

  // Video format mappings with priority
  const videoTypes: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/avi',
  };

  // Additional common file types for better support
  const otherTypes: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    gpx: 'application/gpx+xml',
    html: 'text/html',
    htm: 'text/html',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    js: 'application/javascript',
    ts: 'application/typescript',
    css: 'text/css',
    py: 'text/x-python',
    sh: 'application/x-sh',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    toml: 'application/toml',
    pdf: 'application/pdf',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };

  // Check video types first (priority), then other types
  return videoTypes[ext] || otherTypes[ext] || 'application/octet-stream';
}

function inferFilename(p: string): string {
  // Minimal filename inference without importing path to keep this file dependency-light
  if (!p) return 'file';
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) || 'file' : p || 'file';
}

function extractFirstFileUrl(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const files = (json as ZiplineUploadResponse).files;
  if (!Array.isArray(files) || files.length === 0) return undefined;
  const first = files[0];
  if (!first || typeof first.url !== 'string' || first.url.length === 0)
    return undefined;
  return first.url;
}

/**
 * Download utilities and errors
 */

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class FileTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileTooLargeError';
  }
}

/**
 * Download an external URL into the user sandbox and return the absolute path.
 *
 * - Validates URL scheme (only http/https)
 * - Enforces a max file size (default 100MB)
 * - Uses AbortController for timeouts
 * - Writes file to sandbox using a safe filename
 * - Cleans up partial files on failure
 */
export interface DownloadOptions {
  timeout?: number; // milliseconds
  maxFileSizeBytes?: number;
  followRedirects?: boolean;
}

export async function downloadExternalUrl(
  urlStr: string,
  options: DownloadOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? 30_000;
  const maxFileSize = options.maxFileSizeBytes ?? 100 * 1024 * 1024; // 100MB

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new InvalidUrlError('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new InvalidUrlError(`Unsupported scheme: ${url.protocol}`);
  }

  // Derive filename from URL path
  const nameFromUrl = path.basename(url.pathname) || 'file';
  const validationError = validateFilename(nameFromUrl);
  const filename = validationError ? `download-${Date.now()}` : nameFromUrl;

  // Ensure sandbox exists and resolve final path
  await ensureUserSandbox();
  const finalPath = resolveSandboxPath(filename);

  // Setup abort/timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
    });

    if (!res.ok) {
      // Try to include statusText or body
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      const msg = bodyText
        ? `: ${bodyText}`
        : ` ${res.status} ${res.statusText || ''}`;
      throw new HttpError(res.status, `HTTP ${res.status}${msg}`);
    }

    // Check content-length header if present
    const cl = res.headers?.get?.('content-length');
    if (cl) {
      const declared = Number(cl);
      if (!Number.isNaN(declared) && declared > maxFileSize) {
        throw new FileTooLargeError(
          `Remote file size ${declared} bytes exceeds limit of ${maxFileSize} bytes (100MB)`
        );
      }
    }

    // Read body as ArrayBuffer (may throw on network errors / abort)
    const ab = await res.arrayBuffer();
    const buf = new Uint8Array(ab);

    if (buf.byteLength > maxFileSize) {
      throw new FileTooLargeError(
        `Downloaded file size ${buf.byteLength} bytes exceeds limit of ${maxFileSize} bytes (100MB)`
      );
    }

    // Write to sandbox (Uint8Array writes binary data directly)
    await writeFile(finalPath, buf);

    logSandboxOperation(
      'DOWNLOAD_SUCCESS',
      filename,
      `Bytes: ${buf.byteLength} - URL: ${urlStr}`
    );

    return finalPath;
  } catch (err) {
    // Attempt cleanup of partial file
    try {
      await rm(finalPath, { force: true });
    } catch {
      // ignore cleanup failures
    }

    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes('abort') ||
      message.toLowerCase().includes('timeout')
    ) {
      throw new Error('Download aborted or timeout exceeded');
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Header validation functions
export function validateDeleteAt(deleteAt: string): void {
  if (!deleteAt || typeof deleteAt !== 'string') {
    throw new Error('delete-at header must be a non-empty string');
  }

  // Check if it's an absolute date format
  if (deleteAt.startsWith('date=')) {
    const dateStr = deleteAt.substring(5);
    if (!dateStr) {
      throw new Error(
        'delete-at header with date= prefix must include a valid date'
      );
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('delete-at header contains invalid date format');
    }

    // Check if date is in the future
    const now = new Date();
    if (date <= now) {
      throw new Error('delete-at header must specify a future date');
    }
  } else {
    // Parse as relative duration
    const durationRegex = /^(\d+)([dhm])$/;
    const match = deleteAt.match(durationRegex);

    if (!match) {
      throw new Error(
        'delete-at header must be in format like "1d", "2h", "30m" or "date=2025-01-01T00:00:00Z"'
      );
    }

    const value = parseInt(match[1]!, 10);

    if (value <= 0) {
      throw new Error('delete-at header duration must be positive');
    }
  }
}

export function validatePassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new Error('password header must be a non-empty string');
  }

  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error('password header cannot be empty or whitespace only');
  }
}

export function validateMaxViews(maxViews: number): void {
  if (typeof maxViews !== 'number' || !Number.isInteger(maxViews)) {
    throw new Error('max-views header must be an integer');
  }

  if (maxViews < 0) {
    throw new Error('max-views header must be a non-negative integer');
  }
}

export function validateFolder(folder: string): void {
  if (!folder || typeof folder !== 'string') {
    throw new Error('folder header must be a non-empty string');
  }

  const trimmed = folder.trim();
  if (!trimmed) {
    throw new Error('folder header cannot be empty or whitespace only');
  }

  // Check for valid characters (alphanumeric only)
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    throw new Error('folder header must contain only alphanumeric characters');
  }
}
