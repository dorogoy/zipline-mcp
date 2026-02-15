# Story 1.3: Implement Secret Pattern Detection

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer uploading files through the MCP server**,
I want **files containing secret patterns to be rejected before upload**,
So that **I don't accidentally expose API keys, .env files, or credentials**.

## Acceptance Criteria

1. **Given** a file with `.env` extension
   **When** validation is attempted
   **Then** the file is rejected with a clear error message

2. **Given** a file containing patterns like `API_KEY=`, `SECRET=`, `PASSWORD=`
   **When** the file content is scanned
   **Then** the upload is rejected with identification of the secret pattern type

3. **Given** a legitimate file (e.g., `.png`, `.txt` with no secrets)
   **When** scanned for secret patterns
   **Then** the file passes validation and proceeds to staging

## Tasks / Subtasks

- [x] Extend `src/utils/security.ts` with secret detection functions (AC: #1, #2, #3)
  - [x] Implement `detectSecretPatterns(content: string, filename: string): SecretDetectionResult`
  - [x] Create regex patterns for common secret formats (API keys, passwords, tokens)
  - [x] Handle .env file detection by extension
  - [x] Handle file content scanning for secret patterns
  - [x] Return detailed information about detected secret type
  - [x] Handle binary files gracefully (skip text scanning)
- [x] Create comprehensive unit tests `src/utils/security.test.ts` (AC: #1, #2, #3)
  - [x] Test .env file rejection by extension
  - [x] Test various secret pattern detection (API_KEY=, SECRET=, PASSWORD=, etc.)
  - [x] Test legitimate files pass through (images, clean text)
  - [x] Test edge cases (empty files, binary files, large files)
  - [x] Test multiple secret patterns in single file
  - [x] Test case insensitivity for pattern matching
- [x] Integrate detection into sandbox validation pipeline (AC: #1, #2, #3)
  - [x] Update `sandboxUtils.ts` to call secret detection during staging
  - [x] Ensure secret detection occurs BEFORE staging (in validation gate)
  - [x] Return actionable error messages identifying secret type
  - [x] Maintain backward compatibility with existing tests
- [x] Document integration with staging flow (AC: #2, #3)
  - [x] Add inline documentation explaining secret detection patterns
  - [x] Document how to extend patterns for additional secret types

## Dev Notes

### Architectural Context

This story implements **FR6: Detect and reject uploads of files containing recognized secret patterns** from the PRD. Secret pattern detection is part of the **CRITICAL** security layer in the Architecture document.

**Security Priority:** Per Architecture document (lines 136-139):
> "Secret Scanner (FR6): A regex-based validator in the `validate_file` and ingest pipeline to reject files containing recognized secret patterns (e.g., `.env`, API keys)."

This story extends the `src/utils/security.ts` module created in Stories 1.1 and 1.2, adding secret pattern detection alongside existing path sanitization and token masking capabilities.

### Previous Story Intelligence

**Story 1.1 (Path Sanitization) - Key Learnings:**
- Centralized security functions in `src/utils/security.ts`
- Used TypeScript `strict` mode with comprehensive type safety
- Co-located tests achieved 100% coverage
- Guard clauses prevent exceptions in all cases
- Helper functions are private (not exported)
- Main functions are exported with clear, descriptive names

**Code Pattern Established:**
```typescript
// Private helper functions for internal validation
function validateInput(input: string): void { ... }

// Exported main functions with comprehensive guard clauses
export function mainFunction(input: string): Result {
  // Validation
  // Processing
  // Return result
}
```

**Story 1.2 (Token Masking) - Key Learnings:**
- Enhanced `secureLog()` to mask nested objects, not just strings
- Fixed security issue where debug `console.log` exposed sensitive data
- Achieved NFR6 compliance (0 token exposures)
- Used `maskSensitiveData()` convenience wrapper for environment variables
- Applied defensive coding: masking functions never throw errors

**Integration Pattern:**
```typescript
// logSandboxOperation now uses secureLog
import { secureLog } from './utils/security.js';

function logSandboxOperation(action: string, details: string): void {
  secureLog(`[Sandbox] ${action}: ${details}`);
}
```

**Files Modified in Previous Stories:**
- `src/utils/security.ts` (now 200+ lines with path sanitization + token masking)
- `src/utils/security.test.ts` (69 tests covering all security scenarios)
- `src/sandboxUtils.ts` (integrated security utilities)

### Technical Requirements

**Integration with Existing Security Module:**

Current `src/utils/security.ts` contains:
- `SandboxPathError` class
- Path sanitization: `sanitizePath()`, `validateSandboxPath()`
- Token masking: `maskToken()`, `maskSensitiveData()`, `secureLog()`
- Private helpers: `validatePathInput()`, `checkNullBytes()`, etc.

**New Functions to Add:**

```typescript
// Result type for secret detection
export interface SecretDetectionResult {
  detected: boolean;
  secretType?: 'env_file' | 'api_key' | 'password' | 'secret' | 'token' | 'private_key';
  pattern?: string;
  message?: string;
}

// Main secret detection function
export function detectSecretPatterns(
  content: string | Buffer,
  filename: string
): SecretDetectionResult;

// Helper to check if file is .env extension
function isEnvFile(filename: string): boolean;

// Helper to scan content for secret patterns
function scanForSecretPatterns(content: string): SecretDetectionResult;
```

**Secret Patterns to Detect:**

Based on industry-standard secret detection tools (e.g., TruffleHog, GitLeaks), implement regex patterns for:

1. **File Extension Check:**
   - `.env`, `.env.local`, `.env.production`, etc.

2. **Content Pattern Detection:**
   - `API_KEY=...`, `APIKEY=...`
   - `SECRET=...`, `SECRET_KEY=...`
   - `PASSWORD=...`, `PASS=...`
   - `TOKEN=...`, `AUTH_TOKEN=...`
   - `PRIVATE_KEY=...`, `-----BEGIN PRIVATE KEY-----`
   - AWS credentials: `AKIA[0-9A-Z]{16}`
   - Generic key patterns: `[a-zA-Z0-9_]*KEY=`

**Performance Consideration:**
- Scan ONLY text files (skip binary content)
- Use efficient regex patterns (avoid catastrophic backtracking)
- Early exit on first match (no need to find all secrets)
- NFR1 requirement: Keep validation under 100ms for typical files

### Architecture Compliance

**The Staging Flow Pattern (Architecture lines 183-192):**

Every file operation MUST follow this mandatory sequence:

1. **Validate** ← Path sanitization (Story 1.1)
2. **Scan** ← THIS STORY (Secret detection)
3. **Stage** ← Memory/disk staging (Story 2.4/2.5)
4. **Execute** ← Zipline upload (Story 2.7)
5. **Cleanup** ← Atomic cleanup (Story 2.6)

Secret pattern detection is the **second gate** in this sequence.

**Component Boundaries (Architecture lines 231-233):**
> "The Staging Gate: No file content from the MCP client may reach `httpClient.ts` without first being processed and scanned by `sandboxUtils.ts`."

All secret detection must occur in the validation layer BEFORE any staging operations.

**Dual-Layer Security (Architecture lines 136-139):**
> "Secret Scanner (FR6): A regex-based validator in the `validate_file` and ingest pipeline to reject files containing recognized secret patterns."

This complements token masking (Story 1.2) to provide comprehensive credential protection.

### Testing Requirements

**Testing Pattern (following Stories 1.1 and 1.2):**
- Add tests to existing `src/utils/security.test.ts`
- Use Vitest framework with consistent import pattern
- Achieve 100% line coverage for new functions
- Test both positive (secrets detected) and negative (clean files) cases

**Test Cases Required:**

| Category | Test Cases |
|----------|------------|
| File extension | `.env`, `.env.local`, `.env.production`, `.env.development` |
| API keys | `API_KEY=sk_test_123`, `APIKEY=abc123`, `AWS_ACCESS_KEY_ID=AKIA...` |
| Passwords | `PASSWORD=secret`, `DB_PASSWORD=pass123`, `PASS=test` |
| Secrets | `SECRET=value`, `SECRET_KEY=xyz`, `CLIENT_SECRET=abc` |
| Tokens | `TOKEN=bearer_xyz`, `AUTH_TOKEN=jwt_abc`, `REFRESH_TOKEN=...` |
| Private keys | `-----BEGIN PRIVATE KEY-----`, `PRIVATE_KEY=...` |
| Clean files | Text without secrets, images, JSON config (non-sensitive) |
| Edge cases | Empty files, binary files, large files, null content |
| Multiple patterns | File with multiple secret types |
| Case sensitivity | `api_key=`, `API_KEY=`, `Api_Key=` |

**Expected Test Count:**
- Approximately 25-30 new tests for secret detection
- Total security tests will reach ~95-100 tests
- All existing 259 project tests must continue passing

### Library & Framework Requirements

**Node.js Built-ins:**
- `path` module for file extension checking
- `Buffer.isBuffer()` for binary file detection
- No external dependencies required

**TypeScript Patterns:**
- Use `strict` mode (target ES2022)
- Define `SecretDetectionResult` interface for type safety
- Use discriminated unions if needed for different secret types

**Regex Patterns:**
```typescript
// Example patterns (case-insensitive)
const SECRET_PATTERNS = {
  apiKey: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-z0-9_-]{16,})['"]?/i,
  password: /(?:password|passwd|pass|pwd)\s*[:=]\s*['"]?([^\s'"]+)['"]?/i,
  secret: /(?:secret|secret[_-]?key)\s*[:=]\s*['"]?([^\s'"]+)['"]?/i,
  token: /(?:token|auth[_-]?token)\s*[:=]\s*['"]?([a-z0-9_-]{16,})['"]?/i,
  privateKey: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i,
  awsKey: /AKIA[0-9A-Z]{16}/,
};
```

**Binary File Handling:**
```typescript
function isBinaryContent(content: string | Buffer): boolean {
  if (Buffer.isBuffer(content)) return true;
  // Check for null bytes or high proportion of non-printable characters
  return content.includes('\0');
}
```

### File Location and Naming

**File to Modify:**
1. `src/utils/security.ts` - Add secret detection functions
2. `src/utils/security.test.ts` - Add secret detection tests
3. `src/sandboxUtils.ts` - Integrate secret detection into staging validation

**No New Files Required** - extending existing security module.

### Error Handling Requirements

**Custom Error for Secret Detection:**

Create a new error class specific to secret detection:

```typescript
export class SecretDetectionError extends Error {
  constructor(
    message: string,
    public secretType: string,
    public pattern: string
  ) {
    super(message);
    this.name = 'SecretDetectionError';
  }
}
```

**Error Messages:**
- Must be actionable and descriptive
- Should identify the type of secret detected
- Should NOT expose the actual secret value in error message
- Should guide user on how to fix the issue

**Example Error Messages:**
```typescript
// Good error message
"File rejected: .env file detected. Environment files may contain secrets."

// Good error message
"File rejected: API key pattern detected. Remove sensitive credentials before upload."

// BAD error message (exposes secret)
"File rejected: Found API_KEY=sk_test_123abc (DO NOT DO THIS)"
```

### Cross-Story Context

**Relationship to Other Stories:**

- **Story 1.1 (Path Sanitization):** Secret detection uses path utilities to check file extensions
- **Story 1.2 (Token Masking):** Secret detection complements masking - detection prevents upload, masking protects logs
- **Story 1.4 (Error Mapping):** Error responses should pass through masking before return to user
- **Story 2.1-2.3 (File Ingestion):** Secret detection must run during file validation pipeline
- **Story 2.4-2.6 (Staging):** Secret detection MUST occur BEFORE staging (per Staging Flow pattern)

**Integration Points:**

Current validation flow in `sandboxUtils.ts`:
```typescript
export function resolveSandboxPath(filename: string): string {
  const userSandbox = getUserSandbox();
  const validationError = validateFilename(filename); // Path validation
  if (validationError) {
    throw new SandboxPathError(validationError);
  }
  // TODO: Add secret detection here (this story)
  const resolved = path.resolve(userSandbox, filename);
  if (!resolved.startsWith(userSandbox)) {
    throw new SandboxPathError(`Path traversal attempt: ${filename}`);
  }
  return resolved;
}
```

**New Integration Point:**
A new function in `sandboxUtils.ts` should call secret detection:
```typescript
export function validateFileForSecrets(filepath: string): void {
  const content = fs.readFileSync(filepath);
  const result = detectSecretPatterns(content, filepath);
  if (result.detected) {
    throw new SecretDetectionError(
      result.message,
      result.secretType,
      result.pattern
    );
  }
}
```

### Performance Considerations

**NFR1: Response Latency < 100ms**

Secret pattern detection must be fast:
- Use efficient regex patterns (avoid catastrophic backtracking)
- Early exit on first secret match (no need to scan entire file)
- Skip binary files entirely (no text scanning needed)
- Limit file size for content scanning (optional: skip files > 1MB)

**Optimization Strategies:**
- Compile regex patterns once (use constants, not recreate on each call)
- Use `String.prototype.includes()` for simple checks before regex
- Early file extension check (fastest rejection path)

### Security Considerations

**Zero False Positives vs. Zero False Negatives:**

This implementation prioritizes **security over convenience**:
- Better to reject a legitimate file than allow a secret to leak
- Patterns should be specific enough to minimize false positives
- But when in doubt, REJECT the file

**Examples:**
```typescript
// This might be a false positive, but REJECT for safety
const config = "MASTER_KEY=value"; // Could be documentation, but reject

// This is clearly safe, ALLOW
const text = "The password field is required"; // Not a secret pattern
```

**Privacy Protection:**
- Never log detected secret values
- Error messages should NOT include secret content
- Use `secureLog()` for all logging in this module

### Implementation Checklist

- [ ] Read existing `src/utils/security.ts` content (200+ lines)
- [ ] Define `SecretDetectionResult` interface
- [ ] Create `SecretDetectionError` class
- [ ] Implement `isEnvFile()` helper function
- [ ] Implement `isBinaryContent()` helper function
- [ ] Implement `scanForSecretPatterns()` helper function
- [ ] Implement `detectSecretPatterns()` main function
- [ ] Add comprehensive tests to `src/utils/security.test.ts` (25-30 tests)
- [ ] Integrate into `sandboxUtils.ts` validation pipeline
- [ ] Update existing tests if integration changes behavior
- [ ] Run linter and formatter (`npm run lint:fix`, `npm run format`)
- [ ] Verify all existing tests still pass (259+ tests)
- [ ] Run full test suite (`npm test`)
- [ ] Verify no regressions in existing functionality

### Project Structure Notes

**Alignment with Unified Project Structure:**
- Extends `src/utils/security.ts` (centralized security module)
- Follows co-located test pattern from Stories 1.1 and 1.2
- No new files or directories required
- Export pattern consistent with existing module

**Security Module Growth:**
```
src/utils/security.ts progression:
- Story 1.1: Path sanitization (97 lines)
- Story 1.2: Token masking (+100 lines = ~200 lines)
- Story 1.3: Secret detection (+150 lines = ~350 lines)
```

This is expected and appropriate - security is a core cross-cutting concern.

### Git Intelligence Summary

**Recent Commits Analysis:**

1. **Commit 4066131** (Story 1.2): "feat: Implement token masking security utility"
   - Added `maskToken()`, `maskSensitiveData()`, `secureLog()` to security.ts
   - Integrated secureLog into sandboxUtils.ts
   - Removed debug console.log from remoteFolders.ts (security fix)
   - Pattern: Extend security.ts, integrate into existing modules, fix security issues

2. **Commit 8ccc320** (Story 1.1 enhancement): "feat: Enhance path sanitization by explicitly rejecting absolute paths"
   - Fixed HIGH security issues from code review
   - Added explicit Unix absolute path validation
   - Deprecated legacy functions with JSDoc
   - Pattern: Security-first approach, thorough code review, deprecation over breaking changes

3. **Commit 05a33ea** (Story 1.1): "feat: Implement robust path sanitization utility"
   - Created src/utils/security.ts module
   - Implemented comprehensive path validation
   - 34 tests with 100% coverage
   - Pattern: Create new module, comprehensive tests, guard clauses

**Code Patterns to Follow:**
- Use conventional commits format: `feat:`, `fix:`, `chore:`
- Include story number in commit message
- Describe what was done and why
- Group related changes in single commit

**Architecture Decisions from Previous Work:**
- Security functions are centralized in `src/utils/` directory
- All security functions use guard clauses to prevent exceptions
- Tests are co-located with implementation
- Integration happens gradually (provide utility first, integrate second)

### References

- [Source: prd.md - FR6] Detect and reject uploads of files containing recognized secret patterns (e.g., `.env`, API keys)
- [Source: architecture.md - Section: Authentication & Security] Secret Protection & Sanitization (lines 136-139)
- [Source: architecture.md - Section: Implementation Patterns] Process Patterns (The "Staging Flow") (lines 183-192)
- [Source: architecture.md - Lines 231-233] The Staging Gate pattern
- [Source: epics.md - Story 1.3] Complete story specification with acceptance criteria (lines 244-265)
- [Source: src/utils/security.ts] Existing security module (path sanitization + token masking)
- [Source: 1-1-implement-path-sanitization-utility.md] Story 1.1 patterns and learnings
- [Source: 1-2-implement-token-masking-security-utility.md] Story 1.2 patterns and learnings

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-4.7

### Debug Log References

### Completion Notes List

1. Extended `src/utils/security.ts` with secret detection functionality:
   - Added `SecretDetectionResult` interface with secretType, pattern, and message fields
   - Added `SecretDetectionError` class for structured error handling
   - Implemented `detectSecretPatterns()` main function for secret detection
   - Implemented helper functions: `isEnvFile()`, `isBinaryContent()`, `scanForSecretPatterns()`
   - Created regex patterns for API keys, passwords, secrets, tokens, and private keys
   - All patterns are case-insensitive and follow industry standards

2. Created comprehensive unit tests in `src/utils/security.test.ts`:
   - 40 new tests for secret detection (total now 109 tests in security.test.ts)
   - Test coverage for .env files, API keys, passwords, secrets, tokens, private keys
   - Edge cases: empty files, binary files, large files, null/undefined inputs
   - Case insensitivity tests for all pattern types
   - All 299 project tests pass (40 new tests added)

3. Integrated secret detection into sandbox validation pipeline:
   - Added `validateFileForSecrets()` function to `src/sandboxUtils.ts`
   - Integrated into `upload_file_to_zipline` tool (rejects uploads with secrets)
   - Integrated into `validate_file` tool (reports secrets in validation)
   - Returns actionable error messages with secret type and pattern information
   - Maintains backward compatibility - all existing tests continue to pass

4. Security implementation details:
   - Binary files: Skipped for text scanning (performance optimization)
   - Early exit: Stops at first secret detected (no need to scan entire file)
   - .env detection: Fastest rejection path (extension check only)
   - Zero false negatives: Prioritizes security over convenience
   - Privacy: Never logs detected secret values in error messages

5. Pattern definitions:
   - API keys: `api[_-]?key`, `apikey`, `aws_access_key_id`, `AKIA[0-9A-Z]{16}`
   - Passwords: `password`, `passwd`, `pass`, `pwd`
   - Secrets: `secret[_-]?key`, `client_secret`, `secret`
   - Tokens: `token`, `auth[_-]?token`, `refresh_token`, `access_token`
   - Private keys: `-----BEGIN.*PRIVATE KEY-----`, `private[_-]?key`

### File List

- src/utils/security.ts
- src/utils/security.test.ts
- src/sandboxUtils.ts
- src/index.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

### 2026-02-07 (Code Review - AI)
- **Code Review Completed**: All acceptance criteria verified as implemented
- **Security Fix**: Removed pattern value leakage - now only exposes pattern type name instead of actual matched content
- **Enhancement**: Added secret detection to `tmp_file_manager` CREATE command to prevent writing files with secrets to sandbox
- **Documentation**: Added missing sprint-status.yaml to File List
- **Test Results**: All 299 tests passing, build successful, linter clean
- **Review Outcome**: APPROVED - Story meets all requirements with security improvements applied

### 2026-02-07 (Implementation)
- Implemented secret pattern detection following FR6 from PRD
- Added 40 new security tests (total: 299 project tests)
- Integrated secret detection into upload and validation workflows
- All acceptance criteria satisfied
