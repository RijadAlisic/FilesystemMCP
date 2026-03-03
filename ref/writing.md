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

## edit_file failure modes (from experience)
- **Unicode escape sequences in oldText break matching.** If the file contains `\u2014` (em dash) or similar,
  write the literal character `—` in oldText, not the escape. Copy-pasting from file content is safer than typing.
- **Trailing whitespace or newline differences cause silent mismatches.** If edit_file fails unexpectedly,
  use `find_in_file` + `read_lines` to inspect the exact bytes around the target before retrying.
- **edit_file on a file you haven't read yet is risky.** Always do `find_in_file` first to confirm the
  exact string exists. Do not assume indentation or line endings.
- **When edit_file fails, do not retry blindly.** Switch to `replace_lines` with explicit line numbers instead.

## write_file for long files
- For files over ~100 lines, write_file in one call is fine but fragile if interrupted.
- For files over ~300 lines, consider writing a skeleton first with `write_file`, then filling sections
  with `append_to_file` or `replace_lines`. Easier to debug if something goes wrong mid-write.

## Atomic multi-section edits
- If you need to edit 3+ disconnected sections of one file, use multiple `edit_file` edits in a single call
  (the `edits` array) rather than multiple tool calls — fewer round trips and edits apply in order.
