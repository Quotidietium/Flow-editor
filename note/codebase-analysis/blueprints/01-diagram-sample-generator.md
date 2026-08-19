# Skill Blueprint: diagram-sample-generator（示例图/文档片段生成）

> 自动生成自 codebase-analyzer｜分析时间：2026-08-19
> 源模块：`src/lib/components/Preset.svelte`、`src/lib/util/mermaid.ts`、`src/lib/components/DiagramDocumentationButton.svelte`

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| 推荐 Skill 名称 | `mermaid-live-sample-generator` |
| 用途 | 为指定 mermaid 图类型生成经 `mermaid.parse` 验证的示例图与文档深链片段 |
| AI 替代等级 | 🧑‍💻 AI 辅助（人工抽检渲染效果） |
| 实施优先级 | 🥈 Strategic |
| 源代码行数 | Preset 110 行 + mermaid.ts 68 行 |

## 2. 触发场景与关键词

- "给 mindmap 加两个新示例"
- "为新发布的图类型生成入门示例"
- "补一份 requirements 图的文档链接映射"

```yaml
description: >-
  Generate validated Mermaid diagram samples and documentation link fragments
  for the live editor sample gallery. Triggered by: "生成示例图", "add sample
  diagrams", "new mermaid examples", "文档链接映射".
```

## 3. 输入输出契约

### 数据模型（与现有代码对齐）

```typescript
// Preset.svelte:12-43 的 extras 结构（对齐 @mermaid-js/examples 的 SampleExample）
interface SampleExample {
  title: string;        // 示例名，Popover 列表显示用
  isDefault?: boolean;  // true 时排在最前（mermaid.ts:63-65）且点击类型名直接加载
  code: string;         // mermaid 源码
}
// extras: Record<string, SampleExample[]>   // key = 去掉 " (Diagram|Chart|Graph)" 的类型名
```

### 主要接口

| 函数/位置 | 输入 | 输出 | 副作用 |
|-----------|------|------|--------|
| `getSampleDiagrams()` `mermaid.ts:58` | 无 | `Record<string, SampleExample[]>`（默认示例在前） | 无 |
| `loadSampleDiagram()` `Preset.svelte:47` | diagramType + example | 调 `updateCode(code, {resetPanZoom:true, updateDiagram:true})` | 改全局状态 + 埋点 |
| 生成物 | 图类型 + 数量 | `SampleExample[]` JSON | 无（纯产出） |

### 验收规则（硬约束）

1. 每个生成的 `code` 必须能通过 `mermaid.parse`（可用项目内 `src/lib/util/mermaid.ts` 的 parse 在 Node 测试中批量校验，参考 `src/lib/util/mermaid.test.ts` 的现有做法）
2. `title` 不得与同类型现有示例重名（Preset.svelte:94 `{#each examples as example (example.title)}` 以 title 为 keyed each 的键）
3. 每个示例 10-40 行，注释（`%%`）不超过 2 处

## 4. 依赖清单

| 依赖 | 用途 | 位置 |
|------|------|------|
| `@mermaid-js/examples` | 现有示例库与类型来源 | `package.json:101`、`mermaid.ts:1` |
| `mermaid.parse` | 语法校验网关 | `mermaid.ts:23-25` |
| `docsUrl` | 文档深链前缀 | `env.ts:3`（默认 https://mermaid.js.org） |
| `MERMAID_THEMES`/`MERMAID_LOOKS` | 主题/外观合法值 | `constants.ts:29-42` |

## 5. Skill 工作流设计

```markdown
### Step 1: 解析输入 — 目标图类型 + 示例数量 + 难度梯度（入门/进阶）
### Step 2: 读取现有 extras 与 @mermaid-js/examples 同类型示例，避免语义重复
### Step 3: 生成候选 code（遵守图类型语法；流向 TB/LR 显式声明）
### Step 4: 校验 — 在 vitest 中对每个 code 跑 mermaid.parse，全绿才继续
### Step 5: 产出 extras 补丁（Preset.svelte:12-43 的 JSON 片段）+ 文档链接（docsUrl + /intro/syntax.html 锚点）
### Step 6: 人工抽检 — 浏览器中肉眼确认渲染效果（AI 输出标注"待人工验证"）
```

**Constraints**：
- Always 先 parse 校验再交付；Never 直接修改 `Preset.svelte` 而不跑 `pnpm test:unit`
- Never 生成使用 `securityLevel` 相关特性（click 回调、HTML 标签）的示例（会被 sanitize.ts 剥离或需 confirm）
- Never 使用项目中锁定的 mermaid ^11.16.1 尚不支持的语法（生成前 grep mermaid CHANGELOG）

## 6. 所需工具权限

`Read`（读 examples 包与 Preset）、`Grep`、`Write`（输出 JSON 草稿到 note/ 或临时目录）；建议 allowed-tools：`Read Grep Write Bash(pnpm vitest run)`

## 7. 使用示例

✅ Do：「为 erDiagram 生成 2 个示例：大学选课（入门）、医院挂号（进阶）」→ 输出 2 个 parse 通过的 SampleExample JSON + 医院示例含 4 实体 6 关系的说明
❌ Not：直接把生成代码写进 `Preset.svelte` 并提交（缺人工渲染验证）

## 8. 参考材料

- 源文件：`src/lib/components/Preset.svelte:12-53`、`src/lib/util/mermaid.ts:50-68`
- 测试参考：`src/lib/util/mermaid.test.ts`
- 文档：https://mermaid.js.org/intro/syntax.html
