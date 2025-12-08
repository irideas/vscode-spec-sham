# URI Handler 与深链协同 SDD（Tree View 专篇）

本章给出 Tree View 处理外部入口的设计指导。平台级协议、安全、Remote/Web 行为位于 [外部入口 SDD](/external-entry/uri-and-links-sdd)；Tree 侧的用例与实现细节以本章为准。

## 1. 定位与前置
- **定位**：Tree 侧的入站深链、节点分享、容器切换、上下文同步的推荐模式与反模式，不重复平台协议。  
- **输入**：URI 参数（视图 ID、节点主键、过滤器等）、`onUri` 激活事件。  
- **输出**：节点定位/选择、上下文键同步、可选刷新与提示。

## 2. 协作架构（文本示意）
```
外部 URI → Handler → 验证/解析层 → 业务 Service
    → (确保视图可见) → Provider 查找节点/父链
    → TreeView.reveal + 上下文键同步 → 菜单/快捷键可用
```
- Handler/Provider/Service 运行在 Extension Host，UI 渲染在 Workbench，二者通过 RPC 通信。
- 容器切换通过命令 `workbench.view.extension.<container>`，需在 reveal 前完成。

## 3. 推荐模式
### 模式 A：Handler → Service → Reveal（单节点落点）
- Handler 只做解析与安全校验；Service 以节点主键查找数据并返回节点/父链。  
- Reveal 前确保视图可见；失败时提示并提供 fallback（如打开搜索或文档）。  
- 适用：UC-TREE-06 深链定位、UC-TREE-02 告警/资源跳转。

### 模式 B：节点分享链接生成器
- 在节点菜单/命令中收集视图 ID、节点主键、过滤参数，使用 `vscode.env.uriScheme` + `URLSearchParams` 构造 URI，写入剪贴板。  
- 高风险操作（删除/覆盖）附带 `intent`，消费端必须弹确认。  
- 适用：UC-TREE-05 成本分析分享、UC-TREE-02 资源分享。

### 模式 C：批量/异步落点（队列化）
- 对批量 URI 或多节点参数，使用队列/节流，优先定位父节点再展开子节点，避免在 Handler 中并发重 IO。  
- 将业务操作与 reveal 解耦：命令执行后通过 `onDidChangeTreeData` 局部刷新。  
- 适用：批量跳转、批量执行命令的扩展场景。

## 4. 反模式与防御
- 在 Handler 内直接操作 TreeItem 或全量刷新，导致性能波动：应交给 Service + `onDidChangeTreeData` 控制刷新粒度。  
- 硬编码 `vscode://` 或容器 ID，导致在 Insiders/Remote/Web 失效：使用 `uriScheme` 和配置/上下文键。  
- 将安全校验放在 Provider，可能先执行副作用再报错：应在 Handler/Service 层先校验。  
- 依赖 UI selection 推断节点：应使用主键查找与父链恢复，避免 selection 不一致。

## 5. 实现清单（Tree 侧）
- Handler：解析参数、校验必填、记录遥测，调用 Service；不要阻塞 UI。  
- Service：`resolveNodeById`、`buildPath`、权限/状态检查；返回节点及父链。  
- View 可见性：必要时调用容器切换命令，或通过 `TreeView.visible` 判定。  
- Reveal：`TreeView.reveal(node, { expand: true, select: true, focus: true })`；多选时同步 selection。  
- 上下文键：使用 `setContext` 对齐 when 条件，使菜单/快捷键可用。  
- 错误/UX：未找到→提示且提供操作入口；长耗时→展示“定位中”；高风险→确认对话框。

## 6. 演进与待办
- 若平台支持“reveal 前置回调/可见性 API”，可简化容器切换与失败处理。  
- 可补充“深链落点路径 breadcrumb”或“批量结果列表”组件模式（Tree 侧实现）。
