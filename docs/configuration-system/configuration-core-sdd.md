# VS Code Configuration 系统总体软件设计说明书 (SDD)

## 1. 设计目标与约束

### 1.1 设计目标

* 构建一个分层、可扩展、声明驱动的 settings 架构；
* 为 VS Code 内核与扩展提供统一、稳定的配置 API 和事件机制；
* 为 Settings Sync / Policy 等独立系统预留清晰的挂接点，而不与其业务逻辑强耦合。

### 1.2 约束

* 不改变 VS Code 对外 API 语义（`workspace.getConfiguration`、`onDidChangeConfiguration` 等要兼容既有扩展）；
* 兼容现有 settings 文件结构、默认设置与 Settings Sync / Policy 行为。

### 1.3 使用者关注点（占位）
- 平台/核心工程：关心层叠模型、事件一致性、Policy/Sync 挂接。
- 扩展作者：关心 API 语义与类型/Scope 检查、变更事件过滤。
- QA/文档：关心端到端流程、质量/性能门槛与可观测性。

---

## 2. 总体架构与分层

### 2.1 三层架构视图

从实现视角，Configuration Core 可以分为三层：

1. **模型与声明层（Model & Registry）**

   * `ConfigurationRegistry`：管理所有 setting schema，提供查询。

2. **存储与合并层（Storage & Merge Engine）**

   * 多个 `ConfigurationModel` 实例表示不同层：

     * DefaultConfiguration
     * UserConfiguration
     * WorkspaceConfiguration / FolderConfiguration
     * LanguageOverrideConfiguration
   * （由 Sync / Policy 系统提供的）Profile/Policy 模型可作为额外 `ConfigurationModel` 插入。

3. **访问与交互层（Access & UI）**

   * `ConfigurationService`（访问与变更子系统核心）：

     * 提供内部查询与写入接口；
   * `WorkspaceConfigurationImpl` 等 API façade：

     * 适配 VS Code API。
   * Settings UI 控制器：

     * 构建 Settings Editor / JSON Editor 体验。

### 2.2 与外部系统的依赖方向

* Settings Sync 系统：

  * 通过访问层 API 获取配置快照、监听变更、写回设置；
* Enterprise Policy 系统：

  * 通过“Policy 配置源”接口向存储与合并层注入一个额外的 `ConfigurationModel`；

---

## 3. 配置数据模型与合并策略

### 3.1 SettingEntry 与 ConfigurationModel

在实现层，ConfigurationModel 可以被视为：

```ts
type LayerId = 'default' | 'user' | 'workspace' | 'folder' | 'profile' | 'policy';

interface SettingEntry {
  key: string;
  valuesByLayer: {
    default?: any;
    user?: any;
    workspace?: any;
    folder?: Map<string /*folderId*/, any>;
    languageOverrides?: Map<string /*languageId*/, {
      user?: any;
      workspace?: any;
      folder?: Map<string, any>;
    }>;
    profile?: Map<string /*profileId*/, any>;
    policy?: any; // 来自 Policy 系统的值
  };
}
```

`ConfigurationModel` 则是若干 SettingEntry 的集合，提供：

```ts
class ConfigurationModel {
  getValue<T>(key: string, scope?: ConfigurationScope): T | undefined;
  inspect<T>(key: string, scope?: ConfigurationScope): { default?: T; user?: T; ... };
  merge(another: ConfigurationModel): ConfigurationModel; // 用于层叠
}
```

### 3.2 Scope → Layer 解析

`ConfigurationScope` 典型包含：

```ts
interface ConfigurationScope {
  resource?: URI;
  languageId?: string;
  workspaceFolderId?: string;
  profileId?: string;
}
```

ConfigurationService 在查询时：

1. 根据 `scope` 确定需要参与合并的 layers（User/Workspace/Folder）以及 folderId、languageId、profileId 等；
2. 将 Policy 配置源视为额外最高优先级 Layer；
3. 将各层值按顺序叠加，得到最终值。

---

## 4. 关键跨子系统流程

### 4.1 启动时配置加载

**参与组件**：存储与分层子系统、声明子系统、访问与变更子系统、Settings UI

1. VS Code 启动，初始化文件系统与扩展宿主；
2. 存储与分层子系统：

   * 读取 default settings 资源；
   * 读取 User/Workspace/Folder `settings.json`；
   * 解析语言特定块；
3. 声明子系统：

   * 注册 VS Code 内置 settings schema；
   * 延迟注册扩展 `contributes.configuration` schema。
4. 存储与分层子系统构建初始 `ConfigurationModel`；
5. ConfigurationService 初始化完成，对外暴露 API；
6. Settings UI 在第一次打开时，通过 schema + 配置模型构建视图。

### 4.2 用户通过 Settings UI 修改设置

1. 用户在 Settings Editor 中修改某 Setting（如 Workspace 范围的 `editor.fontSize`）；
2. Settings UI：

   * 通过声明子系统获取 schema，做类型校验；
   * 调用访问与变更子系统的 update 接口，指定 target=Workspace；
3. ConfigurationService 将写入委托给存储与分层子系统，更新对应 `settings.json` 并重建模型；
4. ConfigurationService 比对前后配置，构造 `ConfigurationChangeEvent`；
5. 通过 API 向内核与扩展广播 `onDidChangeConfiguration`；
6. Settings UI 订阅事件，刷新受影响条目的显示。

### 4.3 扩展读取配置并响应变更

1. 扩展激活时调用 `workspace.getConfiguration('myExtension', scope)`；
2. `WorkspaceConfigurationImpl` 将 scope + section 转为内部查询；
3. ConfigurationService 返回合并结果；
4. 扩展注册 `onDidChangeConfiguration`，使用 `affectsConfiguration('myExtension')` 过滤，只在相关配置变更时重新加载。

### 4.4 Settings Sync 与 Policy 挂接（Core 视角）

* **Settings Sync**：

  * 通过访问与变更子系统获取用户设置快照；
  * 根据 `ignoredSettings` 与 machine scope 决定同步范围；
  * 将远端数据写回 User settings，通过同一写入流程生效。

* **Policy**：

  * Policy 系统构建一个 `PolicyConfigurationModel` 并注册到 ConfigurationService 作为最高层；
  * Settings UI 与访问层在计算值和展示来源时，识别该层并标记“由组织管理”。

---

## 5. 子系统间接口契约（概览）

### 5.1 声明子系统接口

```ts
interface IConfigurationRegistry {
  registerConfiguration(schema: ConfigurationSchema): void;
  getConfigurationProperties(): Map<string, ConfigurationPropertySchema>;
  getConfigurationProperty(id: string): ConfigurationPropertySchema | undefined;
}
```

**使用方**：

* Settings UI：构建 UI 树、控件、描述；
* JSON Editor：补全与错误提示；
* ConfigurationService：在写入时做类型及 scope 检查。

### 5.2 存储与分层子系统接口

```ts
interface IConfigurationStorage {
  loadUserConfiguration(): ConfigurationModel;
  loadWorkspaceConfiguration(workspaceId: string): ConfigurationModel;
  loadFolderConfiguration(folderId: string): ConfigurationModel;
  onDidConfigurationFileChange: Event<ConfigurationFileChange>;
}
```

ConfigurationService 通过该接口维护各层 `ConfigurationModel`，并监听文件变化。

### 5.3 访问与变更子系统接口

```ts
interface IConfigurationService {
  getValue<T>(key: string, scope?: ConfigurationScope): T | undefined;
  updateValue(key: string, value: any, target: ConfigurationTarget, scope?: ConfigurationScope): Promise<void>;
  inspect<T>(key: string, scope?: ConfigurationScope): ConfigurationInspectResult<T> | undefined;
  onDidChangeConfiguration: Event<ConfigurationChangeEvent>;
}
```

API façade `WorkspaceConfigurationImpl` 只是对该接口的类型安全包装。

### 5.4 Settings UI 子系统接口

Settings UI 通过：

* `IConfigurationService` 获取/更新 settings；
* `IConfigurationRegistry` 获取 schema；
* `IPolicyQueryService`（来自 Policy 系统）查询“由组织管理”状态；
* `ISettingsSyncStatusService`（来自 Sync 系统）获取同步状态（可选）。

---

## 6. 安全与健壮性设计（Core 视角）

### 6.1 文件安全

* 所有写入 settings.json 的操作都必须通过 ConfigurationEditingService 统一完成，防止路径遍历或越权写入；
* 解析 JSON 出错时：

  * 不得影响 VS Code 进程稳定性；
  * 在 JSON 编辑器中标出错误位置，并尽可能使用 default 或其他层回退。

### 6.2 对 Sync / Policy 的约束

* Settings Sync 不得直接写入 default 或 policy 层，只能通过 Core 写 User/Workspace；
* Policy 系统通过专用接口提供 policy model，不得绕过 Core 自己操作用户 settings 文件。

---

## 7. 性能与扩展性

* 对常用 settings 的访问应通过内存缓存（ConfigurationModel）完成，避免频繁 IO；
* 声明子系统应使用高效的数据结构（如 map + 前缀索引）以支撑大量扩展贡献的 settings 查询；
* 合并逻辑避免不必要的深拷贝，使用结构共享。

---

## 8. 演进与兼容性

* 新增 Profile / Remote / Container 等 scope 时，应以新增 Layer / 维度的方式扩展模型，而非改变既有 Layer 语义；
* 扩展 Policy 支持更多设置时，Configuration Core 不需要改变，只需 Policy 系统提供更多映射和策略文件。

---
