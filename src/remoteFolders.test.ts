import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFolders, Folder, ListFoldersOptions } from './remoteFolders';

// Mock fetch function
global.fetch = vi.fn();

describe('listFolders', () => {
  const mockEndpoint = 'https://zipline.example.com';
  const mockToken = 'test-token';
  const mockFolders: Folder[] = [
    { id: '1', name: 'Folder 1' },
    { id: '2', name: 'Folder 2' },
    { name: 'Folder without ID' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return a list of folders on successful API call', async () => {
    // Arrange
    const mockResponse: Folder[] = mockFolders;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act
    const result = await listFolders(options);

    // Assert
    expect(result).toEqual(mockFolders);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'GET',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
    });
  });

  it('should include page parameter when provided', async () => {
    // Arrange
    const mockResponse: Folder[] = mockFolders;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      page: 2,
    };

    // Act
    await listFolders(options);

    // Assert
    expect(fetch).toHaveBeenCalledWith(
      `${mockEndpoint}/api/user/folders?page=2`,
      {
        method: 'GET',
        headers: {
          authorization: mockToken,
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should include noincl parameter when provided', async () => {
    // Arrange
    const mockResponse: Folder[] = mockFolders;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      noincl: true,
    };

    // Act
    await listFolders(options);

    // Assert
    expect(fetch).toHaveBeenCalledWith(
      `${mockEndpoint}/api/user/folders?noincl=true`,
      {
        method: 'GET',
        headers: {
          authorization: mockToken,
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should include both page and noincl parameters when provided', async () => {
    // Arrange
    const mockResponse: Folder[] = mockFolders;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      page: 3,
      noincl: false,
    };

    // Act
    await listFolders(options);

    // Assert
    expect(fetch).toHaveBeenCalledWith(
      `${mockEndpoint}/api/user/folders?page=3&noincl=false`,
      {
        method: 'GET',
        headers: {
          authorization: mockToken,
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should handle folders without IDs gracefully', async () => {
    // Arrange
    const foldersWithoutIds: Folder[] = [
      { name: 'Folder without ID 1' },
      { name: 'Folder without ID 2' },
    ];

    const mockResponse: Folder[] = foldersWithoutIds;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act
    const result = await listFolders(options);

    // Assert
    expect(result).toEqual(foldersWithoutIds);
    expect(result[0]?.id).toBeUndefined();
    expect(result[1]?.id).toBeUndefined();
  });

  it('should throw an error when API response is not OK', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act & Assert
    await expect(listFolders(options)).rejects.toThrow(
      'Failed to list folders: 401 Unauthorized'
    );
  });

  it('should throw an error when API response is invalid JSON', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve(); // Add await to satisfy linter
        throw new Error('Invalid JSON');
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act & Assert
    await expect(listFolders(options)).rejects.toThrow('Invalid JSON');
  });

  it('should throw an error when API response does not match schema', async () => {
    // Arrange
    const invalidResponse = {
      invalidField: 'invalid',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return invalidResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act & Assert
    await expect(listFolders(options)).rejects.toThrow();
  });

  it('should handle empty folders array', async () => {
    // Arrange
    const mockResponse: Folder[] = [];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockResponse;
      },
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    // Act
    const result = await listFolders(options);

    // Assert
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });
});
