# Activation Events / Context Keys / When Clauses 需求规格说明书 (SRS)

## 1. 引言
### 1.1 文档目的
明确 VS Code 激活事件、上下文键与 when clause 体系在 Tree View 场景中的需求，保证扩展仅在必要时激活，且菜单/快捷键的可见性与 Tree View 状态保持一致。

### 1.2 范围
- `activationEvents`（`onView:<id>`、`onCommand:<id>`、`onUri`、`workspaceContains` 等）与 Tree View 的关系；
- 上下文键（如 `view == <id>`、`viewItem == <context>`、扩展自定义键）生命周期；
- `vscode.commands.executeCommand('setContext', ...)`、`when` 语法与栈式求值规则。

### 1.3 与 Tree View 的关系概述
Tree View 依赖 `onView` 事件延迟激活，`TreeItem.contextValue` 结合上下文键控制菜单，`TreeView.selection` 变化时需要更新自定义上下文（如“是否多选”）。因此，上下文系统是 Tree View 命令和配置展示的根基。

## 2. 引用
- VS Code 官方文档：《Activation Events》《Context Keys and When Clauses》；
- API 参考：`commands.registerCommand`、`TreeView.onDidChangeSelection`、`setContext` 命令。

## 3. 总体描述
### 3.1 激活事件模型
- 当某个条件满足（如打开视图、执行命令、接收 URI）时，VS Code 激活扩展；
- `onView:<id>` 在视图首次展开或从隐藏变为可见时触发，适合延迟加载 Provider；`TreeView.reveal` 需在扩展已激活并注册 Provider 后才能调用，本身不会额外触发激活；
- 对于出现在 `contributes.commands` 的命令，VS Code 会在执行时自动触发 `onCommand:<id>` 激活，无需重复写在 `activationEvents` 中；仅当命令未在 `contributes.commands` 声明或需兼容旧引擎时，才手动声明 `onCommand`；
- 扩展可声明多个激活事件，VS Code 采用逻辑 OR。

### 3.2 上下文键生命周期
- Workbench维护大量内建键（`view`, `focusedView`, `resourceScheme`）；
- 扩展可通过 `setContext` 创建/更新自定义键，作用域为当前 VS Code 实例；
- 当 Tree View 隐藏或节点变化时，上下文键需及时更新以避免显示错误菜单；
- TreeItem 的 `contextValue` 在 `getTreeItem` 时确定，不可动态更改（需刷新节点）。

### 3.3 When Clause 解析
- `when` 支持 `&&`, `||`, `!` 表达式，按优先级计算；
- 若 `when` 为空，则菜单/快捷键默认始终可用；
- 当相关上下文键变动时，Workbench 自动重新计算 `when`，无需扩展手动刷新；
- 当 `when` 解析结果为 `false` 时，菜单项隐藏或快捷键失效。

### 3.4 Context Key 作用域（全册共用）
- **全局级**：如 `isWorkspaceTrusted`、`workspaceFolderCount`，对所有视图生效；
- **视图级**：`view == <id>`、`focusedView == <id>`，用于限定某个 Tree View 的菜单/快捷键；
- **节点级**：`viewItem == <contextValue>`，用于区分不同节点类型的上下文菜单。

### 3.5 Tree View 协同流程
1. 声明激活事件与必需命令，保证 Tree View 延迟加载；
2. 视图激活后注册 Provider/命令，并通过 `setContext` 初始化状态；
3. Tree View selection/visibility/checkbox 事件驱动上下文键更新；
4. 菜单与快捷键根据上下文键实时评估 `when`，命令执行后可再次刷新上下文或配置；
5. URI Handler、配置与命令面板都应沿用同一上下文体系，确保多入口一致。

## 4. 功能需求
### 4.1 视图驱动的激活
- 每个自定义 Tree View 应声明 `onView:<id>` 以确保延迟激活；
- 命令激活：`contributes.commands` 会隐式生成 `onCommand:<id>`，通常无需重复声明；仅对未在 `contributes.commands` 出现的命令或兼容旧引擎时手动写 `onCommand`；
- `onUri` 用于 Tree View + Deep Link 场景，需结合 URI Handler。

### 4.2 上下文键管理
- 扩展必须在 Tree View selection/过滤状态变化时更新上下文键；
- 自定义键命名建议 `<ext>.context.flag`，避免与内建键冲突；
- `setContext` 调用应在扩展激活后执行，不可在 `package.json` 声明；
- 键值类型可为 boolean/string/number，`when` 中使用 `==` 或直接引用。

### 4.3 TreeItem contextValue 映射
- `TreeItem.contextValue` 与 `viewItem == ...` 搭配使用；
- 若一个节点需要多个上下文，可将 `contextValue` 设为 `"nodeA;critical"` 并在 when 中使用 `viewItem =~ /critical/`（或使用多个 contextValue via custom logic — 需 VS Code 1.74+）；
- 修改 `contextValue` 必须通过刷新节点重新返回 TreeItem。

### 4.4 调试与质量门槛
- 扩展应在开发模式下提供 “Inspect Context Keys” 快捷入口或命令日志；
- 高频 `setContext` 调用需做节流，避免导致菜单频繁重算；
- 当上下文依赖远端状态（如登录）时，失效后需重置为默认值以免保留脏状态；
- QA 回归应覆盖“激活→上下文→命令→上下文刷新”闭环，确保无死锁或 race。

## 5. Tree View 用例

### 5.1 UC-TREE-03 延迟激活的依赖树
**场景**：依赖树仅在用户展开视图时加载，避免启动时浪费资源。

**流程**：
1. Manifest 声明 `activationEvents: ["onView:dependencyAudit"]`；
2. 用户第一次点击视图标签，VS Code 激活扩展；
3. 扩展注册 Provider 并立刻触发初次刷新；
4. 其他命令在扩展未激活前不可用。

**Manifest**：
```json
{
  "activationEvents": ["onView:dependencyAudit"],
  "contributes": {
    "views": { "explorer": [ { "id": "dependencyAudit", "name": "Dependency Audit" } ] }
  }
}
```

**TypeScript**：
```ts
export function activate(ctx: vscode.ExtensionContext) {
  const provider = new DependencyAuditProvider();
  vscode.window.registerTreeDataProvider("dependencyAudit", provider);
}
```

### 5.2 UC-TREE-03 动态上下文：多选时启用批量命令
**场景**：在 Tree View 中选中多个节点时，需要显示“批量删除”命令，并在命令面板/快捷键中使用 `when` 控制。

**流程**：
1. Tree View 开启 `canSelectMany`；
2. `onDidChangeSelection` 根据 selection 长度调用 `setContext('dep.multiselect', true/false)`；
3. `view/title` 菜单 `when: view == dependencyAudit && dep.multiselect`；
4. 命令实现读取 `treeView.selection` 执行批量操作。

**TypeScript**：
```ts
const treeView = vscode.window.createTreeView("dependencyAudit", { treeDataProvider: provider, canSelectMany: true });
treeView.onDidChangeSelection(e => {
  vscode.commands.executeCommand("setContext", "dep.multiselect", e.selection.length > 1);
});
```

**Manifest**：
```json
{
  "contributes": {
    "menus": {
      "view/title": [
        { "command": "dependencyAudit.bulkDelete", "when": "view == dependencyAudit && dep.multiselect", "group": "navigation@4" }
      ]
    },
    "commands": [ { "command": "dependencyAudit.bulkDelete", "title": "批量删除依赖" } ]
  }
}
```

### 5.3 UC-TREE-01 状态过滤：上下文键与 TreeItem.contextValue 联动
**场景**：TODO Tree View 允许用户选择“仅显示未完成”状态，菜单项和 TreeItem contextValue 需同步更新。

**流程**：
1. `setContext('todos.showOpenOnly', true/false)` 控制过滤开关；
2. `view/title` 菜单 `when: todos.showOpenOnly` 显示“显示全部”；
3. TreeItem `contextValue` 根据 `done` 状态设置 `todo.done/todo.open`；
4. 当过滤状态变化时，Provider 触发 refresh；菜单 `when` 自动重新评估。

**TypeScript**：
```ts
async function toggleFilter() {
  const current = vscode.workspace.getConfiguration("todos").get("showOpenOnly", false);
  const next = !current;
  await vscode.workspace.getConfiguration("todos").update("showOpenOnly", next, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand("setContext", "todos.showOpenOnly", next);
  provider.refresh();
}
```

**Manifest**：
```json
{
  "contributes": {
    "menus": {
      "view/title": [
        { "command": "todos.toggleFilter", "when": "view == teamTodos && todos.showOpenOnly", "group": "navigation@5" },
        { "command": "todos.toggleFilter", "when": "view == teamTodos && !todos.showOpenOnly", "group": "navigation@5" }
      ]
    },
    "commands": [ { "command": "todos.toggleFilter", "title": "切换开放任务过滤" } ]
  }
}
```

### 5.4 UC-TREE-06 URI 激活：onUri + setContext 打开深度链接
**场景**：成本树支持 `vscode://` 链接，扩展需在接收到 URI 时激活，即使 Tree View 尚未打开。

**流程**：
1. `activationEvents` 包含 `onUri`；
2. URI Handler 解码参数并调用 `setContext('costInsights.pendingReveal', nodeId)`；
3. 当视图可见时，Provider 根据上下文键执行 `reveal`；
4. 完成后清理上下文键。

**Manifest**：
```json
{
  "activationEvents": ["onView:costInsights", "onUri"],
  "contributes": {
    "commands": [ { "command": "costInsights.reveal", "title": "Reveal Cost Node" } ]
  }
}
```

**TypeScript**：
```ts
let pendingReveal: string | undefined;

vscode.window.registerUriHandler({
  handleUri(uri) {
    pendingReveal = new URLSearchParams(uri.query).get("nodeId") ?? undefined;
    vscode.commands.executeCommand("setContext", "costInsights.pendingReveal", Boolean(pendingReveal));
    ensureViewVisible();
  }
});

costView.onDidChangeVisibility(async e => {
  if (e.visible && pendingReveal) {
    const node = await provider.resolveNodeById(pendingReveal);
    if (node) {
      await costView.reveal(node, { focus: true });
    }
    pendingReveal = undefined;
    vscode.commands.executeCommand("setContext", "costInsights.pendingReveal", false);
  }
});
```

## 6. 非功能需求
- **性能**：上下文键更新应避免高频调用，推荐在状态确实变化时更新；
- **可靠性**：`setContext` 调用失败应记录日志；
- **安全**：禁止从不可信输入直接设置上下文字段值，以防注入；
- **可测试性**：扩展应提供 `ContextKeyService` 抽象以便单元测试。

## 7. 未来演进
- 提供类型安全的 Context Key 注册 API；
- 支持视图级别 `when` 调试工具，帮助开发者诊断上下文；
- 允许 per-resource 上下文作用域，以便 Tree View 在多工作区场景下独立控制。
