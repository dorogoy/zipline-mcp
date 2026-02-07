---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: '2026-02-07'
inputDocuments:
  - /home/sergio/Proyectos/utils/zipline-mcp/_bmad-output/planning-artifacts/prd.md
  - /home/sergio/Proyectos/utils/zipline-mcp/_bmad-output/planning-artifacts/architecture.md
project_name: zipline-mcp
user_name: Sergio
date: '2026-02-07'
workflowType: epics
projectContext: Brownfield migration (existing running code)
---

# zipline-mcp - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for zipline-mcp, decomposing the requirements from the PRD and Architecture requirements into implementable stories. This is a **brownfield migration** - the codebase already has running implementation that needs validation, documentation, and potential refactoring.

## Requirements Inventory

### Functional Requirements

FR1: Ingest file uploads (Images/Text) via MCP tool calls
FR2: Validate file existence and MIME types before processing
FR3: Enforce strict file size limits (<5MB for ephemeral sandbox) before upload
FR4: Sanitize all file paths to prevent directory traversal
FR5: Mask sensitive environment tokens in all logs and outputs
FR6: Detect and reject uploads of files containing recognized secret patterns (e.g., `.env`, API keys)
FR7: Manage a performance-optimized ephemeral storage for file staging
FR8: Automatically purge sandbox contents upon completion or failure (Atomic Cleanup)
FR9: Fallback to disk-based secure temporary storage if performance-optimized ephemeral storage is unavailable
FR10: Upload files from the sandbox to Zipline (supporting single and Batch Uploads)
FR11: Apply expiration dates, passwords, and view limits (maxViews) during upload
FR12: Organize uploads into specific remote folders
FR13: Download external URLs directly into the secure sandbox for subsequent upload
FR14: List and search files on Zipline with idempotent, absolute URLs
FR15: Retrieve detailed metadata for specific remote files via unique resource identifiers
FR16: Update properties (name, folder, favorite) of existing remote files
FR17: Perform Batch Actions (Move to folder, Delete) on multiple files
FR18: Manage remote folder structures (Create, Edit, Delete via Folder IDs)
FR19: Verify host availability via the host health status indicator
FR20: Translate Zipline API HTTP errors into structured, agent-actionable error codes
FR21: Cache remote file lists and folder metadata (time-bound result caching)
FR22: Provide text-based usage statistics (storage, file counts) via usage statistics endpoints
FR23: Expose its full toolset and parameter schemas to any standard MCP client
FR24: Provide comprehensive parameter documentation and usage examples through tool schemas

### NonFunctional Requirements

NFR1: Response Latency < 100ms for local tool logic (excluding network)
NFR2: Upload Pipeline < 2 seconds for standard screenshots (<5MB)
NFR3: Support 5 concurrent requests
NFR4: 100% latency monitoring via active telemetry
NFR5: 100% buffer cleanup after completion (Zero-Footprint)
NFR6: 0 exposures of ZIPLINE_TOKEN in logs (Credential Protection)
NFR7: 100% path normalization validation (Input Sanitization)
NFR8: 100% consistency for repeated URL generation (Idempotency)
NFR9: 100% error capture when host is down (Host Resilience)
NFR10: < 30s TTL for list_user_files caching (Cache Integrity)
NFR11: 100% coverage of tool parameter descriptions (Schema Clarity)
NFR12: > 90% of error strings provide resolution guidance (Error Actionability)
NFR13: Max 50 req/min per-client throughput

### Additional Requirements

- **Brownfield Context**: Existing running code - stories focus on validation, testing, and refactoring rather than greenfield implementation
- **Starter Template**: Official MCP TypeScript SDK already integrated (`@modelcontextprotocol/sdk`)
- **Build Tooling**: `tsc` for production, `tsx` for development, `Vitest` for testing
- **Staging Flow Pattern**: All file operations must follow Validate → Scan → Stage → Execute → Cleanup
- **Staging Gate**: No file content may reach `httpClient.ts` without `sandboxUtils.ts` processing
- **Logging Gate**: No data output without `utils/security.ts` masking
- **Implementation Priority**: SecurityUtility → SandboxManager refactor → ErrorMapper integration
- **Co-located Tests**: All tests use `*.test.ts` pattern alongside source files
- **Modular Structure**: Domain modules in `src/` (httpClient, sandboxUtils, userFiles, remoteFolders)
- **Utils Organization**: Cross-cutting concerns in `src/utils/` (security.ts, errorMapper.ts)

### FR Coverage Map

| FR   | Epic   | Description                              |
| ---- | ------ | ---------------------------------------- |
| FR1  | Epic 2 | Ingest file uploads via MCP tool calls   |
| FR2  | Epic 2 | Validate file existence and MIME types   |
| FR3  | Epic 2 | Enforce file size limits (<5MB)          |
| FR4  | Epic 1 | Sanitize all file paths                  |
| FR5  | Epic 1 | Mask sensitive tokens in logs/outputs    |
| FR6  | Epic 1 | Detect and reject secret patterns        |
| FR7  | Epic 2 | Manage ephemeral storage                 |
| FR8  | Epic 2 | Atomic cleanup on completion/failure     |
| FR9  | Epic 2 | Disk fallback for ephemeral storage      |
| FR10 | Epic 2 | Upload files (single and batch)          |
| FR11 | Epic 2 | Apply expiration, passwords, view limits |
| FR12 | Epic 2 | Organize uploads into folders            |
| FR13 | Epic 3 | Download external URLs to sandbox        |
| FR14 | Epic 4 | List/search files with idempotent URLs   |
| FR15 | Epic 4 | Retrieve detailed file metadata          |
| FR16 | Epic 4 | Update file properties                   |
| FR17 | Epic 4 | Batch actions (move, delete)             |
| FR18 | Epic 5 | Manage remote folder structures          |
| FR19 | Epic 6 | Host health status indicator             |
| FR20 | Epic 1 | Translate HTTP errors to MCP error codes |
| FR21 | Epic 6 | Cache file lists and folder metadata     |
| FR22 | Epic 6 | Usage statistics endpoints               |
| FR23 | Epic 1 | Expose full toolset and schemas          |
| FR24 | Epic 1 | Comprehensive parameter documentation    |

**Coverage:** 24/24 FRs mapped (100%)

## Epic List

### Epic 1: Foundation & Core Security

Developers can trust the MCP server is secure, properly configured, and exposes its full toolset correctly to any MCP client.

**FRs covered:** FR4, FR5, FR6, FR20, FR23, FR24

**Implementation Notes:** Architecture priority - SecurityUtility and ErrorMapper implementation first. Validates path sanitization, token masking, secret pattern detection, error translation, and full schema exposure.

---

### Epic 2: Secure File Upload Pipeline

AI agents can securely stage files in the sandbox and upload them to Zipline with advanced options (expiration, passwords, view limits, folder organization).

**FRs covered:** FR1, FR2, FR3, FR7, FR8, FR9, FR10, FR11, FR12

**Implementation Notes:** Validates the "Double-Blind" staging pipeline. Covers Journey A (Bug Report) & Journey B (Secure Status Share). Memory-first staging with disk fallback, atomic cleanup.

---

### Epic 3: External Content Integration

Agents can download external URLs directly into the secure sandbox for subsequent upload to Zipline.

**FRs covered:** FR13

**Implementation Notes:** Enables Journey D (Automated Migration) first phase. Downloaded content enters standard validation pipeline.

---

### Epic 4: Remote File Management

Agents can list, search, view details, update properties, and perform batch operations on files stored in Zipline.

**FRs covered:** FR14, FR15, FR16, FR17

**Implementation Notes:** Enables Journey C (Status Cleanup) & Journey D (Automated Migration). Validates idempotency fix for duplicate URL generation.

---

### Epic 5: Remote Folder Management

Users can organize their Zipline content by creating, editing, and managing folder structures.

**FRs covered:** FR18

**Implementation Notes:** Completes Journey C (Admin "Status Cleanup" flow). Folder CRUD via remote_folder_manager (LIST, ADD, EDIT, INFO, DELETE commands).

---

### Epic 6: Reliability & Observability

Developers can monitor system health, rely on intelligent caching, and access usage statistics.

**FRs covered:** FR19, FR21, FR22

**Implementation Notes:** Validates existing health check implementation. Caching with <30s TTL. Usage statistics for storage and file counts.

---

## Epic Dependencies

```
Epic 1 (Foundation) ──► Epic 2 (Upload) ──► Epic 3 (External URLs)
                                       │
                                       └──► Epic 4 (File Mgmt) ──► Epic 5 (Folders)
                                                              │
                                                              └──► Epic 6 (Observability)
```

Each epic is **standalone** - delivers complete functionality for its domain. Later epics build upon earlier ones but don't require future epics to function.

---

## Epic 1: Foundation & Core Security

Developers can trust the MCP server is secure, properly configured, and exposes its full toolset correctly to any MCP client.

### Story 1.1: Implement Path Sanitization Utility

As a **developer integrating with the MCP server**,
I want **all file paths to be sanitized and validated before processing**,
So that **directory traversal attacks are prevented and my system remains secure**.

**Acceptance Criteria:**

**Given** a file path containing `../` sequences
**When** the path is processed by the sanitization utility
**Then** the path is normalized and validated to prevent escape from allowed directories
**And** an error is returned if the path attempts to escape the sandbox

**Given** a file path with mixed separators (e.g., `foo\bar/baz`)
**When** the path is processed
**Then** separators are normalized to the OS-appropriate format

**Given** a valid path within the allowed sandbox
**When** the path is processed
**Then** the normalized absolute path is returned without error

**FRs addressed:** FR4

---

### Story 1.2: Implement Token Masking Security Utility

As a **developer reviewing logs or error messages**,
I want **all sensitive tokens (ZIPLINE_TOKEN) to be masked in outputs**,
So that **credentials are never accidentally exposed in logs or responses**.

**Acceptance Criteria:**

**Given** any string containing `ZIPLINE_TOKEN` value
**When** the string is passed through the security utility
**Then** the token value is replaced with `[REDACTED]` or similar mask

**Given** log output or MCP error responses
**When** they are generated by any component
**Then** they MUST pass through the masking utility before output

**Given** multiple occurrences of sensitive data in a string
**When** the masking utility processes it
**Then** ALL occurrences are masked

**FRs addressed:** FR5
**NFRs addressed:** NFR6 (0 exposures)

---

### Story 1.3: Implement Secret Pattern Detection

As a **developer uploading files through the MCP server**,
I want **files containing secret patterns to be rejected before upload**,
So that **I don't accidentally expose API keys, .env files, or credentials**.

**Acceptance Criteria:**

**Given** a file with `.env` extension
**When** validation is attempted
**Then** the file is rejected with a clear error message

**Given** a file containing patterns like `API_KEY=`, `SECRET=`, `PASSWORD=`
**When** the file content is scanned
**Then** the upload is rejected with identification of the secret pattern type

**Given** a legitimate file (e.g., `.png`, `.txt` with no secrets)
**When** scanned for secret patterns
**Then** the file passes validation and proceeds to staging

**FRs addressed:** FR6

---

### Story 1.4: Implement HTTP Error to MCP Error Code Mapping

As an **AI agent consuming MCP tool responses**,
I want **Zipline API errors translated to structured, actionable MCP error codes**,
So that **I can programmatically handle errors and provide resolution guidance**.

**Acceptance Criteria:**

**Given** a Zipline API response with HTTP 401
**When** the error is processed by the error mapper
**Then** the MCP error code `UNAUTHORIZED_ACCESS` is returned with resolution guidance

**Given** a Zipline API response with HTTP 404
**When** processed
**Then** `RESOURCE_NOT_FOUND` is returned

**Given** a Zipline API response with HTTP 413
**When** processed
**Then** `PAYLOAD_TOO_LARGE` is returned

**Given** a Zipline API response with HTTP 429
**When** processed
**Then** `RATE_LIMIT_EXCEEDED` is returned

**Given** any unmapped HTTP error
**When** processed
**Then** `INTERNAL_ZIPLINE_ERROR` is returned with the original status code

**FRs addressed:** FR20
**NFRs addressed:** NFR12 (>90% actionable errors)

---

### Story 1.5: Validate Full Toolset and Schema Exposure

As a **developer connecting an MCP client to the server**,
I want **all 12 MCP tools to be properly exposed with complete parameter schemas**,
So that **I can discover and use all capabilities without external documentation**.

**Acceptance Criteria:**

**Given** an MCP client connecting to the server
**When** it requests the tool list
**Then** all 12 tools are returned with their Zod schemas

**Given** each tool schema
**When** inspected
**Then** all parameters have descriptions explaining their purpose

**Given** a tool with optional parameters
**When** the schema is inspected
**Then** defaults and constraints are clearly documented in the schema

**FRs addressed:** FR23, FR24
**NFRs addressed:** NFR11 (100% schema coverage)

---

## Epic 2: Secure File Upload Pipeline

AI agents can securely stage files in the sandbox and upload them to Zipline with advanced options (expiration, passwords, view limits, folder organization).

### Story 2.1: Implement File Ingest via MCP Tool Calls

As an **AI agent**,
I want **to submit files (images/text) through MCP tool calls**,
So that **I can programmatically upload content to Zipline**.

**Acceptance Criteria:**

**Given** a valid file path provided to the upload tool
**When** the tool is invoked
**Then** the file content is read and prepared for staging

**Given** image files (PNG, JPG) or text files (TXT, JSON)
**When** submitted via the MCP tool
**Then** they are accepted for processing

**Given** a file path that does not exist
**When** the tool is invoked
**Then** a clear error is returned indicating the file was not found

**FRs addressed:** FR1

---

### Story 2.2: Implement MIME Type and File Existence Validation

As a **developer**,
I want **file existence and MIME types validated before processing**,
So that **only valid, supported files enter the upload pipeline**.

**Acceptance Criteria:**

**Given** a file submitted for upload
**When** validation runs
**Then** the file's existence is confirmed before proceeding

**Given** a file with an allowed MIME type (image/png, image/jpeg, text/plain, application/json)
**When** validated
**Then** the file proceeds to the next stage

**Given** a file with a disallowed MIME type
**When** validated
**Then** the file is rejected with a clear error identifying the unsupported type

**Given** the `validate_file` tool
**When** invoked independently
**Then** it returns validation status without performing upload

**FRs addressed:** FR2

---

### Story 2.3: Enforce File Size Limits for Sandbox

As a **system administrator**,
I want **strict file size limits (<5MB) enforced before sandbox staging**,
So that **memory resources are protected and performance remains optimal**.

**Acceptance Criteria:**

**Given** a file smaller than 5MB
**When** submitted for upload
**Then** the file is accepted for memory-based staging

**Given** a file equal to or larger than 5MB
**When** submitted for upload
**Then** the file is routed to disk-based fallback staging
**Or** rejected with `PAYLOAD_TOO_LARGE` if disk staging is unavailable

**Given** any file submission
**When** size validation runs
**Then** it occurs BEFORE any staging operation begins

**FRs addressed:** FR3

---

### Story 2.4: Implement Memory-First Ephemeral Storage

As an **AI agent**,
I want **files staged in memory-first ephemeral storage**,
So that **upload operations are fast and leave zero disk footprint**.

**Acceptance Criteria:**

**Given** a valid file under 5MB
**When** staging is initiated
**Then** the file content is held in a Node.js Buffer

**Given** staged content in memory
**When** the upload operation completes (success or failure)
**Then** the buffer is immediately cleared (atomic cleanup)

**Given** system memory pressure
**When** staging is attempted
**Then** the system gracefully falls back to disk staging

**FRs addressed:** FR7
**NFRs addressed:** NFR5 (100% buffer cleanup)

---

### Story 2.5: Implement Disk-Based Fallback Staging

As a **system**,
I want **disk-based secure temporary storage available as fallback**,
So that **large files or memory-constrained situations are handled gracefully**.

**Acceptance Criteria:**

**Given** a file larger than 5MB
**When** staging is requested
**Then** the file is written to a secure temp directory with permission `0o700`

**Given** memory allocation failure during Buffer staging
**When** detected
**Then** the system automatically falls back to disk staging

**Given** disk-staged content
**When** the operation completes
**Then** the temporary file is immediately unlinked (atomic cleanup)

**FRs addressed:** FR9
**NFRs addressed:** NFR5 (100% buffer cleanup)

---

### Story 2.6: Implement Atomic Cleanup on Completion or Failure

As a **security-conscious developer**,
I want **all sandbox contents purged automatically after operations**,
So that **no sensitive data persists beyond the operation lifecycle**.

**Acceptance Criteria:**

**Given** a successful upload operation
**When** the operation completes
**Then** all associated buffers/temp files are immediately purged

**Given** a failed upload operation
**When** an error occurs at any stage
**Then** all associated buffers/temp files are immediately purged

**Given** a server crash or unexpected termination
**When** the process restarts
**Then** any orphaned temp files are cleaned up on initialization

**FRs addressed:** FR8
**NFRs addressed:** NFR5 (100% buffer cleanup)

---

### Story 2.7: Implement Single File Upload to Zipline

As an **AI agent**,
I want **to upload a single file from the sandbox to Zipline**,
So that **I can persist files to the remote host and receive a shareable URL**.

**Acceptance Criteria:**

**Given** a validated, staged file
**When** `upload_file_to_zipline` is called
**Then** the file is uploaded to Zipline and a URL is returned

**Given** a successful upload
**When** the response is returned
**Then** it includes `{ success: true, data: { url: "...", id: "..." } }`

**Given** a Zipline API error during upload
**When** the error is caught
**Then** it is translated to an MCP error code and the sandbox is cleaned

**FRs addressed:** FR10 (single upload)
**NFRs addressed:** NFR2 (<2s upload pipeline)

---

### Story 2.8: Implement Upload with Expiration, Password, and View Limits

As a **developer sharing sensitive content**,
I want **to set expiration dates, passwords, and view limits on uploads**,
So that **I can control access and lifecycle of shared files**.

**Acceptance Criteria:**

**Given** an upload request with `expiration` parameter (e.g., "7d", "24h")
**When** uploaded to Zipline
**Then** the file is configured to expire after the specified duration

**Given** an upload request with `password` parameter
**When** uploaded
**Then** the file requires the password to view/download

**Given** an upload request with `maxViews` parameter
**When** uploaded
**Then** the file becomes inaccessible after the specified number of views

**Given** multiple options combined (expiration + password + maxViews)
**When** uploaded
**Then** all options are applied correctly

**FRs addressed:** FR11

---

### Story 2.9: Implement Upload Organization into Folders

As a **developer organizing content**,
I want **to specify a target folder during upload**,
So that **my files are automatically organized in the Zipline host**.

**Acceptance Criteria:**

**Given** an upload request with `folder` parameter (e.g., "/ui-bugs/dashboard-v2")
**When** uploaded to Zipline
**Then** the file is placed in the specified folder

**Given** a folder path that doesn't exist
**When** upload is attempted
**Then** an appropriate error is returned (folder creation is Epic 5)

**Given** no folder parameter specified
**When** uploaded
**Then** the file is placed in the user's default/root location

**FRs addressed:** FR12

---

## Epic 3: External Content Integration

Agents can download external URLs directly into the secure sandbox for subsequent upload to Zipline.

### Story 3.1: Implement External URL Download to Sandbox

As an **AI agent performing content migration**,
I want **to download files from external URLs directly into the secure sandbox**,
So that **I can stage remote content for validation and subsequent upload to Zipline**.

**Acceptance Criteria:**

**Given** a valid external URL (HTTP/HTTPS)
**When** `download_external_url` is called
**Then** the file is downloaded and staged in the sandbox

**Given** a successful download
**When** the file is staged
**Then** the response includes the sandbox file path and detected MIME type

**Given** an external URL that returns a 404 or other error
**When** download is attempted
**Then** a clear error is returned with the HTTP status code

**Given** an external URL with an invalid protocol (e.g., `ftp://`, `file://`)
**When** download is attempted
**Then** the request is rejected with an error indicating unsupported protocol

**FRs addressed:** FR13

---

### Story 3.2: Validate Downloaded Content Through Standard Pipeline

As a **security-conscious developer**,
I want **downloaded external content to pass through all validation gates**,
So that **malicious or invalid content cannot bypass security checks**.

**Acceptance Criteria:**

**Given** content downloaded from an external URL
**When** staged in the sandbox
**Then** it is subject to MIME type validation (FR2)

**Given** downloaded content
**When** staged
**Then** it is subject to file size limits (FR3)

**Given** downloaded content
**When** staged
**Then** it is subject to secret pattern detection (FR6)

**Given** downloaded content that fails any validation
**When** validation completes
**Then** the sandbox file is immediately purged and an error is returned

**FRs addressed:** FR13 (integration with FR2, FR3, FR6)

---

### Story 3.3: Handle Download Timeouts and Large Files

As a **system**,
I want **proper timeout handling and size limits for external downloads**,
So that **the server is protected from slow or oversized external resources**.

**Acceptance Criteria:**

**Given** an external URL that responds slowly
**When** download exceeds the configured timeout (e.g., 30 seconds)
**Then** the download is aborted and an error is returned

**Given** an external URL serving a file larger than 5MB
**When** download detects the file size (via Content-Length or streaming)
**Then** the download is aborted and routed to disk fallback or rejected

**Given** an external URL with no Content-Length header
**When** streaming download
**Then** size is monitored incrementally and aborted if limit is exceeded

**FRs addressed:** FR13 (robustness)

---

## Epic 4: Remote File Management

Agents can list, search, view details, update properties, and perform batch operations on files stored in Zipline.

### Story 4.1: Implement File Listing with Idempotent URLs

As an **AI agent managing remote files**,
I want **to list files on Zipline with consistent, absolute URLs**,
So that **I can reliably reference and manage uploaded content**.

**Acceptance Criteria:**

**Given** a request to `list_user_files`
**When** the tool is invoked
**Then** a list of files with their metadata is returned

**Given** the same list request executed multiple times
**When** responses are compared
**Then** the same files return identical, absolute URLs (idempotency)

**Given** a large file collection
**When** listing is requested
**Then** pagination parameters are supported (limit, offset)

**Given** no files exist for the user
**When** listing is requested
**Then** an empty array is returned with success status

**FRs addressed:** FR14
**NFRs addressed:** NFR8 (100% idempotency)

---

### Story 4.2: Implement File Search Functionality

As an **AI agent searching for specific content**,
I want **to search files by name, type, or other criteria**,
So that **I can quickly locate specific files without listing everything**.

**Acceptance Criteria:**

**Given** a search query with filename pattern
**When** `list_user_files` is called with search parameters
**Then** only matching files are returned

**Given** a search query with file type filter
**When** search is executed
**Then** results are filtered by MIME type

**Given** a search query with no matches
**When** search is executed
**Then** an empty array is returned with success status

**FRs addressed:** FR14 (search aspect)

---

### Story 4.3: Retrieve Detailed File Metadata

As an **AI agent inspecting file properties**,
I want **to retrieve detailed metadata for a specific file**,
So that **I can make informed decisions about file management**.

**Acceptance Criteria:**

**Given** a valid file ID
**When** `get_user_file` is called
**Then** detailed metadata is returned (name, size, MIME type, upload date, URL, folder, views, etc.)

**Given** a file ID that doesn't exist
**When** `get_user_file` is called
**Then** `RESOURCE_NOT_FOUND` error is returned

**Given** a file with expiration or view limits set
**When** metadata is retrieved
**Then** the expiration date and remaining views are included

**FRs addressed:** FR15

---

### Story 4.4: Update File Properties

As a **developer managing uploaded content**,
I want **to update properties of existing files (name, folder, favorite)**,
So that **I can reorganize and manage content without re-uploading**.

**Acceptance Criteria:**

**Given** a valid file ID and new name
**When** `update_user_file` is called
**Then** the file is renamed and success is returned

**Given** a valid file ID and new folder ID
**When** `update_user_file` is called
**Then** the file is moved to the new folder

**Given** a valid file ID and favorite flag
**When** `update_user_file` is called
**Then** the file's favorite status is updated

**Given** multiple properties in a single update
**When** `update_user_file` is called
**Then** all properties are updated atomically

**Given** an invalid file ID
**When** `update_user_file` is called
**Then** `RESOURCE_NOT_FOUND` error is returned

**FRs addressed:** FR16

---

### Story 4.5: Implement Single File Deletion

As an **admin cleaning up obsolete content**,
I want **to delete individual files from Zipline**,
So that **I can remove outdated or unnecessary content**.

**Acceptance Criteria:**

**Given** a valid file ID
**When** `delete_user_file` is called
**Then** the file is permanently deleted and success is returned

**Given** an invalid file ID
**When** `delete_user_file` is called
**Then** `RESOURCE_NOT_FOUND` error is returned

**Given** a successful deletion
**When** the file URL is accessed
**Then** the file is no longer available

**FRs addressed:** FR17 (single delete)

---

### Story 4.6: Implement Batch File Operations

As an **admin performing bulk management**,
I want **to perform batch operations (move, delete) on multiple files**,
So that **I can efficiently manage large numbers of files**.

**Acceptance Criteria:**

**Given** an array of file IDs and a target folder
**When** batch move is requested
**Then** all files are moved to the target folder

**Given** an array of file IDs
**When** batch delete is requested
**Then** all files are permanently deleted

**Given** a batch operation with some invalid file IDs
**When** the operation is executed
**Then** valid operations succeed and invalid IDs are reported in the response

**Given** an empty array of file IDs
**When** batch operation is requested
**Then** an appropriate error or no-op response is returned

**FRs addressed:** FR17 (batch operations)

---

## Epic 5: Remote Folder Management

Users can organize their Zipline content by creating, editing, and managing folder structures.

### Story 5.1: Implement Folder Listing

As an **admin organizing content**,
I want **to list all folders in my Zipline instance**,
So that **I can understand the current folder structure and plan organization**.

**Acceptance Criteria:**

**Given** a request to `remote_folder_manager` with `LIST` command
**When** the tool is invoked
**Then** all folders are returned with their IDs and names

**Given** a nested folder structure
**When** listing is requested
**Then** the hierarchy or parent relationships are visible

**Given** no folders exist
**When** listing is requested
**Then** an empty array is returned with success status

**FRs addressed:** FR18 (LIST command)

---

### Story 5.2: Implement Folder Creation

As an **admin setting up organization**,
I want **to create new folders in Zipline**,
So that **I can organize uploaded content into logical categories**.

**Acceptance Criteria:**

**Given** a valid folder name
**When** `remote_folder_manager` with `ADD` command is called
**Then** a new folder is created and its ID is returned

**Given** a folder name that already exists
**When** creation is attempted
**Then** an appropriate error is returned or the existing folder ID is returned

**Given** a folder name with invalid characters
**When** creation is attempted
**Then** an error is returned indicating invalid folder name

**FRs addressed:** FR18 (ADD command)

---

### Story 5.3: Retrieve Folder Information

As an **admin inspecting folders**,
I want **to retrieve detailed information about a specific folder**,
So that **I can see folder contents and properties**.

**Acceptance Criteria:**

**Given** a valid folder ID
**When** `remote_folder_manager` with `INFO` command is called
**Then** folder details are returned (name, file count, creation date, etc.)

**Given** an invalid folder ID
**When** `INFO` is requested
**Then** `RESOURCE_NOT_FOUND` error is returned

**FRs addressed:** FR18 (INFO command)

---

### Story 5.4: Implement Folder Editing

As an **admin managing organization**,
I want **to rename or modify existing folders**,
So that **I can maintain a clean and relevant folder structure**.

**Acceptance Criteria:**

**Given** a valid folder ID and new name
**When** `remote_folder_manager` with `EDIT` command is called
**Then** the folder is renamed and success is returned

**Given** an invalid folder ID
**When** `EDIT` is requested
**Then** `RESOURCE_NOT_FOUND` error is returned

**Given** a new name that conflicts with existing folder
**When** `EDIT` is requested
**Then** an appropriate error is returned

**FRs addressed:** FR18 (EDIT command)

---

### Story 5.5: Implement Folder Deletion

As an **admin cleaning up structure**,
I want **to delete folders from Zipline**,
So that **I can remove obsolete organizational structures**.

**Acceptance Criteria:**

**Given** a valid folder ID with no files
**When** `remote_folder_manager` with `DELETE` command is called
**Then** the folder is deleted and success is returned

**Given** a folder ID containing files
**When** `DELETE` is requested
**Then** an error is returned indicating folder is not empty (or files are moved/deleted based on API behavior)

**Given** an invalid folder ID
**When** `DELETE` is requested
**Then** `RESOURCE_NOT_FOUND` error is returned

**FRs addressed:** FR18 (DELETE command)

---

## Epic 6: Reliability & Observability

Developers can monitor system health, rely on intelligent caching, and access usage statistics.

### Story 6.1: Implement Host Health Status Indicator

As a **developer integrating with Zipline**,
I want **to verify Zipline host availability before performing operations**,
So that **I can provide meaningful feedback when the host is unavailable**.

**Acceptance Criteria:**

**Given** the Zipline host is available and responding
**When** a health check is performed
**Then** `{ success: true, status: "healthy" }` is returned

**Given** the Zipline host is unavailable or timing out
**When** a health check is performed
**Then** `{ success: false, error: "HOST_UNAVAILABLE" }` is returned with details

**Given** the Zipline host returns authentication errors
**When** a health check is performed
**Then** the authentication issue is distinguished from connectivity issues

**Given** any health check request
**When** the host is down
**Then** the error is captured and translated (100% error capture)

**FRs addressed:** FR19
**NFRs addressed:** NFR9 (100% error capture)

---

### Story 6.2: Implement Time-Bound Result Caching for File Lists

As an **AI agent making frequent file list requests**,
I want **file list results to be cached with a short TTL**,
So that **performance is improved without sacrificing data freshness**.

**Acceptance Criteria:**

**Given** a `list_user_files` request
**When** no cached result exists
**Then** the request is made to Zipline and the result is cached

**Given** a `list_user_files` request within 30 seconds of a previous request
**When** the cache is valid
**Then** the cached result is returned without hitting Zipline

**Given** a `list_user_files` request after 30 seconds
**When** the cache has expired
**Then** a fresh request is made to Zipline and the cache is updated

**Given** a file operation (upload, delete, update)
**When** it completes successfully
**Then** the cache is invalidated to ensure consistency

**FRs addressed:** FR21
**NFRs addressed:** NFR10 (<30s TTL)

---

### Story 6.3: Implement Folder Metadata Caching

As a **system optimizing performance**,
I want **folder metadata to be cached with appropriate TTL**,
So that **folder operations are fast without excessive API calls**.

**Acceptance Criteria:**

**Given** a folder list or info request
**When** no cached result exists
**Then** the request is made to Zipline and cached

**Given** a folder request within the cache TTL
**When** cache is valid
**Then** cached result is returned

**Given** a folder modification (create, edit, delete)
**When** it completes successfully
**Then** the folder cache is invalidated

**FRs addressed:** FR21 (folder metadata aspect)

---

### Story 6.4: Implement Usage Statistics Endpoint

As a **developer monitoring storage usage**,
I want **to retrieve usage statistics (storage used, file counts)**,
So that **I can monitor and manage my Zipline instance capacity**.

**Acceptance Criteria:**

**Given** a request for usage statistics
**When** the tool is invoked
**Then** storage used (bytes), total files, and quota information is returned

**Given** the statistics request
**When** successful
**Then** the response is in a consistent JSON format suitable for agent parsing

**Given** usage statistics unavailable (API limitation)
**When** requested
**Then** a clear error indicates the feature is not available on this Zipline version

**FRs addressed:** FR22
