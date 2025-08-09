import { readFile } from 'fs/promises';

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
  deletesAt?: string;
  password?: string;
  maxViews?: number;
  folder?: string;
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
 * - deletesAt: File expiration time (e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")
 * - password: Password protection for the uploaded file
 * - maxViews: Maximum number of views before file removal (≥ 0)
 * - folder: Target folder ID (alphanumeric, must exist)
 */
export async function uploadFile(opts: UploadOptions): Promise<string> {
  const { endpoint, token, filePath, format, timeoutMs = 30000, filenameOverride, deletesAt, password, maxViews, folder } = opts;

  if (!endpoint) throw new Error('endpoint is required');
  if (!token) throw new Error('token is required');
  if (!filePath) throw new Error('filePath is required');
  if (!format) throw new Error('format is required');

  // Validate optional headers if provided
  if (deletesAt !== undefined) validateDeletesAt(deletesAt);
  if (password !== undefined) validatePassword(password);
  if (maxViews !== undefined) validateMaxViews(maxViews);
  if (folder !== undefined) validateFolder(folder);

  // Read file content
  const data = await readFile(filePath);

  // Detect MIME type based on file extension
  const mimeType = detectMimeType(filePath);

  // Build FormData with file as Blob
  // Note: global Blob and FormData are available in Node >= 18
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
  const form = new FormData();
  // Provide a filename for the form field; server may rely on it
  const filename = filenameOverride ?? inferFilename(filePath);
  form.append('file', blob, filename);

  // Add metadata fields for Zipline to identify the file
  // Use provided metadata if available, otherwise auto-detect
  const metadata = opts.metadata || {
    originalFileName: filename,
    mimeType: mimeType,
    size: data.length
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
    if (maxViews !== undefined) headers['x-zipline-max-views'] = maxViews.toString();
    if (folder !== undefined) headers['x-zipline-folder'] = folder;

    const res = await fetch(`${endpoint}/api/upload`, {
      method: 'POST',
      headers,
      body: form as unknown as BodyInit,
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
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
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
    avi: 'video/avi'
  };

  // Additional common file types for better support
  const otherTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
    zip: 'application/zip'
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
  if (!first || typeof first.url !== 'string' || first.url.length === 0) return undefined;
  return first.url;
}

// Header validation functions
export function validateDeletesAt(deletesAt: string): void {
  if (!deletesAt || typeof deletesAt !== 'string') {
    throw new Error('deletes-at header must be a non-empty string');
  }

  // Check if it's an absolute date format
  if (deletesAt.startsWith('date=')) {
    const dateStr = deletesAt.substring(5);
    if (!dateStr) {
      throw new Error('deletes-at header with date= prefix must include a valid date');
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('deletes-at header contains invalid date format');
    }

    // Check if date is in the future
    const now = new Date();
    if (date <= now) {
      throw new Error('deletes-at header must specify a future date');
    }
  } else {
    // Parse as relative duration
    const durationRegex = /^(\d+)([dhm])$/;
    const match = deletesAt.match(durationRegex);

    if (!match) {
      throw new Error('deletes-at header must be in format like "1d", "2h", "30m" or "date=2025-01-01T00:00:00Z"');
    }

    const value = parseInt(match[1]!, 10);

    if (value <= 0) {
      throw new Error('deletes-at header duration must be positive');
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
