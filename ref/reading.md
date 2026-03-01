# Reading — FilesystemMCP ref

## Tools
| Tool | Use when |
|---|---|
| `file_stats` | First step — get size, line count, preview before committing to a full read |
| `find_in_file` | Locate a keyword and get its line number(s) |
| `read_lines` | Read a specific line range once you know where to look |
| `read_text_file` | Read an entire file — only for small files |
| `read_multiple_files` | Read several small files in one call |
| `read_media_file` | Read images or audio as base64 |

## Parameters
- `find_in_file`: supports `context: N` to include N lines above/below each match — use this to skip a separate `read_lines` call for small edits
- `read_lines`: `start` and `end` are 1-indexed and inclusive
- `read_text_file`: supports `head: N` and `tail: N` for quick top/bottom reads

## Rules
- Never read an entire file just to find one section — use `file_stats` + `find_in_file` first
- For files over ~200 lines, always use `find_in_file` + `read_lines` instead of `read_text_file`
