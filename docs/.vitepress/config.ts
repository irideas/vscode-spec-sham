import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'VS Code 规格与设计',
  description: '以“假装 Visual Studio Code 官方团队”的身份，汇总关键能力的事实需求（SRS）与设计指导（SDD）',
  base: '/vscode-spec-sham/',
  lastUpdated: true,
  appearance: false,
  themeConfig: {
    nav: [
      {
        text: 'Tree View 生态',
        link: '/tree-view/'
      },
      {
        text: '外部入口与集成',
        link: '/external-entry/'
      }
    ],
    sidebar: {
      '/tree-view/': [
        {
          text: 'Tree View 生态',
          items: [
            { text: '章节总览', link: '/tree-view/' }
          ]
        },
        {
          text: '核心 API｜Tree View 主域',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/tree-view-srs' },
            { text: '设计指导 SDD', link: '/tree-view/tree-view-sdd' }
          ]
        },
        {
          text: 'Workbench 视图与容器',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/workbench-views-and-containers-srs' },
            { text: '设计指导 SDD', link: '/tree-view/workbench-views-and-containers-sdd' }
          ]
        },
        {
          text: '命令 / 菜单 / 快捷键',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/commands-menus-and-keybindings-srs' },
            { text: '设计指导 SDD', link: '/tree-view/commands-menus-and-keybindings-sdd' }
          ]
        },
        {
          text: '激活与上下文系统',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/activation-and-context-system-srs' },
            { text: '设计指导 SDD', link: '/tree-view/activation-and-context-system-sdd' }
          ]
        },
        {
          text: '配置与设置',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/configuration-and-settings-srs' },
            { text: '设计指导 SDD', link: '/tree-view/configuration-and-settings-sdd' }
          ]
        },
        {
          text: 'URI Handler 与深链',
          items: [
            { text: '事实需求 SRS', link: '/tree-view/uri-handler-and-deep-links-srs' },
            { text: '设计指导 SDD', link: '/tree-view/uri-handler-and-deep-links-sdd' }
          ]
        }
      ],
      '/external-entry/': [
        {
          text: '外部入口与集成',
          items: [
            { text: '章节总览', link: '/external-entry/' }
          ]
        },
        {
          text: 'URI 与外部链接',
          items: [
            { text: '事实需求 SRS', link: '/external-entry/uri-and-links-srs' },
            { text: '设计指导 SDD', link: '/external-entry/uri-and-links-sdd' }
          ]
        },
        {
          text: '安全与信任（占位）',
          items: [
            { text: '事实需求 SRS', link: '/external-entry/auth-and-trust-srs' },
            { text: '设计指导 SDD', link: '/external-entry/auth-and-trust-sdd' }
          ]
        },
        {
          text: 'Remote/Web 路由（占位）',
          items: [
            { text: '事实需求 SRS', link: '/external-entry/remote-routing-srs' },
            { text: '设计指导 SDD', link: '/external-entry/remote-routing-sdd' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/irideas/vscode-spec-sham' }
    ],
    footer: {
      message: 'VS Code 关键能力规格与设计指南（模拟版）',
      copyright: '以开放协作为目标的内部模拟文档'
    }
  }
})
