# URI Handler & Deep Links（Tree View 桥接摘要 SDD）

本文件聚焦 Tree View 与外部入口协同时的设计建议，平台级协议、安全、Remote/Web 行为已迁移至 `docs/external-entry` 生态。读者应先阅读 `../external-entry/uri-and-links-srs.md` / `uri-and-links-sdd.md`，再结合本摘要落地 Tree 侧实现。

## 1. 定位与关联
- **定位**：Tree 侧的“入站深链”与“节点分享”设计建议；不复述 URI 解析、安全、路由的通用模式。  
- **关联文档**：`../external-entry/uri-and-links-sdd.md`（主设计）、`../external-entry/auth-and-trust-*.md`（安全占位）、`../external-entry/remote-routing-*.md`（Remote/Web 占位）。

## 2. 协作架构概览
- **进程边界**：Handler/Provider 均在 Extension Host 运行，Tree 渲染在 Workbench，通过 RPC 交互，不可直接操作 UI。  
- **调用链**：URI/命令 → 业务服务解析/校验 → Provider 查找节点 → `TreeView.reveal` → 上下文键同步 → 菜单/快捷键可用。  
- **容器/视图切换**：在执行 reveal 之前，必要时通过 `workbench.view.extension.<container>` 将视图置于可见位置，避免 reveal 静默失败。

## 3. 推荐实现模式（Tree 侧投影）
1) **模式 A：Handler→Service→Reveal（单节点落点）**  
   - Handler 只做解析与安全校验，把业务交给 Service；Service 基于稳定主键查找节点，不依赖 UI 选中状态。  
   - Reveal 失败时提供用户可理解的提示或 fallback（例如打开搜索视图）。  
2) **模式 B：节点分享链接生成器**  
   - 菜单/命令收集视图/节点 ID、过滤条件，使用 `vscode.env.uriScheme` 构造深链；写入剪贴板并提示。  
   - 生成的 URI 与平台级规范保持一致（`URLSearchParams`，必要时签名/一次性 token 见外部入口安全文档）。  
3) **模式 C：批量/异步落点**  
   - 对 UC-URI-04 等批量跳转，采用队列/节流，避免在 Handler 中并发重 IO；按序 reveal 或聚合为一个命令执行。  
   - 大量节点时可先定位父节点再局部展开，减少多次刷新。

## 4. 反模式提醒
- 在 Handler 中直接操作 TreeItem/全量刷新，导致性能波动或 UI 闪烁；应通过 Service + `onDidChangeTreeData` 控制刷新粒度。  
- 硬编码 `vscode://` 或视图容器 ID，导致在 Insiders/Remote/Web 环境下失效；应依赖 `uriScheme` 与配置/上下文键。  
- 将安全校验放在 Provider 中而非 Handler/Service，易出现“先执行了副作用再报错”的问题。

## 5. Tree 侧待演进/占位
- 若未来扩展需要在 Tree 上展示“深链落点路径 breadcrumb”或“批量结果列表”，可在此补充 UI/交互模式；平台级入口的新增特性继续沉淀在 `docs/external-entry` 域。
