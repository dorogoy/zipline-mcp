---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-02b-vision-recovery
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-e-03-edit
editHistory:
  - date: '2026-02-07'
    editor: Antigravity
    description: Comprehensive refactoring for information density, API compliance, and NFR template adherence.
inputDocuments:
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/brief.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/context.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/product.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/tech.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/architecture.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/development_guidelines.md
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 5
classification:
  projectType: API backend
  domain: Developer infrastructure / File management and storage tool
  complexity: Medium
  projectContext: Brownfield migration
project_name: zipline-mcp
user_name: Sergio
date: '2026-02-07'
workflowType: prd
---

# Product Requirements Document - zipline-mcp

**Author:** Sergio
**Date:** 2026-02-07

## Executive Summary

The Zipline MCP Server is a bridge connecting Model Context Protocol (MCP) clients with Zipline-compatible file hosting services. It provides AI agents and developers with a standardized, secure, and automated way to manage the entire file lifecycle—from local sandboxing and validation to remote upload and management.

### Core Vision

The vision for Zipline-MCP is to become the definitive file management layer for MCP-enabled environments, ensuring that file operations are as fluid and secure as text-based AI interactions. By abstracting the complexities of Zipline's API into a suite of intelligent MCP tools, we enable agents to handle sophisticated file workflows without compromising security or requiring custom integration code.

### Target Users

- **AI Agents & LLMs:** Seeking automated ways to store, retrieve, and manage persistent file assets.
- **Developers:** Building MCP-integrated tools that require reliable file hosting and sharing capabilities.
- **DevOps/Ops:** Managing automated deployments or logs that need to be uploaded and shared securely via Zipline.

### Product Differentiators

- **Integrated Security Sandbox:** All file operations are performed within a controlled, temporary environment to prevent local system contamination.
- **Advanced Management Support:** Native support for Zipline features like expiration dates, view limits, and password protection directly through MCP tools.
- **Schema-Driven Validation:** Rigorous validation of file types and parameters using Zod to ensure reliable API interactions.

## Success Criteria

### User Success

**Primary Goal:** Developers can implement and integrate the Zipline MCP Server with their MCP clients within 30 minutes of reading the PRD.

**Specific User Outcomes:**

- Developers understand the complete feature set and can identify which tools solve their specific file management needs
- Clear examples for each MCP tool (upload, validate, tmp_file_manager, download_external_url, list_user_files, get_user_file, update_user_file, delete_user_file, remote_folder_manager)
- Developers can successfully configure authentication (ZIPLINE_TOKEN, ZIPLINE_ENDPOINT) and test basic file upload
- Understanding of security model and sandboxed temporary file management for safe operations
- Knowledge of advanced features: expiration dates, passwords, view limits, folder management
- Troubleshooting guidance for common integration issues

**Success "Aha!" Moment:** When a developer realizes they can manage files across their entire Zipline instance through a standardized MCP interface without writing custom API integration code.

### Business Success

**Migration Completion:** Successfully transition from scattered memory-bank documentation to structured BMAD Method PRDs

**Documentation Coverage:**

- 100% of existing MCP tools documented with parameters, return values, and examples
- All API endpoints and integration points clearly specified
- Security considerations and best practices documented
- Architecture and component relationships explained

**Timeline:** Complete migration "soon" - prioritize current state documentation over new feature development

**Quality Metrics:**

- Zero undocumented MCP tools or features
- Every tool has at least one practical implementation example
- Documentation enables self-service implementation without external support

### Technical Success

**PRD Structure Compliance:**

- Follows BMAD Method standards for PRD structure and completeness
- Proper frontmatter with workflow tracking and metadata
- Clear section organization (Executive Summary, Success Criteria, User Journeys, Features, etc.)

**Documentation Completeness:**

- **Core Tools:** upload_file_to_zipline, validate_file, tmp_file_manager, download_external_url
- **User File Management:** list_user_files, get_user_file, update_user_file, delete_user_file
- **Remote Folder Management:** remote_folder_manager (LIST, ADD, EDIT, INFO, DELETE commands)
- **Configuration:** Environment variables, authentication, security settings
- **Error Handling:** Common error scenarios and resolution steps

**Technical Accuracy:**

- All TypeScript interfaces and Zod schemas documented
- API endpoint specifications accurate and complete
- Security model (sandboxing, path validation, allowed extensions) clearly explained

### Measurable Outcomes

**Implementation Metrics:**

- Developers can configure and upload first file within 15 minutes of starting PRD review
- 90% reduction in integration support questions compared to memory-bank approach
- Average time from PRD review to working implementation: < 1 hour

**Documentation Metrics:**

- 12 MCP tools fully documented (current feature set)
- 100% parameter coverage across all tools
- 20+ practical code examples included
- Zero "TODO" or incomplete sections in PRD

**Migration Metrics:**

- All 6 existing memory-bank documents processed and integrated
- BMAD workflow completed through all 11 steps
- PRD published and ready for developer consumption

## Product Scope

### MVP - Minimum Viable Product

**Documentation of Current State:**

- ✅ Complete documentation of all 12 existing MCP tools
- ✅ Parameter specifications for every tool using Zod schemas
- ✅ Return value documentation with TypeScript interfaces
- ✅ Practical implementation examples for each tool
- ✅ Authentication and configuration guide (ZIPLINE_TOKEN, ZIPLINE_ENDPOINT)
- ✅ Security model explanation (sandboxing, allowed extensions, path validation)
- ✅ Architecture overview and component relationships
- ✅ Error handling and troubleshooting section
- ✅ Quick start guide for new developers

**Current Features to Document:**

- File upload with advanced options (expiration, password, view limits, folders)
- File validation before upload
- Sandboxed temporary file management (create, list, read, write, delete)
- Download external URLs into sandbox
- User file operations (list, search, get details, update properties, delete)
- Remote folder management (list, create, edit, get info, delete)

### Growth Features (Post-MVP)

**Enhanced Documentation:**

- Video tutorials for complex workflows
- Interactive API explorer or Postman collection
- Integration examples for popular MCP clients (Claude Desktop, etc.)
- Performance optimization guide for high-volume scenarios
- Advanced security configurations and best practices

**Community & Support:**

- Developer forum or Discord channel
- FAQ section based on real implementation questions
- Contribution guidelines for open source contributors
- Changelog and migration guides for version updates

**Tool Ecosystem:**

- IDE extensions for MCP tool discovery
- Debug tools for troubleshooting MCP communication
- Monitoring and analytics integration examples

### Vision (Future)

**Beyond Documentation:**

- SDK/wrapper libraries for popular programming languages
- Visual dashboard for monitoring Zipline MCP Server usage
- Automated testing framework for MCP tool integrations
- Plugin architecture for custom MCP tools
- Integration marketplace for third-party extensions

**Product Evolution:**

- Real-time file synchronization capabilities
- Collaborative file editing features
- Advanced search and metadata management
- Integration with cloud storage providers (S3, Google Drive, etc.)
- Enterprise features (teams, permissions, auditing)

## User Journeys

### Journey A: "Visual" the UI Agent (The "Bug Report" Flow)

**Opening Scene:** Visual, a specialized UI/UX agent, is running a regression test on a new dashboard. It detects a CSS alignment issue on mobile view.
**Rising Action:** Visual captures a screenshot of the offending element. To avoid local system clutter and ensure a clean environment, it uses the `tmp_file_manager` to save the image as `bug_report_dashboard_v2.png`. It then calls `validate_file` to ensure the image meets the team's hosting requirements.
**Climax:** Visual calls `upload_file_to_zipline`, setting the target folder to `/ui-bugs/dashboard-v2` and applying a 7-day expiration date, as the bug only needs review within the current sprint.
**Resolution:** Visual posts the generated Zipline URL directly into the GitHub PR comment. Stakeholders view the visual evidence immediately, and the temporary sandbox file is automatically cleaned up.

### Journey B: Sam the Developer (The "Secure Status Share" Flow)

**Opening Scene:** Sam is debugging an internal service and needs to share a small configuration snippet and a log screenshot with a remote teammate without exposing them on public channels.
**Rising Action:** Sam uses the MCP tool to write a small `.txt` status log and a `.png` screenshot to the secure sandbox.
**Climax:** Sam uploads both files to Zipline, applying a **password** and a **max views limit of 2** to ensure only the intended recipient can see the data before it becomes inaccessible.
**Resolution:** Sam shares the protected link. Once the teammate verifies the configuration, the files effectively vanish from public reach, maintaining Sam's security posture.

### Journey C: Jordan the Admin (The "Status Cleanup" Flow)

**Opening Scene:** Jordan, the project admin, needs to perform maintenance on the team's shared Zipline instance to clear out old build heartbeats and screenshots from previous months.
**Rising Action:** Jordan interacts with the `remote_folder_manager` using the `LIST` command to audit the `/build-status` and `/temp-screenshots` folders.
**Climax:** Jordan identifies dozens of obsolete small text files and images that are no longer relevant to current operations.
**Resolution:** Jordan executes a batch deletion using `delete_user_file` (orchestrated by an agent), restoring storage capacity and keeping the remote environment organized and performant.

### Journey D: The Automated Migration

**Opening Scene:** Jordan needs to migrate a set of legacy assets from an external cloud provider to the team's Zipline instance.
**Rising Action:** Jordan uses `download_external_url` (FR12) to pull images into the secure sandbox. Jordan then uses `get_user_file` (FR14) to verify if similar metadata already exists on the Zipline host to avoid duplicates.
**Climax:** Jordan executes `update_user_file` (FR15) to move the verified assets into a specific 'Production' folder and marks them as favorites.
**Resolution:** The migration is completed automatically with full metadata integrity, and Jordan receives a summary of the new resource identifiers.

### Journey Requirements Summary

- **Capability: Visual Verification:** Robust support for high-fidelity image handling (PNG/JPG) and path validation.
- **Capability: Ephemeral Sharing:** Strict enforcement of `expiration`, `password`, and `max_views` parameters for transient data.
- **Capability: Remote Organization:** Comprehensive folder management (LIST/ADD/EDIT/DELETE) to maintain host hygiene.
- **Capability: Secure Sandboxing:** Mandatory use of the temporary file manager for all inbound file operations before host upload.

## Domain-Specific Requirements

### Security & Privacy Constraints

- **Sandbox Isolation:** Absolute isolation between the MCP server's temporary storage and the host's sensitive directories.
- **Path Sanitization:** Mandatory normalization and strict validation of all user-provided paths to prevent directory traversal attacks.
- **Sensitive Data Handling:** Automatic masking of `ZIPLINE_TOKEN` in logs and a policy to reject uploads of files containing recognized secret patterns (e.g., `.env` files or hardcoded API keys).

### Technical Performance

- **Latency Target:** The "Sandbox Write + Zipline Upload" pipeline should complete in < 2 seconds for standard images (< 5MB).
- **Atomic Cleanup:** If an upload fails, the temporary sandbox file must be immediately purged to prevent "phantom" storage leaks.

### Data Governance Patterns

- **Ephemeral by Default:** The documentation and tool defaults should encourage the use of `expiration` dates for transient status logs and screenshots.
- **Immutable Snapshots:** Once a file is uploaded to Zipline, the resulting URL is treated as a static snapshot. Any updates require a new upload/URL generation to maintain a clear audit trail.

## Innovation & Novel Patterns

### Detected Innovation Areas

- **The "Double-Blind" Memory Pipeline:** A high-performance, performance-optimized ephemeral storage validation buffer that sits between the MCP client and the Zipline host. This "rethinks" file handling by ensuring zero disk footprint for standard screenshots and status logs while maintaining a mandatory security gate.
- **AI-Native File Lifecycle:** Integrating advanced Zipline features (expiration, view limits, passwords) as first-class, tool-level parameters, allowing agents to manage the "Status" of information as fluidly as the information itself.

### Market Context & Competitive Landscape

- **Status Quo:** Most MCP file tools perform direct disk operations or unvalidated API streams, exposing hosts to malformed data or accidental secret leaks.
- **Zipline-MCP Advantage:** Provides a professional-grade "Security Buffer" specifically optimized for the transient nature of AI agent workflows (screenshots, logs, status updates).

### Validation Methodology

- **Shadow Validation:** Validating binary streams in-memory before any external API calls are initiated.
- **Automated Lifecycle Audit:** Ensuring that 100% of temporary memory buffers are flushed immediately following successful upload or fatal error.
- **Memory Pressure Testing:** Validate server stability when handling multiple concurrent high-resolution screenshots within the performance-optimized ephemeral storage.

### Risk Mitigation

- **Performance Risk:** Mitigated by the **"Memory-First" Sandbox** (Performance-optimized ephemeral storage) for assets < 5MB to eliminate I/O overhead.
- **Security Risk:** Mitigated by Path Sanitization and Secret Masking (ZIPLINE_TOKEN).
- **Persistence Risk:** Mitigated by the "Ephemeral by Default" policy—transient data does not persist on the MCP server host, reducing the attack surface.
- **Crash Recovery:** Ephemeral cleanup policy—if a process crashes mid-upload, memory is cleared immediately, ensuring zero-footprint security at the cost of a required retry.

## Developer Tool Specific Requirements

### Tool & Endpoint Specifications

- **Tool Manifest:** Comprehensive documentation of all 12 MCP tools with strict Zod schema definitions for parameters and return types.
- **Standardized Response:** All tools return a consistent JSON structure `{ success: boolean, data?: any, error?: string }` to facilitate reliable agent parsing.

### Authentication & Security Model

- **Environment Configuration:** Support for `ZIPLINE_TOKEN` and `ZIPLINE_ENDPOINT` via standard MCP client configuration.
- **Auth Proxying:** The MCP server handles token orchestration and header injection, ensuring raw API keys are never exposed to the agent context during tool execution.

### Data Schemas & Validation

- **Zod Enforcement:** Upfront validation of all inputs (e.g., view limits, passwords, expiration strings) before proceeding to the performance-optimized ephemeral storage.
- **Allowed Extensions:** Configurable whitelist for file types, optimized for screenshots (PNG/JPG) and small status texts (TXT/JSON).

### Implementation Considerations

- **SDK Compliance:** Developed using the `@modelcontextprotocol/sdk` to ensure seamless integration with modern MCP clients (e.g., Claude Desktop, IDE extensions).
- **Error Translation:** Mapping of Zipline API HTTP errors to descriptive MCP error codes, allowing agents to provide actionable feedback or perform self-correction.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** **"Zero-Defect Trust MVP"** - Focusing on architectural integrity, security validation, and resolving critical functional bugs to establish a reliable foundation for AI-driven file management.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- Journey A: The "Bug Report" Flow (Visual Agent focus).
- Journey B: The "Secure Status Share" Flow (Dev Support focus).

**Must-Have Capabilities & Bug Fixes:**

- **Critical Fixes:** Resolved duplicate URL generation in `list_user_files` and full parameter visibility in MCP schemas.
- **The "Double-Blind" Pipeline:** High-performance performance-optimized ephemeral storage (< 5MB) with **mandatory pre-upload size validation**.
- **System Awareness:** Implementation of the host health status indicator and structured `ZiplineError` messaging (Auth, Network, Params).
- **Security:** Strict path sanitization, `ZIPLINE_TOKEN` masking, and configurable extension whitelisting.

### Post-MVP Features

**Phase 2 (Growth):**

- **Batch Operations:** Introduction of `upload_files_to_zipline` for multi-file workflows.
- **Folder Intelligence:** Auto-creation of folders via `createFolderIfNotExists` flag.
- **Performance Optimization:** Time-bound result caching for `list_user_files` (30s TTL) to reduce host overhead.
- **Developer Experience:** Code-level JSDoc improvements and a "Recipes" section in the README for common workflows (expiring shares, passwords).

**Phase 3 (Expansion):**

- **Text-Based Analytics:** `get_usage_stats` tool for storage and usage tracking (Text/JSON output).
- **Payload Optimization:** AI-assisted file compression for assets approaching the 5MB memory limit.
- **Structured Logging:** Detailed execution logs including duration tracking and operation metadata.

### Risk Mitigation Strategy

**Technical Risks:** Node.js memory mapping support variability. **Mitigation:** Fallback to secure disk-based `tmp` folder if performance-optimized ephemeral storage is unsupported.
**Operational Risks:** Inconsistent Zipline API behaviors. **Mitigation:** Idempotent normalization logic and robust health checks.

## Functional Requirements

### Secure File Ingest & Validation

- FR1: Ingest file uploads (Images/Text) via MCP tool calls.
- FR2: Validate file existence and MIME types before processing.
- FR3: Enforce strict file size limits (<5MB for ephemeral sandbox) before upload.
- FR4: Sanitize all file paths to prevent directory traversal.
- FR5: Mask sensitive environment tokens in all logs and outputs.
- FR6: Detect and reject uploads of files containing recognized secret patterns (e.g., `.env`, API keys).

### Ephemeral Sandbox Management

- FR7: Manage a performance-optimized ephemeral storage for file staging.
- FR8: Automatically purge sandbox contents upon completion or failure (Atomic Cleanup).
- FR9: Fallback to disk-based secure temporary storage if performance-optimized ephemeral storage is unavailable.

### Zipline Host Integration

- FR10: Upload files from the sandbox to Zipline (supporting single and Batch Uploads).
- FR11: Apply expiration dates, passwords, and view limits (maxViews) during upload.
- FR12: Organize uploads into specific remote folders.
- FR13: Download external URLs directly into the secure sandbox for subsequent upload.

### Remote File & Folder Management

- FR14: List and search files on Zipline with idempotent, absolute URLs.
- FR15: Retrieve detailed metadata for specific remote files via unique resource identifiers.
- FR16: Update properties (name, folder, favorite) of existing remote files.
- FR17: Perform Batch Actions (Move to folder, Delete) on multiple files.
- FR18: Manage remote folder structures (Create, Edit, Delete via Folder IDs).

### Reliability & Observability

- FR19: Verify host availability via the host health status indicator.
- FR20: Translate Zipline API HTTP errors into structured, agent-actionable error codes.
- FR21: Cache remote file lists and folder metadata (time-bound result caching).
- FR22: Provide text-based usage statistics (storage, file counts) via usage statistics endpoints.

### Developer Experience

- FR23: Expose its full toolset and parameter schemas to any standard MCP client.
- FR24: Provide comprehensive parameter documentation and usage examples through tool schemas.

## Error Handling & Technical Mapping

| HTTP Error | MCP Error String      | Context                                  |
| ---------- | --------------------- | ---------------------------------------- |
| 401        | `UNAUTHORIZED_ACCESS` | Invalid or missing ZIPLINE_TOKEN         |
| 403        | `FORBIDDEN_OPERATION` | Token lacks sufficient permissions       |
| 404        | `RESOURCE_NOT_FOUND`  | File, folder, or endpoint does not exist |
| 413        | `PAYLOAD_TOO_LARGE`   | File exceeds Zipline or sandbox limits   |
| 429        | `RATE_LIMIT_EXCEEDED` | Too many requests to the Zipline host    |

## Non-Functional Requirements

### Performance & Latency

| Criterion          | Metric                | Measurement Method                   | Context                              |
| ------------------ | --------------------- | ------------------------------------ | ------------------------------------ |
| Response Latency   | < 100ms               | Server-side execution logs           | Local tool logic (excluding network) |
| Upload Pipeline    | < 2 seconds           | End-to-end timer (Staging to Upload) | Standard screenshots (< 5MB)         |
| Concurrency        | 5 concurrent requests | Load testing logs                    | Concurrent upload operations         |
| Latency Monitoring | 100% monitoring       | Active telemetry                     | E2E pipeline performance             |

### Security & Data Integrity

| Criterion             | Metric          | Measurement Method                | Context                         |
| --------------------- | --------------- | --------------------------------- | ------------------------------- |
| Zero-Footprint        | 100% of buffers | Memory leak analysis / Unit tests | Buffer cleanup after completion |
| Credential Protection | 0 exposures     | Log audit / Grep on output        | Masking of ZIPLINE_TOKEN        |
| Input Sanitization    | 100% of paths   | Security audit / Unit tests       | Path normalization validation   |

### Reliability & Availability

| Criterion       | Metric             | Measurement Method           | Context                   |
| --------------- | ------------------ | ---------------------------- | ------------------------- |
| Idempotency     | 100% consistency   | Hash comparison of outputs   | Repeated URL generation   |
| Host Resilience | 100% error capture | Integration test (host down) | Handling Zipline downtime |
| Cache Integrity | < 30s TTL          | Cache timestamp verification | list_user_files caching   |

### Developer Experience (DX)

| Criterion           | Metric        | Measurement Method            | Context                        |
| ------------------- | ------------- | ----------------------------- | ------------------------------ |
| Schema Clarity      | 100% coverage | Schema validation tool        | Tool parameter descriptions    |
| Error Actionability | > 90%         | Manual audit of error strings | User/Agent resolution guidance |

### Rate Limiting & Throughput

| Criterion     | Metric         | Measurement Method          | Context               |
| ------------- | -------------- | --------------------------- | --------------------- |
| Rate Limiting | Max 50 req/min | API gateway/Rate limit logs | Per-client throughput |
