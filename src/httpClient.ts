import { readFile, rm, open } from 'fs/promises';
import http from 'http';
import https from 'https';
import { lookup } from 'dns/promises';
import type { IncomingMessage, IncomingHttpHeaders } from 'http';
import type { LookupFunction } from 'net';
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

  // Validate format header and optional headers if provided
  validateFormat(format);
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

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Resolve every address for this hop. Refuse if any answer is loopback,
 * private, link-local, or a cloud metadata address. The returned address is
 * the one the socket must use.
 */
async function resolvePinnedAddress(hostname: string): Promise<PinnedAddress> {
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new InvalidUrlError(`Host could not be resolved: ${hostname}`);
  }
  if (records.length === 0) {
    throw new InvalidUrlError(`Host could not be resolved: ${hostname}`);
  }
  for (const record of records) {
    if (isPrivateHost(record.address)) {
      throw new InvalidUrlError(
        `Access to private or local network host is forbidden: ${hostname}`
      );
    }
  }
  const first = records[0];
  if (!first) {
    throw new InvalidUrlError(`Host could not be resolved: ${hostname}`);
  }
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

function pinnedLookup(pinned: PinnedAddress): LookupFunction {
  const answer = { address: pinned.address, family: pinned.family };
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [answer]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

function headerValue(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function requestPinned(
  target: URL,
  pinned: PinnedAddress,
  signal: AbortSignal
): Promise<IncomingMessage> {
  const lib = target.protocol === 'https:' ? https : http;
  const options: https.RequestOptions = {
    protocol: target.protocol,
    hostname: pinned.address,
    family: pinned.family,
    method: 'GET',
    path: `${target.pathname}${target.search}`,
    headers: { host: target.host },
    servername: target.hostname,
    // Host is the original name. The socket stays on the pinned address.
    setHost: false,
    lookup: pinnedLookup(pinned),
    signal,
  };
  if (target.port) options.port = target.port;

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => resolve(res));
    req.on('error', reject);
    req.end();
  });
}

function toBuffer(chunk: unknown): Buffer {
  if (typeof chunk === 'string') return Buffer.from(chunk);
  return Buffer.from(chunk as Uint8Array);
}

const MAX_ERROR_BODY_BYTES = 1024 * 1024;

async function readResponseBody(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res) {
    const buf = toBuffer(chunk);
    const remaining = MAX_ERROR_BODY_BYTES - size;
    if (buf.length > remaining) {
      if (remaining > 0) chunks.push(buf.subarray(0, remaining));
      res.destroy();
      break;
    }
    chunks.push(buf);
    size += buf.length;
    if (size >= MAX_ERROR_BODY_BYTES) {
      res.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString();
}

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
    let res: IncomingMessage | null = null;
    let redirectCount = 0;

    // Every hop is resolved and pinned before the socket opens, including redirects.
    while (true) {
      if (!['http:', 'https:'].includes(currentUrl.protocol)) {
        throw new InvalidUrlError(`Unsupported scheme: ${currentUrl.protocol}`);
      }

      if (isPrivateHost(currentUrl.hostname)) {
        throw new InvalidUrlError(
          `Access to private or local network host is forbidden: ${currentUrl.hostname}`
        );
      }

      const pinned = await resolvePinnedAddress(currentUrl.hostname);
      res = await requestPinned(currentUrl, pinned, ac.signal);

      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(res.headers, 'location');
        res.resume();
        if (!location) {
          throw new HttpError(
            status,
            `Redirect status ${status} missing Location header`
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

    if (!res || (res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
      const status = res?.statusCode ?? 0;
      let bodyText = '';
      try {
        if (res) bodyText = await readResponseBody(res);
      } catch {
        // ignore
      }
      throw mapHttpStatusToMcpError(status, bodyText);
    }

    const cl = headerValue(res.headers, 'content-length');
    if (cl) {
      const declared = Number(cl);
      if (!Number.isNaN(declared) && declared > maxFileSize) {
        res.resume();
        throw new FileTooLargeError(
          `Remote file size ${declared} bytes exceeds limit of ${maxFileSize} bytes (${(maxFileSize / (1024 * 1024)).toFixed(0)}MB)`
        );
      }
    }

    let downloadedBytes = 0;
    const handle = await open(finalPath, 'w');
    try {
      for await (const chunk of res) {
        const value = toBuffer(chunk);
        downloadedBytes += value.length;
        if (downloadedBytes > maxFileSize) {
          throw new FileTooLargeError(
            `Downloaded content exceeds limit of ${maxFileSize} bytes (${(maxFileSize / (1024 * 1024)).toFixed(0)}MB)`
          );
        }
        await handle.write(value);
      }
    } catch (err) {
      res.destroy();
      throw err;
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
export function validateFormat(format: string): void {
  if (!format || typeof format !== 'string') {
    throw new Error('format header must be a non-empty string');
  }

  // Check for control characters (including newlines, carriage returns, null bytes) to prevent HTTP header injection
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(format)) {
    throw new Error('format header cannot contain control characters');
  }

  const trimmed = format.trim();
  if (!trimmed) {
    throw new Error('format header cannot be empty or whitespace only');
  }

  if (trimmed.length > 255) {
    throw new Error('format header exceeds maximum length of 255 characters');
  }
}

export function validateDeleteAt(deleteAt: string): void {
  if (!deleteAt || typeof deleteAt !== 'string') {
    throw new Error('delete-at header must be a non-empty string');
  }

  // Check for control characters (including newlines, carriage returns, null bytes) to prevent HTTP header injection
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(deleteAt)) {
    throw new Error('delete-at header cannot contain control characters');
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

  // Check for control characters (including newlines, carriage returns, null bytes) to prevent HTTP header injection
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(password)) {
    throw new Error('password header cannot contain control characters');
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

function isPrivateIPv4(p1: number, p2: number, p3: number): boolean {
  if (p1 === 0 || p1 === 127 || p1 === 10) return true; // 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8
  if (p1 === 100 && p2 >= 64 && p2 <= 127) return true; // 100.64.0.0/10 (CGNAT / Shared Address Space)
  if (p1 === 169 && p2 === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (p1 === 172 && p2 >= 16 && p2 <= 31) return true; // 172.16.0.0/12
  if (p1 === 192 && p2 === 168) return true; // 192.168.0.0/16
  if (p1 === 198 && (p2 === 18 || p2 === 19)) return true; // 198.18.0.0/15 (Benchmarking RFC 2544)
  if (p1 === 192 && p2 === 0 && (p3 === 0 || p3 === 2)) return true; // 192.0.0.0/24 (IETF Protocol), 192.0.2.0/24 (TEST-NET-1)
  if (p1 === 198 && p2 === 51 && p3 === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (p1 === 203 && p2 === 0 && p3 === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (p1 >= 224) return true; // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved/broadcast)
  return false;
}

/**
 * Security check for SSRF prevention.
 * Returns true if host is loopback, local domain alias, RFC 1918 private IP, RFC 6598 CGNAT IP, link-local, Unique Local Address (ULA), IPv4-mapped IPv6, multicast, benchmarking IP, or cloud metadata IP.
 */
export function isPrivateHost(hostname: string): boolean {
  if (!hostname) return false;
  let host = hostname
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');

  // Security: Strip IPv6 zone index / scope identifier (e.g. %eth0, %1, %25eth0)
  host = host.split('%')[0]!;

  // Security: normalize alternative IP formats (e.g., hex 0x7f000001, octal 017700000001,
  // integer 2130706433, shorthand 127.1) via URL parser normalization before inspection.
  try {
    const dummyUrl = new URL(
      `http://${host.startsWith('[') ? host : host.includes(':') ? `[${host}]` : host}`
    );
    host = dummyUrl.hostname.replace(/^\[|\]$/g, '');
  } catch {
    // Fall back to raw host if URL normalization fails
  }

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
      return isPrivateIPv4(p1, p2, p3);
    }
  }

  // IPv4-mapped, IPv4-compatible, IPv4-translated (::ffff:0:0/96), NAT64 (64:ff9b::/96 & RFC 8215 64:ff9b:1::/48), Teredo (RFC 4380 2001:0::/32), and ISATAP (RFC 5214, :5efe:) IPv6 check
  const ipv4MappedDotted =
    /^(?:64:ff9b:(?:1:)?::?|2001:(?:0*:)*::?|(?:0*:)*?(?:ffff:)?(?:0:)?|(?:[0-9a-fA-F]*:)+5efe:)\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(
      host
    );
  if (ipv4MappedDotted) {
    const p1 = Number(ipv4MappedDotted[1]);
    const p2 = Number(ipv4MappedDotted[2]);
    const p3 = Number(ipv4MappedDotted[3]);
    const p4 = Number(ipv4MappedDotted[4]);
    if (p1 <= 255 && p2 <= 255 && p3 <= 255 && p4 <= 255) {
      return isPrivateIPv4(p1, p2, p3);
    }
  }

  const ipv4MappedHex =
    /^(?:64:ff9b:(?:1:)?::?|(?:0*:)*?(?:ffff:)?(?:0:)?|(?:[0-9a-fA-F]*:)+5efe:)([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/i.exec(
      host
    );
  if (ipv4MappedHex) {
    const high = parseInt(ipv4MappedHex[1]!, 16);
    const low = parseInt(ipv4MappedHex[2]!, 16);
    if (!Number.isNaN(high) && !Number.isNaN(low)) {
      const p1 = (high >> 8) & 0xff;
      const p2 = high & 0xff;
      const p3 = (low >> 8) & 0xff;
      return isPrivateIPv4(p1, p2, p3);
    }
  }

  // Teredo RFC 4380 IPv6 check (2001:0::/32 embeds client IPv4 address in bits 96..127)
  const teredoMatch =
    /^2001:(?:0*:)*(?:[0-9a-fA-F]{1,4}:)*([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/i.exec(
      host
    );
  if (teredoMatch) {
    const rawHigh = parseInt(teredoMatch[1]!, 16);
    const rawLow = parseInt(teredoMatch[2]!, 16);
    if (!Number.isNaN(rawHigh) && !Number.isNaN(rawLow)) {
      // Check XOR-inverted hex (standard RFC 4380 Teredo)
      const xorHigh = rawHigh ^ 0xffff;
      const xorLow = rawLow ^ 0xffff;
      if (
        isPrivateIPv4(
          (xorHigh >> 8) & 0xff,
          xorHigh & 0xff,
          (xorLow >> 8) & 0xff
        )
      ) {
        return true;
      }
      // Check direct un-inverted hex
      if (
        isPrivateIPv4(
          (rawHigh >> 8) & 0xff,
          rawHigh & 0xff,
          (rawLow >> 8) & 0xff
        )
      ) {
        return true;
      }
    }
  }

  // 6to4 IPv6 check (2002::/16 embeds IPv4 address in bits 16..47)
  const sixToFourMatch =
    /^2002:(?::|([0-9a-fA-F]{1,4})(?::([0-9a-fA-F]{1,4}))?(?::|$))/i.exec(host);
  if (sixToFourMatch) {
    const high = parseInt(sixToFourMatch[1] ?? '0', 16);
    const low = parseInt(sixToFourMatch[2] ?? '0', 16);
    const p1 = (high >> 8) & 0xff;
    const p2 = high & 0xff;
    const p3 = (low >> 8) & 0xff;
    if (isPrivateIPv4(p1, p2, p3)) return true;
  }

  // General IPv6 loopback / link-local (fe80::/10) / ULA (fc00::/7) / Multicast (ff00::/8) check
  if (
    host === '::1' ||
    host === '::' ||
    /^fe[89ab][0-9a-f]:/i.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^ff[0-9a-f]{2}:/i.test(host)
  ) {
    return true;
  }

  return false;
}

export function validateOriginalName(originalName: string): void {
  if (!originalName || typeof originalName !== 'string') {
    throw new Error('originalName must be a non-empty string');
  }

  // Check for path separators or control characters (including null bytes) on raw input
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\\/]/.test(originalName)) {
    throw new Error(
      'originalName cannot contain path separators or control characters'
    );
  }

  const trimmed = originalName.trim();
  if (!trimmed) {
    throw new Error('originalName cannot be empty or whitespace only');
  }

  if (trimmed.length > 255) {
    throw new Error('originalName exceeds maximum length of 255 characters');
  }
}
