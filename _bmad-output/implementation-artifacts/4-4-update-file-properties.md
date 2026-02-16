# Story 4.4: Update File Properties

Status: done

## Story

As a **developer managing uploaded content**,
I want **to update properties of existing files (name, folder, favorite)**,
So that **I can reorganize and manage content without re-uploading**.

## Acceptance Criteria

1. **Given** a valid file ID and new name
   **When** `update_user_file` is called
   **Then** the file is renamed and success is returned

2. **Given** a valid file ID and new folder ID
   **When** `update_user_file` is called
   **Then** the file is moved to the new folder

3. **Given** a valid file ID and favorite flag
   **When** `update_user_file` is called
   **Then** the file's favorite status is updated

4. **Given** multiple properties in a single update
   **When** `update_user_file` is called
   **Then** all properties are updated atomically

5. **Given** an invalid file ID
   **When** `update_user_file` is called
   **Then** `RESOURCE_NOT_FOUND` error is returned

**FRs addressed:** FR16

## Tasks / Subtasks

- [x] Add `folderId` support to existing implementation (AC: #2)
  - [x] Add `folderId?: string | null` to `UpdateUserFileOptions` interface in userFiles.ts
  - [x] Add `folderId` to `updateUserFileInputSchema` in index.ts
  - [x] Add `folderId` mapping in tool handler (index.ts:1061-1068)
- [x] Fix security: Add `maskSensitiveData()` to error handler (AC: All)
  - [x] Wrap error message at index.ts:1084 with `maskSensitiveData()`
- [x] Add comprehensive tests (AC: #1-5)
  - [x] Test updating name property
  - [x] Test updating folderId (move to folder)
  - [x] Test updating favorite status
  - [x] Test updating multiple properties atomically
  - [x] Test HTTP 404 returns `RESOURCE_NOT_FOUND` MCP error code
  - [x] Test network error handling
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is an ENHANCEMENT Story

**The `updateUserFile()` function EXISTS but is INCOMPLETE.**

**Missing `folderId` support** - AC #2 requires moving files to folders, but `folderId` is NOT in the schema.

### Epic Context - Epic 4: Remote File Management

**Story Position:** Fourth story in Epic 4 - builds on metadata retrieval.

**Epic Objectives:**
- List and search files with idempotent URLs (Story 4.1 - DONE)
- Implement file search functionality (Story 4.2 - DONE)
- Retrieve detailed file metadata (Story 4.3 - DONE)
- **Update file properties (Story 4.4 - THIS STORY)**
- Implement single file deletion (Story 4.5)
- Implement batch file operations (Story 4.6)

**Dependencies:**
- **Requires Story 4.3 patterns** - Error handling, security masking (DONE)

### Missing Implementation: `folderId` Support

**CURRENT STATE - `folderId` is MISSING from:**

1. **Interface (userFiles.ts:245-256):**
```typescript
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
  // MISSING: folderId?: string | null;
}
```

2. **Schema (index.ts:328-377):**
```typescript
export const updateUserFileInputSchema = {
  id: z.string().describe('...'),
  favorite: z.boolean().optional().describe('...'),
  // ... other fields ...
  name: z.string().optional().describe('...'),
  // MISSING: folderId field
};
```

3. **Tool handler (index.ts:1054-1068):**
```typescript
if (args.favorite !== undefined) opts.favorite = args.favorite;
if (args.maxViews !== undefined) opts.maxViews = args.maxViews;
// ... other fields ...
if (args.name !== undefined) opts.name = args.name;
// MISSING: if (args.folderId !== undefined) opts.folderId = args.folderId;
```

**REQUIRED CHANGES:**

1. Add to `UpdateUserFileOptions` interface:
```typescript
folderId?: string | null;
```

2. Add to `updateUserFileInputSchema`:
```typescript
folderId: z
  .string()
  .nullable()
  .optional()
  .describe('Optional: Move the file to a different folder by providing the folder ID, or set to null to move to root (default: no change).'),
```

3. Add to tool handler:
```typescript
if (args.folderId !== undefined) opts.folderId = args.folderId;
```

### Security Issue: Missing `maskSensitiveData()`

**CRITICAL - Same issue fixed in Stories 4.2 and 4.3:**

**Current (index.ts:1084):**
```typescript
text: `❌ UPDATE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`,
```

**Required:**
```typescript
text: maskSensitiveData(`❌ UPDATE USER FILE FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`),
```

### Existing Implementation (userFiles.ts:258-326)

```typescript
export async function updateUserFile(
  options: UpdateUserFileOptions
): Promise<FileModel> {
  const { endpoint, token, id, ...updateFields } = options;

  // Parameter validation (lines 263-271)
  // Filter out undefined fields (lines 273-276)
  // Require at least one field (lines 278-281)
  // API call with PATCH (lines 283-292)
  // Error mapping uses mapHttpStatusToMcpError (line 302) ✓
  // Response validation (lines 305-319)
  // Returns file without URL (lines 321-325)
}
```

**Status:**
- ✅ Error mapping uses `mapHttpStatusToMcpError()`
- ✅ Parameter validation
- ✅ URL encoding for file ID
- ⚠️ Missing `folderId` support
- ⚠️ Error handler in index.ts missing `maskSensitiveData()`

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - Already correct in userFiles.ts:302
   - HTTP 404 → `RESOURCE_NOT_FOUND` with resolution guidance

2. **Security Gate (NFR6):**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - **MISSING** in index.ts:1084 - MUST FIX

3. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - `folderId` follows this convention

### File Structure Requirements

**Primary Files to Modify:**

| File | Lines | Change Required |
|------|-------|-----------------|
| `src/userFiles.ts` | 245-256 | Add `folderId` to interface |
| `src/index.ts` | 328-377 | Add `folderId` to schema |
| `src/index.ts` | 1061-1068 | Add `folderId` mapping |
| `src/index.ts` | 1084 | Add `maskSensitiveData()` |
| `src/userFiles.test.ts` | 979-1142 | Add new tests |

**Do NOT Modify:**
- `src/utils/errorMapper.ts` - Already correct
- `src/utils/security.ts` - Reference only

### Testing Requirements

**Framework:** Vitest (co-located `*.test.ts` pattern)

**Existing Tests (userFiles.test.ts:979-1142):**

| Test | Lines | Description | AC |
|------|-------|-------------|-----|
| `should update file properties` | 984-1038 | Tests multiple fields update | #3, #4 |
| `should handle removing password` | 1040-1085 | Tests null password | All |
| `should require at least one field` | 1087-1095 | Tests validation | All |
| `should handle API errors` | 1097-1112 | Tests HTTP 400 | All |
| `should validate required parameters` | 1114-1141 | Tests input validation | All |

**Test Gaps to Address:**

1. **AC #1 - Name Update:** No explicit test for `name` property update
2. **AC #2 - Folder Move:** No test for `folderId` (feature missing)
3. **AC #5 - HTTP 404:** Uses HTTP 400, need explicit 404 → RESOURCE_NOT_FOUND test
4. **Network Errors:** No network error handling test

**Recommended New Tests:**

```typescript
describe('updateUserFile - folder support', () => {
  it('should move file to a different folder', async () => {
    // Test folderId update
  });

  it('should move file to root by setting folderId to null', async () => {
    // Test null folderId
  });
});

describe('updateUserFile - name update', () => {
  it('should rename a file', async () => {
    // Test name property update
  });
});

describe('updateUserFile - error handling', () => {
  it('should return RESOURCE_NOT_FOUND for invalid file ID', async () => {
    // Test HTTP 404 → RESOURCE_NOT_FOUND
  });

  it('should handle network errors', async () => {
    // Test network failure
  });
});
```

**Test Command:**
```bash
npm test src/userFiles.test.ts
npm test  # Full suite
```

### Previous Story Intelligence

**From Story 4.3 (Retrieve Detailed File Metadata):**

**Critical Learnings:**
- **Security fixes required** - `maskSensitiveData()` was missing in error handlers
- **Error mapping consistency** - All functions must use `mapHttpStatusToMcpError()`
- **Test edge cases** - Important for update edge cases

**Code Review Fixes Applied in 4.3:**
- Fixed `maskSensitiveData()` missing in `get_user_file` error handler at index.ts:1034

**Apply Same Pattern Here:**
- ⚠️ index.ts:1084 needs `maskSensitiveData()` wrapper

**Patterns to Follow:**
- Use `vi.fn()` for mocking fetch
- Test both success and error paths
- Test null vs populated optional fields (folderId can be null)

### Git Intelligence Summary

**Recent Commits (Epic 4):**
```
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

1. **Folder Move:**
   - Moving to non-existent folder (API returns 404 for folder)
   - Moving to root (null folderId)
   - File ID encoding for special characters

2. **Atomic Updates:**
   - Multiple properties in single request
   - Undefined vs null handling (undefined = no change, null = clear)

3. **API Errors:**
   - 401 Unauthorized (invalid token)
   - 404 Not Found (invalid file ID) - AC #5
   - 400 Bad Request (invalid field values)

### References

1. **Epic Context:**
   - [Source: epics.md:724-753] - Story 4.4 requirements
   - [Source: epics.md:145-154] - Epic 4 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:169-171] - Naming conventions (camelCase)
   - [Source: architecture.md:232-234] - Logging gate (maskSensitiveData)

3. **Current Implementation:**
   - [Source: userFiles.ts:245-256] - UpdateUserFileOptions interface (MISSING folderId)
   - [Source: userFiles.ts:258-326] - updateUserFile implementation
   - [Source: index.ts:328-377] - Schema (MISSING folderId)
   - [Source: index.ts:1045-1091] - Tool handler (MISSING folderId + maskSensitiveData)
   - [Source: userFiles.test.ts:979-1142] - Existing tests

4. **Previous Stories:**
   - [Source: 4-3-retrieve-detailed-file-metadata.md] - Story 4.3 learnings (maskSensitiveData fix)

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- File IDs are URL-encoded to prevent injection
- Token is passed via authorization header, never in URL
- **FIX REQUIRED:** index.ts:1084 missing `maskSensitiveData()`

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── userFiles.ts              # UpdateUserFileOptions interface (ADD folderId)
│   ├── userFiles.test.ts         # Unit tests (ADD tests)
│   ├── index.ts                  # Schema + handler (ADD folderId, FIX maskSensitiveData)
│   └── utils/
│       ├── errorMapper.ts        # Error translation (reference)
│       └── security.ts           # maskSensitiveData (import)
```

**Alignment:** Need to add `folderId` support and fix security issue. Follow established patterns from Epic 4 stories.

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5

### Debug Log References

### Completion Notes List

- ✅ Added `folderId?: string | null` to `UpdateUserFileOptions` interface (src/userFiles.ts:256)
- ✅ Added `folderId` to `updateUserFileInputSchema` (src/index.ts:377-383)
- ✅ Added `folderId` mapping in tool handler (src/index.ts:1069)
- ✅ Fixed security: Wrapped error message with `maskSensitiveData()` (src/index.ts:1084-1086)
- ✅ Added 6 new comprehensive tests for updateUserFile:
  - `should rename a file` (AC #1)
  - `should move file to a different folder` (AC #2)
  - `should move file to root by setting folderId to null` (AC #2)
  - `should return RESOURCE_NOT_FOUND for invalid file ID` (AC #5)
  - `should handle network errors`
  - `should update multiple properties atomically` (AC #4)
- ✅ All 421 tests pass, lint clean

### File List

- `src/userFiles.ts` - Added `folderId?: string | null` to UpdateUserFileOptions interface
- `src/index.ts` - Added `folderId` to schema, added mapping in handler, wrapped error with `maskSensitiveData()`
- `src/userFiles.test.ts` - Added 7 new tests for folder support, name update, 404 error, network error, and atomic updates
