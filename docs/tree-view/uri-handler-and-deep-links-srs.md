# URI Handler 与深链协同 SRS（Tree View 专篇）

本章只描述 Tree View 与外部入口协同时的“事实性需求”。平台级协议（URI Handler 生命周期、`uriScheme`、`asExternalUri`、安全模型等）位于 [外部入口 SRS](/external-entry/uri-and-links-srs)，Tree 侧用例与设计优先级高于平台用例，平台文档如需消费侧细节应引用本章。

## 1. 引言
### 1.1 目的
定义 Tree View 在处理外部 URI/深链时必须遵守的可验证约束，确保节点定位、上下文同步与安全体验一致。

### 1.2 范围
- 激活与可见性：`onUri` 激活、视图容器切换、Provider 注册时机；
- 节点标识与查找：稳定主键、`resolveNodeById`、`getParent` 路径复原；
- Reveal 与上下文：`TreeView.reveal` 调用条件、上下文键同步、菜单/快捷键状态；
- 链接生成：`vscode.env.uriScheme`、高风险操作确认；  
- 性能/错误：刷新粒度、异常提示。  
（URI 解析/安全/Remote 重写等平台行为参见外部入口 SRS）

### 1.3 术语（Tree 侧）
- **节点主键（Node Key）**：稳定标识，如资源 ID/路径，用于 URI 参数与内部映射。
- **落点路径（Reveal Path）**：从根到目标节点的链路，供 `getParent`/`reveal` 使用。
- **上下文键同步**：深链落点后，`view == <id>`、`viewItem == <contextValue>` 等应与手动点击一致。

### 1.4 关联文档与用例
- 平台 SRS/SDD：[uri-and-links-srs](/external-entry/uri-and-links-srs)、[uri-and-links-sdd](/external-entry/uri-and-links-sdd)
- 安全/信任占位：[auth-and-trust-srs](/external-entry/auth-and-trust-srs) / [auth-and-trust-sdd](/external-entry/auth-and-trust-sdd)
- Remote/Web 占位：[remote-routing-srs](/external-entry/remote-routing-srs) / [remote-routing-sdd](/external-entry/remote-routing-sdd)
- Tree 主用例：**UC-TREE-06**（深度链接定位树节点，见 `tree-view-srs.md`）；成本/告警等场景在 UC-TREE-02/05 中也引用深链。

## 2. 前置事实假设
1) 命令激活：声明于 `contributes.commands` 的命令执行时自动触发 `onCommand:<id>` 激活，无需重复写入 `activationEvents`。  
2) 视图可见性：Tree View 可被移动到不同容器；扩展不得假定固定容器位置。  
3) `TreeItem.collapsibleState` 为 `None` 时 Workbench 不会调用 `getChildren`；展开箭头由 `collapsibleState` 控制。

## 3. Tree View 协同的硬性需求
1) **激活与注册**：`onUri` 激活后需确保目标 Provider 已注册；如依赖 `onView:<id>`，必须在 Handler 中显式确保视图可见，否则 reveal 可能被丢弃。  
2) **容器切换**：若视图不在当前容器，调用 `workbench.view.extension.<container>` 将其置为可见；切换后再调用 `reveal`。  
3) **节点查找**：Provider 必须提供基于节点主键的查找方法（如 `resolveNodeById`）并支持未加载节点的延迟获取；查找失败需提示并避免静默失败。  
4) **路径复原**：若 `reveal` 需要父链，`getParent` 应可返回完整路径或通过 Service 构建路径，避免依赖 UI 选中状态。  
5) **上下文键同步**：通过 URI 选中/聚焦节点后，上下文键应与手动点击等价，保证菜单/快捷键 when 条件正确；多选场景需与 Tree View 当前 selection 一致。  
6) **链接生成**：Tree 侧生成的深链必须使用 `vscode.env.uriScheme`（不可硬编码 `vscode://`），参数用 `URLSearchParams`；涉及删除/覆盖等高风险行为需在消费端显式确认。  
7) **性能与错误**：`handleUri` 中不得执行阻塞式重 IO；可异步加载并提示“正在定位/未找到”；异常应提示并记录日志，不得吞错。

## 4. 端到端流程（UC-TREE-06 视角）
1) 外部入口生成深链（含视图 ID、节点主键、可选过滤器），用户点击触发 `onUri`。  
2) Handler 校验参数 → 保证 Provider 已注册、视图可见（必要时执行容器切换）。  
3) Service 按主键查找节点，必要时恢复父链；未找到时提示并可提供 fallback（如打开搜索）。  
4) 调用 `TreeView.reveal(node, { expand: true, select: true, focus: true })`；同步上下文键，使菜单/快捷键生效。  
5) 可选：刷新相关区域（遥测、状态消息），避免重复刷新整棵树。

## 5. 兼容性与边界
- 基线：默认 `engines.vscode` ≥ 1.80，涵盖 URI Handler、Views Welcome、Tree checkbox。更低版本需验证 URI/checkbox 行为差异。  
- 多窗口/热重载：`TreeItem.command.arguments` 不会被持久化；深链参数需可重建。  
- Remote/Web：深链生成需配合平台 `asExternalUri`（见外部入口 SRS），Tree 侧仅消费解析后的 URI。

## 6. 未来演进（记录需求，非当前事实）
- 若 VS Code 提供“深链落点路径面包屑”或“reveal 前置可见性回调”，本章将补充约束。  
- 若平台新增新的入口协议（如聊天/Terminal 链接），Tree 侧的上下文同步与容器切换规则需扩展。
