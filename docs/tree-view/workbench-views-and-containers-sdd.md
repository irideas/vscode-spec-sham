# Workbench 视图与容器软件设计说明书 (SDD)

## 1. 文档目的
给出 VS Code Workbench 中视图容器（View Containers）与 Tree View 协同的实现策略，帮助平台与扩展团队在 Activity Bar、Side Bar、Panel 等区域上构建一致、可维护的视图体验。本文以设计建议与模式为主，非 VS Code 平台的硬性约束。

## 2. 与 Tree View 的关系概述
- Tree View 必须挂载在容器之下，由容器负责可见性、焦点、布局及上下文键（`view == <id>`）。
- 容器决定 `onView:<id>` 激活时机、标题栏按钮区域与 Collapse All 控件。
- 容器切换/隐藏事件应驱动 TreeDataProvider 的资源释放或刷新逻辑。

## 2.5 使用者视角与典型场景
- **云运维 / 资源浏览者**：期望在 Activity Bar 的“Cloud Center”容器中查看多棵树（资产、日志、监控），需要容器可见性钩子暂停/恢复轮询。
- **测试/调试团队**：将“测试结果”树停靠在 Panel，关注宽屏布局、多选与标题栏命令的排列。
- **FinOps / 分析团队**：喜欢把成本树迁移到自定义容器，要求容器工厂能统一管理多视图并暴露 `workbench.view.extension.<container>` 命令，方便视图间切换。

## 3. 架构总览
### 3.1 Workbench Shell
- 负责渲染 Activity Bar、Side Bar、Panel 等 UI 区域。
- 调用 View Container Manager 读取扩展注册的 Descriptor 并渲染。

### 3.2 View Container Manager
- 保存 `ViewContainer` → `ViewDescriptor` 映射，处理视图排序、拖放、持久化。
- 向上下文服务发出 `activeViewlet`, `activePanel`, `view == <id>` 等键。

### 3.3 View Descriptor Registry
- 从扩展 Manifest 解析 `contributes.viewsContainers` 与 `views`。
- 支持运行时添加/移除视图（比如 Experiments），并触发 UI 更新。

### 3.4 View Location 抽象
- 视图最终呈现在 Sidebar / Panel / Auxiliary Bar 等位置，Container 是逻辑集合，位置由 Workbench 布局控制；
- 视图从 Sidebar 迁移到 Panel 不会触发重新激活，仅更新位置与焦点，上下文键随位置变化。

## 4. 设计考虑
### 4.1 布局持久化
- 使用 `StorageService` 保存容器顺序、侧栏位置、视图可见性；
- Tree View 自身的展开状态由 Tree View 组件管理，容器只保存“当前可见视图”。

### 4.2 容器激活路由
- `workbench.view.explorer` 等命令调用 View Service 打开目标容器；
- 自定义容器应提供 `workbench.view.extension.<containerId>` 命令供命令面板/快捷键使用；
- Tree View 需要在 `treeView.onDidChangeVisibility` 响应容器切换。

### 4.3 上下文键传播
- 容器激活时设置 `activeViewlet`、`view == <id>` 等上下文键；
- Tree View 事件（selection、visibility）可进一步触发扩展自定义上下文，用于菜单/快捷键控制。
- 焦点链路：视图获得焦点后，`view == <id>`/`focusedView == <id>` 置为 true，供 Commands/Keybindings 章节引用。

## 5. 推荐实现模式

### 5.1 容器工厂 + Tree View 适配器
**目的**：将多个 Tree View 注册到统一的自定义容器，并集中处理 visibility 与命令的桥接。

```ts
type ViewSpec = { id: string; provider: vscode.TreeDataProvider<any> };

class ContainerFactory {
  private readonly views = new Map<string, vscode.TreeView<any>>();

  register(spec: ViewSpec) {
    const treeView = vscode.window.createTreeView(spec.id, {
      treeDataProvider: spec.provider,
      showCollapseAll: true
    });
    treeView.onDidChangeVisibility(e => {
      vscode.commands.executeCommand("setContext", `${spec.id}.visible`, e.visible);
    });
    this.views.set(spec.id, treeView);
  }

  dispose() {
    this.views.forEach(view => view.dispose());
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  const factory = new ContainerFactory();
  factory.register({ id: "cloudAssets", provider: new CloudTreeProvider() });
  factory.register({ id: "cloudLogs", provider: new LogTreeProvider() });
  ctx.subscriptions.push(factory);
}
```

### 5.2 ViewVisibilityCoordinator
**目的**：在容器切换时暂停或恢复 Tree View 后台任务（轮询、订阅），节省资源。

```ts
class ViewVisibilityCoordinator {
  constructor(private view: vscode.TreeView<any>, private provider: RefreshableProvider) {
    view.onDidChangeVisibility(e => e.visible ? this.onShow() : this.onHide());
  }

  private onShow() {
    this.provider.resume();
    this.provider.refresh();
  }

  private onHide() {
    this.provider.pause();
  }
}

const provider = new TelemetryTreeProvider();
const view = vscode.window.createTreeView("telemetryDiagnostics", { treeDataProvider: provider });
new ViewVisibilityCoordinator(view, provider);
```

### 5.3 多视图集线器 (Multi-View Hub)
**目的**：在 Activity Bar 自定义容器内注册多个 Tree View，并在标题栏中放置统一的切换命令。

```ts
class MultiViewHub {
  private activeView = "cloudAssets";
  constructor(private containerId: string) {}

  registerToggleCommand(command: string, targetView: string) {
    vscode.commands.registerCommand(command, () => {
      this.activeView = targetView;
      vscode.commands.executeCommand(`workbench.view.extension.${this.containerId}`);
      vscode.commands.executeCommand("setContext", `${this.containerId}.activeView`, targetView);
    });
  }
}

const hub = new MultiViewHub("cloudCenter");
hub.registerToggleCommand("cloudCenter.showAssets", "cloudAssets");
hub.registerToggleCommand("cloudCenter.showLogs", "cloudLogs");
```

## 6. 运行时考量
- 在 `activate` 期间延迟注册大型 Tree View，等容器可见后再创建 Provider；
- 当容器被用户拖动到 Panel/Side Bar，扩展不应假定固定位置；
- 所有 `TreeView` 和事件处理器需正确清理，避免窗口关闭后泄漏。

## 7. 未来演进
- 官方提供容器级别事件（如 onDidMoveView）供扩展监听；
- 在面板区域支持网格布局，以同时停靠多个 Tree View；
- 允许扩展定义容器主题/色板，提升品牌一致性。

## 8. 端到端实施清单
1. **Manifest**：确认容器 ID、图标、视图 ID 一致，并提供 `workbench.view.extension.<container>` 切换命令；
2. **Provider 注册**：延迟到容器首次可见时创建，避免无谓消耗；
3. **Visibility Hook**：绑定 `onDidChangeVisibility`，在隐藏时停止轮询并释放句柄；
4. **命令/菜单**：为标题栏按钮/上下文菜单配置 `when: view == <id>` 并遵守排序；
5. **恢复验证**：测试容器拖动到 Panel、窗口重启后的布局恢复以及 URI/命令跳转路径。
