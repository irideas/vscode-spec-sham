# Workbench 视图与容器需求规格说明书 (SRS)

## 1. 引言
### 1.1 文档目的
描述 VS Code Workbench 中视图容器（Activity Bar、Side Bar、Panel、自定义容器）的事实性要求，确保 Tree View 在不同容器中具备一致的激活、布局与交互体验。

### 1.2 范围
- `contributes.viewsContainers` 与 `contributes.views` 的声明约束；
- 容器的激活、可见性、焦点、布局持久化规则；
- 与 Tree View 相关的标题栏控件、collapse all、分组与上下文键；
- 与命令、配置和 URI Handler 的耦合点。

### 1.3 与 Tree View 的关系概述
每个 Tree View 必须隶属某个容器；容器负责触发 `onView:<id>` 激活事件并提供上下文键（`view == <id>`、`viewItem == <context>`），同时维护布局状态（展开、排序、宽度）。因此，Workbench 容器是 Tree View 生命周期的核心主机。

## 2. 引用
- VS Code 官方文档：《Workbench and Views》《contributes.viewsContainers》《contributes.views》；
- VS Code UX 指南：侧边栏与面板行为、焦点处理与可访问性；
- Tree View API 参考：`window.createTreeView`、`ViewContainerLocation` 枚举。

## 3. 总体描述
### 3.1 角色
- **扩展开发者**：声明视图容器、配置图标与布局属性、注册 TreeDataProvider；
- **VS Code Workbench**：加载容器、管理视图顺序、处理焦点与键盘导航、保存布局；
- **终端用户**：通过 Activity Bar、边栏或面板切换视图、拖拽重新排序。

### 3.2 容器生命周期
1. VS Code 启动时加载内置容器并解析扩展声明；
2. 当用户首次打开容器时，Workbench 初始化相应视图描述并触发对应激活事件；
3. 用户可通过拖拽或命令把视图移动至其他容器，Workbench 持久化此状态；
4. 容器关闭后维持最后一次布局，下次恢复。

### 3.3 布局与状态持久化
- 视图位置（活动栏顺序、侧栏方位、面板大小）在工作区级别保存；
- 每个 Tree View 的展开状态、滚动位置在 Workbench 进程内保持，重启后按默认折叠；
- 当用户将视图拖入面板，下次打开 VS Code 时保持该位置；
- `defaultView`、`visibility` 字段可定义初始状态。

### 3.4 Tree View 协同主流程
1. 扩展声明容器与视图 → View Descriptor Registry 记录。
2. 用户首次打开容器，`onView:<id>` 激活扩展并注册 Provider。
3. Workbench 根据容器焦点设置上下文键，菜单/快捷键适配。
4. Tree View visibility 事件触发 Provider 启动/暂停后台任务。
5. 布局变化（拖动、最小化）由 Workbench 保存，下次会话恢复后继续使用同一 Tree View。
6. 用户可将视图移动到 Panel 或 Secondary Side Bar，扩展不可假设固定容器位置；布局持久化以 `viewId` 为键，变更 `viewId` 会丢失用户布局。

## 4. 功能需求
### 4.1 视图注册协议
- `contributes.viewsContainers` 支持 `activitybar`、`panel`、`sidebar`、`testing` 等位置，必须指定 `id`、`title`、`icon`；
- `contributes.views[containerId]` 列表声明视图 ID、标题、描述、`when` 条件、`group`；
- 同一 View ID 只能在一个容器中注册，用户可运行“视图：在侧栏显示”命令移动。

### 4.2 容器激活与焦点
- 当用户显示视图或通过 `workbench.view.*` 命令切换，Workbench 触发 `onView:<id>` 激活；
- 容器获得焦点时更新上下文键 `activeViewlet` / `activePanel`，Tree View 菜单依赖这些键；
- Tree View 需响应 `TreeView.onDidChangeVisibility`，在容器隐藏时停止轮询。

### 4.3 标题栏与工具栏行为
- 容器提供标题栏区域，可通过 `contributes.menus['view/title']` 注入按钮；
- `when: view == <id>` 决定按钮可见性；
- `view/title` 分组规范：`navigation@1` 左侧、`inline` 右侧；
- Tree View 自带 Collapse All / Search 框等控件，扩展按钮不得与默认控件冲突。

### 4.4 布局恢复
- Workbench 自动保存视图的展开/折叠状态，无需扩展干预；
- 若扩展希望在切换容器后恢复特定节点，可利用 `TreeView.reveal` 配合 `onDidChangeVisibility`；
- 容器支持“锁定侧栏位置”，扩展不应假设 Tree View 永远在 Explorer；若确需默认位置，使用配置或上下文键表达，而非硬编码。

### 4.5 与其他系统的接口
- **命令**：`workbench.view.extension.<container>` 命令可将焦点切换到该容器；
- **设置**：可使用 `workbench.view.alwaysShowHeader` 等内置设置影响容器外观；
- **URI Handler**：Deep Link 需指明 viewId，容器负责显示视图后 reveal。
- **Views Welcome**：当 Tree View 尚无节点可显示时，优先通过 `viewsWelcome` 提示用户操作，而非空白或弹窗。

### 4.6 质量基线与验证
- 容器切换动画与焦点反馈需保持 100ms 以内响应，扩展代码若存在耗时逻辑应改为懒加载；
- Tree View 初始化失败时需要通过 `TreeView.message` 描述原因，避免空白面板；
- 标题栏按钮、容器图标需提供 `aria-label` 并遵守 VS Code 官方图标规范；
- QA 在回归时应覆盖容器移动（Side Bar ↔ Panel）、重启恢复、命令跳转等主要流程。

## 5. Tree View 用例

### 5.1 UC-TREE-02 自定义 Activity Bar 容器承载云资源树
**场景**：云运维扩展希望在 Activity Bar 提供独立入口，读取多种 Tree View（资源、日志、监控）。

**角色**：云运维、扩展、Workbench。

**流程**：
1. 扩展通过 `viewsContainers.activitybar` 声明 `cloudCenter` 容器；
2. 在容器中注册 `cloudAssets` Tree View；
3. 用户点击 Activity Bar 图标触发 `onView:cloudAssets` 激活；
4. Provider 根据容器可见性决定是否轮询远端；
5. 标题栏按钮提供刷新与筛选命令。

**Manifest**：
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "cloudCenter", "title": "Cloud", "icon": "media/cloud.svg" }
      ]
    },
    "views": {
      "cloudCenter": [
        { "id": "cloudAssets", "name": "Cloud Assets", "contextualTitle": "Cloud Assets" }
      ]
    }
  }
}
```

**TypeScript**：
```ts
const provider = new CloudTreeProvider();
const treeView = vscode.window.createTreeView("cloudAssets", { treeDataProvider: provider, showCollapseAll: true });
treeView.onDidChangeVisibility(e => {
  if (e.visible) {
    provider.ensurePolling();
  } else {
    provider.stopPolling();
  }
});
```

### 5.2 UC-TREE-04 面板容器中的测试结果树
**场景**：测试扩展将运行结果 Tree View 放在 Panel 区域，与终端、调试控制台并列，方便查看日志。

**流程**：
1. 扩展在 `viewsContainers.panel` 注册 `testPanel`；
2. 在容器中增加 `testResultsTree`，默认放在 Panel；
3. 通过 `workbench.action.focusPanel` 快捷命令切换到 Panel；
4. Tree View 可使用更宽的水平空间展示表格式节点。

**Manifest**：
```json
{
  "contributes": {
    "viewsContainers": {
      "panel": [ { "id": "testPanel", "title": "Tests", "icon": "media/flask.svg" } ]
    },
    "views": {
      "testPanel": [ { "id": "testResultsTree", "name": "Results" } ]
    }
  }
}
```

**TypeScript**：
```ts
const resultsView = vscode.window.createTreeView("testResultsTree", {
  treeDataProvider: resultsProvider,
  canSelectMany: true
});
vscode.commands.registerCommand("testPanel.focus", () => vscode.commands.executeCommand("workbench.action.focusPanel"));
```

### 5.3 UC-TREE-05 Explorer 与自定义容器间的视图迁移
**场景**：用户希望将同一 Tree View 在 Explorer 与自定义容器之间切换，扩展必须保证布局与状态正确恢复。

**流程**：
1. 扩展默认在 `explorer` 注册 `costInsights`；
2. 用户运行“在侧栏显示”将视图移动到自定义容器 `finOps`；
3. Workbench 更新 `view == costInsights` 上下文键，同时保留 Tree View 的展开状态；
4. 扩展监听 `onDidChangeVisibility`，在容器变化时调用 `TreeView.message` 显示提示。

**Manifest**：
```json
{
  "contributes": {
    "views": {
      "explorer": [ { "id": "costInsights", "name": "Cost Insights" } ],
      "finOps":   [ { "id": "costInsights", "name": "Cost Insights" } ]
    },
    "viewsContainers": {
      "sidebar": [ { "id": "finOps", "title": "FinOps", "icon": "media/dollar.svg" } ]
    }
  }
}
```
（注：同一 View ID 在 Manifest 中只出现一次；示例显示两种潜在位置，实际使用时需选择其一，用户再在 UI 中移动。）

**TypeScript**：
```ts
const costView = vscode.window.createTreeView("costInsights", { treeDataProvider: provider });
costView.onDidChangeVisibility(e => {
  if (e.visible) {
    costView.message = provider.getActiveContainerHint();
  }
});
```

## 6. 非功能需求
- **性能**：容器切换需在 100ms 内完成，扩展不应在 `onDidChangeVisibility` 中执行耗时阻塞；
- **可访问性**：容器图标需提供 `icon-dark` / `icon-light`，Tree View 标题支持本地化；
- **稳定性**：视图不可在激活后动态删除容器 ID，否则会导致布局不可恢复；
- **一致性**：标题栏按钮排序、图标大小遵守 VS Code UX 指南。

## 7. 未来演进
- 支持声明式“默认容器位置”优先级，避免用户多次拖动；
- 在面板区域提供网格布局，以承载多个 Tree View；
- 暴露容器主题 API，允许扩展自定义颜色或标签。
