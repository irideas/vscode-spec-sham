# 提交、分支与自检规范

## 版本与记录
- 版本号遵循 SemVer，并与 `CHANGELOG.md` 顶部段落保持一致；日期统一使用北京时间（UTC+8，格式 YYYY-MM-DD）。
- 新增功能或修复在 `CHANGELOG.md` 顶部段落说明背景与验证。
- 废弃或覆盖既有规范内容时，先在 `agents/session-summary.md` 记录原因，再提交代码。

## 提交与分支
- 提交信息遵循 Conventional Commits，主题使用中文并包含上下文前缀（如 `feat(tree-view): ...` / `docs(site): ...`），正文使用 `- ` 列表；命令行建议多个 `-m`，避免写字面量 `\n`。
- 新开分支命名为 `feature/spec-*`、`docs/spec-*` 或 `fix/spec-*` 等可读格式，避免使用个人名称；推送前确认分支与 PR 描述同步。

## 提交/推送约束
- 默认禁止自行执行 `git add/commit/push`，除非用户或维护者明确下达指令；如需展示进度，请用 `git status` / `git diff` 说明。
- 变更预览优先通过回复中的差异摘要或命令输出呈现，等待确认后再提交。

## 提交前自检
1) `npm run docs:build` 通过；  
2) 本次变更涉及的站内链接可点击无误（尤其跨域/跨目录引用），或已说明无法验证原因；  
3) 若调整版本号，`CHANGELOG.md` 与 `package.json` 保持一致；  
4) `git status` 确认无无关改动；  
5) 无法执行上述检查时说明障碍与风险。 
