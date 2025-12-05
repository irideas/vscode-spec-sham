# VS Code 规格与设计

欢迎来到 vscode-spec-sham —— 我们以“假装 Visual Studio Code 官方团队”的身份，汇总关键能力的事实需求（SRS）与设计指导（SDD）。本站由 VitePress 驱动，提供结构化、可复用的规范与实现指引。

## 站点定位
- 每个能力以章节形式存在，SRS 用于锚定事实与外部约束，SDD 则描述推荐架构与实现清单。
- 当前上线章节为 **Tree View 生态**，后续会扩展至编辑器 API、Workbench 布局、远程协作等主题。
- 所有章节都可在左侧导航中找到，便于按领域浏览或交叉引用。

## 章节导航
- [Tree View 生态](./tree-view/)：涵盖 TreeDataProvider/TreeItem/TreeView、Workbench 容器、命令体系、激活与上下文、配置以及 URI 深链的 SRS/SDD 组合。
- 其他章节（筹备中）：编辑器 API、Panel/Webview 体系、Workbench 布局策略、远程开发协议等，将按相同模式落地。

> 章节内容持续迭代中
