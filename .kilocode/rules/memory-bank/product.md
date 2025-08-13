# Product Overview

This project, the Zipline MCP Server, serves as an MCP (Model Context Protocol) server designed to enable file uploads to Zipline-compatible hosts.

## Why this project exists

The project bridges MCP clients with Zipline's file hosting service, providing a standardized way for MCP-enabled applications to interact with Zipline for file management.

## Problems it solves

- **Automated File Uploads**: Simplifies and automates the process of uploading files to Zipline from MCP clients.
- **Secure File Handling**: Offers features like sandboxed temporary file management for secure operations.
- **Advanced Management**: Provides tools for setting expiration dates, passwords, view limits, and specific folders for uploaded files, enhancing control over hosted content.
- **Validation**: Ensures files are suitable for upload before transmission, reducing errors and server load.

## How it should work

The server exposes MCP tools that client applications can call to:

- Upload files (`upload_file_to_zipline`)
- Validate file suitability (`validate_file`)
- Manage temporary files in a sandboxed environment (`tmp_file_manager`)
- Download external URLs into the sandbox (`download_external_url`)

It handles authentication with Zipline using provided environment variables (`ZIPLINE_TOKEN`, `ZIPLINE_ENDPOINT`) and manages file naming formats and advanced upload options.

## User experience goals

- **Seamless Integration**: Users of MCP clients should be able to upload files to Zipline without manual intervention.
- **Reliable Uploads**: File uploads should be robust, with clear error messages for troubleshooting.
- **Secure Operations**: Temporary file operations should be secure and isolated per user.
- **Configurability**: Users should have options to configure upload parameters like expiration, passwords, and file naming.
