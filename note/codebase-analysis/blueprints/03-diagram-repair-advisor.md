# Skill Blueprint: diagram-repair-advisor（图语法修复建议）

> 自动生成自 codebase-analyzer｜分析时间：2026-08-19
> 源模块：`src/lib/util/errorHandling.ts`、`src/lib/util/state.svelte.ts:59-113`、`src/lib/components/Editor.svelte:49-82`

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| 推荐 Skill 名称 | `mermaid-live-repair-advisor` |
| 用途 | 对解析失败的 mermaid 代码给出最小 diff 修复建议，经用户确认后通过状态网关应用 |
| AI 替代等级 | 🧑‍💻 AI 辅助（用户确认后才应用） |
| 实施优先级 | 🥈 Strategic |
| 现状参照 | 商业版"AI Repair"仅外链 mermaid.ai（`Editor.svelte:63-76`）；本蓝图提供本地/自选端点替代 |

## 2. 触发场景与关键词

- 编辑器出现语法错误条（`TID.errorContainer`）时用户点"修复建议"
- "帮我修这个 mermaid 报错"
- CI 中 mermaid 文档渲染失败批量修复

```yaml
description: >-
  Suggest minimal-diff fixes for broken Mermaid diagram code based on parse
  errors, applied only after user confirmation via the state gateway.
  Triggered by: "修复图表", "fix mermaid error", "repair diagram", "语法错误修复".
```

## 3. 输入输出契约

### 输入数据模型（全部可从现有状态无副作用获得）

```typescript
interface RepairRequest {
  code: string;                 // inputState.code（只读快照）
  mermaidConfig: string;        // inputState.mermaid
  errorString: string;          // validatedState.current.error.toString()（已含重映射行号）
  errorMarkers: MarkerData[];   // validatedState.current.errorMarkers（types.d.ts:5-13）
}
interface RepairSuggestion {
  diagnosis: string;            // 一句话病因（中文/英文按用户语言）
  patchedCode: string;          // 修复后完整代码
  diffSummary: string[];        // 行级变更列表，如 ["L12: '->' → '-->'"]
  confidence: 'high' | 'medium' | 'low';
}
```

### 应用接口（复用现有网关，不新增写路径）

| 函数 | 签名 | 位置 | 契约 |
|------|------|------|------|
| `updateCode` | `(code, {updateDiagram?: boolean, resetPanZoom?: boolean})` | `state.svelte.ts:257` | 唯一合法应用途径；自动持久化+重校验+URL 同步 |
| `validatedState.current.error` | getter | `state.svelte.ts:144` | 修复成功的判定 = 应用后 error === undefined |

### 硬性契约

- **前置**：`validatedState.current.error instanceof Error`（仅在错误态出现入口）
- **后置**：应用后 `processState` 异步重跑；错误消失即成功，否则回滚按钮（History 手动快照先行为保障，见异常路径）
- **不变式**：绝不直接写 `inputState`（类型只读，`state.svelte.ts:41`）；建议必须保留用户注释（`%%` 行）与缩进风格
- **错误场景**：LLM 端点超时 → 静默禁用按钮并回退纯错误条；返回不可解析 JSON → 丢弃建议

## 4. 依赖清单

| 依赖 | 用途 | 关键接口 |
|------|------|---------|
| `validatedState` | 只读错误态 + 校验结果 | `state.svelte.ts:144-148` |
| `updateCode` | 应用修复 | `state.svelte.ts:257-274` |
| `addManualEntry` | 应用前快照（一键回滚） | `historyState.svelte.ts:83` |
| LLM 端点 | 生成建议（自部署可选，env 新增 `MERMAID_AI_ENDPOINT` 模式，对齐 `env.ts:1-10` 的 MERMAID_ 前缀约定） | OpenAI 兼容 chat/completions |
| `mermaid.parse` | 应用后的客观校验（网关自带） | `mermaid.ts:23-25` |

## 5. Skill 工作流设计

```markdown
### Step 1: 采集 — 从 validatedState.current 组装 RepairRequest（只读）
### Step 2: 预检 — 高置信本地规则先行（常见病：'->' 应为 '-->'、缺 end、class 名含空格、
          flowchart 方向值非法），命中则跳过 LLM（零成本、零延迟）
### Step 3: LLM 生成 — system prompt 限定"只输出 JSON、最小 diff、保留注释"；
          附 errorMarkers 行列号与前后 3 行上下文
### Step 4: 展示 — diff 视图 + diagnosis + confidence；用户 [应用] / [忽略]
### Step 5: 应用 — addManualEntry(快照) → updateCode(patchedCode) → 观察 validatedState：
          error 清除 → toast 成功；未清除 → 提示可从 History 回滚
### Step 6: 埋点 — logEvent('repairApplied', {confidence, source:'local'|'llm'})
          （新事件需加入 stats.ts:91-108 的 delaysPerEvent 注册表）
```

**Constraints**：
- Always 经 `updateCode` 应用；Never 绕过网关直接改 localStorage 或 URL
- Never 在无用户确认时自动应用（置信度再高也不行）
- Never 把完整代码发给端点之外的第Ｈ方；端点 URL 必须来自构建期 env，不可运行时任意配置
- Always 在错误态消失后隐藏建议（响应式绑定 error）

## 6. 所需工具权限

`Read`（状态模块）、`Bash(pnpm vitest run --dir src)`（验证）；若作为编辑器内功能实现，需要 `Write`（新组件与 env 扩展）。建议 allowed-tools：`Read Write Grep Bash`

## 7. 使用示例

✅ Do：用户代码 `A[Start -> B]` 报 "Parse error on line 3" → 建议面板显示 `L3: 'A[Start -> B]' → 'A[Start] --> B'`（confidence: high，local 规则命中）→ 用户点应用 → 图渲染成功
❌ Not：检测到错误后自动改写编辑器内容（用户未确认）；把 config 一起发给第三方端点（只发 code 与 error）

## 8. 参考材料

- 源文件：`src/lib/util/errorHandling.ts`（行号重映射）、`state.svelte.ts:59-113`（processState 错误分支）、`Editor.svelte:49-82`（错误条 UI 挂载点）
- 商业版对照：`Editor.svelte:63-76`（外链式 AI Repair 的 medium='ai_repair'）
- 回滚保障：`historyState.svelte.ts:83`（addManualEntry）
