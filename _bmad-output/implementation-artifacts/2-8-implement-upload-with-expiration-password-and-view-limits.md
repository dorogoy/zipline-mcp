# Story 2.8: Implement Upload with Expiration, Password, and View Limits

Status: done

## Story

As a **developer sharing sensitive content**,
I want **to set expiration dates, passwords, and view limits on uploads**,
So that **I can control access and lifecycle of shared files**.

## Acceptance Criteria

1. **Given** an upload request with `deletesAt` parameter (e.g., "7d", "24h")
   **When** uploaded to Zipline
   **Then** the file is configured to expire after the specified duration

2. **Given** an upload request with `password` parameter
   **When** uploaded
   **Then** the file requires the password to view/download

3. **Given** an upload request with `maxViews` parameter
   **When** uploaded
   **Then** the file becomes inaccessible after the specified number of views

4. **Given** multiple options combined (expiration + password + maxViews)
   **When** uploaded
   **Then** all options are applied correctly

**FRs addressed:** FR11
**NFRs addressed:** NFR2 (<2s upload pipeline)

## Tasks / Subtasks

- [x] Validate existing upload options implementation (AC: #1, #2, #3, #4)
  - [x] Review `validateDeleteAt()` in httpClient.ts - verify format validation
  - [x] Review `validatePassword()` in httpClient.ts - verify password validation
  - [x] Review `validateMaxViews()` in httpClient.ts - verify view limit validation
  - [x] Verify Zod schema in index.ts includes all parameters
  - [x] Verify tool handler passes all options to uploadFile()

- [x] Validate HTTP header integration
  - [x] Verify x-zipline-deletes-at header is set correctly
  - [x] Verify x-zipline-password header is set correctly
  - [x] Verify x-zipline-max-views header is set correctly

- [x] Validate test coverage
  - [x] Review httpClient.test.ts header validation tests
```bash
# Validation test (fail-fast)
```
  - [x] Review httpClient.test.ts integration tests
  - [x] Ensure all AC scenarios are covered

- [x] Update documentation if gaps found
  - [x] Verify docs/TOOL-DOCUMENTATION.md covers all options
  - [x] Add any missing examples or edge cases

## Dev Notes

### Epic Context - Epic 2: Secure File Upload Pipeline

This story is Story 2.8 in Epic 2, implementing advanced upload options for controlling file access and lifecycle. This extends Story 2.7 (single file upload) with additional security and access control features.

**Epic Objectives:**
- Complete the "Double-Blind" staging pipeline with atomic cleanup
- Enable Journey A (Bug Report) - Upload screenshots to Zipline
- Enable Journey B (Secure Status Share) - Upload config files with access controls
- Ensure NFR2 compliance: Upload pipeline < 2 seconds for files < 5MB

**Story Position:** Eighth story in Epic 2 - builds on Story 2.7 (single upload).

**Dependencies:**
- **Requires Story 2.7 (Single File Upload)** - Core upload functionality
- **Enables Story 2.9 (Folder Organization)** - Folder option available

### Architecture Patterns and Constraints

**Critical Architecture Requirements from architecture.md:**

1. **Staging Flow Pattern (MANDATORY - lines 183-192):**
   - Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**
   - **Story 2.8 Focus:** Adds validation for optional upload parameters
   - Options are passed during the Execute phase
   - Source: architecture.md:183-192
1.  **Staging Flow Pattern (MANDATORY - lines 183-192):**
    -   Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**
    -   **Story 2.8 Focus:- **PASS:** Tool handler correctly maps optional parameters
```bash
# Full test suite execution
```
    -   Options are passed during the Execute phase
    -   Source: architecture.md:183-192

2.  **Zipline Integration (FR10/FR11 - line 251):**
    -   Handled by `src/httpClient.ts`
    -   Optional headers for advanced features
    -   Source: architecture.md:251

#### Error Translation (FR20):
- Invalid options should fail fast with clear errors
- Uses `mapHttpStatusToMcpError()` from errorMapper.ts
- Source: architecture.md:146-152

**Component Structure:**
```typescript
src/index.ts              → upload_file_to_zipline tool definition
                         → Zod schema for all options
                         → Options passed to uploadFile()
src/httpClient.ts         → uploadFile() function
                         → validateDeleteAt(), validatePassword(), validateMaxViews()
                         → Header### Unit Tests (src/httpClient.test.ts)
```bash
npm test src/httpClient.test.ts
```

### Technical Requirements

**From PRD - Functional Requirement FR11:**
- **FR11: Apply expiration dates, passwords, and view limits (maxViews) during upload**
- Source: epics.md:507-532

**Current Implementation State:**

**✅ Already Implemented (Brownfield Validation):**

1.  **UploadOptions interface (httpClient.ts:12-30):**
    ```typescript
    interface UploadOptions {
      deletesAt?: string;    // File expiration
      password?: string;     // Password protection
      maxViews?: number;     // View limits
      folder?: string;       // Folder placement
    }
    ```

2.  **Validation functions (httpClient.ts:356-450):**
    -   `validateDeleteAt(deleteAt: string)` - Validates expiration format
        -   Supports: relative durations ("1d", "2h", "30m")
        -   Supports: absolute dates ("date=2025-12-31T23:59:59Z")
        -   Rejects: past dates, invalid formats
    -   `validatePassword(password: string)` - Validates password
        -   Requires: non-empty, non-whitespace string
    -   `validateMaxViews(maxViews: number)` - Validates view limit
        -   Requires: non-negative integer

3.  **Zod schema (index.ts:185-225):**
    ```typescript
    deletesAt: z.string().optional().describe('...expiration...'),
    password: z.string().optional().describe('...password protection...'),
    maxViews: z.number().int().nonnegative().optional().describe('...view limits...'),
    folder: z.string().optional().describe('...folder ID...'),
    ```

4.  **Tool handler (index.ts:517-521):**
    ```typescript
    if (password !== undefined) opts.password = password;
    if (maxViews !== undefined) opts.maxViews = maxViews;
    if (folder !== undefined) opts.folder = folder;
    if (deletesAt !== undefined) opts.deletesAt = deletesAt;
    ```

5.  **HTTP headers (httpClient.ts:136-142):**
    ```typescript
    if (deletesAt !== undefined) headers['x-zipline-deletes-at'] = deletesAt;
    if (password !== undefined) headers['x-zipline-password'] = password;
    if (maxViews !== undefined) headers['x-zipline-max-views'] = maxViews.toString();
    if (folder !== undefined) headers['x-zipline-folder'] = folder;
    ```

**Technology Stack:**
- TypeScript (ES2022 target)
- Node.js 18+ (native fetch, FormData, Blob)
- @modelcontextprotocol/sdk
- Zod for validation
- Vitest for testing
- Source: architecture.md:88-98

### Zipline API Integration

**Upload Headers:**
- `x-zipline-deletes-at`: Expiration time
  - Relative: "1d", "2h", "30m"
  - Absolute: "date=2025-12-31T23:59:59Z"
- `x-zipline-password`: Password for file access
- `x-zipline-max-views`: Maximum view count (integer)
- `x-zipline-folder`: Target folder ID (alphanumeric)

**API Behavior:**
- All options are optional
- Options can be combined
- Invalid values are rejected before upload (fail-fast)
- Missing folder ID causes upload failure (folder must exist)
- Options are independent

### File Structure Requirements

**Primary Files (Validation Focus):**
1.  **src/httpClient.ts** - Core upload logic and validation
    -   Validate uploadFile() handles all options
    -   Verify validation functions
    - **PASS:** Upload header construction (x-zipline-*)

**Integration Results (2026-02-14):**
2.  **src/index.ts** - Tool definition
    -   Validate Zod schema includes all options
    -   Verify options are passed to uploadFile()

3.  **src/httpClient.test.ts** - Unit tests
    -   Validate existing tests cover all ACs
    -   Add missing tests if gaps found

**Do NOT:**
- Rewrite upload logic (it works)
- Change validation functions (established patterns)
- Modify staging logic (Stories 2.4/2.5/2.6)
- Add new dependencies

### Testing Requirements

**From Architecture:**
- Co-located test pattern: `*.test.ts` alongside implementation
- Framework: Vitest
- Source: architecture.md:175

**Existing Test Coverage (httpClient.test.ts):**

1.  **validateDeleteAt Tests (lines 238-294):**
    -   ✅ Accepts valid relative durations ("1d", "2h", "30m", "7d")
    -   ✅ Accepts valid absolute date format
    -   ✅ Rejects invalid relative durations
    -   ✅ Rejects invalid absolute date format
    -   ✅ Rejects past dates

2.  **validatePassword Tests (lines 296-310):**
    -   ✅ Accepts non-empty strings
    -   ✅ Rejects empty strings
    -   ✅ Rejects whitespace-only strings

3.  **validateMaxViews Tests (lines 313-336):**
    -   ✅ Accepts non-negative integers (0, 1, 100)
    -   ✅ Rejects negative integers
    -   ✅ Rejects non-integer values

4.  **Integration Tests (lines 367-677):**
    -   ✅ `includes x-zipline-deletes-at header when provided`
    -   ✅ `includes x-zipline-password header when provided`
    -   ✅ `includes x-zipline-max-views header when provided`
    -   ✅ `includes x-zipline-folder header when provided`
    -   ✅ `includes multiple new headers when provided together`
    -   ✅ `rejects upload with invalid delete-at header before making request`
    -   ✅ `rejects upload with invalid password header before making request`
    -   ✅ `rejects upload with invalid max-views header before making request`
    -   ✅ `rejects upload with invalid folder header before making request`
    -   ✅ `works correctly without any new headers (backward compatibility)`

**Test Gaps to Check:**
-   [ ] Integration test with actual Zipline server (optional - unit tests sufficient)
-   [ ] Edge case: maxViews = 0 (file immediately inaccessible)
-   [ ] Edge case: very long password strings

**Testing Pattern:**
```typescript
describe('upload with expiration/password/maxViews', () => {
  it('applies all options when provided together', async () => {
    const url = await uploadFile({
      endpoint,
      token,
      filePath,
      format,
      deletesAt: '7d',
      password: 'secret123',
      maxViews: 10,
    });
    // Verify headers in fetch call
    expect(headers['x-zipline-deletes-at']).toBe('7d');
    expect(headers['x-zipline-password']).toBe('secret123');
    expect(headers['x-zipline-max-views']).toBe('10');
  });
});
```

### Previous Story Intelligence

**From Story 2.7 (Implement Single File Upload to Zipline):**

**Key Learnings:**
1.  **Brownfield validation approach works well:**
    -   Existing implementation was complete
    -   Test coverage was comprehensive
    -   No code changes required
    -   Source: 2-7-implement-single-file-upload-to-zipline.md

2.  **try/finally cleanup pattern established:**
    -   All upload operations use try/finally
    -   Guarantees cleanup in all code paths
    -   Pattern: `try { upload } finally { clearStagedContent() }`
    -   Source: index.ts:502-533

3.  **Test infrastructure mature:**
    -   390+ tests passing after Story 2.7
    -   Comprehensive mock patterns
    -   Source: Story 2.7 completion notes

4.  **Story 2.7 fixed test issues:**
    -   Fixed mock implementations
    -   Fixed test assertions
    -   Added `initializeCleanup` mock
    -   Source: Story 2.7 senior developer review

**Files Modified in Story 2.7:**
- `src/index.test.ts` - Fixed mock implementations and test assertions

**Patterns to Follow:**
- Validate existing implementation (brownfield approach)
- Ensure all tests still pass
- Document any gaps found
- No unnecessary code changes

### Git Intelligence Summary

**Recent Commit Patterns (Epic 2 Context):**
```
f43029c feat: Implement atomic startup cleanup... (story 2.6)
bf61351 feat: Introduce disk-based fallback staging... (story 2.5)
3b35830 feat: Implement memory-first ephemeral file staging... (story 2.4)
```

**Key Patterns from Recent Commits:**
- Comprehensive test coverage with Vitest
- Detailed JSDoc documentation
- try/finally cleanup pattern
- Security-first approach
- Co-located tests (*.test.ts)

**Libraries and Dependencies:**
- @modelcontextprotocol/sdk - MCP protocol
- Node.js native: fs/promises, fetch, FormData, Blob
- mime-types - MIME type detection
- Vitest - Testing framework
- **No new dependencies needed for Story 2.8**

### Current Implementation State

**What's Already Working:**

1. ✅ **Validation Functions (httpClient.ts:356-450):**
   - validateDeleteAt() - Expiration validation
   - validatePassword() - Password validation
   - validateMaxViews() - View limit validation
   - validateFolder() - Folder ID validation

2. ✅ **Zod Schema (index.ts:185-225):**
   - All options have descriptions
   - Proper type constraints

3. ✅ **Tool Handler (index.ts:517-521):**
   - All options passed to uploadFile()

4. ✅ **HTTP Headers (httpClient.ts:136-142):**
   - All headers correctly constructed

5. ✅ **Test Coverage (httpClient.test.ts):**
   - 30+ tests for validation functions
   - Integration tests for all headers
   - Combined options test

**Validation Results (2026-02-14):**

1. **AC#1 - deletesAt works:**
   - Verify format validation
   - Verify header is sent

2. **AC#2 - password works:**
   - Verify non-empty validation
   - Verify header is sent

3. **AC#3 - maxViews works:**
   - Verify non-negative integer validation
   - Verify header is sent

4. **AC#4 - Combined options:**
   - Verify all headers sent together
   - Verify no conflicts

### Known Issues and Edge Cases

**Upload Options Edge Cases:**

1. **Expiration (deletesAt):**
   - Past dates rejected with error
   - Invalid formats rejected before upload
   - Relative durations must be positive

2. **Password:**
   - Empty strings rejected
   - Whitespace-only strings rejected
   - No length limit (Zipline may have server-side limit)

3. **View Limits (maxViews):**
   - 0 means immediately inaccessible
   - Negative values rejected
   - Non-integers rejected

4. **Combined Options:**
   - All options are independent
   - No conflicts between options
   - Validation happens before staging

### References

All technical details sourced from:

1. **Epic Context:**
   - [Source: epics.md:507-532] - Epic 2, Story 2.8 requirements
   - [Source: epics.md:326-351] - Epic 2 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:183-192] - Staging Flow Pattern
   - [Source: architecture.md:251] - Zipline integration
   - [Source: architecture.md:146-152] - Error code mapping

3. **Functional Requirements:**
   - [Source: epics.md:FR11] - Expiration/password/view limits

4. **Current Implementation:**
   - [Source: httpClient.ts:12-30] - UploadOptions interface
   - [Source: httpClient.ts:356-450] - Validation functions
   - [Source: httpClient.ts:136-142] - Header construction
   - [Source: index.ts:185-225] - Zod schema
   - [Source: index.ts:517-521] - Tool handler
   - [Source: httpClient.test.ts:238-677] - Test coverage

5. **Previous Story Learnings:**
   - [Source: 2-7-implement-single-file-upload-to-zipline.md] - Single upload patterns

### Project Structure Notes

**Current Project Structure:**
```
zipline-mcp/
├── src/
│   ├── index.ts              # upload_file_to_zipline tool (VALIDATE)
│   ├── index.test.ts         # Tool integration tests
│   ├── httpClient.ts         # uploadFile() + validation (VALIDATE)
│   ├── httpClient.test.ts    # Validation + integration tests (VALIDATE)
│   ├── sandboxUtils.ts       # stageFile(), clearStagedContent()
│   ├── sandboxUtils.test.ts  # Staging tests
│   ├── utils/
│   │   ├── security.ts       # Masking, secret detection
│   │   └── errorMapper.ts    # HTTP to MCP error mapping
│   └── [other modules]
├── docs/
│   └── TOOL-DOCUMENTATION.md # Tool reference (UPDATE if needed)
└── [config files]
```

**Alignment Notes:**
- All Epic 1```

### Security Considerations
- All Epic 1 security foundations in place
- Stories 2.1-2.7 complete and tested
- Upload options already implemented, needs validation
- Test infrastructure established (390+ tests passing)

### Implementation Guidance for Dev Agent

**🚨 CRITICAL: This is Brownfield Validation**

The upload options (expiration, password, maxViews, folder) are **ALREADY IMPLEMENTED**. Your job is to:

1. ✅ **VALIDATE** existing validation functions work correctly (AC#1, AC#2, AC#3)
2. ✅ **VALIDATE** options are correctly passed to Zipline (all ACs)
3. ✅ **TEST** any gaps in coverage
4. ✅ **DOCUMENT** any findings

**DO NOT:**
- ❌ Rewrite `validateDeleteAt()` (it works correctly)
- ❌ Rewrite `validatePassword()` (it works correctly)
- ❌ Rewrite `validateMaxViews()` (it works correctly)
- ❌ Change the header construction (it works correctly)
- ❌ Add new dependencies

**DO:**
- ✅ Validate existing validation functions
- ✅ Validate headers are correctly set
- ✅ Validate combined options work together
- ✅ Run all tests and ensure they pass
- ✅ Update documentation if needed

**Key Validation Points:**

1. **AC#1 - deletesAt works:**
   ```typescript
   // Verify this works:
   const url = await uploadFile({ ..., deletesAt: '7d' });
   expect(headers['x-zipline-deletes-at']).toBe('7d');
   ```

2. **AC#2 - password works:**
   ```typescript
   // Verify this works:
   const url = await uploadFile({ ..., password: 'secret123' });
   expect(headers['x-zipline-password']).toBe('secret123');
   ```

3. **AC#3 - maxViews works:**
   ```typescript
   // Verify this works:
   const url = await uploadFile({ ..., maxViews: 10 });
   expect(headers['x-zipline-max-views']).toBe('10');
   ```

4. **AC#4 - Combined options:**
   ```typescript
   // Verify this works:
   const url = await uploadFile({
     ...,
     deletesAt: '7d',
     password: 'secret123',
     maxViews: 10,
   });
   // All headers should be set
   ```

**Success Criteria:**
- All existing tests still pass
- Any test gaps filled
- Documentation updated if needed
- No sensitive information in logs

### Completion Notes List

1. **Brownfield Validation Complete** - This was a validation story confirming existing implementation works correctly.
2. **Enhanced Header Validation (Senior Review Follow-up)**:
   - Added validation for control characters in `originalName` to prevent header injection.
   - Added length limit (512 chars) to `password` to prevent HTTP 431 errors.
   - Expanded `folder` ID validation to allow hyphens and underscores (supporting UUIDs and slugs).
3. **All Validation Functions Verified (httpClient.ts:356-455)**:
   - `validateDeleteAt()` correctly handles relative durations and absolute dates.
   - `validatePassword()` correctly rejects empty/whitespace strings and enforces length limits.
   - `validateMaxViews()` correctly validates non-negative integers.
4. **HTTP Header Integration Verified (httpClient.ts:136-142)**:
   - All x-zipline-* headers correctly constructed.
5. **Zod Schema Verified (index.ts:193-225)**:
   - All optional parameters included with proper types and descriptions.
6. **Tool Handler Verified (index.ts:517-521)**:
   - All options correctly passed to uploadFile().
7. **Test Coverage Enhanced (httpClient.test.ts)**:
   - Added unit tests for new validation rules (length limits, control characters, special folder chars).
   - 31 unit/integration tests pass for header logic.
8. **Documentation Complete (docs/TOOL-DOCUMENTATION.md)**:
   - All options documented with examples.
9. **Full Regression Test**:
   - 391 tests pass.
   - No regressions introduced.

### File List

**Files Modified:**
- `src/httpClient.ts` - Enhanced validation logic for upload headers.
- `src/httpClient.test.ts` - Added tests for enhanced validation rules.
- `src/index.test.ts` - Maintenance: Normalizing sandbox paths in tests for consistency.

**Files Reviewed (No Changes Required):**
- `src/index.ts` - Verified Zod schema and tool handler.
- `docs/TOOL-DOCUMENTATION.md` - Verified complete documentation.

## Senior Developer Review (AI)

### Adversarial Review Findings (2026-02-14)

- **[MEDIUM] Documentation Discrepancy**: Git status showed changes to `src/index.test.ts` that weren't listed. Fixed by including them as maintenance/normalization tasks.
- **[MEDIUM] Injection Risk**: `validateOriginalName` lacked control character blocking. Fixed.
- **[LOW] Reliability (Header Size)**: `validatePassword` lacked length limits. Fixed (512 char limit).
- **[LOW] Usability (Folder IDs)**: strictly alphanumeric folder IDs were too restrictive. Fixed (now allowed `-` and `_`).

**Outcome: Approved with fixes applied.**
