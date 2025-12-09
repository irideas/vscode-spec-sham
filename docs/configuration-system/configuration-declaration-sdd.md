# VS Code Configuration 声明子系统软件设计说明书 (SDD)

## 1. 文档背景与设计目标

### 1.1 背景与基线

* 基线：`engines.vscode` ≥ 1.80，兼容 Remote/Web/Profile/Policy 场景。
* 参考：VS Code Contribution Points（`contributes.configuration`、`configurationDefaults`）、Settings UI/Sync/Policy 文档；站内 /configuration-system/configuration-core-srs、/configuration-system/configuration-declaration-srs。

### 1.2 设计目标

* 提供统一、高效、可诊断的 Configuration Schema Registry，支撑核心与扩展的 schema 注册、查询与校验。
* 为 Settings UI、JSON 语言服务、Configuration Service、Sync/Policy 提供一致的元数据源。
* 在大规模扩展生态下保持性能、缓存与热加载/卸载能力。

### 1.3 设计约束与原则

* 对外契约与 SRS 一致：校验规则、冲突处理、对外接口保持兼容。
* Registry 只读暴露，写路径仅通过正规注册流程（核心/扩展/默认覆盖）。
* 热注册/卸载需可清理或标记扩展贡献的设置，避免残留。
* 可观测性：校验错误/冲突需有诊断可查；查询接口具备索引/缓存。

---

## 2. 组件视图

### 2.1 组件视图

1. **ConfigurationRegistry**：存储/查询所有 Setting Schema，维护按 ID / 扩展 / 类别索引，向外暴露只读接口。
2. **CoreConfigurationContributor**：启动时注入内置 Setting 声明，构建 default configuration。
3. **ExtensionConfigurationReader**：读取扩展 `contributes.configuration` 与 `configurationDefaults`，生成内部 IR。
4. **SchemaNormalizer & Validator**：填充默认值，校验类型/enum/scope/ignoreSync，拒绝不支持的 JSON Schema 片段。
5. **ConfigurationDefaultsRegistry**：存储 configurationDefaults 的 default override（含语言块）。
6. **RegistryQueryFacade**：为 Settings UI / JSON 语言服务 / Configuration Service / Sync/Policy 提供受控查询接口。
7. **Diagnostics & Telemetry**：记录 schema 解析/校验的错误与警告，必要时上报常见错误模式。

### 2.2 与其他子系统 / 外部系统的依赖关系

* **存储与分层子系统**：读取 Schema 和 default overrides 以构建 defaultSettings、校验写入。
* **访问与变更子系统**：基于 Schema 做 `inspect` / `update` 类型与 scope 检查。
* **Settings UI 子系统**：通过 Facade 获取 Category/Setting 列表与元数据。
* **Settings Sync / Enterprise Policy（外部）**：通过 Facade 获取 scope/ignoreSync/policyCapable 等元数据。

---

## 3. 内部数据模型设计

### 3.1 中间表示（IR）

```ts
type RawConfigurationContribution = RawConfigurationObject | RawConfigurationObject[];

interface RawConfigurationObject {
  title?: string;
  properties?: Record<string, RawSettingSchema>;
}

interface RawSettingSchema {
  type?: string | string[];
  default?: any;
  description?: string;
  markdownDescription?: string;
  scope?: string;
  enum?: any[];
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
  tags?: string[];
  ignoreSync?: boolean;
  deprecationMessage?: string;
  markdownDeprecationMessage?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: any;
  properties?: Record<string, any>;
  order?: number;
  policyCapable?: boolean; // 预留
}
```

### 3.2 Registry 结构（示意）

```ts
interface SettingSchemaModel {
  id: string;
  extensionId: string;      // 'vscode-core' 或扩展 ID
  categoryId?: string;
  type: string | string[];
  default?: any;
  description?: string;
  markdownDescription?: string;
  enum?: any[];
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
  scope: 'application' | 'window' | 'resource' | 'machine' | 'machine-overridable' | string;
  deprecationMessage?: string;
  markdownDeprecationMessage?: string;
  tags?: string[];
  order?: number;
  ignoreSync: boolean;
  policyCapable?: boolean;
}

interface ConfigurationCategoryModel {
  id: string;                   // `${extensionId}:${localName}`
  title: string;
  extensionId?: string;
  properties: Map<string, SettingSchemaModel>;
}

class ConfigurationRegistry {
  private settings = new Map<string, SettingSchemaModel>();
  private categories = new Map<string, ConfigurationCategoryModel>();
  private extensionToSettings = new Map<string, string[]>();
  // 查询接口见第 5 章
}
```

### 3.3 ConfigurationDefaults Registry

```ts
interface DefaultOverride {
  key: string;      // 'files.autoSave' 或 '[markdown]'
  value: any;
  extensionId: string;
}

class ConfigurationDefaultsRegistry {
  overrides: DefaultOverride[] = [];
}
```

---

## 4. 关键流程设计

### 4.1 启动时注册核心设置

1. CoreConfigurationContributor 构建内置 `SettingSchemaModel` 列表。
2. 调用 `ConfigurationRegistry.registerCoreSettings(coreSchemas)`；SchemaValidator 校验 ID 唯一、类型与默认值合法。
3. 写入 `settings`/`categories` 索引，生成 Default Configuration 视图供存储与分层子系统使用。

### 4.2 安装 / 启用扩展时注册设置

1. Extension Host 解析扩展 `package.json`，Reader 读取 `contributes.configuration`（单对象或数组）。
2. 生成 IR，Normalizer 填补类别默认 `type: "object"`、补 scope/ignoreSync 默认，校验 default/enum/type。
3. Validator 检测 ID 冲突、不支持的 JSON Schema 特性（如 `$ref`），非法片段记录诊断并跳过。
4. 对合法 schema 调用 `ConfigurationRegistry.registerExtensionSettings(extensionId, categoryModels)`，更新索引与 `extensionToSettings`。
5. 解析 `configurationDefaults`，生成 DefaultOverride 列表存入 ConfigurationDefaultsRegistry。

### 4.3 卸载 / 禁用扩展时清理

1. 根据 extensionId 获取相关 Setting ID。
2. 从 `settings`/`categories` 移除或标记不可用的设置；空类别删除。
3. 触发 `ConfigurationSchemaChangeEvent`，通知 Settings UI / Configuration Service 刷新。

### 4.4 Settings UI 查询流程

1. Settings UI 通过 Facade 获取 Category 列表与对应 Setting 列表。
2. 按 Schema 渲染控件（boolean→checkbox、enum→dropdown、tags→提示等），结合 scope/Policy/Sync 状态调整可编辑性。

### 4.5 settings.json JSON Schema 暴露流程

1. JSON 语言服务请求 settings.json Schema。
2. 声明子系统提供 Setting ID → Schema 映射，含枚举与 Markdown 描述。
3. JSON LS 生成补全、类型检查、错误诊断与 hover 提示。

### 4.6 configurationDefaults 合并流程

1. 存储与分层子系统构建 defaultSettings 时读取 DefaultOverride：
   * 先加载核心默认值；
   * 再按扩展顺序叠加 overrides（含语言块）。
2. 对不存在的 Setting ID 记录诊断并跳过，避免污染 defaultSettings。

---

## 5. 对外接口设计（RegistryQueryFacade）

```ts
interface IConfigurationRegistry {
  getSchema(settingId: string): SettingSchemaModel | undefined;
  getAllSettings(): Iterable<SettingSchemaModel>;
  getSettingsByExtension(extensionId: string): Iterable<SettingSchemaModel>;
  getCategories(): Iterable<ConfigurationCategoryModel>;
  getSettingsByCategory(categoryId: string): Iterable<SettingSchemaModel>;
  onDidChangeSchema: Event<ConfigurationSchemaChangeEvent>;
}

interface ConfigurationSchemaChangeEvent {
  added: string[];
  removed: string[];
  updated: string[];
  source: 'core' | string; // 'core' 或扩展 ID
}
```

* Settings UI / JSON LS / Configuration Service / Sync/Policy 仅通过该接口读取，不直接访问内部 Map。

---

## 6. 校验与错误处理策略

### 6.1 SchemaValidator 规则（要点）

* Setting ID 需匹配 `/^[a-z0-9]+(\\.[a-z0-9]+)*$/i`。
* `default` 类型与 `type` 兼容；`enum` 与 `default` 同构；scope 为受支持枚举或注册扩展 scope。
* 不支持的 JSON Schema 特性（如 `$ref`）给出警告并跳过。

### 6.2 错误处理

* 扩展 schema 错误：记录诊断，不影响 VS Code 启动；在扩展诊断视图/开发者工具中提示。
* 核心 schema 错误：开发阶段阻断合入；运行时发现时记录高优日志，必要时回退到安全默认。
* 对冲突（同 ID 类型不兼容）按“先注册者优先”或明确策略取舍，并输出警告。

---

## 7. 性能与缓存设计（简要）

* 查询路径使用多重索引（ID / extId / categoryId），保持 O(1)/O(log n)。
* 大规模扩展下支持延迟加载：冷启动仅加载核心 schema，首次访问扩展 schema 时解析并缓存。
* configurationDefaults 采用按 languageId/settingId 的前缀索引，减少 merge 成本。
* 对 Settings UI 所需的全量快照可做只读缓存，Schema 变更事件触发增量更新。

---

## 8. 安全性与可观测性

* 禁止扩展在运行时绕过 Manifest 动态写入 Registry 内部结构。
* Diagnostics & Telemetry：统计常见错误（ID 冲突、类型不匹配、枚举错误等），可选上报用于生态治理。

---

## 9. 扩展性与演进（含测试建议）

* 预留 policyCapable / ignoreSync 等额外标记，兼容未来策略/同步特性。
* 可增加增量 schema 变更广播，供 Settings UI / JSON LS 热刷新。
* 测试建议：覆盖核心/扩展 schema 注册、冲突检测、configurationDefaults 应用、热卸载清理、查询性能基准。 
