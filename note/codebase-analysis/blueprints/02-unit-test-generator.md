# Skill Blueprint: unit-test-generator（util 模块单测生成）

> 自动生成自 codebase-analyzer｜分析时间：2026-08-19
> 源模块：`src/lib/util/`（重点：`errorHandling.ts`、`autoSync.ts`、`stats.ts` —— 当前零单测）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| 推荐 Skill 名称 | `mermaid-live-unit-test-generator` |
| 用途 | 为 src/lib/util 纯函数生成与现有 11 个测试文件风格一致的 vitest 用例 |
| AI 替代等级 | 🤖 完全 AI 化（生成后由 CI 全量验证） |
| 实施优先级 | 🥇 Quick Win（ROI 最高） |
| 源代码行数 | 目标三文件合计 ~226 行 |

## 2. 触发场景与关键词

- "给 errorHandling 补测试"
- "autoSync 的节流状态机没有单测，补上"
- "为新加的 util 函数生成测试骨架"

```yaml
description: >-
  Generate vitest unit tests for mermaid-live-editor util modules, matching the
  colocated *.test.ts conventions. Triggered by: "补单元测试", "generate unit
  tests", "test coverage for util", "单测生成".
```

## 3. 输入输出契约

### 目标函数接口（从源码提取）

| 函数 | 签名 | 位置 | 已覆盖 |
|------|------|------|--------|
| `findMostRelevantLineNumber` | `(errorLineText: string, code: string) => number` | `errorHandling.ts:2` | 否 |
| `replaceLineNumberInErrorMessage` | `(msg: string, realLine: number) => string` | `errorHandling.ts:26` | 否 |
| `extractErrorLineText` | `(msg: string) => string` | `errorHandling.ts:37` | 否 |
| `recordRenderTime` | `(ms: number, updater: () => void) => void` | `autoSync.ts:15` | 否 |
| `shouldRefreshView` | `() => boolean` | `autoSync.ts:25` | 否 |
| `waitForRender` | `() => Promise<void>` | `autoSync.ts:41` | 否 |
| `logEvent` | `(name, data?) => void` | `stats.ts:112` | 部分（stats.test.ts 47 行） |

### 必测行为契约

**`findMostRelevantLineNumber`**（errorHandling.ts:2-23）
- 返回 1-based 行号；无任何公共子串（空串/空代码）→ `-1`
- 多行同分时返回**首个**最大匹配行（循环 `>` 比较保留先者，`:17`）
- 输入含空行/首尾空格的行为已定义（trimStart 仅用于缩进计算，匹配用原始行）

**`autoSync` 状态机**（autoSync.ts:15-39）
- 初始 `shouldSync=true`：`recordRenderTime(100)` 后 `shouldRefreshView()===true`
- `recordRenderTime(200)`（>150 阈值）→ 降级：`shouldRefreshView()===false` 且安排 1000ms 防抖；`vi.advanceTimersByTime(1000)` 后 updater 被调用一次且恢复 `shouldSync=true`
- `waitForRender()` 在降级期间 pending，渲染记录时 resolve

**`stats.logEvent` 防抖**（stats.ts:112-132）
- 同 key 事件在窗口内被吞（如 `history` 1 分钟）；`bannerClick`（0 延迟）不吞
- `plausible` 未初始化时 no-op；localhost 分支只 console.log

### 错误场景表（生成用例必须覆盖）

| 场景 | 输入 | 期望 |
|------|------|------|
| serde 未知前缀 | `"xyz:abc"` | throw `Unknown serde type: xyz`（serde.ts:54-55，已有测试可对照） |
| extractErrorLineText 非 mermaid 格式 | `"foo bar"` | `''` |
| findMostRelevant 空代码 | `("A", "")` | `-1` |
| localStorage JSON 损坏 | `readJSON('k','fallback')` | 返回 fallback（persist.svelte.ts:23-26） |

## 4. 依赖清单

| 依赖 | 用途 | 位置 |
|------|------|------|
| vitest（jsdom 环境） | 测试运行器 | `vite.config.js:38-55` |
| `vi.useFakeTimers` | autoSync 的 1000ms 防抖 / stats 窗口 | vitest 内建 |
| `src/tests/setup.ts` | 全局 setup（vitest-dom 等） | `vite.config.js:50` |
| 现有风格样例 | `serde.test.ts`(40 行)、`persist.svelte.test.ts`(66 行)、`stats.test.ts`(47 行) | 同目录 |
| `.svelte.ts` 模块说明 | runes 模块在 vitest 下需 `conditions:['browser']`（vite.config.js:37） | — |

## 5. Skill 工作流设计

```markdown
### Step 1: 读取目标函数源码 + 同目录任一现有测试文件（风格锚点：describe/it 命名、导入路径 `$/`/`$lib` 别名）
### Step 2: 提取函数契约（参数域、边界、副作用、模块级可变量——autoSync 的 shouldSync 是模块私有，需通过导出函数间接驱动）
### Step 3: 生成用例清单（正常 / 边界 / 错误三分），时间相关用例显式标注 fake timers
### Step 4: 写入 <name>.test.ts（与源码同目录）
### Step 5: 运行 pnpm vitest run --dir src 限定范围（CLAUDE.md:18 警告 worktrees 会混入测试，必须 --dir src）
### Step 6: 全绿后按 lint 规则自查（对象键字母序 5+ 键，eslint sort-keys）
```

**Constraints**：
- Always 用 `--dir src` 限定 vitest 范围；Never 依赖真实时间（全部 fake timers）
- Never 测 monaco/DOM 重依赖模块（monacoExtra.ts、DesktopEditor —— 属 E2E 范畴）
- Never 修改被测源码来"方便测试"——发现不可测点先报告
- Always 让新测试文件通过 `pnpm lint`（对象键序）与 `pnpm check`（类型）

## 6. 所需工具权限

`Read`、`Write`、`Grep`、`Bash(pnpm vitest run --dir src)`；建议 allowed-tools：`Read Write Grep Bash`

## 7. 使用示例

✅ Do：「为 autoSync.ts 生成单测」→ 产出 `src/lib/util/autoSync.test.ts`，含状态机迁移（同步→降级→防抖恢复→再同步）≥6 用例，`pnpm vitest run --dir src src/lib/util/autoSync.test.ts` 全绿
❌ Not：用真实 `setTimeout` 等待（测试慢且 flaky）；直接 import 模块私有 `shouldSync` 变量断言

## 8. 参考材料

- 源文件：`src/lib/util/errorHandling.ts`、`autoSync.ts`、`stats.ts:85-132`
- 风格样例：`src/lib/util/serde.test.ts`、`persist.svelte.test.ts`
- 命令约束：`CLAUDE.md:11-18`
