import { readFile, rm, open } from 'fs/promises';
import {
  ensureUserSandbox,
  resolveSandboxPath,
  validateFilename,
  logSandboxOperation,
} from './sandboxUtils.js';
import path from 'path';
import mime from 'mime-types';
import { mapHttpStatusToMcpError } from './utils/errorMapper.js';

export interface UploadOptions {
  endpoint: string;
  token: string;
  filePath: string;
  fileContent?: Buffer;
  format: string;
  timeoutMs?: number;
  filenameOverride?: string;
  originalName?: string | undefined;
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
 * - Supports optional original filename header for download preservation
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
 * - originalName: Original filename to preserve during download.
 *   - Sent as the "x-zipline-original-name" header to the Zipline server.
 *   - The original filename will be used when downloading the file, not when storing it.
 *   - Must be a non-empty string without path separators.
 *   - Path separators (/ and \) are rejected for security reasons.
 */
export async function uploadFile(opts: UploadOptions): Promise<string> {
  const {
    endpoint,
    token,
    filePath,
    fileContent,
    format,
    timeoutMs = 30000,
    filenameOverride,
    originalName,
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
  if (originalName !== undefined) validateOriginalName(originalName);

  // Read file content
  const data = fileContent || (await readFile(filePath));

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
    if (originalName !== undefined)
      headers['x-zipline-original-name'] = originalName;

    const res = await fetch(`${endpoint}/api/upload`, {
      method: 'POST',
      headers,
      body: form,
      redirect: 'follow',
      signal: ac.signal,
    });

    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      throw mapHttpStatusToMcpError(res.status, bodyText);
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
  // Use mime-types library to detect MIME type by file extension
  const mimeType = mime.lookup(filePath);
  return typeof mimeType === 'string' ? mimeType : 'application/octet-stream';
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

/**
 * Note: URL string checking provides early SSRF validation against obvious private targets.
 * Note that DNS-level resolution/rebinding is not prevented by URL string checks alone.
 */
export async function downloadExternalUrl(
  urlStr: string,
  options: DownloadOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? 30_000;
  const maxFileSize = options.maxFileSizeBytes ?? 100 * 1024 * 1024; // 100MB
  const maxRedirects = 5;

  let currentUrl: URL;
  try {
    currentUrl = new URL(urlStr);
  } catch {
    throw new InvalidUrlError('Invalid URL');
  }

  // Setup abort/timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  // Derive filename from initial URL path
  const nameFromUrl = path.basename(currentUrl.pathname) || 'file';
  const validationError = validateFilename(nameFromUrl);
  const filename = validationError ? `download-${Date.now()}` : nameFromUrl;

  // Ensure sandbox exists and resolve final path
  await ensureUserSandbox();
  const finalPath = resolveSandboxPath(filename);

  try {
    let res: Response | null = null;
    let redirectCount = 0;

    // Manual redirect loop to re-validate URL scheme and SSRF checks on every redirect hop
    while (true) {
      if (!['http:', 'https:'].includes(currentUrl.protocol)) {
        throw new InvalidUrlError(`Unsupported scheme: ${currentUrl.protocol}`);
      }

      // Security: SSRF prevention check for loopback, private IP ranges, and cloud metadata IPs
      if (isPrivateHost(currentUrl.hostname)) {
        throw new InvalidUrlError(
          `Access to private or local network host is forbidden: ${currentUrl.hostname}`
        );
      }

      res = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          throw new HttpError(
            res.status,
            `Redirect status ${res.status} missing Location header`
          );
        }
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error('Too many redirects');
        }
        try {
          currentUrl = new URL(location, currentUrl);
        } catch {
          throw new InvalidUrlError(`Invalid redirect URL: ${location}`);
        }
        continue;
      }

      break;
    }

    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      throw mapHttpStatusToMcpError(res.status, bodyText);
    }

    // Check content-length header if present
    const cl = res.headers?.get?.('content-length');
    if (cl) {
      const declared = Number(cl);
      if (!Number.isNaN(declared) && declared > maxFileSize) {
        throw new FileTooLargeError(
          `Remote file size ${declared} bytes exceeds limit of ${maxFileSize} bytes (${(maxFileSize / (1024 * 1024)).toFixed(0)}MB)`
        );
      }
    }

    // Streaming download to disk to prevent memory exhaustion (OOM)
    if (!res.body) {
      throw new Error('Response body is null');
    }

    let downloadedBytes = 0;
    const handle = await open(finalPath, 'w');
    try {
      // res.body is a ReadableStream (Web Stream) in Node 18+ fetch
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloadedBytes += value.length;
        if (downloadedBytes > maxFileSize) {
          throw new FileTooLargeError(
            `Downloaded content exceeds limit of ${maxFileSize} bytes (${(maxFileSize / (1024 * 1024)).toFixed(0)}MB)`
          );
        }
        await handle.write(value);
      }
    } finally {
      await handle.close();
    }

    logSandboxOperation(
      'DOWNLOAD_SUCCESS',
      filename,
      `Bytes: ${downloadedBytes} - URL: ${urlStr}`
    );

    return finalPath;
  } catch (err) {
    // Attempt cleanup of partial file
    if (finalPath) {
      try {
        await rm(finalPath, { force: true });
      } catch {
        // ignore cleanup failures
      }
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

  if (trimmed.length > 512) {
    throw new Error('password header exceeds maximum length of 512 characters');
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

  // Check for valid characters (alphanumeric, hyphen, underscore)
  if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
    throw new Error(
      'folder header must contain only alphanumeric characters, hyphens, or underscores'
    );
  }

  if (trimmed.length > 255) {
    throw new Error('folder header exceeds maximum length of 255 characters');
  }
}

function isPrivateIPv4(p1: number, p2: number): boolean {
  if (p1 === 0 || p1 === 127 || p1 === 10) return true; // 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8
  if (p1 === 169 && p2 === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (p1 === 172 && p2 >= 16 && p2 <= 31) return true; // 172.16.0.0/12
  if (p1 === 192 && p2 === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Security check for SSRF prevention.
 * Returns true if host is loopback, local domain alias, RFC 1918 private IP, link-local, IPv4-mapped IPv6, or cloud metadata IP.
 */
export function isPrivateHost(hostname: string): boolean {
  if (!hostname) return false;
  let host = hostname
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');
  // Strip trailing dots (e.g. "localhost." -> "localhost")
  host = host.replace(/\.+$/, '');

  // Local hostnames and domain aliases (RFC 6761)
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost.localdomain') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 dotted-decimal check
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const p1 = Number(ipv4Match[1]);
    const p2 = Number(ipv4Match[2]);
    const p3 = Number(ipv4Match[3]);
    const p4 = Number(ipv4Match[4]);
    if (p1 <= 255 && p2 <= 255 && p3 <= 255 && p4 <= 255) {
      return isPrivateIPv4(p1, p2);
    }
  }

  // IPv4-mapped or IPv4-compatible IPv6 check (e.g., ::ffff:127.0.0.1, ::ffff:7f00:1, ::127.0.0.1, ::7f00:1)
  const ipv4MappedDotted =
    /^(?:0*:)*?(?:ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(
      host
    );
  if (ipv4MappedDotted) {
    const p1 = Number(ipv4MappedDotted[1]);
    const p2 = Number(ipv4MappedDotted[2]);
    const p3 = Number(ipv4MappedDotted[3]);
    const p4 = Number(ipv4MappedDotted[4]);
    if (p1 <= 255 && p2 <= 255 && p3 <= 255 && p4 <= 255) {
      return isPrivateIPv4(p1, p2);
    }
  }

  const ipv4MappedHex =
    /^(?:0*:)*?(?:ffff:)?([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/i.exec(host);
  if (ipv4MappedHex) {
    const high = parseInt(ipv4MappedHex[1]!, 16);
    const low = parseInt(ipv4MappedHex[2]!, 16);
    if (!Number.isNaN(high) && !Number.isNaN(low)) {
      const p1 = (high >> 8) & 0xff;
      const p2 = high & 0xff;
      return isPrivateIPv4(p1, p2);
    }
  }

  // General IPv6 loopback / link-local / ULA check
  if (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd00:')
  ) {
    return true;
  }

  return false;
}

export function validateOriginalName(originalName: string): void {
  if (!originalName || typeof originalName !== 'string') {
    throw new Error('originalName must be a non-empty string');
  }

  const trimmed = originalName.trim();
  if (!trimmed) {
    throw new Error('originalName cannot be empty or whitespace only');
  }

  // Check for path separators or control characters (including null bytes)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\\/]/.test(trimmed)) {
    throw new Error(
      'originalName cannot contain path separators or control characters'
    );
  }

  if (trimmed.length > 255) {
    throw new Error('originalName exceeds maximum length of 255 characters');
  }
}
