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

## Practical patterns (from experience)
- **Checking if a string exists before editing:** `find_in_file` with `context: 2` gives you the surrounding
  lines in one call — enough to construct a safe oldText for `edit_file` without a separate `read_lines`.
- **Reading the bottom of a growing log file:** use `read_text_file` with `tail: N` — much faster than
  reading the whole file when you only care about recent entries.
- **Confirming a write worked:** after `write_file` on a critical file, do a quick `file_stats` to verify
  the line count looks right. Catches silent truncation.
- **tool_search must be called before using any deferred tool.** Even if you used `write_file` earlier
  in the session, if the context window has rolled, the tool may be unloaded. When a tool call returns
  an 'not loaded' error, call `tool_search` with a relevant query and retry — do not give up.
- **read_multiple_files for orientation:** when starting work on an unfamiliar set of files, call
  `read_multiple_files` on all the small ones at once rather than reading them sequentially.
