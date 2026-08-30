import { Group, GroupFileEntry } from './types';

export const CONFIG_VERSION = '1.2.0';

export function defaultAliasFromPath(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function formatFileLocationSuffix(entry: GroupFileEntry): string {
  if (entry.line !== undefined) {
    return ` · L${entry.line + 1}`;
  }
  return '';
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
    const rawEntry = raw as GroupFileEntry;
    const path = rawEntry.path.trim();
    if (!path) {
      return undefined;
    }
    const alias = rawEntry.alias?.trim();
    const entry: GroupFileEntry = {
      path,
      alias: alias || defaultAliasFromPath(path),
    };

    const line = readOptionalNumber(rawEntry.line);
    const column = readOptionalNumber(rawEntry.column);

    if (line !== undefined) {
      entry.line = line;
    }
    if (column !== undefined) {
      entry.column = column;
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
