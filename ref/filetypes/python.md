# Python — FilesystemMCP ref

## Typical file structure (top to bottom)
1. **Shebang / encoding** (optional) — `#!/usr/bin/env python3`
2. **Module docstring** (optional) — `"""..."""`
3. **Imports** — stdlib first, then third-party, then local
4. **Constants** — `ALL_CAPS` names
5. **Class definitions** — `class MyClass:`
6. **Function definitions** — `def my_func():`
7. **Entry point** — `if __name__ == "__main__":`

## Useful search keywords
| To find | Search for |
|---|---|
| A class | `class ClassName` |
| A function / method | `def function_name` |
| Imports section | `import ` or `from ` |
| Constants | look for `ALL_CAPS =` near top of file |
| Entry point | `__main__` |
| Decorators | `@` |

## Workflow for editing a specific function
1. `find_in_file` path `"def my_function"` → get line number
2. `read_lines` with ~20 lines of context → inspect body + indentation
3. `replace_lines` → edit, preserving indentation carefully

## Indentation rules
- Python is indentation-sensitive — always inspect surrounding indentation before editing
- Use `read_lines` generously to see the full block context
- When using `replace_lines`, match the existing indentation level exactly

## Placeholder — to expand
- [ ] Common patterns: dataclasses, argparse, logging setup
- [ ] Flask / FastAPI app structure
- [ ] Jupyter notebook conventions (.ipynb)
- [ ] Virtual environment / requirements.txt conventions
