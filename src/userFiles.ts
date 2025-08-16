// URL normalization utility to safely join URLs like Python's os.path.join
function normalizeUrl(base: string, path: string): string {
  try {
    if (!path) {
      return base;
    }
    // If base is not a valid URL, assume it's a base URL without protocol
    const baseUrl = base.startsWith('http') ? base : `https://${base}`;
    const url = new URL(baseUrl);

    // Remove leading slash from path if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    // Join the base URL with the path
    url.pathname = url.pathname.endsWith('/')
      ? `${url.pathname}${cleanPath}`
      : `${url.pathname}/${cleanPath}`;

    return url.toString();
  } catch {
    // Fallback to simple concatenation if URL parsing fails
    // This handles cases where the base is truly invalid (e.g., contains spaces)
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${cleanBase}${cleanPath}`;
  }
}

// Export the normalizeUrl function for use in index.ts
export { normalizeUrl };

export interface FileModel {
  id: string;
  name: string;
  originalName: string | null;
  size: number;
  type: string;
  views: number;
  maxViews: number | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  deletesAt: string | null;
  folderId: string | null;
  thumbnail: { path: string } | null;
  tags: string[];
  password: string | null;
  url: string;
}

export interface ListUserFilesResponse {
  page: FileModel[];
  total: number;
  pages: number;
  search?: {
    field: string;
    query: string;
  };
}

export interface ListUserFilesOptions {
  endpoint: string;
  token: string;
  page: number;
  perpage?: number | undefined;
  filter?: 'dashboard' | 'all' | 'none' | undefined;
  favorite?: boolean | undefined;
  sortBy?:
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'deletesAt'
    | 'name'
    | 'originalName'
    | 'size'
    | 'type'
    | 'views'
    | 'favorite'
    | undefined;
  order?: 'asc' | 'desc' | undefined;
  searchField?: 'name' | 'originalName' | 'type' | 'tags' | 'id' | undefined;
  searchQuery?: string | undefined;
}

export async function listUserFiles(
  options: ListUserFilesOptions
): Promise<ListUserFilesResponse> {
  const {
    endpoint,
    token,
    page,
    perpage = 15,
    filter,
    favorite,
    sortBy,
    order,
    searchField,
    searchQuery,
  } = options;

  if (!endpoint) {
    throw new Error('endpoint is required');
  }
  if (!token) {
    throw new Error('token is required');
  }
  if (!page || page < 1) {
    throw new Error('page must be a positive integer');
  }

  // Build query parameters
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('perpage', perpage.toString());

  if (filter) {
    params.append('filter', filter);
  }
  if (favorite !== undefined) {
    params.append('favorite', favorite.toString());
  }
  if (sortBy) {
    params.append('sortBy', sortBy);
  }
  if (order) {
    params.append('order', order);
  }
  if (searchField) {
    params.append('searchField', searchField);
  }
  if (searchQuery) {
    params.append('searchQuery', searchQuery);
  }

  const url = `${endpoint}/api/user/files?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: token,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        errorMessage += `: ${text}`;
      }
    } catch {
      // Ignore if we can't read the response text
    }
    throw new Error(errorMessage);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse JSON response');
  }

  // Validate response structure
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as Record<string, unknown>).page)
  ) {
    throw new Error('Invalid response format from Zipline server');
  }

  // Apply URL normalization to each file in the response
  const listResponse = data as ListUserFilesResponse;
  listResponse.page = listResponse.page.map((file: FileModel) => ({
    ...file,
    url: normalizeUrl(endpoint, file.url),
  }));
  return listResponse;
}

export interface GetUserFileOptions {
  endpoint: string;
  token: string;
  id: string;
}

export async function getUserFile(
  options: GetUserFileOptions
): Promise<FileModel> {
  const { endpoint, token, id } = options;

  if (!endpoint) {
    throw new Error('endpoint is required');
  }
  if (!token) {
    throw new Error('token is required');
  }
  if (!id) {
    throw new Error('id is required');
  }

  const url = `${endpoint}/api/user/files/${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: token,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        errorMessage += `: ${text}`;
      }
    } catch {
      // Ignore if we can't read the response text
    }
    throw new Error(errorMessage);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse JSON response');
  }

  // Validate response structure
  if (
    !data ||
    typeof data !== 'object' ||
    !(data as Record<string, unknown>).id
  ) {
    throw new Error('Invalid response format from Zipline server');
  }

  // Apply URL normalization to the file
  const file = data as FileModel;
  file.url = normalizeUrl(endpoint, file.url);
  return file;
}

export interface UpdateUserFileOptions {
  endpoint: string;
  token: string;
  id: string;
  favorite?: boolean;
  maxViews?: number;
  password?: string | null;
  originalName?: string;
  type?: string;
  tags?: string[];
  name?: string;
}

export async function updateUserFile(
  options: UpdateUserFileOptions
): Promise<FileModel> {
  const { endpoint, token, id, ...updateFields } = options;

  if (!endpoint) {
    throw new Error('endpoint is required');
  }
  if (!token) {
    throw new Error('token is required');
  }
  if (!id) {
    throw new Error('id is required');
  }

  // Filter out undefined fields
  const body = Object.fromEntries(
    Object.entries(updateFields).filter(([, value]) => value !== undefined)
  );

  // If no fields to update, throw error
  if (Object.keys(body).length === 0) {
    throw new Error('At least one field to update is required');
  }

  const url = `${endpoint}/api/user/files/${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        errorMessage += `: ${text}`;
      }
    } catch {
      // Ignore if we can't read the response text
    }
    throw new Error(errorMessage);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse JSON response');
  }

  // Validate response structure
  if (
    !data ||
    typeof data !== 'object' ||
    !(data as Record<string, unknown>).id
  ) {
    throw new Error('Invalid response format from Zipline server');
  }

  // Remove URL field from response as requested
  const file = data as FileModel;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { url: _url, ...fileWithoutUrl } = file;
  return fileWithoutUrl as FileModel;
}

export interface DeleteUserFileOptions {
  endpoint: string;
  token: string;
  id: string;
}

export async function deleteUserFile(
  options: DeleteUserFileOptions
): Promise<FileModel> {
  const { endpoint, token, id } = options;

  if (!endpoint) {
    throw new Error('endpoint is required');
  }
  if (!token) {
    throw new Error('token is required');
  }
  if (!id) {
    throw new Error('id is required');
  }

  const url = `${endpoint}/api/user/files/${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      authorization: token,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        errorMessage += `: ${text}`;
      }
    } catch {
      // Ignore if we can't read the response text
    }
    throw new Error(errorMessage);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse JSON response');
  }

  // Validate response structure
  if (
    !data ||
    typeof data !== 'object' ||
    !(data as Record<string, unknown>).id
  ) {
    throw new Error('Invalid response format from Zipline server');
  }

  // Remove URL field from response as requested
  const file = data as FileModel;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { url: _url, ...fileWithoutUrl } = file;
  return fileWithoutUrl as FileModel;
}
