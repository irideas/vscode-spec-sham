# URI Handler & Deep Links 需求规格说明书 (SRS)

## 1. 引言
### 1.1 文档目的
界定 `vscode://` URI Handler、外部唤起与 Tree View 深度链接的事实规范，确保扩展在处理外部输入时具备安全、可靠、可控的行为。

### 1.2 范围
- `window.registerUriHandler`、`vscode.env.uriScheme`、`env.asExternalUri` 的 API 行为；
- URI 格式设计、参数验证、权限提示；
- URI 与 Tree View 的联动，包括 `TreeView.reveal`、命令触发、上下文键；
- 与配置、命令、激活事件的依赖关系。

### 1.3 与 Tree View 的关系概述
Tree View 可生成深度链接供外部系统跳转，URI 到达后需定位到具体节点（`TreeView.reveal`）或执行命令。反向，Tree View 也可通过 URI Handler 接收外部事件（告警、监控），因此 URI 体系是树视图与外部世界的桥梁。

## 2. 总体描述
### 2.1 URI Handler 生命周期
1. 扩展声明 `activationEvents: ["onUri"]` 并在 `activate` 中调用 `window.registerUriHandler`；
2. 外部系统访问 `vscode://<extid>/<path>?query` 时唤起 VS Code，系统根据 `<extid>` 找到扩展；
3. 扩展在 Handler 中解析 URI、验证参数、执行逻辑；
4. Handler 返回后 VS Code 继续运行，调用者无需 await。

### 2.2 Deep Link 格式
- 路径通常包含动作（`/reveal`, `/open`, `/auth`）；
- Query 参数用于节点 ID、视图 ID、过滤条件、签名；
- URI 应可通过 `Uri.parse` 解析，并支持 `URLSearchParams`；
- 当需要跨设备分享时，扩展可调用 `env.asExternalUri` 生成带端口映射的外部链接。

### 2.3 安全与权限
- 处理 URI 前必须验证来源（可在 query 中附带 token 或签名）；
- 若 URI 会执行高风险命令（删除、上传），需显示确认对话框；
- Handler 不得阻塞 UI，如需长耗时应 `await` 异步任务；
- 任何解析错误需向用户反馈而非静默失败。

### 2.4 Tree View 端到端流程
1. Tree View 通过命令/菜单生成 `vscode://` 链接，包含 `view`、`nodeId`、过滤器等信息；
2. 用户在浏览器或通知中点击链接，VS Code 通过 `onUri` 激活扩展，并在需要时执行 `onView:<id>`；
3. Handler 解析参数、校验权限/签名，必要时先切换容器（`workbench.view.extension.<container>`）；
4. Provider 根据 `nodeId` 从缓存或远端加载节点，调用 `TreeView.reveal` 聚焦；
5. 若节点不存在或权限不足，提示用户 fallback（打开搜索/文档或重新登录）。

## 3. 功能需求
### 3.1 Handler 注册
- 扩展应在 `activate` 时注册唯一 Handler；
- Handler 返回 `Disposable`，停用时释放；
- 若扩展需要多个 Handler，应在单个 `handleUri` 内根据 `uri.path` 区分。

### 3.2 URI 参数解析
- 对所有 query 参数进行校验（类型、是否必需、长度）；
- 支持 `encodeURIComponent`；
- 解析失败时调用 `window.showErrorMessage` 并记录日志；
- 建议使用 `URL`/`URLSearchParams` 简化解析。

### 3.3 与 Tree View Reveal 协调
- Handler 需确保对应 Tree View 已创建并可见，可通过 `commands.executeCommand('workbench.view.extension.<container>')`；
- Provider 应提供 `resolveNodeById` 或 `getCachedNode` 方法；
- Reveal 前需构建节点路径（`TreeDataProvider.getParent`）；
- 若节点不存在，需友好提示并可选择 fallback（例如打开搜索面板）。

## 4. Tree View 用例

### 4.1 告警通知深链 Tree View 节点
**场景**：监控系统在邮件/IM 中推送 `vscode://cloud-ext/reveal?view=cloudAssets&nodeId=cluster-42`，开发者点击后 VS Code 展开 Tree View 并选中节点。

**流程**：
1. 扩展声明 `onView:cloudAssets` 与 `onUri` 激活；
2. Handler 解析视图 ID 与节点 ID；
3. 若视图未可见，执行 `workbench.view.extension.cloudCenter` 命令；
4. 调用 Provider 的 `resolveNodeById` 并 `treeView.reveal`；
5. 失败时显示警告。

**Manifest**：
```json
{
  "activationEvents": ["onView:cloudAssets", "onUri"],
  "contributes": {
    "commands": [
      { "command": "cloudAssets.copyLink", "title": "复制资源链接" }
    ]
  }
}
```

**TypeScript**：
```ts
const treeView = vscode.window.createTreeView("cloudAssets", { treeDataProvider: provider });

vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/reveal") { return; }
    const params = new URLSearchParams(uri.query);
    const nodeId = params.get("nodeId");
    if (!nodeId) {
      vscode.window.showErrorMessage("缺少 nodeId");
      return;
    }
    await vscode.commands.executeCommand("workbench.view.extension.cloudCenter");
    const node = await provider.resolveNodeById(nodeId);
    if (node) {
      await treeView.reveal(node, { expand: true, focus: true });
    } else {
      vscode.window.showWarningMessage(`未找到资源 ${nodeId}`);
    }
  }
});
```

### 4.2 Tree View 生成分享链接
**场景**：成本树允许用户复制某个节点的分享链接并发送给同事。链接中包含 `view`、`nodeId` 与可选过滤条件。

**流程**：
1. TreeItem 上的上下文菜单调用 `costInsights.copyLink`；
2. 命令读取节点 ID 与当前过滤配置，构造 URI；
3. 将 URI 写入剪贴板并提示成功；
4. 接收方点击链接，触发前述 Handler。

**Manifest**：
```json
{
  "contributes": {
    "menus": {
      "view/item/context": [
        { "command": "costInsights.copyLink", "when": "view == costInsights", "group": "inline" }
      ]
    },
    "commands": [ { "command": "costInsights.copyLink", "title": "复制深度链接" } ]
  }
}
```

**TypeScript**：
```ts
vscode.commands.registerCommand("costInsights.copyLink", (node: CostNode) => {
  const config = vscode.workspace.getConfiguration("costInsights");
  const query = new URLSearchParams({
    view: "costInsights",
    nodeId: node.id,
    groupBy: config.get("groupBy", "service")
  });
  const uri = vscode.Uri.parse(`vscode://${vscode.env.appName === 'Visual Studio Code - Insiders' ? 'my-ext-insiders' : 'my-ext'}/reveal?${query.toString()}`);
  vscode.env.clipboard.writeText(uri.toString());
  vscode.window.showInformationMessage("已复制链接");
});
```

### 4.3 外部浏览器 → VS Code 的认证流
**场景**：扩展在浏览器中完成 OAuth 后需要回调 VS Code，以刷新 Tree View 中的凭证节点。

**流程**：
1. 扩展调用 `env.asExternalUri` 获取用户可点击的 HTTPS 链接（VS Code 代理 VS Code URI）；
2. 浏览器完成认证后重定向至 `vscode://ext/auth?token=<jwt>`；
3. Handler 验证 token，存储凭据，并刷新 Tree View；
4. Tree View message 显示“已登录”。

**TypeScript**：
```ts
async function startLogin() {
  const localUri = vscode.Uri.parse("vscode://cloud-ext/auth");
  const external = await vscode.env.asExternalUri(localUri);
  vscode.env.openExternal(external);
}

vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/auth") { return; }
    const token = new URLSearchParams(uri.query).get("token");
    if (!token) { vscode.window.showErrorMessage("缺少 token"); return; }
    await authStore.save(token);
    provider.refresh();
    cloudView.message = "已连接到云账户";
  }
});
```

### 4.4 多节点跳转：URI 批量指令
**场景**：测试结果 Tree View 支持 URI `vscode://test-ext/focus?ids=a,b,c`，激活后自动选择多个节点并执行命令。

**TypeScript**：
```ts
vscode.window.registerUriHandler({
  async handleUri(uri) {
    if (uri.path !== "/focus") { return; }
    const ids = (new URLSearchParams(uri.query).get("ids") ?? "").split(",").filter(Boolean);
    if (!ids.length) { return; }
    const nodes = await provider.resolveNodes(ids);
    treeView.reveal(nodes[0], { expand: true });
    treeView.selection = nodes;
    vscode.commands.executeCommand("suiteTree.reRunFailed", nodes);
  }
});
```

## 5. 非功能需求
- **安全**：对所有 URI 参数进行验证与消毒，必要时增加签名或一次性 token；
- **可用性**：当 VS Code 被外部 URI 唤起但工作区未打开时，应提示用户先打开合适的工作区；
- **可靠性**：处理多 URI 并发时需排队，防止同时 `reveal` 导致冲突；
- **隐私**：禁止在 URI 中包含用户私密信息（密码、访问密钥）。

### 5.3 质量门槛
- Handler 需在 500ms 内给出成功或错误反馈，否则显示加载信息；
- 链接需兼容 VS Code Stable/Insiders 及不同平台的 scheme；
- QA 应覆盖“生成 → 浏览器 → VS Code → reveal”闭环，并模拟网络失败/权限不足情况。

## 6. 未来演进
- 提供声明式 `deeplinks` 配置，自动生成 Handler 模板；
- 支持跨工作区路由（当 node 属于特定 workspace 时提示切换）；
- 引入 URI 调试控制台，方便开发者测试不同深链。
