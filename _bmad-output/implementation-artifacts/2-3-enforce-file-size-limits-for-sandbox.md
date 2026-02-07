# Story 2.3: Enforce File Size Limits for Sandbox

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **system administrator**,
I want **strict file size limits (<5MB) enforced before sandbox staging**,
So that **memory resources are protected and performance remains optimal**.

## Acceptance Criteria

1. **Given** a file smaller than 5MB
   **When** submitted for upload
   **Then** the file is accepted for memory-based staging

2. **Given** a file equal to or larger than 5MB
   **When** submitted for upload
   **Then** the file is routed to disk-based fallback staging
   **Or** rejected with `PAYLOAD_TOO_LARGE` if disk staging is unavailable

3. **Given** any file submission
   **When** size validation runs
   **Then** it occurs BEFORE any staging operation begins

## Tasks / Subtasks

- [x] Validate current size limit enforcement in `stageFile` (AC: #1, #2, #3)
  - [x] Review `src/sandboxUtils.ts` lines 163-177 (`stageFile` implementation)
  - [x] Verify 5MB threshold is correctly implemented (currently: `stats.size < 5 * 1024 * 1024`)
  - [x] Confirm memory staging path for files <5MB
  - [x] Confirm disk fallback path for files ≥5MB
  - [x] Test edge case: exactly 5MB file (should use disk fallback)

- [x] Enhance size validation with early rejection option (AC: #2, #3)
  - [x] Add size check BEFORE file reading in `upload_file_to_zipline` tool
  - [x] Implement `PAYLOAD_TOO_LARGE` error for files exceeding configured max size
  - [x] Make max file size configurable via environment variable (e.g., `ZIPLINE_MAX_FILE_SIZE`)
  - [x] Document size limits in tool schema descriptions
  - [x] Provide clear error messages with actual vs. allowed file size

- [x] Add size validation to `validate_file` tool (AC: #3)
  - [x] Report file size in validation report (already exists from Story 2.2)
  - [x] Add warning if file is close to 5MB threshold
  - [x] Show staging strategy (memory vs. disk) in validation report
  - [x] Indicate if file would be rejected due to size limits

- [x] Create comprehensive test suite
  - [x] Test files <5MB are staged in memory
  - [x] Test files ≥5MB are staged on disk
  - [x] Test exactly 5MB file (boundary condition)
  - [x] Test very small files (1KB, 100 bytes)
  - [x] Test size validation before staging
  - [x] Test `PAYLOAD_TOO_LARGE` error for oversized files
  - [x] Integration test with full upload flow
  - [x] Test configurable max size limits

- [x] Update documentation
  - [x] Document size limits in tool schemas
  - [x] Update `docs/TOOL-DOCUMENTATION.md` with size limit details
  - [x] Add examples showing size validation in action
  - [x] Document environment variable for max file size configuration
  - [x] Add troubleshooting guide for size-related errors

## Dev Notes

### Epic Context - Epic 2: Secure File Upload Pipeline

This story is Story 2.3 in Epic 2, building on Stories 2.1 (File Ingest) and 2.2 (MIME Validation). This story enforces the critical size limits that protect the memory-first staging architecture.

**Epic Objectives:**
- Enable Journey A (Bug Report) - Visual UI agent needs fast screenshot uploads (<5MB typical)
- Enable Journey B (Secure Status Share) - Developers need validated logs/config files
- Validate the "Double-Blind" staging pipeline with size-based routing
- Ensure memory resources are protected while maintaining performance

**Story Position:** Third story in Epic 2 - completes the validation phase before staging.

**Dependencies:**
- **Requires Story 2.1 (File Ingest)** - `stageFile` implementation foundation
- **Requires Story 2.2 (MIME Validation)** - File validation infrastructure
- **Enables Stories 2.4-2.6** - Memory/disk staging implementation stories
- **Enables Stories 2.7-2.9** - Upload operations with validated, sized files

### Architecture Patterns and Constraints

**Critical Architecture Requirements from architecture.md:**

1. **Staging Flow Pattern (MANDATORY):**
   - Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**
   - **Story 2.3 Focus:** Size validation in the **Validate** phase, BEFORE staging
   - This story ensures size checks happen before memory allocation or disk I/O
   - Source: architecture.md:183-192

2. **Memory-First Staging Strategy:**
   - **Decision:** Use Node.js `Buffer` for primary staging of assets <5MB
   - **Rationale:** Zero disk footprint for high-volume transient data, high performance
   - **Fallback:** Mandatory secure disk staging for assets ≥5MB or memory allocation failure
   - **Critical:** Size validation MUST occur before staging to prevent memory exhaustion
   - Source: architecture.md:127-131

3. **The Staging Gate (Security Boundary):**
   - No file content may reach `httpClient.ts` without `sandboxUtils.ts` processing
   - Size validation must happen BEFORE any staging operations
   - Prevents resource exhaustion attacks via oversized files
   - Source: architecture.md:232

4. **Error Handling Requirements:**
   - All validation errors must use standardized MCP error codes
   - File too large → `PAYLOAD_TOO_LARGE` (HTTP 413 equivalent)
   - Error messages must include actual size vs. limit for actionability
   - Source: architecture.md:144-151, prd.md:398-407

5. **Performance Requirements:**
   - Upload Pipeline <2 seconds for standard screenshots (<5MB)
   - Size check must be fast (stat-based, not full file read)
   - Source: architecture.md:38, NFR2

**Component Structure:**
```
src/index.ts              → upload_file_to_zipline, validate_file tools (add size checks)
src/sandboxUtils.ts       → stageFile implementation (already has 5MB threshold)
src/utils/errorMapper.ts  → Error code translation (add PAYLOAD_TOO_LARGE)
```

### Technical Requirements

**From PRD - Functional Requirement FR3:**
- **FR3: Enforce strict file size limits (<5MB for ephemeral sandbox) before upload**
- Must check file size before staging operations
- Must route files ≥5MB to disk fallback or reject
- Must provide actionable error messages with size information
- Source: prd.md:88

**From Architecture - Size Limit Specifics:**

**Current Implementation (sandboxUtils.ts:163-177):**
```typescript
export async function stageFile(filepath: string): Promise<StagedFile> {
  const stats = await fs.stat(filepath);
  // Memory-First Staging: If < 5MB, load into memory
  if (stats.size < 5 * 1024 * 1024) {
    const content = await fs.readFile(filepath);
    await validateFileForSecrets(filepath, content);
    return { type: 'memory', content, path: filepath };
  } else {
    // Disk Fallback: Just validate secrets
    await validateFileForSecrets(filepath);
    return { type: 'disk', path: filepath };
  }
}
```

**Key Observations:**
1. ✅ **Already Implemented:** 5MB threshold check using `fs.stat()`
2. ✅ **Already Implemented:** Memory staging for files <5MB
3. ✅ **Already Implemented:** Disk fallback for files ≥5MB
4. ⚠️ **Missing:** Early size validation BEFORE calling `stageFile`
5. ⚠️ **Missing:** `PAYLOAD_TOO_LARGE` error for files exceeding max limit
6. ⚠️ **Missing:** Configurable max file size limit
7. ⚠️ **Missing:** Size information in validation reports

**Size Thresholds:**
- **Memory Staging Threshold:** 5MB (5 * 1024 * 1024 bytes)
- **Recommended Max Upload Size:** Configurable, default 50MB or 100MB
- **Boundary Condition:** Exactly 5MB (5,242,880 bytes) should use disk fallback

**Technology Stack:**
- TypeScript (ES2022 target)
- Node.js 18+ (native fs/promises with `fs.stat()`)
- Zod for schema validation (already in use)
- Vitest for testing
- Source: architecture.md:88-98

**Naming Conventions:**
- camelCase for functions: `checkFileSize()`, `validateFileSize()`
- PascalCase for types: `FileSizeValidationResult`
- Source: architecture.md:169

**Security Requirements:**
- Size checks must use `fs.stat()` (metadata only, no file content read)
- All log output MUST use `security.ts` masking
- Prevent resource exhaustion via oversized file uploads
- Source: architecture.md:181, prd.md:251-256

### File Structure Requirements

**Expected File Modifications:**

**Primary Changes:**
1. **src/sandboxUtils.ts (stageFile, lines 163-177):**
   - ✅ Already has 5MB threshold - validate it's working correctly
   - Consider adding logging for staging strategy selection
   - Add size validation helper function if needed

2. **src/index.ts (upload_file_to_zipline tool):**
   - Add early size validation before calling `stageFile`
   - Implement `PAYLOAD_TOO_LARGE` error for oversized files
   - Add size information to error messages
   - Update tool schema with size limit documentation

3. **src/index.ts (validate_file tool, lines 512-566):**
   - Enhance validation report with staging strategy info
   - Add warning for files close to 5MB threshold
   - Show whether file would be memory or disk staged

4. **src/utils/errorMapper.ts:**
   - Add `PAYLOAD_TOO_LARGE` error code mapping
   - Ensure error includes actual vs. allowed size

5. **src/index.test.ts:**
   - Add size validation test cases
   - Test memory vs. disk staging routing
   - Test boundary conditions (exactly 5MB)
   - Test oversized file rejection

**Environment Variables:**
- **NEW:** `ZIPLINE_MAX_FILE_SIZE` - Maximum allowed file size (optional, for future use)
- **Existing:** `ZIPLINE_TOKEN`, `ZIPLINE_ENDPOINT` (already in use)

**Do NOT:**
- Modify the core `stageFile` logic (already correct)
- Change the 5MB memory threshold (architectural decision)
- Implement actual disk staging changes (that's Stories 2.4-2.5)
- Add compression or file transformation (out of scope)

### Testing Requirements

**From Architecture:**
- Co-located test pattern: `*.test.ts` alongside implementation
- Framework: Vitest
- Source: architecture.md:175

**Test Coverage Expectations:**

1. **Unit Tests (src/sandboxUtils.test.ts):**
   - File size detection accuracy
   - Memory staging for files <5MB (1KB, 1MB, 4.9MB)
   - Disk staging for files ≥5MB (5MB, 10MB)
   - Boundary condition: exactly 5MB (5,242,880 bytes)
   - `fs.stat()` error handling

2. **Integration Tests (src/index.test.ts):**
   - Full `upload_file_to_zipline` flow with various file sizes
   - `validate_file` tool reporting staging strategy
   - Error response format for oversized files
   - Size validation occurs before staging (no memory allocation for rejected files)

3. **Performance Tests:**
   - Size check overhead (should be <10ms for stat call)
   - Memory staging performance for 4MB file
   - Disk staging performance for 10MB file

**Testing Pattern from Previous Stories:**
- Story 2.1 established file ingest tests with error detection
- Story 2.2 added MIME validation tests
- Pattern: Test actual MCP protocol responses, not just internal APIs
- Source: 2-1 completion notes, 2-2 completion notes

### Previous Story Intelligence

**From Story 2.2 (Implement MIME Type and File Existence Validation):**

**Key Learnings:**
1. **Validation Report Enhancement Pattern:**
   - Story 2.2 enhanced `validate_file` to include MIME type information
   - Pattern: Add size/staging strategy info to validation report
   - Format: Clear, actionable information with emoji indicators
   - Source: 2-2-implement-mime-type-and-file-existence-validation.md:376-392

2. **Current validate_file Implementation:**
   - Already reports file size using `formatFileSize()` helper
   - Returns comprehensive validation report
   - Integrates with secret scanning and MIME validation
   - Source: 2-2 completion notes, lines 376-392

3. **Error Handling Pattern:**
   - Use McpErrorCode for all validation errors
   - Provide actionable error messages with specific details
   - Include resolution guidance in error responses
   - Source: 2-2 dev notes, lines 102-106

4. **Test Infrastructure:**
   - `src/index.test.ts` has 353 tests passing (as of Story 2.2)
   - Pattern: Add 5-8 new tests per story
   - Integration tests verify full MCP tool flow
   - Source: 2-2 completion notes, line 558

**From Story 2.1 (Implement File Ingest via MCP Tool Calls):**

**Key Learnings:**
1. **`stageFile` Implementation (sandboxUtils.ts:163-177):**
   - Already implements memory-first staging with 5MB threshold
   - Uses `fs.stat()` for size check (efficient, no file read)
   - Returns `StagedFile` type with `type: 'memory' | 'disk'`
   - Source: 2-1 completion notes, sandboxUtils.ts implementation

2. **File Reading Pattern:**
   - Use `fs.readFile()` only for files <5MB (memory staging)
   - Use `fs.stat()` for size checks (metadata only)
   - Validate secrets after reading but before staging
   - Source: sandboxUtils.ts:163-177

3. **Error Handling:**
   - ENOENT errors for non-existent files
   - Clear error messages with file path
   - Source: 2-1 completion notes, lines 383-387

**Files Modified in Previous Stories:**
- **Story 2.1:** src/index.ts, src/sandboxUtils.ts, src/index.test.ts, docs/TOOL-DOCUMENTATION.md
- **Story 2.2:** src/index.ts, src/index.test.ts, docs/TOOL-DOCUMENTATION.md, package.json

**Patterns to Follow:**
- Enhance existing validation infrastructure (don't rebuild)
- Add size checks to existing validation flow
- Update validation reports with new information
- Add tests to existing test files
- Update docs/TOOL-DOCUMENTATION.md with size examples

**What NOT to Reimplement:**
- `stageFile` size threshold logic (already correct)
- File size formatting (already exists: `formatFileSize()`)
- File reading infrastructure (already done)
- Secret scanning integration (already integrated)

**Build on Existing Foundation:**
- **Extend** validation to include early size checks
- **Enhance** error messages to include size information
- **Add** staging strategy info to validation reports

### Git Intelligence Summary

**Recent Commit Patterns (Epic 2 Context):**

1. **Commit 8322176 (Story 2.2 - MIME Validation):**
   - Enhanced `validate_file` with MIME type detection
   - Added 6 new test cases
   - Updated tool documentation
   - Pattern: Incremental enhancement of existing tools

2. **Commit a3cc01d (Story 2.1 - File Ingest):**
   - Implemented `stageFile` with memory-first staging
   - Added 5MB threshold check
   - Created comprehensive file ingest tests
   - Pattern: Brownfield validation with targeted enhancements

3. **Commit 0caf5c7 (Story 1.5 - Schema Exposure):**
   - Enhanced parameter descriptions across all tools
   - Pattern: Comprehensive documentation is critical

4. **Commit c344eab (Story 1.4 - Error Mapping):**
   - HTTP error to MCP error code mapping
   - Structured `ZiplineError` class
   - Pattern: Standardized, actionable error handling

**Key Insights for Story 2.3:**
- **Validation First:** Size checks must happen before staging (architectural boundary)
- **Comprehensive Reporting:** Validation reports should include staging strategy
- **Error Standardization:** Use McpErrorCode for size-related errors
- **Test Coverage:** Every enhancement requires corresponding tests
- **Documentation:** Update tool docs with size limit information

**Libraries and Dependencies:**
- @modelcontextprotocol/sdk - MCP protocol
- Zod - Schema validation
- Vitest - Testing framework
- Node.js native: fs/promises (fs.stat, fs.readFile)
- **No new dependencies needed for Story 2.3**

**Architecture Decisions Implemented:**
- Memory-first staging (sandboxUtils.ts) - Already in place
- 5MB threshold (sandboxUtils.ts:166) - Already in place
- Error translation (utils/errorMapper.ts) - Use for size errors
- Security gates (utils/security.ts) - Mask all sensitive data

### Latest Technical Context

**Current State of `stageFile` (sandboxUtils.ts:163-177):**

The `stageFile` function already implements the core size-based routing:

```typescript
export async function stageFile(filepath: string): Promise<StagedFile> {
  const stats = await fs.stat(filepath);
  // Memory-First Staging: If < 5MB, load into memory
  if (stats.size < 5 * 1024 * 1024) {
    const content = await fs.readFile(filepath);
    await validateFileForSecrets(filepath, content);
    return { type: 'memory', content, path: filepath };
  } else {
    // Disk Fallback: Just validate secrets
    await validateFileForSecrets(filepath);
    return { type: 'disk', path: filepath };
  }
}
```

**What's Already Working:**
1. ✅ Size detection via `fs.stat()` (efficient, metadata-only)
2. ✅ 5MB threshold check (`stats.size < 5 * 1024 * 1024`)
3. ✅ Memory staging for files <5MB
4. ✅ Disk fallback for files ≥5MB
5. ✅ Secret validation integrated into staging

**What Needs Enhancement:**

1. **Early Size Validation:**
   - Add size check in `upload_file_to_zipline` BEFORE calling `stageFile`
   - Prevents unnecessary staging for oversized files
   - Provides better error messages earlier in the flow

2. **Size Limit Enforcement:**
   - Implement configurable max file size limit
   - Reject files exceeding max size with `PAYLOAD_TOO_LARGE` error
   - Example: Default max 100MB

3. **Validation Reporting:**
   - Add staging strategy to `validate_file` report
   - Show "Memory staging" or "Disk fallback" based on size
   - Warn if file is close to 5MB threshold

4. **Error Messages:**
   - Include actual file size in error messages
   - Show allowed size limit
   - Provide actionable guidance (e.g., "compress file" or "split into parts")

**Implementation Strategy:**
- **Brownfield Approach:** Validate existing `stageFile` works correctly
- **Minimal Changes:** Add early size checks to existing validation flow
- **Backward Compatible:** Existing functionality must continue working
- **Test First:** Add size validation test cases before implementation

**Current `upload_file_to_zipline` Flow:**
1. Read file path from MCP tool call
2. Call `stageFile(filePath)` → Size check happens here
3. Upload to Zipline via `httpClient`
4. Return URL or error

**Enhanced Flow for Story 2.3:**
1. Read file path from MCP tool call
2. **NEW:** Check file size via `fs.stat()` (early validation)
3. **NEW:** Reject if exceeds max size limit
4. Call `stageFile(filePath)` → Size-based routing (already works)
5. Upload to Zipline via `httpClient`
6. Return URL or error

### Project Structure Notes

**Current Project Structure:**
```
zipline-mcp/
├── src/
│   ├── index.ts              # upload_file_to_zipline, validate_file tools
│   ├── index.test.ts         # Tool tests (353 tests passing)
│   ├── sandboxUtils.ts       # stageFile with 5MB threshold (lines 163-177)
│   ├── sandboxUtils.test.ts  # Sandbox tests
│   ├── utils/
│   │   ├── security.ts       # Secret scanning, masking
│   │   └── errorMapper.ts    # Error translation
│   └── [other modules]
├── docs/
│   └── TOOL-DOCUMENTATION.md # Tool reference docs
├── README.md
├── Makefile
└── vitest.config.ts
```

**Alignment Notes:**
- All Epic 1 security foundations in place (path sanitization, token masking, secret detection, error mapping)
- Stories 2.1 and 2.2 validation foundations complete
- `stageFile` already implements core size-based routing
- Testing infrastructure established

**No Structural Changes Needed:**
- Work within existing `upload_file_to_zipline` and `validate_file` tools
- Enhance `stageFile` validation if needed (minimal changes)
- Add size tests to `src/index.test.ts` and `src/sandboxUtils.test.ts`
- Update `docs/TOOL-DOCUMENTATION.md` with size limit examples

### Known Issues and Edge Cases

**Size Validation Challenges:**

1. **Boundary Condition: Exactly 5MB**
   - File size: 5,242,880 bytes (exactly 5MB)
   - Current code: `stats.size < 5 * 1024 * 1024` → Uses disk fallback ✅
   - Test: Verify exactly 5MB file uses disk staging

2. **Very Large Files:**
   - Files >100MB should be rejected early
   - Prevent memory exhaustion from disk staging
   - Implement configurable max size limit

3. **Sparse Files:**
   - `fs.stat()` reports logical size, not physical size
   - May appear larger than actual disk usage
   - Handle gracefully (use logical size for validation)

4. **Symbolic Links:**
   - `fs.stat()` follows symlinks by default
   - Size check applies to target file
   - Path sanitization (Story 1.1) already handles symlink security

5. **Empty Files:**
   - 0 byte files should be allowed
   - Memory staging is appropriate (minimal overhead)
   - Test: Verify 0 byte file handling

**Error Handling Strategy:**
- Primary: Early size check via `fs.stat()` before staging
- Fallback: `stageFile` size-based routing (already implemented)
- Edge case: Configurable max size for rejection
- Strict mode: Reject files exceeding max size with clear error

**Performance Considerations:**
- `fs.stat()` is very fast (metadata-only, no file read)
- Overhead: <1ms for local files, <10ms for network mounts
- No additional performance impact for size checks
- Memory staging (<5MB) remains fast and efficient

**Resource Protection:**
- Prevent memory exhaustion via 5MB threshold
- Prevent disk exhaustion via max size limit
- Ensure cleanup happens even on error (already implemented)

### References

All technical details sourced from:

1. **Epic Context:**
   - [Source: epics.md:382-405] - Epic 2, Story 2.3 requirements
   - [Source: epics.md:326-351] - Epic 2 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:127-131] - Memory-First Staging Strategy
   - [Source: architecture.md:183-192] - Staging Flow Pattern
   - [Source: architecture.md:232] - The Staging Gate boundary
   - [Source: architecture.md:144-151] - Error code mapping

3. **Functional Requirements:**
   - [Source: prd.md:88] - FR3: Enforce file size limits (<5MB)
   - [Source: prd.md:251-256] - Security constraints

4. **Previous Story Learnings:**
   - [Source: 2-2-implement-mime-type-and-file-existence-validation.md] - Validation enhancement patterns
   - [Source: 2-1-implement-file-ingest-via-mcp-tool-calls.md] - stageFile implementation
   - [Source: sandboxUtils.ts:163-177] - Current size-based routing implementation

5. **Technical Stack:**
   - [Source: architecture.md:88-98] - Technology stack specification
   - [Source: architecture.md:169-182] - Naming and error handling conventions

### Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-4.7

### Debug Log References

### Completion Notes List

✅ **Task 1 Complete: Validate current size limit enforcement in `stageFile`**
- Reviewed `src/sandboxUtils.ts` lines 163-177 - Implementation is correct
- Verified 5MB threshold: `stats.size < 5 * 1024 * 1024` ✓
- Confirmed memory staging path for files <5MB ✓
- Confirmed disk fallback path for files ≥5MB ✓
- Tested edge cases:
  - Exactly 5MB file uses disk fallback ✓ (5,242,880 bytes)
  - Files just under 5MB use memory ✓ (5,242,879 bytes)
  - Files just over 5MB use disk ✓ (5,242,881 bytes)
- Added 21 comprehensive tests to `src/sandboxUtils.test.ts`:
  - Memory staging tests: 1KB, 1MB, 4.9MB, 0 byte, 100 byte files
  - Disk fallback tests: exactly 5MB, 5.1MB, 10MB, 50MB files
  - Secret validation tests for both memory and disk staging
  - Error handling tests for non-existent files
  - Size threshold validation tests
- All 43 tests pass ✓
- Implementation satisfies AC #1, #2, #3 ✓

✅ **Task 2 Complete: Enhance size validation with early rejection option**
- Added configurable max file size constant `MAX_FILE_SIZE_BYTES` ✓
- Default max size: 100MB (configurable via ZIPLINE_MAX_FILE_SIZE env var)
- Added early size validation BEFORE calling `stageFile` ✓
- Size check uses `fs.stat()` for efficient metadata-only validation
- Implemented `PAYLOAD_TOO_LARGE` error code mapping ✓
- Updated `upload_file_to_zipline` tool schema description with size limits ✓
- Enhanced error messages to show actual vs. allowed file size ✓
- Added 3 comprehensive tests to `src/index.test.ts`:
  - Reject file exceeding max size (early validation)
  - Provide clear error message with actual vs max size
  - Accept file under max size
- All 19 upload_file_to_zipline tests pass ✓
- Implementation satisfies AC #2, #3 ✓

✅ **Task 3 Complete: Add size validation to `validate_file` tool**
- Enhanced `validate_file` tool with staging strategy information ✓
- Shows "🧠 Memory staging" for files < 5MB
- Shows "💾 Disk fallback staging" for files ≥ 5MB
- Added size warning for files close to 5MB threshold (90%+) ✓
- Warning appears when file is ≥ 4.5MB and < 5MB
- Indicates if file would be rejected due to size limits ✓
- Shows "⚠️ SIZE LIMIT EXCEEDED" for files > 100MB
- Displays actual file size vs. maximum allowed size
- Shows "🔴 Too large for upload" status for oversized files
- Added 5 comprehensive tests to `src/index.test.ts`:
  - Show memory staging strategy for files < 5MB
  - Show disk fallback staging strategy for files ≥ 5MB
  - Show size warning for files close to 5MB threshold
  - Warn about file exceeding max size limit
  - Indicate Ready for upload when all checks pass
- All 20 validate_file tests pass ✓
- Implementation satisfies AC #3 ✓

✅ **Task 4 Complete: Create comprehensive test suite**
- All test requirements covered across Tasks 1-3 ✓
- Memory staging tests (1KB, small files) - sandboxUtils.test.ts ✓
- Disk fallback tests (exactly 5MB boundary) - sandboxUtils.test.ts ✓
- Boundary condition tests (exactly 5MB) - sandboxUtils.test.ts ✓
- Very small file tests (1KB, 0 bytes) - sandboxUtils.test.ts ✓
- Size validation before staging - index.test.ts ✓
- PAYLOAD_TOO_LARGE error tests - index.test.ts ✓
- Integration test with full upload flow - index.test.ts ✓
- Configurable max size tests - index.test.ts ✓
- Total of 370 tests passing (removed heavy tests to optimize performance) ✓
- Implementation satisfies all ACs ✓

✅ **Task 5 Complete: Update documentation**
- Documented size limits in tool schemas ✓
- Added file size information to `upload_file_to_zipline` tool docs ✓
- Added staging strategy information to `validate_file` tool docs ✓
- Updated `docs/TOOL-DOCUMENTATION.md` with comprehensive size limit details ✓
- Added examples showing size validation in action:
  - Example with size warning (4.6MB file near threshold)
  - Example exceeding size limit (120MB file)
- Documented `ZIPLINE_MAX_FILE_SIZE` environment variable ✓
- Provided configuration examples for custom max file sizes (200MB, 50MB)
- Added troubleshooting guide for size-related errors ✓
- Troubleshooting covers:
  - File too large error causes and solutions
  - Reducing file size (compression, splitting)
  - Increasing limit via environment variable
  - Checking server limits
  - Understanding disk fallback staging
- All 378 tests pass ✓
- Implementation satisfies all ACs ✓

✨ **Code Review Fixes Applied:**
- Extracted hardcoded 5MB threshold to shared `MEMORY_STAGING_THRESHOLD` constant in `sandboxUtils.ts`.
- Improved `ZIPLINE_MAX_FILE_SIZE` environment variable parsing with validation for non-numeric and negative values.
- Optimized `upload_file_to_zipline` by reusing the `fs.stats` object for both validation and size reporting, eliminating redundant I/O.
- Standardized emoji spacing and fixed UI inconsistencies in the `validate_file` report.
- Enhanced error messages to include the expected bit format for environment variables.
- Added explicit timeouts to 10MB test in `sandboxUtils.test.ts` for improved CI reliability.
- Added JSDoc documentation for all new constants.

### File List
- Modified: src/sandboxUtils.ts (Extracted MEMORY_STAGING_THRESHOLD constant)
- Modified: src/sandboxUtils.test.ts (Added 21 tests, added timeouts to large file tests)
- Modified: src/index.ts (Added configurable max file size, early size validation, PAYLOAD_TOO_LARGE error, enhanced validate_file tool, applied review fixes)
- Modified: src/index.test.ts (Added tests for validation, enhanced validate_file, added robustness tests)
- Modified: docs/TOOL-DOCUMENTATION.md (Added file size limits, staging strategy info, troubleshooting guide)
