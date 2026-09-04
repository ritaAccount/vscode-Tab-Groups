# `src/` 目录规则

按**功能**分目录，不按技术分层（不要再做成 `utils/`、`providers/` 这种大杂烩）。  
新增 `.ts` 先归入已有四类；只有出现新的功能面、现有目录都放不下时，才新增同级文件夹。

## 目录树

```
src/
├── explain.md                   # 本文件：目录规则（不参与编译）
├── extension.ts                 # 唯一允许留在根目录的源码
├── data/                        # 分组数据与持久化
├── workspace/                   # 工作区与磁盘路径
├── tree/                        # 侧边栏、命令、编辑器跳转
└── settings/                    # 设置页、快捷键、显示配置
```

Webview 静态资源在仓库根的 `media/`，**不要**放进 `src/`。

## 根目录

| 允许 | 不允许 |
|------|--------|
| `extension.ts`：激活 / 停用、注册命令与树、监听配置与工作区 | 再平铺其它 `.ts` |
| `explain.md`：本目录规则 | 把业务逻辑写进 `extension.ts`（只做装配） |

`extension.ts` 必须留在 `src/` 根，对应 `package.json` 的 `"main": "./out/extension.js"`。不要挪到子目录，除非同时改 `main` 与 `tsconfig` 的 `rootDir` 约定。

## 各文件夹放什么

| 目录 | 职责 | 现有文件 | 新文件该不该放这里 |
|------|------|----------|-------------------|
| `data/` | 类型、`.vscode/tab-groups.json` 读写、文件条目 / 嵌套分组 / schema 版本 | `types.ts`、`tabGroupsManager.ts`、`fileEntryUtils.ts`、`groupHierarchyUtils.ts` | 只动分组 JSON 结构、CRUD、迁移时 |
| `workspace/` | 单根工作区校验、相对/绝对路径、文件是否存在 | `workspaceUtils.ts`、`fileExistenceCache.ts` | 只与「当前工作区 / 磁盘路径」有关时 |
| `tree/` | 侧边栏树、用户命令、批量开/关标签、标记跳转与提示 | `treeProvider.ts`、`commands.ts`、`groupEditorUtils.ts`、`fileLocationUtils.ts` | 新的树节点、右键/快捷命令、编辑器跳转时 |
| `settings/` | 设置 Webview、快捷键读写与 keybindings 同步、显示配置 | `settingsWebview.ts`、`shortcutUtils.ts`、`displaySettingsUtils.ts` | 设置页新分类、工作区 `tabGroups.*` 配置项时 |

`CONFIG_VERSION` 只定义在 `data/fileEntryUtils.ts`。改 schema 必须同步 `version-backup.json`（只追加、不改旧版本）。

## 依赖方向

允许：`extension.ts` → 四个子目录；`tree/` / `settings/` → `data/`、`workspace/`；`data/` → `workspace/`（路径）。  
避免：`data/`、`workspace/` 去引用 `tree/` 或 `settings/`（不要让数据层依赖 UI）。

同目录用 `./foo`，跨目录用 `../data/types` 这种相对路径。不设 `index.ts` 桶文件。

## 改动时

1. 文件放错目录就先挪对，再改逻辑。
2. **该目录若有 `explain.md`，改其中文件后必须同步更新这份说明**（增删文件、改职责、改导出、改依赖方向都算）。只改实现细节、说明仍准确则可不动。
3. 改动跨过本层目录树（新建/删除/重命名功能文件夹、把文件挪到别的功能目录）时，还要更新 **本文件** `src/explain.md`，并与 `developer-readme.md` §6 的源码树保持一致。
4. 新建功能文件夹时，一并写该目录的 `explain.md`。没有这份文件的目录不必强行补，但一旦有了就要跟着改。
5. 历史路径写在 `developer-record.md` 里，不要回改旧记录。
