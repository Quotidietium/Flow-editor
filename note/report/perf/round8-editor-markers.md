# Round 8 — 编辑器标记应用去重（Monaco setModelMarkers）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0 / Chromium（Playwright 驱动，dev server）
> 涉及：`src/lib/components/DesktopEditor.svelte`、新增 `benchmark/studies/editor-sync-calls.mjs`
> 原始输出：[raw/round8-marker-calls-before.txt](raw/round8-marker-calls-before.txt)、[raw/round8-marker-calls-after.txt](raw/round8-marker-calls-after.txt)

## 问题

DesktopEditor 的同步 `$effect` 在**每次状态发布**上无条件调用
`monaco.editor.setModelMarkers(model, 'mermaid', errorMarkers)`。Monaco 对相同标记
也会重建装饰（squiggle decorations），而画布拖拽期间 pan/zoom 回调**每帧多次发布**
（onPan 与 onZoom 各一次）、标签切换、视图选项变更都涌入该 effect——代码与标记
根本没变。

## 改动

单槽引用去重：记录上次应用的 `{model, markers}`，仅当 **model 变化或 markers 数组
身份变化**时才调用 `setModelMarkers`。身份判据的可靠性来自 Round 4 的 parse 缓存：
代码不变 → `validatedState.current.errorMarkers` 是**同一个数组实例**；代码变化 →
解析产出新数组。因此：

- 标记真正变化（打字、修复错误）→ 照常应用；
- 标记未变（拖拽、切标签、视图项变更）→ 跳过一次冗余的 Monaco 装饰重建。

## 量化（临时插桩计数，Playwright 脚本交互，最终代码不含插桩）

| 交互                      | 优化前标记应用次数 | 优化后                       |
| ------------------------- | ------------------ | ---------------------------- |
| 画布拖拽（30 次指针移动） | **59**             | **0**                        |
| Code/Config 标签切换 ×6   | 6                  | 6（model 切换需重挂）        |
| 输入损坏代码（~20 键）    | 41                 | 25（仅跳过真正未变化的发布） |

> 每次被消除的调用都是一次 Monaco 装饰重建 + 相关内部派发；拖拽期间从 ~2 次/移动
> 降为 0，消除了画布交互路径上与编辑器联动的主要冗余工作。标注方法：研究脚本
> （`benchmark/studies/editor-sync-calls.mjs`）+ 组件内临时计数器，测量后移除。

## 验证

- e2e：`errorDisplay`（损坏图/损坏 JSON 的错误标记显示）+ `diagramUpdate` 全部通过
- 全量单测 123 通过 / 15 本机预存失败（与基线一致）；svelte-check 0/0；eslint / prettier 通过
