import * as vscode from 'vscode';
import {
  CONFIG_RELATIVE_PATH,
  GlobalConfig,
  Group,
  InlineConfig,
  ManualConfig,
  RegexConfig,
  TabGroupsData,
} from './types';
import { getWorkspaceFolder } from './workspaceUtils';

const DEFAULT_MANUAL_CONFIG: ManualConfig = { type: 'manual' };

export class TabGroupsManager {
  private data: TabGroupsData = { groups: [], configs: [] };
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private getConfigUri(): vscode.Uri | undefined {
    const folder = getWorkspaceFolder();
    if (!folder) {
      return undefined;
    }
    return vscode.Uri.joinPath(folder.uri, CONFIG_RELATIVE_PATH);
  }

  async load(): Promise<void> {
    const uri = this.getConfigUri();
    if (!uri) {
      this.data = { groups: [], configs: [] };
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(content).toString('utf8')) as TabGroupsData;
      this.data = {
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        configs: Array.isArray(parsed.configs) ? parsed.configs : [],
      };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        this.data = { groups: [], configs: [] };
        await this.save();
        return;
      }
      this.data = { groups: [], configs: [] };
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`读取标签分组配置失败：${message}`);
    }
  }

  async save(): Promise<void> {
    const uri = this.getConfigUri();
    if (!uri) {
      return;
    }

    const dirUri = vscode.Uri.joinPath(uri, '..');
    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch {
      // directory may already exist
    }

    const content = JSON.stringify(this.data, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    this.onDidChangeEmitter.fire();
  }

  getGroups(): Group[] {
    return this.data.groups;
  }

  getConfigs(): GlobalConfig[] {
    return this.data.configs;
  }

  getGroup(id: string): Group | undefined {
    return this.data.groups.find((g) => g.id === id);
  }

  getConfig(id: string): GlobalConfig | undefined {
    return this.data.configs.find((c) => c.id === id);
  }

  getEffectiveConfig(group: Group): InlineConfig {
    if (group.config) {
      return group.config;
    }
    if (group.configId) {
      const globalConfig = this.getConfig(group.configId);
      if (globalConfig) {
        if (globalConfig.type === 'regex') {
          return { type: 'regex', regex: globalConfig.regex };
        }
        return { type: 'manual' };
      }
    }
    return DEFAULT_MANUAL_CONFIG;
  }

  async createGroup(name: string): Promise<Group> {
    const group: Group = {
      id: crypto.randomUUID(),
      name,
      files: [],
    };
    this.data.groups.push(group);
    await this.save();
    return group;
  }

  async deleteGroup(id: string): Promise<string | undefined> {
    const group = this.getGroup(id);
    const configId = group?.configId;
    this.data.groups = this.data.groups.filter((g) => g.id !== id);
    await this.save();
    return configId;
  }

  isConfigReferenced(configId: string): boolean {
    return this.data.groups.some((g) => g.configId === configId);
  }

  async renameGroup(id: string, newName: string): Promise<void> {
    const group = this.getGroup(id);
    if (!group) {
      return;
    }
    group.name = newName;
    await this.save();
  }

  async addFileToGroup(groupId: string, filePath: string): Promise<boolean> {
    const group = this.getGroup(groupId);
    if (!group) {
      return false;
    }
    if (group.files.includes(filePath)) {
      return false;
    }
    group.files.push(filePath);
    await this.save();
    return true;
  }

  async removeFileFromGroup(groupId: string, filePath: string): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.files = group.files.filter((f) => f !== filePath);
    await this.save();
  }

  async setGroupConfig(groupId: string, config: InlineConfig): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.config = config;
    delete group.configId;
    await this.save();
  }

  async setGroupConfigId(groupId: string, configId: string): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.configId = configId;
    delete group.config;
    await this.save();
  }

  async clearGroupConfig(groupId: string): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    delete group.config;
    delete group.configId;
    await this.save();
  }

  async createGlobalConfig(config: Omit<GlobalConfig, 'id'> & { id?: string }): Promise<GlobalConfig> {
    const globalConfig: GlobalConfig = {
      ...config,
      id: config.id ?? crypto.randomUUID(),
    } as GlobalConfig;
    this.data.configs.push(globalConfig);
    await this.save();
    return globalConfig;
  }

  async deleteGlobalConfig(id: string): Promise<void> {
    this.data.configs = this.data.configs.filter((c) => c.id !== id);
    await this.save();
  }

  async updateGroupFiles(groupId: string, files: string[]): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.files = files;
    await this.save();
  }

  getGroupsContainingFile(filePath: string): Group[] {
    return this.data.groups.filter((g) => g.files.includes(filePath));
  }

  getConfigFileUri(): vscode.Uri | undefined {
    const folder = getWorkspaceFolder();
    if (!folder) {
      return undefined;
    }
    return vscode.Uri.joinPath(folder.uri, CONFIG_RELATIVE_PATH);
  }

  getGroupLabelSuffix(group: Group): string {
    if (group.config) {
      return group.config.type === 'regex' ? '（正则）' : '（手动）';
    }
    if (group.configId) {
      const config = this.getConfig(group.configId);
      return config ? `（引用：${config.id}）` : '（引用：未知配置）';
    }
    return '（手动）';
  }

  isRegexGroup(group: Group): boolean {
    const config = this.getEffectiveConfig(group);
    return config.type === 'regex';
  }

  getRegexPattern(group: Group): string | undefined {
    const config = this.getEffectiveConfig(group);
    if (config.type === 'regex') {
      return (config as RegexConfig).regex;
    }
    return undefined;
  }

  validateRegex(pattern: string): RegExp | undefined {
    try {
      return new RegExp(pattern);
    } catch {
      return undefined;
    }
  }
}
