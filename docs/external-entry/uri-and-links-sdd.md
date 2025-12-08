# URI 与外部链接软件设计说明书 (SDD)

本章提供 URI Handler/深链的设计建议与模式，适用于 VS Code 的各类消费方（Tree View、Editor、Webview、Terminal、Debug 等）。平台级事实参见 SRS；本文以推荐实践为主。

## 1. 设计目标
- 跨环境可用：Desktop/Remote/Web/Codespaces 下均能生成与解析可用链接。
- 安全可靠：参数白名单、敏感操作确认、避免注入与无提示执行。
- 易于协作：通过命令/Service 抽象，支持 Tree View reveal、Editor 打开、Webview 唤起等多消费方。

## 2. 通用设计模式
### 2.1 OAuth/设备登录回调
- 使用 `asExternalUri` 生成回调 URL，浏览器完成登录后回调 `onUri`；在 Handler 中校验 token/签名，存储凭证，刷新 UI。
### 2.2 Remote/Web 兼容模式
- 生成深链时始终使用 `vscode.env.uriScheme`；对远端资源先通过 `asExternalUri` 重写，避免客户端不可达。
### 2.3 跨窗口/多实例策略
- URI 只保证激活目标扩展实例；如需多窗口广播，使用命令或存储渠道进行后续同步，避免在 Handler 中假设单实例。

## 3. Tree View 协作模式
- **深链定位节点**：URI → Service 查找节点 → `TreeView.reveal`（确保 Provider 已注册、容器可见）；缓存 miss 时优雅失败（提示未找到或定位到上层）。
- **节点生成分享链接**：命令/菜单读取节点主键，使用 `uriScheme` 构造 `.../reveal?view=<id>&nodeId=<...>`，支持附加过滤参数；复制到剪贴板并提示成功。
- **上下文同步**：URI 触发后，必要时设置上下文键（如 pendingReveal）驱动菜单/快捷键；处理完毕需清理。

## 4. 反模式与安全提示
- 反模式：直接拼接参数为 Shell/文件路径；忽略 Remote/Web 的 URI 重写；对删除/覆盖操作无确认。
- 建议：使用 `URL/URLSearchParams` 解析；破坏性操作先弹确认；敏感信息不写入可共享 URI。

## 5. 其它消费方占位
- **Editor/SCM**：PR/Issue/文件/差异深链 → 内置命令 `vscode.open`/`vscode.diff`。
- **Webview**：使用命令/消息通道唤起特定 Webview 面板，并携带参数。
- **Terminal/Debug/Chat**：为特定 session/launch/对话生成可重放链接（待后续补充）。

## 6. 未来演进
- 统一外部入口的多租户/多工作区路由策略。
- 深链格式与权限模型的参考实现或工具库。
