# Round 10 — 渲染放置与文本规范化重写：两项候选的测量否决

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0（jsdom 基准 + Chromium 差分）
> 涉及：`benchmark/render-placement.bench.ts`（新增）、`model.golden.test.ts`（差分测试）、
> 候选改动均已**回退**（本轮回撤、零行为变更）
> 原始输出：[raw/round10-render-before.txt](raw/round10-render-before.txt)、[raw/round10-render-after.txt](raw/round10-render-after.txt)

## 候选 1：renderView 作用域查询 —— 无可测收益，回退

**假设**：`renderAndPlaceDiagram` 用 `document.querySelector('#'+viewId)` 全文档
查找刚插入的 SVG，改为 `container.querySelector` 应有收益。

**基准**（`render-placement.bench.ts`：mock mermaid render 返回固定 SVG，
jsdom + 400 个干扰节点，稳定容器复用，200 次迭代）：

|                          | mean      |
| ------------------------ | --------- |
| 全文档查询（优化前）     | 0.0716 ms |
| 容器作用域查询（优化后） | 0.0720 ms |

**结论**：差异在 ±1.1% 噪声内——jsdom 的 `#id` 查询本身有索引、浏览器同样优化，
单次放置中的查询占比可忽略。**改动回退**（`git checkout`），基准保留为守卫。

## 候选 2：normalizeLabeledLinks 四遍正则合并单遍 —— 差分测试发现语义分歧，否决

**假设**：每行 4 次正则替换（Round 6 记录的遗留项）合并为单遍交替可减少约 30-40%
解析耗时。

**方法**：实现单遍版本 + **差分测试**（旧四遍实现原样保留在测试中作参照，
2000 组确定性随机行汤 + 12 组手工边角行）。

**结果**：差分立即捕获反例——形如 `' ==> … -. t .-> … '` 的重叠区域：

- 顺序版（现行）：虚线规则**先**执行（`-. t .->` → `-.->|t|`），随后粗箭头规则
  捕获含已重写文本的区域 → `==>｜> -.->|t||`;
- 单遍版：左优先匹配让 `==` 规则**整段吞掉**虚线原文 → `==>|> -. t .->|`。

两版输出不同 → 任何依赖文本式链接嵌套的输入将产生不同解析结果。**红线不可接受，
方案否决、代码回退**。这印证了 Round 6 当时的风险评估，并留下了具体反例。

**保留资产**：差分测试留在 `model.golden.test.ts`（现行为语义钉死，
未来任何「顺手优化」都会被同一语料拦截）；`normalizeLabeledLinks` 因此导出供测试。

## 本轮结论

两项候选均以数据否决，**无代码行为变更**（唯一的代码 diff 是导出一个纯函数
供测试 + 差分测试本身）。这是「每轮做完」的完成方式之一：测量 → 证据 → 决策，
并留下防回归资产。

## 验证

- 单测：model 22/22（含新增差分 2 用例）；全量 123 通过 / 15 本机预存失败
- svelte-check 0/0；eslint / prettier 通过（含新基准文件）
