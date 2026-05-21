import { Group } from './types';
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
  const map = buildGroupsMap(groups);
  const paths: string[] = [];

  const walk = (id: string): void => {
    const group = map.get(id);
    if (!group) {
      return;
    }
    paths.push(...getGroupFilePaths(group));
    for (const childId of group.children) {
      walk(childId);
    }
  };

  walk(groupId);
  return [...new Set(paths)];
}

export function removeGroupReferences(groups: Group[], groupIds: Set<string>): void {
  for (const group of groups) {
    group.children = group.children.filter((id) => !groupIds.has(id));
  }
}

export function normalizeGroupHierarchy(raw: Partial<Group>): Group {
  return {
    id: raw.id ?? crypto.randomUUID(),
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
    id: crypto.randomUUID(),
    name,
    level,
    children: [],
    files: [],
  };
}
