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

  return data as ListUserFilesResponse;
}
