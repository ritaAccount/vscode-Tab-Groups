import * as vscode from 'vscode';
import { FileCursor, GroupFileEntry } from './types';
import { toAbsoluteUri, toRelativePath } from './workspaceUtils';

export function getMatchingActiveEditor(relativePath: string): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const activePath = toRelativePath(editor.document.uri);
  return activePath === relativePath ? editor : undefined;
}

export function resolveCursorPosition(
  cursor: FileCursor,
  document: vscode.TextDocument,
): vscode.Position {
  const line = Math.max(0, Math.min(cursor.line, document.lineCount - 1));
  const maxColumn = document.lineAt(line).text.length;
  const column = Math.max(0, Math.min(cursor.column ?? 0, maxColumn));
  return new vscode.Position(line, column);
}

export function resolveEntryPosition(
  entry: GroupFileEntry,
  document: vscode.TextDocument,
  cursorIndex = 0,
): vscode.Position | undefined {
  const cursors = entry.cursors;
  if (!cursors || cursors.length === 0) {
    return undefined;
  }

  const cursor = cursors[Math.max(0, Math.min(cursorIndex, cursors.length - 1))];
  return resolveCursorPosition(cursor, document);
}

export async function openFileEntry(
  entry: GroupFileEntry,
  options?: { preserveFocus?: boolean; cursorIndex?: number },
): Promise<boolean> {
  const uri = toAbsoluteUri(entry.path);
  if (!uri) {
    return false;
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const position = resolveEntryPosition(entry, document, options?.cursorIndex ?? 0);
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

export async function openFileAtCursor(
  entry: GroupFileEntry,
  cursor: FileCursor,
  options?: { preserveFocus?: boolean },
): Promise<boolean> {
  const uri = toAbsoluteUri(entry.path);
  if (!uri) {
    return false;
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const position = resolveCursorPosition(cursor, document);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options?.preserveFocus,
      selection: new vscode.Selection(position, position),
    });
    return true;
  } catch {
    return false;
  }
}

export async function revealCursorInEditor(
  editor: vscode.TextEditor,
  cursor: FileCursor,
): Promise<void> {
  const position = resolveCursorPosition(cursor, editor.document);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
