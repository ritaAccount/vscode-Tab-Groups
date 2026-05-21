import * as vscode from 'vscode';
import { closeGroupFiles, openGroupFiles } from './groupEditorUtils';
import { TabGroupsManager } from './tabGroupsManager';
import { FileTreeItem, GroupTreeItem, TabGroupsTreeProvider } from './treeProvider';
import {
  ensureValidWorkspace,
  toAbsoluteUri,
  toRelativePath,
} from './workspaceUtils';

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: TabGroupsManager,
  treeProvider: TabGroupsTreeProvider,
  treeView: vscode.TreeView<GroupTreeItem | FileTreeItem>,
): void {
  const register = (command: string, callback: (...args: any[]) => any) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register('tabGroups.createGroup', async () => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: '请输入分组名称',
      placeHolder: '例如：我的手动分组',
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!name) {
      return;
    }

    await manager.createGroup(name.trim());
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已创建分组「${name.trim()}」`, 3000);
  });

  register('tabGroups.deleteGroup', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    let group = resolveGroupItem(item, treeView)?.group;
    if (!group) {
      const groups = manager.getGroups();
      if (groups.length === 0) {
        await vscode.window.showInformationMessage('暂无分组可删除。');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        groups.map((entry) => ({ label: entry.name, group: entry })),
        { placeHolder: '选择要删除的分组' },
      );
      if (!picked) {
        return;
      }
      group = picked.group;
    }

    const confirm = await vscode.window.showWarningMessage(
      `确定要删除分组「${group.name}」吗？`,
      { modal: true },
      '删除',
    );
    if (confirm !== '删除') {
      return;
    }

    const configId = await manager.deleteGroup(group.id);
    treeProvider.rememberCollapsed(group.id);

    if (configId && !manager.isConfigReferenced(configId)) {
      const globalConfig = manager.getConfig(configId);
      const configLabel = globalConfig?.description ?? configId;
      const deleteConfig = await vscode.window.showWarningMessage(
        `全局配置「${configLabel}」不再被任何分组引用，是否一并删除？`,
        '删除配置',
        '保留配置',
      );
      if (deleteConfig === '删除配置') {
        await manager.deleteGlobalConfig(configId);
      }
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已删除分组「${group.name}」`, 3000);
  });

  register('tabGroups.renameGroup', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const newName = await vscode.window.showInputBox({
      prompt: '请输入新的分组名称',
      value: groupItem.group.name,
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!newName) {
      return;
    }

    await manager.renameGroup(groupItem.group.id, newName.trim());
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组已重命名为「${newName.trim()}」`, 3000);
  });

  register('tabGroups.expandAll', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const { files, name } = groupItem.group;
    if (files.length === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有文件。`);
      return;
    }

    const { opened, skipped } = await openGroupFiles(files);
    if (opened === 0) {
      await vscode.window.showWarningMessage(`分组「${name}」中没有可打开的文件。`);
      return;
    }

    const skipHint = skipped > 0 ? `，跳过 ${skipped} 个不可用文件` : '';
    vscode.window.setStatusBarMessage(`已打开分组「${name}」中的 ${opened} 个文件${skipHint}`, 3000);
  });

  register('tabGroups.collapseAll', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const { files, name } = groupItem.group;
    if (files.length === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有文件。`);
      return;
    }

    const closed = await closeGroupFiles(files);
    if (closed === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有已打开的标签页。`);
      return;
    }

    vscode.window.setStatusBarMessage(`已关闭分组「${name}」中的 ${closed} 个标签页`, 3000);
  });

  register('tabGroups.setManual', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    await manager.clearGroupConfig(groupItem.group.id);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已设置为手动模式`, 3000);
  });

  register('tabGroups.setRegex', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const regex = await vscode.window.showInputBox({
      prompt: '请输入正则表达式（匹配文件相对路径）',
      placeHolder: String.raw`.*/components/.*\.tsx$`,
      value: manager.getRegexPattern(groupItem.group) ?? '',
      validateInput: (value) => {
        if (!value.trim()) {
          return '正则表达式不能为空';
        }
        return manager.validateRegex(value.trim()) ? undefined : '无效的正则表达式';
      },
    });
    if (!regex) {
      return;
    }

    await manager.setGroupConfig(groupItem.group.id, { type: 'regex', regex: regex.trim() });
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已设置内嵌正则配置`, 3000);
  });

  register('tabGroups.setGlobalConfig', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const configs = manager.getConfigs();
    if (configs.length === 0) {
      await vscode.window.showInformationMessage('暂无全局配置，请先通过「管理全局配置」创建。');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      configs.map((config) => ({
        label: config.id,
        description: config.description ?? (config.type === 'regex' ? config.regex : '手动'),
        configId: config.id,
      })),
      { placeHolder: '选择要引用的全局配置' },
    );
    if (!picked) {
      return;
    }

    await manager.setGroupConfigId(groupItem.group.id, picked.configId);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已引用全局配置「${picked.configId}」`, 3000);
  });

  register('tabGroups.manageGlobalConfigs', async () => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const configUri = manager.getConfigFileUri();
    if (!configUri) {
      return;
    }

    const doc = await vscode.workspace.openTextDocument(configUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    const text = doc.getText();
    const configsIndex = text.indexOf('"configs"');
    if (configsIndex >= 0) {
      const position = doc.positionAt(configsIndex);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  });

  register('tabGroups.scanFiles', async (item?: GroupTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const groupItem = resolveGroupItem(item, treeView);
    if (!groupItem) {
      return;
    }

    const pattern = manager.getRegexPattern(groupItem.group);
    if (!pattern) {
      await vscode.window.showWarningMessage('当前分组未配置有效的正则表达式。');
      return;
    }

    const regex = manager.validateRegex(pattern);
    if (!regex) {
      await vscode.window.showErrorMessage('正则表达式无效，请重新设置。');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在扫描分组「${groupItem.group.name}」`,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: '正在查找工作区文件...' });

        const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
        if (token.isCancellationRequested) {
          return;
        }

        const matched: string[] = [];
        for (const uri of uris) {
          if (token.isCancellationRequested) {
            return;
          }
          const relativePath = vscode.workspace.asRelativePath(uri, false);
          if (!relativePath.startsWith('/') && !relativePath.includes('://') && regex.test(relativePath)) {
            matched.push(relativePath);
          }
        }

        matched.sort();
        await manager.updateGroupFiles(groupItem.group.id, matched);
        treeProvider.refresh();
        vscode.window.setStatusBarMessage(
          `分组「${groupItem.group.name}」扫描完成，共 ${matched.length} 个文件`,
          3000,
        );
      },
    );
  });

  register('tabGroups.openFile', async (item?: FileTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder || !item) {
      return;
    }

    const uri = toAbsoluteUri(item.relativePath);
    if (!uri) {
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch {
      await vscode.window.showErrorMessage(`无法打开文件：${item.relativePath}`);
    }
  });

  register('tabGroups.removeFile', async (item?: FileTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder || !item) {
      return;
    }

    await manager.removeFileFromGroup(item.groupId, item.relativePath);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已从分组中移除 ${item.relativePath}`, 3000);
  });

  register('tabGroups.copyPath', async (item?: FileTreeItem) => {
    const folder = await ensureValidWorkspace();
    if (!folder || !item) {
      return;
    }

    await vscode.env.clipboard.writeText(item.relativePath);
    vscode.window.setStatusBarMessage(`已复制路径：${item.relativePath}`, 3000);
  });

  register('tabGroups.addToGroup', async (uri?: vscode.Uri) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await vscode.window.showWarningMessage('没有可加入分组的文件。');
      return;
    }

    const relativePath = toRelativePath(targetUri);
    if (!relativePath) {
      await vscode.window.showWarningMessage('只能将工作区内的文件加入分组。');
      return;
    }

    const groups = manager.getGroups();
    if (groups.length === 0) {
      await vscode.window.showInformationMessage('暂无分组，请先在侧边栏创建分组。');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      groups.map((group) => ({ label: group.name, groupId: group.id })),
      { placeHolder: '选择要加入的分组' },
    );
    if (!picked) {
      return;
    }

    const added = await manager.addFileToGroup(picked.groupId, relativePath);
    treeProvider.refresh();
    if (added) {
      vscode.window.setStatusBarMessage(`已将 ${relativePath} 加入分组「${picked.label}」`, 3000);
    } else {
      vscode.window.setStatusBarMessage(`文件已在分组「${picked.label}」中`, 3000);
    }
  });

  register('tabGroups.removeFromGroup', async (uri?: vscode.Uri) => {
    const folder = await ensureValidWorkspace();
    if (!folder) {
      return;
    }

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await vscode.window.showWarningMessage('没有可取消分组的文件。');
      return;
    }

    const relativePath = toRelativePath(targetUri);
    if (!relativePath) {
      await vscode.window.showWarningMessage('只能操作工作区内的文件。');
      return;
    }

    const groups = manager.getGroupsContainingFile(relativePath);
    if (groups.length === 0) {
      await vscode.window.showInformationMessage('当前文件不属于任何分组。');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      [
        { label: '全部分组', description: '一次性从所有分组中移除', groupId: '__all__' },
        ...groups.map((group) => ({ label: group.name, groupId: group.id })),
      ],
      { placeHolder: '选择要退出的分组' },
    );
    if (!picked) {
      return;
    }

    if (picked.groupId === '__all__') {
      const count = await manager.removeFileFromAllGroups(relativePath);
      treeProvider.refresh();
      vscode.window.setStatusBarMessage(`已将 ${relativePath} 从 ${count} 个分组中移除`, 3000);
      return;
    }

    await manager.removeFileFromGroup(picked.groupId, relativePath);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已将 ${relativePath} 从分组「${picked.label}」中移除`, 3000);
  });
}

function resolveGroupItem(
  item: GroupTreeItem | undefined,
  treeView: vscode.TreeView<GroupTreeItem | FileTreeItem>,
): GroupTreeItem | undefined {
  if (item instanceof GroupTreeItem) {
    return item;
  }
  const selection = treeView.selection[0];
  if (selection instanceof GroupTreeItem) {
    return selection;
  }
  return undefined;
}
