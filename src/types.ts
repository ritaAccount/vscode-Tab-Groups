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
  cursors?: FileCursor[];
}

export interface FileCursor {
  /** 0-based line number */
  line: number;
  /** 0-based column number */
  column: number;
  label: string;
}

export interface TabGroupsData {
  version?: string;
  groups: Group[];
  configs: GlobalConfig[];
}

export const CONFIG_RELATIVE_PATH = '.vscode/tab-groups.json';

export interface ShortcutSettings {
  addToGroup: string;
  removeFromGroup: string;
  createGroup: string;
  deleteGroup: string;
  addCursor: string;
  prevCursor: string;
  nextCursor: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  addToGroup: 'ctrl+shift+i',
  removeFromGroup: 'ctrl+shift+o',
  createGroup: 'ctrl+shift+u',
  deleteGroup: 'ctrl+shift+p',
  addCursor: 'ctrl+shift+l',
  prevCursor: 'ctrl+shift+[',
  nextCursor: 'ctrl+shift+]',
};

export const SHORTCUT_COMMANDS = {
  addToGroup: 'tabGroups.addToGroup',
  removeFromGroup: 'tabGroups.removeFromGroup',
  createGroup: 'tabGroups.createGroup',
  deleteGroup: 'tabGroups.deleteGroup',
  addCursor: 'tabGroups.addCursor',
  prevCursor: 'tabGroups.prevCursor',
  nextCursor: 'tabGroups.nextCursor',
} as const;

export const SHORTCUT_WHEN = {
  file: 'workspaceFolderCount == 1 && resourceScheme == file',
  fileEditor: 'workspaceFolderCount == 1 && resourceScheme == file && editorTextFocus',
  workspace: 'workspaceFolderCount == 1',
} as const;

export const MANAGED_SHORTCUT_COMMANDS = Object.values(SHORTCUT_COMMANDS);
