# URI Handler & Deep Links（Tree View 桥接摘要 SRS）

本文件只保留“与 Tree View 直接协同”的事实性需求，将平台级 URI/深链能力迁移到 `docs/external-entry` 生态。完整协议、安全、Remote/Web 行为请参阅 `../external-entry/uri-and-links-srs.md`。

## 1. 文档定位与范围
- 目标：描述 Tree View 在接入外部入口（URI Handler/深链）时必须遵守的最小事实约束，避免与平台级规范重复。
- 范围：Tree View 可见性与激活、节点定位 (`TreeView.reveal`)、容器切换、上下文键同步、用例引用。URI 生成/校验/安全/Remote 重写等平台细节不在本文件展开。

## 2. 关联文档
- 平台级 SRS：`../external-entry/uri-and-links-srs.md`
- 平台级 SDD：`../external-entry/uri-and-links-sdd.md`
- 安全/信任占位：`../external-entry/auth-and-trust-srs.md` / `../external-entry/auth-and-trust-sdd.md`
- Remote/Web 占位：`../external-entry/remote-routing-srs.md` / `../external-entry/remote-routing-sdd.md`

## 3. Tree View 协同的事实约束
1) **视图可见性与激活**：URI 触达时扩展已由 `onUri`（或隐式命令激活）拉起，需确保目标 Tree View Provider 已注册；若视图不在当前容器，可执行 `workbench.view.extension.<container>` 使其可见。  
2) **节点定位**：`TreeView.reveal` 需要可解析的节点对象；Provider 应提供基于业务主键的查找（例如 `resolveNodeById`）并在未找到时优雅提示。`TreeItem.collapsibleState` 为 `None` 时不会调用 `getChildren`。  
3) **上下文键与菜单状态**：当通过 URI 选中/聚焦节点后，应保持与用户手动点击等价的上下文键（如 `view == <id>`、`viewItem == <contextValue>`），以便命令/菜单/快捷键正常生效。  
4) **链接生成**：Tree 侧生成可分享链接时应使用 `vscode.env.uriScheme`，不要硬编码 `vscode://`；高风险操作的链接必须在消费端弹出确认（安全细节见外部入口 SRS）。  
5) **性能与用户体验**：深链落点通常直达具体节点；应避免在 `handleUri` 内做重 IO，必要时异步加载并以“正在定位/未找到”提示收束。

## 4. 典型协作场景（引用）
- **UC-URI-01** 告警/通知直达节点：外部链接 → `onUri` → 容器切换 → `TreeView.reveal`。  
- **UC-URI-02** 节点分享链接：节点右键生成深链，接收方点击后在同一视图定位。  
- **UC-URI-03** OAuth/设备登录回调：浏览器完成认证 → `onUri` 写入凭据 → 刷新 Tree View 状态。  
- **UC-URI-04** 批量跳转执行命令：URI 携带多节点/命令参数，依次 reveal 或批处理。  
> 用例详情、参数设计和安全约束见 `../external-entry/uri-and-links-srs.md#5-tree-view-协作摘要` 及相关章节。

## 5. 实践建议（非约束）
- 保持“命令/服务”负责业务逻辑，URI Handler 只做解析与路由；通过 `onDidChangeTreeData` 触发 UI 刷新。  
- 为分享链接定义稳定的节点主键（路径/ID），避免依赖易变显示文本。  
- 深链落点前可先校验权限/状态，失败时提供 fallback（例如打开搜索或帮助文档）。

## 6. 未来演进
- 后续若 Tree View 侧需要新的上下文键同步/容器切换能力，将在本文件补充；平台级外部入口的新增特性统一归档于 `docs/external-entry`。
