import * as vscode from 'vscode';
import { GroupFileEntry } from './types';
import { toAbsoluteUri, toRelativePath } from './workspaceUtils';

export function getMatchingActiveEditor(relativePath: string): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const activePath = toRelativePath(editor.document.uri);
  return activePath === relativePath ? editor : undefined;
}

export function resolveEntryPosition(
  entry: GroupFileEntry,
  document: vscode.TextDocument,
): vscode.Position | undefined {
  if (entry.line === undefined) {
    return undefined;
  }

  const line = Math.max(0, Math.min(entry.line, document.lineCount - 1));
  const maxColumn = document.lineAt(line).text.length;
  const column = Math.max(0, Math.min(entry.column ?? 0, maxColumn));
  return new vscode.Position(line, column);
}

export async function openFileEntry(
  entry: GroupFileEntry,
  options?: { preserveFocus?: boolean },
): Promise<boolean> {
  const uri = toAbsoluteUri(entry.path);
  if (!uri) {
    return false;
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const position = resolveEntryPosition(entry, document);
    const selection = position ? new vscode.Selection(position, position) : undefined;

    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options?.preserveFocus,
      selection,
    });
    return true;
  } catch {
    return false;
  }
}
