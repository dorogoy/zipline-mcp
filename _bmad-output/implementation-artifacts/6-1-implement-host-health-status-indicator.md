# Story 6.1: Implement Host Health Status Indicator

Status: done

## Story

As a **developer integrating with Zipline**,
I want **to verify Zipline host availability before performing operations**,
So that **I can provide meaningful feedback when the host is unavailable**.

## Acceptance Criteria

1. **Given** the Zipline host is available and responding
   **When** a health check is performed
   **Then** `{ success: true, status: "healthy" }` is returned

2. **Given** the Zipline host is unavailable or timing out
   **When** a health check is performed
   **Then** `{ success: false, error: "HOST_UNAVAILABLE" }` is returned with details

3. **Given** the Zipline host returns authentication errors
   **When** a health check is performed
   **Then** the authentication issue is distinguished from connectivity issues

4. **Given** any health check request
   **When** the host is down
   **Then** the error is captured and translated (100% error capture)

**FRs addressed:** FR19
**NFRs addressed:** NFR9 (100% error capture)

## Tasks / Subtasks

- [x] Enhance `check_health` tool to return structured JSON response (AC: #1, #2)
  - [x] Return `{ success: true, status: "healthy" }` on success
  - [x] Return `{ success: false, error: "HOST_UNAVAILABLE", ... }` on failure
  - [x] Include latency measurement in response
  - [x] Include endpoint information in response
- [x] Distinguish authentication errors from connectivity issues (AC: #3)
  - [x] Detect HTTP 401/403 responses from Zipline
  - [x] Return appropriate error code for auth issues
  - [x] Differentiate network errors (ECONNREFUSED, ETIMEDOUT) from HTTP errors
- [x] Integrate error mapping for HTTP errors (AC: #4)
  - [x] Use `mapHttpStatusToMcpError()` for HTTP error translation
  - [x] Apply `maskSensitiveData()` for security on error messages
  - [x] Ensure 100% error capture per NFR9
- [x] Add unit tests in `index.test.ts` (AC: All)
  - [x] Test successful health check with healthy response
  - [x] Test health check with unreachable host (ECONNREFUSED)
  - [x] Test health check with timeout (ETIMEDOUT)
  - [x] Test health check with HTTP 401 (authentication error)
  - [x] Test health check with HTTP 403 (forbidden)
  - [x] Test health check with HTTP 500 (server error)
  - [x] Test latency measurement accuracy
- [x] Run full test suite
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: This is an ENHANCEMENT Story

**The `check_health` tool EXISTS and is MOSTLY COMPLETE.**

**Current Implementation Status (index.ts:1446-1488):**
- ✅ Tool registered as `check_health`
- ✅ Calls `/api/health` endpoint
- ✅ Measures latency
- ✅ Returns basic healthy/unhealthy status
- ❌ Returns TEXT-based response, not JSON with structured fields
- ❌ Doesn't distinguish authentication errors from connectivity issues
- ❌ Doesn't use `mapHttpStatusToMcpError()` for HTTP errors
- ❌ Error response doesn't use `maskSensitiveData()` for security

**Current Implementation Code:**
```typescript
// 12. check_health
server.registerTool(
  'check_health',
  {
    title: 'Check Health',
    description: 'Verify the availability and health of the Zipline server.',
    inputSchema: {},
  },
  async () => {
    try {
      const start = Date.now();
      const res = await fetch(`${ZIPLINE_ENDPOINT}/api/health`);
      const latency = Date.now() - start;
      if (res.ok)
        return {
          content: [
            {
              type: 'text',
              text: `🟢 SERVER HEALTHY\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nLatency: ${latency}ms\nStatus: UP`,
            },
          ],
        };
      return {
        content: [
          {
            type: 'text',
            text: `🔴 SERVER UNHEALTHY\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nStatus: HTTP ${res.status}`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `🔴 SERVER UNREACHABLE\n\nEndpoint: ${ZIPLINE_ENDPOINT}\nError: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

### Epic Context - Epic 6: Reliability & Observability

**Story Position:** First story in Epic 6 - establishes health check foundation.

**Epic Objectives:**
- Implement host health status indicator (Story 6.1 - THIS STORY)
- Implement time-bound result caching for file lists (Story 6.2)
- Implement folder metadata caching (Story 6.3)
- Implement usage statistics endpoint (Story 6.4)

**Dependencies:**
- **Requires Epic 1 patterns** - Error mapping and security masking patterns
- **Foundation for** Stories 6.2-6.4 - Caching decisions may depend on health status

### Required Enhancements

**1. Structured Response Format:**

Change from text-based to structured JSON in response text:

**Success Response:**
```
✅ HEALTH CHECK PASSED

Status: healthy
Endpoint: ${ZIPLINE_ENDPOINT}
Latency: ${latency}ms
Response Time: ${latency}ms
```

**Failure Response (Connectivity):**
```
❌ HEALTH CHECK FAILED

Status: unhealthy
Error: HOST_UNAVAILABLE
Endpoint: ${ZIPLINE_ENDPOINT}
Details: ${error message}
Resolution: Check network connectivity and verify ZIPLINE_ENDPOINT is correct.
```

**Failure Response (Authentication):**
```
❌ HEALTH CHECK FAILED

Status: unhealthy
Error: AUTHENTICATION_ERROR
Endpoint: ${ZIPLINE_ENDPOINT}
HTTP Status: 401
Resolution: Check ZIPLINE_TOKEN environment variable. Verify token is valid and not expired.
```

**2. Error Detection Logic:**

```typescript
// Distinguish error types
async function performHealthCheck(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${ZIPLINE_ENDPOINT}/api/health`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    const latency = Date.now() - start;

    if (res.ok) {
      return { success: true, status: 'healthy', latency, endpoint: ZIPLINE_ENDPOINT };
    }

    // HTTP error - check for auth issues
    if (res.status === 401 || res.status === 403) {
      const ziplineError = mapHttpStatusToMcpError(res.status);
      return {
        success: false,
        status: 'unhealthy',
        error: 'AUTHENTICATION_ERROR',
        httpStatus: res.status,
        latency,
        endpoint: ZIPLINE_ENDPOINT,
        resolution: ziplineError.resolutionGuidance,
      };
    }

    // Other HTTP errors
    const ziplineError = mapHttpStatusToMcpError(res.status);
    return {
      success: false,
      status: 'unhealthy',
      error: 'HOST_UNAVAILABLE',
      httpStatus: res.status,
      latency,
      endpoint: ZIPLINE_ENDPOINT,
      resolution: ziplineError.resolutionGuidance,
    };
  } catch (e) {
    const latency = Date.now() - start;
    // Network error (ECONNREFUSED, ETIMEDOUT, etc.)
    return {
      success: false,
      status: 'unhealthy',
      error: 'HOST_UNAVAILABLE',
      latency,
      endpoint: ZIPLINE_ENDPOINT,
      details: e instanceof Error ? e.message : String(e),
      resolution: 'Check network connectivity and verify ZIPLINE_ENDPOINT is correct.',
    };
  }
}
```

### Architecture Patterns and Constraints

**Critical Architecture Requirements:**

1. **Error Mapping (FR20/NFR9):**
   - HTTP errors MUST use `mapHttpStatusToMcpError()` from `utils/errorMapper.ts`
   - HTTP 401/403 → `AUTHENTICATION_ERROR` (distinguished from connectivity)
   - Network errors (ECONNREFUSED, ETIMEDOUT) → `HOST_UNAVAILABLE`
   - HTTP 500/502/503 → `HOST_UNAVAILABLE` with resolution guidance

2. **Security Gate (NFR6):**
   - Error messages MUST pass through `maskSensitiveData()` to prevent token exposure
   - Current implementation does NOT mask - MUST be added

3. **Response Format:**
   - Text-based output for MCP tool responses (consistent with other tools)
   - Must include: status, error code (if failed), latency, endpoint, resolution guidance

### File Structure Requirements

**Primary Files to Modify:**

| File | Lines | Change Required |
|------|-------|-----------------|
| `src/index.ts` | 1446-1488 | Enhance `check_health` tool handler |
| `src/index.test.ts` | Add new section | Add health check tests |

**NO changes needed to:**
- `src/utils/errorMapper.ts` - Already has all error mappings needed
- `src/utils/security.ts` - Already has `maskSensitiveData()`

### Previous Story Intelligence

**From Story 5.5 (Implement Folder Deletion):**

**Critical Learnings:**
- **Security pattern established** - try/catch with `maskSensitiveData()` on all error outputs
- **Error mapping pattern** - `mapHttpStatusToMcpError()` for all HTTP errors
- **Test pattern established** - Mock fetch, call handler, verify output and security
- **HTTP error test pattern** - Use `toMatchObject()` to verify error details

**Test Pattern to Follow (from Epic 5):**
```typescript
describe('check_health tool', () => {
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

  it('should return healthy status when host responds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('healthy');
    expect(result.content[0]?.text).toContain('Latency');
  });

  it('should handle network errors (ECONNREFUSED)', async () => {
    mockFetch.mockRejectedValueOnce(
      new Error('fetch failed: ECONNREFUSED')
    );

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('HOST_UNAVAILABLE');
    expect(result.content[0]?.text).toContain('ECONNREFUSED');
  });

  it('should distinguish authentication errors (401)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    const handler = getToolHandler('check_health');
    if (!handler) throw new Error('Handler not found');

    const result = await handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('AUTHENTICATION_ERROR');
    expect(result.content[0]?.text).toContain('401');
  });
});
```

### Git Intelligence Summary

**Recent Commits (Epic 4-5):**
```
2ea8274 feat(folder-management): Implement folder deletion with comprehensive test coverage and validation
902282b feat(folder-management): Implement folder editing with comprehensive test coverage and validation
54a6ea1 feat(folder-management): Implement folder information retrieval with comprehensive test coverage
bc9ee40 fix(folder-management): Add missing error mappings and validation for folder creation
bbfd1e9 feat(folder-management): Implement folder listing with security and error handling
e0facf5 feat(batch): Add batch file operations with security and tests
29688d1 feat: Implement single file deletion with security fixes and enhanced test coverage
```

**Key Patterns Established:**
- `mapHttpStatusToMcpError()` for all HTTP error handling
- `maskSensitiveData()` for all error message outputs
- Comprehensive test coverage with Vitest
- Mock patterns using `vi.mocked()` for function spying
- Structured error responses with resolution guidance
- Text-based output format for MCP tool responses (emojis + structured fields)

### Test Requirements

**Tests to Add in `index.test.ts`:**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `should return healthy status` | Test health check with 200 response | #1 |
| `should include latency measurement` | Verify latency is included in response | #1 |
| `should handle network errors` | Test ECONNREFUSED, ETIMEDOUT | #2, #4 |
| `should distinguish 401 errors` | Test authentication error detection | #3 |
| `should distinguish 403 errors` | Test forbidden error detection | #3 |
| `should handle HTTP 500 errors` | Test server error handling | #4 |
| `should mask sensitive data in errors` | Verify maskSensitiveData usage | NFR6 |
| `should include resolution guidance` | Verify helpful error messages | #4 |

### References

1. **Epic Context:**
   - [Source: epics.md:928-958] - Story 6.1 requirements
   - [Source: epics.md:166-173] - Epic 6 overview

2. **Architecture Requirements:**
   - [Source: architecture.md:145-151] - Error code mapping
   - [Source: architecture.md:232-234] - Logging gate (maskSensitiveData)
   - [Source: architecture.md:113-119] - Error translation pattern

3. **Current Implementation:**
   - [Source: index.ts:1446-1488] - check_health tool handler
   - [Source: utils/errorMapper.ts] - Error mapping utilities
   - [Source: utils/security.ts] - Security masking utilities

4. **Previous Stories:**
   - [Source: 5-5-implement-folder-deletion.md] - Story 5.5 learnings (test patterns, security)
   - [Source: 1-4-implement-http-error-to-mcp-error-code-mapping.md] - Error mapping patterns

### Security Considerations

- Error messages must use `maskSensitiveData()` to prevent token/endpoint exposure
- Health check endpoint `/api/health` does not require authentication (public endpoint)
- Timeout should be implemented to prevent hanging (5 second recommended)
- Network error messages may contain sensitive info - must be masked

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── index.ts                  # check_health tool handler (ENHANCE)
│   ├── index.test.ts             # Add health check tests
│   └── utils/
│       ├── errorMapper.ts        # Error mapping (NO CHANGES NEEDED)
│       └── security.ts           # maskSensitiveData (NO CHANGES NEEDED)
```

**Alignment:** Enhancement story - improve existing implementation for compliance.

### Zipline API Behavior Notes

**Health Check Endpoint:**
- Path: `/api/health`
- Method: GET
- Authentication: Not required (public endpoint in most Zipline versions)
- Response: Varies by Zipline version - may return 200 with body or just 200 OK

**Important:** Some Zipline versions may require authentication for health check. The implementation should handle both cases:
1. 200 OK → Healthy
2. 401/403 → Authentication error (distinguished from connectivity)
3. Network error → Host unavailable

## Dev Agent Record

### Agent Model Used

Claude (glm-5) - 2026-02-22

### Debug Log References

N/A - No debug issues encountered during implementation.

### Completion Notes List

- **Implementation Complete**: Enhanced `check_health` tool with structured response format
- **AC #1 (Healthy Response)**: Returns `✅ HEALTH CHECK PASSED` with status, endpoint, and latency
- **AC #2 (Unhealthy Response)**: Returns `❌ HEALTH CHECK FAILED` with `HOST_UNAVAILABLE` error code
- **AC #3 (Auth Error Detection)**: Returns `AUTHENTICATION_ERROR` for HTTP 401/403, distinguished from connectivity issues
- **AC #4 (100% Error Capture)**: All errors captured with `mapHttpStatusToMcpError()` and `maskSensitiveData()`
- **NFR9 (Error Capture)**: 100% error capture implemented with try/catch and proper error mapping
- **NFR6 (Security)**: `maskSensitiveData()` applied to all error messages
- **Tests Added**: 15 comprehensive unit tests covering all acceptance criteria
- **Lint**: All lint errors resolved

### File List

- `src/index.ts` (lines 1446-1520) - Enhanced `check_health` tool handler with structured response, error mapping, and security
- `src/index.test.ts` (lines 3065-3394) - Added 15 unit tests for `check_health` tool
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status to `review`

### Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-02-22 | Initial implementation | Dev Agent (Claude glm-5) |
| 2026-02-22 | Code review fixes | Reviewer Agent (claude-opus-4.5) |

---

## Senior Developer Review (AI)

**Reviewer:** claude-opus-4.5  
**Date:** 2026-02-22  
**Outcome:** ✅ APPROVED

### Review Summary

Code review completed with 6 issues identified (1 HIGH, 3 MEDIUM, 2 LOW). All HIGH and MEDIUM issues have been fixed.

### Issues Found & Fixed

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | HIGH | File List missing `sprint-status.yaml` | ✅ FIXED |
| 2 | MEDIUM | Test count verification | ✅ VERIFIED (15 tests) |
| 3 | MEDIUM | Endpoint display intentional (documented in test) | ✅ ACKNOWLEDGED |
| 4 | MEDIUM | File List missing line numbers | ✅ FIXED |
| 5 | LOW | Redundant `Response Time:` field | ✅ FIXED |
| 6 | LOW | Status field format consistency | ✅ ACKNOWLEDGED |

### Verification Results

- **All Tests Pass:** 15/15 check_health tests ✅
- **Lint:** Clean ✅
- **AC #1:** Healthy response with structured format ✅
- **AC #2:** Unhealthy response with HOST_UNAVAILABLE ✅
- **AC #3:** Auth errors distinguished (401/403) ✅
- **AC #4:** 100% error capture via try/catch ✅
- **NFR9:** Error mapping integration ✅
- **NFR6:** Security masking applied ✅

### Code Quality Assessment

- **Security:** `maskSensitiveData()` properly applied to all error messages
- **Error Handling:** `mapHttpStatusToMcpError()` used for HTTP error translation
- **Test Coverage:** Comprehensive - all ACs covered
- **Architecture Compliance:** Follows established patterns from Epic 1-5
