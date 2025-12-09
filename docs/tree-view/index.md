# VS Code Tree View 生态全览（SRS + SDD 导航）

本页是 Tree View 生态的总览与导览，帮助读者在进入 12 篇 SRS/SDD 前建立统一的认知模型：Tree View 如何声明与激活、如何被 Workbench 承载、又如何与命令/菜单/上下文/配置/深链协同。默认版本基线为 `engines.vscode` ≥ 1.80（包含 TreeItem 复选框、Views Welcome、URI Handler 等能力），落地时请与实际引擎版本对齐。外部入口/深链的完整协议与安全约束已迁移至 [外部入口域](/external-entry/)，本册仅保留 Tree View 协作摘要。

## 角色与阅读路径
- **VS Code 平台/核心工程**：关注容器布局、激活事件、上下文键稳定性 → 先读 Workbench、Activation 章节，再回看 Tree 主域 SRS 的事实约束。
- **扩展开发者**：聚焦 TreeDataProvider/TreeItem/TreeView 与命令、配置、URI 的协同 → 先读 Tree 主域 SRS/SDD，用例 UC-TREE-01~06，再按“交互→治理→深链”顺序。
- **QA/文档/运营**：基于用例 ID 和“端到端流程/质量门槛”设计回归 → 用例索引 + 各章的质量基线。
- **终端使用者代表**：在 SDD 的“使用者视角”小节获取操作提示与风险提醒。

## 全局架构与生命周期
1. **声明与激活**：`contributes.views`/`viewsContainers` + `contributes.commands`/`menus`/`configuration`；`onView:<id>` 延迟激活，命令在执行时自动激活 `onCommand:<id>`。
2. **数据与渲染**：Provider 返回 TreeItem（由 `collapsibleState` 决定是否展开，None 不再调用 `getChildren`）；TreeView 负责可见性、选择、checkbox、reveal 等交互。
3. **承载与布局**：View Container（Sidebar/Panel/Auxiliary）管理焦点、持久化与拖拽迁移；视图空态优先使用 Views Welcome。
4. **交互闭环**：命令/菜单/快捷键依赖上下文键与 when 表达式，配置驱动显隐/过滤，URI Handler 负责深链与外部唤起。
5. **观测与安全**：错误提示、遥测、性能目标（如 getChildren 目标 <200ms），以及 URI 参数白名单、破坏性行为确认对话框。

## 文档矩阵
| 域 | SRS | SDD | 摘要 |
| --- | --- | --- | --- |
| Tree View 主域 | [/tree-view/tree-view-srs](/tree-view/tree-view-srs) | [/tree-view/tree-view-sdd](/tree-view/tree-view-sdd) | 核心 API 契约、用例 UC-TREE-01~06、刷新/错误语义与设计模式。 |
| Workbench 视图与容器 | [/tree-view/workbench-views-and-containers-srs](/tree-view/workbench-views-and-containers-srs) | [/tree-view/workbench-views-and-containers-sdd](/tree-view/workbench-views-and-containers-sdd) | 容器注册/激活/布局与上下文传播，View Location 迁移与焦点链路。 |
| Commands / Menus / Keybindings | [/tree-view/commands-menus-and-keybindings-srs](/tree-view/commands-menus-and-keybindings-srs) | [/tree-view/commands-menus-and-keybindings-sdd](/tree-view/commands-menus-and-keybindings-sdd) | 命令/菜单/快捷键生命周期，命令适配器与反模式。 |
| Activation & Context System | [/tree-view/activation-and-context-system-srs](/tree-view/activation-and-context-system-srs) | [/tree-view/activation-and-context-system-sdd](/tree-view/activation-and-context-system-sdd) | 激活事件、Context Key 作用域、when clause 调试与延迟激活策略。 |
| Configuration & Settings | [/tree-view/configuration-and-settings-srs](/tree-view/configuration-and-settings-srs) | [/tree-view/configuration-and-settings-sdd](/tree-view/configuration-and-settings-sdd) | 配置 schema/范围/监听，settings-backed Provider 与远端配置模式。 |
| URI Handler & Deep Links（Tree 桥接） | [/tree-view/uri-handler-and-deep-links-srs](/tree-view/uri-handler-and-deep-links-srs) | [/tree-view/uri-handler-and-deep-links-sdd](/tree-view/uri-handler-and-deep-links-sdd) | 仅保留 Tree View 协作摘要；平台级协议/安全/Remote 行为详见 [外部入口 SRS](/external-entry/uri-and-links-srs) / [外部入口 SDD](/external-entry/uri-and-links-sdd)。 |
| 外部入口与集成（独立域） | [/external-entry/](/external-entry/) | — | 平台级外部入口/URI 集成生态概览，含完整用例 UC-URI-01~04 与安全/Remote 占位。 |

## 用例导航
- [UC-TREE-01](/tree-view/tree-view-srs#uc-tree-01)：团队 TODO（命令/快捷键、多状态节点）  
- [UC-TREE-02](/tree-view/tree-view-srs#uc-tree-02)：云资源浏览（懒加载、容器切换）  
- [UC-TREE-03](/tree-view/tree-view-srs#uc-tree-03)：依赖审计（标题栏、上下文菜单、多选）  
- [UC-TREE-04](/tree-view/tree-view-srs#uc-tree-04)：测试执行（异步增量、resolveTreeItem、批量命令）  
- [UC-TREE-05](/tree-view/tree-view-srs#uc-tree-05)：成本分析（配置驱动、阈值/分组、深链生成）  
- [UC-TREE-06](/tree-view/tree-view-srs#uc-tree-06)：深度链接定位节点（URI Handler 联动）  

## 质量与实践基线
- **性能**：目标 `getChildren` < 200ms，局部刷新优先；高频事件需节流。  
- **安全**：URI 参数白名单解析，破坏性操作需确认对话框；敏感配置用 SecretStorage。  
- **可用性**：空态用 Views Welcome，checkbox 默认自动联动（手动模式仅用于特殊规则）。  
- **代码模板**：示例遵循 `activate(context)` + `context.subscriptions.push(...)`、`ProviderResult` 签名，打开文件优先用内置 `vscode.open/diff`。  
- **事实 vs 建议**：SRS 章节为官方可验证事实，设计/实践建议集中在 SDD 或各章“建议/未来演进”小节。

## 怎么用
- **产品/架构评审**：以 SRS 验证平台行为，SDD 选用合适模式。  
- **QA/文档**：据“端到端流程/质量门槛/用例 ID”编写回归与培训脚本。  
- **扩展作者**：按用例 ID 查找对应代码片段与 manifest 片段，快速对标官方行为。
