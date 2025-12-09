# VS Code Configuration 系统总体需求规格说明书 (SRS)

## 1. 引言

### 1.1 文档目的

本《软件需求规格说明书》（SRS）从**系统级视角**定义 VS Code 中的 **Configuration 系统（下文简称 *Configuration Core*）**：

* 界定“配置底座”负责的范围与不负责的范围；
* 给出统一的概念模型：Setting / Configuration / Scope / Layer / ConfigurationTarget 等；
* 说明 Configuration Core 内部的 **4 个子系统**：

  * Configuration 声明子系统
  * Configuration 存储与分层子系统
  * Configuration 访问与变更子系统
  * Settings UI 子系统（Configuration 的交互子系统）
* 定义其与 **Settings Sync 系统**、**Enterprise Policy 系统** 及其他可配置系统（Keybindings、Extensions、Snippets、Profiles 等）的协作边界。

本 SRS 为上述子系统的 SRS/SDD 提供统一上位规范。

### 1.2 系统范围（Scope）

#### 1.2.1 Configuration Core 内部子系统

**VS Code Configuration 系统（Configuration Core）** 专指 VS Code 内部的“settings 配置底座”，包含 4 个子系统：

1. **Configuration 声明子系统**

   * 管理所有 *Setting* 的声明（schema）：

     * VS Code 核心内置设置；
     * 扩展通过 `contributes.configuration` 声明的设置。
   * 提供统一的 registry，包含 ID、类型、默认值、scope、描述、弃用信息等。

2. **Configuration 存储与分层子系统**

   * 管理配置的 **物理存储** 与 **逻辑层级**：

     * 默认设置（default settings，只读）
     * 用户设置（User `settings.json`）
     * 工作区 / 文件夹设置（workspace / folder `settings.json`，包含 multi-root）
     * 语言特定设置（`"[typescript]"` 等 language override）
   * 定义多层配置的优先级与合并规则。

3. **Configuration 访问与变更子系统**

   * 提供统一编程接口：

     * `vscode.workspace.getConfiguration(section?, scope?)` 返回 `WorkspaceConfiguration`；
     * `WorkspaceConfiguration.get / update / inspect`；
     * `workspace.onDidChangeConfiguration` 事件。
   * 屏蔽底层存储细节，为内核与扩展提供“当前有效配置视图”。

4. **Settings UI 子系统（Configuration 交互子系统）**

   * 提供图形化设置编辑器（Settings Editor）和 JSON Settings Editor：

     * 搜索、分类、筛选（如 `@modified`）
     * 切换 User / Workspace / Folder 视图；
     * 打开 User / Workspace settings.json 的入口。

这四个子系统一起构成 VS Code 中 **settings 的唯一事实来源**。

#### 1.2.2 不在 Configuration Core 内部，但紧密协作的系统

1. **Settings Sync 系统（独立系统）**

   * 功能：跨设备 / 实例同步 VS Code 的个性化环境，包括设置、键位、扩展、UI 状态等。
   * 依赖：从 Configuration Core 获取设置快照、scope 信息与忽略规则，并通过 Core 的写入接口应用远端变更。

2. **Enterprise Policy 系统（独立系统）**

   * 功能：通过组策略、MDM、Linux JSON policy 等机制集中管理 VS Code 的部分设置与行为。
   * 与 Core 的关系：以“Policy 配置源”的形式注入一个 **最高优先级层**，并向 UI 暴露“由组织管理”的状态。

3. **其他可配置兄弟系统（不在本 SRS 范围内）**

   * Keybindings、Extensions、Snippets、Profiles 等：

     * 它们有各自的模型与存储；
     * 通过 settings 与 Configuration Core 产生交互（功能开关、参数等）

本 SRS 只定义 Configuration Core 的需求，对上述协作系统只定义接口与契约，不描述其内部细节。

### 1.3 目标读者

* VS Code 平台架构师、核心开发者；
* Configuration 子系统实现者；
* VS Code 扩展开发者；
* 企业管理员 / DevOps / 平台工程团队；
* 本项目中其他文档的撰写者与评审者。

### 1.4 非目标（Non-Goals）

Configuration Core 不试图解决：

* 账号、身份、多租户管理（Settings Sync 负责）；
* 企业策略的分发、审计、审批流程（Policy 系统 + 企业设备管理负责）；
* Keybindings / Snippets / Extensions 的领域业务逻辑，仅通过 settings 进行有限交互。

---

## 2. 基线与引用

* 基线：默认 `engines.vscode` ≥ 1.80；Remote/Web/Codespaces 需考虑 Profile/Remote scope 与 Policy 层的叠加。
* 官方参考：VS Code 配置相关文档（Configuration API、Contribution Points、Settings UI、Settings Sync、Enterprise Policy）与源码中的 `configurationRegistry`、`ConfigurationService`、Settings Editor 模块。
* 站内引用：/tree-view/configuration-and-settings-srs（Tree 域配置协作摘要）、/external-entry/uri-and-links-srs（外部入口供给域）、/external-entry/auth-and-trust-srs（策略/信任占位）。

## 3. 产品视角与设计目标

### 3.1 产品视角

从 VS Code 整体产品的视角，**Configuration Core 是一条横切能力**，贯穿：

* 核心功能（编辑器、终端、调试、主题等）的可配置行为；
* 扩展生态通过 `contributes.configuration` 声明的配置项；
* Settings Sync / Policy / Profiles 等上层系统所依赖的基础配置模型。

其目标是：

> 提供一个统一、可扩展、可诊断的 settings 体系，使 VS Code 用户与扩展可以在不同粒度（全局 → 工作区 / 文件夹 → 语言特定）的层次上定制行为，并为企业与多设备场景提供稳定基础。

### 3.2 设计原则

1. **分层覆盖（Layered Override）**

   * 默认设置 → 用户设置 → 工作区 / 文件夹设置 → 语言特定设置 的优先级必须清晰、稳定且对外公开。

2. **声明驱动（Schema-driven）**

   * 所有对用户可见的 settings 必须有 schema 声明：类型、默认值、描述、scope 等。
   * schema 是 Settings UI、JSON 编辑器补全与校验、API 类型检查的共同来源。

3. **读取统一 / 写入明确**

   * 读取：统一通过 `workspace.getConfiguration()` 获取“有效配置视图”；
   * 写入：必须显式指明写入目标（User / Workspace / Folder），不得隐式跨层写入。

4. **UI 与 JSON 双栖**

   * Settings Editor 提供默认入口，面向大多数用户；
   * `settings.json` 保持第一等公民地位，为高级用户与自动化脚本服务。

5. **为上层系统服务，而不与之耦合**

   * Configuration Core 不直接承担“同步”“策略管理”的业务职责；
   * 但必须提供稳定的层级模型与 API，允许 Settings Sync / Policy 等在其之上叠加能力。

---

## 4. 概念模型与术语

### 4.1 Setting 与 Setting ID

* **Setting**：

  * 存储在 `settings.json` 中的配置条目，形如 `"editor.fontSize": 14`。
* **Setting ID**：

  * Setting 的全局唯一标识，采用点分命名空间，例如 `editor.fontSize`、`myExtension.featureX.enabled`。

### 4.2 Configuration（有效配置视图）

* 在特定上下文（workspace / folder / resource / language / profile / policy 环境）下，所有相关 Settings 按 Layer 合并后的**有效值集合**；
* 对扩展和内部模块，表现为 `WorkspaceConfiguration` 对象。

### 4.3 Scope（作用域）

Scope 定义 Setting 的**生效范围**与可以被写入的层：

* User / Application 级别（全局）
* Workspace / Folder 级别（项目特定）
* Language-specific（用 `"[languageId]"` 语法声明）
* （概念上可扩展）Profile scope、Remote / Container scope等，视为额外维度叠加在 Layer 上。

与之相关的、主要由上层系统使用的 scope 还有：

* Machine / Machine-overridable：用于 Settings Sync 决定是否同步到其他设备。

### 4.4 Layer（层级）

Configuration Core 在逻辑上以层叠模型维护配置：

1. Default 层：内置默认值（只读）
2. User 层：用户全局设置
3. Workspace 层：当前工作区 `.vscode/settings.json` 或 `.code-workspace` 内嵌设置
4. Folder 层：multi-root 场景下的单个根文件夹设置
5. Language Override 层：以上每层对某语言的覆盖块`"[languageId]"`

**Profile 层**与**Policy 层**在实现上也表现为额外 layer，但它们的生命周期和管理策略由 Profile 系统、Policy 系统负责；Configuration Core 只保证可以将它们组装进合并 pipeline。

优先级（从低到高，大致为）：

> Default < User (< Profile 变体) < Workspace < Folder < Language-specific < Policy

### 4.5 ConfigurationTarget（写入目标）

在写入时，上层调用必须以抽象枚举指定写入目标：

* `User`：写入用户 `settings.json`；
* `Workspace`：写入当前工作区 `.vscode/settings.json` 或 workspace 文件；
* `WorkspaceFolder`：写入指定 workspace folder 设置。

### 4.6 Configuration Core 与外部系统

* **Configuration Core**：负责 settings 的 schema、存储、分层、访问、UI；
* **Settings Sync 系统**：在 Core 之上对 settings（以及其他资源）做跨设备同步；
* **Enterprise Policy 系统**：在 Core 之上以策略形式注入高优先级值，并将其标记为“由组织管理”；
* **其他可配置系统**：与 Core 节点间只通过 settings 交互。

---

## 5. Configuration Core 子系统视图

> 每个子系统的详细需求在其 SRS 中展开；本节仅给出系统级职责与边界。

### 5.1 Configuration 声明子系统

**职责：**

* 维护全局 Configuration Registry：

  * 注册 VS Code 内置与扩展贡献的 settings schema；
  * 验证 schema 的基本正确性和冲突（ID 唯一、类型兼容等）；
* 向以下组件提供查询能力：

  * Settings UI（构建 UI 结构、控件类型、默认值、描述）；
  * JSON Editor（补全与校验）；
  * Configuration 访问与变更子系统（类型检查、默认值）。

### 5.2 Configuration 存储与分层子系统

**职责：**

* 管理各层配置的物理存储：

  * default settings（打包资源）；
  * User / Workspace / Folder `settings.json` 文件；
* 为每个 scope 构建可合并的 `ConfigurationModel`；
* 定义并实现配置合并规则，输出“逻辑层叠后的配置模型”。

### 5.3 Configuration 访问与变更子系统

**职责：**

* 暴露面向内部/扩展的配置 API：

  * `workspace.getConfiguration`、`WorkspaceConfiguration.get/update/inspect`；
  * `onDidChangeConfiguration` 事件（含 `affectsConfiguration` 能力）；
* 将读取请求翻译成 scope + key 查询，交给存储与分层子系统；
* 将写入请求翻译成对特定层文件的修改（同时结合 schema 做基本验证）。

### 5.4 Settings UI 子系统

**职责：**

* 提供 Settings Editor（UI）：

  * 分类 / 搜索 / `@modified` 过滤；
  * User / Workspace / Folder 视图切换；
* 提供 User / Workspace JSON Settings 编辑入口；
* 对 Policy 管理的设置显示“由组织管理”等状态标记；

---

## 6. 与外部系统关系（系统级）

### 6.1 与 Settings Sync 系统

Configuration Core 必须向 Settings Sync 系统提供：

* 区分 scope / layer 的 settings 快照（含 machine / machine-overridable 信息）；
* 稳定的读写 API：Sync 通过这些 API 读取用户配置、应用远端变更；
* 变更事件：供 Sync 感知本地设置变化。

Sync 系统负责：账号、冲突解决、云存储、备份恢复等。

### 6.2 与 Enterprise Policy 系统

Configuration Core 必须：

* 提供“Policy 层”的注入点，使策略可作为最高优先级配置源覆盖其他层；
* 允许 Settings UI 查询某个设置是否被 Policy 管理，并展示相应标记。

Policy 系统负责：从 OS/MDM/JSON policy 读取策略值，并按约定 ID 映射到 settings。

### 6.3 与其他兄弟系统

* Keybindings / Extensions / Snippets / Profiles 等：

  * 通过 settings 定义行为开关与参数；
  * 通过 `onDidChangeConfiguration` 订阅配置变化；

---

## 7. 系统级功能性需求（FR）

### FR-CORE-01 分层配置模型

* Core 必须支持多层设置文件（Default / User / Workspace / Folder / Language override），并在任何给定 scope 下为每个 Setting ID 计算一个**确定性有效值**；
* 该优先级规则属于平台契约，应保持长期稳定。

### FR-CORE-02 声明式 Schema 驱动

* 所有可见 settings（包括扩展提供的）必须有 schema，包含：

  * type/default/description/scope/enum 等；
* Schema 必须驱动：

  * Settings UI 控件渲染与解释文本；
  * JSON Editor 中的补全与校验；
  * 写入时的类型检查。

### FR-CORE-03 统一配置访问接口

* 必须提供统一的 `workspace.getConfiguration` 视图：

  * 支持按 section/ID 查询；
  * 支持 `resource` / `languageId` 等 scope 上下文；
* 提供 `inspect` 能查看各层原始值，用于诊断。

### FR-CORE-04 配置变更传播

* 当有效配置发生变化时（来自 UI、JSON 文件、API 写入或 Sync/Policy 更新），系统必须：

  * 向内部组件与扩展广播 `onDidChangeConfiguration` 事件；
  * 支持通过 `affectsConfiguration` 判断这次变更是否影响某 section/setting。

### FR-CORE-05 Settings UI 与 JSON 一致性

* Settings Editor 与 JSON Settings 必须：

  * 基于同一 schema 展示字段、类型、默认值；
  * 对同一 scope + Setting ID 始终展示一致的当前值；
  * 对非法值给出一致的校验行为。

### FR-CORE-06 对 Settings Sync 的支撑

* Core 必须向 Sync 暴露：

  * 区分 machine/machine-overridable 的 settings 信息；
  * `settingsSync.ignoredSettings` 规则生效所需信息；
* Sync 写回必须通过与用户写入相同的路径与校验。

### FR-CORE-07 对 Enterprise Policy 的支撑

* Core 必须支持 Policy 层在配置合并中的位置，并保证：

  * Policy 层可覆盖其他层值；
  * 当设置被 Policy 管理时，Settings UI 可识别并标记，访问 API 返回的是 Policy 生效后的值。

---

## 8. 系统级用例（Use Cases）

### UC-CORE-01 工作区级定制编辑行为

* 用户在 Settings UI 中切换到 Workspace 视图；
* 修改 `editor.tabSize`，设置只影响当前工作区；
* Workspace settings 写入 `.vscode/settings.json`；
* Core 重新计算该 workspace 的有效值并触发变更事件；
* 编辑器和扩展根据变更更新行为。

### UC-CORE-02 扩展声明并使用自己的 settings

* 扩展在 `package.json` 中通过 `contributes.configuration` 声明 settings；
* Settings UI 展示这些设置，支持用户在不同 scope 上修改；
* 扩展通过 `workspace.getConfiguration('myExtension')` 读取，订阅 `onDidChangeConfiguration` 响应变更。

### UC-CORE-03 语言特定设置

* 用户在设置中添加 `"[typescript]": { "editor.tabSize": 2 }`；
* 在 TS 文件中，tabSize 使用 2；在其他语言中使用各自层叠后的值。

### UC-CORE-04 Settings Sync 跨设备同步

* 用户在设备 A 上开启 Sync，修改某些 settings；
* Sync 将用户设置（过滤 machine / ignored）上传到云端；
* 设备 B 启用 Sync 后拉取并应用这些设置；
* 两侧均通过 Configuration Core 的 API 读写 settings。

### UC-CORE-05 企业策略锁定设置

* 企业通过 Policy 系统配置某些 settings 的策略值；
* Policy 层注入后覆盖用户值；
* Settings UI 中显示“由组织管理”，编辑控件锁定；
* 扩展通过 `getConfiguration` 访问时看到的是策略生效后的最终值。

---

## 9. 非功能需求（NFR）

### NFR-CORE-01 一致性

* 在给定 scope 下，对同一 Setting ID 的重复读取必须返回一致结果；
* 任何改变有效值的操作都必须触发配置变更事件。

### NFR-CORE-02 性能

* 配置解析与访问不能成为 VS Code 冷启动和常用交互的主要瓶颈；
* 常用 settings 的读取应为轻量级操作，适合热路径调用。

### NFR-CORE-03 可靠性与恢复

* settings 文件损坏不能导致 VS Code 启动失败；应尽可能：

  * 高亮错误位置；
  * 允许用户回退或重置为默认值。

### NFR-CORE-04 可扩展性

* 在设置项数量和扩展数量增加的情况下，Configuration Core 仍能保证可接受性能；

### NFR-CORE-05 安全性与策略遵从

* 不应提供绕过 Policy 系统的配置通道；
* machine scope 设置不得被错误同步到其他设备。

### NFR-CORE-06 可观测性与诊断

* 通过 `inspect` 等 API 能够诊断特定 Setting 在各层的值与来源；

---

## 10. 术语表与未来演进

### 10.1 术语表（概要）

* **Setting** / **Setting ID**
* **Configuration**（有效配置视图）
* **Scope**（User / Workspace / Folder / Language-specific / Profile / Machine）
* **Layer**（Default / User / Workspace / Folder / Language Override / Policy）
* **ConfigurationTarget**
* **Configuration Core**
* **Settings Sync 系统 / Enterprise Policy 系统**

### 10.2 未来演进（占位）

* Profile/Remote/Policy 叠加的更多维度与事件粒度优化；
* 更细粒度的性能与观测指标（如热路径预算与缓存策略）；
* 提供官方工具方法帮助扩展诊断合并结果与策略来源。

---
