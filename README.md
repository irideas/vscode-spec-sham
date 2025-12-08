# vscode-spec-sham

> “假装 Visual Studio Code 官方团队” 的关键能力规格站，聚焦事实需求（SRS）与设计指导（SDD），由 VitePress 驱动。

## 站点定位
- 每个 VS Code 能力以「章节」形式呈现，统一产出成对的 SRS（规范底线）与 SDD（架构/实现建议）。
- 当前已上线 **Tree View 生态** 章节，后续会按 `docs/<domain>/` 扩展更多能力（如编辑器、Workbench、远端协作等）。
- 读者对象涵盖 VS Code 核心工程、扩展开发者、QA/文档/运营以及终端使用者代表，帮助在“事实”与“设计”之间快速对齐。

## Tree View 章节概览

| 域 | SRS | SDD | 摘要 |
| --- | --- | --- | --- |
| Tree View 主域 | [tree-view-srs.md](docs/tree-view/tree-view-srs.md) | [tree-view-sdd.md](docs/tree-view/tree-view-sdd.md) | TreeDataProvider/TreeItem/TreeView 的事实要求、6 大用例、跨域接口，以及对应的架构模式、实现清单与端到端流程。 |
| Workbench 视图与容器 | [workbench-views-and-containers-srs.md](docs/tree-view/workbench-views-and-containers-srs.md) | [workbench-views-and-containers-sdd.md](docs/tree-view/workbench-views-and-containers-sdd.md) | 容器注册、激活、布局与上下文传播规范，以及容器工厂、可见性协调、多视图集线器模式。 |
| Commands / Menus / Keybindings | [commands-menus-and-keybindings-srs.md](docs/tree-view/commands-menus-and-keybindings-srs.md) | [commands-menus-and-keybindings-sdd.md](docs/tree-view/commands-menus-and-keybindings-sdd.md) | 命令/菜单/快捷键生命周期、3 个 Tree View 场景与命令适配器、快捷键流程等实现指南。 |
| Activation & Context System | [activation-and-context-system-srs.md](docs/tree-view/activation-and-context-system-srs.md) | [activation-and-context-system-sdd.md](docs/tree-view/activation-and-context-system-sdd.md) | 激活事件、上下文键、when clause 的事实规则与延迟激活、上下文同步、调试模式。 |
| Configuration & Settings | [configuration-and-settings-srs.md](docs/tree-view/configuration-and-settings-srs.md) | [configuration-and-settings-sdd.md](docs/tree-view/configuration-and-settings-sdd.md) | 配置 schema、设置监听、与 Tree View 行为绑定的要求，以及 settings-backed Provider、远端配置模式。 |
| URI Handler & Deep Links（Tree 桥接） | [uri-handler-and-deep-links-srs.md](docs/tree-view/uri-handler-and-deep-links-srs.md) | [uri-handler-and-deep-links-sdd.md](docs/tree-view/uri-handler-and-deep-links-sdd.md) | 仅保留 Tree View 协作摘要；平台级协议/安全/Remote 行为详见 `docs/external-entry/uri-and-links-srs.md` / `uri-and-links-sdd.md`。 |
| 外部入口与集成（独立域） | [docs/external-entry/index.md](docs/external-entry/index.md) | — | 平台级外部入口/URI 集成生态概览，含完整用例 UC-URI-01~04 与安全/Remote 占位。 |

## 角色视角与阅读顺序

### 谁会看
- **VS Code 核心 / 平台工程**：关注容器、激活事件、上下文系统的稳定性；重点模型包括 View Container、Context Key Service、URI Handler Pipeline。
- **扩展开发者（场景作者）**：聚焦 TreeDataProvider/TreeItem/TreeView 三件套如何与命令、配置、URI 等接口协同；核心 API 有 `window.createTreeView`、`registerTreeDataProvider`、`setContext` 等。
- **QA / 文档 / 运营**：基于各章节的端到端流程与质量门槛设计测试计划与培训材料，关注 when clause、配置覆盖层级、命令/菜单可见性等。
- **终端使用者代表**（开发者、运维、测试工程师）：从 SDD 的“典型使用者与场景”获取操作指引、文案与风险提示。

### 推荐阅读顺序
1. **Tree View 主域**：掌握核心 API、生命周期与推荐架构。
2. **Workbench 容器 + Commands/Menus**：了解 Tree View 的承载容器与交互层。
3. **Activation/Context + Configuration**：梳理触发、过滤、设置的闭环以及配置驱动模式。
4. **外部入口/URI 集成**：平台级协议、安全与 Remote/Web 行为；Tree 侧仅在桥接章节补充协作摘要。

### 利用方式
- **产品/架构评审**：以 SRS 作为事实依据，SDD 提供实现路径与决策清单。
- **QA / 文档**：根据“端到端流程 / 质量门槛”章节设计回归脚本、培训内容与运行手册。
- **扩展作者**：直接引用 Manifest / TypeScript 片段，快速验证 Tree View 方案或对标官方行为。

## 版本基线
- 默认假设 `engines.vscode` ≥ 1.80（包含 TreeItem 复选框、Views Welcome、URI Handler 等能力）。实际落地请与项目的 VS Code 引擎版本对齐，若需兼容更旧版本请在章节内查阅兼容性提示。

## 本地开发与部署

### 环境准备
- Node.js 版本遵循 `.nvmrc`（当前为 `v20.19.6`），执行 `nvm use` 同步版本。
- 安装依赖：`npm install`（仓库自带 `.npmrc`，可直接使用 npm 官方源或按需调整）。

### 常用脚本
- `npm run docs:dev`：启动 VitePress 开发服务器（含热更新）。
- `npm run docs:build`：生成静态站点产物；`npm run docs:preview` 可本地预览构建结果。
- `npm run docs:deploy`：构建 + 推送 `docs/.vitepress/dist` 至 `gh-pages` 分支。

## 协作与状态
- 贡献前请阅读 [AGENTS.md](AGENTS.md)，了解沟通语言、协作流程与智能体记录要求。
- 提交前遵循 AGENTS 规范：明确需求、说明命令执行结果，并保持 SRS/SDD 与实现状态一致。
