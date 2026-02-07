# MCP Tool Schema Audit Report

**Story:** 1-5-validate-full-toolset-and-schema-exposure
**Date:** 2026-02-07
**Auditor:** Dev Agent

## Executive Summary

Comprehensive audit of MCP tool schemas reveals that all registered tools have complete Zod schemas with parameter descriptions. However, there are areas for improvement:

1. **Tool Count Discrepancy**: Story references 12 tools, but only 9 are registered
2. **Optional Parameter Documentation**: Many optional parameters don't explicitly mention "optional" in descriptions
3. **Default Documentation**: Some defaults could be more explicit

## Tools Registered (9 total)

| # | Tool Name | Status | Parameters |
|---|-----------|---------|------------|
| 1 | upload_file_to_zipline | ✓ | 7 (1 required, 6 optional) |
| 2 | validate_file | ✓ | 1 (required) |
| 3 | tmp_file_manager | ✓ | 2 (1 required, 1 optional) |
| 4 | download_external_url | ✓ | 3 (1 required, 2 optional) |
| 5 | list_user_files | ✓ | 8 (1 required, 7 optional) |
| 6 | get_user_file | ✓ | 1 (required) |
| 7 | update_user_file | ✓ | 8 (1 required, 7 optional) |
| 8 | delete_user_file | ✓ | 1 (required) |
| 9 | remote_folder_manager | ✓ | 7 (1 required, 6 optional) |

## Detailed Findings

### 1. Tool Count Discrepancy

**Issue**: Story acceptance criterion #1 states "all 12 tools are returned with their Zod schemas", but only 9 tools are registered in src/index.ts.

**Recommendation**:
- Verify if there are missing tools that should be registered
- Update story documentation to reflect actual tool count if 9 is correct
- Search codebase for other tools that might not be registered

### 2. Optional Parameter Documentation

**Issue**: 20 optional parameters don't explicitly mention "optional" or "default" in their descriptions.

**Tools Affected**:

#### upload_file_to_zipline
- `format` - Currently: "Filename format (default: random)" ✓ GOOD
- `deletesAt` - Currently: "File expiration time (e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")" ⚠️ Should mention optional
- `password` - Currently: "Password protection for the uploaded file" ⚠️ Should mention optional
- `maxViews` - Currently: "Maximum number of views before file removal (≥ 0)" ⚠️ Should mention optional
- `folder` - Currently: "Target folder ID (alphanumeric, must exist)" ⚠️ Should mention optional
- `originalName` - Currently: "Original filename to preserve during download" ⚠️ Should mention optional

**Recommended Updates**:
- `deletesAt`: "Optional file expiration time (default: no expiration, e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")"
- `password`: "Optional password protection for the uploaded file (default: no password)"
- `maxViews`: "Optional maximum number of views before file removal (default: unlimited, ≥ 0)"
- `folder`: "Optional target folder ID (alphanumeric, must exist, default: no folder)"
- `originalName`: "Optional original filename to preserve during download (default: auto-generated)"

#### list_user_files
- `perpage` - Currently: "The number of files to display per page (default: 15)." ✓ GOOD
- `filter` - Currently: "Filter files by type: dashboard (media/text), all, or none." ⚠️ Should mention optional
- `favorite` - Currently: "If true, only return files marked as favorite." ⚠️ Should mention optional
- `sortBy` - Currently: "The field to sort files by (default: createdAt)." ✓ GOOD
- `order` - Currently: "The sort order: ascending (asc) or descending (desc)." ⚠️ Should mention optional
- `searchField` - Currently: "The field to search within (default: name)." ✓ GOOD
- `searchQuery` - Currently: "The search string to query files." ⚠️ Should mention optional

**Recommended Updates**:
- `filter`: "Optional filter files by type: dashboard (media/text), all, or none (default: all)"
- `favorite`: "Optional: If true, only return files marked as favorite (default: false, returns all files)"
- `order`: "Optional sort order: ascending (asc) or descending (desc) (default: desc)"
- `searchQuery`: "Optional search string to query files (default: no search, returns all files on page)"

#### update_user_file
- `favorite` - Currently: "Mark or unmark the file as a favorite." ⚠️ Should mention optional
- `maxViews` - Currently: "Set the maximum number of views allowed for the file (>= 0)." ⚠️ Should mention optional
- `password` - Currently: "Set a password for the file or remove it by setting to null." ⚠️ Should mention optional
- `originalName` - Currently: "Update the original filename of the file." ⚠️ Should mention optional
- `type` - Currently: "Update the MIME type of the file." ⚠️ Should mention optional
- `tags` - Currently: "Set or update tags associated with the file." ⚠️ Should mention optional
- `name` - Currently: "Rename the file." ⚠️ Should mention optional

**Recommended Updates**:
- `favorite`: "Optional: Mark or unmark the file as a favorite (default: no change)"
- `maxViews`: "Optional: Set the maximum number of views allowed for the file (>= 0, default: no change)"
- `password`: "Optional: Set a password for the file or remove it by setting to null (default: no change)"
- `originalName`: "Optional: Update the original filename of the file (default: no change)"
- `type`: "Optional: Update the MIME type of the file (default: no change)"
- `tags`: "Optional: Set or update tags associated with the file (default: no change, replaces existing tags if provided)"
- `name`: "Optional: Rename the file (default: no change)"

#### remote_folder_manager
- `name` - Currently: "Folder name (required for ADD command, optional for EDIT command)" ✓ GOOD
- `isPublic` - Currently: "Whether to folder is public (default: false, for ADD and EDIT commands)" ✓ GOOD
- `files` - Currently: "Array of file IDs to include in the folder (for ADD command)" ⚠️ Should mention optional
- `id` - Currently: "Folder ID (required for EDIT command) this is not the same than folder name. Retrieve the ID first with the LIST or any other previous command" ⚠️ Should mention optional
- `allowUploads` - Currently: "Whether to allow uploads to the folder (for EDIT command)" ⚠️ Should mention optional
- `fileId` - Currently: "File ID to add to the folder (for EDIT command). Retrieve the file ID first" ⚠️ Should mention optional

**Recommended Updates**:
- `files`: "Optional array of file IDs to include in the folder (for ADD command, default: empty folder)"
- `id`: "Optional folder ID (required for EDIT command, not used for other commands) - this is not the same as the folder name. Retrieve the ID first with the LIST or any other previous command"
- `allowUploads`: "Optional: Whether to allow uploads to the folder (for EDIT command, default: no change)"
- `fileId`: "Optional: File ID to add to the folder (for EDIT command). Retrieve the file ID first (default: no file added)"

### 3. Default Documentation

**Status**: Good - defaults are well documented where applicable:
- `format`: "Filename format (default: random)" ✓
- `perpage`: "The number of files to display per page (default: 15)." ✓
- `sortBy`: "The field to sort files by (default: createdAt)." ✓
- `searchField`: "The field to search within (default: name)." ✓
- `isPublic`: "Whether to folder is public (default: false, for ADD and EDIT commands)" ✓

### 4. Constraint Documentation

**Status**: Good - numeric constraints are clearly documented:
- `maxViews`: "Maximum number of views before file removal (≥ 0)" ✓
- `timeoutMs`: Uses `.positive()` constraint, documented as timeout value ✓
- `maxFileSizeBytes`: Uses `.positive()` constraint, documented as max size ✓
- `page`: Uses `.positive()` constraint ✓
- `perpage`: Uses `.positive()` constraint ✓

## Schema Compliance

### Zod Schema Validation
- ✓ All tools use valid Zod schemas
- ✓ All schemas have `.safeParse()` and `.parse()` methods
- ✓ Enum parameters properly defined with `z.enum()`
- ✓ Numeric parameters properly constrained with `.int()`, `.positive()`, `.nonnegative()`

### MCP Specification Compliance
- ✓ All tools registered via `server.registerTool()`
- ✓ All schemas use `inputSchema` property
- ✓ All tools have `title` and `description` properties
- ✓ Parameter schemas use `.describe()` for documentation

## Priority Recommendations

### High Priority
1. **Resolve tool count discrepancy** - Verify if 12 tools expected or update documentation
2. **Add "optional" mentions to descriptions** - Improve discoverability of optional parameters

### Medium Priority
3. **Standardize default documentation** - Ensure all optional parameters clearly mention defaults
4. **Add constraints documentation** - Document max/min limits explicitly in descriptions

### Low Priority
5. **Add examples to tool descriptions** - Include example values in parameter descriptions
6. **Improve enum documentation** - List all enum values in descriptions for better discoverability

## Conclusion

The MCP toolset is well-structured with complete Zod schemas and comprehensive parameter documentation. The primary areas for improvement are:

1. **Clarify tool count** - Resolve the discrepancy between 12 tools (story) and 9 tools (code)
2. **Enhance optional parameter descriptions** - Add "optional" keyword to 20 parameters
3. **Standardize default documentation** - Ensure all optional parameters document their defaults

These improvements will enhance tool discoverability and make the schema self-documenting, meeting the story's acceptance criteria for enabling developers to "discover and use all capabilities without external documentation."

## Next Steps

Based on audit findings, the following tasks should be completed:

1. ✅ Audit complete - All findings documented
2. ⏭️ Implement schema enhancements (add "optional" to descriptions)
3. ⏭️ Resolve tool count discrepancy
4. ⏭️ Update documentation and examples
5. ⏭️ Validate all improvements against acceptance criteria
