# Round 6 — 可视化编辑器 model 优化（扫描器 / 边 ID / 布局）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0
> 涉及：`src/lib/util/visualEditor/model.ts`、新增 `model.golden.test.ts`（金样）、`benchmark/visual-model.bench.ts`（修复 parseFlowchart 用例引用）
> 原始输出：[raw/round1-baseline.txt](raw/round1-baseline.txt)、[raw/round6-visual-model.txt](raw/round6-visual-model.txt)

## 问题

`parseFlowchart` / `layoutGraph` 是进入可视化画布与画布操作的必经路径，存在三处浪费：

1. `scan()` 在**每个字符位置** `line.slice(i)` 分配剩余子串再跑 `^` 锚定正则
   （O(n²) 字节拷贝），且 9 个边记号逐一 `startsWith`（非 `-`/`=` 字符也要试）；
2. 解析中每创建一条边调用 `nextEdgeId(edges)`（线性扫描已用 ID）——总 O(E²)；
3. `layoutGraph` 分层用 `[...(layers.get(d) ?? []), id]` 重建数组——总 O(n²)。

## 改动（行为逐字节不变）

1. `NODE_RE` 改 **sticky（`y` 标志）**：在当前位置锚定执行，消除逐位置 slice 分配；
2. 边记号匹配前置首字符门（所有记号以 `-`/`=` 开头），其余字符直接走节点分支；
3. 解析内部改为**递增序列**生成边 ID（`E1, E2, …`，与 `nextEdgeId` 在只追加场景
   下的输出完全一致）；导出的 `nextEdgeId` 保持原样供画布组件使用；
4. `layoutGraph` 分层改为 push 追加。

## 正确性证据

- 先以**当前实现**捕获金样（`model.golden.test.ts`，5 组：形状/裸 ID/标签边、
  链式/文本式链接/分号/线型、注释与 subgraph 跳过计数、布局坐标内联快照、
  特殊字符往返不动点），优化后全部保持绿色；
- 原有 `model.test.ts` 15 用例（往返一致性等）不变通过；e2e `visualEditor` 2/2。

## 性能对比（同机同套件，mean）

| 用例                      | 优化前   | 优化后       | 提速             |
| ------------------------- | -------- | ------------ | ---------------- |
| parseFlowchart 100 边     | 0.198 ms | 0.186 ms     | ~1.07x           |
| **parseFlowchart 500 边** | 1.404 ms | **0.959 ms** | **1.46x**        |
| **layoutGraph 500 边**    | 0.282 ms | **0.137 ms** | **2.05x**        |
| generateCode 500 边       | 0.179 ms | 0.167 ms     | 未改动（噪声内） |

进入画布的组合成本（parse + layout，500 边）：1.69ms → 1.10ms（**1.55x**）。

> 明确不做：`normalizeLabeledLinks` 的 4 个正则合并为单遍交替——顺序替换的语义
> 在边角输入下与单遍不同，金样风险大于收益（当前 <1ms 已非瓶颈）。

## 验证

- 单测全量：123 通过（+5 金样）/ 15 本机预存失败（与基线一致）
- svelte-check 0 错误 0 警告；eslint / prettier 通过；e2e visualEditor 2/2
- 附带修复：`visual-model.bench.ts` 中 parseFlowchart 用例引用了已删除的
  `code100/code500` 常量（Tinybench 静默 NaN，Round 1 基线的 parse 数字采集于
  原始实现、依然有效；本次起用例恢复且直接命中修复后的实现）
