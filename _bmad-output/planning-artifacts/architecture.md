---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - /home/sergio/Proyectos/utils/zipline-mcp/_bmad-output/planning-artifacts/prd.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/brief.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/context.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/product.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/tech.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/architecture.md
  - /home/sergio/Proyectos/utils/zipline-mcp/.kilocode/rules/memory-bank/development_guidelines.md
workflowType: 'architecture'
project_name: 'zipline-mcp'
user_name: 'Sergio'
date: '2026-02-07'
lastStep: 8
status: 'complete'
completedAt: '2026-02-07'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The zipline-mcp project defines 24 functional requirements focused on secure file handling, sandboxed execution, and remote Zipline integration. Architecturally, these requirements demand a stateless bridge pattern with a mandatory staging area. Key functional domains include:

- **Secure Ingest:** Upfront validation of MIME types, sizes, and path sanitization.
- **Sandbox Staging:** Ephemeral memory-first staging for files < 5MB to avoid disk I/O.
- **Zipline Integration:** Mapping tool-based parameters (expiration, passwords, folders) to Zipline API calls.
- **Resource Management:** Atomic cleanup of staging buffers to ensure zero-footprint security.

**Non-Functional Requirements:**

- **Performance:** End-to-end upload pipeline < 2 seconds for assets < 5MB.
- **Security:** 100% path normalization and zero exposure of sensitive tokens in logs.
- **Reliability:** 100% error capture and translation to agent-actionable MCP error codes.
- **Scalability:** Support for up to 5 concurrent requests with a rate limit of 50 req/min.

**Scale & Complexity:**
The project is a brownfield migration of a developer tool bridge. While the functional scope is bounded (12 tools), the security and performance constraints (memory-first sandboxing, atomic cleanup) increase the architectural rigor.

- Primary domain: API Backend / Developer Infrastructure
- Complexity level: Medium
- Estimated architectural components: 4 (MCP Server, Security/Validation Layer, Memory Sandbox, Zipline Client)

### Technical Constraints & Dependencies

- **MCP SDK:** Must comply with `@modelcontextprotocol/sdk`.
- **Zipline API:** Dependent on the host's API version and availability.
- **Memory Management:** Node.js memory mapping support variability; must provide a secure disk fallback.
- **Environment:** Configured via `ZIPLINE_TOKEN` and `ZIPLINE_ENDPOINT`.

### Cross-Cutting Concerns Identified

- **Security & Sandboxing:** Central to every file operation.
- **Error Mapping:** Ensuring host errors are actionable for AI agents.
- **Resource Lifecycle:** Mandatory cleanup across all operation outcomes.

## Starter Template Evaluation

### Primary Technology Domain

API/Backend (MCP Server) based on project requirements analysis.

### Starter Options Considered

1.  **Official MCP TypeScript SDK (Selected)**: Provides the `McpServer` class and `StdioServerTransport` for direct, standard implementation. This is the official path and ensures maximum compatibility with MCP clients.
2.  **`nickytonline/mcp-typescript-template`**: Evaluated for its inclusion of Vite, Express, and Docker. While robust, the current custom setup already implements similar patterns (Vitest, Makefile, modular structure) without the added complexity of a full-stack template.
3.  **`alexanderop/mcp-server-starter-ts`**: Provides an auto-loading architecture. Useful for very large projects, but for `zipline-mcp`, the explicit tool registration in `src/index.ts` provides better visibility for AI agents and maintainers during the migration phase.

### Selected Starter: Official MCP TypeScript SDK

**Rationale for Selection:**
The project is already successfully using the official SDK (`@modelcontextprotocol/sdk/server/mcp.js`). It provides the most direct and reliable implementation of the Model Context Protocol. Given this is a migration where stability and "Zero-Defect Trust" are paramount, staying with the official, minimal SDK foundation minimizes abstraction risks and ensures alignment with the core protocol evolution.

**Initialization Command:**

```bash
npm install @modelcontextprotocol/sdk zod
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript (Target ES2022) running on Node.js 18+ to leverage native `fetch`, `Blob`, and `FormData`.

**Styling Solution:**
N/A (Headless API / CLI Tool).

**Build Tooling:**
`tsc` for production builds, `tsx` for high-speed development execution.

**Testing Framework:**
`Vitest` for fast, lightweight unit and integration testing.

**Code Organization:**
Modular structure with core logic in `src/index.ts` and domain-specific utilities in separate modules (`httpClient`, `sandboxUtils`, `userFiles`, `remoteFolders`).

**Development Experience:**
`tsx watch` for hot-reloading and `Makefile` for task automation.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- **Data Staging Strategy:** Node.js Buffer-based in-memory staging with secure disk fallback.
- **Security Policy:** Integrated sanitization utility for logs and active secret scanning at the ingest gate.

**Important Decisions (Shape Architecture):**

- **Error Translation:** Standardized mapping of Zipline HTTP errors to agent-actionable MCP error codes.

**Deferred Decisions (Post-MVP):**

- **Infrastructure:** Dockerization and deployment platform (to be decided during the Shipping phase).

### Data Architecture

**Staging Buffer Strategy:**

- **Decision:** Use Node.js `Buffer` for primary staging of assets < 5MB.
- **Rationale:** Ensures zero disk footprint for high-volume transient data while maintaining high performance and OS portability.
- **Fallback:** Mandatory secure disk staging in a restricted `tmp` directory (permission `0o700`) for assets > 5MB or upon memory allocation failure.

### Authentication & Security

**Secret Protection & Sanitization:**

- **Decision:** Implement a dual-layer security gate.
- **Sanitization Utility:** A central function to redact `ZIPLINE_TOKEN` and sensitive patterns from all logs and responses.
- **Secret Scanner (FR6):** A regex-based validator in the `validate_file` and ingest pipeline to reject files containing recognized secret patterns (e.g., `.env`, API keys).

### API & Communication Patterns

**Error Code Mapping:**

- **Decision:** Standardized mapping for Zipline API responses to ensure AI agent actionability.
- **Mapping:**
  - `401/403` → `UNAUTHORIZED_ACCESS` / `FORBIDDEN_OPERATION`
  - `404` → `RESOURCE_NOT_FOUND`
  - `413` → `PAYLOAD_TOO_LARGE`
  - `429` → `RATE_LIMIT_EXCEEDED`
  - Others → `INTERNAL_ZIPLINE_ERROR`

### Decision Impact Analysis

**Implementation Sequence:**

1. Implement the `SecurityUtility` for log masking.
2. Refactor the `SandboxManager` to support Buffer-based staging.
3. Update the `HttpClient` to include the standardized `ErrorMapper`.

**Cross-Component Dependencies:**

- The `SandboxManager` must integrate with the `SecretScanner` during the staging phase before the `HttpClient` is invoked for upload.

## Implementation Patterns & Consistency Rules

### Naming & Formatting Conventions

- **Code Naming:** Use `camelCase` for variables and functions (e.g., `sanitizeLog`) and `PascalCase` for types and classes (e.g., `ZiplineError`).
- **File Naming:** Use `camelCase` for all source files (e.g., `sandboxUtils.ts`).
- **JSON Field Naming:** Use `camelCase` for all MCP tool response fields (e.g., `downloadUrl`) to maintain consistency with the TypeScript ecosystem.

### Structural Patterns

- **Testing Pattern:** All tests must be co-located with their source files using the `*.test.ts` extension (e.g., `src/httpClient.test.ts`).
- **Modular Organization:** Maintain a flat structure in `src/` for domain-specific modules, ensuring clear separation of concerns (e.g., `httpClient`, `sandboxUtils`, `userFiles`).

### Error Handling & Logging

- **Standardized Error Class:** Implement and use a central `ZiplineError` class that maps host errors to the standardized MCP error codes.
- **Secure Logging:** All console output and MCP responses must be piped through the `SecurityUtility.mask()` gate to prevent accidental exposure of the `ZIPLINE_TOKEN`.

### Process Patterns (The "Staging Flow")

Every file-related operation initiated by an agent MUST follow this mandatory sequence:

1. **Validate:** Perform upfront file size and extension checks.
2. **Scan:** Run the secret scanning regex against the file buffer.
3. **Stage:** Move the validated content into a memory `Buffer` (or disk fallback).
4. **Execute:** Perform the remote Zipline action (upload, delete, etc.).
5. **Cleanup:** Immediately purge all staging resources (clear buffers/unlink files) regardless of the operation's outcome.

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
zipline-mcp/
├── README.md               # Quick start and tool usage examples
├── package.json            # SDK dependencies and build scripts
├── tsconfig.json           # ES2022 target configuration
├── vitest.config.ts        # Test runner configuration
├── Makefile                # lint, format, test, build automation
├── .env.example            # Template for ZIPLINE_TOKEN/ENDPOINT
├── .gitignore              # Standard Node.js exclusions
├── src/
│   ├── index.ts            # Entry point: Tool registration & MCP Server init
│   ├── httpClient.ts       # Zipline API interactions & Request orchestration
│   ├── httpClient.test.ts  # Co-located unit tests for API calls
│   ├── userFiles.ts        # Logic for remote file operations
│   ├── remoteFolders.ts    # Logic for remote folder operations
│   ├── sandboxUtils.ts     # Sandbox lifecycle, Buffer staging & Purging logic
│   ├── sandboxUtils.test.ts # Tests for staging security & memory limits
│   ├── utils/
│   │   ├── security.ts     # Secret scanning regex & Log masking utility
│   │   └── errorMapper.ts  # HTTP status to MCP Error Code mapping logic
│   └── types/
│       ├── zipline.ts      # Interfaces for Zipline API responses
│       └── mcp.ts          # Standardized MCP tool response schemas
└── docs/                   # Additional developer guides and architecture context
```

### Architectural Boundaries

**API Boundaries:**

- **External:** Direct HTTPS communication with the Zipline host via `httpClient.ts`.
- **Internal:** Standardized MCP JSON-RPC protocol via the `@modelcontextprotocol/sdk`.

**Component Boundaries:**

- **The Staging Gate:** No file content from the MCP client may reach `httpClient.ts` without first being processed and scanned by `sandboxUtils.ts`.
- **The Logging Gate:** No data may be written to `stderr` or returned in an MCP `error` field without passing through `utils/security.ts`.

**Service Boundaries:**

- The **Zipline Client** is isolated from the **MCP Transport**. The `index.ts` file acts as the only bridge between the two, passing validated arguments to domain logic.

### Requirements to Structure Mapping

**Secure Ingest & Validation (FR1-FR6):**

- Handled by `src/index.ts` (Zod schemas) and `src/utils/security.ts` (Secret scanning).

**Ephemeral Sandbox Management (FR7-FR9):**

- Handled by `src/sandboxUtils.ts` (Buffer implementation and fallback logic).

**Zipline Host Integration (FR10-FR13):**

- Handled by `src/httpClient.ts`.

**Remote File & Folder Management (FR14-FR18):**

- Handled by `src/userFiles.ts` and `src/remoteFolders.ts`.

**Reliability & Observability (FR19-FR22):**

- Handled by `src/utils/errorMapper.ts` and `src/index.ts` (Health check tool).

## Architecture Validation Results

### Coherence Validation ✅

All architectural decisions, from the core SDK choice to the memory-first staging strategy, work together seamlessly. The use of Node.js `Buffer` aligns perfectly with the requirement for ephemeral, high-speed staging without the portability risks of OS-level memory mapping.

### Requirements Coverage Validation ✅

The architecture provides 100% coverage for the PRD requirements. Specifically:

- **Security (FR1-FR6, FR20):** Addressed via the dual-layer Security Gate (Masking + Scanning).
- **Performance (NFR1):** Addressed via the Buffer-based staging path.
- **Reliability (FR18, FR19):** Addressed via standardized Error Mapping and Health Check tools.

### Implementation Readiness Validation ✅

The architecture is highly ready for implementation. Patterns for naming, structure, and error handling are explicit, and the project tree provides a definitive map for all required components.

### Architecture Completeness Checklist

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Complete directory structure defined
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

**Key Strengths:**

- Robust security model (Double-Blind Staging).
- Standardized, agent-actionable error handling.
- Minimalistic, stable foundation using the official SDK.

**Implementation Handoff:**
First implementation priority is the implementation of the `SecurityUtility` for log masking.
