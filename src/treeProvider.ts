import * as vscode from 'vscode';
import { Group } from './types';
import { TabGroupsManager } from './tabGroupsManager';
import { fileExists } from './workspaceUtils';

export type TreeElement = GroupTreeItem | FileTreeItem;

export class GroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: Group,
    labelSuffix: string,
    isRegex: boolean,
  ) {
    super(`${group.name}${labelSuffix}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = isRegex ? 'groupRegex' : 'group';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.id = `group:${group.id}`;
  }
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: string,
    public readonly relativePath: string,
    exists: boolean,
  ) {
    const fileName = relativePath.split('/').pop() ?? relativePath;
    super(fileName, vscode.TreeItemCollapsibleState.None);
    this.description = exists ? relativePath : `${relativePath}（不存在）`;
    this.contextValue = exists ? 'file' : 'missingFile';
    this.iconPath = new vscode.ThemeIcon(
      'file',
      exists ? undefined : new vscode.ThemeColor('disabledForeground'),
    );
    this.id = `file:${groupId}:${relativePath}`;
    this.tooltip = relativePath;

    if (exists) {
      this.command = {
        command: 'tabGroups.openFile',
        title: '打开文件',
        arguments: [this],
      };
    }
  }
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
    return undefined;
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      return this.manager.getGroups().map((group) => {
        const suffix = this.manager.getGroupLabelSuffix(group);
        const isRegex = this.manager.isRegexGroup(group);
        const item = new GroupTreeItem(group, suffix, isRegex);
        if (this.expandedGroupIds.has(group.id)) {
          item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        return item;
      });
    }

    if (element instanceof GroupTreeItem) {
      const children: FileTreeItem[] = [];
      for (const filePath of element.group.files) {
        const exists = await fileExists(filePath);
        children.push(new FileTreeItem(element.group.id, filePath, exists));
      }
      return children;
    }

    return [];
  }

  getGroupTreeItem(groupId: string): GroupTreeItem | undefined {
    const group = this.manager.getGroup(groupId);
    if (!group) {
      return undefined;
    }
    const suffix = this.manager.getGroupLabelSuffix(group);
    const isRegex = this.manager.isRegexGroup(group);
    const item = new GroupTreeItem(group, suffix, isRegex);
    if (this.expandedGroupIds.has(group.id)) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    return item;
  }
}
