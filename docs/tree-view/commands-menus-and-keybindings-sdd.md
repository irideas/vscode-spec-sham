# Commands / Menus / Keybindings 软件设计说明书 (SDD)

## 1. 文档目的
阐述 VS Code 命令总线、菜单注册与快捷键解析在 Tree View 场景下的实现方式，指导开发者构建安全、可扩展的交互层。本文以设计建议与实践模式为主，非 VS Code 平台的硬性约束。

## 2. 与 Tree View 的关系概述
- TreeItem 交互依靠命令系统执行，命令参数需包含节点上下文；
- 菜单系统通过上下文键和 when clause 控制 Tree View 标题栏与节点菜单；
- 快捷键需要与 Tree View 焦点、选中项同步，确保键盘用户体验。
- 对出现在 `contributes.commands` 的命令，VS Code 会在执行时自动触发 `onCommand:<id>` 激活；仅对未声明或需兼容旧引擎的命令手动写 `onCommand`。

## 2.5 使用者视角与典型场景
- **安全审计/依赖治理**：要求标题栏提供刷新/导出，节点右键提供隔离操作；命令适配器模式保障节点参数一致。
- **团队 TODO / 工作项**：偏好快捷键批量标记完成、inline action 重开任务，依赖 when clause 与 selection 同步。
- **FinOps 成本分析**：常在命令面板执行“复制节点链接”、在标题栏打开筛选器；需确保命令/菜单/快捷键共用上下文键和命令 ID。

## 3. 架构概览
### 3.1 Command Service
- 维护命令注册表（ID → handler），提供 `executeCommand` API；
- 负责调用栈、遥测、错误处理。

### 3.2 Menu Registry
- 收集 `contributes.menus`，在上下文键变化时重算可见性；
- 支持排序组（`navigation@1`、`inline`）。

### 3.3 Keybinding Resolver
- 根据 `keybindings.json` 叠加扩展默认快捷键，解析 `when` 条件；
- 当 Tree View 获取焦点时更新 `focusedView`，影响快捷键激活。

## 4. 设计细节
### 4.1 参数序列化与校验
- TreeItem 命令参数需可序列化（ID、URI、label 等），避免传递循环引用；
- 在命令实现中校验节点是否仍存在。

### 4.2 When Clause 评估管线
- Menu Registry 监听上下文键事件，若 `when` 发生变化重新渲染菜单；
- Keybinding Resolver 同样依赖上下文键，在键盘事件到来时即时计算。

### 4.3 与 Tree View Selection 同步
- `TreeView.selection` 被命令调用时需与 UI 同步；
- 对多选 Tree View，命令实现应接受数组并在逻辑层处理。

## 5. 推荐实现模式

### 5.1 Command Adapter for Tree Nodes
**作用**：构建强类型命令层，将 TreeItem 事件转化为业务命令。

```ts
interface TreeCommand<T> {
  id: string;
  run(node: T, treeView: vscode.TreeView<T>): Promise<void>;
}

class CommandAdapter<T> {
  constructor(private treeView: vscode.TreeView<T>) {}

  register(cmd: TreeCommand<T>) {
    return vscode.commands.registerCommand(cmd.id, async (node?: T) => {
      const target = node ?? this.treeView.selection[0];
      if (!target) {
        vscode.window.showWarningMessage("未选择节点");
        return;
      }
      await cmd.run(target, this.treeView);
    });
  }
}

const adapter = new CommandAdapter(costView);
adapter.register({
  id: "costInsights.openDetail",
  async run(node) {
    await openCostDetail(node.id);
  }
});
```

### 5.2 Context Menu Handler（动态上下文控制）
**作用**：根据 TreeItem 类型动态设置上下文键，驱动 `view/item/context` 菜单。

```ts
class ContextMenuHandler<T extends { context: string }> {
  constructor(viewId: string) {
    vscode.commands.executeCommand("setContext", `${viewId}.context`, "");
  }

  bind(treeView: vscode.TreeView<T>) {
    treeView.onDidChangeSelection(e => {
      const ctx = e.selection[0]?.context ?? "";
      vscode.commands.executeCommand("setContext", `${treeView.id}.context`, ctx);
    });
  }
}

const handler = new ContextMenuHandler<AuditNode>("dependencyAudit");
handler.bind(treeView);
```

### 5.3 Keybinding to Selection Flow
**作用**：将快捷键事件映射到 Tree View selection 与命令执行，支持批量操作。

```ts
const treeView = vscode.window.createTreeView("teamTodos", { treeDataProvider: provider, canSelectMany: true });

vscode.commands.registerCommand("teamTodos.markSelectionDone", async () => {
  const targets = treeView.selection.filter(item => !item.done);
  if (!targets.length) { return; }
  await markTodos(targets.map(t => t.id));
  provider.refresh();
});
```
对应的 `package.json` 片段：
```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "teamTodos.markSelectionDone",
        "key": "cmd+shift+d",
        "when": "view == teamTodos && viewItem == todo.open"
      }
    ]
  }
}
```

## 6. 运行时与部署
- 命令应在扩展停用时释放；
- 快捷键冲突需要在文档中声明，或提供设置让用户自定义；
- 当命令执行失败时，通过通知/日志反馈。

## 7. 未来演进
- 提供类型安全的命令注册工具，避免字符串 ID 错误；
- 支持菜单/命令热重载，简化实验性视图开发；
- 暴露命令遥测 Hook，区分 Tree View 触发来源。

## 8. 端到端交付清单
1. **命令声明**：确认 `contributes.commands` 与 `registerCommand` 一一对应，并提供本地化标题；
2. **菜单/快捷键**：确保 `when` 表达式指向真实上下文键，并通过 QA 覆盖键鼠路径；
3. **参数约束**：TreeItem 传递的参数应仅包含 ID、Uri、额外元数据，避免引用复杂对象；
4. **批量操作**：若 Tree View 支持多选，命令实现需接受数组并给出空 selection 提示；
5. **遥测/日志**：为关键命令添加遥测事件与失败日志，便于持续改进。
