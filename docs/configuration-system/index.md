# VS Code Configuration 系统总览（SRS + SDD 导航）

本页为 VS Code Configuration 系统（settings 配置底座）的总览入口，涵盖声明、存储与分层、访问与变更、Settings UI 四个子系统，以及体系级 SRS/SDD。默认基线为 `engines.vscode` ≥ 1.80；Settings Sync、Enterprise Policy 作为外部系统在此仅做接口视角。

## 角色与阅读路径
- **平台/核心工程**：关注配置模型、分层合并、Policy 层注入 → 先读 Core SRS，再看 Storage/Access SRS/SDD。
- **扩展开发者**：关注声明、读取/写入 API、Settings UI 呈现 → 读 Declaration SRS/SDD + Access SRS/SDD，再看 Settings UI SRS/SDD 以验证呈现。
- **企业管理员/平台工程**：关注 Policy 与 Sync 如何与配置底座交互 → 读 Core/Storage SRS 的 Policy/Synchronization 约束，再参考 Settings UI SRS 的锁定呈现。
- **QA/文档/培训**：按用例 ID 和质量基线设计回归 → 使用文档矩阵与用例导航。

## 架构与生命周期摘要
1. **声明驱动**：VS Code 内置与扩展通过 `contributes.configuration` 注册 schema，进入 Configuration Registry，驱动 Settings UI 与 JSON 补全。
2. **分层合并**：Default → User(/Profile/Remote) → Workspace(/Remote) → Folder → Language override → Policy 的叠加规则，输出有效配置视图。
3. **统一访问与写入**：`workspace.getConfiguration`/`WorkspaceConfiguration.update` 屏蔽存储细节，`onDidChangeConfiguration` 广播变更。
4. **UI 与 JSON 双栖**：Settings Editor（UI）与 settings.json 共用 schema/合并模型，保证展示与写入一致；支持 scope 切换与来源提示。
5. **外部系统协作**：Settings Sync 通过标准 API 读写 User 设置，Policy 注入最高优先级层并在 UI 中锁定展示。

## 文档矩阵
| 域 | SRS | SDD | 摘要 |
| --- | --- | --- | --- |
| Configuration 体系 | [/configuration-system/configuration-core-srs](/configuration-system/configuration-core-srs) | [/configuration-system/configuration-core-sdd](/configuration-system/configuration-core-sdd) | 配置底座总体范围、分层模型、外部系统接口与系统级 FR/NFR。 |
| 声明子系统 | [/configuration-system/configuration-declaration-srs](/configuration-system/configuration-declaration-srs) | [/configuration-system/configuration-declaration-sdd](/configuration-system/configuration-declaration-sdd) | Setting schema/registry、configurationDefaults、校验与对 UI/JSON/Sync/Policy 的元数据供给。 |
| 存储与分层子系统 | [/configuration-system/configuration-storage-layering-srs](/configuration-system/configuration-storage-layering-srs) | [/configuration-system/configuration-storage-layering-sdd](/configuration-system/configuration-storage-layering-sdd) | settings 文件定位/解析、层叠合并、变更监听、Remote/Profile/Policy 扩展点与容错。 |
| 访问与变更子系统 | [/configuration-system/configuration-access-update-srs](/configuration-system/configuration-access-update-srs) | [/configuration-system/configuration-access-update-sdd](/configuration-system/configuration-access-update-sdd) | `getConfiguration`/`update`/`inspect`/事件语义，写入目标决策、语言覆盖、Policy 拒绝等行为。 |
| Settings UI 子系统 | [/configuration-system/configuration-settings-ui-srs](/configuration-system/configuration-settings-ui-srs) | [/configuration-system/configuration-settings-ui-sdd](/configuration-system/configuration-settings-ui-sdd) | Settings Editor（UI/JSON）的交互需求与设计：scope 切换、搜索过滤、来源/锁定状态、与 JSON 同步。 |

## 用例导航
- [UC-CORE-01](/configuration-system/configuration-core-srs#uc-core-01)：工作区级定制编辑行为  
- [UC-CORE-02](/configuration-system/configuration-core-srs#uc-core-02)：扩展声明并使用自己的 settings  
- [UC-CORE-03](/configuration-system/configuration-core-srs#uc-core-03)：语言特定设置  
- [UC-CORE-04](/configuration-system/configuration-core-srs#uc-core-04)：Settings Sync 跨设备同步  
- [UC-CORE-05](/configuration-system/configuration-core-srs#uc-core-05)：企业策略锁定设置  
- [UC-DECL-01](/configuration-system/configuration-declaration-srs#uc-decl-01)：扩展声明简单设置  
- [UC-DECL-03](/configuration-system/configuration-declaration-srs#uc-decl-03)：声明资源级 Setting  
- [UC-DECL-05](/configuration-system/configuration-declaration-srs#uc-decl-05)：通过 configurationDefaults 覆盖默认值  
- [UC-STOR-02](/configuration-system/configuration-storage-layering-srs#uc-stor-02)：多根工作区 + Folder 设置  
- [UC-STOR-05](/configuration-system/configuration-storage-layering-srs#uc-stor-05)：Policy 覆盖场景  
- [UC-ACC-01](/configuration-system/configuration-access-update-srs#uc-acc-01)：扩展读取自身设置并响应变更  
- [UC-ACC-03](/configuration-system/configuration-access-update-srs#uc-acc-03)：写入语言特定设置  
- [UC-UI-01](/configuration-system/configuration-settings-ui-srs#uc-ui-01)：用户通过 UI 修改设置  
- [UC-UI-04](/configuration-system/configuration-settings-ui-srs#uc-ui-04)：企业策略下的锁定设置  

## 质量与实践基线
- **一致性**：同一 scope + Setting ID 在 UI/JSON/API 中值一致；变更必触发 `onDidChangeConfiguration`，`affectsConfiguration` 正确过滤。
- **性能**：常用配置读取基于内存模型，目标不阻塞冷启动；`getConfiguration`/`inspect` 热路径低延迟，Settings UI 操作即时反馈。
- **可靠性/容错**：settings.json 损坏时保留上次可用模型并提示；写入必须原子且在失败时不触发事件。
- **安全/合规**：Policy 层不可绕过；machine/machine-overridable 设置不同步；外部系统写入须走统一校验。
- **可用性**：Settings UI 支持 scope 切换、`@modified`/扩展/语言过滤；空态/错误态有清晰提示，A11y 友好。

## 怎么用
- **产品/架构评审**：以 Core/Storage/Access SRS 校验平台事实，SDD 参考实现模式与演进。
- **扩展作者**：按 Declaration → Access → Settings UI 顺序验证声明、API、呈现一致性，结合用例与代码片段自测。
- **企业/平台工程**：基于 Policy 与 Sync 约束设计组织策略与同步策略，复核 UI 锁定行为。
- **QA/文档**：据用例 ID 与质量基线设计回归矩阵，覆盖多根/Remote/Profile/Policy 场景与 UI/JSON 双栖行为。
