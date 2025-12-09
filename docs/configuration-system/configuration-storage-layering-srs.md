# VS Code Configuration 存储与分层子系统需求规格说明书 (SRS)

## 1. 引言

### 1.1 目的

本 SRS 用于规范 **VS Code Configuration 存储与分层子系统** 的需求，明确：

* 配置数据的物理存储形式与文件路径；
* Default / User / Workspace / Folder / Language-specific / Profile / Remote / Policy 等多层配置的模型与合并规则；
* 配置加载、重载、损坏恢复的行为；
* 与其他系统（Configuration 声明子系统、Configuration 访问与变更子系统、Settings UI 子系统、Settings Sync 系统、Enterprise Policy 系统等）的协作接口。

该需求说明书将作为软件设计（SDD）与后续实现、测试的依据。

### 1.2 系统范围

本子系统负责：

* 维护 VS Code 中各层 settings 文件及 default settings 资源的 **定位、读写、解析与缓存**；
* 根据当前上下文（Workspace、Folder、资源 URI、语言、Profile、Remote、Policy 域等），构造统一的 **分层配置模型** 并计算有效配置值；
* 监听相关配置源的变更（本地文件、远程配置、策略更新等）并刷新模型，向上游提供结构化变更信息；
* 为 Remote / Profile / Policy 等场景预留合并位置和扩展点。

本子系统不负责：

* 配置项 Schema 的声明、验证与文档生成（由 Configuration 声明子系统负责）；
* 对扩展暴露的 `workspace.getConfiguration()` / `update()` / `onDidChangeConfiguration` 等 API（由 Configuration 访问与变更子系统负责）；
* Settings Sync 系统的同步协议、冲突解决、云端存储等逻辑（由 Settings Sync 系统自身负责）；
* Enterprise Policy 系统的策略下发、MDM/GPO 管理等逻辑（由 Policy 系统自身负责）。

### 1.3 术语与缩写

* **Default Settings**：VS Code 内置默认配置集合；
* **User Settings**：用户级 `settings.json` 文件；
* **Workspace Settings**：工作区级设置（单文件夹 `.vscode/settings.json` 或 `.code-workspace` 中的 `settings` 部分）；
* **Folder Settings**：多根工作区中每个文件夹下 `.vscode/settings.json`；
* **Language-specific Settings**：`"[languageId]"` 语法块中的配置；
* **Profile**：VS Code Profile，提供多套用户级配置集合；
* **Remote Settings**：远程工作区场景下的 user / workspace settings；
* **Policy Settings**：由 Enterprise Policy 系统注入的只读策略配置；
* **Layer（层）**：逻辑上的配置叠加层级（如 Default / User / Remote / Workspace / Folder / Language / Policy）；
* **Context（上下文）**：计算配置时使用的当前环境信息，包括 workspaceId / folderId / resource URI / languageId / profileId / remoteKind / policyDomain 等。

### 1.4 非目标（Non-Goals）

* Settings Sync 协议、冲突解决与云端存储不在本子系统内；
* Enterprise Policy 的解析、下发、审计流程不在本子系统内；
* 配置 Schema 定义与校验规则由声明子系统负责；API 语义与事件由访问与变更子系统负责；
* Settings UI 的具体呈现与交互不在本子系统内（仅提供值与来源）。

---

## 2. 基线与引用

* 基线：默认 `engines.vscode` ≥ 1.80；支持 Profile / Remote / Policy 等扩展层次。
* 官方参考：VS Code 配置文档、ConfigurationService/ConfigurationRegistry 源码、Settings Sync/Policy 文档。
* 站内引用：/configuration-system/configuration-core-srs、/configuration-system/configuration-declaration-srs（defaultSettings 来源）、/configuration-system/configuration-access-update-srs（API 语义）、/configuration-system/configuration-settings-ui-srs（UI 展示）。

---

## 3. 子系统定位与外部关系

### 3.1 在 Configuration 系统中的角色

在整个 Configuration 系统中，本子系统的角色可以概括为：

> **“所有配置数据的物理来源 + 统一分层合并后的有效配置视图提供者”**

上游依赖：

* 文件系统与运行时环境：

  * Default settings 内置资源；
  * 本地 User / Workspace / Folder settings 文件；
  * Profile 目录下的 Profile User settings；
  * Remote 环境中的 user/workspace settings；
* Enterprise Policy 系统：按约定接口提供策略配置条目（逻辑上作为 Policy 层）。

下游服务对象：

* **Configuration 访问与变更子系统**：基于本子系统提供的模型实现 `getConfiguration()` / `update()` / `inspect()` / 对外变更事件等；
* **Settings UI 子系统**：展示不同层级配置值与来源（Default/User/Remote/Workspace/Folder/Language/Policy），实现 `@modified` 等过滤；
* **Settings Sync 系统**：以 User 层配置文件为同步对象，或通过本子系统提供的读写接口访问这些文件；
* 其他内部模块：如 Telemetry、诊断系统等，可基于本子系统的观测接口记录配置状态或错误。

### 3.2 边界与职责

本子系统必须负责：

* 定位并读取各层 settings 文件 / default settings 资源；
* 解析配置文件（含 JSONC、注释、语言特定块）并构建层模型；
* 按规则对各层进行合并，支持对象深度合并、数组替换等策略；
* 在配置文件或远程 / 策略变更时增量更新模型并触发变更通知；
* 在 Profile 切换、Remote 连接 / 断开、Policy 变更时更新对应层模型；
* 在文件损坏或部分配置不合法时提供降级与恢复行为。

本子系统不直接负责：

* 如何向扩展暴露变更事件以及如何转换为 API 事件对象（由访问与变更子系统负责）；
* 如何在 UI 中渲染配置编辑界面和层次来源（由 Settings UI 子系统负责）；
* 如何执行远程同步和策略解析（由 Settings Sync 系统与 Enterprise Policy 系统负责）。

---

## 4. 分层模型与上下文

### 4.1 配置层（Layer）定义

子系统支持如下逻辑层级，从低到高依次叠加：

1. **Default 层**

   * 内置 default settings + `configurationDefaults` 扩展默认值；
   * 只读。

2. **User 层**

   * 当前用户的本地 `settings.json`；
   * 在无 Profile 时代表“全局用户配置”；
   * 启用 Profile 时，每个 Profile 拥有一套独立的 User 层。

3. **Remote User 层（可选）**

   * Remote 开发场景下的远程 user settings；
   * 针对当前远程端点，与本地 User 层叠加使用。

4. **Workspace 层**

   * 单文件夹工作区：当前根目录 `.vscode/settings.json`；
   * 多根工作区：`.code-workspace` 文件中的 `settings` 部分。

5. **Remote Workspace 层（可选）**

   * 远程工作区的 workspace settings；
   * 与 Workspace 层叠加规则一致，只是物理存储位置不同。

6. **Folder 层**

   * 多根工作区中，每个根文件夹自身 `.vscode/settings.json`；
   * 单文件夹模式可以视为“唯一 Folder 层”。

7. **Language Override 层**

   * 在上述各层内部，`"[languageId]"` 语法块构成语言特定覆盖层；
   * 对应同一 settingId，在语言上下文内优先于通用值。

8. **Policy 层（可选）**

   * 由 Enterprise Policy 系统注入的配置值；
   * 合并顺序中优先级最高，覆盖其他所有层；
   * 为只读。

### 4.2 上下文（Context）定义

计算配置值时，必须显式依赖以下上下文信息：

* 当前 Profile 标识（profileId）；
* 当前 Workspace 标识与 Workspace 类型（本地 / Remote）；
* 当前 Workspace Folder 标识（在多根工作区下）；
* 当前资源 URI（文件、虚拟文档等）；
* 当前语言标识（languageId）；
* 当前是否处于 Remote 环境及具体 remoteKind；
* 当前是否存在生效的 Policy 域（policyDomain）。

子系统对外的查询接口必须接收 Context，并在内部据此确定参与合并的层集合。

### 4.3 多层优先级规则

**FR-STOR-MODEL-001 多层优先级**

* 对于任意 settingId，在给定 Context 下有效值必须按如下从低到高顺序叠加：

  1. Default 层；
  2. 本地 User 层；
  3. Remote User 层（如有）；
  4. Workspace 层；
  5. Remote Workspace 层（如有）；
  6. Folder 层（针对具体资源所属文件夹）；
  7. Language-specific 覆盖（在上述每层内部对当前 languageId 的 override）；
  8. Policy 层（如有）。

* 若高优先级层未对某 settingId 赋值，则回退到下一个低优先级层。

### 4.4 值合并策略

**FR-STOR-MODEL-002 合并策略**

* 标量值（string/number/boolean）采用“高层覆盖低层”策略；
* 对象值按 key 深度合并，高层覆盖同名字段，未设置字段从低层继承；
* 数组值默认使用“整体替换”策略（高层完全替换低层），除非某些 Setting 有明确特例；
* language-specific 覆盖在各层内部再次应用相同规则。

---

## 5. 功能性需求（FR）

### 5.1 配置文件加载与解析

**FR-STOR-LOAD-001 Default 配置加载**

* 系统必须在启动阶段或首次需要时加载 default settings 资源，构建 Default 层模型；
* Default 层为只读，不允许通过任何接口修改 underlying 资源。

**FR-STOR-LOAD-002 User 配置加载**

* 根据当前用户的 OS 与应用安装路径，定位本地 `settings.json` 并解析；
* 若文件不存在，则视为“空配置”；
* 若 JSON 存在语法错误，必须尽可能保留可解析部分，并向上游报告错误信息。

**FR-STOR-LOAD-003 Workspace / Folder 配置加载**

* 打开工作区时，系统必须加载：

  * 单文件夹工作区：根目录 `.vscode/settings.json`；
  * 多根工作区：`.code-workspace` 中的 `settings` + 各根目录 `.vscode/settings.json`；
* 若 `.code-workspace` 和某 Folder 的 `.vscode/settings.json` 对同一 settingId 都有值，须遵守 Workspace / Folder 的优先级规则。

**FR-STOR-LOAD-004 Language-specific 配置解析**

* 系统必须识别 `"[languageId]"` key 下的配置块，并解析为独立的语言特定覆盖模型；
* 支持在 Default / User / Remote User / Workspace / Remote Workspace / Folder 各层中定义 language-specific 配置；
* 对于语法不合法或无法识别的 languageId，不得影响其他合法配置解析。

**FR-STOR-LOAD-005 Profile 场景支持**

* 启用 Profile 时：

  * 每个 Profile 拥有独立的 User settings 文件集或目录；
  * 系统必须根据当前活动 Profile 加载对应 User 层模型；
  * 在 Profile 切换时重新加载 User 层并更新整体模型。

**FR-STOR-LOAD-006 Remote 场景支持**

* Remote workspace 场景下：

  * 必须支持从远程环境加载 user/workspace settings，并映射到 Remote User / Remote Workspace 层；
  * 在本地与远程同时存在设置时，按优先级规则进行合并；
  * 远程加载异常时须提供合理降级方案（保持本地配置可用，并标记 Remote 层不可用）。

### 5.2 配置模型构建与查询

**FR-STOR-MODEL-003 层模型抽象**

* 每一层必须构建为统一的 `ConfigurationLayerModel`：

  * 普通键值（非语言特定）；
  * 按 languageId 分类的 overrides；
  * 可选的源信息（文件路径、位置信息、Profile/Remote 标识等）。

**FR-STOR-MODEL-004 有效值查询接口**

* 本子系统必须向访问与变更子系统提供查询接口，支持：

  * 根据 settingId + Context 获取当前有效值；
  * 获取指定 settingId 在各层的值分布，用于 `inspect()` 和 Settings UI 展示；
* 对同一 Context 下多次查询，应具备可选缓存能力以保证性能。

### 5.3 配置变更检测与刷新

**FR-STOR-CHANGE-001 文件变更监控**

* 本子系统必须监控以下配置源的变更：

  * User / Profile User settings 文件；
  * Workspace / Folder settings 文件；
  * Remote user/workspace settings；
  * Policy 源（通过策略接口通知）。

* 当内容变化后，应在合理时间内重新解析并更新对应层模型。

**FR-STOR-CHANGE-002 变更传播与事件**

* 更新模型后，本子系统必须产生结构化变更信息，至少包含：

  * 受影响的 settingId 列表；
  * 变更层级（User/RemoteUser/Workspace/Folder/Language/Policy 等）；
  * 对应上下文（workspaceId/folderId/profileId/remoteKind 等）。
* 该信息将交由访问与变更子系统包装为对外事件（如 `onDidChangeConfiguration`）。

**FR-STOR-CHANGE-003 Profile / Remote / Workspace 切换**

* Profile 切换、Remote 连接 / 断开、Workspace 打开 / 关闭 时：

  * 本子系统必须更新参与合并的层集合；
  * 视情况触发全局配置变更事件或较大粒度的变更事件。

### 5.4 与 Settings Sync 系统协作

**FR-STOR-SYNC-001 User 配置单一真相来源**

* 对于 Settings Sync 系统：

  * User 层 settings 文件（本地或 Remote）必须被视为配置的“单一真相来源”；
  * 若 Sync 系统需要修改 User settings，应通过本子系统提供的统一写入路径或文件服务接口，而不是绕过本子系统直接操作文件；
  * Sync 系统不属于 Configuration 子系统的一部分，但必须遵守本子系统公开的文件与模型契约。

### 5.5 与 Enterprise Policy 系统协作

**FR-STOR-POLICY-001 Policy 层插入点**

* 本子系统必须为 Policy 配置在合并链路中预留一个最高优先级的只读层：

  * Policy 值覆盖其他所有层的值；
  * Policy 系统通过约定接口提供一个或多个 Policy 来源；
  * Policy 系统只负责提供策略数据，本子系统负责将其转化为 Policy 层模型并参与合并。

### 5.6 错误处理与损坏恢复

**FR-STOR-ERR-001 JSON 语法错误处理**

* 当任意 settings 文件出现 JSON 语法错误时：

  * 不得阻塞 VS Code 启动与基本功能；
  * 对该文件，优先保留上一次成功解析的模型；
  * 无历史模型可用时，忽略该层，仅依赖其他层；
  * 向上游暴露错误信息，以便在编辑器中进行诊断提示。

**FR-STOR-ERR-002 局部配置值非法**

* 当某个 key 的值与 Schema 类型不匹配或不合法时：

  * 仅该 key 的值被视为无效；
  * 回退到较低层或默认值；
  * 其他 key 不受影响。

**FR-STOR-ERR-003 Remote 不可用**

* 当 Remote 层不可用（网络中断、远程服务器故障等）时：

  * 保证本地 Default + 本地 User + 本地 Workspace/Folders 层仍然可用；
  * 标记 Remote 层为“暂不可用”，在恢复后重新加载；
  * 向上游提供可观测信息以便 UI 或日志显示。

---

## 6. 非功能性需求（NFR）

### 6.1 性能

**NFR-STOR-PERF-001 启动性能**

* 在典型规模（数百～上千配置项）下，加载 Default + User + Remote + Workspace + Folder + Language/Policy 模型的时间不得成为 VS Code 冷启动的主要瓶颈。

**NFR-STOR-PERF-002 重载性能**

* 在用户保存配置文件或 Remote/Policy 更新后，模型重建和合并应在用户主观感受“即时”的时间范围内完成（例如几十毫秒级），不会造成明显 UI 卡顿。

### 6.2 可靠性

**NFR-STOR-REL-001 数据一致性**

* 配置写入必须采用安全策略（如临时文件 + 原子替换），尽量避免出现“半写入状态”；
* 在崩溃或异常中断后，系统应尽可能恢复到最近一次完整、合法的配置状态。

### 6.3 可观测性

**NFR-STOR-OBS-001 诊断信息**

* 本子系统应提供基础诊断能力，至少包括：

  * 某文件解析失败的记录（路径、错误原因）；
  * 某层被跳过或降级的记录；
  * 特定设置来源层的信息查询（用于 `inspect` 和 UI 显示）。

### 6.4 向后兼容

**NFR-STOR-COMP-001 历史行为兼容**

* 对于已有 VS Code 版本与扩展依赖的配置行为（包括 multi-root workspace 与 Remote 的合并顺序），本子系统必须保持兼容或提供明确的迁移策略。

---

## 7. 典型用例

### UC-STOR-01 单文件夹工作区配置覆盖 {#uc-stor-01}

* 用户在 User settings 中设置 `editor.fontSize = 13`；
* 在某项目根目录 `.vscode/settings.json` 中设置 `editor.fontSize = 18`；
* 结果：

  * 有效值为 18；
  * `inspect` 显示 Default / User / Workspace/Folders 各层具体值与来源。

### UC-STOR-02 多根工作区 + Folder 设置 {#uc-stor-02}

* 用户创建包含 A/B 两个根目录的 `.code-workspace`；
* `.code-workspace` 中设置 `"files.exclude"`；
* A 的 `.vscode/settings.json` 覆盖 `files.exclude` 部分字段；
* 结果：

  * 对 A 目录资源，使用 Workspace + A Folder 叠加结果；
  * 对 B 目录资源，仅使用 Workspace 设置。

### UC-STOR-03 Profile 切换 {#uc-stor-03}

* Profile A 中 `editor.fontSize = 13`，Profile B 中 `editor.fontSize = 11`；
* 在同一 Workspace 中切换 Profile：

  * User 层数据源切换；
  * Workspace/Folders 层保持不变；
  * 有效值随 Profile 变化。

### UC-STOR-04 Remote 工作区 {#uc-stor-04}

* 用户通过 Remote 方式连接远程工作区；
* 在远程 user settings 中设置某配置，在本地 user settings 中设置另一值；
* 结果：

  * 按优先级顺序叠加本地 User、Remote User、Workspace / Remote Workspace 等层；
  * Remote 环境断开时，回退到本地数据。

### UC-STOR-05 Policy 覆盖场景 {#uc-stor-05}

* 企业策略强制某设置值（如禁用遥测）；
* 用户在 User 或 Workspace 中配置相反的值；
* 结果：

  * 有效值采用 Policy 层；
  * `inspect` 显示 Policy 值和本地层值，UI 可据此标示“被策略覆盖”。

---
