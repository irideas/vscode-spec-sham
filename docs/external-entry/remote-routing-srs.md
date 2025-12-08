# 远程/浏览器路由 SRS（平台供给域）

定义 Remote/Tunnel/Codespaces/Web 场景下外部入口的路由与重写行为的事实，覆盖 `asExternalUri`、`uriScheme` 差异、可达性与路由约束。消费方在各自域落地。

## 1. 范围与基线
- 基线：`engines.vscode` ≥ 1.80，支持 `asExternalUri`、`uriScheme`；环境涵盖 Desktop（本地/远端客户端）、Remote SSH/WSL/Tunnel、Codespaces、Web。
- 范围：URI 重写、scheme 差异、可达性约束、实例/窗口路由事实；不含业务逻辑。

## 2. 平台事实
1) **`uriScheme` 差异**：Desktop/Insiders 可能为 `vscode`/`vscode-insiders`；Web/Codespaces 可为特定 scheme（由 `vscode.env.uriScheme` 提供）。不得硬编码。  
2) **`asExternalUri` 行为**：  
   - 本地 Desktop：通常返回原 URI。  
   - Remote SSH/WSL/Tunnel：重写为客户端可访问的地址，可能修改 authority/端口/路径。  
   - Codespaces/Web：将内部地址代理为公共/可共享 URL。  
3) **可达性**：`asExternalUri` 仅保证生成客户端可用地址，不保证外网/第三方可直接访问（取决于隧道/权限）。  
4) **路由范围**：`onUri` 激活路由到当前客户端实例，不保证多窗口/多设备同步。  
5) **缓存与稳定性**：重写结果可能随会话/端口变化（特别是临时隧道）；不得假定长期稳定。

## 3. 约束与要求
- 生成可分享链接时必须先调用 `asExternalUri`，并使用重写后的 URI 进行后续签名/校验/分发。  
- 不得依赖固定端口或硬编码 authority；需容忍每次会话变化。  
- 无法重写/解析时需提示用户（如无隧道权限），不可静默失败。  
- 在多窗口场景，不得假定所有实例都会收到入口；必要时消费方自行同步。

## 4. 用例映射（引用）
- **UC-URI-03**：OAuth/设备登录需用 `asExternalUri` 生成可访问回调；重写后的 URI 才可用于签名与分发。  
- **UC-URI-01/02/04**：分享/告警/批量入口在 Remote/Codespaces 下同样需重写，否则接收方可能不可达。

## 5. 未来演进（非当前事实）
- 提供稳定标识（如隧道 ID）与重写结果的有效期说明。  
- 支持多实例广播或选择目标实例的入口路由策略。
