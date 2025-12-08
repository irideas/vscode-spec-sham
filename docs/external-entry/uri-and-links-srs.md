# URI 与外部链接需求规格说明书（平台供给域）

本 SRS 定义 VS Code 提供的外部入口能力的事实：`window.registerUriHandler`、`onUri` 激活、`vscode.env.uriScheme`、`asExternalUri`、`openExternal`，以及参数、安全、Remote/Web 行为的约束。消费侧（Tree/Editor/Webview/Terminal/Debug 等）的细节应在对应域展开，Tree 深链用例以 `tree-view-srs.md` 为主。

## 1. 范围与基线
- 基线：默认 `engines.vscode` ≥ 1.80；Remote/Web/Codespaces 环境需考虑 URI 重写与 authority/端口差异。
- 范围：系统级 URI Handler 注册/激活、URI 构造与解析、跨环境重写、外部打开、错误与安全约束；不覆盖各消费方的 UI/业务逻辑。

## 2. 术语与模型
- **URI Handler**：`window.registerUriHandler` 注册的单例，处理系统发来的 `Uri`。
- **uriScheme**：当前产品注册的自定义 scheme，由 `vscode.env.uriScheme` 提供（Desktop/Insiders/Web 可能不同）。
- **asExternalUri**：在 Remote/Web/Codespaces 下将内部 URI 重写为客户端可访问的外部 URI。
- **激活事件**：`onUri`（平台入口）、`onCommand:<id>`（命令声明自动生成，兼容旧引擎时可显式声明）。
- **消费方**：Tree/Editor/Webview/Terminal/Debug 等，由命令/Service 承接 Handler 结果。

## 3. 平台事实与约束
### 3.1 注册与激活
- 一个扩展通常注册一个 Handler；收到匹配 `uriScheme://<extId>/...` 时触发 `onUri` 激活并调用 `handleUri(uri)`。
- 出现在 `contributes.commands` 的命令执行时自动激活扩展（隐式 `onCommand`），通常无需重复写入 `activationEvents`。

### 3.2 URI 构造/解析
- 组成：`scheme`（来自 `uriScheme`）+ `authority`（扩展 ID）+ `path` + `query`（使用 `URLSearchParams`）+ 可选 `fragment`。
- 解析需使用 `Uri`/`URL`/`URLSearchParams`，对 query/path 做白名单校验，禁止拼接为 Shell/文件路径。
- `openExternal` 请求 OS/浏览器处理外部 URI；不保证目标程序存在，失败需提示。

### 3.3 环境差异
- **Desktop 本地**：`asExternalUri` 通常返回原值；`uriScheme` 如 `vscode`/`vscode-insiders`。  
- **Remote/Web/Codespaces**：`asExternalUri` 可能重写 authority/端口/路径以供客户端访问；生成可共享链接时必须先重写。  
- URI 只保证路由到当前客户端实例，不能假定多窗口广播。

### 3.4 安全与隐私
- 参数必须白名单解析；敏感信息不得放入可分享 URI。  
- 破坏性操作（删除/覆盖/推送）必须有用户确认对话框；无提示执行视为违规。  
- 处理后应清理敏感状态/缓存，避免在多窗口/重载后泄露。

### 3.5 错误与日志
- 解析失败、权限不足、目标不存在时需提示用户（如 `showErrorMessage/showWarningMessage`）并可记录日志/遥测。  
- Handler 不得长时间阻塞主线程；长耗时应使用异步并反馈状态。

### 3.6 兼容性
- 如需兼容低版本引擎，可显式声明 `onCommand`；Remote/Web 行为以当前 `asExternalUri` 实测为准。  
- `TreeItem.command.arguments` 等消费方参数不会持久化，URI 参数需可重建状态。

## 4. 供给流程（平台链路）
1. 外部入口生成 URI（推荐 `uriScheme`，Remote/Web 先 `asExternalUri`）。  
2. OS/浏览器触发 VS Code → 路由至目标扩展 → `onUri` 激活。  
3. Handler 解析/校验参数 → 路由到命令/Service → 消费方（Tree/Editor/Webview 等）执行。  
4. 结束前：必要的确认/提示、错误处理、敏感信息清理。

## 5. 消费方协作接口（引用）
- Tree View：节点定位/分享链接、上下文同步，详见 [Tree 深链协同 SRS](/tree-view/uri-handler-and-deep-links-srs) 与 [Tree 主域 SRS](/tree-view/tree-view-srs) 的 UC-TREE-06。  
- 其他消费方（占位）：Editor/SCM（打开文件/PR/差异）、Webview（面板唤起）、Terminal/Debug/Chat（会话/会话参数）。本域不展开业务细节。

## 6. 用例（平台侧描述，消费方自选）
### 6.1 UC-URI-01 外部入口直达资源/节点/视图 {#uc-uri-01}
- 场景：外部系统/脚本/IM 推送 `uriScheme://<ext>/reveal?target=...`，VS Code 唤起后定位到某资源或视图。  
- 入口要点：`onUri` 激活 → 参数校验（目标 ID/视图 ID/filters）→ 路由到命令/Service；可服务 Tree/Editor/Webview/Terminal 等。  
- 安全：白名单解析，敏感操作需确认。Remote/Web 需用 `asExternalUri` 生成可用链接。

### 6.2 UC-URI-02 分享/回放链接 {#uc-uri-02}
- 场景：用户复制某状态/资源的可回放链接，分享给他人或后续自用。  
- 入口要点：使用 `uriScheme` + `URLSearchParams` 生成，允许附带过滤/分组等参数；消费方执行相同动作或定位。  
- 安全：可选签名/一次性 token；禁止包含敏感数据；高风险动作需确认。

### 6.3 UC-URI-03 浏览器 OAuth/设备登录回调 {#uc-uri-03}
- 场景：浏览器完成 OAuth/设备码流程后回调 VS Code。  
- 入口要点：回调 URI 通过 `asExternalUri` 生成；Handler 校验 token/签名，存储凭证，触发消费方刷新状态（如 Tree/Editor/Webview）。  
- 安全：校验过期/重放，提示账户切换风险，避免日志泄露。

### 6.4 UC-URI-04 批量/编排入口 {#uc-uri-04}
- 场景：一个 URI 触发多条命令或多落点导航（批量操作）。  
- 入口要点：Handler 解析列表，队列/节流调度命令或定位；消费方自行实现批量策略。  
- 安全：批量 destructive 行为必须逐项或整体确认；参数需白名单与限流。

## 7. 未来演进（非当前事实）
- 统一多窗口/多实例的路由策略或系统弹框；  
- 提供官方工具方法/库辅助生成/验证深链格式与签名；  
- 扩展到 PR/Issue/Chat/Terminal 等更多入口的标准化约定。
