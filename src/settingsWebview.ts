import * as vscode from 'vscode';
import { CONFIG_VERSION } from './fileEntryUtils';
import { TabGroupsManager } from './tabGroupsManager';
import { CONFIG_RELATIVE_PATH, DEFAULT_SHORTCUTS, ShortcutSettings } from './types';
import { ensureWorkspaceShortcutSettings, getShortcuts, saveShortcuts } from './shortcutUtils';
import { getWorkspaceFolder, getWorkspaceInvalidMessage, isValidWorkspace } from './workspaceUtils';

let panel: vscode.WebviewPanel | undefined;
let settingsManager: TabGroupsManager | undefined;
let onConfigUpgraded: (() => void) | undefined;
let extensionVersion = 'unknown';

export function registerSettingsCommands(
  context: vscode.ExtensionContext,
  manager: TabGroupsManager,
  options?: { onConfigUpgraded?: () => void },
): void {
  settingsManager = manager;
  onConfigUpgraded = options?.onConfigUpgraded;
  extensionVersion =
    (context.extension.packageJSON as { version?: string }).version ?? 'unknown';

  context.subscriptions.push(
    vscode.commands.registerCommand('tabGroups.openSettings', () => {
      openSettingsWebview(context);
    }),
  );
}

function openSettingsWebview(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    postVersionInfo(panel);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'tabGroupsSettings',
    'Tab Groups 设置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    },
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'ready') {
      postInit(panel!, getShortcuts());
      postVersionInfo(panel!);
      return;
    }

    if (message.type === 'reset') {
      postInit(panel!, { ...DEFAULT_SHORTCUTS });
      return;
    }

    if (message.type === 'save') {
      await handleSave(panel!, message.shortcuts as ShortcutSettings);
      return;
    }

    if (message.type === 'openGroupsFile') {
      await openTabGroupsJson(panel!, 'groups');
      return;
    }

    if (message.type === 'openConfigsFile') {
      await openTabGroupsJson(panel!, 'configs');
      return;
    }

    if (message.type === 'upgradeConfig') {
      await handleUpgradeConfig(panel!);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function postVersionInfo(webviewPanel: vscode.WebviewPanel): void {
  webviewPanel.webview.postMessage({
    type: 'versionInfo',
    extensionVersion,
    configVersion: settingsManager?.getConfigVersion() ?? '（无）',
    schemaVersion: CONFIG_VERSION,
    needsUpgrade: settingsManager?.needsConfigUpgrade() ?? false,
  });
}

async function handleUpgradeConfig(webviewPanel: vscode.WebviewPanel): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: getWorkspaceInvalidMessage() || '请先打开单根工作区。',
    });
    return;
  }

  if (!settingsManager) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: '内部错误：配置管理器未初始化。',
    });
    return;
  }

  if (!settingsManager.needsConfigUpgrade()) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: `配置已是最新（schema ${CONFIG_VERSION}），无需更新。`,
    });
    postVersionInfo(webviewPanel);
    return;
  }

  try {
    const result = await settingsManager.upgradeConfigIfNeeded();
    await ensureWorkspaceShortcutSettings();
    onConfigUpgraded?.();
    postVersionInfo(webviewPanel);
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: result.upgraded
        ? `配置已从 ${result.from ?? '未知'} 升级到 ${result.to}。`
        : `配置已是最新（schema ${CONFIG_VERSION}）。`,
    });
    vscode.window.setStatusBarMessage('Tab Groups 配置已检查/升级', 3000);
  } catch (error) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: error instanceof Error ? error.message : '升级配置失败',
    });
  }
}

async function openTabGroupsJson(
  webviewPanel: vscode.WebviewPanel,
  section: 'groups' | 'configs',
): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: getWorkspaceInvalidMessage() || '请先打开单根工作区。',
    });
    return;
  }

  const folder = getWorkspaceFolder();
  if (!folder) {
    return;
  }

  const configUri = vscode.Uri.joinPath(folder.uri, CONFIG_RELATIVE_PATH);

  try {
    await vscode.workspace.fs.stat(configUri);
  } catch {
    const initial = Buffer.from(
      JSON.stringify({ version: CONFIG_VERSION, groups: [], configs: [] }, null, 2),
      'utf8',
    );
    await vscode.workspace.fs.writeFile(configUri, initial);
  }

  const doc = await vscode.workspace.openTextDocument(configUri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  const marker = section === 'groups' ? '"groups"' : '"configs"';
  const index = doc.getText().indexOf(marker);
  if (index >= 0) {
    const position = doc.positionAt(index);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  webviewPanel.webview.postMessage({
    type: 'generalStatus',
    text:
      section === 'groups'
        ? '已打开分组配置文件（.vscode/tab-groups.json → groups）。'
        : '已打开正则规则配置（.vscode/tab-groups.json → configs）。',
  });
}

async function handleSave(
  webviewPanel: vscode.WebviewPanel,
  shortcuts: ShortcutSettings,
): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'error',
      text: getWorkspaceInvalidMessage() || '请先打开单根工作区后再保存。',
    });
    return;
  }

  try {
    await saveShortcuts(shortcuts);
    webviewPanel.webview.postMessage({
      type: 'saved',
      shortcuts,
      text: '快捷键已保存，并已同步到 keybindings.json。',
    });
    vscode.window.setStatusBarMessage('Tab Groups 快捷键已更新', 3000);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_FORMAT') {
      webviewPanel.webview.postMessage({
        type: 'error',
        text: '快捷键格式无效，请重新录入。',
      });
      return;
    }
    webviewPanel.webview.postMessage({
      type: 'error',
      text: error instanceof Error ? error.message : '保存失败',
    });
  }
}

function postInit(webviewPanel: vscode.WebviewPanel, shortcuts: ShortcutSettings): void {
  webviewPanel.webview.postMessage({
    type: 'init',
    shortcuts,
    isMac: process.platform === 'darwin',
  });
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const settingsStyleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'settings.css'),
  );
  const shortcutsStyleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'shortcuts.css'),
  );
  const settingsScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'settings.js'),
  );
  const shortcutsScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'shortcuts.js'),
  );
  const cspSource = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource}; script-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${settingsStyleUri}" rel="stylesheet">
  <link href="${shortcutsStyleUri}" rel="stylesheet">
  <title>Tab Groups 设置</title>
</head>
<body>
  <div class="settings-layout">
    <nav class="settings-nav" aria-label="设置分类">
      <button type="button" class="nav-item active" data-pane="general">通用</button>
      <button type="button" class="nav-item" data-pane="shortcuts">快捷键</button>
    </nav>
    <main class="settings-content">
      <section class="settings-pane active" data-pane="general" id="pane-general">
        <h1>通用</h1>
        <p class="hint">分组与全局正则规则都保存在工作区的 <code>.vscode/tab-groups.json</code> 中，可分别定位到对应区块。</p>

        <div class="setting-item">
          <div class="setting-text">
            <div class="setting-title">分组配置文件</div>
            <div class="setting-desc">打开记录分组信息的 JSON（定位到 groups）</div>
          </div>
          <button type="button" class="primary" id="openGroupsFile">打开</button>
        </div>

        <div class="setting-item">
          <div class="setting-text">
            <div class="setting-title">正则规则配置</div>
            <div class="setting-desc">打开全局正则规则（定位到 configs）</div>
          </div>
          <button type="button" class="primary" id="openConfigsFile">打开</button>
        </div>

        <div class="setting-item">
          <div class="setting-text">
            <div class="setting-title">配置版本更新</div>
            <div class="setting-desc" id="versionDesc">检查并升级 tab-groups.json schema</div>
          </div>
          <button type="button" class="primary" id="upgradeConfig">检查更新</button>
        </div>

        <div id="generalStatus" class="status"></div>
      </section>

      <section class="settings-pane" data-pane="shortcuts" id="pane-shortcuts">
        <h1>快捷键</h1>
        <p class="hint">点击快捷键框后按下组合键录入。保存后会写入当前工作区的 .vscode/settings.json，并同步到 keybindings.json。</p>

        <div class="row">
          <span class="label">加入分组</span>
          <button id="addToGroup" class="shortcut-button" type="button" data-shortcut="addToGroup">ctrl+shift+i</button>
        </div>
        <div class="row">
          <span class="label">取消分组</span>
          <button id="removeFromGroup" class="shortcut-button" type="button" data-shortcut="removeFromGroup">ctrl+shift+o</button>
        </div>
        <div class="row">
          <span class="label">新建分组</span>
          <button id="createGroup" class="shortcut-button" type="button" data-shortcut="createGroup">ctrl+shift+u</button>
        </div>
        <div class="row">
          <span class="label">删除分组</span>
          <button id="deleteGroup" class="shortcut-button" type="button" data-shortcut="deleteGroup">ctrl+shift+p</button>
        </div>
        <div class="row">
          <span class="label">添加游标</span>
          <button id="addCursor" class="shortcut-button" type="button" data-shortcut="addCursor">ctrl+shift+l</button>
        </div>
        <div class="row">
          <span class="label">上一游标</span>
          <button id="prevCursor" class="shortcut-button" type="button" data-shortcut="prevCursor">ctrl+shift+[</button>
        </div>
        <div class="row">
          <span class="label">下一游标</span>
          <button id="nextCursor" class="shortcut-button" type="button" data-shortcut="nextCursor">ctrl+shift+]</button>
        </div>

        <div id="status" class="status"></div>

        <div class="actions">
          <button id="save" class="primary" type="button">保存</button>
          <button id="reset" class="secondary" type="button">恢复默认</button>
        </div>

        <div class="warning">
          保存需要已打开单根工作区。快捷键会写入用户 keybindings.json；若文件中已有注释，同步时可能被移除。
        </div>
      </section>
    </main>
  </div>

  <script src="${settingsScriptUri}"></script>
  <script src="${shortcutsScriptUri}"></script>
</body>
</html>`;
}

export async function initializeShortcutSettings(): Promise<void> {
  await ensureWorkspaceShortcutSettings();
}
