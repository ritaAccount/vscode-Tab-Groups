import { Group, GroupFileEntry } from './types';

export const CONFIG_VERSION = '1.1.0';

export function defaultAliasFromPath(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath;
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
    const path = (raw as GroupFileEntry).path.trim();
    if (!path) {
      return undefined;
    }
    const alias = (raw as GroupFileEntry).alias?.trim();
    return { path, alias: alias || defaultAliasFromPath(path) };
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
  const aliasByPath = new Map(existingFiles.map((file) => [file.path, file.alias]));

  return matchedPaths
    .sort()
    .map((path) => ({
      path,
      alias: aliasByPath.get(path) ?? defaultAliasFromPath(path),
    }));
}
