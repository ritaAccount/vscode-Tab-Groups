import * as vscode from 'vscode';

export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length !== 1) {
    return undefined;
  }
  return folders[0];
}

export function isValidWorkspace(): boolean {
  return getWorkspaceFolder() !== undefined;
}

export function getWorkspaceInvalidMessage(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return '请先打开一个工作区文件夹。';
  }
  if (folders.length > 1) {
    return 'Tab Groups 目前仅支持单根工作区，请打开仅包含一个根文件夹的工作区。';
  }
  return '';
}

export async function ensureValidWorkspace(): Promise<vscode.WorkspaceFolder | undefined> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    await vscode.window.showWarningMessage(getWorkspaceInvalidMessage());
    return undefined;
  }
  return folder;
}

export function toRelativePath(uri: vscode.Uri): string | undefined {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return undefined;
  }
  const relative = vscode.workspace.asRelativePath(uri, false);
  if (relative.startsWith('/') || relative.includes('://')) {
    return undefined;
  }
  return relative;
}

export function toAbsoluteUri(relativePath: string): vscode.Uri | undefined {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return undefined;
  }
  return vscode.Uri.joinPath(folder.uri, relativePath);
}

export async function fileExists(relativePath: string): Promise<boolean> {
  const uri = toAbsoluteUri(relativePath);
  if (!uri) {
    return false;
  }
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
