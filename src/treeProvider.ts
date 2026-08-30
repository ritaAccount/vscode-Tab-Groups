import * as vscode from 'vscode';
import { Group, GroupFileEntry } from './types';
import { TabGroupsManager } from './tabGroupsManager';
import { formatFileEntryDescription } from './fileEntryUtils';
import { fileExistenceCache } from './fileExistenceCache';
import { isValidWorkspace, toAbsoluteUri } from './workspaceUtils';

export type TreeElement = GroupTreeItem | FileTreeItem;

/** 须与 package.json views.id 完全一致 */
const TREE_VIEW_MIME = 'application/vnd.code.tree.tabGroupsView';
const FILE_DRAG_MIME = 'application/vnd.tabgroups.file';

interface FileDragPayload {
  groupId: string;
  path: string;
}

export class GroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: Group,
    labelSuffix: string,
    isRegex: boolean,
    hasChildren: boolean,
  ) {
    super(`${group.name}${labelSuffix}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = isRegex ? 'groupRegex' : 'group';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.id = `group:${group.id}`;

    if (!hasChildren) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: string,
    public readonly fileEntry: GroupFileEntry,
    exists: boolean,
  ) {
    super(fileEntry.alias, vscode.TreeItemCollapsibleState.None);
    this.relativePath = fileEntry.path;
    this.description = formatFileEntryDescription(fileEntry, exists);
    this.contextValue = exists ? 'file' : 'missingFile';
    this.iconPath = new vscode.ThemeIcon(
      'file',
      exists ? undefined : new vscode.ThemeColor('disabledForeground'),
    );
    this.id = buildFileTreeItemId(groupId, fileEntry.path);
    this.tooltip = formatFileEntryDescription(fileEntry, exists);

    const uri = toAbsoluteUri(fileEntry.path);
    if (uri) {
      this.resourceUri = uri;
    }

    if (exists) {
      this.command = {
        command: 'tabGroups.openFile',
        title: '打开文件',
        arguments: [this],
      };
    }
  }

  readonly relativePath: string;
}

export class TabGroupsTreeProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement>
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  readonly dropMimeTypes = [TREE_VIEW_MIME, FILE_DRAG_MIME];
  readonly dragMimeTypes = [TREE_VIEW_MIME, FILE_DRAG_MIME];

  private expandedGroupIds = new Set<string>();

  constructor(private readonly manager: TabGroupsManager) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  rememberExpanded(groupId: string): void {
    this.expandedGroupIds.add(groupId);
  }

  rememberCollapsed(groupId: string): void {
    this.expandedGroupIds.delete(groupId);
  }

  getExpandedGroupIds(): Set<string> {
    return this.expandedGroupIds;
  }

  handleDrag(source: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void {
    if (!isValidWorkspace() || source.length === 0) {
      return;
    }

    const filePayloads = source
      .map((item) => getFileDragPayload(item))
      .filter((payload): payload is FileDragPayload => payload !== undefined);
    const groupIds = source
      .map((item) => getGroupId(item))
      .filter((groupId): groupId is string => groupId !== undefined);

    if (filePayloads.length > 0 && groupIds.length > 0) {
      return;
    }

    if (filePayloads.length > 0) {
      dataTransfer.set(FILE_DRAG_MIME, new vscode.DataTransferItem(filePayloads));
      return;
    }

    if (groupIds.length > 0) {
      dataTransfer.set(TREE_VIEW_MIME, new vscode.DataTransferItem([...source]));
    }
  }

  async handleDrop(
    target: TreeElement | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    if (!isValidWorkspace()) {
      return;
    }

    const targetGroupId = this.resolveDropTargetGroupId(target);
    if (!targetGroupId) {
      return;
    }

    const filePayloads = this.readFileDragPayloads(dataTransfer);
    if (filePayloads.length > 0) {
      await this.dropFiles(filePayloads, targetGroupId);
      return;
    }

    const groupIds = this.readGroupDragIds(dataTransfer);
    if (groupIds.length > 0) {
      await this.dropGroups(groupIds, targetGroupId);
    }
  }

  private readFileDragPayloads(dataTransfer: vscode.DataTransfer): FileDragPayload[] {
    const objectTransfer = dataTransfer.get(FILE_DRAG_MIME);
    if (objectTransfer) {
      const fromObject = parseFilePayloads(objectTransfer.value);
      if (fromObject.length > 0) {
        return fromObject;
      }
    }

    const treeTransfer = getTreeTransferItem(dataTransfer);
    if (!treeTransfer) {
      return [];
    }

    const raw = treeTransfer.value;
    const sources = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const payloads: FileDragPayload[] = [];
    for (const item of sources) {
      const payload = getFileDragPayload(item);
      if (payload) {
        payloads.push(payload);
      }
    }
    return payloads;
  }

  private readGroupDragIds(dataTransfer: vscode.DataTransfer): string[] {
    const treeTransfer = getTreeTransferItem(dataTransfer);
    if (!treeTransfer) {
      return [];
    }

    const raw = treeTransfer.value;
    const sources = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return sources
      .map((item) => getGroupId(item))
      .filter((groupId): groupId is string => groupId !== undefined);
  }

  private resolveDropTargetGroupId(target: TreeElement | undefined): string | undefined {
    if (target instanceof GroupTreeItem) {
      return target.group.id;
    }
    if (target instanceof FileTreeItem) {
      return target.groupId;
    }
    if (typeof target === 'object' && target !== null) {
      const groupId = getGroupId(target);
      if (groupId) {
        return groupId;
      }
      const filePayload = getFileDragPayload(target);
      if (filePayload) {
        return filePayload.groupId;
      }
    }
    return undefined;
  }

  private async dropGroups(sourceGroupIds: string[], targetGroupId: string): Promise<void> {
    let moved = 0;
    for (const groupId of sourceGroupIds) {
      const success = await this.manager.moveGroupToParent(groupId, targetGroupId);
      if (success) {
        moved++;
      }
    }

    if (moved === 0) {
      return;
    }

    this.rememberExpanded(targetGroupId);
    this.refresh();
    const sourceLabel =
      moved === 1
        ? this.manager.getGroupPathLabel(sourceGroupIds[0])
        : `${moved} 个分组`;
    const targetLabel = this.manager.getGroupPathLabel(targetGroupId);
    vscode.window.setStatusBarMessage(`已将分组「${sourceLabel}」移动到「${targetLabel}」下`, 3000);
  }

  private async dropFiles(payloads: FileDragPayload[], targetGroupId: string): Promise<void> {
    const moved = await this.manager.moveFilesToGroup(
      payloads.map((payload) => ({
        sourceGroupId: payload.groupId,
        filePath: payload.path,
      })),
      targetGroupId,
    );

    if (moved === 0) {
      vscode.window.setStatusBarMessage('文件已在目标分组中，或未发生移动', 3000);
      return;
    }

    this.refresh();
    const targetLabel = this.manager.getGroupPathLabel(targetGroupId);
    vscode.window.setStatusBarMessage(`已将 ${moved} 个文件移动到「${targetLabel}」`, 3000);
  }

  getParent(element: TreeElement): TreeElement | undefined {
    if (element instanceof FileTreeItem) {
      return this.getGroupTreeItem(element.groupId);
    }

    const parentId = this.manager.getParentGroupId(element.group.id);
    if (parentId) {
      return this.getGroupTreeItem(parentId);
    }
    return undefined;
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      return this.manager.getRootGroups().map((group) => this.createGroupTreeItem(group));
    }

    if (element instanceof GroupTreeItem) {
      const childGroups = this.manager.getChildGroups(element.group.id).map((group) => this.createGroupTreeItem(group));
      const fileItems = await Promise.all(
        element.group.files.map(async (fileEntry) => {
          const exists = await fileExistenceCache.exists(fileEntry.path);
          return new FileTreeItem(element.group.id, fileEntry, exists);
        }),
      );

      return [...childGroups, ...fileItems];
    }

    return [];
  }

  getGroupTreeItem(groupId: string): GroupTreeItem | undefined {
    const group = this.manager.getGroup(groupId);
    if (!group) {
      return undefined;
    }
    return this.createGroupTreeItem(group);
  }

  private createGroupTreeItem(group: Group): GroupTreeItem {
    const suffix = this.manager.getGroupLabelSuffix(group);
    const isRegex = this.manager.isRegexGroup(group);
    const hasChildren = group.children.length > 0 || group.files.length > 0;
    const item = new GroupTreeItem(group, suffix, isRegex, hasChildren);

    if (this.expandedGroupIds.has(group.id) && hasChildren) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    return item;
  }
}

export function buildFileTreeItemId(groupId: string, relativePath: string): string {
  return `file:${groupId}::${relativePath}`;
}

function getTreeTransferItem(dataTransfer: vscode.DataTransfer): vscode.DataTransferItem | undefined {
  const direct = dataTransfer.get(TREE_VIEW_MIME);
  if (direct) {
    return direct;
  }

  let fallback: vscode.DataTransferItem | undefined;
  dataTransfer.forEach((item, mime) => {
    if (mime.startsWith('application/vnd.code.tree.')) {
      fallback = item;
    }
  });
  return fallback;
}

function getGroupId(item: unknown): string | undefined {
  if (item instanceof GroupTreeItem) {
    return item.group.id;
  }

  if (typeof item === 'object' && item !== null && 'group' in item) {
    const group = (item as { group?: { id?: unknown } }).group;
    if (group && typeof group.id === 'string') {
      return group.id;
    }
  }

  if (typeof item === 'object' && item !== null && 'id' in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' && id.startsWith('group:')) {
      return id.slice('group:'.length);
    }
  }

  return undefined;
}

function getFileDragPayload(item: unknown): FileDragPayload | undefined {
  if (item instanceof FileTreeItem) {
    return { groupId: item.groupId, path: item.relativePath };
  }

  if (typeof item === 'object' && item !== null) {
    const candidate = item as {
      groupId?: unknown;
      relativePath?: unknown;
      fileEntry?: { path?: unknown };
      id?: unknown;
    };
    const groupId = candidate.groupId;
    const path = candidate.relativePath ?? candidate.fileEntry?.path;
    if (typeof groupId === 'string' && typeof path === 'string') {
      return { groupId, path };
    }

    if (typeof candidate.id === 'string') {
      return parseFileTreeItemId(candidate.id);
    }
  }

  return undefined;
}

function parseFileTreeItemId(id: string): FileDragPayload | undefined {
  if (!id.startsWith('file:')) {
    return undefined;
  }

  const body = id.slice('file:'.length);
  const separatorIndex = body.indexOf('::');
  if (separatorIndex > 0) {
    return {
      groupId: body.slice(0, separatorIndex),
      path: body.slice(separatorIndex + 2),
    };
  }

  if (body.length >= 38 && body[36] === ':') {
    return {
      groupId: body.slice(0, 36),
      path: body.slice(37),
    };
  }

  return undefined;
}

function parseFilePayloads(value: unknown): FileDragPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (payload): payload is FileDragPayload =>
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as FileDragPayload).groupId === 'string' &&
      typeof (payload as FileDragPayload).path === 'string',
  );
}
