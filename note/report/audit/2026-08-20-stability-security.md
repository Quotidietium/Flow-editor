# 稳定性与安全性审计报告（网络服务暴露前置检查）

> 审计时间：2026-08-20｜版本：2.0.76 → 2.0.77
> 范围：不信任输入面、长期高负载稳定性、数据操作正确性、功能与表述一致性
> 方法：逐输入面代码审计 + 修复 + 针对性测试（含「去修复验证测试有效」的负证法）

## 威胁模型

纯静态 SPA 无自建后端，但作为网络服务暴露时不可信输入包括：
URL hash（pako/base64 状态）、/embed 的全部 query 与 hash（含 `#code:` 任意代码）、
localStorage（同源可手改：codeStore、history、visualEditorLayout 等）、
上传的历史 JSON 文件、宿主页传给 web component 的属性与内联代码。
所有用户输入均按「客户端可被修改」对待。

## 第 1 轮：不可信输入与数据操作（commit 2a2f7658）

| #   | 问题                                                                                                                                                                                           | 严重性 | 修复                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| 1   | `writeJSON` 在 localStorage 配额满/禁用时抛异常，且位于状态网关 `update()` 调用链内——异常会丢弃进行中的发布，**编辑输入直接中断**（长期运行 localStorage 逐渐填满即触发）                      | 高     | `writeJSON` 内 try/catch + warn，持久化为尽力而为；配额注入测试 `persist.quota.test.ts`             |
| 2   | `processState` 并发发布乱序：mermaid.parse 耗时随图大小变化，快速输入下**慢的旧解析后完成会覆盖新状态**，编辑器与 URL hash 停留在过期图                                                        | 高     | 发布带序号（seq guard），被超越的发布直接丢弃；`state.publish.test.ts`（已验证：移除守卫测试转红）  |
| 3   | `generateMindmap` 递归 emit：手工构造每行递增缩进的 mindmap（数千层）→ **栈溢出** RangeError                                                                                                   | 中     | 显式栈迭代 DFS；6000 层深树测试                                                                     |
| 4   | 各类型解析器对超长单行（惰性量词）二次方退化 → **ReDoS 冻结页面**                                                                                                                              | 中     | 行长护栏（>10k 字符跳过并计数 skipped）；四类图 + mindmap 测试                                      |
| 5   | `visualEditorLayout`（localStorage）直接消费：坏值把 NaN 注入节点坐标并传播到全部几何计算与 SVG 属性                                                                                           | 中     | `sanitizePositions` 白名单校验（有限数字对）；测试覆盖 NaN/Infinity/字符串/数组/null                |
| 6   | 历史导入：`JSON.parse` 无 try/catch（静默 unhandled rejection）、无文件大小上限、`restoreEntries` 无条数上限（可灌爆无截断的 manual store，进而触发问题 1）、`validateEntry` 不校验 state 结构 | 中     | 5MB 文件上限 + 解析/格式错误 toast + 单次恢复上限 200 条 + state 结构校验；`historyRestore.test.ts` |

## 第 2 轮：embed 暴露面、渲染路径与状态机（commit 09c07536）

| #   | 检查项                                                                     | 结论                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/embed` 的 `?pan/?zoom` 仅校验有限性：`zoom=1e308` 产生病态 pan-zoom 变换 | **修复**：pan 夹 ±1e6、zoom 夹 [0.01,1000]，query 与 hash 状态两侧生效；测试                                                                                                                                |
| 2   | embed-loader 属性透传                                                      | 干净：`searchParams.set`/`encodeURIComponent` 自动编码；width/height 走 CSSOM 属性赋值（无法注入）；src origin 钉死 embed.js 宿主                                                                           |
| 3   | 渲染输出 XSS 面                                                            | 干净：mermaid 渲染受 securityLevel 管控（embed 强制 strict；edit 页 loose 需用户显式 confirm）；错误消息/toast/History 名称/可视化画布全部经 Svelte 文本插值自动转义；`renderView` 的 `viewId` 为内部生成值 |
| 4   | `autoSync` 渲染节流状态机（此前零测试）                                    | 语义核实闭合（防抖链条经 View 去重检查自然终止，无死循环）；补 4 个 fake-timer 测试钉住：同步保持/降级批量合并为单次 updater/快渲染恢复/waitForRender 解除时机                                              |
| 5   | DesktopEditor 状态↔编辑器同步回路                                          | 闭合：`currentText` 更新、`finally` 恢复 `isUpdatingFromState`、标记去重（2.0.72）                                                                                                                          |
| 6   | hashchange 重入（连续粘贴链接）                                            | 安全：`updateHash` 无参防抖 flush 读最新态；`initURLSubscription` 重建不泄漏                                                                                                                                |
| 7   | 死代码：`loadingState` 全屏遮罩                                            | `initLoading` 最后调用者在 2.0.69 被删，遮罩永不显示（表述与实现不符）——**删除**模块、布局块与 `LoadingState` 类型                                                                                          |

## 验证记录

| 项                               | 结果                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| 新增单测                         | 15 个（quota 2、publish-order 2、restore 2、hardening 3、autoSync 4、embed clamp 2） |
| 测试有效性负证                   | 临时移除发布序号守卫 → 乱序测试转红 → 恢复 → 转绿                                    |
| 全量单测                         | 162 通过 / 15 本机预存失败（与 2.0.67 基线一致）                                     |
| 全量 e2e                         | 42 通过 / 3 预存 skip / 0 失败（每轮修复后复跑）                                     |
| svelte-check / eslint / prettier | 0/0 / 通过 / 通过                                                                    |

## 已知接受的残留风险（记录在案）

- **巨型 `#code:` hash**：浏览器 URL 长度上限天然约束（~2MB）；单次巨型渲染只影响打开者自身，无跨用户放大
- **edit 页 securityLevel=loose**：需用户在 sanitize confirm 中显式选择信任（分享链接对他人同样弹 confirm），属明确授权链
- **mermaid 库自身的解析器**：由上游保证，`parse` 失败已被状态网关 catch 并转为错误展示
- **多标签页并发写 localStorage**：同源多标签各自持有状态单例，最后写入者胜——与上游行为一致，无跨标签数据损坏路径（各键独立整替）

## 后续轮次候选（未发现新问题前不动作）

- service worker 缓存版本策略复查（PWA 升级路径）
- 分享链接生成的 URL 长度对极端大图的退化行为
- VisualEditor 高频拖拽下 `rememberPositions` 写入频率（当前每次 pointerup 一次，可接受）
