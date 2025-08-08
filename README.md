# Zipline MCP Server

An MCP (Model Context Protocol) server that allows you to upload files to a Zipline-compatible host. This server provides tools for uploading files, validating them, and generating upload commands.

## Features

- Upload files to a Zipline instance
- Validate files before uploading
- Preview upload commands
- Get only the download URL after upload
- Support for multiple file types (txt, md, gpx, html, json, xml, csv, js, css, py, sh, yaml, yml)

## Installation

### Global Installation

To install the server globally so you can use it with `npx`:

```bash
npm install -g zipline-mcp-server
```

### Local Installation

To install the server as a dependency in your project:

```bash
npm install zipline-mcp-server
```

## Usage

### Using with `npx`

If you installed the server globally, you can run it directly:

```bash
npx zipline-mcp
```

### Adding to MCP Client Configuration

To use this server with an MCP client (like Claude Desktop), you need to add it to your client's configuration file.

Here's an example configuration for Claude Desktop:

```json
{
  "mcpServers": {
    "zipline": {
      "command": "npx",
      "args": ["zipline-mcp"]
    }
  }
}
```

### Available Tools

This server provides the following tools:

#### `upload_file_to_zipline`

Uploads a file to the Zipline server and returns a detailed success message.

- `filePath`: Path to the file to upload.
- `authorizationToken`: Your Zipline API authorization token.
- `format` (optional): Filename format ("random" or "original"). Defaults to "random".

#### `get_upload_url_only`

Uploads a file and returns only the download URL.

- `filePath`: Path to the file to upload.
- `authorizationToken`: Your Zipline API authorization token.
- `format` (optional): Filename format ("random" or "original"). Defaults to "random".

#### `preview_upload_command`

Generates and previews the curl command that will be used for uploading.

- `filePath`: Path to the file to upload.
- `authorizationToken`: Your Zipline API authorization token (will be partially masked in the preview).
- `format` (optional): Filename format ("random" or "original"). Defaults to "random".

#### `validate_file`

Checks if a file exists and is suitable for upload.

- `filePath`: Path to the file to validate.

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Setup

1. Clone the repository:

```bash
git clone https://github.com/your-username/zipline-mcp-server.git
cd zipline-mcp-server
```

2. Install dependencies:

```bash
npm install
```

### Scripts

- `npm run build`: Build the TypeScript project.
- `npm run start`: Run the built server.
- `npm run dev`: Run the server in development mode with `tsx`.
- `npm run test`: Run tests in watch mode.
- `npm run test:run`: Run tests once.
- `npm run lint`: Lint the codebase.
- `npm run lint:fix`: Lint and fix the codebase.
- `npm run format`: Format the codebase with Prettier.
- `npm run format:check`: Check if the codebase is formatted.

### Makefile

A `Makefile` is provided for convenience:

```bash
make install      # Install dependencies
make build       # Build the project
make test        # Run tests
make lint        # Lint the code
make format      # Format the code
make clean       # Clean build artifacts
make publish     # Publish to npm
```

## License

MIT
