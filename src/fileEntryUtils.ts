import { FileCursor, Group, GroupFileEntry } from './types';

export const CONFIG_VERSION = '1.3.0';

export function defaultAliasFromPath(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath;
}

export function defaultCursorLabel(line: number): string {
  return `L${line + 1}`;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeCursor(raw: unknown): FileCursor | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const candidate = raw as { line?: unknown; column?: unknown; label?: unknown };
  const line = readOptionalNumber(candidate.line);
  if (line === undefined) {
    return undefined;
  }

  const column = readOptionalNumber(candidate.column) ?? 0;
  const label =
    typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : defaultCursorLabel(line);

  return { line, column, label };
}

function normalizeCursors(raw: unknown): FileCursor[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const cursors: FileCursor[] = [];
  for (const item of raw) {
    const cursor = normalizeCursor(item);
    if (cursor) {
      cursors.push(cursor);
    }
  }
  return cursors.length > 0 ? cursors : undefined;
}

export function formatFileLocationSuffix(entry: GroupFileEntry): string {
  const cursors = entry.cursors;
  if (!cursors || cursors.length === 0) {
    return '';
  }
  if (cursors.length === 1) {
    return ` · L${cursors[0].line + 1}`;
  }
  return ` · ${cursors.length} 处游标`;
}

export function formatFileEntryDescription(entry: GroupFileEntry, exists: boolean): string {
  const pathLabel = exists ? entry.path : `${entry.path}（不存在）`;
  return `${pathLabel}${formatFileLocationSuffix(entry)}`;
}

export function normalizeFileEntry(raw: unknown): GroupFileEntry | undefined {
  if (typeof raw === 'string') {
    const path = raw.trim();
    if (!path) {
      return undefined;
    }
    return { path, alias: defaultAliasFromPath(path) };
  }

  if (typeof raw === 'object' && raw !== null && typeof (raw as GroupFileEntry).path === 'string') {
    const rawEntry = raw as GroupFileEntry & { line?: number; column?: number };
    const path = rawEntry.path.trim();
    if (!path) {
      return undefined;
    }
    const alias = rawEntry.alias?.trim();
    const entry: GroupFileEntry = {
      path,
      alias: alias || defaultAliasFromPath(path),
    };

    const fromArray = normalizeCursors(rawEntry.cursors);
    if (fromArray) {
      entry.cursors = fromArray;
      return entry;
    }

    // 旧版单点 line/column → cursors[]
    const line = readOptionalNumber(rawEntry.line);
    if (line !== undefined) {
      entry.cursors = [
        {
          line,
          column: readOptionalNumber(rawEntry.column) ?? 0,
          label: defaultCursorLabel(line),
        },
      ];
    }

    return entry;
  }

  return undefined;
}

export function normalizeGroupFiles(files: unknown): GroupFileEntry[] {
  if (!Array.isArray(files)) {
    return [];
  }

  const entries: GroupFileEntry[] = [];
  for (const raw of files) {
    const entry = normalizeFileEntry(raw);
    if (entry && !entries.some((item) => item.path === entry.path)) {
      entries.push(entry);
    }
  }
  return entries;
}

export function isVersionLessThan(version: string | undefined, target: string): boolean {
  if (!version) {
    return true;
  }

  const parse = (value: string): number[] => value.split('.').map((part) => parseInt(part, 10) || 0);
  const current = parse(version);
  const expected = parse(target);

  for (let i = 0; i < Math.max(current.length, expected.length); i++) {
    const diff = (current[i] ?? 0) - (expected[i] ?? 0);
    if (diff !== 0) {
      return diff < 0;
    }
  }
  return false;
}

export function getGroupFilePaths(group: Group): string[] {
  return group.files.map((file) => file.path);
}

export function groupContainsPath(group: Group, filePath: string): boolean {
  return group.files.some((file) => file.path === filePath);
}

export function buildScannedFiles(existingFiles: GroupFileEntry[], matchedPaths: string[]): GroupFileEntry[] {
  const existingByPath = new Map(existingFiles.map((file) => [file.path, file]));

  return matchedPaths.sort().map((path) => {
    const existing = existingByPath.get(path);
    if (existing) {
      return { ...existing };
    }
    return {
      path,
      alias: defaultAliasFromPath(path),
    };
  });
}

export function sortCursorsByLine(cursors: FileCursor[]): FileCursor[] {
  return [...cursors].sort((a, b) => a.line - b.line || a.column - b.column);
}
