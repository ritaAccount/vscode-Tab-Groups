# Tab Groups — 开发记录

> 记录各版本开发过程中人类与 AI 的决策、澄清与实现偏差修正，供后续版本参考。  
> 产品需求与 API 说明见 [developer-readme.md](./developer-readme.md)。

---

## v1（MVP）

### v1 开发范围确认（2026-05）

| 项 | 决策 |
|----|------|
| 项目结构 | 代码直接放在仓库根目录，无子目录 |
| 显示名称 | Tab Groups |
| 扩展标识 | `Rita.tab-groups`（Publisher: Rita） |
| 界面语言 | 中文 |
| 交付范围 | 阶段 1–6（不含单元测试与 `vsce package` 打包） |
| 活动栏图标 | `$(list-selection)` |
| 工作区限制 | 仅单根；无工作区或多根时禁用 + 提示 |
| 删除分组 | 若全局配置无引用，弹窗询问是否删除 |
| 缺失文件 | 树视图中灰显 + 右键可移除 |
| 配置热重载 | 外部修改或保存 `tab-groups.json` 后自动 reload |
| 管理全局配置 | 直接打开 JSON 文件手动编辑，无 UI |

### 文档歧义澄清与修正

#### 歧义 1：「展开/折叠分组」的含义

**原描述（有误）**：
- readme §4.1 写「调用 TreeView 的 `reveal`…记忆展开状态」，易被理解为侧边栏树节点展开/折叠。

**实际产品语义（v1 定稿）**：
- **展开分组** = 一键**打开**该分组内所有文件（编辑器标签页）
- **折叠分组** = 一键**关闭**该分组内所有已打开的标签页
- 与侧边栏树节点的展开/折叠**无关**

**实现文件**：`src/groupEditorUtils.ts`（`openGroupFiles` / `closeGroupFiles`）

#### 歧义 2：「展开/折叠」的作用范围

**原描述（有误）**：
- 初版实现将展开/折叠放在插件顶栏（`view/title`），且作用于**所有分组**。

**实际产品语义（v1 定稿）**：
- 仅出现在**分组节点右键菜单**，只作用于**当前分组**
- 插件顶栏仅保留「新建分组」，不提供全局展开/折叠

#### 歧义 3：缺失文件的展示方式

**原描述（模糊）**：
- readme §6 写「灰显或跳过」，二选一不明确。

**v1 定稿**：灰显（禁用色图标 + 「（不存在）」描述），且保留节点、支持右键移除。

#### 歧义 4：删除分组时的全局配置

**原描述（模糊）**：
- readme §4.1 写「可询问是否删除（可选）」。

**v1 定稿**：必须弹窗询问，用户可选择「删除配置」或「保留配置」。

### 实现过程中遇到的问题

| 问题 | 原因 | 处理 |
|------|------|------|
| `tabGroups.expandAll` 报错需 `getParent` | 初版误用 `treeView.reveal()` 展开树节点 | 改为打开编辑器标签页方案，不再依赖 `reveal`；`getParent` 仍保留供树视图其他用途 |
| `uuid` 包类型冲突 | `@types/uuid` 与包自带类型冲突 | 改用 `crypto.randomUUID()` |

### v1 源码结构

```
src/
├── extension.ts          # 激活、配置监听、工作区校验
├── types.ts              # 数据类型
├── tabGroupsManager.ts   # JSON 读写与分组/配置 CRUD
├── treeProvider.ts       # 侧边栏树视图
├── commands.ts           # 全部命令
├── groupEditorUtils.ts   # 组内文件批量打开/关闭
└── workspaceUtils.ts     # 工作区与路径工具
```

配置持久化路径：`.vscode/tab-groups.json`

本地调试：在 VS Code 中打开本项目 → **F5** → 在新窗口打开单根工作区文件夹测试。

### v1 未包含（阶段 7 / v2）

- 单元测试（Mocha）
- `vsce package` 打包与 Marketplace 发布
- 文件移动/重命名自动同步路径
- 拖拽、快捷键、分组颜色等（见 readme §9）


## v2
在侧边栏视图工具栏添加“自定义快捷键”按钮（使用 view/title 菜单）。

实现 tabGroups.customizeShortcuts 命令：

创建一个 QuickPick 或自定义 Webview 对话框。

显示“加入分组”和“取消分组”两行，右侧显示当前快捷键（从 workspace.getConfiguration().get('tabGroups.shortcuts') 读取，若无则显示默认值）。

用户点击某行时，调用 vscode.window.showInputBox 并监听原始按键事件（通过 onDidChangeValue 无法直接获取按键组合，需要使用原生 DOM 事件？复杂。推荐使用 vscode.window.showInputBox({ prompt: '按下快捷键组合...' }) 并配合全局按键钩子？太麻烦。简单做法：弹出第二个 QuickPick 列出常用组合让用户选择，但这不符合“录入快捷键”。鉴于 API 限制，可以实现一个简化版：弹出输入框让用户输入字符串如 ctrl+shift+g，然后验证格式。这样可以满足基本需求。

验证格式合法性（正则匹配 (ctrl|cmd|shift|alt|opt)+\+[a-z0-9] 等）。

冲突检测：使用 vscode.commands.getCommands? 不准确。可以读取 keybindings.json 或使用 vscode.commands.resolveKeybinding？没有直接方法。因此简化为：提示“请确保快捷键未与其他命令冲突”，并提供一个“检查冲突”按钮，尝试执行 vscode.commands.getKeybinding（不公开 API）。或者不提供实时冲突检测，仅在用户保存时弹窗提醒。

保存用户设置：将新的快捷键组合写入 tabGroups.shortcuts 配置，并显示信息：“请手动将以下内容添加到 keybindings.json: ...”。

最终开发设置：
1、对话框形式：Webview（可做得更像设置页，开发量更大）
2、快捷键录入方式：Webview 按键捕获
3、默认快捷键：加入分组：ctrl+shift+i、取消分组ctrl+shift+o
4、保存后是否立刻生效：自动写入 keybindings.json
5、冲突检测：不做
6、配置作用域：工作区（.vscode/settings.json），存在这个文件写进去，不存在就加载插件的时候就创建，然后快捷键填默认的
7、工具栏按钮显示条件：自定义快捷是插件内部的功能，始终显示
8、配置结构：
{
  "tabGroups.shortcuts": {
    "addToGroup": "ctrl+shift+g",
    "removeFromGroup": "ctrl+shift+u"
  }
}
9、还有疑问直接问，不要自己决定

### v2 实现记录（2026-05）

| 项 | 决策 |
|----|------|
| 对话框 | Webview（`src/shortcutsWebview.ts` + `media/shortcuts.*`） |
| 录入方式 | Webview 按键捕获 |
| 默认快捷键 | 加入分组 `ctrl+shift+i`、取消分组 `ctrl+shift+o` |
| 配置存储 | 工作区 `.vscode/settings.json` → `tabGroups.shortcuts` |
| keybindings 同步 | 写入**用户** `keybindings.json`（VS Code 不支持工作区级 keybindings 文件） |
| 冲突检测 | 不做 |
| 工具栏按钮 | `view/title` 始终显示（无 `workspaceFolderCount` 限制） |
| 保存前置条件 | 保存时需单根工作区；无工作区时可打开 Webview 预览，但不能保存 |

**新增源码**：

```
src/shortcutUtils.ts      # 配置读写、格式校验、keybindings.json 同步
src/shortcutsWebview.ts   # Webview 面板与命令注册
media/shortcuts.css
media/shortcuts.js        # 按键捕获逻辑
```

**激活时行为**：若工作区 `.vscode/settings.json` 中无 `tabGroups.shortcuts`，写入默认值并同步到用户 `keybindings.json`。

**已知限制**：同步 `keybindings.json` 时使用 JSON 重写，文件中已有注释可能在首次同步后丢失。

### v2 功能优化（2026-05）

| 项 | 决策 |
|----|------|
| 取消分组 · 全部分组 | QuickPick 首项「全部分组」，一次性从所有包含该文件的分组中移除 |
| 新建 / 删除分组快捷键 | 可自定义；默认新建 `ctrl+shift+u`、删除 `ctrl+shift+p` |
| 删除分组（快捷键触发） | 无侧边栏选中时弹出 QuickPick 选择要删除的分组 |

**实现**：`TabGroupsManager.removeFileFromAllGroups()` + `tabGroups.removeFromGroup` 命令 QuickPick 扩展；`ShortcutSettings` 扩展 `createGroup` / `deleteGroup`；Webview 与 keybindings 同步一并更新。

v3 功能优化
1、给组内的文件进行重命名，未重命名显示文件名，重命名后显示重命名的名字