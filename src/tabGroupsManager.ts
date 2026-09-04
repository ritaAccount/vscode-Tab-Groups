import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
  buildScannedFiles,
  CONFIG_VERSION,
  defaultAliasFromPath,
  defaultCursorLabel,
  groupContainsPath,
  isVersionLessThan,
  normalizeGroupFiles,
} from './fileEntryUtils';
import {
  collectAllFilePaths,
  collectAllFileEntries,
  collectDescendantIds,
  createEmptyGroup,
  findParentGroupId,
  getChildGroups,
  getGroupPathLabel,
  getRootGroups,
  isDescendantOf,
  needsHierarchyMigration,
  normalizeGroupHierarchy,
  removeGroupReferences,
  updateGroupLevels,
} from './groupHierarchyUtils';
import {
  CONFIG_RELATIVE_PATH,
  GlobalConfig,
  Group,
  GroupFileEntry,
  InlineConfig,
  ManualConfig,
  RegexConfig,
  TabGroupsData,
} from './types';
import { getWorkspaceFolder } from './workspaceUtils';

const DEFAULT_MANUAL_CONFIG: ManualConfig = { type: 'manual' };

export class TabGroupsManager {
  private data: TabGroupsData = { version: CONFIG_VERSION, groups: [], configs: [] };
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
      this.data = { version: CONFIG_VERSION, groups: [], configs: [] };
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(content).toString('utf8')) as Partial<TabGroupsData>;
      const { data, migrated } = this.normalizeLoadedData(parsed);
      this.data = data;
      if (migrated) {
        await this.save();
        vscode.window.setStatusBarMessage('标签分组配置已升级', 3000);
      }
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        this.data = { version: CONFIG_VERSION, groups: [], configs: [] };
        await this.save();
        return;
      }
      this.data = { version: CONFIG_VERSION, groups: [], configs: [] };
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`读取标签分组配置失败：${message}`);
    }
  }

  private normalizeLoadedData(parsed: Partial<TabGroupsData>): { data: TabGroupsData; migrated: boolean } {
    const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
    const hierarchyMigration = needsHierarchyMigration(rawGroups);
    const versionMigration = isVersionLessThan(parsed.version, CONFIG_VERSION);

    const groups = rawGroups.map((raw) => {
      const normalized = normalizeGroupHierarchy(raw);
      normalized.files = normalizeGroupFiles(raw.files);
      return normalized;
    });

    return {
      data: {
        version: CONFIG_VERSION,
        groups,
        configs: Array.isArray(parsed.configs) ? parsed.configs : [],
      },
      migrated: hierarchyMigration || versionMigration,
    };
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

    this.data.version = CONFIG_VERSION;
    const content = JSON.stringify(this.data, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    this.onDidChangeEmitter.fire();
  }

  getGroups(): Group[] {
    return this.data.groups;
  }

  containsFilePath(relativePath: string): boolean {
    return this.data.groups.some((group) =>
      group.files.some((file) => file.path === relativePath),
    );
  }

  getRootGroups(): Group[] {
    return getRootGroups(this.data.groups);
  }

  getChildGroups(parentId: string): Group[] {
    const parent = this.getGroup(parentId);
    if (!parent) {
      return [];
    }
    return getChildGroups(this.data.groups, parent);
  }

  getParentGroupId(groupId: string): string | undefined {
    return findParentGroupId(this.data.groups, groupId);
  }

  getGroupPathLabel(groupId: string): string {
    return getGroupPathLabel(this.data.groups, groupId);
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
    const group = createEmptyGroup(name, 0);
    this.data.groups.push(group);
    await this.save();
    return group;
  }

  async createSubGroup(parentId: string, name: string): Promise<Group | undefined> {
    const parent = this.getGroup(parentId);
    if (!parent) {
      return undefined;
    }

    const group = createEmptyGroup(name, parent.level + 1);
    this.data.groups.push(group);
    parent.children.push(group.id);
    await this.save();
    return group;
  }

  async deleteGroup(id: string): Promise<string[]> {
    const idsToDelete = collectDescendantIds(this.data.groups, id);
    const configIds: string[] = [];

    for (const groupId of idsToDelete) {
      const group = this.getGroup(groupId);
      if (group?.configId) {
        configIds.push(group.configId);
      }
    }

    const deleteSet = new Set(idsToDelete);
    removeGroupReferences(this.data.groups, deleteSet);
    this.data.groups = this.data.groups.filter((group) => !deleteSet.has(group.id));
    await this.save();
    return configIds;
  }

  getDescendantIds(groupId: string): string[] {
    return collectDescendantIds(this.data.groups, groupId);
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
    if (groupContainsPath(group, filePath)) {
      return false;
    }
    group.files.push({
      path: filePath,
      alias: defaultAliasFromPath(filePath),
    });
    await this.save();
    return true;
  }

  async removeFileFromGroup(groupId: string, filePath: string): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.files = group.files.filter((file) => file.path !== filePath);
    await this.save();
  }

  async moveFilesToGroup(
    moves: Array<{ sourceGroupId: string; filePath: string }>,
    targetGroupId: string,
  ): Promise<number> {
    const target = this.getGroup(targetGroupId);
    if (!target || moves.length === 0) {
      return 0;
    }

    let moved = 0;
    for (const { sourceGroupId, filePath } of moves) {
      if (sourceGroupId === targetGroupId) {
        continue;
      }

      const source = this.getGroup(sourceGroupId);
      if (!source) {
        continue;
      }

      const entry = source.files.find((file) => file.path === filePath);
      if (!entry) {
        continue;
      }

      source.files = source.files.filter((file) => file.path !== filePath);
      if (!groupContainsPath(target, filePath)) {
        target.files.push({ ...entry });
      }
      moved++;
    }

    if (moved > 0) {
      await this.save();
    }
    return moved;
  }

  async moveGroupToParent(groupId: string, newParentId: string): Promise<boolean> {
    if (groupId === newParentId) {
      return false;
    }

    const group = this.getGroup(groupId);
    const newParent = this.getGroup(newParentId);
    if (!group || !newParent) {
      return false;
    }

    if (isDescendantOf(this.data.groups, groupId, newParentId)) {
      return false;
    }

    const oldParentId = findParentGroupId(this.data.groups, groupId);
    if (oldParentId === newParentId) {
      return false;
    }

    if (oldParentId) {
      const oldParent = this.getGroup(oldParentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((id) => id !== groupId);
      }
    }

    if (!newParent.children.includes(groupId)) {
      newParent.children.push(groupId);
    }

    updateGroupLevels(this.data.groups, groupId, newParent.level + 1);
    await this.save();
    return true;
  }

  async removeFileFromAllGroups(filePath: string): Promise<number> {
    let count = 0;
    for (const group of this.data.groups) {
      if (groupContainsPath(group, filePath)) {
        group.files = group.files.filter((file) => file.path !== filePath);
        count++;
      }
    }
    if (count > 0) {
      await this.save();
    }
    return count;
  }

  async renameFileAlias(
    groupId: string,
    filePath: string,
    alias: string,
    applyToAllGroups: boolean,
  ): Promise<void> {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) {
      throw new Error('EMPTY_ALIAS');
    }

    if (applyToAllGroups) {
      for (const group of this.data.groups) {
        for (const file of group.files) {
          if (file.path === filePath) {
            file.alias = trimmedAlias;
          }
        }
      }
    } else {
      const group = this.getGroup(groupId);
      const file = group?.files.find((entry) => entry.path === filePath);
      if (!file) {
        return;
      }
      file.alias = trimmedAlias;
    }

    await this.save();
  }

  countGroupsContainingFile(filePath: string): number {
    return this.data.groups.filter((group) => groupContainsPath(group, filePath)).length;
  }

  getFileEntry(groupId: string, filePath: string): GroupFileEntry | undefined {
    return this.getGroup(groupId)?.files.find((file) => file.path === filePath);
  }

  getGroupFilePathsRecursive(groupId: string): string[] {
    return collectAllFilePaths(this.data.groups, groupId);
  }

  getGroupFileEntriesRecursive(groupId: string): GroupFileEntry[] {
    return collectAllFileEntries(this.data.groups, groupId);
  }

  async addCursor(
    groupId: string,
    filePath: string,
    cursor: { line: number; column: number; label?: string },
  ): Promise<boolean> {
    const entry = this.getFileEntry(groupId, filePath);
    if (!entry) {
      return false;
    }

    if (!entry.cursors) {
      entry.cursors = [];
    }

    entry.cursors.push({
      line: cursor.line,
      column: cursor.column,
      label: cursor.label?.trim() || defaultCursorLabel(cursor.line),
    });

    await this.save();
    return true;
  }

  async removeCursor(groupId: string, filePath: string, cursorIndex: number): Promise<boolean> {
    const entry = this.getFileEntry(groupId, filePath);
    if (!entry?.cursors || cursorIndex < 0 || cursorIndex >= entry.cursors.length) {
      return false;
    }

    entry.cursors.splice(cursorIndex, 1);
    if (entry.cursors.length === 0) {
      delete entry.cursors;
    }

    await this.save();
    return true;
  }

  async renameCursor(
    groupId: string,
    filePath: string,
    cursorIndex: number,
    label: string,
  ): Promise<boolean> {
    const entry = this.getFileEntry(groupId, filePath);
    if (!entry?.cursors || cursorIndex < 0 || cursorIndex >= entry.cursors.length) {
      return false;
    }

    const trimmed = label.trim();
    if (!trimmed) {
      return false;
    }

    entry.cursors[cursorIndex].label = trimmed;
    await this.save();
    return true;
  }

  getGroupsContainingFile(filePath: string): Group[] {
    return this.data.groups.filter((group) => groupContainsPath(group, filePath));
  }

  getConfigVersion(): string | undefined {
    return this.data.version;
  }

  needsConfigUpgrade(): boolean {
    return isVersionLessThan(this.data.version, CONFIG_VERSION);
  }

  /** 重新加载并按当前 schema 迁移；若配置版本落后则升级写回。 */
  async upgradeConfigIfNeeded(): Promise<{ upgraded: boolean; from?: string; to: string }> {
    const from = this.data.version;
    if (!this.needsConfigUpgrade()) {
      return { upgraded: false, from, to: CONFIG_VERSION };
    }

    await this.load();
    if (this.data.version !== CONFIG_VERSION) {
      this.data.version = CONFIG_VERSION;
      await this.save();
    }
    return { upgraded: true, from, to: CONFIG_VERSION };
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
      id: config.id ?? randomUUID(),
    } as GlobalConfig;
    this.data.configs.push(globalConfig);
    await this.save();
    return globalConfig;
  }

  async deleteGlobalConfig(id: string): Promise<void> {
    this.data.configs = this.data.configs.filter((c) => c.id !== id);
    await this.save();
  }

  async updateGroupFiles(groupId: string, matchedPaths: string[]): Promise<void> {
    const group = this.getGroup(groupId);
    if (!group) {
      return;
    }
    group.files = buildScannedFiles(group.files, matchedPaths);
    await this.save();
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
