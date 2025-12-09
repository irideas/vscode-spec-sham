# Tree View 需求规格说明书 (SRS)

## 1. 引言

### 1.1 目的
本 SRS 基于 VS Code 当前稳定版本，定义 Tree View 主域（`TreeDataProvider`、`TreeItem`、`TreeView`、相关贡献点与事件）的正式需求，供 VS Code 内部架构师、QA 与生态扩展团队共用。

### 1.2 范围
- 描述自定义 Tree View 的声明、激活、数据刷新、交互行为；
- 界定与视图容器、命令/菜单、激活事件、配置、URI Handler 的接口；
- 给出面向 Tree View 的典型用例与代码示例。

### 1.3 术语与缩写（全册通用术语表）
- **Tree View**：Workbench 中由扩展提供的数据驱动树组件，对应运行时的 `TreeView<T>` 实例。
- **Tree Data Provider / Provider**：实现 `TreeDataProvider<T>` 的扩展侧对象，负责 `getChildren`、`getTreeItem`、`getParent`、`resolveTreeItem` 等。
- **Tree Item / 节点**：`TreeItem` / `TreeItem2` 对象，含 `label`、`collapsibleState`、`iconPath`、`checkboxState`、命令等属性。
- **View ID**：`contributes.views` 中声明的唯一标识。
- **View Container / 视图容器**：Sidebar/Panel/Auxiliary Bar 中托管 Tree View 的容器。
- **Activation Event / 激活事件**：`activationEvents` 中的条目，如 `onView:<id>`、`onCommand:<id>`。
- **Context Key / When Clause**：上下文键与 when 表达式，用于控制菜单/快捷键/显隐。

### 1.4 阅读指引
- 想快速了解 Tree View 生命周期，可先阅读第 3 章，再跳到第 4.1～4.4；
- 若需要设计端到端用例，可结合第 5 章与对应 SDD 中的模式；
- 与伴侣领域的协同要求在 4.5、5.3～5.6 以及“引用”章节列出的官方文档中进一步说明。
- 代码示例约定：默认使用 `activate(context: vscode.ExtensionContext)` 模式，所有 `TreeView`、`Disposable`、`registerCommand` 等应 `context.subscriptions.push(...)` 管理；`TreeDataProvider.getChildren` 返回 `ProviderResult<T[]>`，`getTreeItem` 返回 `TreeItem | Thenable<TreeItem>`，打开文件优先使用内置命令（如 `vscode.open`）。

## 2. 引用
- VS Code 官方文档：《Tree View API》《TreeDataProvider》《TreeItem》《TreeView》参考文档；
- Contribution Points 文档：《contributes.views》《contributes.viewsContainers》《contributes.commands》《contributes.menus》《contributes.configuration》；
- Activation Events 文档（`onView:*`、`onCommand:*`、`*Context` 键）；
- VS Code API 参考：`window.createTreeView`、`window.registerTreeDataProvider`、`TreeItemCheckboxState`、`TreeView.reveal`、`window.registerUriHandler`；
- VS Code 可访问性与 UX 指南。

## 3. 总体描述

### 3.1 角色
- **扩展开发者**：实现 TreeDataProvider，注册命令、菜单与配置，确保数据刷新与错误处理。
- **VS Code Workbench**：托管视图容器、发起数据查询、合并焦点与上下文键，并为 TreeItem 提供主题、布局、可访问性支持。
- **终端用户**：在 Activity Bar / Explorer / 自定义容器中浏览树，展开、过滤、执行命令或触发深度链接。

### 3.2 系统概览
1. 扩展在 `package.json` 的 `contributes.views` 或 `viewsContainers` 声明 View ID、容器、可见性条件；
2. 当触发 `onView:<viewId>` 或 `onCommand:<command>` 激活事件后，扩展通过 `registerTreeDataProvider` 或 `createTreeView` 注册 Provider；
3. Workbench 在视图可见或需要刷新时调用 `getChildren`、`getTreeItem`，并在 `onDidChangeTreeData` 触发时重绘；
4. 用户操作（选择、展开、checkbox、上下文菜单、命令、URI）通过 `TreeView` 事件或命令系统传回扩展。

### 3.3 外部接口
- **Workbench 视图容器**：决定 Tree View 的区域、标题栏、折叠与布局持久化；
- **命令/菜单系统**：TreeItem 的 `command` 与 `contextValue` 由菜单注册决定；
- **激活/上下文系统**：`onView:<id>` 激活扩展，`setContext`、`when` 控制 Tree View UI；
- **配置系统**：`workspace.getConfiguration` 读取设置控制 Tree View 行为；
- **URI Handler**：通过 `TreeView.reveal` 与 TreeDataProvider 缓存联动，支持深度链接。

### 3.4 端到端主要流程
1. **声明与激活**：扩展声明视图/容器与命令 → VS Code 依据 `onView:<id>` 激活扩展；
2. **数据加载**：`registerTreeDataProvider` 建立 Provider → Workbench 请求根节点与子节点；
3. **交互联动**：TreeItem 呈现命令、checkbox、contextValue → 菜单/快捷键通过 when clause 与上下文键控制；
4. **刷新与持久化**：Provider 调用 `onDidChangeTreeData` 增量刷新 → 容器持久化布局与可见性；
5. **外部访问**：配置更改、URI Handler、命令面板等入口可驱动 Tree View，必要时通过 `TreeView.reveal` 或 `TreeView.message` 向用户反馈。

### 3.5 非目标（占位）
- 不覆盖 VS Code 以外 UI 容器的行为；
- 平台级 URI/安全/Remote 协议详见 /external-entry/，本章仅保留 Tree 协作事实。

## 4. 功能性需求

### 4.1 TreeDataProvider 生命周期与调用语义
- Provider 必须在视图激活后注册，保持与 View ID 一一对应；
- `getChildren(element?: T)` 返回 `ProviderResult<T[]>`，可返回数组/Promise/`undefined`/`null`，后三者等价于“无子节点”；
- 当 `TreeItem.collapsibleState` 为 `TreeItemCollapsibleState.None` 时，Workbench 不会再调用 `getChildren`；是否显示展开箭头仅由 `collapsibleState` 控制；
- `getTreeItem(element: T)` 返回的 `TreeItem` 不得被复用为多个节点，需保证每次调用返回新实例以允许 VS Code 设置附加属性；
- Provider 必须实现 `onDidChangeTreeData` 事件，当数据改变时调用 emitter；传入具体节点表示局部刷新，传入 `undefined` 表示整树刷新；VS Code 可能在局部刷新后多次调用 `getChildren`/`getTreeItem`；
- 可选实现 `getParent`（用于 `TreeView.reveal` 自动构造路径）和 `resolveTreeItem`（懒加载额外字段）。

### 4.2 TreeDataProvider 模式要求
- **同步模式**：适合小型静态数据，如本地 TODO 缓存；`getChildren` 可立即返回数组；
- **异步/懒加载模式**：面向远端资源或大数据集，`getChildren` 返回 Promise，配合 `TreeItemCollapsibleState.Collapsed` 只在展开时加载；
- **增量/分页模式**：Provider 需维护节点缓存和分页指针，通过 contextValue 或 TreeItem description 呈现更多/加载中状态；
- Provider 必须处理取消（如果 VS Code 传入 `CancellationToken`），并遵循 Workbench 线程模型，不在 `getChildren` 中进行阻塞操作。

### 4.3 TreeItem 表达能力
- TreeItem 必须至少定义 `label` 与 `collapsibleState`；UI 是否显示展开箭头由 `collapsibleState` 决定。
- 支持 `iconPath`（`ThemeIcon`、本地路径或 URI）、`description`、`tooltip`、`resourceUri`（启用内建图标与 context 复用）、`checkboxState`；
- `command` 属性用于点击节点时触发命令，命令参数通常包含节点实体；
- `contextValue` 用于在菜单/命令 when clause 中区分节点类型，支持多个以 `.` 或 `&&` 组合；
- 复选框：默认（`manageCheckboxStateManually=false`）由 VS Code 自动联动父子节点；仅当业务规则需要完全自定义勾选逻辑时设置 `manageCheckboxStateManually=true`，并在 `onDidChangeCheckboxState` 中自行维护 `checkboxState` 与刷新逻辑。

### 4.4 TreeView 实例行为
- `window.createTreeView` 支持附加选项：`showCollapseAll`、`canSelectMany`、`manageCheckboxStateManually`；
- `TreeView` 暴露事件：`onDidChangeSelection`、`onDidChangeVisibility`、`onDidExpandElement`、`onDidCollapseElement`、`onDidChangeCheckboxState`；
- 扩展可调用 `treeView.reveal(element, { expand, focus, select })` 以在 UI 中定位节点；当 Provider 无法通过 `getParent` 找到路径时 reveal 将失败；
- `message`/`description` 属性可在空状态或运行状态中显示辅助文本；
- TreeView 与 Workbench 共享布局状态（展开、宽度、排序），扩展不需持久化。

### 4.5 系统集成约束
- **视图声明**：`contributes.views` 需提供 `id`、`name`、`contextualTitle`、`when` 等字段，确保与容器（如 `explorer`、`activitybar` 自定义容器）一致；
- **命令/菜单**：必须通过 `contributes.commands` 注册命令，`contributes.menus` 的 `view/title` 与 `view/item/context` 菜单项使用 `when` 绑定到 TreeItem context；
- **激活**：`contributes.commands` 中的命令在被调用时自动触发 `onCommand:<id>` 激活；对于未在 `contributes.commands` 声明的命令或兼容旧引擎场景，可手动声明 `onCommand:<id>`；`onView:<id>` 用于首次展开/可见时延迟激活 Provider；
- **配置**：通过 `contributes.configuration` 声明设置，运行时使用 `workspace.getConfiguration` 读取，并在 `onDidChangeConfiguration` 里刷新 TreeView；
- **URI Handler**：若 Tree View 支持 `vscode://` 深度链接，扩展必须注册 `window.registerUriHandler` 并实现参数验证，再调用 `TreeView.reveal`；
- **可访问性**：TreeItem 的 `label` 或 `ariaLabel` 必须符合无障碍要求，checkbox 需提供明确文案。

### 4.6 错误与可观测性
- Provider 抛出的异常会以 VS Code 通知或空树提示呈现，扩展应捕获错误并通过 `vscode.window.showErrorMessage` 提示；
- 建议在 Provider 内记录遥测数据（如加载耗时、节点数量），以便在大型树场景保持 250ms 以内的 UI 响应；
- 当 REST 请求需要认证或网络访问时，遵循 VS Code 代理/信任设置；必要时提供 `TreeView.message` 告知用户需要登录或信任工作区。

## 5. 典型用例（用例 ID：UC-TREE-0x）

### 5.1 UC-TREE-01 团队 TODO 树 {#uc-tree-01}
**场景**：研发团队希望在 Explorer 中浏览共享 TODO，支持勾选状态同步。

**角色**：开发者、扩展、Workbench。

**流程**：
1. 扩展在 Explorer 容器注册 `teamTodos` 视图；
2. 视图激活时 Provider 拉取 TODO 列表；
3. 用户点击节点触发 `teamTodos.openTodo` 命令，打开文件；
4. 用户在上下文菜单中执行“标记为完成”，Provider 更新状态并发出刷新事件。

**Manifest**：
```json
{
  "contributes": {
    "views": {
      "explorer": [
        { "id": "teamTodos", "name": "Team TODOs", "contextualTitle": "Team TODOs" }
      ]
    },
    "menus": {
      "view/item/context": [
        { "command": "teamTodos.markDone", "when": "view == teamTodos && viewItem == todo.open", "group": "inline" }
      ]
    },
    "commands": [
      { "command": "teamTodos.openTodo", "title": "打开 TODO" },
      { "command": "teamTodos.markDone", "title": "标记为完成" }
    ]
  },
  "activationEvents": ["onView:teamTodos", "onCommand:teamTodos.markDone"]
}
```

**TypeScript**：
```ts
class TeamTodoProvider implements vscode.TreeDataProvider<TodoItem> {
  private readonly emitter = new vscode.EventEmitter<TodoItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  async getChildren(): Promise<TodoItem[]> {
    return fetchTodosFromService();
  }

  getTreeItem(element: TodoItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.command = { command: "teamTodos.openTodo", title: "打开", arguments: [element.uri] };
    item.checkboxState = element.done ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    item.contextValue = element.done ? "todo.done" : "todo.open";
    return item;
  }

  refresh(node?: TodoItem) {
    this.emitter.fire(node);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new TeamTodoProvider();
  const todoView = vscode.window.createTreeView("teamTodos", { treeDataProvider: provider, canSelectMany: true });

  context.subscriptions.push(todoView);
  context.subscriptions.push(vscode.commands.registerCommand("teamTodos.markDone", async (item: TodoItem) => {
    await markTodoDone(item.id);
    provider.refresh(item);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("teamTodos.openTodo", (uri: vscode.Uri) => vscode.commands.executeCommand("vscode.open", uri)));
}
```

### 5.2 UC-TREE-02 云资源浏览树 {#uc-tree-02}
**场景**：云运维希望在 Activity Bar 自定义容器中浏览项目/集群/工作负载，拓展需要依托懒加载。

**流程**：
1. 扩展定义 `cloudTools` 容器和 `cloudAssets` 视图；
2. Provider 根节点加载项目列表，展开时请求 REST API 获取子节点；
3. TreeItem 的 icon 使用 `ThemeIcon` 区分类型，命令 `cloudAssets.openDetail` 打开详情；
4. 当 API 失败时，TreeView message 显示错误。

**Manifest**：
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [ { "id": "cloudTools", "title": "Cloud", "icon": "media/cloud.svg" } ]
    },
    "views": {
      "cloudTools": [ { "id": "cloudAssets", "name": "Cloud Assets", "when": "config.cloudTools.enabled" } ]
    },
    "commands": [ { "command": "cloudAssets.openDetail", "title": "查看详情" } ]
  }
}
```

**TypeScript**：
```ts
class CloudTreeProvider implements vscode.TreeDataProvider<CloudNode> {
  private readonly emitter = new vscode.EventEmitter<CloudNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  async getChildren(node?: CloudNode): Promise<CloudNode[]> {
    if (!node) { return fetchProjects(); }
    if (node.kind === "project") { return fetchClusters(node.id); }
    if (node.kind === "cluster") { return fetchWorkloads(node.id); }
    return [];
  }

  getTreeItem(node: CloudNode): vscode.TreeItem {
    const collapsible = node.kind === "workload" ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;
    const item = new vscode.TreeItem(node.label, collapsible);
    item.command = node.kind === "workload" ? { command: "cloudAssets.openDetail", title: "查看", arguments: [node] } : undefined;
    item.iconPath = new vscode.ThemeIcon(node.kind === "project" ? "root-folder" : node.kind === "cluster" ? "cloud" : "pod" );
    item.contextValue = `cloud.${node.kind}`;
    return item;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new CloudTreeProvider();
  const treeView = vscode.window.createTreeView("cloudAssets", { treeDataProvider: provider, showCollapseAll: true });

  context.subscriptions.push(treeView);
  context.subscriptions.push(vscode.commands.registerCommand("cloudAssets.openDetail", (node: CloudNode) => openDetail(node)));
}
```

**性能与 UX 注意事项**：
- 单次展开的节点量建议控制在可视区内（常见 < 200）并按需分页；`getChildren` 目标耗时 < 200ms。
- 远端失败时使用 `TreeView.message` 反馈，不要在标题栏反复弹通知。

### 5.3 UC-TREE-03 依赖审计树（命令 + 菜单联动） {#uc-tree-03}
**场景**：安全团队需要按照依赖关系查看许可证与漏洞，并在 Tree View 标题栏提供“刷新”“导出”按钮。

**流程**：
1. `dependencyAudit` 视图挂在 Explorer；
2. Provider 支持多选，TreeItem 描述显示版本与风险级别；
3. 标题栏按钮通过 `view/title` 菜单触发 `dependencyAudit.refresh`/`dependencyAudit.export` 命令；
4. 节点右键菜单根据 `contextValue` 分流（高危依赖显示“隔离”）。

**Manifest**：
```json
{
  "contributes": {
    "views": { "explorer": [ { "id": "dependencyAudit", "name": "Dependency Audit" } ] },
    "menus": {
      "view/title": [
        { "command": "dependencyAudit.refresh", "when": "view == dependencyAudit", "group": "navigation@1" },
        { "command": "dependencyAudit.export", "when": "view == dependencyAudit", "group": "navigation@2" }
      ],
      "view/item/context": [
        { "command": "dependencyAudit.isolate", "when": "viewItem == dep.critical", "group": "inline" }
      ]
    },
    "commands": [
      { "command": "dependencyAudit.refresh", "title": "刷新依赖树" },
      { "command": "dependencyAudit.export", "title": "导出报告" },
      { "command": "dependencyAudit.isolate", "title": "隔离组件" }
    ]
  }
}
```

**TypeScript**：
```ts
class DependencyAuditProvider implements vscode.TreeDataProvider<AuditNode> {
  private readonly emitter = new vscode.EventEmitter<AuditNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly client: AuditClient) {}

  async getChildren(node?: AuditNode): Promise<AuditNode[]> {
    return node ? this.client.fetchChildren(node.id) : this.client.fetchRoots();
  }

  getTreeItem(node: AuditNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, node.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.description = `${node.version} · ${node.license}`;
    item.iconPath = new vscode.ThemeIcon(node.risk === "critical" ? "warning" : "library" );
    item.contextValue = node.risk === "critical" ? "dep.critical" : "dep.normal";
    return item;
  }

  refresh(node?: AuditNode) {
    this.emitter.fire(node);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new DependencyAuditProvider(new AuditClient());
  const treeView = vscode.window.createTreeView("dependencyAudit", { treeDataProvider: provider, canSelectMany: true, showCollapseAll: true });

  context.subscriptions.push(treeView);
  context.subscriptions.push(vscode.commands.registerCommand("dependencyAudit.refresh", (node?: AuditNode) => provider.refresh(node)));
  context.subscriptions.push(vscode.commands.registerCommand("dependencyAudit.export", () => exportReport(provider.snapshot())));
  context.subscriptions.push(vscode.commands.registerCommand("dependencyAudit.isolate", async (node: AuditNode) => {
    await isolateDependency(node);
    provider.refresh(node);
  }));
}
```

### 5.4 UC-TREE-04 测试执行树（异步增量加载） {#uc-tree-04}
**场景**：测试扩展需要在 Tree View 中呈现测试套件、用例、实时结果，并支持“重新运行失败”命令。

**流程**：
1. Provider 从 VS Code Testing API 获取实时数据，根节点显示套件；
2. `resolveTreeItem` 在节点被展开时补充日志信息；
3. TreeItem `resourceUri` 绑定到文件路径，启用内建图标；
4. 命令 `tests.reRunFailed` 通过选中节点列表触发；
5. Provider 在收到测试事件后调用 `onDidChangeTreeData` 更新状态。

**Manifest**：
```json
{
  "contributes": {
    "views": { "testing": [ { "id": "suiteTree", "name": "Suites" } ] },
    "commands": [ { "command": "suiteTree.reRunFailed", "title": "重新运行失败" } ],
    "menus": {
      "view/title": [ { "command": "suiteTree.reRunFailed", "when": "view == suiteTree", "group": "navigation@3" } ]
    }
  }
}
```

**TypeScript**：
```ts
class SuiteProvider implements vscode.TreeDataProvider<TestNode> {
  private readonly emitter = new vscode.EventEmitter<TestNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  getTreeItem(node: TestNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, node.kind === "suite" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.resourceUri = node.uri;
    item.iconPath = new vscode.ThemeIcon(node.status === "failed" ? "error" : node.status === "passed" ? "pass" : "question" );
    item.tooltip = node.message;
    item.contextValue = `test.${node.status}`;
    return item;
  }

  async getChildren(node?: TestNode) {
    return node ? node.children : fetchSuites();
  }

  resolveTreeItem(item: vscode.TreeItem, node: TestNode) {
    if (node.status === "failed" && !item.description) {
      item.description = node.duration ? `${node.duration}ms` : undefined;
    }
    return item;
  }
}

vscode.commands.registerCommand("suiteTree.reRunFailed", (nodes?: TestNode[]) => rerun(nodes?.filter(n => n.status === "failed")));
```

**性能与 UX 注意事项**：
- 测试结果树可能高频刷新，建议将 `resolveTreeItem` 用于延迟填充日志描述，并限制单次刷新节点数量；
- 事件监听应节流，避免在测试运行期间触发过多 `onDidChangeTreeData`。

### 5.5 UC-TREE-05 成本分析树（配置驱动） {#uc-tree-05}
**场景**：FinOps 团队通过 Tree View 查看云成本，视图可根据用户设置（组织、月份、阈值）过滤数据，并支持在视图标题上显示当前配置摘要。

**流程**：
1. `costInsights` 视图由 `config.costInsights.enabled` 控制；
2. 扩展通过 `workspace.getConfiguration('costInsights')` 读取分组维度，监听 `onDidChangeConfiguration` 刷新；
3. TreeItem tooltip 显示费用趋势，checkbox 用于标记关注项；
4. 命令 `costInsights.copyLink` 复制节点特定 `vscode://` 链接（下一用例使用）。

**Manifest**：
```json
{
  "contributes": {
    "configuration": {
      "title": "Cost Insights",
      "properties": {
        "costInsights.enabled": { "type": "boolean", "default": true },
        "costInsights.groupBy": { "type": "string", "enum": ["service", "project"], "default": "service" },
        "costInsights.threshold": { "type": "number", "default": 500 }
      }
    },
    "views": { "explorer": [ { "id": "costInsights", "name": "Cost Insights", "when": "config.costInsights.enabled" } ] },
    "commands": [ { "command": "costInsights.copyLink", "title": "复制节点链接" } ]
  }
}
```

**TypeScript**：
```ts
class CostInsightsProvider implements vscode.TreeDataProvider<CostNode> {
  private readonly emitter = new vscode.EventEmitter<CostNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private settings = vscode.workspace.getConfiguration("costInsights");

  constructor() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("costInsights")) {
        this.settings = vscode.workspace.getConfiguration("costInsights");
        this.emitter.fire(undefined);
      }
    });
  }

  async getChildren(node?: CostNode) {
    return queryCosts({ parent: node, groupBy: this.settings.get("groupBy"), threshold: this.settings.get("threshold") });
  }

  getTreeItem(node: CostNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, node.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.description = `$${node.amount.toFixed(2)}`;
    item.tooltip = `${node.label} · ${node.trend}`;
    item.checkboxState = node.watch ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    item.contextValue = node.watch ? "cost.watch" : "cost.normal";
    return item;
  }
}
```

**性能与 UX 注意事项**：
- 配置变更后应在 200ms 内刷新视图或给出 `TreeView.message` 提示；
- 成本数据量较大时建议分层加载或提供筛选命令，避免一次性渲染全部节点。

### 5.6 UC-TREE-06 深度链接定位树节点（URI Handler 联动） {#uc-tree-06}
**场景**：支持从 HTML Dashboard 或通知点击 `vscode://my-ext/insights?view=costInsights&nodeId=svc-1` 后直接在 Tree View 展开并选中对应节点。

**流程**：
1. Manifest 声明命令 `costInsights.reveal` 与 `uriHandler`；
2. 扩展注册 `window.registerUriHandler`，解析 URI 并验证 viewId 与 nodeId；
3. Provider 维护 `Map<string, CostNode>` 以支持 `treeView.reveal`；
4. 当 node 未缓存时，Provider 通过 `getParent` 链加载；
5. 命令 `costInsights.copyLink`（前一用例）生成 deep link。

**Manifest**：
```json
{
  "activationEvents": ["onView:costInsights", "onUri"],
  "contributes": {
    "commands": [ { "command": "costInsights.reveal", "title": "Reveal in Tree" } ]
  }
}
```

**TypeScript**：
```ts
const costView = vscode.window.createTreeView("costInsights", { treeDataProvider: provider, showCollapseAll: true });
const uriHandler = vscode.window.registerUriHandler({
  handleUri(uri) {
    const params = new URLSearchParams(uri.query);
    const nodeId = params.get("nodeId");
    if (!nodeId) { vscode.window.showErrorMessage("缺少 nodeId"); return; }
    const node = provider.getCachedNode(nodeId);
    if (node) {
      costView.reveal(node, { focus: true, select: true, expand: true });
    } else {
      provider.fetchNode(nodeId).then(fetched => fetched && costView.reveal(fetched, { select: true }));
    }
  }
});
```

## 6. 性能与可用性需求
- 单次 `getChildren` 执行应尽量控制在 200ms 以内，必要时分批加载；
- 当节点数量 > 2000 时需提供搜索或分页命令，避免 UI 卡顿；
- Tree View 必须支持键盘导航和屏幕阅读器，节点的 `label`/`ariaLabel` 要准确；
- 视图空态需提供说明（`TreeView.message`），并在长时间加载时显示 `TreeView.message = "Loading…"` 或在 TreeItem 中使用 `iconPath = new ThemeIcon("sync")` 表明状态。

## 7. 安全与权限
- TreeItem 命令必须通过命令注册执行，不得直接调用危险系统命令；
- Provider 访问外部服务时需使用 VS Code 网络层（遵循代理、证书、信任策略）；
- URI Handler 必须验证来源，并在执行敏感操作前提示用户；
- 当 Tree View 依赖私有数据时，扩展需要在空态或消息中提示用户登录或选择工作区。

## 8. 未来演进与设计建议
- 提供内建 Skeleton/虚拟化能力，减少大数据树首次渲染时间；
- 在 API 层增加 `TreeView.filter` 或搜索框支持，简化扩展自定义过滤实现；
- 研究 TreeItem 与 Notebook/Panel 的关联，以支持更丰富的上下文展示；
- 探索官方的 TreeNode Telemetry API，方便扩展上报加载性能与错误。
