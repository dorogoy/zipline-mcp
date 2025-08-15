import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listUserFiles } from './userFiles.js';

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('listUserFiles', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should list user files with default parameters', async () => {
    const mockResponse = {
      page: [
        {
          id: 'file1',
          name: 'test.png',
          originalName: 'original.png',
          size: 1024,
          type: 'image/png',
          views: 5,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          favorite: false,
          url: '/u/test.png',
        },
      ],
      total: 1,
      pages: 1,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await listUserFiles({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      page: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files?page=1&perpage=15',
      {
        method: 'GET',
        headers: {
          authorization: 'test-token',
        },
      }
    );

    expect(result).toEqual(mockResponse);
  });

  it('should handle search parameters', async () => {
    const mockResponse = {
      page: [
        {
          id: 'file1',
          name: 'search-result.png',
          originalName: null,
          size: 2048,
          type: 'image/png',
          views: 0,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          favorite: false,
          maxViews: null,
          folderId: null,
          thumbnail: null,
          tags: [],
          password: null,
          url: '/u/search-result.png',
        },
      ],
      search: {
        field: 'name',
        query: 'test',
      },
      total: 1,
      pages: 1,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await listUserFiles({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      page: 1,
      searchField: 'name',
      searchQuery: 'test',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files?page=1&perpage=15&searchField=name&searchQuery=test',
      {
        method: 'GET',
        headers: {
          authorization: 'test-token',
        },
      }
    );

    expect(result).toEqual(mockResponse);
  });

  it('should handle filtering and sorting', async () => {
    const mockResponse = {
      page: [],
      total: 0,
      pages: 0,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await listUserFiles({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      page: 1,
      perpage: 10,
      filter: 'dashboard',
      favorite: true,
      sortBy: 'size',
      order: 'asc',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files?page=1&perpage=10&filter=dashboard&favorite=true&sortBy=size&order=asc',
      {
        method: 'GET',
        headers: {
          authorization: 'test-token',
        },
      }
    );
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(
      listUserFiles({
        endpoint: 'https://zipline.example.com',
        token: 'invalid-token',
        page: 1,
      })
    ).rejects.toThrow('HTTP 403: Forbidden');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      listUserFiles({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        page: 1,
      })
    ).rejects.toThrow('Network error');
  });

  it('should URL encode search queries', async () => {
    const mockResponse = { page: [], total: 0, pages: 0 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await listUserFiles({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      page: 1,
      searchField: 'name',
      searchQuery: 'file with spaces & special chars!',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'searchQuery=file+with+spaces+%26+special+chars%21'
      ),
      expect.any(Object)
    );
  });
});
