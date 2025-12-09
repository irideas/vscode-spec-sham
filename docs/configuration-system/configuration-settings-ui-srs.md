# VS Code Configuration Settings UI 子系统需求规格说明书 (SRS)

## 1. 引言

### 1.1 目的

本 SRS 定义 VS Code 中 **Configuration Settings UI 子系统** 的需求。该子系统负责：

* 向终端用户提供图形化的 **Settings Editor（Settings UI）**；
* 提供进入 **settings.json 直接编辑** 的入口，并保证二者行为一致；
* 基于 Configuration Core 的声明、存储与访问能力，实现可搜索、可过滤、可追踪来源的配置编辑体验；
* 与 Settings Sync 系统、Enterprise Policy 系统在界面层协作，展示同步与策略状态。

目标是从产品 / UX 角度，完整描述「用户如何通过 UI/JSON 同 VS Code 配置系统交互」的需求。

### 1.2 范围

本子系统覆盖：

* **Settings Editor（Settings UI）**：

  * 打开方式：菜单、命令面板、快捷键等；
  * User / Workspace / Folder / Profile / Remote 等作用域视图切换；
  * 搜索框与过滤（包括 `@modified` 等 filter token）；
  * 按声明 schema 渲染每个 setting 的名称、描述、当前值、控件类型；
  * 显示当前值来自哪个层（User / Workspace / Folder / Language / Policy）；
  * 修改值并即时生效，以及「重置为默认」能力。
* **settings.json 编辑入口与体验衔接**：

  * 从 UI 打开 User / Workspace / Folder / Profile settings.json；
  * 使用 settings schema 驱动 JSON 编辑时的补全与校验（由 JSON 语言服务实现，本子系统关注入口与体验一致性）；
  * 在 JSON 与 UI 之间保证值和修改状态的双向同步。
* **与外部系统的 UI 级集成**：

  * 在 Settings UI 中提供 Settings Sync 的入口或状态展示；
  * 对被 Enterprise Policy 管理的设置显示锁定状态并限制编辑。

本子系统不负责：

* 配置 schema 的定义、注册与字段级验证规则（由 Configuration 声明子系统负责）；
* settings 文件的物理路径、文件监听、分层合并算法（由 Configuration 存储与分层子系统负责）；
* `workspace.getConfiguration` / `update` / `onDidChangeConfiguration` 等编程 API 行为（由 Configuration 访问与变更子系统负责）；
* Settings Sync / Enterprise Policy 的后端流程和协议（它们是独立系统，仅在 UI 层有入口与状态展示）。

### 1.3 目标用户

* 日常使用 VS Code 的开发者，通过 Settings UI 进行常规个性化配置；
* 偏好 JSON 的高级用户，通过 Settings UI 与 settings.json 双模式管理复杂配置；
* 企业环境用户，需要理解哪些设置由组织策略管理，哪些可以本地修改；
* 扩展开发者，需要验证自己声明的 settings 在 Settings UI 与 JSON 中的呈现和编辑行为。

---

## 2. 基线与引用

* 基线：默认 `engines.vscode` ≥ 1.80；Profile / Remote / Policy 场景需考虑多层叠加与 UI 锁定状态。
* 官方参考：VS Code Settings UI 文档、Configuration API、Settings Sync、Enterprise Policy；VS Code 源码中的 Settings Editor、`ConfigurationService`。
* 站内引用：/configuration-system/configuration-core-srs（体系级事实与分层模型）、/configuration-system/configuration-storage-layering-srs（层与上下文）、/configuration-system/configuration-access-update-srs（API 语义）、/external-entry/uri-and-links-srs（外部入口，若 UI 提供跳转）。

## 3. 子系统定位与外部关系

### 3.1 在 Configuration 系统中的角色

Settings UI 子系统是 Configuration Core 面向「人类用户」的交互入口：

* 向上面对用户：

  * 使用统一的 Settings UI 将声明好的配置项按类别、关键字、标签呈现；
  * 提供可理解的 scope 切换（User / Workspace 等）与来源提示；
  * 提供 JSON 编辑入口和必要的诊断信息。
* 向下依赖 Configuration Core：

  * 依赖 **声明子系统** 提供 settings schema（类型、默认值、描述、scope、tags、ignoreSync 等元数据）；
  * 依赖 **存储与分层子系统** 提供当前上下文下的有效值和多层值视图；
  * 依赖 **访问与变更子系统** 提供统一的读取 / 写入 / 变更事件 API。

Settings UI 子系统不直接操作配置文件，也不自行做分层合并，而是始终通过内部配置服务（Configuration Core 的 façade）工作。

### 3.2 与 Configuration 内部子系统关系

* 与 **声明子系统**：

  * 使用 schema 构建设置列表与分类树；
  * 通过 scope / tags 决定作用域切换的可用性、隐私提示（如 usesOnlineServices）等；
  * 在 JSON 编辑模式中，驱动键名和值的补全与类型校验。
* 与 **存储与分层子系统**：

  * 读取当前作用域下各 setting 的有效值；
  * 通过 `inspect` 等接口获取 default / user / workspace / folder / language / policy 等各层值与来源文件；
  * 使用存储子系统的错误信息展示 JSON 解析错误、回退行为。
* 与 **访问与变更子系统**：

  * 通过 `getConfiguration` 构造视图，展示配置项当前值；
  * 通过 `update` 将用户在 UI 中的变更写入对应层（User / Workspace / Folder / Language-specific）；
  * 订阅 `onDidChangeConfiguration` 事件，刷新 UI 中的值和「已修改」标记。

### 3.3 与 Settings Sync / Enterprise Policy 的关系

* Settings Sync 系统：

  * 通过 Settings UI 提供开启 / 管理同步的入口；
  * 订阅配置变更事件，同步 User 层相关设置；
  * 可能在 UI 中暴露「某设置是否参与同步」的可视状态（由 Sync 系统提供信息，本子系统仅展示）。
* Enterprise Policy 系统：

  * 通过配置模型向 Configuration Core 注入策略覆盖层；
  * Settings UI 子系统在读取值时自动看到策略覆盖结果；
  * 对被策略锁定的设置，显示「由组织管理」等标记，禁用或限制编辑；具体策略逻辑在 Policy 系统中实现。

Settings Sync 与 Enterprise Policy 都是 VS Code 外部的独立系统，不属于 Configuration Core 的子系统，仅通过接口与 Configuration 交互。

---

## 4. 核心概念与术语

### 4.1 Settings Editor / Settings UI

* 指通过菜单、命令或快捷键（如 `Ctrl+,` / `Cmd+,`）打开的图形化设置编辑器；
* 顶部包含搜索栏和过滤控制；主区域显示按类别或扩展分组的设置项列表；
* 支持 User / Workspace 等视图切换。

### 4.2 Settings Scope 视图（User / Workspace / Folder / Profile / Remote）

* Settings UI 顶部或显著位置展示当前作用域：

  * User：面向当前 VS Code 用户，全局生效；
  * Workspace：面向当前工程 / 文件夹；
  * Folder：在多根工作区中，针对某个具体 workspace folder；
  * Profile：针对当前激活 Profile 的设置视图；
  * Remote：在 Remote / Dev Container / WSL 等场景中的远端 User / Workspace 设置视图。
* 不同视图对应写入的目标 settings.json 文件不同，但读取的合并模型规则一致。

### 4.3 搜索与过滤（Settings Filters）

* 顶部搜索框支持：

  * 关键字搜索：按 setting ID、标题、描述进行模糊匹配；
  * filter token：如 `@modified`、`@ext:<extensionId>`、`@lang:<languageId>` 等，用于缩小显示范围；
  * 通过显式的 filter 按钮或菜单插入可用 token。

### 4.4 settings.json 编辑模式与切换

* VS Code 支持两种配置编辑方式：

  * 图形化 Settings Editor；
  * 直接编辑 settings.json 文件。
* 行为特征：

  * Settings Editor 的修改最终写入对应的 settings.json；
  * 用户可以通过命令（如「Open Settings (JSON)」）或 Settings UI 右上角按钮跳转到 JSON；
  * 设置 `workbench.settings.editor` 决定默认打开 UI 还是 JSON 模式。

本子系统要求在 UX 上将两种方式视为同一交互链路的不同视图，而不是两个割裂的系统。

### 4.5 Modified Indicator（修改标记）

* Settings UI 中，已修改设置（相对默认值或下层值）会有明显标记（如蓝色竖线）；
* 搜索中使用 `@modified` 时，列表只展示这些已修改设置；
* 修改标记基于多层值比较，而不只是当前层非空。

---

## 5. 功能性需求（FR）

### 5.1 打开 Settings UI 与模式切换

**FR-UI-OPEN-001 打开 Settings UI**

* 系统必须提供至少以下入口打开 Settings UI：

  * 菜单：Preferences / Settings（具体菜单名称与 VS Code 一致）；
  * 命令面板命令：例如 “Preferences: Open Settings (UI)”；
  * 快捷键：典型为 `Ctrl+,`（Windows/Linux）或 `Cmd+,`（macOS）。

**FR-UI-OPEN-002 打开 settings.json**

* 系统必须提供至少以下入口打开 settings.json：

  * 命令面板命令：如 “Preferences: Open User Settings (JSON)”、“Preferences: Open Workspace Settings (JSON)” 等；
  * Settings UI 中的按钮（例如右上角 `{}` 图标），在当前 scope 下打开对应的 settings.json；
  * 若从 Explorer 打开 `.vscode/settings.json`，也应享有相同的 JSON 编辑体验。

**FR-UI-OPEN-003 默认编辑模式控制**

* 设置项 `workbench.settings.editor` 必须控制「打开设置」命令时默认采用 UI 模式还是 JSON 模式；
* 当设置为 JSON 时，打开设置直接进入 settings.json 编辑器；当为 UI 时则打开 Settings UI；
* 当该设置值改变时，下次打开 Settings 应遵循新配置。

### 5.2 作用域切换与上下文感知

**FR-UI-SCOPE-001 User / Workspace 等作用域切换**

* Settings UI 顶部必须提供 User / Workspace 等作用域切换控件；
* 无 Workspace 时，Workspace / Folder 等 scope 选项应隐藏或置灰；
* 当前作用域决定：

  * 读取时从哪一组多层视图中取值；
  * 写入时 update 的目标层（配合访问与变更子系统）。

**FR-UI-SCOPE-002 多根工作区支持**

* 在多根工作区中：

  * Workspace 视图默认展示 `.code-workspace` 文件中的 settings；
  * 若提供 Folder 视图，则应提供 UI 组件选择具体 folder，并针对该 folder 展示与写入设置；
  * 若不提供完整 Folder 视图，应至少在 JSON 编辑中支持 folder 级 settings。

**FR-UI-SCOPE-003 Profile / Remote 场景**

* 在 Profile / Remote 等场景中：

  * Settings UI 应感知当前 Profile / Remote 上下文并展示对应 scope；
  * User / Workspace 等标签在 UI 层表现可能变化，但语义应与 Configuration Core 的层结构一致。

### 5.3 搜索与过滤

**FR-UI-SEARCH-001 文本搜索**

* Settings UI 顶部搜索框必须支持按关键字搜索：

  * 匹配 setting 标题、ID、描述文本；
  * 搜索结果应即时更新显示列表；
  * 匹配文本可高亮显示。

**FR-UI-SEARCH-002 `@modified` 过滤器**

* 搜索框必须支持 `@modified` 过滤器：

  * 只显示当前作用域下被「显式设置」或「值不同于默认值」的 settings；
  * 该状态既来源于 Settings UI 修改，也来源于 JSON 手工编辑；
  * "修改" 的判断依赖多层模型，而不仅仅是当前层存在值。

**FR-UI-SEARCH-003 扩展和语言过滤**

* Settings UI 应支持按扩展和语言过滤，至少包括：

  * `@ext:<extensionId>`：只显示由某扩展贡献的 settings；
  * `@lang:<languageId>`：只显示与特定语言相关的 settings；
* UI 中可通过 filter 按钮提供 token 列表，供用户插入。

**FR-UI-SEARCH-004 组合过滤**

* 搜索关键字与过滤器必须可组合使用，例如：

  * `@modified editor`：只显示已修改且与 editor 相关的设置；
  * 组合语义应直观且一致。

### 5.4 设置项展示与编辑

**FR-UI-ITEM-001 设置项展示内容**

* 对每一个已注册的 setting，Settings UI 必须展示：

  * 用户可理解的标题（label）；
  * 描述文本（description / markdownDescription 渲染后）；
  * 当前生效值；
  * 控件类型：布尔开关、下拉框、文本框、滑杆、color picker 等；
  * 可选的默认值提示或占位文本；
  * 若适用，显示该设置由哪个扩展贡献。

**FR-UI-ITEM-002 值来源说明**

* 对于每个 setting，Settings UI 必须能（通过 hover / 详情面板等方式）说明当前值来自哪个层：

  * Default / User / Workspace / Folder / Language-specific / Policy；
  * 当 Workspace 或 Folder 覆盖 User 时，应有「当前工作区覆盖全局配置」等提示。

**FR-UI-ITEM-003 修改行为与即时生效**

* 当用户在 Settings UI 中修改值时：

  * 必须通过访问与变更子系统调用 `update` 写入对应 scope 的 settings.json；
  * 存储与分层子系统更新模型后，新值应立即在 VS Code 其他部分生效，无需重启；
  * 若写入失败（权限 / Policy / schema 校验失败等），应向用户显示错误并回滚 UI 显示。

**FR-UI-ITEM-004 修改标记与重置**

* 已修改 setting 必须有明显的修改标记；
* 每个 setting 应提供「重置为默认」操作：

  * 在当前 scope 删除该 setting 的显式值，使生效值回退到下层 / default；
  * 修改标记随之更新。

**FR-UI-ITEM-005 Policy 锁定表现**

* 对被政策锁定（只读或强制值）的 setting：

  * Settings UI 应以只读形式显示控件，或禁用交互；
  * 提供「由组织策略管理」之类的提示文本或图标。

### 5.5 JSON 编辑体验与 UI 同步

**FR-UI-JSON-001 JSON 打开入口**

* Settings UI 必须提供从当前 scope 打开 settings.json 的显式入口；
* 命令面板中也必须提供打开 User/Workspace 等 settings.json 的命令。

**FR-UI-JSON-002 JSON 智能提示与校验**

* 当 settings.json 在编辑器中打开时：

  * 必须启用与 settings schema 关联的 JSON 语言服务；
  * 为键名提供补全，为值提供类型检查与枚举提示；
  * 对语法错误提供下划线和错误信息。

**FR-UI-JSON-003 JSON 改动 → UI 同步**

* 当用户在 settings.json 中保存变更时：

  * 存储与分层子系统更新模型并触发配置变更事件；
  * Settings UI 必须监听变更事件并更新对应 setting 的值与修改标记；
  * 已打开的 Settings UI 无需重新打开即可看到最新状态。

**FR-UI-JSON-004 UI 改动 → JSON 同步**

* 当用户在 UI 中修改 setting 时：

  * 写入对应 settings.json 文件；
  * 再次打开该 JSON 时，内容必须与 UI 修改一致；
  * 不得出现「UI 显示已修改但 JSON 中没有对应项目」的持久不一致状态。

### 5.6 与 Settings Sync / Policy 的 UI 集成

**FR-UI-EXT-001 Settings Sync 入口**

* Settings UI 适当位置应提供 Settings Sync 的入口：

  * 例如「开启同步」按钮或「管理 Settings Sync」链接；
  * 具体同步流程与状态切换由 Settings Sync 系统负责。

**FR-UI-EXT-002 Sync 状态提示（可选）**

* 对参与 / 不参与 Sync 的设置，Settings UI 可显示轻量状态提示（例如 tooltip 或图标）；
* Sync 相关的 ignoreSync 信息来自声明子系统或 Sync 系统，本子系统只负责呈现。

**FR-UI-EXT-003 Policy 状态展示**

* 对受 Policy 影响的设置，Settings UI 必须展示锁定或覆盖状态：

  * 若值被强制，则展示「由组织设置」之类信息，禁止用户改动；
  * 若仅为默认建议，则可提示「建议值」并允许用户覆盖。

### 5.7 诊断与可测试性

**FR-UI-DIAG-001 诊断能力**

* 系统应提供面向开发者 / 调试场景的诊断信息，例如：

  * 最近一次配置变更来源（UI / JSON / 扩展）；
  * 某 setting 在各层的值快照；
  * 当前搜索 / filter 条件及其解析结果。

**FR-UI-DIAG-002 测试覆盖面**

* 子系统设计必须便于以下场景的自动化测试：

  * 不同作用域下的显示与写入行为；
  * 搜索与过滤组合；
  * JSON 与 UI 同步；
  * Policy 锁定状态展示；
  * 多根工作区、Profile、Remote 等复杂上下文。

---

## 6. 非功能性需求（NFR）

### NFR-UI-01 性能

* 打开 Settings UI 在常规配置规模和常见扩展组合下，应在可接受时间内完成，体验上应为即时或仅有轻微延迟；
* 搜索与过滤操作（特别是 `@modified`）应在用户键入后短时间内完成，不应明显卡顿；
* 从 JSON 保存设置到 UI 反映更新的延迟，应在用户可接受范围内（通常为数百毫秒级）。

### NFR-UI-02 一致性

* 在任何时刻，Settings UI 与 settings.json 中的配置内容必须保持一致的语义：

  * 同一上下文下的有效值一致；
  * 修改标记与 `@modified` 过滤结果和 JSON 是否存在显式值一致；
* 在 update 的 Promise 完成前，不应向用户展示半写入状态。

### NFR-UI-03 可用性与可发现性

* 打开 Settings 的入口应在菜单、命令面板和界面上清晰可见；
* 初级用户无需理解 settings.json 即可完成常见配置；
* 高级用户应能轻松发现 JSON 编辑入口和 `workbench.settings.editor` 设置。

### NFR-UI-04 无障碍（A11y）

* Settings UI 必须支持完整的键盘导航；
* 所有控件应有合理的 aria label 与角色，支持屏幕阅读器；
* 颜色、对比度、焦点状态等满足 VS Code 全局无障碍规范。

### NFR-UI-05 国际化（i18n）

* 所有面向用户的文本均可本地化；
* Setting ID 等内部标识保持英文不变，UI 使用本地化标题和描述。

---

## 7. 典型用例

### UC-UI-01 普通用户通过 UI 修改设置

* 用户使用快捷键打开 Settings UI；
* 在搜索框中输入关键字（如 “font size”）；
* 切换到 User 作用域，修改字体大小 setting；
* 修改立即生效，条目左侧出现修改标记；输入 `@modified` 后可筛选出该 setting。

### UC-UI-02 团队通过 Workspace 设置共享配置

* 团队在仓库中维护 `.vscode/settings.json`；
* 成员打开项目，打开 Settings UI 并切换到 Workspace 视图；
* 在 Workspace 视图下修改格式化相关设置，写入 `.vscode/settings.json`；
* 所有团队成员在该仓库下获得统一的 workspace 设置。

### UC-UI-03 高级用户在 UI 与 JSON 之间切换

* 用户在 Settings UI 中看到部分设置不易批量编辑；
* 点击 UI 顶部的 JSON 按钮打开 User settings.json；
* 使用 IntelliSense 补全 setting ID 和枚举值，批量复制粘贴配置；
* 保存后返回 Settings UI，相关 setting 的值和修改标记已更新。

### UC-UI-04 企业策略下的锁定设置

* 企业通过 Policy 系统强制某些隐私相关设置为特定值；
* 用户在 Settings UI 中看到这些设置被标记为「由组织管理」，控件禁用；
* 即使尝试在 JSON 中修改对应 setting，写入被拒绝或不影响有效值，Settings UI 继续展示策略值和锁定状态。

---
