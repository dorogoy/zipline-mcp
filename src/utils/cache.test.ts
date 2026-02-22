import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileListCache, type CacheEntry } from './cache';
import type { ListUserFilesResponse } from '../userFiles';

describe('FileListCache', () => {
  let cache: FileListCache<ListUserFilesResponse>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new FileListCache<ListUserFilesResponse>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CacheEntry interface', () => {
    it('should store data with timestamp', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      const entry = (
        cache as unknown as {
          cache: Map<string, CacheEntry<ListUserFilesResponse>>;
        }
      ).cache.get(key);
      expect(entry).toBeDefined();
      expect(entry?.data).toEqual(testData);
      expect(entry?.timestamp).toBe(Date.now());
    });
  });

  describe('constructor and TTL', () => {
    it('should use default TTL of 30 seconds', () => {
      const defaultCache = new FileListCache<ListUserFilesResponse>();
      expect((defaultCache as unknown as { ttlMs: number }).ttlMs).toBe(30000);
    });

    it('should accept custom TTL via options', () => {
      const customCache = new FileListCache<ListUserFilesResponse>({
        ttlMs: 60000,
      });
      expect((customCache as unknown as { ttlMs: number }).ttlMs).toBe(60000);
    });

    it('should handle zero TTL option by using default', () => {
      const zeroTtlCache = new FileListCache<ListUserFilesResponse>({
        ttlMs: 0,
      });
      expect((zeroTtlCache as unknown as { ttlMs: number }).ttlMs).toBe(30000);
    });
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same parameters', () => {
      const params = { page: 1, perpage: 15 };
      const key1 = cache.generateKey(params);
      const key2 = cache.generateKey(params);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const key1 = cache.generateKey({ page: 1 });
      const key2 = cache.generateKey({ page: 2 });
      expect(key1).not.toBe(key2);
    });

    it('should sort keys for consistent key generation', () => {
      const key1 = cache.generateKey({ page: 1, perpage: 15 });
      const key2 = cache.generateKey({ perpage: 15, page: 1 });
      expect(key1).toBe(key2);
    });

    it('should handle all list_user_files parameters', () => {
      const params = {
        page: 1,
        perpage: 10,
        filter: 'all',
        favorite: true,
        sortBy: 'createdAt',
        order: 'desc',
        searchField: 'name',
        searchQuery: 'test',
      };
      const key = cache.generateKey(params);
      expect(key).toContain('page');
      expect(key).toContain('perpage');
      expect(key).toContain('filter');
      expect(key).toContain('favorite');
    });
  });

  describe('get', () => {
    it('should return null on cache miss', () => {
      const result = cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should return cached data on cache hit', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      const result = cache.get(key);
      expect(result).toEqual(testData);
    });

    it('should return cached data within TTL', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      vi.advanceTimersByTime(29999);

      const result = cache.get(key);
      expect(result).toEqual(testData);
    });

    it('should return null after TTL expires', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      vi.advanceTimersByTime(30001);

      const result = cache.get(key);
      expect(result).toBeNull();
    });

    it('should remove expired entry from cache', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      vi.advanceTimersByTime(30001);
      cache.get(key);

      const internalCache = (
        cache as unknown as {
          cache: Map<string, CacheEntry<ListUserFilesResponse>>;
        }
      ).cache;
      expect(internalCache.has(key)).toBe(false);
    });
  });

  describe('set', () => {
    it('should store data with current timestamp', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const now = Date.now();
      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      const entry = (
        cache as unknown as {
          cache: Map<string, CacheEntry<ListUserFilesResponse>>;
        }
      ).cache.get(key);
      expect(entry?.timestamp).toBe(now);
    });

    it('should overwrite existing entry with same key', () => {
      const testData1: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test1.png',
            url: '/test1.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };
      const testData2: ListUserFilesResponse = {
        page: [
          {
            id: '2',
            name: 'test2.png',
            url: '/test2.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData1);
      cache.set(key, testData2);

      const result = cache.get(key);
      expect(result).toEqual(testData2);
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific key', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key1 = cache.generateKey({ page: 1 });
      const key2 = cache.generateKey({ page: 2 });
      cache.set(key1, testData);
      cache.set(key2, testData);

      cache.invalidate(key1);

      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).toEqual(testData);
    });

    it('should invalidate all entries when no key provided', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key1 = cache.generateKey({ page: 1 });
      const key2 = cache.generateKey({ page: 2 });
      cache.set(key1, testData);
      cache.set(key2, testData);

      cache.invalidate();

      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).toBeNull();
    });

    it('should handle invalidating non-existent key gracefully', () => {
      expect(() => cache.invalidate('non-existent-key')).not.toThrow();
    });

    it('should clear all entries from internal map', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      cache.set('key1', testData);
      cache.set('key2', testData);
      cache.set('key3', testData);

      cache.invalidate();

      const internalCache = (
        cache as unknown as {
          cache: Map<string, CacheEntry<ListUserFilesResponse>>;
        }
      ).cache;
      expect(internalCache.size).toBe(0);
    });
  });

  describe('isExpired helper', () => {
    it('should identify fresh entries as not expired', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      vi.advanceTimersByTime(1000);

      expect(cache.get(key)).toEqual(testData);
    });

    it('should identify entries at TTL boundary as expired', () => {
      const testData: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test.png',
            url: '/test.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData);

      vi.advanceTimersByTime(30001);

      expect(cache.get(key)).toBeNull();
    });
  });

  describe('concurrent cache access', () => {
    it('should handle multiple set operations on same key', () => {
      const testData1: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test1.png',
            url: '/test1.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };
      const testData2: ListUserFilesResponse = {
        page: [
          {
            id: '2',
            name: 'test2.png',
            url: '/test2.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData1);
      cache.set(key, testData2);

      expect(cache.get(key)).toEqual(testData2);
    });

    it('should handle interleaved get and set operations', () => {
      const testData1: ListUserFilesResponse = {
        page: [
          {
            id: '1',
            name: 'test1.png',
            url: '/test1.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };
      const testData2: ListUserFilesResponse = {
        page: [
          {
            id: '2',
            name: 'test2.png',
            url: '/test2.png',
          } as ListUserFilesResponse['page'][0],
        ],
        total: 1,
        pages: 1,
      };

      const key = cache.generateKey({ page: 1 });
      cache.set(key, testData1);
      const result1 = cache.get(key);
      cache.set(key, testData2);
      const result2 = cache.get(key);

      expect(result1).toEqual(testData1);
      expect(result2).toEqual(testData2);
    });
  });

  describe('cache key generation from different parameters', () => {
    it('should generate unique keys for different page values', () => {
      const key1 = cache.generateKey({ page: 1 });
      const key2 = cache.generateKey({ page: 2 });
      expect(key1).not.toBe(key2);
    });

    it('should generate unique keys for different filter values', () => {
      const key1 = cache.generateKey({ page: 1, filter: 'all' });
      const key2 = cache.generateKey({ page: 1, filter: 'dashboard' });
      expect(key1).not.toBe(key2);
    });

    it('should generate unique keys for different search queries', () => {
      const key1 = cache.generateKey({ page: 1, searchQuery: 'test1' });
      const key2 = cache.generateKey({ page: 1, searchQuery: 'test2' });
      expect(key1).not.toBe(key2);
    });

    it('should handle undefined parameters in key generation', () => {
      const key1 = cache.generateKey({ page: 1, perpage: undefined });
      const key2 = cache.generateKey({ page: 1 });
      expect(key1).toBe(key2);
    });
  });
});
