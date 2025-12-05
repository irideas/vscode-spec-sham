# vscode-spec-sham

基于 VitePress 构建的「假装 Visual Studio Code 官方开发团队」规格与设计文档站。

## 本地运行

1. 确认 Node.js 版本：项目默认使用 `.nvmrc` 中的 `v20.19.6`。如未安装，可通过 `nvm install` 或 NodeSource 脚本安装 Node.js 20，再执行 `nvm use` 保持版本一致。
2. 安装依赖：仓库提供 `.npmrc`，默认将 registry 指向 `registry.npmmirror.com` 并关闭严格证书校验。执行 `npm install` 前若遇到代理拦截（返回 403），可尝试临时清空 `HTTP_PROXY/HTTPS_PROXY`，或改为可访问的内网 npm 源后再重试；若网络完全隔离，可先准备离线包再使用 `npm ci --offline --cache <本地缓存目录>`。
3. 启动开发服务器：`npm run docs:dev`。
4. 构建静态站点：`npm run docs:build`，并可通过 `npm run docs:preview` 预览。
5. 部署到 GitHub Pages：运行 `npm run docs:deploy`，脚本会构建文档、写入 `.nojekyll` 并用 `gh-pages` 将 `docs/.vitepress/dist` 推送至 `gh-pages` 分支；发布仓库 Pages 时，需将来源设置为该分支根目录，且确保 `docs/.vitepress/config.ts` 中的 `base` 为 `/vscode-spec-sham/`。

> 若处于无法访问 npm 官方/镜像源的网络环境，请根据实际可用的代理或离线包管理方式，手动提供 `vitepress` 依赖后再执行上述步骤。
