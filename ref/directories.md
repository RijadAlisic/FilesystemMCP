# Directories — FilesystemMCP ref

## Tools
| Tool | Use when |
|---|---|
| `list_directory` | Quick listing of a single directory |
| `list_directory_with_sizes` | Same but with file sizes; supports `sortBy: "size"` |
| `directory_tree` | Recursive JSON tree — use `excludePatterns` to filter noise |
| `search_files` | Find files by glob pattern across a directory tree |
| `find_in_files` | Search file *contents* across a directory tree |
| `create_directory` | Create a directory (recursive — safe with nested paths) |
| `list_allowed_directories` | Show which root paths this server can access |

## Parameters
- `directory_tree`: `excludePatterns` accepts glob strings, e.g. `["node_modules", "*.log"]`
- `search_files`: use `**/*.ext` to match recursively, `*.ext` for current dir only
- `find_in_files`: supports `filePattern` (glob), `caseSensitive`, and `excludePatterns`

## Rules
- Use `search_files` to find files by name, `find_in_files` to find files by content
- For large trees, always pass `excludePatterns: ["node_modules", ".git", "dist"]` to avoid noise
