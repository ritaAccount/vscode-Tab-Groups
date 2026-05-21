import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ensureWorkspaceShortcutSettings, syncKeybindingsFromSettings } from './shortcutUtils';
import { initializeShortcutSettings, registerShortcutsCommands } from './shortcutsWebview';
import { TabGroupsManager } from './tabGroupsManager';
import { GroupTreeItem, TabGroupsTreeProvider } from './treeProvider';
import { CONFIG_RELATIVE_PATH } from './types';
import { getWorkspaceInvalidMessage, isValidWorkspace } from './workspaceUtils';

let manager: TabGroupsManager | undefined;
let treeProvider: TabGroupsTreeProvider | undefined;
let treeViewRef: vscode.TreeView<GroupTreeItem | import('./treeProvider').FileTreeItem> | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;
let isReloadingFromDisk = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  manager = new TabGroupsManager();
  treeProvider = new TabGroupsTreeProvider(manager);

  const treeView = vscode.window.createTreeView('tabGroupsView', {
    treeDataProvider: treeProvider,
  });
  treeViewRef = treeView;

  treeView.onDidExpandElement((event) => {
    if (event.element instanceof GroupTreeItem && treeProvider) {
      treeProvider.rememberExpanded(event.element.group.id);
    }
  });

  treeView.onDidCollapseElement((event) => {
    if (event.element instanceof GroupTreeItem && treeProvider) {
      treeProvider.rememberCollapsed(event.element.group.id);
    }
  });

  updateTreeViewMessage();

  registerCommands(context, manager, treeProvider, treeView);
  registerShortcutsCommands(context);

  context.subscriptions.push(
    treeView,
    manager.onDidChange(() => {
      if (!isReloadingFromDisk) {
        treeProvider?.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      updateTreeViewMessage();
      await reloadAll(context);
      await initializeShortcutSettings();
      await syncKeybindingsFromSettings();
    }),
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (isConfigFile(doc.uri)) {
        await reloadFromDisk();
      }
    }),
  );

  await reloadAll(context);
  await initializeShortcutSettings();
  try {
    await syncKeybindingsFromSettings();
  } catch (error) {
    console.error('Tab Groups: 同步 keybindings.json 失败', error);
  }
}

export function deactivate(): void {
  configWatcher?.dispose();
  configWatcher = undefined;
  manager = undefined;
  treeProvider = undefined;
  treeViewRef = undefined;
}

async function reloadAll(context: vscode.ExtensionContext): Promise<void> {
  setupConfigWatcher(context);
  updateTreeViewMessage();

  if (!isValidWorkspace()) {
    treeProvider?.refresh();
    return;
  }

  await reloadFromDisk();
}

function updateTreeViewMessage(): void {
  if (!treeViewRef) {
    return;
  }
  treeViewRef.message = isValidWorkspace() ? undefined : getWorkspaceInvalidMessage();
}

async function reloadFromDisk(): Promise<void> {
  if (!manager) {
    return;
  }

  isReloadingFromDisk = true;
  try {
    await manager.load();
    treeProvider?.refresh();
  } finally {
    isReloadingFromDisk = false;
  }
}

function setupConfigWatcher(context: vscode.ExtensionContext): void {
  configWatcher?.dispose();
  configWatcher = undefined;

  if (!isValidWorkspace()) {
    return;
  }

  const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], CONFIG_RELATIVE_PATH);
  configWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handleExternalChange = async () => {
    await reloadFromDisk();
    vscode.window.setStatusBarMessage('标签分组配置已重新加载', 3000);
  };

  configWatcher.onDidChange(handleExternalChange);
  configWatcher.onDidCreate(handleExternalChange);
  configWatcher.onDidDelete(async () => {
    if (manager) {
      await manager.load();
      treeProvider?.refresh();
      vscode.window.setStatusBarMessage('标签分组配置文件已删除，已恢复默认结构', 3000);
    }
  });

  context.subscriptions.push(configWatcher);
}

function isConfigFile(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('tab-groups.json') || uri.path.endsWith(CONFIG_RELATIVE_PATH);
}
