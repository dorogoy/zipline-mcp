# Story 4.5: Implement Single File Deletion

Status: done

## Story

As an **admin cleaning up obsolete content**,
I want **to delete individual files from Zipline**,
So that **I can remove outdated or unnecessary content**.

## Acceptance Criteria

1. **Given** a valid file ID
   **When** `delete_user_file` is called
   **Then** the file is permanently deleted and success is returned

2. **Given** an invalid file ID
   **When** `delete_user_file` is called
   **Then** `RESOURCE_NOT_FOUND` error is returned

3. **Given** a successful deletion
   **When** the file URL is accessed
   **Then** the file is no longer available

**FRs addressed:** FR17 (single delete)

## Tasks / Subtasks

- [x] Security fix: Add `maskSensitiveData()` to error handler (AC: All)
  - [x] Wrap error message at index.ts:1131 with `maskSensitiveData()`
- [x] Enhance test for HTTP 404 error code verification (AC: #2)
  - [x] Verify test throws `ZiplineError` with `mcpCode: RESOURCE_NOT_FOUND`
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is an ENHANCEMENT Story

**The `deleteUserFile()` function EXISTS and is COMPLETE.**

**Security issue needs fixing** - `maskSensitiveData()` is MISSING in error handler.

### Epic Context - Epic 4: Remote File Management

**Story Position:** Fifth story in Epic 4 - builds on file property updates.

**Epic Objectives:**
- List and search files with idempotent URLs (Story 4.1 - DONE)
- Implement file search functionality (Story 4.2 - DONE)
- Retrieve detailed file metadata (Story 4.3 - DONE)
- Update file properties (Story 4.4 - DONE)
- **Implement single file deletion (Story 4.5 - THIS STORY)**
- Implement batch file operations (Story 4.6)

**Dependencies:**
- **Requires Story 4.4 patterns** - Security masking with `maskSensitiveData()` (DONE)

### Existing Implementation Analysis

**1. Core Function (userFiles.ts:329-391) - COMPLETE:**

```typescript
export async function deleteUserFile(
  options: DeleteUserFileOptions
): Promise<FileModel> {
  const { endpoint, token, id } = options;

  // Parameter validation (lines 341-348)
  if (!endpoint) throw new Error('endpoint is required');
  if (!token) throw new Error('token is required');
  if (!id) throw new Error('id is required');

  // HTTP DELETE request (lines 350-357)
  const url = `${endpoint}/api/user/files/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { authorization: token },
  });

  // Error mapping (lines 359-368)
  if (!response.ok) {
    throw mapHttpStatusToMcpError(response.status, errorMessage);
  }

  // Response validation and URL removal (lines 370-390)
  // Returns file without URL field
}
```

**Status:**
- ✅ Parameter validation
- ✅ URL encoding for file ID
- ✅ HTTP DELETE method
- ✅ Error mapping uses `mapHttpStatusToMcpError()`
- ✅ Response validation
- ✅ URL field removal from response

**2. Schema (index.ts:386-392) - COMPLETE:**

```typescript
export const deleteUserFileInputSchema = {
  id: z.string().describe(
    'The unique ID of the file to delete. Only use the ID, the filename does not work.'
  ),
};
```

**3. Tool Registration (index.ts:1103-1138) - NEEDS SECURITY FIX:**

```typescript
// 8. delete_user_file
server.registerTool(
  'delete_user_file',
  {
    title: 'Delete User File',
    description: 'Remove a specific file from the Zipline server.',
    inputSchema: deleteUserFileInputSchema,
  },
  async ({ id }) => {
    try {
      const file = await deleteUserFile({
        endpoint: ZIPLINE_ENDPOINT,
        token: ZIPLINE_TOKEN,
        id,
      });
      return {
        content: [
          {
            type: 'text',
            text: `✅ FILE DELETED SUCCESSFULLY!\n\n📁 ${file.name}\n🆔 ID: ${file.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            // ⚠️ SECURITY ISSUE: Missing maskSensitiveData()
            text: `❌ DELETE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

### Security Issue: Missing `maskSensitiveData()`

**CRITICAL - Same issue fixed in Stories 4.2, 4.3, and 4.4:**

**Current (index.ts:1131):**
```typescript
text: `❌ DELETE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
```

**Required:**
```typescript
text: maskSensitiveData(`❌ DELETE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`),
```

### Existing Tests (userFiles.test.ts:1382-1500)

| Test | Lines | Description | AC |
|------|-------|-------------|-----|
| `should delete a file` | 1387-1429 | Tests successful deletion | #1, #3 |
| `should handle API errors` | 1432-1446 | Tests HTTP 404 → "Resource not found" | #2 |
| `should handle network errors` | 1448-1458 | Tests network failure | All |
| `should validate required parameters` | 1460-1484 | Tests input validation | All |
| `should validate response format` | 1486-1499 | Tests response parsing | All |

**Test Gap:**
- AC #2 test verifies "Resource not found" message but could be enhanced to verify `ZiplineError` with `mcpCode: RESOURCE_NOT_FOUND`

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - Already correct in userFiles.ts:367
   - HTTP 404 → `RESOURCE_NOT_FOUND` with resolution guidance

2. **Security Gate (NFR6):**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - **MISSING** in index.ts:1131 - MUST FIX

3. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - URL field removed from response for security

### File Structure Requirements

**Primary File to Modify:**

| File | Lines | Change Required |
|------|-------|-----------------|
| `src/index.ts` | 1131 | Add `maskSensitiveData()` wrapper |

**Do NOT Modify:**
- `src/userFiles.ts` - Already correct
- `src/utils/errorMapper.ts` - Already correct
- `src/utils/security.ts` - Reference only

### Previous Story Intelligence

**From Story 4.4 (Update File Properties):**

**Critical Learnings:**
- **Security fixes required** - `maskSensitiveData()` was missing in error handlers
- **Error mapping consistency** - All functions must use `mapHttpStatusToMcpError()`
- **Same pattern applies here** - Line 1131 needs the same fix

**Code Review Fixes Applied in 4.4:**
- Fixed `maskSensitiveData()` missing in `update_user_file` error handler at index.ts:1084-1086

**Apply Same Pattern Here:**
- ⚠️ index.ts:1131 needs `maskSensitiveData()` wrapper

### Git Intelligence Summary

**Recent Commits (Epic 4):**
```
40d090a feat: Implement file property updates including folder movement, add security masking to error handling, and enhance test coverage for Story 4.4.
b088f7b feat: Add comprehensive tests and documentation for detailed file metadata retrieval (story 4.3)
0c88802 feat: Implement file search functionality (story 4.2)
baa3d48 feat: Implement robust error handling for file listing (story 4.1)
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- Comprehensive test coverage with Vitest
- Zod schema for MCP tool input validation

### Known Edge Cases

1. **File Not Found:**
   - HTTP 404 returns `RESOURCE_NOT_FOUND` MCP error code
   - Already handled via `mapHttpStatusToMcpError()`

2. **Invalid Token:**
   - HTTP 401 returns `UNAUTHORIZED_ACCESS` MCP error code
   - Already handled via `mapHttpStatusToMcpError()`

3. **Special Characters in File ID:**
   - File ID is URL-encoded with `encodeURIComponent()`
   - Already implemented

### References

1. **Epic Context:**
   - [Source: epics.md:756-777] - Story 4.5 requirements
   - [Source: epics.md:145-154] - Epic 4 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:232-234] - Logging gate (maskSensitiveData)

3. **Current Implementation:**
   - [Source: userFiles.ts:329-391] - deleteUserFile implementation (COMPLETE)
   - [Source: index.ts:386-392] - deleteUserFileInputSchema (COMPLETE)
   - [Source: index.ts:1103-1138] - Tool handler (NEEDS maskSensitiveData fix)
   - [Source: userFiles.test.ts:1382-1500] - Existing tests (COMPLETE)

4. **Previous Stories:**
   - [Source: 4-4-update-file-properties.md] - Story 4.4 learnings (maskSensitiveData fix)

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- File IDs are URL-encoded to prevent injection
- Token is passed via authorization header, never in URL
- **FIX REQUIRED:** index.ts:1131 missing `maskSensitiveData()`

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── userFiles.ts              # deleteUserFile function (COMPLETE)
│   ├── userFiles.test.ts         # Unit tests (COMPLETE)
│   ├── index.ts                  # Tool handler (NEEDS maskSensitiveData fix)
│   └── utils/
│       ├── errorMapper.ts        # Error translation (reference)
│       └── security.ts           # maskSensitiveData (import)
```

**Alignment:** Need to fix security issue. All other implementation is complete.

## Dev Agent Record

### Agent Model Used

glm-5 (GLM Coding Plan)

### Debug Log References

N/A - No issues encountered during implementation.

### Completion Notes List

**2026-02-21:**
- ✅ Fixed security issue: Added `maskSensitiveData()` wrapper to error handler in `delete_user_file` tool (index.ts:1131)
- ✅ Enhanced test for HTTP 404 error: Now verifies `ZiplineError` with `mcpCode: RESOURCE_NOT_FOUND` and `httpStatus: 404`
- ✅ Added imports for `ZiplineError` and `McpErrorCode` in test file
- ✅ All 421 tests pass
- ✅ Linting passes with no errors

### File List

**Modified:**
- `src/index.ts` - Added `maskSensitiveData()` wrapper to error handler at line 1131
- `src/userFiles.test.ts` - Enhanced test for HTTP 404 error verification; added imports for `ZiplineError` and `McpErrorCode`

## Senior Developer Review (AI)

**Reviewer:** Sergio (via code-review workflow)
**Date:** 2026-02-21
**Outcome:** ✅ **APPROVED** - All acceptance criteria met, security fix implemented correctly

### Review Summary

**Acceptance Criteria Validation:**
- ✅ **AC1**: `deleteUserFile` correctly deletes files and returns success (userFiles.ts:335-391)
- ✅ **AC2**: HTTP 404 properly mapped to `RESOURCE_NOT_FOUND` error (test verified at userFiles.test.ts:1451-1452)
- ✅ **AC3**: File URL removed from response for security (userFiles.ts:389)

**Task Completion Audit:**
- ✅ Security fix applied: `maskSensitiveData()` wrapper added to index.ts:1131
- ✅ Test enhanced: HTTP 404 test now verifies `ZiplineError`, `mcpCode`, and `httpStatus`
- ✅ Full test suite passes: 421 tests passing
- ✅ Linting clean: No errors

**Code Quality:**
- ✅ Error handling follows architecture patterns (`mapHttpStatusToMcpError`)
- ✅ Security gate properly applied in error messages
- ✅ Test coverage comprehensive (5 test cases covering all edge cases)
- ✅ Implementation matches Epic 4 established patterns

### Issues Found

**🟢 LOW (Fixed):**
1. Story file not tracked in git - **FIXED**: Added to staging area

### Technical Debt Noted (Out of Scope)

**🟡 MEDIUM - For Future Sprint:**
Inconsistent `maskSensitiveData()` usage across other error handlers. The following tools are missing security masking:
- `validate_file_before_upload` (index.ts:728)
- `tmp_file_manager` error handlers (index.ts:776, 821, 846, 879)
- `get_statistics` (index.ts:1313)
- `check_health` (index.ts:1357)

**Recommendation:** Create a future story to audit and fix all error handlers for consistent security masking.

**Note:** This is NOT a blocker for Story 4.5 approval, as the scope only required fixing `delete_user_file`.

### Status Change

- **Before Review:** `review`
- **After Review:** `done`
- **Sprint Status Synced:** ✅ `4-5-implement-single-file-deletion: done`
