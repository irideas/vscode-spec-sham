# URI Handler & Deep Links 软件设计说明书 (SDD)

## 1. 文档目的
提供在 VS Code 中实现 `vscode://` URI Handler、外部调用管线与 Tree View 深度链接的设计指南，涵盖安全校验、Reveal 流程与模式示例。

## 2. 与 Tree View 的关系概述
- Tree View 可生成 URI 带上视图/节点信息供外部系统跳转；
- URI Handler 解析节点 ID 后需调用 `TreeView.reveal`，因此必须和 Provider 缓存/`getParent` 协同；
- URI 还可触发命令或设置上下文键，影响 Tree View UI。

## 2.5 使用者视角与典型场景
- **云告警/运维**：在邮件或 IM 中点击 `vscode://cloud-ext/reveal`，期望直接定位到 Cloud Assets 树节点并获取失败反馈。
- **FinOps 成本分析**：复制成本节点的深链分享给同事，需要在目标 VS Code（Stable/Insiders）均能打开，并保留筛选参数。
- **OAuth/设备登录**：浏览器登录后跳回 VS Code，刷新 Tree View 中的凭证节点并提示当前账号状态，关注 `env.asExternalUri` 与 token 校验流程。

## 3. 架构概览
### 3.1 URI Handler Service
- VS Code 核心在接收到 `vscode://<extid>` 时定位扩展并调用其 `handleUri`；
- 扩展需使用 `window.registerUriHandler` 注册单例。

### 3.2 External URI Pipeline
- `env.asExternalUri` 把 `vscode://` 映射为 HTTPS 代理链接，供浏览器/OAuth 使用；
- 回调进入 VS Code 后由 Handler 再次解析。

### 3.3 Tree View Integration Layer
- Provider 提供 `resolveNodeById`/`getCachedNode`；
- TreeView 控制 `reveal`、`selection`、`message` 展示状态；
- 可能需要命令/上下文键准备视图。

## 4. 设计细节
### 4.1 URI Schema 与验证
- 建议使用结构化路径（`/reveal`, `/auth`, `/action/<name>`）；
- query 参数采用 `URLSearchParams` 解析，严格校验；
- 对敏感操作要求签名或一次性 token。

### 4.2 参数到节点映射
- Provider 维护 `{ id → TreeNode }` 缓存，并在 `getChildren`、`resolveTreeItem` 中填充；
- 若节点不在缓存，需递归获取父节点构造路径；
- Reveal 失败时应提示用户并提供 fallback（比如打开搜索）。

### 4.3 安全与权限提示
- URI 若触发破坏性命令，必须 `showWarningMessage` 提示确认；
- 对外部来源的 URI 需防止开放重定向或参数注入；
- Handler 结束后要清理敏感上下文键。

## 5. 推荐实现模式

### 5.1 reveal-on-URI Flow
**目标**：解析 URI → 打开容器 → Reveal 节点。

```ts
class RevealController<T> {
  constructor(
    private readonly viewId: string,
    private readonly view: vscode.TreeView<T>,
    private readonly provider: { resolveNodeById(id: string): Promise<T | undefined> }
  ) {}

  async reveal(nodeId: string) {
    await vscode.commands.executeCommand(`workbench.view.extension.${this.viewId}`);
    const node = await this.provider.resolveNodeById(nodeId);
    if (!node) {
      vscode.window.showWarningMessage(`未找到节点 ${nodeId}`);
      return;
    }
    await this.view.reveal(node, { expand: true, select: true, focus: true });
  }
}

const controller = new RevealController("cloudCenter", treeView, provider);

vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/reveal") { return; }
    const nodeId = new URLSearchParams(uri.query).get("nodeId");
    if (!nodeId) { vscode.window.showErrorMessage("缺少 nodeId"); return; }
    await controller.reveal(nodeId);
  }
});
```

### 5.2 Deep Link Generation Helper
**目标**：集中生成符合 schema 的链接，可集成命令/菜单。

```ts
class LinkBuilder {
  constructor(private readonly extensionId: string) {}

  build(view: string, nodeId: string, extras: Record<string, string> = {}) {
    const query = new URLSearchParams({ view, nodeId, ...extras });
    return vscode.Uri.parse(`vscode://${this.extensionId}/reveal?${query.toString()}`);
  }
}

const builder = new LinkBuilder("cloud-ext");

vscode.commands.registerCommand("cloudAssets.copyLink", (node: CloudNode) => {
  const uri = builder.build("cloudAssets", node.id, { region: node.region });
  vscode.env.clipboard.writeText(uri.toString());
  vscode.window.showInformationMessage("已复制链接");
});
```

### 5.3 External Auth + Tree Selection
**目标**：结合 `env.asExternalUri` 完成浏览器 OAuth，并在完成后刷新 Tree View。

```ts
async function startLogin() {
  const callbackUri = vscode.Uri.parse("vscode://cloud-ext/auth");
  const externalUri = await vscode.env.asExternalUri(callbackUri);
  await vscode.env.openExternal(vscode.Uri.parse(`https://login.example.com?redirect_uri=${encodeURIComponent(externalUri.toString())}`));
}

vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/auth") { return; }
    const token = new URLSearchParams(uri.query).get("token");
    if (!token) { vscode.window.showErrorMessage("缺少 token"); return; }
    await saveToken(token);
    await provider.refresh();
    treeView.message = "云账户已连接";
  }
});
```

## 6. 运行时考量
- Handler 不应执行长阻塞任务，可调用后台 Promise 并让 UI 显示加载信息；
- 若需要同时处理多个 URI，可引入队列，确保 `TreeView.reveal` 顺序执行；
- 需支持无工作区场景的提示（要求用户打开对应工作区后重试）。

## 7. 未来演进
- 官方提供深链声明文件，自动生成 Handler/Link Builder；
- 支持跨工作区透明跳转，在 URI 中携带 workspace hint；
- 增加 URI 调试控制台，便于测试不同参数组合。

## 8. 端到端联调清单
1. **Schema 设计**：统一 `/reveal`、`/auth`、`/action/<name>` 等路径，文档化所有参数；
2. **安全机制**：为敏感链接附加一次性 token/HMAC，并在 Handler 中验证时间戳及来源；
3. **容器切换**：Reveal 前执行 `workbench.view.extension.<container>` 并等待 Tree View visibility 事件；
4. **Provider 缓存**：实现 `resolveNodeById`，兼容缓存 miss 时的递归加载与错误兜底；
5. **测试矩阵**：覆盖浏览器、IM、终端等入口触发 URI，并模拟失败（缺参、节点不存在、权限不足）确保提示友好。
