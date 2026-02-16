# Story 4.2: Implement File Search Functionality

Status: done

## Story

As an **AI agent searching for specific content**,
I want **to search files by name, type, or other criteria**,
So that **I can quickly locate specific files without listing everything**.

## Acceptance Criteria

1. **Given** a search query with filename pattern
   **When** `list_user_files` is called with search parameters
   **Then** only matching files are returned

2. **Given** a search query with file type filter
   **When** search is executed
   **Then** results are filtered by MIME type

3. **Given** a search query with no matches
   **When** search is executed
   **Then** an empty array is returned with success status

**FRs addressed:** FR14 (search aspect)

## Tasks / Subtasks

- [x] Verify search by filename pattern (AC: #1)
  - [x] Test `searchField='name'` with `searchQuery` returns matching files
  - [x] Test `searchField='originalName'` works correctly
  - [x] Test partial matches work (e.g., "screenshot" matches "screenshot-2024.png")
- [x] Verify search by MIME type (AC: #2)
  - [x] Test `searchField='type'` with `searchQuery='image/png'` returns PNG files
  - [x] Test `searchField='type'` with `searchQuery='text/plain'` returns text files
- [x] Verify empty result handling (AC: #3)
  - [x] Test non-matching query returns `{ page: [], total: 0, pages: 0 }`
  - [x] Confirm no errors thrown for empty results
- [x] Verify additional search fields
  - [x] Test `searchField='tags'` searches within tags array
  - [x] Test `searchField='id'` searches by file ID
- [x] Verify URL encoding for special characters
  - [x] Test search query with spaces, special chars is properly encoded
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### Epic Context - Epic 4: Remote File Management

This is Story 4.2 in Epic 4, continuing remote file management capabilities.

**Epic Objectives:**
- List and search files with idempotent URLs (Story 4.1 - DONE)
- Implement file search functionality (Story 4.2 - THIS STORY)
- Retrieve detailed file metadata (Story 4.3)
- Update file properties (Story 4.4)
- Implement single file deletion (Story 4.5)
- Implement batch file operations (Story 4.6)

**Story Position:** Second story in Epic 4 - builds on listing foundation.

**Dependencies:**
- **Requires Story 4.1** - listUserFiles base implementation (DONE)

### CRITICAL: This is a VALIDATION Story

**The search functionality is ALREADY IMPLEMENTED in `listUserFiles()`.**

This story requires **VERIFICATION** of existing implementation, not new code.

**Existing Implementation (userFiles.ts:63-135):**
```typescript
export interface ListUserFilesOptions {
  // ... other fields
  searchField?: 'name' | 'originalName' | 'type' | 'tags' | 'id' | undefined;
  searchQuery?: string | undefined;
}

// In listUserFiles():
if (searchField) {
  params.append('searchField', searchField);
}
if (searchQuery) {
  params.append('searchQuery', searchQuery);
}
```

**Tool Schema (index.ts:308-317):**
```typescript
searchField: z.enum(['name', 'originalName', 'type', 'tags', 'id'])
  .optional()
  .describe('Optional: The field to search within (default: name).'),
searchQuery: z.string()
  .optional()
  .describe('Optional: Search string to query files.'),
```

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors from Zipline API must use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - Already implemented in `listUserFiles()` (userFiles.ts:154)

2. **Security Gate:**
   - Error messages must pass through `maskSensitiveData()` to prevent token exposure
   - Check index.ts handler for compliance

3. **URL Encoding:**
   - Search queries with special characters must be URL-encoded
   - Already handled by `URLSearchParams` (userFiles.ts:134)

4. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - Empty results return `{ page: [], total: 0, pages: 0 }`

### Implementation Guidance

**Focus on VERIFICATION:**

1. **Verify Search by Name (AC #1):**
   - Test `searchField='name'` with various patterns
   - Test `searchField='originalName'` separately
   - Verify partial matching behavior

2. **Verify Search by MIME Type (AC #2):**
   - Test `searchField='type'` with `searchQuery='image/png'`
   - Test `searchField='type'` with `searchQuery='text/plain'`
   - Verify exact vs partial type matching

3. **Verify Empty Results (AC #3):**
   - Test non-matching query returns proper empty structure
   - Confirm `total: 0` and `pages: 0` in response

### File Structure Requirements

**Primary Files (VERIFY ONLY - likely no changes needed):**
1. **src/userFiles.ts** - `listUserFiles()` with search parameters (lines 63-135)
2. **src/userFiles.test.ts** - Unit tests (lines 109-165, 229-250)
3. **src/index.ts** - Tool handler and input schema (lines 308-317)

**Do NOT Modify:**
- `src/sandboxUtils.ts` - Not involved in search
- `src/httpClient.ts` - Not involved in search
- `src/utils/security.ts` - Already correct

### Testing Requirements

**Framework:** Vitest (co-located `*.test.ts` pattern)

**Existing Tests to Verify (userFiles.test.ts):**

| Test | Lines | Description | AC |
|------|-------|-------------|-----|
| `should handle search parameters` | 109-165 | Tests searchField and searchQuery | #1 |
| `should URL encode search queries` | 229-250 | Tests special character handling | All |
| `should handle empty file list` | 373-398 | Tests empty result structure | #3 |

**Potential New Tests to Add:**

```typescript
describe('file search functionality', () => {
  it('should search by MIME type with searchField=type', async () => {
    // Test filtering by image/png, text/plain, etc.
  });

  it('should search by tags with searchField=tags', async () => {
    // Test tag-based search
  });

  it('should search by ID with searchField=id', async () => {
    // Test ID-based search
  });

  it('should return empty results for non-matching search', async () => {
    // Test AC #3 explicitly
  });
});
```

**Test Command:**
```bash
npm test src/userFiles.test.ts
npm test  # Full suite
```

### Previous Story Intelligence

**From Story 4.1 (File Listing with Idempotent URLs):**

**Critical Learnings:**
- **Brownfield validation approach** - Existing implementation was solid, needed verification
- **Security fixes required** - Missing `maskSensitiveData()` and `mapHttpStatusToMcpError()` were found in code review
- **Test edge cases at boundaries** - Important for search edge cases
- **Co-located tests pattern** - All tests in `*.test.ts` files

**Code Review Fixes Applied in 4.1:**
1. Added `maskSensitiveData()` wrapper in index.ts error handler
2. Replaced manual error message with `mapHttpStatusToMcpError()` call

**Check for Similar Issues in Search:**
- Verify error handlers use `maskSensitiveData()`
- Verify error handling uses `mapHttpStatusToMcpError()`

**Patterns to Follow:**
- Use `vi.fn()` for mocking fetch
- Test both success and error paths
- Verify URL encoding for special characters
- Test empty result handling

### Git Intelligence Summary

**Recent Commits (Epic 4):**
```
baa3d48 feat: Implement robust error handling for Zipline API responses in file listing (story 4.1)
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- Comprehensive test coverage with Vitest
- Brownfield validation stories - verify existing implementation

### Known Edge Cases

1. **Search Query Encoding:**
   - Spaces, ampersands, special characters
   - Already handled by URLSearchParams

2. **Empty Results:**
   - Non-matching queries
   - Empty search query string
   - Invalid search field

3. **API Errors:**
   - 401 Unauthorized (invalid token)
   - 403 Forbidden (insufficient permissions)
   - Network timeout during search

4. **MIME Type Search:**
   - Exact match vs partial (e.g., "image" vs "image/png")
   - Case sensitivity

### References

1. **Epic Context:**
   - [Source: epics.md:676-697] - Story 4.2 requirements
   - [Source: epics.md:145-154] - Epic 4 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:169-171] - Naming conventions (camelCase)
   - [Source: architecture.md:232-234] - Logging gate

3. **Current Implementation:**
   - [Source: userFiles.ts:63-135] - listUserFiles with search params
   - [Source: index.ts:308-317] - Input schema for search
   - [Source: userFiles.test.ts:109-165] - Search parameter tests
   - [Source: userFiles.test.ts:229-250] - URL encoding tests

4. **Previous Story:**
   - [Source: 4-1-implement-file-listing-with-idempotent-urls.md] - Story 4.1 learnings

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- URL encoding prevents injection through search parameters
- Token is passed via authorization header, never in URL

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── userFiles.ts              # listUserFiles() with search (VERIFY)
│   ├── userFiles.test.ts         # Unit tests (VERIFY/ENHANCE)
│   ├── index.ts                  # Tool handler (VERIFY)
│   └── utils/
│       └── errorMapper.ts        # Error translation (reference)
```

**Alignment:** Implementation appears complete. Focus on verification and edge case testing.

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-02-16 | 1.0.0 | Story created - Initial implementation and verification | Dev Agent |
| 2025-02-16 | 1.1.0 | Code review fixes: Standardized error handling across userFiles.ts to use mapHttpStatusToMcpError() for getUserFile, updateUserFile, and deleteUserFile functions. Updated tests to expect proper MCP error codes. | Review Agent |

## Senior Developer Review (AI)

**Reviewer:** Code Review Agent  
**Date:** 2025-02-16  
**Status:** ✅ APPROVED with fixes

### Review Findings

**Issues Found:** 3 Medium, 1 Low (all resolved)

#### MEDIUM - FIXED ✅
1. **Inconsistent Error Mapping** - `getUserFile()`, `updateUserFile()`, `deleteUserFile()` now use `mapHttpStatusToMcpError()` consistently with `listUserFiles()`
2. **Missing Error Mapping Tests** - Updated tests to expect proper MCP error codes (e.g., 'Resource not found' instead of 'HTTP 404')
3. **Security Gap** - Error messages now properly sanitized through mapHttpStatusToMcpError()

#### LOW - ADDRESSED ✅
4. **Missing Change Log** - Added comprehensive change log section

### Verification

- ✅ All 3 Acceptance Criteria implemented and verified
- ✅ All tasks marked complete are actually done
- ✅ 411 tests passing (16 skipped)
- ✅ No lint errors
- ✅ Architecture compliance: Error mapping (FR20) ✓
- ✅ Security: maskSensitiveData() in place ✓

### Conclusion

Story implementation is **COMPLETE and VERIFIED**. All code review findings have been resolved. Ready for done status.

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5

### Debug Log References

N/A

### Completion Notes List

**Story 4.2 Complete - File Search Functionality Validation**

This was a **validation story** - the search functionality was already implemented in `listUserFiles()`. The work focused on verifying existing implementation and adding comprehensive test coverage.

**Verification Results:**
- ✅ AC #1: Search by filename pattern verified (name, originalName fields)
- ✅ AC #2: Search by MIME type verified (type field with image/png, text/plain)
- ✅ AC #3: Empty result handling verified (returns `{ page: [], total: 0, pages: 0 }`)

**Tests Added (6 new tests in userFiles.test.ts):**
1. `should search by MIME type with searchField=type for image/png`
2. `should search by MIME type with searchField=type for text/plain`
3. `should search by tags with searchField=tags`
4. `should search by ID with searchField=id`
5. `should return empty results for non-matching search query`
6. `should search by originalName field`

**Test Results:**
- Total tests: 411 passed | 16 skipped
- Full suite: 11 test files passed
- Linting: No errors

**Implementation Verified:**
- URL encoding via URLSearchParams (userFiles.ts:134)
- Error mapping via mapHttpStatusToMcpError() (userFiles.ts:154)
- Security masking in index.ts handler (index.ts:994)

### File List

- `src/userFiles.test.ts` - Added 6 new tests for file search functionality; updated error handling tests to expect MCP error codes
- `src/userFiles.ts` - Fixed error handling to use `mapHttpStatusToMcpError()` consistently across all functions
