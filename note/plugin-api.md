# Flow 编辑器插件 API

> 版本：2.0.92 引入，2.0.93 补齐 bridge/url 管道接线与 theme.css｜模块：`src/lib/plugins/`
> 2.0.128：插件管理器重写（列表/详情/模板库/MCP 服务四区）+ 桌面版 MCP HTTP 服务
> 目标：**项目的每一层都可通过插件处理**——输入、导入、导出、主题、整页前端替换、AI（MCP）。

## 1. 插件是什么

一个 ES 模块（`.mjs`/`.js`），default export 一个对象：

```js
export default {
  id: 'com.your.plugin',          // 必填，全局唯一
  name: '你的插件',                // 必填
  version: '1.0.0',
  description: '……',
  permissions: ['input:transform', 'export:format'],  // 声明式权限（展示给用户）
  // —— 以下钩子全部可选 ——
  inputTransform: { … },   // 输入管道：清洗/格式转换
  import: { … },           // 自定义文件格式导入（打开）
  export: { … },           // 自定义导出格式（导出菜单）
  theme: { … },            // 主题配色（CSS 变量）
  frontend: { … },          // 整页前端替换（iframe + 桥）
  activate(ctx) { … },      // 启用时调用一次
  deactivate() { … }        // 停用/卸载时调用
};
```

安装：导航栏 **插件 → 从本地安装（.mjs）**，或管理器「模板库」一键安装
起始模板。源码持久化于 localStorage（键 `flowPlugins`），重启自动恢复。

**插件管理器**（2.0.128 重写，导航栏「插件」按钮）三个标签页：

- **已安装**：插件卡片（名称/版本/权限徽章/状态徽章）+ Switch 启停 +
  两步确认卸载 + 导出 `.mjs` + **详情页**（清单、本地化权限说明、运行
  时钩子与摘要、源码预览、存储命名空间、连续出错计数）。
- **模板库**：6 个注释详尽的细化模板（§2.7），可安装可下载。
- **MCP 服务**：postMessage 桥状态与工具清单、桌面版 HTTP 服务配置
  （§2.6）。

每个钩子调用都有错误隔离，**连续 3 次抛错的插件自动停用**，不影响编辑器运行。

示例插件：[`plugins/examples/`](../plugins/examples/)（输入清洗 / MC 函数
导出 / 紫色主题 / 内嵌前端替换 / AI 提示词导出 / **MC 进度设计器**——流程图
一键导出 Paper 成就插件 Maven 工程 zip，含内嵌前端属性面板）。

**类型提示**：插件是 `.mjs`，加一行引用即可获得完整 IDE 类型：

```js
/// <reference path="../plugins/flow-plugin.d.ts" />
/** @satisfies {import('../flow-plugin.d.ts').FlowPlugin} */
export default {/* … */};
```

## 2. 扩展点

### 2.1 输入管道 `inputTransform`（清洗 / 格式转换）

```js
inputTransform: {
  name: 'clean',
  transform(code, source) { /* return 新 code */ }
}
```

- 触发点：**文件打开**（`source='file'`）、**桥接写入**（`'bridge'`，
  含 MCP `set_code`/`set_state`）、**URL 分享链接载入**（`'url'`，插件先于
  URL 初始化加载，首次进入即生效）。按安装顺序链式执行。
- 典型用途：换行归一、注释清洗、PlantUML→Mermaid 转换、脱敏。

### 2.2 文件导入 `import`（自定义格式优先权）

```js
import: {
  extensions: ['puml', 'plantuml'],
  name: 'PlantUML',
  import(file, ctx) { return { code: 'flowchart TD\n …', mermaid: '…' } }  // 返回 undefined 表示放弃；可 async
}
```

「打开」按钮按扩展名分派：插件处理器优先，内置 `.mmd/.md/.json` 兜底，
之后统一过 2.1 输入管道。`import` 可为异步（zip 解压、格式探测等），
rejection 与同步异常同样被隔离（三振停用）。**二进制格式**（2.0.132 起）
用 `file.bytes`（原始 `Uint8Array`）——`file.text` 是有损 UTF-8 解码，
不可回转；示例见 MC 进度设计器的 zip 逆向导入。

### 2.3 导出格式 `export` / `exports`（含私有格式 / MC 插件等）

```js
export: {
  id: 'mcfunction',
  label: 'MC 函数（.mcfunction）',
  run({ code, svg, config }, ctx) {
    return { filename: 'out.mcfunction', mime: 'text/plain', text: '…' };
    // 或二进制：{ blob: new Blob([…]), filename, mime }
  }
}
```

注册后出现在「导出 ▾」菜单底部（testid `plugin-export-<id>`）。
`svg` 是当前渲染的 SVG 字符串（未渲染为 undefined）。

**多导出项（2.0.137）**：`exports: ExportFormat[]` 数组可注册多个菜单
项（每项独立 id/label/run），与旧单 `export` 同时存在时**数组优先**
（旧字段被忽略，不重复出现）。`run` 可为 **async**（如等待桌面 IPC
编译）——异步 rejection 与同步异常同样被三振隔离。返回 undefined 前
用 `ctx.notify()` 说明原因（宿主仍会提示「未产出内容」，双提示可接受；
抛错则会计入三振，引导类提示请走 notify 而非 throw）。
示例：MC 进度设计器同时注册「Maven 工程 .zip」（全平台）与
「编译 .jar」（桌面版直调 `window.__FLOW_DESKTOP__.mcBuild.build`，
装好 JDK 21+ 一键出可安装 jar；无 JDK 时主进程返回结构化引导文案
透传给用户）。

### 2.4 主题与样式 `theme`

```js
theme: {
  variables: { '--primary': '0.8 0.4 0.9', '--ring': '…' },  // CSS 变量
  css: '.visual-canvas { background-image: url(贴图.png); }'   // 任意 CSS
}
```

以 `<style>` 注入：`variables` 生成 `:root{…}`，`css` 原样追加（布局调整、
背景贴图、字体替换等一切 CSS 可表达之物）。启用即生效、停用即还原。

### 2.5 整页前端替换 `frontend`

```js
frontend: {
  url: 'https://your-host/ui.html';
} // data:/blob:/http(s): 均可
```

插件管理器出现「打开 <插件名>」按钮 → 整页 iframe 渲染你的页面（含
**退出插件前端** 按钮）。页面通过 **postMessage 桥**（见下）完全驱动编辑器
——读改代码/配置、取渲染 SVG、导出。示例：
[`plugins/examples/custom-frontend.html`](../plugins/examples/custom-frontend.html)。

`sandbox` 可选（2.0.129 起 edit 页实际透传）：缺省
`allow-scripts allow-same-origin allow-forms allow-popups`。前端页面需要在
iframe 内直接下载文件（如导出 zip）时声明追加 `allow-downloads`——示例见
[`plugins/examples/mc-advancement.mjs`](../plugins/examples/mc-advancement.mjs)
（MC 进度设计器：流程图 → Paper 成就插件 Maven 工程 zip，设计文档
[mc-advancement-plugin.md](mc-advancement-plugin.md)）。

### 2.6 AI 接入：MCP 桥

编辑器内置 **MCP（Model Context Protocol）JSON-RPC 2.0 over postMessage**
服务器（频道 `flow-editor`）。向页面发消息即可调用：

```js
parent.postMessage(
  {
    channel: 'flow-editor',
    id: 1,
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'set_code', arguments: { code: 'flowchart TD\n A-->B' } }
  },
  '*'
);
```

方法：`initialize` / `tools/list` / `tools/call` / `ping`。工具集：

| 工具                      | 说明                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `get_code` / `set_code`   | 读写 Mermaid 源码（经状态网关，自动校验渲染）                                                                            |
| `get_state` / `set_state` | 读写完整状态（源码 + 配置 JSON）                                                                                         |
| `render_svg`              | 当前渲染 SVG 字符串                                                                                                      |
| `export`                  | `svg` / `png-dataurl` / `code` 三种格式                                                                                  |
| `mc_build`（2.0.130）     | **仅桌面版**：离线编译 MC 成就插件为 .jar——入参 `{files:[{path,text}], filename}`（Maven 布局源文件，只取 `src/main/java | resources`），返回 `{filename, jarBase64, jdkVersion}`。内置 Paper 编译工具链（installer/toolchain/），**需用户本机自装 JDK 21+（应用不捆绑 Java）**；网页版调用返回「仅桌面版可用」错误。`initialize`的`capabilities.experimental['flow-editor/mcBuild']` 标识能力可用性 |

外部 stdio MCP 客户端接入方式：用 Electron/Puppeteer 等宿主加载本页面，
把 stdio JSON-RPC 与该 postMessage 协议互转即可（线格式即 MCP）。

**桌面版 HTTP 服务（2.0.128）**：Windows 安装版（`installer/` 构建）把
同一 MCP 线格式暴露为 `http://127.0.0.1:<port>/`——本地 AI 客户端
（curl、脚本、经 stdio↔HTTP 转发的 Claude Desktop）可直连，无需自己
宿主页面。在插件管理器「MCP 服务」标签页配置：**默认关闭**，端口默认
38528（1024–65535 校验），保存即生效（启/停/换端口不重启应用）。
安全面：仅回环绑定、仅 POST、强制 `Content-Type: application/json`
（浏览器跨域简单请求无法构造，不输出 CORS 头）、请求体 6MB 上限、
batch 拒绝；配置存于桌面版 `userData/mcp-config.json`，主进程对页面
上传的配置做二次校验。请求经 `executeJavaScript` 双重 JSON 编码送进
页面桥——请求内容永不以代码身份被求值。

### 2.7 插件模板库（2.0.128）

管理器「模板库」标签页内置 6 个细化模板（`src/lib/plugins/templates.ts`），
每个都是注释详尽、安装即用的完整插件：

| 模板           | 演示钩子        | 内容要点                                                 |
| -------------- | --------------- | -------------------------------------------------------- |
| 输入清洗       | inputTransform  | BOM/换行/行尾空白处理、PlantUML 包裹剥离、url 源原样放行 |
| PlantUML 导入  | import          | 扩展名接管、返回 undefined 放弃回退、最小转换骨架        |
| CSV 导出       | export          | flowchart 节点/边 → CSV、Blob 二进制写法示例             |
| 海洋主题       | theme           | CSS 变量（:root/.dark 两层说明）+ 任意 CSS 注入          |
| 图表仪表盘前端 | frontend        | data: 内嵌完整页面，桥双向调用（读图表/写回/导出 SVG）   |
| AI 提示词导出  | export + ai:mcp | 「图表 + 工具协议」提示词文件生成，投喂任意 LLM 回写     |

模板可一键安装（重复安装同 id 会被拒绝并显示「已安装」）或下载 `.mjs`
自行修改。模板元数据与源码内 manifest 的一致性由 `templates.test.ts`
逐一动态 import 校验。

**插件作为 AI 客户端**：插件本身也可以主动接外部 AI——在 `activate(ctx)`
里 `fetch` 任意自建/自选端点（安装即授权，信任级同 VS Code 扩展），把结果
用 `ctx.setCode()` 写回（自动经输入管道与状态校验）。开箱即用的轻量做法见
示例 `ai-prompt-exporter.mjs`：不调用网络，而是导出「图表 + 工具协议」的
提示词文件，投喂给任意 LLM/客户端后按同一 MCP 协议回写图表。

## 3. 插件上下文 `ctx`（activate 与各钩子的第二参数）

```js
ctx.getState(); // { code, mermaid, rough }
ctx.setCode(code); // 经状态网关写入
ctx.setState({ code, mermaid });
ctx.notify('消息'); // toast
ctx.storage.get / set; // 命名空间 localStorage：flow-plugin:<id>:<key>
ctx.getSvg(); // 当前渲染 SVG
```

## 4. 命令式 API（嵌入宿主）

- `window.__FLOW_EDITOR_API__`：`getState/setCode/setState/getSvg/exportPngDataUrl`
- `window.__FLOW_EDITOR_STATE__()`：只读快照
- 运行时注册实例（不持久化）：`registerPluginInstance(plugin)` /
  `unregisterAllPluginInstances()`（`$/plugins/registry.svelte`）

## 5. 安全模型

- 插件由**用户主动从本地安装**（与 VS Code 扩展同信任级）；本项目为离线
  应用，不存在远程插件市场，不会自动拉取任何脚本。
- 权限清单在安装卡片上明示；钩子错误隔离 + 三振自动停用；存储按插件 id
  命名空间隔离。
- iframe 前端运行于 `allow-scripts allow-same-origin allow-forms allow-popups`
  沙箱，仅能通过桥协议访问编辑器能力。
