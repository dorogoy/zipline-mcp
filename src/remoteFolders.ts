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
