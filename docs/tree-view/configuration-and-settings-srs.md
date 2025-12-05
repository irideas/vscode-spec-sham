# Configuration & Settings 需求规格说明书 (SRS)

## 1. 引言
### 1.1 文档目的
规范 VS Code 配置体系（`contributes.configuration`、`workspace.getConfiguration` 等）在 Tree View 扩展中的用法，确保视图行为可由用户自定义且与设置同步。

### 1.2 范围
- 配置 schema 声明、类型、默认值、`scope`、`enum`、`markdownDescription`；
- 运行时读取与监听设置的 API；
- Tree View 行为（可见性、过滤、刷新频率、数据源）受配置控制的策略；
- 设置与命令/上下文/URI Handler 的联动。

### 1.3 与 Tree View 的关系概述
设置可决定 Tree View 是否显示、加载哪个数据源、如何过滤节点、是否启用深度链接等。TreeDataProvider 需在设置变更时刷新数据或更新上下文键，否则视图与用户预期不符。

## 2. 总体描述
### 2.1 配置声明
- 使用 `contributes.configuration` 声明顶级标题与属性；
- 每个属性需包含 `type`、`default`、`description` 或 `markdownDescription`；
- 可通过 `enum` 限制值、`enumDescriptions` 提供说明。

### 2.2 设置存储与范围
- `scope: resource`、`window`、`machine` 控制设置生效级别；
- 用户可在 `settings.json`（用户/工作区/文件夹）覆盖默认值，VS Code 按优先级合并；
- `workspace.getConfiguration(section)` 返回合并后的值。

### 2.3 设置变更事件
- 使用 `workspace.onDidChangeConfiguration` 监听变化，调用 `event.affectsConfiguration('<section>')` 判断是否与 Tree View 相关；
- 变更后 Provider 应调用 `refresh` 或更新内部状态；
- 当设置控制视图可见性时，需与 `when: config.<key>` 条件搭配。

### 2.4 Tree View 配置主流程
1. Manifest 声明设置并在 `contributes.views`、命令、菜单中引用 `config.<key>`；
2. 扩展激活时读取当前设置值并初始化 Provider/上下文键；
3. `onDidChangeConfiguration` 触发后刷新 Tree View 或更新缓存，必要时提示用户重新连接；
4. Tree View 标题栏命令/快捷键可调用 `update` 修改设置，随后重复步骤 2-3；
5. QA 需覆盖用户/工作区/文件夹三个优先级及 Settings Sync 行为，验证预期覆盖顺序。

## 3. 功能需求
### 3.1 声明约束
- 设置 key 必须以扩展 ID 作为前缀，避免冲突；
- 当设置控制视图可见性时，对应 `contributes.views` 的 `when` 可写 `config.<key>`；
- 若设置包含敏感信息（token），需标记 `secret: true` 或使用 `secrets` API，不得直接写入 configuration；
- 提供本地化描述文本。

### 3.2 运行时读取与校验
- `workspace.getConfiguration('<ext>')` 返回 `WorkspaceConfiguration` 对象；
- 使用 `config.get<T>('prop', defaultValue)` 读取，并对重要设置进行验证（范围、类型）；
- 设置影响外部资源时，扩展需在变更后重新建立连接或提示用户重新加载；
- 当设置值 invalid 时，可显示 `TreeView.message` 提示。

### 3.3 Tree View 行为绑定
- 设置可控制 Tree View 数据源、排序方式、分组、刷新频率、主题；
- 当设置修改 TreeItem 结构（列/描述）时，需刷新 entire tree；
- 视图标题栏可显示当前设置摘要，提高透明度；
- 设置与命令/上下文键一起使用，提高交互性。

## 4. Tree View 用例

### 4.1 视图开关：配置驱动可见性
**场景**：FinOps 扩展允许用户关闭成本树；设置 `costInsights.enabled` 决定 `costInsights` Tree View 是否在 Explorer 中显示。

**Manifest**：
```json
{
  "contributes": {
    "configuration": {
      "title": "Cost Insights",
      "properties": {
        "costInsights.enabled": {
          "type": "boolean",
          "default": true,
          "description": "是否显示成本洞察 Tree View"
        }
      }
    },
    "views": {
      "explorer": [
        { "id": "costInsights", "name": "Cost Insights", "when": "config.costInsights.enabled" }
      ]
    }
  }
}
```

**TypeScript**：
```ts
const config = vscode.workspace.getConfiguration("costInsights");
let enabled = config.get("enabled", true);
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration("costInsights.enabled")) {
    enabled = vscode.workspace.getConfiguration("costInsights").get("enabled", true);
    if (!enabled) {
      vscode.window.showInformationMessage("成本视图已禁用");
    }
  }
});
```

### 4.2 数据源选择：配置驱动 TreeDataProvider 行为
**场景**：云资源树支持“生产环境”与“测试环境”两个 API 端点，用户通过设置选择数据源，Tree View 在切换后刷新。

**Manifest**：
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "cloudTools.environment": {
          "type": "string",
          "enum": ["prod", "staging"],
          "default": "prod",
          "markdownDescription": "Cloud API 环境"
        }
      }
    }
  }
}
```

**TypeScript**：
```ts
class CloudTreeProvider implements vscode.TreeDataProvider<CloudNode> {
  private env = vscode.workspace.getConfiguration("cloudTools").get("environment", "prod");
  private readonly emitter = new vscode.EventEmitter<CloudNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("cloudTools.environment")) {
        this.env = vscode.workspace.getConfiguration("cloudTools").get("environment", "prod");
        this.emitter.fire(undefined);
      }
    });
  }

  async getChildren(node?: CloudNode) {
    return fetchCloudNodes({ env: this.env, parent: node });
  }
}
```

### 4.3 刷新频率：设置与命令联动
**场景**：日志树支持自动刷新，频率由 `logTree.refreshInterval` 控制；用户可通过命令调整并即时应用。

**Manifest**：
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "logTree.refreshInterval": {
          "type": "number",
          "default": 60,
          "minimum": 10,
          "description": "自动刷新间隔（秒）"
        }
      }
    },
    "commands": [
      { "command": "logTree.setInterval", "title": "设置日志刷新间隔" }
    ]
  }
}
```

**TypeScript**：
```ts
let refreshInterval = vscode.workspace.getConfiguration("logTree").get("refreshInterval", 60);
let timer: NodeJS.Timeout | undefined;

function scheduleRefresh() {
  if (timer) { clearInterval(timer); }
  timer = setInterval(() => provider.refresh(), refreshInterval * 1000);
}

vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration("logTree.refreshInterval")) {
    refreshInterval = vscode.workspace.getConfiguration("logTree").get("refreshInterval", 60);
    scheduleRefresh();
  }
});

vscode.commands.registerCommand("logTree.setInterval", async () => {
  const value = await vscode.window.showInputBox({ prompt: "输入刷新间隔（秒）" });
  if (!value) { return; }
  const num = Number(value);
  await vscode.workspace.getConfiguration("logTree").update("refreshInterval", num, vscode.ConfigurationTarget.Global);
});
```

### 4.4 视图过滤器：配置 + 上下文键
**场景**：依赖树允许配置危害级别过滤（`critical`/`moderate`/`all`），对应菜单与 TreeItem 展示随配置变化。

**Manifest**：
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "dependencyAudit.severityFilter": {
          "type": "string",
          "enum": ["all", "critical", "moderate"],
          "default": "all",
          "description": "显示的最低风险级别"
        }
      }
    },
    "menus": {
      "view/title": [
        { "command": "dependencyAudit.toggleSeverity", "when": "view == dependencyAudit", "group": "navigation@6" }
      ]
    },
    "commands": [ { "command": "dependencyAudit.toggleSeverity", "title": "切换风险过滤" } ]
  }
}
```

**TypeScript**：
```ts
class DependencyAuditProvider implements vscode.TreeDataProvider<AuditNode> {
  private severity = vscode.workspace.getConfiguration("dependencyAudit").get("severityFilter", "all");
  private readonly emitter = new vscode.EventEmitter<AuditNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("dependencyAudit.severityFilter")) {
        this.severity = vscode.workspace.getConfiguration("dependencyAudit").get("severityFilter", "all");
        this.emitter.fire(undefined);
      }
    });
  }

  async getChildren(node?: AuditNode) {
    return this.client.fetchFiltered(node, this.severity);
  }
}

vscode.commands.registerCommand("dependencyAudit.toggleSeverity", async () => {
  const next = await vscode.window.showQuickPick(["all", "critical", "moderate"], { placeHolder: "选择风险级别" });
  if (next) {
    await vscode.workspace.getConfiguration("dependencyAudit").update("severityFilter", next, vscode.ConfigurationTarget.Workspace);
  }
});
```

## 5. 非功能需求
- **性能**：频繁变化的设置应采用 debounce，避免触发大量刷新；
- **可靠性**：当配置缺失或损坏时需提供默认值并给出诊断；
- **安全**：敏感设置不得以明文保存，必要时使用 `SecretStorage`；
- **可用性**：使用 `markdownDescription` 提供清晰说明，帮助用户理解；
- **质量门槛**：设置变更后 200ms 内应影响 Tree View 表现，Settings Sync 关闭时需保持本地默认值，并在配置影响远端调用时提示重新登录。

## 6. 未来演进
- 支持 Tree View 级别的 Settings Sync 元数据，说明哪些设置应跨设备同步；
- 提供声明式“配置 → TreeView.refresh”绑定，减少样板代码；
- 在设置 UI 中直接展示 Tree View 预览，提升可发现性。
