# Story 5.4: Implement Folder Editing

Status: done

## Story

As an **admin managing organization**,
I want **to rename or modify existing folders**,
So that **I can maintain a clean and relevant folder structure**.

## Acceptance Criteria

1. **Given** a valid folder ID and new name
   **When** `remote_folder_manager` with `EDIT` command is called
   **Then** the folder is renamed and success is returned

2. **Given** an invalid folder ID
   **When** `EDIT` is requested
   **Then** `RESOURCE_NOT_FOUND` error is returned

3. **Given** a new name that conflicts with existing folder
   **When** `EDIT` is requested
   **Then** an appropriate error is returned

**FRs addressed:** FR18 (EDIT command)

## Tasks / Subtasks

- [x] Enhance `editFolder()` tests for comprehensive HTTP error coverage (AC: All)
  - [x] Add test for HTTP 401 Unauthorized error
  - [x] Add test for HTTP 429 Rate Limit error
  - [x] Add test for HTTP 409 Conflict (duplicate folder name)
  - [x] Verify existing HTTP 404 error test coverage
- [x] Add tool-level tests for EDIT command in `index.test.ts` (AC: All)
  - [x] Test successful EDIT with valid folder ID and new name
  - [x] Test EDIT with non-existent folder ID
  - [x] Test EDIT with multiple properties (name, isPublic, allowUploads)
  - [x] Test EDIT error handling with security masking
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is an ENHANCEMENT Story

**The `editFolder()` function EXISTS and is MOSTLY COMPLETE.**

**Current Implementation Status:**
- ✅ `editFolder()` in remoteFolders.ts (lines 290-372)
- ✅ Supports TWO operations via different HTTP methods:
  - **PATCH** - Update folder properties (name, isPublic, allowUploads)
  - **PUT** - Add file to folder (via fileId parameter)
- ✅ Uses `mapHttpStatusToMcpError()` for HTTP error mapping
- ✅ Zod validation for requests with `EditFolderPropertiesRequestSchema` and `AddFileToFolderRequestSchema`
- ✅ EDIT command handler in index.ts (lines 1241-1273)
- ✅ try/catch with `maskSensitiveData()` for security
- ✅ HTTP 404 error test (RESOURCE_NOT_FOUND)
- ❌ Missing HTTP 401, 429, 409 error tests
- ❌ Missing tool-level tests for EDIT command

**Enhancement Required:**
1. **Test Coverage**: Add HTTP error tests for 401, 429, 409
2. **Tool Tests**: Add EDIT command tests to index.test.ts following LIST/ADD/INFO patterns

### Epic Context - Epic 5: Remote Folder Management

**Story Position:** Fourth story in Epic 5 - builds on folder listing, creation, and info retrieval patterns.

**Epic Objectives:**
- Implement folder listing (Story 5.1 - DONE)
- Implement folder creation (Story 5.2 - DONE)
- Retrieve folder information (Story 5.3 - DONE)
- **Implement folder editing (Story 5.4 - THIS STORY)**
- Implement folder deletion (Story 5.5 - NEXT)

**Dependencies:**
- **Requires Epic 4 patterns** - Error mapping and security masking patterns
- **Builds on Story 5.1, 5.2 & 5.3** - Same test patterns and security approach

### Existing Implementation Analysis

**1. `editFolder()` Function (remoteFolders.ts:290-372):**

```typescript
export async function editFolder(options: EditFolderOptions): Promise<Folder> {
  const { endpoint, token, id, name, isPublic, allowUploads, fileId } = options;

  if (fileId !== undefined) {
    // PUT - Add file to folder
    const requestBody: AddFileToFolderRequest = { id: fileId };
    AddFileToFolderRequestSchema.parse(requestBody);
    
    const response = await fetch(`${endpoint}/api/user/folders/${id}`, {
      method: 'PUT',
      headers: { authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw mapHttpStatusToMcpError(response.status, response.statusText);  // ✅ Already uses error mapper
    }
    // ... response handling
  } else {
    // PATCH - Update folder properties
    const requestBody: Partial<EditFolderPropertiesRequest> = {};
    if (name !== undefined) requestBody.name = name;
    if (isPublic !== undefined) requestBody.isPublic = isPublic;
    if (allowUploads !== undefined) requestBody.allowUploads = allowUploads;
    
    EditFolderPropertiesRequestSchema.parse(requestBody);
    
    const response = await fetch(`${endpoint}/api/user/folders/${id}`, {
      method: 'PATCH',
      headers: { authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw mapHttpStatusToMcpError(response.status, response.statusText);  // ✅ Already uses error mapper
    }
    // ... response handling
  }
}
```

**Current Status:**
- ✅ Proper error mapping via `mapHttpStatusToMcpError()`
- ✅ Zod schema validation for both PATCH and PUT operations
- ✅ Environment variable validation via caller (index.ts)
- ✅ Returns Folder with id and name
- ✅ Supports multiple property updates in single PATCH request

**2. EDIT Command Handler (index.ts:1241-1273):**

```typescript
if (upperCmd === 'EDIT' && id) {
  try {
    const opts: EditFolderOptions = {
      endpoint: ZIPLINE_ENDPOINT,
      token: ZIPLINE_TOKEN,
      id,
    };
    if (name !== undefined) opts.name = name;
    if (isPublic !== undefined) opts.isPublic = isPublic;
    if (allowUploads !== undefined) opts.allowUploads = allowUploads;
    if (fileId !== undefined) opts.fileId = fileId;
    const folder = await editFolder(opts);
    return {
      content: [
        {
          type: 'text',
          text: `✅ FOLDER UPDATED SUCCESSFULLY!\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: maskSensitiveData(
            `❌ EDIT FOLDER FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`
          ),
        },
      ],
      isError: true,
    };
  }
}
```

**Current Status:**
- ✅ try/catch with proper error handling
- ✅ `maskSensitiveData()` for security
- ✅ Returns formatted success message
- ✅ Supports all optional parameters (name, isPublic, allowUploads, fileId)

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - HTTP 401 → `UNAUTHORIZED_ACCESS` with resolution guidance
   - HTTP 404 → `RESOURCE_NOT_FOUND`
   - HTTP 409 → `RESOURCE_ALREADY_EXISTS` (duplicate folder name)
   - HTTP 429 → `RATE_LIMIT_EXCEEDED`
   - HTTP 500/502/503 → `INTERNAL_ZIPLINE_ERROR`

2. **Security Gate (NFR6):**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - Already implemented in EDIT handler - verify in tests

3. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - Current format is correct

### File Structure Requirements

**Primary Files to Modify:**

| File | Lines | Change Required |
|------|-------|-----------------|
| `src/remoteFolders.test.ts` | ~1004-1040 | Add HTTP error tests (401, 429, 409 for PATCH) |
| `src/index.test.ts` | Add new section | Add EDIT command tests |

**NO changes needed to:**
- `src/remoteFolders.ts` - editFolder already has proper error mapping
- `src/index.ts` - EDIT handler already has security masking

### Previous Story Intelligence

**From Story 5.3 (Retrieve Folder Information):**

**Critical Learnings:**
- **Security pattern established** - try/catch with `maskSensitiveData()` on all error outputs
- **Error mapping pattern** - `mapHttpStatusToMcpError()` for all HTTP errors
- **Test pattern established** - Mock function, call handler, verify output and security
- **HTTP error test pattern** - Use `toMatchObject()` to verify mcpCode and httpStatus
- **Tool test pattern** - Use `vi.mocked()` for function spying
- **INFO output enhanced** to show all folder details (public, file count, dates)

**Test Pattern to Follow (from Story 5.3):**
```typescript
describe('remote_folder_manager tool - EDIT command', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(fsMock).forEach((fn) => fn.mockReset());
    const imported = (await import('./index')) as unknown as {
      server: MockServer;
    };
    server = imported.server;
  });

  const getToolHandler = (toolName: string): ToolHandler | undefined => {
    const calls = server.registerTool.mock.calls as Array<
      [string, unknown, ToolHandler]
    >;
    const call = calls.find((c) => c[0] === toolName);
    return call?.[2];
  };

  it('should edit folder name successfully', async () => {
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockResolvedValue({
      id: 'folder-123',
      name: 'Updated Name',
    });

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ 
      command: 'EDIT', 
      id: 'folder-123',
      name: 'Updated Name'
    }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER UPDATED SUCCESSFULLY');
    expect(result.content[0]?.text).toContain('Updated Name');
    expect(result.content[0]?.text).toContain('folder-123');
  });

  it('should handle errors with security masking', async () => {
    vi.stubEnv('ZIPLINE_TOKEN', 'secret-token-for-testing');
    const { editFolder } = await import('./remoteFolders');
    const editFolderSpy = vi.mocked(editFolder);
    editFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ 
      command: 'EDIT', 
      id: 'test-id',
      name: 'New Name'
    }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('EDIT FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
    
    vi.unstubAllEnvs();
  });
});
```

### Git Intelligence Summary

**Recent Commits (Epic 4-5):**
```
78e139a feat(folder-management): Implement folder information retrieval with comprehensive test coverage
c7c6529 fix(folder-management): Add missing error mappings and validation for folder creation
e64c00b feat(folder-management): Implement folder listing with security and error handling
e0facf5 feat(batch): Add batch file operations with security and tests
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- Comprehensive test coverage with Vitest
- Mock patterns using `vi.mocked()` for function spying
- RESOURCE_ALREADY_EXISTS added for HTTP 409 (Story 5.2)
- Tool-level tests follow consistent pattern across commands

### Test Requirements

**Tests to Add in `remoteFolders.test.ts`:**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `HTTP 401 Unauthorized (PATCH)` | Test editFolder throws ZiplineError with UNAUTHORIZED_ACCESS | All |
| `HTTP 429 Rate Limit (PATCH)` | Test editFolder throws RATE_LIMIT_EXCEEDED | All |
| `HTTP 409 Conflict (PATCH)` | Test editFolder throws RESOURCE_ALREADY_EXISTS for duplicate name | #3 |
| `HTTP 401 Unauthorized (PUT)` | Test editFolder throws UNAUTHORIZED_ACCESS when adding file | All |
| `HTTP 429 Rate Limit (PUT)` | Test editFolder throws RATE_LIMIT_EXCEEDED when adding file | All |

**Note:** HTTP 404 test already exists in lines 1004-1024 (PATCH) and 1080-1101 (PUT).

**Tests to Add in `index.test.ts`:**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `EDIT folder name successfully` | Test EDIT with valid folder ID and new name | #1 |
| `EDIT folder not found` | Test EDIT with non-existent folder ID | #2 |
| `EDIT multiple properties` | Test EDIT with name, isPublic, allowUploads | #1 |
| `EDIT error with masking` | Verify maskSensitiveData on error | All |
| `EDIT with fileId (PUT operation)` | Test adding file to folder | #1 |
| `EDIT duplicate folder name` | Verify conflict error | #3 |

### Existing Tests Reference

**Already covered in remoteFolders.test.ts (lines 843-1115):**
- ✅ Update folder name (line 855)
- ✅ Update isPublic property (line 892)
- ✅ Update allowUploads property (line 927)
- ✅ Update multiple properties (line 962)
- ✅ HTTP 404 error handling for PATCH (line 1004)
- ✅ Validation error for empty name (line 1026)
- ✅ Add file to folder via PUT (line 1043)
- ✅ HTTP 404 error handling for PUT (line 1080)
- ✅ Validation error for empty fileId (line 1103)

**Test pattern for HTTP errors:**
```typescript
it('should throw ZiplineError with MCP error code on HTTP 401 (PATCH)', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  } as unknown as Response);

  const options: EditFolderOptions = {
    endpoint: mockEndpoint,
    token: mockToken,
    id: mockFolderId,
    name: 'Updated Name',
  };

  await expect(editFolder(options)).rejects.toMatchObject({
    mcpCode: McpErrorCode.UNAUTHORIZED_ACCESS,
    httpStatus: 401,
  });
});

it('should throw ZiplineError with MCP error code on HTTP 409 (PATCH)', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 409,
    statusText: 'Conflict',
  } as unknown as Response);

  const options: EditFolderOptions = {
    endpoint: mockEndpoint,
    token: mockToken,
    id: mockFolderId,
    name: 'Duplicate Folder Name',
  };

  await expect(editFolder(options)).rejects.toMatchObject({
    mcpCode: McpErrorCode.RESOURCE_ALREADY_EXISTS,
    httpStatus: 409,
  });
});
```

### References

1. **Epic Context:**
   - [Source: epics.md:880-901] - Story 5.4 requirements
   - [Source: epics.md:155-163] - Epic 5 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:232-234] - Logging gate (maskSensitiveData)

3. **Current Implementation:**
   - [Source: remoteFolders.ts:290-372] - editFolder function
   - [Source: remoteFolders.ts:243-262] - Request schemas
   - [Source: index.ts:1241-1273] - EDIT command handler
   - [Source: remoteFolders.test.ts:843-1115] - Existing unit tests

4. **Previous Stories:**
   - [Source: 5-3-retrieve-folder-information.md] - Story 5.3 learnings (test patterns)
   - [Source: 5-2-implement-folder-creation.md] - Story 5.2 learnings (RESOURCE_ALREADY_EXISTS)
   - [Source: 5-1-implement-folder-listing.md] - Story 5.1 learnings (test patterns)

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- Token is passed via authorization header, never in URL
- ✅ ALREADY IMPLEMENTED in EDIT handler
- Tests must verify security masking works correctly
- Use `vi.stubEnv()` / `vi.unstubAllEnvs()` for proper test cleanup

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── remoteFolders.ts          # editFolder function (NO CHANGES NEEDED)
│   ├── remoteFolders.test.ts     # Add HTTP error tests (401, 429, 409)
│   ├── index.ts                  # EDIT handler (NO CHANGES NEEDED)
│   └── index.test.ts             # Add EDIT command tests
```

**Alignment:** Enhancement story - add test coverage for existing implementation.

## Dev Agent Record

### Agent Model Used

Claude 3.5 Sonnet (glm-5)

### Debug Log References

N/A - No debug issues encountered during implementation.

### Completion Notes List

1. **HTTP Error Tests Added (remoteFolders.test.ts)**:
   - Added HTTP 401 Unauthorized test for PATCH operation
   - Added HTTP 429 Rate Limit test for PATCH operation
   - Added HTTP 409 Conflict (duplicate folder name) test for PATCH operation
   - Added HTTP 401 Unauthorized test for PUT operation
   - Added HTTP 429 Rate Limit test for PUT operation
   - All tests use `toMatchObject()` pattern to verify mcpCode and httpStatus

2. **Tool-Level Tests Added (index.test.ts)**:
   - Test successful EDIT with valid folder ID and new name
   - Test EDIT with non-existent folder ID (404 error)
   - Test EDIT with multiple properties (name, isPublic, allowUploads)
   - Test EDIT error handling with security masking
   - Test EDIT with fileId (PUT operation)
   - Test EDIT duplicate folder name conflict (409 error)
   - Test error when id parameter is missing
   - Test sensitive data masking in error messages
   - Test EDIT with only isPublic property
   - Test EDIT with only allowUploads property

3. **Test Results**:
   - All 471 tests pass (16 skipped)
   - Linting passes with no errors

4. **Key Patterns Followed**:
   - Security masking pattern using `vi.stubEnv()` and `vi.unstubAllEnvs()`
   - Tool-level test pattern using `vi.mocked()` for function spying
   - HTTP error test pattern using `toMatchObject()` for error validation

### Code Review Findings & Fixes (Auto-Applied)

**Review Date:** 2026-02-21  
**Reviewer:** Adversarial Senior Developer (code-review workflow)  
**Issues Found:** 6 total (0 Critical, 0 High, 4 Medium, 2 Low)

#### MEDIUM Issues (Auto-Fixed):

1. **Issue:** Missing HTTP 500 error test for `editFolder()` PATCH operation
   - **Fix Applied:** Added test case in `remoteFolders.test.ts` (line ~1091)
   - **Verification:** Test passes, coverage improved

2. **Issue:** Missing HTTP 500 error test for `editFolder()` PUT operation
   - **Fix Applied:** Added test case in `remoteFolders.test.ts` (line ~1237)
   - **Verification:** Test passes, coverage improved

3. **Issue:** Empty EDIT request allowed - `EditFolderPropertiesRequestSchema` permits `{}` which sends useless PATCH request
   - **Fix Applied:** Added validation in `remoteFolders.ts` (~line 344) to reject empty PATCH requests
   - **Error Message:** "At least one property (name, isPublic, or allowUploads) must be provided to update the folder"
   - **Verification:** Validation throws error before HTTP request

4. **Issue:** Missing test for EDIT command without any update parameters
   - **Fix Applied:** Added test case in `index.test.ts` (line ~2880)
   - **Verification:** Test confirms error handling works correctly

5. **Issue (discovered during fix):** Default value for `isPublic` in handler causes validation bypass
   - **Root Cause:** Line 1155 in `index.ts` had `isPublic = false` as default, which meant empty EDIT calls still passed `isPublic: false` to `editFolder()`
   - **Fix Applied:** Removed default value from destructuring, added `isPublic ?? false` only for ADD command (line 1216)
   - **Verification:** Empty EDIT calls now correctly trigger validation error

#### LOW Issues (Not Fixed):

1. **Issue:** Inconsistent test description style (minor formatting)
   - **Decision:** Not critical, style is acceptable

2. **Issue:** File List could include line ranges
   - **Decision:** Not critical for this story, consider for future

**Post-Fix Test Results:**
- ✅ All 474 tests pass (16 skipped)
- ✅ Linting passes with no errors
- ✅ All acceptance criteria validated

**Files Modified During Code Review:**
- `src/remoteFolders.test.ts` - Added 2 HTTP 500 error tests
- `src/remoteFolders.ts` - Added empty request validation
- `src/index.test.ts` - Added test for EDIT without parameters
- `src/index.ts` - Fixed isPublic default value issue

### File List

- `src/remoteFolders.test.ts` - Added HTTP error tests for editFolder (401, 429, 409, 500)
- `src/remoteFolders.ts` - Added validation to reject empty PATCH requests
- `src/index.test.ts` - Added tool-level tests for EDIT command including empty params test
- `src/index.ts` - Fixed isPublic default value to prevent validation bypass
