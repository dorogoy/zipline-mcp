# Story 1.4: Implement HTTP Error to MCP Error Code Mapping

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **AI agent consuming MCP tool responses**,
I want **Zipline API errors translated to structured, actionable MCP error codes**,
So that **I can programmatically handle errors and provide resolution guidance**.

## Acceptance Criteria

1. **Given** a Zipline API response with HTTP 401
   **When** the error is processed by the error mapper
   **Then** the MCP error code `UNAUTHORIZED_ACCESS` is returned with resolution guidance

2. **Given** a Zipline API response with HTTP 404
   **When** processed
   **Then** `RESOURCE_NOT_FOUND` is returned

3. **Given** a Zipline API response with HTTP 413
   **When** processed
   **Then** `PAYLOAD_TOO_LARGE` is returned

4. **Given** a Zipline API response with HTTP 429
   **When** processed
   **Then** `RATE_LIMIT_EXCEEDED` is returned

5. **Given** any unmapped HTTP error
   **When** processed
   **Then** `INTERNAL_ZIPLINE_ERROR` is returned with the original status code

## Tasks / Subtasks

 - [x] Create error mapper module `src/utils/errorMapper.ts` (AC: #1-5)
   - [x] Define `McpErrorCode` enum with all error codes
   - [x] Define `ZiplineError` class extending Error
   - [x] Implement `mapHttpStatusToMcpError()` function
   - [x] Include resolution guidance for each error type
   - [x] Handle unmapped status codes with fallback
- [x] Create comprehensive unit tests `src/utils/errorMapper.test.ts` (AC: #1-5)
  - [x] Test 401 → UNAUTHORIZED_ACCESS
  - [x] Test 403 → FORBIDDEN_OPERATION
  - [x] Test 404 → RESOURCE_NOT_FOUND
  - [x] Test 413 → PAYLOAD_TOO_LARGE
  - [x] Test 429 → RATE_LIMIT_EXCEEDED
  - [x] Test 500/502/503 → INTERNAL_ZIPLINE_ERROR
  - [x] Test unknown codes → INTERNAL_ZIPLINE_ERROR
  - [x] Verify resolution guidance in all cases
- [x] Integrate error mapper into httpClient.ts (AC: #1-5)
  - [x] Replace generic HTTP error throws with ZiplineError
  - [x] Ensure error mapping happens at API boundary
  - [x] Preserve original HTTP status and response body
  - [x] Maintain backward compatibility with existing code
- [x] Update index.ts error handling (AC: #1-5)
  - [x] Catch ZiplineError and return structured MCP errors
  - [x] Include resolution guidance in error messages
  - [x] Apply secureLog to all error outputs

## Dev Notes

### Architectural Context

This story implements **FR20: Translate Zipline API HTTP errors into structured, agent-actionable error codes** and **NFR12: >90% of error strings provide resolution guidance**.

**Critical Architecture Requirement (lines 142-152):**
> "Error Code Mapping: Standardized mapping for Zipline API responses to ensure AI agent actionability.
> - `401/403` → `UNAUTHORIZED_ACCESS` / `FORBIDDEN_OPERATION`
> - `404` → `RESOURCE_NOT_FOUND`
> - `413` → `PAYLOAD_TOO_LARGE`
> - `429` → `RATE_LIMIT_EXCEEDED`
> - Others → `INTERNAL_ZIPLINE_ERROR`"

**Implementation Priority (line 78):**
> "SecurityUtility → SandboxManager refactor → **ErrorMapper integration**"

This is the third architectural priority after security utilities (Stories 1.1-1.3).

### Previous Story Intelligence

**Story 1.1 (Path Sanitization):**
- Created custom error class `SandboxPathError` with structured properties
- Used TypeScript strict mode with comprehensive type safety
- Pattern: Custom error classes with actionable messages
- All errors include guidance on how to fix

**Story 1.2 (Token Masking):**
- Implemented `secureLog()` for safe logging
- Pattern: All error outputs MUST pass through security layer
- Fixed security issue where debug logs exposed sensitive data
- Established defensive coding: security functions never throw

**Story 1.3 (Secret Detection):**
- Created `SecretDetectionError` class with secretType and pattern properties
- Pattern: Structured error information for programmatic handling
- Error messages are actionable and identify issue type
- Never expose sensitive data in error messages

**Established Error Pattern:**
```typescript
export class CustomError extends Error {
  constructor(
    message: string,
    public errorCode: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CustomError';
  }
}
```

### Technical Requirements

**New Module to Create: `src/utils/errorMapper.ts`**

**MCP Error Codes Enum:**
```typescript
export enum McpErrorCode {
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  FORBIDDEN_OPERATION = 'FORBIDDEN_OPERATION',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ZIPLINE_ERROR = 'INTERNAL_ZIPLINE_ERROR',
}
```

**ZiplineError Class:**
```typescript
export class ZiplineError extends Error {
  constructor(
    message: string,
    public mcpCode: McpErrorCode,
    public httpStatus: number,
    public responseBody?: string,
    public resolutionGuidance?: string
  ) {
    super(message);
    this.name = 'ZiplineError';
  }
}
```

**HTTP to MCP Mapping Function:**
```typescript
export function mapHttpStatusToMcpError(
  httpStatus: number,
  responseBody?: string
): ZiplineError;
```

**Resolution Guidance Requirements (NFR12: >90% actionable):**

Each error code MUST include specific resolution guidance:

| HTTP | MCP Code | Resolution Guidance |
|------|----------|---------------------|
| 401 | UNAUTHORIZED_ACCESS | "Check ZIPLINE_TOKEN environment variable. Verify token is valid and not expired. Ensure token has correct permissions." |
| 403 | FORBIDDEN_OPERATION | "Operation not permitted with current token. Verify token has required permissions for this operation. Contact administrator if access is needed." |
| 404 | RESOURCE_NOT_FOUND | "Requested resource does not exist. Verify file/folder ID is correct. Use list_user_files or remote_folder_manager LIST to find correct ID." |
| 413 | PAYLOAD_TOO_LARGE | "File size exceeds server limit. Reduce file size below 5MB or check server configuration for size limits." |
| 429 | RATE_LIMIT_EXCEEDED | "Rate limit exceeded (max 50 req/min). Wait before retrying. Reduce request frequency or contact administrator for higher limits." |
| 500/502/503 | INTERNAL_ZIPLINE_ERROR | "Zipline server error. Check server logs. Verify server is running and accessible. Retry after brief delay." |
| Other | INTERNAL_ZIPLINE_ERROR | "Unexpected error from Zipline API. Check network connectivity. Verify endpoint configuration. Review server logs." |

### Architecture Compliance

**Component Boundaries (Architecture lines 231-234):**
> "The Logging Gate: No data may be written to stderr or returned in an MCP error field without passing through utils/security.ts."

All error messages MUST pass through `secureLog()` or `maskSensitiveData()` before output.

**Error Handling Pattern (Architecture lines 180-181):**
> "Standardized Error Class: Implement and use a central ZiplineError class that maps host errors to the standardized MCP error codes."

This is the canonical error handling class for the entire project.

**httpClient Integration (Architecture lines 162-163):**
> "Update the HttpClient to include the standardized ErrorMapper."

Error mapping must happen at the HTTP boundary - the earliest point where we know the response status.

### Current httpClient.ts Error Handling

**Existing Pattern (httpClient.ts lines 149-158):**
```typescript
if (!res.ok) {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }
  const msg = bodyText ? `: ${bodyText}` : '';
  throw new Error(`HTTP ${res.status}${msg}`);
}
```

**Required Change:**
```typescript
if (!res.ok) {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }
  throw mapHttpStatusToMcpError(res.status, bodyText);
}
```

### Integration Points

**httpClient.ts Functions to Update:**
1. `uploadFile()` - Upload operations (lines 68-186)
2. Any future HTTP operations added

**index.ts MCP Tool Error Handling:**

Current pattern (index.ts lines 353-370):
```typescript
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  console.error(`Upload failed: ${errorMessage}`);
  
  return {
    content: [
      {
        type: 'text',
        text: `❌ UPLOAD FAILED!\n\nError: ${errorMessage}...`,
      },
    ],
    isError: true,
  };
}
```

**Enhanced Pattern:**
```typescript
} catch (error) {
  if (error instanceof ZiplineError) {
    const errorMessage = secureLog(
      `Upload failed: ${error.mcpCode} (HTTP ${error.httpStatus})\n` +
      `${error.message}\n\n` +
      `Resolution: ${error.resolutionGuidance}`
    );
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ UPLOAD FAILED!\n\n${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
  // Fallback for non-Zipline errors
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: `❌ Error: ${errorMessage}` }],
    isError: true,
  };
}
```

### Testing Requirements

**Test File: `src/utils/errorMapper.test.ts`**

Following the established pattern from security.test.ts (Vitest + co-located tests).

**Test Categories:**

| Category | Test Cases | Expected Count |
|----------|-----------|----------------|
| Authentication errors | 401, 403 | 2 tests |
| Resource errors | 404 | 1 test |
| Payload errors | 413 | 1 test |
| Rate limiting | 429 | 1 test |
| Server errors | 500, 502, 503 | 3 tests |
| Unknown codes | 418, 999 | 2 tests |
| Response body parsing | With body, without body | 2 tests |
| Resolution guidance | All error types have guidance | 7 tests |
| Error class structure | Properties, instanceof checks | 3 tests |

**Expected Test Count:** ~22 tests for error mapper module

**Integration Tests:**
- Update existing httpClient.test.ts to verify ZiplineError throwing
- Verify error mapping at HTTP boundary
- Test all MCP tools handle ZiplineError correctly

### Library & Framework Requirements

**Dependencies:**
- No new dependencies required
- Uses TypeScript built-in Error class
- Uses existing secureLog from src/utils/security.ts

**TypeScript Patterns:**
- Enum for error codes (type-safe, exhaustive)
- Custom Error class with structured properties
- Strict null checking for optional responseBody

**Export Pattern:**
```typescript
// src/utils/errorMapper.ts
export { McpErrorCode, ZiplineError, mapHttpStatusToMcpError };
```

### File Location and Naming

**Files to Create:**
1. `src/utils/errorMapper.ts` - Error mapping implementation
2. `src/utils/errorMapper.test.ts` - Comprehensive tests

**Files to Modify:**
1. `src/httpClient.ts` - Integrate error mapper
2. `src/index.ts` - Handle ZiplineError in MCP tools
3. `src/httpClient.test.ts` - Update tests for ZiplineError

**No changes to existing utilities** - this is a new standalone module.

### Performance Considerations

**NFR1: Response Latency < 100ms**

Error mapping must be instantaneous:
- Simple status code lookup (O(1) with switch/map)
- No async operations
- Minimal string concatenation
- Pre-defined resolution guidance strings

**Memory Impact:**
- Minimal - error objects created only on failure
- Resolution guidance strings are constants (shared references)
- No caching needed (stateless function)

### Cross-Story Context

**Completed Foundation (Stories 1.1-1.3):**
- Path sanitization prevents directory traversal errors
- Token masking protects credentials in error logs
- Secret detection prevents credential upload errors

**Error Mapper Integration:**
- Completes the dual-layer security gate
- Provides AI agents with actionable error information
- Enables intelligent retry strategies

**Relationship to Future Stories:**

- **Story 2.1-2.9 (Upload Pipeline):** All upload operations use ZiplineError
- **Story 3.1-3.3 (External URLs):** Download operations use error mapping
- **Story 4.1-4.6 (File Management):** Remote operations use error mapping
- **Story 5.1-5.5 (Folders):** Folder operations use error mapping
- **Story 6.1 (Health Check):** Health check uses error mapping

Every HTTP interaction with Zipline will use this error mapper.

### Git Intelligence Summary

**Recent Commit Patterns:**

1. **feat:** prefix for new features (Stories 1.1-1.3)
2. Include story number in commit message
3. Use conventional commits format
4. Describe what and why in commit body

**Suggested Commit Message:**
```
feat: implement HTTP error to MCP error code mapping (story 1.4)

- Create src/utils/errorMapper.ts with ZiplineError class
- Define McpErrorCode enum with standardized error codes
- Implement mapHttpStatusToMcpError() with resolution guidance
- Integrate error mapper into httpClient.ts
- Update index.ts to handle ZiplineError
- Add 22 comprehensive tests in errorMapper.test.ts

Addresses FR20 (error translation) and NFR12 (>90% actionable errors).
Provides AI agents with structured, actionable error information.
```

**Code Pattern Evolution:**

| Story | Security Module | Pattern Established |
|-------|----------------|---------------------|
| 1.1 | Path sanitization | Custom error classes with structured properties |
| 1.2 | Token masking | Secure logging for all outputs |
| 1.3 | Secret detection | Actionable error messages with type identification |
| 1.4 | Error mapping | HTTP to MCP error translation with resolution guidance |

### Security Considerations

**Logging Gate Compliance:**

All error outputs MUST pass through security layer:

```typescript
import { secureLog, maskSensitiveData } from './utils/security.js';

// When logging errors
secureLog(`Error occurred: ${error.message}`);

// When returning error to MCP client
const safeMessage = maskSensitiveData(error.message);
return { text: safeMessage, isError: true };
```

**Sensitive Information Protection:**

- Never expose ZIPLINE_TOKEN in error messages
- Never expose password headers in error messages
- Never expose full Zipline response bodies (may contain tokens)
- Sanitize all error outputs before returning to user

**Example - Unsafe vs Safe:**
```typescript
// UNSAFE - may expose token
throw new Error(`Auth failed with token: ${token}`);

// SAFE - generic message
throw new ZiplineError(
  'Authentication failed',
  McpErrorCode.UNAUTHORIZED_ACCESS,
  401,
  undefined,
  'Check ZIPLINE_TOKEN environment variable'
);
```

### Implementation Checklist

- [ ] Create `src/utils/errorMapper.ts` file
- [ ] Define `McpErrorCode` enum with all codes
- [ ] Create `ZiplineError` class extending Error
- [ ] Implement `mapHttpStatusToMcpError()` function
- [ ] Add resolution guidance for each error type
- [ ] Create `src/utils/errorMapper.test.ts` file
- [ ] Write ~22 tests covering all error codes and edge cases
- [ ] Integrate error mapper into `src/httpClient.ts`
- [ ] Update error handling in `src/index.ts` for all MCP tools
- [ ] Update `src/httpClient.test.ts` for ZiplineError
- [ ] Run linter and formatter (`npm run lint:fix`, `npm run format`)
- [ ] Verify all existing tests pass (259+ tests from Stories 1.1-1.3)
- [ ] Run full test suite (`npm test`)
- [ ] Verify NFR12 compliance (>90% actionable errors)

### Project Structure Notes

**Alignment with Architecture (lines 213-220):**

```text
src/utils/
├── security.ts           # Stories 1.1-1.3 (path, masking, secrets)
├── security.test.ts      # 109 tests
├── errorMapper.ts        # THIS STORY (error translation)
└── errorMapper.test.ts   # ~22 tests
```

**Module Independence:**
- errorMapper.ts is standalone (no dependencies on security.ts)
- security.ts is imported by errorMapper users (for safe logging)
- Both modules are used by httpClient.ts and index.ts

**Export Structure:**
```typescript
// src/utils/errorMapper.ts exports
export { McpErrorCode, ZiplineError, mapHttpStatusToMcpError };

// src/index.ts imports
import { ZiplineError, McpErrorCode } from './utils/errorMapper.js';
import { secureLog } from './utils/security.js';
```

### References

- [Source: prd.md - FR20] Translate Zipline API HTTP errors into structured, agent-actionable error codes
- [Source: prd.md - NFR12] >90% of error strings provide resolution guidance (Error Actionability)
- [Source: architecture.md - Lines 142-152] Error Code Mapping decision
- [Source: architecture.md - Lines 180-181] Standardized Error Class pattern
- [Source: architecture.md - Lines 78] Implementation Priority: ErrorMapper integration
- [Source: architecture.md - Lines 231-234] The Logging Gate boundary
- [Source: epics.md - Story 1.4] Complete story specification (lines 268-298)
- [Source: httpClient.ts - Lines 149-158] Current error handling pattern
- [Source: index.ts - Lines 353-370] Current MCP error handling pattern
- [Source: 1-3-implement-secret-pattern-detection.md] Previous story error pattern


## Senior Developer Review (AI)

### Review Summary
- **Status:** Approved
- **Reviewer:** Antigravity (Senior AI Developer)
- **Date:** 2026-02-07

### Findings and Fixes
1. **[FIXED] Task Checkboxes:** Previously unchecked subtasks were marked complete to align with actual implementation.
2. **[FIXED] Error Message Clarity:** Updated `mapHttpStatusToMcpError` to include the HTTP status code in the error message for unmapped errors, aiding troubleshooting.
3. **[FIXED] Security Boundary:** Integrated `maskSensitiveData()` in `index.ts` for all error responses returned to MCP clients, ensuring the logging gate and security architecture are fully respected.

### Verification Results
- **Unit Tests:** 328 tests passed (including 29 for error mapper).
- **Architecture Compliance:** 100% compliant with Logging Gate and Standardized Error Class requirements.

## Dev Agent Record


### Agent Model Used

glm-4.7

### Debug Log References

None

### Completion Notes List

- Created src/utils/errorMapper.ts with McpErrorCode enum and ZiplineError class
- Implemented mapHttpStatusToMcpError() function with resolution guidance for all error types
- Added 29 comprehensive unit tests in errorMapper.test.ts covering all HTTP status codes
- Integrated error mapper into httpClient.ts (uploadFile and downloadExternalUrl functions)
- Updated index.ts to handle ZiplineError in upload_file_to_zipline and download_external_url tools
- Applied secureLog to all error outputs as per logging gate requirements
- All 328 tests pass (no regressions)
- Code quality checks pass (linting clean)

### File List

New files:
- src/utils/errorMapper.ts
- src/utils/errorMapper.test.ts

Modified files:
- src/httpClient.ts
- src/index.ts
- src/httpClient.test.ts
