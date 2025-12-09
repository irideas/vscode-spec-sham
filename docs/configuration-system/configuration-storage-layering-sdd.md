# VS Code Configuration 存储与分层子系统软件设计说明书 (SDD)

## 1. 文档背景与设计目标

### 1.1 背景与基线

* 基线：`engines.vscode` ≥ 1.80，支持 Profile / Remote / Policy 叠加场景。
* 参考：VS Code 配置文档与源码（ConfigurationService/ConfigurationRegistry）、Settings Sync 与 Policy 文档；站内 /configuration-system/configuration-core-srs、/configuration-system/configuration-storage-layering-srs。

### 1.2 设计目标

* 提供统一的 **ConfigurationModel**，在任意 Context 中快速计算某 setting 的有效值及来源层；
* 将所有 settings 文件的路径定位、读写、解析、合并封装在本子系统内部，对上游暴露统一抽象，对下游屏蔽平台与 Remote 差异；
* 支持本地 / Remote / Profile / Policy 等多种组合场景，并保证行为可预测、可调试。

### 1.3 使用者关注点（占位）

* 平台/核心工程：关注层叠合并正确性、事件与访问层一致性、Remote/Policy 挂接。
* 扩展作者/集成：关注 API 读取结果一致、写入路径与 scope 匹配。
* QA/运维：关注损坏恢复、Remote/Policy/多根场景的可靠性与可观测性。

### 1.4 约束与原则

* 必须符合 VS Code 官方语义：User / Remote / Workspace / Folder / Language-specific 的优先级与行为；
* 必须与 Configuration 声明子系统约定的数据结构兼容（如默认值、Schema 信息）；
* 必须向 Configuration 访问与变更子系统提供稳定的内部接口，避免因内部实现调整影响对外 API；
* 对 Remote provider 的历史实现差异，应在“默认合并规则 + 特例 hook”的模式下兼容，不改变规范层优先级约束。

---

## 2. 架构概览

### 2.1 核心组件

1. **SettingsFileLocator**

   * 负责计算各类配置文件路径与资源位置：

     * Default settings 资源；
     * 本地 User settings 文件；
     * Profile 目录下 User settings 文件；
     * Workspace / Folder settings 文件；
     * Remote user/workspace settings 访问入口（URI 或远程通道标识）。

2. **ConfigurationFileService**

   * 封装底层文件 I/O 与 Remote 通道访问：

     * 读写本地/远程 settings 文件；
     * 监听文件系统变更；
     * 提供统一的异步接口；
   * 对 Settings Sync 系统等外部系统也作为写入通道（通过内部接口）。

3. **SettingsParser**

   * 负责 JSON/JSONC 内容解析，支持：

     * 注释与尾逗号；
     * `"[languageId]"` block 分离；
     * 记录错误位置信息；
   * 解析失败返回错误结构而非抛出异常。

4. **ConfigurationLayerModel**

   * 表示某一层（例如单个 settings 文件或策略快照）的抽象模型：

     * 普通键值树；
     * languageId → 覆盖模型映射；
     * 源文件路径与范围信息。

5. **ConfigurationMerger**

   * 将多层 `ConfigurationLayerModel` 按 SRS 的优先级进行合并；
   * 支持对象深度合并 / 数组替换等策略；
   * 支持按 Context（workspaceId/folderId/languageId/profileId/remoteKind/policyDomain）选择参与合并的层集合；
   * 为特定 setting 提供可选的自定义合并策略扩展点。

6. **ConfigurationModel**

   * 聚合所有层集合（Default, User, RemoteUser, Workspace, RemoteWorkspace, Folder, Policy）；
   * 提供：

     * `getEffectiveValue(settingId, context)`；
     * `inspect(settingId, context)` 等查询方法；
   * 内部可维护缓存以提升查询性能。

7. **ConfigurationChangeDetector**

   * 负责监听文件变更与 Remote/Policy 变更事件；
   * 调用 SettingsParser 重新解析；
   * 触发模型更新；
   * 生成变更 diff 信息并通知上游。

8. **PolicyOverlayAdapter**

   * 从 Enterprise Policy 系统获取策略配置；
   * 转换为 `ConfigurationLayerModel` 注入 Policy 层；
   * 支持按 policyDomain 切分多个策略空间。

9. **ProfileAdapter**

   * 接收 Profile 系统的 Profile 切换事件；
   * 基于 SettingsFileLocator 重新定位 Profile User settings 路径；
   * 触发 User 层重建。

10. **RemoteConfigurationAdapter**

    * 抽象 Remote 环境配置访问；
    * 屏蔽具体远程协议（SSH / 容器 / WSL 等），向 ConfigurationModel 提供 Remote User / Remote Workspace 层模型。

11. **Diagnostics & Telemetry 组件**

    * 接收解析错误、不可达文件、策略覆盖信息；
    * 向日志与遥测系统输出结构化事件。

### 2.2 组件关系

* SettingsFileLocator / ConfigurationFileService：负责“知道文件在哪、如何读取/写入”；
* SettingsParser：负责“把文本变成层模型”；
* ConfigurationLayerModel / ConfigurationMerger / ConfigurationModel：负责“在给定上下文下提供正确的配置视图”；
* ConfigurationChangeDetector / ProfileAdapter / RemoteConfigurationAdapter / PolicyOverlayAdapter：负责“感知变更并更新模型”；
* Diagnostics & Telemetry：负责“可观测性”。

---

## 3. 数据结构设计

### 3.1 单层模型与配置节点

```ts
interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface SourceInfo {
  filePath: string;
  range?: SourceRange;
  profileId?: string;
  endpointId?: string;     // 远程端点标识
  policyDomain?: string;
}

interface ConfigNode {
  value?: any;                         // 标量或数组
  children?: Map<string, ConfigNode>;  // 对象子节点
  source?: SourceInfo;
}

interface ConfigurationLayerModel {
  root: ConfigNode;                    // 非 language-specific 配置树
  languageOverrides: Map<string, ConfigNode>; // languageId -> ConfigNode 树
}
```

### 3.2 LayerSet 与 ConfigurationModel

```ts
interface LayerSet {
  defaultLayer: ConfigurationLayerModel;
  userLayer?: ConfigurationLayerModel;
  remoteUserLayer?: ConfigurationLayerModel;
  workspaceLayer?: ConfigurationLayerModel;
  remoteWorkspaceLayer?: ConfigurationLayerModel;
  folderLayers: Map<string, ConfigurationLayerModel>; // folderId -> layer
  policyLayer?: ConfigurationLayerModel;
}

interface ConfigurationContext {
  workspaceId?: string;
  folderId?: string;
  resourceUri?: string;
  languageId?: string;
  profileId?: string;
  remoteKind?: 'none' | 'ssh' | 'wsl' | 'container' | string;
  policyDomain?: string;
}

interface InspectResult {
  defaultValue?: any;
  userValue?: any;
  remoteUserValue?: any;
  workspaceValue?: any;
  remoteWorkspaceValue?: any;
  folderValue?: any;
  languageDefaultValue?: any;
  languageUserValue?: any;
  languageRemoteUserValue?: any;
  languageWorkspaceValue?: any;
  languageFolderValue?: any;
  policyValue?: any;
}

interface ConfigurationModel {
  layers: LayerSet;

  getEffectiveValue(settingId: string, context: ConfigurationContext): any;

  inspect(settingId: string, context?: ConfigurationContext): InspectResult;
}
```

### 3.3 变更描述结构

```ts
interface ConfigurationChange {
  affectedKeys: string[];  // 受影响的 settingId 列表
  affectedLayers: Array<
    'default' | 'user' | 'remoteUser' |
    'workspace' | 'remoteWorkspace' |
    'folder' | 'policy'
  >;
  workspaceId?: string;
  folderId?: string;
  profileId?: string;
  remoteKind?: string;
  policyDomain?: string;
}
```

---

## 4. 核心流程设计

### 4.1 启动时构建配置模型

1. **路径定位**

   * SettingsFileLocator 计算：

     * default settings 资源位置；
     * 本地 User settings 路径；
     * 当前 Profile 的 User settings 路径（如有）；
     * 当前 Workspace 的 `.vscode/settings.json` 或 `.code-workspace`；
     * multi-root 各 folder 的 `.vscode/settings.json`；
     * 若 Remote 已连接，远程 user/workspace settings 访问入口。

2. **解析各层**

   * ConfigurationFileService 读取每个文件内容；
   * SettingsParser 解析为 `ConfigurationLayerModel`：

     * 若解析成功，缓存结果；
     * 若解析失败，记录错误并尝试使用上一次有效模型。

3. **构建 LayerSet**

   * 将解析结果装配为 LayerSet：

     * defaultLayer 必须存在；
     * userLayer、workspaceLayer、folderLayers、remoteUserLayer、remoteWorkspaceLayer、policyLayer 根据实际情况可选存在。

4. **构造 ConfigurationModel**

   * 使用 LayerSet 创建 ConfigurationModel 实例；
   * 将该模型注册到 Configuration 访问与变更子系统，以便其实现对外 API。

### 4.2 有效值计算 `getEffectiveValue`

```ts
function getEffectiveValue(settingId: string, context: ConfigurationContext): any {
  const { layers } = this;
  const langId = context.languageId;

  // 1. 非 language-specific 值（按优先级顺序）
  const defaultVal = readFromNode(layers.defaultLayer.root, settingId);
  const userVal = layers.userLayer && readFromNode(layers.userLayer.root, settingId);
  const remoteUserVal = layers.remoteUserLayer && readFromNode(layers.remoteUserLayer.root, settingId);
  const workspaceVal = layers.workspaceLayer && readFromNode(layers.workspaceLayer.root, settingId);
  const remoteWorkspaceVal = layers.remoteWorkspaceLayer && readFromNode(layers.remoteWorkspaceLayer.root, settingId);

  const folderLayer = context.folderId && layers.folderLayers.get(context.folderId);
  const folderVal = folderLayer && readFromNode(folderLayer.root, settingId);

  // 2. language-specific
  const langDefaultVal = langId && readFromLang(layers.defaultLayer, langId, settingId);
  const langUserVal = langId && layers.userLayer && readFromLang(layers.userLayer, langId, settingId);
  const langRemoteUserVal = langId && layers.remoteUserLayer && readFromLang(layers.remoteUserLayer, langId, settingId);
  const langWorkspaceVal = langId && layers.workspaceLayer && readFromLang(layers.workspaceLayer, langId, settingId);
  const langRemoteWorkspaceVal = langId && layers.remoteWorkspaceLayer && readFromLang(layers.remoteWorkspaceLayer, langId, settingId);
  const langFolderVal = langId && folderLayer && readFromLang(folderLayer, langId, settingId);

  // 3. 按优先级合并
  let result = defaultVal;
  result = merge(result, userVal);
  result = merge(result, remoteUserVal);
  result = merge(result, workspaceVal);
  result = merge(result, remoteWorkspaceVal);
  result = merge(result, folderVal);

  result = merge(result, langDefaultVal);
  result = merge(result, langUserVal);
  result = merge(result, langRemoteUserVal);
  result = merge(result, langWorkspaceVal);
  result = merge(result, langRemoteWorkspaceVal);
  result = merge(result, langFolderVal);

  // 4. Policy 覆盖
  const policyVal = layers.policyLayer && readFromNode(layers.policyLayer.root, settingId);
  result = merge(result, policyVal);

  return result;
}
```

* `merge(a, b)`：

  * b 为 `undefined` 时返回 a；
  * 否则根据“标量覆盖 / 对象深合并 / 数组替换”的策略进行合并；
  * 对特殊 setting，可根据 Schema 中的自定义 merge 策略执行特例。

### 4.3 `inspect` 实现

`inspect(settingId, context)` 在内部复用 `getEffectiveValue` 的读取逻辑，但不进行最终合并，而是将各层读到的值填入 `InspectResult` 对应字段，并附加源信息（如文件路径、Profile/Remote 标识）。

该接口为 Settings UI 与诊断工具提供数据。

### 4.4 文件变更处理流程

以 User settings 文件变更为例：

1. ConfigurationFileService 接收到文件变更通知（文件系统 watcher 或 Remote 通道事件）；
2. 调用 SettingsParser 重新解析文件内容：

   * 成功：得到新的 `ConfigurationLayerModel`；
   * 失败：保留旧模型，记录错误。
3. 更新 LayerSet 中的 `userLayer`；
4. 使用 ConfigurationMerger 对受影响的 setting 进行增量合并，或重建全局模型；
5. 生成 `ConfigurationChange` 对象并通知上游；
6. 访问与变更子系统据此触发对外事件。

Workspace / Folder / Remote settings 文件变更流程类似，只是更新的层不同。

### 4.5 Profile 切换流程

1. ProfileAdapter 接收到当前 ProfileId 变化事件；
2. SettingsFileLocator 基于新的 ProfileId 定位 Profile User settings 路径；
3. ConfigurationFileService 读取并通过 SettingsParser 解析为新的 `userLayer`；
4. 更新 LayerSet.userLayer；
5. 重建或增量更新 ConfigurationModel；
6. 通过 ConfigurationChangeDetector 触发“全局配置变更”事件。

### 4.6 Remote 连接 / 断开流程

**连接建立：**

1. RemoteConfigurationAdapter 通知远程环境可用；
2. 通过远程通道读取 remote user/workspace settings，并解析为对应 layer；
3. 填充 LayerSet.remoteUserLayer / remoteWorkspaceLayer；
4. 重建模型，生成包含 Remote 层加入的 `ConfigurationChange` 并通知上游。

**连接断开：**

1. RemoteConfigurationAdapter 标记远程配置不可用；
2. 从 LayerSet 中移除 remote 相关层；
3. 重建模型（仅本地层有效）；
4. 通知上游 Remote 层失效的配置变更。

### 4.7 Policy 更新流程

1. PolicyOverlayAdapter 接收到新策略配置；
2. 将策略配置转换为 `ConfigurationLayerModel`；
3. 替换 LayerSet.policyLayer；
4. 重建或增量更新 ConfigurationModel；
5. 生成仅包含 Policy 层变更的 `ConfigurationChange`，交由上游处理。

---

## 5. 对其他子系统 / 系统的接口

### 5.1 对 Configuration 访问与变更子系统

内部接口示意：

```ts
interface IConfigurationStorageService {
  getValue<T>(key: string, context: ConfigurationContext): T | undefined;
  inspect(key: string, context: ConfigurationContext): InspectResult;

  updateValue(
    key: string,
    value: any,
    target: 'user' | 'workspace' | 'folder' | 'remoteUser' | 'remoteWorkspace',
    context: ConfigurationContext
  ): Promise<void>;

  onDidChangeConfiguration(listener: (e: ConfigurationChange) => void): Disposable;
}
```

* `updateValue`：

  * 调用 ConfigurationFileService 对对应 settings 文件执行写入；
  * 写入成功后通过文件变更流程触发解析与模型更新；
  * Settings Sync 系统一样应通过该接口或等价层进行写入。

### 5.2 对 Settings UI 子系统

* 提供用于 UI 的附加信息接口，例如：

  * 当前 Workspace 中各层文件存在情况；
  * 某配置项在各层的值与来源文件路径；
  * `@modified` 所需的“是否与 Default 相同”“是否被 Policy 覆盖”等标记。

### 5.3 对 Settings Sync 系统

* 提供文件访问或逻辑访问接口，用于读取/写入 User settings 文件，例如：

```ts
interface ISyncAwareStorage {
  readUserSettings(profileId?: string): Promise<string>;     // 返回 raw JSON 文本
  writeUserSettings(rawJson: string, profileId?: string): Promise<void>;
}
```

* Settings Sync 系统不直接操作文件系统，而是通过 ConfigurationFileService 或 IConfigurationStorageService 与本子系统交互，避免模型与文件状态不一致。

### 5.4 对 Enterprise Policy 系统

* 提供 Policy 覆盖注入接口，例如：

```ts
interface IPolicyConfigurationSink {
  setPolicyConfiguration(policyDomain: string, config: Record<string, any>): void;
}
```

* Policy 系统将策略配置按域推送到本接口；
* 本子系统负责将其映射为 Policy 层模型并参与合并。

---

## 6. 错误处理与容错策略

### 6.1 JSON 解析容错

* SettingsParser 在解析失败时：

  * 不抛出未捕获异常；
  * 返回包含错误列表的结果供日志与诊断使用；
  * 调用方根据情况保留旧模型或清空该层。

### 6.2 写入失败处理

* ConfigurationFileService 在写入失败（权限问题、磁盘故障等）时：

  * 不修改内存中的模型（仍保持旧配置）；
  * 返回错误信息给调用者，以便 UI 提示用户；
  * 记录日志，供后续排查。

### 6.3 Policy 与本地值冲突

* 当 Policy 层为某设置提供值，而其他层存在不同值时：

  * 有效值采用 Policy 值；
  * `inspect()` 必须能同时展示 Policy 与各层本地值，便于诊断。

---

## 7. 性能与缓存设计

### 7.1 查询缓存

* 对高频查询（如当前 active editor 的配置）可进行：

  * 上下文级别缓存（Context → 部分配置视图）；
  * 在配置变更时仅失效与变更 keys 相关的缓存。

### 7.2 增量更新策略

* 在文件小范围改动时，可以对 `ConfigurationLayerModel` 做增量更新，而非完全重建：

  * 通过 diff 计算受影响的 key；
  * 仅对相关树节点做替换。

### 7.3 多 workspace / 多 remote 场景优化

* 对未打开的 workspace folder 可惰性启动 watcher；
* Remote 断开时及时释放远程 watcher；
* 在多远程端点场景中，可按 endpointId 分片缓存 Remote 层模型。

---

## 8. 扩展性与演进（含观测与测试建议）

### 8.1 新层类型扩展

* 若未来引入新的配置层（如“租户层”“环境层”等），可通过：

  * 在 LayerSet 中增加对应字段；
  * 在 ConfigurationMerger 中增加合并位置；
  * 在 SRS 中补充优先级规则；
  * 不破坏现有对外接口。

### 8.2 多租户 / 多环境场景

* 在多租户平台中，可在 ConfigurationContext 中增加 tenantId、environmentId，并在 ConfigurationModel 中按 tenant/environment 分片管理 LayerSet；
* 现有设计通过 Context 已支持增加更多维度，不需要更改接口形态。

### 8.3 可观测性

* 提供调试/诊断命令导出当前 LayerSet 概览（层是否可用、文件路径、最后更新时间、Policy 域）。
* `getEffectiveValue/inspect` 可在调试模式下输出命中层与源文件路径。
* 日志记录：解析错误、写入失败、Remote 通道异常、Policy 覆盖事件、合并耗时。

### 8.4 测试建议

* 单元：合并规则（标量/对象/数组）、语言覆盖、Policy 覆盖、Remote/Profile 层优先级。
* 集成：文件变更触发模型刷新与 ConfigurationChange；Profile 切换、Remote 连接/断开、Policy 更新；多根 workspace 下的 Folder/Workspace/Remote 层更新。
* 性能基准：大规模设置与多 folder 场景下 `getEffectiveValue`/`inspect` 延迟，增量更新耗时。
