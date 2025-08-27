import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFolder } from './remoteFolders';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ZIPLINE_ENDPOINT = 'http://localhost:3000';
const ZIPLINE_TOKEN = 'test-token';

beforeEach(() => {
  vi.stubEnv('ZIPLINE_ENDPOINT', ZIPLINE_ENDPOINT);
  vi.stubEnv('ZIPLINE_TOKEN', ZIPLINE_TOKEN);
});

afterEach(() => {
  mockFetch.mockClear();
});

describe('getFolder', () => {
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

  it('should throw an error if the folder is not found', async () => {
    const folderId = 'non-existent-folder-id';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(getFolder(folderId)).rejects.toThrow(
      `Failed to get folder: 404`
    );
  });

  it('should throw an error if the API request fails', async () => {
    const folderId = 'test-folder-id';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(getFolder(folderId)).rejects.toThrow(
      `Failed to get folder: 500`
    );
  });
});
