# FilesystemMCP — Claude Reference (v1.0)

Server: `node /home/rijad/FilesystemMCP/index.js /home/rijad`

## Load the right ref for your task

| Task | Load |
|---|---|
| Reading files | `ref/reading.md` |
| Writing & editing files | `ref/writing.md` |
| Navigating directories | `ref/directories.md` |
| Adding or modifying tools | `ref/dev.md` |
| Working with a specific file type | `ref/filetypes/index.md` |

## Golden workflow for editing

For any targeted edit, always follow this order to minimize token usage:
1. `file_stats` — get line count + preview to orient
2. `find_in_file` — locate the keyword and get line numbers
3. `read_lines` — read just the relevant section
4. `replace_lines` — make the edit by line number

## When edit_file fails
Do not retry `edit_file` with the same text. Instead:
1. `find_in_file context=2` on a unique substring to see the exact surrounding text
2. Switch to `replace_lines` with the line numbers you now have
This is faster than debugging why the text didn't match.

## Tool loading reminder
All filesystem tools are deferred — they must be loaded via `tool_search` before use.
If a tool call fails with 'not loaded', call `tool_search query="write file"` (or relevant query)
and retry. This is not an error in the filesystem — it's a session context issue.
