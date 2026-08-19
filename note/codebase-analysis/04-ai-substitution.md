# Mermaid Live Editor — AI 工作流替代方案报告

> 分析时间：2026-08-19
> 评估维度（各 1-5 分，总分 30）：确定性 / 输入结构化程度 / 安全风险（分高=风险低）/ 领域复杂度（分高=通用）/ 上下文窗口需求（分高=局部即可）/ 重复性
> 等级：🤖 完全 AI 化（24-30）｜🧑‍💻 AI 辅助（15-23）｜👤 人工主导（6-14）

---

## 1. 模块级评估总表

| # | 模块 | 确定性 | 结构化 | 安全 | 领域 | 上下文 | 重复性 | 总分 | 等级 |
|---|------|--------|--------|------|------|--------|--------|------|------|
| 1 | 单元测试生成（util 纯函数） | 4 | 5 | 4 | 4 | 5 | 4 | 26 | 🤖 |
| 2 | 项目文档/分析报告维护 | 4 | 4 | 5 | 4 | 4 | 4 | 25 | 🤖 |
| 3 | 示例图/文档片段生成（Preset、DiagramDocButton 数据） | 4 | 4 | 4 | 3 | 4 | 4 | 23 | 🧑‍💻 |
| 4 | 图语法错误修复建议（errorHandling → 修复提案） | 3 | 4 | 4 | 2 | 4 | 4 | 21 | 🧑‍💻 |
| 5 | 依赖升级 PR 审查（renovate/dependabot 产物） | 3 | 5 | 3 | 3 | 4 | 4 | 22 | 🧑‍💻 |
| 6 | `errorHandling.findMostRelevantLineNumber` 算法优化 | 3 | 5 | 4 | 4 | 4 | 2 | 22 | 🧑‍💻 |
| 7 | E2E 测试编写/维护 | 3 | 4 | 3 | 3 | 3 | 4 | 20 | 🧑‍💻 |
| 8 | embed 片段/URL 生成（embedCode.ts） | 5 | 5 | 3 | 5 | 5 | 1 | 24* | 🤖* |
| 9 | 状态网关核心（state.svelte.ts） | 4 | 4 | 2 | 3 | 2 | 1 | 16 | 👤 |
| 10 | 安全消毒（sanitize.ts） | 5 | 4 | 1 | 3 | 4 | 1 | 18 | 👤 |
| 11 | 渲染管线（View/renderView/panZoom） | 3 | 3 | 3 | 2 | 2 | 1 | 14 | 👤 |
| 12 | 架构决策/构建配置（vite/svelte config） | 2 | 3 | 2 | 2 | 2 | 1 | 12 | 👤 |

\* 注：embedCode.ts 已是确定性纯函数（`embedCode.ts:144` 注释 "Pure + deterministic"），用 AI"替代"毫无收益 —— 该行仅说明其可预测性，实际策略是**保持代码实现**。

---

## 2. 模块评估卡片

### 2.1 单元测试生成 — 🤖 完全 AI 化（26/30）⭐ Quick Win

- **现状**：11 个 `*.test.ts` 与源码同目录；纯函数模块（serde、sanitize、persist、redirect、migrations、embed、embedCode、stats、state、historyState）测试模式高度一致（构造输入 → 断言输出/副作用）
- **AI 方式**：读取被测函数 + 现有测试风格样例 → 生成边缘用例（空值、损坏 JSON、超长输入、非法前缀）。薄弱区明确：`errorHandling.ts`、`autoSync.ts`、`monacoExtra.ts` 无单测
- **实施难度**：低（vitest + jsdom 环境已就绪，`vite.config.js:38-55`）
- **预期收益**：薄弱模块覆盖从 0 → 70%+；回归防护显著
- **风险**：涉及 DOM 的用例需人工复核选择器；时间相关（debounce/interval）用例需 fake timers
- **对应 Blueprint**：[blueprints/02-unit-test-generator.md](blueprints/02-unit-test-generator.md)

### 2.2 文档/分析报告维护 — 🤖 完全 AI 化（25/30）⭐ Quick Win

- **现状**：`CLAUDE.md` 人工维护（5.4KB，上一次更新 commit `f8836bb1`）；无系统化架构文档；`note/` 体系刚建立
- **AI 方式**：以本报告为基线，代码变更后增量更新（调用链、localStorage 键清单、安全模型等均可用 grep 精确校验）
- **实施难度**：低；**收益**：新人上手时间减半；**风险**：需防止编造行号 —— 要求全部引用可 grep 复核（本报告即按此标准编写）
- **对应 Blueprint**：[blueprints/01-diagram-sample-generator.md](blueprints/01-diagram-sample-generator.md)（同类"文档资产生成"模式）

### 2.3 示例图库生成 — 🧑‍💻 AI 辅助（23/30）🥈 Strategic

- **现状**：示例图来自 npm 包 `@mermaid-js/examples`（`mermaid.ts:1,58-68`）；本地仅 ZenUML 一组硬编码补充（`Preset.svelte:12-43`）；`DiagramDocumentationButton.svelte`（116 行）按 `diagramType` 深链文档
- **AI 方式**：为指定图类型批量生成"最小可运行示例 + 递进示例"，人工验证渲染效果后入库；生成 `DocumentationConfig` 片段
- **难点**：mermaid 语法随版本演进，AI 生成的语法必须经 `mermaid.parse` 实测（可完全自动化把关）
- **对应 Blueprint**：[blueprints/01-diagram-sample-generator.md](blueprints/01-diagram-sample-generator.md)

### 2.4 图语法修复建议 — 🧑‍💻 AI 辅助（21/30）🥈 Strategic

- **现状**：语法错误仅做行号重映射（`errorHandling.ts`）与波浪线标记；"AI Repair"按钮直接跳转 mermaid.ai 付费产品（`Editor.svelte:63-76`），自部署版无任何本地修复能力
- **AI 方式**：本地（或自选 LLM 端点）对 `{code, errorString, errorMarkers}` 做「最小 diff 修复建议」，用户确认后经 `updateCode` 应用 —— 状态网关保证了任何修复都自动走持久化+重校验链路，天然安全
- **约束**：绝不绕过 `update()` 网关；建议需保留用户注释/格式（用 diff 而非整文件替换）
- **对应 Blueprint**：[blueprints/03-diagram-repair-advisor.md](blueprints/03-diagram-repair-advisor.md)

### 2.5 依赖升级 PR 审查 — 🧑‍💻 AI 辅助（22/30）🥉 Incremental

- **现状**：renovate/dependabot 每周多 PR（git log 显示高频 `fix(deps)` 合并）；monaco/pako/js-base64/svg-pan-zoom 精确锁版需人工判断升级影响（序列化兼容性、渲染正确性）
- **AI 方式**：读取 PR diff + 本报告的「锁定版本原因」→ 输出升级影响面分析（是否触碰 serde 格式 / 渲染路径）→ 人工决策
- **收益**：审查时间从 ~30 分钟/PR 降到 ~5 分钟

### 2.6-2.12 其余模块（摘要）

- **`findMostRelevantLineNumber` 优化（22 分）**：现算法 O(行数×错误行长²)（`errorHandling.ts:9-16`）。AI 可辅助改写为后缀数组/最长公共子串 DP，但**必须**保留 11 个既有语义测试基线并新增对拍用例（当前该文件无测试，先补测试再优化）
- **E2E 维护（20 分）**：Playwright spec 结构统一（`TID` 选择器 + `tests/utils.ts`），AI 生成新 spec 草稿可行，但本地 flaky（CLAUDE.md:19）需人工跑 `--workers=1` 复核
- **状态网关（16 分）/ 渲染管线（14 分）/ 架构配置（12 分）**：Svelte 5 runes 语义精妙（untrack 边界、$state.raw 整替、防击键回滚），错误代价是全局状态错乱，保持人工主导
- **sanitize.ts（18 分）**：规则本身简单确定，但属于**安全边界**——任何修改都应人工审计 + `sanitize.test.ts` 全绿后再合入。AI 可用于"发现新的危险模式"提案，不可自动合入

---

## 3. ROI 优先级矩阵

```
                 高收益
                   │
   🥈 2.3 示例图库  │  🥇 2.1 单元测试生成
   🥈 2.4 修复建议  │  🥇 2.2 文档维护
                   │
低难度 ────────────┼──────────── 高难度
                   │
   🥉 2.5 依赖审查  │  📋 渲染管线重构
   🥉 2.6 算法优化  │  📋 状态架构演进
                   │
                 低收益
```

## 4. AI 改造路线图

### Phase 1 — Quick Wins（本月，纯增益无风险）
1. **单元测试生成**（Blueprint 02）：先补 `errorHandling` / `autoSync` / `stats` 防抖逻辑的测试 —— 这三处恰是未来一切重构的安全网
2. **文档基线固化**（本报告系列）：纳入 `note/`，后续每次大 PR 附带文档增量更新

### Phase 2 — Strategic（本季度）
3. **图修复建议原型**（Blueprint 03）：挂在现有错误条旁（复用 `TID.aiRepairButton` 邻近 UI 位），默认关闭、设置项开启，走自选 LLM 端点
4. **示例图生成管线**（Blueprint 01）：`mermaid.parse` 全量校验 + 人工抽检后合入 `Preset.svelte` extras

### Phase 3 — Incremental（本年度）
5. 依赖升级影响面自动分析（结合锁定版本清单）
6. `findMostRelevantLineNumber` 算法重写（先建对拍基线）
7. E2E spec 草稿生成

---

## 5. 函数级下钻（Phase 1 候选模块）

### 5.1 `errorHandling.ts`（当前 0 测试，47 行，3 个导出函数）

| 函数 | 签名 | 位置 | 行数 | AI 替代潜力 |
|------|------|------|------|------------|
| `findMostRelevantLineNumber` | `(errorLineText: string, code: string) => number` | `errorHandling.ts:2` | 22 | 测试生成 🤖；算法重写 🧑‍💻 |
| `replaceLineNumberInErrorMessage` | `(msg: string, realLine: number) => string` | `errorHandling.ts:26` | 10 | 测试生成 🤖 |
| `extractErrorLineText` | `(msg: string) => string` | `errorHandling.ts:37` | 11 | 测试生成 🤖 |

接口契约（测试生成所需）：
- `findMostRelevantLineNumber`：前置 = errorLineText 非空；后置 = 返回 1-based 行号或 -1（无匹配）；边界 = 空代码返回 -1；全同行文本应选**首个**最大匹配行
- `extractErrorLineText`：仅识别 `Parse error on line N:` 与 `Lexical error on line N` 两种模式，切片去掉前 3 字符（`match[1].slice(3)`）；无匹配返回 `''`
- 依赖上下文：真实 mermaid 报错样例可从 `state.svelte.ts:21-30`（urlParseFailedState）与 `state.svelte.ts:76-110` 的消费方式反推

### 5.2 `autoSync.ts`（当前 0 测试，43 行，3 个导出 + 2 模块常量）

| 函数 | 签名 | 位置 | 契约要点 |
|------|------|------|---------|
| `recordRenderTime` | `(renderTimeMs: number, updater: () => void) => void` | `autoSync.ts:15` | ≤150ms 保持同步；>150ms 置降级并安排防抖；resolve 上一个等待句柄 |
| `shouldRefreshView` | `() => boolean` | `autoSync.ts:25` | 降级中返回 false 且安排 1s 批量；首次调用惰性创建 renderPromise |
| `waitForRender` | `() => Promise<void>` | `autoSync.ts:41` | 无 pending 时立即 resolve |

测试要点：用 `vi.useFakeTimers()` 控制 1000ms 防抖；断言 `updater` 恰好被调用一次；慢/快渲染交替时状态机迁移（同步→降级→恢复）。

### 5.3 `serde.ts`（已有 40 行测试，可加码）

函数契约：`serializeState(state, 'pako')` 输出恒以 `pako:` 前缀；`deserializeState` 接受无前缀（旧 base64）、`pako:`、`base64:` 三形态；未知前缀抛 `Unknown serde type`（`serde.ts:54-55`）。AI 增益点：超大 State（1MB 代码）的往返属性测试（property-based）。

---

## 6. 明确不建议 AI 化的部分（负面清单）

1. **`sanitize.ts` 规则本体** —— 安全边界，规则来自 mermaid 官方 `sanitize` 的镜像（`sanitize.ts:15-16,33-35` 注释），演进必须跟随 mermaid 上游
2. **`state.svelte.ts` 的 `update()` 网关与 `untrack` 语义** —— 2025 年底刚经历一轮竞态修复（commits `6a9a306e`/`144b4dc1`/`d2f067a5`），任何"简化"都可能复活已修复的 bug
3. **序列化格式（pako+base64）** —— 是十年分享链接的兼容承诺（`serde.ts:57-60` 旧格式仍可读），不可变更
4. **embed 沙箱策略**（`IFRAME_SANDBOX` 两处镜像，`embed-loader.ts:24` 与 `embedCode.ts:16`）—— 修改需安全评审

---

## 7. Blueprint 索引

| # | Blueprint | 组件 | AI 等级 | 优先级 |
|---|-----------|------|---------|--------|
| 1 | [diagram-sample-generator](blueprints/01-diagram-sample-generator.md) | 示例图/文档片段生成 | 🧑‍💻 AI 辅助 | 🥈 Strategic |
| 2 | [unit-test-generator](blueprints/02-unit-test-generator.md) | util 模块单测生成 | 🤖 完全 AI 化 | 🥇 Quick Win |
| 3 | [diagram-repair-advisor](blueprints/03-diagram-repair-advisor.md) | 图语法修复建议 | 🧑‍💻 AI 辅助 | 🥈 Strategic |

> 每个 Blueprint 是自包含的 Skill 设计规格，可直接交给 `skill-for-skills` 或人工创建对应 Skill。
