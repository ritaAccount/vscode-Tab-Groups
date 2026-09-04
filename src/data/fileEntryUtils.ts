import {
  FileMarkerGroup,
  FileMarkerItem,
  FileMarkerType,
  FlatFileMarker,
  Group,
  GroupFileEntry,
} from './types';

export const CONFIG_VERSION = '1.4.0';

export function defaultAliasFromPath(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath;
}

export function defaultCursorLabel(line: number): string {
  return `L${line + 1}`;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeMarkerType(value: unknown): FileMarkerType | undefined {
  if (value === 'cursor' || value === 'function' || value === 'text') {
    return value;
  }
  return undefined;
}

function normalizeMarkerItem(raw: unknown, type: FileMarkerType): FileMarkerItem | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const candidate = raw as {
    line?: unknown;
    column?: unknown;
    label?: unknown;
    symbolName?: unknown;
    symbolKind?: unknown;
    query?: unknown;
  };

  const line = readOptionalNumber(candidate.line);
  if (line === undefined) {
    return undefined;
  }

  const column = readOptionalNumber(candidate.column) ?? 0;
  const query =
    typeof candidate.query === 'string' && candidate.query.trim()
      ? candidate.query.trim()
      : undefined;
  const symbolName =
    typeof candidate.symbolName === 'string' && candidate.symbolName.trim()
      ? candidate.symbolName.trim()
      : undefined;

  let label =
    typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : undefined;

  if (!label) {
    if (type === 'function' && symbolName) {
      label = symbolName;
    } else if (type === 'text' && query) {
      label = query.length > 24 ? `${query.slice(0, 24)}…` : query;
    } else {
      label = defaultCursorLabel(line);
    }
  }

  const item: FileMarkerItem = { label, line, column };
  if (symbolName) {
    item.symbolName = symbolName;
  }
  const symbolKind = readOptionalNumber(candidate.symbolKind);
  if (symbolKind !== undefined) {
    item.symbolKind = symbolKind;
  }
  if (query) {
    item.query = query;
  } else if (type === 'text') {
    // text 类型至少要有可搜字符串：回退用 label
    item.query = label;
  }

  return item;
}

function isGroupedMarkers(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) {
    return false;
  }
  const first = raw[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'content' in first &&
    Array.isArray((first as { content?: unknown }).content)
  );
}

function normalizeGroupedMarkers(raw: unknown): FileMarkerGroup[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const groups: FileMarkerGroup[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const type = normalizeMarkerType((entry as { type?: unknown }).type);
    const contentRaw = (entry as { content?: unknown }).content;
    if (!type || !Array.isArray(contentRaw)) {
      continue;
    }
    const content: FileMarkerItem[] = [];
    for (const item of contentRaw) {
      const normalized = normalizeMarkerItem(item, type);
      if (normalized) {
        content.push(normalized);
      }
    }
    if (content.length > 0) {
      groups.push({ type, content });
    }
  }
  return groups.length > 0 ? groups : undefined;
}

/** 旧版扁平 markers: [{ type, line, ... }] */
function normalizeFlatMarkers(raw: unknown): FileMarkerGroup[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const byType = new Map<FileMarkerType, FileMarkerItem[]>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const type = normalizeMarkerType((entry as { type?: unknown }).type) ?? 'cursor';
    const item = normalizeMarkerItem(entry, type);
    if (!item) {
      continue;
    }
    const list = byType.get(type) ?? [];
    list.push(item);
    byType.set(type, list);
  }

  if (byType.size === 0) {
    return undefined;
  }

  const groups: FileMarkerGroup[] = [];
  for (const type of ['cursor', 'function', 'text'] as FileMarkerType[]) {
    const content = byType.get(type);
    if (content?.length) {
      groups.push({ type, content });
    }
  }
  return groups.length > 0 ? groups : undefined;
}

function migrateCursorsArray(raw: unknown): FileMarkerGroup[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const content: FileMarkerItem[] = [];
  for (const item of raw) {
    const normalized = normalizeMarkerItem(
      typeof item === 'object' && item !== null ? item : null,
      'cursor',
    );
    if (normalized) {
      content.push(normalized);
    }
  }
  return content.length > 0 ? [{ type: 'cursor', content }] : undefined;
}

export function flattenMarkers(groups: FileMarkerGroup[] | undefined): FlatFileMarker[] {
  if (!groups || groups.length === 0) {
    return [];
  }
  const flat: FlatFileMarker[] = [];
  for (const group of groups) {
    group.content.forEach((item, contentIndex) => {
      flat.push({ type: group.type, contentIndex, item });
    });
  }
  return flat;
}

export function countMarkers(groups: FileMarkerGroup[] | undefined): number {
  return flattenMarkers(groups).length;
}

export function formatFileLocationSuffix(entry: GroupFileEntry): string {
  const flat = flattenMarkers(entry.markers);
  if (flat.length === 0) {
    return '';
  }
  if (flat.length === 1) {
    const m = flat[0];
    if (m.type === 'function' || m.type === 'text') {
      return ` · ${m.item.label}`;
    }
    return ` · L${m.item.line + 1}`;
  }
  return ` · ${flat.length} 处标记`;
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
    const rawEntry = raw as GroupFileEntry & {
      line?: number;
      column?: number;
      cursors?: unknown;
    };
    const path = rawEntry.path.trim();
    if (!path) {
      return undefined;
    }
    const alias = rawEntry.alias?.trim();
    const entry: GroupFileEntry = {
      path,
      alias: alias || defaultAliasFromPath(path),
    };

    if (rawEntry.markers !== undefined) {
      if (isGroupedMarkers(rawEntry.markers)) {
        entry.markers = normalizeGroupedMarkers(rawEntry.markers);
      } else {
        entry.markers = normalizeFlatMarkers(rawEntry.markers);
      }
      return entry;
    }

    const fromCursors = migrateCursorsArray(rawEntry.cursors);
    if (fromCursors) {
      entry.markers = fromCursors;
      return entry;
    }

    const line = readOptionalNumber(rawEntry.line);
    if (line !== undefined) {
      entry.markers = [
        {
          type: 'cursor',
          content: [
            {
              line,
              column: readOptionalNumber(rawEntry.column) ?? 0,
              label: defaultCursorLabel(line),
            },
          ],
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

export function sortFlatMarkersByLine(markers: FlatFileMarker[]): FlatFileMarker[] {
  return [...markers].sort(
    (a, b) => a.item.line - b.item.line || a.item.column - b.item.column,
  );
}

/** @deprecated */
export const sortMarkersByLine = (markers: FlatFileMarker[]): FlatFileMarker[] =>
  sortFlatMarkersByLine(markers);

/** @deprecated */
export const sortCursorsByLine = sortFlatMarkersByLine;

export function markerTypeLabel(type: FileMarkerType): string {
  switch (type) {
    case 'function':
      return '函数';
    case 'text':
      return '匹配';
    default:
      return '游标';
  }
}
