#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { z } from "zod";
import { minimatch } from "minimatch";
import { normalizePath, expandHome } from './path-utils.js';
import { getValidRootDirectories } from './roots-utils.js';
import {
  formatSize,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  searchFilesWithValidation,
  applyFileEdits,
  tailFile,
  headFile,
  setAllowedDirectories,
  deleteFile,
  copyFile,
  findInFiles,
  readLines,
  findInFile,
  fileStats,
  replaceLines,
  insertLines,
  deleteLines,
  appendToFile,
} from './lib.js';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node index.js [allowed-directory] [additional-directories...]");
}

let allowedDirectories = (await Promise.all(
  args.map(async (dir) => {
    const expanded = expandHome(dir);
    const absolute = path.resolve(expanded);
    const normalizedOriginal = normalizePath(absolute);
    try {
      const resolved = await fs.realpath(absolute);
      const normalizedResolved = normalizePath(resolved);
      if (normalizedOriginal !== normalizedResolved) return [normalizedOriginal, normalizedResolved];
      return [normalizedResolved];
    } catch {
      return [normalizedOriginal];
    }
  })
)).flat();

const accessibleDirectories = [];
for (const dir of allowedDirectories) {
  try {
    const stats = await fs.stat(dir);
    if (stats.isDirectory()) {
      accessibleDirectories.push(dir);
    } else {
      console.error(`Warning: ${dir} is not a directory, skipping`);
    }
  } catch {
    console.error(`Warning: Cannot access directory ${dir}, skipping`);
  }
}

if (accessibleDirectories.length === 0 && allowedDirectories.length > 0) {
  console.error("Error: None of the specified directories are accessible");
  process.exit(1);
}

allowedDirectories = accessibleDirectories;
setAllowedDirectories(allowedDirectories);

// Server setup
const server = new McpServer({ name: "secure-filesystem-server", version: "0.3.0" });

async function readFileAsBase64Stream(filePath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    stream.on('error', reject);
  });
}

// read_file and read_text_file
const readTextFileHandler = async (args) => {
  const validPath = await validatePath(args.path);
  if (args.head && args.tail) throw new Error("Cannot specify both head and tail parameters simultaneously");
  let content;
  if (args.tail) content = await tailFile(validPath, args.tail);
  else if (args.head) content = await headFile(validPath, args.head);
  else content = await readFileContent(validPath);
  return { content: [{ type: "text", text: content }], structuredContent: { content } };
};

server.registerTool("read_file", {
  title: "Read File (Deprecated)",
  description: "Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.",
  inputSchema: { path: z.string(), tail: z.number().optional(), head: z.number().optional() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, readTextFileHandler);

server.registerTool("read_text_file", {
  title: "Read Text File",
  description: "Read the complete contents of a file from the file system as text. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Use the 'head' parameter to read only the first N lines of a file, or the 'tail' parameter to read only the last N lines of a file. Operates on the file as text regardless of extension. Only works within allowed directories.",
  inputSchema: { path: z.string(), tail: z.number().optional().describe("If provided, returns only the last N lines of the file"), head: z.number().optional().describe("If provided, returns only the first N lines of the file") },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, readTextFileHandler);

server.registerTool("read_media_file", {
  title: "Read Media File",
  description: "Read an image or audio file. Returns the base64 encoded data and MIME type. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const extension = path.extname(validPath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".ogg": "audio/ogg", ".flac": "audio/flac",
  };
  const mimeType = mimeTypes[extension] || "application/octet-stream";
  const data = await readFileAsBase64Stream(validPath);
  const type = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "blob";
  const contentItem = { type, data, mimeType };
  return { content: [contentItem], structuredContent: { content: [contentItem] } };
});

server.registerTool("read_multiple_files", {
  title: "Read Multiple Files",
  description: "Read the contents of multiple files simultaneously. This is more efficient than reading files one by one when you need to analyze or compare multiple files. Each file's content is returned with its path as a reference. Failed reads for individual files won't stop the entire operation. Only works within allowed directories.",
  inputSchema: { paths: z.array(z.string()).min(1).describe("Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories.") },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const results = await Promise.all(args.paths.map(async (filePath) => {
    try {
      const validPath = await validatePath(filePath);
      const content = await readFileContent(validPath);
      return `${filePath}:\n${content}\n`;
    } catch (error) {
      return `${filePath}: Error - ${error.message}`;
    }
  }));
  const text = results.join("\n---\n");
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("write_file", {
  title: "Write File",
  description: "Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding. Only works within allowed directories.",
  inputSchema: { path: z.string(), content: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  await writeFileContent(validPath, args.content);
  const text = `Successfully wrote to ${args.path}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("edit_file", {
  title: "Edit File",
  description: "Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    edits: z.array(z.object({ oldText: z.string().describe("Text to search for - must match exactly"), newText: z.string().describe("Text to replace with") })),
    dryRun: z.boolean().default(false).describe("Preview changes using git-style diff format")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const result = await applyFileEdits(validPath, args.edits, args.dryRun);
  return { content: [{ type: "text", text: result }], structuredContent: { content: result } };
});

server.registerTool("create_directory", {
  title: "Create Directory",
  description: "Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently. Perfect for setting up directory structures for projects or ensuring required paths exist. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false }
}, async (args) => {
  const validPath = await validatePath(args.path);
  await fs.mkdir(validPath, { recursive: true });
  const text = `Successfully created directory ${args.path}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("list_directory", {
  title: "List Directory",
  description: "Get a detailed listing of all files and directories in a specified path. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is essential for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const formatted = entries.map(e => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`).join("\n");
  return { content: [{ type: "text", text: formatted }], structuredContent: { content: formatted } };
});

server.registerTool("list_directory_with_sizes", {
  title: "List Directory with Sizes",
  description: "Get a detailed listing of all files and directories in a specified path, including sizes. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is useful for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
  inputSchema: { path: z.string(), sortBy: z.enum(["name", "size"]).optional().default("name").describe("Sort entries by name or size") },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const detailed = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(validPath, entry.name);
    try {
      const stats = await fs.stat(entryPath);
      return { name: entry.name, isDirectory: entry.isDirectory(), size: stats.size };
    } catch {
      return { name: entry.name, isDirectory: entry.isDirectory(), size: 0 };
    }
  }));

  const sorted = [...detailed].sort((a, b) =>
    args.sortBy === 'size' ? b.size - a.size : a.name.localeCompare(b.name)
  );

  const formatted = sorted.map(e =>
    `${e.isDirectory ? "[DIR]" : "[FILE]"} ${e.name.padEnd(30)} ${e.isDirectory ? "" : formatSize(e.size).padStart(10)}`
  );

  const totalFiles = detailed.filter(e => !e.isDirectory).length;
  const totalDirs = detailed.filter(e => e.isDirectory).length;
  const totalSize = detailed.reduce((sum, e) => sum + (e.isDirectory ? 0 : e.size), 0);
  const summary = ["", `Total: ${totalFiles} files, ${totalDirs} directories`, `Combined size: ${formatSize(totalSize)}`];
  const text = [...formatted, ...summary].join("\n");
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("directory_tree", {
  title: "Directory Tree",
  description: "Get a recursive tree view of files and directories as a JSON structure. Each entry includes 'name', 'type' (file/directory), and 'children' for directories. Files have no children array, while directories always have a children array (which may be empty). The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
  inputSchema: { path: z.string(), excludePatterns: z.array(z.string()).optional().default([]) },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const rootPath = args.path;

  async function buildTree(currentPath, excludePatterns = []) {
    const validPath = await validatePath(currentPath);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
      const shouldExclude = excludePatterns.some(pattern =>
        minimatch(relativePath, pattern, { dot: true }) ||
        minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
        minimatch(relativePath, `**/${pattern}/**`, { dot: true })
      );
      if (shouldExclude) continue;
      const entryData = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
      if (entry.isDirectory()) entryData.children = await buildTree(path.join(currentPath, entry.name), excludePatterns);
      result.push(entryData);
    }
    return result;
  }

  const treeData = await buildTree(rootPath, args.excludePatterns);
  const text = JSON.stringify(treeData, null, 2);
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("move_file", {
  title: "Move File",
  description: "Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.",
  inputSchema: { source: z.string(), destination: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true }
}, async (args) => {
  const validSource = await validatePath(args.source);
  const validDest = await validatePath(args.destination);
  await fs.rename(validSource, validDest);
  const text = `Successfully moved ${args.source} to ${args.destination}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("search_files", {
  title: "Search Files",
  description: "Recursively search for files and directories matching a pattern. The patterns should be glob-style patterns that match paths relative to the working directory. Use pattern like '*.ext' to match files in current directory, and '**/*.ext' to match files in all subdirectories. Returns full paths to all matching items. Great for finding files when you don't know their exact location. Only searches within allowed directories.",
  inputSchema: { path: z.string(), pattern: z.string(), excludePatterns: z.array(z.string()).optional().default([]) },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const results = await searchFilesWithValidation(validPath, args.pattern, allowedDirectories, { excludePatterns: args.excludePatterns });
  const text = results.length > 0 ? results.join("\n") : "No matches found";
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("get_file_info", {
  title: "Get File Info",
  description: "Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type. This tool is perfect for understanding file characteristics without reading the actual content. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const info = await getFileStats(validPath);
  const text = Object.entries(info).map(([key, value]) => `${key}: ${value}`).join("\n");
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("read_lines", {
  title: "Read Lines",
  description: "Read a specific range of lines from a file by line number. Use find_in_file first to locate keywords and get their line numbers, then use this to read just the relevant section. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    start: z.number().int().min(1).describe("First line to read (1-indexed)"),
    end: z.number().int().optional().describe("Last line to read (inclusive). Omit to read to end of file.")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const { lines, from, to, total } = await readLines(validPath, args.start, args.end);
  const numbered = lines.map((line, i) => `${from + i}: ${line}`).join('\n');
  const text = `Lines ${from}-${to} of ${total}:\n${numbered}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("find_in_file", {
  title: "Find in File",
  description: "Search for a keyword or phrase within a single file and return all matching line numbers and text. Use this before read_lines or edit_file to locate exactly where something is without reading the whole file. Optionally include surrounding context lines. Case-insensitive by default. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    text: z.string().describe("Text to search for"),
    caseSensitive: z.boolean().optional().default(false),
    context: z.number().int().min(0).optional().default(0).describe("Number of lines to include above and below each match")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const results = await findInFile(validPath, args.text, { caseSensitive: args.caseSensitive, context: args.context });
  let text;
  if (results.length === 0) {
    text = 'No matches found';
  } else if (args.context > 0) {
    text = results.map(r => {
      const lines = r.contextLines.map(l => `${l.isMatch ? '>' : ' '} ${l.line}: ${l.text}`).join('\n');
      return `Match at line ${r.matchLine}:\n${lines}`;
    }).join('\n\n');
  } else {
    text = results.map(r => `${r.line}: ${r.text}`).join('\n');
  }
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("file_stats", {
  title: "File Stats",
  description: "Return quick metadata about a file: size, total line count, last modified time, and a 5-line preview. Use this to orient yourself before deciding how to read or edit a file, avoiding unnecessary full reads. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const info = await fileStats(validPath);
  const text = [
    `size: ${info.size} bytes`,
    `lines: ${info.lineCount ?? 'N/A'}`,
    `modified: ${info.modified}`,
    `preview:`,
    info.preview
  ].join('\n');
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("replace_lines", {
  title: "Replace Lines",
  description: "Replace a range of lines in a file by line number. More token-efficient than edit_file when you already know the line numbers from find_in_file. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    start: z.number().int().min(1).describe("First line to replace (1-indexed)"),
    end: z.number().int().describe("Last line to replace (inclusive)"),
    content: z.string().describe("New content to replace the line range with")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, destructiveHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const result = await replaceLines(validPath, args.start, args.end, args.content);
  const text = `Replaced ${result.replacedLines} lines with ${result.newLines} lines. File now has ${result.total} lines.`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("insert_lines", {
  title: "Insert Lines",
  description: "Insert new content after a specific line number. Use line 0 to insert at the beginning of the file. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    after_line: z.number().int().min(0).describe("Insert after this line number. Use 0 to insert at the beginning."),
    content: z.string().describe("Content to insert")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, destructiveHint: false }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const result = await insertLines(validPath, args.after_line, args.content);
  const text = `Inserted ${result.insertedLines} lines after line ${args.after_line}. File now has ${result.total} lines.`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("delete_lines", {
  title: "Delete Lines",
  description: "Delete a range of lines from a file by line number. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    start: z.number().int().min(1).describe("First line to delete (1-indexed)"),
    end: z.number().int().describe("Last line to delete (inclusive)")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, destructiveHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const result = await deleteLines(validPath, args.start, args.end);
  const text = `Deleted ${result.deletedLines} lines. File now has ${result.total} lines.`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("append_to_file", {
  title: "Append to File",
  description: "Append content to the end of an existing file without reading or rewriting it. Much more efficient than write_file when you just need to add to the end. Only works within allowed directories.",
  inputSchema: {
    path: z.string(),
    content: z.string().describe("Content to append")
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, destructiveHint: false }
}, async (args) => {
  const validPath = await validatePath(args.path);
  await appendToFile(validPath, args.content);
  const text = `Successfully appended to ${args.path}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("delete_file", {
  title: "Delete File",
  description: "Permanently delete a file. Will not delete directories. Use with caution as this operation cannot be undone. Only works within allowed directories.",
  inputSchema: { path: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  await deleteFile(validPath);
  const text = `Successfully deleted ${args.path}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("copy_file", {
  title: "Copy File",
  description: "Copy a file from source to destination without passing content through the agent. If the destination file already exists, it will be overwritten. Both source and destination must be within allowed directories.",
  inputSchema: { source: z.string(), destination: z.string() },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false }
}, async (args) => {
  const validSource = await validatePath(args.source);
  const validDest = await validatePath(args.destination);
  await copyFile(validSource, validDest);
  const text = `Successfully copied ${args.source} to ${args.destination}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("find_in_files", {
  title: "Find in Files",
  description: "Search for a text string inside file contents recursively under a directory. Returns each matching file path, line number, and the matching line. Optionally filter by file glob pattern or exclude paths. Case-insensitive by default. Only works within allowed directories.",
  inputSchema: {
    path: z.string().describe("Root directory to search in"),
    text: z.string().describe("Text to search for"),
    filePattern: z.string().optional().describe("Glob pattern to filter files, e.g. '**/*.ts'"),
    caseSensitive: z.boolean().optional().default(false),
    excludePatterns: z.array(z.string()).optional().default([])
  },
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async (args) => {
  const validPath = await validatePath(args.path);
  const results = await findInFiles(validPath, args.text, {
    caseSensitive: args.caseSensitive,
    filePattern: args.filePattern,
    excludePatterns: args.excludePatterns
  });
  const text = results.length > 0 ? results.map(r => `${r.file}:${r.line}: ${r.text}`).join("\n") : "No matches found";
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

server.registerTool("list_allowed_directories", {
  title: "List Allowed Directories",
  description: "Returns the list of directories that this server is allowed to access. Subdirectories within these allowed directories are also accessible. Use this to understand which directories and their nested paths are available before trying to access files.",
  inputSchema: {},
  outputSchema: { content: z.string() },
  annotations: { readOnlyHint: true }
}, async () => {
  const text = `Allowed directories:\n${allowedDirectories.join('\n')}`;
  return { content: [{ type: "text", text }], structuredContent: { content: text } };
});

// Handle dynamic roots updates
async function updateAllowedDirectoriesFromRoots(requestedRoots) {
  const validatedRootDirs = await getValidRootDirectories(requestedRoots);
  if (validatedRootDirs.length > 0) {
    allowedDirectories = [...validatedRootDirs];
    setAllowedDirectories(allowedDirectories);
    console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
  } else {
    console.error("No valid root directories provided by client");
  }
}

server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
  try {
    const response = await server.server.listRoots();
    if (response && 'roots' in response) await updateAllowedDirectoriesFromRoots(response.roots);
  } catch (error) {
    console.error("Failed to request roots from client:", error.message);
  }
});

server.server.oninitialized = async () => {
  const clientCapabilities = server.server.getClientCapabilities();
  if (clientCapabilities?.roots) {
    try {
      const response = await server.server.listRoots();
      if (response && 'roots' in response) await updateAllowedDirectoriesFromRoots(response.roots);
      else console.error("Client returned no roots set, keeping current settings");
    } catch (error) {
      console.error("Failed to request initial roots from client:", error.message);
    }
  } else {
    if (allowedDirectories.length > 0) {
      console.error("Client does not support MCP Roots, using allowed directories:", allowedDirectories);
    } else {
      throw new Error("Server cannot operate: No allowed directories available.");
    }
  }
};

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  if (allowedDirectories.length === 0) console.error("Started without allowed directories - waiting for client roots");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
