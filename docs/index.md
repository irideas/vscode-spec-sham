# VSCode Tree View 规格站

欢迎来到「假装 Visual Studio Code 官方开发团队」的 Tree View 生态规格与设计文档站。本项目采用 VitePress 搭建，旨在提供面向 Tree View 相关能力的事实需求（SRS）与设计指导（SDD）。

- 站点导航基于左侧目录，可快速浏览 Tree View 主域、Workbench 容器、命令体系、激活与上下文、配置以及 URI 深链等主题。
- GitHub Pages 发布：确认 `docs/.vitepress/config.ts` 的 `base` 为 `/vscode-spec-sham/`，运行 `npm run docs:deploy` 会先构建静态文件，再将 `docs/.vitepress/dist` 推送到 `gh-pages` 分支。

> 当前内容为章节骨架与 Mock 描述，后续可逐步补充详细规范与实现指南。
