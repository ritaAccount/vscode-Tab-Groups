import * as vscode from 'vscode';
import { FileMarkerItem, FileMarkerType, FlatFileMarker, GroupFileEntry } from './types';
import { flattenMarkers, markerTypeLabel } from './fileEntryUtils';
import { getDisplaySettings } from './displaySettingsUtils';
import { toAbsoluteUri, toRelativePath } from './workspaceUtils';

let jumpHintItem: vscode.StatusBarItem | undefined;
let jumpHintTimer: ReturnType<typeof setTimeout> | undefined;
let jumpHintDeferTimer: ReturnType<typeof setTimeout> | undefined;

/** 在 activate 中注册，避免跳转时临时状态栏消息被编辑器切换清掉 */
export function registerMarkerJumpHint(context: vscode.ExtensionContext): void {
  jumpHintItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  jumpHintItem.name = 'Tab Groups 标记跳转';
  context.subscriptions.push(jumpHintItem);
  context.subscriptions.push({
    dispose: () => {
      if (jumpHintTimer) {
        clearTimeout(jumpHintTimer);
        jumpHintTimer = undefined;
      }
      if (jumpHintDeferTimer) {
        clearTimeout(jumpHintDeferTimer);
        jumpHintDeferTimer = undefined;
      }
    },
  });
}

export function getMatchingActiveEditor(relativePath: string): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const activePath = toRelativePath(editor.document.uri);
  return activePath === relativePath ? editor : undefined;
}

export function resolveMarkerFallbackPosition(
  item: FileMarkerItem,
  document: vscode.TextDocument,
): vscode.Position {
  const line = Math.max(0, Math.min(item.line, document.lineCount - 1));
  const maxColumn = document.lineAt(line).text.length;
  const column = Math.max(0, Math.min(item.column ?? 0, maxColumn));
  return new vscode.Position(line, column);
}

function flattenDocumentSymbols(
  symbols: vscode.DocumentSymbol[],
  parentPath = '',
): Array<{ symbol: vscode.DocumentSymbol; path: string }> {
  const result: Array<{ symbol: vscode.DocumentSymbol; path: string }> = [];
  for (const symbol of symbols) {
    const path = parentPath ? `${parentPath}.${symbol.name}` : symbol.name;
    result.push({ symbol, path });
    if (symbol.children?.length) {
      result.push(...flattenDocumentSymbols(symbol.children, path));
    }
  }
  return result;
}

interface FlatSymbol {
  name: string;
  path: string;
  kind: vscode.SymbolKind;
  /** 完整范围（含函数体） */
  range: vscode.Range;
  /** 名称范围 */
  selectionRange: vscode.Range;
}

/**
 * VS Code 的 executeDocumentSymbolProvider 常返回「继承 SymbolInformation、
 * 同时又带 children/selectionRange」的合并对象；不能用 instanceof DocumentSymbol 判断。
 */
function isDocumentSymbolLike(value: unknown): value is vscode.DocumentSymbol {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as {
    name?: unknown;
    kind?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    children?: unknown;
  };
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.kind === 'number' &&
    candidate.range instanceof vscode.Range &&
    candidate.selectionRange instanceof vscode.Range
  );
}

function flattenProviderSymbols(raw: unknown[], parentPath = ''): FlatSymbol[] {
  const result: FlatSymbol[] = [];

  for (const item of raw) {
    if (isDocumentSymbolLike(item)) {
      const path = parentPath ? `${parentPath}.${item.name}` : item.name;
      result.push({
        name: item.name,
        path,
        kind: item.kind,
        range: item.range,
        selectionRange: item.selectionRange,
      });
      if (Array.isArray(item.children) && item.children.length > 0) {
        result.push(...flattenProviderSymbols(item.children, path));
      }
      continue;
    }

    if (item instanceof vscode.SymbolInformation) {
      const path = parentPath
        ? `${parentPath}.${item.name}`
        : item.containerName
          ? `${item.containerName}.${item.name}`
          : item.name;
      result.push({
        name: item.name,
        path,
        kind: item.kind,
        range: item.location.range,
        selectionRange: item.location.range,
      });
    }
  }

  return result;
}

const FUNCTION_LIKE_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
]);

function pickEnclosingFunction(flat: FlatSymbol[], position: vscode.Position): FlatSymbol | undefined {
  const enclosing = flat
    .filter(
      (symbol) =>
        FUNCTION_LIKE_KINDS.has(symbol.kind) &&
        (symbol.range.contains(position) || symbol.selectionRange.contains(position)),
    )
    .sort((a, b) => {
      const aSize =
        (a.range.end.line - a.range.start.line) * 1000 + (a.range.end.character - a.range.start.character);
      const bSize =
        (b.range.end.line - b.range.start.line) * 1000 + (b.range.end.character - b.range.start.character);
      return aSize - bSize;
    });

  if (enclosing[0]) {
    return enclosing[0];
  }

  // 光标在函数名上但 range 未包住时：按同行 selectionRange 匹配
  const onName = flat.filter(
    (symbol) =>
      FUNCTION_LIKE_KINDS.has(symbol.kind) &&
      symbol.selectionRange.start.line === position.line &&
      symbol.selectionRange.start.character <= position.character &&
      symbol.selectionRange.end.character >= position.character,
  );
  return onName[0];
}

async function loadFlatSymbols(document: vscode.TextDocument): Promise<FlatSymbol[]> {
  const result = await vscode.commands.executeCommand<unknown[] | undefined>(
    'vscode.executeDocumentSymbolProvider',
    document.uri,
  );
  if (!result || result.length === 0) {
    return [];
  }
  return flattenProviderSymbols(result);
}

export async function resolveEnclosingFunctionSymbol(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<{ name: string; kind: vscode.SymbolKind; range: vscode.Range } | undefined> {
  try {
    const flat = await loadFlatSymbols(document);
    if (flat.length === 0) {
      return undefined;
    }

    let best = pickEnclosingFunction(flat, position);

    // 再兜底：取光标处单词，在符号名中精确匹配函数/方法
    if (!best) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][\w$]*/);
      const word = wordRange ? document.getText(wordRange) : '';
      if (word) {
        best =
          flat.find(
            (symbol) =>
              FUNCTION_LIKE_KINDS.has(symbol.kind) &&
              (symbol.name === word || symbol.path.endsWith(`.${word}`)),
          ) ?? undefined;
      }
    }

    if (!best) {
      return undefined;
    }

    return { name: best.path, kind: best.kind, range: best.selectionRange };
  } catch {
    return undefined;
  }
}

export async function resolveMarkerPosition(
  type: FileMarkerType,
  item: FileMarkerItem,
  document: vscode.TextDocument,
): Promise<vscode.Position> {
  if (type === 'function' && item.symbolName) {
    try {
      const flat = await loadFlatSymbols(document);
      const match =
        flat.find((symbol) => symbol.path === item.symbolName) ??
        flat.find((symbol) => symbol.name === item.symbolName);
      if (match) {
        return match.selectionRange.start;
      }
    } catch {
      // fall through
    }
  }

  if (type === 'text') {
    const query = (item.query || item.label || '').trim();
    if (query) {
      const found = findTextMatchPosition(document, query, item.line, item.column);
      if (found) {
        return found;
      }
    }
  }

  return resolveMarkerFallbackPosition(item, document);
}

/** 字符匹配：不区分大小写；优先靠近记录行；支持简单模糊（子序列） */
function findTextMatchPosition(
  document: vscode.TextDocument,
  query: string,
  preferLine: number,
  preferColumn: number,
): vscode.Position | undefined {
  const needle = query.toLowerCase();
  const lineCount = document.lineCount;
  const candidates: Array<{ line: number; column: number; score: number }> = [];

  for (let line = 0; line < lineCount; line++) {
    const text = document.lineAt(line).text;
    const lower = text.toLowerCase();
    const exact = lower.indexOf(needle);
    if (exact >= 0) {
      const dist = Math.abs(line - preferLine);
      candidates.push({ line, column: exact, score: dist * 10 });
      continue;
    }

    // 模糊：query 字符按顺序出现即可
    let qi = 0;
    let firstCol = -1;
    for (let i = 0; i < lower.length && qi < needle.length; i++) {
      if (lower[i] === needle[qi]) {
        if (firstCol < 0) {
          firstCol = i;
        }
        qi++;
      }
    }
    if (qi === needle.length && firstCol >= 0) {
      const dist = Math.abs(line - preferLine);
      candidates.push({ line, column: firstCol, score: dist * 10 + 5 });
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return Math.abs(a.column - preferColumn) - Math.abs(b.column - preferColumn);
  });

  return new vscode.Position(candidates[0].line, candidates[0].column);
}

export function resolveEntryPosition(
  entry: GroupFileEntry,
  document: vscode.TextDocument,
  flatIndex = 0,
): vscode.Position | undefined {
  const flat = flattenMarkers(entry.markers);
  if (flat.length === 0) {
    return undefined;
  }

  const marker = flat[Math.max(0, Math.min(flatIndex, flat.length - 1))];
  return resolveMarkerFallbackPosition(marker.item, document);
}

export async function openFileEntry(
  entry: GroupFileEntry,
  options?: { preserveFocus?: boolean; markerIndex?: number },
): Promise<boolean> {
  const uri = toAbsoluteUri(entry.path);
  if (!uri) {
    return false;
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const flat = flattenMarkers(entry.markers);
    let selection: vscode.Selection | undefined;
    let jumpedMarker: FlatFileMarker | undefined;
    if (flat.length > 0) {
      const index = options?.markerIndex ?? 0;
      const marker = flat[Math.max(0, Math.min(index, flat.length - 1))];
      jumpedMarker = marker;
      const position = await resolveMarkerPosition(marker.type, marker.item, document);
      selection = new vscode.Selection(position, position);
    }

    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options?.preserveFocus,
      selection,
    });
    if (jumpedMarker) {
      showMarkerJumpHint(jumpedMarker);
    }
    return true;
  } catch {
    return false;
  }
}

export async function openFileAtMarker(
  entry: GroupFileEntry,
  marker: FlatFileMarker,
  options?: { preserveFocus?: boolean },
): Promise<boolean> {
  const uri = toAbsoluteUri(entry.path);
  if (!uri) {
    return false;
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const position = await resolveMarkerPosition(marker.type, marker.item, document);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: options?.preserveFocus,
      selection: new vscode.Selection(position, position),
    });
    showMarkerJumpHint(marker);
    return true;
  } catch {
    return false;
  }
}

export async function revealMarkerInEditor(
  editor: vscode.TextEditor,
  marker: FlatFileMarker,
): Promise<void> {
  const position = await resolveMarkerPosition(marker.type, marker.item, editor.document);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  showMarkerJumpHint(marker);
}

/** 按当前显示配置立即调整状态栏可见性（保存设置后调用） */
export function applyMarkerJumpHintVisibility(): void {
  const { markerJumpHintMode } = getDisplaySettings();
  if (markerJumpHintMode === 'off') {
    if (jumpHintDeferTimer) {
      clearTimeout(jumpHintDeferTimer);
      jumpHintDeferTimer = undefined;
    }
    if (jumpHintTimer) {
      clearTimeout(jumpHintTimer);
      jumpHintTimer = undefined;
    }
    jumpHintItem?.hide();
  }
}

/** 跳转到标记时按显示配置更新左下角状态栏 */
export function showMarkerJumpHint(marker: FlatFileMarker): void {
  const { markerJumpHintMode, markerJumpHintSeconds } = getDisplaySettings();
  if (markerJumpHintMode === 'off') {
    if (jumpHintDeferTimer) {
      clearTimeout(jumpHintDeferTimer);
      jumpHintDeferTimer = undefined;
    }
    if (jumpHintTimer) {
      clearTimeout(jumpHintTimer);
      jumpHintTimer = undefined;
    }
    jumpHintItem?.hide();
    return;
  }

  const text = `$(bookmark) ${markerTypeLabel(marker.type)}：${marker.item.label}`;
  const durationMs =
    markerJumpHintMode === 'timed' ? Math.round(markerJumpHintSeconds * 1000) : undefined;

  if (jumpHintDeferTimer) {
    clearTimeout(jumpHintDeferTimer);
  }
  if (jumpHintTimer) {
    clearTimeout(jumpHintTimer);
    jumpHintTimer = undefined;
  }

  // 等树 → 编辑器焦点切换完成后再显示，否则可能被清掉
  jumpHintDeferTimer = setTimeout(() => {
    jumpHintDeferTimer = undefined;
    if (!jumpHintItem) {
      if (durationMs !== undefined) {
        vscode.window.setStatusBarMessage(text, durationMs);
      } else {
        vscode.window.setStatusBarMessage(text);
      }
      return;
    }
    jumpHintItem.text = text;
    jumpHintItem.tooltip = text.replace(/^\$\([^)]+\)\s*/, '');
    jumpHintItem.show();
    if (durationMs !== undefined) {
      jumpHintTimer = setTimeout(() => {
        jumpHintItem?.hide();
        jumpHintTimer = undefined;
      }, durationMs);
    }
  }, 50);
}

/** @deprecated */
export const openFileAtCursor = openFileAtMarker;
/** @deprecated */
export const revealCursorInEditor = revealMarkerInEditor;
/** @deprecated */
export const resolveCursorPosition = (
  item: FileMarkerItem,
  document: vscode.TextDocument,
): vscode.Position => resolveMarkerFallbackPosition(item, document);
