# Tree View 软件设计说明书 (SDD)

## 1. 文档背景
本 SDD 描述 VS Code Tree View 主域的内部架构、设计约束与推荐工程实践，确保 VS Code 官方特性及生态扩展对 Tree View 的实现具有一致性、可维护性与可测试性。除少量事实背景外，本文以设计建议和模式为主，不构成 VS Code 平台的硬性约束。

## 2. 设计目标与原则
- **一致性**：不同扩展的 Tree View 共享统一的注册、刷新和交互约定；
- **可扩展性**：数据层与 UI 层解耦，支持惰性加载、增量刷新、深度链接等高级场景；
- **可观测性**：Provider 需暴露刷新事件、日志与 telemetry hook，便于分析性能瓶颈；
- **安全性**：命令和 URI 交互必须通过 VS Code 安全通道，禁止在 TreeItem 中直接执行危险操作；
- **可测试性**：推荐将业务逻辑封装为可独立 Mock 的服务，并对 TreeDataProvider 进行单元测试。

## 2.5 使用者关注点与典型场景
- **扩展作者**：需要在 Todo/云资源/测试树等不同场景中重复利用 TreeDataProvider、TreeItem 与命令体系；重点流程包括“声明视图 → 注册 Provider → 树节点命令/菜单 → 配置或 URI 触发”，对应示例见 SRS 第 5 章。
- **VS Code 平台/评审团队**：关注 Tree View 与 Workbench 容器、命令系统、URI Handler 的握手，确保 `onView:<id>` 激活和 `TreeView.reveal` 行为符合 UX 指南。
- **QA & 文档**：可基于下文的推荐模式（REST、分页、URI Deep Link）设计端到端案例，重点验证性能（getChildren < 200ms）、错误提示与上下文键同步。

## 3. 架构视图

### 3.1 逻辑分层
1. **数据服务层**：封装对文件系统、REST、GraphQL 或 VS Code 内建 API（如 Testing）的访问；
2. **Provider 层**：实现 `TreeDataProvider<T>`，负责节点建模、缓存、分页与事件；
3. **视图控制层**：`TreeView` 实例、命令、上下文键、URI Handler 等，将用户交互映射到 Provider 与数据服务；
4. **集成层**：与配置、菜单、激活事件、遥测、Notebook/Panel 等其他系统的桥接。

### 3.2 主要数据流
- **初始化流**：扩展激活 → 注册 Provider → Workbench 请求根节点 → Provider 调用数据服务 → 返回 TreeItem → Workbench 渲染；
- **刷新流**：数据变更或命令触发 → Provider 更新缓存 → 触发 `onDidChangeTreeData` → Workbench 请求受影响节点；
- **Reveal/URI 流**：URI Handler/命令提供节点引用 → TreeView.reveal 调用 Provider 的 `getParent`/缓存 → Workbench 展开并聚焦。
- **进程边界**：TreeDataProvider 完全运行在 Extension Host 进程中，UI 渲染在 Workbench 进程；二者通过 RPC 交互，Provider 不可直接操作 DOM 或依赖 UI 状态。

### 3.3 运行时依赖
- **命令/菜单服务**：用于绑定 TreeItem command、右键菜单、标题栏按钮；
- **上下文键服务**：`view == <id>`、`viewItem == <context>`、`resourceUri` 等键影响菜单 when clause；
- **配置服务**：`workspace.getConfiguration` 和 `onDidChangeConfiguration` 影响 Provider 行为；
- **遥测/日志**：用于记录 `getChildren` 耗时、错误与 reveal 成功率。

## 4. 模块详细设计

### 4.1 数据服务层
- 封装对外部资源的访问，提供强类型 API（如 `fetchProjects(): Promise<Project[]>`）；
- 应实现重试、缓存、分页、错误分类，并与 VS Code 代理/身份体系对齐；
- 允许注入 Mock 以便单元测试。

### 4.2 TreeDataProvider 层
- 维护 `Map<string, T>` 缓存，供命令与 `TreeView.reveal` 使用；
- `getChildren` 需根据节点类型路由到对应服务方法，且支持 `CancellationToken`；
- 当 `TreeItem.collapsibleState` 为 None 时 UI 不再调用 `getChildren`，展开箭头完全由 `collapsibleState` 控制；
- `refresh(element?: T)` 包装 `onDidChangeTreeData.fire`，可支持单节点刷新；
- 当节点数据庞大时，使用“加载更多”虚假节点或从 `contextValue` 推导 pagination 命令；
- `resolveTreeItem` 用于在节点展开时填充额外信息（日志、tooltip），避免初次渲染开销。

### 4.3 TreeView 控制器
- 通过 `window.createTreeView` 创建实例，并注册事件：
  - `onDidChangeSelection`：同步 selection 到上下文键或 Telemetry；
  - `onDidChangeVisibility`：视图隐藏时暂停轮询或释放资源；
  - `onDidChangeCheckboxState`：当 manageCheckboxStateManually=false 时自动处理，反之需手动更新；
- 当具备深度链接需求时，暴露 `reveal` 辅助函数，供命令及 URI Handler 调用。

**Checkbox 自动 vs 手动模式示例**：默认由 VS Code 自动维护父子勾选（父选中→已加载子全选，子取消→父取消）；仅当业务规则与父子联动不同步时，将 `manageCheckboxStateManually` 设为 `true` 并在回调里更新状态：
```ts
const treeView = vscode.window.createTreeView(\"auditTree\", { treeDataProvider: provider, manageCheckboxStateManually: true });
treeView.onDidChangeCheckboxState(e => {
  for (const change of e.changes) {
    auditStore.update(change.element.id, change.checked === vscode.TreeItemCheckboxState.Checked);
  }
  provider.refresh();
});
```

### 4.4 命令与菜单桥接
- 使用 `registerCommand` 注册所有 TreeItem 命令与标题栏动作，命令参数保持可序列化；
- 将节点类型映射为 `contextValue`，在 `contributes.menus` 中编写 when clause（如 `viewItem == dep.critical`）；
- 针对批量操作，TreeView 需开启 `canSelectMany`，命令参数应接受 `TreeView.selection` 数组；
- 标题栏按钮应放在 `group: navigation@<order>` 中，以遵守 VS Code UX 排序规则。

### 4.5 配置、上下文与遥测
- 注册 `workspace.onDidChangeConfiguration` 监听相关设置变更，并触发 Provider 刷新；
- 使用 `vscode.commands.executeCommand('setContext', 'ext.nodeFilter', value)` 同步内存状态到 when clause；
- 记录关键事件（加载成功/失败、节点数量、reveal 成功率），输出到 VS Code Telemetry 通道或扩展自定义日志；
- 在空态或错误态时，通过 `TreeView.message`/`description` 提示用户，保持可访问性一致。

### 4.6 URI Handler 与 Deep Link 协议
- 注册 `window.registerUriHandler` 并实现参数校验、防重放，禁止执行任意命令；
- URI 应包含视图 ID、节点 ID、额外过滤参数，示例：`vscode://ext.costInsights/reveal?view=costInsights&nodeId=svc-1`；
- Handler 内部调用 Provider 提供的 `getOrLoadNode(id)` 方法，若节点不存在则触发后台加载，再执行 `treeView.reveal`；
- 提供 `buildNodeUri(node: T)` 辅助函数，并通过命令或上下文菜单复制链接。

## 5. 推荐实现模式示例

### 模式 A：Domain Service + Provider + Commands（REST 数据源）
**特点**：清晰分层，将远端数据访问集中在 Service，Provider 仅负责节点映射，命令统一注册。

```ts
class DependencyService {
  constructor(private readonly client = createApiClient()) {}
  listRoots() { return this.client.get<DepNode[]>("/deps/roots"); }
  listChildren(parentId: string) { return this.client.get<DepNode[]>(`/deps/${parentId}/children`); }
}

class DependencyProvider implements vscode.TreeDataProvider<DepNode> {
  private readonly cache = new Map<string, DepNode>();
  private readonly emitter = new vscode.EventEmitter<DepNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service: DependencyService) {}

  async getChildren(element?: DepNode) {
    const nodes = element ? await this.service.listChildren(element.id) : await this.service.listRoots();
    nodes.forEach(node => this.cache.set(node.id, node));
    return nodes;
  }

  getTreeItem(node: DepNode) {
    const state = node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(node.label, state);
    item.command = { command: "deps.open", title: "查看依赖", arguments: [node] };
    item.contextValue = node.kind === "critical" ? "dep.critical" : "dep.normal";
    return item;
  }

  refresh(node?: DepNode) { this.emitter.fire(node); }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new DependencyProvider(new DependencyService());
  const treeView = vscode.window.createTreeView("dependencyGraph", { treeDataProvider: provider, showCollapseAll: true });

  context.subscriptions.push(treeView);
  context.subscriptions.push(vscode.commands.registerCommand("deps.open", openDependencyDocument));
  context.subscriptions.push(vscode.commands.registerCommand("deps.refresh", (node?: DepNode) => provider.refresh(node)));
}
```

### 模式 B：分页/虚拟化 Provider（大规模结果集）
**特点**：使用哨兵节点 + 命令加载更多，保持 `getChildren` 响应稳定，并在 TreeItem 中展示分页状态。

```ts
type LogNode = { id: string; label: string; kind: "folder" | "entry" | "more"; parent?: LogNode; cursor?: string };

class LogService {
  async listEntries(parentId: string | undefined, cursor?: string) {
    return fetch(`/logs?parent=${parentId ?? "root"}&cursor=${cursor ?? ""}`).then(res => res.json());
  }
}

class LogProvider implements vscode.TreeDataProvider<LogNode> {
  private readonly emitter = new vscode.EventEmitter<LogNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service = new LogService()) {}

  async getChildren(element?: LogNode): Promise<LogNode[]> {
    const response = await this.service.listEntries(element?.id, element?.cursor);
    const nodes: LogNode[] = response.items.map(item => ({ ...item, parent: element }));
    if (response.nextCursor) {
      nodes.push({ id: `${element?.id ?? "root"}-more-${response.nextCursor}`, label: "加载更多…", kind: "more", parent: element, cursor: response.nextCursor });
    }
    return nodes;
  }

  getTreeItem(node: LogNode) {
    if (node.kind === "more") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.command = { command: "logTree.loadMore", title: "加载更多", arguments: [node.parent, node.cursor] };
      item.iconPath = new vscode.ThemeIcon("sync");
      item.contextValue = "log.more";
      return item;
    }
    const collapsible = node.kind === "folder" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(node.label, collapsible);
    item.contextValue = `log.${node.kind}`;
    return item;
  }

  refresh(node?: LogNode) { this.emitter.fire(node); }
}

vscode.commands.registerCommand("logTree.loadMore", async (parent: LogNode | undefined, cursor: string) => {
  parent!.cursor = cursor;
  provider.refresh(parent);
});
```

### 模式 C：URI Handler + TreeView.reveal（深度链接）
**特点**：组合 URI Handler、Provider 缓存与 `TreeView.reveal`，实现外部点击直接定位节点。

```ts
class CostProvider implements vscode.TreeDataProvider<CostNode> {
  // ...常规实现...
  private readonly cache = new Map<string, CostNode>();
  async getChildren(node?: CostNode) { /* 填充 cache */ }
  getCachedNode(id: string) { return this.cache.get(id); }
  async resolveNodeById(id: string) {
    if (this.cache.has(id)) { return this.cache.get(id); }
    const path = await fetchNodePath(id); // e.g. [org, project, service]
    let current: CostNode | undefined;
    for (const segment of path) {
      current = await this.loadChild(current, segment);
    }
    return current;
  }
}

const treeView = vscode.window.createTreeView("costInsights", { treeDataProvider: provider, showCollapseAll: true });

vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/reveal") { return; }
    const params = new URLSearchParams(uri.query);
    const nodeId = params.get("nodeId");
    if (!nodeId) { vscode.window.showErrorMessage("缺少 nodeId" ); return; }
    const node = provider.getCachedNode(nodeId) ?? await provider.resolveNodeById(nodeId);
    if (node) {
      await treeView.reveal(node, { expand: true, focus: true, select: true });
    } else {
      vscode.window.showWarningMessage(`未找到节点 ${nodeId}`);
    }
  }
});

vscode.commands.registerCommand("costInsights.copyLink", (node: CostNode) => {
  const uri = vscode.Uri.parse(`vscode://my-ext/reveal?view=costInsights&nodeId=${node.id}`);
  vscode.env.clipboard.writeText(uri.toString());
});
```

## 6. 运行时与部署考虑
- **懒注册**：仅在相关视图即将可见时才注册 Provider，减小扩展启动时间；
- **资源释放**：视图隐藏或扩展停用时，清理定时器、网络连接与缓存，避免内存泄漏；
- **错误隔离**：在 `getChildren` 中捕获异常并返回空数组，同时通过 `treeView.message` 告知用户；
- **测试策略**：为数据服务编写单元测试，为 Provider 编写集成测试（Mock TreeView），确保 reveal/refresh 流程正确；
- **本地化与可访问性**：TreeItem label/tooltip 需通过 `nls.localize` 实现本地化，Checkbox 需要可读文本。

## 7. 未来演进建议
- 引入官方 `TreeNodeCache` 助手，标准化缓存淘汰策略与 Telemetry；
- 提供 `TreeView.search` 接口或内建过滤器，简化扩展的搜索实现；
- 研究 `TreeView.batchRefresh(ids: T[])` 以降低大批量刷新导致的重绘成本；
- 探索与 Notebook/Panel 的双向桥接，允许 TreeItem 直接驱动富媒体视图。

## 8. 端到端实现流程指南

## 9. 测试与验证建议（占位）
- 针对关键场景（懒加载/分页、URI reveal、配置驱动刷新、checkbox 自动/手动模式）准备最小回归用例；
- 覆盖 A11y 与本地化检查（label/tooltip/aria/localize）；
- 建议在 CI 中运行 `npm run docs:build` 或等效检查，确保文档锚点与链接有效。
1. **Manifest & 激活**：声明视图、命令、配置与激活事件，确保 `onView:<id>` 与 `onCommand` 覆盖核心入口；
2. **数据与 Provider**：按照本 SDD 第 4 章划分 Service/Provider/TreeView，预先决定缓存策略与性能指标；
3. **交互绑定**：利用第 5 章的命令/URI 模式，将 TreeItem contextValue、菜单 when clause、快捷键对齐；
4. **外部触达**：若需深度链接或配置驱动，结合 URI Handler/Settings 模式，在 Tree View 的 `reveal` 与 `refresh` 之间建立桥梁；
5. **可观测性与演进**：记录关键 Telemetry，评估未来演进建议，并与伴侣域 SRS/SDD 交叉验证实现。
