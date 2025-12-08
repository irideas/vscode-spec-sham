# URI 与外部链接需求规格说明书 (SRS)

## 1. 引言
本文定义 VS Code 外部入口与 URI 相关能力的事实规范：`window.registerUriHandler`、`onUri` 激活、`vscode.env.uriScheme`、`asExternalUri`、`openExternal`，以及与安全/远程环境相关的约束。适用于所有消费方（Tree View、Editor、Webview、Terminal、Debug 等），Tree View 协作模式在后文摘要并在 Tree View 小册子中作引用。

## 2. 能力范围与基线
- 引擎基线：默认 `engines.vscode` ≥ 1.80，包含 URI Handler 与 checkbox/Views Welcome 等相关特性；Remote/Web/Codespaces 需考虑 URI 重写与端口/authority 变更。
- 能力边界：系统级 URI Handler、外部深链生成/解析、Remote/Web `asExternalUri` 重写、`openExternal` 调用。

## 3. 平台级事实
### 3.1 URI Handler 生命周期
- 扩展通过 `window.registerUriHandler` 注册单例；`onUri` 激活事件在收到目标 URI 时触发扩展。
- 对出现在 `contributes.commands` 的命令，VS Code 自动处理命令激活，无需重复声明 `onCommand`；仅未声明或兼容旧引擎时手写。

### 3.2 Scheme 与环境行为
- `vscode.env.uriScheme` 提供当前产品线的 scheme（如 vscode/vscode-insiders，Web 场景可能不同）；生成深链时应使用该值而非硬编码。
- `vscode.env.asExternalUri` 在 Remote/Web/Codespaces 下重写 URI，使客户端可访问（端口/authority 可能变化）；Desktop 本地场景通常返回原值。
- `vscode.env.openExternal` 请求操作系统/浏览器打开外部 URI。

### 3.3 协议与安全约束
- 参数解析需使用 `URL/URLSearchParams`，对 query/path 做白名单校验，禁止直接拼接为 Shell/文件路径。
- 破坏性操作（删除/覆盖/推送）必须经用户确认对话框；敏感信息不得出现在可共享 URI。
- URI Handler 结束后，应清理敏感上下文/状态。

## 4. 通用应用模式（非 Tree 专属）
- OAuth/设备登录回调：浏览器 → `asExternalUri` 重写 → `onUri` → 存储凭证/刷新状态。
- 从网页/IM/脚本打开 VS Code 资源：`vscode.env.uriScheme://<extId>/open?...` → 执行命令或打开 Editor/Webview。
- 远程/代码空间入口：外部链接唤起 VS Code 客户端并连接到远程环境（需配合 `asExternalUri`）。

## 5. Tree View 协作摘要
- Deep Link → Service → `TreeView.reveal`，需确保 Provider 已注册、容器可见（可调用 `workbench.view.extension.<container>`）。
- 节点生成分享链接：使用 `uriScheme` 构造，包含视图/节点 ID/过滤参数；复制后他人可点击定位。
- 上下文键/菜单/快捷键：URI 触发后可能需要同步上下文键以驱动 Tree View 菜单/快捷键状态。

## 6. 用例（归档）
- UC-URI-01：告警/通知深链到特定节点/资源。
- UC-URI-02：复制分享链接（含视图/过滤参数）。
- UC-URI-03：外部浏览器 OAuth/设备登录回 VS Code 刷新状态。
- UC-URI-04：批量节点/资源跳转并执行命令。

## 7. 未来扩展（占位）
- PR/Issue/Review 深链到 Editor/SCM 视图。
- Chat/Terminal/Debug 入口的统一 URI 约定。
- Remote/Tunnel 下的多实例路由策略。
