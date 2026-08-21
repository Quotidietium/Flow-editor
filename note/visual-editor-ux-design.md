# 可视化编辑器交互与布局完整设计方案（类 Visio / draw.io）

> 版本基线：2.0.85（31 类图全部可编辑）
> 设计时间：2026-08-20
> 参考模型：draw.io（diagrams.net）交互规范 + Microsoft Visio 编辑体验
> 调研来源：见文末「参考来源」——全部为官方文档/官方博客，无臆测项

## 方向修正（2.0.86，用户指示）

用户明确：**编辑界面要以 Mermaid 的显示方式为准**（而非 draw.io 式自绘画布为
唯一显示）。2.0.86 先落地为编辑器内嵌渲染窗格，2.0.87 按用户指示改为**页面级对比模式**
（代码编辑器 ｜ 可视化画布 ｜ Mermaid 预览三栏，预览复用同一 `View.svelte`
独立成栏；内嵌实现已删除），纯「代码+可视化」两栏模式保持默认，详见
visual-editor.md §8。本方案后续章节中「自绘画布的视觉升级」优先级相应下调；
直接在 Mermaid 渲染结果上编辑的技术障碍（布局不感知用户坐标、连线不随拖动
重排）记录于 §8 的取舍说明。

## 0. 为什么需要这份设计

2.0.85 已把「全部 31 类图」纳入可视化编辑，但**数据模型层**和**交互层**是两件事：
当前画布是"通用框线编辑器"——双击建节点、拖锚点连线、形状/线型循环按钮。
对照 draw.io / Visio，缺口集中在**操作**（多选、变换、对齐吸附、撤销、键盘体系、
上下文菜单、图元面板）与**布局**（正交连线、分组容器、自动布局选项、自动对齐清理）。
本方案给出到 draw.io 级体验的完整设计，并逐项标注与 Mermaid 代码真相源的映射关系。

## 1. 核心设计约束：Mermaid 代码是唯一真相源

draw.io 的文档格式是自由图形 XML，任何画布操作都能持久化；本项目**持久层是
Mermaid 源码**（localStorage `codeStore` + URL hash 分享），这决定了每个新特性必须
归入三条通道之一：

| 通道             | 含义                                       | 既有先例                            | 代价                                       |
| ---------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------ |
| **A 语法映射**   | 特性直接对应 Mermaid 语法，写入代码        | 形状/线型循环 → `A([x])` / `-.->`   | 受语法能力上限约束                         |
| **B 编辑器本地** | 特性不入代码，存 localStorage（按节点 id） | 位置记忆 `visualEditorLayout`       | 跨设备丢失、换图 id 撞名需防护（已有护栏） |
| **C 显式放弃**   | Mermaid 无法表达且本地存储无意义           | 旋转角度（mermaid 节点无 rotation） | UI 上不提供入口，避免"画了不生效"的谎言    |

**判定规则**：影响**语义**（他人打开分享链接看到的渲染结果）的走 A；只影响
**本机编辑体验**的走 B；与 mermaid 渲染结果矛盾且本地无价值的走 C。
所有 B 通道数据沿用 `sanitizePositions` 式白名单校验（不可信输入防线，见审计报告）。

## 2. 现状与 draw.io / Visio 的差距总表

| 能力域     | draw.io / Visio 参考                                  | 当前状态（2.0.85）              | 差距等级 |
| ---------- | ----------------------------------------------------- | ------------------------------- | -------- |
| 多选       | Shift/Ctrl 加选、橡皮筋框选、Ctrl+A                   | 无（仅单选）                    | 🔴 高    |
| 批量操作   | 多选移动/删除/对齐/分布                               | 无                              | 🔴 高    |
| 缩放变换   | 周边 8 手柄缩放 + 旋转手柄 + 精确尺寸输入             | 无（尺寸按内容自适应）          | 🟡 中    |
| 撤销重做   | Ctrl+Z / Ctrl+Shift+Z 全操作栈                        | 无（依赖 History 60s 快照兜底） | 🔴 高    |
| 图元面板   | 左侧形状库（stencil）拖放创建、搜索                   | 无（仅工具栏「添加」按钮）      | 🔴 高    |
| 快速连接   | 悬停四向箭头一键建连（Visio AutoConnect）；克隆并连接 | 仅锚点拖拽连线                  | 🟡 中    |
| 对齐吸附   | 动态参考线（绿虚线）+ 等距提示 + Snap to Shape        | 仅 10px 网格吸附                | 🔴 高    |
| 对齐/分布  | Arrange 面板 6 向对齐 + 分布                          | 无                              | 🟡 中    |
| 边路由     | 直线/正交/圆角/曲线 + waypoint 手柄 + line jump       | 直线（边框-边框锚点）           | 🔴 高    |
| 分组容器   | 容器框 + 标题 + 子项随容器移动（Visio Container）     | 分组节点是普通框（kanban 列等） | 🔴 高    |
| 自动布局   | 水平/垂直树、Org Chart + 间距参数                     | 单一分层布局（Kahn）            | 🟡 中    |
| 布局清理   | Visio Auto Align & Space                              | 无                              | 🟢 低    |
| 画布导航   | 空格/右键平移、滚轮缩放、Ctrl+H 复位、小地图          | 容器滚动条（3000×2000 世界）    | 🟡 中    |
| 键盘体系   | 全套快捷键（复制/粘贴/删除/方向键微移）               | Delete/Backspace、Esc           | 🟡 中    |
| 上下文菜单 | 右键菜单（形状/连线/画布分级）                        | 无                              | 🟢 低    |
| 复制粘贴   | Ctrl+X/C/V、Ctrl+D 原位复制、Ctrl+拖拽克隆            | 无                              | 🟡 中    |
| 层级/图层  | Bring Forward/Backward、图层对话框                    | 无（mermaid 无图层概念）        | 🟢 低→C  |

## 3. 操作设计（重点）

### 3.1 选择系统

- **单选**：点击节点/连线（现状保留）；点击空白清除选择；Esc 取消（现状保留）
- **加选**：`Shift+点击` 切换成员；`Ctrl+点击` 同义（draw.io 行为）
- **橡皮筋框选**：**2.0.118 起改为 Shift+拖拽**（替换选择集）/ Ctrl·Meta+拖拽
  （追加）——空白左键拖拽让位给画布平移（用户指示：空白处应可直接拖动，
  见 release/2.0.118.md）。以下为原设计语义，仍适用于修饰键框选：
  在空白处按下拖拽出虚线矩形；**默认只选中完全被包围的元素**
  （draw.io 语义），按住 `Alt` 放宽为相交即选
- **快捷键**：`Ctrl+A` 全选；`Ctrl+I` 只选节点（不含连线）；`Ctrl+L` 只选连线
- **选择渲染**：主选中项高亮描边（现状）+ 多选时其余成员浅色描边；
  状态栏显示「已选 N 项」
- **实现要点**：`selected: {id, kind}[]`；所有批量命令对每个成员逐一执行后
  一次 `syncCode()`（只触发一次状态网关发布，避免 60 次重排）

### 3.2 创建与删除

- **图元面板（左侧 stencil，替代"只靠双击"）**：按当前 kind 提供图元网格：
  - flowchart：矩形/圆角/胶囊/菱形/子程序（形状 × 默认标签）
  - 时序图：参与者/Actor；状态图：状态/起点/终点；kanban：列表/卡片；
    C4：人员/系统/外部系统/数据库/容器/组件；git：提交/分支起点/合并……
  - 图元来自 `KIND_SPECS[kind].nodeTypes × shapes` 组合，**零新增数据**，
    纯 UI 派生（对应 Visio「Shapes 窗口拖放母版」）
  - 顶部搜索框过滤图元名（本地化名）
  - **拖放创建**：从面板拖到画布落点创建（pointer 事件，落点吸附网格）
- **双击空白快速创建**：保留（默认图元 = `nodeTypes[0]`）
- **方向箭头快连（Visio AutoConnect 式）**：选中节点时四边中点外扩显示
  淡色箭头（与现有连线锚点合并为同一组 handle，`悬停 300ms` 才显连线锚点，
  避免视觉拥挤）；点击箭头 = 在该方向创建默认节点 + 连线（偏移 200px，
  吸附网格）；**若该方向已有未连接节点则改为连接最近的一个**（Visio 行为）
- **克隆并连接**：`Alt+Shift+方向键` 在该方向克隆选中节点并连线
  （draw.io 快捷键原样采纳）
- **复制粘贴/原位复制**：`Ctrl+C/X/V`（内部剪贴板：VNode/VEdge 深拷贝，
  id 经 nextNodeId 重铸；粘贴落点 = 选中项右下偏移 20px）；`Ctrl+D` 原位复制；
  **`Ctrl+拖拽` = 克隆拖放**（拖拽手势开始时检测 Ctrl，对选中集整体克隆）
- **删除**：Delete/Backspace（现状保留，扩展为多选批量）；连线随端点节点
  删除级联（现状保留）

### 3.3 连接模型（对照 draw.io 连接器）

- **锚点**：现状四边中点 = draw.io「固定连接点」的最小子集；**不引入**
  自定义锚点数量/位置（通道 C：mermaid 不记锚点，本地存无跨设备价值），
  连线路径由路由器自动选边（见 4.2），锚点仅是手势入口
- **连线手势**：从锚点拖出 → 目标节点高亮（绿框）→ 松手建立；**拖到空白
  松手 = 在该处新建节点并连接**（draw.io 行为，[Connectors 手册](https://www.drawio.com/docs/manual/connectors/)
  与 [Copy on Connect](https://www.drawio.com/docs/manual/shapes/copy-on-connect/)
  均有记载——draw.io 默认连接源形状的副本，本方案取「新建默认图元」语义，
  与方向箭头快连一致）
- **连线类型**：线型/基数循环按钮保留；新增**反转方向**按钮与快捷键
  （`Shift+R`，交换 source/target——结构类分组边除外：kanban 列→卡片
  反转无意义，按钮按 kind 禁用）
- **Waypoint（手动拐点）**：**通道 B**——`edgeWaypoints` localStorage 表
  （键 = 边 id）。用户拖动连线中段出现拐点手柄（draw.io 圆点手柄），
  双击拐点删除。渲染层使用；生成代码不变。跨设备丢失属可接受（与位置记忆
  同级），换图撞 id 沿用 100KB 总量护栏思路
- **边标签**：双击连线行内编辑（现状保留）；拖动标签沿边滑动（通道 B，
  标签偏移 0–1 存本地）；mermaid 语法内标签位置（如 flowchart `A10-->x B`）
  **不采纳**——语法冷僻且破坏可读性

### 3.4 文本编辑

- 双击节点/连线行内编辑（现状保留）；`F2` 编辑选中项（新增，draw.io 一致）
- detail 多行编辑器（现状保留）作为节点"属性页"的第一块
- 属性对话框（2.0.85 新增）保留，后续并入右侧属性面板（见 3.8）

### 3.5 对齐与吸附（对照 draw.io Alignment tools + Visio 动态网格）

- **网格吸附**：10px（现状保留）；设置项可调 1/10/20px 或关闭
  （`Shift+拖拽` 临时绕过吸附——draw.io 行为）
- **动态对齐参考线（P0 之一）**：拖拽时与**其他可见节点**比较：
  - 左/右/中心 X 对齐或上/下/中心 Y 对齐（容差 6px）→ 显示贯穿画布的
    高亮虚线 + 吸附到对齐位（Visio 动态网格为绿色虚线，具体色值实现时
    与主题变量对齐后确定）
  - 同行/列间距与相邻对相等（容差 8px）→ 显示等距指示（两条短线 + 距离值）
  - 实现要点：候选集 = 视口内节点（拖拽开始时一次收集，拖拽中 O(n) 线性扫描，
    n 为视口节点数，复用 round9 拖拽期零 gBCR 的性能红线）
- **对齐/分布工具**：多选 ≥2 显示对齐条（左/水平居中/右/上/垂直居中/下）；
  ≥3 加分布（水平/垂直等距，间距 = 首尾平均）；全部为纯位置操作（通道 B，
  通过位置记忆持久化）；仅作用于**当前布局**，不触碰代码
- **自动对齐清理（Auto Align & Space，Visio 同名功能）**：工具栏「整理」
  下拉新增「对齐网格」（全图位置就近吸附 20px 粗网格，消除半格错位）

### 3.6 撤销 / 重做（P0）

- `Ctrl+Z` / `Ctrl+Shift+Z`（及 `Ctrl+Y`）；工具栏按钮随栈深启用
- **实现：VGraph 快照栈**（而非文本 diff）——理由：
  1. Mermaid 往返存在合法归一化（首次生成会规范化缩进/合并行），
     文本级 undo 会把归一化也回滚，产生"没改任何东西却脏了代码"的假撤销
  2. 快照对象是 `$state.snapshot(graph)`（浅图 + 节点边数组），千节点级
     内存可控；栈深上限 50（超出丢最旧）
  3. 栈只在**已提交手势/命令**边界入栈（pointerup、对话框保存、快捷键命令），
     拖拽中间态不入栈——与 `syncCode` 调用点一一对应，改动集中
- 重做栈在新命令入栈时清空；撤销后 `syncCode()` 重新生成代码（位置记忆
  一并回滚到快照值）
- 边界：撤销跨「从代码重载」命令时栈清空（外部状态突变不可逆推）

### 3.7 键盘与导航

| 键                                  | 行为                                              | 通道 |
| ----------------------------------- | ------------------------------------------------- | ---- |
| 方向键                              | 选中项微移 1px（Shift = 10px）                    | B    |
| Delete/Backspace                    | 删除选中（多选批量）                              | A    |
| Esc                                 | 取消连线/编辑/选择（现状保留）                    | —    |
| F2                                  | 编辑选中项标签                                    | A    |
| Ctrl+A / Ctrl+I / Ctrl+L            | 全选 / 只选节点 / 只选连线                        | —    |
| Ctrl+C/X/V、Ctrl+D                  | 复制/剪切/粘贴/原位复制                           | A+B  |
| Ctrl+拖拽                           | 克隆拖放                                          | A+B  |
| Alt+Shift+方向                      | 克隆并连接（draw.io）                             | A    |
| Shift+R                             | 反转选中连线方向                                  | A    |
| Ctrl+Z / Ctrl+Shift+Z               | 撤销/重做                                         | B    |
| 空白左键拖拽 / 空格+拖拽 / 中键拖拽 | 画布平移（2.0.118 起空白直接可拖；空格/中键保留） | —    |
| Ctrl+滚轮                           | 以指针为中心缩放画布（SVG viewBox，新增）         | —    |
| Ctrl+H / `0`                        | 复位视图 / 100%（「整理布局」旁加复位按钮）       | —    |

- 画布缩放实现要点：外层 `<svg>` 维持世界坐标，内层 `<g transform>` 应用
  平移缩放；滚轮缩放需换算指针世界坐标锚点；当前 svgRect 手势缓存逻辑
  相应改为世界坐标换算（round9 的 gBCR 缓存策略平移适用）

### 3.8 工具栏与属性面板重组

- **顶部工具栏**（现状保留并扩充）：添加（下拉到图元面板后弱化为快捷按钮）·
  形状 · 类型 · 线型 · 基数 · 对齐（多选时）· 撤销/重做 · 整理布局 ▾（自动布局/对齐网格）·
  从代码重载 · 清空 · 右侧显示 kind 标签与计数（现状）
- **左侧图元面板**：可折叠（移动端隐藏，保留现有移动布局约束）
- **右侧属性面板**（多选时显示聚合态；替代部分弹窗）：
  - 选中节点：标签、类型、形状、detail（多行）、（flowchart）样式 class
  - 选中边：标签、线型、基数、方向反转
  - 无选择：图表属性（title/meta，2.0.85 对话框迁移至此）
  - 对应 draw.io Format Panel 的 Style/Arrange/Text 三页签 → 简化为单页流式
- **右键上下文菜单**（三级）：画布（粘贴/全选/对齐网格/复位视图）、
  节点（编辑/复制/删除/类型 ▸/形状 ▸/对齐 ▸）、连线（编辑标签/线型 ▸/反转/删除）
  ——全部是既有命令的快捷入口，无新语义

### 3.9 明确不做（通道 C 清单，防"画了不生效"）

- 旋转（mermaid 无旋转语义；连线几何亦不支持）
- 任意颜色/线宽/字体（mermaid 仅 classDef/style/linkStyle 指令且被当前
  解析器按不支持行跳过——纳入 A 通道成本高、破坏代码可读性，暂不做；
  若未来做，入口为「样式」对话框生成 `classDef`，属独立提案）
- 图层 / 显示隐藏（mermaid 无图层；用 subgraph 表达分组属 A 通道的独立提案）
- 自定义连接点数量、边标签的 mermaid 语法级定位（`A--x B` 类冷僻语法）
- 多页面（draw.io Page 概念；本项目一图一 URL，页面 = History 时间线/多标签）

## 4. 布局设计（重点）

### 4.1 三层布局策略（按 kind 自动选择）

| 层                     | 适用 kind                                          | 位置来源                       | 用户拖拽的意义                              |
| ---------------------- | -------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| **L1 代码驱动坐标**    | quadrant / wardley                                 | 代码内 `[x, y]`（现状已实现）  | 直接改写代码坐标（WYSIWYG）                 |
| **L2 自由布局 + 记忆** | flowchart / sequence / class / …                   | 自动布局初值 + 位置记忆叠加    | 纯视觉（现状已实现）                        |
| **L3 结构化列表**      | journey/gantt/timeline/kanban/cynefin 等分组列表族 | 分组容器决定子项槽位（见 4.3） | 跨组移动 = 改变归属关系（A 通道语义变更！） |

L3 的关键设计：**拖拽卡片到另一列 = 重挂结构边**（kanban 换列、journey 换分组），
这是 draw.io 没有的"语义拖拽"——因为它操作的是图结构而非几何。落点判定 =
指针所在容器矩形；拖出所有容器 = 变孤儿（生成时落最后一组，现状兜底）。

### 4.2 边路由：直线 → 正交（P0 之一）

现状直线在节点一多时交叉不可读。目标 = draw.io 默认的正交路由：

1. **端口选择**：按两端中心连线方向选择出边/入边端口（上/下/左/右中点），
   同向冲突时轮转备用端口（一个节点多条边同侧时按角度散布到四边）
2. **曼哈顿路径**：两端口 → 单中轴折线（H-V-H 或 V-H-V，按端口朝向决定），
   中轴取两端口区间的中点（吸附 10px）
3. **节点避让**：折线段与节点盒相交时，中轴外推到盒边 + 半间距
   （简化 A*：不做全局绕行，局部外推覆盖 90% 场景；绕行失败退化为直线）
4. **圆角拐点**：路径转角 8px 圆角（`<path>` arc 段）；风格常量与
   draw.io "rounded" 一致
5. **Waypoint 覆盖**：用户拐点（3.3）优先于自动路由，自动段只连接拐点间
6. **渲染独立**：画布连线几何**只影响编辑视图**，与 mermaid 渲染无关
   （预览仍是 mermaid 自己的布局）——因此路由器是纯展示层，零代码风险
7. 性能：路由计算在拖拽中每帧对**视口内可见边**执行（复用 round9 手势级
   缓存），静态时缓存于边 id → path 映射，仅端点移动失效
8. 箭头/标签沿路径末端/中点放置（现状锚点计算改读路径端点切向）

备选风格开关（工具栏「线形」全局项）：直角（默认）/ 直线（现状）/ 曲线
（quadratic bezier）——draw.io 三风格对齐。

### 4.3 分组容器（Visio Container / draw.io 分组）

分组列表族的分组节点从"普通框"升级为**容器**：

- 渲染：标题栏（24px，含分组名与计数）+ 虚线/淡填充内容区；子项按边序
  从左到右、超出换行排列（列内垂直堆叠，kanban 为纵向列表、journey/timeline
  为纵向分组、cynefin 域为框内标签云）；容器高度随子项数自适应
- 交互：
  - 拖容器标题 = 整组移动（子项相对偏移保持）
  - 子项在容器间拖拽 = 重挂结构边（4.1 L3）
  - 拖节点靠近容器边缘吸附进组（高亮预览 + 确认色）
  - 容器右键：清空组 / 删除组（子项变孤儿）——语义经 syncCode 生效
- 布局协作：容器自身位置走 L2 记忆；子项槽位由容器内布局器决定
  （用户拖动子项在容器内的位置 = 相对槽位记忆，通道 B 键为 `容器内索引`）
- flowchart subgraph（A 通道）**另行提案**：需要解析器升级（当前跳过计数），
  与本方案解耦，避免一次改动过大

### 4.4 节点尺寸

- 默认自适应（现状：文字 + detail 行数）
- **手动尺寸记忆**（通道 B，`visualEditorSizes`）：选中显示 8 向缩放手柄
  （四角 + 四边中点；draw.io 圆点手柄）；`Shift` 等比；双击手柄复位自适应
- detail 折叠显示上限 5 行（现状）保留，容器内节点折叠为单行 + 计数徽标

### 4.5 自动布局选项（对照 draw.io Arrange > Layout）

「整理布局」从单一行为升级为下拉（作用于选中集或全图）：

| 布局            | 算法                                               | 适用                                             |
| --------------- | -------------------------------------------------- | ------------------------------------------------ |
| 分层 TD / LR    | 现有 Kahn 分层 + 间距参数（层距 80/同层 60，可调） | 通用（现状扩展）                                 |
| 垂直树 / 水平树 | 紧凑树（Reingold–Tilford 简化版）                  | mindmap/treemap/ishikawa/swimlane/树状 flowchart |
| 分组网格        | 容器纵向堆叠 + 容器内列网格                        | kanban/journey/timeline/gantt/cynefin            |
| 对齐网格        | 全图位置 20px 网格化（3.5）                        | 自由布局整理                                     |

所有布局**只写位置**（通道 B），执行后进撤销栈；布局算法为纯函数
（`layoutGraph` 扩展为 `LAYOUTS: Record<name, (g: VGraph) => VGraph>`），
单测逐布局快照覆盖。

### 4.6 画布空间

- 世界坐标固定 3000×2000 → **按内容边界自动扩展**（四周留白 400px，
  上限 8000×6000 防止失控）；现有常量集中为 `WORLD_*`
- 缩放/平移（3.7）后，小地图（P2）：右下角 160×120 缩略图 + 视口框拖拽
- 网格渲染保持 CSS 径向渐变（现状）；缩放时网格密度随 viewBox 固定
  （世界坐标网格，不随缩放变密）

## 5. 分阶段实施路线

| 阶段     | 内容                                                                                                                                                | 依赖           | 预估规模           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| P0 ✅    | ~~撤销重做（快照栈）· 多选/框选/批量 · 对齐参考线与吸附~~（2.0.88 已落地，另含右键菜单/剪贴板/对齐分布/键盘体系）；正交路由 + 圆角（2.0.90 已落地） | 无（纯编辑层） | 大（核心交互骨架） |
| P1 ✅    | 图元面板 + 拖放 · 方向箭头快连 + 克隆连接 · 复制粘贴/克隆 · 对齐分布工具 · 分组容器渲染 + 语义拖拽 · 布局选项下拉 · 画布平移缩放                    | P0 选择系统    | 大                 | （2.0.89 已落地：平移缩放、AutoConnect 快连+克隆连接、插入图元面板、布局下拉、分组排布；分组容器视觉与 waypoint 属 P2） |
| P2       | waypoint 边拐点（本地）· 缩放手柄 + 尺寸记忆 · 右键菜单 · 属性面板整合 · 小地图 · 自动对齐清理                                                      | P1             | 中                 |
| 独立提案 | subgraph 容器（A 通道解析器升级）· classDef 样式对话框（A 通道）                                                                                    | 与 P0–P2 解耦  | 各为中             |

每阶段验收标准：新交互全部有 e2e（断言生成代码变化或位置记忆变化）+
单测（纯函数部分）+ 压测脚本扩展（stress-smoke 加多选拖拽/撤销连发场景）+
性能红线不变（拖拽期零强制布局、发布走单次 syncCode）。

## 6. 与现有架构的对接点（实现索引）

| 设计项            | 落点                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 选择状态          | `VisualEditor.svelte` `selected: {id, kind}[]` + 批量命令收口一次 syncCode                                                   |
| 撤销栈            | `VisualEditor.svelte` 模块级 `undoStack/redoStack`（快照 `$state.snapshot(graph)`）                                          |
| 对齐参考线        | 拖拽手势内纯函数 `alignmentGuides(moving, others, tol)`（新 util，可单测）                                                   |
| 正交路由          | `visualEditor/routing.ts` 纯函数（端口选择 + 折线 + 圆角 path），替换 `edgeAnchor` 的渲染用途（`edgeAnchor` 保留给命中测试） |
| 图元面板          | 由 `KIND_SPECS[kind].nodeTypes × shapes` 派生，无新数据结构                                                                  |
| 容器布局器        | `layoutGraph` 扩展 L3 分支 + 容器内槽位纯函数                                                                                |
| waypoint/尺寸记忆 | 沿用 `visualEditorLayout` 的模式：localStorage + `sanitizePositions` 式白名单 + 100KB 护栏                                   |
| 画布变换          | svg `<g transform>` + 世界坐标换算重构 `svgPoint`（round9 缓存策略平移）                                                     |
| 键盘系统          | `onWindowKeydown` 扩展（现有入口），注意与 Monaco 焦点隔离（编辑中不拦截）                                                   |

## 7. 参考来源（调研，全部官方/一手）

**draw.io（diagrams.net）**

- 连接器与航点：[Work with connectors](https://www.drawio.com/docs/manual/connectors/)
- 连接点（固定/浮动）：[Connection points functionality and customization](https://drawio-app.com/blog/connection-points-functionality-and-customization-in-project-management/) ·
  [Customise the connection points on a shape](https://www.drawio.com/docs/manual/shapes/shape-connection-points-customise/)
- 对齐吸附：[Snap to grid and other helpful alignment tools](https://www.drawio.com/docs/manual/editor/alignment-tools/) ·
  [Align and space shapes](https://www.drawio.com/docs/manual/shapes/arrange-align-shapes/) ·
  [Arrange tab](https://www.drawio.com/docs/manual/editor/panels/arrange-tab/)
- 选择：[Select multiple shapes](https://www.drawio.com/docs/manual/shapes/select-multiple-shapes/) ·
  [Select shortcuts](https://www.drawio.com/docs/reference/shortcuts/shortcut-select/)
- 变换：[Resize shapes](https://www.drawio.com/docs/manual/shapes/shape-resize/) ·
  [Rotate shapes](https://www.drawio.com/docs/manual/shapes/shape-rotate/) ·
  [Group and ungroup](https://www.drawio.com/docs/manual/editor/group-shapes-connectors/)
- 快捷键与克隆连接：[Mouse + keyboard modifier shortcuts](https://www.drawio.com/docs/reference/shortcuts/modifier-shortcuts-in-diagrams/) ·
  [Clone and connect](https://www.drawio.com/docs/reference/shortcuts/shortcut-clone-connect/) ·
  [Duplicate a shape](https://www.drawio.com/docs/manual/shapes/shape-duplicate/) ·
  [Shortcuts overview](https://www.drawio.com/docs/reference/shortcuts/) ·
  [drawio-app shortcuts tutorial](https://drawio-app.com/tutorials/shortcuts/)
- 自动布局：[Automatic Layout in draw.io](https://drawio-app.com/blog/automatic-layout-in-draw-io/) ·
  [Automated layout shapes](https://www.drawio.com/docs/manual/shapes/automated-layout-shapes/) ·
  [Organization charts and mind maps](https://drawio-app.com/blog/organization-charts-and-mind-maps-in-drawio/)
- 图层：[Using layers](https://www.drawio.com/docs/manual/layers/) ·
  [How layers work](https://www2.drawio.com/blog/how-layers-work)
- 编辑器配置：[Configure the draw.io editor](https://www.drawio.com/docs/reference/configure-diagram-editor/)

**Microsoft Visio**

- AutoConnect（悬停箭头一键连接/添加）：[Video: Connect shapes](https://support.microsoft.com/en-us/visio/video-connect-shapes) ·
  [Add connectors between Visio shapes](https://support.microsoft.com/en-us/visio/add-connectors-between-visio-shapes) ·
  [Beginner tutorial for Visio](https://support.microsoft.com/en-us/visio/beginner-tutorial-for-visio)
- 动态网格（绿色虚线对齐参考线）：[Visio 2013: Dynamic Grid guidelines（Microsoft Q&A）](https://learn.microsoft.com/en-us/answers/questions/5425630/visio-2013-dynamic-grid-guidelines-no-longer-appea?page=2)（View → Visual Aids → Dynamic Grid）
- 吸附与粘附强度：[Adjust snap strength or turn snap off](https://support.microsoft.com/en-us/visio/adjust-snap-strength-or-turn-snap-off)；
  动态连接随形状移动自动改路由：[Edit connector lines, arrows, or points](https://support.microsoft.com/en-us/visio/edit-connector-lines-arrows-or-points)
- Auto Align & Space：[Align and position shapes in a diagram](https://support.microsoft.com/en-us/visio/align-and-position-shapes-in-a-diagram)（Home → Arrange → Position → Auto Align & Space）
- 容器与列表：[Clarify the structure of diagrams by using containers and lists](https://support.microsoft.com/en-us/visio/clarify-the-structure-of-diagrams-by-using-containers-and-lists) ·
  [A Visio List Shape is also a Container](https://bvisual.net/2022/07/06/a-visio-list-shape-is-also-a-container/)
- 母版/模具：[Use the Shapes window](https://support.microsoft.com/en-us/visio/use-the-shapes-window-to-organize-and-find-shapes) ·
  [Visio Stencils, Masters and Shapes](https://www.experts-exchange.com/articles/2680/Visio-Stencils-Masters-and-Shapes-How-are-they-related.html)
- 形状数据：[Add data to Visio shapes](https://support.microsoft.com/en-us/visio/add-data-to-visio-shapes)
- 主题：[Apply a theme to a diagram](https://support.microsoft.com/en-us/visio/video-apply-a-theme-to-a-diagram)

> 术语对照：stencil（模具/图元面板）、master（母版）、container/list（容器/列表）、
> glue（粘附）、waypoint（航点/拐点）、rubber band（橡皮筋框选）、
> AutoConnect（自动连接）、dynamic grid（动态网格）。
