# Zipline MCP Server - Tool Documentation

This document provides comprehensive information about all MCP tools available in the zipline-mcp server, including their schemas, parameters, and usage examples.

## Tool List

The zipline-mcp server provides **9 MCP tools** for file management, validation, and Zipline server integration.

| Tool Name                | Description                                           | Required Params | Optional Params                                                        |
| ------------------------ | ----------------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `upload_file_to_zipline` | Upload a file to the Zipline server                   | filePath (1)    | format, deletesAt, password, maxViews, folder, originalName (6)        |
| `validate_file`          | Validate if a file exists and is suitable for upload  | filePath (1)    | None (0)                                                               |
| `tmp_file_manager`       | Perform basic file management operations in a sandbox | command (1)     | content (1)                                                            |
| `download_external_url`  | Download a file from an external URL into the sandbox | url (1)         | timeoutMs, maxFileSizeBytes (2)                                        |
| `list_user_files`        | List and search files on the Zipline server           | page (1)        | perpage, filter, favorite, sortBy, order, searchField, searchQuery (7) |
| `get_user_file`          | Get detailed information about a specific file        | id (1)          | None (0)                                                               |
| `update_user_file`       | Modify properties of a specific file                  | id (1)          | favorite, maxViews, password, originalName, type, tags, name (7)       |
| `delete_user_file`       | Delete a specific file from the server                | id (1)          | None (0)                                                               |
| `remote_folder_manager`  | Manage folders on the Zipline server                  | command (1)     | name, isPublic, files, id, allowUploads, fileId (6)                    |

## Schema Discovery

When an MCP client connects to the server, it can discover all available tools and their schemas. The schemas are defined using Zod and include complete parameter descriptions.

### Example: Schema Discovery

```typescript
// When querying the MCP server, you receive tool definitions like:

{
  name: "upload_file_to_zipline",
  description: "Upload a file to the Zipline server with advanced options...",
  inputSchema: {
    filePath: "Path to the file to upload (txt, md, gpx, html, etc.)",
    format: "Filename format (default: random)",
    deletesAt: "Optional file expiration time (default: no expiration...)",
    password: "Optional password protection for the uploaded file (default: no password)",
    maxViews: "Optional maximum number of views before file removal (default: unlimited, ≥ 0)",
    folder: "Optional target folder ID (alphanumeric, must exist, default: no folder)",
    originalName: "Optional original filename to preserve during download (default: auto-generated)"
  }
}
```

## Tool Details

### 1. upload_file_to_zipline

Upload a file to the Zipline server with advanced options and retrieve the download URL.

**File Types Supported:**

- **Images:** PNG, JPG, JPEG, GIF, WEBP, SVG
- **Text/Documents:** TXT, MD, HTML, XML, JSON, CSV, PDF
- **Code:** JS, TS, CSS, PY, SH, YAML, YML, TOML
- **Archives:** ZIP, DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, ODG
- **Media:** MP4, MKV, WEBM, AVI, FLV, MOV

**Parameters:**

- `filePath` (required): Path to the file to upload (see supported types above)
- `format` (optional): Filename format (default: random) - Options: random, uuid, date, name, random-words
- `deletesAt` (optional): Optional file expiration time (default: no expiration, e.g., "1d", "2h", "date=2025-12-31T23:59:59Z")
- `password` (optional): Optional password protection for the uploaded file (default: no password)
- `maxViews` (optional): Optional maximum number of views before file removal (default: unlimited, ≥ 0)
- `folder` (optional): Optional target folder ID (alphanumeric, must exist, default: no folder)
- `originalName` (optional): Optional original filename to preserve during download (default: auto-generated)

**File Size Limits:**

- **Maximum file size:** 100 MB (default, configurable via `ZIPLINE_MAX_FILE_SIZE` environment variable)
- **Memory staging threshold:** 5 MB - Files < 5MB use memory staging for optimal performance
- **Disk fallback:** Files ≥ 5MB use disk staging
- **Early validation:** Size is checked before any staging operations to prevent resource exhaustion
- **Size format:** File size is displayed in human-readable format (e.g., "2.5 MB", "450 KB")

**Example: Configure Custom Max File Size**

```bash
# Set max file size to 200 MB
export ZIPLINE_MAX_FILE_SIZE=209715200

# Set max file size to 50 MB
export ZIPLINE_MAX_FILE_SIZE=52428800
```

**Error Handling:**

The tool provides clear error messages for common issues:

- **File not found:** If the file doesn't exist, you'll see "File not found: {path}" with actionable guidance
- **Permission denied:** If you lack read permissions, error will indicate permission issues
- **Unsupported file type:** If the file extension isn't supported, you'll see the specific type that's not allowed
- **File too large:** If file exceeds maximum size, you'll see "File too large: {actualSize} exceeds maximum {maxSize}" with actionable guidance
- **PAYLOAD_TOO_LARGE:** Error code indicating file size exceeds configured limit

**Troubleshooting - File Size Issues:**

**Issue: "File too large" error during upload**

**Possible Causes:**

- File exceeds 100 MB default maximum (or configured `ZIPLINE_MAX_FILE_SIZE`)
- File is larger than what your Zipline server allows

**Solutions:**

1. **Reduce file size:**
   - Compress images/videos before uploading
   - Split large files into smaller parts
   - Use text format instead of binary when possible
2. **Increase limit:**
   ```bash
   # Set max file size to 200 MB
   export ZIPLINE_MAX_FILE_SIZE=209715200
   ```
3. **Check server limits:**
   - Verify Zipline server configuration for maximum allowed file size
   - Check if server-side limits are different from client defaults
4. **Use disk staging for large files:**
   - Files ≥ 5MB automatically use disk fallback staging
   - This preserves memory for smaller files while allowing large uploads

**Example Usage - Upload PNG Image:**

```json
{
  "filePath": "/path/to/screenshot.png",
  "format": "random",
  "deletesAt": "7d"
}
```

**Example Usage - Upload TXT Document:**

```json
{
  "filePath": "/path/to/notes.txt",
  "format": "name",
  "maxViews": 50
}
```

**Example Usage - Upload JSON Configuration:**

```json
{
  "filePath": "/path/to/config.json",
  "format": "uuid",
  "folder": "myfolder123",
  "password": "secure123"
}
```

**Example Usage - Upload JPG with All Options:**

```json
{
  "filePath": "/path/to/photo.jpg",
  "format": "date",
  "deletesAt": "1h",
  "password": "protected",
  "maxViews": 10,
  "folder": "teamfolder",
  "originalName": "team-photo.jpg"
}
```

### 2. validate_file

Validate if a file exists, detect its MIME type, and verify it's suitable for upload to Zipline.

**Parameters:**

- `filePath` (required): Absolute path to file to validate.

**Validation Features:**

- **File existence check:** Confirms that file exists and is accessible
- **MIME type detection:** Uses content-based detection (magic numbers) for binary files, extension-based for text files
- **Extension validation:** Verifies file extension matches allowed types
- **MIME/extension match:** Checks if detected MIME type matches expected type for file extension
- **Secret detection:** Scans for sensitive patterns (API keys, tokens, passwords)
- **Staging strategy:** Reports whether file will use memory staging (< 5MB) or disk fallback (≥ 5MB)
- **Size warnings:** Warns if file is close to 5MB threshold (90%+) or exceeds maximum size limit

**Supported File Types:**

- **Images:** PNG, JPG, JPEG, GIF, WEBP, SVG
- **Text/Documents:** TXT, MD, HTML, XML, JSON, CSV, PDF
- **Code:** JS, TS, CSS, PY, SH, YAML, YML, TOML
- **Archives:** ZIP, DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, ODG
- **Media:** MP4, MKV, WEBM, AVI, FLV, MOV

**Error Handling:**

- **File not found:** If file doesn't exist, you'll see "File not found: {path}" with actionable guidance
- **Permission denied:** If you lack read permissions, error will indicate permission issues
- **Secrets detected:** If file contains sensitive patterns (API keys, tokens), tool will flag it
- **MIME mismatch:** If file content doesn't match extension (e.g., PNG data in .jpg file), tool will report mismatch

**Example Usage - Validate PNG Image:**

```json
{
  "filePath": "/path/to/screenshot.png"
}
```

**Expected Output for Valid PNG:**

```
📋 FILE VALIDATION REPORT

📁 File: screenshot.png
📍 Path: /path/to/screenshot.png
📊 Size: 245 KB
🏷️  Extension: .png
🎯 MIME: image/png
✅ MIME/Extension Match: Yes
✅ Supported: Yes

Status: 🟢 Ready for upload

Supported formats: .txt, .md, .gpx, .html, .htm, .json, .xml, .csv, .js, .ts, .css, .py, .sh, .yaml, .yml, .toml, .pdf, .zip, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .odg, .mp4, .mkv, .webm, .avi, .flv, .mov, .png, .jpg, .jpeg, .gif, .webp, .svg
```

**Example Usage - Validate File with Size Warning:**

```json
{
  "filePath": "/path/to/large-doc.txt"
}
```

**Expected Output with Size Warning:**

```
📋 FILE VALIDATION REPORT

📁 File: large-doc.txt
📍 Path: /path/to/large-doc.txt
📊 Size: 4.6 MB
🏷️  Extension: .txt
🎯 MIME: text/plain
✅ MIME/Extension Match: Yes
✅ Supported: Yes
🚀 Staging Strategy: 🧠 Memory staging (fast, no disk I/O)
⚠️  SIZE WARNING: File is close to 5MB memory threshold. Will use memory staging but consider optimizing file size.

Status: 🟢 Ready for upload

Supported formats: .txt, .md, .gpx, .html, .htm, .json, .xml, .csv, .js, .ts, .css, .py, .sh, .yaml, .yml, .toml, .pdf, .zip, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .odg, .mp4, .mkv, .webm, .avi, .flv, .mov, .png, .jpg, .jpeg, .gif, .webp, .svg
```

**Example Usage - Validate File Exceeding Size Limit:**

```json
{
  "filePath": "/path/to/huge-video.mp4"
}
```

**Expected Output with Size Limit Exceeded:**

```
📋 FILE VALIDATION REPORT

📁 File: huge-video.mp4
📍 Path: /path/to/huge-video.mp4
📊 Size: 120.0 MB
🏷️  Extension: .mp4
🎯 MIME: video/mp4
✅ MIME/Extension Match: Yes
✅ Supported: Yes
🚀 Staging Strategy: 💾 Disk fallback staging (for files ≥ 5MB)
⚠️  SIZE LIMIT EXCEEDED: 120.0 MB exceeds maximum 100.0 MB. This file would be rejected during upload.

Status: 🔴 Too large for upload

Supported formats: .txt, .md, .gpx, .html, .htm, .json, .xml, .csv, .js, .ts, .css, .py, .sh, .yaml, .yml, .toml, .pdf, .zip, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .odg, .mp4, .mkv, .webm, .avi, .flv, .mov, .png, .jpg, .jpeg, .gif, .webp, .svg
```

**Example Usage - Validate Non-Existent File (Error Case):**

```json
{
  "filePath": "/path/to/nonexistent.txt"
}
```

**Expected Output for File Not Found:**

```
❌ FILE VALIDATION FAILED!

Error: File not found: /path/to/nonexistent.txt

Please check:
• Verify the file path is correct
• Check if the file exists and is accessible
• Ensure you have permission to read the file
```

**Example Usage - Validate File with MIME Mismatch:**

```json
{
  "filePath": "/path/to/disguised.jpg"
}
```

**Expected Output for MIME Mismatch:**

```
📋 FILE VALIDATION REPORT

📁 File: disguised.jpg
📍 Path: /path/to/disguised.jpg
📊 Size: 128 KB
🏷️  Extension: .jpg
🎯 MIME: image/png
✅ MIME/Extension Match: No
✅ Supported: Yes

Status: 🟢 Ready for upload

Supported formats: .txt, .md, .gpx, .html, .htm, .json, .xml, .csv, .js, .ts, .css, .py, .sh, .yaml, .yml, .toml, .pdf, .zip, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .odg, .mp4, .mkv, .webm, .avi, .flv, .mov, .png, .jpg, .jpeg, .gif, .webp, .svg
```

### 3. tmp_file_manager

Perform basic file management operations in a secure, per-user sandbox environment for temporary files.

**Parameters:**

- `command` (required): Command to execute. Supported commands: PATH <filename>, LIST, CREATE <filename>, OPEN <filename>, READ <filename>, DELETE <filename>. Only bare filenames are allowed.
- `content` (optional): Optional content for the CREATE command.

**Example Usage:**

```json
{
  "command": "CREATE notes.txt",
  "content": "My temporary notes"
}
```

### 4. download_external_url

Download a file from an external HTTP(S) URL into the user's sandbox.

**Parameters:**

- `url` (required): The HTTP or HTTPS URL of the file to download.
- `timeoutMs` (optional): Optional timeout in milliseconds for the download operation.
- `maxFileSizeBytes` (optional): Optional maximum allowed file size in bytes.

**Example Usage:**

```json
{
  "url": "https://example.com/document.pdf",
  "timeoutMs": 30000,
  "maxFileSizeBytes": 104857600
}
```

### 5. list_user_files

Retrieve and search files stored on the Zipline server with pagination, filtering, and sorting.

**Parameters:**

- `page` (required): The page number to retrieve (1-based).
- `perpage` (optional): The number of files to display per page (default: 15).
- `filter` (optional): Optional filter files by type: dashboard (media/text), all, or none (default: all).
- `favorite` (optional): Optional: If true, only return files marked as favorite (default: false, returns all files).
- `sortBy` (optional): The field to sort files by (default: createdAt). Options: id, createdAt, updatedAt, deletesAt, name, originalName, size, type, views, favorite
- `order` (optional): Optional sort order: ascending (asc) or descending (desc) (default: desc).
- `searchField` (optional): The field to search within (default: name). Options: name, originalName, type, tags, id
- `searchQuery` (optional): Optional search string to query files (default: no search, returns all files on page).

**Example Usage:**

```json
{
  "page": 1,
  "perpage": 20,
  "sortBy": "createdAt",
  "order": "desc",
  "favorite": false
}
```

### 6. get_user_file

Retrieve detailed information about a specific file stored on the Zipline server.

**Parameters:**

- `id` (required): Obtain the name of the file from either the user or the list_user_files tool.

**Example Usage:**

```json
{
  "id": "file123"
}
```

### 7. update_user_file

Modify properties of a specific file stored on the Zipline server.

**Parameters:**

- `id` (required): The unique ID of the file to update. Only use the ID, the filename does not work.
- `favorite` (optional): Optional: Mark or unmark the file as a favorite (default: no change).
- `maxViews` (optional): Optional: Set the maximum number of views allowed for the file (>= 0, default: no change).
- `password` (optional): Optional: Set a password for the file or remove it by setting to null (default: no change).
- `originalName` (optional): Optional: Update the original filename of the file (default: no change).
- `type` (optional): Optional: Update the MIME type of the file (default: no change).
- `tags` (optional): Optional: Set or update tags associated with the file (default: no change, replaces existing tags if provided).
- `name` (optional): Optional: Rename the file (default: no change).

**Example Usage:**

```json
{
  "id": "file123",
  "favorite": true,
  "maxViews": 50,
  "tags": ["important", "report"]
}
```

### 8. delete_user_file

Remove a specific file from the Zipline server.

**Parameters:**

- `id` (required): The unique ID of the file to delete. Only use the ID, the filename does not work.

**Example Usage:**

```json
{
  "id": "file123"
}
```

### 9. remote_folder_manager

Manage folders on the Zipline server (supports listing, creating, editing, getting info, and deleting).

**Parameters:**

- `command` (required): Command to execute. Supported: LIST, ADD <name>, EDIT <id>, INFO <id>, DELETE <id>
- `name` (optional): Folder name (required for ADD command, optional for EDIT command)
- `isPublic` (optional): Optional: Whether the folder is public (default: false, for ADD and EDIT commands)
- `files` (optional): Optional: Array of file IDs to include in the folder (for ADD command, default: empty folder)
- `id` (optional): Optional: Folder ID (required for EDIT command, not used for other commands) - this is not the same as the folder name. Retrieve the ID first with the LIST or any other previous command
- `allowUploads` (optional): Optional: Whether to allow uploads to the folder (for EDIT command, default: no change)
- `fileId` (optional): Optional: File ID to add to the folder (for EDIT command). Retrieve the file ID first (default: no file added)

**Example Usage (LIST):**

```json
{
  "command": "LIST"
}
```

**Example Usage (ADD):**

```json
{
  "command": "ADD",
  "name": "My Documents",
  "isPublic": false
}
```

**Example Usage (EDIT):**

```json
{
  "command": "EDIT",
  "id": "folder123",
  "name": "Updated Folder Name",
  "allowUploads": true
}
```

## MCP Client Integration Patterns

### Pattern 1: Upload Workflow

```typescript
// 1. Validate file first
await mcpClient.callTool('validate_file', {
  filePath: '/path/to/document.pdf',
});

// 2. Upload to Zipline
const result = await mcpClient.callTool('upload_file_to_zipline', {
  filePath: '/path/to/document.pdf',
  format: 'random',
  maxViews: 100,
});

// 3. Result includes download URL
console.log(result.content[0].text);
```

### Pattern 2: File Search Workflow

```typescript
// 1. List files with filters
const files = await mcpClient.callTool('list_user_files', {
  page: 1,
  perpage: 20,
  searchQuery: 'report',
  sortBy: 'createdAt',
  order: 'desc',
});

// 2. Get details for a specific file
const fileDetails = await mcpClient.callTool('get_user_file', {
  id: 'file123',
});
```

### Pattern 3: Folder Management Workflow

```typescript
// 1. List existing folders
const folders = await mcpClient.callTool('remote_folder_manager', {
  command: 'LIST',
});

// 2. Create a new folder
const newFolder = await mcpClient.callTool('remote_folder_manager', {
  command: 'ADD',
  name: 'My Documents',
  isPublic: false,
});

// 3. Upload files to that folder
const upload = await mcpClient.callTool('upload_file_to_zipline', {
  filePath: '/path/to/file.txt',
  folder: newFolder.id, // Use folder ID from step 2
});
```

### Pattern 4: Temporary File Workflow

```typescript
// 1. Create a temporary file
await mcpClient.callTool('tmp_file_manager', {
  command: 'CREATE data.json',
  content: '{"key": "value"}',
});

// 2. Get the absolute path
const pathResult = await mcpClient.callTool('tmp_file_manager', {
  command: 'PATH data.json',
});

// 3. Use the path for other operations
await mcpClient.callTool('validate_file', {
  filePath: pathResult.content[0].text,
});

// 4. Read the file
await mcpClient.callTool('tmp_file_manager', {
  command: 'READ data.json',
});

// 5. Delete when done
await mcpClient.callTool('tmp_file_manager', {
  command: 'DELETE data.json',
});
```

## Enum Values Reference

### Format Types (upload_file_to_zipline)

- `random` - Random string (default)
- `uuid` - UUID v4
- `date` - Date-based
- `name` - Based on filename
- `random-words` - Random words (alias: gfycat)

### Filter Types (list_user_files)

- `dashboard` - Media and text files
- `all` - All files (default)
- `none` - No filter

### Sort Fields (list_user_files)

- `id` - File ID
- `createdAt` - Creation date (default)
- `updatedAt` - Update date
- `deletesAt` - Expiration date
- `name` - Filename
- `originalName` - Original filename
- `size` - File size
- `type` - File type
- `views` - View count
- `favorite` - Favorite status

### Sort Order (list_user_files)

- `asc` - Ascending
- `desc` - Descending (default)

### Search Fields (list_user_files)

- `name` - Filename (default)
- `originalName` - Original filename
- `type` - File type
- `tags` - Tags
- `id` - File ID

### Folder Manager Commands

- `LIST` - List all folders
- `ADD <name>` - Create new folder
- `EDIT <id>` - Edit existing folder
- `INFO <id>` - Get folder details
- `DELETE <id>` - Delete folder

## Error Handling

All tools follow consistent error handling patterns:

- File not found → Clear error message with suggestions
- Invalid parameters → Validation error explaining what's wrong
- Network failures → Retry suggestions and timeout recommendations
- Permission errors → Guidance on required permissions

Example error response:

```
❌ UPLOAD FAILED!

Error: File not found

Possible solutions:
• Check if the file exists and is accessible
• Verify the file path
• Ensure that the server https://files.etereo.cloud is reachable
• Confirm that the file type is supported
```

## Notes

- All file operations use a secure per-user sandbox
- File size and type restrictions apply
- Secret detection prevents uploading sensitive credentials
- Temporary files are automatically managed in user sandbox
- All operations support standard error handling and recovery guidance

## Additional Resources

- Source code: `src/index.ts`
- Schema validation tests: `src/tool-schema-validation.test.ts`
- Audit report: `_bmad-output/implementation-artifacts/1-5-tool-schema-audit-report.md`
