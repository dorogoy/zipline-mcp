# Story 6.3: Implement Folder Metadata Caching

Status: done

## Story

As a **system optimizing performance**,
I want **folder metadata to be cached with appropriate TTL**,
So that **folder operations are fast without excessive API calls**.

## Acceptance Criteria

1. **Given** a folder list or info request
   **When** no cached result exists
   **Then** the request is made to Zipline and cached

2. **Given** a folder request within the cache TTL
   **When** cache is valid
   **Then** cached result is returned

3. **Given** a folder modification (create, edit, delete)
   **When** it completes successfully
   **Then** the folder cache is invalidated

**FRs addressed:** FR21 (folder metadata aspect)

## Tasks / Subtasks

- [x] Add folder cache types to `src/utils/cache.ts` (AC: #1, #2)
  - [x] Create `FolderListCache` type alias or separate class
  - [x] Create `FolderInfoCache` type for single folder lookups
  - [x] Export singleton instances: `folderListCache`, `folderInfoCache`
- [x] Integrate caching into `remote_folder_manager` LIST command (AC: #1, #2)
  - [x] Check cache before calling `listFolders()`
  - [x] Store result in cache after successful API call
  - [x] Return cached result when valid
- [x] Integrate caching into `remote_folder_manager` INFO command (AC: #1, #2)
  - [x] Check cache before calling `getFolder()`
  - [x] Store result in cache after successful API call
  - [x] Return cached result when valid
- [x] Implement cache invalidation on folder modifications (AC: #3)
  - [x] Invalidate caches on successful folder creation (ADD command)
  - [x] Invalidate caches on successful folder edit (EDIT command)
  - [x] Invalidate caches on successful folder deletion (DELETE command)
- [x] Add unit tests for folder caching in `src/utils/cache.test.ts` (AC: All)
  - [x] Test folder list cache miss/hit
  - [x] Test folder info cache miss/hit
  - [x] Test folder cache invalidation
- [x] Add integration tests in `src/index.test.ts` (AC: All)
  - [x] Test LIST caching behavior
  - [x] Test INFO caching behavior
  - [x] Test cache invalidation on ADD/EDIT/DELETE
- [x] Run full test suite and lint
  - [x] `npm test` - all tests pass
  - [x] `npm run lint` - no errors

## Dev Notes

### CRITICAL: Build on Existing Cache Infrastructure

**The `FileListCache` class already exists in `src/utils/cache.ts` - REUSE IT!**

**DO NOT create a new cache class.** The existing `FileListCache<T>` is generic and can cache any data type. Simply create new typed instances for folder data.

### Cache Invalidation Strategy

**The folder cache MUST be invalidated on ANY folder modification to ensure data consistency.**

**Folder operations that MUST invalidate cache:**
1. `ADD` command - New folder created
2. `EDIT` command - Folder metadata changed
3. `DELETE` command - Folder removed

**Implementation Pattern:**
```typescript
// After successful folder operation:
folderListCache.invalidate();
folderInfoCache.invalidate();
```

### Architecture Patterns and Constraints

**Reuse Existing Cache Class (NFR10):**
- Default TTL: 30 seconds (30000ms) - same as file list cache
- Use `FileListCache<T>` with folder response types
- Same TTL-based expiration mechanism

**Cache Key Strategy:**
- **LIST cache:** Key from LIST parameters (`page`, `noincl`)
- **INFO cache:** Key is the folder ID (simple string)

### File Structure Requirements

**Primary Files to Modify:**

| File | Action | Description |
|------|--------|-------------|
| `src/utils/cache.ts` | MODIFY | Add folder cache instances |
| `src/utils/cache.test.ts` | MODIFY | Add folder cache unit tests |
| `src/index.ts` | MODIFY | Integrate cache into remote_folder_manager handlers |
| `src/index.test.ts` | MODIFY | Add integration tests for folder caching |

**NO changes needed to:**
- `src/remoteFolders.ts` - Cache is at the tool handler level, not API client level
- `src/utils/security.ts` - Security masking already implemented

### Current Implementation (index.ts:1169-1359)

The `remote_folder_manager` tool handles 5 commands:

1. **LIST** (lines 1189-1236): Returns all folders
2. **ADD** (lines 1237-1267): Creates new folder
3. **EDIT** (lines 1268-1301): Edits folder properties
4. **INFO** (lines 1302-1328): Gets single folder info
5. **DELETE** (lines 1329-1353): Deletes folder

**Caching applies to:**
- **LIST** - Cache the folder list response
- **INFO** - Cache individual folder info by ID

**Invalidation applies to:**
- **ADD** - Invalidate after successful creation
- **EDIT** - Invalidate after successful edit
- **DELETE** - Invalidate after successful deletion

### Previous Story Intelligence (Story 6.2)

**From Story 6.2 (Implement Time-Bound Result Caching for File Lists):**

**Critical Patterns to Reuse:**
- `FileListCache<T>` class is generic - works with any type
- `generateKey()` creates consistent cache keys from params
- `get()`, `set()`, `invalidate()` methods already implemented
- TTL validation via `isExpired()` helper

**Cache Integration Pattern (from 6-2):**
```typescript
// In tool handler:
const cacheKey = cache.generateKey(args);
const cachedResult = cache.get(cacheKey);
if (cachedResult) {
  // Return cached result (format same as API response)
  return { content: [{ type: 'text', text: formattedOutput }] };
}
// Cache miss - call API
const result = await apiFunction();
cache.set(cacheKey, result);
// Return result
```

**Invalidation Pattern (from 6-2):**
```typescript
// After successful modification:
cache.invalidate();
```

### Cache Module Additions

**Add to `src/utils/cache.ts`:**

```typescript
import type { ListFoldersResponse, FullFolder } from '../remoteFolders';

// Existing exports...
export const fileListCache = new FileListCache<ListUserFilesResponse>();

// NEW: Folder cache instances
export const folderListCache = new FileListCache<ListFoldersResponse>();
export const folderInfoCache = new FileListCache<FullFolder>();
```

### Integration Points

**1. Cache Check in LIST Handler (index.ts ~line 1191):**

```typescript
// Before: const folders = await listFolders({...})
const cacheKey = folderListCache.generateKey({ page, noincl });
const cachedFolders = folderListCache.get(cacheKey);
if (cachedFolders) {
  // Return cached result
}
const folders = await listFolders({
  endpoint: ZIPLINE_ENDPOINT,
  token: ZIPLINE_TOKEN,
  page,
  noincl,
});
folderListCache.set(cacheKey, folders);
```

**2. Cache Check in INFO Handler (index.ts ~line 1304):**

```typescript
// Before: const folder = await getFolder(id)
const cacheKey = folderInfoCache.generateKey({ id });
const cachedFolder = folderInfoCache.get(cacheKey);
if (cachedFolder) {
  // Return cached result
}
const folder = await getFolder(id);
folderInfoCache.set(cacheKey, folder);
```

**3. Cache Invalidation in ADD Handler (after line 1245):**

```typescript
// After successful createFolder():
folderListCache.invalidate();
folderInfoCache.invalidate();
```

**4. Cache Invalidation in EDIT Handler (after line 1279):**

```typescript
// After successful editFolder():
folderListCache.invalidate();
folderInfoCache.invalidate();
```

**5. Cache Invalidation in DELETE Handler (after line 1331):**

```typescript
// After successful deleteFolder():
folderListCache.invalidate();
folderInfoCache.invalidate();
```

### Git Intelligence Summary

**Recent Commits (Epic 6):**
```
50283f9 feat(cache): Implement time-bound result caching for file lists with TTL-based expiration
b02af04 feat(health): Complete host health status indicator implementation
```

**Key Patterns Established:**
- `FileListCache<T>` is generic and reusable
- Cache invalidation pattern: call `invalidate()` after successful modifications
- Tests follow established patterns in `cache.test.ts` and `index.test.ts`
- MockServer and getToolHandler patterns for integration tests

### Test Requirements

**Tests in `src/utils/cache.test.ts` (add to existing file):**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `folderListCache should store and retrieve folder lists` | Basic set/get for LIST | #1 |
| `folderInfoCache should store and retrieve folder info` | Basic set/get for INFO | #1 |
| `folder caches should expire after TTL` | TTL validation | #2 |
| `folder caches should support invalidation` | Full cache clear | #3 |

**Tests in `src/index.test.ts` (add to existing file):**

| Test Case | Description | AC |
|-----------|-------------|-----|
| `should cache LIST results and return cached data within TTL` | LIST caching | #1, #2 |
| `should cache INFO results by folder ID` | INFO caching | #1, #2 |
| `should invalidate caches on successful ADD` | Cache invalidation | #3 |
| `should invalidate caches on successful EDIT` | Cache invalidation | #3 |
| `should invalidate caches on successful DELETE` | Cache invalidation | #3 |

### Security Considerations

- Folder metadata contains no sensitive file content
- No ZIPLINE_TOKEN in cached data
- Cache is in-memory only, never persisted
- Error messages use `maskSensitiveData()` as per existing patterns

### Project Structure Notes

```
zipline-mcp/
├── src/
│   ├── index.ts                  # remote_folder_manager handler (MODIFY)
│   ├── index.test.ts             # Add folder caching tests (MODIFY)
│   ├── remoteFolders.ts          # Folder API functions (NO CHANGES)
│   └── utils/
│       ├── cache.ts              # Add folder cache instances (MODIFY)
│       ├── cache.test.ts         # Add folder cache tests (MODIFY)
│       ├── security.ts           # maskSensitiveData (NO CHANGES)
│       └── errorMapper.ts        # Error mapping (NO CHANGES)
```

### Performance Impact

**Before Caching:**
- Every LIST/INFO call hits Zipline API
- Network latency + API processing time

**After Caching:**
- First call: Same as before (API hit required)
- Subsequent calls within 30s: Instant response from memory
- Estimated improvement: ~100ms per cached response (NFR1: <100ms local logic)

### Anti-Patterns to Avoid

1. **DO NOT create a new cache class** - Reuse `FileListCache<T>`
2. **DO NOT forget invalidation** - Must invalidate on ADD/EDIT/DELETE
3. **DO NOT cache at API client level** - Cache at tool handler level (index.ts)
4. **DO NOT skip tests** - Follow test patterns from Story 6.2

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5

### Debug Log References

### Completion Notes List

- ✅ Added `folderListCache` and `folderInfoCache` singleton instances to cache.ts
- ✅ Integrated caching into remote_folder_manager LIST command with cache-first approach
- ✅ Integrated caching into remote_folder_manager INFO command with folder ID as key
- ✅ Added cache invalidation to ADD, EDIT, and DELETE commands
- ✅ Added 7 unit tests for folder caching in cache.test.ts (folderListCache: 3 tests, folderInfoCache: 4 tests)
- ✅ Added 6 integration tests for folder caching in index.test.ts covering all AC scenarios
- ✅ All 546 tests pass (up from 533 before this story)
- ✅ Linting passes with no errors

### Code Review Fixes (AI - 2026-02-22)

**Review findings: 6 High, 3 Medium issues found and fixed**

Fixes applied:
- ✅ **Fixed pagination support in LIST command**: Added `page` and `noincl` parameters to remoteFolderManagerInputSchema
- ✅ **Fixed cache key generation**: LIST cache now uses `{ page, noincl }` instead of empty object for proper cache isolation
- ✅ **Fixed id validation**: Added `.trim()` check for EDIT, INFO, and DELETE commands to prevent empty string IDs
- ✅ **Added TTL expiration tests**: Added 2 integration tests verifying cache expiration after 30s TTL for LIST and INFO
- ✅ **Refactored code duplication**: Extracted `formatFolderListResponse()` helper function to eliminate duplicate folder formatting logic
- ✅ **Added FullFolder import**: Imported `FullFolder` type in index.ts for type safety
- ✅ **All 548 tests pass** (up from 546, added 2 new TTL tests)
- ✅ **Linting passes** with no errors or warnings

### File List

- src/utils/cache.ts (modified)
- src/utils/cache.test.ts (modified)
- src/index.ts (modified)
- src/index.test.ts (modified)
