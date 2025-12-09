# VS Code Configuration 访问与变更子系统需求规格说明书 (SRS)

## 1. 引言

### 1.1 目的

本 SRS 定义 **VS Code Configuration 访问与变更子系统** 的需求，该子系统负责：

* 为 VS Code 核心模块与扩展提供统一的配置读取 API（如 `workspace.getConfiguration()`）；
* 封装配置写入逻辑（如 `WorkspaceConfiguration.update()` 以及内部写入服务）；
* 提供配置变更事件（如 `workspace.onDidChangeConfiguration`），驱动核心与扩展对配置变化作出反应；
* 将存储与分层子系统、声明子系统、Policy 层等复杂性隐藏在统一的编程访问面之后。

### 1.2 系统范围

本子系统覆盖的内容包括：

* 扩展 API 中与配置访问、变更、监听相关的行为与语义：

  * `vscode.workspace.getConfiguration(section?, scope?)`；
  * `WorkspaceConfiguration.get/has/inspect/update`；
  * `workspace.onDidChangeConfiguration` 与 `ConfigurationChangeEvent.affectsConfiguration(section, scope?)`。

* 将上述 API 调用转换为对 Configuration 存储与分层子系统的读取、写入与模型变更请求；

* 基于统一的 ConfigurationScope（资源 URI、语言 ID、Workspace、WorkspaceFolder、Profile 等）定义配置访问上下文。

本子系统**不负责**：

* `settings.json` 等配置文件的物理路径定位、文件读写、文件监听、层级合并算法（由“存储与分层子系统”负责）；
* Setting Schema 的声明、元数据（scope、default、enum 等）与校验规则定义（由“声明子系统”负责）；
* Settings UI 的展示、交互与用户体验（由 Settings UI 子系统负责）；
* Settings Sync 系统的同步协议、云端存储与冲突解决逻辑；
* Enterprise Policy 系统的策略下发、管理与存储。

### 1.3 目标读者

* VS Code 核心开发者与架构师；
* Configuration Core 其他子系统实现者；
* Settings Sync 系统与 Enterprise Policy 系统的实现者；
* 希望深入理解 VS Code 配置 API 行为的扩展开发者。

---

## 2. 基线与引用

* 基线：默认 `engines.vscode` ≥ 1.80；Profile / Remote / Policy 层叠场景需考虑 scope 解析与拒绝写入行为。
* 官方参考：VS Code API (`workspace.getConfiguration`、`WorkspaceConfiguration`、`ConfigurationTarget`、`onDidChangeConfiguration`)、Settings UI、Settings Sync、Enterprise Policy 文档。
* 站内引用：/configuration-system/configuration-core-srs（体系级语义）、/configuration-system/configuration-storage-layering-srs（层与上下文模型）、/configuration-system/configuration-declaration-srs（schema 元数据）、/configuration-system/configuration-settings-ui-srs（UI 交互要求）。

---

## 3. 在 Configuration Core 与外部系统中的位置

### 3.1 在 Configuration Core 内的角色

访问与变更子系统是 Configuration Core 面向“代码世界”的统一门面，承担：

* 对上：

  * 向扩展和核心模块暴露稳定的配置 API 与事件；
  * 以 WorkspaceConfiguration 为承载形式提供配置的“合并视图”。

* 对下：

  * 基于存储与分层子系统提供的 ConfigurationModel 完成读取；
  * 通过统一写入管道将配置变更请求委派给存储与分层子系统；
  * 借助声明子系统完成 setting 注册校验与类型检查。

该子系统不直接操作配置文件、也不自行维护层级合并逻辑，而是构建在统一 ConfigurationService 之上。

### 3.2 与 Settings Sync 系统的关系

* Settings Sync 系统是独立系统，不属于 Configuration 子系统的组成部分；
* 其作为“高权限调用者”使用本子系统提供的 API：

  * 使用读取 API 获取配置快照（或在必要时直接读取 User settings 文件）；
  * 使用更新 API 将云端变更下发到本地配置。

本子系统不为 Settings Sync 系统暴露特殊 API，仅保证通用配置 API 满足其需求。

### 3.3 与 Enterprise Policy 系统的关系

* Enterprise Policy 系统也是独立系统，不属于 Configuration 子系统的组成部分；
* Policy 系统通过 Configuration Core 内部服务向存储与分层子系统注入 Policy 层；
* 本子系统在读取时自动看到“包含 Policy 覆盖”的有效配置；
* 在写入时，如某 setting 被策略锁定，本子系统必须感知并拒绝对应更新请求，将失败信息反馈给调用方。

---

## 4. 核心概念与术语

### 4.1 WorkspaceConfiguration

* 由 `workspace.getConfiguration(section?, scope?)` 返回；
* 代表在特定 section 与 scope 下的 **已合并配置视图**，包含：

  * Default 层；
  * User 层（及 Profile / Remote 相关分片）；
  * Workspace 层；
  * WorkspaceFolder 层；
  * Language-specific 覆盖；
  * Policy 层覆盖。

提供的主要方法包括：

* `get<T>(section, defaultValue?)`：获取最终生效值；
* `has(section)`：判断是否存在显式值；
* `inspect(section)`：获取各层值的详细信息；
* `update(section, value, configurationTarget?, overrideInLanguage?)`：请求写入配置。

### 4.2 ConfigurationScope

* 描述配置访问上下文的抽象类型；
* 常见字段包括：

  * `resource`：URI，指向某文件或虚拟文档；
  * `languageId`：如 `"typescript"`、`"markdown"` 等；
  * `workspaceFolder`：当前资源所在的 Workspace Folder；
  * `profileId`：当前 Profile 标识；
  * 其他可能与 Remote 环境有关的标识。

ConfigurationScope 用于：

* 决定 Workspace / WorkspaceFolder / Language-specific 等层的选择；
* 精确判断某配置变更是否影响特定资源或语言。

### 4.3 ConfigurationTarget

* 枚举类型，用于指定写入目标层：

  * `Global` / `User`：写入用户级设置；
  * `Workspace`：写入当前 Workspace 级设置；
  * `WorkspaceFolder`：写入当前 Workspace Folder 级设置。

在实际 API 中还支持布尔简写（如 `true` 表示 User，`false` 表示 Workspace），以及 `undefined` / `null` 触发默认推导规则。

### 4.4 ConfigurationChangeEvent 与 affectsConfiguration

* `workspace.onDidChangeConfiguration` 事件的参数类型；
* 提供方法：

  * `affectsConfiguration(section: string, scope?: ConfigurationScope): boolean`；

用于在事件处理器中快速判断某变更是否影响扩展关心的配置，以避免对无关变更做昂贵处理。

---

## 5. 功能性需求（FR）

### 5.1 配置读取 API

**FR-ACC-GET-001 `workspace.getConfiguration` 的行为**

* 系统必须提供 `workspace.getConfiguration(section?: string, scope?: ConfigurationScope)`；

* 当 `section` 为非空字符串时：

  * 返回的 WorkspaceConfiguration 视图应以 `section` 为根前缀；
  * 对 `get("foo")` 等调用，逻辑上对应完整 key 为 `"section.foo"`。

* 当 `section` 为 `undefined` 或空字符串时：

  * 返回整个配置树的视图（常与 `languageId` scope 组合，用于语言特定设置）。

**FR-ACC-GET-002 已合并视图**

* 通过 `workspace.getConfiguration` 获取的 WorkspaceConfiguration，在任何 `get` 调用中返回的值必须是：

  * 经过 Default → User → Workspace → WorkspaceFolder → Language-specific → Policy 的层级叠加后，在给定 scope 下的有效值；
  * 调用方不需要也不应该自行重建合并逻辑。

**FR-ACC-GET-003 scope 敏感行为**

* 若传入 `scope`：

  * 合并结果必须依据 scope 信息选择合适的 Workspace / WorkspaceFolder / Language-specific 层；
  * 未传入 scope 时，应使用合理的默认上下文（如当前活动编辑器的资源与语言），但不得产生歧义或不一致行为。

**FR-ACC-GET-004 `WorkspaceConfiguration.get/has`**

* `get<T>(section)`：

  * 以 `section` 为点分 key 读取最终生效值；
  * 若无任何层提供显式值，则返回 `undefined`。

* `get<T>(section, defaultValue)`：

  * 若无显式值，则返回 `defaultValue`；
  * 否则返回合并结果。

* `has(section)`：

  * 只要某层对该 key 有显式赋值（包括语言特定块），即返回 `true`。

**FR-ACC-GET-005 `inspect` 多层信息暴露**

* `inspect(section)` 必须返回一个包含各层值的结构对象，例如：

  * `defaultValue`、`globalValue`、`workspaceValue`、`workspaceFolderValue`；
  * `defaultLanguageValue`、`globalLanguageValue`、`workspaceLanguageValue`、`workspaceFolderLanguageValue`；
  * 以及可选的 `languageIds` 列表。

* 若 `section` 不是叶子节点（如 `"editor"`），应返回 `undefined`。

### 5.2 配置更新 API

**FR-ACC-UPD-001 写入目标计算**

* `WorkspaceConfiguration.update(section, value, configurationTarget?, overrideInLanguage?)` 必须遵守以下规则：

  * 当 `configurationTarget` 是枚举值时：

    * `ConfigurationTarget.Global` / `User`：写入 User 层；
    * `ConfigurationTarget.Workspace`：写入当前 Workspace 层；
    * `ConfigurationTarget.WorkspaceFolder`：写入当前 WorkspaceFolder 层。

  * 当 `configurationTarget` 是布尔值时：

    * `true` 等价于 User；
    * `false` 等价于 Workspace。

  * 当 `configurationTarget` 为 `undefined` 或 `null` 时：

    * 若该 setting 为“资源特定”（依赖 resource scope），则默认写入当前 WorkspaceFolder 层；
    * 否则默认写入当前 Workspace 层。

* 若当前环境无有效 workspace 而请求写入 Workspace / WorkspaceFolder，必须拒绝并返回错误。

**FR-ACC-UPD-002 overrideInLanguage 行为**

* 当 `overrideInLanguage === true` 时：

  * 如果 scope 中存在 `languageId`：

    * 更新应写入对应 `[languageId]` 语言特定块，而不是通用部分；
  * 若 scope 中缺少 `languageId`，应拒绝并返回错误，避免无法确定目标块。

* 当 `overrideInLanguage === undefined` 时：

  * 若 schema 标记该 setting 支持语言覆盖，且 scope 中存在 `languageId`：

    * 默认写入语言特定块；
  * 否则写入通用部分。

**FR-ACC-UPD-003 删除设置语义**

* 当 `value === undefined` 时：

  * 表示从指定层中删除该 setting 的显式值；
  * 不应写入 `null` 或其他占位值；
  * 删除后有效值应回退到更低优先级层（如 Workspace 删除后回退到 User/Default）。

**FR-ACC-UPD-004 写入前校验**

* 在执行 update 之前，必须通过声明子系统进行校验：

  * 对应 setting 已注册；
  * value 类型符合 schema；
  * 写入目标层符合 setting scope 要求（例如只能写 User 层的设置不能写 Workspace 层）。

* 校验失败时，必须拒绝写入，并向调用方返回错误（Promise reject）。

**FR-ACC-UPD-005 Policy 约束处理**

* 若 setting 被 Policy 锁定或局部只读：

  * 对违反策略的写入请求必须被拒绝；
  * 错误信息中应能区分“被策略锁定”和其他错误原因。

**FR-ACC-UPD-006 边界与错误条件**

* 以下场景必须视为错误并拒绝操作：

  * 写入未注册的 setting；
  * 在单文件模式或无 workspace 打开的场景下写入 Workspace / WorkspaceFolder；
  * 需要 WorkspaceFolder scope 的 setting 却缺少 resource / folder 上下文；
  * 将“窗口级配置”写入 WorkspaceFolder 目标；
  * 其他违反 schema 或环境约束的情况。

### 5.3 配置变更事件

**FR-ACC-EVT-001 事件触发条件**

* `workspace.onDidChangeConfiguration` 必须在以下情况下触发：

  * 用户通过 Settings UI 修改配置；
  * 用户编辑并保存 `settings.json` 等配置文件；
  * 扩展通过 update API 修改配置；
  * default/Policy 层发生改变导致有效配置值变化。

* 实现可以将短时间内多次底层变更合并为一次事件，以避免事件风暴。

**FR-ACC-EVT-002 affectsConfiguration 行为**

* `ConfigurationChangeEvent.affectsConfiguration(section, scope?)` 必须满足：

  * 当且仅当给定 `section` 在本次变更中所依赖的层值发生变化时返回 `true`；
  * 当提供 `scope` 时，仅在该 scope 下有效值发生变化才返回 `true`；
  * section 支持点分形式（如 `"editor.fontSize"`），也可用较粗粒度前缀（如 `"editor"`）。

* 实现应保证 `affectsConfiguration` 调用在事件处理内部是轻量且无 I/O 的。

### 5.4 与其他子系统的协作

**FR-ACC-COOP-001 与存储与分层子系统**

* 所有读取（get/has/inspect）行为必须通过 ConfigurationModel 完成；
* 所有写入（update）必须通过统一写入管道转交给存储与分层子系统；
* 访问与变更子系统不得直接访问或修改配置文件。

**FR-ACC-COOP-002 与声明子系统**

* 在 update 前必须通过声明子系统进行：

  * setting 存在性校验；
  * 类型与取值范围校验；
  * scope 校验（哪些层可写）。

**FR-ACC-COOP-003 与 Settings Sync 系统**

* 当 User 层设置更新时：

  * 应以事件或回调的形式将变更通知 Settings Sync 系统；
  * 同时保持 Sync 系统作为普通调用者使用通用 API 的模式，不引入专用 API。

**FR-ACC-COOP-004 与 Enterprise Policy 系统**

* Policy 系统通过内部适配器向存储层注入策略；
* 本子系统只需：

  * 在 get 时看到 Policy 覆盖后的结果；
  * 在 update 时调用 Policy 检查接口决定是否拒绝操作。

---

## 6. 非功能性需求（NFR）

### 6.1 性能

**NFR-ACC-PERF-001 读取性能**

* `workspace.getConfiguration` 与随后 `WorkspaceConfiguration.get` 调用必须被视作轻量操作；
* 在典型规模下，单次读取应为毫秒级开销，可在扩展激活和编辑循环中频繁调用。

**NFR-ACC-PERF-002 写入性能**

* `update` 应采用异步写入策略，不得长时间阻塞 UI 线程；
* 在批量修改配置时应有节流或合并策略，避免产生过多 I/O 与事件。

### 6.2 一致性

**NFR-ACC-CONS-001 视图一致性**

* 在任意时刻，任一 WorkspaceConfiguration 实例通过 `get` 读取的值应与最新的 ConfigurationModel 一致；
* 在 update 的 Promise resolve 之前，不得触发变更事件，也不得对外暴露半写入状态。

### 6.3 可测试性与可观测性

**NFR-ACC-TEST-001 可测试性**

* 访问与变更子系统的实现应支持对以下场景进行自动化测试：

  * 不同 ConfigurationTarget 的写入；
  * 不同 scope（resource/language/workspaceFolder）的读取与写入；
  * 多 WorkspaceFolder、语言特定覆盖的合并行为；
  * Policy 与 Schema 限制下的错误处理。

**NFR-ACC-OBS-001 可观测性**

* 系统应支持在调试模式下输出配置变更事件的详细内容（包括受影响的 section 与 scope），以便调试复杂扩展；
* 可在日志或开发者工具中记录关键配置写入操作。

---

## 7. 典型用例

### UC-ACC-01 扩展读取自身设置并响应变更

* 场景：

  * 扩展声明 `myExtension.featureXEnabled`；
  * 在激活时读取配置，并据此初始化行为；
  * 订阅 `onDidChangeConfiguration` 以响应用户对该设置的修改。

* 行为要求：

  * `workspace.getConfiguration('myExtension')` 返回合并视图；
  * 当设置被修改时，事件触发且 `affectsConfiguration('myExtension.featureXEnabled')` 为 `true`；
  * 扩展可在 handler 中根据新值调整行为。

### UC-ACC-02 扩展写入用户级设置

* 场景：

  * 扩展在安装后希望为所有工作区设置某个默认路径到 User settings。

* 行为要求：

  * 通过 `update('myExtension.path', value, ConfigurationTarget.Global)` 写入；
  * 写入成功后，User 层 settings 文件被持久化更新；
  * 所有工作区在后续读取中都能看到该值。

### UC-ACC-03 写入语言特定设置

* 场景：

  * 扩展希望为 Markdown 文件设置特定的编辑器选项。

* 行为要求：

  * 使用 `workspace.getConfiguration('', { languageId: 'markdown', resource: uri })` 获取配置对象；
  * 调用 `update('editor.fontSize', 14, ConfigurationTarget.Workspace, true)`；
  * 更新被写入 Workspace 级 `[markdown]` 块，仅对 Markdown 文档生效。

### UC-ACC-04 使用 inspect 诊断复杂叠加

* 场景：

  * 扩展需要诊断 `editor.tabSize` 的来源层。

* 行为要求：

  * 调用 `inspect('editor.tabSize')` 获得 default/global/workspace/workspaceFolder 及对应 language-specific 值；
  * 扩展可将此信息输出到日志或调试 UI，帮助开发者理解当前配置。

---
