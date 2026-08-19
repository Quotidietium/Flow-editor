# 可视化编辑器（Visual Editor）设计文档

> 版本：2.0.68｜创建时间：2026-08-19
> 功能：Draw.io / Visio 式图形化编辑 → 实时生成 Mermaid 源代码

## 1. 功能概述

在编辑页新增第三个标签页 **Visual**（Code / Config / Visual）。用户在画布上通过鼠标完成图形化编辑，编辑器实时生成 Mermaid flowchart 源代码，并通过项目唯一的状态网关 `updateCode()` 同步——右侧预览、URL 分享链接、localStorage 持久化全部自动生效。

### 1.1 画布操作（类 Draw.io）

| 操作         | 方式                                                                               |
| ------------ | ---------------------------------------------------------------------------------- |
| 新建节点     | 双击画布空白处 / 工具栏「节点」按钮                                                |
| 移动节点     | 按住节点拖拽（10px 网格吸附）                                                      |
| 创建连线     | 选中节点后，从边缘圆点（锚点）拖到目标节点                                         |
| 编辑节点文字 | 双击节点 → 行内输入框（Enter 确认 / Esc 取消）                                     |
| 编辑连线文字 | 双击连线                                                                           |
| 切换节点形状 | 选中节点 → 工具栏「形状」循环：矩形 `[x]` → 圆角 `(x)` → 胶囊 `([x])` → 菱形 `{x}` |
| 切换线型     | 选中连线 → 工具栏「线型」循环：箭头 `-->` → 直线 `---` → 虚线 `-.->`               |
| 删除         | 选中节点/连线后按 Delete/Backspace 或工具栏「删除」                                |
| 方向切换     | 工具栏「方向 TD/LR」                                                               |
| 自动布局     | 工具栏「整理布局」（Kahn 分层布局）                                                |
| 导入现有代码 | 进入 Visual 标签自动解析当前 flowchart；工具栏「从代码重载」手动重载               |
| 撤销误操作   | 「清空」/「从代码重载」可恢复；History 时间线持续自动快照（60s）兜底               |

节点上的连线会随节点删除自动清理；画布支持滚动（3000×2000 世界坐标），网格背景。

## 2. 代码架构

```
src/lib/util/visualEditor/model.ts        纯逻辑层（无 DOM，100% 单测覆盖）
  ├─ VNode / VEdge / VGraph               数据模型
  ├─ generateCode(graph)                  模型 → Mermaid 源码（确定性输出）
  ├─ parseFlowchart(code)                 源码 → 模型（尽力解析，统计跳过行）
  ├─ layoutGraph(graph)                   Kahn 分层自动布局（环追加在末层）
  ├─ edgeAnchor(a, b)                     连线边框到边框锚点几何（AABB 参数裁剪）
  └─ sanitizeLabel / nextNodeId ...       标签消毒、ID 生成

src/lib/components/VisualEditor.svelte    画布组件（SVG，Svelte 5 runes）
src/routes/(app)/edit/+page.svelte        Visual 标签集成（activeTab 本地状态）
src/lib/components/Card/Tabs.svelte       Tab 增加可选 testID 透传
tests/visualEditor.spec.ts                Playwright e2e（2 个用例，全绿）
src/lib/util/visualEditor/model.test.ts   单元测试（15 个用例，全绿）
```

### 2.1 状态同步设计（关键决策）

- **写路径**：所有图形操作最终调用 `syncCode()` → `updateCode(generateCode(graph), {updateDiagram: true})`（`state.svelte.ts:257` 的唯一变更网关）。拖拽期间不触发，仅在 pointerup / 提交编辑时同步一次。
- **读路径**：进入 Visual 标签时 `parseFlowchart(validatedState.current.code)` 导入现有代码（位置由 `layoutGraph` 重排——Mermaid 源码不携带坐标）。
- **双向一致性**：组件常驻挂载（edit 页用 `hidden` class 切换而非销毁，Monaco 与图状态跨标签保留）；`active` 变为 true 且代码与上次同步不同（用户在 Code 标签改过）时自动重新导入。
- **往返稳定性**：`generateCode → parseFlowchart → generateCode` 不动点（单测覆盖）；标签含括号等特殊字符时生成 `"引号形式"`，解析时剥引号还原。

### 2.2 解析器能力边界（尽力而为）

支持：`flowchart|graph + TD/TB/BT/LR/RL` 头、`A[label]`/`A(label)`/`A{label}`/`A([label])`、裸 ID、链式 `A-->B-->C`、`|标签|`、文本式 `-- text -->` / `-. text .->`、`;` 分隔、`%%` 注释、引号标签。

跳过并计数（UI 提示）：subgraph 块（内容整体忽略）、style/classDef/class/click/linkStyle/title 等指令行。不支持 `&` 分叉（解析为独立节点声明）。非 flowchart 代码（如 sequenceDiagram）→ 空画布 + toast 提示，原代码不丢失。

## 3. 测试与验证记录（2026-08-19，本机 Windows 11）

| 验证项                                                                                                                                                                 | 结果          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 单元测试 model.test.ts（生成/解析/往返/布局/锚点/消毒/ID）                                                                                                             | 15/15 通过    |
| Playwright e2e「generates flowchart code」：建节点→输入标签→拖锚点连线→`N1 --> N2` 生成→预览渲染 Start/End→点选中边→Delete 删除→切回 Code 标签→localStorage 含生成代码 | 通过          |
| Playwright e2e「imports the existing flowchart code」：默认示例图导入→节点选中→形状循环往返 `A(Christmas)`                                                             | 通过          |
| svelte-check                                                                                                                                                           | 0 错误 0 警告 |
| eslint / prettier（新增与改动文件）                                                                                                                                    | 通过          |

已知预存问题（与本功能无关）：本机 vitest 运行 persist/migrations/state/historyState 等 localStorage 依赖测试时 `window.localStorage` undefined（干净 HEAD 同样失败 15 个；CI Linux 通过）。

### e2e 编写经验（踩坑记录）

1. 项目 Playwright 配置中 `devices['Desktop Chrome']` 的 **1280×720 视口在 project 级覆盖**顶层 1920×1080——画布类测试需 `test.use({viewport})` 显式声明
2. 冷启动 dev server 首次访问会触发 Vite 依赖预优化的**整页 reload**，需二次导航预热（CI 用生产构建无此问题）
3. 画布交互用 `boundingBox()` + `page.mouse.*`（视口绝对坐标），避免元素级 actionability 断言误判
4. SVG 图标名必须先查 `@iconify-json/material-symbols/icons.json`（如 `auto-fix-rounded` 不存在，`auto-fix-normal-outline-rounded` 才存在），否则整页构建失败

## 4. 局限与后续方向

- 仅支持 flowchart（覆盖最常用场景）；mindmap/sequence 等图形语义差异大，未纳入
- 无画布内撤销/重做（依赖 History 时间线与「从代码重载」兜底）
- 连线为直线（无正交路由）；自动布局为简单分层（非 mermaid 级布局质量）
- subgraph 导入忽略；导出时节点全部平铺

> 版本变更汇总见 [release/2.0.68.md](release/2.0.68.md)
