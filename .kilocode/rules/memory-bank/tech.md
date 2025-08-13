# Technologies Used

This project, the Zipline MCP Server, is built using the following key technologies and tools:

## Core Technologies

- **Node.js**: The JavaScript runtime environment. The project specifies Node.js v18 or higher.
- **TypeScript**: A superset of JavaScript that adds static typing. Used for improved code quality, maintainability, and developer experience.
- **@modelcontextprotocol/sdk**: The SDK for implementing MCP (Model Context Protocol) servers. This is fundamental for enabling communication with MCP clients.
- **Zod**: A TypeScript-first schema declaration and validation library. Used for robust input validation of tool arguments.
- **Fetch API**: Used for making HTTP requests. Available natively in Node.js >= 18.
- **mime-types**: A utility for determining MIME types based on file extensions.

## Development Tools & Ecosystem

- **npm**: Node.js package manager, used for dependency management and running scripts.
- **Vitest**: A fast and lightweight testing framework, used for unit and integration testing.
- **ESLint**: A pluggable linting utility for JavaScript and TypeScript, used for enforcing code style and identifying potential issues.
- **Prettier**: An opinionated code formatter, used for consistent code style across the project.
- **tsx**: A TypeScript execution environment that allows running TypeScript files directly without prior compilation, used for development.
- **Makefile**: Used for automating common development tasks like building, testing, linting, and formatting.

## Technical Constraints & Considerations

- **Node.js Version**: Requires Node.js 18 or higher due to reliance on native `fetch` and `Blob`/`FormData` APIs.
- **Environment Variables**: `ZIPLINE_TOKEN` and `ZIPLINE_ENDPOINT` are critical environment variables for Zipline authentication and server configuration.
- **Secure Sandboxing**: The `tmp_file_manager` and `download_external_url` tools implement secure sandboxing for temporary file operations, isolating user data and preventing path traversal.
- **File Size Limits**: Downloads and reads from `tmp_file_manager` have defined maximum file sizes (e.g., 100MB for downloads, 1MB for reads).

## Dependencies

Key dependencies listed in `package.json`:

### Production Dependencies

- `@modelcontextprotocol/sdk`
- `mime-types`
- `typescript-eslint` (likely a dev dependency, but listed here)
- `zod`

### Development Dependencies

- `@eslint/eslintrc`
- `@eslint/js`
- `@types/mime-types`
- `@types/node`
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`
- `eslint`
- `eslint-config-prettier`
- `globals`
- `prettier`
- `tsx`
- `typescript`
- `vitest`

## Tool Usage Patterns

- **Build**: `npm run build` (uses `tsc`)
- **Testing**: `npm run test` (uses `vitest`)
- **Linting**: `npm run lint` (uses `eslint`)
- **Formatting**: `npm run format` (uses `prettier`)
- **Development Server**: `npm run dev` (uses `tsx watch`)
- **Makefile Integration**: `make` commands abstract `npm run` scripts for convenience.
