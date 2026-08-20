# 可视化编辑器（Visual Editor）设计文档

> 版本：2.0.68｜创建时间：2026-08-19
> 功能：Draw.io / Visio 式图形化编辑 → 实时生成 Mermaid 源代码

## 1. 功能概述

**所见即所得（WYSIWYG）**：导航栏的 **Visual** 开关把可视化编辑器切换进右侧的大预览区（左侧 Code/Config 编辑区保持不变）。用户直接在预览区的画布上用鼠标编辑图形，编辑器实时生成 Mermaid flowchart 源代码，并通过项目唯一的状态网关 `updateCode()` 同步——切回预览即见渲染结果，URL 分享链接、localStorage 持久化全部自动生效。

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
src/routes/(app)/edit/+page.svelte        右栏预览/可视化切换（visualMode 本地状态 + Navbar Toggle）
src/lib/components/Card/Tabs.svelte       Tab 增加可选 testID 透传
tests/visualEditor.spec.ts                Playwright e2e（2 个用例，全绿）
src/lib/util/visualEditor/model.test.ts   单元测试（15 个用例，全绿）
```

### 2.1 状态同步设计（关键决策）

- **写路径**：所有图形操作最终调用 `syncCode()` → `updateCode(generateCode(graph), {updateDiagram: true})`（`state.svelte.ts` 的唯一变更网关）。拖拽期间不触发，仅在 pointerup / 提交编辑时同步一次。
- **读路径**：进入可视化模式（VisualEditor 挂载）时 `parseFlowchart(validatedState.current.code)` 导入现有代码（位置由 `layoutGraph` 重排——Mermaid 源码不携带坐标）。
- **布局**：编辑页右栏在 `View`（预览）与 `VisualEditor` 之间条件切换（`visualMode` 本地状态，Navbar Toggle 控制）；由于每次图形操作都即时同步代码，离开再进入可视化模式会经代码确定性还原图形。
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

- ~~仅支持 flowchart~~ → 2.0.75 起支持六类图（见下节「多图类型支持」）；gantt/pie 等非节点-边语义的图类型仍不可视化编辑（明确 toast 提示）
- 无画布内撤销/重做（依赖 History 时间线与「从代码重载」兜底）
- 连线为直线（无正交路由）；自动布局为简单分层（非 mermaid 级布局质量）
- subgraph 导入忽略；导出时节点全部平铺
- 时序图的 note/loop/alt 块、激活条等解析时跳过（skipped 计数）；类图命名空间（A.B）不支持
- ER 图无属性且无连线的「孤立实体」不参与代码生成（mermaid ER 语法中实体由关系或属性块声明）

## 5. 多图类型支持（2.0.75）

可视化编辑器通过「图表类型适配层」支持全部节点-边语义的图类型：

| 类型     | kind      | 解析                                                   | 生成                                  | 特有能力                                                              |
| -------- | --------- | ------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------- |
| 流程图   | flowchart | ✅（原有）                                             | `flowchart TD`                        | 4 形状循环、3 线型、TD/LR                                             |
| 时序图   | sequence  | participant/actor 声明 + 消息行                        | 参与者单行布局，消息按边创建顺序输出  | 4 种箭头（实/虚 × 实心/开），actor=圆角形状                           |
| 类图     | class     | class 块（成员/注释行）、7 种关系、带引号基数          | `class ID["Label"] { … }`、关系含基数 | 成员详情编辑（detail），组合/聚合源端菱形标记                         |
| 状态图   | state     | `[*]` 起止伪节点、`state "x" as id`、描述行、direction | 起点边置顶、`X : 描述`                | 起点/终点按钮（实心圆/双圈），不可表达为 `[*]` 的连线在画布上禁止创建 |
| ER 图    | er        | 实体属性块、鸦脚基数（`                                |                                       | --o{`）                                                               | 关系行保留基数 | 基数循环（一对一/一对多/多对多…），基数沿线标注 |
| 思维导图 | mindmap   | 缩进树（id 前缀剥离、4 种定界符）                      | 按边重建树输出缩进                    | 形状映射 rect`[]`/round`()`/stadium`(())`/diamond`{{}}`               |

架构要点：

- `VGraph.kind` + `KIND_SPECS` 能力表（本地化名称、连线/形状调色板、方向/详情/起止开关）同时驱动工具栏与生成器；`parseCode`/`detectDiagramKind` 按首行关键字分发
- `VNode.detail`（类成员/ER 属性/状态描述）与 `special`（起止伪节点）；`nodeSize` 让几何随详情行数增长，贯穿布局/锚点/命中
- 每类图满足「往返不动点」：`generate(parse(generate(parse(code)))) === generate(parse(code))`（首次生成允许格式归一化，如时序图补 participant 声明行）；单测用真实 `mermaid.parse` 验证全部生成代码合法
- 类图基数必须带引号（`"1"`），否则 `A o-- B`（聚合）与裸基数产生语法歧义
- 时序图消息正则用惰性参与方量词：贪婪 `\S+` 会把 `Bob-->>Alice` 拆成 `Bob-` + `->>`
- 思维导图用原始缩进值弹栈建树（而非深度归一化），锯齿缩进也能得到良构树

已知取舍：

- 思维导图节点 id 前缀（`root((x))` 的 `root`）不入模型——结构由缩进树表达，往返后 id 丢弃
- 状态图 `-->` 仅一种线型（mermaid stateDiagram 无虚线转换），线型按钮隐藏
- e2e 用剪贴板粘贴输入代码：逐字符键入 `(` `)` 与 Monaco 状态同步存在竞态会丢键

## 6. 位置记忆——真正的所见即所得（2.0.76）

**问题**：Mermaid 源码不携带坐标，2.0.75 及之前每次切入 Visual 标签都会
`parse + layoutGraph` 全量自动布局——用户刚拖好的节点在每次切换后都跳回布局槽位，
产生明显的「重新渲染」感。

**方案**：按节点 id 记忆画布位置，叠加在自动布局之上：

- `model.applyPositions(graph, positions)`：纯函数，id 命中的节点用记忆位置，
  未命中（新增节点）保留自动布局槽位
- `VisualEditor` 维护位置表（模块内存 + localStorage 键 `visualEditorLayout`），
  在每次 `syncCode`（任何图形操作落盘时）与 `loadFromCode`（导入后）刷新
- 效果：**切换 Visual↔预览、刷新页面、在 Code 标签做小幅编辑**后位置全部稳定；
  全新的图（id 不重叠）自动布局一次属必要冷启动
- 「整理布局」重排后新位置立即成为记忆（用户显式要求的重排持久生效）；
  「清空」/删除节点会同步收缩记忆表

**取舍记录**：

- 位置不写入 Mermaid 代码（不产生 `%% pos` 之类机器注释污染分享链接），因此
  换一台浏览器/设备首次打开仍会自动布局一次——代码干净优先于跨设备位置漫游
- 两张不同图若节点 id 恰好重叠（如都有 N1），新图会沿用旧位置——罕见且无害，
  点「整理布局」即可重排

> 版本变更汇总见 [release/2.0.68.md](release/2.0.68.md)、[release/2.0.75.md](release/2.0.75.md)、[release/2.0.76.md](release/2.0.76.md)
