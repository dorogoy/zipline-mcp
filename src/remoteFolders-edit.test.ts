import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  editFolder,
  EditFolderOptions,
  Folder,
  EditFolderPropertiesRequestSchema,
  AddFileToFolderRequestSchema,
} from './remoteFolders';

// Mock fetch function
global.fetch = vi.fn();

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

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

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

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

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

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

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

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

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

    it('should throw an error when API response is not OK', async () => {
      // Arrange
      vi.mocked(fetch).mockResolvedValueOnce({
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
      await expect(editFolder(options)).rejects.toThrow(
        'Failed to edit folder: 404 Not Found'
      );
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

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

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

    it('should throw an error when API response is not OK', async () => {
      // Arrange
      const mockFileId = 'file456';
      vi.mocked(fetch).mockResolvedValueOnce({
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
      await expect(editFolder(options)).rejects.toThrow(
        'Failed to add file to folder: 404 Not Found'
      );
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
