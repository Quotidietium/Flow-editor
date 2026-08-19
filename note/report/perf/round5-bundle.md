# Round 5 — 初始包体优化（示例目录懒加载 + 依赖清理）

> 日期：2026-08-20｜环境：Windows 11 x64 / Node v26.5.0 / Vite 生产构建
> 涉及：`src/lib/util/mermaid.ts`、`src/lib/components/Preset.svelte`、`src/lib/util/mermaid.test.ts`、`package.json`（移除 `plausible-tracker`）

## 问题

1. `@mermaid-js/examples` 示例目录（全部图型的示例代码文本）被 `mermaid.ts`
   **静态导入**，混在启动即加载的共享 chunk 里（含它的 chunk gzip 后 63.5KB），
   但只有「Sample Diagrams」卡片需要它。
2. `plausible-tracker` 自 2.0.69 隐私精简后零引用，仍留在 `dependencies`。

## 改动

1. **示例目录动态导入**：`getSampleDiagrams()` 改为 async（`await import(...)`);
   类型改用 `typeof import('@mermaid-js/examples')` 推导（无运行时导入）。
   `Preset.svelte` 挂载即发起加载（与关键路径并行、不阻塞渲染），ZenUML 附加项
   立即渲染，目录到达后填充；`diagramOrder` 改为 `$derived` 并过滤未就绪项
   （修复过程中发现并纠正了初始渲染对未就绪键的 `undefined.length` 崩溃——
   e2e 全线失败暴露、修复后全绿，见验证节）。
2. **移除 `plausible-tracker` 依赖**（`pnpm install` 已同步 lockfile）。

## 构建产物对比（同机构建）

| 指标                    | 优化前                                             | 优化后                                                           |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| examples 数据所在 chunk | 静态共享 chunk（整块 gzip 63.5KB，含其他共享代码） | 独立**动态** chunk：`DUkWpmZF2.js`，raw 43.1KB / **gzip 14.6KB** |
| 该 chunk 静态引用方     | 多个启动 chunk 静态引用                            | **零静态引用**（仅动态 import；index.html 无 modulepreload）     |
| immutable 总体积        | ≈23,529.8 KB                                       | 23,532.2 KB（+2.4KB 加载垫片，无膨胀）                           |
| edit 路由节点 chunk     | 997,577 B                                          | 997,732 B（+155B）                                               |

效果解读：

- 示例数据（14.6KB gzip）移出**启动模块图**——不再阻塞首次可交互的解析/编译路径，
  在卡片挂载时并行拉取；
- 示例 chunk 获得**独立内容哈希**：应用代码迭代不再使其缓存失效（与项目
  vendor 分块的长缓存策略一致）；目录内容仅随 `@mermaid-js/examples` 版本变化。
- 明确不做的（红线/风险，记录在案）：Monaco/CodeMirror 懒加载会改变编辑器出现
  时机（体验红线）；ZenUML 注册延迟有解析回归风险，收益不明确。

## 验证

- 单测：118 通过 / 15 本机预存失败（与基线一致；`getSampleDiagrams` 测试改 async）
- svelte-check / eslint / prettier 通过
- e2e：`diagramUpdate` + `loadSite`（含示例点击）+ `noNetwork`（零外联保持）+
  `visualEditor` 共 **17 通过 / 3 预存 skip / 0 失败**
- 崩溃回归的发现与修复均有 e2e 证据：修复前 visualEditor/diagramUpdate 全超时
  （`#view` 不渲染），修复后全绿
