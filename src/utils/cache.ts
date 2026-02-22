import type { ListUserFilesResponse } from '../userFiles';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface FileListCacheOptions {
  ttlMs?: number;
}

export class FileListCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;

  constructor(options: FileListCacheOptions = {}) {
    this.ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : 30000;
  }

  generateKey(params: Record<string, unknown>): string {
    const filteredParams = Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    return filteredParams
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('&');
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  invalidate(key?: string): void {
    if (key !== undefined) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }
}

export const fileListCache = new FileListCache<ListUserFilesResponse>();
