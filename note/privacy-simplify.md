# 隐私精简改造（移除广告与联网内容）

> 版本：2.0.69｜改造时间：2026-08-20
> 目标：移除所有广告与自主联网行为，保证安全与简约——编辑器完全本地化运行

## 1. 改造原则

- **零自主网络请求**：页面加载、编辑、渲染、分享、嵌入全程不发起任何外部请求（保留的仅是用户主动点击的文档/Discord/GitHub 超链接）
- **删除而非开关**：商业与埋点代码整体移除（不是置空环境变量），缩小攻击面与包体
- **本地功能全部保留**：编辑/预览、可视化编辑器、PNG/SVG 导出（本地 canvas）、URL 分享、嵌入组件、历史时间线、PWA 离线

## 2. 移除清单（18 个文件删除 + 全部引用清理）

| 类别               | 移除内容                                                                                                                                                 | 涉及                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 埋点统计           | Plausible 全套（`stats.ts`、所有 `logEvent`/埋点点）                                                                                                     | 15 个组件                                                    |
| 商业推广           | Mermaid Chart 集成：Save diagram、AI Repair、行内 AI 提示浮层（AIPromptPopup/ViewZoneManager）、Enhanced Edits 轮播、Playground/Plugins 菜单项、结算链接 | `McWrapper`、`MermaidChartIcon` 等                           |
| 推广横幅           | 日期区间 banner（April2025/JS2026）与 `promos/` 体系                                                                                                     | Navbar                                                       |
| 编辑器选择弹窗     | mermaid.ai 引流 Modal（`migration/` 目录、`domainMigration.ts`）                                                                                         | edit 页                                                      |
| 外部渲染服务       | mermaid.ink PNG/SVG 链接、Kroki 链接、Copy Markdown                                                                                                      | Actions                                                      |
| URL 远程加载       | `?code=`/`?config=`/`?gist=` 文件加载器（`fileLoaders/`）                                                                                                | util.ts                                                      |
| 运行时 schema 拉取 | Monaco 对 mermaid.js.org 的 config.schema.json 请求 → 关闭（`enableSchemaRequest:false`，保留本地语法校验）                                              | DesktopEditor                                                |
| CDN 字体引用       | 导出 SVG 中的 cdnjs FontAwesome 样式表链接                                                                                                               | Actions（注：编辑器内 FA 图标渲染本就来自本地 npm 包，保留） |
| 隐私声明弹窗       | 依赖已删功能的 Privacy 弹窗                                                                                                                              | VersionSecurityToolbar                                       |
| 环境变量           | `.env` 仅剩 `MERMAID_DOCS_URL`、`MERMAID_BASE_PATH`；`env.ts` 缩为单项                                                                                   | env.ts                                                       |

默认示例图的 `fa:fa-car Car` 节点改为 `New car`（FA 语法保留支持，示例不再引导图标用法）。

## 3. 验证记录（2026-08-20，本机 Windows 11）

| 验证项                                                                                                             | 结果                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **新增 noNetwork e2e**：/edit 加载 + 标签切换 + 可视化编辑加节点 + Share 对话框，断言**非 localhost 请求数组为空** | ✅ 通过                                                                                    |
| **noNetwork e2e**：/embed 加载渲染，断言零外部请求                                                                 | ✅ 通过                                                                                    |
| 全量 e2e（10 个 spec 文件）                                                                                        | ✅ 42 通过 / 3 预存 skip / 0 失败                                                          |
| scrub unsafe config 安全测试（改走 URL hash 触发同一 confirm 消毒路径）                                            | ✅ securityLevel/secure/XSS 注入被剥离                                                     |
| 单元测试                                                                                                           | 99 通过；15 个失败为**本机预存问题**（localStorage 相关，干净基线同样失败，CI Linux 通过） |
| svelte-check / eslint / prettier                                                                                   | ✅ 0 错误 0 警告 / 通过                                                                    |
| serde 快照                                                                                                         | 随默认图变更更新（-u），往返一致性保持                                                     |

## 4. 测试适配说明

- `loadSite` scrub 测试原先借道 `?code=data:...` URL 加载器（已移除）→ 改为 URL hash 加载不安全配置，覆盖同一 `sanitizeConfig` confirm 消毒链路；并因暗色主题联动注入 `theme:'default'` 的时序竞态，将严格 `toEqual` 放宽为安全字段逐项断言
- `actions`/`errorDisplay`/`test.ts`：移除 markdown 复制、gist 输入、AI Repair 断言
- `diagramUpdate`/`loadSite`：默认图文本 `fa:fa-car Car` → `New car` 同步
- e2e 视口注意：项目 project 级 `devices['Desktop Chrome']`（1280×720）覆盖顶层 1920×1080；画布类测试需 `test.use({viewport})`

## 5. 保留的联网能力（均为用户主动点击跳转，非自主请求）

- 主菜单：Mermaid.js 文档、Documentation、Community (Discord)、GitHub 链接
- 嵌入页脚 "Powered by Mermaid"（指向 docsUrl）与 "Edit"（本站 /edit）
- `env.docsUrl` 可在构建时指向自托管文档

## 6. 残余说明

- PWA service worker 保留（纯本地缓存，增强离线能力）
- `random-word-slugs`/`uuid`/`dayjs` 等本地依赖保留
- 若需彻底离线（含文档链接），可将 `MERMAID_DOCS_URL` 指向内网地址

> 版本变更汇总见 [release/2.0.69.md](release/2.0.69.md)
