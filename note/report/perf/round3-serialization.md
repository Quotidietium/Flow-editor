# Round 3 — 序列化热路径（deflate 级别 + 惰性序列化 + 防抖对齐）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0
> 涉及：`src/lib/util/serde.ts`、`src/lib/util/state.svelte.ts`、`tests/loadSite.spec.ts`、`src/lib/util/serde.test.ts`（快照）
> 原始输出：[raw/round1-baseline.txt](raw/round1-baseline.txt)、[raw/round3-serde.txt](raw/round3-serde.txt)、[raw/round1-deflate-level.txt](raw/round1-deflate-level.txt)

## 问题

`processState` 在**每次状态发布**（每次按键）同步执行 `serializeState`：
`JSON.stringify` → `deflate(level 9)` → base64。而序列化结果只有两个真正的消费者——
URL hash 写入（250ms 防抖）与 view/全屏链接——**突发输入期间的中间值从不被读取**，
属于纯浪费。且 level 9 是最慢的压缩档位。

## 改动

1. **deflate level 9 → 6**（`serde.ts`）：级别研究显示 L6 在 100KB 快 2.4x、
   1MB 快 1.8x，URL 仅 +0.7% / +2.1%；2KB 负载输出**字节相同**。
   任何级别的 deflate 流用同一个 inflate 解压，新旧 URL 双向兼容。
2. **惰性 `serialized`**（`state.svelte.ts`）：`validatedStateOf` 返回的对象上
   `serialized` 变为「首次读取时计算 + 按快照记忆」的 getter。读取方拿到的字符串
   与之前完全一致，只是计算被推迟到真正被读的那一刻。
3. **hash 写入改为无参防抖**：`updateHash` 在触发时读取**最新** validatedState，
   突发输入合并为「停顿后一次序列化 + 一次 replaceState」（时序与旧实现一致，
   旧实现的 debounce 本来就只用最后一个参数）。
4. **view/全屏链接同节奏防抖**（250ms）：`urls.current.view` 使用防抖后的 serialized
   快照——与地址栏 hash 的更新节奏完全一致（此前地址栏就是 250ms 延迟，链接与
   地址栏保持同相，用户不可分辨）。
5. **`urls.current.new` 预计算**：defaultState 的序列化是常量，模块加载时算一次，
   不再随派生重算反复压缩。

### 明确不做（红线决策，记录在案）

- **不防抖 localStorage 写入**：现状是每次变更同步落盘；防抖会让「输入后立即关标签页」
  丢失最后 <250ms 编辑，属于耐久性行为变化，超出「体验一致」红线。
- **不做相同 JSON 写入去重**：分析发现 codeStore 的实际写入均伴随字段变化
  （renderCount/updateDiagram 等），相同 JSON 重复写场景几乎不存在，收益为零。

## 性能对比

微基准（同机同套件，mean）：

| 用例                 | 优化前 (L9) | 优化后 (L6) | 提速            |
| -------------------- | ----------- | ----------- | --------------- |
| serializeState 2KB   | 0.19 ms     | 0.19 ms     | ~1x（尺寸相同） |
| serializeState 100KB | 6.54 ms     | **2.80 ms** | **2.3x**        |
| serializeState 1MB   | 45.6 ms     | **25.7 ms** | **1.8x**        |
| deserializeState 1MB | 4.56 ms     | 4.52 ms     | 不变            |

突发输入模型（10 次按键的连续输入，旧实现 = 10 次发布各压缩一次；新实现 =
停顿后 1 次）：

| 状态大小 | 旧总 CPU | 新总 CPU | 有效提速 |
| -------- | -------- | -------- | -------- |
| 100KB    | ~65 ms   | ~2.8 ms  | **~23x** |
| 1MB      | ~456 ms  | ~25.7 ms | **~18x** |

## 兼容性说明

- URL 格式仍为 `pako:<base64(deflate)>`；zlib 头随级别变化（`eNp`→`eJx` 前缀），
  解码端 inflate 与级别无关——**旧链接在新版本可读，新链接在旧版本也可读**。
- serde 快照测试与 loadSite 的 redirect 断言随之更新（断言语义从「level 9 头部」
  放宽为「pako 前缀」，更符合其本意）。

## 验证

- 单测：全量 `--dir src` 115 通过（15 失败为本机预存 localStorage 问题，与基线一致）
- svelte-check 0 错误 0 警告；eslint / prettier 通过
- e2e：`loadSite` + `diagramUpdate` + `errorDisplay` 全绿（13+ 通过 / 3 预存 gist skip）
