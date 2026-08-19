# Mermaid Live Editor（Flow-editor）代码分析报告 — 总索引

**分析时间**：2026-08-19
**分析范围**：`F:\Github\repo\Flow-editor`（develop 分支，HEAD `10ef944d`）
**分析模式**：完整分析（117 个源文件全量扫描，核心模块逐一精读）
**代码规模**：59 个 `.svelte` + 56 个 `.ts`，`src/` 约 8.5k 行
**技术栈**：SvelteKit 2 + Svelte 5 runes + TypeScript 6 + Vite 8 + Tailwind CSS 4，纯静态 SPA

## 报告目录

| 报告                                        | 内容概要                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [01 项目架构](01-architecture.md)           | 分层结构、模块依赖图、状态管理模式、技术栈全景、函数级调用链（击键→状态→渲染）                                                             |
| [02 运行原理](02-operation-principles.md)   | 启动时序、三大数据流（编辑循环/渲染管线/URL 分享）、autoSync 节流状态机、History 状态机、embed 子系统、安全模型、错误处理链                |
| [03 工作流分析](03-workflow.md)             | 开发命令、CI/CD 四管线、发布流水线（develop→release-promotion PR→master→Pages/Netlify/Docker）、测试矩阵、8 大业务流程决策树、异常恢复路径 |
| [04 AI 替代方案](04-ai-substitution.md)     | 12 模块六维评分、ROI 矩阵、三阶段改造路线图、函数级契约下钻、负面清单（不可 AI 化部分）                                                    |
| [Skill Blueprint 索引](blueprints/index.md) | 3 份可直接落地的 Skill 设计规格                                                                                                            |

## 核心发现（TL;DR）

1. **单一状态网关是全项目枢纽**：`src/lib/util/state.svelte.ts` 的 `update()`（:135-140）是唯一合法写入路径 —— 所有变更经它完成「持久化 localStorage → mermaid.parse 异步重校验 → validatedState 发布 → 250ms 防抖回写 URL hash」。读懂这一个文件就读懂了数据流的主干。
2. **URL 即产品**：分享、mermaid.ink 图片、Kroki、Mermaid Chart 链接全部由 `pako:` + base64(deflate) 序列化态派生（`serde.ts`）；隐私承诺「图内容永不离开浏览器」由埋点剥离 hash 保证（`stats.ts:31-33`）。
3. **双画布隔离设计**：`/edit` 的 `View.svelte` 绑定全局状态单例；`/embed` 的 `EmbedView.svelte` 纯 props 驱动且明令禁止导入状态单例 —— iframe 同源（sandbox 需 allow-same-origin）场景下靠代码纪律而非浏览器机制隔离 localStorage。
4. **自动化程度已很高**：renovate/dependabot 依赖机器人、develop→master 的 release-promotion 自动 PR、Netlify PR 预览、Playwright 对生产构建的 e2e；剩余人工成本集中在依赖审查与测试补齐。
5. **明确的技术债**：`errorHandling.findMostRelevantLineNumber` 的 O(行数×错误行长²) 暴力匹配（`errorHandling.ts:2-23`）、ZenUML 后整页刷新 hack（`state.svelte.ts:66-69`）、导出 PNG 的 1s 固定等待（`Actions.svelte:110`）。

## 关键建议

1. **先补测试再动刀**：`errorHandling.ts` / `autoSync.ts` / `stats.ts` 防抖均为零单测，是未来任何重构的前置风险（详见 [blueprints/02](blueprints/02-unit-test-generator.md)，🥇 Quick Win）。
2. **本地修复建议替代外链**：现有 AI Repair 只是跳转 mermaid.ai；按 [blueprints/03](blueprints/03-diagram-repair-advisor.md) 的网关复用方案可在自部署版提供等价能力。
3. **保持三类不变式**：序列化格式向后兼容、`update()` 网关不可绕过、embed 页零状态导入 —— 这三点分别对应分享链接存量、状态一致性、嵌入安全（详见 04 报告负面清单）。

---

_本报告由 codebase-analyzer 生成；所有论断均附 `文件:行号` 证据，可用 `grep`/IDE 直接复核。_

---

## 增补：2026-08-20 性能优化后的技术债状态（v2.0.71）

本报告分析于 2.0.67（develop）。`feat/perf-optimization` 分支（2.0.71）已解决其中
标记的技术债，量化数据与原始基准见 [`note/report/perf/`](../report/perf/README.md)：

1. **`errorHandling.findMostRelevantLineNumber` 的暴力匹配**（01 报告 §10.2、04 报告
   §2.6）→ 已用后缀自动机重写（~190x，差分测试保证输出逐字节一致）。
2. **导出 PNG 的 1s 固定等待**（01 报告 §10.5）→ 未动（导出链路，属功能行为）。
3. **ZenUML 整页刷新 hack** → 保留（语义风险）。
4. 其余新增优化：serde deflate L6 + 惰性序列化、mermaid.parse 代码级缓存、示例目录
   动态 chunk、可视化 model 扫描器/布局优化——详见各轮报告。
