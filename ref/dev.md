# Developer Guide — FilesystemMCP ref

## Adding a new tool

1. Add the function to `lib.js`
2. Import it in `index.js`
3. Register it with `server.registerTool(name, schema, handler)` in `index.js`
4. Bump the version string in `new McpServer({ name, version })`
5. Update `CLAUDE_REFERENCE.md` if it changes any workflow
6. Add or update the relevant `ref/*.md` file

## Architecture
```
index.js        ← MCP server, tool registration, request routing
lib.js          ← all file operation logic
path-utils.js   ← path normalization, home expansion
path-validation.js ← security: checks paths against allowed directories
roots-utils.js  ← MCP roots protocol support
```

## Security model
- All paths are validated against `allowedDirectories` before any operation
- Symlinks are resolved and checked to prevent escaping allowed dirs
- Writes use atomic rename (temp file → rename) to prevent race conditions
- `delete_file` refuses to delete directories

## Common pitfalls
- `edit_file` requires exact text match — whitespace differences will cause it to fail; prefer `replace_lines` when you have line numbers
- `write_file` silently overwrites — always confirm before using on existing files
- `directory_tree` on large directories without `excludePatterns` will be very slow and token-heavy
- No build step required — edit `.js` files directly and restart Claude
