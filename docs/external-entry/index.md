# 外部入口与集成（平台供给域）

本章总览 VS Code 提供的外部入口协议与供给模型：URI Handler、`uriScheme`、`asExternalUri`、`openExternal`、安全与信任约束。定位为“平台供给”，消费侧（Tree/Editor/Webview 等）在各自域展开，Tree 用例以 Tree 章节为主，本域只做引用。

## 基线与范围
- 基线：默认 `engines.vscode` ≥ 1.80；Remote/Web/Codespaces 需考虑 URI 重写与 authority/端口差异。
- 范围：注册/激活（`registerUriHandler`、`onUri`）、URI 构造与环境差异（`uriScheme`、`asExternalUri`）、外部打开（`openExternal`）、参数与安全约束。

## 角色与阅读路径
- **平台/安全工程**：关心协议、激活/路由、安全模型与 Remote/Web 行为 → 先读 SRS，再看安全/Remote 占位。
- **扩展作者**：关心如何用平台供给能力 → 读 SRS/SDD，消费侧细节到各域（Tree/Editor/Webview）查看。
- **QA/文档**：依据用例与质量基线设计验证脚本。

## 平台架构与生命周期（概览）
1. 外部入口（浏览器/OS/脚本）发起 `uriScheme://<ext>/...`；Remote/Web 需经 `asExternalUri` 重写。  
2. VS Code 路由到目标扩展 → `onUri` 激活 → Handler 收到 `Uri`。  
3. Handler 解析/校验参数 → 路由到命令/Service → 触发消费方（Tree/Editor/Webview 等）。  
4. 结束前清理敏感信息，必要时提示用户或记录遥测。

## 文档矩阵
| 域 | SRS | SDD | 摘要 |
| --- | --- | --- | --- |
| URI 与外部链接 | [uri-and-links-srs.md](./uri-and-links-srs.md) | [uri-and-links-sdd.md](./uri-and-links-sdd.md) | 平台事实与设计：生命周期、协议要素、`uriScheme`/`asExternalUri`、入口路由/验证、安全约束与消费方接口（Tree 用例指向 Tree 章节）。 |
| 安全与信任 | [auth-and-trust-srs.md](./auth-and-trust-srs.md) | [auth-and-trust-sdd.md](./auth-and-trust-sdd.md) | 安全/身份/信任的事实与设计：白名单、签名/一次性 token、防重放、破坏性操作确认、隐私处理。 |
| Remote/Web 路由 | [remote-routing-srs.md](./remote-routing-srs.md) | [remote-routing-sdd.md](./remote-routing-sdd.md) | Remote/SSH/Tunnel/Codespaces/Web 的 URI 重写、scheme 差异、可达性与路由建议。 |

## 用例导航（平台视角，消费细节见各域）
- [UC-URI-01](/external-entry/uri-and-links-srs#uc-uri-01)：外部入口直达资源/节点/视图（多消费方可实现）。  
- [UC-URI-02](/external-entry/uri-and-links-srs#uc-uri-02)：分享/回放链接的生成与消费（支持签名/过滤参数）。  
- [UC-URI-03](/external-entry/uri-and-links-srs#uc-uri-03)：浏览器 OAuth/设备登录回调（跨环境回调与安全校验）。  
- [UC-URI-04](/external-entry/uri-and-links-srs#uc-uri-04)：批量/编排入口（批量执行命令或多落点导航）。

## 质量与实践基线
- **安全**：参数白名单解析、敏感信息不入可共享 URI，高风险操作必须确认。  
- **兼容性**：全部链接使用 `uriScheme`，Remote/Web 通过 `asExternalUri` 生成。  
- **可靠性**：Handler 不阻塞 UI，异常需提示与日志；多窗口/热重载不得依赖持久化的复杂 arguments。  
- **引用原则**：消费细节在各域（Tree 等）展开，本域保持供给视角。

## 怎么用
- 作为“平台供给”总览，确认协议与安全边界；消费方细节请跳转各域。  
- QA 可据用例与基线设计跨环境验证（Desktop/Remote/Web）。  
- 扩展作者在构造深链/回调时先查本域，再到目标消费域确认协作模式。
