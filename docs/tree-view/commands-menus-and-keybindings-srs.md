# Commands / Menus / Keybindings 需求规格说明书 (SRS)

## 1. 引言
### 1.1 文档目的
定义命令（Commands）、菜单（Menus）与快捷键（Keybindings）在 Tree View 场景下的事实规范，指导航发、上下文菜单、标题栏按钮与键盘操作的统一行为。

### 1.2 范围
- `contributes.commands`、`contributes.menus`、`contributes.keybindings` 声明字段及运行时语义；
- 命令 ID 管理、参数传递、与 `vscode.commands.registerCommand` 的对应关系；
- TreeItem `command`、`contextValue`、`view/title` 与 `view/item/context` 菜单点的呈现；
- 快捷键焦点策略（View 聚焦、命令可执行、When Clause 与键盘冲突处理）。

### 1.3 与 Tree View 的关系概述
Tree View 的交互依赖命令系统：点击节点/按钮时调用 `commands.executeCommand`，上下文菜单与快捷键由 `when` 条件控制。任何树节点操作（刷新、Reveal、过滤、复制链接）都必须通过命令与菜单框架实现，从而保持安全与一致性。

## 2. 总体描述
### 2.1 命令注册流程
1. 扩展在 `package.json` 中声明命令 ID、标题、分类；
2. 对出现在 `contributes.commands` 的命令，VS Code 会在命令被调用时自动触发 `onCommand:<id>` 激活，无需重复在 `activationEvents` 声明；仅对未在 `contributes.commands` 出现或兼容旧引擎的命令手动声明 `onCommand`；
3. 扩展激活后通过 `vscode.commands.registerCommand` 注册实现函数；TreeItem/菜单/快捷键引用命令 ID 时，VS Code 查找该实现并执行，参数来自触发源。

### 2.2 菜单贡献点
- `view/title`：Tree View 标题栏按钮，支持 `group` 排序；
- `view/item/context`：节点右键菜单、inline actions；
- `commandPalette`：命令面板条目；
- `explorer/context`、`editor/title`：可引用 Tree View 命令以提供跨视图操作。

### 2.3 快捷键解析
- `contributes.keybindings` 定义默认快捷键、`mac`/`linux` 特定键；
- `when` 控制快捷键可用性，如 `view == dependencyAudit`；
- `TreeView` 获得焦点后，快捷键可访问 `TreeView.selection`；
- 快捷键冲突由 VS Code 解析器按优先级处理（用户 > 工作区 > 扩展 > 默认）。

### 2.4 Tree View 交互主流程
1. TreeItem 或标题栏定义命令 ID，并在 `package.json` 中声明；
2. 扩展激活时注册命令实现，同时注册上下文键监听；
3. 菜单/快捷键依赖上下文键判断是否可见或可执行；
4. 用户操作触发命令 → handler 读取 `TreeView.selection` 或节点 → 执行业务逻辑并刷新 Provider；
5. 命令完成后可更新配置或上下文键，实现闭环。

## 3. 功能需求
### 3.1 命令生命周期
- 命令 ID 必须唯一，遵循 `<extension>.action` 命名；
- 注册函数需返回 `Disposable` 并在扩展停用时释放；
- TreeItem `command` 参数应包含节点实体或业务 ID，禁止传递非序列化对象（如 `EventEmitter`）；打开文件/差异类行为推荐使用内置命令 `vscode.open`、`vscode.diff` 并传入 `Uri`；
- 命令实现应处理未选中节点、视图不可见等情况并给出错误提示。

### 3.2 菜单 when clause 评估
- `view == <id>` 与 `viewItem == <context>` 组合控制菜单显示；
- `group` 决定同一菜单位置的排序，如 `inline@1`；
- 当上下文键变化时，Workbench 自动重新评估菜单，无需扩展手动刷新；
- 菜单项应提供 `icon` 或 `when` 避免对无效节点展示动作。

### 3.3 快捷键与焦点管理
- 若快捷键需要 Tree View 焦点，应在 `when` 中添加 `view == <id>` 或 `focusedView == <id>`；
- `TreeView.canSelectMany` 开启后，快捷键命令需支持数组参数；
- 命令应避免阻塞 UI，必要时返回 Promise 并处理错误。

### 3.4 质量基线
- 命令标题需本地化且提供 category，便于命令面板检索；
- 菜单/快捷键的 `when` 表达式必须引用真实存在的上下文键，避免运行期警告；
- 对潜在破坏性命令（删除、隔离）需弹出确认对话框；
- QA 应覆盖键鼠混合路径：命令面板、标题栏、节点菜单、快捷键等多入口，以确保一致性。

## 4. Tree View 相关用例

### 4.1 UC-TREE-03 依赖审计树：标题栏刷新与上下文隔离
**场景**：安全团队 Tree View 需要提供刷新、导出按钮及节点右键“隔离”操作。

**角色**：安全工程师、扩展、Workbench。

**流程**：
1. 扩展声明 `dependencyAudit.refresh/export/isolate` 命令；
2. `view/title` 按钮 `when: view == dependencyAudit`；
3. `view/item/context` 菜单 `when: viewItem == dep.critical`；
4. 命令实现调用 Provider 刷新或打开 Webview。

**Manifest**：
```json
{
  "contributes": {
    "commands": [
      { "command": "dependencyAudit.refresh", "title": "刷新依赖树" },
      { "command": "dependencyAudit.export", "title": "导出审计报告" },
      { "command": "dependencyAudit.isolate", "title": "隔离依赖" }
    ],
    "menus": {
      "view/title": [
        { "command": "dependencyAudit.refresh", "when": "view == dependencyAudit", "group": "navigation@1" },
        { "command": "dependencyAudit.export", "when": "view == dependencyAudit", "group": "navigation@2" }
      ],
      "view/item/context": [
        { "command": "dependencyAudit.isolate", "when": "viewItem == dep.critical", "group": "inline" }
      ]
    }
  }
}
```

**TypeScript**：
```ts
const provider = new DependencyAuditProvider();
vscode.commands.registerCommand("dependencyAudit.refresh", (node?: AuditNode) => provider.refresh(node));
vscode.commands.registerCommand("dependencyAudit.export", () => exportReport(provider.snapshot()));
vscode.commands.registerCommand("dependencyAudit.isolate", async (node: AuditNode) => {
  await isolateDependency(node);
  provider.refresh(node);
});
```

### 4.2 UC-TREE-01 TODO 树：快捷键触发批量命令
**场景**：团队 TODO Tree View 允许用户按 `cmd+shift+d` 批量标记选中项为完成，并在节点 inline action 中显示“重开”。

**流程**：
1. `teamTodos.markDone` 注册；
2. `view/item/context` `when: viewItem == todo.open` 显示“重开”命令；
3. `keybindings` 声明快捷键 `cmd+shift+d`，`when: view == teamTodos && viewItem == todo.open`；
4. 命令实现读取 `treeView.selection`，批量更新状态。

**Manifest**：
```json
{
  "contributes": {
    "commands": [
      { "command": "teamTodos.markDone", "title": "标记选中 TODO 完成" },
      { "command": "teamTodos.reopen", "title": "重新打开 TODO" }
    ],
    "menus": {
      "view/item/context": [
        { "command": "teamTodos.reopen", "when": "viewItem == todo.done", "group": "inline" }
      ]
    },
    "keybindings": [
      {
        "command": "teamTodos.markDone",
        "key": "cmd+shift+d",
        "mac": "cmd+shift+d",
        "when": "view == teamTodos && viewItem == todo.open"
      }
    ]
  }
}
```

**TypeScript**：
```ts
const todoView = vscode.window.createTreeView("teamTodos", { treeDataProvider: provider, canSelectMany: true });

vscode.commands.registerCommand("teamTodos.markDone", async () => {
  const targets = todoView.selection.filter(item => !item.done);
  await Promise.all(targets.map(t => markTodoDone(t.id)));
  provider.refresh();
});

vscode.commands.registerCommand("teamTodos.reopen", async (item: TodoItem) => {
  await reopenTodo(item.id);
  provider.refresh(item);
});
```

### 4.3 UC-TREE-05 成本分析树：命令面板与深度链接生成
**场景**：FinOps Tree View 需要在命令面板中提供“复制节点链接”，同时在标题栏提供“按阈值筛选”按钮，并通过快捷键 `ctrl+alt+f` 打开筛选输入框。

**流程**：
1. 声明命令 `costInsights.copyLink`、`costInsights.filterThreshold`；
2. 在 `view/title` 注入筛选按钮，`group: navigation@3`；
3. `commandPalette` 添加 `costInsights.copyLink` 以便在其他地方调用；
4. 快捷键 `ctrl+alt+f` 打开输入框并调用命令。

**Manifest**：
```json
{
  "contributes": {
    "commands": [
      { "command": "costInsights.copyLink", "title": "复制成本节点链接", "category": "Cost" },
      { "command": "costInsights.filterThreshold", "title": "设置成本阈值", "category": "Cost" }
    ],
    "menus": {
      "commandPalette": [ { "command": "costInsights.copyLink" } ],
      "view/title": [
        { "command": "costInsights.filterThreshold", "when": "view == costInsights", "group": "navigation@3" }
      ]
    },
    "keybindings": [
      { "command": "costInsights.filterThreshold", "key": "ctrl+alt+f", "when": "view == costInsights" }
    ]
  }
}
```

**TypeScript**：
```ts
const costView = vscode.window.createTreeView("costInsights", { treeDataProvider: provider });

vscode.commands.registerCommand("costInsights.filterThreshold", async () => {
  const value = await vscode.window.showInputBox({ prompt: "设置成本阈值" });
  if (value) {
    provider.updateThreshold(Number(value));
  }
});

vscode.commands.registerCommand("costInsights.copyLink", (node?: CostNode) => {
  const target = node ?? costView.selection[0];
  if (!target) { vscode.window.showWarningMessage("请选择一个节点"); return; }
  const uri = buildNodeUri(target.id);
  vscode.env.clipboard.writeText(uri.toString());
});
```

## 5. 非功能需求
- **性能**：命令执行应快速完成；长耗时操作需提供状态提示；
- **安全**：命令实现需校验输入参数，避免执行任意代码；
- **一致性**：菜单排序、按钮图标遵循 VS Code 品质指南；
- **国际化**：命令标题使用 `nls.localize` 以支持多语言。

## 6. 未来演进
- 在 Tree View 标题栏提供可配置的快捷键提示；
- 支持声明式“多选命令”标记，简化可选项校验；
- 引入命令遥测钩子，自动记录 Tree View 触发来源。
