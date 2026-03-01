# JavaScript — FilesystemMCP ref

## JS-specific tools (structure-aware)
| Tool | Use when |
|---|---|
| `list_js_functions` | Get an overview of all functions/classes + line ranges |
| `get_js_function` | Extract a named function/class by name |
| `replace_js_function` | Replace a named function/class by name — no line numbers needed |
| `get_js_imports` | Inspect all imports/requires + line numbers |
| `replace_js_imports` | Replace the entire import block |

## Typical file structure (top to bottom)
1. **Shebang** (optional) — `#!/usr/bin/env node`
2. **Imports** — `import` or `require()` statements
3. **Constants & config** — top-level `const`, env vars, settings
4. **Class / function definitions** — the main logic
5. **Exports** — `export default`, `module.exports`, or named exports
6. **Entry point** — `runServer()` call or top-level `await`

## MCP server structure (relevant for this project)
1. Imports
2. Startup / arg parsing
3. `new McpServer(...)`
4. One `server.registerTool(...)` block per tool
5. Notification handlers
6. `runServer()`

## Workflow for editing a specific function
1. `list_js_functions` → confirm the name and line range
2. `get_js_function name` → inspect the full body
3. `replace_js_function name newContent` → replace it

## Workflow for editing imports
1. `get_js_imports` → see current imports + last import line
2. `replace_js_imports newContent` → replace the block

## Rules
- `replace_js_function`: `newContent` must include the full signature + body
- Arrow functions and `const foo = function(...)` are supported
- For adding a new function (not replacing): use `insert_lines` after `list_js_functions` to find the right position

## Placeholder — to expand
- [ ] React component structure (.jsx)
- [ ] Express / Fastify app structure
- [ ] Common Node.js patterns (middleware, event emitters)
