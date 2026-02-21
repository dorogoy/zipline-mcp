import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listFolders,
  Folder,
  ListFoldersOptions,
  createFolder,
  CreateFolderOptions,
  editFolder,
  EditFolderOptions,
  EditFolderPropertiesRequestSchema,
  AddFileToFolderRequestSchema,
  getFolder,
  deleteFolder,
} from './remoteFolders';
import { McpErrorCode } from './utils/errorMapper';

// Mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('listFolders', () => {
  const mockEndpoint = 'https://zipline.example.com';
  const mockToken = 'test-token';
  const mockFolders = [
    {
      id: '1',
      name: 'Folder 1',
      public: false,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: 'Folder 2',
      public: true,
      createdAt: '2023-01-02T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
      files: [
        {
          id: 'file1',
          name: 'file1.txt',
          originalName: 'file1.txt',
          size: 1024,
          type: 'text/plain',
          url: 'https://zipline.example.com/file1',
          createdAt: '2023-01-01T00:00:00Z',
          expiresAt: null,
          maxViews: null,
          views: 0,
          favorite: false,
          tags: [],
        },
      ],
    },
    {
      name: 'Folder without ID',
      public: false,
      createdAt: '2023-01-03T00:00:00Z',
      updatedAt: '2023-01-03T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return a list of folders on successful API call', async () => {
    // Arrange
    const mockResponse = mockFolders;

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
    expect(result).toEqual([
      {
        id: '1',
        name: 'Folder 1',
        public: false,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'Folder 2',
        public: true,
        createdAt: '2023-01-02T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
        files: ['file1'],
      },
      {
        name: 'Folder without ID',
        public: false,
        createdAt: '2023-01-03T00:00:00Z',
        updatedAt: '2023-01-03T00:00:00Z',
      },
    ]);
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
    const mockResponse = mockFolders;

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
    const mockResponse = mockFolders;

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
    const mockResponse = mockFolders;

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
    const foldersWithoutIds = [
      {
        name: 'Folder without ID 1',
        public: false,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
      {
        name: 'Folder without ID 2',
        public: true,
        createdAt: '2023-01-02T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
      },
    ];

    const mockResponse = foldersWithoutIds;

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

  it('should throw ZiplineError with MCP error code on HTTP 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    await expect(listFolders(options)).rejects.toMatchObject({
      mcpCode: McpErrorCode.UNAUTHORIZED_ACCESS,
      httpStatus: 401,
    });
  });

  it('should throw ZiplineError with MCP error code on HTTP 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    await expect(listFolders(options)).rejects.toMatchObject({
      mcpCode: McpErrorCode.RESOURCE_NOT_FOUND,
      httpStatus: 404,
    });
  });

  it('should throw ZiplineError with MCP error code on HTTP 429', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    await expect(listFolders(options)).rejects.toMatchObject({
      mcpCode: McpErrorCode.RATE_LIMIT_EXCEEDED,
      httpStatus: 429,
    });
  });

  it('should throw ZiplineError with MCP error code on HTTP 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as unknown as Response);

    const options: ListFoldersOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
    };

    await expect(listFolders(options)).rejects.toMatchObject({
      mcpCode: McpErrorCode.INTERNAL_ZIPLINE_ERROR,
      httpStatus: 500,
    });
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
    const mockResponse: unknown[] = [];

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

describe('createFolder', () => {
  const mockEndpoint = 'https://zipline.example.com';
  const mockToken = 'test-token';
  const mockFolder: Folder = { id: '123', name: 'New Folder' };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create a folder with minimal parameters', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(mockFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Folder', isPublic: false }),
    });
  });

  it('should create a folder with isPublic parameter', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
      isPublic: true,
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(mockFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Folder', isPublic: true }),
    });
  });

  it('should create a folder with files parameter', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
      files: ['file1', 'file2'],
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(mockFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'New Folder',
        isPublic: false,
        files: ['file1', 'file2'],
      }),
    });
  });

  it('should create a folder with all parameters', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
      isPublic: true,
      files: ['file1', 'file2'],
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(mockFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'New Folder',
        isPublic: true,
        files: ['file1', 'file2'],
      }),
    });
  });

  it('should throw ZiplineError with MCP error code when API response is not OK', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => {
        await Promise.resolve();
        return { message: 'Missing folder name' };
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
    };

    // Act & Assert
    await expect(createFolder(options)).rejects.toMatchObject({
      mcpCode: McpErrorCode.INTERNAL_ZIPLINE_ERROR,
      httpStatus: 400,
    });
  });

  it('should throw an error when API response is invalid JSON', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        throw new Error('Invalid JSON');
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
    };

    // Act & Assert
    await expect(createFolder(options)).rejects.toThrow('Invalid JSON');
  });

  it('should throw a validation error when folder name is empty', async () => {
    // Arrange
    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: '', // Empty name
    };

    // Act & Assert
    await expect(createFolder(options)).rejects.toThrow(
      'Folder name is required'
    );
  });

  it('should handle folder without ID gracefully', async () => {
    // Arrange
    const folderWithoutId: Folder = { name: 'Folder without ID' };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return folderWithoutId;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'Folder without ID',
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(folderWithoutId);
    expect(result.id).toBeUndefined();
  });

  it('should create a folder named "test" with default isPublic false', async () => {
    // Arrange
    const testFolder: Folder = { id: '456', name: 'test' };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return testFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'test',
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(testFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'test', isPublic: false }),
    });
  });

  it('should create a folder with explicit isPublic false', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        await Promise.resolve();
        return mockFolder;
      },
    } as unknown as Response);

    const options: CreateFolderOptions = {
      endpoint: mockEndpoint,
      token: mockToken,
      name: 'New Folder',
      isPublic: false,
    };

    // Act
    const result = await createFolder(options);

    // Assert
    expect(result).toEqual(mockFolder);
    expect(fetch).toHaveBeenCalledWith(`${mockEndpoint}/api/user/folders`, {
      method: 'POST',
      headers: {
        authorization: mockToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Folder', isPublic: false }),
    });
  });
});

// Add tests for editFolder function
describe('editFolder', () => {
  const mockEndpoint = 'https://zipline.example.com';
  const mockToken = 'test-token';
  const mockFolderId = 'folder123';
  const mockFolder: Folder = { id: mockFolderId, name: 'Test Folder' };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('PATCH - Update folder properties', () => {
    it('should update folder name', async () => {
      // Arrange
      const updatedFolder = { ...mockFolder, name: 'Updated Folder Name' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(updatedFolder),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        name: 'Updated Folder Name',
      };

      // Act
      const result = await editFolder(options);

      // Assert
      expect(result).toEqual(updatedFolder);
      expect(fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/api/user/folders/${mockFolderId}`,
        {
          method: 'PATCH',
          headers: {
            authorization: mockToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Updated Folder Name' }),
        }
      );
    });

    it('should update folder isPublic property', async () => {
      // Arrange
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(mockFolder),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        isPublic: true,
      };

      // Act
      await editFolder(options);

      // Assert
      expect(fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/api/user/folders/${mockFolderId}`,
        {
          method: 'PATCH',
          headers: {
            authorization: mockToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isPublic: true }),
        }
      );
    });

    it('should update folder allowUploads property', async () => {
      // Arrange
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(mockFolder),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        allowUploads: true,
      };

      // Act
      await editFolder(options);

      // Assert
      expect(fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/api/user/folders/${mockFolderId}`,
        {
          method: 'PATCH',
          headers: {
            authorization: mockToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ allowUploads: true }),
        }
      );
    });

    it('should update multiple folder properties', async () => {
      // Arrange
      const updatedFolder = { ...mockFolder, name: 'Updated Folder Name' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(updatedFolder),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        name: 'Updated Folder Name',
        isPublic: true,
        allowUploads: false,
      };

      // Act
      await editFolder(options);

      // Assert
      expect(fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/api/user/folders/${mockFolderId}`,
        {
          method: 'PATCH',
          headers: {
            authorization: mockToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Updated Folder Name',
            isPublic: true,
            allowUploads: false,
          }),
        }
      );
    });

    it('should throw ZiplineError with MCP error code when API response is not OK', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        name: 'Updated Folder Name',
      };

      // Act & Assert
      await expect(editFolder(options)).rejects.toMatchObject({
        mcpCode: McpErrorCode.RESOURCE_NOT_FOUND,
        httpStatus: 404,
      });
    });

    it('should throw a validation error when folder name is empty', async () => {
      // Arrange
      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        name: '', // Empty name
      };

      // Act & Assert
      await expect(editFolder(options)).rejects.toThrow(
        'Folder name is required'
      );
    });
  });

  describe('PUT - Add file to folder', () => {
    it('should add a file to a folder', async () => {
      // Arrange
      const mockFileId = 'file456';
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(mockFolder),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        fileId: mockFileId,
      };

      // Act
      const result = await editFolder(options);

      // Assert
      expect(result).toEqual(mockFolder);
      expect(fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/api/user/folders/${mockFolderId}`,
        {
          method: 'PUT',
          headers: {
            authorization: mockToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: mockFileId }),
        }
      );
    });

    it('should throw ZiplineError with MCP error code when API response is not OK', async () => {
      // Arrange
      const mockFileId = 'file456';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        fileId: mockFileId,
      };

      // Act & Assert
      await expect(editFolder(options)).rejects.toMatchObject({
        mcpCode: McpErrorCode.RESOURCE_NOT_FOUND,
        httpStatus: 404,
      });
    });

    it('should throw a validation error when file ID is empty', async () => {
      // Arrange
      const options: EditFolderOptions = {
        endpoint: mockEndpoint,
        token: mockToken,
        id: mockFolderId,
        fileId: '', // Empty file ID
      };

      // Act & Assert
      await expect(editFolder(options)).rejects.toThrow('File ID is required');
    });
  });

  describe('Request validation schemas', () => {
    it('should validate EditFolderPropertiesRequestSchema', () => {
      // Valid request
      const validRequest = {
        name: 'Test Folder',
        isPublic: true,
        allowUploads: false,
      };
      expect(() =>
        EditFolderPropertiesRequestSchema.parse(validRequest)
      ).not.toThrow();

      // Invalid request (empty name)
      const invalidRequest = {
        name: '',
        isPublic: true,
      };
      expect(() =>
        EditFolderPropertiesRequestSchema.parse(invalidRequest)
      ).toThrow('Folder name is required');
    });

    it('should validate AddFileToFolderRequestSchema', () => {
      // Valid request
      const validRequest = { id: 'file123' };
      expect(() =>
        AddFileToFolderRequestSchema.parse(validRequest)
      ).not.toThrow();

      // Invalid request (empty ID)
      const invalidRequest = { id: '' };
      expect(() => AddFileToFolderRequestSchema.parse(invalidRequest)).toThrow(
        'File ID is required'
      );
    });
  });
});

// Add tests for getFolder function
describe('getFolder', () => {
  const ZIPLINE_ENDPOINT = 'http://localhost:3000';
  const ZIPLINE_TOKEN = 'test-token';

  beforeEach(() => {
    vi.stubEnv('ZIPLINE_ENDPOINT', ZIPLINE_ENDPOINT);
    vi.stubEnv('ZIPLINE_TOKEN', ZIPLINE_TOKEN);
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch a single folder by ID', async () => {
    const folderId = 'test-folder-id';
    const mockFolder = {
      id: folderId,
      name: 'Test Folder',
      public: false,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      files: [
        {
          id: 'file1',
          name: 'file1.txt',
          originalName: 'file1.txt',
          size: 1024,
          type: 'text/plain',
          url: 'https://zipline.example.com/file1',
          createdAt: '2023-01-01T00:00:00Z',
          maxViews: null,
          views: 0,
          favorite: false,
          tags: [],
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFolder),
    } as Response);

    const result = await getFolder(folderId);

    expect(mockFetch).toHaveBeenCalledWith(
      `${ZIPLINE_ENDPOINT}/api/user/folders/${folderId}`,
      {
        headers: {
          authorization: ZIPLINE_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual({
      id: folderId,
      name: 'Test Folder',
      public: false,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      files: ['file1'],
    });
  });

  it('should throw ZiplineError with MCP error code if the folder is not found', async () => {
    const folderId = 'non-existent-folder-id';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(getFolder(folderId)).rejects.toMatchObject({
      mcpCode: McpErrorCode.RESOURCE_NOT_FOUND,
      httpStatus: 404,
    });
  });

  it('should throw ZiplineError with MCP error code if the API request fails', async () => {
    const folderId = 'test-folder-id';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(getFolder(folderId)).rejects.toMatchObject({
      mcpCode: McpErrorCode.INTERNAL_ZIPLINE_ERROR,
      httpStatus: 500,
    });
  });

  // New test for INFO command with file list
  it('should fetch a single folder with detailed file information', async () => {
    const folderId = 'test-folder-id';
    const mockFolder = {
      id: folderId,
      name: 'Test Folder with Files',
      public: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
      files: [
        {
          id: 'file1',
          name: 'document.pdf',
          originalName: 'document.pdf',
          size: 102400,
          type: 'application/pdf',
          url: 'https://zipline.example.com/document.pdf',
          createdAt: '2023-01-01T10:00:00Z',
          maxViews: 10,
          views: 3,
          favorite: true,
          tags: ['important', 'document'],
        },
        {
          id: 'file2',
          name: 'image.png',
          originalName: 'image.png',
          size: 204800,
          type: 'image/png',
          url: 'https://zipline.example.com/image.png',
          createdAt: '2023-01-01T11:00:00Z',
          maxViews: null,
          views: 15,
          favorite: false,
          tags: ['image'],
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFolder),
    } as Response);

    const result = await getFolder(folderId);

    expect(mockFetch).toHaveBeenCalledWith(
      `${ZIPLINE_ENDPOINT}/api/user/folders/${folderId}`,
      {
        headers: {
          authorization: ZIPLINE_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify that the result includes file IDs
    expect(result).toEqual({
      id: folderId,
      name: 'Test Folder with Files',
      public: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
      files: ['file1', 'file2'],
    });
  });
});

// Add tests for deleteFolder function
describe('deleteFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
    process.env.ZIPLINE_TOKEN = 'test-token';
  });

  it('should call the correct API endpoint to delete a folder', async () => {
    const folderId = 'folder123';
    const mockResponse = {
      ok: true,
      json: async () => {
        await Promise.resolve(); // Add await expression
        return {
          id: folderId,
          name: 'Test Folder',
          public: false,
          createdAt: '2025-01-15T10:30:45.123Z',
          updatedAt: '2025-01-20T14:45:30.456Z',
        };
      },
    } as Response;

    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await deleteFolder(folderId);

    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/user/folders/${folderId}`,
      {
        method: 'DELETE',
        headers: {
          authorization: process.env.ZIPLINE_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ delete: 'folder' }),
      }
    );
    expect(result).toEqual({
      id: folderId,
      name: 'Test Folder',
      public: false,
      createdAt: '2025-01-15T10:30:45.123Z',
      updatedAt: '2025-01-20T14:45:30.456Z',
    });
  });

  it('should throw ZiplineError with MCP error code if the API request fails', async () => {
    const folderId = 'folder123';
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => {
        await Promise.resolve(); // Add await expression
        return { message: 'Folder not found' };
      },
    } as Response;

    mockFetch.mockResolvedValueOnce(mockResponse);

    await expect(deleteFolder(folderId)).rejects.toMatchObject({
      mcpCode: McpErrorCode.RESOURCE_NOT_FOUND,
      httpStatus: 404,
    });
  });

  it('should throw an error if ZIPLINE_ENDPOINT is not set', async () => {
    delete process.env.ZIPLINE_ENDPOINT;
    process.env.ZIPLINE_TOKEN = 'test-token';

    await expect(deleteFolder('folder123')).rejects.toThrow(
      'ZIPLINE_ENDPOINT environment variable is not set'
    );
  });

  it('should throw an error if ZIPLINE_TOKEN is not set', async () => {
    process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
    delete process.env.ZIPLINE_TOKEN;

    await expect(deleteFolder('folder123')).rejects.toThrow(
      'ZIPLINE_TOKEN environment variable is not set'
    );
  });
});
