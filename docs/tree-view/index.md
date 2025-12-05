# Tree View 生态总览

Tree View 章节记录 VS Code 中“Explorer / 自定义视图”生态的事实需求与设计准则。该章节帮助读者在阅读单个 SRS/SDD 前，先掌握 Tree View 作为 UI/数据总线的全貌：它如何接收扩展的树形数据、如何被 Workbench 承载、又如何和命令、上下文、配置与深链协作。

## 能力范围
- **展示域**：Tree View 自身的注册、渲染与缓存机制；由 `TreeDataProvider` + `TreeItem` 驱动。
- **承载域**：Workbench View Container（Explorer、Run&Debug 等）提供生命周期、布局与状态持久化。
- **交互域**：命令、菜单、快捷键与 URI Handler 为 Tree Item、标题栏与节点右键提供行为。
- **治理域**：激活事件、Context Key、Configuration/Settings 用于驱动显隐与权限。

该章节将上述四个域串成一致的执行链：`Manifest & Activation → Provider & State Machine → 命令/配置/URI → 观测与回退`。

## 核心模型速览
| 模型/组件 | 职责 | 关联文档 |
| --- | --- | --- |
| TreeDataProvider / TreeItem / TreeView | 负责数据拉取、节点唯一标识、刷新与可见状态；是所有 SRS/SDD 的根模型。 | [Tree View SRS](./tree-view-srs.md) / [Tree View SDD](./tree-view-sdd.md) |
| View Container / View Descriptor Service | 为 Tree View 注册容器、控制布局、托管状态与活跃度。 | [Workbench 视图与容器 SRS](./workbench-views-and-containers-srs.md) / [SDD](./workbench-views-and-containers-sdd.md) |
| Command Service / Menu Registry / Keybinding Resolver | 建立 Tree Item 与命令之间的契约，维护 when clause、焦点与快捷键链路。 | [Commands/Menus/Keybindings SRS](./commands-menus-and-keybindings-srs.md) / [SDD](./commands-menus-and-keybindings-sdd.md) |
| Activation Events / Context Key Service | 控制何时激活 Provider、如何派发上下文键并同步至菜单与配置。 | [Activation & Context SRS](./activation-and-context-system-srs.md) / [SDD](./activation-and-context-system-sdd.md) |
| Configuration/Settings 系统 | 为 Tree View 提供 schema、监听与配置驱动的显隐、排序、远端参数。 | [Configuration & Settings SRS](./configuration-and-settings-srs.md) / [SDD](./configuration-and-settings-sdd.md) |
| URI Handler | 将外部链接、深链或多窗口导航映射为 Tree View 的 `reveal`/`command` 行为。 | [URI Handler & Deep Links SRS](./uri-handler-and-deep-links-srs.md) / [SDD](./uri-handler-and-deep-links-sdd.md) |

## 运行基线
1. **声明 → 激活**：扩展在 `package.json` 声明 Tree View、激活事件与依赖的 Context/Configuration；Workbench 依据激活条件创建/回收 Provider。
2. **数据与可视化**：`TreeDataProvider` 负责增量刷新、`TreeItem` 定义外观/交互，View Container 管理折叠、筛选与状态持久化。
3. **交互闭环**：命令与菜单接受 Tree Item 上下文，快捷键与 when clause 联动；配置与 URI Handler 则为 Tree View 提供扩展入口。
4. **诊断与回退**：章节中的 SRS 将列出日志、遥测、错误码与回退能力；SDD 提供实现建议与模式。

## 文档映射
- **基线 SRS / SDD**：Tree View 主域阐述 API 契约、用例、刷新策略与错误语义。
- **承载与布局**：Workbench 章节说明容器、分组、拖拽、焦点竞态。
- **交互系统**：Commands/Menus/Keybindings 章节解释命令总线、上下文键与键盘体验。
- **激活与治理**：Activation/Context + Configuration/Settings 描述显隐策略、延迟激活、配置驱动能力。
- **跨入口**：URI Handler 章节给出深链、外部唤起与安全约束。

阅读顺序建议：先通读本页与 Tree View 主域 SRS，随后按“承载 → 交互 → 治理 → 深链”的顺序深入即可。
