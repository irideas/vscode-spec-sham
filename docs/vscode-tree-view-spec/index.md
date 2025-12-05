# Tree View 生态总览

Tree View 章节聚焦“Explorer/自定义视图”相关的全部事实需求（SRS）与设计指导（SDD），面向 VS Code 核心工程、扩展作者与 QA/文档团队。可将其视作官方内参式的小册子，帮助从 API 到端到端流程保持一致。

## 章节导览
- **Tree View 主域**： [SRS](./tree-view-srs.md) / [SDD](./tree-view-sdd.md)  
  TreeDataProvider、TreeItem、TreeView 的契约、六大典型用例以及跨域接口的处理模式。
- **Workbench 视图与容器**： [SRS](./workbench-views-and-containers-srs.md) / [SDD](./workbench-views-and-containers-sdd.md)  
  视图容器注册、激活、布局、上下文传播及多视图集线器实现。
- **Commands / Menus / Keybindings**： [SRS](./commands-menus-and-keybindings-srs.md) / [SDD](./commands-menus-and-keybindings-sdd.md)  
  命令/菜单/快捷键的生命周期、命令适配器与三大 Tree View 场景的交互约束。
- **Activation & Context System**： [SRS](./activation-and-context-system-srs.md) / [SDD](./activation-and-context-system-sdd.md)  
  激活事件、上下文键、when clause 规则，以及延迟激活、调试模式、上下文同步策略。
- **Configuration & Settings**： [SRS](./configuration-and-settings-srs.md) / [SDD](./configuration-and-settings-sdd.md)  
  配置 schema、监听与 Tree View 行为绑定、settings-backed Provider、远端配置模型。
- **URI Handler & Deep Links**： [SRS](./uri-handler-and-deep-links-srs.md) / [SDD](./uri-handler-and-deep-links-sdd.md)  
  URI Handler 生命周期、安全约束、深链场景以及 reveal/link/auth 的实现模式。

## 适用角色
- **核心 / 平台工程**：评估 Tree View 能力在 Workbench 中的承载方式与跨组件耦合，保障上下文与激活系统一致。
- **扩展开发者**：对照 SRS 了解必须遵守的行为，再参考 SDD 的架构/示例实现符合官方体验的 Tree View。
- **QA / 文档 / 运营**：根据章节中的端到端流程与质量门槛，设计测试脚本、文档模板与运营策略。
- **终端使用者代表**：在 SDD 的“典型使用者与场景”中找到实际操作步骤、文案与风险说明，指导内测或对外培训。

## 推荐阅读路径
1. 从 **Tree View 主域** 了解 API、生命周期与数据流；
2. 结合 **Workbench 容器** 与 **Commands/Menus** 理解视图容器与交互层；
3. 跟进 **Activation/Context** 与 **Configuration**，掌握 when clause、setContext、配置驱动的闭环；
4. 最后阅读 **URI Handler**，补齐跨窗口/外部场景的安全与联动要求。
