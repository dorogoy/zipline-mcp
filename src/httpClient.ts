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
}

export interface ZiplineUploadResponse {
  files: Array<{ url: string }>;
}

/**
 * Perform a multipart/form-data POST to Zipline /api/upload using Node 18+ built-ins (fetch, FormData, Blob).
 * - Adds minimal required headers: authorization, x-zipline-format
 * - Automatically detects file MIME type based on extension (prioritizing video formats)
 * - Includes metadata (originalFileName, mimeType, size) for Zipline identification
 * - Follows redirects
 * - Supports timeout via AbortController
 * - Robust error handling for HTTP and network errors
 */
export async function uploadFile(opts: UploadOptions): Promise<string> {
  const { endpoint, token, filePath, format, timeoutMs = 30000, filenameOverride } = opts;

  if (!endpoint) throw new Error('endpoint is required');
  if (!token) throw new Error('token is required');
  if (!filePath) throw new Error('filePath is required');
  if (!format) throw new Error('format is required');

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
    const res = await fetch(`${endpoint}/api/upload`, {
      method: 'POST',
      headers: {
        authorization: token,
        'x-zipline-format': format,
        // Do NOT set Content-Type; fetch will add correct boundary for FormData
      } as Record<string, string>,
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
