# 安装插件后会产生的文件示例

本目录对照 **Tab Groups** 激活后写入的配置，方便对照字段含义。  
下面三个 JSON 是「使用过一段时间」的完整示例；首次激活时内容会更空，见各节说明。

| 本目录文件 | 实际路径 | 何时产生 |
|---|---|---|
| `tab-groups.json` | 工作区 `.vscode/tab-groups.json` | 首次激活且文件不存在时创建；之后随分组、标记、扫描等操作立刻写回 |
| `settings.json` | 工作区 `.vscode/settings.json` | 首次激活补全默认快捷键与显示配置；之后在设置页修改 |
| `keybindings.json` | 本机用户 `User/keybindings.json` | 保存快捷键时同步；**不是**工作区文件，一般不要提交到项目 |

macOS 上用户快捷键文件大致在：

- Cursor：`~/Library/Application Support/Cursor/User/keybindings.json`
- VS Code：`~/Library/Application Support/Code/User/keybindings.json`

---

## 1. `tab-groups.json`（分组数据）

当前 schema 版本为 **1.4.0**（与扩展内 `CONFIG_VERSION` 一致）。

### 首次激活（空文件）

```json
{
  "version": "1.4.0",
  "groups": [],
  "configs": []
}
```

### 本目录示例覆盖了哪些能力

| 能力 | 示例里怎么体现 |
|---|---|
| 手动分组 | `group-1`「我的手动分组」，无 `config` / `configId` |
| 嵌套分组 | `group-1.children` 指向 `group-1a`；子组 `level` 为 1 |
| 文件别名 | `src/index.ts` 的 `alias` 为「入口」 |
| 三种标记 | `markers`：`cursor`（游标）、`function`（函数）、`text`（字符匹配） |
| 引用全局配置 | `group-2` 用 `configId: "backend-regex"` |
| 内嵌正则 | `group-3.config` 直接写正则 |

### 字段说明

**根对象**

| 字段 | 含义 |
|---|---|
| `version` | 配置 schema 版本；落后时可用设置页「配置版本更新」升级 |
| `groups` | 全部分组（根组与子组**平铺**存放，靠 `level` / `children` 表达树） |
| `configs` | 可被多个分组引用的全局配置 |

**分组 `groups[]`**

| 字段 | 含义 |
|---|---|
| `id` | 分组唯一标识 |
| `name` | 侧边栏显示名称 |
| `level` | 嵌套层级，根组为 `0` |
| `children` | 直接子分组的 `id` 列表 |
| `files` | 本组文件列表（对象，不是纯路径字符串） |
| `config` | 内嵌配置；有则优先于 `configId` |
| `configId` | 引用 `configs` 里某条全局配置 |

无 `config` 且无 `configId` 时，视为手动分组。

**文件 `files[]`**

| 字段 | 含义 |
|---|---|
| `path` | 相对工作区根目录的路径 |
| `alias` | 侧边栏显示名；默认是文件名，可用「重命名」修改 |
| `markers` | 可选。按类型分组的书签 |

**标记 `markers[]`**

| 字段 | 含义 |
|---|---|
| `type` | `cursor` / `function` / `text` |
| `content` | 该类型下的多条标记 |

每条 `content` 都有 `line`、`column`（从 0 起算）、`label`。  
`function` 还可有 `symbolName`、`symbolKind`；`text` 还可有 `query`（跳转时做模糊匹配）。

**全局配置 `configs[]`**

| 字段 | 含义 |
|---|---|
| `id` | 供 `configId` 引用 |
| `type` | 目前为 `regex`（也可为 `manual`） |
| `regex` | 正则字符串；扫描时匹配工作区相对路径 |
| `description` | 可选说明 |

---

## 2. `settings.json`（工作区偏好）

扩展只写入自己的两项，不会清空你原来的其他设置。首次激活时，若工作区还没有这两项，会补上默认值。

| 键 | 含义 |
|---|---|
| `tabGroups.shortcuts` | 可自定义命令快捷键；保存后同步到本机 `keybindings.json` |
| `tabGroups.display` | 显示相关；目前是跳转标记时左下角提示 |

**`tabGroups.shortcuts` 各键**

| 键 | 对应命令 | 默认 |
|---|---|---|
| `addToGroup` | 加入分组 | `ctrl+shift+i` |
| `removeFromGroup` | 取消分组 | `ctrl+shift+o` |
| `createGroup` | 新建分组（根级） | `ctrl+shift+u` |
| `deleteGroup` | 删除分组 | `ctrl+shift+p` |
| `addCursor` | 添加游标 | `ctrl+shift+l` |
| `addFunction` | 添加函数 | `ctrl+shift+;` |
| `addText` | 添加字符匹配 | `ctrl+shift+'` |
| `prevCursor` | 上一标记 | `ctrl+shift+[` |
| `nextCursor` | 下一标记 | `ctrl+shift+]` |

**`tabGroups.display`**

| 键 | 含义 | 默认 |
|---|---|---|
| `markerJumpHintMode` | 左下角提示：`always` 一直显示 / `timed` 显示若干秒 / `off` 关闭 | `always` |
| `markerJumpHintSeconds` | 仅 `timed` 时有效，范围 0.5～60 秒 | `1` |

这两项都可在侧边栏标题栏的「设置」里改：显示页改完即存；快捷键页需点保存。

---

## 3. `keybindings.json`（本机按键绑定）

VS Code / Cursor **不支持**工作区级 keybindings，所以真正生效的绑定写在用户目录。

扩展保存快捷键时会：

1. 读出现有用户 `keybindings.json`
2. 去掉本扩展已管理的那几条命令
3. 按当前 `tabGroups.shortcuts` 重新写入

本目录的 `keybindings.json` 只列出扩展管理的条目。你本机文件里通常还会有其他扩展或自己加的绑定，扩展不会删掉那些。

`when` 条件与命令对应关系：

| 命令 | `when` |
|---|---|
| 加入 / 取消分组 | 单根工作区，且当前是文件 |
| 新建 / 删除分组 | 单根工作区 |
| 添加游标 / 函数 / 字符匹配、上一/下一标记 | 单根工作区，当前是文件，且编辑器有焦点 |
