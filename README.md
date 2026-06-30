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

### File Management
- `read_text_file` / `read_file` — Read file contents as text (supports `head`/`tail`)
- `read_media_file` — Read image or audio files as base64
- `read_multiple_files` — Read multiple files in one call
- `write_file` — **Create** a new file. Never overwrites: if `path` already exists, the content is automatically saved instead to an incremented filename (`name (1).ext`, `name (2).ext`, ...) and the response is flagged as an error pointing you at `copy_lines_between_files`/`move_lines_between_files`/`append_to_file` to merge it in properly.
- `copy_file` — Copy a file server-side
- `delete_file` — Permanently delete a file
- `create_directory` — Create directories recursively
- `list_directory` — List directory contents
- `list_directory_with_sizes` — List with file sizes and sorting
- `directory_tree` — Recursive JSON tree view
- `move_file` — Move or rename files
- `search_files` — Glob-based recursive file search
- `get_file_info` — File metadata (size, timestamps, permissions)
- `file_stats` — Quick size/line-count/preview without a full read
- `list_allowed_directories` — Show configured allowed paths

### Targeted Editing (prefer these over `write_file` for existing files)
- `edit_file` — Line-range replacements (multiple edits per call), returns a git-style diff, supports `dryRun`
- `replace_lines` — Replace a known line range directly (more token-efficient than `edit_file` once you have line numbers)
- `insert_lines` — Insert content after a given line number
- `delete_lines` — Delete a line range
- `append_to_file` — Append to the end of a file (always safe, never touches existing content)

### Reorganising Without Rewriting
- `copy_lines` — Copy a line range and insert the copy elsewhere in the **same** file; originals preserved
- `move_lines` — Cut a line range and paste it elsewhere in the **same** file; throws if the destination falls inside the source range
- `copy_lines_between_files` — Copy a line range from one file into a **different** file (created if missing); source untouched
- `move_lines_between_files` — Cut a line range from one file into a **different** file; the destination is written first and only on success is the block removed from the source, so a failed move never loses data

### Search
- `find_in_file` — Phrase search within one file (whitespace-normalized, so line-wrapped phrases still match); returns `startLine`/`endLine` for chaining into the tools above
- `find_in_files` — Same, recursively across a directory, with glob filtering

### JavaScript-aware helpers
- `list_js_functions` — List function/class definitions with line ranges
- `get_js_function` / `replace_js_function` — Extract or replace a named function by name (no need to know line numbers)
- `get_js_imports` / `replace_js_imports` / `add_js_import` — Inspect or modify the imports block

## Recommended workflow

To build up a new file from scratch or combine content from elsewhere without ever rewriting large blocks: `write_file` (or `append_to_file` on an existing file) to land the raw content, then `find_in_file` to locate line numbers, then `copy_lines`/`move_lines`/`copy_lines_between_files`/`move_lines_between_files` to reorganise. Reach for `edit_file`/`replace_lines` only for small, targeted changes — never to rewrite a whole file.

## License

See the [original repository](https://github.com/modelcontextprotocol/servers) for license details.
