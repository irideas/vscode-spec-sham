# VS Code Configuration Settings UI 子系统软件设计说明书 (SDD)

## 1. 设计目标与约束

### 1.1 设计目标

* 为用户提供统一、可搜索、可过滤的配置入口，覆盖 Settings UI 与 settings.json 两种编辑方式；
* 将 Configuration Core 的复杂性（schema、分层、语言覆盖、Profile、Remote、Policy、Sync）隐藏在 UI 背后，只暴露必要且易懂的信息；
* 确保 Settings UI 与 JSON 编辑行为始终一致，任何一方的修改都能正确反映到另一方；
* 保持与 VS Code 现有产品体验一致，不破坏既有命令、快捷键和用户习惯。

### 1.2 约束条件

* 必须对齐 VS Code 既有行为和 API：

  * Settings Editor / Settings UI 的入口、布局、User/Workspace tab 等；
  * `workbench.settings.editor` 控制 UI / JSON 模式；
  * 各种「Open Settings (JSON/UI)」命令。
* 必须依赖 Configuration Core：

  * 通过 Configuration Service 获取 ConfigurationModel、inspect 信息；
  * 通过访问与变更子系统写入设置；
  * 不直接操作 settings.json 文件。
* 必须复用 JSON 语言服务：

  * settings.json 的 IntelliSense 与校验由 JSON 语言服务提供；
  * Settings UI 负责选择正确 schema 并激活对应语言服务配置。

---

## 2. 组件设计

### 2.1 SettingsEditorShell

* 负责 Settings Editor 页签的整体容器与生命周期：

  * 处理打开 / 关闭请求；
  * 根据 `workbench.settings.editor` 和用户操作决定使用 UI 还是 JSON 模式；
  * 管理 User / Workspace / Folder / Profile / Remote 视图切换；
  * 订阅配置变更事件并协调子组件刷新。

### 2.2 ScopeSwitcher

* UI 顶部的 scope 切换控件：

  * 状态：`'user' | 'workspace' | 'folder' | 'profile' | 'remote' | ...`；
  * 根据当前 workspace / profile / remote 状态决定可用选项；
  * 向 SettingsViewController 广播 scope 变更事件，触发重新绑定配置视图。

### 2.3 SettingsSearchBar & FilterController

* SettingsSearchBar：

  * 提供文本输入框和 filter 按钮；
  * 捕获用户输入并交给 FilterController 解析。
* FilterController：

  * 将输入拆分为：

    * 普通关键字数组；
    * filter token 列表（如 modifiedOnly / extIds / languageIds 等）；
  * 向 SettingsViewModel 提供当前 filter 状态。

### 2.4 SettingsTreeView & SettingsItemView

* SettingsTreeView：

  * 按 schema 提供的类别 / group 构建树形或分组视图；
  * 支持折叠 / 展开、虚拟滚动。
* SettingsItemView：

  * 渲染单条 setting：

    * 标题、描述；
    * 控件（checkbox / textbox / dropdown / slider / color picker / …）；
    * 修改标记、重置按钮；
    * Policy / Sync 状态图标。
  * 将用户操作通过 SettingsBindingController 转成配置更新请求。

### 2.5 SettingsViewController

* 控制 Settings UI 整体数据流的中介：

  * 根据 scope、search、filter 组合，构建 SettingsViewModel；
  * 监听 ConfigurationChangeEvent，局部刷新受影响的 SettingItemViewModel；
  * 承接「打开 JSON」命令，调用 JsonSettingsOpener。

### 2.6 JsonSettingsOpener

* 封装从 UI 打开 settings.json 的逻辑：

  * 根据当前 scope 决定要打开的文件 URI（User / Workspace / Folder / Profile）；
  * 调用 editor service 打开该文件；
  * 确保 JSON 语言服务附带正确的 schema（如通过 language configuration 绑定）。

### 2.7 SettingsBindingController

* 管理 UI 控件与 Configuration API 的双向绑定：

  * 初始化控件时，通过 Configuration Service 获取当前值；
  * 响应控件变更，调用 `WorkspaceConfiguration.update`；
  * 处理 update 过程中的错误与 loading 状态；
  * 在配置变更事件到达时，更新控件值与修改标记。

### 2.8 PolicyIndicator / SyncStatusProvider

* PolicyIndicator：

  * 使用 Policy 系统提供的接口查询某 setting 是否被策略锁定；
  * 将锁定状态注入 SettingItemViewModel，用于禁用控件和展示提示。
* SyncStatusProvider：

  * 从 Sync 系统或 schema 中获取 ignoreSync 等状态；
  * 在 UI 中展示「参与 / 不参与同步」等信息（可选）。

---

## 3. 数据模型设计

### 3.1 SettingsViewModel

```ts
type SettingsScopeId = 'user' | 'workspace' | 'folder' | 'profile' | 'remote';

interface ActiveFilters {
  modifiedOnly: boolean;
  extensionIds?: string[];
  languageIds?: string[];
  featureIds?: string[];
}

interface SettingsViewModel {
  scope: SettingsScopeId;
  searchText: string;
  filters: ActiveFilters;

  // 当前展示的设置项（已经应用 search + filter）
  displayedSettings: SettingItemViewModel[];

  // 用于左侧树或分组视图
  groups: SettingsGroupViewModel[];
}

interface SettingsGroupViewModel {
  id: string;
  label: string;
  children: (SettingsGroupViewModel | SettingItemViewModel)[];
  collapsible: boolean;
}
```

### 3.2 SettingItemViewModel

```ts
interface LayerValues {
  default?: any;
  user?: any;
  workspace?: any;
  folder?: any;
  languageDefault?: any;
  languageUser?: any;
  languageWorkspace?: any;
  languageFolder?: any;
  policy?: any;
}

type ValueSource =
  | 'default'
  | 'user'
  | 'workspace'
  | 'folder'
  | 'language'
  | 'policy';

type ControlType =
  | 'boolean'
  | 'number'
  | 'string'
  | 'enum'
  | 'object'
  | 'array'
  | 'color'
  | 'complex';

interface SettingItemViewModel {
  id: string;                  // Setting ID, 如 "editor.fontSize"
  label: string;               // 显示标题（本地化）
  description?: string;        // 文本或 markdown 渲染后结果
  controlType: ControlType;
  enumOptions?: { value: any; label: string; description?: string }[];

  // 当前 scope 下的有效值
  value: any;
  // 各层值，用于 tooltip / 详情
  layerValues?: LayerValues;
  // 当前值主要来自哪个层
  valueSource: ValueSource;

  modified: boolean;           // 相对默认 / 下层是否已显式修改
  policyLocked: boolean;       // 是否被策略锁定
  syncIgnored?: boolean;       // 是否被 Sync 忽略（可选）
  tags?: string[];             // 如 usesOnlineServices 等
  extensionId?: string;        // 贡献该 setting 的扩展
  categoryId?: string;         // 左侧分类用
}
```

### 3.3 与 Configuration Model 的映射

* SettingsViewController 通过声明子系统获取 schema 列表；
* 再通过 Configuration Service 的 `inspect` 接口获取每个 setting 的各层值；
* 将 schema + inspect 结果合成为 SettingItemViewModel；
* search / filter 操作用于从完整的 ViewModel 集合中筛选 displayedSettings。

---

## 4. 核心流程设计

### 4.1 打开 Settings UI 流程

1. 用户通过菜单 / 命令 / 快捷键发起「打开设置」操作；
2. SettingsEditorShell：

   * 读取 `workbench.settings.editor`；
   * 若配置为 JSON，则委托 JsonSettingsOpener 打开 User settings.json，流程结束；
   * 否则创建 SettingsViewController，进入 UI 模式。
3. ScopeSwitcher 决定初始 scope（例如：有 workspace 时记住上次 scope，否则为 User）；
4. SettingsViewController：

   * 从声明子系统获取所有注册 settings 的 schema；
   * 通过 Configuration Service 为当前 scope 构建 SettingItemViewModel 集合；
   * 初始化 SettingsViewModel（searchText 为空，filters 默认值）；
5. SettingsTreeView 渲染 groups 与 displayedSettings，Settings UI 准备就绪。

### 4.2 搜索与过滤流程

1. 用户在搜索框输入文本或 filter token；
2. SettingsSearchBar 将输入交给 FilterController；
3. FilterController：

   * 解析出 searchText 与 ActiveFilters；
   * 通知 SettingsViewController 更新 SettingsViewModel.filters 和 searchText。
4. SettingsViewController 重新计算 displayedSettings：

   * 先按 label/ID/description 匹配 searchText；
   * 再按 ActiveFilters（modifiedOnly / extensionIds / languageIds 等）过滤；
5. SettingsTreeView 根据新的 displayedSettings 重新渲染列表（支持虚拟滚动）。

### 4.3 在 UI 中修改设置流程

1. 用户在某个 SettingItemView 上修改控件值（例如切换布尔开关）；
2. SettingsItemView 将新值交给 SettingsBindingController；
3. SettingsBindingController：

   * 基于当前 scope 推导 ConfigurationTarget（User / Workspace / Folder 等）；
   * 如处于特定语言视图，则设置 overrideInLanguage 标志；
   * 调用 `WorkspaceConfiguration.update(settingId, newValue, target, overrideInLanguage)`；
   * 处理 update 的 Promise（显示 loading / 错误提示）。
4. 访问与变更子系统：

   * 进行 schema 校验和 Policy 检查；
   * 调用存储与分层子系统写入 settings.json；
   * 刷新 ConfigurationModel 并触发 ConfigurationChangeEvent。
5. SettingsEditorShell 订阅到 ConfigurationChangeEvent 后：

   * 将受影响 settingId 列表传给 SettingsViewController；
   * SettingsViewController 为这些 setting 重新调用 inspect，更新其 SettingItemViewModel；
   * SettingsTreeView 仅重绘受影响条目，更新 value、modified、valueSource 等。

### 4.4 JSON 编辑与 UI 同步流程

1. 用户通过 Settings UI 中的 JSON 按钮或命令打开 settings.json；
2. JsonSettingsOpener：

   * 确定当前 scope 的 settings.json 路径；
   * 打开编辑器，并确保 JSON 语言服务加载对应 schema；
3. 用户编辑 JSON 并保存；
4. 存储与分层子系统：

   * 检测文件变更，尝试解析新内容；
   * 若 JSON 有语法错误，则保留旧模型并在编辑器中标记错误；
   * 若解析成功，更新对应层的 ConfigurationModel 并触发 ConfigurationChangeEvent。
5. SettingsEditorShell 收到事件：

   * 通知 SettingsViewController 根据变更的 settingId 更新对应 SettingItemViewModel；
   * SettingsTreeView 中的相关 setting 值与修改标记更新；
   * `@modified` 过滤结果随之变化。

### 4.5 Policy 与 Sync 状态展示流程

1. 构建 SettingItemViewModel 时，SettingsViewController：

   * 调用 PolicyIndicator 查询 setting 在当前 scope 是否被策略锁定及锁定类型；
   * 调用 SyncStatusProvider 查询 setting 是否被 Sync 忽略。
2. SettingItemViewModel 中填充 `policyLocked` / `syncIgnored` 等字段；
3. SettingsItemView 根据这些字段：

   * 对策略锁定项禁用控件，显示锁定图标和说明；
   * 对 Sync 状态（如「不同步」）显示提示（可选）。

---

## 5. 错误与边界处理

### 5.1 更新错误

* 若 update 因以下原因失败：

  * schema 校验失败（类型、枚举等）；
  * Policy 禁止修改；
  * 对应 scope 不存在（如没有 workspace 却写入 Workspace 设置）；
  * 文件权限或 I/O 错误；
* SettingsBindingController 必须：

  * 在 UI 中显示错误提示（toast 或内联错误）；
  * 恢复控件显示为实际有效值（而非用户尝试写入但失败的值）；
  * 不触发「成功修改」标记或 `@modified` 状态变更。

### 5.2 JSON 语法错误

* 当 settings.json 语法错误时：

  * 存储与分层子系统保留上一版本模型；
  * JSON 编辑器通过 JSON 语言服务标记错误；
  * Settings UI 可以通过 banner 或状态栏提示用户「当前 settings.json 无法解析」；
  * 在用户修复并保存前，Settings UI 仍然基于旧模型展示配置。

### 5.3 scope 缺失与降级行为

* 当没有打开 workspace：

  * ScopeSwitcher 禁用 Workspace / Folder 视图；
  * 尝试打开 Workspace settings.json 的命令应提示用户需要打开 folder/workspace。
* 在 Remote/Container 未连接时：

  * Remote scope 对应视图禁用或隐藏；
  * 已有 UI 状态应正确降级到本地 scope。

---

## 6. 性能与缓存策略

* 对 SettingItemViewModel：

  * 在 SettingsViewController 中缓存完整集合，只在必要时重建；
  * 搜索与过滤仅在缓存集合上操作，使用高效的索引结构。
* 对 ConfigurationModel 查询：

  * 使用 Configuration Service 提供的面向 scope 的缓存；
  * 在 ConfigurationChangeEvent 中精确标出受影响 settingId，避免全量刷新；
* 对 SettingsTreeView 渲染：

  * 使用虚拟列表技术，只渲染可见区域；
  * 对大类折叠时不构建其子树的 ViewModel，按需加载。

---

## 7. 无障碍与国际化设计

* 所有可交互控件（搜索框、filter 按钮、scope 切换、SettingItemView 中的控件）必须：

  * 有清晰的键盘焦点顺序；
  * 显示焦点样式；
  * 设置符合语义的 aria 属性；
* Settings UI 中所有提示、描述、错误信息均通过本地化资源提供；
* Setting ID 保持英文不变，仅 label/description 本地化。

---

## 8. 扩展性与演进

* 过滤能力扩展：

  * 支持更多 filter token（如 `@tag:formatting`、`@feature:testing` 等）；
  * SettingsSearchBar 与 FilterController 设计为解析插件式过滤规则。
* 视图模式扩展：

  * 未来可以加入「按 Feature」「按扩展」等视图模式；
  * 通过扩展 SettingsGroupViewModel 和 SettingsTreeView 的布局逻辑实现。
* Profiles 深度集成：

  * 支持在 Settings UI 中快速切换 Profile 并对比差异；
  * 对 Profile 特有设置提供专门的视图或筛选。

---

## 9. 与其他子系统的接口

* 与 Configuration 声明子系统：

  * 通过 schema registry 获取所有 settings schema；
  * 支持 schema 变更时动态刷新 UI（例如扩展启用 / 禁用）。
* 与 Configuration 访问与变更子系统：

  * 通过 Configuration Service 提供的 `getConfiguration` / `inspect` / `update` / 配置变更事件构建与更新 UI。
* 与 Configuration 存储与分层子系统：

  * 间接依赖，用于获取多层值与 JSON 解析错误等信息；
  * 不直接操作文件路径与 watcher。
* 与 Settings Sync / Enterprise Policy 系统：

  * 通过 PolicyIndicator / SyncStatusProvider 的抽象接口获取状态；
  * 保证 UI 显示与实际有效值和策略状态一致。

---

## 10. 测试建议

* 单元测试：

  * FilterController 对不同输入解析的正确性；
  * SettingsViewController 对 ConfigurationModel/Schema 的映射；
  * SettingsBindingController 对不同 scope/update 组合的行为。
* 集成测试：

  * 打开 Settings UI、修改设置、检查有效值与 JSON 内容；
  * 在 JSON 中修改 settings、检查 UI 值与 `@modified` 行为；
  * 多根工作区、Profile、Remote 场景下 scope 切换与写入路径；
  * Policy 锁定与 Sync 状态展示。

---
