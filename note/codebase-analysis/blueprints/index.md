# Skill Blueprint 索引

> 自动生成自 codebase-analyzer｜分析时间：2026-08-19

| # | Blueprint | 组件 | AI 等级 | 优先级 | 文件 |
|---|-----------|------|---------|--------|------|
| 1 | diagram-sample-generator | 示例图/文档片段生成 | 🧑‍💻 AI 辅助 | 🥈 Strategic | [01-diagram-sample-generator.md](01-diagram-sample-generator.md) |
| 2 | unit-test-generator | util 模块单测生成 | 🤖 完全 AI 化 | 🥇 Quick Win | [02-unit-test-generator.md](02-unit-test-generator.md) |
| 3 | diagram-repair-advisor | 图语法修复建议 | 🧑‍💻 AI 辅助 | 🥈 Strategic | [03-diagram-repair-advisor.md](03-diagram-repair-advisor.md) |

## 实施路线图

### 立即实施（Quick Win）
1. **unit-test-generator** —— 目标三个零测试文件：`errorHandling.ts`、`autoSync.ts`、`stats.ts` 防抖逻辑。环境（vitest+jsdom+fake timers）全部就绪，纯增益。

### 规划实施（Strategic）
2. **diagram-repair-advisor** —— 复用现有错误条 UI 位与状态网关，默认关闭 + env 门控（对齐 `MERMAID_*` 前缀约定）。
3. **diagram-sample-generator** —— `mermaid.parse` 自动校验 + 人工渲染抽检后合入 `Preset.svelte` extras。

---

> 每个 Blueprint 文件包含创建对应 Skill 所需的完整设计规格（触发词、接口契约、依赖、工作流、Constraints、示例）。可直接作为 `skill-for-skills` 或人工创建 Skill 的输入。
