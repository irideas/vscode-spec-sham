# VS Code Configuration 访问与变更子系统软件设计说明书 (SDD)

## 1. 文档背景与设计目标

### 1.1 背景与基线

* 基线：`engines.vscode` ≥ 1.80，兼顾 Profile / Remote / Policy 叠加场景。
* 参考：VS Code API (`workspace.getConfiguration`/`WorkspaceConfiguration`/`ConfigurationTarget`/`onDidChangeConfiguration`)、Settings UI/Sync/Policy 文档；站内 /configuration-system/configuration-core-srs、/configuration-system/configuration-access-update-srs、/configuration-system/configuration-storage-layering-srs、/configuration-system/configuration-declaration-srs。

### 1.2 设计目标

* 为扩展与 VS Code 核心提供统一、稳定的配置访问门面；
* 把“多层合并 + 语言覆盖 + Profile/Remote/Policy”封装在内部 ConfigurationService 中；
* 将读取路径极度轻量化（基于已合并模型），将写入路径标准化（统一通过 update 管道 + 事件）；
* 保证行为与现有 VS Code API 兼容，为未来扩展（新层、新 scope）预留空间。

### 1.3 约束条件

* 必须符合 VS Code 现有 API 的签名与语义：

  * `workspace.getConfiguration`；
  * `WorkspaceConfiguration` 视图；
  * `ConfigurationTarget` 的枚举与布尔简写；
  * `ConfigurationChangeEvent.affectsConfiguration` 的行为。

* 必须依赖存储与分层子系统提供的 ConfigurationModel 实现层级合并；

* 必须依赖声明子系统提供的 schema 与元数据进行写入校验。

---

## 2. 组件设计

### 2.1 ConfigurationAccessFacade

* 对应 `vscode.workspace` 命名空间中的配置相关成员；
* 职责：

  * 提供 `getConfiguration` 与 `onDidChangeConfiguration` 等对外入口；
  * 将外部 API 调用转换为内部 `ConfigurationQuery`；
  * 将内部事件流包装为对外 `ConfigurationChangeEvent`。

### 2.2 WorkspaceConfigurationImpl

* 实现 `vscode.WorkspaceConfiguration` 接口；

* 内部持有：

  * `sectionRoot`：调用 `getConfiguration(section)` 时传入的 section；
  * `scope`：调用时推导出的 ConfigurationScope；
  * `ConfigurationService` 引用。

* 对外实现：

  * `get/has/inspect/update` 等方法；
  * 可选的 `toJSON()` 等辅助方法（具体可与 VS Code 行为保持一致）。

### 2.3 ScopeResolver

* 负责将 API 调用方提供的 scope 参数转换为内部 `ConfigurationScope`：

  * 支持 `Uri`、`WorkspaceFolder`、`TextDocument` 以及 `{ uri?: Uri, languageId: string }` 等形式；
  * 合并当前环境信息（如 active editor、当前 workspaceFolders）；
  * 生成 `workspaceId`、`folderId`、`resourceUri`、`languageId`、`profileId` 等字段。

* 还负责为 `ConfigurationChangeEvent` 提供 scopeKey 的计算逻辑。

### 2.4 ConfigurationService

* 访问与变更子系统内部核心服务；
* 持有对存储与分层子系统提供的 ConfigurationModel 的引用；
* 提供内部方法：

  * `getValue(key, scope)`：按 SRS 定义的层次和 scope 返回有效值；
  * `inspect(key, scope)`：返回各层详细值；
  * `updateValue(key, value, target, scope)`：封装写入逻辑；
  * 订阅模型变更事件，并驱动 ConfigurationEventRouter。

### 2.5 ConfigurationEditingService / ConfigurationUpdateOrchestrator

* 封装写入路径上的细节：

  * 根据 target 与 scope 定位目标 settings 文件；
  * 基于当前文件内容合并/删除指定 key；
  * 调用存储与分层子系统的写入接口；
  * 确保写入原子性与错误处理；

* 与 ConfigurationService 配合：

  * ConfigurationService 完成 schema/Policy 校验及目标层决策；
  * EditingService 完成具体 I/O 与更新。

### 2.6 ConfigurationEventRouter

* 订阅存储与分层子系统的“模型变更事件”；
* 将底层变更聚合为对外暴露的一次 `ConfigurationChangeEvent`；
* 内部维护 `ConfigurationChangeIndex` 以实现 `affectsConfiguration` 的高效查询；
* 将事件源通过 `ConfigurationAccessFacade` 暴露为 `workspace.onDidChangeConfiguration`。

### 2.7 对 Policy / Sync 的适配

* PolicyAdapter：

  * 提供简单接口查询某 setting 在目标层是否被锁定；
  * 供 ConfigurationService 在 update 前调用。

* Sync 集成：

  * 不特殊化处理，仅通过变更事件和通用 API 为 Sync 提供能力；
  * 可通过内部标记避免 Sync 自己触发的变更再次被其响应。

---

## 3. 数据结构设计

### 3.1 ConfigurationScope 与 ConfigurationQuery

```ts
interface ConfigurationScope {
  resourceUri?: URI;
  languageId?: string;
  workspaceId?: string;
  folderId?: string;
  profileId?: string;
  remoteKind?: string;
}

interface ConfigurationQuery {
  sectionRoot?: string;  // 例如 "myExtension"，空表示整棵树
  profileId?: string;
  workspaceId?: string;
  folderId?: string;
  resourceUri?: URI;
  languageId?: string;
}
```

* `ConfigurationScope` 由 ScopeResolver 解析得到；
* `ConfigurationQuery` 是 WorkspaceConfigurationImpl 与 ConfigurationService 之间使用的内部查询上下文。

### 3.2 ConfigurationChangeIndex

```ts
interface ConfigurationChangeIndex {
  // 本次变更涉及到的扁平 section 前缀集合，如 "editor"、"editor.fontSize"
  changedSections: Set<string>;

  // 按 scopeKey 划分的变更索引，scopeKey 可由 workspaceId/folderId/languageId 等组成
  byScope?: Map<string /* scopeKey */, Set<string /* section */>>;
}
```

* `ConfigurationChangeEventImpl` 的 `affectsConfiguration` 基于该索引进行判断；
* scopeKey 的生成规则由 ScopeResolver 定义，例如 `"folderId|languageId"`。

### 3.3 inspect 返回结构

```ts
interface ConfigurationInspection<T> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  defaultLanguageValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;
  languageIds?: string[];
}
```

* 对应 SRS 中对 `inspect` 的多层暴露要求；
* 实际实现可根据 VS Code 现有结构精简或扩展字段。

---

## 4. 核心流程设计

### 4.1 `workspace.getConfiguration` 调用链

伪流程：

```ts
function getConfiguration(section?: string, scopeArg?: ConfigurationScopeLike): WorkspaceConfiguration {
  const scope = ScopeResolver.resolve(scopeArg);

  const query: ConfigurationQuery = {
    sectionRoot: section ?? '',
    profileId: scope.profileId,
    workspaceId: scope.workspaceId,
    folderId: scope.folderId,
    resourceUri: scope.resourceUri,
    languageId: scope.languageId,
  };

  return new WorkspaceConfigurationImpl(query, configurationService);
}
```

* 不进行任何 I/O，只构造带上下文的 WorkspaceConfigurationImpl；
* 后续的 `get/has/inspect/update` 都基于同一 ConfigurationService 与 Query 完成。

### 4.2 `WorkspaceConfiguration.get/has/inspect` 行为

伪代码：

```ts
class WorkspaceConfigurationImpl implements vscode.WorkspaceConfiguration {
  constructor(
    private readonly query: ConfigurationQuery,
    private readonly configService: ConfigurationService,
  ) {}

  private composeSettingId(section: string): string {
    return this.query.sectionRoot
      ? `${this.query.sectionRoot}.${section}`
      : section;
  }

  get<T>(section: string, defaultValue?: T): T | undefined {
    const settingId = this.composeSettingId(section);
    const value = this.configService.getValue<T>(settingId, {
      workspaceId: this.query.workspaceId,
      folderId: this.query.folderId,
      resourceUri: this.query.resourceUri,
      languageId: this.query.languageId,
      profileId: this.query.profileId,
    });
    if (value === undefined && defaultValue !== undefined) {
      return defaultValue;
    }
    return value;
  }

  has(section: string): boolean {
    const settingId = this.composeSettingId(section);
    const inspection = this.configService.inspect<any>(settingId, {
      workspaceId: this.query.workspaceId,
      folderId: this.query.folderId,
      resourceUri: this.query.resourceUri,
      languageId: this.query.languageId,
      profileId: this.query.profileId,
    });
    return inspection !== undefined;
  }

  inspect<T>(section: string): ConfigurationInspection<T> | undefined {
    const settingId = this.composeSettingId(section);
    return this.configService.inspect<T>(settingId, {
      workspaceId: this.query.workspaceId,
      folderId: this.query.folderId,
      resourceUri: this.query.resourceUri,
      languageId: this.query.languageId,
      profileId: this.query.profileId,
    });
  }

  // update 见下节
}
```

### 4.3 `WorkspaceConfiguration.update` 行为

伪代码（简化）：

```ts
async update(
  section: string,
  value: any,
  configurationTarget?: vscode.ConfigurationTarget | boolean | null,
  overrideInLanguage?: boolean
): Promise<void> {
  const settingId = this.composeSettingId(section);

  // 1. 决定写入目标层
  const target = this.configService.resolveTarget(
    settingId,
    configurationTarget,
    this.query
  );

  // 2. 决定语言特定写入
  const languageId = this.configService.resolveLanguage(
    settingId,
    overrideInLanguage,
    this.query
  );

  // 3. 进行 schema 校验
  this.configService.validateBeforeUpdate(settingId, value, target, languageId);

  // 4. Policy 检查
  this.configService.checkPolicy(settingId, target, languageId);

  // 5. 执行写入
  await this.configService.updateValueInternal({
    settingId,
    value,
    target,
    profileId: this.query.profileId,
    workspaceId: this.query.workspaceId,
    folderId: this.query.folderId,
    resourceUri: this.query.resourceUri,
    languageId,
  });

  // 存储与分层子系统写入成功后会触发模型刷新，
  // ConfigurationEventRouter 再触发 onDidChangeConfiguration 事件
}
```

* `resolveTarget` 包含：

  * 布尔简写与默认推导规则；
  * 校验当前环境是否有 workspace / workspaceFolder。

* `resolveLanguage` 包含：

  * `overrideInLanguage` 的显式行为；
  * schema 上“支持语言覆盖”标记的隐式行为。

### 4.4 模型变更与事件路由

1. 存储与分层子系统在任意层模型更新后，发出内部“模型变更事件”，携带受影响的 settingId 集合与 scope 信息；

2. ConfigurationService 监听该事件，构造 `ConfigurationChangeIndex`：

   * 填充 `changedSections`；
   * 按 scopeKey 划分变更范围。

3. ConfigurationEventRouter 使用该索引创建 `ConfigurationChangeEventImpl` 实例，并通过 `workspace.onDidChangeConfiguration` 对外触发一次事件；

4. `ConfigurationChangeEventImpl.affectsConfiguration` 实现：

   * 将 section 归一化为若干可能前缀；
   * 若无 scope，则在 `changedSections` 中查找；
   * 若有 scope，则根据 ScopeResolver 生成 scopeKey，在 `byScope` 中索引；
   * 返回是否匹配。

---

## 5. 错误处理策略

### 5.1 更新错误

* 未打开 workspace 却尝试写入 Workspace / WorkspaceFolder：

  * `resolveTarget` 阶段即抛出错误或返回 rejected Promise；
  * 错误信息应指明缺少 workspace 上下文。

* 目标层不存在（如请求 WorkspaceFolder 但未找到对应 folderId）：

  * 拒绝写入，并指出具体原因。

* setting 未注册或类型不匹配：

  * `validateBeforeUpdate` 阶段抛错；
  * 不对底层文件做任何写入尝试。

* Policy 拒绝：

  * `checkPolicy` 阶段抛错，并指出被策略锁定。

* 任何写入失败都不得触发 `onDidChangeConfiguration` 事件。

### 5.2 事件一致性

* 仅在存储与分层子系统确认写入成功、模型刷新完成后，才触发 `onDidChangeConfiguration`；
* 在 update Promise reject 的情况下，不触发事件，避免调用方误判。

---

## 6. 性能与缓存设计

### 6.1 读取缓存

* ConfigurationService 可对高频 scope 维持只读缓存：

  * 如当前 active editor 对应的 scope；
  * 将部分配置树缓存为仅读快照。

* 在模型变更事件中：

  * 仅对受影响 scope 的缓存进行失效处理；
  * 不需要全局清空。

### 6.2 事件合并

* ConfigurationEventRouter 可以在短时间窗口内合并多次底层变更为一次 `ConfigurationChangeEvent`：

  * 合并 `changedSections` 与 `byScope`；
  * 降低事件数量，避免事件风暴。

---

## 7. 可观测性与调试支持

* 在开发者模式下，可通过命令或调试工具输出：

  * 最近一次 configuration 变更的 `changedSections` 与 scope 列表；
  * 某扩展关心 section 的 `inspect` 结果快照。

* 在日志中记录：

  * update 调用的 key、target、scope 概要信息；
  * 失败原因（schema、Policy、环境），便于问题排查。

---

## 8. 扩展性与演进（含测试建议）

### 8.1 新增 scope 类型

* 若未来 ConfigurationScope 中新增新的维度（如显式 Remote scope、tenant scope 等）：

  * 通过扩展 ScopeResolver 与 ConfigurationScope 结构即可；
  * ConfigurationModel 与存储与分层子系统可增加新的层；
  * ConfigurationService 和 ConfigurationEventRouter 仅需在 scopeKey 的生成与解析处做增量修改。

### 8.2 更丰富的变更事件

* 可在不破坏现有接口的前提下，为内部或诊断模式增加：

  * 具体受影响的 setting 列表；
  * 旧值/新值对比信息。

当前设计保持 `ConfigurationChangeIndex` 抽象，便于未来在内部扩展，而对外 API 保持稳定。

### 8.3 测试建议

* 单元：`resolveTarget`/`resolveLanguage` 逻辑、scope 解析、`affectsConfiguration` 判断、事件合并。
* 集成：`getConfiguration`/`update`/`inspect` 在 Profile/Remote/WorkspaceFolder/Policy 场景的行为；Settings UI/JSON 双栖路径的一致性；写入失败不触发事件。
* 性能：高频 `getConfiguration`/`inspect` 延迟、事件风暴场景下的合并效果。

---
