# URI 与外部链接软件设计说明书（平台供给域 SDD）

本 SDD 以平台供给视角给出外部入口的设计建议：入口路由、参数验证、安全、Remote/Web 重写，以及向各消费方（Tree/Editor/Webview/Terminal/Debug 等）的接口模式。消费细节在各域展开，Tree 深链实现见 Tree 章节。

## 1. 设计目标
- **跨环境可用**：同一入口可在 Desktop/Remote/Web/Codespaces 正常解析；统一使用 `uriScheme`，必要时 `asExternalUri` 重写。  
- **安全可信**：参数白名单、签名/一次性 token、破坏性操作确认，防止注入与静默执行。  
- **解耦可扩展**：Handler 只负责解析/路由；消费方通过命令/Service 适配，便于新增 Editor/Webview/Tree 等落点。

## 2. 参考架构
```
外部 URI → Handler → 入口路由器 (解析+匹配 action/view) 
         → 验证器 (签名/必填/类型/幂等)
         → 调度器 (commands/Service 调用) 
         → 消费方适配器 (Tree/Editor/Webview/Terminal/Debug)
         → 结果/反馈 (提示、遥测、清理敏感数据)
```
- 入口路由器：按 `path`/`query` 映射到动作（open/reveal/auth/...）。  
- 验证器：白名单字段、签名/nonce 检查、过期校验。  
- 调度器：执行命令或直接调用 Service，禁止在 Handler 中长时间 IO。  
- 消费方适配器：在各域实现（Tree 见 UC-TREE-06），统一使用命令/Service 而非直接操作 UI。

## 3. 关键设计要点
### 3.1 入口与路由
- 使用 `URL/URLSearchParams` 解析，拒绝未知字段，保留 `action`/`view`/`id`/`filters` 等标准键。  
- 采用表驱动路由：action -> handler 函数，便于扩展/测试。  
- 对无效 action/必填缺失，立即提示并返回。

### 3.2 安全与信任
- 认证/授权：推荐在 query 携带签名/一次性 token，并校验过期/nonce。  
- 破坏性操作（删除/推送）必须在消费方前弹确认对话框；Handler 层也可加“高风险”标识。  
- 敏感信息清理：处理完毕后清理内存中的 token/临时状态；避免写入日志。

### 3.3 Remote/Web 策略
- 生成对外链接时调用 `asExternalUri`，使用重写后的 URI 分发；客户端环境差异由平台处理。  
- 对需要回环的 OAuth/设备登录流程，始终提供 `asExternalUri` 后的可访问 URL。  
- 不假设多窗口广播；如需同步，使用存储/消息通道。

### 3.4 消费方适配（模式）
- **Tree**：使用 Service 查找节点+父链，调用 `TreeView.reveal`，上下文键同步，详见 [Tree 深链协同 SDD](/tree-view/uri-handler-and-deep-links-sdd#uc-tree-06-bridge) 与 [UC-TREE-06](/tree-view/tree-view-srs#uc-tree-06)。  
- **Editor/SCM**：通过内置命令 `vscode.open`/`vscode.diff` 打开文件/PR/差异，避免自定义打开逻辑。  
- **Webview**：命令唤起面板并通过消息传递参数，防止直接在 Handler 中创建/操作 DOM。  
- **Terminal/Debug/Chat**：占位，可采用会话 ID + action 路由，触发对应命令。

## 4. 推荐实现清单
- **代码骨架（简化 TypeScript）**：
```ts
vscode.window.registerUriHandler({
  async handleUri(uri) {
    const url = new URL(uri.toString());
    const action = url.pathname.replace(/^\\//, '') || 'open';
    const params = Object.fromEntries(url.searchParams.entries());
    if (!allowList.has(action)) {
      return vscode.window.showErrorMessage(`不支持的 action: ${action}`);
    }
    if (!validate(params, action)) {
      return vscode.window.showErrorMessage('参数校验失败');
    }
    // 路由到命令/Service（消费方适配）
    await dispatch(action, params);
  }
});
```
- **路由表示例**：`reveal`→Tree Service；`open`→Editor 命令；`auth`→登录流程；`bulk`→队列化调度。  
- **验证函数**：必填字段、类型、签名/nonce 校验；记录遥测。

## 5. 反模式
- 在 Handler 中直接执行长 IO 或操作 UI；应异步 + 调度到命令/Service。  
- 硬编码 `vscode://` 或忽略 `asExternalUri`，导致 Remote/Web 链路不可用。  
- 将敏感 token 放入可共享 URI；对破坏性操作无确认。  
- 依赖复杂对象作为 `arguments` 在多窗口/重载后持久存在。

## 6. 质量基线与验证
- 链接可达：Desktop/Remote/Web 均能解析（验证 `asExternalUri` 重写后仍可访问）。  
- 安全：参数白名单、签名/一次性 token 校验，敏感信息不落盘；高风险操作有确认。  
- 性能：Handler 轻量，重 IO 交由 Service/命令；错误有提示。  
- 兼容性：命令激活依赖 `contributes.commands` 自动生成的 `onCommand`，旧引擎才显式声明。

## 7. 演进方向
- 提供 SDK/工具函数封装常见入口动作（open/reveal/auth/bulk），降低扩展重复工作。  
- 统一跨消费方（Tree/Editor/Webview/Terminal/Debug 等）的 action 约定与权限模型。  
- 增强多实例/多租户路由策略，避免链接误投。 
