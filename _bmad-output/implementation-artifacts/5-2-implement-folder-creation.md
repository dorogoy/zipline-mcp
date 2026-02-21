# Story 5.2: Implement Folder Creation

Status: done

## Story

As an **admin setting up organization**,
I want **to create new folders in Zipline**,
So that **I can organize uploaded content into logical categories**.

## Acceptance Criteria

1. **Given** a valid folder name
   **When** `remote_folder_manager` with `ADD` command is called
   **Then** a new folder is created and its ID is returned

2. **Given** a folder name that already exists
   **When** creation is attempted
   **Then** an appropriate error is returned or the existing folder ID is returned

3. **Given** a folder name with invalid characters
   **When** creation is attempted
   **Then** an error is returned indicating invalid folder name

**FRs addressed:** FR18 (ADD command)

## Tasks / Subtasks

- [x] Enhance `createFolder()` tests for comprehensive HTTP error coverage (AC: All)
  - [x] Add test for HTTP 401 Unauthorized error
  - [x] Add test for HTTP 409 Conflict (folder already exists)
  - [x] Add test for HTTP 429 Rate Limit error
  - [x] Add test for HTTP 500 Internal Server error
- [x] Add tool-level tests for ADD command in `index.test.ts` (AC: All)
  - [x] Test successful ADD with folder name only
  - [x] Test successful ADD with isPublic parameter
  - [x] Test ADD with files array parameter
  - [x] Test ADD error handling with security masking
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is an ENHANCEMENT Story

**The `createFolder()` function EXISTS and is MOSTLY COMPLETE.**

**Current Implementation Status:**
- ✅ `createFolder()` in remoteFolders.ts (lines 189-232)
- ✅ Uses `mapHttpStatusToMcpError()` for HTTP error mapping
- ✅ Zod validation for request/response
- ✅ ADD command handler in index.ts (lines 1210-1240)
- ✅ try/catch with `maskSensitiveData()` for security
- ❌ Missing comprehensive HTTP error tests (only 400 covered)
- ❌ Missing tool-level tests for ADD command

**Enhancement Required:**
1. **Test Coverage**: Add HTTP error tests for 401, 409, 429, 500
2. **Tool Tests**: Add ADD command tests to index.test.ts following LIST pattern

### Epic Context - Epic 5: Remote Folder Management

**Story Position:** Second story in Epic 5 - builds on folder listing patterns.

**Epic Objectives:**
- Implement folder listing (Story 5.1 - DONE)
- **Implement folder creation (Story 5.2 - THIS STORY)**
- Retrieve folder information (Story 5.3)
- Implement folder editing (Story 5.4)
- Implement folder deletion (Story 5.5)

**Dependencies:**
- **Requires Epic 4 patterns** - Error mapping and security masking patterns
- **Builds on Story 5.1** - Same test patterns and security approach

### Existing Implementation Analysis

**1. `createFolder()` Function (remoteFolders.ts:189-232):**

```typescript
export async function createFolder(
  options: CreateFolderOptions
): Promise<Folder> {
  const { endpoint, token, name, isPublic, files } = options;

  const requestBody: Partial<CreateFolderRequest> = {
    name,
    isPublic: isPublic ?? false,
  };

  if (files && files.length > 0) {
    requestBody.files = files;
  }

  CreateFolderRequestSchema.parse(requestBody);

  const response = await fetch(`${endpoint}/api/user/folders`, {
    method: 'POST',
    headers: {
      authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw mapHttpStatusToMcpError(response.status, response.statusText);  // ✅ Already uses error mapper
  }

  const data = (await response.json()) as unknown;
  const validatedData = CreateFolderResponseSchema.parse(data);

  return {
    id: validatedData.id,
    name: validatedData.name,
  };
}
```

**Current Status:**
- ✅ Proper error mapping via `mapHttpStatusToMcpError()`
- ✅ Zod schema validation
- ✅ Support for name, isPublic, files parameters
- ✅ Handles folders without ID gracefully

**2. ADD Command Handler (index.ts:1210-1240):**

```typescript
if (upperCmd === 'ADD') {
  try {
    const folder = await createFolder({
      endpoint: ZIPLINE_ENDPOINT,
      token: ZIPLINE_TOKEN,
      name: name || 'New Folder',
      isPublic,
      files,
    });
    return {
      content: [
        {
          type: 'text',
          text: `✅ FOLDER CREATED SUCCESSFULLY!\n\n📁 ${folder.name}\n   🆔 ID: ${folder.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: maskSensitiveData(
            `❌ CREATE FOLDER FAILED\n\nError: ${error instanceof Error ? error.message : String(error)}`
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
- ✅ Returns formatted success message with folder ID

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20):**
   - HTTP errors MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - HTTP 401 → `UNAUTHORIZED_ACCESS` with resolution guidance
   - HTTP 409 → `RESOURCE_ALREADY_EXISTS` (folder already exists)
   - HTTP 429 → `RATE_LIMIT_EXCEEDED`
   - HTTP 500/502/503 → `INTERNAL_ZIPLINE_ERROR`

2. **Security Gate (NFR6):**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - Already implemented in ADD handler - verify in tests

3. **Response Format (NFR11):**
   - JSON responses use `camelCase` field names
   - Current format is correct

### File Structure Requirements

**Primary Files to Modify:**

| File | Lines | Change Required |
|------|-------|-----------------|
| `src/remoteFolders.test.ts` | 573-596 | Add HTTP error tests (401, 409, 429, 500) |
| `src/index.test.ts` | Add after 2297 | Add ADD command tests |

**NO changes needed to:**
- `src/remoteFolders.ts` - createFolder already has proper error mapping
- `src/index.ts` - ADD handler already has security masking

### Previous Story Intelligence

**From Story 5.1 (Implement Folder Listing):**

**Critical Learnings:**
- **Security pattern established** - try/catch with `maskSensitiveData()` on all error outputs
- **Error mapping pattern** - `mapHttpStatusToMcpError()` for all HTTP errors
- **Test pattern established** - Mock function, call handler, verify output and security
- **Test file structure** - Tests in `describe('remote_folder_manager tool - LIST command', ...)`

**Test Pattern to Follow:**
```typescript
describe('remote_folder_manager tool - ADD command', () => {
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

  it('should create folder successfully with name', async () => {
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockResolvedValue({
      id: 'new-folder-123',
      name: 'Test Folder',
    } as never);

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD', name: 'Test Folder' }, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('FOLDER CREATED');
    expect(result.content[0]?.text).toContain('Test Folder');
    expect(result.content[0]?.text).toContain('new-folder-123');
  });

  it('should handle errors with security masking', async () => {
    process.env.ZIPLINE_TOKEN = 'secret-token-for-testing';
    const { createFolder } = await import('./remoteFolders');
    const createFolderSpy = vi.mocked(createFolder);
    createFolderSpy.mockRejectedValue(
      new Error('Failed with token: secret-token-for-testing')
    );

    const handler = getToolHandler('remote_folder_manager');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({ command: 'ADD', name: 'Test' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('CREATE FOLDER FAILED');
    expect(result.content[0]?.text).not.toContain('secret-token-for-testing');
  });
});
```

### Git Intelligence Summary

**Recent Commits (Epic 4-5):**
```
a0243a4 feat(batch): Add batch file operations with security and tests
0c49156 feat: Implement single file deletion with security fixes
40d090a feat: Implement file property updates including folder movement
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- Comprehensive test coverage with Vitest
- Mock patterns using `vi.mocked()` for function spying

### Test Requirements

**Tests to Add in `remoteFolders.test.ts`:**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `HTTP 401 Unauthorized` | Test createFolder throws ZiplineError with UNAUTHORIZED_ACCESS | All |
| `HTTP 409 Conflict` | Test createFolder throws error for duplicate folder name | #2 |
| `HTTP 429 Rate Limit` | Test createFolder throws RATE_LIMIT_EXCEEDED | All |
| `HTTP 500 Internal Error` | Test createFolder throws INTERNAL_ZIPLINE_ERROR | All |

**Tests to Add in `index.test.ts`:**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `ADD folder successfully` | Test ADD with name parameter | #1 |
| `ADD folder with isPublic` | Test ADD with isPublic=true | #1 |
| `ADD folder with files` | Test ADD with files array | #1 |
| `ADD error with masking` | Verify maskSensitiveData on error | All |

### Existing Tests Reference

**Already covered in remoteFolders.test.ts (lines 420-719):**
- ✅ Create folder with minimal parameters
- ✅ Create folder with isPublic parameter
- ✅ Create folder with files parameter
- ✅ Create folder with all parameters
- ✅ HTTP 400 error handling (only one error test)
- ✅ Empty folder name validation
- ✅ Folder without ID handling

**Test pattern for HTTP errors:**
```typescript
it('should throw ZiplineError with MCP error code on HTTP 401', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  } as unknown as Response);

  await expect(createFolder(options)).rejects.toMatchObject({
    mcpCode: McpErrorCode.UNAUTHORIZED_ACCESS,
    httpStatus: 401,
  });
});

it('should throw ZiplineError with MCP error code on HTTP 409 (folder exists)', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 409,
    statusText: 'Conflict',
  } as unknown as Response);

  await expect(createFolder(options)).rejects.toMatchObject({
    mcpCode: McpErrorCode.RESOURCE_ALREADY_EXISTS,
    httpStatus: 409,
  });
});
```

### References

1. **Epic Context:**
   - [Source: epics.md:836-858] - Story 5.2 requirements
   - [Source: epics.md:155-163] - Epic 5 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:232-234] - Logging gate (maskSensitiveData)

3. **Current Implementation:**
   - [Source: remoteFolders.ts:189-232] - createFolder function
   - [Source: index.ts:1210-1240] - ADD command handler
   - [Source: remoteFolders.test.ts:420-719] - Existing unit tests

4. **Previous Stories:**
   - [Source: 5-1-implement-folder-listing.md] - Story 5.1 learnings (test patterns)

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token exposure
- Token is passed via authorization header, never in URL
- ✅ ALREADY IMPLEMENTED in ADD handler
- Tests must verify security masking works correctly

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── remoteFolders.ts          # createFolder function (NO CHANGES NEEDED)
│   ├── remoteFolders.test.ts     # Add HTTP error tests (401, 409, 429, 500)
│   ├── index.ts                  # ADD handler (NO CHANGES NEEDED)
│   └── index.test.ts             # Add ADD command tests
```

**Alignment:** Enhancement story - add test coverage for existing implementation.

## Dev Agent Record

### Agent Model Used

GLM-4 (zai-coding-plan/glm-5)

### Debug Log References

N/A - No debug issues encountered during implementation.

### Completion Notes List

**2026-02-21 (Initial Implementation):**
- ✅ Added 4 HTTP error tests (401, 409, 429, 500) to `remoteFolders.test.ts` for `createFolder()` function
- ✅ Added 7 tool-level tests for ADD command in `index.test.ts`:
  - `should create folder successfully with name only`
  - `should create folder successfully with isPublic parameter`
  - `should create folder successfully with files array parameter`
  - `should create folder with all parameters combined`
  - `should handle errors with security masking`
  - `should mask sensitive data in error messages`
  - `should use default name when name is not provided`
- ✅ All 448 tests pass (16 skipped - unrelated to this story)
- ✅ Linting passes with no errors

**Note on HTTP 409 handling:** The existing `errorMapper.ts` doesn't have a dedicated `RESOURCE_ALREADY_EXISTS` error code. HTTP 409 falls through to the default case and is mapped to `INTERNAL_ZIPLINE_ERROR`. The tests reflect this current behavior.

**2026-02-21 (Code Review Fixes):**
- ✅ **HIGH-1 FIXED**: Added `RESOURCE_ALREADY_EXISTS` to `McpErrorCode` enum in `errorMapper.ts`
- ✅ **HIGH-1 FIXED**: Added HTTP 409 → `RESOURCE_ALREADY_EXISTS` mapping in `mapHttpStatusToMcpError()`
- ✅ **HIGH-1 FIXED**: Added resolution guidance for HTTP 409 errors
- ✅ **HIGH-1 FIXED**: Updated test to verify `RESOURCE_ALREADY_EXISTS` error code for HTTP 409
- ✅ **MEDIUM-1 FIXED**: Added validation for invalid characters in folder names using Zod refine
- ✅ **MEDIUM-1 FIXED**: Added test for invalid characters validation (8 test cases)
- ✅ **MEDIUM-2 FIXED**: Removed `as never` type casts from all ADD command mocks (5 tests)
- ✅ **MEDIUM-3 FIXED**: Added test for folder creation with undefined ID
- ✅ All 450 tests pass (16 skipped - unrelated to this story)
- ✅ Linting passes with no errors

### File List

| File | Action | Description |
|------|--------|-------------|
| `src/utils/errorMapper.ts` | Modified | Added RESOURCE_ALREADY_EXISTS error code and HTTP 409 mapping |
| `src/remoteFolders.ts` | Modified | Added validation for invalid characters in folder names |
| `src/remoteFolders.test.ts` | Modified | Added 5 HTTP error tests + invalid character validation test |
| `src/index.test.ts` | Modified | Added 8 ADD command tests (fixed type casts, added undefined ID test) |
