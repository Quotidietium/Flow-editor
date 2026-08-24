# Flow 编辑器（Flow-editor）

画图、实时预览、分享 Mermaid 图表的**全离线**编辑器。本仓库是
[mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor)
的 Fork：深度汉化，并扩展了可视化编辑器、插件系统与 Windows 桌面版。

## 许可证与 Fork 说明（License & Fork Notice）

本项目（**Flow 编辑器 / Flow-editor**）Fork 自上游 MIT 许可项目
[mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor)。

- 本仓库自身的代码以 **Apache License 2.0** 授权（见
  [LICENSE](./LICENSE)）；
- **源自上游的原始代码仍受其原 MIT 版权声明约束**（版权人 Knut
  Sveidqvist 及上游贡献者），原许可证全文与版权声明保留于
  [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES)。

This repository is forked from the upstream MIT-licensed project
[mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor).
Code originating from the upstream project remains governed by its original
MIT copyright notice (full text preserved in
[THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES)); code added by this fork is
licensed under Apache-2.0 (see [LICENSE](./LICENSE)).

## 特性

- **全离线**：无埋点、无外部渲染服务、零自主网络请求（`tests/noNetwork.spec.ts`
  守卫）；图表内容永不离开浏览器
- **实时编辑**：代码/配置双编辑器 + 实时预览，支持 Mermaid 全部图类型；
  URL 即分享（状态压缩进 hash，链接即完整图表）
- **可视化编辑**：31 类图全部可编辑——节点-边族用类 draw.io 画布
  （多选/撤销/正交路由/AutoConnect），分组列表/记录表格/缩进大纲/时序/git
  各有专用编辑器
- **插件系统**：输入管道、文件导入、导出格式、主题、整页前端替换、MCP 桥
  六个扩展点（钩子错误隔离，三振自动停用）；内置「MC 进度设计器」——画
  流程图导出 Minecraft Paper 成就插件（Maven 工程 zip；桌面版一键编译
  .jar，需用户自装 JDK 21+）
- **桌面版**：`installer/` 产出 Windows NSIS 安装包，最终用户零前置依赖；
  内嵌 MCP HTTP 服务（默认关闭、仅回环）供本地 AI 客户端直连
- **界面全面汉化**；PWA 离线可用

## 环境要求

- [Node.js](https://nodejs.org/) ≥ 24.16
- [pnpm](https://pnpm.io/) 包管理器（`corepack enable pnpm`）

## 开发

```sh
pnpm install
pnpm dev -- --open   # http://localhost:3000
```

Windows 可直接运行 `start.ps1`（自动引导 pnpm 与依赖安装），
Git Bash / Linux / macOS 用 `./start.sh`——详见 `note/start-script.md`。

开发者 API 参考见根目录 [`API.md`](./API.md)；设计文档与各版本改动记录在
[`note/`](./note/)（每版一份 `note/release/<版本号>.md`）；Windows 安装包
构建见 [`installer/README.md`](./installer/README.md)。

## Docker

```bash
# 开发态（源码挂载 + 热重载）
docker compose up --build        # http://localhost:3000

# 生产镜像（静态站点 + nginx）
docker build -t flow-editor .
docker run --detach --name flow-editor --publish 8080:8080 flow-editor
# 访问 http://localhost:8080 ；停止：docker stop flow-editor
```

> 本 Fork 已移除外部渲染（mermaid.ink / Kroki）、统计埋点与商业推广的全部
> 构建期配置；镜像内只有静态站点本身，无任何外部服务依赖。
> CI 会把 `master` 构建为 `latest`、`develop` 构建为 `nightly` 推送到本仓库
> 的 ghcr.io 镜像。

## 发布

- 版本号见 `package.json`；每版改动记录于 `note/release/<版本号>.md`
- GitHub Release（Tag = 版本号）附 `installer/build.ps1` 产出的 Windows
  安装包 `Flow-Editor-Setup-<版本>.exe`（SMOKE 全链路验证后发布）

## 致谢

本项目基于 [mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor)
构建，感谢上游作者 Knut Sveidqvist、mermaid-js 社区及全体贡献者。
