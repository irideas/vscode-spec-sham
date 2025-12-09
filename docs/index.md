# VS Code 规格与设计

欢迎来到 vscode-spec-sham —— 我们以“假装 Visual Studio Code 官方团队”的身份，汇总关键能力的事实需求（SRS）与设计指导（SDD）。本站由 VitePress 驱动，提供结构化、可复用的规范与实现指引。

## 站点定位
- 每个能力以章节形式存在，SRS 用于锚定事实与外部约束，SDD 则描述推荐架构与实现清单。
- 当前上线章节为 **Tree View 生态**，后续会扩展至编辑器 API、Workbench 布局、远程协作等主题。
- 所有章节都可在左侧导航中找到，便于按领域浏览或交叉引用。

## 章节导航
- [Tree View 生态](./tree-view/)：TreeDataProvider/TreeItem/TreeView、Workbench 容器、命令体系、激活与上下文、配置，以及与外部入口协同的桥接摘要。
- [外部入口与集成](./external-entry/)：平台级 URI/深链/外部入口协议、安全与 Remote/Web 行为，含 UC-URI-01~04，用于服务 Tree View、Editor、Webview 等多种消费方。
- [Configuration 系统](./configuration-system/)：VS Code settings 配置底座的声明、存储与分层、访问与变更、Settings UI 子系统，以及与 Settings Sync / Enterprise Policy 的协作边界。
- 其他章节（筹备中）：编辑器 API、Panel/Webview 体系、Workbench 布局策略、远程开发协议等，将按相同模式落地。

> 章节内容持续迭代中
