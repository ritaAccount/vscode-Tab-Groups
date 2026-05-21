import * as vscode from 'vscode';
import { fileExists, toAbsoluteUri, toRelativePath } from './workspaceUtils';

export async function openGroupFiles(files: string[]): Promise<{ opened: number; skipped: number }> {
  let opened = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const relativePath = files[i];
    const uri = toAbsoluteUri(relativePath);
    if (!uri || !(await fileExists(relativePath))) {
      skipped++;
      continue;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const isLast = i === files.length - 1;
      await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: !isLast,
      });
      opened++;
    } catch {
      skipped++;
    }
  }

  return { opened, skipped };
}

export async function closeGroupFiles(files: string[]): Promise<number> {
  const fileSet = new Set(files);
  const tabsToClose: vscode.Tab[] = [];

  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      const uri = getTabUri(tab);
      if (!uri) {
        continue;
      }

      const relativePath = toRelativePath(uri);
      if (relativePath && fileSet.has(relativePath)) {
        tabsToClose.push(tab);
      }
    }
  }

  if (tabsToClose.length === 0) {
    return 0;
  }

  await vscode.window.tabGroups.close(tabsToClose, true);
  return tabsToClose.length;
}

function getTabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}
