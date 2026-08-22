/**
 * Plugin templates: ready-to-install, heavily commented starter plugins
 * offered by the Plugin Manager's 模板 tab. Each template is a complete ES
 * module source string (installed as-is, or downloaded for customization).
 *
 * Authoring constraints:
 * - template sources must NOT contain backticks or `${` (they are embedded
 *   in TS template literals below);
 * - the manifest id inside the source must equal the template's `id` —
 *   templates.test.ts enforces this.
 */

import type { PluginPermission } from './types';

export interface PluginTemplate {
  /** One-line summary of what the template demonstrates. */
  description: string;
  /** The plugin id (must match the id inside `source`). */
  id: string;
  name: string;
  permissions: PluginPermission[];
  /** Complete installable .mjs source. */
  source: string;
}

const inputCleanerSource = `/**
 * 输入清洗插件（模板）
 *
 * 在所有「进入编辑器的代码」上运行：打开文件、桥接/MCP 写入、URL 分享链接。
 * 典型用途：换行归一、去除行尾空白、剥离外层包裹（如 PlantUML）、脱敏。
 *
 * 钩子：inputTransform —— 输入管道
 * 触发点：source = 'file'（打开文件）| 'bridge'（MCP/桥写入）| 'url'（分享链接）
 * 链式执行：多个插件按安装顺序依次处理，返回值交给下一个插件。
 * 注意：返回超过 5MB 的文本会被编辑器拒绝（保留变换前的输入）。
 */
export default {
  id: 'template.input-cleaner',
  name: '输入清洗（模板）',
  version: '1.0.0',
  description: '统一换行、去行尾空白、剥离 PlantUML 包裹',
  permissions: ['input:transform'],

  inputTransform: {
    name: 'clean',
    transform(code, source) {
      // URL 分享链接是精确状态：逐字节恢复，不做任何改动。
      if (source === 'url') {
        return code;
      }
      let out = code;
      // 1. 去掉 BOM（UTF-8 文件常见的隐藏首字符）
      if (out.charCodeAt(0) === 0xfeff) {
        out = out.slice(1);
      }
      // 2. 换行归一：Windows CRLF / 旧 Mac CR -> LF
      out = out.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n');
      // 3. 去除行尾空白（保留行首缩进——缩进对 mindmap/kanban 有语义）
      out = out
        .split('\\n')
        .map((line) => line.replace(/[ \\t]+$/, ''))
        .join('\\n');
      // 4. 剥离 PlantUML 包裹（格式转换演示；按需修改为你的私有格式）
      out = out.replace(/^@startuml\\s*\\n?/, '').replace(/\\n?@enduml\\s*$/, '');
      return out;
    }
  }
};
`;

const plantumlImportSource = `/**
 * 文件导入插件（模板）
 *
 * 让「打开」按钮认识你自己的文件格式：按扩展名接管文件，把内容解析成
 * Mermaid 源码后交给编辑器。插件处理器优先于内置 .mmd/.md/.json。
 * 返回 undefined 表示放弃该文件（回退内置处理器）。
 *
 * 钩子：import —— 自定义格式导入
 * 之后仍会经过输入管道（inputTransform 插件链）再进入状态网关。
 */
export default {
  id: 'template.plantuml-import',
  name: 'PlantUML 导入（模板）',
  version: '1.0.0',
  description: '接管 .puml/.plantuml 文件，简易转换为 Mermaid flowchart',
  permissions: ['import:file'],

  import: {
    extensions: ['puml', 'plantuml'],
    name: 'PlantUML',
    import(file, ctx) {
      const text = file.text;
      if (!text.includes('@startuml')) {
        return undefined; // 不是 PlantUML，放弃（交给内置处理器）
      }
      // —— 下面是一个最小转换骨架：把 A --> B 行收集为 flowchart ——
      // 真实项目里在这里接你的完整解析器即可。
      const body = text.replace(/^@startuml\\s*\\n?/, '').replace(/\\n?@enduml\\s*$/, '');
      const edges = [];
      for (const line of body.split('\\n')) {
        const m = line.match(/^\\s*([\\p{L}\\p{N}_]+)\\s*-+>+\\s*([\\p{L}\\p{N}_]+)/u);
        if (m) {
          edges.push('  ' + m[1] + ' --> ' + m[2]);
        }
      }
      if (edges.length === 0) {
        ctx.notify('未在 ' + file.name + ' 中找到可转换的连线');
        return undefined;
      }
      return { code: 'flowchart TD\\n' + edges.join('\\n') + '\\n' };
    }
  }
};
`;

const csvExporterSource = `/**
 * 导出格式插件（模板）
 *
 * 在「导出」菜单底部追加一个自定义格式。拿到当前图表源码（以及渲染出的
 * SVG 字符串），产出文本或 Blob 触发下载。
 *
 * 钩子：export —— 自定义导出格式
 * 本例：把 flowchart 的节点与连线导出为两张 CSV 表（nodes / edges）。
 */
export default {
  id: 'template.csv-exporter',
  name: 'CSV 导出（模板）',
  version: '1.0.0',
  description: '把流程图节点/连线导出为 CSV，便于表格软件处理',
  permissions: ['export:format'],

  export: {
    id: 'csv',
    label: 'CSV（节点与连线）',
    run(input, ctx) {
      const code = input.code;
      if (!/^\\s*(flowchart|graph)\\b/.test(code)) {
        ctx.notify('当前图表不是 flowchart，已导出原始源码');
        return { filename: 'diagram.mmd', mime: 'text/plain', text: code };
      }
      const nodeSet = new Set();
      const edgeRows = [];
      for (const line of code.split('\\n')) {
        const m = line.match(/^\\s*([A-Za-z0-9_]+)[(\\[{]?[^\\s-]*[)\\]}]?\\s*(-[.-]+>?)[|\\]\\s]*([A-Za-z0-9_]+)?/);
        if (m && m[1]) {
          nodeSet.add(m[1]);
          if (m[3]) {
            nodeSet.add(m[3]);
            edgeRows.push(m[1] + ',' + m[3]);
          }
        }
      }
      const csv = ['# nodes', 'id', ...[...nodeSet], '', '# edges', 'source,target', ...edgeRows].join('\\n');
      return { filename: 'diagram.csv', mime: 'text/csv', text: csv + '\\n' };
      // 二进制导出：return { filename, mime, blob: new Blob([...]) };
    }
  }
};
`;

const themeOceanSource = `/**
 * 主题配色插件（模板）
 *
 * 以 CSS 变量与任意 CSS 覆盖编辑器外观：配色、圆角、字体、背景贴图……
 * 启用即生效，停用即还原（编辑器为每个插件维护一个 <style> 标签）。
 *
 * 钩子：theme —— 主题与样式
 * variables 写到 :root（未加 -- 前缀的键会自动补上）；
 * css 原样追加，可表达任何 CSS。
 * 提示：编辑器基于 Tailwind 4 + shadcn-svelte，核心变量见 app.css
 * （--background/--foreground/--primary/--accent/--border/--radius …），
 * 明暗两套由 .dark 类切换，这里可按需覆盖 :root 与 .dark 两层。
 */
export default {
  id: 'template.theme-ocean',
  name: '海洋主题（模板）',
  version: '1.0.0',
  description: '演示 CSS 变量与任意 CSS 注入：蓝色系配色 + 圆角调整',
  permissions: ['ui:theme'],

  theme: {
    // CSS 变量：编辑器主色板（HSL 三通道写法，与 app.css 一致）
    variables: {
      '--primary': '210 80% 45%',
      '--ring': '210 80% 45%',
      '--accent': '199 89% 94%',
      '--accent-foreground': '210 80% 25%'
    },
    // 任意 CSS：布局微调、背景贴图、字体替换……
    css: [
      '/* 可视化画布网格改点阵为浅色 */',
      '.visual-canvas { border-radius: 12px; }',
      '/* 预览区细边框 */',
      '#container { border-radius: 12px; }'
    ].join('\\n')
  }
};
`;

const frontendDashboardSource = `/**
 * 整页前端替换插件（模板）
 *
 * 用你自己的页面完全接管编辑器 UI：插件管理器里出现「打开 <名称>」按钮，
 * 点击后整页 iframe 渲染你的页面（右上角有「退出插件前端」）。
 * 页面通过 postMessage 桥（MCP JSON-RPC 2.0，频道 flow-editor）驱动编辑器：
 * get_code / set_code / get_state / set_state / render_svg / export。
 *
 * 钩子：frontend —— 整页前端替换
 * url 可为 data: / blob: / http(s): ；本例用 data: 内嵌一个完整页面，
 * 演示桥的双向调用（读取代码 -> 统计 -> 写回编辑器）。
 */
var PAGE = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<title>图表仪表盘</title>',
  '<style>',
  'body{font-family:system-ui,sans-serif;margin:24px;color:#1f2937}',
  'h1{font-size:18px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0}',
  'button{padding:6px 14px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer}',
  'button:hover{background:#f3f4f6}#stat{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}',
  '</style></head><body>',
  '<h1>图表仪表盘（插件前端模板）</h1>',
  '<div class="card"><button id="load">读取当前图表</button> ',
  '<button id="write">写回示例图</button> ',
  '<button id="svg">导出 SVG 到文件</button></div>',
  '<div class="card" id="stat">尚未读取</div>',
  '<script>',
  'var CH = "flow-editor";',
  'function call(method, params) {',
  '  return new Promise(function (resolve, reject) {',
  '    var id = Math.random().toString(36).slice(2);',
  '    function onMsg(e) {',
  '      var d = e.data || {};',
  '      if (d.channel !== CH || d.id !== id) return;',
  '      window.removeEventListener("message", onMsg);',
  '      d.error ? reject(new Error(d.error.message)) : resolve(d.result);',
  '    }',
  '    window.addEventListener("message", onMsg);',
  '    window.parent.postMessage({ channel: CH, id: id, jsonrpc: "2.0", method: method, params: params }, "*");',
  '    setTimeout(function () { reject(new Error("桥超时")); }, 5000);',
  '  });',
  '}',
  'function tool(name, args) {',
  '  return call("tools/call", { name: name, arguments: args || {} }).then(function (r) {',
  '    return r.content && r.content[0] ? r.content[0].text : "";',
  '  });',
  '}',
  'document.getElementById("load").onclick = function () {',
  '  tool("get_code").then(function (code) {',
  '    var lines = code.split("\\n").filter(Boolean);',
  '    var edges = (code.match(/-->/g) || []).length;',
  '    document.getElementById("stat").textContent =',
  '      "行数：" + lines.length + "\\n连线数：" + edges + "\\n\\n" + code;',
  '  });',
  '};',
  'document.getElementById("write").onclick = function () {',
  '  tool("set_code", { code: "flowchart LR\\n  A[插件前端] --> B[写回编辑器]" });',
  '};',
  'document.getElementById("svg").onclick = function () {',
  '  tool("render_svg").then(function (svg) {',
  '    var a = document.createElement("a");',
  '    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));',
  '    a.download = "diagram.svg";',
  '    a.click();',
  '  });',
  '};',
  '</scr' + 'ipt></body></html>'
].join('\\n');

export default {
  id: 'template.frontend-dashboard',
  name: '图表仪表盘前端（模板）',
  version: '1.0.0',
  description: '整页替换 UI：读取/写回图表、导出 SVG 的桥调用演示',
  permissions: ['ui:frontend', 'ai:mcp'],

  frontend: {
    url: 'data:text/html;charset=utf-8,' + encodeURIComponent(PAGE)
    // 默认沙箱：allow-scripts allow-same-origin allow-forms allow-popups
    // 需要收紧时在此声明 sandbox 属性。
  }
};
`;

const aiExporterSource = `/**
 * AI 提示词导出插件（模板）
 *
 * 不接网络也能接入任意 LLM：把「当前图表 + MCP 工具协议」导出为一份
 * 提示词文件，投喂给你自选的 LLM/客户端；LLM 按同一协议产出调用后，
 * 经 MCP 桥回写编辑器（详见 note/plugin-api.md §2.6）。
 *
 * 钩子：export —— 在导出菜单追加「AI 提示词」
 * 进阶：在 activate(ctx) 里 fetch 你的自建端点，把结果 ctx.setCode() 写回
 * （安装即授权，信任级同 VS Code 扩展；离线分发版不替你联网）。
 */
export default {
  id: 'template.ai-prompt-exporter',
  name: 'AI 提示词导出（模板）',
  version: '1.0.0',
  description: '导出「图表 + MCP 工具协议」提示词，投喂任意 LLM 回写图表',
  permissions: ['export:format', 'ai:mcp'],

  export: {
    id: 'ai-prompt',
    label: 'AI 提示词（.md）',
    run(input) {
      const tools = [
        '| 工具 | 说明 |',
        '| --- | --- |',
        '| get_code | 读取当前图表源码 |',
        '| set_code(code) | 替换图表源码（自动校验渲染） |',
        '| get_state / set_state | 读写完整状态（源码+配置） |',
        '| render_svg | 当前渲染 SVG |',
        '| export(format) | svg / png-dataurl / code |'
      ].join('\\n');
      const prompt = [
        '# 图表编辑任务',
        '',
        '你是一个图表编辑代理。下面是 Flow 编辑器的当前图表源码与可调用的',
        '工具协议（MCP JSON-RPC 2.0，频道 flow-editor）。请阅读图表后，',
        '按工具协议给出你的修改调用。',
        '',
        '## 当前图表',
        '',
        '\x60\x60\x60mermaid',
        input.code,
        '\x60\x60\x60',
        '',
        '## 可用工具',
        '',
        tools,
        '',
        '## 调用格式',
        '',
        '\x60\x60\x60json',
        '{ "channel": "flow-editor", "jsonrpc": "2.0", "id": 1,',
        '  "method": "tools/call",',
        '  "params": { "name": "set_code", "arguments": { "code": "..." } } }',
        '\x60\x60\x60'
      ].join('\\n');
      return { filename: 'diagram-prompt.md', mime: 'text/markdown', text: prompt + '\\n' };
    }
  }
};
`;

/** Starter templates offered by the Plugin Manager. Order = display order. */
export const PLUGIN_TEMPLATES: PluginTemplate[] = [
  {
    description:
      '文件/桥接输入进入编辑器前做清洗与格式转换（换行归一、去行尾空白、剥 PlantUML 包裹）。',
    id: 'template.input-cleaner',
    name: '输入清洗',
    permissions: ['input:transform'],
    source: inputCleanerSource
  },
  {
    description: '按扩展名接管「打开」的文件（.puml），把自定义格式解析为 Mermaid 源码。',
    id: 'template.plantuml-import',
    name: 'PlantUML 导入',
    permissions: ['import:file'],
    source: plantumlImportSource
  },
  {
    description:
      '在导出菜单追加自定义格式：把 flowchart 节点与连线导出为 CSV，含 Blob 二进制写法示例。',
    id: 'template.csv-exporter',
    name: 'CSV 导出',
    permissions: ['export:format'],
    source: csvExporterSource
  },
  {
    description: 'CSS 变量 + 任意 CSS 注入的主题骨架：配色、圆角、贴图、字体替换的起点。',
    id: 'template.theme-ocean',
    name: '海洋主题',
    permissions: ['ui:theme'],
    source: themeOceanSource
  },
  {
    description:
      'data: 内嵌页面整页替换编辑器 UI，演示 postMessage 桥双向调用（读图表/写回/导出 SVG）。',
    id: 'template.frontend-dashboard',
    name: '图表仪表盘前端',
    permissions: ['ai:mcp', 'ui:frontend'],
    source: frontendDashboardSource
  },
  {
    description: '导出「图表 + MCP 工具协议」提示词文件，投喂任意 LLM 后按协议回写图表。',
    id: 'template.ai-prompt-exporter',
    name: 'AI 提示词导出',
    permissions: ['ai:mcp', 'export:format'],
    source: aiExporterSource
  }
];
