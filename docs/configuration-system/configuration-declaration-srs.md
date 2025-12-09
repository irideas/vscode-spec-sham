# VS Code Configuration 声明子系统需求规格说明书 (SRS)

## 1. 引言

### 1.1 目的

本《软件需求规格说明书》（SRS）定义 **Configuration 声明子系统** 的需求规范，用于：

* 统一 VS Code 核心与扩展生态中的 **Setting 声明模型与约束**；
* 为 Settings UI、配置存储与解析、扩展 API、**Settings Sync 系统（外部系统）**、**Enterprise Policy 系统（外部系统）** 提供 **稳定的元数据来源**；
* 作为 Configuration Core 内部其他子系统（存储与分层、访问与变更、Settings UI）的基础设施。

本子系统关注：

> “**定义有什么设置（有哪些 Setting）、长什么样（Schema 与元数据）**”

**不**负责设置值本身的存储、合并或读写。

### 1.4 非目标（Non-Goals）

* Settings Sync 协议、冲突解决与云端存储不在本子系统内；
* Enterprise Policy 的解析、下发、审计流程不在本子系统内；
* settings 值的存储位置、层叠合并与 API 访问语义由其他子系统负责；
* JSON 语言服务的内部实现不在本子系统内（仅输出 Schema 供其使用）。

---

## 2. 基线与引用

* 基线：默认 `engines.vscode` ≥ 1.80；需兼顾 Remote/Web/Profiles/Policy 等场景的 schema 元数据消费。
* 官方参考：VS Code Contribution Points 文档（`contributes.configuration`、`configurationDefaults`），VS Code API 中 Configuration 章节，Settings UI、Settings Sync、Enterprise Policy 文档。
* 站内引用：/configuration-system/configuration-core-srs（体系级定义）、/configuration-system/configuration-storage-layering-srs（default settings 与层叠）、/configuration-system/configuration-access-update-srs（API 行为）、/configuration-system/configuration-settings-ui-srs（UI 呈现）。

### 1.2 系统范围（Scope）

本子系统覆盖：

* VS Code 核心内置设置的声明与注册；
* 扩展在 `package.json` 中通过 `contributes.configuration` 声明的设置；
* 所有 Setting 声明对应的 JSON Schema（类型、默认值、枚举、描述、scope 等）；
* Configuration Schema Registry / Configuration Defaults Registry 的管理与查询能力；
* 用于 Settings UI、JSON Settings 编辑器的 Schema 暴露。

**不在本子系统范围内** 的内容（由其他子系统或外部系统负责）：

* `settings.json` 的物理存储位置、分层与合并规则
  （由「存储与分层子系统」负责）；
* `workspace.getConfiguration()` 等访问与变更 API
  （由「访问与变更子系统」负责）；
* Settings UI 的呈现逻辑与交互细节
  （由 Settings UI 子系统负责）；
* **Settings Sync 系统** 的同步协议/冲突解决/跨设备合并逻辑（外部系统）；
* **Enterprise Policy 系统** 的策略解析、注入与合规逻辑（外部系统）。

> 共识：Settings Sync 与 Enterprise Policy **使用本子系统的元数据**，但**不属于 Configuration Core 的子系统**。

### 1.3 目标读者

* VS Code 核心开发者 / Configuration 系统架构师；
* VS Code 扩展开发者（尤其是对配置有复杂需求的扩展作者）；
* 负责 Settings UI、Settings Sync、Enterprise Policy 等相关系统的实现者；
* 技术文档撰写者与规范维护者。

---

## 3. 在 Configuration 系统中的位置与外部关系

### 3.1 在 Configuration Core 中的位置

Configuration 声明子系统是 **Configuration Core 的 4 个子系统之一**，负责“**配置元数据层**”：

* 与 **存储与分层子系统**：

  * 提供 default configuration（默认设置）与类型信息，作为配置模型的输入；
* 与 **访问与变更子系统**：

  * 提供 Setting Schema（类型、scope、默认值、废弃信息等），用于 `inspect` / `update` 等 API 的校验与行为；
* 与 **Settings UI 子系统**：

  * 提供“所有设置的分类结构 + 元数据”，用于渲染设置树、表单控件、工具提示等；

> 核心定位一句话：
> **“把 VS Code 核心与所有扩展的设置声明，汇总成一个统一的 Configuration Schema Registry，并对外提供查询与 Schema 源能力。”**

### 3.2 与其他内部子系统的关系

* **存储与分层子系统**

  * 使用 Schema 中的 `default`、`scope`、`ignoreSync` 等信息构建 defaultSettings 模型；
  * 在写入过程中可根据类型信息进行基本校验。

* **访问与变更子系统**

  * 使用 Setting Schema 解析 `inspect()` 的多层值（默认值、用户、工作区、文件夹等）；
  * 在 `update()` 前做类型与 scope 合规性检查。

* **Settings UI 子系统**

  * 使用 Category / Setting 列表构建 UI；
  * 使用描述、枚举、tags 等信息决定控件类型、排序与展示样式。

### 3.3 与外部系统（Sync / Policy）的关系

* **Settings Sync 系统（外部系统）**

  * 使用 Schema 元数据判断：

    * 某设置是否属于 “settings 资源”；
    * 是否应参与同步（例如 machine-only 设置默认不参与同步）。
  * Sync 系统本身是 Configuration Core 外部的系统，本子系统只负责提供元数据视图，不关心其内部协议实现。

* **Enterprise Policy 系统（外部系统）**

  * 使用 Schema 中的 key 列表、类型信息以及额外标记（如 ignoreSync、policyCapable）：

    * 决定哪些 Setting 可以被策略覆盖；
    * 为策略编辑器提供字段与类型基础。
  * Policy 系统负责从 ADMX / MDM / JSON policy 读取策略并注入配置解析链，本子系统仅提供 “可被管理的设置类型” 的说明。

---

## 4. 核心概念与数据模型（概念层）

### 4.1 Configuration Contribution 与配置类别

* **Configuration Contribution（配置声明）**

  指扩展在 `package.json` 的 `contributes.configuration` 字段中，声明的一组 Setting 类别与属性。

* **Configuration Category（配置类别）**

  `configuration` 字段可以是单个对象，也可以是对象数组。每个对象代表一个类别，包含：

  * `title`：类别标题，在 Settings UI 左侧树或扩展设置页显示；
  * `properties`：该类别下的 Setting 定义集合（key 为 Setting ID）。

### 4.2 Setting Schema（设置模式）

每个 Setting（property）在 Schema 中至少包含：

* `type`：
  `"string" | "boolean" | "number" | "integer" | "array" | "object"` 或这些的联合；
* `default`：
  默认值，用于 defaultSettings 与 UI 展示；
* `description` / `markdownDescription`：
  文本描述 / Markdown 描述；
* `scope`：
  作用域，如 `resource` / `window` / `application` / `machine` / `machine-overridable` 等；
* `enum` / `enumDescriptions` / `markdownEnumDescriptions`：
  枚举值与说明；
* `tags`：
  如 `["usesOnlineServices"]`，标记该设置会访问在线服务；
* `ignoreSync`：
  布尔值，标明该设置不应参与 Settings Sync；
* `deprecationMessage` / `markdownDeprecationMessage`：
  用于标记废弃设置及替代方案。

此外支持 JSON Schema 子集：`minimum`/`maximum`/`pattern`/`items`/`properties` 等。

### 4.3 Setting ID（设置 ID）

* `properties` 中的每个 key（如 `editor.fontSize`、`git.alwaysSignOff`）是 Setting 的 **全局 ID**；
* 推荐命名约定：`extensionId.sectionName.settingName`，避免与其他扩展冲突。
* 在全局范围内，Setting ID 与其类型组合应保持一致；类型冲突视为错误或至少产生诊断信息。

### 4.4 Configuration Registry（配置注册表）

* 统一存储所有 Setting ID 与其 Schema；
* 提供按 ID、按扩展、按类别的查询接口；
* 作为 Settings UI / JSON 语言服务 / Configuration Service 的 Schema 源。

（详细数据结构见 SDD 第 2 章。）

### 4.5 configurationDefaults（默认值覆盖）

* Manifest 中的 `contributes.configurationDefaults` 用于为现有 Setting 提供新的默认值，或语言特定默认值（如 `"[markdown]"`）。
* 声明子系统负责：

  * 校验目标 key 是否是合法 Setting ID；
  * 将这些 override 注册到 Default Configuration 模型中，供存储与分层子系统合并。

---

## 5. 功能性需求（FR）

### 5.1 核心设置声明（Core Settings）

**FR-DECL-CORE-001 内置设置声明**

* VS Code 核心模块必须通过内部机制在 Configuration Registry 中声明自己的 Setting：

  * 每个 Setting 必须有唯一 ID、类型与默认值；
  * 推荐提供 `description` / `markdownDescription`。

**FR-DECL-CORE-002 默认设置视图生成**

* 声明子系统必须支持为「存储与分层子系统」生成 Default Settings 视图：

  * 作为 `defaultSettings.json` 的数据来源；
  * 作为 Settings UI 中“只读默认值参考”的基础。

### 5.2 扩展设置声明接入与注册（Extension Settings）

**FR-DECL-EXT-001 解析 Manifest 中的 configuration 声明**

* 系统必须能从每个扩展的 `package.json` 中解析 `contributes.configuration`（单对象或数组）并加载。

**FR-DECL-EXT-002 多类别支持**

* 当 `configuration` 为数组时，系统应将每个元素视为一个独立类别：

  * 分别注册其 `title` 与 `properties`；
  * 在 Settings UI 中按类别展示。

**FR-DECL-EXT-003 Schema 合法性校验**

* 对每个 Setting Schema，需要至少执行以下校验：

  * 必须声明 `type`，否则视为错误；
  * 若声明 `default`，其值必须与 `type` 兼容；
  * 若声明 `enum`，`default` 必须属于枚举集合；
  * 若声明 `scope`，其值必须属于受支持枚举之一；
  * 若声明 `ignoreSync`，必须是布尔值。

**FR-DECL-EXT-004 Setting ID 唯一性与冲突处理**

* 对于同一扩展，Setting ID 不得重复；
* 在全局范围内，不允许两个扩展对同一 Setting ID 提供 **类型不兼容** 的定义：

  * 发生冲突时，系统应记录诊断信息；
  * 可按“先加载者优先”的策略选择有效定义，但必须在开发者工具中给出清晰警告。

**FR-DECL-EXT-005 热注册与卸载**

* 当扩展安装 / 启用时，其配置声明必须可被动态解析并注册到 Registry；
* 当扩展卸载 / 禁用时，应支持从 Registry 中移除或标记该扩展贡献的设置为不可用。

### 5.3 Schema 能力与对外暴露（Schema & UI/工具集成）

**FR-DECL-SCHEMA-010 JSON Schema 子集支持**

* Setting Schema 至少应支持 JSON Schema 的以下子集：
  `type`、`anyOf`、`enum`、`minimum`、`maximum`、`pattern`、`items`、`properties` 等。

**FR-DECL-SCHEMA-011 VS Code 特有字段支持**

* 必须支持并保留以下 VS Code 扩展字段：

  * `markdownDescription`
  * `enumDescriptions` / `markdownEnumDescriptions`
  * `scope`
  * `deprecationMessage` / `markdownDeprecationMessage`
  * `tags`、`order` 等
  * 将来可扩展的 UI 元数据（如 `advanced` 标记）

**FR-DECL-SCHEMA-020 为 Settings UI 提供 Schema**

* 系统必须能将所有 Category / Setting 映射为 Settings UI 可用模型，包括：

  * 分类结构（类别标题、扩展来源等）；
  * 每个 Setting 的类型、默认值、描述、scope；
  * `tags`、`deprecationMessage`、`order` 等附加元数据。

**FR-DECL-SCHEMA-021 为 JSON Settings 提供 JSON Schema**

* 声明子系统必须为 `settings.json` 提供 JSON Schema，使用户在编辑 User / Workspace settings 时获得：

  * key 的自动补全；
  * 值的类型校验与错误提示；
  * 枚举选项提示与说明。

**FR-DECL-SCHEMA-030 查询接口**

* Registry 必须提供按 Setting ID、扩展 ID、类别的查询接口，供：

  * Configuration Service；
  * Settings UI；
  * JSON 语言服务；
  * 诊断工具使用。

### 5.4 与 Sync / Policy 的元信息集成（使用方为外部系统）

> 注意：Sync 和 Policy 是外部系统，本小节只描述本子系统应暴露的元信息。

**FR-DECL-SYNC-001 ignoreSync 与 machine-only 语义**

* Schema 必须支持 `ignoreSync: true` 标记，表示该设置不应默认参与 Settings Sync；
* 对于 `scope: "machine"` / `"machine-overridable"` 的设置，即便未声明 `ignoreSync`，在对外暴露给 Sync 系统时也必须视为“不可同步”。

**FR-DECL-SYNC-002 usesOnlineServices 标签**

* 当 Setting 声明 `tags: ["usesOnlineServices"]` 时，必须保留此标签：

  * 供 Settings UI 显示“使用在线服务”提示；
  * 供 Policy 系统识别联网相关设置。

**FR-DECL-SYNC-003 Policy 能力标记（预留）**

* Schema 应预留字段标记某 Setting 是否可被策略管理（如 `policyCapable`），并对外暴露该信息供 Policy 系统查询。

### 5.5 configurationDefaults 相关需求

**FR-DECL-DEFAULTS-001 默认值覆盖声明解析**

* 系统必须解析 Manifest 中的 `contributes.configurationDefaults`：

  * 支持对现有 Setting 的 default override；
  * 支持语言特定 default（如 `"[markdown]"`）。

**FR-DECL-DEFAULTS-002 目标 key 校验**

* 对每个 configurationDefaults key：

  * 若为普通 Setting ID（如 `"files.autoSave"`），必须检查已存在对应 Setting 声明；
  * 若为语言块（如 `"[markdown]"`），则其内部 key 也必须是已存在的 Setting ID；
  * 未找到对应 Schema 时应记录诊断并跳过该项。

---

## 6. 非功能性需求（NFR）

### 6.1 性能

**NFR-DECL-PERF-001 启动性能**

* 解析并注册所有扩展的配置声明不应成为 VS Code 冷启动的明显瓶颈；
* 可采用延迟加载策略（例如在扩展激活或首次打开 Settings UI 时完成部分注册），但从用户视角应保持“自然快速”。

**NFR-DECL-PERF-002 查询性能**

* 单个 Setting Schema 的查询应接近 O(1) 时间复杂度；
* 在上万 Setting ID 规模下，应能保持可接受的响应时间。

### 6.2 内存与可扩展性

**NFR-DECL-MEM-001**

* 面对大规模扩展生态（上万 Setting）的场景，Registry 的内存占用应在可控范围内；
* 必要时可采用按扩展分段加载 / 缓存等优化策略。

### 6.3 一致性与可测试性

**NFR-DECL-CONS-001 可观测性**

* Registry 内容应可通过诊断命令或开发者工具导出，支持：

  * 调试 Schema 冲突与错误；
  * 验证配置文档与实现的一致性。

**NFR-DECL-TEST-001 回归测试**

* 对 Schema 与 Registry 行为的修改必须有回归测试，确保：

  * Settings UI；
  * JSON 编辑器；
  * Configuration Service
    等主要消费者不受破坏。

---

## 7. 与其他子系统及外部系统的接口概要

### 7.1 与存储与分层子系统

* 提供默认值集合（Default Configuration）；
* 提供类型、scope、ignoreSync 等信息，用于写入时校验与 defaultSettings 合并。

### 7.2 与访问与变更子系统

* 提供用于 `inspect()` 的 Schema 信息（默认值、各层值、类型）；
* 提供 `update()` 前的静态检查依据（是否可写、作用域是否合法）。

### 7.3 与 Settings UI 子系统

* 提供：

  * Category 列表（含扩展来源）；
  * 每个 Setting 的类型、默认值、说明、枚举、tags；
* Settings UI 不直接操作 Registry 内部数据结构，通过 Facade 接口获取只读视图。

### 7.4 与 Settings Sync / Enterprise Policy 系统（外部）

* 暴露只读元数据视图，供外部系统按需查询：

  * scope；
  * ignoreSync；
  * policyCapable / usesOnlineServices；
* 不建立 Sync/Policy → Registry 的回写通道。

---

## 8. 典型用例（Use Cases）

### UC-DECL-01 扩展声明简单设置 {#uc-decl-01}

* 扩展在 `package.json` 中添加：

```jsonc
"contributes": {
  "configuration": {
    "title": "My Extension",
    "properties": {
      "myExt.enableFeature": {
        "type": "boolean",
        "default": true,
        "description": "Enable awesome feature."
      }
    }
  }
}
```

* 声明子系统解析并注册 Schema；
* Settings UI 在“扩展 → My Extension”中显示对应开关；
* `settings.json` 获得该 key 的自动补全与类型校验。

### UC-DECL-02 将配置拆分为多个类别 {#uc-decl-02}

* 扩展将 `configuration` 设为数组，将 Setting 拆成“Content”“Appearance”等类别；
* 声明子系统注册多个类别；
* Settings UI 中该扩展的设置页显示多个分组面板。

### UC-DECL-03 声明资源级 Setting（resource scope） {#uc-decl-03}

* 某扩展提供 `git.alwaysSignOff` 设置，声明 `scope: "resource"`；
* Registry 将 scope 信息写入 Schema；
* 存储与分层子系统根据 scope 决定该设置可写入哪些层（User / Workspace / Folder）以及合并策略。

### UC-DECL-04 声明非同步设置 {#uc-decl-04}

* 扩展声明 `remoteTunnelAccess.machineName` 并设置 `ignoreSync: true`；
* 对 Sync 系统而言，该 Setting 默认不参与同步；
* Policy 系统仍可以引用该 Setting 进行本机策略控制（视策略设计而定）。

### UC-DECL-05 通过 configurationDefaults 覆盖语言特定默认值 {#uc-decl-05}

* 扩展通过 `configurationDefaults` 为 `"[markdown]"` 提供默认编辑器设置（如 `wordWrap`）；
* 声明子系统校验 key 并注册 default override；
* 存储与分层子系统将其合并到 defaultSettings 中，从而影响 markdown 文件的默认行为。

---

## 9. 术语表与未来演进

### 9.1 术语表（本子系统局部）

* **Setting Schema**：描述 Setting 类型、默认值、枚举与约束的 JSON Schema 片段。
* **Configuration Registry**：保存所有 Setting Schema 的内部注册表。
* **Configuration Category**：Settings UI 中的分类节点，由 `contributes.configuration` 的数组元素表示。
* **Configuration Defaults Registry**：保存 configurationDefaults 声明的默认值 override 集合。

### 9.2 未来演进（占位）

* 增强 schema 校验的错误提示与诊断能力；
* 对大型扩展生态的 schema 变更提供增量加载与缓存优化；
* 更细粒度的 policyCapable / ignoreSync 扩展标记。

---
