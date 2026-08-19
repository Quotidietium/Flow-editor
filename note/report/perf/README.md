# 性能优化报告索引（perf reports）

> 分支：`feat/perf-optimization`（基于 `feat/visual-wysiwyg`，v2.0.70）
> 基准套件：[`benchmark/`](../../../benchmark/README.md)（vitest bench / Tinybench，确定性输入）
> 运行环境：Windows 11 x64，Node v26.5.0，pnpm 10.34.5（同一台机器同一次会话内采集前后数据）

## 方法论

1. **先测量后优化**：每轮先跑 `pnpm bench` 采集基线，优化后重跑同一套件对比；
   原始输出归档在 [`raw/`](raw/)。
2. **确定性输入**：`benchmark/lib/gen.ts` 零随机，任何运行输入字节一致，前后差异只来自代码。
3. **红线校验**：每轮优化后运行单元测试 + svelte-check + eslint/prettier，涉及运行时行为的轮次加跑相关 e2e；
   语义敏感的重写附差分测试（新旧实现对同一输入必须输出完全一致）。
4. **用户体验一致性**：优化不得改变任何可感知行为（错误行号、URL 可解析性、渲染结果、隐私零外联）。

## 基线总览（Round 1 采集，2026-08-20）

| 基准                   | 用例                   | mean             | 备注                     |
| ---------------------- | ---------------------- | ---------------- | ------------------------ |
| errorHandling          | 500 行×70 字符错误行   | **58.6 ms/次**   | 代码损坏期间每次按键都跑 |
| errorHandling          | 1000 行×100 字符错误行 | **116.1 ms/次**  | O(行×L⁴) 子串枚举        |
| serde 序列化 (pako L9) | 2KB 状态               | 0.19 ms          | 典型小图，可忽略         |
| serde 序列化 (pako L9) | 100KB 状态             | **6.54 ms**      | 每次状态发布（每次按键） |
| serde 序列化 (pako L9) | 1MB 状态               | **45.6 ms**      | 极端大图                 |
| serde 反序列化         | 1MB 状态               | 4.56 ms          | 仅 URL 加载时            |
| JSON.stringify         | 1MB 状态               | 0.40 ms          | 序列化成本占比 <1%       |
| JSON.parse 配置        | 典型 / 100KB           | 0.5 µs / 93 µs   | 可忽略 → 取消独立优化轮  |
| sanitize               | 典型 / 100KB           | 0.4 µs / 53 µs   | 可忽略 → 不设轮          |
| visual parseFlowchart  | 100 / 500 边           | 0.198 / 1.40 ms  | Round 6 靶点             |
| visual generateCode    | 100 / 500 边           | 0.033 / 0.179 ms | 尚可                     |
| visual layoutGraph     | 100 / 500 边           | 0.032 / 0.282 ms | 尚可                     |

**deflate 级别研究**（`benchmark/studies/deflate-level.mjs`，中位数）：

| 负载  | L6 时间 | L9 时间 | 提速     | URL 长度代价          |
| ----- | ------- | ------- | -------- | --------------------- |
| 2KB   | 0.17 ms | 0.16 ms | ~0       | **+0.0%**（尺寸相同） |
| 100KB | 2.65 ms | 6.38 ms | **2.4x** | +0.7%                 |
| 1MB   | 24.5 ms | 43.3 ms | **1.8x** | +2.1%                 |

## 轮次与报告

| 轮次 | 优化点                                                                 | 状态 | 报告                                                                                                                      |
| ---- | ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | 基准设施 + 全量基线                                                    | ✅   | 本文件 + [raw/round1-baseline.txt](raw/round1-baseline.txt)、[raw/round1-deflate-level.txt](raw/round1-deflate-level.txt) |
| 2    | `findMostRelevantLineNumber` 算法重写                                  | ✅   | [round2-errorhandling.md](round2-errorhandling.md)                                                                        |
| 3    | 序列化热路径（deflate L6 + 惰性 serialized + 视图链接防抖 + 写入去重） | ✅   | [round3-serialization.md](round3-serialization.md)                                                                        |
| 4    | 发布管线复合优化（集成基准 updateCode 端到端）                         | ✅   | [round4-publish-pipeline.md](round4-publish-pipeline.md)                                                                  |
| 5    | 初始包体（构建产物对比 + 懒加载决策）                                  | ✅   | [round5-bundle.md](round5-bundle.md)                                                                                      |
| 6    | 可视化编辑器 model（parseFlowchart 扫描器等）                          | ✅   | [round6-visual-model.md](round6-visual-model.md)                                                                          |
| 7    | PNG 导出等待路径（固定 1s → 事件驱动，1037→75ms）                      | ✅   | [round7-export-latency.md](round7-export-latency.md)                                                                      |
| 8    | 编辑器标记应用去重（拖拽期间 59→0 次）                                 | ✅   | [round8-editor-markers.md](round8-editor-markers.md)                                                                      |

## 数据驱动的范围调整（诚实记录）

- **取消**「配置 JSON.parse 缓存」独立轮：基线显示典型配置解析 0.5µs，100KB 也仅 93µs，
  无可测收益。缓存实现并入 Round 3/4 的复合优化（顺手为之，不单独立轮）。
- **不设** sanitize 轮：53µs@100KB，加载分享链接时一次性开销，无优化价值。
- 每轮报告头附机器与环境说明，跨机器数据不可比。
