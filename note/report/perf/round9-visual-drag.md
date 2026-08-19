# Round 9 — 可视化画布拖拽路径（布局抖动消除 + 无变化跳过）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0 / Chromium（Playwright 驱动，dev server，1920×1080）
> 涉及：`src/lib/components/VisualEditor.svelte`、新增 `benchmark/studies/visual-drag.mjs`
> 原始输出：[raw/round9-visual-drag-before.txt](raw/round9-visual-drag-before.txt)、[raw/round9-visual-drag-after.txt](raw/round9-visual-drag-after.txt)

## 问题（插桩画像，300 边图 × 40 次指针移动）

1. `svgPoint()` 在**每次 pointermove** 调 `getBoundingClientRect()`——与拖拽产生的
   SVG 属性写入交错，形成经典「读-写-读-写」**强制同步布局**（layout thrashing），
   40 次移动 = 42 次布局读取（真实拖拽数百次移动等比放大）；
2. `node.x = snap(...)` **无条件赋值**：10px 网格吸附下，亚步进移动的吸附值不变，
   但赋值仍使属性版本失效 → 节点及其连线的无谓重渲染。

插桩同时证实了两点「已经很好」：拖拽期间 `generateCode` **0 次调用**
（Svelte 5 属性级依赖保证代码派生不受坐标变化影响）、`edgeAnchor` 仅 34 次
（只有被拖节点的关联边重算，非全量）。

## 改动

1. **手势级 rect 缓存**：svg 原点矩形在首次需要时读取并缓存；画布容器
   `scroll` 时失效（手势中滚动会移动原点）；pointerup 结束手势时清缓存
   （下一次手势重新测量，布局可能已变）。
2. **snap 无变化跳过**：吸附后的坐标与当前值相同时不赋值——消除无效版本失效；
   连带 `drag.moved` 仅在位置真正变化时置位（无坐标变化的抖动不再触发 pointerup
   的 `syncCode`；坐标本就不影响生成的代码，输出不变）。

## 量化（临时插桩计数，最终代码不含插桩）

| 指标（40 次移动拖拽，300 边图） | 优化前               | 优化后                 |
| ------------------------------- | -------------------- | ---------------------- |
| `getBoundingClientRect` 调用    | **42**（每移动一次） | **1**（每手势一次）    |
| `edgeAnchor` 调用               | 34                   | 34（真实重锚定，不变） |
| `generateCode` 调用             | 0                    | 0                      |
| 拖拽期间动画帧数                | 105                  | 107（稳定无回归）      |
| 节点实际移动                    | 是                   | 是                     |

> 消除的是**每次移动一次的强制同步布局**；其代价随画布 DOM 规模增长，
> 大图长拖拽收益最大。帧数持平说明无副作用。

## 验证

- e2e `visualEditor` 2/2（画布交互→代码生成→预览→持久化全链路、导入往返）
- 全量单测 123 通过 / 15 本机预存失败（与基线一致）；svelte-check 0/0；
  eslint / prettier 通过
- 研究脚本踩坑记录（写入脚本注释与本文）：节点可能在画布可视区外（页面坐标
  会命中底部代码面板 `<pre>`），需先收起代码面板并在可视区内取节点中心；
  菱形节点包围盒角落不是可命中区域，研究生成器统一用矩形节点
