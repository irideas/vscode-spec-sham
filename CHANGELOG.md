# 变更日志

## 0.2.0 - 2025-12-08
- Tree View 生态 12 章文档进入最终发布态：补充术语统一、事实纠偏（onCommand 自动激活、TreeDataProvider 调用语义、checkbox 自动/手动模式、URI scheme/asExternalUri 等）。
- 增强可导航性：规划用例编号/索引，统一代码示例模板（`activate(context)` + `context.subscriptions.push`），入口/首页重构并清理重复目录。
- 安全与版本基线：补充 `vscode.env.uriScheme`/`asExternalUri` 在 Remote/Web 场景的说明，明确 VS Code 版本基线与事实/建议分层。
- 首页重构：`docs/tree-view/index.md` 重新编排全局认知模型、生命周期、用例导航、质量基线。
- 版本号从 0.1.0 提升至 0.2.0；后续迭代关注 Telemetry/测试策略附录与引擎版本更新。

## 0.1.0 - 2025-12-05
- 初始版本，发布 Tree View 生态 SRS/SDD 雏形与 VitePress 站点架构。
