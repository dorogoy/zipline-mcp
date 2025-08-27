import { z } from 'zod';

/**
 * Interface representing a folder in Zipline
 */
export interface Folder {
  /** The unique identifier of the folder (optional to handle absence gracefully) */
  id?: string | undefined;
  /** The name of the folder */
  name: string;
}

/**
 * Response schema for listing folders
 */
export const ListFoldersResponseSchema = z.array(
  z.object({
    id: z.string().optional(),
    name: z.string(),
  })
);

export type ListFoldersResponse = z.infer<typeof ListFoldersResponseSchema>;

/**
 * Options for listing folders
 */
export interface ListFoldersOptions {
  /** The Zipline API endpoint */
  endpoint: string;
  /** The authentication token */
  token: string;
  /** Page number for pagination (optional) */
  page?: number;
  /** Whether to exclude files from the response (optional) */
  noincl?: boolean;
}

/**
 * Lists folders from the Zipline API
 * @param options - The options for listing folders
 * @returns A promise that resolves to a list of folders
 * @throws Error if the API request fails
 */
export async function listFolders(
  options: ListFoldersOptions
): Promise<Folder[]> {
  const { endpoint, token, page, noincl } = options;

  // Build the URL with query parameters
  const url = new URL(`${endpoint}/api/user/folders`);

  if (page !== undefined) {
    url.searchParams.append('page', page.toString());
  }

  if (noincl !== undefined) {
    url.searchParams.append('noincl', noincl.toString());
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      authorization: token,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list folders: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as unknown;

  // Validate the response data (expects a top-level array of folder objects)
  const validatedData = ListFoldersResponseSchema.parse(data);

  // Return the folders array with proper typing
  const folders: Folder[] = validatedData.map((folder) => ({
    id: folder.id,
    name: folder.name,
  }));

  return folders;
}

/**
 * Request schema for creating a folder
 */
export const CreateFolderRequestSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
  isPublic: z.boolean().default(false),
  files: z.array(z.string()).optional(),
});

export type CreateFolderRequest = z.infer<typeof CreateFolderRequestSchema>;

/**
 * Options for creating a folder
 */
export interface CreateFolderOptions {
  /** The Zipline API endpoint */
  endpoint: string;
  /** The authentication token */
  token: string;
  /** The name of the folder to create */
  name: string;
  /** Whether the folder should be public (optional) */
  isPublic?: boolean;
  /** Array of file IDs to associate with this folder (optional) */
  files?: string[];
}

/**
 * Response schema for creating a folder
 */
export const CreateFolderResponseSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export type CreateFolderResponse = z.infer<typeof CreateFolderResponseSchema>;

/**
 * Creates a new folder in Zipline
 * @param options - The options for creating a folder
 * @returns A promise that resolves to the created folder
 * @throws Error if the API request fails
 */
export async function createFolder(
  options: CreateFolderOptions
): Promise<Folder> {
  const { endpoint, token, name, isPublic, files } = options;

  // Build the request body
  const requestBody: Partial<CreateFolderRequest> = {
    name,
    isPublic: isPublic ?? false,
  };

  if (files && files.length > 0) {
    requestBody.files = files;
  }

  // Validate the request body before sending
  CreateFolderRequestSchema.parse(requestBody);

  const response = await fetch(`${endpoint}/api/user/folders`, {
    method: 'POST',
    headers: {
      authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('Body enviado a Zipline:', JSON.stringify(requestBody));

  if (!response.ok) {
    throw new Error(
      `Failed to create folder: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as unknown;

  // Validate the response data
  const validatedData = CreateFolderResponseSchema.parse(data);

  // Return the folder with proper typing
  const folder: Folder = {
    id: validatedData.id,
    name: validatedData.name,
  };

  return folder;
}

/**
 * Request schema for editing a folder (PATCH)
 */
export const EditFolderPropertiesRequestSchema = z.object({
  name: z.string().min(1, 'Folder name is required').optional(),
  isPublic: z.boolean().optional(),
  allowUploads: z.boolean().optional(),
});

export type EditFolderPropertiesRequest = z.infer<
  typeof EditFolderPropertiesRequestSchema
>;

/**
 * Request schema for adding a file to a folder (PUT)
 */
export const AddFileToFolderRequestSchema = z.object({
  id: z.string().min(1, 'File ID is required'),
});

export type AddFileToFolderRequest = z.infer<
  typeof AddFileToFolderRequestSchema
>;

/**
 * Options for editing a folder
 */
export interface EditFolderOptions {
  /** The Zipline API endpoint */
  endpoint: string;
  /** The authentication token */
  token: string;
  /** The ID of the folder to edit */
  id: string;
  /** The new name of the folder (optional) */
  name?: string;
  /** Whether the folder should be public (optional) */
  isPublic?: boolean;
  /** Whether to allow anonymous uploads to the folder (optional) */
  allowUploads?: boolean;
  /** The ID of the file to add to the folder (optional) */
  fileId?: string;
}

/**
 * Edits a folder in Zipline (updates properties or adds a file)
 * @param options - The options for editing a folder
 * @returns A promise that resolves to the edited folder
 * @throws Error if the API request fails
 */
export async function editFolder(options: EditFolderOptions): Promise<Folder> {
  const { endpoint, token, id, name, isPublic, allowUploads, fileId } = options;

  if (fileId !== undefined) {
    // Add file to folder using PUT
    const requestBody: AddFileToFolderRequest = {
      id: fileId,
    };

    // Validate the request body before sending
    AddFileToFolderRequestSchema.parse(requestBody);

    const response = await fetch(`${endpoint}/api/user/folders/${id}`, {
      method: 'PUT',
      headers: {
        authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to add file to folder: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as unknown;

    // Validate the response data
    const validatedData = CreateFolderResponseSchema.parse(data);

    // Return the folder with proper typing
    const folder: Folder = {
      id: validatedData.id,
      name: validatedData.name,
    };

    return folder;
  } else {
    // Update folder properties using PATCH
    const requestBody: Partial<EditFolderPropertiesRequest> = {};

    if (name !== undefined) {
      requestBody.name = name;
    }

    if (isPublic !== undefined) {
      requestBody.isPublic = isPublic;
    }

    if (allowUploads !== undefined) {
      requestBody.allowUploads = allowUploads;
    }

    // Validate the request body before sending
    EditFolderPropertiesRequestSchema.parse(requestBody);

    const response = await fetch(`${endpoint}/api/user/folders/${id}`, {
      method: 'PATCH',
      headers: {
        authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to edit folder: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as unknown;

    // Validate the response data
    const validatedData = CreateFolderResponseSchema.parse(data);

    // Return the folder with proper typing
    const folder: Folder = {
      id: validatedData.id,
      name: validatedData.name,
    };

    return folder;
  }
}
