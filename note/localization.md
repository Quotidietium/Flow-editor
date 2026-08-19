# 全面汉化与外部链接移除设计文档

> 版本：2.0.74｜改造时间：2026-08-20
> 目标：界面文案全面汉化；UI 中的外部链接全部移除

## 1. 外部链接移除清单

原则与 2.0.69 隐私精简一致：**删除而非开关**。本次删除后，UI 中不再存在任何指向
本站以外域名的可点击元素。

| 位置               | 移除内容                                                       | 处理方式                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navbar             | GitHub 下拉菜单（mermaid / mermaid-live-editor / mermaid-cli） | 删除 `DropdownNavMenu.svelte` 组件及引用                                                                                                                         |
| 主菜单             | Mermaid.js、Documentation、Community (Discord) 三项            | 删除菜单项；保留 新建/复制副本/深色模式                                                                                                                          |
| 编辑器卡片         | Docs 按钮（按图类型深链 mermaid.js.org）                       | 删除 `DiagramDocumentationButton.svelte`、`docMap.spec.ts`、`TID.diagramDocumentationButton`、`DocumentationConfig` 类型、`standardizeDiagramType`（唯一消费者） |
| /embed 页脚        | "Powered by Mermaid"（指向文档站）                             | 删除；保留站内「编辑」链接并汉化                                                                                                                                 |
| URL 加载失败示例图 | `click D href "https://github.com/…issues"` 可点击交互         | 删除 click 行，图内文字汉化                                                                                                                                      |
| env                | `docsUrl`（最后一个外链配置）                                  | 删除 `util/env.ts`、`.env` 的 `MERMAID_DOCS_URL`；CLAUDE.md 同步                                                                                                 |

**保留的非外链项**（复核确认）：

- 站内链接：`/edit`、`/view`、History 的「在新标签页打开」（`/edit#pako:`）、
  Share 对话框、错误页「返回首页」、embed 页脚「编辑」
- `xmlns:xlink="http://www.w3.org/1999/xlink"`（SVG 命名空间标识符，非超链接）
- 代码注释中的参考 URL（stackoverflow workaround、上游源码出处等，不可点击）

## 2. 汉化范围

### 2.1 已汉化

- **壳层**：`app.html`（`lang="zh-CN"`、标题、meta description）、PWA
  `manifest.json`（名称/描述）
- **品牌**：「Flow 编辑器」（导航栏、分享对话框、favicon alt）
- **编辑页**：代码/配置标签、移动端 编辑/预览 开关、历史记录/可视化 切换
- **主菜单**：新建、复制副本、深色模式
- **示例图表卡片**：卡片标题 + 33 个图类目中文名（映射表 + 未映射回退原名；
  Record key 来自 `@mermaid-js/examples`，代码路径保持英文不动，仅显示层映射）
- **操作卡片**：操作、PNG 尺寸、自动/宽度/高度、复制图像
- **分享对话框**：全量（分享链接/嵌入/主题/外观/宽度/高度/浅色/深色/控件/网格/
  预览/iframe/Web 组件/嵌入预览 + 隐私说明）
- **历史面板**：已保存/时间线/修订版本标签、空态提示、toast（保存重复/导入统计）、
  清空确认、全部按钮 title 与 aria-label
- **工具栏**：重置视图、放大、缩小、全屏、手绘风格、背景网格、切换主题
- **编辑器错误条**：语法错误
- **/embed 页**：页面标题、错误卡片（含「创建新图表」站内链接）、明暗切换 title、页脚
- **默认示例图**：圣诞节/拿到压岁钱/去购物/让我想想/笔记本电脑/iPhone/新车
- **URL 加载失败示例图**：整图汉化
- **动态消息**：`sanitizeConfig` 确认弹窗、embed 哈希解析失败文案、复制失败 toast

### 2.2 刻意不汉化（决策记录）

| 类别                                                             | 理由                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `console.*` / 调试信息                                           | 开发者面信息，保留英文便于排障与检索           |
| mermaid 库解析错误文本（如 `Error: Trying to checkout branch…`） | 库输出，非本项目文案；e2e 断言保留原文         |
| `@mermaid-js/examples` 示例代码与其标题                          | 外部包内容（内容级而非界面级），仅类目按钮汉化 |
| 导出文件名（`mermaid-diagram-*.png` 等）                         | 生成物而非 UI；避免跨平台/命令行场景编码问题   |
| 主题/外观枚举值（default/forest/classic…）                       | 配置值，写入序列化状态，翻译会破坏配置语义     |
| 技术名词（iframe、Web 组件、Mermaid、ZenUML、PNG/SVG）           | 惯例保留原文                                   |

## 3. 测试适配

- **单测**：serde 内联快照随默认图更新（round-trip 断言不变）；
  `migrations`/`visualEditor` 测试中的英文图文本为自构造测试数据，不改
- **e2e**：页面对象（操作/示例图表/代码/配置/主题 title）与各 spec 的
  角色名、toast、类目名、默认图标签全部同步中文断言；
  `docMap.spec.ts` 随 Docs 按钮删除
- **陷阱记录**：`checkTheme` 的 title 语义是「将切换到的目标主题」
  （浅色当前 → 显示 深色），汉化时曾把方向搞反，已修正并复跑

## 4. 验证记录（2026-08-20，本机 Windows 11）

| 验证项                           | 结果                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| svelte-check                     | 0 错误 0 警告                                                         |
| eslint / prettier（src + tests） | 通过                                                                  |
| 单元测试                         | 125 通过；15 个失败为本机预存 localStorage 问题（与 2.0.67 基线一致） |
| 全量 e2e（单 worker）            | 39 通过 / 3 预存 skip / 0 失败（含 noNetwork 零外联守卫）             |
| 外链 grep 复核                   | UI 模板零外部 href；仅剩注释与 SVG 命名空间                           |

> 版本变更汇总见 [release/2.0.74.md](release/2.0.74.md)
