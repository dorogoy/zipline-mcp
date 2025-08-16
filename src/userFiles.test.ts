import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listUserFiles,
  getUserFile,
  updateUserFile,
  deleteUserFile,
  normalizeUrl,
} from './userFiles.js';

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('normalizeUrl', () => {
  it('should handle base URL without trailing slash and path with leading slash', () => {
    const result = normalizeUrl('https://example.com', '/u/file123');
    expect(result).toBe('https://example.com/u/file123');
  });

  it('should handle base URL with trailing slash and path with leading slash', () => {
    const result = normalizeUrl('https://example.com/', '/u/file123');
    expect(result).toBe('https://example.com/u/file123');
  });

  it('should handle base URL without trailing slash and path without leading slash', () => {
    const result = normalizeUrl('https://example.com', 'u/file123');
    expect(result).toBe('https://example.com/u/file123');
  });

  it('should handle base URL with trailing slash and path without leading slash', () => {
    const result = normalizeUrl('https://example.com/', 'u/file123');
    expect(result).toBe('https://example.com/u/file123');
  });

  it('should handle base URL with complex path and trailing slash', () => {
    const result = normalizeUrl('https://example.com/api/', '/u/file123');
    expect(result).toBe('https://example.com/api/u/file123');
  });

  it('should handle base URL with complex path without trailing slash', () => {
    const result = normalizeUrl('https://example.com/api', '/u/file123');
    expect(result).toBe('https://example.com/api/u/file123');
  });

  it('should handle base URL without protocol', () => {
    const result = normalizeUrl('example.com', '/u/file123');
    expect(result).toBe('https://example.com/u/file123');
  });

  it('should handle fallback for invalid URL', () => {
    // This will trigger the fallback path (URL with spaces is invalid)
    const result = normalizeUrl('invalid url with spaces', '/u/file123');
    expect(result).toBe('invalid url with spaces/u/file123');
  });
});

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

    // Check that the URL is normalized in the response
    expect(result.page?.[0]?.url).toBe(
      'https://zipline.example.com/u/test.png'
    );
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

    // Check that the URL is normalized in the response
    expect(result.page?.[0]?.url).toBe(
      'https://zipline.example.com/u/search-result.png'
    );
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

describe('getUserFile', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should get a single file by ID', async () => {
    const mockFile = {
      id: 'file123',
      name: 'test.png',
      originalName: 'original.png',
      size: 1024,
      type: 'image/png',
      views: 5,
      maxViews: null,
      favorite: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletesAt: null,
      folderId: null,
      thumbnail: null,
      tags: [],
      password: null,
      url: '/u/test.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFile),
    });

    const result = await getUserFile({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      id: 'file123',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files/file123',
      {
        method: 'GET',
        headers: {
          authorization: 'test-token',
        },
      }
    );

    // Check that the URL is normalized in the response
    expect(result.url).toBe('https://zipline.example.com/u/test.png');
  });

  it('should URL encode file IDs with special characters', async () => {
    const mockFile = {
      id: 'file-with-special-chars',
      name: 'test.png',
      originalName: null,
      size: 1024,
      type: 'image/png',
      views: 0,
      maxViews: null,
      favorite: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletesAt: null,
      folderId: null,
      thumbnail: null,
      tags: [],
      password: null,
      url: '/u/test.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFile),
    });

    await getUserFile({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      id: 'file with spaces & special chars!',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files/file%20with%20spaces%20%26%20special%20chars!',
      expect.any(Object)
    );
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('File not found'),
    });

    await expect(
      getUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'nonexistent',
      })
    ).rejects.toThrow('HTTP 404: File not found');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      getUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('Network error');
  });

  it('should validate required parameters', async () => {
    await expect(
      getUserFile({
        endpoint: '',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('endpoint is required');

    await expect(
      getUserFile({
        endpoint: 'https://zipline.example.com',
        token: '',
        id: 'file123',
      })
    ).rejects.toThrow('token is required');

    await expect(
      getUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: '',
      })
    ).rejects.toThrow('id is required');
  });

  it('should validate response format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ invalid: 'response' }),
    });

    await expect(
      getUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('Invalid response format from Zipline server');
  });
});

describe('updateUserFile', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should update file properties', async () => {
    const mockFile = {
      id: 'file123',
      name: 'test.png',
      originalName: 'updated.png',
      size: 1024,
      type: 'image/png',
      views: 5,
      maxViews: 100,
      favorite: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletesAt: null,
      folderId: null,
      thumbnail: null,
      tags: ['tag1', 'tag2'],
      password: null,
      url: '/u/test.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFile),
    });

    const result = await updateUserFile({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      id: 'file123',
      favorite: true,
      maxViews: 100,
      originalName: 'updated.png',
      tags: ['tag1', 'tag2'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files/file123',
      {
        method: 'PATCH',
        headers: {
          authorization: 'test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          favorite: true,
          maxViews: 100,
          originalName: 'updated.png',
          tags: ['tag1', 'tag2'],
        }),
      }
    );

    // Check that the URL is not included in the response
    expect(result.url).toBeUndefined();
  });

  it('should handle removing password by setting to null', async () => {
    const mockFile = {
      id: 'file123',
      name: 'test.png',
      originalName: null,
      size: 1024,
      type: 'image/png',
      views: 5,
      maxViews: null,
      favorite: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletesAt: null,
      folderId: null,
      thumbnail: null,
      tags: [],
      password: null,
      url: '/u/test.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFile),
    });

    await updateUserFile({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      id: 'file123',
      password: null,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files/file123',
      {
        method: 'PATCH',
        headers: {
          authorization: 'test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: null,
        }),
      }
    );
  });

  it('should require at least one field to update', async () => {
    await expect(
      updateUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('At least one field to update is required');
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid request'),
    });

    await expect(
      updateUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
        favorite: true,
      })
    ).rejects.toThrow('HTTP 400: Invalid request');
  });

  it('should validate required parameters', async () => {
    await expect(
      updateUserFile({
        endpoint: '',
        token: 'test-token',
        id: 'file123',
        favorite: true,
      })
    ).rejects.toThrow('endpoint is required');

    await expect(
      updateUserFile({
        endpoint: 'https://zipline.example.com',
        token: '',
        id: 'file123',
        favorite: true,
      })
    ).rejects.toThrow('token is required');

    await expect(
      updateUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: '',
        favorite: true,
      })
    ).rejects.toThrow('id is required');
  });
});

describe('deleteUserFile', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should delete a file', async () => {
    const mockFile = {
      id: 'file123',
      name: 'test.png',
      originalName: 'original.png',
      size: 1024,
      type: 'image/png',
      views: 5,
      maxViews: null,
      favorite: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletesAt: null,
      folderId: null,
      thumbnail: null,
      tags: [],
      password: null,
      url: '/u/test.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFile),
    });

    const result = await deleteUserFile({
      endpoint: 'https://zipline.example.com',
      token: 'test-token',
      id: 'file123',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zipline.example.com/api/user/files/file123',
      {
        method: 'DELETE',
        headers: {
          authorization: 'test-token',
        },
      }
    );

    // Check that the URL is not included in the response
    expect(result.url).toBeUndefined();
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('File not found'),
    });

    await expect(
      deleteUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'nonexistent',
      })
    ).rejects.toThrow('HTTP 404: File not found');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      deleteUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('Network error');
  });

  it('should validate required parameters', async () => {
    await expect(
      deleteUserFile({
        endpoint: '',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('endpoint is required');

    await expect(
      deleteUserFile({
        endpoint: 'https://zipline.example.com',
        token: '',
        id: 'file123',
      })
    ).rejects.toThrow('token is required');

    await expect(
      deleteUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: '',
      })
    ).rejects.toThrow('id is required');
  });

  it('should validate response format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ invalid: 'response' }),
    });

    await expect(
      deleteUserFile({
        endpoint: 'https://zipline.example.com',
        token: 'test-token',
        id: 'file123',
      })
    ).rejects.toThrow('Invalid response format from Zipline server');
  });
});
