# Flow 编辑器 API 参考

> 版本：2.0.96｜适用分支：`feat/perf-optimization`（栈尖）
> 本文面向**开发与代码维护**：按分层列出全部公开 API 的签名、语义、关键
> 不变式与测试指针。插件面向最终用户的写法见 `note/plugin-api.md`；
> 架构分析见 `note/codebase-analysis/`。

目录：

1. [状态网关（核心）](#1-状态网关核心--libutilstatesveltets)
2. [序列化 serde](#2-序列化--libutilserdets)
3. [渲染管线](#3-渲染管线)
4. [持久化](#4-持久化--libutilpistsveltets)
5. [可视化编辑器模型](#5-可视化编辑器模型--libutilvisualeditor)
6. [文件 IO 与导出](#6-文件-io-与导出--libutilfileiots)
7. [插件系统](#7-插件系统--libplugins)
8. [MCP 桥协议](#8-mcp-桥协议--libpluginsbridgets)
9. [Embed 子系统](#9-embed-子系统)
10. [安全与加固工具](#10-安全与加固工具)
11. [应用编排与杂项工具](#11-应用编排与杂项工具--libutilutilts)
12. [核心类型与常量](#12-核心类型与常量)
13. [不变式清单（维护红线）](#13-不变式清单维护红线)

---

## 1. 状态网关（核心）`src/lib/util/state.svelte.ts`

**全应用唯一可变状态源**。所有写入必须经 `update()` 网关：变更 →
`$state.snapshot` → 持久化 localStorage（`codeStore`）→ 异步
`mermaid.parse` 重校验 → 发布只读快照 → 250ms 防抖回写 URL hash。
发布带序号防乱序（慢的旧解析不会覆盖新状态）。

### 读取

```ts
export const inputState: Readonly<State>; // 只读输入态（含未校验中间态）
export const validatedState: {
  get current(): ValidatedState; // 最新已校验快照（含 error/errorMarkers/serialized/diagramType）
};
export const urls: {
  get current(): { new: string; view: string }; // 新建/只读分享链接（惰性 serialized）
};
```

- `validatedState` 从不持久化、从不外发；内部读取一律用它而非 `inputState`。

### 写入（全部经网关）

```ts
export const updateCode = (code: string, { updateDiagram = false }?: {
  updateDiagram?: boolean;   // true 强制下次渲染（绕过渲染去重）
}): void;

export const updateCodeStore = (newState: Partial<State>): void;  // 浅合并任意字段
export const updateConfig = (config: string): void;               // = updateCodeStore({ mermaid: config })
export const replaceInputState = (next: State): void;             // 整替（丢弃缺席键）
export const toggleDarkTheme = (dark: boolean): void;             // 联动 mermaid theme（仅 dark/default 间）
export const loadState = (data: string): void;                    // URL hash → 状态；失败展示排查示例图
export const verifyState = (): void;                               // 补默认 panZoom=true
export const initURLSubscription = (): void;                      // 建立 hash 回写订阅（防抖读最新态）
export const sanitizeConfig = (config: string | MermaidConfig): string;
// 检出危险配置（securityLevel/secure/XSS 串）→ confirm → 剥离；详见 §10
```

- `loadState` 成功分支会经**动态 import** 调用插件输入管道
  （`runInputTransforms(code, 'url')`），保持本模块对插件系统零静态依赖。
- `updateCode/updateCodeStore` 会被 `src/lib/plugins/editorApi.ts` 包上
  `runInputTransforms(code, 'bridge')` 后复用。

**测试**：`state.svelte.test.ts`、`state.publish.test.ts`（发布序号）、
`state.cache.test.ts`（parse 缓存）、`state.url.test.ts`。

---

## 2. 序列化 `src/lib/util/serde.ts`

URL 即分享机制：状态 → JSON → deflate(base64 URL-safe) → `pako:<b64>`。

```ts
export type SerdeType = 'base64' | 'pako';
export const serializeState = (state: State, serde: SerdeType = 'pako'): string;
export const deserializeState = (state: string): State;
export const pakoSerde: Serde;   // { serialize, deserialize }
```

- deflate **level 6**（L9 快 2–2.5x，URL +0.7–2%，任意级别经同一 inflate）。
- 反序列化自动嗅探前缀：`pako:` / `base64:` / 无前缀（旧纯 base64）；
  未知前缀抛错（调用方展示 `urlParseFailedState`）。
- **炸弹防护**：inflate 结果上限 20MB，超限抛错——绝不冻结页面。
- **兼容红线**：旧格式必须永远可读（十年分享链接承诺）。

**测试**：`serde.test.ts`（含炸弹与往返）。

---

## 3. 渲染管线

### `src/lib/util/mermaid.ts`

```ts
export const render = async (config: MermaidConfig, code: string, id: string): Promise<RenderResult>;
export const parse = async (code: string) => mermaid.parse(code);
export const defaultMermaidConfig = mermaid.mermaidAPI.defaultConfig ?? {};
export type SampleExample = DiagramDefinition['examples'][number];
export const getSampleDiagrams = async (): Promise<Record<string, SampleExample[]>>;
```

- 模块加载副作用：注册 ELK/tidy-tree 布局加载器与 ZenUML 外部图；
  `render` 前 `await init`（外部图注册 promise）。
- `parse` 带代码级缓存（`parseAndCache` 在 state 内部），同代码 0 边际成本。
- `getSampleDiagrams` 动态 import `@mermaid-js/examples`（启动包外）。

### `src/lib/util/renderView.ts`

```ts
export interface PlacedDiagram { diagramType?: string; graphDiv?: SVGSVGElement }
export const renderAndPlaceDiagram = async ({ code, config, container, rough, viewId }: {
  code: string; config: MermaidConfig;
  container: HTMLDivElement;   // 必须有 id（svg2roughjs 按 selector 寻址）
  rough: boolean; viewId: string;
}): Promise<PlacedDiagram>;
```

渲染 + DOM 放置 + 手绘变换（svg2roughjs）+ 尺寸修正；被 View 与
EmbedView 共用；空渲染返回 `{ diagramType }`（无 graphDiv）。

### `src/lib/util/panZoom.ts`

```ts
export class PanZoomState {
  isPanEnabled: boolean;
  onPanZoomChange?: (pan: Point, zoom: number) => void;
  updateElement(view: SVGElement, { pan, zoom }: Pick<State, 'pan' | 'zoom'>): void;
  destroy(): void; // 释放 svg-pan-zoom 实例 + ResizeObserver（View 卸载必调，防泄漏）
  // + resize()/reset() 等内部方法
}
```

- 恢复视口夹取：zoom∈[0.2,12]、pan±1e6（不可信 hash 输入防线）。

### `src/lib/util/autoSync.ts`（渲染节流状态机）

```ts
export const recordRenderTime = (renderTimeMs: number, updater: () => void): void;
export const shouldRefreshView = (): boolean;   // 降级窗口内 false 并排 1s 防抖
export const waitForRender = (): Promise<void>; // 导出等待句柄（exportImage 用）
```

阈值 150ms：单次渲染超时 → 降级 1s 批量；防抖到期恢复同步直渲。

**测试**：`autoSync.test.ts`（fake timers 4 用例）、`mermaid.test.ts`、
`panZoom.test.ts`（生命周期）。

---

## 4. 持久化 `src/lib/util/persist.svelte.ts`

```ts
export const readJSON = <T>(key: string, fallback: T): T;   // 损坏/缺失/null 一律回落
export const writeJSON = (key: string, value: unknown): void; // 尽力而为：配额满 warn 不抛
export interface Persisted<T> { value: T }
export const persisted = <T>(key: string, initial: T): Persisted<T>;
```

- `persisted` 基于 `$state.raw`：**必须整替，不可原地深突变**（否则 UI 更新
  但不持久化）。
- `writeJSON` 在网关链内——配额异常不得中断编辑（审计 round 1 修复）。

**测试**：`persist.svelte.test.ts`（本机预存失败集）、`persist.quota.test.ts`。

---

## 5. 可视化编辑器 `src/lib/util/visualEditor/`

纯逻辑层（无 DOM），组件 `VisualEditor.svelte` 只接手势。

### 5.1 模型 `model.ts`

```ts
export type DiagramKind = /* 31 种：flowchart…zenuml（见源） */;
export type VShape = 'rect' | 'round' | 'stadium' | 'diamond';
export type VLinkType = /* 13 种共享连线 token */;

export interface VNode {
  id: string; label: string; shape: VShape; x: number; y: number;
  detail?: string;     // 多行正文（类成员/ER 属性/状态描述）
  role?: string;       // 类型关键字（C4 Person、kanban column…）
  roleData?: string;   // 类型载荷（cynefin 域名、git 分支、[x, y] 坐标）
  w?: number; h?: number;  // 手动尺寸（编辑器本地，不入代码）
  special?: 'end' | 'start'; // stateDiagram [*] 伪节点
}
export interface VEdge {
  id: string; source: string; target: string; type: VLinkType;
  label?: string; cardL?: string; cardR?: string;   // 类图引号基数 / ER 鸦脚
  role?: string; roleData?: string;                 // 关系关键字 / 端口规格
}
export interface VGraph {
  direction: 'TD' | 'LR'; kind?: DiagramKind;
  nodes: VNode[]; edges: VEdge[];
  title?: string; frontmatter?: string; meta?: Record<string, string>;
}
export const KIND_SPECS: Record<DiagramKind, KindSpec>;  // 31 类能力表
export const ER_CARDINALITIES; export const NODE_W/NODE_H/DETAIL_LINE_H/SPECIAL_SIZE;
export const SHAPE_ORDER; export const LINK_ORDER;

export const generateCode = (graph: VGraph): string;   // 模型 → Mermaid（确定性）
export const parseCode = (code: string): ParsedFlowchart;  // 任意受支持类型 → 模型
export const parseFlowchart = (code: string): ParsedFlowchart; // 仅 flowchart
export const detectDiagramKind = (code: string): DiagramKind | undefined;
export type ParsedFlowchart = { ok: true; result: ParseResult } | { ok: false };
export interface ParseResult { graph: VGraph; skipped: number }  // skipped=不支持行计数

export const layoutGraph = (graph: VGraph): VGraph;   // Kahn 分层（sequence 单行、坐标类走 layoutCoordinateKind）
export const applyPositions = (graph: VGraph, positions: Record<string, {x,y}>): VGraph;
export const sanitizePositions = (raw: unknown): Record<string, {x,y}>;  // 有限数白名单
export const nodeSize = (node: VNode): { h, w };       // 手动尺寸 > 内容自适应
export const nodeCenter = (node: VNode): { x, y };
export const edgeAnchor = (source: VNode, target: VNode): { x1,x2,y1,y2 }; // 边框-边框锚
export const normalizeLabeledLinks = (line: string): string; // 文本连线 → |label| 形
export const nextNodeId / nextEdgeId / sanitizeLabel;
export { COORD_KINDS };   // Set<'quadrant'|'wardley'> —— 代码即坐标记忆的类
```

**往返契约**：`generate(parse(generate(parse(code)))) === generate(parse(code))`
（首次生成允许归一化）；全部生成物经真实 `mermaid.parse` 校验
（`model.allkinds.test.ts` 47 用例）。

### 5.2 扩展类型 `kinds.extra.ts`

25 种额外类型的 parse/generate 注册表：`EXTRA_PARSERS` / `EXTRA_GENERATORS`
/ `EXTRA_HEADERS`（头关键字→kind）；`splitFrontmatter`（YAML 前言逐字节
保留）；`layoutCoordinateKind` + `COORD_MARGIN/COORD_AREA_W/H`（坐标画布）。
**对 model.ts 仅 type-import**（无运行时环）。

### 5.3 交互纯函数 `interaction.ts`

```ts
alignmentGuides(moving, others, raw, tolerance=6): { snapped, guides }  // 动态对齐参考线
alignSelection(nodes, mode: AlignMode): Record<id, {x?,y?}>             // 6 向对齐
distributeSelection(nodes, axis): Record<id, {x?,y?}>                    // 等距（≥3）
remintIds(payload, existingNodes, existingEdges): { nodes, edges }       // 剪贴板 id 重铸
nodesInRect(nodes, rect, intersect=false): VNode[]                       // 框选（默认全包围）
snapshotGraph(graph): VGraph                                             // 深快照（撤销栈）
autoConnect(nodes, edges, source, direction, scan=220): { existingId?, spawn }  // Visio 快连
layoutGroupedGrid(graph, groupRole): Record<id, {x,y}>                   // 分组列布局
```

### 5.4 连线路由 `routing.ts`

```ts
export type EdgeStyle = 'curved' | 'orthogonal' | 'straight';
routeOrthogonal(source, target, obstacles=[]): Route  // 曼哈顿 + 8px 圆角 + 中轴避让
routeStraight(source, target): Route
routeCurved(source, target): Route
routeEdge(style, source, target, obstacles?): Route
pointOnRoute(route, t): Point                          // 弧长比例定位（标签/基数）
export interface Route { points: Point[]; d: string }  // d 直接渲染，points 供命中/标注
```

**测试**：`model*.test.ts` 四个套件、`interaction.test.ts` 20、
`routing.test.ts` 7。

---

## 6. 文件 IO 与导出 `src/lib/util/fileIO.ts`

````ts
diagramFileName(ext): string                                  // mermaid-diagram-<ts>.<ext>
markdownOf(code): string                                       // ```mermaid fenced
stateFileOf(code, mermaid): StateFile                          // {version:1, code, mermaid, savedAt}
parseOpenedFile(name, text): { code, mermaid? } | undefined    // .json 状态/.md 剥代码块/裸源码
downloadTextFile(filename, text, mime): void                   // base64 data:URL（blob 通道在部分内嵌 Chromium 不可捕获）
openTextFile(accept): Promise<{ name, text } | undefined>      // 文件选择器
````

「打开」流程：**插件 import 钩子优先** → `parseOpenedFile` 兜底 →
**输入管道（source='file'）** → 状态网关。导出动作（PNG/SVG/WebP/JPEG/
PDF/Markdown/源码/状态 JSON）在 `Actions.svelte`；插件格式经
`pluginExportFormats()/runPluginExport()`（§7）。

**测试**：`fileIO.test.ts` 6 用例。

---

## 7. 插件系统 `src/lib/plugins/`

### 7.1 类型 `types.ts`

`FlowPlugin = PluginManifest + 可选钩子`：

```ts
interface PluginManifest { id; name; version; description?; permissions?: PluginPermission[] }
type PluginPermission = 'input:transform'|'import:file'|'export:format'|'ui:theme'|'ui:frontend'|'ai:mcp';
interface FlowPlugin extends PluginManifest {
  inputTransform?: { name; transform(code, source: 'bridge'|'file'|'url'): string };
  import?: { extensions: string[]; name; import(file, ctx): {code, mermaid?}|undefined };
  export?: { id; label; run(input, ctx): {blob?|text?, mime, filename}|undefined };
  theme?: { variables?: Record<string,string>; css?: string };
  frontend?: { url; sandbox? };
  activate?(ctx)?: void; deactivate?(): void;
}
interface PluginContext { getState(); setCode(code); setState(state); notify(msg);
  storage: { get<T>(key, fallback): T; set(key, value) }; getSvg() }
```

插件作者类型包：`plugins/flow-plugin.d.ts`（`@satisfies` 引入，见
`note/plugin-api.md`）。

### 7.2 注册表 `registry.svelte.ts`（runes 状态）

```ts
loadRegistry(): Promise<void>          // 启动恢复（edit 页在 initHandler 之前调用）
installPlugin(source): Promise<{ok, error?}>     // .mjs 源安装（blob import 校验）
uninstallPlugin(id) / disablePlugin(id, reason?) / enablePlugin(id)
runInputTransforms(code, source): string         // 链式（file/bridge/url 三入口均接线）
findImportHandler(fileName) / runImportHandler(fileName, text)
pluginExportFormats(): (ExportFormat & {pluginId})[]
runPluginExport(format): payload | undefined
pluginFrontends(): { id, name, sandbox?, url }[]
anyPluginThemes() / reapplyThemes()
listInstalled(): InstalledPlugin[]
getPluginRuntime(id): { errors, hooks, loaded, summaries }  // 管理器详情页数据源
exportPluginSource(id): { filename, text } | undefined      // 仅持久化源码可导出
registerPluginInstance(plugin, enabled=true)     // 运行时注册（测试/嵌入宿主）
unregisterAllPluginInstances()
```

运行时保证：钩子错误隔离 + **连续 3 次失败自动停用**；存储命名空间
`flow-plugin:<id>:<key>`；主题 `<style id="flow-plugin-theme-<id>">` 注入/
移除；持久化键 `flowPlugins`。

### 7.3 插件模板 `templates.ts`

`PLUGIN_TEMPLATES: PluginTemplate[]`——管理器「模板库」的 6 个可一键安装/
下载的起始插件（输入清洗 / PlantUML 导入 / CSV 导出 / 海洋主题 / 仪表盘
前端 / AI 提示词导出）。约束：源码内嵌 TS 模板字符串，**不得含反引号或
`${`**；模板元数据与源码内 manifest 一致（`templates.test.ts` 逐一动态
import 校验）。

### 7.4 命令式 API `editorApi.ts`

```ts
export const installEditorApi = (): void;
// 挂载：window.__FLOW_EDITOR_API__  { getState, setCode, setState, getSvg, exportPngDataUrl }
//      window.__FLOW_EDITOR_STATE_()  只读快照
```

`setCode/setState` 先过 `runInputTransforms(code,'bridge')` 再进网关。

**测试**：`plugins.test.ts` 16 用例 + `templates.test.ts` 4 用例 +
`mcpConfig.test.ts` 3 用例；e2e `tests/plugins.spec.ts` 4 用例 +
`tests/pluginManager.spec.ts` 5 用例。

---

## 8. MCP 桥协议 `src/lib/plugins/bridge.ts`

JSON-RPC 2.0 over postMessage，频道常量 `BRIDGE_CHANNEL = 'flow-editor'`。

```ts
export const bridgeTools;  // 工具描述符：get_code/set_code/get_state/set_state/render_svg/export
export const handleBridgeRequest(request: JsonRpcRequest);  // 纯函数（测试直接调用）
export const startBridge = (): void;   // window message 监听（幂等）
export const installBridgeInvoker = (): void;  // 挂载 window.__FLOW_EDITOR_BRIDGE_CALL__
export const callEditor = async <T>(method, params?): Promise<T>;  // 插件前端侧助手（iframe 内用）
export const bridgeNotify(message: string);
```

方法：`initialize` / `tools/list` / `tools/call` / `ping`；未知方法
`-32601`。opaque origin（data:/blob: 前端，序列化 `"null"`）回复回退
`targetOrigin: '*'`。外部 stdio MCP 客户端：宿主转发本协议即接。

`__FLOW_EDITOR_BRIDGE_CALL__(raw)` 接收**字符串化**请求（页面端
JSON.parse 还原），供桌面版主进程 `executeJavaScript` 双重编码调用——
请求体永不以代码身份进入页面。

### 8.1 MCP 服务配置 `mcpConfig.ts` + 桌面 HTTP 服务器

```ts
validateMcpPort(value): number | undefined   // 1024–65535 整数（字符串输入归一）
normalizeMcpConfig(value): McpConfig         // 不可信输入硬化（localStorage/IPC）
loadMcpConfig() / saveMcpConfig(cfg) / loadMcpStatus(cfg)
isDesktop()                                  // window.__FLOW_DESKTOP__ 探测
```

桌面版（Electron）把同一 MCP 线格式暴露为
`http://127.0.0.1:<port>/`（`installer/app/mcp-server.cjs`，默认端口
38528、默认**关闭**）：仅回环绑定、仅 POST、强制
`Content-Type: application/json`（跨域简单请求防线）、6MB 请求上限、
batch 拒绝；配置持久化于 `userData/mcp-config.json`，页面经
`window.__FLOW_DESKTOP__.mcp`（preload contextBridge，最小面 IPC）读写，
主进程复核校验。配置 UI 在插件管理器「MCP 服务」标签页。

---

## 9. Embed 子系统

### `src/lib/util/embed.ts`

```ts
resolveEmbedSettings(url: URL): ResolvedEmbed   // #code: > #pako:/#base64: > 默认；query 覆盖；securityLevel 强制 strict；pan/zoom 夹取
encodeEmbedParams(params: EmbedParams): string
isDarkTheme(theme) / toggleMode(settings) / serializeEmbedState(settings) / buildEditUrl(serialized, editBase)
```

### `src/lib/util/embedCode.ts`

```ts
buildEmbedUrls(options: EmbedUrlOptions): EmbedUrls        // 昂贵半场（sanitize+序列化）
buildEmbedSnippets(options: EmbedCodeOptions): EmbedCodeResult  // 廉价半场（拼串）
buildEmbedCode(options): EmbedCodeResult
export const EMBED_IFRAME_SANDBOX;   // 与 embed-loader.ts 镜像——改一处必须改另一处
```

**红线**：`EmbedView.svelte` 永不 import 状态单例（代码纪律隔离）。

**测试**：`embed.test.ts`、`embedCode.test.ts`、e2e `embed.spec.ts`。

---

## 10. 安全与加固工具

### `src/lib/util/sanitize.ts`

```ts
findUnsafeConfigPaths(config): string[][]     // 危险键路径（secure 差异/__ 前缀/XSS 串）
stripConfigPaths(config, paths): void
silentlySanitizeConfig(config): MermaidConfig // embed 侧无交互剥离
// 深度护栏：>100 层子树整体剥离（防 JSON.parse 深嵌栈溢出）
```

### `src/lib/util/errorHandling.ts`

```ts
findMostRelevantLineNumber(errorLineText, code): number   // 后缀自动机（needle 截断 10k）
replaceLineNumberInErrorMessage(message, realLine): string
extractErrorLineText(errorMessage): string
```

### `src/lib/util/redirect.ts`

```ts
buildRedirectUrl(location: Location): string  // 旧版 hash → /edit|/view（路由白名单，其余回落 /edit）
```

**测试**：`sanitize.test.ts`、`errorHandling.test.ts`（含差分）、
`redirect.test.ts`。完整威胁模型见
`note/report/audit/2026-08-20-stability-security.md`。

---

## 11. 应用编排与杂项 `src/lib/util/util.ts`

```ts
export const initHandler = async (): Promise<void>;  // migrations → URL 加载 → gist/…（已删） → hash 订阅
export const loadStateFromURL = (): void;            // location.hash → loadState
export const syncDiagram = (): void;                 // 强制下次渲染
export const isMac / cmdKey;
export const errorDebug(limit=1000)                  // 控制台排障（保留的意外路径日志）
export const formatJSON(data): string
export const copyToClipboard(text): Promise<void>    // ClipboardItem → execCommand 降级
```

其他：`notify.ts`（`notify`/`prompt` toast）；`migrations.svelte.ts`
（`applyMigrations()`，版本号范围校验防启动崩溃）；History
`historyState.svelte.ts`（`addEntry/removeEntry/renameEntry/restoreEntries/
startAutoSave`——全部**写前重读**合并防跨标签丢更新，manual 上限 200）。

---

## 12. 核心类型与常量

- `src/lib/types.d.ts`：`State`（新字段必须**可选**——旧存档兼容）、
  `ValidatedState`（+`error/errorMarkers/serialized/diagramType/editorMode`）、
  `HistoryEntry`、`Tab`、`EditorMode`。
- `src/lib/constants.ts`：`TID`（e2e 选择器唯一来源）、`MERMAID_THEMES`、
  `MERMAID_LOOKS`、`defaultState`。
- 组件契约：`Editor.svelte`（桌面 Monaco/移动 CodeMirror 分发）、
  `View.svelte`（Promise 链串行渲染）、`VisualEditor.svelte`
  （§5 手势层 + 撤销快照栈 + 右键菜单/框选/参考线/缩放平移/AutoConnect）、
  `PluginManager.svelte`（安装/启停/卸载）。
- 构建入口：`vite.config.js`（HMR 禁用→整页刷新；vendor chunk 划分保持）、
  `vite.embed.config.js`（embed.js IIFE，`minify:false`）。

---

## 13. 不变式清单（维护红线）

改动任何模块前对照；每条都对应既有测试或审计结论：

1. **`update()` 网关不可绕过**——新写入口必须经 `updateCode/updateCodeStore/…`
   （含插件 `ctx.setCode`：其实现即网关包装）。
2. **序列化向后兼容**——旧 `pako:`/无前缀 base64 URL 永远可读；inflate
   上限 20MB 不得移除。
3. **embed 页零状态导入**——`EmbedView.svelte`/`embedCode.ts` 不 import
   状态单例；`EMBED_IFRAME_SANDBOX` 两处镜像同步。
4. **`State` 新字段必须可选**；`persisted()` 值必须整替。
5. **可视化模型往返不动点**——改 parser/generator 必须保持
   `model*.test.ts` 契约与真实 `mermaid.parse` 校验。
6. **插件错误隔离**——任何钩子抛错不得影响编辑器；三振停用语义保留。
7. **渲染性能红线**——拖拽期零强制布局（gBCR 手势级缓存）、批量命令单次
   `syncCode()` 发布、批量发布单次状态网关触发。
8. **零外联**——`tests/noNetwork.spec.ts` 守卫；任何新依赖不得自主发起
   网络请求（插件代码除外，其由用户安装授权且不随包分发）。
9. **History 写前重读**——新增历史写入点必须先重读持久值再合并。
10. **localStorage 写入尽力而为**——`writeJSON` 不抛；配额异常仅 warn。
11. **MCP 桌面 HTTP 服务攻击面**——仅 127.0.0.1 回环、默认关闭、仅 POST +
    强制 `application/json`、6MB 请求上限；主进程必须复核渲染进程上传的
    配置（`normalizeMcpConfig` 双端同源校验）；preload 只暴露
    `__FLOW_DESKTOP__.mcp` 三个方法，不得扩面。

---

_生成于 2026-08-21，对应 v2.0.96；签名摘自源码导出，可用 grep 复核。_
