export interface BaseConfig {
  type: 'manual' | 'regex';
}

export interface ManualConfig extends BaseConfig {
  type: 'manual';
}

export interface RegexConfig extends BaseConfig {
  type: 'regex';
  regex: string;
}

export type InlineConfig = ManualConfig | RegexConfig;

export type GlobalConfig = (ManualConfig | RegexConfig) & {
  id: string;
  description?: string;
};

export interface Group {
  id: string;
  name: string;
  level: number;
  children: string[];
  files: GroupFileEntry[];
  config?: InlineConfig;
  configId?: string;
}

export interface GroupFileEntry {
  path: string;
  alias: string;
  /**
   * 按类型分组的标记：
   * [{ type, content: [{ line, column, label, ... }] }, ...]
   */
  markers?: FileMarkerGroup[];
}

/** cursor=游标 | function=函数 | text=字符匹配（模糊定位） */
export type FileMarkerType = 'cursor' | 'function' | 'text';

/** 单条标记内容（不含 type，type 在分组上） */
export interface FileMarkerItem {
  label: string;
  line: number;
  column: number;
  /** function：符号名 */
  symbolName?: string;
  symbolKind?: number;
  /** text：匹配用的查询串 */
  query?: string;
}

export interface FileMarkerGroup {
  type: FileMarkerType;
  content: FileMarkerItem[];
}

/** 展平后的标记（树 / 跳转用） */
export interface FlatFileMarker {
  type: FileMarkerType;
  contentIndex: number;
  item: FileMarkerItem;
}

export interface TabGroupsData {
  version?: string;
  groups: Group[];
  configs: GlobalConfig[];
}

export const CONFIG_RELATIVE_PATH = '.vscode/tab-groups.json';

/** 标记跳转左下角提示：一直显示 | 按秒数消失 | 关闭 */
export type MarkerJumpHintMode = 'always' | 'timed' | 'off';

export interface DisplaySettings {
  markerJumpHintMode: MarkerJumpHintMode;
  /** mode 为 timed 时的显示秒数 */
  markerJumpHintSeconds: number;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  markerJumpHintMode: 'always',
  markerJumpHintSeconds: 1,
};

export interface ShortcutSettings {
  addToGroup: string;
  removeFromGroup: string;
  createGroup: string;
  deleteGroup: string;
  addCursor: string;
  addFunction: string;
  addText: string;
  prevCursor: string;
  nextCursor: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  addToGroup: 'ctrl+shift+i',
  removeFromGroup: 'ctrl+shift+o',
  createGroup: 'ctrl+shift+u',
  deleteGroup: 'ctrl+shift+p',
  addCursor: 'ctrl+shift+l',
  addFunction: 'ctrl+shift+;',
  addText: "ctrl+shift+'",
  prevCursor: 'ctrl+shift+[',
  nextCursor: 'ctrl+shift+]',
};

export const SHORTCUT_COMMANDS = {
  addToGroup: 'tabGroups.addToGroup',
  removeFromGroup: 'tabGroups.removeFromGroup',
  createGroup: 'tabGroups.createGroup',
  deleteGroup: 'tabGroups.deleteGroup',
  addCursor: 'tabGroups.addCursor',
  addFunction: 'tabGroups.addFunction',
  addText: 'tabGroups.addText',
  prevCursor: 'tabGroups.prevCursor',
  nextCursor: 'tabGroups.nextCursor',
} as const;

export const SHORTCUT_WHEN = {
  file: 'workspaceFolderCount == 1 && resourceScheme == file',
  fileEditor: 'workspaceFolderCount == 1 && resourceScheme == file && editorTextFocus',
  workspace: 'workspaceFolderCount == 1',
} as const;

export const MANAGED_SHORTCUT_COMMANDS = Object.values(SHORTCUT_COMMANDS);
