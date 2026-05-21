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
