# 变更日志

## 0.6.0 - 2025-12-09
- 协作规范拆分：根 `AGENTS.md` 精简为入口索引，新增 `agents/rules-*.md` 分拆文件（流程、Git/提交、自检、文档模板与链接规范）。
- 明确“就近 AGENTS 优先”与覆盖记录路径，便于智能体遵守规范。
- 构建：`npm run docs:build` 通过。

## 0.5.0 - 2025-12-09
- 新增 Configuration 系统域：补齐 index 与站点导航/sidebar，首页纳入配置域，文档矩阵与用例导航使用绝对路径。
- 配置域 SRS/SDD 重排与基线补充：Core/Declaration/Storage/Access/Settings UI 对齐统一模板，增加基线引用、非目标、质量门槛与演进占位。
- AGENTS 规范增强：落地 Index 与 SRS/SDD 模板条目，统一写作结构要求。
- 构建：`npm run docs:build` 通过。

## 0.4.0 - 2025-12-08
- 用例导航与锚点规范化：为 UC-TREE-01~06、UC-URI-01~04 添加显式锚点，导航改为可点击绝对链接，消除跨域循环引用。
- 外部入口与 Tree 协同拆分更清晰：外部入口用例保持平台视角，Tree 深链用例独立；协同章节链接直达对应用例。
- 构建：`npm run docs:build` 通过。

## 0.3.0 - 2025-12-08
- 外部入口域充实：安全/信任、Remote/Web 路由 SRS/SDD 由占位升级为可用供给规范；URI 平台文档补足生命周期、路由、安全与消费方接口描述。
- Tree 深链协同：Tree 侧 SRS/SDD 重写，明确激活/容器切换/主键查找/reveal/上下文同步的事实与模式；外部入口文档矩阵与 Tree 生态对齐。
- 写作与链接规范：AGENTS 增补文档矩阵格式、交叉引用与提交前自检要求；全站链接统一为可点击绝对路径。
- 构建：`npm run docs:build` 通过。

## 0.2.0 - 2025-12-08
- Tree View 生态 12 章文档进入最终发布态：补充术语统一、事实纠偏（onCommand 自动激活、TreeDataProvider 调用语义、checkbox 自动/手动模式、URI scheme/asExternalUri 等）。
- 增强可导航性：规划用例编号/索引，统一代码示例模板（`activate(context)` + `context.subscriptions.push`），入口/首页重构并清理重复目录。
- 领域拆分：将 URI/深链平台级规范迁移到 `docs/external-entry` 生态，Tree View 仅保留协作桥接摘要，新增外部入口域索引。
- 安全与版本基线：补充 `vscode.env.uriScheme`/`asExternalUri` 在 Remote/Web 场景的说明，明确 VS Code 版本基线与事实/建议分层。
- 首页重构：`docs/tree-view/index.md` 重新编排全局认知模型、生命周期、用例导航、质量基线。
- 版本号从 0.1.0 提升至 0.2.0；后续迭代关注 Telemetry/测试策略附录与引擎版本更新。

## 0.1.0 - 2025-12-05
- 初始版本，发布 Tree View 生态 SRS/SDD 雏形与 VitePress 站点架构。
