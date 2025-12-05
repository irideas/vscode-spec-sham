import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'VSCode Tree View 规格站',
  description: '假装 Visual Studio Code 官方开发团队的 Tree View 规格与设计文档站',
  base: '/vscode-spec-sham/',
  lastUpdated: true,
  themeConfig: {
    nav: [
      {
        text: 'VSCode Tree View 生态的规格文档',
        link: '/vscode-tree-view-spec/'
      }
    ],
    sidebar: {
      '/vscode-tree-view-spec/': [
        {
          text: 'VSCode Tree View 生态的规格文档',
          items: [
            { text: 'Tree View 主域 - SRS', link: '/vscode-tree-view-spec/tree-view-srs' },
            { text: 'Tree View 主域 - SDD', link: '/vscode-tree-view-spec/tree-view-sdd' },
            { text: 'Workbench 视图与容器 - SRS', link: '/vscode-tree-view-spec/workbench-views-and-containers-srs' },
            { text: 'Workbench 视图与容器 - SDD', link: '/vscode-tree-view-spec/workbench-views-and-containers-sdd' },
            { text: 'Commands / Menus / Keybindings - SRS', link: '/vscode-tree-view-spec/commands-menus-and-keybindings-srs' },
            { text: 'Commands / Menus / Keybindings - SDD', link: '/vscode-tree-view-spec/commands-menus-and-keybindings-sdd' },
            { text: 'Activation & Context System - SRS', link: '/vscode-tree-view-spec/activation-and-context-system-srs' },
            { text: 'Activation & Context System - SDD', link: '/vscode-tree-view-spec/activation-and-context-system-sdd' },
            { text: 'Configuration & Settings - SRS', link: '/vscode-tree-view-spec/configuration-and-settings-srs' },
            { text: 'Configuration & Settings - SDD', link: '/vscode-tree-view-spec/configuration-and-settings-sdd' },
            { text: 'URI Handler & Deep Links - SRS', link: '/vscode-tree-view-spec/uri-handler-and-deep-links-srs' },
            { text: 'URI Handler & Deep Links - SDD', link: '/vscode-tree-view-spec/uri-handler-and-deep-links-sdd' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/placeholder/vscode-spec-sham' }
    ],
    footer: {
      message: '为 VSCode Tree View 生态编写的规格与设计指南（模拟版）',
      copyright: '以开放协作为目标的内部模拟文档'
    }
  }
})
