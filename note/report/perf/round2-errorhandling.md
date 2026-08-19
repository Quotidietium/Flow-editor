# Round 2 — errorHandling 行号匹配算法重写

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0
> 优化点：`src/lib/util/errorHandling.ts` `findMostRelevantLineNumber`
> 原始输出：[raw/round1-baseline.txt](raw/round1-baseline.txt)、[raw/round2-errorhandling.txt](raw/round2-errorhandling.txt)

## 问题

原实现对**每个代码行**枚举错误行的**每个子串**并做 `line.includes`：

```ts
for (const [i, line] of codeLines.entries()) {
  for (let j = 0; j <= errorLineText.length; j++)
    for (let k = j + 1; k <= errorLineText.length; k++)
      if (line.includes(errorLineText.slice(j, k))) ...
}
```

复杂度 O(行数 × L² × 行长)，L 为错误行长度。该函数在代码解析失败期间的
**每次按键**都会执行（`state.svelte.ts` processState 错误分支，最多调用两次）。

## 方案：后缀自动机（suffix automaton）

对错误文本**构建一次**后缀自动机（O(L) 状态/转移），随后将每个代码行按字符流式走
自动机（失配沿 link 上跳，均摊 O(1)/字符），行内最大匹配长度即「与错误文本的最长公共
子串长度」——与旧算法计算的量完全相同。总复杂度 O(L + 代码总字符数)。

语义保持（红线）：

- 每行取最长公共子串长度，**首个严格更大者胜出**、无公共字符返回 -1、空错误行返回 -1——与旧实现逐条对齐；
- 附加早停：某行已匹配整个错误文本时不可能再被超过（不影响结果）。

## 正确性证据（差分测试）

`src/lib/util/errorHandling.test.ts`（16 用例，全部通过）：

- 旧暴力实现**原样保留在测试文件中**作为参照；
- 差分用例：bench 生成器形状的大图（1000 行）、mermaid 语义用例、确定性 LCG 随机
  200 组输入、重复子串/后缀 link 回退、首个最大值优先、空输入、CJK 字符——
  新旧实现输出**全部一致**；
- 顺带补齐了 `replaceLineNumberInErrorMessage` / `extractErrorLineText` 的金样测试
  （此前该文件零测试，与 codebase-analysis 报告的「薄弱区」结论一致）。

## 性能对比（同机同套件，mean）

| 用例                                 | 优化前   | 优化后      | 提速      |
| ------------------------------------ | -------- | ----------- | --------- |
| 500 行 × 70 字符错误行（典型损坏图） | 58.6 ms  | **0.30 ms** | **~194x** |
| 1000 行 × 100 字符错误行（大图）     | 116.1 ms | **0.61 ms** | **~189x** |

> 用户视角：损坏代码期间的错误行号定位从最坏 ~116ms/按键 的 CPU 阻塞降为亚毫秒，
> 错误波浪线/错误条行为与之前完全一致。

## 验证

- 单测：`pnpm vitest run --dir src errorHandling` 16/16；全量 `--dir src` 115 通过
  （15 个失败为本机预存 localStorage 问题，与 2.0.67 基线一致）
- `pnpm check`：0 错误 0 警告；eslint / prettier（改动文件）通过
