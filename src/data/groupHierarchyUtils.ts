import { randomUUID } from 'node:crypto';
import { Group, GroupFileEntry } from './types';
import { getGroupFilePaths } from './fileEntryUtils';

export function buildGroupsMap(groups: Group[]): Map<string, Group> {
  return new Map(groups.map((group) => [group.id, group]));
}

export function getRootGroups(groups: Group[]): Group[] {
  return groups.filter((group) => group.level === 0);
}

export function getChildGroups(groups: Group[], parent: Group): Group[] {
  const map = buildGroupsMap(groups);
  return parent.children
    .map((id) => map.get(id))
    .filter((group): group is Group => group !== undefined);
}

export function findParentGroupId(groups: Group[], groupId: string): string | undefined {
  return groups.find((group) => group.children.includes(groupId))?.id;
}

export function getGroupPathLabel(groups: Group[], groupId: string): string {
  const map = buildGroupsMap(groups);
  const parts: string[] = [];
  let current = map.get(groupId);

  while (current) {
    parts.unshift(current.name);
    const parentId = findParentGroupId(groups, current.id);
    current = parentId ? map.get(parentId) : undefined;
  }

  return parts.join(' / ');
}

export function isDescendantOf(groups: Group[], ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) {
    return true;
  }
  return collectDescendantIds(groups, ancestorId).includes(candidateId);
}

export function updateGroupLevels(groups: Group[], groupId: string, newLevel: number): void {
  const map = buildGroupsMap(groups);

  const walk = (id: string, level: number): void => {
    const group = map.get(id);
    if (!group) {
      return;
    }
    group.level = level;
    for (const childId of group.children) {
      walk(childId, level + 1);
    }
  };

  walk(groupId, newLevel);
}

export function collectDescendantIds(groups: Group[], groupId: string): string[] {
  const map = buildGroupsMap(groups);
  const ids: string[] = [];

  const walk = (id: string): void => {
    const group = map.get(id);
    if (!group) {
      return;
    }
    ids.push(id);
    for (const childId of group.children) {
      walk(childId);
    }
  };

  walk(groupId);
  return ids;
}

export function collectAllFilePaths(groups: Group[], groupId: string): string[] {
  return collectAllFileEntries(groups, groupId).map((entry) => entry.path);
}

export function collectAllFileEntries(groups: Group[], groupId: string): GroupFileEntry[] {
  const map = buildGroupsMap(groups);
  const entries: GroupFileEntry[] = [];

  const walk = (id: string): void => {
    const group = map.get(id);
    if (!group) {
      return;
    }
    entries.push(...group.files);
    for (const childId of group.children) {
      walk(childId);
    }
  };

  walk(groupId);

  const seen = new Set<string>();
  const uniqueEntries: GroupFileEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      continue;
    }
    seen.add(entry.path);
    uniqueEntries.push(entry);
  }
  return uniqueEntries;
}

export function removeGroupReferences(groups: Group[], groupIds: Set<string>): void {
  for (const group of groups) {
    group.children = group.children.filter((id) => !groupIds.has(id));
  }
}

export function normalizeGroupHierarchy(raw: Partial<Group>): Group {
  return {
    id: raw.id ?? randomUUID(),
    name: raw.name ?? '未命名分组',
    level: typeof raw.level === 'number' && raw.level >= 0 ? raw.level : 0,
    children: Array.isArray(raw.children)
      ? raw.children.filter((id): id is string => typeof id === 'string')
      : [],
    files: raw.files ?? [],
    config: raw.config,
    configId: raw.configId,
  };
}

export function needsHierarchyMigration(groups: Partial<Group>[]): boolean {
  return groups.some(
    (group) => typeof group.level !== 'number' || !Array.isArray(group.children),
  );
}

export function createEmptyGroup(name: string, level: number): Group {
  return {
    id: randomUUID(),
    name,
    level,
    children: [],
    files: [],
  };
}
