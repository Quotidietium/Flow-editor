# Benchmark 套件

量化 `src/lib` 热点模块的性能，为每轮优化提供优化前/后对比数据。报告归档在
`note/report/perf/`（含原始输出 `note/report/perf/raw/`）。

## 运行方式

```bash
pnpm bench          # 全部基准（vitest bench，Tinybench 驱动）
pnpm vitest bench --run errorHandling   # 只跑名字匹配的文件
node benchmark/studies/deflate-level.mjs    # deflate 级别时间/尺寸权衡研究
node benchmark/studies/export-latency.mjs   # PNG 导出延迟（需 dev server 在 :3000）
node benchmark/studies/editor-sync-calls.mjs # 编辑器标记应用计数（需 dev server + 临时插桩，见 Round 8 报告）
```

## 文件清单

| 文件                            | 被测对象                                                 | 热点路径                   |
| ------------------------------- | -------------------------------------------------------- | -------------------------- |
| `errorHandling.bench.ts`        | `findMostRelevantLineNumber`                             | 代码解析失败期间的每次按键 |
| `serde.bench.ts`                | `serializeState` / `deserializeState` / `JSON.stringify` | 每次状态发布（每次按键）   |
| `config-parse.bench.ts`         | 配置 `JSON.parse`                                        | 每次发布 + 每次渲染        |
| `visual-model.bench.ts`         | `parseFlowchart` / `generateCode` / `layoutGraph`        | 可视化画布进入/操作        |
| `publish-pipeline.bench.ts`     | `updateCode`/`updateCodeStore` 端到端发布（真实 parse）  | 每次按键 / 视图选项变更    |
| `sanitize.bench.ts`             | `findUnsafeConfigPaths`                                  | 分享 URL / embed 配置加载  |
| `studies/deflate-level.mjs`     | pako level 1/4/6/9 权衡                                  | 序列化级别选型数据         |
| `studies/export-latency.mjs`    | PNG 导出 click→download 延迟                             | 导出等待路径（Round 7）    |
| `studies/editor-sync-calls.mjs` | 交互期间标记应用计数（需临时插桩）                       | 标记去重量化（Round 8）    |
| `lib/gen.ts`                    | 确定性输入生成器（零随机）                               | —                          |

## 方法论

- **确定性输入**：`lib/gen.ts` 无随机成分，任何机器任何一次运行输入字节一致，
  前后对比只反映被测代码差异。
- **基线算法极慢的用例**（errorHandling 大图）用 `{ iterations, warmupIterations }`
  钉死迭代数，避免 Tinybench 默认 500ms 时间窗把单次秒级调用放大成分钟级。
- **机器差异**：所有数字来自同一台开发机（见报告头），跨机器数字不可比；
  前后对比必须在同一机器同一次会话内采集。
- **报告口径**：以 `mean` / 中位为准；优化幅度 ≥3x 时噪声（<±10%）不影响结论，
  小幅优化在报告中标注为近似值。
