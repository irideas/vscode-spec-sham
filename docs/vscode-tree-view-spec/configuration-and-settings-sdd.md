# Configuration & Settings 软件设计说明书 (SDD)

## 1. 文档目的
阐述 VS Code 配置体系在 Tree View 扩展中的实现策略，包括 schema 定义、运行时读取、设置同步与数据绑定模式。

## 2. 与 Tree View 的关系概述
- Tree View 是否可见、如何过滤、加载哪个数据源常由配置决定；
- 设置变化应触发 TreeDataProvider Refresh 或 Tree View 状态更新；
- 深度链接/命令可读取设置以生成上下文信息。

## 2.5 使用者视角与典型场景
- **FinOps / 成本洞察**：用设置控制视图开关、阈值与分组方式，期望标题栏能提示当前配置。
- **云资源管理者**：在 prod/staging 环境间切换时希望 Tree View 自动刷新并提示认证状态。
- **日志/监控维护者**：调整 `refreshInterval`、`maxEntries` 等性能相关设置，需要查看配置对 Tree View 响应时间的影响。

## 3. 架构概览
### 3.1 Configuration Registry
- 解析 `contributes.configuration`，并在设置编辑器中显示；
- 校验类型、默认值、`enum`、`markdownDescription`；
- 暴露给 Settings Sync 与 Workspace Configuration Service。

### 3.2 Settings Sync
- 同步用户级设置，保持多设备一致；
- Tree View 相关设置可标记 `scope` 以决定是否随工作区同步。

### 3.3 Workspace Configuration Service
- `workspace.getConfiguration(section)` 返回合并视图；
- `onDidChangeConfiguration` 触发时提供 `ConfigurationChangeEvent`。

## 4. 设计细节
### 4.1 Schema 定义与校验
- 所有 Tree View 相关设置建议以扩展标识为前缀（如 `cloudTools.environment`）；
- 使用 `enum` + `enumDescriptions` 保证值合法；
- 对敏感值应利用 SecretStorage，而非 configuration。

### 4.2 配置事件传递
- Provider 在构造函数中注册 `onDidChangeConfiguration`；
- 使用 `e.affectsConfiguration('<section>')` 判断是否 relevant；
- 事件处理需防抖，避免频繁刷新。

### 4.3 Tree View 中的配置绑定
- 在 TreeItem 上显示当前设置摘要（description、tooltip）；
- 标题栏命令可以调用 `workspace.getConfiguration().update` 修改设置；
- 通过 `setContext` 反映配置状态（如 `costInsights.showOpenOnly`）。

## 5. 推荐实现模式

### 5.1 View State Driven by Settings
**目标**：根据设置控制 Tree View 的空态文本与布局。

```ts
class CostInsightsViewModel {
  private cfg = vscode.workspace.getConfiguration("costInsights");

  get showOnlyFlagged() {
    return this.cfg.get("showOnlyFlagged", false);
  }

  async toggleFlagged() {
    const next = !this.showOnlyFlagged;
    await this.cfg.update("showOnlyFlagged", next, vscode.ConfigurationTarget.Workspace);
    vscode.commands.executeCommand("setContext", "costInsights.showOnlyFlagged", next);
  }
}

const model = new CostInsightsViewModel();
const treeView = vscode.window.createTreeView("costInsights", { treeDataProvider: provider });
treeView.message = model.showOnlyFlagged ? "仅显示关注项" : undefined;
```

### 5.2 Settings-backed Data Provider
**目标**：Provider 根据设置选择数据源或过滤逻辑。

```ts
class CloudTreeProvider implements vscode.TreeDataProvider<CloudNode> {
  private environment = vscode.workspace.getConfiguration("cloudTools").get("environment", "prod");
  private readonly emitter = new vscode.EventEmitter<CloudNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("cloudTools.environment")) {
        this.environment = vscode.workspace.getConfiguration("cloudTools").get("environment", "prod");
        this.refresh();
      }
    });
  }

  async getChildren(node?: CloudNode) {
    return queryCloud({ env: this.environment, parentId: node?.id });
  }

  refresh(node?: CloudNode) {
    this.emitter.fire(node);
  }
}
```

### 5.3 Remote Config + Tree Refresh
**目标**：结合远端配置（实验/feature flag）与本地设置控制 Tree View 行为。

```ts
class ExperimentManager {
  private cache: Record<string, boolean> = {};
  async load() {
    this.cache = await fetchFeatureFlags();
  }
  isEnabled(flag: string) {
    return this.cache[flag];
  }
}

const experiments = new ExperimentManager();

async function initialize() {
  await experiments.load();
  const config = vscode.workspace.getConfiguration("logTree");
  const provider = new LogTreeProvider({
    autoRefresh: config.get("autoRefresh", true) && experiments.isEnabled("log-autorefresh"),
    maxEntries: config.get("maxEntries", 2000)
  });
  vscode.window.registerTreeDataProvider("logTree", provider);
}
```

## 6. 运行时考量
- 避免在 `onDidChangeConfiguration` 中执行长耗时操作，可使用任务队列；
- 对频繁更新的设置使用局部刷新而非整树；
- 在设置 UI 中使用 `markdownDescription` 提示 Tree View 需要 reload 的场景。

## 7. 未来演进
- 支持声明式“设置 → TreeView.refresh”绑定，减少样板代码；
- 在 Settings UI 中直接显示 Tree View 预览；
- 提供 Settings Telemetry API 帮助评估配置使用情况。

## 8. 端到端配置检查表
1. **Schema**：确保所有设置带有 `type`、`default`、`markdownDescription`，并按扩展名前缀命名；
2. **初始化**：扩展激活时读取配置并设置上下文/Provider 状态，必要时显示当前配置摘要；
3. **事件监听**：集中处理 `onDidChangeConfiguration`，只在 `affectsConfiguration` 返回 true 时刷新；
4. **写入路径**：标题栏/命令/URI Handler 修改设置时使用 `ConfigurationTarget` 指明作用范围，并提供 undo 提示；
5. **同步策略**：标记需要随 Settings Sync 同步的键，或在文档中说明需手动复制的工作区设置。
