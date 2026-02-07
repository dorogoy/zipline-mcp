# Story 2.2: Implement MIME Type and File Existence Validation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want **file existence and MIME types validated before processing**,
So that **only valid, supported files enter the upload pipeline**.

## Acceptance Criteria

1. **Given** a file submitted for upload
   **When** validation runs
   **Then** the file's existence is confirmed before proceeding

2. **Given** a file with an allowed MIME type (image/png, image/jpeg, text/plain, application/json)
   **When** validated
   **Then** the file proceeds to the next stage

3. **Given** a file with a disallowed MIME type
   **When** validated
   **Then** the file is rejected with a clear error identifying the unsupported type

4. **Given** the `validate_file` tool
   **When** invoked independently
   **Then** it returns validation status without performing upload

## Tasks / Subtasks

- [x] Validate current `validate_file` implementation (AC: #1, #4)
  - [x] Review file existence checking in src/index.ts (lines 522-565)
  - [x] Verify ENOENT error detection is working (Story 2.1 added this)
  - [x] Confirm independent validation execution (no upload side effects)
  - [x] Test edge cases: symlinks, permission errors, non-existent paths

- [x] Implement MIME type detection and validation (AC: #2, #3)
  - [x] Add MIME type detection to `validate_file` tool
  - [x] Integrate with Node.js `file-type` or `mime-types` library for accurate detection
  - [x] Map detected MIME to file extensions in ALLOWED_EXTENSIONS
  - [x] Validate MIME matches expected type for extension (e.g., .png → image/png)
  - [x] Return clear, actionable errors for unsupported MIME types

- [x] Enhance validation reporting (AC: #2, #3, #4)
  - [x] Update validation report to include detected MIME type
  - [x] Show whether MIME matches extension expectation
  - [x] Provide list of allowed MIME types in error messages
  - [x] Add examples of supported file types to help diagnose issues

- [x] Create comprehensive test suite
  - [x] Test file existence validation for valid files
  - [x] Test ENOENT error handling for non-existent files
  - [x] Test MIME detection for image/png, image/jpeg
  - [x] Test MIME detection for text/plain, application/json
  - [x] Test MIME mismatch scenarios (e.g., .png file with text content)
  - [x] Test unsupported MIME type rejection
  - [x] Test `validate_file` tool independence (no side effects)
  - [x] Integration test with upload_file_to_zipline flow

- [x] Update documentation
  - [x] Document MIME type validation in tool schema
  - [x] Update docs/TOOL-DOCUMENTATION.md with MIME validation details
  - [x] Add examples showing MIME validation in action
  - [x] Document supported MIME types alongside extensions

## Dev Notes

### Epic Context - Epic 2: Secure File Upload Pipeline

This story is Story 2.2 in Epic 2, building directly on Story 2.1 (File Ingest). This story completes the validation phase of the staging pipeline before files are processed for upload.

**Epic Objectives:**
- Enable Journey A (Bug Report) - Visual UI agent needs validated screenshots before upload
- Enable Journey B (Secure Status Share) - Developers need validated logs/config files
- Validate the "Double-Blind" staging pipeline with comprehensive pre-upload validation
- Ensure only valid, safe files enter the memory/disk staging process

**Story Position:** Second story in Epic 2 - extends file ingest with MIME validation.

**Dependencies:**
- **Requires Story 2.1 (File Ingest)** - File reading and existence checking foundation
- **Requires Story 1.3 (Secret Detection)** - `validateFileForSecrets` integration
- **Enables Stories 2.3-2.9** - Validated files proceed to sizing, staging, and upload

### Architecture Patterns and Constraints

**Critical Architecture Requirements from architecture.md:**

1. **Staging Flow Pattern (MANDATORY):**
   - Every file operation MUST follow: **Validate → Scan → Stage → Execute → Cleanup**
   - **Story 2.2 Focus:** The **Validate** phase
   - This story strengthens validation BEFORE secret scanning and staging
   - Source: architecture.md:183-192

2. **The Staging Gate (Security Boundary):**
   - No file content may reach `httpClient.ts` without `sandboxUtils.ts` processing
   - Validation must happen BEFORE any staging operations
   - Source: architecture.md:232

3. **Error Handling Requirements:**
   - All validation errors must use standardized MCP error codes
   - File not found → `RESOURCE_NOT_FOUND` (already implemented in 2.1)
   - Unsupported MIME type → `FILE_TYPE_NOT_SUPPORTED` or similar
   - Source: architecture.md:144-151, prd.md:398-407

4. **Security Logging:**
   - All validation output MUST pass through `security.ts` masking
   - No file paths should leak sensitive information in logs
   - Source: architecture.md:181

**Component Structure:**
```
src/index.ts              → validate_file tool implementation (focus area)
src/sandboxUtils.ts       → File staging (used after validation)
src/utils/security.ts     → Secret scanning, log masking
src/utils/errorMapper.ts  → Error code translation
```

### Technical Requirements

**From PRD - Functional Requirement FR2:**
- **FR2: Validate file existence and MIME types before processing**
- Must confirm file exists before any operations
- Must validate MIME type matches allowed extensions
- Must provide actionable error messages
- Source: prd.md:359

**From Architecture - MIME Type Validation Specifics:**

**Allowed Extensions (from index.ts:113-144):**
```typescript
DEFAULT_ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.log', '.yml', '.yaml',
  '.gpx', '.geojson', '.kml', '.pdf',
  '.zip', '.tar', '.gz', '.7z',
  '.doc', '.docx', '.odt', '.ods', '.odp', '.odg',
  '.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
]
```

**Expected MIME Mappings:**
- `.png` → `image/png`
- `.jpg`/`.jpeg` → `image/jpeg`
- `.txt` → `text/plain`
- `.json` → `application/json`
- `.md` → `text/markdown` or `text/plain`
- `.pdf` → `application/pdf`
- etc.

**MIME Detection Library Options:**
1. **`file-type`** (recommended) - Magic number based, highly accurate for binary files
2. **`mime-types`** - Extension-based fallback, useful for text files
3. **Node.js native** - Limited, may be insufficient

**Recommendation:** Use `file-type` for primary detection with `mime-types` as fallback for text-based files.

**Technology Stack:**
- TypeScript (ES2022 target)
- Node.js 18+ (native fs/promises)
- Zod for schema validation (already in use)
- Vitest for testing
- Source: architecture.md:88-98

**Naming Conventions:**
- camelCase for functions: `detectMimeType()`, `validateMimeType()`
- PascalCase for types: `MimeValidationResult`
- Source: architecture.md:169

**Security Requirements:**
- All file paths MUST be sanitized (Story 1.1 foundation in place)
- All log output MUST use `security.ts` masking
- No execution or parsing of file content during validation
- Source: architecture.md:181, prd.md:251-256

### File Structure Requirements

**Expected File Modifications:**

**Primary Changes:**
1. **src/index.ts (validate_file tool, lines 512-566):**
   - Add MIME type detection logic
   - Integrate MIME validation with allowed extensions
   - Enhance validation report with MIME information
   - Add clear error messaging for MIME mismatches

2. **src/index.test.ts:**
   - Add MIME validation test cases
   - Test supported MIME types (image/png, image/jpeg, text/plain, application/json)
   - Test unsupported MIME types
   - Test MIME/extension mismatch scenarios

**Potential New Files:**
- **src/utils/mimeDetection.ts** (optional) - Centralized MIME detection utility
  - Only create if MIME logic becomes complex enough to warrant extraction
  - Consider for brownfield validation: may already have sufficient logic in index.ts

**Do NOT:**
- Create new validation tools - enhance existing `validate_file`
- Modify upload logic in this story - that's for later stories
- Implement staging changes - validation happens BEFORE staging

### Testing Requirements

**From Architecture:**
- Co-located test pattern: `*.test.ts` alongside implementation
- Framework: Vitest
- Source: architecture.md:175

**Test Coverage Expectations:**

1. **Unit Tests (src/index.test.ts):**
   - File existence validation (already exists from 2.1)
   - MIME detection for supported types:
     - PNG files → `image/png`
     - JPG/JPEG files → `image/jpeg`
     - TXT files → `text/plain`
     - JSON files → `application/json`
   - MIME validation for unsupported types:
     - Executable files (`.exe`, `.sh`) → Rejected
     - Unknown binary files → Rejected
   - MIME/extension mismatch:
     - `.png` file with JPEG magic number → Warning or error
     - `.txt` file with binary content → Handled gracefully

2. **Integration Tests:**
   - Full `validate_file` tool invocation
   - Error response format validation
   - Integration with `upload_file_to_zipline` flow
   - Verify validation occurs before staging

**Testing Pattern from Previous Stories:**
- Story 2.1 established file ingest tests with ENOENT detection
- Story 1.5 created MCP integration tests for tool validation
- Pattern: Test actual MCP protocol responses, not just internal APIs
- Source: 2-1 completion notes, lines 398-415

### Previous Story Intelligence

**From Story 2.1 (Implement File Ingest via MCP Tool Calls):**

**Key Learnings:**
1. ** File Existence Validation Already Implemented:**
   - Story 2.1 added ENOENT error detection to both `upload_file_to_zipline` and `validate_file`
   - Clear error messages: "File not found: {filePath}"
   - Error code: `RESOURCE_NOT_FOUND`
   - Source: 2-1 completion notes, lines 383-387

2. **Current validate_file Implementation (lines 512-566):**
   - Reads file content with `readFile(filePath)`
   - Checks file size and extension
   - Validates against ALLOWED_EXTENSIONS
   - Integrates with secret scanning (`validateFileForSecrets`)
   - Returns comprehensive validation report
   - Source: src/index.ts:520-566

3. **File Type Support:**
   - PNG, JPG/JPEG, TXT, JSON confirmed working
   - Binary and text files processed correctly
   - Extensions validated via ALLOWED_EXTENSIONS array
   - Source: 2-1 completion notes, lines 388-392

4. **Test Infrastructure:**
   - `src/fileIngest.test.ts` created for basic file I/O (5 tests)
   - `src/index.test.ts` enhanced with upload/validate tests (5 new tests)
   - Total test suite: 341 tests passing
   - Source: 2-1 completion notes, lines 398-403

5. **Documentation Updates:**
   - `docs/TOOL-DOCUMENTATION.md` enhanced with file type examples
   - Error handling patterns documented
   - Source: 2-1 completion notes, lines 404-409

**Files Modified in Story 2.1:**
- src/index.ts - Enhanced error handling for file not found
- src/index.test.ts - Added file ingest tests
- src/fileIngest.test.ts - Created
- docs/TOOL-DOCUMENTATION.md - Enhanced with examples
- src/sandboxUtils.ts - Added `stageFile` implementation
- src/httpClient.ts - Added `fileContent` support

**Patterns to Follow:**
- Use existing ENOENT error detection pattern
- Maintain comprehensive validation reports
- Update docs/TOOL-DOCUMENTATION.md with MIME examples
- Add tests to existing test files (not new files unless necessary)
- Integrate with existing error handling (McpErrorCode system)

**What NOT to Reimplement:**
- File existence checking (already done in 2.1)
- File reading infrastructure (already done)
- Extension validation (already exists)
- Secret scanning integration (already integrated)

**Build on Existing Foundation:**
- **Extend** the validation report to include MIME type
- **Enhance** error messages to mention MIME mismatches
- **Add** MIME detection as additional validation layer

### Git Intelligence Summary

**Recent Commit Patterns (Epic 2 Context):**

1. **Commit for Story 2.1 (File Ingest):**
   - Added ENOENT detection to upload_file_to_zipline and validate_file
   - Implemented `stageFile` for memory-first staging
   - Created comprehensive file ingest tests
   - Pattern: Brownfield validation with targeted enhancements

2. **Commit 0caf5c7 (Story 1.5):**
   - Major refactor of tool registration and schemas
   - Enhanced parameter descriptions across all tools
   - Pattern: Comprehensive documentation is critical

3. **Commit c344eab (Story 1.4):**
   - HTTP error to MCP error code mapping
   - Structured `ZiplineError` class
   - Pattern: Standardized, actionable error handling

4. **Commit 6de2e27 (Story 1.3):**
   - Secret pattern detection
   - Integrated into validation pipeline
   - Pattern: Security features at validation layer

**Key Insights for Story 2.2:**
- **Security First:** All validation features integrate at the validation layer before staging
- **Comprehensive Reporting:** Validation reports should be detailed and actionable
- **Error Standardization:** Use McpErrorCode for all error responses
- **Test Coverage:** Every enhancement requires corresponding tests
- **Documentation:** Update tool docs with every schema or output change

**Libraries and Dependencies:**
- @modelcontextprotocol/sdk - MCP protocol
- Zod - Schema validation
- Vitest - Testing framework
- Node.js native: fs, path, Buffer
- **NEW for 2.2:** Consider adding `file-type` for MIME detection

**Architecture Decisions Implemented:**
- Memory-first staging (sandboxUtils.ts) - Used AFTER validation
- Error translation (utils/errorMapper.ts) - Use for MIME errors
- Security gates (utils/security.ts) - Mask all sensitive data
- Modular tool structure (index.ts) - Enhance validate_file in place

### Latest Technical Context

**Current State of `validate_file` Tool (src/index.ts:512-566):**

```typescript
server.registerTool(
  'validate_file',
  {
    title: 'Validate File',
    description: 'Validate if a file exists and is suitable for upload to Zipline.',
    inputSchema: validateFileInputSchema,
  },
  async ({ filePath }) => {
    try {
      const fileContent = await readFile(filePath);
      const fileSize = fileContent.length;
      const fileExt = path.extname(filePath).toLowerCase();
      const isSupported = ALLOWED_EXTENSIONS.includes(fileExt);

      // Secret validation (from 1.3)
      let secretDetails = '';
      try {
        await validateFileForSecrets(filePath);
      } catch (error) {
        if (error instanceof SecretDetectionError) {
          secretDetails = `\n⚠️  Secret Type: ${error.secretType}\n⚠️  Pattern: ${error.pattern}`;
        } else throw error;
      }

      // Current validation report
      const formattedSize = formatFileSize(fileSize);
      return {
        content: [{
          type: 'text',
          text: `📋 FILE VALIDATION REPORT

📁 File: ${path.basename(filePath)}
📍 Path: ${filePath}
📊 Size: ${formattedSize}
🏷️  Extension: ${fileExt || 'none'}
✅ Supported: ${isSupported ? 'Yes' : 'No'}${secretDetails}

Status: ${secretDetails ? '🔴 Contains secrets (not allowed for upload)' : isSupported ? '🟢 Ready for upload' : '🔴 File type not supported'}

Supported formats: ${ALLOWED_EXTENSIONS.join(', ')}`
        }]
      };
    } catch (error) {
      // ENOENT handling from Story 2.1
      let errorMessage = error instanceof Error ? error.message : String(error);
      if (error && typeof error === 'object' && 'code' in error &&  error.code === 'ENOENT') {
        errorMessage = `File not found: ${filePath}`;
      }

      return {
        content: [{
          type: 'text',
          text: `❌ FILE VALIDATION FAILED!

Error: ${errorMessage}

Please check:
• Verify the file path is correct
• Check if the file exists and is accessible
• Ensure you have permission to read the file`
        }],
        isError: true
      };
    }
  }
);
```

**Enhancement Areas for Story 2.2:**
1. **Add MIME Detection:**
   - Use `file-type` or `mime-types` library
   - Detect actual file content type (magic numbers)
   - Compare detected MIME with expected MIME for extension

2. **Enhance Validation Report:**
   - Add detected MIME type field
   - Show if MIME matches extension expectation
   - Provide MIME-based recommendations

3. **Improve Error Messaging:**
   - Specific error for MIME mismatch
   - List allowed MIME types for the extension
   - Suggest correct extension if MIME is supported but extension isn't

4. **Validation Logic:**
   - Extension check (already exists)
   - **NEW:** MIME type check
   - **NEW:** MIME/extension consistency check
   - Secret scanning (already exists)

**Implementation Strategy:**
- **Brownfield Approach:** This is validation/enhancement, not new implementation
- **Minimal Changes:** Add MIME detection to existing flow
- **Backward Compatible:** Existing functionality must continue working
- **Test First:** Add MIME test cases before implementation

### Project Structure Notes

**Current Project Structure:**
```
zipline-mcp/
├── src/
│   ├── index.ts              # validate_file tool (lines 512-566)
│   ├── index.test.ts         # Tool tests (341 tests passing)
│   ├── fileIngest.test.ts    # File I/O tests (from 2.1)
│   ├── sandboxUtils.ts       # Staging (used after validation)
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
- Story 2.1 file ingest foundation complete
- Testing infrastructure established
- Documentation patterns established

**No Structural Changes Needed:**
- Work within existing `validate_file` tool
- Add MIME tests to `src/index.test.ts`
- Optionally create `src/utils/mimeDetection.ts` if logic warrants extraction
- Update `docs/TOOL-DOCUMENTATION.md` with MIME validation examples

### Known Issues and Edge Cases

**Potential MIME Detection Challenges:**

1. **Text Files:**
   - `.txt`, `.md`, `.json` may all detect as `text/plain`
   - Use extension-based validation as fallback for text types
   - Example: `.json` should validate content is valid JSON structure

2. **Binary Files:**
   - `.png`, `.jpg`, `.pdf` have reliable magic numbers
   - Use `file-type` library for accurate binary detection

3. **Compressed Files:**
   - `.zip`, `.tar.gz` may appear as generic application/octet-stream
   - Extension validation remains critical for these types

4. **File Extension Spoofing:**
   - `.txt` file renamed to `.png` should be caught by MIME mismatch
   - Decide: Strict rejection or warning?

5. **Empty Files:**
   - May not have detectable MIME type
   - Handle gracefully with extension-based validation

**Error Handling Strategy:**
- Primary: MIME detection via `file-type`
- Fallback: Extension-based validation (already exists)
- Edge case: Allow extension validation if MIME is indeterminate
- Strict mode: Reject if MIME/extension mismatch (recommended for security)

**Performance Considerations:**
- MIME detection requires reading file header (first ~4KB)
- Already reading full file in `validate_file` (line 522)
- No additional performance impact expected

### References

All technical details sourced from:

1. **Epic Context:**
   - [Source: epics.md:354-380] - Epic 2, Story 2.2 requirements
   - [Source: epics.md:326-351] - Epic 2 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:183-192] - Staging Flow Pattern
   - [Source: architecture.md:232] - The Staging Gate boundary
   - [Source: architecture.md:144-151] - Error code mapping

3. **Functional Requirements:**
   - [Source: prd.md:359] - FR2: Validate file existence and MIME types
   - [Source: prd.md:251-256] - Security constraints

4. **Previous Story Learnings:**
   - [Source: 2-1-implement-file-ingest-via-mcp-tool-calls.md:383-415] - File ingest implementation and testing patterns
   - [Source: 2-1 completion notes] - ENOENT error handling, stageFile implementation

5. **Technical Stack:**
   - [Source: architecture.md:88-98] - Technology stack specification
   - [Source: architecture.md:169-182] - Naming and error handling conventions
   - [Source: index.ts:113-150] - ALLOWED_EXTENSIONS definition

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-4.7

### Debug Log References

### Completion Notes List

- Implemented content-based MIME type detection using `file-type` library with `mime-types` fallback
- Added MIME/extension validation to detect spoofed files (e.g., PNG data in .jpg file)
- Enhanced validate_file validation report with MIME type and match status
- Added 6 new test cases for MIME detection, validation reporting, and integration
- Updated tool schema and documentation with MIME validation details
- All 353 tests passing including 15 validate_file tests

### File List

- src/index.ts - Added MIME type detection using file-type and mime-types libraries
- src/index.test.ts - Added 6 new test cases for MIME validation
- docs/TOOL-DOCUMENTATION.md - Enhanced validate_file section with MIME details and examples
- package.json - Added file-type dependency
