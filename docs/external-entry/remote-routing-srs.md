# 远程/浏览器路由 SRS（占位）

> 占位文件：列出 Remote/Web/Codespaces 下 URI 重写的事实要点，后续按需补充。

## 需覆盖的事实要点
- `vscode.env.asExternalUri` 在 Remote/Tunnel/Codespaces 下的行为：端口/authority 重写。
- 不同产品线的 `uriScheme` 可能不同（vscode/vscode-insiders/web）。
- 客户端可访问性与跨实例/多窗口路由的约束（待补充）。
