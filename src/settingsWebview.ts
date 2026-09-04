import * as vscode from 'vscode';
import { DEFAULT_SHORTCUTS, ShortcutSettings } from './types';
import { ensureWorkspaceShortcutSettings, getShortcuts, saveShortcuts } from './shortcutUtils';
import { getWorkspaceInvalidMessage, isValidWorkspace } from './workspaceUtils';

let panel: vscode.WebviewPanel | undefined;

export function registerSettingsCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tabGroups.openSettings', () => {
      openSettingsWebview(context);
    }),
  );
}

function openSettingsWebview(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
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
      return;
    }

    if (message.type === 'reset') {
      postInit(panel!, { ...DEFAULT_SHORTCUTS });
      return;
    }

    if (message.type === 'save') {
      await handleSave(panel!, message.shortcuts as ShortcutSettings);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
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
      <button type="button" class="nav-item active" data-pane="shortcuts">快捷键</button>
    </nav>
    <main class="settings-content">
      <section class="settings-pane active" data-pane="shortcuts" id="pane-shortcuts">
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
          <span class="label">添加游标</span>
          <button id="addCursor" class="shortcut-button" type="button" data-shortcut="addCursor">ctrl+shift+l</button>
        </div>
        <div class="row">
          <span class="label">新建分组</span>
          <button id="createGroup" class="shortcut-button" type="button" data-shortcut="createGroup">ctrl+shift+u</button>
        </div>
        <div class="row">
          <span class="label">删除分组</span>
          <button id="deleteGroup" class="shortcut-button" type="button" data-shortcut="deleteGroup">ctrl+shift+p</button>
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
