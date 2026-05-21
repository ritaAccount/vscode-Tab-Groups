import * as vscode from 'vscode';
import { Group, GroupFileEntry } from './types';
import { TabGroupsManager } from './tabGroupsManager';
import { fileExists } from './workspaceUtils';

export type TreeElement = GroupTreeItem | FileTreeItem;

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
    this.description = exists ? fileEntry.path : `${fileEntry.path}（不存在）`;
    this.contextValue = exists ? 'file' : 'missingFile';
    this.iconPath = new vscode.ThemeIcon(
      'file',
      exists ? undefined : new vscode.ThemeColor('disabledForeground'),
    );
    this.id = `file:${groupId}:${fileEntry.path}`;
    this.tooltip = fileEntry.path;

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

export class TabGroupsTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

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
      const fileItems: FileTreeItem[] = [];

      for (const fileEntry of element.group.files) {
        const exists = await fileExists(fileEntry.path);
        fileItems.push(new FileTreeItem(element.group.id, fileEntry, exists));
      }

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
