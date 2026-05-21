# VSCode 标签分组插件 - 开发文档（基于最新配置模型）

## 1. 概述
**插件名称**：Tab Groups  
**扩展标识**：`Rita.tab-groups`（Publisher: `Rita`，package name: `tab-groups`）  
**功能**：允许用户将 VSCode 中打开或未打开的文件组织成逻辑分组，支持手动添加和基于正则的自动扫描。分组配置可内嵌于分组，也可定义为全局配置供多个分组复用。

**版本**：v1.0（MVP）  

---

## 2. 数据结构设计（JSON Schema）
存储路径：`<workspaceRoot>/.vscode/tab-groups.json`
```typescript
// 基础配置类型
interface BaseConfig {
  type: 'manual' | 'regex';
}
interface ManualConfig extends BaseConfig {
  type: 'manual';
}

interface RegexConfig extends BaseConfig {
  type: 'regex';
  regex: string;        // 正则表达式字符串
}

// 分组内嵌配置（不需要 id）
type InlineConfig = ManualConfig | RegexConfig;

// 全局配置（需要唯一 id）
interface GlobalConfig extends InlineConfig {
  id: string;
  description?: string; // 可选的说明
}

// 分组定义
interface Group {
  id: string;           // 唯一标识（UUID 或自增）
  name: string;         // 显示名称
  files: string[];      // 文件相对路径数组（相对于工作区根目录）
  config?: InlineConfig; // 内嵌配置，优先级高于 configId
  configId?: string;     // 引用全局配置的 id
}

// 根数据结构
interface TabGroupsData {
  groups: Group[];
  configs: GlobalConfig[];
}
```

**解析规则**：
- 如果 `group.config` 存在 → 使用内嵌配置
- 否则如果 `group.configId` 存在 → 在 `configs` 中查找匹配的全局配置
- 否则 → 视为 `{ type: "manual" }`（默认手动分组）

**路径存储**：所有 `files` 使用相对于工作区根目录的路径（例如 `src/index.ts`），保证跨平台和可移植性。

---

## 3. 用户界面与交互

### 3.1 活动栏（Activity Bar）
- 图标：`$(list-selection)`（内置 codicon）
- 点击后打开侧边栏视图

### 3.2 侧边栏树视图
**结构**：
```
📁 我的手动分组（手动）        <-- 分组节点，括号内显示配置类型
   📄 src/index.ts
   📄 src/utils.ts
📁 后端逻辑（引用：backend-regex）  <-- 显示引用的全局配置名
   📄 server.js
📁 独立正则组（正则）            <-- 内嵌正则
   📄 db.js
```

**侧边栏标题栏（view/title）**：
- 新建分组

**分组节点右键菜单**（仅作用于当前分组，不在插件顶栏提供）：
- 删除分组
- 重命名分组
- **展开分组**（打开组内所有文件）：一键在编辑器中打开该分组 `files` 中的全部文件；不存在的文件跳过；最后一个文件获得焦点
- **折叠分组**（关闭组内所有文件）：一键关闭编辑器中属于该分组的所有已打开标签页
- 设置为手动
- 设置正则（内嵌）
- 引用全局配置（弹出列表选择已有全局配置）
- 管理全局配置（打开 `.vscode/tab-groups.json` 供手动编辑）
- 扫描文件（仅当分组配置为正则时有效，无论内嵌还是引用）

> **注意**：「展开/折叠分组」指的是**编辑器标签页**的批量打开/关闭，**不是**侧边栏树节点的展开/折叠。树节点仍可通过点击分组名称旁的箭头手动展开/折叠以查看文件列表。

**文件节点右键菜单**：
- 打开文件
- 从分组中移除
- 复制路径

### 3.3 编辑器标签右键菜单
- **加入分组** → 弹出快速选择，列出所有分组（显示分组名），选择后当前文件路径加入该分组的 `files` 数组（去重）。
- **取消分组** → 弹出快速选择，显示当前文件所属的所有分组（如果属于多个），选择后从该分组中移除。

---

## 4. 核心功能详解

### 4.1 分组管理
| 操作 | 实现说明 |
|------|----------|
| 新建分组 | 弹出输入框获取名称，生成新 `id`，创建空 `files` 数组，默认无 config 和 configId（即手动分组）。保存 JSON。 |
| 删除分组 | 从 `groups` 中移除；若该分组引用的全局配置不再被任何分组使用，**弹窗询问**是否一并删除该全局配置。 |
| 重命名 | 直接修改 `group.name`。 |
| 展开分组 | 遍历该分组 `files`，调用 `vscode.window.showTextDocument` 依次打开；跳过不存在或无法打开的文件；非最后一个文件使用 `preserveFocus: true` 在后台打开。 |
| 折叠分组 | 遍历 `vscode.window.tabGroups.all`，匹配属于该分组相对路径的标签页（含 `TabInputText` / `TabInputTextDiff`），调用 `vscode.window.tabGroups.close` 批量关闭。 |

### 4.2 配置管理
| 场景 | 行为 |
|------|------|
| 设置为手动 | 删除 `group.config` 和 `group.configId`（即无配置）。 |
| 设置正则（内嵌） | 弹出输入框输入正则，设置 `group.config = { type: "regex", regex: "..." }`，删除 `configId`。 |
| 引用全局配置 | 弹出快速选择列表（来自 `configs` 数组），选择后设置 `group.configId = selectedId`，删除 `group.config`。如果无可用全局配置，提示先创建。 |
| 管理全局配置 | 直接打开 `.vscode/tab-groups.json`，并滚动定位到 `configs` 区域，供用户手动编辑 JSON（v1 不提供增删改 UI）。 |
| 从正则配置扫描文件 | 获取分组有效正则（内嵌或引用），调用 `vscode.workspace.findFiles('**/*')`，过滤匹配的文件路径，更新 `group.files`（**覆盖**原有列表）。显示进度条。 |

### 4.3 文件操作
- **加入分组**：将当前活动标签的 URI 转换为相对路径，添加到目标分组的 `files` 数组（避免重复）。
- **取消分组**：从指定分组的 `files` 中移除该路径。
- **单击树视图文件**：调用 `vscode.window.showTextDocument` 打开。
- **关闭标签不影响分组**：分组中的文件路径不会因为标签关闭而删除。用户必须显式取消分组或从树视图右键移除。

### 4.4 数据持久化与同步
- 任何修改（增删改分组、文件、配置）都立即写回 JSON 文件。
- 启动插件时读取 JSON 文件，若文件不存在则创建空结构 `{ groups: [], configs: [] }`。
- **外部修改自动重载（v1 已实现）**：
  - 监听 `vscode.workspace.createFileSystemWatcher` 监控配置文件变更；
  - 监听 `vscode.workspace.onDidSaveTextDocument`，当用户保存 `tab-groups.json` 时重新加载。
- 监听 `vscode.workspace.onDidChangeWorkspaceFolders` 在工作区切换时重新加载。

---

## 5. VSCode API 使用清单

| 用途 | API |
|------|-----|
| 注册命令 | `vscode.commands.registerCommand` |
| 树视图 | `vscode.window.createTreeView` + `TreeDataProvider` |
| 右键菜单贡献 | `package.json` 的 `contributes.menus` |
| 快速选择 | `vscode.window.showQuickPick` |
| 输入框 | `vscode.window.showInputBox` |
| 获取当前文件 URI | `vscode.window.activeTextEditor.document.uri` |
| 打开/关闭组内文件 | `vscode.window.showTextDocument` / `vscode.window.tabGroups.close` |
| 遍历工作区文件 | `vscode.workspace.findFiles` |
| 文件读写 | `vscode.workspace.fs` 或 Node.js `fs` (需 `@types/node`) |
| 进度条 | `vscode.window.withProgress` |
| 工作区事件 | `vscode.workspace.onDidChangeWorkspaceFolders` |
| 状态栏消息 | `vscode.window.setStatusBarMessage` |

---

## 6. 开发环境与语言

- **语言**：TypeScript
- **构建**：`tsc` 编译至 `out/`
- **依赖**：`@types/vscode`、`@types/node`
- **ID 生成**：Node.js 内置 `crypto.randomUUID()`（v1 未引入 `uuid` 包）
- **界面语言**：中文
- **项目路径**：仓库根目录 `/plug-in/`（无子目录嵌套）

---

## 7. 实现步骤（MVP）

### 阶段 1：项目骨架
- [x] 生成 VSCode 插件项目
- [x] 配置 `package.json`：`activationEvents`、`contributes.viewsContainers`、`contributes.views`、`contributes.commands`、`contributes.menus`
- [x] 创建 `src/types.ts` 定义接口

### 阶段 2：数据管理模块
- [x] 实现 `TabGroupsManager` 类：
  - `load()`、`save()`
  - `getGroups()`、`getConfigs()`
  - `createGroup(name)`、`deleteGroup(id)`、`renameGroup(id, newName)`
  - `addFileToGroup(groupId, filePath)`、`removeFileFromGroup(groupId, filePath)`
  - `setGroupConfig(groupId, config)`、`setGroupConfigId(groupId, configId)`、`clearGroupConfig(groupId)`
  - `createGlobalConfig(config)`、`deleteGlobalConfig(id)`
  - `getEffectiveConfig(group)` 返回解析后的配置对象

### 阶段 3：树视图实现
- [x] 实现 `TreeDataProvider`：`getChildren`、`getTreeItem`、`getParent`
- [x] 分组节点和文件节点使用不同 `TreeItem`，设置 `contextValue` 以便右键菜单区分
- [x] 刷新方法：调用 `onDidChangeTreeData` 事件

### 阶段 4：命令实现
- [x] 所有分组操作命令（新建、删除、重命名、展开/折叠）
- [x] 标签页右键命令：`addToGroup`、`removeFromGroup`
- [x] 树视图内右键命令：打开文件、从分组移除文件、扫描文件（正则分组）、设置配置等

### 阶段 5：正则扫描功能
- [x] 实现 `scanGroupWithRegex(group)`：获取有效正则，调用 `findFiles`，过滤，更新 `group.files`

### 阶段 6：错误处理与优化
- [x] 工作区未打开或多根时禁用功能并提示
- [x] JSON 解析失败时的回退与提示
- [x] 文件路径不存在时在树视图中灰显，且可右键移除
- [x] 添加状态栏消息提示成功/失败
- [x] 外部修改配置文件后自动重新加载

### 阶段 7：测试与打包
- [ ] 编写单元测试（Mocha）
- [ ] 本地 `vsce package` 生成 `.vsix` 并安装测试
- [ ] 发布到 Marketplace

---

## 8. 边界情况与注意事项

1. **多根工作区**：MVP 仅支持**单根工作区**；无工作区或多根时禁用所有菜单命令，树视图显示提示文案。
2. **文件被移动/重命名**：分组中存储的相对路径会失效，树视图中灰显并标注「（不存在）」，可右键移除（v2 可考虑监听 `onDidRenameFiles` 自动更新）。
3. **正则表达式转义**：用户输入的正则需经过 `new RegExp()` 验证，无效时提示错误。
4. **性能**：扫描大量文件时使用 `withProgress` 并支持取消。
5. **配置文件热重载**：外部修改或编辑器内保存 `.vscode/tab-groups.json` 后自动重新加载（v1 已实现）。

---

## 9. 后续迭代计划（v2 / v3）

- **快捷键绑定**：快速将当前文件加入最近使用的分组
- **拖拽支持**：在树视图中拖拽文件到另一个分组
- **自动分组**：根据打开的文件自动建议加入分组（基于规则）
- **分组颜色/徽章**：在树视图中显示不同颜色图标
- **跨工作区共享配置**：支持用户级全局分组（不依赖工作区）

---

## 10. 附录：示例配置文件

```json
{
  "groups": [
    {
      "id": "group-1",
      "name": "我的手动分组",
      "files": ["src/index.ts", "src/utils.ts"]
    },
    {
      "id": "group-2",
      "name": "后端逻辑",
      "files": ["server.js", "db.js"],
      "configId": "backend-regex"
    },
    {
      "id": "group-3",
      "name": "前端组件",
      "files": ["components/Button.tsx"],
      "config": {
        "type": "regex",
        "regex": ".*/components/.*\\.tsx$"
      }
    }
  ],
  "configs": [
    {
      "id": "backend-regex",
      "type": "regex",
      "regex": ".*/server/.*\\.js$",
      "description": "后端 JS 文件"
    }
  ]
}
```

---

## 11. 开发记录

各版本的开发决策、歧义澄清与实现记录见 **[developer-record.md](./developer-record.md)**。

面向普通用户的功能说明见 **[README.md](./README.md)**。