# Round 7 — PNG 导出等待路径（固定 1000ms → 事件驱动）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0 / Chromium（Playwright 驱动，dev server）
> 涉及：`src/lib/components/Actions.svelte`、新增 `benchmark/studies/export-latency.mjs`
> 原始输出：[raw/round7-export-before.txt](raw/round7-export-before.txt)、[raw/round7-export-after.txt](raw/round7-export-after.txt)

## 问题

导出 PNG / 复制图像前需要一次「关闭 panZoom 的重渲染」拿到干净的 SVG（无
svg-pan-zoom 视口包裹、尺寸未被缩放污染）。旧实现用一个**固定 1000ms sleep**
等这次重渲染——它同时是：

- **固定的用户可感知延迟**：每次导出至少多等 1 秒；
- **不可靠的同步**：慢图上 1 秒可能不够（autoSync 降级时重渲染被推迟最多 ~1s+渲染时长），
  快图上又纯属浪费。

## 改动

`exportImage` 的 `setTimeout(1000)` 替换为 `waitForCleanSvg()`：

1. `await waitForRender()`（autoSync 的渲染完成 promise，防抖降级窗口内为 pending）；
2. `requestAnimationFrame` 让一帧布局落定；
3. 检查 `#container svg` 且**不含 `g.svg-pan-zoom_viewport`**（干净重渲染已就位的判据）；
4. 未就绪则继续循环；**代码处于错误态**（无重渲染会来）或超过 5s 截止时，按旧语义
   用当前内容尽力导出；完全无 SVG 时保持原来的 `svg not found` 抛错。

用户交互体验：导出的文件字节与之前完全一致（同一张干净 SVG 进 canvas），只是
不再固定多等 1 秒；慢机上反而更稳（等到真渲染完成为止）。

## 性能对比（Playwright 研究，5 次取中位，click → download 事件）

|          | 优化前                 | 优化后                       |
| -------- | ---------------------- | ---------------------------- |
| 中位延迟 | **1037 ms**            | **75 ms**（**~14x**）        |
| 各次     | 1036-1037（首跑 1963） | 65-81（首跑 435 含冷重渲染） |

## 验证

- e2e：`actions.spec.ts`（PNG+SVG 下载与文件大小断言、换图后内容不同断言）通过；
  `errorDisplay` 2 用例通过
- 全量单测 123 通过 / 15 本机预存失败（与基线一致）；svelte-check 0/0；eslint / prettier 通过
- 研究脚本纳入 `benchmark/studies/`（复跑方式见文件头注释）
