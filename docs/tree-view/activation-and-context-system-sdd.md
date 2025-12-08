# Activation Events / Context Keys / When Clauses 软件设计说明书 (SDD)

## 1. 文档目的
提供 VS Code 激活事件、上下文键与 when clause 系统的设计层指导，确保 Tree View 扩展能在合适时机激活、正确维护上下文并驱动菜单/快捷键。本文以设计建议和实践模式为主，非 VS Code 平台硬约束。

## 2. 与 Tree View 的关系概述
- `onView:<id>` 决定 Tree View Provider 的延迟加载时机；
- Tree View selection/visibility 需要更新上下文键（如 `view == <id>`、`viewItem == todo.open`）；
- when clause 解析结果直接影响 Tree View 标题栏、上下文菜单与快捷键。

## 2.5 使用者视角与典型场景
- **延迟激活的依赖审计树**：仅在用户展开 Tree View 时加载，依赖 `onView:<id>`，并要求 reveal/命令路径先触发激活。
- **多选批量命令**：当 selection > 1 时设置 `dep.multiselect`，驱动批量删除/导出命令，确保上下文键与菜单同步。
- **URI/深链触发**：URI Handler 可能在视图未打开时执行，需要与 `setContext` 和 `TreeView.reveal` 配套，确保菜单、快捷键以及状态提示准确。

## 3. 架构概览
### 3.1 Activation Event Dispatcher
- 解析 `activationEvents` 列表，监听 VS Code 生命周期事件（视图打开、命令执行、URI 访问）；
- 一旦满足条件，加载扩展并运行 `activate`。

### 3.2 Context Key Service
- 管理上下文键的注册、赋值、作用域（全局/资源/视图）；
- 向 interested parties（菜单、快捷键、命令）广播变更事件。

### 3.3 When Clause Evaluator
- 解析 when 表达式生成 AST；
- 监听上下文键变动并重算结果；
- 用于菜单过滤、快捷键启用、贡献点显示。

## 4. 设计细节
### 4.1 延迟激活策略
- Tree View 应依赖 `onView:<id>` 激活，避免扩展启动延迟；
- 对已在 `contributes.commands` 声明的命令，VS Code 会在执行时自动触发 `onCommand:<id>` 激活；仅当命令未出现在 `contributes.commands` 或需兼容旧引擎时再手写 `onCommand:<id>`；
- 若 URI 可能在视图未打开前触发，需声明 `onUri`；
- 激活后在 `registerTreeDataProvider` 时最好缓存 Provider，确保 reveal 访问同一实例。

### 4.2 上下文键作用域
- 全局键：`view == <id>`, `focusedView`；
- 资源键：`resourceScheme`, `resourceLangId`；
- 自定义键：通过 `setContext` 设置，可模拟 view-level scope（命名如 `<ext>.context.<flag>`）。

### 4.3 When Clause 缓存
- Evaluator 将 when 表达式编译为函数，输入上下文字典；
- 扩展应避免频繁更新多个键，以免触发大量重计算；
- 对批量状态变化可集中更新（如 `setContext('dep.mode', 'bulk')`）。

## 5. 实现模式

### 5.1 Tree View Driven Activation
**目标**：确保资源密集型 Tree View 仅在用户真正需要时激活。

```json
// package.json 片段
{
  "activationEvents": [
    "onView:dependencyAudit"
  ]
}
```
```ts
export function activate(ctx: vscode.ExtensionContext) {
  const provider = new DependencyAuditProvider();
  ctx.subscriptions.push(vscode.window.registerTreeDataProvider("dependencyAudit", provider));
  ctx.subscriptions.push(vscode.commands.registerCommand("dependencyAudit.refresh", () => provider.refresh())) ;
}
```

### 5.2 Context Synchronizer（选中项 → 上下文键）
**目标**：将 Tree View selection 映射到多个上下文键驱动菜单/快捷键。

```ts
class ContextSynchronizer<T> {
  constructor(private treeView: vscode.TreeView<T>, private mapper: (node?: T) => Record<string, any>) {
    treeView.onDidChangeSelection(e => this.update(e.selection[0]));
  }

  private update(node?: T) {
    const ctx = this.mapper(node);
    Object.entries(ctx).forEach(([key, value]) => {
      vscode.commands.executeCommand("setContext", key, value);
    });
  }
}

new ContextSynchronizer(treeView, node => ({
  "dependencyAudit.severity": node?.severity ?? "none",
  "dependencyAudit.hasSelection": Boolean(node)
}));
```

### 5.3 When Clause Debug Hooks
**目标**：在开发环境中调试 when clause 评估，便于定位上下文缺失问题。

```ts
if (process.env.NODE_ENV === "development") {
  vscode.commands.registerCommand("ext.debugWhenClauses", async () => {
    const keys = await vscode.commands.executeCommand<Record<string, any>>("_executeContextKeys.get", undefined);
    const lines = Object.entries(keys).map(([key, value]) => `${key}: ${value}`);
    vscode.workspace.openTextDocument({ content: lines.join("\n"), language: "json" }).then(doc => vscode.window.showTextDocument(doc));
  });
}
```

## 6. 运行时考量
- 在 `onDidChangeSelection` 等高频事件中更新上下文键时应做去抖；
- URI Handler 触发的上下文键应在 reveal 完成后清理；
- 当 `setContext` 调用失败（例如命令未注册）需记录日志。

## 7. 未来演进
- 提供类型安全的上下文键 API；
- 增加 when clause 调试 UI；
- 支持 per-view scope 的 `setContext`，减少命名冲突。

## 8. 端到端校验清单
1. **激活事件**：声明必需的 `onView`、必要的 `onUri`；命令若已在 `contributes.commands` 中声明通常无需再写 `onCommand`（仅兼容旧引擎或未声明的命令时补充），并在 `activate` 中输出日志；
2. **上下文键初始化**：激活后先重置所有扩展自定义键，避免旧状态遗留；
3. **Selection Hook**：`onDidChangeSelection`、`onDidChangeVisibility` 等事件统一走 ContextSynchronizer；
4. **调试工具**：在开发模式下注入 `ext.debugWhenClauses` 或借助 `_executeContextKeys.get` 自检；
5. **QA 场景**：覆盖多选、过滤、URI reveal、配置切换等路径，确保上下文键与菜单/快捷键同步更新。
