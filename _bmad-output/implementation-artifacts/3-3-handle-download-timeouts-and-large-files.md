# Story 3.3: Handle Download Timeouts and Large Files

Status: done

## Story

As a **system**,
I want **proper timeout handling and size limits for external downloads**,
So that **the server is protected from slow or oversized external resources**.

## Acceptance Criteria

1. **Given** an external URL that responds slowly
   **When** download exceeds the configured timeout (e.g., 30 seconds)
   **Then** the download is aborted and an error is returned

2. **Given** an external URL serving a file larger than 100MB
   **When** download detects the file size (via Content-Length or streaming)
   **Then** the download is aborted and an appropriate error is returned

3. **Given** an external URL with no Content-Length header
   **When** streaming download
   **Then** size is monitored incrementally and aborted if limit is exceeded

**FRs addressed:** FR13 (robustness)

## Tasks / Subtasks

- [x] Verify existing timeout implementation (AC: #1)
  - [x] Confirm AbortController timeout in downloadExternalUrl() works correctly
  - [x] Confirm timeoutMs parameter exposed in tool definition
  - [x] Test timeout behavior with slow-responding mock server
- [x] Verify size limit implementation (AC: #2, #3)
  - [x] Confirm Content-Length header check rejects files >100MB
  - [x] Confirm streaming size check aborts when threshold exceeded
  - [x] Confirm partial file cleanup on size rejection
- [x] Add/update tests for edge cases (AC: #1, #2, #3)
  - [x] Test slow response with timeout
  - [x] Test file exactly at size limit boundary
  - [x] Test streaming abort mid-download
- [x] Run full test suite
  - [x] `npm test` - all tests pass

## Dev Notes

### Epic Context - Epic 3: External Content Integration

This is Story 3.3 in Epic 3, ensuring robust handling of edge cases in external downloads.

**Epic Objectives:**
- Enable downloading external URLs into secure sandbox (Story 3.1 ✅ DONE)
- Ensure downloaded content passes validation pipeline (Story 3.2 ✅ DONE)
- Handle timeouts and large files appropriately (Story 3.3 - THIS STORY)

**Story Position:** Third and final story in Epic 3 - robustness and edge case handling.

**Dependencies:**
- **Requires Story 3.1** - External URL download functionality (DONE)
- **Requires Story 3.2** - Validation pipeline integration (DONE)
- **Requires Epic 1** - Security utilities, error mapping
- **Requires Epic 2** - Sandbox infrastructure

### Architecture Patterns and Constraints

**Critical Architecture Requirements from architecture.md:**

1. **Staging Flow Pattern (MANDATORY - architecture.md:183-192):**
   Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**

   For downloads: **URL Validate → Download → Validate MIME → Scan Secrets → Return Path → Cleanup on Failure**

2. **Performance Requirements (NFR1, NFR2):**
   - Response Latency < 100ms for local tool logic (excluding network)
   - Upload Pipeline < 2 seconds for standard screenshots (<5MB)

3. **Streaming for Large Files:**
   Downloads must stream to disk to prevent OOM - never buffer entire file in memory.

### Current Implementation State

**✅ ALREADY IMPLEMENTED (httpClient.ts:254-366):**

1. **Timeout Handling (AC #1):**
   ```typescript
   // Line 283-284: AbortController setup
   const ac = new AbortController();
   const timer = setTimeout(() => ac.abort(), timeout);
   
   // Line 354-359: Timeout error handling
   if (message.toLowerCase().includes('abort') || message.toLowerCase().includes('timeout')) {
     throw new Error('Download aborted or timeout exceeded');
   }
   ```

2. **Content-Length Size Check (AC #2):**
   ```typescript
   // Lines 302-311: Header-based size validation
   const cl = res.headers?.get?.('content-length');
   if (cl) {
     const declared = Number(cl);
     if (!Number.isNaN(declared) && declared > maxFileSize) {
       throw new FileTooLargeError(
         `Remote file size ${declared} bytes exceeds limit of ${maxFileSize} bytes (100MB)`
       );
     }
   }
   ```

3. **Streaming Size Check (AC #3):**
   ```typescript
   // Lines 318-333: Incremental size monitoring
   let downloadedBytes = 0;
   const reader = res.body.getReader();
   while (true) {
     const { done, value } = await reader.read();
     if (done) break;
     downloadedBytes += value.length;
     if (downloadedBytes > maxFileSize) {
       throw new FileTooLargeError(
         `Downloaded content exceeds limit of ${maxFileSize} bytes (100MB)`
       );
     }
     await handle.write(value);
   }
   ```

4. **Cleanup on Failure:**
   ```typescript
   // Lines 346-352: Partial file cleanup
   try {
     await rm(finalPath, { force: true });
   } catch {
     // ignore cleanup failures
   }
   ```

**Tool Parameter Exposure (index.ts:900-909):**
```typescript
const { url, timeoutMs = 30000, maxFileSizeBytes } = args;
// ...
const opts: DownloadOptions = { timeout: timeoutMs };
if (maxFileSizeBytes !== undefined)
  opts.maxFileSizeBytes = maxFileSizeBytes;
```

### Implementation Guidance

**This is primarily a VALIDATION story** - the implementation appears complete. Focus on:

1. **Verify Test Coverage:**
   - Check `src/download.test.ts` for timeout test (line 133-163: ✅ exists)
   - Check for Content-Length rejection test (line 165-186: ✅ exists)
   - Check for streaming size rejection test (line 188-218: ✅ exists)

2. **Verify Error Message Quality:**
   - Ensure error messages include actionable guidance
   - Ensure `maskSensitiveData()` is applied to error outputs

3. **Boundary Testing:**
   - Test file exactly at 100MB limit
   - Test timeout at exactly 30 seconds
   - Test concurrent downloads with timeouts

### File Structure Requirements

**Primary Files (VERIFY ONLY - likely no changes needed):**
1. **src/httpClient.ts** - downloadExternalUrl() implementation (lines 254-366)
2. **src/download.test.ts** - Unit tests for download functionality
3. **src/download.integration.test.ts** - Integration tests for tool handler

**Do NOT Modify:**
- `src/sandboxUtils.ts` - Sandbox utilities are correct
- `src/utils/security.ts` - Security utilities are correct
- `src/utils/errorMapper.ts` - Error mapping is correct

### Testing Requirements

**Framework:** Vitest (co-located `*.test.ts` pattern)

**Existing Tests to Verify (download.test.ts):**

| Test | Lines | Description | AC |
|------|-------|-------------|-----|
| `aborts on timeout` | 133-163 | Tests AbortController timeout behavior | #1 |
| `rejects files larger than 100MB via Content-Length` | 165-186 | Tests header-based size rejection | #2 |
| `rejects files larger than 100MB via streaming` | 188-218 | Tests streaming size check with cleanup | #3 |
| `removes partial file on failure` | 220-232 | Tests cleanup on error | All |

**Potential New Tests to Add:**

```typescript
describe('download edge cases', () => {
  it('handles file exactly at 100MB boundary', async () => {
    // Test file that is exactly 100MB (should succeed)
    const exactSize = 100 * 1024 * 1024;
    // ...
  });

  it('handles timeout at exactly configured value', async () => {
    // Test timeout behavior at boundary
  });

  it('cleans up file on streaming abort mid-download', async () => {
    // Verify cleanup happens during streaming, not just at end
  });
});
```

**Test Command:**
```bash
npm test src/download.test.ts
npm test src/download.integration.test.ts
npm test  # Full suite
```

### Previous Story Intelligence

**From Story 3.1 (Implement External URL Download to Sandbox):**
- **Streaming prevents OOM** - Always stream to disk, never buffer in memory
- **Dual size checking** - Content-Length header + actual streaming size check
- **Cleanup pattern** - `try { await rm(finalPath, { force: true }); } catch { /* ignore */ }`

**From Story 3.2 (Validate Downloaded Content):**
- **Validation after download** - MIME and secret checks run after file is on disk
- **Cleanup on validation failure** - Always cleanup before returning error
- **Brownfield approach** - Existing implementation was solid, needed minor enhancements

**Patterns to Follow:**
- Use `fs.rm(path, { force: true })` for cleanup (doesn't throw if file doesn't exist)
- Always use `maskSensitiveData()` for error messages
- Test edge cases at boundaries (exact limits)

### Git Intelligence Summary

**Recent Commits (Epic 3):**
```
2df9721 feat: Add comprehensive content validation for external URL downloads (story 3.2)
2d6d1b6 feat: Implement external URL download to sandbox (story 3.1)
```

**Key Patterns Established:**
- Comprehensive test coverage with Vitest
- Detailed JSDoc documentation
- try/finally cleanup pattern
- Security-first approach
- Co-located tests (*.test.ts)

### Known Edge Cases

1. **Slow Servers:**
   - External URL may respond slowly but within timeout
   - Current implementation handles via AbortController
   - Consider adding progress feedback for long downloads

2. **No Content-Length Header:**
   - Some servers don't provide Content-Length
   - Current implementation handles via streaming size check
   - File is cleaned up if limit exceeded mid-download

3. **Concurrent Downloads:**
   - Multiple downloads may run concurrently
   - Each uses isolated sandbox path (token-hashed directory)
   - Timeouts are per-request, not global

4. **Network Interruption:**
   - Connection may drop mid-download
   - Cleanup happens in catch block
   - Error message indicates network failure

### References

1. **Epic Context:**
   - [Source: epics.md:619-641] - Story 3.3 requirements
   - [Source: epics.md:559-566] - Epic 3 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:183-192] - Staging Flow Pattern
   - [Source: architecture.md:232-234] - Staging and Logging Gates

3. **Current Implementation:**
   - [Source: httpClient.ts:254-366] - downloadExternalUrl() function
   - [Source: index.ts:891-958] - download_external_url tool handler
   - [Source: download.test.ts:133-232] - Timeout and size limit tests

4. **Previous Stories:**
   - [Source: 3-1-implement-external-url-download-to-sandbox.md] - Story 3.1 learnings
   - [Source: 3-2-validate-downloaded-content-through-standard-pipeline.md] - Story 3.2 learnings

### Security Considerations

- All error messages must use `maskSensitiveData()` to prevent token exposure
- Partial file cleanup prevents disk space exhaustion attacks
- Size limits prevent DoS via oversized downloads
- Timeout limits prevent resource exhaustion from slow responses
- Streaming prevents OOM attacks from large files

### Size Limit Clarification

**Important:** The 5MB threshold in architecture.md refers to **memory staging** for uploads (Epic 2), not download limits.

**Download Size Limits:**
- Default: 100MB (configurable via `maxFileSizeBytes` parameter)
- Files are always streamed to disk (never buffered in memory)
- Size check via Content-Length header first, then streaming verification

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── httpClient.ts              # downloadExternalUrl() (VERIFY)
│   ├── index.ts                   # download_external_url handler (VERIFY)
│   ├── download.test.ts           # Unit tests (VERIFY/ENHANCE)
│   └── download.integration.test.ts # Integration tests (VERIFY/ENHANCE)
```

**Alignment:** Implementation appears complete. Focus on verification and edge case testing.

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5

### Debug Log References

None required - all tests passed.

### Completion Notes List

- **Verification Story**: This was primarily a verification story. All core functionality (timeout handling, size limits via Content-Length and streaming, cleanup on failure) was already implemented correctly in `httpClient.ts:254-366`.
- **Timeout Implementation (AC #1)**: Confirmed AbortController with setTimeout works correctly. `timeoutMs` parameter exposed in tool definition with default 30000ms.
- **Size Limit Implementation (AC #2)**: Confirmed Content-Length header check rejects files >100MB with `FileTooLargeError`.
- **Streaming Size Check (AC #3)**: Confirmed incremental size monitoring during streaming download with abort when threshold exceeded.
- **Cleanup**: Confirmed partial file cleanup on all failure paths via `fs.rm(path, { force: true })`.
- **Edge Case Tests Added**: 4 new tests added for boundary conditions:
  1. File exactly at 100MB boundary via Content-Length (should succeed)
  2. File exactly at 100MB boundary via streaming (should succeed)
  3. File just over 100MB boundary via streaming (should fail)
  4. Cleanup on streaming abort mid-download (connection loss scenario)
- **Test Results**: All 16 download-related tests pass. Lint passes with no errors.
- **Note**: One pre-existing flaky test timeout in `sandboxUtils.test.ts` (4.9MB file staging) is unrelated to this story.

### File List

- `src/download.test.ts` - Added 4 edge case tests for 100MB boundary and mid-download cleanup
- `src/httpClient.ts` - Dynamic human-readable size in FileTooLargeError messages

### Senior Developer Review (AI)

**Reviewer:** Sergio (via code-review workflow)
**Date:** 2026-02-16
**Outcome:** APPROVED with fixes applied

**Issues Found:** 0 High, 3 Medium, 3 Low
**Issues Fixed:** 3 Medium, 1 Low (auto-fixed during review)
**Issues Noted:** 2 Low (L2: URL query param logging, L3: duplicate URL validation - acceptable as-is)

**Fixes Applied:**
1. **M1** - Rewrote streaming boundary tests to use 1MB chunks instead of 100MB+ Uint8Array allocations (memory efficiency)
2. **M2** - Moved `sent` variable declaration before its closure reference (code clarity)
3. **M3** - Added test for custom `maxFileSizeBytes` parameter passthrough
4. **L1** - Made human-readable size label in FileTooLargeError dynamic instead of hardcoded "(100MB)"

**Test Results Post-Fix:** 401 passed, 16 skipped, 0 failures. Lint clean.
