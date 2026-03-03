# Python — FilesystemMCP ref

## No Python-specific structure-aware tools yet
Unlike JavaScript, there are no `list_py_functions` / `replace_py_function` tools.
Use the general text tools with the patterns below.

## Typical Python file structure (top to bottom)
1. **Module docstring** — `"""..."""` at the very top
2. **Imports** — stdlib, then third-party, then local
3. **Constants / PARAMS block** — top-level config the file owner (Claude) tunes
4. **Helper functions** — small, pure functions called by main logic
5. **Main class or primary function** — the core logic
6. **Entry point** — `if __name__ == "__main__":` block

## Workflow for editing a specific function
1. `find_in_file text="def my_function"` → get line number
2. `read_lines start=N end=N+30` → read the body
3. `replace_lines start=N end=M content="..."` → replace it

## Common pitfalls
- **edit_file on Python is sensitive to indentation.** Python is whitespace-significant —
  a 3-space indent vs 4-space will cause an exact-match failure AND a syntax error.
  Always `read_lines` the target section first to confirm indentation before editing.
- **f-strings with braces in oldText.** If the code contains `{variable}` inside an f-string,
  the oldText must match exactly including the braces. Don't escape them.
- **Long functions:** for functions over ~40 lines, `replace_lines` is safer than `edit_file`
  because you don't need to reproduce the entire function body as oldText.
- **Adding an import:** use `find_in_file text="^import\|^from"` to find the last import line,
  then `insert_lines after_line=N` to add yours without disturbing the rest of the file.

