# Story 4.3: Retrieve Detailed File Metadata

Status: done

## Story

As an **AI agent inspecting file properties**,
I want **to retrieve detailed metadata for a specific file**,
So that **I can make informed decisions about file management**.

## Acceptance Criteria

1. **Given** a valid file ID
   **When** `get_user_file` is called
   **Then** detailed metadata is returned (name, size, MIME type, upload date, URL, folder, views, etc.)

2. **Given** a file ID that doesn't exist
   **When** `get_user_file` is called
   **Then** `RESOURCE_NOT_FOUND` error is returned

3. **Given** a file with expiration or view limits set
   **When** metadata is retrieved
   **Then** the expiration date and remaining views are included

**FRs addressed:** FR15

## Tasks / Subtasks

- [x] Verify basic file metadata retrieval (AC: #1)
  - [x] Test `getUserFile()` returns all expected fields (id, name, size, type, views, etc.)
  - [x] Test `getUserFile()` normalizes URL to absolute URL
  - [x] Test `getUserFile()` correctly handles files with folderId
- [x] Verify error handling for non-existent files (AC: #2)
  - [x] Test HTTP 404 returns `RESOURCE_NOT_FOUND` MCP error code
  - [x] Test error message is actionable (resolution guidance included)
- [x] Verify expiration and view limit metadata (AC: #3)
  - [x] Test `deletesAt` field is returned when file has expiration
  - [x] Test `maxViews` field is returned when view limit is set
  - [x] Test `views` (current view count) is included
- [x] Verify edge cases
  - [x] Test URL encoding for file IDs with special characters
  - [x] Test network error handling
  - [x] Test parameter validation (empty id, empty endpoint, empty token)
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is a VALIDATION Story

**The `getUserFile()` functionality is ALREADY IMPLEMENTED.**

This story requires **VERIFICATION** of existing implementation, not new code.

### Epic Context - Epic 4: Remote File Management

This is Story 4.3 in Epic 4, continuing remote file management capabilities.

**Epic Objectives:**
- List and search files with idempotent URLs (Story 4.1 - DONE)
- Implement file search functionality (Story 4.2 - DONE)
- Retrieve detailed file metadata (Story 4.3 - THIS STORY)
- Update file properties (Story 4.4)
- Implement single file deletion (Story 4.5)
- Implement batch file operations (Story 4.6)

**Story Position:** Third story in Epic 4 - builds on listing/search foundation.

**Dependencies:**
- **Requires Story 4.1** - URL normalization pattern established (DONE)

### Existing Implementation (userFiles.ts:188-243)

```typescript
export interface GetUserFileOptions {
  endpoint: string;
  token: string;
  id: string;
}

export async function getUserFile(options: GetUserFileOptions): Promise<FileModel> {
  const { endpoint, token, id } = options;
  
  // Parameter validation
  if (!endpoint) throw new Error('endpoint is required');
  if (!token) throw new Error('token is required');
  if (!id) throw new Error('id is required');

  const url = `${endpoint}/api/user/files/${encodeURIComponent(id)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: token },
  });

  if (!response.ok) {
    throw mapHttpStatusToMcpError(response.status, errorMessage);  // Uses error mapper
  }

  // ... response validation and URL normalization
  file.url = normalizeUrl(endpoint, file.url);  // URL normalization applied
  return file;
}
```

### FileModel Interface (userFiles.ts:34-51)

The interface already includes all required metadata fields:

```typescript
export interface FileModel {
  id: string;
  name: string;
  originalName: string | null;
  size: number;
  type: string;           // MIME type
  views: number;          // Current view count
  maxViews: number | null; // View limit (AC #3)
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  deletesAt: string | null; // Expiration (AC #3)
  folderId: string | null;
  thumbnail: { path: string } | null;
  tags: string[];
  password: string | null;
  url: string;
}
```

### Tool Definition (index.ts:1006-1041)

```typescript
server.registerTool(
  'get_user_file',
  {
    title: 'Get User File',
    description: 'Retrieve detailed information about a specific file stored on the Zipline server.',
    inputSchema: getUserFileInputSchema,
  },
  async ({ id }) => {
    const file = await getUserFile({
      endpoint: ZIPLINE_ENDPOINT,
      token: ZIPLINE_TOKEN,
      id,
    });
    return {
      content: [{
        type: 'text',
        text: `📁 FILE INFORMATION\n\n📁 ${file.name}\n🆔 ID: ${file.id}\n🔗 URL: ${file.url}`,
      }],
    };
  }
);
```

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors from Zipline API MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - Already implemented correctly in `getUserFile()` (userFiles.ts:220)
   - HTTP 404 → `RESOURCE_NOT_FOUND` with resolution guidance

2. **Security Gate:**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - **VERIFICATION NEEDED:** Check if error handler in index.ts uses `maskSensitiveData()`
   - See Story 4.2 review findings - this was fixed there

3. **URL Normalization (NFR8):**
   - File URLs must be absolute, not relative paths
   - Already implemented via `normalizeUrl()` (userFiles.ts:241)

4. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - FileModel interface already follows this convention

### Implementation Guidance

**Focus on VERIFICATION:**

1. **Verify Basic Metadata Retrieval (AC #1):**
   - Confirm all FileModel fields are returned correctly
   - Test URL is absolute (normalized)
   - Test MIME type, size, dates are populated

2. **Verify Error Handling (AC #2):**
   - Test HTTP 404 returns `RESOURCE_NOT_FOUND` (not generic error)
   - Verify error message includes resolution guidance from errorMapper
   - Check `maskSensitiveData()` is applied to error responses in index.ts

3. **Verify Expiration/View Limits (AC #3):**
   - Test `deletesAt` is returned when set
   - Test `maxViews` and `views` are included
   - Test null values are properly handled (no expiration/unlimited views)

### File Structure Requirements

**Primary Files (VERIFY ONLY - likely no changes needed):**
1. **src/userFiles.ts** - `getUserFile()` implementation (lines 188-243)
2. **src/userFiles.test.ts** - Unit tests (lines 668-823)
3. **src/index.ts** - Tool handler (lines 1006-1041)

**Do NOT Modify:**
- `src/sandboxUtils.ts` - Not involved in metadata retrieval
- `src/httpClient.ts` - Not involved in this operation
- `src/utils/errorMapper.ts` - Already correct
- `src/utils/security.ts` - Reference only

### Testing Requirements

**Framework:** Vitest (co-located `*.test.ts` pattern)

**Existing Tests to Verify (userFiles.test.ts:668-823):**

| Test | Lines | Description | AC |
|------|-------|-------------|-----|
| `should get a single file by ID` | 673-716 | Tests basic retrieval with URL normalization | #1 |
| `should URL encode file IDs with special characters` | 718-753 | Tests encoding | All |
| `should handle API errors` | 755-769 | Tests HTTP 404 → RESOURCE_NOT_FOUND | #2 |
| `should handle network errors` | 771-781 | Tests network failure | All |
| `should validate required parameters` | 783-807 | Tests input validation | All |
| `should validate response format` | 809-822 | Tests malformed response handling | All |

**Potential Gaps to Address:**

1. **Expiration/View Limit Tests (AC #3):**
   - No explicit tests for `deletesAt` field presence
   - No explicit tests for `maxViews`/`views` verification

2. **Complete Metadata Fields Test:**
   - Current tests don't verify ALL FileModel fields are present

**Recommended New Tests:**

```typescript
describe('getUserFile - detailed metadata', () => {
  it('should return all expected metadata fields', async () => {
    // Verify all FileModel fields are present in response
  });

  it('should include expiration date when deletesAt is set', async () => {
    // Test file with expiration returns deletesAt value
  });

  it('should include view limits when maxViews is set', async () => {
    // Test file with view limit returns maxViews and views
  });

  it('should handle null expiration and unlimited views', async () => {
    // Test file without limits has null deletesAt and null maxViews
  });
});
```

**Test Command:**
```bash
npm test src/userFiles.test.ts
npm test  # Full suite
```

### Previous Story Intelligence

**From Story 4.2 (File Search Functionality):**

**Critical Learnings:**
- **Brownfield validation approach** - Existing implementation was solid, needed verification
- **Security fixes required** - `maskSensitiveData()` was missing in error handlers
- **Error mapping consistency** - All functions must use `mapHttpStatusToMcpError()`
- **Test edge cases at boundaries** - Important for metadata edge cases

**Code Review Fixes Applied in 4.2:**
1. `getUserFile()`, `updateUserFile()`, `deleteUserFile()` updated to use `mapHttpStatusToMcpError()`
2. Tests updated to expect MCP error codes (e.g., 'Resource not found' not 'HTTP 404')

**Check for Similar Issues in getUserFile:**
- ✅ Error mapping already uses `mapHttpStatusToMcpError()` (userFiles.ts:220)
- ⚠️ Verify error handler in index.ts applies `maskSensitiveData()`

**Patterns to Follow:**
- Use `vi.fn()` for mocking fetch
- Test both success and error paths
- Verify all FileModel fields in success case
- Test null vs populated optional fields

### Git Intelligence Summary

**Recent Commits (Epic 4):**
```
0c88802 feat: Implement file search functionality (story 4.2)
baa3d48 feat: Implement robust error handling for file listing (story 4.1)
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- `normalizeUrl()` for URL normalization
- Comprehensive test coverage with Vitest
- Brownfield validation stories - verify existing implementation

### Known Edge Cases

1. **File ID Encoding:**
   - Special characters in file IDs
   - Already handled by `encodeURIComponent()` (userFiles.ts:203)

2. **Null Optional Fields:**
   - `originalName: null` vs string
   - `maxViews: null` vs number
   - `deletesAt: null` vs date string
   - `folderId: null` vs string

3. **API Errors:**
   - 401 Unauthorized (invalid token)
   - 404 Not Found (invalid file ID) - AC #2
   - Network timeout

4. **Response Validation:**
   - Malformed JSON
   - Missing required fields

### References

1. **Epic Context:**
   - [Source: epics.md:700-720] - Story 4.3 requirements
   - [Source: epics.md:145-154] - Epic 4 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:169-171] - Naming conventions (camelCase)
   - [Source: architecture.md:232-234] - Logging gate

3. **Current Implementation:**
   - [Source: userFiles.ts:188-243] - getUserFile implementation
   - [Source: userFiles.ts:34-51] - FileModel interface
   - [Source: index.ts:1006-1041] - Tool handler
   - [Source: userFiles.test.ts:668-823] - Existing tests

4. **Previous Stories:**
   - [Source: 4-2-implement-file-search-functionality.md] - Story 4.2 learnings

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- File IDs are URL-encoded to prevent injection
- Token is passed via authorization header, never in URL
- ⚠️ **VERIFY:** Check index.ts:1034 error handler uses `maskSensitiveData()`

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── userFiles.ts              # getUserFile() (VERIFY)
│   ├── userFiles.test.ts         # Unit tests (VERIFY/ENHANCE)
│   ├── index.ts                  # Tool handler (VERIFY)
│   └── utils/
│       └── errorMapper.ts        # Error translation (reference)
```

**Alignment:** Implementation appears complete. Focus on verification and filling test gaps for AC #3.

## Dev Agent Record

### Agent Model Used

Claude (glm-5)

### Debug Log References

N/A - No debug issues encountered during implementation.

### Completion Notes List

1. **Story Type:** This was a VALIDATION story - existing implementation was already correct, required verification through tests.

2. **AC #1 - Basic Metadata Retrieval:**
   - Existing test `should get a single file by ID` verified URL normalization
   - Added new test `should return all expected metadata fields` to verify ALL FileModel fields
   - Verified folderId handling in the comprehensive metadata test

3. **AC #2 - Error Handling:**
   - Existing test `should handle API errors` verified HTTP 404 → `Resource not found`
   - Verified errorMapper.ts provides resolution guidance for 404 errors
   - Resolution guidance: "Requested resource does not exist. Verify file/folder ID is correct. Use list_user_files or remote_folder_manager LIST to find correct ID."

4. **AC #3 - Expiration/View Limits:**
   - Added test `should include expiration date when deletesAt is set`
   - Added test `should include view limits when maxViews is set`
   - Added test `should handle null expiration and unlimited views`

5. **Edge Cases:**
   - All existing edge case tests verified (URL encoding, network errors, parameter validation)

6. **Test Results:**
   - 44 tests in userFiles.test.ts (4 new tests added)
   - Full suite: 415 tests passed, 16 skipped
   - Linting: No errors

### Code Review Fixes Applied

1. **Security: Missing maskSensitiveData in get_user_file error handler**
   - Fixed: Added `maskSensitiveData()` wrapper to error message at `src/index.ts:1034`
   - This matches the pattern used by other tools (list_user_files, etc.)

### File List

- `src/userFiles.test.ts` - Added 4 new tests for getUserFile detailed metadata verification (lines 824-922)
- `src/index.ts` - Fixed security issue: added maskSensitiveData to get_user_file error handler (line 1034)
