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

- ~~仅支持 flowchart~~ → 2.0.75 起支持六类图；~~gantt/pie 等非节点-边语义的图类型仍不可视化编辑~~ → **2.0.85 起全部图类型支持**（见 §7；仅 `info` 调试图无内容可编辑）
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

## 7. 全部图类型支持（2.0.85）

**目标**：mermaid 注册表中的每一个用户可编辑图类型都能进入可视化编辑。
以 `@mermaid-js/examples` 全部 31 个类目 + 应用注册的 zenuml 外部图为基准
逐一验证 `mermaid.parse` 通过后，新增 **25 个 kind**（`kinds.extra.ts`），连同原有 6 类共 **31 个 kind**
（42 种头关键字/变体，含 C4×5、railroad×4、packet/ishikawa/treemap 的 -beta 变体）。
唯一排除：`info` 调试图（仅渲染 mermaid 版本号，无任何用户内容可编辑）。

### 7.1 新增类型与建模方式

| 建模族           | 类型（kind）                                                                                          | 模型要点                                                                                                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 分组列表         | journey / timeline / kanban / gantt / cynefin / pie / packet / radar / xychart / venn / eventmodeling | 分组节点（section/period/column/domain）+ 结构边表达成员关系；`groupedEmit` 纯函数视图（分组序 + 边序 + 孤儿挂到最后一组/虚拟组）；无分组者按节点序输出                                                                                                                                                          |
| 缩进树           | treeview / treemap / ishikawa / swimlane                                                              | 复用思维导图的「原始缩进弹栈建树 + 按边重建缩进」机制；treemap 叶子值存 detail；ishikawa 首行即根（鱼骨主刺）                                                                                                                                                                                                    |
| 真节点-边        | sankey / requirement / block / c4 / architecture / git / zenuml                                       | sankey=CSV 边（值=边标签）；requirement=块字段+7 种关系；block=4 形状+columns 元数据（单行多声明按括号深度分片）；c4=25 种节点关键字+Rel 族（Boundary 展平跳过计数）；architecture=service/group/junction+`in` 成员边（端口双侧强制 `A:L --> R:B`）；git=提交重放（见下）；zenuml=参与者+消息（loop 块内容展平） |
| 坐标驱动 WYSIWYG | quadrant / wardley                                                                                    | 节点位置 ↔ `[x, y]` 双向映射（`COORD_MARGIN/AREA` 常数，2 位小数舍入）；**代码即位置记忆**——这两类跳过 localStorage 位置叠加，拖拽直接改写生成代码的坐标                                                                                                                                                         |
| 语法规则         | railroad（ebnf/abnf/peg/IR 四种头共用）                                                               | 规则名=节点、表达式原文=detail（`=` 与 `<-` 运算符存 roleData）；逐字节保留原文，往返不丢                                                                                                                                                                                                                        |

### 7.2 新增机制（组件侧）

- **节点类型按钮**：`KIND_SPECS[kind].nodeTypes` 调色板循环 `VNode.role`（+可选
  `roleData` 载荷，如 cynefin 的 5 个固定域名）；节点上方显示角色角标
- **属性对话框**：编辑图表级 `title` 与 `meta` 键（gantt dateFormat、quadrant
  轴/象限标签、radar min/max、block columns、wardley size）
- **canLink=false**：无连线语法的类型（pie/packet/radar/xychart/quadrant/venn/
  eventmodeling/git/railroad）隐藏锚点圆点并拦截连线手势——画了也不生效的边一律不给画
- **分组自动挂接**：选中分组节点（section/column/period/domain）再点添加，
  新节点自动挂到该组（结构边）；否则生成时落入最后一组
- **frontmatter 保留**：`--- … ---` 块逐字节保留并前置回显（kanban/radar/packet/
  treemap 官方样例均带 frontmatter）
- **不可信输入加固**：全部新解析器继承 >10k 字符单行跳过计数；坐标类把
  越界 `[x, y]` 夹取到 [0,1]；git 重放对悬空 merge 边降级为普通 commit

### 7.3 关键设计决策与踩坑记录

- **git 提交重放**：节点即提交（`roleData`=所在分支、merge 边 `roleData`=来源分支），
  生成按节点序重放 `branch/checkout/commit/merge`——`declared` 集合保证
  checkout 只指向已声明分支；删 merge 边自动降级，不产非法序列
- **radar 双命名空间**：官方样例中 axis `a["Art"]` 与 curve `a["Alice"]` 复用
  同一 token——内部 id 加 `AX_`/`CV_` 前缀隔离，生成时用 `roleData` 还原 token
- **kanban 缩进语义**：列表必须顶格、卡片缩进——生成与解析必须一致（曾因生成
  带缩进导致自我往返塌缩）；`@{ … }` 属性尾缀原样保留（单引号形式）
- **architecture 端口强制**：`A --> B` 无端口在 mermaid 中不合法，实测必须
  `A:L --> R:B`；新边默认 `L-->R`
- **eventmodeling/zenuml 标识符约束**：标签不允许空格——生成时非标识符字符
  归一为 `-`（文档化取舍）
- **block 单行多声明**：`ui["Web UI"] api["API"]` 按括号深度分片解析；
  `columns/space/边` 指令行先整行匹配再分片（否则 `columns 3` 会被拆碎）
- **分组↔分组边不是成员关系**：cynefin 域转换边（complex→complicated）曾被
  `groupedEmit` 误当成员输出——已排除「目标也是分组」的边
- **quadrant 象限标签键**：xLow/xHigh… 是轴元数据，象限标签只有 q1–q4 可
  生成 `quadrant-N` 行（曾把轴键也当象限输出非法语法）

### 7.4 测试与验证记录（2026-08-20，本机 Windows 11）

| 验证项                                                                                                                                                                                                                                               | 结果                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `model.allkinds.test.ts`：24 类型逐一「解析 → 往返不动点 → 真实 mermaid.parse」                                                                                                                                                                      | 47 用例全绿（zenuml 的 mermaid 校验在本机缺 localStorage 时跳过，CI 有） |
| 结构抽查：journey 分组边 / kanban id 与属性尾缀 / git 分支合并次序 / quadrant 坐标↔位置 / wardley evolve+note / radar 双命名空间 / block 多声明 / eventmodeling `->>` / timeline 续行合并 / railroad `<-` / frontmatter 逐字节 / zenuml 参与者归一化 | 全绿                                                                     |
| 加固：20 个新解析器超长单行跳过；越界坐标夹取                                                                                                                                                                                                        | 全绿                                                                     |
| 全量单测                                                                                                                                                                                                                                             | 222 通过（15 个本机预存 localStorage 失败与基线一致）                    |
| 新 e2e `visualEditorAllKinds.spec.ts`：journey 选中分组添加任务自动挂接 / git 重放+追加提交 / pie 值编辑 / quadrant 拖拽改坐标                                                                                                                       | 4/4 通过                                                                 |
| svelte-check / eslint / prettier                                                                                                                                                                                                                     | 0 错误 0 警告 / 通过 / 通过                                              |
| 语法探针脚本（jsdom + mermaid.parse 逐类型最小样例）                                                                                                                                                                                                 | 全部通过（arch 端口、PEG `<-`、kanban 无 `:T-x` 尾缀等结论均有实测依据） |

已知取舍：

- C4 的 Boundary/Enterprise_Boundary 包装在导入时展平（跳过计数）——画布无
  容器概念，内容节点保留；wardley 的 `pipeline`/`label [dx,dy]` 偏移同样跳过
- zenuml 的 loop/alt 控制块导入时展平（块内消息保留，块关键字计数）
- 甘特图 `after` 依赖不建边——任务时序尾缀（done/dates/duration）作为原文
  detail 逐字节保留，保证往返稳定
- ishikawa 多根（多个无父节点）时按节点序全部输出，mermaid 渲染以首个为鱼头

## 8. 编辑界面内的 Mermaid 实时渲染（2.0.86）

**问题**：可视化编辑界面此前是我们自绘的通用框线画布（VNode/VEdge 盒子），
编辑非 flowchart 类图时（饼图、甘特图……）画布呈现与 Mermaid 实际渲染差异很大
——「编辑界面看起来不像 Mermaid 的图」。

**方案**：编辑界面切换回 Mermaid 显示方式——Visual 标签改为**分屏**：

- 左侧：交互画布（原有全部编辑能力不变）
- 右侧：**Mermaid 实时渲染**（新组件 `VisualPreview.svelte`），复用生产渲染管线
  `renderAndPlaceDiagram`（与预览面板同一管线：主题/手绘/全部 31 类图渲染一致），
  250ms 防抖跟随画布编辑实时更新；渲染失败（编辑中间态非法代码）时保留上次
  结果并降低透明度提示
- 工具栏「预览」Toggle（`visualEditorPreview` localStorage 记忆偏好，默认开启）；
  移动端（<md）隐藏分屏保持单栏画布
- 渲染经 Promise 链串行（避免并发 mermaid 渲染互踩）；快速 Visual↔预览切换时
  组件卸载即取消未触发的防抖渲染（60 次连切零渲染，压测无回归）

**为何不做「直接在 Mermaid 渲染结果上编辑」**：Mermaid 的布局不感知用户坐标——
拖动节点后 Mermaid 不会重排连线（除非重新渲染整个图），节点与连线会脱节；
这正是当初自绘画布的原因。分屏方案在保留可编辑性的同时，把 Mermaid 的真实
显示带回编辑界面。

> 版本变更汇总见 [release/2.0.68.md](release/2.0.68.md)、[release/2.0.75.md](release/2.0.75.md)、[release/2.0.76.md](release/2.0.76.md)、[release/2.0.85.md](release/2.0.85.md)、[release/2.0.86.md](release/2.0.86.md)
