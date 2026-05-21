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
  files: string[];
  config?: InlineConfig;
  configId?: string;
}

export interface TabGroupsData {
  groups: Group[];
  configs: GlobalConfig[];
}

export const CONFIG_RELATIVE_PATH = '.vscode/tab-groups.json';

export interface ShortcutSettings {
  addToGroup: string;
  removeFromGroup: string;
  createGroup: string;
  deleteGroup: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  addToGroup: 'ctrl+shift+i',
  removeFromGroup: 'ctrl+shift+o',
  createGroup: 'ctrl+shift+u',
  deleteGroup: 'ctrl+shift+p',
};

export const SHORTCUT_COMMANDS = {
  addToGroup: 'tabGroups.addToGroup',
  removeFromGroup: 'tabGroups.removeFromGroup',
  createGroup: 'tabGroups.createGroup',
  deleteGroup: 'tabGroups.deleteGroup',
} as const;

export const SHORTCUT_WHEN = {
  file: 'workspaceFolderCount == 1 && resourceScheme == file',
  workspace: 'workspaceFolderCount == 1',
} as const;

export const MANAGED_SHORTCUT_COMMANDS = Object.values(SHORTCUT_COMMANDS);
