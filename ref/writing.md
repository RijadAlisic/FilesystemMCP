# Writing & Editing — FilesystemMCP ref

## Tools
| Tool | Use when |
|---|---|
| `replace_lines` | You know the line numbers — most efficient targeted edit |
| `edit_file` | You know the exact text but not line numbers |
| `insert_lines` | Add new content at a specific position |
| `delete_lines` | Remove a line range |
| `append_to_file` | Add content to end of file — no read needed |
| `write_file` | Create new file or fully overwrite existing |

## Parameters
- `replace_lines`: `start`/`end` are 1-indexed inclusive; `content` replaces the entire range
- `insert_lines`: `after_line: 0` inserts at the beginning of the file
- `edit_file`: `edits` is an array of `{ oldText, newText }` — text must match exactly
- `delete_file`: only works on files, not directories

## Rules
- Prefer `replace_lines` over `edit_file` when you have line numbers — it uses fewer tokens
- Use `append_to_file` instead of read + write when adding to the end
- `write_file` overwrites without warning — use carefully on existing files
- For moving/renaming: use `move_file`; for duplicating: use `copy_file`
