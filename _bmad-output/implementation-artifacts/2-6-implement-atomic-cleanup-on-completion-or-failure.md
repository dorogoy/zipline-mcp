# Story 2.6: Implement Atomic Cleanup on Completion or Failure

Status: done

## Story

As a **security-conscious developer**,
I want **all sandbox contents purged automatically after operations**,
So that **no sensitive data persists beyond the operation lifecycle**.

## Acceptance Criteria

1. **Given** a successful upload operation
   **When** the operation completes
   **Then** all associated buffers are immediately cleared (memory staging)
   **And** cleanup happens before response is returned to client

2. **Given** a failed upload operation (any error stage)
   **When** an error occurs at any stage
   **Then** all associated buffers are still immediately cleared
   **And** cleanup is guaranteed via try/finally pattern

3. **Given** a server crash or unexpected termination
   **When** the process restarts
   **Then** orphaned temp files are cleaned up on initialization
   **And** stale sandbox directories older than 24 hours are purged
   **And** stale lock files are removed

**FRs addressed:** FR8
**NFRs addressed:** NFR5 (100% buffer cleanup - Zero-Footprint)

## Tasks / Subtasks

- [x] Validate existing cleanup implementation (AC: #1, #2)
  - [x] Review try/finally cleanup pattern in `upload_file_to_zipline` tool
  - [x] Verify `clearStagedContent()` handles both memory and disk types
  - [x] Test cleanup happens on success path
  - [x] Test cleanup happens on error path
  - [x] Verify no Buffer references persist after cleanup

- [x] Implement startup cleanup for orphaned resources (AC: #3)
  - [x] Add `initializeCleanup()` function to run on server startup
  - [x] Integrate with existing `cleanupOldSandboxes()` for directory cleanup
  - [x] Add stale lock file cleanup (files older than LOCK_TIMEOUT)
  - [x] Call cleanup in `src/index.ts` during server initialization
  - [x] Log cleanup operations for monitoring

- [x] Enhance cleanup guarantees with finalization registry (optional)
  - [x] Evaluate `FinalizationRegistry` for Buffer cleanup safety net
  - [x] Implement if adds meaningful protection without complexity

- [x] Create comprehensive test suite
  - [x] Test cleanup after successful upload (memory staging)
  - [x] Test cleanup after failed upload (memory staging)
  - [x] Test cleanup after successful upload (disk staging)
  - [x] Test cleanup after failed upload (disk staging)
  - [x] Test startup cleanup removes orphaned sandbox directories
  - [x] Test startup cleanup removes stale lock files
  - [x] Test concurrent operation cleanup doesn't interfere

- [x] Update documentation
  - [x] Document atomic cleanup architecture in code comments
  - [x] Add cleanup guarantees section to `docs/TOOL-DOCUMENTATION.md`
  - [x] Document startup cleanup behavior
  - [x] Add examples showing cleanup flow

## Dev Notes

### Epic Context - Epic 2: Secure File Upload Pipeline

This story is Story 2.6 in Epic 2, completing the staging pipeline with atomic cleanup guarantees. This story ensures that no sensitive data persists beyond the operation lifecycle, which is critical for the "Zero-Footprint" security requirement.

**Epic Objectives:**
- Complete the "Double-Blind" staging pipeline with atomic cleanup
- Enable Journey A (Bug Report) - Secure handling of screenshot uploads
- Enable Journey B (Secure Status Share) - Secure handling of config files
- Ensure NFR5 compliance: 100% buffer cleanup after completion

**Story Position:** Sixth story in Epic 2 - ensures cleanup guarantees after memory staging (2.4) and disk fallback (2.5).

**Dependencies:**
- **Requires Story 2.4 (Memory Staging)** - `clearStagedContent()` for memory cleanup
- **Requires Story 2.5 (Disk Fallback)** - Cleanup patterns for both staging types
- **Enables Stories 2.7-2.9** - Upload operations depend on cleanup guarantees

### Architecture Patterns and Constraints

**Critical Architecture Requirements from architecture.md:**

1. **Resource Lifecycle Requirements (NFR5 - CRITICAL - line 59):**
   - **NFR5:** 100% buffer cleanup after completion (Zero-Footprint)
   - No orphaned files allowed on disk
   - Critical for security: staged content contains user data
   - Source: architecture.md:59

2. **Staging Flow Pattern (MANDATORY - lines 183-192):**
   - Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**
   - **Story 2.6 Focus:** The **Cleanup** phase
   - Cleanup must happen in ALL code paths (success, error, crash)
   - Source: architecture.md:183-192

3. **Atomic Cleanup Guarantee:**
   - Cleanup must be guaranteed even on process crash
   - Startup cleanup for orphaned resources
   - No sensitive data persistence
   - Source: architecture.md:59, NFR5

**Component Structure:**
```
src/index.ts              → Server initialization, cleanup on startup
src/sandboxUtils.ts       → clearStagedContent(), cleanupOldSandboxes()
                         → initializeCleanup() (NEW)
src/index.ts (tools)      → try/finally cleanup pattern in upload tools
```

### Technical Requirements

**From PRD - Functional Requirement FR8:**
- **FR8: Automatically purge sandbox contents upon completion or failure (Atomic Cleanup)**
- Must handle both success and error paths
- Must handle crash scenarios (startup cleanup)
- Source: epics.md:457-479

**Current Implementation State:**

**✅ Already Implemented (from Stories 2.4 and 2.5):**

1. **`clearStagedContent()` function (sandboxUtils.ts:337-344):**
   ```typescript
   export function clearStagedContent(staged: StagedFile): void {
     if (staged.type === 'memory') {
       (staged.content as any) = null;
     }
     // Disk staging: Returns original file path (not a temp copy)
     // No cleanup needed for original files
   }
   ```

2. **try/finally cleanup pattern in upload tools:**
   ```typescript
   const staged = await stageFile(filepath);
   try {
     // Upload logic
   } finally {
     clearStagedContent(staged);
   }
   ```

3. **`cleanupOldSandboxes()` function (sandboxUtils.ts:346-412):**
   - Cleans up sandbox directories older than 24 hours
   - Handles errors gracefully
   - Logs cleanup operations

4. **Lock file timeout cleanup (sandboxUtils.ts:414-448):**
   - Lock files expire after LOCK_TIMEOUT (30 minutes)
   - Expired locks are removed on next check

**⚠️ Needs Implementation:**

1. **Startup Cleanup Integration:**
   - `cleanupOldSandboxes()` exists but is not called on startup
   - Need to integrate cleanup into server initialization
   - Need `initializeCleanup()` function to orchestrate cleanup

2. **Comprehensive Test Coverage:**
   - Test cleanup on success path
   - Test cleanup on error path
   - Test startup cleanup behavior
   - Test concurrent cleanup scenarios

3. **Documentation:**
   - Document atomic cleanup architecture
   - Document cleanup guarantees
   - Document startup cleanup behavior

**Technology Stack:**
- TypeScript (ES2022 target)
- Node.js 18+ (native fs/promises API)
- No new dependencies required
- Source: architecture.md:88-98

**Naming Conventions:**
- camelCase for functions: `clearStagedContent()`, `initializeCleanup()`
- PascalCase for types: `StagedFile`
- SCREAMING_SNAKE_CASE for constants: `LOCK_TIMEOUT`
- Source: architecture.md:169

### Cleanup Guarantee Analysis

**Memory Staging Cleanup Flow:**
```
stageFile() → returns { type: 'memory', content: Buffer, path }
  ↓
try {
  upload to Zipline
} finally {
  clearStagedContent(staged)  // Sets Buffer reference to null
}
  ↓
Buffer eligible for GC
```

**Disk Staging Cleanup Flow:**
```
stageFile() → returns { type: 'disk', path: originalFile }
  ↓
try {
  upload to Zipline
} finally {
  clearStagedContent(staged)  // No-op (original files not managed)
}
  ↓
Original file remains (caller owns lifecycle)
```

**Startup Cleanup Flow:**
```
Server starts
  ↓
initializeCleanup()
  ↓
├── cleanupOldSandboxes()  // Removes directories > 24h old
├── cleanupStaleLocks()    // Removes lock files > LOCK_TIMEOUT old
└── Log cleanup results
  ↓
Server ready for requests
```

**Crash Recovery Scenarios:**

| Scenario | What's Left | Cleanup Mechanism |
|----------|-------------|-------------------|
| Normal success | Nothing | try/finally clears Buffer |
| Error during upload | Buffer reference | try/finally clears Buffer |
| Process crash (memory) | Nothing | OS reclaims memory |
| Process crash (disk staging) | Nothing | Original files remain (expected) |
| Process crash (lock file) | Stale lock | Startup cleanup removes expired locks |
| Orphaned sandbox dirs | Old directories | Startup cleanup removes > 24h old |

### File Structure Requirements

**Expected File Modifications:**

**Primary Changes:**
1. **src/sandboxUtils.ts:**
   - Add `initializeCleanup()` function
   - Add `cleanupStaleLocks()` function (if not covered by existing code)
   - Enhance JSDoc for cleanup guarantees
   - Export new cleanup functions

2. **src/index.ts:**
   - Call `initializeCleanup()` during server startup
   - Add startup cleanup logging

3. **src/sandboxUtils.test.ts:**
   - Add tests for cleanup on success
   - Add tests for cleanup on error
   - Add tests for startup cleanup
   - Add tests for concurrent cleanup

4. **src/index.test.ts:**
   - Integration tests for full cleanup flow
   - Test cleanup in upload operations

5. **docs/TOOL-DOCUMENTATION.md:**
   - Add section on atomic cleanup guarantees
   - Document cleanup behavior
   - Add examples

**Do NOT:**
- Modify `clearStagedContent()` core logic (it works correctly)
- Change the try/finally cleanup pattern (established pattern)
- Implement disk file deletion for original files (intentional design)
- Add new dependencies

### Testing Requirements

**From Architecture:**
- Co-located test pattern: `*.test.ts` alongside implementation
- Framework: Vitest
- Source: architecture.md:175

**Test Coverage Expectations:**

1. **Success Path Cleanup Tests:**
   - Memory staging: Buffer cleared after successful upload
   - Disk staging: No errors on cleanup (original file not touched)
   - Verify cleanup happens before response

2. **Error Path Cleanup Tests:**
   - Memory staging: Buffer cleared even when upload fails
   - Disk staging: No errors on cleanup even when upload fails
   - Test various error stages (validation, network, etc.)

3. **Startup Cleanup Tests:**
   - Old sandbox directories (> 24h) are removed
   - Stale lock files (> 30 min) are removed
   - Fresh directories are preserved
   - Active locks are preserved

4. **Concurrent Operation Tests:**
   - Multiple uploads don't interfere with cleanup
   - Cleanup doesn't affect active operations

5. **Edge Case Tests:**
   - Cleanup when directory doesn't exist
   - Cleanup when lock file is corrupted
   - Cleanup with permission errors

**Testing Pattern:**
```typescript
describe('Atomic Cleanup', () => {
  it('clears buffer after successful upload', async () => {
    const staged = await stageFile(testFile);
    const contentRef = staged.type === 'memory' ? staged.content : null;
    
    try {
      await uploadToZipline(staged);
    } finally {
      clearStagedContent(staged);
    }
    
    // Verify Buffer reference is nullified
    if (staged.type === 'memory') {
      expect(staged.content).toBeNull();
    }
  });
  
  it('clears buffer even when upload fails', async () => {
    // ... error path test
  });
});
```

### Previous Story Intelligence

**From Story 2.5 (Implement Disk-Based Fallback Staging):**

**Key Learnings:**
1. **Disk staging uses original files:**
   - No temp files created for disk staging
   - Original files are NOT deleted by clearStagedContent()
   - This is intentional design
   - Source: 2-5 completion notes

2. **Memory fallback implemented:**
   - ENOMEM/ERR_OUT_OF_MEMORY detection in stageFile()
   - Automatic fallback to disk staging
   - Pattern: try/catch with specific error codes
   - Source: sandboxUtils.ts:257-270

3. **clearStagedContent() simplified:**
   - Only handles memory type explicitly
   - Disk type is no-op (expected)
   - Pattern: Type discrimination with explicit handling
   - Source: sandboxUtils.ts:337-344

4. **53 sandboxUtils tests passing:**
   - Comprehensive test coverage for staging
   - Pattern: Test actual MCP protocol responses
   - Source: 2-5 completion notes

**From Story 2.4 (Implement Memory-First Ephemeral Storage):**

**Key Learnings:**
1. **clearStagedContent() pattern established:**
   - Nullifies Buffer reference for memory type
   - Simple and effective
   - Pattern: `(staged.content as any) = null`
   - Source: 2-4 completion notes

2. **try/finally cleanup guarantee:**
   - Cleanup happens in all code paths
   - Pattern established in upload tools
   - Source: 2-4 completion notes

3. **JSDoc documentation pattern:**
   - Comprehensive lifecycle documentation
   - Buffer lifecycle documented step by step
   - Pattern: Document when/where/how cleanup happens
   - Source: sandboxUtils.ts:160-175, 279-335

**Files Modified in Previous Stories:**
- Story 2.4: src/sandboxUtils.ts, src/index.ts, src/sandboxUtils.test.ts
- Story 2.5: src/sandboxUtils.ts, src/sandboxUtils.test.ts, docs/TOOL-DOCUMENTATION.md

**Patterns to Follow:**
- Validate existing implementation works (brownfield approach)
- Add startup cleanup without changing existing behavior
- Update documentation with complete lifecycle
- Build on existing test infrastructure

### Git Intelligence Summary

**Recent Commit Patterns (Epic 2 Context):**

```
bf61351 feat: Introduce disk-based fallback staging for large files... (story 2.5)
3b35830 feat: Implement memory-first ephemeral file staging... (story 2.4)
91db496 docs: story 2.3 - enforce file size limits...
8322176 feat: Implement and document file existence and MIME type... (story 2.2)
a3cc01d feat: Implement file ingest with memory-first staging... (story 2.1)
```

**Key Patterns from Recent Commits:**
- Comprehensive test coverage with Vitest
- Detailed JSDoc documentation
- try/finally cleanup pattern in all upload operations
- Security-first approach (masking, validation)
- Co-located tests (*.test.ts)

**Libraries and Dependencies:**
- @modelcontextprotocol/sdk - MCP protocol
- Node.js native: fs/promises, crypto, os
- Vitest - Testing framework
- **No new dependencies needed for Story 2.6**

### Current Implementation State

**What's Already Working:**

1. ✅ **Memory Cleanup:**
   - `clearStagedContent()` nullifies Buffer references
   - Works for both success and error paths
   - Source: sandboxUtils.ts:337-344

2. ✅ **try/finally Pattern:**
   - All upload operations use try/finally
   - Guarantees cleanup in all code paths
   - Source: src/index.ts (upload tools)

3. ✅ **Old Sandbox Cleanup:**
   - `cleanupOldSandboxes()` removes directories > 24h
   - Handles errors gracefully
   - Source: sandboxUtils.ts:346-412

4. ✅ **Lock Timeout:**
   - Locks expire after 30 minutes
   - Expired locks removed on next check
   - Source: sandboxUtils.ts:414-448

**What Needs Implementation:**

1. **Startup Cleanup Integration:**
   - Create `initializeCleanup()` function
   - Call on server startup in src/index.ts
   - Orchestrate all cleanup functions

2. **Comprehensive Testing:**
   - Test cleanup guarantees
   - Test startup cleanup
   - Test concurrent scenarios

3. **Documentation:**
   - Document cleanup architecture
   - Document guarantees
   - Add examples

### Known Issues and Edge Cases

**Cleanup Challenges:**

1. **Process Crash During Staging:**
   - Memory staging: OS reclaims memory (no issue)
   - Disk staging: Original file remains (expected)
   - Lock files: May be orphaned (handled by startup cleanup)

2. **Concurrent Operations:**
   - Multiple uploads may create multiple locks
   - Each user has isolated sandbox (no conflict)
   - Cleanup doesn't interfere with active operations

3. **Cleanup Timing:**
   - Old sandboxes: 24 hours threshold
   - Stale locks: 30 minutes threshold
   - Memory buffers: Immediate on clearStagedContent()

4. **Error Handling:**
   - Cleanup errors should not crash server
   - Log errors for monitoring
   - Continue with other cleanup if one fails

### References

All technical details sourced from:

1. **Epic Context:**
   - [Source: epics.md:457-479] - Epic 2, Story 2.6 requirements
   - [Source: epics.md:326-351] - Epic 2 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:59] - NFR5 (100% cleanup)
   - [Source: architecture.md:183-192] - Staging Flow Pattern
   - [Source: architecture.md:232] - The Staging Gate boundary

3. **Functional Requirements:**
   - [Source: epics.md:FR8] - Atomic cleanup requirement

4. **Previous Story Learnings:**
   - [Source: 2-5-implement-disk-based-fallback-staging.md] - Disk fallback, cleanup patterns
   - [Source: 2-4-implement-memory-first-ephemeral-storage.md] - Memory cleanup, try/finally
   - [Source: sandboxUtils.ts:337-412] - Current cleanup implementation

5. **Technical Stack:**
   - [Source: architecture.md:88-98] - Technology stack
   - [Source: architecture.md:169-182] - Naming conventions

### Project Structure Notes

**Current Project Structure:**
```
zipline-mcp/
├── src/
│   ├── index.ts              # Server init (needs cleanup call)
│   ├── index.test.ts         # Tool tests
│   ├── sandboxUtils.ts       # clearStagedContent(), cleanupOldSandboxes()
│   │                         # initializeCleanup() (NEW)
│   ├── sandboxUtils.test.ts  # Staging tests (needs cleanup tests)
│   ├── httpClient.ts         # Zipline API client
│   ├── utils/
│   │   ├── security.ts       # Secret scanning, masking
│   │   └── errorMapper.ts    # Error translation
│   └── [other modules]
├── docs/
│   └── TOOL-DOCUMENTATION.md # Tool reference (needs cleanup docs)
├── ~/.zipline_tmp/           # Temp directory (runtime)
│   └── users/
│       └── [SHA-256-hash]/   # Per-user sandbox
└── [config files]
```

**Alignment Notes:**
- All Epic 1 security foundations in place
- Stories 2.1-2.5 complete and tested
- Cleanup infrastructure exists, needs startup integration
- Test infrastructure established (53 tests passing)

### Implementation Guidance for Dev Agent

**🚨 CRITICAL: This is Brownfield Validation and Enhancement**

The atomic cleanup is **PARTIALLY IMPLEMENTED**. Your job is to:

1. ✅ **VALIDATE** existing cleanup works correctly (AC#1, AC#2)
2. ✅ **IMPLEMENT** startup cleanup integration (AC#3)
3. ✅ **TEST** cleanup guarantees comprehensively
4. ✅ **DOCUMENT** cleanup architecture and guarantees

**DO NOT:**
- ❌ Rewrite `clearStagedContent()` (it works correctly)
- ❌ Change the try/finally pattern (established pattern)
- ❌ Delete original files in disk staging (intentional design)
- ❌ Add complex cleanup mechanisms (keep it simple)

**DO:**
- ✅ Validate existing cleanup on success/error paths
- ✅ Add `initializeCleanup()` function
- ✅ Call cleanup on server startup
- ✅ Add comprehensive cleanup tests
- ✅ Document cleanup guarantees

**Key Implementation Points:**

1. **initializeCleanup() Implementation:**
   ```typescript
   export async function initializeCleanup(): Promise<{
     sandboxesCleaned: number;
     locksCleaned: number;
   }> {
     logSandboxOperation('STARTUP_CLEANUP', undefined, 'Starting cleanup');
     
     const sandboxesCleaned = await cleanupOldSandboxes();
     const locksCleaned = await cleanupStaleLocks();
     
     logSandboxOperation(
       'STARTUP_CLEANUP_COMPLETE',
       undefined,
       `Sandboxes: ${sandboxesCleaned}, Locks: ${locksCleaned}`
     );
     
     return { sandboxesCleaned, locksCleaned };
   }
   ```

2. **Server Startup Integration (src/index.ts):**
   ```typescript
   // At server initialization
   import { initializeCleanup } from './sandboxUtils.js';
   
   async function main() {
     // Run startup cleanup before accepting connections
     await initializeCleanup();
     
     // Start MCP server
     const server = new McpServer({ name: 'zipline-mcp', version: '1.0.0' });
     // ...
   }
   ```

3. **Test Pattern:**
   ```typescript
   describe('Atomic Cleanup', () => {
     it('guarantees cleanup on success', async () => {
       let staged = await stageFile(smallFile);
       try {
         await upload(staged);
       } finally {
         clearStagedContent(staged);
       }
       expect(staged.type === 'memory' ? staged.content : 'disk').toBeFalsy();
     });
     
     it('guarantees cleanup on error', async () => {
       let staged = await stageFile(smallFile);
       try {
         await upload(staged);
         throw new Error('Simulated failure');
       } finally {
         clearStagedContent(staged);
       }
     });
   });
   ```

**Success Criteria:**
- All existing tests still pass (53 tests minimum)
- New cleanup tests added and passing (6-10 new tests)
- Startup cleanup removes old sandboxes and stale locks
- Documentation explains cleanup guarantees
- No security regressions

## Dev Agent Record

### Agent Model Used

Claude (GLM-5 via OpenCode)

### Debug Log References

N/A - Implementation completed without significant issues.

### Completion Notes List

**Story 2.6 Complete - Atomic Cleanup on Completion or Failure**

1. **Validated existing cleanup implementation (AC#1, AC#2):**
   - Confirmed try/finally pattern works correctly in upload_file_to_zipline (index.ts:498-529)
   - Verified clearStagedContent() handles both memory (nullifies Buffer) and disk (no-op) types
   - Added 16 new tests for cleanup guarantees in sandboxUtils.test.ts

2. **Implemented startup cleanup (AC#3):**
   - Added `cleanupStaleLocks()` function in sandboxUtils.ts - removes lock files older than LOCK_TIMEOUT (30 min)
   - Added `initializeCleanup()` function in sandboxUtils.ts - orchestrates all cleanup on server startup
   - Integrated `initializeCleanup()` call in main() function (index.ts:1323-1324)
   - Cleanup logs all operations for monitoring

3. **Evaluated FinalizationRegistry (optional):**
   - Determined that try/finally pattern provides adequate cleanup guarantees
   - FinalizationRegistry adds complexity without meaningful benefit for this use case
   - Marked as evaluated and skipped

4. **Created comprehensive test suite:**
   - Added 16 new tests in "Atomic Cleanup (Story 2.6)" describe block
   - Tests cover: success path cleanup, error path cleanup, disk staging cleanup, startup cleanup, concurrent cleanup
   - Total: 69 tests passing in sandboxUtils.test.ts

5. **Updated documentation:**
   - Added comprehensive "Atomic Cleanup Architecture" section to docs/TOOL-DOCUMENTATION.md
   - Documents cleanup guarantee flow, crash recovery scenarios, and timing thresholds
   - Includes implementation details for all cleanup functions

**Files Modified:**
- `src/sandboxUtils.ts` - Added cleanupStaleLocks() and initializeCleanup() functions
- `src/index.ts` - Added initializeCleanup() call in main(), updated exports
- `src/sandboxUtils.test.ts` - Added 16 new tests for Atomic Cleanup
- `docs/TOOL-DOCUMENTATION.md` - Added Atomic Cleanup Architecture section

**Test Results:**
- sandboxUtils.test.ts: 69 tests passing
- All Story 2.6 specific tests passing

### File List

**Modified Files:**
- `src/sandboxUtils.ts` - Added cleanupStaleLocks(), initializeCleanup() functions with JSDoc
- `src/index.ts` - Added initializeCleanup() to imports, exports, and main() function
- `src/sandboxUtils.test.ts` - Added 16 tests for Atomic Cleanup (Story 2.6)
- `docs/TOOL-DOCUMENTATION.md` - Added Atomic Cleanup Architecture section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated status to in-progress
