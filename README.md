# FilesystemMCP

A local, customizable MCP (Model Context Protocol) server for filesystem access — forked from the official Anthropic implementation and extended with additional functionality.

## Credits

This project is based on the official [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) package by [Anthropic](https://anthropic.com), licensed under the terms found in the original repository. The original codebase provides a secure, well-structured foundation for filesystem access via MCP.

## Why this fork?

The goal of this fork is to extend the original server with additional tools and customizations for personal/local use, while keeping the core security model (allowed directories, path validation) intact.

## Setup

### 1. Install dependencies

```bash
cd FilesystemMCP
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure Claude

In your `claude_desktop_config.json`, point the filesystem server to your local build:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/path/to/FilesystemMCP/dist/index.js",
        "/your/allowed/directory"
      ]
    }
  }
}
```

Restart Claude after saving.

## Tools

All tools from the original server are included:

- `read_text_file` / `read_file` — Read file contents as text
- `read_media_file` — Read image or audio files as base64
- `read_multiple_files` — Read multiple files in one call
- `write_file` — Create or overwrite a file
- `edit_file` — Make line-based edits with diff output
- `create_directory` — Create directories recursively
- `list_directory` — List directory contents
- `list_directory_with_sizes` — List with file sizes and sorting
- `directory_tree` — Recursive JSON tree view
- `move_file` — Move or rename files
- `search_files` — Glob-based recursive file search
- `get_file_info` — File metadata
- `list_allowed_directories` — Show configured allowed paths

## License

See the [original repository](https://github.com/modelcontextprotocol/servers) for license details.
