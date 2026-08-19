# Round 4 — 发布管线复合优化（mermaid.parse 结果缓存 + 集成基准）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0（jsdom + 真实 mermaid）
> 涉及：`src/lib/util/state.svelte.ts`、新增 `src/lib/util/state.cache.test.ts`、新增 `benchmark/publish-pipeline.bench.ts`
> 原始输出：[raw/round4-pipeline.txt](raw/round4-pipeline.txt)

## 问题

`processState` 对**每次状态发布**都执行 `mermaid.parse(state.code)`——但 parse 只依赖
代码字符串。以下高频场景的发布**不改变代码**却在全量重解析：

- Code/Config 标签切换（`updateCodeStore({editorMode})`）
- 画布平移/缩放拖拽（pan/zoom observer 每帧 `updateCodeStore({pan, zoom})`）
- 网格/主题联动等视图选项变更

大图上 mermaid.parse 是数十毫秒级操作，拖动画布时每次回调都重跑一遍。

## 改动

`state.svelte.ts` 引入 `parseAndCache(code)`：

- 以代码字符串为键记忆**上一次** parse 的完整产出（`diagramType`、按原逻辑构建的
  `error` / `errorMarkers`）——错误标记的构建只依赖代码与错误串，复用安全；
- 代码不变 → 直接复用产出，**跳过 mermaid.parse**；
- 并发防护：只缓存「最新请求」的代码，防止旧请求迟到覆盖新缓存（快速输入时
  多个 processState 并发）；
- ZenUML 整页刷新 hack 保留在新鲜解析路径上（其触发条件要求 diagramType 变化，
  必然伴随代码变化 → 缓存未命中，语义不变）；
- `JSON.parse(state.mermaid)` 配置校验保持在每次发布（配置可独立变化），
  其错误呈现与旧行为一致（置 `error`、无 markers）。

## 性能对比（集成基准，20 次迭代均值，需减去基座 15.8ms）

| 场景                                   | 净耗时（减基座）                  | 说明                            |
| -------------------------------------- | --------------------------------- | ------------------------------- |
| mermaid.parse 单独（30 边 flowchart）  | 18.2 ms                           | 旧管线中**每次**发布的固定成本  |
| 击键发布（代码变化，parse 必跑）       | ~14.2 ms                          | 与 parse 成本同量级，不可避免   |
| **视图选项发布（代码不变，缓存命中）** | **≈ 0 ms**（15.38 vs 基线 15.76） | **旧管线同样场景 ≈ 全量 parse** |
| 分享刷新发布（读 serialized）          | ~14.8 ms                          | 击键 + 小状态 deflate           |

> jsdom 环境 parse 绝对值偏大（真实浏览器更快），但「视图选项发布从全量 parse
> 降为约零边际成本」的消除是成比例成立的。拖拽画布（每帧 pan/zoom 发布）是最大
> 受益场景。

## 正确性证据

`state.cache.test.ts`（3 用例，全绿；mock `./mermaid` 并统计调用次数）：

1. 代码不变时 editorMode/pan/zoom 发布**不增加** parse 调用次数；代码变化重新解析；
2. 缓存命中的发布复用同一份已处理错误与 markers（消息与结构逐项相等）；
3. 缓存命中发布仍能浮出非法配置 JSON 错误（diagramType 保留、无 markers、
   修复配置后错误清除且不触发重解析）。

## 验证

- 单测全量：118 通过（+3）/ 15 失败为本机预存 localStorage 问题（与基线一致）
- svelte-check 0 错误 0 警告；eslint / prettier 通过
- **全量 e2e：42 通过 / 3 预存 skip / 0 失败**（与 2.0.70 发布基线一致）
