# 外部入口与集成（External Entry & Integration）

本生态描述 VS Code 与外部世界交互的入口与协议：URI Handler、外部深链、远程/浏览器重定向、安全与信任模型等。Tree View 是重要消费方之一，但非唯一；其它消费方包括编辑器、Webview、Terminal、Debug、Chat 等。

## 能力范围与基线
- **能力**：`window.registerUriHandler` / `onUri` 激活、`vscode.env.uriScheme`、`asExternalUri`（Desktop/Remote/Web/Codespaces）、`openExternal`、外部入口的安全/信任约束。
- **基线**：默认 `engines.vscode` ≥ 1.80；Remote/Web/Codespaces 需考虑 URI 重写与端口/authority 变更。

## 文档矩阵
| 文档 | 角色 | 摘要 |
| --- | --- | --- |
| [uri-and-links-srs.md](./uri-and-links-srs.md) | SRS | URI/深链/外部入口的事实规范（协议、API 行为、安全约束、Remote/Web 行为），含通用应用模式与 Tree View 协作摘要。 |
| [uri-and-links-sdd.md](./uri-and-links-sdd.md) | SDD | 设计建议与模式：OAuth 回调、Remote/Web `asExternalUri` 重写、通用/Tree View 专用深链模式、反模式与安全提示。 |
| [auth-and-trust-srs.md](./auth-and-trust-srs.md) | SRS | 占位：外部入口的安全/身份/信任事实（白名单、签名/一次性 token、破坏性操作确认、隐私处理）。 |
| [auth-and-trust-sdd.md](./auth-and-trust-sdd.md) | SDD | 占位：安全/身份设计建议（token/HMAC、UI 提示、隐私处理），后续按需填充。 |
| [remote-routing-srs.md](./remote-routing-srs.md) | SRS | 占位：Remote/Web/Codespaces 下 URI 重写、端口/authority 行为的事实要点。 |
| [remote-routing-sdd.md](./remote-routing-sdd.md) | SDD | 占位：Remote/Web/Codespaces 设计建议（生成可用链接、反模式），后续按需填充。 |

## 关系与消费方
- Tree View：深链定位节点、节点生成可分享链接、容器切换/上下文同步（详见 Tree View SRS/SDD 的桥接小节）。
- 其他消费方（占位）：编辑器/PR/Issue 打开、Webview 页面唤起、Terminal/Debug 链接、登录/设置入口等。

## 用例索引（归档至本域）
- **UC-URI-01**：告警/通知深链到特定节点/资源
- **UC-URI-02**：复制分享链接（含视图/过滤参数）
- **UC-URI-03**：外部浏览器 OAuth/设备登录回 VS Code 刷新状态
- **UC-URI-04**：批量节点/资源跳转并执行命令

> 后续新增外部入口场景（例如 PR/Issue 跳转、Remote/Tunnel 重定向）可继续在本域扩展用例。
