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
