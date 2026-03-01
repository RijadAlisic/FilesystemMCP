import fs from "fs/promises";
import path from "path";
import { randomBytes } from 'crypto';
import { createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';

let allowedDirectories = [];

export function setAllowedDirectories(directories) {
  allowedDirectories = [...directories];
}

export function getAllowedDirectories() {
  return [...allowedDirectories];
}

export function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i < 0 || i === 0) return `${bytes} ${units[0]}`;
  const unitIndex = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
}

export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

export function createUnifiedDiff(originalContent, newContent, filepath = 'file') {
  return createTwoFilesPatch(
    filepath, filepath,
    normalizeLineEndings(originalContent),
    normalizeLineEndings(newContent),
    'original', 'modified'
  );
}

function resolveRelativePathAgainstAllowedDirectories(relativePath) {
  if (allowedDirectories.length === 0) return path.resolve(process.cwd(), relativePath);
  for (const allowedDir of allowedDirectories) {
    const candidate = path.resolve(allowedDir, relativePath);
    const normalizedCandidate = normalizePath(candidate);
    if (isPathWithinAllowedDirectories(normalizedCandidate, allowedDirectories)) return candidate;
  }
  return path.resolve(allowedDirectories[0], relativePath);
}

export async function validatePath(requestedPath) {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : resolveRelativePathAgainstAllowedDirectories(expandedPath);

  const normalizedRequested = normalizePath(absolute);
  if (!isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories)) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
      throw new Error(`Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
    }
    return realPath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const parentDir = path.dirname(absolute);
      try {
        const realParentPath = await fs.realpath(parentDir);
        const normalizedParent = normalizePath(realParentPath);
        if (!isPathWithinAllowedDirectories(normalizedParent, allowedDirectories)) {
          throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath} not in ${allowedDirectories.join(', ')}`);
        }
        return absolute;
      } catch {
        throw new Error(`Parent directory does not exist: ${parentDir}`);
      }
    }
    throw error;
  }
}

export async function getFileStats(filePath) {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

export async function readFileContent(filePath, encoding = 'utf-8') {
  return await fs.readFile(filePath, encoding);
}

export async function writeFileContent(filePath, content) {
  try {
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, filePath);
      } catch (renameError) {
        try { await fs.unlink(tempPath); } catch {}
        throw renameError;
      }
    } else {
      throw error;
    }
  }
}

export async function applyFileEdits(filePath, edits, dryRun = false) {
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
  let modifiedContent = content;

  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);
      const isMatch = oldLines.every((oldLine, j) => oldLine.trim() === potentialMatch[j].trim());

      if (isMatch) {
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });
        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }

    if (!matchFound) throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
  }

  const diff = createUnifiedDiff(content, modifiedContent, filePath);
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) numBackticks++;
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tempPath, modifiedContent, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try { await fs.unlink(tempPath); } catch {}
      throw error;
    }
  }

  return formattedDiff;
}

export async function tailFile(filePath, numLines) {
  const CHUNK_SIZE = 1024;
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  if (fileSize === 0) return '';

  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines = [];
    let position = fileSize;
    let chunk = Buffer.alloc(CHUNK_SIZE);
    let linesFound = 0;
    let remainingText = '';

    while (position > 0 && linesFound < numLines) {
      const size = Math.min(CHUNK_SIZE, position);
      position -= size;
      const { bytesRead } = await fileHandle.read(chunk, 0, size, position);
      if (!bytesRead) break;
      const chunkText = chunk.slice(0, bytesRead).toString('utf-8') + remainingText;
      const chunkLines = normalizeLineEndings(chunkText).split('\n');
      if (position > 0) {
        remainingText = chunkLines.shift();
      }
      for (let i = chunkLines.length - 1; i >= 0 && linesFound < numLines; i--) {
        lines.unshift(chunkLines[i]);
        linesFound++;
      }
    }
    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

export async function headFile(filePath, numLines) {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines = [];
    let buffer = '';
    let bytesRead = 0;
    const chunk = Buffer.alloc(1024);

    while (lines.length < numLines) {
      const result = await fileHandle.read(chunk, 0, chunk.length, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
      buffer += chunk.slice(0, result.bytesRead).toString('utf-8');
      const newLineIndex = buffer.lastIndexOf('\n');
      if (newLineIndex !== -1) {
        const completeLines = buffer.slice(0, newLineIndex).split('\n');
        buffer = buffer.slice(newLineIndex + 1);
        for (const line of completeLines) {
          lines.push(line);
          if (lines.length >= numLines) break;
        }
      }
    }
    if (buffer.length > 0 && lines.length < numLines) lines.push(buffer);
    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

export async function readLines(filePath, start, end) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = normalizeLineEndings(content).split('\n');
  const total = lines.length;
  const from = Math.max(1, start);
  const to = end !== undefined ? Math.min(end, total) : total;
  const selected = lines.slice(from - 1, to);
  return { lines: selected, from, to, total };
}

export async function findInFile(filePath, searchText, options = {}) {
  const { caseSensitive = false, context = 0 } = options;
  const content = await fs.readFile(filePath, 'utf-8').catch(() => null);
  if (!content) throw new Error(`Could not read file: ${filePath}`);
  const needle = caseSensitive ? searchText : searchText.toLowerCase();
  const lines = normalizeLineEndings(content).split('\n');
  const results = [];
  lines.forEach((line, i) => {
    const haystack = caseSensitive ? line : line.toLowerCase();
    if (haystack.includes(needle)) {
      if (context > 0) {
        const from = Math.max(0, i - context);
        const to = Math.min(lines.length - 1, i + context);
        const contextLines = lines.slice(from, to + 1).map((l, j) => ({
          line: from + j + 1,
          text: l.trim(),
          isMatch: from + j === i
        }));
        results.push({ matchLine: i + 1, contextLines });
      } else {
        results.push({ line: i + 1, text: line.trim() });
      }
    }
  });
  return results;
}

export async function fileStats(filePath) {
  const stats = await fs.stat(filePath);
  const content = await fs.readFile(filePath, 'utf-8').catch(() => null);
  const lineCount = content ? normalizeLineEndings(content).split('\n').length : null;
  const preview = content ? normalizeLineEndings(content).split('\n').slice(0, 5).join('\n') : null;
  return {
    size: stats.size,
    lineCount,
    modified: stats.mtime,
    preview
  };
}

export async function replaceLines(filePath, start, end, newContent) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = normalizeLineEndings(content).split('\n');
  const total = lines.length;
  const from = Math.max(1, start) - 1;
  const to = Math.min(end, total);
  const newLines = normalizeLineEndings(newContent).split('\n');
  lines.splice(from, to - from, ...newLines);
  const result = lines.join('\n');
  const tempPath = `${filePath}.${(await import('crypto')).randomBytes(16).toString('hex')}.tmp`;
  await fs.writeFile(tempPath, result, 'utf-8');
  await fs.rename(tempPath, filePath);
  return { replacedLines: to - from, newLines: newLines.length, total: lines.length };
}

export async function insertLines(filePath, afterLine, newContent) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = normalizeLineEndings(content).split('\n');
  const newLines = normalizeLineEndings(newContent).split('\n');
  const insertAt = Math.min(afterLine, lines.length);
  lines.splice(insertAt, 0, ...newLines);
  const result = lines.join('\n');
  const tempPath = `${filePath}.${(await import('crypto')).randomBytes(16).toString('hex')}.tmp`;
  await fs.writeFile(tempPath, result, 'utf-8');
  await fs.rename(tempPath, filePath);
  return { insertedAt: insertAt, insertedLines: newLines.length, total: lines.length };
}

export async function deleteLines(filePath, start, end) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = normalizeLineEndings(content).split('\n');
  const total = lines.length;
  const from = Math.max(1, start) - 1;
  const to = Math.min(end, total);
  lines.splice(from, to - from);
  const result = lines.join('\n');
  const tempPath = `${filePath}.${(await import('crypto')).randomBytes(16).toString('hex')}.tmp`;
  await fs.writeFile(tempPath, result, 'utf-8');
  await fs.rename(tempPath, filePath);
  return { deletedLines: to - from, total: lines.length };
}

export async function appendToFile(filePath, content) {
  await fs.appendFile(filePath, content, 'utf-8');
}

export async function deleteFile(filePath) {
  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) throw new Error(`Path is a directory, not a file: ${filePath}`);
  await fs.unlink(filePath);
}

export async function copyFile(sourcePath, destPath) {
  await fs.copyFile(sourcePath, destPath);
}

export async function findInFiles(rootPath, searchText, options = {}) {
  const { excludePatterns = [], caseSensitive = false, filePattern = '**/*' } = options;
  const results = [];
  const needle = caseSensitive ? searchText : searchText.toLowerCase();

  async function search(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      try {
        await validatePath(fullPath);
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(p => minimatch(relativePath, p, { dot: true }));
        if (shouldExclude) continue;
        if (entry.isDirectory()) {
          await search(fullPath);
        } else {
          if (!minimatch(relativePath, filePattern, { dot: true })) continue;
          const content = await fs.readFile(fullPath, 'utf-8').catch(() => null);
          if (!content) continue;
          const lines = content.split('\n');
          lines.forEach((line, i) => {
            const haystack = caseSensitive ? line : line.toLowerCase();
            if (haystack.includes(needle)) results.push({ file: fullPath, line: i + 1, text: line.trim() });
          });
        }
      } catch { continue; }
    }
  }

  await search(rootPath);
  return results;
}

export async function searchFilesWithValidation(rootPath, pattern, allowedDirectories, options = {}) {
  const { excludePatterns = [] } = options;
  const results = [];

  async function search(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      try {
        await validatePath(fullPath);
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(p => minimatch(relativePath, p, { dot: true }));
        if (shouldExclude) continue;
        if (minimatch(relativePath, pattern, { dot: true })) results.push(fullPath);
        if (entry.isDirectory()) await search(fullPath);
      } catch { continue; }
    }
  }

  await search(rootPath);
  return results;
}
